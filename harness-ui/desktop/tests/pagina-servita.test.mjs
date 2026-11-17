import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { controllaPaginaServita, PERCORSO_TERMINALI, root } from './support.mjs';

/*
 * 11/11/2026 (judge v1381 B9). The third screen run of the Desktop (10/11) fell at `guscio.spec.mjs` «La shell non ha disegnato
 * il primo prompt» after 15000 ms: the copy made with `git archive` served the TRACKED `harness-ui/public/app.js`, frozen at
 * c51a9ac08 (14/10), which invents the id of the terminal without a session (`public/app.js:85016`, `crypto.randomUUID()`), while
 * the server since 16/10 only accepts ids it created (`src/terminal-registry.mjs:228-242`, 403 at `src/terminal-ws.mjs:110-113`).
 * The page source asks the server first (`frontend/src/legacy/app.js:18911`, `:18915`). The guard in `support.mjs` reads the
 * scripts the window REALLY received and stops the test at once, with what to do. These are its pure tests; the run with
 * Electron is the Desktop's. No duplicate of the route tests (`tests/http-routes-terminals.test.mjs:193-194`,
 * `tests/terminale-senza-sessione-desktop.test.mjs`): here only the guard of the shell test is proved.
 */
const PAGINA_VECCHIA = [
  { src: 'http://127.0.0.1:1/avvio.js', testo: 'var tema = "forge";' },
  { src: 'http://127.0.0.1:1/vendor/xterm/xterm.js', testo: 'class Terminal {}' },
  // The 14/10 shape: the id is invented here and the socket opened straight away (`public/app.js:85016` and its ws line).
  { src: 'http://127.0.0.1:1/app.js', testo: 't2.standaloneId = window.crypto?.randomUUID?.(); new WebSocket(`${p}://${h}/api/v1/terminal/ws?id=${encodeURIComponent(id)}`);' },
];

test('PAGE-BUILT — a page without the terminals route stops the shell test at once and says to build the frontend first', () => {
  assert.throws(() => controllaPaginaServita(PAGINA_VECCHIA), err => {
    assert.match(err.message, /build the frontend first/);
    assert.match(err.message, /npm --prefix harness-ui\/frontend run build/, 'it says what to run');
    assert.match(err.message, /harness-ui\/public/, 'it says where the build goes');
    return true;
  });
  // Nothing received, or nothing readable, is not a built page either.
  assert.throws(() => controllaPaginaServita([]), /build the frontend first/);
  assert.throws(() => controllaPaginaServita(undefined), /build the frontend first/);
  assert.throws(() => controllaPaginaServita([{ src: 'x', testo: null }]), /build the frontend first/);
});

test('PAGE-BUILT — the page source of today passes the guard, among the other scripts of the window', () => {
  // The guard looks for a route the page source really calls: if the source stops calling it, this test says so first.
  const sorgente = readFileSync(join(root, '..', 'frontend', 'src', 'legacy', 'app.js'), 'utf8');
  assert.ok(sorgente.includes("apiPost('" + PERCORSO_TERMINALI + "'"), 'the page source creates the terminal on the server');
  const costruita = [...PAGINA_VECCHIA.slice(0, 2), { src: 'http://127.0.0.1:1/app.js', testo: sorgente }];
  assert.doesNotThrow(() => controllaPaginaServita(costruita));
});

test('PAGE-BUILT — the shell test runs the guard on the served page before it opens the Terminal', () => {
  const spec = readFileSync(join(root, 'tests', 'guscio.spec.mjs'), 'utf8');
  const guardia = spec.indexOf('controllaPaginaServita(await pagina.evaluate(');
  assert.ok(guardia > 0, 'guscio.spec.mjs must call the guard on what the window received');
  assert.ok(guardia < spec.indexOf('osservaTerminali('), 'the guard must come before the Terminal is opened');
  assert.ok(guardia < spec.indexOf('La shell non ha disegnato il primo prompt'), 'the guard must come before the 15000 ms wait');
});
