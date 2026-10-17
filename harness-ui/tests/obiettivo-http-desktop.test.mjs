/*
 * Le prove di `obiettivo-http.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
/*
 * ⭐⭐⭐ /goal, fase G1 (owner 14/10/2026: «Sì, parti dal server») — LE PORTE HTTP DELL'OBIETTIVO, dalla richiesta alla busta.
 *
 *   GET  /api/v1/sessions/:id/goal            → { obiettivo }            (null se non c'è)
 *   POST /api/v1/sessions/:id/goal  {testo}   → { ok, obiettivo }        (uno NUOVO, attivo)
 *   POST /api/v1/sessions/:id/goal/pausa      → { ok, obiettivo, invariato? }
 *   POST /api/v1/sessions/:id/goal/riprendi   → { ok, obiettivo, invariato? }
 *   POST /api/v1/sessions/:id/goal/togli      → { ok, obiettivo: null, invariato? }
 *
 * Il registro è quello VERO (giornale su disco): qui si prova che cosa arriva a chi chiama — stato HTTP, codice, motivo, valori
 * della frase — e che l'interfaccia trova la sua frase nelle due lingue. Codex ha le stesse porte (`thread/goal/get|set|clear`,
 * app-server-protocol v2, letto nel clone il 12/10/2026).
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TESTO_MASSIMO } from '../src/obiettivo/stato.mjs';
import { testoErroreServer } from '../frontend/src/components/errori.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const passo = () => new Promise((r) => setImmediate(r));

async function banco(t) {
  const cartellaStore = cartellaDiProva('talos-obiettivo-http-');
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    obiettiviNellaChat: true, // OB-REV-01 (15/10): come il server desktop; senza, la porta della persona rifiuta l'obiettivo
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${giri.length}` }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'r' }] } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}`, input: input.task });
      return attesa;
    },
  });
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await attendiScritture({ cartellaStore }).catch(() => {});
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task-vero');
  giri.at(-1).concludi();
  await passo();
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}/goal`;
  const chiedi = async (percorso = '', { metodo = 'GET', corpo, grezzo } = {}) => {
    const r = await fetch(`${base}${percorso}`, {
      method: metodo,
      ...(corpo !== undefined || grezzo !== undefined ? { headers: { 'content-type': 'application/json' }, body: grezzo ?? JSON.stringify(corpo) } : {}),
    });
    const testo = await r.text();
    return { stato: r.status, allow: r.headers.get('allow'), json: testo ? JSON.parse(testo) : null };
  };
  return { registro, giri, sessionId, chiedi, cartellaStore, radice: `http://127.0.0.1:${server.address().port}` };
}



test('GOAL-HTTP-03 — a refusal reaches the caller with its status, code, reason and values — and the interface says it in both languages', async (t) => {
  const { chiedi } = await banco(t);
  const errore = async (...argomenti) => { const r = await chiedi(...argomenti); return { stato: r.stato, ...r.json.error }; };

  const vuoto = await errore('', { metodo: 'POST', corpo: { testo: '   ' } });
  assert.deepEqual([vuoto.stato, vuoto.code, vuoto.reason], [400, 'GOAL_TEXT_INVALID', 'goal-text-empty']);
  const lungo = await errore('', { metodo: 'POST', corpo: { testo: 'a'.repeat(TESTO_MASSIMO + 1) } });
  assert.deepEqual([lungo.stato, lungo.code, lungo.reason], [400, 'GOAL_TEXT_INVALID', 'goal-text-too-long']);
  assert.deepEqual(lungo.params, { massimo: TESTO_MASSIMO });
  // la frase del registro è la spiegazione che viaggia: è scritta per lo schermo (vedi `MESSAGGIO_GIA_PER_LA_PERSONA`)
  assert.equal(lungo.explanation, `The goal is too long: the character limit is ${TESTO_MASSIMO}`);
  assert.equal(lungo.title, 'Goal text not valid');
  const senza = await errore('/pausa', { metodo: 'POST' });
  assert.deepEqual([senza.stato, senza.code, senza.reason], [409, 'GOAL_STATE_CONFLICT', 'goal-not-set']);
  const senzaRipresa = await errore('/riprendi', { metodo: 'POST' });
  assert.deepEqual([senzaRipresa.stato, senzaRipresa.code, senzaRipresa.reason], [409, 'GOAL_STATE_CONFLICT', 'goal-not-set']);

  impostaLingua('it');
  t.after(() => impostaLingua('it'));
  assert.equal(testoErroreServer(lungo).explanation, `L’obiettivo è troppo lungo: il limite di caratteri è ${TESTO_MASSIMO}`);
  assert.equal(testoErroreServer(senza).explanation, 'Questa conversazione non ha un obiettivo');
  assert.equal(testoErroreServer(senza).title, 'Comando non applicabile ora');
  impostaLingua('en');
  assert.equal(testoErroreServer(lungo).explanation, `The goal is too long: the character limit is ${TESTO_MASSIMO}`);
  assert.equal(testoErroreServer(senza).explanation, 'This conversation has no goal');
  assert.equal(testoErroreServer(vuoto).explanation, 'The goal cannot be empty');
});


test('GOAL-HTTP-05 — a sub-agent cannot have a goal: 422 with why, in both languages; AL CONTRARIO: its mother gets hers from the same door', async (t) => {
  const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const FIGLIA = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  const { registro, radice, cartellaStore } = await banco(t);
  // una madre e una sua figlia già concluse, scritte sul disco nella forma che `ripristina()` legge (come GOAL-REG-12)
  for (const [sessionId, extra] of [[MADRE, {}], [FIGLIA, { padreId: MADRE, profonditaDelega: 1 }]]) {
    const righe = [
      {
        tipo: 'intestazione', schema: 1, sessionId, taskId: extra.padreId ? `delega:${extra.padreId}` : 'libero:obiettivo', cartella: cartellaStore,
        task: { consegna: 'Compito: prova', consegnaCorta: 'prova' }, comandoProva: null, forkDa: null, avviataAlle: '2026-10-14T09:00:00.000Z',
        modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium', mobile: false, permessi: 'Full access', permessiPerAttrezzo: null,
        padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null, modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true,
        ...extra,
      },
      { type: 'RunStarted', _sequenza: 1, threadId: sessionId, runId: 'r1' },
      { type: 'RunFinished', _sequenza: 2, threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } },
    ];
    writeFileSync(join(cartellaStore, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
  }
  await registro.ripristina({ soloSessioni: [MADRE] });
  const imposta = (sessionId) => fetch(`${radice}/api/v1/sessions/${sessionId}/goal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testo: 'x' }) });

  const r = await imposta(FIGLIA);
  const { error } = await r.json();
  assert.equal(r.status, 422, JSON.stringify(error));
  assert.deepEqual([error.code, error.reason], ['GOAL_NOT_ALLOWED', 'goal-on-sub-agent']);
  impostaLingua('it');
  t.after(() => impostaLingua('it'));
  assert.equal(testoErroreServer(error).title, 'Obiettivo non ammesso qui');
  assert.equal(testoErroreServer(error).explanation, 'L’obiettivo è della conversazione principale: un sotto-agente non può averne uno');
  impostaLingua('en');
  assert.equal(testoErroreServer(error).explanation, 'A goal belongs to the main conversation: a sub-agent cannot have one');

  const madre = await imposta(MADRE);
  assert.equal(madre.status, 200);
  assert.equal((await madre.json()).data.obiettivo.stato, 'attivo');
});
