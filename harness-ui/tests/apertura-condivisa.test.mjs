/*
 * One opening per model, shared by whoever waits for it (01/11/2026, `FORMA-STOP-E-CARICAMENTO-2026-11-01.md` in the engine handoff
 * folder). Owner: Stop cancels a first load or a change of model. Performance: Stop from one conversation must not bring down another
 * one waiting for the same opening. Desktop: that other conversation sees no error and no «stopped» line.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creaAperturaCondivisa, fotoDelCaricamento, nomeDaMostrare } from '../src/apertura-condivisa.mjs';
import { FILTRO_CARICAMENTO } from '../src/remoto/lista-bianca.mjs';
import { OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';

/** An opening answered by hand; it rejects when its signal is aborted, as the supervisors do. */
function aperture() {
  const chiamate = [];
  const apri = (modelId, { signal }) => new Promise((risolvi, rifiuta) => {
    const voce = { modelId, signal, risolvi, rifiuta };
    chiamate.push(voce);
    signal.addEventListener('abort', () => rifiuta(Object.assign(new Error('runtime start cancelled'), { code: 'RUNTIME_START_CANCELLED' })), { once: true });
  });
  return { apri, chiamate };
}
const giro = () => new Promise((r) => setImmediate(r));

test('two conversations share one opening and both get its result', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const uno = condivisa.apri('modello');
  const due = condivisa.apri('modello');
  await giro();
  assert.equal(chiamate.length, 1);
  chiamate[0].risolvi({ state: 'ready' });
  assert.deepEqual(await uno, { state: 'ready' });
  assert.deepEqual(await due, { state: 'ready' });
});

test('a single waiter that stops cancels the opening', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const stop = new AbortController();
  const attesa = condivisa.apri('modello', { signal: stop.signal });
  await giro();
  stop.abort(new Error('stopped by the person'));
  await assert.rejects(attesa, /stopped by the person/u);
  assert.equal(chiamate[0].signal.aborted, true);
});

const SALTATO = () => Object.assign(new Error('The summary was skipped.'), { name: 'AbortError', code: 'SUMMARY_SKIPPED' });
const TETTO = () => Object.assign(new Error('The summary took too long.'), { name: 'AbortError', code: 'SUMMARY_TIME_LIMIT' });
const SCADUTO = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');

test('M11 a summary that gives up leaves the opening alone, and the next request of the turn finds it', async () => {
  for (const motivo of [SALTATO, TETTO, SCADUTO]) {
    const { apri, chiamate } = aperture();
    const condivisa = creaAperturaCondivisa({ apri });
    const riassunto = new AbortController();
    const attesa = condivisa.apri('modello', { signal: riassunto.signal, coda: true });
    await giro();
    const quale = motivo();
    riassunto.abort(quale);
    await assert.rejects(attesa, (e) => e === quale, 'who gave up hears its own reason at once');
    assert.equal(chiamate[0].signal.aborted, false, 'the opening goes on');
    const dopo = condivisa.apri('modello', { coda: true });
    await giro();
    assert.equal(chiamate.length, 1, 'the next request joins it: nothing starts from zero');
    chiamate[0].risolvi({ state: 'ready' });
    assert.deepEqual(await dopo, { state: 'ready' });
  }
});

test('M11 the Stop of the person still cancels, and it cancels also what a summary left behind', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const riassunto = new AbortController();
  const attesa = condivisa.apri('modello', { signal: riassunto.signal, coda: true });
  await giro();
  riassunto.abort(SALTATO());
  await assert.rejects(attesa, { code: 'SUMMARY_SKIPPED' });
  const stop = new AbortController();
  const giro2 = condivisa.apri('modello', { signal: stop.signal, coda: true });
  await giro();
  stop.abort(new Error('stopped by the person'));
  await assert.rejects(giro2, /stopped by the person/u);
  assert.equal(chiamate[0].signal.aborted, true);
});

test('M11 an opening nobody waits for gives way at once to a request for another model', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const riassunto = new AbortController();
  const attesa = condivisa.apri('riassunti', { signal: riassunto.signal, coda: true });
  await giro();
  riassunto.abort(TETTO());
  await assert.rejects(attesa, { code: 'SUMMARY_TIME_LIMIT' });
  const chat = condivisa.apri('chat', { coda: true });
  await giro();
  assert.equal(chiamate[0].signal.aborted, true, 'it would only delay a request that is really there');
  await giro();
  assert.equal(chiamate.length, 2);
  assert.equal(chiamate[1].modelId, 'chat');
  chiamate[1].risolvi({ state: 'ready' });
  assert.deepEqual(await chat, { state: 'ready' });
});

test('M11 it gives way also to the Model Lab, with its own window, on the same model', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const riassunto = new AbortController();
  const attesa = condivisa.apri('modello', { signal: riassunto.signal, coda: true });
  await giro();
  riassunto.abort(SALTATO());
  await assert.rejects(attesa, { code: 'SUMMARY_SKIPPED' });
  const lab = condivisa.apri('modello', { opzioni: { contesto: 8192 } });
  await giro();
  assert.equal(chiamate[0].signal.aborted, true);
  await giro();
  assert.equal(chiamate.length, 2, 'the choice of the Lab is not lost');
  chiamate[1].risolvi({ state: 'ready' });
  assert.deepEqual(await lab, { state: 'ready' });
});

test('M11 a summary that gives up with a chat in line cancels: the opening would only delay it', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const riassunto = new AbortController();
  const attesa = condivisa.apri('riassunti', { signal: riassunto.signal, coda: true });
  await giro();
  const chat = condivisa.apri('chat', { coda: true });
  await giro();
  assert.deepEqual(condivisa.inCoda(), ['chat']);
  riassunto.abort(SALTATO());
  await assert.rejects(attesa, { code: 'SUMMARY_SKIPPED' });
  await giro();
  assert.equal(chiamate[0].signal.aborted, true);
  await giro();
  assert.equal(chiamate.length, 2);
  chiamate[1].risolvi({ state: 'ready' });
  assert.deepEqual(await chat, { state: 'ready' });
});

test('M11 a summary that gives up behind another conversation cancels its change: it would unload that conversation for nobody', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  let segnaleDellaPrima = null;
  const prima = (segnale) => new Promise((_, rifiuta) => {
    segnaleDellaPrima = segnale;
    segnale.addEventListener('abort', () => rifiuta(new Error('the wait was cancelled')), { once: true });
  });
  const riassunto = new AbortController();
  const attesa = condivisa.apri('riassunti', { signal: riassunto.signal, coda: true, prima });
  await giro();
  riassunto.abort(SALTATO());
  await assert.rejects(attesa, { code: 'SUMMARY_SKIPPED' });
  assert.equal(segnaleDellaPrima.aborted, true);
  await giro();
  assert.equal(chiamate.length, 0, 'the engine was never asked');
});

test('M11 past the wait for the other conversation the opening is an opening like any other: a summary that gives up leaves it alone', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const riassunto = new AbortController();
  const attesa = condivisa.apri('modello', { signal: riassunto.signal, coda: true, prima: async () => null });
  await giro();
  assert.equal(chiamate.length, 1, 'the wait is over, the engine is opening');
  riassunto.abort(SALTATO());
  await assert.rejects(attesa, { code: 'SUMMARY_SKIPPED' });
  assert.equal(chiamate[0].signal.aborted, false);
});

test('M11 an opening somebody joined again is theirs: another model waits in line, it does not take it away', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const riassunto = new AbortController();
  const attesa = condivisa.apri('modello', { signal: riassunto.signal, coda: true });
  await giro();
  riassunto.abort(TETTO());
  await assert.rejects(attesa, { code: 'SUMMARY_TIME_LIMIT' });
  const chat = condivisa.apri('modello', { coda: true });
  const altra = condivisa.apri('altro', { coda: true });
  await giro();
  assert.equal(chiamate[0].signal.aborted, false, 'a conversation waits for it now');
  assert.deepEqual(condivisa.inCoda(), ['altro']);
  chiamate[0].risolvi({ state: 'ready' });
  assert.deepEqual(await chat, { state: 'ready' });
  await giro();
  chiamate[1].risolvi({ state: 'ready' });
  assert.deepEqual(await altra, { state: 'ready' });
});

test('a stop from one conversation leaves the other one its opening, with no error', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const stopUno = new AbortController();
  const uno = condivisa.apri('modello', { signal: stopUno.signal });
  const due = condivisa.apri('modello', { signal: new AbortController().signal });
  await giro();
  stopUno.abort(new Error('stopped'));
  await assert.rejects(uno, /stopped/u);
  assert.equal(chiamate[0].signal.aborted, false, 'somebody still waits');
  chiamate[0].risolvi({ state: 'ready' });
  assert.deepEqual(await due, { state: 'ready' });
});

test('the opening is cancelled when the LAST waiter stops, whichever came first', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const a = new AbortController();
  const b = new AbortController();
  const uno = condivisa.apri('modello', { signal: a.signal });
  const due = condivisa.apri('modello', { signal: b.signal });
  await giro();
  b.abort(new Error('second'));
  await assert.rejects(due, /second/u);
  assert.equal(chiamate[0].signal.aborted, false);
  a.abort(new Error('first'));
  await assert.rejects(uno, /first/u);
  assert.equal(chiamate[0].signal.aborted, true);
});

test('a waiter with no signal keeps the opening alive: nobody can stop on its behalf', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const a = new AbortController();
  const uno = condivisa.apri('modello', { signal: a.signal });
  const due = condivisa.apri('modello');
  await giro();
  a.abort(new Error('stopped'));
  await assert.rejects(uno, /stopped/u);
  assert.equal(chiamate[0].signal.aborted, false);
  chiamate[0].risolvi({ state: 'ready' });
  assert.deepEqual(await due, { state: 'ready' });
});

test('a failed opening reaches every waiter with its own error', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const uno = condivisa.apri('modello');
  const due = condivisa.apri('modello');
  await giro();
  chiamate[0].rifiuta(Object.assign(new Error('out of memory'), { code: 'RUNTIME_OUT_OF_MEMORY' }));
  await assert.rejects(uno, { code: 'RUNTIME_OUT_OF_MEMORY' });
  await assert.rejects(due, { code: 'RUNTIME_OUT_OF_MEMORY' });
});

test('a request that arrives while the opening is being cancelled waits, then opens afresh', async () => {
  /* the old engine goes away only when the test says so, to prove that the next request waits for it */
  const chiamate = [];
  const condivisa = creaAperturaCondivisa({ apri: () => new Promise((risolvi, rifiuta) => chiamate.push({ risolvi, rifiuta })) });
  const a = new AbortController();
  const uno = condivisa.apri('modello', { signal: a.signal });
  await giro();
  a.abort(new Error('stopped'));
  await assert.rejects(uno, /stopped/u);
  const due = condivisa.apri('modello');
  await giro();
  assert.equal(chiamate.length, 1, 'not beside the engine going away');
  chiamate[0].rifiuta(new Error('runtime start cancelled'));
  await giro();
  await giro();
  assert.equal(chiamate.length, 2, 'a new opening, not the one going away');
  chiamate[1].risolvi({ state: 'ready' });
  assert.deepEqual(await due, { state: 'ready' });
});

test('after an opening ends the next one is a new one', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const uno = condivisa.apri('modello');
  await giro();
  chiamate[0].risolvi({ state: 'ready' });
  await uno;
  const due = condivisa.apri('modello');
  await giro();
  assert.equal(chiamate.length, 2);
  chiamate[1].risolvi({ state: 'ready' });
  await due;
});

test('another model during an opening is not shared: it goes to the engine, which refuses it as today', async () => {
  const chiamate = [];
  const condivisa = creaAperturaCondivisa({ apri: (modelId) => {
    chiamate.push(modelId);
    if (chiamate.length === 2) return Promise.reject(Object.assign(new Error('runtime is already active'), { code: 'RUNTIME_ALREADY_RUNNING' }));
    return new Promise(() => {});
  } });
  condivisa.apri('a');
  await giro();
  await assert.rejects(condivisa.apri('b'), { code: 'RUNTIME_ALREADY_RUNNING' });
  assert.deepEqual(chiamate, ['a', 'b']);
});

test('a request already stopped opens nothing', async () => {
  const { apri, chiamate } = aperture();
  const condivisa = creaAperturaCondivisa({ apri });
  const a = new AbortController();
  a.abort(new Error('stopped'));
  await assert.rejects(condivisa.apri('modello', { signal: a.signal }), /stopped/u);
  await giro();
  assert.equal(chiamate.length, 0);
});

test('the load state comes from what the supervisors hold, and says no percent when there is none', () => {
  const iniziatoIl = '2026-11-01T10:00:00.000Z';
  assert.equal(fotoDelCaricamento({ state: 'ready', modelId: 'a' }), null);
  assert.equal(fotoDelCaricamento(null), null);
  assert.deepEqual(fotoDelCaricamento({ state: 'loading', modelId: 'a', startedAt: iniziatoIl }),
    { modelId: 'a', nome: null, fase: 'starting', percentuale: null, iniziatoIl, motivo: 'apertura', altroMotore: false });
  assert.deepEqual(fotoDelCaricamento({ state: 'loading', modelId: 'a', startedAt: iniziatoIl, router: { caricamento: { modelId: 'a', fase: 'text_model', percentuale: 42 } } }, { motivo: 'allargamento', nome: 'Gemma 4' }),
    { modelId: 'a', nome: 'Gemma 4', fase: 'text_model', percentuale: 42, iniziatoIl, motivo: 'allargamento', altroMotore: false });
  assert.equal(fotoDelCaricamento({ state: 'loading', modelId: 'a', fase: 'freeing' }).fase, 'freeing', 'the wait for the card');
  assert.equal(fotoDelCaricamento({ state: 'loading', modelId: 'a', fase: 'freeing', router: { caricamento: { modelId: 'a', fase: 'text_model' } } }).fase, 'freeing');
  assert.equal(fotoDelCaricamento({ state: 'loading', modelId: 'a', router: { ripiegoInCorso: 'a' } }).altroMotore, true);
  assert.equal(fotoDelCaricamento({ state: 'loading', modelId: 'a', router: { ripiegoInCorso: 'b' } }).altroMotore, false);
  assert.equal(fotoDelCaricamento({ state: 'loading', modelId: 'a', router: { ripieghi: [{ modelId: 'a', motivo: 'remembered' }] } }).altroMotore, false, 'a remembered model is not trying again');
});

test('the turn gives its stop to the opening, and the opening of the engine ends with it', async () => {
  let segnale = null;
  const dipendenze = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => false, chiamaLocale: async () => { throw new Error('the engine was never reached'); },
    avviaLocale: (_modelId, { signal }) => new Promise((_risolvi, rifiuta) => { segnale = signal; signal.addEventListener('abort', () => rifiuta(signal.reason), { once: true }); }),
  };
  const f = creaFetchMultiProvider(fetch, { dipendenze });
  const stop = new AbortController();
  const risposta = f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer x' }, signal: stop.signal,
    body: JSON.stringify({ model: 'local:gemma', messages: [{ role: 'user', content: 'x' }] }) });
  await giro();
  assert.ok(segnale, 'the signal reached the opening');
  assert.equal(segnale.aborted, false);
  stop.abort(new Error('stopped by the person'));
  await assert.rejects(risposta, /stopped by the person/u);
  assert.equal(segnale.aborted, true);
});

test('the name to show comes from the repository, and a path is never a name', () => {
  assert.equal(nomeDaMostrare('unsloth/gemma-4-26B-A4B-it-GGUF'), 'gemma-4-26B-A4B-it');
  assert.equal(nomeDaMostrare('Qwen3.8-27B'), 'Qwen3.8-27B');
  assert.equal(nomeDaMostrare('.\\cartella\\modello-GGUF'), 'modello', 'a relative Windows path must not come out whole');
  assert.equal(nomeDaMostrare('cartella\\modello'), 'modello');
  for (const percorso of ['C:\\Users\\Mario\\modelli', '/home/x/modelli', '\\\\pc\\modelli', '', '  ', null, undefined, 7]) assert.equal(nomeDaMostrare(percorso), null);
});

test('the bridge: read only, and only the written fields leave; modelId never does (Mobile: on the PC it can be a path)', () => {
  const voce = OPERAZIONI_HTTP['engine.loading'];
  assert.equal(voce.metodo, 'GET');
  assert.equal(voce.percorso(), '/api/v1/runtime/caricamento');
  const fuori = voce.filtra({ caricamento: { modelId: 'C:\\segreto\\a.gguf', nome: 'Gemma 4', fase: 'text_model', percentuale: 40, motivo: 'apertura', altroMotore: false, iniziatoIl: 'x', extra: 1 }, observedAt: 'y', extra: 2 });
  assert.deepEqual(fuori, { caricamento: { nome: 'Gemma 4', fase: 'text_model', percentuale: 40, motivo: 'apertura', altroMotore: false, iniziatoIl: 'x' }, observedAt: 'y' });
  assert.equal(voce.filtra, FILTRO_CARICAMENTO);
  assert.equal(voce.filtra({ caricamento: { modelId: 'a', fase: 'waiting', motivo: 'cambio', inCoda: ['C:\\segreto\\b.gguf'] }, observedAt: 'y' }).caricamento.inCoda, undefined, 'the line of the PC does not reach the telephone');
  assert.equal(voce.filtra({ caricamento: { fase: 'waiting', motivo: 'cambio' }, observedAt: 'y' }).caricamento.fase, 'waiting');
  assert.deepEqual(voce.filtra({ caricamento: null, observedAt: 'y' }), { caricamento: null, observedAt: 'y' });
});
