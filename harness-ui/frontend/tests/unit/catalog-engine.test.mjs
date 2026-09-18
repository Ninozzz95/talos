/**
 * Prove del motore del catalogo a faccette — **portate** da
 * `prototypes/calm-lab/tests/catalog-engine.test.mjs` (18/09/2026), non riscritte:
 * stessi casi, stesse asserzioni, stesso fixture (`prototypes/calm-lab/src/domain.mjs`
 * + `src/catalog-data.mjs`, ricostruito qui sotto perché il prototipo non è un modulo
 * del prodotto).
 *
 * ⛔ **Non portate** (dipendono da cose che nel prodotto non esistono, e non si inventano):
 * i sei casi su rotte e viste salvate (`modelRoute`/`parseModelRoute`,
 * `validateSavedViews`, il roundtrip in `localStorage`) e `fmtPrice` (è del dominio, non
 * del motore: il prodotto ha già `prezzoPerMilione` con la sua prova).
 *
 * ⛔ Il file è `.mjs` e importa un `.ts`: è il **type stripping** di Node 24, attivo senza
 * flag (nodejs.org/api/typescript.html §«Type stripping»; verificato il 18/09/2026 su
 * v24.18.0 con una sonda usa-e-getta — un `.test.mjs` importa `./engine.ts` e gira).
 * L'estensione `.ts` nell'import è obbligatoria: Node non risolve le estensioni da solo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCatalogFilters,
  validateCatalogFilters,
  catalogInputErrors,
  selectCatalog,
  parameterValue,
  modelMatchesCatalog,
  matchingArtifacts,
  facetCount,
  activeCatalogFilters,
  removeCatalogFilter,
  toggleCatalogFacet,
} from '../../src/domain/catalog-engine.ts';

/* ── il fixture del prototipo, identico ─────────────────────────────────────────────── */

const BASE = [
  { id: 'local:qwen8', name: 'Qwen3 8B', family: 'Qwen', glyph: 'qwen', destination: 'local', provider: 'llama.cpp', size: 5.2, context: 32768, required: 8.1, fit: 'compatible', installed: true, tasks: ['general', 'code'], description: 'Un modello locale per esplorare il flusso quotidiano: scegliere, verificare e poi usare.', license: 'Apache 2.0', file: 'Qwen3-8B-Q4_K_M.gguf', tools: null },
  { id: 'local:gemma', name: 'Gemma 3 12B', family: 'Google', glyph: 'gemma', destination: 'local', provider: 'llama.cpp', size: 8.1, context: 131072, required: 17.8, fit: 'compatible', installed: true, tasks: ['write', 'general'], description: 'Un secondo modello locale, per valutare una scelta diversa senza perdere il contesto.', license: 'Gemma', file: 'gemma-3-12b-Q4_K_M.gguf', tools: null },
  { id: 'local:qwen32', name: 'Qwen3 32B', family: 'Qwen', glyph: 'qwen', destination: 'local', provider: 'llama.cpp', size: 19.8, context: 32768, required: 23.9, fit: 'incompatible', installed: false, tasks: ['code', 'general'], description: 'Lo scenario con memoria insufficiente rende visibile il limite prima di un’azione.', license: 'Apache 2.0', file: 'Qwen3-32B-Q4_K_M.gguf', tools: null },
  { id: 'openrouter:aion2', name: 'Aion-2.0', family: 'AionLabs', glyph: 'cloud', destination: 'cloud', provider: 'OpenRouter', size: null, context: 131072, required: null, fit: 'unknown', installed: false, tasks: ['write'], description: 'Una voce cloud del catalogo di esempio. La selezione richiede una conferma esplicita della destinazione dei dati.', license: 'Da verificare', file: null, tools: true },
  { id: 'openrouter:aionmini', name: 'Aion-3.0 Mini', family: 'AionLabs', glyph: 'cloud', destination: 'cloud', provider: 'OpenRouter', size: null, context: 131072, required: null, fit: 'unknown', installed: false, tasks: ['write', 'general'], description: 'Un’alternativa cloud. Prezzi e disponibilità correnti non sono verificati da questo prototipo.', license: 'Da verificare', file: null, tools: true },
];

/** Port di `prototypes/calm-lab/src/catalog-data.mjs` — fixture, non schede di modelli reali. */
function extendCatalog(base) {
  const existing = base.map((m, i) => ({
    ...m,
    parametersB: [8.2, 12, 32.8, null, null][i],
    activeParametersB: null,
    architecture: i < 3 ? 'dense' : null,
    author: m.family,
    repo: i === 0 ? 'Qwen/Qwen3-8B-GGUF' : i === 1 ? 'google/gemma-3-12b-it' : i === 2 ? 'Qwen/Qwen3-32B-GGUF' : null,
    languages: i < 3 ? ['it', 'en', 'multi'] : null,
    capabilities: i < 3 ? null : ['tools'],
    access: i === 1 ? 'approval' : i < 3 ? 'open' : 'account',
    format: i < 3 ? 'GGUF' : null,
    quantization: i < 3 ? 'Q4_K_M' : null,
    priceInput: null,
    priceOutput: null,
    updatedAt: null,
    fixture: true,
    synthetic: false,
  }));
  const rows = [
    ['nano', 'Lumen 1B · demo', 1, 'Lumen', 'dense', null, 1.1, 2.4, 8192, 'Q8_0', ['general', 'write'], ['json'], ['it', 'en'], 'Apache 2.0', 'open'],
    ['small', 'Lumen 3B · demo', 3, 'Lumen', 'dense', null, 2.1, 4.5, 32768, 'Q4_K_M', ['general', 'write'], ['json', 'tools'], ['it', 'en'], 'Apache 2.0', 'open'],
    ['coder', 'Atlas Code 7B · demo', 7, 'Atlas', 'dense', null, 4.6, 7.3, 32768, 'Q5_K_M', ['code'], ['tools', 'json'], ['en'], 'MIT', 'open'],
    ['vision', 'Vela Vision 14B · demo', 14, 'Vela', 'dense', null, 9.6, 16.4, 65536, 'Q5_K_M', ['general', 'write'], ['vision', 'json'], ['it', 'en', 'multi'], 'Licenza personalizzata', 'approval'],
    ['moe', 'Atlas MoE 30B-A3B · demo', 30, 'Atlas', 'moe', 3, 18.3, 25.4, 131072, 'Q4_K_M', ['code', 'general'], ['tools', 'reasoning', 'json'], ['it', 'en', 'multi'], 'Apache 2.0', 'open'],
    ['large', 'Atlas 70B · demo', 70, 'Atlas', 'dense', null, 42.5, 54.2, 131072, 'Q4_K_M', ['general', 'code'], ['tools', 'reasoning'], ['en', 'multi'], 'Licenza personalizzata', 'approval'],
    ['xl', 'Vela MoE 120B-A12B · demo', 120, 'Vela', 'moe', 12, 71.2, 86.8, 262144, 'Q4_K_M', ['general'], ['tools', 'reasoning', 'vision'], ['multi'], 'Apache 2.0', 'open'],
    ['embed', 'Lumen Embed 0,6B · demo', 0.6, 'Lumen', 'dense', null, 1.3, 2.6, 8192, 'F16', ['embedding'], [], ['en'], 'MIT', 'open'],
    ['unknown', 'Archivio senza metadati · demo', null, 'Archivio', null, null, null, null, null, null, ['general'], null, null, 'Da verificare', null],
  ];
  const extra = rows.map(([id, name, parametersB, author, architecture, activeParametersB, size, required, context, quantization, tasks, capabilities, languages, license, access], i) => ({
    id: 'fixture:' + id,
    name,
    parametersB,
    author,
    family: author,
    architecture,
    activeParametersB,
    size,
    required,
    context,
    quantization,
    tasks,
    capabilities,
    languages,
    license,
    access,
    destination: 'local',
    provider: 'llama.cpp',
    glyph: 'qwen',
    installed: false,
    fit: required === null ? 'unknown' : required <= 18.6 ? 'compatible' : 'incompatible',
    format: id === 'unknown' ? null : 'GGUF',
    file: id === 'unknown' ? null : `${id}-${quantization}.gguf`,
    tools: capabilities === null ? null : capabilities.includes('tools'),
    repo: null,
    description: 'Modello fittizio per collaudare ricerca e filtri. Non è scaricabile da un repository reale.',
    priceInput: null,
    priceOutput: null,
    updatedAt: id === 'unknown' ? null : `2026-09-${String(5 + i).padStart(2, '0')}`,
    fixture: true,
    synthetic: true,
  }));
  extra.push({ id: 'fixture:cloud', name: 'Vela Cloud · demo', family: 'Vela', author: 'Vela', parametersB: null, activeParametersB: null, architecture: null, destination: 'cloud', provider: 'OpenRouter', glyph: 'cloud', size: null, required: null, context: 262144, fit: 'unknown', installed: false, tasks: ['general', 'write'], capabilities: ['tools', 'vision', 'json'], languages: ['it', 'en'], license: 'Servizio cloud · demo', access: 'account', file: null, format: null, quantization: null, tools: true, priceInput: 0.25, priceOutput: 1.2, updatedAt: '2026-09-12', fixture: true, synthetic: true, repo: null, description: 'Servizio fittizio con prezzi di esempio in USD per milione di token. Nessun addebito o chiamata.' });
  return [...existing, ...extra];
}

const M = extendCatalog(BASE);
const F = (o) => ({ ...emptyCatalogFilters(), ...o });
const ids = (a) => a.map((m) => m.id);
const select = (o, c = {}) => selectCatalog(M, F(o), c);
const template = { ...M[0], id: 'boundary', installed: false };

/* ── i casi del prototipo ───────────────────────────────────────────────────────────── */

test('nessun filtro: 15 record, ordine invariato, zero chip fantasma', () => {
  assert.deepEqual(select({}), M);
  assert.deepEqual(activeCatalogFilters({}), []);
});

for (const [id, inside, outside] of [
  ['tiny', [0, 0.6, 3], [3.0001, 8]],
  ['small', [3.0001, 7, 8], [3, 8.0001]],
  ['medium', [8.0001, 12, 14], [8, 14.0001]],
  ['large', [14.0001, 30, 35], [14, 35.0001]],
  ['xl', [35.0001, 70], [35, 70.0001]],
  ['xxl', [70.0001, 120], [70, 0]],
]) {
  test(`confini fascia ${id}: nessun doppio conteggio`, () => {
    for (const p of inside) assert.equal(modelMatchesCatalog({ ...template, parametersB: p }, F({ sizes: [id] })), true);
    for (const p of outside) assert.equal(modelMatchesCatalog({ ...template, parametersB: p }, F({ sizes: [id] })), false);
  });
}

test('fasce multiple si uniscono; destinazione e contesto si intersecano', () => {
  const found = select({ sizes: ['tiny', 'small'], destination: ['local'], minContext: '32768' });
  assert.deepEqual(ids(found), ['fixture:small', 'fixture:coder']);
});

test('intervallo manuale inclusivo, decimali conservati', () => assert.deepEqual(ids(select({ minParams: '8.2', maxParams: '14' })), ['local:qwen8', 'local:gemma', 'fixture:vision']));

test('intervallo invertito è un errore, non un reset silenzioso', () => {
  assert.equal(catalogInputErrors(F({ minParams: '32', maxParams: '8' })).length, 1);
  assert.equal(select({ minParams: '32', maxParams: '8' }).length, 0);
});

test('parametri non noti non sono zero', () => {
  assert.equal(select({ sizes: ['unknown'] }).length, 4);
  assert.equal(select({ maxParams: '1' }).length, 2);
  assert.equal(select({ maxParams: '1', includeUnknown: true }).length, 6);
});

test('MoE: totale e attivo distinti; stima RAM identica', () => {
  const m = M.find((x) => x.id === 'fixture:moe');
  assert.equal(parameterValue(m, 'total'), 30);
  assert.equal(parameterValue(m, 'active'), 3);
  assert.equal(modelMatchesCatalog(m, F({ maxParams: '3', basis: 'active' })), true);
  assert.equal(modelMatchesCatalog(m, F({ maxParams: '3' })), false);
  assert.equal(modelMatchesCatalog(m, F({ maxParams: '3', basis: 'active', maxRam: '18.6' })), false);
});

test('architettura non nota: attivi non dedotti dai totali', () => assert.equal(parameterValue({ ...template, architecture: null, parametersB: 7 }, 'active'), null));

test('dense: attivi equivalgono ai totali nello schema', () => assert.equal(parameterValue({ ...template, architecture: 'dense', parametersB: 7 }, 'active'), 7));

test('installati e preferiti sono vincoli indipendenti', () => assert.deepEqual(ids(select({ status: ['installed'], favorite: true }, { favorites: ['local:gemma', 'local:qwen32'] })), ['local:gemma']));

test('download: running, paused e error presenti; annullati e completati esclusi', () => {
  for (const status of ['running', 'paused', 'error', 'cancelled', 'completed']) {
    assert.equal(select({ status: ['downloading'] }, { downloads: [{ modelId: 'local:qwen32', status }] }).length, ['running', 'paused', 'error'].includes(status) ? 1 : 0);
  }
});

test('filtro locale + cloud OR, non impossibile AND', () => assert.equal(select({ destination: ['local', 'cloud'] }).length, 15));

test('contesto minimo: soglia inclusa', () => {
  assert.equal(select({ minContext: '131072' }).length, 7);
  assert.ok(select({ minContext: '131072' }).every((m) => m.context >= 131072));
});

test('filtro file non promuove cloud a file di zero byte', () => assert.ok(select({ maxFile: '3', includeUnknown: true }).every((m) => m.destination === 'local')));

test('RAM e file non scambiati: MoE file 18,3 ma RAM 25,4', () => {
  assert.ok(ids(select({ maxFile: '19' })).includes('fixture:moe'));
  assert.ok(!ids(select({ maxRam: '19' })).includes('fixture:moe'));
});

test('compatibilità RAM è una stima indipendente da installazione', () => {
  assert.ok(ids(select({ fit: ['fits'] })).includes('fixture:vision'));
  assert.ok(!ids(select({ status: ['installed'] })).includes('fixture:vision'));
});

test('RAM sconosciuta: cloud escluso anche includendo sconosciuti', () => assert.deepEqual(ids(select({ fit: ['unknown'], includeUnknown: true })), ['fixture:unknown']));

test('formato e quantizzazione congiunti', () => assert.deepEqual(ids(select({ formats: ['GGUF'], quant: ['Q5_K_M'] })), ['fixture:coder', 'fixture:vision']));

test('tutti i vincoli file devono appartenere allo stesso artefatto', () => {
  const m = { ...template, artifacts: [{ format: 'GGUF', quantization: 'Q4_K_M', size: 9, required: 12 }, { format: 'GGUF', quantization: 'Q8_0', size: 3, required: 6 }] };
  assert.equal(matchingArtifacts(m, F({ quant: ['Q4_K_M'], maxFile: '5' })).length, 0);
  assert.equal(modelMatchesCatalog(m, F({ quant: ['Q4_K_M'], maxFile: '5' })), false);
  assert.equal(modelMatchesCatalog(m, F({ quant: ['Q8_0'], maxFile: '5' })), true);
});

test('attività OR; capacità richieste AND', () => {
  assert.deepEqual(ids(select({ capabilities: ['tools', 'vision', 'reasoning'] })), ['fixture:xl']);
  assert.ok(select({ tasks: ['code', 'write'] }).every((m) => m.tasks.includes('code') || m.tasks.includes('write')));
});

test('capacità ignota non soddisfa il requisito tools', () => assert.ok(!ids(select({ capabilities: ['tools'] })).includes('local:qwen8')));

test('autore e provider combinati correttamente', () => assert.deepEqual(ids(select({ authors: ['Qwen'], providers: ['llama.cpp'] })), ['local:qwen8', 'local:qwen32']));

test('licenza = metadato esatto, non verdetto legale', () => assert.deepEqual(ids(select({ licenses: ['MIT'] })), ['fixture:coder', 'fixture:embed']));

test('multilingue non implica automaticamente italiano', () => {
  assert.ok(!ids(select({ languages: ['it'] })).includes('fixture:xl'));
  assert.ok(ids(select({ languages: ['multi'] })).includes('fixture:xl'));
});

test('gated / account / sconosciuto non confusi', () => {
  assert.deepEqual(ids(select({ access: ['account'] })), ['openrouter:aion2', 'openrouter:aionmini', 'fixture:cloud']);
  assert.deepEqual(ids(select({ access: ['unknown'] })), ['fixture:unknown']);
});

test('architettura MoE solo da metadati', () => assert.deepEqual(ids(select({ arch: ['moe'] })), ['fixture:moe', 'fixture:xl']));

test('prezzo ignoto non è gratuito', () => {
  assert.deepEqual(ids(select({ maxInput: '0.5', maxOutput: '2' })), ['fixture:cloud']);
  assert.equal(select({ maxInput: '0' }).length, 0);
  assert.equal(select({ maxInput: '0', includeUnknown: true }).length, 2);
});

test('ricerca AND su nome, autore, repository; accenti normalizzati', () => {
  assert.deepEqual(ids(select({}, { query: 'qwen gguf 32' })), ['local:qwen32']);
  assert.deepEqual(ids(select({}, { query: 'vela demo vision' })), ['fixture:vision']);
});

test('ordinamento globale ascendente; sconosciuti sempre in fondo', () => {
  const sorted = select({ sort: 'params-asc' });
  assert.equal(sorted[0].id, 'fixture:embed');
  assert.ok(sorted.slice(-4).every((m) => m.parametersB === null));
});

test('ordinamento discendente non porta gli sconosciuti in testa', () => {
  const sorted = select({ sort: 'params-desc' });
  assert.equal(sorted[0].id, 'fixture:xl');
  assert.ok(sorted.slice(-4).every((m) => m.parametersB === null));
});

test('ordinamento file, RAM, contesto, data, nome e prezzo', () => {
  assert.equal(select({ sort: 'file-asc' })[0].id, 'fixture:nano');
  assert.equal(select({ sort: 'ram-asc' })[0].id, 'fixture:nano');
  assert.equal(select({ sort: 'context-desc' })[0].context, 262144);
  assert.equal(select({ sort: 'updated-desc' })[0].id, 'fixture:embed');
  assert.equal(select({ sort: 'name' })[0].name, 'Aion-2.0');
  assert.equal(select({ sort: 'price-asc' })[0].id, 'fixture:cloud');
});

test('conteggi di faccetta rispettano gli altri gruppi', () => {
  assert.equal(facetCount(M, F({ destination: ['cloud'] }), 'sizes', 'tiny'), 0);
  assert.equal(facetCount(M, F({ destination: ['local'], sizes: ['tiny'] }), 'sizes', 'large'), 2);
});

test('rimozione singola non azzera le altre selezioni', () => {
  const f = removeCatalogFilter(F({ destination: ['local'], quant: ['Q4_K_M', 'Q5_K_M'] }), 'quant', 'Q4_K_M');
  assert.deepEqual(f.quant, ['Q5_K_M']);
  assert.deepEqual(f.destination, ['local']);
});

test('chip attivi escludono default e includono la soglia zero', () => {
  assert.equal(activeCatalogFilters(F({ maxInput: '0' }))[0].label, 'Input max.: 0 $/M');
  assert.equal(activeCatalogFilters(F({ favorite: true })).length, 1);
});

test('toggle senza mutazione', () => {
  const a = F({ destination: ['local'] });
  const b = toggleCatalogFacet(a, 'destination', 'cloud');
  assert.deepEqual(a.destination, ['local']);
  assert.deepEqual(b.destination, ['local', 'cloud']);
});

test('validazione: NaN Infinity valori negativi e chiavi inattese', () => {
  const f = validateCatalogFilters({ minParams: -1, maxRam: Infinity, maxFile: 'NaN', sort: 'finto', authors: ['a', 'a'], capabilities: ['inventato'], secret: 's' });
  assert.equal(f.minParams, '');
  assert.equal(f.maxRam, '');
  assert.equal(f.maxFile, '');
  assert.equal(f.sort, 'catalog');
  assert.deepEqual(f.authors, ['a']);
  assert.deepEqual(f.capabilities, []);
  assert.equal(f.secret, undefined);
});

test('applicare filtri non muta modelli, preferiti o download', () => {
  const models = structuredClone(M);
  const favorites = ['local:qwen8'];
  const before = JSON.stringify({ models, favorites });
  selectCatalog(models, F({ maxParams: '14', sort: 'params-asc' }), { favorites });
  assert.equal(JSON.stringify({ models, favorites }), before);
});

test('policy non noti e misura MoE sempre visibili e rimovibili', () => {
  const f = F({ includeUnknown: true, basis: 'active' });
  assert.equal(activeCatalogFilters(f).length, 2);
  assert.equal(removeCatalogFilter(f, 'includeUnknown', true).includeUnknown, false);
  assert.equal(removeCatalogFilter(f, 'basis', 'active').basis, 'total');
});

test('conteggio capacità: aggiungere visione deve rispettare tools già richiesto', () => assert.equal(facetCount(M, F({ capabilities: ['tools'] }), 'capabilities', 'vision'), 2));
