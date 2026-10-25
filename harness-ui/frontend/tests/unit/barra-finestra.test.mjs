import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHIAVE_MENU, INDIRIZZO_MENU, coloreEsadecimale, htmlDelPulsanteMenu, montaBarraFinestra } from '../../src/components/barra-finestra.js';
import { attributiDaTradurre, impostaLingua, linguaCorrenteDiT } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';

/*
 * F7-1 (owner 27/09/2026) — la barra del titolo propria esiste SOLO nella finestra dell'app (Window Controls Overlay).
 * La prova con Electron vero sta in `desktop/tests/barra-finestra.spec.mjs`; qui il verso del BROWSER: senza l'overlay non
 * nasce niente, e il DOM del 4174 resta quello di prima.
 */
const QUI = dirname(fileURLToPath(import.meta.url));

test('F7-BARRA-WEB-01 — nel browser (niente Window Controls Overlay) la striscia non nasce e il DOM non si tocca', () => {
  const toccato = [];
  const documento = new Proxy({}, { get: (_o, chiave) => { toccato.push(String(chiave)); return () => null; } });
  for (const navigatore of [{}, { windowControlsOverlay: { visible: false } }, { windowControlsOverlay: undefined }]) {
    assert.equal(montaBarraFinestra({ documento, finestra: { navigator: navigatore } }), null);
  }
  assert.deepEqual(toccato, [], 'nessuna lettura del DOM, nessuna scrittura');
});

test('F7-BARRA-WEB-02 — il colore di getComputedStyle diventa #rrggbb; un fondo trasparente o velato no', () => {
  assert.equal(coloreEsadecimale('rgb(30, 31, 34)'), '#1e1f22');
  assert.equal(coloreEsadecimale('rgba(245, 243, 238, 1)'), '#f5f3ee');
  for (const no of ['rgba(0, 0, 0, 0)', 'rgba(1, 2, 3, 0.5)', 'color(srgb 0.9 0.9 0.9)', '', null, 'rgb(256, 0, 0)']) assert.equal(coloreEsadecimale(no), null, String(no));
  assert.equal(INDIRIZZO_MENU, 'talos-desktop://menu', 'lo stesso indirizzo che `desktop/barra-finestra.mjs` riconosce');
});

test('F7-BARRA-WEB-03 — la striscia è importata e montata: foglio in main.css, montaggio in main.js prima del monolite', () => {
  const main = readFileSync(join(QUI, '../../src/main.js'), 'utf8');
  assert.ok(main.indexOf('montaBarraFinestra();') > -1 && main.indexOf('montaBarraFinestra();') < main.indexOf("await import('./legacy/app.js')"));
  assert.match(readFileSync(join(QUI, '../../src/styles/main.css'), 'utf8'), /@import '\.\/barra-finestra\.css';/u);
  assert.doesNotMatch(readFileSync(join(QUI, '../../src/legacy/app.js'), 'utf8'), /querySelector\('meta\[name="theme-color"\]'\)/u,
    'il monolite non scrive più il theme-color: uno scrittore solo');
});

/* 23/10/2026 (il sito, sulla 0.1.36 pubblica): «Menu di TALOS» era scritto nel componente, italiano anche in inglese. */
test('F7-BARRA-LINGUA-01 — etichetta e suggerimento del menu vengono dal dizionario e seguono la lingua', () => {
  const prima = linguaCorrenteDiT();
  impostaLingua('en');
  try {
    const en = htmlDelPulsanteMenu();
    assert.match(en, /aria-label="TALOS menu" title="TALOS menu"/u);
    impostaLingua('it');
    assert.match(htmlDelPulsanteMenu(), /aria-label="Menu di TALOS" title="Menu di TALOS"/u);
    /* `applicaLingua` la riscrive al cambio di lingua: la striscia nasce prima che la lingua scelta sia applicata. */
    const attr = /data-t-attr="([^"]+)"/u.exec(en)?.[1];
    assert.deepEqual(attributiDaTradurre(attr), [['aria-label', CHIAVE_MENU], ['title', CHIAVE_MENU]]);
    assert.equal(TESTI.en[CHIAVE_MENU], 'TALOS menu');
    assert.equal(TESTI.it[CHIAVE_MENU], 'Menu di TALOS');
  } finally {
    impostaLingua(prima);
  }
  assert.doesNotMatch(readFileSync(join(QUI, '../../src/components/barra-finestra.js'), 'utf8'), /(?:aria-label|title)="[^"$]/u,
    'niente etichetta scritta nel componente: solo dal dizionario');
});
