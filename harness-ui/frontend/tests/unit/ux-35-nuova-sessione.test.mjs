/*
 * Revisione UX della candidata, 04/11/2026 (agente Z), riga 35 — finestra «Nuova sessione»:
 * «Planner opzionale» e «Accesso al workspace» erano parole inglesi nell'interfaccia italiana (la riga 27 sceglie «spazio di lavoro»),
 * e «Seleziona modello» / «Nessuno» nei due menu erano scritti col carattere da codice (`.model-picker-trigger-label` in `--font-mono`).
 * Hermes (`apps/desktop/src/app/chat/composer/model-pill.tsx:147`) scrive il nome del modello nel carattere normale (`truncate`, niente mono).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import TESTI from '../../src/i18n/testi/app.js';

const css = readFileSync(fileURLToPath(new URL('../../src/styles/foglio-monolite.css', import.meta.url)), 'utf8');

function testo(lingua, chiave) {
  const d = TESTI[lingua] ?? TESTI.it;
  return d[chiave];
}

test('UX-35-01 le etichette della finestra sono in italiano', () => {
  assert.equal(testo('it', 'workspace.plannerLabel'), 'Pianificatore opzionale');
  assert.equal(testo('it', 'workspace.accessLabel'), 'Accesso allo spazio di lavoro');
  assert.equal(testo('en', 'workspace.plannerLabel'), 'Optional planner');
  assert.equal(testo('en', 'workspace.accessLabel'), 'Workspace access');
});

test('UX-35-02 il testo dei menu di modello e pianificatore usa il carattere normale', () => {
  const regola = css.match(/\.model-picker-trigger-label\s*\{([^}]*)\}/u);
  assert.ok(regola, 'regola .model-picker-trigger-label presente');
  assert.doesNotMatch(regola[1], /font-mono/u, 'il menu era nel carattere da codice');
  assert.match(regola[1], /font:[^;]*var\(--font-ui\)/u, 'il carattere normale si dichiara: senza, il bottone ripassa il suo carattere da codice (mutante M13)');
});
