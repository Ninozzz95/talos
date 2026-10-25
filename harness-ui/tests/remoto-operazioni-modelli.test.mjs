import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { OPERAZIONI_HTTP, creaOperazioni } from '../src/remoto/operazioni.mjs';
import { ID_CATALOGO_IN_UI } from '../src/provider-registry.mjs';
import { modelloDelPiano } from '../src/chatgpt-rotte.mjs';

/*
 * R-M4 bis (owner 20/10/2026 notte, dal Mobile: «quando il telefono usa una sessione del PC, il selettore mostra i modelli DEL PC») —
 * i modelli di un fornitore coi soli campi per scegliere, i modelli locali del PC con id e nome; mai il percorso di un file, mai
 * un id di fornitore inventato. Ogni prova ha il suo verso contrario.
 */
function banco({ providerProbe, localModelStore, catalogoChatgpt } = {}) {
  const sessionRegistry = { elenca: () => [], esiste: () => false };
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry, providerProbe, localModelStore, catalogoChatgpt });
  const chiamaVera = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama: chiamaVera, sessionRegistry, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  return { operazioni, contesto, chiamaVera };
}
const unFornitoreCloud = ID_CATALOGO_IN_UI.find((id) => id === 'openai') ?? ID_CATALOGO_IN_UI[0];

test('RM4-08 provider.models: solo un fornitore del catalogo; l\'id non diventa mai un pezzo di percorso', () => {
  const voce = OPERAZIONI_HTTP['provider.models'];
  assert.equal(voce.metodo, 'GET');
  assert.equal(voce.percorso({ provider: unFornitoreCloud }), `/api/v1/providers/${unFornitoreCloud}/models`);
  for (const provider of ['../providers', 'sconosciuto', '', 5, undefined, `${unFornitoreCloud}/runtime`]) {
    assert.throws(() => voce.percorso({ provider }), { code: 'BAD_MESSAGE' }, String(provider));
  }
});

test('RM4-09 i modelli arrivano coi soli campi per scegliere (livelli compresi); prezzi, fonti e percorsi no', async () => {
  const modelli = [{ id: `${unFornitoreCloud}:m1`, nome: 'M1', provider: unFornitoreCloud, contextLength: 128_000, maxOutputTokens: 8_000,
    capacita: { visione: 'osservato-si' }, reasoning: { supportedEfforts: ['low', 'high'] }, prezzi: { input: 1 }, fonteMetadati: 'C:\\Users\\Mario\\cache.json',
    percorsoFile: 'C:\\Users\\Mario\\modelli\\m1.gguf' }];
  const b = banco({ providerProbe: { elencaModelli: async (id) => ({ provider: id, modelli }) } });
  const r = await b.operazioni.esegui('provider.models', { provider: unFornitoreCloud }, b.contesto);
  assert.deepEqual(r, { provider: unFornitoreCloud, modelli: [{ id: `${unFornitoreCloud}:m1`, nome: 'M1', provider: unFornitoreCloud,
    contextLength: 128_000, capacita: { visione: 'osservato-si' }, reasoning: { supportedEfforts: ['low', 'high'] }, maxOutputTokens: 8_000 }] });
  // al contrario: la rotta del PC li porta (il filtro toglie davvero qualcosa)
  const { dati } = await b.chiamaVera({ metodo: 'GET', percorso: `/api/v1/providers/${unFornitoreCloud}/models`, origine: 'prova' });
  assert.match(JSON.stringify(dati), /Mario/u);
});

test('RM4-09b D-REM-9: i livelli di ragionamento del piano ChatGPT e dei fornitori diretti arrivano al dispositivo; AL CONTRARIO un campo che non serve a scegliere resta sul PC', async () => {
  /* il piano: la riga vera di `modelloDelPiano` da un modello dell'elenco dell'account, con un campo in più che non deve passare */
  const catalogoChatgpt = { elenca: async () => [{ ...modelloDelPiano({ slug: 'gpt-6-luna', display_name: 'GPT-6-Luna', context_window: 400_000,
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }, { effort: 'xhigh' }], default_reasoning_level: 'medium' }), prezzi: { input: 0 } }] };
  const perFornitore = {
    zai: [{ id: 'zai:glm-5.3-flash', nome: 'GLM-5.3 Flash', provider: 'zai', livelliRagionamento: ['low', 'high', 'max'], livelloRagionamentoPredefinito: null,
      fonteMetadati: 'C:\\Users\\Mario\\cache.json' }],
  };
  const b = banco({ catalogoChatgpt, providerProbe: { elencaModelli: async (id) => ({ provider: id, modelli: perFornitore[id] ?? [] }) } });
  const luna = (await b.operazioni.esegui('provider.models', { provider: 'chatgpt' }, b.contesto)).modelli[0];
  assert.deepEqual([luna.livelliRagionamento, luna.livelloRagionamentoPredefinito], [['low', 'medium', 'high', 'xhigh'], 'medium']);
  const glm = (await b.operazioni.esegui('provider.models', { provider: 'zai' }, b.contesto)).modelli[0];
  assert.deepEqual([glm.livelliRagionamento, glm.livelloRagionamentoPredefinito], [['low', 'high', 'max'], null]);
  // AL CONTRARIO: il resto del filtro non cambia — né i prezzi né un percorso del PC
  assert.equal(Object.hasOwn(luna, 'prezzi'), false);
  assert.doesNotMatch(JSON.stringify(glm), /Mario/u);
});

test('RM4-10 local-models.list: id, nome e il modello da usare; MAI il percorso del file né altri campi', async () => {
  const items = [{ id: 'LiquidAI-LFM2-5', name: 'LFM2.5 24B', path: 'C:\\Users\\Mario\\AppData\\TALOS\\.local-models\\lfm.gguf', sizeBytes: 14_000_000_000, sha256: 'abc' },
    { id: 'senza-nome', path: '/home/mario/x.gguf' }, { name: 'senza id' }];
  const b = banco({ localModelStore: { list: async () => items } });
  const r = await b.operazioni.esegui('local-models.list', {}, b.contesto);
  assert.deepEqual(r, { items: [
    { id: 'LiquidAI-LFM2-5', nome: 'LFM2.5 24B', modello: 'local:LiquidAI-LFM2-5' },
    { id: 'senza-nome', nome: 'senza-nome', modello: 'local:senza-nome' },
  ] });
  assert.doesNotMatch(JSON.stringify(r), /mario|Mario|gguf|sha256/u);
  const { dati } = await b.chiamaVera({ metodo: 'GET', percorso: '/api/v1/local-models', origine: 'prova' });
  assert.match(JSON.stringify(dati), /Mario/u, 'al contrario: la rotta del PC porta il percorso');
});
