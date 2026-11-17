/*
 * Il cricchetto delle taglie «dalla base»: le prove del misuratore e dell'abbinamento, senza git (testo dentro, misura fuori).
 * Ogni forma che carica codice ha la sua riga; ogni passo dell'abbinamento di Hermes (`compare.py:7-16`) ha il suo caso.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const { REGOLE } = await import(new URL('./aiuto/taglie-base/regole.mjs', import.meta.url).href);
const { alfanumerici, analizza, cambiFra, contaRighe, corpoDi, estensione, èContato, èDelCancello, èFuoriNonDichiarato, pesoDiCodice } = await import(new URL('./aiuto/taglie-base/misura.mjs', import.meta.url).href);
const { abbinaFile, abbinaFunzioni, archiDi, nomeBase, somiglianza } = await import(new URL('./aiuto/taglie-base/confronta.mjs', import.meta.url).href);
const ts = createRequire(import.meta.url)('typescript');
const misura = (righe, nome = 'harness-ui/src/x.mjs') => analizza(ts, Array.isArray(righe) ? `${righe.join('\n')}\n` : righe, nome, REGOLE);
const tipi = (m) => m.carichi.map((c) => c.tipo).sort();

describe('cricchetto delle taglie dalla base: il misuratore', () => {
  test('TAGLIE-MIS-01 le righe si contano con gli a capo di TypeScript; l\'a capo finale non apre una riga', () => {
    assert.equal(contaRighe(''), 0);
    assert.equal(contaRighe('a'), 1);
    assert.equal(contaRighe('a\n'), 1);
    assert.equal(contaRighe('a\nb'), 2);
    assert.equal(contaRighe('a\r\nb\r\n'), 2);
    assert.equal(contaRighe('a\rb'), 2);
    assert.equal(contaRighe(`a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`), 3);
    assert.equal(alfanumerici('a_b-9 Z!'), 4);
    assert.equal(estensione('a/b/c.test.MJS'), '.mjs');
    assert.equal(estensione('a/.gitignore'), '');
    assert.equal(estensione('a/senza'), '');
  });

  test('TAGLIE-MIS-02 il censimento: che cosa è contato, che cosa è fuori e dichiarato, che cosa è del cancello', () => {
    const contati = ['harness-ui/server.mjs', 'harness-ui/src/a/b.mjs', 'harness-ui/scripts/x.mjs', 'harness-ui/frontend/src/c.tsx', 'harness-ui/desktop/main.cjs',
      'cli/src/comando.ts', 'mobile/src/Schermo.vue', 'mobile/src/lib/a.ts', 'context-engine/src/x.mjs'];
    for (const p of contati) assert.equal(èContato(p, REGOLE), true, p);
    const no = ['harness-ui/src/a.test.mjs', 'harness-ui/src/tipi.d.ts', 'harness-ui/src/kernel/dist/x.js', 'harness-ui/frontend/src/i18n/testi/it.js', 'harness-ui/src/node_modules/p/i.js',
      'harness-ui/desktop/tests/x.mjs', 'harness-ui/tests/x.mjs', 'harness-ui/src/dati.json', 'harness-ui/src/senza', 'mobile/tests/x.ts', 'mobile/vite.config.ts', 'cli/x.mjs', 'harness-ui/srcx/a.mjs'];
    for (const p of no) assert.equal(èContato(p, REGOLE), false, p);
    assert.equal(èFuoriNonDichiarato('prodotto-nuovo/a.mjs', REGOLE), true);
    assert.equal(èFuoriNonDichiarato('cli/x.mjs', REGOLE), true);
    assert.equal(èFuoriNonDichiarato('harness-ui/srcx/a.mjs', REGOLE), true);
    for (const p of ['harness-ui/tests/x.mjs', 'mobile/vite.config.ts', 'harness-ui/src/a.test.mjs', 'harness-ui/src/a.mjs', 'harness-ui/src/kernel/dist/x.js', 'harness-ui/public/app.js', 'README.md', 'core/x.php'])
      assert.equal(èFuoriNonDichiarato(p, REGOLE), false, p);
    assert.equal(èDelCancello('harness-ui/tests/aiuto/taglie-base/regole.mjs', REGOLE), true);
    assert.equal(èDelCancello('harness-ui/tests/taglie-base-cancello.test.mjs', REGOLE), true);
    assert.equal(èDelCancello('harness-ui/tests/altro.test.mjs', REGOLE), false);
    const prima = new Map([['a', { modo: '100644', sha: '1' }], ['b', { modo: '100644', sha: '2' }], ['c', { modo: '100644', sha: '3' }]]);
    const dopo = new Map([['a', { modo: '100644', sha: '1' }], ['b', { modo: '100755', sha: '2' }], ['d', { modo: '100644', sha: '4' }]]);
    assert.deepEqual([...cambiFra(prima, dopo).keys()].sort(), ['b', 'c', 'd']);
  });

  test('TAGLIE-MIS-03 le righe proprie di una funzione: una riga è della funzione più interna che la copre', () => {
    const m = misura(['// @ts-check', 'export function fuori() {', '  const dentro = () => {', '    return 1;', '  };', '  return dentro;', '}', 'class C { metodo() { return 2; } }', 'const o = { voce() {', '  return 3;', '} };']);
    const per = Object.fromEntries(m.funzioni.map((f) => [f.q, f.righe]));
    assert.deepEqual(per, { fuori: 3, 'fuori.dentro': 3, 'C.metodo': 1, 'o.voce': 3 });
    assert.equal(m.righe, 11);
    assert.equal(m.tipi, true);
    assert.equal(misura(['export const a = 1;']).tipi, false);
    assert.equal(misura(['export const a: number = 1;'], 'harness-ui/src/x.ts').tipi, true);
    assert.equal(misura(['// @ts-nocheck', 'export const a = 1;'], 'harness-ui/src/x.ts').tipi, false);
    const doppie = misura(['[1].map(() => 1);', '[2].map(() => 2);', 'function f() {}', 'function f() {}']);
    assert.deepEqual(doppie.funzioni.map((f) => f.q), ['<anonima>', '<anonima>#2', 'f', 'f#2']);
    assert.equal(nomeBase('a.f#2.<anonima>#13'), 'a.f.<anonima>');
  });

  test('TAGLIE-MIS-04 il corpo normalizzato: commenti e spazi non contano, stringhe ed espressioni regolari sì', () => {
    const a = misura(['function f() {', "  const u = 'http://x'; // commento", '  const r = /\\/\\/ non un commento/;', '  /* blocco', '     su due righe */ return [u, r];', '}']);
    const b = misura(['function f() {', "    const u   =   'http://x';", '', '  const r = /\\/\\/ non un commento/; /* altro */', '  return [u, r];', '}']);
    assert.equal(a.funzioni[0].impronta, b.funzioni[0].impronta);
    assert.equal(a.caratteri, b.caratteri, 'i caratteri sono quelli del codice');
    assert.deepEqual(corpoDi(a, a.funzioni[0]), ['functionf(){', "constu='http://x';", 'constr=/\\/\\/nonuncommento/;', 'return[u,r];', '}']);
    const c = misura(['function f() {', "  const u = 'http://y';", '  const r = /\\/\\/ non un commento/;', '  return [u, r];', '}']);
    assert.notEqual(a.funzioni[0].impronta, c.funzioni[0].impronta, 'una stringa diversa è un corpo diverso');
    const modello = misura(['const t = `a // non un commento ${1 /* questo sì */ + 2} b`;']);
    assert.deepEqual(modello.righeN, ['constt=`a//nonuncommento${1+2}b`;', '']);
    assert.equal(somiglianza(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'e']), 0.75);
    assert.equal(somiglianza([], []), 0);
  });

  test('TAGLIE-MIS-05 ogni forma che carica codice si conta, e niente che non lo sia', () => {
    const casi = [
      ["const e = eval('1');", ['eval']],
      ["const e = (0, eval)('1');", ['eval']],
      ['const e = window.eval;', ['eval']],
      ["const f = new Function('return 1');", ['Function']],
      ["const f = Function('return 1');", ['Function']],
      ['const F = Function;', ['Function']],
      ["const f = (() => {}).constructor('return 1');", ['constructor()']],
      ["const e = globalThis['eval'];", ['accesso-per-nome']],
      ["const f = x['constructor']('return 1');", ['accesso-per-nome']],
      ['const m = await import(dove);', ['import-calcolato']],
      ['const m = await import(`./a/${nome}.mjs`);', ['import-calcolato']],
      ['const m = require(dove);', ['require-calcolato']],
      ['const r = require; r(dove);', ['require-riferimento']],
      ['const p = require.resolve(dove);', ['resolve-calcolato']],
      ['const c = require.cache;', ['require-riferimento']],
      ["import { createRequire } from 'node:module'; const r = createRequire(import.meta.url);", ['createRequire', 'modulo']],
      ["import { createRequire as cr } from 'module'; const r = cr(import.meta.url); r(dove);", ['createRequire', 'modulo', 'require-calcolato']],
      ["const r = process.getBuiltinModule('module');", ['getBuiltinModule', 'modulo']],
      ["import { register } from 'node:module'; register(dove);", ['modulo', 'register']],
      ["import m from 'node:module'; m.registerHooks({});", ['modulo', 'register']],
      ['const w = new Worker(dove);', ['Worker']],
      ['const w = new SharedWorker(dove);', ['Worker']],
      ["import { fork } from 'node:child_process'; fork(dove);", ['fork', 'fork']],
      ["import { fork as f } from 'node:child_process'; f(dove);", ['fork']],
      ["import { spawn } from 'node:child_process'; spawn(process.execPath, [dove]);", ['spawn-node']],
      ["import { spawn as s } from 'node:child_process'; s(process.execPath, [dove]);", ['spawn-node']],
      ["import { execFileSync } from 'node:child_process'; execFileSync('node', [dove]);", ['spawn-node']],
      ["import vm from 'node:vm';", ['modulo']],
      ["const vm = require('vm');", ['modulo']],
      ["import { Worker } from 'worker_threads';", ['modulo']],
      ["import i from 'node:inspector';", ['modulo']],
      ["setTimeout('fai()', 10);", ['timer-stringa']],
      ["const s = document.createElement('script');", ['script-tag']],
      ["importScripts('a.js');", ['importScripts']],
      ['const m = Module._load(dove);', ['interno']],
      ['m._compile(testo, nome);', ['interno']],
      ['process.binding(nome);', ['interno']],
      ['process.dlopen(m, dove);', ['interno']],
      ['const w = WebAssembly.instantiate(b);', ['wasm']],
      ['const { require: r2 } = module; r2(dove);', ['require-riferimento']],
    ];
    for (const [riga, attesi] of casi) assert.deepEqual(tipi(misura([riga])), [...attesi].sort(), riga);
    const innocui = [
      "import a from './a.mjs'; const b = await import('./b.mjs'); const c = require('./c.cjs');",
      "import { spawn } from 'node:child_process'; spawn('git', ['status']);",
      "if (typeof require === 'function' && require.main === module) avvia();",
      'const t = Function.prototype.toString.call(f);',
      'const f = x.fork(); const b = y.binding;',
      "setTimeout(() => fai(), 10); const d = document.createElement('div');",
      "const p = require.resolve('./c.cjs');",
      'function valuta() { return 1; } const evaluate = 2; page.evaluate(() => 1);',
      "import fs from 'node:fs'; import path from 'node:path';",
      'const o = { constructor: 1 }; class C { constructor() { this.a = 1; } }',
      'function f(require) { return 1; }',
    ];
    for (const riga of innocui) assert.deepEqual(tipi(misura([riga])), [], riga);
    /* l'impronta di una forma è il suo testo senza spazi: la stessa forma spostata è la stessa, un argomento diverso no */
    const i1 = misura(['const m = await import( dove );']).carichi[0].impronta;
    assert.equal(i1, misura(['', 'const m = await import(dove);']).carichi[0].impronta);
    assert.notEqual(i1, misura(['const m = await import(altrove);']).carichi[0].impronta);
  });

  test('TAGLIE-MIS-06 le stringhe scritte e la forma in cui stanno', () => {
    const m = misura([
      "import a from './a.mjs';", "export * from './b.mjs';", "import type { T } from './tipi.d.ts';", "const c = await import('./c.mjs');", "const d = require('./d.cjs');",
      "const e = new Worker(new URL('./e.mjs', import.meta.url));", "const f = new URL('./f.mjs', import.meta.url);", "const g = await import(join(qui, 'g'));",
      "let t: import('./solo-tipo.d.ts').T;",
    ], 'harness-ui/src/x.ts');
    const per = Object.fromEntries(m.letterali.map((l) => [l.testo, l.forma]));
    assert.deepEqual(per, { './a.mjs': 'import', './b.mjs': 'import', './c.mjs': 'import()', './d.cjs': 'require', './e.mjs': 'Worker-dentro', './f.mjs': 'altro', g: 'import()-dentro' });
  });

  test('TAGLIE-MIS-07 gli archi: dove arriva un percorso, nell\'ordine di Node; che cosa è arco, percorso, pacchetto', () => {
    const albero = new Map(['harness-ui/src/x.mjs', 'harness-ui/src/contato.mjs', 'harness-ui/src/senza', 'harness-ui/src/senza.js', 'harness-ui/src/dati.json', 'harness-ui/src/cartella/index.js',
      'harness-ui/src/tipato.ts', 'harness-ui/benchmarks/fuori.mjs', 'harness-ui/src/kernel/dist/u.js', 'harness-ui/package.json', 'harness-ui/src/a.test.mjs'].map((p) => [p, { modo: '100644', sha: p }]));
    const pacchetto = { radice: 'harness-ui', nome: 'finto', dipendenze: new Set(['dichiarato', '@scopo/dichiarato']) };
    const archi = (letterali) => [...archiDi('harness-ui/src/x.mjs', letterali, albero, REGOLE, pacchetto).values()].map((a) => `${a.classe} ${a.verso}`).sort();
    const l = (testo, forma = 'import') => ({ testo, forma });
    assert.deepEqual(archi([l('./contato.mjs'), l('./contato'), l('./tipato.js'), l('./cartella'), l('node:fs'), l('fs'), l('dichiarato'), l('dichiarato/sotto'), l('@scopo/dichiarato/x'), l('https://x/y.js')]), []);
    assert.deepEqual(archi([l('./senza', 'require')]), ['arco harness-ui/src/senza'], 'il file esatto vince sulle estensioni');
    assert.deepEqual(archi([l('./dati.json')]), ['arco harness-ui/src/dati.json']);
    assert.deepEqual(archi([l('../benchmarks/fuori.mjs')]), ['arco harness-ui/benchmarks/fuori.mjs']);
    assert.deepEqual(archi([l('./kernel/dist/u.js')]), ['arco harness-ui/src/kernel/dist/u.js']);
    assert.deepEqual(archi([l('./a.test.mjs')]), ['arco harness-ui/src/a.test.mjs']);
    assert.deepEqual(archi([l('./non-esiste.html', 'require')]), ['arco harness-ui/src/non-esiste.html'], 'una forma di carico è un arco anche se il file non c\'è ancora');
    assert.deepEqual(archi([l('./non-esiste.mjs')]), [], 'verso un percorso contato non è un arco');
    assert.deepEqual(archi([l('../../../fuori.mjs')]), ['arco fuori-dal-repo:../../../fuori.mjs']);
    assert.deepEqual(archi([l('/assoluto/x.mjs'), l('file:///c/x.mjs'), l('C:/x.mjs')]).length, 3);
    assert.deepEqual(archi([l('#mappa')]), ['arco mappa:#mappa']);
    assert.deepEqual(archi([l('mai-visto'), l('@scopo/mai-visto/x')]), ['pacchetto @scopo/mai-visto', 'pacchetto mai-visto']);
    assert.deepEqual(archi([l('finto/benchmarks/fuori.mjs')]), ['arco harness-ui/benchmarks/fuori.mjs']);
    assert.deepEqual(archi([l('finto/src/contato.mjs')]), []);
    /* fuori da una forma di carico: solo se il file esiste e non è contato */
    assert.deepEqual(archi([l('../benchmarks/fuori.mjs', 'altro'), l('./non-esiste.html', 'altro'), l('./contato.mjs', 'altro')]), ['percorso harness-ui/benchmarks/fuori.mjs']);
    assert.deepEqual(archi([l('harness-ui/benchmarks/fuori.mjs', 'altro'), l('benchmarks/fuori.mjs', 'altro'), l('text/html', 'altro'), l('fuori.mjs', 'altro'), l('package.json', 'altro')]), ['percorso harness-ui/benchmarks/fuori.mjs']);
    assert.deepEqual(archi([l('../benchmarks/fuori.mjs', 'Worker-dentro'), l('../benchmarks/fuori.mjs', 'fork'), l('../benchmarks/fuori.mjs', 'register')]), ['arco harness-ui/benchmarks/fuori.mjs']);
    assert.deepEqual([...archiDi('mobile/src/a.ts', [l('@/lib/b'), l('@/../scripts/z.mjs')], new Map([['mobile/src/lib/b.ts', {}], ['mobile/scripts/z.mjs', {}]]), REGOLE, { radice: '', nome: '', dipendenze: new Set() }).values()].map((a) => `${a.classe} ${a.verso}`), ['arco mobile/scripts/z.mjs']);
  });

  test('TAGLIE-MIS-08 un .vue: si contano le righe del file e le funzioni dei blocchi <script>; ciò che non si analizza lo dice', () => {
    const vue = misura(['<template>', '  <p>{{ f() }}</p>', '</template>', '<script setup lang="ts">', "import { x } from './x';", 'function f(): number {', '  return x;', '}', '</script>', '<style>p { color: red; }</style>'], 'mobile/src/S.vue');
    assert.equal(vue.righe, 10);
    assert.equal(vue.tipi, true);
    assert.deepEqual(vue.funzioni.map((f) => [f.q, f.riga, f.righe]), [['f', 6, 3]]);
    assert.deepEqual(vue.letterali, [{ testo: './x', forma: 'import' }]);
    assert.equal(misura(['<script>', 'export default {}', '</script>'], 'mobile/src/S.vue').tipi, false);
    const rotto = misura(['export const = ;', "const p = './dove.mjs';"]);
    assert.match(rotto.errore, /non si analizza \(riga 1\)/u);
    assert.equal(rotto.righe, 2);
    assert.deepEqual(rotto.letterali, [{ testo: './dove.mjs', forma: 'altro' }]);
  });

  test('TAGLIE-MIS-09 il peso di codice di un file raggiunto: il testo non pesa, le istruzioni sì', () => {
    const base = pesoDiCodice(ts, "export const t = { a: 'uno', b: 'due' };\n", 'x.js');
    assert.deepEqual(base, { peso: 1, come: 'istruzioni' });
    assert.equal(pesoDiCodice(ts, "export const t = { a: 'uno', b: 'due', c: 'tre', d: `quattro` };\n", 'x.js').peso, 1);
    assert.equal(pesoDiCodice(ts, "export const t = { a: 'uno', b: () => { fai(); } };\n", 'x.js').peso, 4);
    assert.deepEqual(pesoDiCodice(ts, '<!-- x\nexports.a = 1;\n', 'x.js'), { peso: 22, come: 'caratteri' });
    assert.deepEqual(pesoDiCodice(ts, 'abc', 'x.html'), { peso: 3, come: 'caratteri' });
  });
});

describe('cricchetto delle taglie dalla base: l\'abbinamento', () => {
  const corpo = (k, n) => Array.from({ length: n }, (_, i) => `  totale_${k} += passo_${k}(${i});`);
  const fn = (nome, k, n) => [`function ${nome}() {`, ...corpo(k, n), '}'];
  const mappa = (o) => new Map(Object.entries(o).map(([p, righe]) => [p, misura(righe, p)]));
  const A = 'harness-ui/src/a.mjs';
  const B = 'harness-ui/src/b.mjs';
  const tutte = () => true;
  const abbina = (base, testa) => {
    const origine = abbinaFile(base, testa, REGOLE);
    const m = abbinaFunzioni(base, testa, origine, REGOLE, tutte);
    const out = {};
    for (const [p, t] of testa) for (const f of t.funzioni) { const o = m.get(f); out[`${p}:${f.q}`] = o ? `${o.percorso}:${o.f.q}` : null; }
    return out;
  };

  test('TAGLIE-ABB-01 i file: lo stesso percorso; il file spostato intero prende il tetto; il pezzo estratto è nuovo', () => {
    const grande = Array.from({ length: 100 }, (_, i) => `export const valore_${i} = ${i};`);
    const base = mappa({ [A]: grande });
    const stesso = abbinaFile(base, mappa({ [A]: [...grande, 'export const z = 1;'] }), REGOLE);
    assert.deepEqual(stesso.get(A), { percorso: A, righe: 100, caratteri: base.get(A).caratteri, tipi: false, stessoPosto: true });
    const spostato = abbinaFile(base, mappa({ [A]: ["export * from './b.mjs';"], [B]: grande.map((r) => `${r} // x`) }), REGOLE);
    assert.equal(spostato.get(B).percorso, A);
    assert.equal(spostato.get(B).righe, 100);
    assert.equal(spostato.get(B).stessoPosto, false);
    assert.deepEqual(spostato.get(A), { percorso: A, righe: 0, caratteri: 0, tipi: false, stessoPosto: true }, 'il rimando resta un file esistente senza il tetto ceduto');
    const estratto = abbinaFile(base, mappa({ [A]: grande.slice(40), [B]: grande.slice(0, 40) }), REGOLE);
    assert.equal(estratto.get(B), null, 'il 40% non basta: è un file nuovo');
    assert.equal(estratto.get(A).righe, 100);
    const cancellato = abbinaFile(base, mappa({ [B]: grande.slice(0, 70) }), REGOLE);
    assert.equal(cancellato.get(B).percorso, A, 'il 70% delle righe di un file sparito');
    /* uno a uno: due file che portano lo stesso corpo non prendono tutti e due il tetto */
    const doppio = abbinaFile(base, mappa({ [B]: grande, 'harness-ui/src/c.mjs': grande }), REGOLE);
    assert.deepEqual([doppio.get(B), doppio.get('harness-ui/src/c.mjs')].filter(Boolean).length, 1);
    /* un file minuscolo (sotto 40 caratteri alfanumerici) non cede niente */
    const mini = abbinaFile(mappa({ [A]: ['a();'] }), mappa({ [B]: ['a();'] }), REGOLE);
    assert.equal(mini.get(B), null);
  });

  test('TAGLIE-ABB-02 le funzioni, passo per passo: stesso corpo, rinomina, spostamento, ritocco, copia', () => {
    const base = mappa({ [A]: [...fn('uno', 'u', 30), ...fn('due', 'd', 30)], [B]: ['export const b = 1;'] });
    /* 1 e 2: non cambiata, e rinominata con lo stesso corpo */
    assert.deepEqual(abbina(base, mappa({ [A]: [...fn('uno', 'u', 30), ...fn('rinominata', 'd', 30)], [B]: ['export const b = 1;'] })), { [`${A}:uno`]: `${A}:uno`, [`${A}:rinominata`]: `${A}:due` });
    /* 3: spostata in un altro file con ogni riga ritoccata; il nome è andato via dal suo file */
    assert.deepEqual(abbina(base, mappa({ [A]: fn('uno', 'u', 30), [B]: fn('due', 'd', 30).map((r) => `${r} // spostata`) })), { [`${A}:uno`]: `${A}:uno`, [`${B}:due`]: `${A}:due` });
    /* la copia: l'origine resta al suo posto e prenota la sua, la copia è nuova */
    assert.deepEqual(abbina(base, mappa({ [A]: [...fn('uno', 'u', 30), ...fn('due', 'd', 30)], [B]: fn('due', 'd', 30) })), { [`${A}:uno`]: `${A}:uno`, [`${A}:due`]: `${A}:due`, [`${B}:due`]: null });
    /* 4: ritoccata sul posto (stesso nome, corpo diverso) */
    assert.deepEqual(abbina(base, mappa({ [A]: [...fn('uno', 'u', 35), ...fn('due', 'd', 30)], [B]: ['export const b = 1;'] }))[`${A}:uno`], `${A}:uno`);
    /* 5: spostata E ritoccata (stesso nome, corpo simile, il nome è andato via dall'origine) */
    assert.deepEqual(abbina(base, mappa({ [A]: fn('uno', 'u', 30), [B]: fn('due', 'd', 36) }))[`${B}:due`], `${A}:due`);
    /* un altro file, stesso nome ma corpo che non c'entra: nuova */
    assert.equal(abbina(base, mappa({ [A]: fn('uno', 'u', 30), [B]: fn('due', 'zzz', 30) }))[`${B}:due`], null);
    /* un altro file, altro nome e corpo ritoccato: nuova (il limite detto dell'abbinamento) */
    assert.equal(abbina(base, mappa({ [A]: fn('uno', 'u', 30), [B]: fn('altronome', 'd', 36) }))[`${B}:altronome`], null);
  });

  test('TAGLIE-ABB-03 i nomi ripetuti si accoppiano per corpo, mai per numero d\'ordine; una base vale per una testa sola', () => {
    const anonima = (k, n) => ['lista.forEach(() => {', ...corpo(k, n), '});'];
    const base = mappa({ [A]: [...anonima('x', 30), ...anonima('y', 30)] });
    /* una anonima nuova inserita SOPRA le altre due e le altre due ritoccate: ognuna ritrova la sua */
    const testa = mappa({ [A]: [...anonima('nuova', 30), ...anonima('x', 33), ...anonima('y', 33)] });
    assert.deepEqual(abbina(base, testa), { [`${A}:<anonima>`]: null, [`${A}:<anonima>#2`]: `${A}:<anonima>`, [`${A}:<anonima>#3`]: `${A}:<anonima>#2` });
    /* due copie dello stesso corpo nella testa: una sola prende la base */
    const due = abbina(mappa({ [A]: fn('uno', 'u', 30) }), mappa({ [A]: [...fn('uno', 'u', 30), ...fn('uno_copia', 'u', 30)] }));
    assert.deepEqual(due, { [`${A}:uno`]: `${A}:uno`, [`${A}:uno_copia`]: null });
    /* un corpo minuscolo (sotto le soglie di git, 20 e 40 caratteri alfanumerici) non si abbina per corpo */
    const mini = abbina(mappa({ [A]: ['function a() { x(); }'] }), mappa({ [A]: ['function b() { x(); }'], [B]: ['function c() { x(); }'] }));
    assert.equal(mini[`${B}:c`], null);
  });

  test('TAGLIE-MIS-10 (mutante vivo M18): la stringa scritta in `fork(…)` porta la forma «fork»', () => {
    const m = misura(["import { fork } from 'node:child_process';", "fork('./figlio.html');"]);
    assert.deepEqual(m.letterali.filter((l) => l.testo === './figlio.html'), [{ testo: './figlio.html', forma: 'fork' }]);
  });

  test('TAGLIE-ABB-04 (mutanti vivi F01, F04, U01, U03, U04, U05, U06, U08, U09, U10): soglie, uno a uno, nomi rimasti al loro posto', () => {
    const C = 'harness-ui/src/c.mjs';
    const grande = Array.from({ length: 100 }, (_, i) => `export const valore_${i} = ${i};`);
    const nuoveRighe = (n) => Array.from({ length: n }, (_, i) => `export const nuovo_${i} = ${i} * 7;`);
    /* F01: il file della base tiene 30 righe e 40 vanno in un file nuovo: il 40% non basta, anche se è più di ciò che resta */
    const f01 = abbinaFile(mappa({ [A]: grande }), mappa({ [A]: grande.slice(0, 30), [B]: grande.slice(30, 70) }), REGOLE);
    assert.equal(f01.get(B), null);
    assert.equal(f01.get(A).righe, 100);
    /* F04: il file della base NON ha perso righe (mezzo riscritto e cresciuto): la sua copia intera altrove è un file nuovo */
    const f04 = abbinaFile(mappa({ [A]: grande }), mappa({ [A]: [...grande.slice(0, 50), ...nuoveRighe(60)], [B]: grande }), REGOLE);
    assert.equal(f04.get(B), null);
    assert.equal(f04.get(A).righe, 100);
    /* U01: sotto i 20 caratteri alfanumerici un corpo uguale nello stesso file non dice chi è */
    assert.equal(abbina(mappa({ [A]: ['function a() { x(); }'] }), mappa({ [A]: ['function b() { x(); }'] }))[`${A}:b`], null);
    /* U03: l'originale ritoccato resta al suo posto e la sua copia esatta compare altrove: la copia è nuova, l'originale è lui */
    assert.deepEqual(abbina(mappa({ [A]: fn('uno', 'u', 30) }), mappa({ [A]: fn('uno', 'u', 35), [B]: fn('uno', 'u', 30) })), { [`${A}:uno`]: `${A}:uno`, [`${B}:uno`]: null });
    /* U04: la funzione sparita dal suo file e comparsa uguale in DUE file: una sola è lei */
    const u04 = abbina(mappa({ [A]: [...fn('uno', 'u', 30), ...fn('due', 'd', 30)] }), mappa({ [A]: fn('uno', 'u', 30), [B]: fn('due', 'd', 30), [C]: fn('due', 'd', 30) }));
    assert.deepEqual([u04[`${B}:due`], u04[`${C}:due`]], [`${A}:due`, null]);
    /* U05: fra 20 e 40 caratteri alfanumerici un corpo uguale in un ALTRO file non basta */
    const piccola = ['function piccola() { return calcola(1, 2); }'];
    assert.equal(alfanumerici(piccola[0].replace(/\s+/gu, '')), 30, 'premessa: fra le due soglie');
    assert.equal(abbina(mappa({ [A]: [...fn('uno', 'u', 30), ...piccola] }), mappa({ [A]: fn('uno', 'u', 30), [B]: piccola }))[`${B}:piccola`], null);
    /* U06: due anonime nuove al posto di due anonime sparite, coi corpi che non c'entrano: nessuna eredita il tetto */
    const anonima = (k, n) => ['lista.forEach(() => {', ...corpo(k, n), '});'];
    assert.deepEqual(abbina(mappa({ [A]: [...anonima('x', 30), ...anonima('y', 30)] }), mappa({ [A]: [...anonima('p', 30), ...anonima('q', 30)] })), { [`${A}:<anonima>`]: null, [`${A}:<anonima>#2`]: null });
    /* U08: due funzioni dello stesso nome sparite da due file e una sola, ritoccata, in un terzo: non si sa di chi è */
    const u08 = abbina(mappa({ [A]: [...fn('uno', 'u', 30), ...fn('due', 'd', 30)], [C]: [...fn('tre', 't', 30), ...fn('due', 'd', 31)] }), mappa({ [A]: fn('uno', 'u', 30), [C]: fn('tre', 't', 30), [B]: fn('due', 'd', 36) }));
    assert.equal(u08[`${B}:due`], null);
    /* U09: la funzione resta nel suo file (accorciata, sotto il bersaglio) e una copia ritoccata cresce altrove: la copia è nuova */
    const baseU = mappa({ [A]: [...fn('uno', 'u', 30), ...fn('altra', 'a', 60)] });
    const testaU = mappa({ [A]: [...fn('uno', 'u', 10), ...fn('altra', 'a', 60)], [B]: fn('uno', 'u', 36) });
    const origineU = abbinaFile(baseU, testaU, REGOLE);
    assert.equal(origineU.get(B), null, 'premessa: il file nuovo non è il vecchio spostato');
    const mU = abbinaFunzioni(baseU, testaU, origineU, REGOLE, (f) => f.righe > 20);
    assert.equal(mU.get(testaU.get(B).funzioni[0]), undefined);
    /* U10: la copia scritta SOPRA l'originale non gli porta via la base */
    assert.deepEqual(abbina(mappa({ [A]: fn('uno', 'u', 30) }), mappa({ [A]: [...fn('uno_copia', 'u', 30), ...fn('uno', 'u', 30)] })), { [`${A}:uno_copia`]: null, [`${A}:uno`]: `${A}:uno` });
  });
});
