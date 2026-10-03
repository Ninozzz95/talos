/*
 * 03/10/2026, corsia S2 della lingua: le etichette del motore del catalogo (`domain/catalog-engine.ts`) sono getter sul
 *   dizionario (`modelli.catalog.*`), inglese prima. Sono la RISERVA del Laboratorio (il componente traduce le sue faccette), e una
 *   riserva in italiano era una parola senza inglese. AL CONTRARIO: in italiano sono le frasi di prima; i valori restano dati.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG_SORTS, FACET_OPTIONS, SIZE_BANDS, activeCatalogFilters, catalogInputErrors, emptyCatalogFilters } from '../../src/domain/catalog-engine.ts';
import { impostaLingua } from '../../src/components/lingua.js';

const filtri = () => ({ ...emptyCatalogFilters(), favorite: true, destination: ['local'], sizes: ['tiny'], includeUnknown: true });

test('LINGUA-CATALOGO-EN: etichette, chip, ordinamenti ed errori seguono la lingua', () => {
  assert.deepEqual(activeCatalogFilters(filtri()).map((c) => c.label), ['Destinazione: Locali', 'Solo preferiti', 'Parametri: Fino a 3B', 'Dati numerici non noti inclusi']);
  assert.equal(CATALOG_SORTS.find(([v]) => v === 'params-asc')[1], 'Parametri: meno → più');
  impostaLingua('en');
  try {
    assert.deepEqual(activeCatalogFilters(filtri()).map((c) => c.label), ['Destination: Local', 'Favorites only', 'Parameters: Up to 3B', 'Unknown numeric data included']);
    assert.equal(CATALOG_SORTS.find(([v]) => v === 'params-asc')[1], 'Parameters: fewer → more');
    assert.equal(SIZE_BANDS.find((b) => b.id === 'unknown').label, 'Parameters not known');
    assert.deepEqual(FACET_OPTIONS.fit.map(([, nome]) => nome), ['Within 18.6 GiB · estimate', 'Over the demo budget', 'RAM not estimated']);
    assert.deepEqual(catalogInputErrors({ ...emptyCatalogFilters(), minParams: '9', maxParams: '3' }), ['The minimum of parameters is above the maximum.']);
  } finally { impostaLingua('it'); }
  assert.deepEqual(FACET_OPTIONS.status.map(([valore]) => valore), ['installed', 'not-installed', 'downloading'], 'i valori restano dati');
});
