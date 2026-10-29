/*
 * ⭐ Revisione avversaria del blocco 11 (27/10/2026), pezzo D, e prova dal vivo dispositivo → PC dello stesso giorno.
 *   - D1 (era un mutante creduto equivalente): un ascoltatore che lancia non toglie l'annuncio agli altri né alla storia.
 *   - D2: la rinomina, «dove girano i comandi», i comandi nella conversazione e il Piano scrivono nella loro riga la STESSA versione
 *     che annunciano: dopo un riavvio con l'orologio indietro il cambio dopo non esce mai più vecchio di uno già visto.
 *   - L'AUTORE: la prova dal vivo ha mostrato la rinomina dal dispositivo annunciata senza `origine` (contratto §F.3 punto 1).
 *   - Owner 27/10/2026, il RAGIONAMENTO quando cambia il modello: «Codex, ma mai più caro», deciso una volta sola nel server.
 *   Prove del revisore: handoff `revisione-blocco-11-prove-2026-10-27/D-impostazioni-b11.test.mjs`.
 * Ogni regola ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { reasoningAlCambioDiModello } from '../src/runtime-owner-adapter.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'fai il lavoro' } };
    },
    cartellaEsisteFn: () => true, ...opzioni });
}
function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    concludi(i) { giri[i].input.onEvento({ type: 'RunFinished' }); giri[i].risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [{ role: 'user', content: 'x' }] } }); },
  };
}
async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) {
    try { await attendiScritture({ cartellaStore }); } catch { /* il resto lo dicono le prove */ }
    await new Promise((r) => setImmediate(r));
  }
}
const annunci = (registro, sessionId) => registro.esporta(sessionId).eventi
  .filter((e) => e.type === 'CUSTOM' && e.name === 'talos.impostazioni-sessione').map((e) => e.value);

function banco(opzioni = {}) {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, ...opzioni });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Workspace write' });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  giri.concludi(0);
  return { giri, registro, sessionId, chiama };
}
const DAL_PAD = { tipo: 'telefono', nome: 'Pad', dispositivoId: 'd-1' };

/* ---------- L'autore di ogni cambio ---------- */

test('B11-ORIG-01 la rinomina dal dispositivo dice chi è stato; dal PC dice «pc»', async () => {
  const b = banco();
  await new Promise((r) => setImmediate(r));
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/rename`, corpo: { nome: 'Dal Pad' }, origineRemota: DAL_PAD });
  const dalPad = annunci(b.registro, b.sessionId).at(-1);
  assert.equal(dalPad.motivo, 'nome');
  assert.deepEqual(dalPad.origine, { tipo: 'dispositivo', dispositivoId: 'd-1' });
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/rename`, corpo: { nome: 'Dal PC' } });
  assert.deepEqual(annunci(b.registro, b.sessionId).at(-1).origine, { tipo: 'pc' });
});

test('B11-ORIG-02 dove girano i comandi e i comandi nella conversazione dal dispositivo dicono chi è stato', async () => {
  const b = banco();
  await new Promise((r) => setImmediate(r));
  const dove = await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/dove-girano-i-comandi`, corpo: { dove: 'windows' }, origineRemota: DAL_PAD });
  assert.equal(dove.stato, 200, JSON.stringify(dove.dati ?? dove));
  assert.deepEqual(annunci(b.registro, b.sessionId).at(-1).origine, { tipo: 'dispositivo', dispositivoId: 'd-1' });
  const racconto = await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/comandi-nella-conversazione`, corpo: { acceso: true } });
  assert.equal(racconto.stato, 200, JSON.stringify(racconto.dati ?? racconto));
  assert.deepEqual(annunci(b.registro, b.sessionId).at(-1).origine, { tipo: 'pc' });
});

/* ---------- D1: un ascoltatore che lancia ---------- */

test('B11-D1 un ascoltatore che lancia: gli altri ricevono lo stesso l\'annuncio, e la storia lo ha', async (t) => {
  const cartellaStore = cartellaDiProva('talos-b11-d1-');
  const giri = giriFinti();
  const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Workspace write' });
  giri.concludi(0);
  await new Promise((r) => setImmediate(r));
  await svuota(cartellaStore);
  const visti = [];
  registro.iscriviti(sessionId, (e) => { if (e?.name === 'talos.impostazioni-sessione') throw new Error('flusso di un dispositivo chiuso a metà'); });
  registro.iscriviti(sessionId, (e) => { if (e?.name === 'talos.impostazioni-sessione') visti.push(e.value?.istantanea?.reasoning?.effort); });
  await registro.aggiornaImpostazioni(sessionId, { reasoning: { effort: 'high' } });
  await svuota(cartellaStore);
  const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: giriFinti().avviaSessioneFn });
  await riavviato.ripristina();
  const nellaStoria = riavviato.esporta(sessionId).eventi.filter((e) => e.name === 'talos.impostazioni-sessione').map((e) => e.value?.istantanea?.reasoning?.effort);
  await svuota(cartellaStore);
  t.diagnostic(JSON.stringify({ visti, nellaStoria }));
  assert.deepEqual(visti, ['high'], 'il secondo ascoltatore (un\'altra finestra, il dispositivo) non ha ricevuto il cambio');
  assert.ok(nellaStoria.includes('high'), 'la storia non ha l\'annuncio: chi si ricollega non lo riceve');
});

/* ---------- D2: la versione non torna indietro, per ogni scrittore ---------- */

for (const [nome, cambia] of [
  ['rinomina', (r, id) => r.rinomina(id, 'Titolo nuovo')],
  ['dove girano i comandi', (r, id) => r.doveGiranoIComandi(id, 'windows')],
  ['comandi nella conversazione', (r, id) => r.comandiNellaConversazione(id, true)],
]) {
  test(`B11-D2 (${nome}) dopo un riavvio con l'orologio 1 s indietro, il cambio dopo non è più vecchio di uno già annunciato`, async (t) => {
    const cartellaStore = cartellaDiProva('talos-b11-d2-');
    let adesso = Date.UTC(2026, 9, 27, 12, 0, 0);
    const clock = () => new Date(adesso);
    const giri = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: giri.avviaSessioneFn, clock });
    const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Workspace write' });
    giri.concludi(0);
    await new Promise((r) => setImmediate(r));
    await registro.aggiornaImpostazioni(sessionId, { modello: 'primo/m' });
    adesso += 2_000;
    const esito = await cambia(registro, sessionId);
    assert.ok(!esito?.erroreAvvio, `premessa: il cambio riesce (${esito?.erroreAvvio})`);
    const annunciata = registro.impostazioniCorrenti(sessionId).versione;
    assert.equal(annunci(registro, sessionId).at(-1).istantanea.versione, annunciata, 'premessa: è la versione annunciata');
    await svuota(cartellaStore);
    adesso -= 1_000; // l'orologio si riallinea indietro di un secondo, il server riparte
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: giriFinti().avviaSessioneFn, clock });
    await riavviato.ripristina();
    const ripristinata = riavviato.impostazioniCorrenti(sessionId).versione;
    await riavviato.aggiornaImpostazioni(sessionId, { modello: 'dopo/m' });
    const dopo = riavviato.impostazioniCorrenti(sessionId).versione;
    await svuota(cartellaStore);
    t.diagnostic(JSON.stringify({ annunciata, ripristinata, dopo }));
    assert.equal(ripristinata, annunciata, 'al riavvio la versione già annunciata si è persa');
    assert.ok(dopo > annunciata, `il cambio dopo il riavvio (${dopo}) è più vecchio di quello già annunciato (${annunciata})`);
  });
}

test('B11-D2-bis due scrittori in volo nello stesso millisecondo non escono con la stessa versione', async () => {
  const fermo = Date.UTC(2026, 9, 27, 12, 0, 0);
  /* con lo store vero: ogni scrittore aspetta il disco, quindi i tre sono davvero in volo insieme (senza, ognuno finisce subito) */
  const cartellaStore = cartellaDiProva('talos-b11-d2bis-');
  const b = banco({ clock: () => new Date(fermo), cartellaStore });
  await new Promise((r) => setImmediate(r));
  await svuota(cartellaStore);
  await Promise.all([
    b.registro.doveGiranoIComandi(b.sessionId, 'windows'),
    b.registro.rinomina(b.sessionId, 'Nome insieme'),
    b.registro.aggiornaImpostazioni(b.sessionId, { modello: 'insieme/m' }),
  ]);
  await svuota(cartellaStore);
  const versioni = annunci(b.registro, b.sessionId).map((a) => a.istantanea.versione);
  assert.equal(versioni.length, 3, 'premessa: tre annunci');
  assert.equal(new Set(versioni).size, versioni.length, `due annunci con la stessa versione: ${versioni}`);
});

/* ---------- Il ragionamento quando cambia il modello: «Codex, ma mai più caro» ---------- */

const GLM = { reasoning: { supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max', mandatory: true } };
const ECONOMICO_DI_SERIE = { reasoning: { supportedEfforts: ['high', 'low', 'minimal'], defaultEffort: 'low' } };

test('B11-RAG-01 la regola pura: supportato resta; altrimenti il predefinito se non costa di più; altrimenti il più vicino più debole', () => {
  assert.deepEqual(reasoningAlCambioDiModello({ effort: 'high' }, GLM), { effort: 'high' }, 'un livello supportato resta');
  assert.deepEqual(reasoningAlCambioDiModello({ effort: 'medium' }, GLM), { effort: 'low' }, 'il predefinito «max» costa di più: si scende');
  assert.deepEqual(reasoningAlCambioDiModello({ effort: 'medium' }, ECONOMICO_DI_SERIE), { effort: 'low' }, 'il predefinito costa meno: vale lui');
  assert.deepEqual(reasoningAlCambioDiModello({ effort: 'xhigh' }, ECONOMICO_DI_SERIE), { effort: 'low' }, 'il predefinito, non il più vicino («high»)');
  assert.deepEqual(reasoningAlCambioDiModello({ effort: 'minimal' }, GLM), { effort: 'low' }, 'niente di più debole: il minimo supportato');
  assert.deepEqual(reasoningAlCambioDiModello({ effort: 'none' }, ECONOMICO_DI_SERIE), { effort: 'none' }, '«spento» su un modello non obbligatorio resta spento');
  assert.deepEqual(reasoningAlCambioDiModello({ effort: 'medium', summary: 'auto' }, GLM), { effort: 'low', summary: 'auto' }, 'il resto resta');
  assert.deepEqual(reasoningAlCambioDiModello({ effort: 'medium' }, null), { effort: 'medium' }, 'catalogo muto: resta com\'è');
  assert.equal(reasoningAlCambioDiModello(null, GLM), null, 'nessun ragionamento scelto: resta nessuno');
});

function bancoRagionamento(catalogo) {
  const chiesti = [];
  const b = banco({ reasoningAlCambioDiModelloFn: async (reasoning, modello) => { chiesti.push(modello); return reasoningAlCambioDiModello(reasoning, catalogo[modello] ?? null); } });
  return { ...b, chiesti };
}

test('B11-RAG-02 solo il modello (PC, dispositivo, /model della CLI): il livello si adatta nel server, e la fotografia lo dice', async () => {
  const b = bancoRagionamento({ 'z-ai/glm-5.3-flash': GLM });
  await new Promise((r) => setImmediate(r));
  await b.registro.aggiornaImpostazioni(b.sessionId, { reasoning: { effort: 'medium' } });
  const r = await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/settings`, corpo: { modello: 'z-ai/glm-5.3-flash' }, origineRemota: DAL_PAD });
  assert.equal(r.stato, 200);
  assert.deepEqual(b.chiesti, ['z-ai/glm-5.3-flash']);
  assert.deepEqual(annunci(b.registro, b.sessionId).at(-1).istantanea.reasoning, { effort: 'low' });
  assert.deepEqual(b.registro.impostazioniCorrenti(b.sessionId).reasoning, { effort: 'low' });
});

test('B11-RAG-03 AL CONTRARIO: il livello scelto nella stessa richiesta vince; lo stesso modello non tocca niente', async () => {
  const b = bancoRagionamento({ 'z-ai/glm-5.3-flash': GLM });
  await new Promise((r) => setImmediate(r));
  await b.registro.aggiornaImpostazioni(b.sessionId, { modello: 'z-ai/glm-5.3-flash', reasoning: { effort: 'high' } });
  assert.deepEqual(b.chiesti, [], 'chi ha scelto il livello insieme al modello non viene corretto');
  assert.deepEqual(b.registro.impostazioniCorrenti(b.sessionId).reasoning, { effort: 'high' });
  await b.registro.aggiornaImpostazioni(b.sessionId, { modello: 'z-ai/glm-5.3-flash' });
  assert.deepEqual(b.chiesti, [], 'lo stesso modello non è un cambio');
});

test('B11-RAG-04 un catalogo che si rompe non ferma il cambio: il livello resta com\'era', async () => {
  const b = banco({ reasoningAlCambioDiModelloFn: async () => { throw new Error('catalogo giù'); } });
  await new Promise((r) => setImmediate(r));
  await b.registro.aggiornaImpostazioni(b.sessionId, { reasoning: { effort: 'medium' } });
  const esito = await b.registro.aggiornaImpostazioni(b.sessionId, { modello: 'altro/m' });
  assert.equal(esito.ok, true);
  assert.equal(b.registro.impostazioniCorrenti(b.sessionId).modello, 'altro/m');
  assert.deepEqual(b.registro.impostazioniCorrenti(b.sessionId).reasoning, { effort: 'medium' });
});
