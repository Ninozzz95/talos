import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

/*
 * ⭐⭐⭐ 02/9 — formattatore dei blocchi di codice (owner: "crea un
 * formattatore di blocco codice, ricerca web dei migliori"). Questi test
 * sono HERMETICI apposta: leggono i sorgenti e il file vendorizzato, non
 * passano dal server 4174 — la suite browser condivide lo stato con
 * l'istanza in uso e il suo esito non è ripetibile (vedi
 * LEDGER-STREAMING-SCROLL-TERMINALE-2026-09-02.md, sezione «la suite
 * browser NON è un cancello»).
 */

test('CODE-BLOCK-VENDOR-01 — Prism è vendorizzato, servito dalla allowlist e caricato PRIMA di app.js', async () => {
  const prism = await source('public/vendor/prism/prism.js');
  // ⛔ `manual` PRIMA del core: senza, Prism evidenzia da solo tutto il
  // documento al DOMContentLoaded e i blocchi in streaming gli sfuggono.
  assert.ok(prism.indexOf('window.Prism.manual = true') < prism.indexOf('/* ---- prism-core ---- */'));
  for (const lingua of ['core', 'clike', 'javascript', 'typescript', 'python', 'bash', 'json', 'sql', 'rust', 'go', 'markup', 'markdown']) {
    assert.ok(prism.includes(`/* ---- prism-${lingua} ---- */`), `manca il linguaggio ${lingua}`);
  }
  // ⛔ L'ordine di dipendenza non è un dettaglio: `javascript` prima di
  // `clike` lascerebbe la grammatica a metà, in silenzio.
  assert.ok(prism.indexOf('prism-clike') < prism.indexOf('prism-javascript'));
  assert.ok(prism.indexOf('prism-javascript') < prism.indexOf('prism-typescript'));
  assert.ok(prism.indexOf('prism-c ') < prism.indexOf('prism-cpp') || prism.indexOf('---- prism-c ----') < prism.indexOf('---- prism-cpp ----'));

  const statici = await source('src/static-files.mjs');
  assert.match(statici, /'\/vendor\/prism\/prism\.js':\s*\{\s*file:\s*'vendor\/prism\/prism\.js'/);

  const html = await source('public/index.html');
  assert.ok(html.indexOf('vendor/prism/prism.js') < html.indexOf('src="app.js"'), 'Prism deve essere caricato prima di app.js');
});

test('CODE-BLOCK-FENCE-02 — il linguaggio dichiarato dal fence viene LETTO, non più scartato', async () => {
  const app = await source('public/app.js');
  assert.match(app, /const linguaggioDichiarato = riga\.trim\(\)\.slice\(3\)/);
  assert.match(app, /costruisciBloccoCodice\(righeCodice\.join\('\\n'\), linguaggioDichiarato, chiuso\)/);
});

test('CODE-BLOCK-STREAMING-03 — un fence ANCORA APERTO non si evidenzia e non si copia', async () => {
  /*
   * ⛔ Ricerca 02/9 (streamdown.ai/docs/code-blocks): "defer code block
   * rendering until the closing fence arrives... copy disabled during
   * streaming" — si copierebbe codice a metà, e rievidenziare a ogni frame
   * un testo che cambia costa e sfarfalla.
   */
  const app = await source('public/app.js');
  assert.match(app, /const chiuso = i < righe\.length/);
  assert.match(app, /copia\.disabled = !chiuso/);
  assert.match(app, /const grammatica = chiuso && chiave && window\.Prism\?\.languages\?\.\[chiave\]/);
});

test('CODE-BLOCK-ONESTA-04 — nessun linguaggio inventato, e una grammatica che lancia non mangia il codice', async () => {
  const app = await source('public/app.js');
  // il testo resta sempre, anche se Prism fallisce
  assert.match(app, /catch \{\s*code\.textContent = testoCodice;/s);
  // niente auto-detect: si usa SOLO ciò che il fence dichiara
  assert.doesNotMatch(app, /Prism\.highlightAll|autoloader|highlightAllUnder/);
});

test('CODE-BLOCK-CORNICE-05 — la dissolvenza per parola non tocca l’intestazione del blocco', async () => {
  /*
   * ⛔ 02/9 — trovato ispezionando l'HTML prodotto: la dissolvenza aveva
   * avvolto l'etichetta del linguaggio e il testo del pulsante Copia in
   * `<span class="stream-word">`, come se il modello li stesse scrivendo.
   * Sono cornice dell'interfaccia, non output.
   */
  const app = await source('public/app.js');
  assert.match(app, /genitore\.closest\('pre, code, \.code-block-head'\)/);
});

test('CODE-BLOCK-TEMA-06 — i colori escono dai token TALOS, mai da un tema Prism importato', async () => {
  const css = await source('public/styles.css');
  assert.match(css, /\.code-block-head\s*\{/);
  assert.match(css, /\.code-block-copy:disabled\s*\{/);
  assert.match(css, /\.token\.keyword[^}]*var\(--accent-2\)/s);
  assert.match(css, /\.token\.comment[^}]*var\(--muted-2\)/s);
  // ⛔ AL CONTRARIO: nessun colore letterale rubato al tema di default di Prism
  assert.doesNotMatch(css, /\.token\.[a-z-]+[^}]*#(?:07a|905|690|9a6e3a|dd4a68)/s);
});
