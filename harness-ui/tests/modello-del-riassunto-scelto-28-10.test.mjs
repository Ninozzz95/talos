/*
 * C6 (contratto «mai aspettare», 27/10; forma concordata con la CLI il 28/10): il modello che scrive i riassunti. Precedenza, in UNA funzione
 * pura che desktop e CLI importano (kernel centralizzato):
 *   1. lavoro già avviato: il SUO modello (`pinned`), mai la scelta di adesso;
 *   2. la scelta della persona per QUESTA conversazione (impostazioni del motore, `mode:'explicit'`, `origine:'persona'`);
 *   3. la scelta globale della persona (Impostazioni → Memoria e contesto → Riassunto della conversazione);
 *   4. la scelta dell'ospite (`mode:'explicit'` con `origine:'ospite'` o SENZA origine: oggi la CLI ci scrive il suo modello leggero);
 *   5. il modello della conversazione.
 * ⛔ La trappola trovata dalla CLI: l'involucro confrontava ciò che chi risolve rendeva con `explicit ? settings.model : sessionModel` —
 *   con la scelta globale della persona la guardia scattava (CTX_MODEL_MISMATCH) e il riassunto falliva. Ora il «selezionato» viene dalla
 *   STESSA funzione, e a chi risolve si passa (`selected`).
 * Il registro (strada della compattazione semplice): `sceltaDelRiassuntoFn` della persona > `modelloRiassuntoFn` dell'ospite > conversazione.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextModelAdapter, modelloDelRiassuntoScelto } from '../src/context-provider-adapter.mjs';
import { parseContextSettings } from '../../context-engine/src/contracts.mjs';

const conversazione = { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' };
const persona = { provider: 'zai', model: 'glm-5.3-air' };
const perQuesta = { provider: 'openai', model: 'gpt-6-luna' };
const ospite = { provider: 'openrouter', model: 'z-ai/glm-5.3-mini' };
const lavoro = { provider: 'deepseek', model: 'deepseek-flash' };
const explicit = (m, origine) => ({ model: { mode: 'explicit', ...m, ...(origine ? { origine } : {}) } });

test('RIASSUNTO-SCELTO-01 — la precedenza, caso per caso', () => {
  const scelto = (o) => modelloDelRiassuntoScelto({ sessionModel: conversazione, ...o });
  assert.deepEqual(scelto({}), conversazione, 'niente scelto: il modello della conversazione');
  assert.deepEqual(scelto({ settings: { model: { mode: 'follow-session' } } }), conversazione);
  assert.deepEqual(scelto({ settings: explicit(ospite) }), ospite, 'l\'ospite (senza origine), come oggi sulla CLI');
  assert.deepEqual(scelto({ settings: explicit(ospite, 'ospite'), sceltaDellaPersona: persona }), persona, 'la persona batte l\'ospite');
  assert.deepEqual(scelto({ settings: explicit(ospite), sceltaDellaPersona: persona }), persona, '…anche quando l\'ospite non dice l\'origine');
  assert.deepEqual(scelto({ settings: explicit(perQuesta, 'persona'), sceltaDellaPersona: persona }), perQuesta, 'la scelta per questa conversazione batte quella globale');
  assert.deepEqual(scelto({ settings: explicit(perQuesta, 'persona'), sceltaDellaPersona: persona, pinned: lavoro }), lavoro, 'un lavoro avviato tiene il suo');
  assert.deepEqual(scelto({ sceltaDellaPersona: { provider: '', model: 'x' } }), conversazione, 'una scelta storta non vale');
});

test('RIASSUNTO-SCELTO-02 — la trappola della CLI: scelta globale della persona + ospite scritto come explicit ⇒ nessun CTX_MODEL_MISMATCH, riassunto col modello della persona', async () => {
  const visti = [];
  const adattatore = createContextModelAdapter({
    sceltaDellaPersona: () => persona,
    resolveModel: async ({ selected }) => { visti.push(selected); return { ...selected, windowTokens: 32_000, responseReserve: 2_000 }; },
    callModel: async () => ({}),
  });
  const profilo = await adattatore.resolveModel({ sessionModel: conversazione, settings: explicit(ospite) });
  assert.equal(profilo.model, persona.model);
  assert.deepEqual(visti, [persona], 'chi risolve riceve il modello scelto, non deve ricalcolarlo');
});

test('RIASSUNTO-SCELTO-03 — al contrario: una composizione di oggi (risolve explicit/conversazione e ignora `selected`) senza scelta della persona funziona come prima', async () => {
  const adattatore = createContextModelAdapter({
    resolveModel: async ({ sessionModel, settings }) => ({ ...(settings?.model?.mode === 'explicit' ? { provider: settings.model.provider, model: settings.model.model } : sessionModel), windowTokens: 32_000, responseReserve: 2_000 }),
    callModel: async () => ({}),
  });
  assert.equal((await adattatore.resolveModel({ sessionModel: conversazione, settings: explicit(ospite) })).model, ospite.model);
  assert.equal((await adattatore.resolveModel({ sessionModel: conversazione, settings: { model: { mode: 'follow-session' } } })).model, conversazione.model);
  // e il lavoro avviato: la stessa composizione col suo modello resta coerente (pinned = quello che risolverebbe)
  assert.equal((await adattatore.resolveModel({ sessionModel: conversazione, settings: explicit(ospite), pinned: ospite })).model, ospite.model);
});

test('RIASSUNTO-SCELTO-04 — chi risolve non può sostituire il modello scelto: la guardia resta', async () => {
  const adattatore = createContextModelAdapter({ sceltaDellaPersona: () => persona, resolveModel: async () => ({ ...conversazione, windowTokens: 32_000, responseReserve: 2_000 }), callModel: async () => ({}) });
  await assert.rejects(adattatore.resolveModel({ sessionModel: conversazione, settings: {} }), { code: 'CTX_MODEL_MISMATCH' });
});

test('RIASSUNTO-SCELTO-05 — il contratto delle impostazioni: `origine` facoltativa, solo «persona» o «ospite»; senza, le impostazioni di ieri restano valide', () => {
  assert.equal(parseContextSettings({ model: { mode: 'explicit', provider: 'zai', model: 'glm-5.3-air', origine: 'persona' } }).model.origine, 'persona');
  assert.equal(parseContextSettings({ model: { mode: 'explicit', provider: 'zai', model: 'glm-5.3-air' } }).model.origine, undefined);
  assert.throws(() => parseContextSettings({ model: { mode: 'explicit', provider: 'zai', model: 'glm-5.3-air', origine: 'altro' } }), { code: 'CTX_INVALID_INPUT' });
});

test('RIASSUNTO-SCELTO-06 — la rotta HTTP delle impostazioni della conversazione è la porta della PERSONA (PC e dispositivo): un modello esplicito senza origine arriva come «persona»; un\'origine detta resta quella', async (t) => {
  const { createServer } = await import('node:http');
  const { createHttpApp } = await import('../src/http-app.mjs');
  const corpi = [];
  const contextService = { request: async ({ method, path, body }) => { corpi.push({ method, path, body }); return { ok: true }; }, close: async () => {} };
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, contextService }));
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const patch = (model) => fetch(`${base}/api/v1/sessions/s-1/context/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 2, idempotencyKey: `k-${corpi.length}`, patch: { model } }) });
  assert.equal((await patch({ mode: 'explicit', provider: 'zai', model: 'glm-5.3-air' })).status, 200);
  assert.equal(corpi.at(-1).body.patch.model.origine, 'persona');
  await patch({ mode: 'explicit', provider: 'zai', model: 'glm-5.3-air', origine: 'ospite' });
  assert.equal(corpi.at(-1).body.patch.model.origine, 'ospite', 'non si riscrive un\'origine detta');
  await patch({ mode: 'follow-session' });
  assert.equal(corpi.at(-1).body.patch.model.origine, undefined, 'seguire la conversazione non ha origine');
});
