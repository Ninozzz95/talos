/*
 * Il cancello comune sulle impronte del nucleo (richiesta 161, decisione 402): fallisce se un file del nucleo condiviso differisce fra PC,
 * CLI e telefono. Rosso con tre copie finte (un file diverso di UN byte, uno che manca, uno in più); verde con tre copie uguali e con la
 * stessa testa tre volte; le eccezioni valgono solo col loro motivo e la loro fonte.
 * Concorrenti: hermes-agent scripts/bundles/native_prepared.py:42-62 (`_source_digest`: uno sha256 per file dell'albero sorgente, tolto solo ciò che si genera); la CLI di TALOS
 *   fissa già il suo nucleo con uno sha256 per file (`cli/scripts/pack-vendor.mjs`, manifesto del vendor).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confronta, leggiEccezioni, leggiElenco, nelNucleo } from '../scripts/cancello/impronte-nucleo.mjs';
import { PERCORSI_R4 } from '../../mobile/scripts/kernel-r4/copia-r4.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const CANCELLO = join(QUI, '..', 'scripts', 'cancello', 'impronte-nucleo.mjs');
const ELENCO = join(QUI, '..', 'scripts', 'cancello', 'nucleo-condiviso.json');
const ECCEZIONI = join(QUI, '..', 'scripts', 'cancello', 'nucleo-eccezioni.json');
const cancello = (...a) => spawnSync(process.execPath, [CANCELLO, ...a], { encoding: 'utf8' });

const BASE = {
  'harness-ui/server.mjs': 'export const server = 1;\n',
  'harness-ui/package.json': '{"name":"x"}\n',
  'harness-ui/src/a.mjs': 'export const a = 1;\n',
  'harness-ui/src/kernel/b.mjs': 'export const b = 2;\n',
  'harness-ui/src/c.mjs': 'export const c = 3;\n',
  'harness-ui/src/a.test.mjs': 'una prova non è nucleo\n',
  'harness-ui/src/node_modules/z.js': 'nemmeno le dipendenze\n',
  'harness-ui/tests/t.test.mjs': 'fuori\n',
  'context-engine/src/x.mjs': 'export const x = 4;\n',
  'context-engine/package.json': '{"name":"ce"}\n',
};

function tre(t, cambia = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-impronte-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const fuori = {};
  for (const p of ['pc', 'cli', 'telefono']) {
    const file = { ...BASE, ...(cambia[p] ?? {}) };
    fuori[p] = join(radice, p);
    for (const [f, testo] of Object.entries(file)) {
      if (testo === null) continue;
      mkdirSync(dirname(join(fuori[p], f)), { recursive: true });
      writeFileSync(join(fuori[p], f), testo);
    }
  }
  return { radice, ...fuori };
}
const corre = (c, ...extra) => cancello('--pc', c.pc, '--cli', c.cli, '--telefono', c.telefono, ...extra);

test('IMPRONTE-01 verde: tre copie uguali ⇒ esce 0; le prove e node_modules non sono nucleo', (t) => {
  const c = tre(t, { cli: { 'harness-ui/src/a.test.mjs': 'diversa ma è una prova\n', 'harness-ui/tests/t.test.mjs': 'idem\n' } });
  const r = corre(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /nucleo: 7 file .*6 uguali nei tre · 1 uguali dove si confrontano .*0 diversi · 0 assenti/u);
});

test('IMPRONTE-02 ROSSO: un byte diverso, un file che manca, uno in più ⇒ esce 1 e li nomina tutti e tre', (t) => {
  const c = tre(t, {
    cli: { 'harness-ui/src/kernel/b.mjs': 'export const b = 3;\n' },
    telefono: { 'harness-ui/src/c.mjs': null, 'context-engine/src/in-piu.mjs': 'solo qui\n' },
  });
  const r = corre(c);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /^DIVERSO {2}harness-ui\/src\/kernel\/b\.mjs {2}pc (\w{12}) {2}cli (?!\1)\w{12} {2}telefono \1/mu);
  assert.match(r.stderr, /^ASSENTE {2}harness-ui\/src\/c\.mjs {2}manca in: telefono /mu);
  assert.match(r.stderr, /^ASSENTE {2}context-engine\/src\/in-piu\.mjs {2}manca in: pc, cli /mu);
  assert.match(r.stderr, /1 diversi · 2 assenti/u);
});

test('IMPRONTE-03 al contrario: lo stesso byte cambiato in una prova o fuori dall elenco NON ferma niente', (t) => {
  const c = tre(t, { telefono: { 'harness-ui/src/a.test.mjs': 'x\n', 'harness-ui/tests/t.test.mjs': 'y\n', 'harness-ui/README.md': 'z\n' } });
  assert.equal(corre(c).status, 0);
});

test('IMPRONTE-04 un eccezione motivata scusa SOLO quel file in quel prodotto; senza motivo o fonte il cancello si ferma (2)', (t) => {
  const c = tre(t, { telefono: { 'harness-ui/src/c.mjs': null }, cli: { 'harness-ui/server.mjs': 'export const server = 2;\n' } });
  const ecc = join(c.radice, 'eccezioni.json');
  writeFileSync(ecc, JSON.stringify({ schema: 'talos.nucleo-eccezioni.v1', eccezioni: [{ file: 'harness-ui/src/c.mjs', prodotto: 'telefono', motivo: 'prova', fonte: 'qui:1' }] }));
  const r = corre(c, '--eccezioni', ecc);
  assert.equal(r.status, 1, 'server.mjs della CLI non è scusato da questa lista');
  assert.doesNotMatch(r.stderr, /c\.mjs/u);
  assert.match(r.stderr, /^DIVERSO {2}harness-ui\/server\.mjs/mu);
  assert.equal(corre(c).status, 1, 'con le eccezioni vere server.mjs della CLI è scusato, ma c.mjs del telefono no');
  const altrove = tre(t, { telefono: { 'harness-ui/src/c.mjs': null }, cli: { 'harness-ui/src/c.mjs': 'export const c = 4;\n' } });
  const d = corre(altrove, '--eccezioni', ecc);
  assert.equal(d.status, 1, 'l eccezione del telefono non scusa la CLI');
  assert.match(d.stderr, /^DIVERSO {2}harness-ui\/src\/c\.mjs {2}pc \w{12} {2}cli \w{12} {2}telefono eccezione/mu);
  writeFileSync(ecc, JSON.stringify({ schema: 'talos.nucleo-eccezioni.v1', eccezioni: [{ file: 'harness-ui/src/c.mjs', prodotto: 'telefono', motivo: '', fonte: 'qui:1' }] }));
  const senza = corre(c, '--eccezioni', ecc);
  assert.equal(senza.status, 2);
  assert.match(senza.stderr, /manca «motivo»/u);
});

test('IMPRONTE-05 la stessa testa del deposito tre volte (git, sola lettura degli oggetti) ⇒ 0 diversi, e più di 400 file', () => {
  const r = cancello('--pc', 'git:HEAD', '--cli', 'git:HEAD', '--telefono', 'git:HEAD');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = /nucleo: (\d+) file/u.exec(r.stdout);
  assert.ok(m && Number(m[1]) > 400, r.stdout);
  assert.match(r.stdout, /0 diversi · 0 assenti/u);
});

test('IMPRONTE-06 una copia vuota o un rif che non c è non passano per «tutto uguale» (2)', (t) => {
  const c = tre(t);
  const vuota = join(c.radice, 'vuota');
  mkdirSync(vuota);
  assert.equal(cancello('--pc', c.pc, '--cli', c.cli, '--telefono', vuota).status, 2);
  assert.equal(cancello('--pc', 'git:HEAD', '--cli', 'git:HEAD', '--telefono', 'git:rif-che-non-esiste-024').status, 2);
  assert.equal(cancello('--pc', c.pc).status, 2, 'servono tutte e tre');
});

test('IMPRONTE-07 una fonte sola: l elenco copre ciò che il telefono copia del nucleo (copia-r4.mjs), tolte le prove', () => {
  const elenco = leggiElenco(readFileSync(ELENCO, 'utf8'));
  for (const p of PERCORSI_R4.filter((x) => /^(harness-ui|context-engine)\//u.test(x) && x !== 'harness-ui/tests')) {
    assert.ok(elenco.cartelle.includes(p) || elenco.file.includes(p), `${p} del telefono manca dall elenco`);
  }
  assert.equal(nelNucleo('harness-ui/src/kernel/talosHarness.mjs', elenco), true);
  assert.equal(nelNucleo('harness-ui/src/kernel/talosHarness.test.mjs', elenco), false);
  assert.equal(nelNucleo('harness-ui/src/x/node_modules/y.js', elenco), false);
  assert.equal(nelNucleo('harness-ui/frontend/src/app.js', elenco), false);
  const ecc = leggiEccezioni(readFileSync(ECCEZIONI, 'utf8'));
  for (const file of [...ecc.values()].flatMap((s) => [...s])) assert.ok(elenco.file.includes(file) || elenco.cartelle.some((c) => file.startsWith(`${c}/`)), `eccezione su un file fuori dall elenco: ${file}`);
});

test('IMPRONTE-08 confronta, puro: diverso fra due che ci sono anche quando il terzo manca', () => {
  const m = (o) => new Map(Object.entries(o));
  const r = confronta({ pc: m({ f: 'a' }), cli: m({ f: 'b' }), telefono: m({}) }, new Map([['pc', new Set()], ['cli', new Set()], ['telefono', new Set()]]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.diversi.map((d) => d.file), ['f']);
  assert.deepEqual(r.assenti.map((d) => d.mancaIn), [['telefono']]);
});
