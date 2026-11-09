/*
 * Reperti del Tester del 02/11/2026. D22: a 390 px il pulsante d'invio finiva a 413 px, compositore largo 196 px, schede sotto le azioni.
 * FE-001: a barra chiusa l'etichetta di Home è nascosta e il pulsante restava senza nome per chi usa un lettore di schermo.
 * La prova vera di D22 è nel browser (`finestra-stretta-390.spec.mjs`); qui si tiene fermo ciò che il foglio di stile promette.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../src/styles/mockup-sidebar.css', import.meta.url), 'utf8');
const pagina = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
const blocco = css.slice(css.indexOf('@media (max-width: 520px)'));

test('D22 sotto i 520 px il piede tiene solo il posto del tondo, e il compositore prende il resto', () => {
  assert.match(blocco, /:root \.talos-chat-foot \{ padding-left: 72px; padding-right: 12px; \}/);
  assert.match(blocco, /#composerForm:not\(#pannelloTerminale\) \{ width: 100%; max-width: none; margin-left: 0; margin-right: 0; \}/);
});

test('D22 le schede scorrono nella loro colonna, le azioni restano a destra', () => {
  assert.match(blocco, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(blocco, /\.talos-tabs \{ grid-column: 1;[^}]*overflow-x: auto/);
  assert.match(blocco, /\.talos-topbar__actions \{ grid-column: 2; \}/);
});

test('D22 nel compositore stretto la fila va a capo', () => {
  assert.match(blocco, /@container \(max-width: 320px\) \{\s*\.talos-composer__bar \{ flex-wrap: wrap;/);
});

test('FE-001 Home ha un nome anche a barra chiusa, nelle due lingue', () => {
  const home = pagina.match(/<button[^>]*workspace-home-link[^>]*>/)?.[0] ?? '';
  assert.match(home, /aria-label="Home"/);
  assert.match(home, /title="Home"/);
  assert.match(home, /data-t-attr="\[aria-label\]modello\.sidebar\.home;\[title\]modello\.sidebar\.home"/);
});

test('FE-001 sotto gli 860 px «All sessions» sta a destra, lontano dal tondo', () => {
  assert.match(css, /@media \(max-width: 860px\) \{\s*\.workspace-recent__tutte \{ display: flex; width: fit-content; margin-left: auto; \}/);
  const home = readFileSync(new URL('../../src/features/navigation/workspace-chrome.ts', import.meta.url), 'utf8');
  assert.match(home, /'home\.allSessions'.*workspace-recent__tutte/);
});
