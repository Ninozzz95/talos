/*
 * ⛔ REVISIONE AVVERSARIA (bugfixer, 15/10/2026) — `feat/goal-g6-ui` 70779777d (carta C1, `/goal`, chat ferma, `obiettivoModificato`).
 *  - G6UI-REV-01 (S4): `obiettivoModificato` si controlla solo nella FORMA (`ob-…`). Il registro dice al modello «the person edited
 *    the checks and set the goal themselves» anche se quell'obiettivo non esiste, o se l'obiettivo della conversazione è un altro: un
 *    client che lo manda senza aver salvato niente (un `POST /goal` fallito, un id di un'altra chat) fa credere al modello un fatto
 *    falso, e il modello non lo crea più («do not create it again»).
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-G6-UI-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { conStore, conversazioneFerma, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';

async function cartaDelModello(t, cartellaStore) {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const sessionId = await conversazioneFerma(b);
  b.registro.resume(sessionId, 'set a goal: make the tests pass');
  await passo();
  const input = b.giri.at(-1).input;
  const risposta = input.chiediApprovazioneFn({ tipo: 'goal_create', toolCallId: 'g1', obiettivo: { testo: 'make the tests pass', criteri: [] } });
  const { requestId } = b.registro.domandaInAttesa(sessionId);
  t.after(() => { try { b.giri.at(-1).concludi([]); } catch { /* già chiuso */ } });
  return { b, sessionId, requestId, risposta };
}

test('G6UI-REV-01 (S4) — «Modifica i controlli» con un id che NON è l\'obiettivo della conversazione: il modello si sente dire che la persona l\'ha impostato', async (t) => conStore(t, async (cartellaStore) => {
  const { b, sessionId, requestId } = await cartaDelModello(t, cartellaStore);
  assert.equal(b.registro.statoObiettivo(sessionId).obiettivo, null, 'premessa: nessun obiettivo nella conversazione');
  const finto = 'ob-11111111-2222-4333-8444-555555555555';
  const esito = await b.registro.rispondiApprovazione(sessionId, requestId, false, { obiettivoModificato: finto });
  const ancoraInAttesa = b.registro.domandaInAttesa(sessionId)?.requestId === requestId;
  if (!ancoraInAttesa) await b.registro.rispondiApprovazione(sessionId, requestId, false).catch?.(() => {});
  assert.equal(esito?.code, 'QUERY_INVALID', `a goal id that this conversation does not have was accepted (${JSON.stringify(esito)}): the model is told the person set a goal that does not exist`);
}));

test('G6UI-RIV-02 CONTROLLO — con l\'id dell\'obiettivo che la persona ha DAVVERO impostato, la risposta passa', async (t) => conStore(t, async (cartellaStore) => {
  const { b, sessionId, requestId, risposta } = await cartaDelModello(t, cartellaStore);
  const impostato = await b.registro.impostaObiettivo(sessionId, 'make the tests pass', { criteri: [{ testo: 'runs npm test', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  assert.equal(impostato.ok, true, JSON.stringify(impostato));
  assert.deepEqual(await b.registro.rispondiApprovazione(sessionId, requestId, false, { obiettivoModificato: impostato.obiettivo.id }), { ok: true });
  assert.match((await risposta).motivo, /set the goal themselves/u);
}));

test('G6UI-RIV-03 CONTROLLO — un fork «prima del giro» di una chat CON storia non è una chat ferma: l\'elenco non la dice «in attesa del primo messaggio»', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const sessionId = await conversazioneFerma(b); // giro r1 concluso, con la sua storia
  b.registro.resume(sessionId, 'domanda 2');
  await passo();
  b.giri.at(-1).concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }, { role: 'user', content: 'domanda 2' }, { role: 'assistant', content: 'r2' }]);
  await passo(); await passo();
  const fork = b.registro.forka(sessionId, { primaDelGiro: 'r2' });
  assert.ok(fork?.sessionId, `premessa: il fork prima del giro 2 nasce (${JSON.stringify(fork)?.slice(0, 160)})`);
  await passo();
  const riga = b.registro.elenca().find((v) => v.sessionId === fork.sessionId);
  assert.ok(riga, 'premessa: il fork è nell\'elenco');
  assert.equal(riga.primoMessaggioAtteso, undefined, 'a fork that already has a conversation is listed as «waiting for its first message»');
}));

test('G6UI-RIV-04 CONTROLLO — `/goal/proposta` con `lingua`: la lingua NOMINATA arriva al modello; una lingua che non c\'è è un 400 e il modello non si chiama', async (t) => conStore(t, async (cartellaStore) => {
  const { createServer } = await import('node:http');
  const { createHttpApp } = await import('../src/http-app.mjs');
  const { attendiScritture } = await import('../src/session-store.mjs');
  const { scriviSessione } = await import('./aiuto/banco-obiettivo.mjs');
  const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  scriviSessione(cartellaStore, MADRE);
  const { registro } = registroAGiri(cartellaStore);
  await registro.ripristina();
  const chiamate = [];
  const server = createServer(createHttpApp({
    staticHandler: async () => null, sessionRegistry: registro,
    providerStore: { getKey: (p) => (p === 'openrouter' ? 'sk-or-v1-finta' : null), getRuntime: () => ({ provider: 'openrouter', endpoint: 'https://openrouter.example/api/v1', endpointConfigured: false, timeoutSeconds: 60 }) },
    fetchPropostaObiettivoFn: async (_u, opzioni) => { chiamate.push(JSON.parse(opzioni.body)); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ criteria: [{ type: 'judgement', text: 'Va bene' }] }) } }] }) }; },
    fetchMiglioraPromptFn: async () => { throw new Error('not this network'); },
    contestoDelProgettoFn: async () => ({ testo: 'Working sheet — prova' }),
    creaFiltroGitignoreFn: async (argomento) => ({ argomento }),
  }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); await attendiScritture({ cartellaStore }).catch(() => {}); });
  const proponi = (corpo) => fetch(`http://127.0.0.1:${server.address().port}/api/v1/sessions/${MADRE}/goal/proposta`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  const ok = await proponi({ testo: 'make the tests pass', lingua: 'it' });
  assert.equal(ok.status, 200, await ok.text());
  assert.equal(chiamate.length, 1, 'premessa: il modello è stato chiamato');
  const dati = JSON.parse(chiamate[0].messages.find((m) => m.role === 'user').content);
  assert.equal(dati.criteria_language, 'Italian', 'the interface language does not reach the model');
  const no = await proponi({ testo: 'make the tests pass', lingua: 'fr' });
  assert.equal(no.status, 400);
  assert.equal(chiamate.length, 1, 'a refused language must not call the model');
}));
