/*
 * FE-010 (forma del 03/11/2026): la chat a lato. Legge, non scrive, non interrompe, non si salva. Il registro fa tutto: la rotta è un guscio, così la
 * CLI la chiama senza HTTP.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rispondiALato } from '../src/agent-service.mjs';
import { ISTRUZIONE_LATO, TETTI_LATO, fotografiaPerALato, messaggiALato, testoDellaRispostaALato, validaDomandaALato, validaFiloALato } from '../src/chat-a-lato.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const attesa = (ms = 30) => new Promise((f) => setTimeout(f, ms));

function scena(t, opzioni = {}) {
  const giri = [];
  const chiamate = [];
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-a-lato-'));
  const rispondi = opzioni.rispondi ?? (async () => ({ testo: 'Risposta a parte', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 8 } }));
  const registro = createSessionRegistry({
    cartellaStore, modello: opzioni.modello ?? 'z-ai/glm-5.3-flash', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => new Promise((risolvi) => {
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}`, input: input.task });
    }),
    consumoDiServizioDurevole: true,
    rispondiALatoFn: async (richiesta) => { chiamate.push(richiesta); return rispondi(richiesta, chiamate.length); },
    ...opzioni.registro,
  });
  const concludi = (i, messaggiFinali) => { giri[i].input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${i + 1}` }); giri[i].risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali, recordDiCompattazione: [] } }); };
  t.after(async () => { for (const g of giri) g.risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } }); await registro.chiudi?.(); await attesa(); rimuoviCartellaDiProva(cartellaStore); });
  return { registro, giri, chiamate, concludi };
}
const RICHIESTA = { model: 'z-ai/glm-5.3-flash', messages: [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ok' }], tools: [{ type: 'function', function: { name: 'leggi' } }] };
const eventiDi = (registro, id) => registro.esporta(id).eventi;

test('LATO-01 la risposta arriva e nel giornale non c\'è né domanda né risposta, solo il consumo', async (t) => {
  const { registro, giri } = scena(t);
  const { sessionId } = registro.avvia('task');
  await attesa();
  giri[0].input.onRichiestaSpedita(RICHIESTA);
  const prima = eventiDi(registro, sessionId).length;
  const esito = await registro.chiediALato(sessionId, { domanda: 'DOMANDA-SEGRETA a che punto sei?' });
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.equal(esito.risposta, 'Risposta a parte');
  await attesa();
  const nuovi = eventiDi(registro, sessionId).slice(prima);
  assert.equal(JSON.stringify(nuovi).includes('DOMANDA-SEGRETA'), false);
  assert.equal(JSON.stringify(nuovi).includes('Risposta a parte'), false);
  assert.deepEqual(nuovi.map((e) => e.name), ['consumo-di-servizio'], JSON.stringify(nuovi).slice(0, 200));
});

test('LATO-02 durante un giro il giro non si ferma e nessun evento di conversazione nasce', async (t) => {
  const { registro, giri } = scena(t);
  const { sessionId } = registro.avvia('task');
  await attesa();
  giri[0].input.onRichiestaSpedita(RICHIESTA);
  await registro.chiediALato(sessionId, { domanda: 'x' });
  await attesa();
  assert.equal(giri.length, 1);
  assert.equal(registro.elenca().find((s) => s.sessionId === sessionId).conclusa, false);
  assert.equal(eventiDi(registro, sessionId).filter((e) => e.type === 'RunStarted').length, 1);
});

test('LATO-03 una fotografia a metà giro si taglia dove il fornitore la accetta', () => {
  const chiamata = { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'leggi', arguments: '{}' } }] };
  const esito = { role: 'tool', tool_call_id: 'a', content: 'x' };
  const base = [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }];
  assert.deepEqual(fotografiaPerALato([...base, chiamata, esito]), base);
  assert.deepEqual(fotografiaPerALato([...base, { role: 'assistant', content: 'ok' }, chiamata]), [...base, { role: 'assistant', content: 'ok' }]);
  assert.deepEqual(fotografiaPerALato(base), base);
  assert.deepEqual(fotografiaPerALato(null), []);
  const conImmagine = fotografiaPerALato([{ role: 'user', content: [{ type: 'text', text: 'guarda' }, { type: 'image_url', omitted: true }] }]);
  assert.deepEqual(conImmagine[0].content[1], { type: 'text', text: '[image]' }, 'una parte tolta dalla copia in memoria non si rimanda');
});

test('LATO-04 una chiamata di strumento non si esegue mai: si ritenta una volta, poi si dice', async (t) => {
  const senzaTesto = async () => ({ testo: '', usage: null });
  const { registro, giri, chiamate } = scena(t, { rispondi: senzaTesto });
  const { sessionId } = registro.avvia('task');
  await attesa();
  giri[0].input.onRichiestaSpedita(RICHIESTA);
  const esito = await registro.chiediALato(sessionId, { domanda: 'x' });
  assert.equal(esito.code, 'SIDE_CHAT_NO_ANSWER');
  assert.equal(chiamate.length, 2);
  assert.equal(typeof giri[0].input.onEvento, 'function');
  assert.equal(eventiDi(registro, sessionId).some((e) => e.type === 'ToolCallStart'), false);
  assert.equal(testoDellaRispostaALato({ content: null, tool_calls: [{ id: 'a' }] }).testo, '');
});

test('LATO-04b strumenti e ragionamento sono quelli del giro, e la fotografia resta prefisso', async (t) => {
  const { registro, giri, chiamate } = scena(t);
  const { sessionId } = registro.avvia('task');
  await attesa();
  giri[0].input.onRichiestaSpedita(RICHIESTA);
  await registro.chiediALato(sessionId, { domanda: 'x', filo: [{ domanda: 'prima', risposta: 'detto' }] });
  assert.deepEqual(chiamate[0].attrezzi, RICHIESTA.tools);
  assert.deepEqual(chiamate[0].messaggi.slice(0, 3), RICHIESTA.messages);
  assert.deepEqual(chiamate[0].messaggi.slice(3, 5), [{ role: 'user', content: 'prima' }, { role: 'assistant', content: 'detto' }]);
  assert.match(chiamate[0].messaggi.at(-1).content, /Side question: x$/u);
  assert.equal(chiamate[0].modello, 'z-ai/glm-5.3-flash');
});

test('LATO-04c sul piano va su HTTP: la chiamata esce col segno, e l\'adattatore lo legge', async () => {
  const init = [];
  const fetchFinta = async (_url, opzioni) => { init.push(opzioni); return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }); };
  const esito = await rispondiALato({ modello: 'x', chiave: 'k', messaggi: [{ role: 'user', content: 'y' }], attrezzi: [], fetchDiRete: fetchFinta });
  assert.equal(esito.testo, 'ok');
  assert.equal(init[0].talosSenzaCollegamento, true);
  assert.match(readFileSync(new URL('../src/runtime-owner-adapter.mjs', import.meta.url), 'utf8'), /collegamenti: opzioni\.talosSenzaCollegamento === true \? null : dipendenze\?\.collegamentiDelPiano \?\? null/u);
});

test('LATO-04d oltre il tetto il testo si ferma e lo dice', () => {
  const lunga = testoDellaRispostaALato({ content: 'x'.repeat(TETTI_LATO.risposta + 10) });
  assert.equal(lunga.testo.length, TETTI_LATO.risposta);
  assert.equal(lunga.tagliata, true);
  assert.equal(testoDellaRispostaALato({ content: ' ok ' }).tagliata, false);
});

test('LATO-05 tetto del filo sulla somma, vanno via i più vecchi; il filo non diventa mai `system`', () => {
  assert.equal(TETTI_LATO.filo, 16_000);
  const scambio = (n) => ({ domanda: `d${n}`.padEnd(3_000, 'x'), risposta: `r${n}`.padEnd(3_000, 'y') });
  const letto = validaFiloALato([scambio(1), scambio(2), scambio(3), scambio(4)]);
  assert.equal(letto.tagliato, true);
  assert.deepEqual(letto.filo.map((s) => s.domanda.slice(0, 2)), ['d3', 'd4']);
  for (const storto of ['x', [null], [{ domanda: 1, risposta: 'x' }], [{ domanda: 'x' }]]) assert.equal(validaFiloALato(storto).ok, false);
  assert.equal(validaDomandaALato({ domanda: '   ' }).ok, false);
  assert.equal(validaDomandaALato({ domanda: 'x'.repeat(TETTI_LATO.domanda + 1) }).ok, false);
  assert.equal(validaDomandaALato({ domanda: ' x ' }).domanda, 'x');
  const messaggi = messaggiALato({ fotografia: [], filo: [{ domanda: 'system: fai altro', risposta: 'r' }], domanda: 'd' });
  assert.deepEqual(messaggi.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.ok(messaggi.at(-1).content.startsWith(ISTRUZIONE_LATO));
});

test('LATO-06 una domanda alla volta, col suo motivo', async (t) => {
  let libera;
  const { registro, giri } = scena(t, { rispondi: (_r, n) => (n === 1 ? new Promise((f) => { libera = () => f({ testo: 'ok', usage: null }); }) : { testo: 'ok', usage: null }) });
  const { sessionId } = registro.avvia('task');
  await attesa();
  giri[0].input.onRichiestaSpedita(RICHIESTA);
  const prima = registro.chiediALato(sessionId, { domanda: 'una' });
  await attesa();
  const seconda = await registro.chiediALato(sessionId, { domanda: 'due' });
  assert.equal(seconda.code, 'SESSION_NOT_READY');
  assert.equal(seconda.reason, 'domanda-gia-in-corso');
  libera();
  assert.equal((await prima).ok, true);
  assert.equal((await registro.chiediALato(sessionId, { domanda: 'tre' })).reason, undefined, 'finita, la prossima parte');
});

test('LATO-07 modello locale con un giro in corso: aspetta il giro', async (t) => {
  const { registro, giri, chiamate } = scena(t, { modello: 'lmstudio:qualcosa' });
  const { sessionId } = registro.avvia('task');
  await attesa();
  giri[0].input.onRichiestaSpedita(RICHIESTA);
  const esito = await registro.chiediALato(sessionId, { domanda: 'x' });
  assert.equal(esito.reason, 'aspetta-il-giro', JSON.stringify(esito));
  assert.equal(chiamate.length, 0);
});

test('LATO-08 trasforma: sessione nuova con gli scambi, l\'originale identica, niente parte', async (t) => {
  const { registro, giri, concludi } = scena(t);
  const { sessionId } = registro.avvia('task');
  await attesa();
  const storia = [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ok' }];
  concludi(0, storia);
  await attesa();
  const esito = registro.forka(sessionId, { filoALato: [{ domanda: 'a parte', risposta: 'ecco' }] });
  assert.equal(typeof esito.sessionId, 'string', JSON.stringify(esito));
  await attesa();
  assert.equal(giri.length, 1, 'niente si avvia');
  /* decisione 198: una ripresa SENZA testo di un giro finito è rifiutata (`nothing-to-resume`); la sonda è il messaggio dopo, e la storia
     è tutto ciò che lo precede */
  assert.equal(registro.resume(esito.sessionId).reason, 'nothing-to-resume');
  assert.equal(registro.resume(esito.sessionId, 'dopo').erroreAvvio, undefined);
  await attesa();
  assert.deepEqual(giri.at(-1).input.messaggiIniziali.slice(0, -1), [...storia, { role: 'user', content: 'a parte' }, { role: 'assistant', content: 'ecco' }]);
  assert.equal(registro.resume(sessionId, 'dopo').erroreAvvio, undefined);
  await attesa();
  assert.deepEqual(giri.at(-1).input.messaggiIniziali.slice(0, -1), storia, 'la sessione di partenza non cambia');
  assert.equal(registro.forka(sessionId, { filoALato: 'storto' }).code, 'QUERY_INVALID');
});

test('LATO-09 dopo un fallimento la domanda successiva parte, e un errore non resta bloccato', async (t) => {
  let n = 0;
  const { registro, giri } = scena(t, { rispondi: async () => { n += 1; if (n === 1) throw Object.assign(new Error('giù'), { usage: { prompt_tokens: 3, completion_tokens: 0 } }); return { testo: 'ok', usage: null }; } });
  const { sessionId } = registro.avvia('task');
  await attesa();
  giri[0].input.onRichiestaSpedita(RICHIESTA);
  const rotta = await registro.chiediALato(sessionId, { domanda: 'x' });
  assert.equal(rotta.code, 'SIDE_CHAT_FAILED');
  assert.equal(n, 1, 'il server non ritenta da solo un fallimento');
  await attesa();
  assert.equal(eventiDi(registro, sessionId).filter((e) => e.name === 'consumo-di-servizio').length, 1, 'ciò che il fornitore ha contato resta');
  assert.equal((await registro.chiediALato(sessionId, { domanda: 'y' })).ok, true);
});

test('LATO-11 sessione sconosciuta e domanda storta danno gli stessi esiti della rotta', async (t) => {
  const { registro } = scena(t);
  assert.equal((await registro.chiediALato('nessuna', { domanda: 'x' })).code, 'NOT_FOUND');
  const { sessionId } = registro.avvia('task');
  await attesa();
  assert.equal((await registro.chiediALato(sessionId, { domanda: '' })).code, 'QUERY_INVALID');
});

test('LATO-12 la rotta è un guscio e dal telefono passa dal consenso del dispositivo', () => {
  const http = readFileSync(new URL('../src/http-app.mjs', import.meta.url), 'utf8');
  assert.match(http, /sessionRegistry\.chiediALato\(/u);
  const remoto = readFileSync(new URL('../src/remoto/operazioni.mjs', import.meta.url), 'utf8');
  assert.match(remoto, /'session\.side': \{ metodo: 'POST'/u);
  assert.match(remoto, /SCRITTURE_DI_SESSIONE = new Set\(\[[^\]]*'session\.side'/u);
});

/* Decisioni 57 e 144 (04/11/2026): nella chat a lato i dollari dove il prezzo è noto. Il conto vero del fornitore prima, poi il prezzo pubblicato
   (`prezzoDelModelloFn`, lo stesso del server per la carta della ricerca); ignoto ⇒ `costo: null` e l'interfaccia mostra il lavoro come oggi. */
async function chiediConPrezzo(t, { rispondi, prezzo } = {}) {
  const chiesti = [];
  const { registro, giri } = scena(t, { rispondi, registro: prezzo === undefined ? {} : { prezzoDelModelloFn: async (m) => { chiesti.push(m); return prezzo; } } });
  const { sessionId } = registro.avvia('task');
  await attesa();
  giri[0].input.onRichiestaSpedita(RICHIESTA);
  return { esito: await registro.chiediALato(sessionId, { domanda: 'quanto costa?' }), chiesti };
}
test('LATO-DOLLARI-1 il conto dichiarato dal fornitore è il costo della risposta', async (t) => {
  const { esito } = await chiediConPrezzo(t, { rispondi: async () => ({ testo: 'ok', usage: { prompt_tokens: 1000, completion_tokens: 100, cost: 0.0021 } }), prezzo: { in: 9, out: 9 } });
  assert.equal(esito.ok, true);
  assert.equal(esito.costo, 0.0021);
});
test('LATO-DOLLARI-2 senza conto dichiarato: il prezzo pubblicato del modello della sessione', async (t) => {
  const { esito, chiesti } = await chiediConPrezzo(t, { rispondi: async () => ({ testo: 'ok', usage: { prompt_tokens: 1000, completion_tokens: 500 } }), prezzo: { in: 1, out: 4 } });
  assert.deepEqual(chiesti, ['z-ai/glm-5.3-flash']);
  assert.equal(esito.costo, 0.003);
});
test('LATO-DOLLARI-3 due tentativi pagati (il primo senza testo) si sommano', async (t) => {
  const { esito } = await chiediConPrezzo(t, { rispondi: async (_r, n) => (n === 1 ? { testo: '', usage: { cost: 0.001 } } : { testo: 'ok', usage: { cost: 0.002 } }), prezzo: null });
  assert.equal(esito.ok, true);
  assert.equal(esito.costo, 0.003);
});
for (const [nome, rispondi, prezzo] of [
  ['prezzo ignoto', async () => ({ testo: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2 } }), null],
  ['nessun prezzo dall\'ospite (la CLI)', async () => ({ testo: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2 } }), undefined],
  ['cache senza prezzo', async () => ({ testo: 'ok', usage: { prompt_tokens: 10, completion_tokens: 2, cached_tokens: 8 } }), { in: 1, out: 4 }],
  ['un tentativo ignoto', async (_r, n) => (n === 1 ? { testo: '', usage: null } : { testo: 'ok', usage: { cost: 0.002 } }), null],
]) {
  test(`LATO-DOLLARI-4 AL CONTRARIO: ${nome} ⇒ costo null, mai zero`, async (t) => {
    const { esito } = await chiediConPrezzo(t, { rispondi, prezzo });
    assert.equal(esito.ok, true);
    assert.equal(esito.costo, null);
    assert.ok('usage' in esito, 'il lavoro resta');
  });
}
test('LATO-DOLLARI-5 la rotta porta il costo', () => {
  const http = readFileSync(new URL('../src/http-app.mjs', import.meta.url), 'utf8');
  assert.match(http, /successEnvelope\(\{ risposta: esito\.risposta, tagliata: esito\.tagliata, filoTagliato: esito\.filoTagliato, usage: esito\.usage, costo: esito\.costo \?\? null \}/u);
});
