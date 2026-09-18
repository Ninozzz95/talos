/*
 * Corsia 1, 18/09/2026 — le prove della BARRA A FACCETTE e dell'anello che la collega al catalogo
 * osservato (`components/catalogo-faccette.js`, `components/catalogo-modelli.js`).
 *
 * ⛔ Che cosa mordono, in una riga ciascuna:
 *  · il CONFRONTO fra `conteggiPerFornitore` e `facetCount`: due strade diverse verso lo stesso
 *    numero. Non è un'asserzione mia, è un confronto — se una delle due cambia, il test diventa
 *    rosso invece di lasciare in giro due conteggi diversi per la stessa faccetta;
 *  · la GUARDIA DEI VALORI AMMESSI: ogni valore che la barra può offrire deve sopravvivere a
 *    `validateCatalogFilters` e cambiare DAVVERO la selezione. Senza questa prova un valore fuori
 *    dal vocabolario (per esempio `temperature`) produrrebbe una spunta che non filtra niente —
 *    la peggior specie di controllo, perché sembra funzionare;
 *  · l'ADATTATORE: `-1` e `''` sono «non dichiarato» e non «zero», il contesto 0 è «non
 *    dichiarato», i prezzi passano da USD/token a USD/milione.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { activeCatalogFilters, emptyCatalogFilters, facetCount, selectCatalog, toggleCatalogFacet, validateCatalogFilters } from '../../src/domain/catalog-engine.ts';
import { capacitaDelCatalogo, conteggiPerFornitore } from '../../src/components/catalogo-faccette.js';
import { capacitaOsservate, filtraModelli, modelloCatalogo, normalizzaCatalogoModelli } from '../../src/components/catalogo-modelli.js';

/* Un record con la forma VERA di GET /api/v1/models (campi osservati il 05/09/2026). */
const record = (o) => ({ id: o.id, provider: o.provider, alias: false, nome: o.nome || o.id, contextLength: o.contextLength, prezzoPrompt: o.prezzoPrompt, prezzoCompletion: o.prezzoCompletion, inputModalities: o.inputModalities || ['text'], outputModalities: o.outputModalities || ['text'], supportedParameters: o.supportedParameters || [], description: 'd', createdAt: 1 });
const CATALOGO = { daCache: false, aggiornatoAlle: '2026-09-05T18:00:00.000Z', modelli: [
  record({ id: 'alpha/uno', provider: 'alpha', contextLength: 8192, prezzoPrompt: '0.0000008', prezzoCompletion: '0.0000016', supportedParameters: ['tools', 'reasoning', 'temperature'] }),
  record({ id: 'alpha/due', provider: 'alpha', contextLength: 200000, prezzoPrompt: '0.000003', prezzoCompletion: '0.000006', inputModalities: ['text', 'image'], supportedParameters: ['tools', 'tool_choice'] }),
  record({ id: 'beta/uno', provider: 'beta', contextLength: 131072, prezzoPrompt: '-1', prezzoCompletion: '-1', supportedParameters: ['reasoning'] }),
  record({ id: 'beta/due', provider: 'beta', contextLength: 0, prezzoPrompt: '', prezzoCompletion: null, supportedParameters: [] }),
  record({ id: 'gamma/uno', provider: 'gamma', contextLength: 65536, prezzoPrompt: '0.0000002', prezzoCompletion: '0.0000004', outputModalities: ['text', 'audio'], supportedParameters: ['response_format'] }),
  record({ id: 'gamma/due', provider: 'gamma', contextLength: 40000, prezzoPrompt: 3e-7, prezzoCompletion: 6e-7, supportedParameters: ['response_format', 'tools'] }),
] };
const MODELLI = CATALOGO.modelli.map(modelloCatalogo);
const ID = new Map(MODELLI.map((m, i) => [m, CATALOGO.modelli[i]]));
const idBase = () => [...MODELLI];

test('l’adattatore: dal record osservato al modello del motore', () => {
  const uno = modelloCatalogo(CATALOGO.modelli[0]);
  assert.equal(uno.name, 'alpha/uno');
  assert.equal(uno.provider, 'alpha');
  assert.equal(uno.destination, 'cloud');
  assert.equal(uno.family, '', 'family è la stringa vuota del prototipo, non un valore inventato');
  assert.equal(uno.context, 8192);
  assert.equal(uno.priceInput, 0.8, 'da USD/token a USD per milione');
  assert.equal(uno.priceOutput, 1.6);
  assert.equal(uno.parametersB, null, 'i campi senza sorgente restano null');
  assert.equal(uno.file, null);
});

test('un prezzo NON dichiarato non è un prezzo pari a zero', () => {
  assert.equal(modelloCatalogo(CATALOGO.modelli[2]).priceInput, null, 'prezzoPrompt -1');
  assert.equal(modelloCatalogo(CATALOGO.modelli[2]).priceOutput, null);
  assert.equal(modelloCatalogo(CATALOGO.modelli[3]).priceInput, null, 'stringa vuota');
  assert.equal(modelloCatalogo(CATALOGO.modelli[3]).priceOutput, null, 'null');
  assert.equal(modelloCatalogo(CATALOGO.modelli[3]).context, null, 'contesto 0 = non dichiarato');
  assert.equal(modelloCatalogo(CATALOGO.modelli[5]).priceInput, 0.3, 'un numero vero passa lo stesso');
});

test('le cinque capacità del motore, ciascuna col campo che le dichiara', () => {
  assert.deepEqual(capacitaOsservate(CATALOGO.modelli[0]), ['tools', 'reasoning'], 'temperature e tool_choice NON sono parole del motore');
  assert.deepEqual(capacitaOsservate(CATALOGO.modelli[1]), ['tools', 'vision'], 'vision viene dalle modalità in ingresso');
  assert.deepEqual(capacitaOsservate(CATALOGO.modelli[4]), ['json', 'audio'], 'json da response_format, audio dalle modalità');
  assert.deepEqual(capacitaOsservate(CATALOGO.modelli[3]), []);
});

test('⛔ ogni valore che la barra offre SURVIVE alla validazione e filtra davvero', () => {
  const capacita = capacitaDelCatalogo(MODELLI);
  assert.ok(capacita.parametri.length, 'il catalogo di prova ha parametri da offrire');
  for (const valore of capacita.parametri) {
    const spinto = toggleCatalogFacet(emptyCatalogFilters(), 'capabilities', valore);
    assert.deepEqual(spinto.capabilities, [valore], `«${valore}» è sfuggito a validateCatalogFilters: la spunta non filtrerebbe niente`);
    assert.equal(activeCatalogFilters(spinto).length, 1, `«${valore}» non produce un chip: si vedrebbe acceso senza filtro`);
    assert.ok(selectCatalog(MODELLI, spinto).length < idBase().length, `«${valore}» non toglie nessun modello`);
  }
});

test('capacitaDelCatalogo: le faccette si offrono solo dove il dato esiste', () => {
  const tutte = capacitaDelCatalogo(MODELLI);
  assert.equal(tutte.haContesto, true);
  assert.equal(tutte.haPrezzo, true);
  assert.equal(tutte.haBuchi, true, 'beta/uno e beta/due non dichiarano qualcosa');
  assert.deepEqual(tutte.ordinamenti.map(([id]) => id), ['catalog', 'name', 'context-desc', 'price-asc']);
  const senzaDati = capacitaDelCatalogo(MODELLI.map((m) => ({ ...m, context: null, priceInput: null, priceOutput: null })));
  assert.equal(senzaDati.haContesto, false);
  assert.equal(senzaDati.haPrezzo, false);
  assert.equal(senzaDati.haBuchi, true);
  assert.deepEqual(senzaDati.ordinamenti.map(([id]) => id), ['catalog', 'name'], 'senza il dato l’ordinamento non si offre');
});

test('⛔ conteggiPerFornitore e facetCount danno lo STESSO numero, con le altre faccette accese', () => {
  const varianti = [
    emptyCatalogFilters(),
    { ...emptyCatalogFilters(), capabilities: ['tools'] },
    { ...emptyCatalogFilters(), minContext: '50000' },
    { ...emptyCatalogFilters(), maxInput: '1', includeUnknown: true },
    { ...emptyCatalogFilters(), destination: ['cloud'], capabilities: ['reasoning'] },
  ];
  const fornitori = [...new Set(MODELLI.map((m) => m.provider))];
  let confronti = 0;
  for (const filtri of varianti) {
    const conteggi = conteggiPerFornitore(MODELLI, filtri);
    for (const f of fornitori) {
      assert.equal(conteggi.get(f) ?? 0, facetCount(MODELLI, filtri, 'providers', f), `fornitore ${f} con filtri ${JSON.stringify(filtri)}`);
      confronti += 1;
    }
    assert.equal([...conteggi.values()].reduce((a, b) => a + b, 0), selectCatalog(MODELLI, { ...filtri, providers: [] }).length, 'la somma dei fornitori è il totale senza il filtro dei fornitori');
  }
  assert.equal(confronti, 15, 'cinque varianti × tre fornitori: se il confronto salta, il test non ha misurato niente');
});

test('il conteggio di un fornitore non conta il filtro di sé stesso', () => {
  const filtri = { ...emptyCatalogFilters(), providers: ['alpha'] };
  assert.equal(conteggiPerFornitore(MODELLI, filtri).get('beta'), 2, 'beta resta contato anche col fornitore alpha acceso');
  assert.equal(facetCount(MODELLI, filtri, 'providers', 'beta'), 2);
});

test('la ricerca resta quella di sempre, e il motore NON la sostituisce', () => {
  assert.deepEqual(filtraModelli(CATALOGO.modelli, 'gamma/due', 'all').map((m) => m.id), ['gamma/due'], 'si cerca anche per id');
  assert.equal(filtraModelli(CATALOGO.modelli, '', 'beta').length, 2);
  const adattato = modelloCatalogo(CATALOGO.modelli[5]);
  assert.equal(selectCatalog([adattato], { ...emptyCatalogFilters(), providers: ['gamma'] }).length, 1);
  assert.equal(selectCatalog([adattato], { ...emptyCatalogFilters(), providers: ['beta'] }).length, 0);
});

test('normalizzaCatalogoModelli rifiuta una risposta storta (com’era prima)', () => {
  assert.throws(() => normalizzaCatalogoModelli({ ...CATALOGO, daCache: 'no' }));
  assert.throws(() => normalizzaCatalogoModelli({ ...CATALOGO, modelli: null }));
  assert.equal(normalizzaCatalogoModelli(CATALOGO).modelli.length, 6);
});

test('le soglie di contesto del prototipo sono sei, in ordine, e filtrano', () => {
  const soglie = [8192, 16384, 32768, 65536, 131072, 262144];
  const conteggi = soglie.map((s) => facetCount(MODELLI, emptyCatalogFilters(), 'minContext', String(s)));
  // I contesti del catalogo di prova sono 8192 · 200000 · 131072 · 0 (non dichiarato) · 65536 · 40000:
  // ⇒ 5 a 8192 (8192 compreso), 4 a 16384, 4 a 32768, 3 a 65536, 2 a 131072, **0** a 262144.
  // ⛔ Il contesto non dichiarato (0) non entra MAI: è «non noto», non «piccolo».
  assert.deepEqual(conteggi, [5, 4, 4, 3, 2, 0]);
  const validate = validateCatalogFilters({ ...emptyCatalogFilters(), minContext: '131072' });
  assert.equal(selectCatalog(MODELLI, validate).length, 2, '200000 e 131072, che è il confine compreso');
});
