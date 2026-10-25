/*
 * 23/10/2026 — R10-2 della revisione 10 della CLI (S2): i NUMERI del «contesto pieno» attraverso l'adattatore dei fornitori.
 *   `erroreFornitorePubblico` sostituisce il corpo del fornitore con una frase fissa (giusto: può contenere la chiave), e con lui se ne
 *   andavano i numeri: `numeriDelContestoPieno` non trovava niente in nessuna forma, il bersaglio era sempre il 70/50/35%, la regola N sul
 *   rifiuto non scattava mai (`fonte:'fornitore'` mai vista dalla CLI) e nemmeno la linea certa (Z-K3). Le prove di prima passavano
 *   SOTTO l'adattatore: qui il fornitore è finto ma vero (127.0.0.1), e si passa dall'adattatore come nella composizione vera.
 *   Cura: l'adattatore legge i tre numeri dal testo che solo lui vede e li porta in una frase sua; del corpo non esce altro.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta, stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { classificaErroreFornitore, numeriDelContestoPieno } from '../src/kernel/compattazione-desktop.mjs';
import { CODICE_RICHIESTA_TROPPO_GRANDE } from '../src/kernel/richiesta-troppo-grande.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SEGRETO = 'dettaglio-del-fornitore-che-non-deve-uscire';

/* il fornitore finto: `rispondi(corpo)` decide; con `conRiassunti` le richieste senza attrezzi (i riassunti del giro) rispondono sempre */
async function banco(t, rispondi, { conRiassunti = false } = {}) {
  const conti = { richieste: 0, riassunti: 0 };
  const server = createServer(async (req, res) => {
    let testo = '';
    for await (const pezzo of req) testo += pezzo;
    const corpo = JSON.parse(testo || '{}');
    if (conRiassunti && !corpo.tools?.length && corpo.messages) {
      conti.riassunti += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
      return;
    }
    conti.richieste += 1;
    rispondi(res, corpo);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(risolvi => { server.closeAllConnections(); server.close(risolvi); }));
  const custodia = new Map();
  const store = createProviderCredentialStore({
    env: { ZAI_API_KEY: 'r10-zai' },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } },
  });
  store.setRuntime('zai', { endpoint: `http://127.0.0.1:${server.address().port}/zai` });
  const trasporto = creaFetchMultiProvider(fetch, { providerStore: store, dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) } });
  const opzioni = { modello: 'zai:glm-4.7-flash', chiave: 'unused-local-only', messaggi: [{ role: 'user', content: 'Continua.' }],
    attrezzi: [], maxOutputTokens: 77, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 };
  return { conti, trasporto,
    run: () => chiamaConRitenta(opzioni),
    esegui: () => trasporto.eseguiConFallback(({ fetchDiRete }) => chiamaConRitenta({ ...opzioni, fetchDiRete }), { modello: opzioni.modello }) };
}
const rifiuta = (messaggio, stato = 400) => (res) => {
  res.writeHead(stato, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'context_length_exceeded', message: `${messaggio} ${SEGRETO}` } }));
};

const FORME = [
  ['openai', "This model's maximum context length is 16384 tokens. However, you requested 21789 tokens. Please reduce the length of the messages.", { richiesti: 21_789, massimo: 16_384, uscita: null }],
  ['anthropic', 'prompt is too long: 213462 tokens > 200000 maximum', { richiesti: 213_462, massimo: 200_000, uscita: null }],
  ['openrouter con le parti', 'This endpoint\'s maximum context length is 131072 tokens. However, you requested about 135349 tokens (60662 of text input, 10687 of tool input, 64000 in the output).', { richiesti: 71_349, massimo: 131_072, uscita: 64_000 }],
];
for (const strada of ['run', 'esegui']) {
  for (const [nome, frase, attesi] of FORME) {
    test(`R10-NUMERI-01 (${strada}, ${nome}) — i numeri del fornitore passano l'adattatore; il suo corpo no`, async (t) => {
      const b = await banco(t, rifiuta(frase));
      const errore = await b[strada]().then(() => null, (e) => e);
      assert.ok(errore, 'premessa: il fornitore rifiuta');
      assert.equal(classificaErroreFornitore(errore), 'contesto-pieno', errore?.message);
      assert.deepEqual(numeriDelContestoPieno(errore), attesi, errore?.message);
      assert.doesNotMatch(String(errore.message), new RegExp(SEGRETO, 'u'), 'il corpo del fornitore non esce');
    });
  }
  test(`R10-NUMERI-02 (${strada}) — AL CONTRARIO: un 413 senza numeri resta senza numeri (e resta contesto pieno)`, async (t) => {
    const b = await banco(t, (res) => { res.writeHead(413, { 'Content-Type': 'text/plain' }); res.end('Payload Too Large'); });
    const errore = await b[strada]().then(() => null, (e) => e);
    assert.equal(classificaErroreFornitore(errore), 'contesto-pieno');
    assert.equal(numeriDelContestoPieno(errore), null, errore?.message);
  });
}

/* Il caso forte della CLI (c7.json): finestra NON dichiarata, il fornitore rifiuta oltre 16.384 coi numeri, un incollato da 120.000
   caratteri. Prima: «troppo lungo» generico, l'allegato falliva allo stesso modo e il messaggio rifiutato restava nella storia. */
test('R10-NUMERI-03 — attraverso l\'adattatore, finestra non dichiarata: un incollato enorme è REQUEST_TOO_LARGE con fonte «fornitore» e l\'allegato possibile, niente pagato, niente ritentato; AL CONTRARIO un messaggio corto entra', async (t) => {
  const FINESTRA = 16_384;
  const rispondi = (res, corpo) => {
    const veri = stima(corpo.messages ?? []);
    if (veri > FINESTRA) return rifiuta(`This model's maximum context length is ${FINESTRA} tokens. However, you requested ${veri} tokens. Please reduce the length of the messages.`)(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: veri, completion_tokens: 1 } }));
  };
  const corsa = async (richiesta) => {
    const b = await banco(t, rispondi, { conRiassunti: true });
    const cartella = cartellaDiProva('talos-r10-');
    const copie = cartellaDiProva('talos-r10-incollati-');
    t.after(() => { rimuoviCartellaDiProva(cartella); rimuoviCartellaDiProva(copie); });
    let errore = null;
    let esito = null;
    try {
      esito = await talosLavora({ cartella, modello: 'zai:glm-4.7-flash', chiave: 'unused-local-only', task: { consegna: 'x' }, contestoDelProgetto: 'Project files:\n',
        messaggiIniziali: [{ role: 'system', content: 'You are a coding agent.' }, { role: 'user', content: richiesta }], fetchDiRete: b.trasporto,
        permessi: 'Full access', cartellaIncollati: copie, scartoMisurato: 0 });
    } catch (e) { errore = e; }
    return { b, errore, esito };
  };
  const enorme = await corsa(`Ecco il log, dimmi cosa non va:\n${'riga del log con un errore dentro '.repeat(3_600)}`);
  assert.equal(enorme.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `${enorme.errore?.code}: ${enorme.errore?.message}`);
  assert.equal(enorme.errore.dati.fonte, 'fornitore');
  assert.equal(enorme.errore.dati.allegabile, true);
  assert.equal(enorme.b.conti.riassunti, 0, 'niente pagato');
  assert.equal(enorme.b.conti.richieste, 1, 'niente ritentato');
  const corto = await corsa('Rispondi OK.');
  assert.equal(corto.errore, null, corto.errore?.message);
  assert.equal(corto.esito.comeFinita, 'concluso');
});
