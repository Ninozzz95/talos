/*
 * R-02 (S2, 12/10/2026, owner «un catalogo unico») — delega e Workflow accettavano solo gli id del catalogo di OpenRouter: la sessione
 * dell'owner su `chatgpt:gpt-6.1-sol` si è sentita dire 5 volte «is not one of the models this app can use» per il SUO modello.
 * `creaModelliUtilizzabili` unisce le fonti del selettore della chat. Le prove: le fonti si sommano; una fonte giù non svuota le
 * altre; senza chiave o senza collegamento quella fonte non c'è; tutte giù = elenco non disponibile (null), mai «vuoto».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { creaModelliUtilizzabili } from '../src/modelli-utilizzabili.mjs';

const fontiPiene = (sovrascrivi = {}) => ({
  openrouter: async () => ({ modelli: [{ id: 'z-ai/glm-5.3-flash' }, { id: 'openai/gpt-6' }] }),
  accessoChatgpt: { stato: () => ({ collegato: true }) },
  catalogoChatgpt: { elenca: async () => [{ id: 'chatgpt:gpt-6.1-sol' }, { id: 'chatgpt:gpt-6.1-luna' }] },
  fornitoriDiretti: ['anthropic', 'openai', 'gemini'],
  leggiChiave: (f) => (f === 'anthropic' ? 'sk-x' : f === 'gemini' ? '  ' : null),
  elencaFornitore: async (f) => ({ modelli: [{ id: `${f}:modello-a` }] }),
  runtimeLocali: { lmstudio: { listModels: async () => [{ id: 'qwen3-8b' }] } },
  statoLocale: () => ({ state: 'ready', modelId: 'gemma-4-e4b' }),
  ...sovrascrivi,
});

test('R-02-01: every source the chat selector knows is in the list, with the ids the chat uses', async () => {
  const elenco = await creaModelliUtilizzabili(fontiPiene()).elenco();
  assert.deepEqual([...elenco].sort(), ['anthropic:modello-a', 'chatgpt:gpt-6.1-luna', 'chatgpt:gpt-6.1-sol', 'lmstudio:qwen3-8b', 'local:gemma-4-e4b', 'openai/gpt-6', 'z-ai/glm-5.3-flash'].sort());
  assert.ok(elenco.includes('chatgpt:gpt-6.1-sol'), 'the model of the owner session is one of the models this app can use');
});

test('R-02-02 AL CONTRARIO: a source without its key, a plan not connected and an idle local engine add nothing', async () => {
  let chiestiAlFornitore = [];
  let pianoChiesto = 0;
  const elenco = await creaModelliUtilizzabili(fontiPiene({
    accessoChatgpt: { stato: () => ({ collegato: false }) },
    // un catalogo che RISPONDE (come una memoria rimasta da prima dello scollegamento): se lo si interroga, i suoi id passano
    catalogoChatgpt: { elenca: async () => { pianoChiesto += 1; return [{ id: 'chatgpt:gpt-6.1-sol' }]; } },
    elencaFornitore: async (f) => { chiestiAlFornitore.push(f); return { modelli: [{ id: `${f}:modello-a` }] }; },
    statoLocale: () => ({ state: 'stopped', modelId: 'gemma-4-e4b' }),
  })).elenco();
  assert.deepEqual(chiestiAlFornitore, ['anthropic'], 'only the provider with a real key is asked (a blank key is no key)');
  assert.equal(elenco.some((id) => id.startsWith('chatgpt:')), false);
  assert.equal(pianoChiesto, 0, 'a plan that is not connected is not even asked');
  assert.equal(elenco.includes('local:gemma-4-e4b'), false);
});

test('R-02-03 AL CONTRARIO: a source that fails or hangs does not empty the others; all failing = list not available (null)', async () => {
  const ferma = () => new Promise(() => {});
  const elenco = await creaModelliUtilizzabili(fontiPiene({ openrouter: async () => { throw new Error('offline'); }, elencaFornitore: ferma, tempoMassimoMs: 50 })).elenco();
  assert.ok(elenco.includes('chatgpt:gpt-6.1-sol'), 'the plan still answers');
  assert.equal(elenco.includes('z-ai/glm-5.3-flash'), false, 'OpenRouter is down: its models are not invented');
  assert.equal(elenco.includes('anthropic:modello-a'), false, 'the provider hung past the limit');
  const nessuna = await creaModelliUtilizzabili({
    openrouter: async () => { throw new Error('offline'); }, accessoChatgpt: { stato: () => { throw new Error('keyring'); } }, catalogoChatgpt: { elenca: async () => [] },
  }).elenco();
  assert.deepEqual(nessuna, [], 'the plan source answered (not connected) — an answered empty source is an empty list');
  assert.equal(await creaModelliUtilizzabili({ openrouter: async () => { throw new Error('offline'); } }).elenco(), null, 'every source failed: not available, never «no models»');
  assert.equal(await creaModelliUtilizzabili({}).elenco(), null, 'no source at all: not available');
});

test('R-02-04: the ids keep their shape — duplicates once, junk ids dropped', async () => {
  const elenco = await creaModelliUtilizzabili({
    openrouter: async () => ({ modelli: [{ id: 'a/b' }, { id: 'a/b' }, { id: '' }, { id: 7 }, null, { nome: 'no id' }] }),
  }).elenco();
  assert.deepEqual(elenco, ['a/b']);
});
