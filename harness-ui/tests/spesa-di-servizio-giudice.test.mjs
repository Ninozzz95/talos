/*
 * Spesa di servizio, parte 2 C (30/10/2026; forma approvata da CLI, Mobile, Performance; contratto §6 e §6-bis): le chiamate pagate che
 * passano da `chiediAlModelloUnaVolta` — il giudice della ricerca, il giudice di /goal, la domanda della persona alla sessione.
 *   - la porta `onSpesa` riceve UNA volta per chiamata: uso, esito, durata, tentativi;
 *   - un errore ⇒ la porta riceve l'uso dell'errore (se c'è) e l'esito, e l'errore esce com'era;
 *   - una porta che lancia non tocca mai la risposta;
 *   - il costruttore conosce i tre scopi nuovi e `tentativi` (solo > 1).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { chiediAlModelloUnaVolta } from '../src/agent-service.mjs';
import { valoreConsumoDiServizio, SCOPI_DI_SERVIZIO } from '../src/kernel/consumo-di-servizio.mjs';

const risposta = (testo, usage = { prompt_tokens: 300, completion_tokens: 20 }) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: testo }, finish_reason: 'stop' }], usage });
const base = { modello: 'z-ai/glm-5.3-flash', chiave: 'finta', prompt: 'Giudica.' };

test('SERVIZIO-GIUDICE-01 — una chiamata riuscita: onSpesa UNA volta, col suo uso, «completato», un tentativo', async () => {
  const spese = [];
  const testo = await chiediAlModelloUnaVolta({ ...base, fetchDiRete: async () => risposta('VERDETTO'), onSpesa: (v) => spese.push(v) });
  assert.equal(testo, 'VERDETTO');
  assert.equal(spese.length, 1);
  assert.equal(spese[0].esito, 'completato');
  assert.equal(spese[0].usage.prompt_tokens, 300);
  assert.equal(spese[0].tentativi, 1);
  assert.ok(Number.isSafeInteger(spese[0].durataMs));
});

test('SERVIZIO-GIUDICE-02 (Performance) — un 429 e poi la risposta: tentativi 2, UNA sola chiamata alla porta', async () => {
  const spese = []; let n = 0;
  const fetchDiRete = async () => (++n === 1 ? new Response('{"error":{"message":"rate"}}', { status: 429, headers: { 'Retry-After': '0' } }) : risposta('OK'));
  await chiediAlModelloUnaVolta({ ...base, fetchDiRete, onSpesa: (v) => spese.push(v) });
  assert.equal(n, 2, 'premessa: due tentativi');
  assert.equal(spese.length, 1);
  assert.equal(spese[0].tentativi, 2);
});

test('SERVIZIO-GIUDICE-03 — una chiamata che fallisce: la porta riceve «interrotto», l\'errore esce com\'era', async () => {
  const spese = [];
  const errore = await chiediAlModelloUnaVolta({ ...base, fetchDiRete: async () => new Response('{"error":{"message":"no"}}', { status: 400 }), onSpesa: (v) => spese.push(v) }).then(() => null, (e) => e);
  assert.ok(errore);
  assert.equal(spese.length, 1);
  assert.equal(spese[0].esito, 'interrotto');
});

test('SERVIZIO-GIUDICE-04 — la porta che lancia non tocca la risposta; senza porta tutto come prima', async () => {
  assert.equal(await chiediAlModelloUnaVolta({ ...base, fetchDiRete: async () => risposta('X'), onSpesa: () => { throw new Error('rotta'); } }), 'X');
  assert.equal(await chiediAlModelloUnaVolta({ ...base, fetchDiRete: async () => risposta('Y') }), 'Y');
});

test('SERVIZIO-GIUDICE-05 (Mobile) — il costruttore: i tre scopi nuovi, `tentativi` solo se > 1', () => {
  for (const scopo of ['giudice', 'obiettivo', 'domanda']) assert.ok(SCOPI_DI_SERVIZIO.includes(scopo), scopo);
  const campi = { esito: 'completato', usage: null, inPrimoPiano: false, at: '2026-10-30T00:00:00.000Z' };
  assert.equal(valoreConsumoDiServizio({ ...campi, scopo: 'domanda', tentativi: 3 }).tentativi, 3);
  assert.equal('tentativi' in valoreConsumoDiServizio({ ...campi, scopo: 'domanda', tentativi: 1 }), false);
});

/* ---------------------------------------------------------------------------------------- il filo dal registro, per i tre chiamanti */
const { mkdtempSync, writeFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { conStore, conversazioneFerma, registroAGiri } = await import('./aiuto/banco-obiettivo.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { creaChiediAlModelloGiudice } = await import('../src/session-registry.mjs');
const { impronta } = await import('../src/obiettivo/giudice.mjs');

/** Il modello finto: risponde e chiama la porta come `chiediAlModelloUnaVolta` vero (una volta, col suo uso). */
const modelloFinto = (risposta) => async ({ onSpesa }) => {
  onSpesa?.({ usage: { prompt_tokens: 120, completion_tokens: 8 }, esito: 'completato', durataMs: 7, tentativi: 2 });
  return typeof risposta === 'function' ? risposta() : risposta;
};
const righe = (registro, sessionId) => (registro.esporta(sessionId)?.eventi ?? []).filter((e) => e.type === 'CUSTOM' && e.name === 'consumo-di-servizio').map((e) => e.value);

test('SERVIZIO-DOMANDA-01 — la domanda della persona alla sessione: UNA riga «domanda», IN primo piano, nella sua conversazione', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { consumoDiServizioDurevole: true, modello: 'z-ai/glm-5.3-flash', chiediAlModelloUnaVoltaFn: modelloFinto('risposta') });
  const sessionId = await conversazioneFerma(b);
  const r = await b.registro.chiediAllaSessione(sessionId, 'Che cosa hai fatto?');
  assert.equal(r.testo, 'risposta');
  const [riga, ...altre] = righe(b.registro, sessionId).filter((v) => v.scopo === 'domanda');
  assert.equal(altre.length, 0);
  assert.equal(riga.inPrimoPiano, true);
  assert.equal(riga.tentativi, 2);
  assert.equal(riga.usage.prompt_tokens, 120);
}));

test('SERVIZIO-DOMANDA-02 — AL CONTRARIO: con l\'interruttore spento nessuna riga', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash', chiediAlModelloUnaVoltaFn: modelloFinto('risposta') });
  const sessionId = await conversazioneFerma(b);
  assert.equal((await b.registro.chiediAllaSessione(sessionId, 'x')).testo, 'risposta', 'premessa: la domanda è partita davvero');
  assert.equal(righe(b.registro, sessionId).length, 0);
}));

test('SERVIZIO-GIUDICE-RICERCA — creaChiediAlModelloGiudice passa la porta SOLO con la sessione di ricerca, e la porta riceve sessione e modello', async () => {
  const visti = [];
  const conPorta = []; const senzaPorta = [];
  const chiedi = creaChiediAlModelloGiudice({ chiaveDiTurno: () => 'k', onSpesa: (v) => visti.push(v),
    chiediAlModelloUnaVoltaFn: async (input) => { (input.onSpesa ? conPorta : senzaPorta).push(input); input.onSpesa?.({ usage: null, esito: 'completato', durataMs: 1, tentativi: 1 }); return 'ok'; } });
  await chiedi({ modello: 'qwen/qwen3.8-flash', prompt: 'p', sessionId: 'ricerca-1' });
  await chiedi({ modello: 'qwen/qwen3.8-flash', prompt: 'p' });
  assert.equal(conPorta.length, 1); assert.equal(senzaPorta.length, 1);
  assert.deepEqual([visti[0].sessionId, visti[0].modello, visti[0].esito], ['ricerca-1', 'qwen/qwen3.8-flash', 'completato']);
});

test('SERVIZIO-OBIETTIVO — il giudice di /goal: una riga «obiettivo» NON in primo piano per chiamata, nella conversazione dell\'obiettivo', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-servizio-obiettivo-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const README = '# Install\nRun npm ci.\n';
  const b = registroAGiri(cartellaStore, { consumoDiServizioDurevole: true, modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }), programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
    chiediAlModelloUnaVoltaFn: modelloFinto(() => JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'yes', reason: 'install section', evidence: [{ path: 'README.md', sha256: impronta(README) }] }] })) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', { criteri: [
    { testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }, { testo: 'the README explains how to install', verifica: { tipo: 'giudizio' } } ] });
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  const fino = Date.now() + 30_000;
  while (b.giri.length === prima && Date.now() < fino) await new Promise((r) => setTimeout(r, 5));
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = b.giri.at(-1).input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
  b.giri.at(-1).concludi([{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }]);
  while (!righe(b.registro, sessionId).some((v) => v.scopo === 'obiettivo') && Date.now() < fino) await new Promise((r) => setTimeout(r, 5));
  const obiettivo = righe(b.registro, sessionId).filter((v) => v.scopo === 'obiettivo');
  assert.ok(obiettivo.length >= 1, JSON.stringify(righe(b.registro, sessionId)));
  assert.equal(obiettivo[0].inPrimoPiano, false);
  /* un id senza via è openrouter, col nome intero (parte 1, `separaFonteModello`) */
  assert.deepEqual([obiettivo[0].fonte, obiettivo[0].modelloRemoto], ['openrouter', 'z-ai/glm-5.3-flash']);
}));
