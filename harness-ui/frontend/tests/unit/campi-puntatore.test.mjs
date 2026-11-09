/*
 * FE-056 (owner 01/11/2026, «A · Bordo più forte»): una regola sola per tutti i campi di TALOS. Sotto il puntatore il bordo passa al colore forte, come il
 * pulsante secondario; fuoco e spento restano quelli di oggi, il non valido tiene il rosso. La regola c'era solo su `.talos-field__input`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leggi = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const regola = () => /:is\(([^)]*)\):hover:not\(:disabled\):not\(\[aria-invalid="true"\]\)\s*\{\s*border-color:\s*var\(--talos-border-strong\)/u.exec(leggi('design-system/controls.css'));

test('CAMPI-01 una regola sola in controls.css, con le esclusioni del bozzetto', () => {
  assert.ok(regola(), 'la regola non c\'è');
  assert.doesNotMatch(leggi('design-system/controls.css'), /\.talos-field__input:hover:not/u, 'niente seconda regola per un campo solo');
});

test('CAMPI-02 ogni tipo di campo del prodotto è dentro', () => {
  const dentro = regola()[1];
  for (const s of ['.talos-field__input', '.talos-textarea', '.talos-input', 'select', '.talos-select', '.search-field input', '.provider-field input', '.lato-campo input', '.talos-agenti-filtri input']) {
    assert.ok(dentro.includes(s), s);
  }
});

test('CAMPI-03 i blocchi non hanno più una copia della regola', () => {
  assert.doesNotMatch(leggi('styles/blocchi.css'), /__input:hover/u);
});
