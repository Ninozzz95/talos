/*
 * R-28, A2 (owner 29/10/2026 notte, «cancello veloce»; le cinque condizioni della CLI): il cancello tiene il lavoro in memoria per
 * CONTENUTO e deve dare l'esito di sempre, byte per byte. Qui: equivalenza con il calcolo da zero su una sequenza di scritture casuali,
 * due scrittori insieme nella stessa cartella, una modifica fuori dal modello, nessun timer che tenga vivo il processo, e la velocità.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import { cancelloSemantico, libreriaStandard, statoCacheCancello, svuotaCacheCancello, tettoCancello } from '../src/kernel/dist/kernelPerIlBanco.js';
import { leggiLibreriaStandardTs } from '../src/kernel/talosHarness.mjs';

const N = 60;
function progetto() {
  const s = [];
  for (let i = 0; i < N; i++) {
    s.push({ percorso: `src/m${i}.ts`, testo: `import { f${(i + 1) % N} } from './m${(i + 1) % N}';\nexport function f${i}(x: number): number {\n  return x > ${i} ? x : f${(i + 1) % N}(x + 1);\n}\n` });
  }
  return s;
}
const conFile = (s, percorso, testo) => (s.some((x) => x.percorso === percorso) ? s.map((x) => (x.percorso === percorso ? { percorso, testo } : x)) : [...s, { percorso, testo }]);
/* modifiche plausibili, buone e cattive: un riferimento inventato, un export tolto (rompe chi importa), un @ts-ignore, una riparazione */
function modifica(r, s) {
  const i = Math.floor(r() * N);
  const tipo = Math.floor(r() * 5);
  const p = `src/m${i}.ts`;
  if (tipo === 0) return conFile(s, p, `export function f${i}(x: number): number { return nonEsiste${i}(x); }\n`);
  if (tipo === 1) return conFile(s, p, `export const g${i} = 1;\n`); // toglie f_i: rompe m_{i-1}
  if (tipo === 2) return conFile(s, p, `// @ts-ignore\nexport function f${i}(x: number): number { return x; }\n`);
  if (tipo === 3) return conFile(s, p, `export function f${i}(x: number): number { return x + ${i}; }\n`);
  return conFile(s, `src/nuovo${i}.ts`, `import { f${i} } from './m${i}';\nexport const v${i} = f${i}(1);\n`);
}
function casuale(seme) { let x = seme; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }

test('CANC-A2-01 EQUIVALENZA: su 3 × 60 scritture casuali (buone e cattive) l\'esito con la cache è identico al calcolo da zero, campo per campo', async () => {
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  for (const seme of [29, 7, 101]) {
    svuotaCacheCancello();
    const r = casuale(seme);
    let stato = progetto();
    for (let k = 0; k < 60; k++) {
      const dopo = modifica(r, stato);
      const caldo = await cancelloSemantico(stato, dopo, lib);
      const freddo = await cancelloSemantico(stato, dopo, lib, { freddo: true });
      assert.deepEqual(caldo, freddo, `seme ${seme}, scrittura ${k}: la cache cambia l'esito`);
      if (caldo.stato === 'presente' || r() < 0.3) stato = dopo; // come il kernel: si scrive se passa (e a volte la persona scrive lo stesso)
    }
  }
});

test('CANC-A2-02 DUE SCRITTORI insieme nella stessa cartella: ognuno ha il suo esito giusto, nessuno incolpa la scrittura dell\'altro', async () => {
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const base = progetto();
  const buona = conFile(base, 'src/m3.ts', 'export function f3(x: number): number { return x + 3; }\n');
  const cattiva = conFile(base, 'src/m7.ts', 'export function f7(x: number): number { return inventata(x); }\n');
  const [a, b] = await Promise.all([cancelloSemantico(base, buona, lib), cancelloSemantico(base, cattiva, lib)]);
  assert.equal(a.stato, 'presente');
  assert.equal(b.stato, 'assente');
  assert.match(b.perche, /inventata/u);
  // e il secondo scrittore parte dallo stato che il primo ha scritto: il suo errore resta suo
  const dopoA = conFile(buona, 'src/m9.ts', 'export function f9(x: number): number { return altraInventata(x); }\n');
  const c = await cancelloSemantico(buona, dopoA, lib);
  assert.equal(c.stato, 'assente');
  assert.match(c.perche, /altraInventata/u, 'il suo errore');
  assert.doesNotMatch(c.perche, /\binventata\b/u, 'mai quello dell\'altro scrittore, che non è mai stato scritto');
});

test('CANC-A2-03 una modifica FUORI dal modello (la persona, un git checkout) cambia il contenuto e quindi la chiave: niente risultato vecchio', async () => {
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const base = progetto();
  const nuova = conFile(base, 'src/nuovo.ts', 'import { f5 } from "./m5";\nexport const z = f5(2);\n');
  assert.equal((await cancelloSemantico(base, nuova, lib)).stato, 'presente');
  // la persona toglie f5 da m5 a mano: la stessa scrittura ora rompe
  const toccato = conFile(base, 'src/m5.ts', 'export const nienteF5 = 0;\n');
  const ancora = conFile(toccato, 'src/nuovo.ts', 'import { f5 } from "./m5";\nexport const z = f5(2);\n');
  const esito = await cancelloSemantico(toccato, ancora, lib);
  assert.deepEqual(esito, await cancelloSemantico(toccato, ancora, lib, { freddo: true }));
});

test('CANC-A2-04 la seconda scrittura nello stesso progetto costa molto meno della prima (la base è ricordata, si ricontrolla solo ciò che cambia)', async () => {
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const base = progetto();
  const t0 = performance.now();
  const d1 = conFile(base, 'src/m1.ts', 'import { f2 } from "./m2";\nexport function f1(x: number): number { return f2(x) + 1; }\n');
  await cancelloSemantico(base, d1, lib);
  const prima = performance.now() - t0;
  const t1 = performance.now();
  const d2 = conFile(d1, 'src/m4.ts', 'import { f5 } from "./m5";\nexport function f4(x: number): number { return f5(x) + 4; }\n');
  await cancelloSemantico(d1, d2, lib);
  const seconda = performance.now() - t1;
  const freddoT = performance.now();
  await cancelloSemantico(d1, d2, lib, { freddo: true });
  const freddo = performance.now() - freddoT;
  assert.ok(seconda * 3 < freddo, `la scrittura calda deve costare molto meno di quella da zero: ${seconda.toFixed(0)} ms contro ${freddo.toFixed(0)} ms (prima calda ${prima.toFixed(0)} ms)`);
  assert.ok(statoCacheCancello().costruttori >= 1);
});

test('CANC-IMP-01 un file NUOVO che importa un modulo vicino passa (prima del 29/10 era «Cannot find module» per costruzione), con e senza .js', async () => {
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const m5 = { percorso: 'src/m5.ts', testo: 'export function f5(x: number) { return x; }\n' };
  const nuovo = [m5, { percorso: 'src/nuovo.ts', testo: 'import { f5 } from "./m5";\nimport { f5 as g } from "./m5.js";\nexport const z = f5(2) + g(1);\n' }];
  for (const freddo of [false, true]) {
    svuotaCacheCancello();
    assert.deepEqual(await cancelloSemantico([m5], nuovo, lib, { freddo }), { stato: 'presente', fatto: { famiglia: 'introduced-references', nome: 'modifica candidata' } });
  }
});

test('CANC-IMP-02 al contrario: un modulo che non c\'è e un membro che il vicino non esporta restano rifiutati, col messaggio di chi scrive', async () => {
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const m5 = { percorso: 'src/m5.ts', testo: 'export function f5(x: number) { return x; }\n' };
  const manca = await cancelloSemantico([m5], [m5, { percorso: 'src/a.ts', testo: 'import { f5 } from "./mX";\nexport const z = f5(2);\n' }], lib);
  assert.equal(manca.stato, 'assente');
  assert.match(manca.perche, /Cannot find module '\.\/mX'/u);
  const membro = await cancelloSemantico([m5], [m5, { percorso: 'src/b.ts', testo: 'import { f6 } from "./m5";\nexport const z = f6(2);\n' }], lib);
  assert.equal(membro.stato, 'assente');
  assert.match(membro.perche, /"\.\/m5"' has no exported member 'f6'/u, 'il nome interno assoluto non arriva nel messaggio');
  // e ora si vede anche chi rompe un vicino: togliere f5 rompe chi lo importa
  const rotto = await cancelloSemantico([m5, { percorso: 'src/c.ts', testo: 'import { f5 } from "./m5";\nexport const w = f5(1);\n' }],
    [{ percorso: 'src/m5.ts', testo: 'export const altro = 1;\n' }, { percorso: 'src/c.ts', testo: 'import { f5 } from "./m5";\nexport const w = f5(1);\n' }], lib);
  assert.equal(rotto.stato, 'assente');
});

test('CANC-IMP-03 lo stesso file scritto con barre diverse nel prima e nel dopo non sembra nuovo (il suo errore vecchio non diventa «introdotto»)', async () => {
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const prima = [{ percorso: 'src\\v.ts', testo: 'export const v = vecchioErrore;\n' }];
  const dopo = [{ percorso: 'src/v.ts', testo: 'export const v = vecchioErrore;\nexport const w = 1;\n' }];
  for (const freddo of [false, true]) {
    svuotaCacheCancello();
    assert.equal((await cancelloSemantico(prima, dopo, lib, { freddo })).stato, 'presente');
  }
});

test('CANC-A0-01 senza file controllabili (JavaScript senza @ts-check, testi) il compilatore non parte e l\'esito è quello del calcolo vero', async () => {
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const prima = [{ percorso: 'a.js', testo: 'export const a = 1;\n' }, { percorso: 'note.md', testo: '# x\n' }];
  const dopo = [{ percorso: 'a.js', testo: 'export const a = nonEsiste();\n' }, { percorso: 'note.md', testo: '# y\n' }];
  const caldo = await cancelloSemantico(prima, dopo, lib);
  assert.deepEqual(caldo, await cancelloSemantico(prima, dopo, lib, { freddo: true }));
  assert.equal(caldo.stato, 'presente');
  assert.equal(statoCacheCancello().costruttori, 0, 'nessun programma costruito');
  // le soppressioni si contano lo stesso
  const zittita = await cancelloSemantico(prima, [{ percorso: 'a.js', testo: '// @ts-ignore\nexport const a = 2;\n' }], lib);
  assert.equal(zittita.stato, 'assente');
  assert.match(zittita.perche, /suppression/u);
});

test('CANC-A0-02 al contrario: un JavaScript con @ts-check, o un TypeScript nel prima o nel dopo, si controlla davvero', async () => {
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const js = await cancelloSemantico([], [{ percorso: 'a.js', testo: '// @ts-check\nexport const a = nonEsiste();\n' }], lib);
  assert.equal(js.stato, 'assente');
  assert.match(js.perche, /nonEsiste/u);
  const ts = await cancelloSemantico([{ percorso: 'b.ts', testo: 'export const b = 1;\n' }], [{ percorso: 'b.ts', testo: 'export const b = inventata;\n' }], lib);
  assert.equal(ts.stato, 'assente');
  assert.match(ts.perche, /inventata/u);
});

test('CANC-A2-06 TETTO DELLA MEMORIA: oltre 2 MiB di sorgenti niente cache (esito di sempre); due cartelle che insieme lo superano ⇒ se ne tiene una', async () => {
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const pieno = (cartella, kb) => [{ percorso: `${cartella}/grande.ts`, testo: `export const g = 1;\n/*${'x'.repeat(kb * 1024)}*/\n` }];
  const grande = pieno('a', 2100);
  const dopoGrande = [...grande, { percorso: 'a/n.ts', testo: 'export const n = inventata;\n' }];
  const esito = await cancelloSemantico(grande, dopoGrande, lib);
  assert.deepEqual(esito, await cancelloSemantico(grande, dopoGrande, lib, { freddo: true }));
  assert.equal(esito.stato, 'assente');
  assert.equal(statoCacheCancello().costruttori, 0, 'oltre il tetto non si tiene niente');
  svuotaCacheCancello();
  const uno = pieno('b', 1200);
  const due = pieno('c', 1200);
  await cancelloSemantico(uno, [...uno, { percorso: 'b/x.ts', testo: 'export const x = 1;\n' }], lib);
  assert.equal(statoCacheCancello().costruttori, 1);
  await cancelloSemantico(due, [...due, { percorso: 'c/x.ts', testo: 'export const x = 1;\n' }], lib);
  assert.equal(statoCacheCancello().costruttori, 1, 'le due cartelle insieme superano il tetto: resta solo l\'ultima');
  const piccola = [{ percorso: 'd/p.ts', testo: 'export const p = 1;\n' }];
  await cancelloSemantico(piccola, [...piccola, { percorso: 'd/q.ts', testo: 'export const q = 2;\n' }], lib);
  assert.equal(statoCacheCancello().costruttori, 2, 'una piccola accanto alla grande ci sta');
  svuotaCacheCancello();
});

test('CANC-A2-08 IL TETTO PER MACCHINA: 2 MiB sul PC, 512 KiB su Android (Mobile 29/10), TALOS_CANCELLO_CACHE_KIB lo cambia, un valore storto si ignora', () => {
  assert.equal(tettoCancello({ ambiente: {}, piattaforma: 'win32' }), 2 * 1024 * 1024);
  assert.equal(tettoCancello({ ambiente: {}, piattaforma: 'linux' }), 2 * 1024 * 1024);
  assert.equal(tettoCancello({ ambiente: {}, piattaforma: 'android' }), 512 * 1024);
  assert.equal(tettoCancello({ ambiente: { TALOS_CANCELLO_CACHE_KIB: '256' }, piattaforma: 'win32' }), 256 * 1024);
  assert.equal(tettoCancello({ ambiente: { TALOS_CANCELLO_CACHE_KIB: ' 0 ' }, piattaforma: 'android' }), 0);
  for (const storto of ['-1', '1.5', 'tanto', '', '99999999']) {
    assert.equal(tettoCancello({ ambiente: { TALOS_CANCELLO_CACHE_KIB: storto }, piattaforma: 'android' }), 512 * 1024, `«${storto}» si ignora`);
  }
});

test('CANC-A2-09 con TALOS_CANCELLO_CACHE_KIB=0 non si tiene niente in memoria, e l\'esito resta quello del calcolo da zero', async (t) => {
  const prima = process.env.TALOS_CANCELLO_CACHE_KIB;
  process.env.TALOS_CANCELLO_CACHE_KIB = '0';
  t.after(() => { if (prima === undefined) delete process.env.TALOS_CANCELLO_CACHE_KIB; else process.env.TALOS_CANCELLO_CACHE_KIB = prima; });
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const p = [{ percorso: 'f/p.ts', testo: '' }]; // un file vuoto: 0 byte di sorgenti, e lo zero spegne lo stesso
  const dopo = [...p, { percorso: 'f/q.ts', testo: 'export const q = inventata;\n' }];
  const esito = await cancelloSemantico(p, dopo, lib);
  assert.deepEqual(esito, await cancelloSemantico(p, dopo, lib, { freddo: true }));
  assert.equal(esito.stato, 'assente');
  assert.deepEqual(statoCacheCancello(), { sorgenti: 0, costruttori: 0, risultati: 0 });
});

test('CANC-A2-10 il tetto scelto vale anche per il secondo costruttore: due cartelle che insieme lo superano non restano tutte e due', async (t) => {
  const prima = process.env.TALOS_CANCELLO_CACHE_KIB;
  process.env.TALOS_CANCELLO_CACHE_KIB = '1';
  t.after(() => { if (prima === undefined) delete process.env.TALOS_CANCELLO_CACHE_KIB; else process.env.TALOS_CANCELLO_CACHE_KIB = prima; });
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  const cartella = (c) => [{ percorso: `${c}/a.ts`, testo: `export const a = 1;\n// ${'x'.repeat(600)}\n` }];
  for (const c of ['g', 'h']) await cancelloSemantico(cartella(c), [...cartella(c), { percorso: `${c}/b.ts`, testo: 'export const b = 2;\n' }], lib);
  assert.equal(statoCacheCancello().costruttori, 1, 'con 1 KiB di tetto due cartelle da ~0,6 KiB non stanno insieme');
  svuotaCacheCancello();
});

test('CANC-A2-07 dopo 10 minuti senza scritture la memoria si rende da sola (il server non tiene il programma per sempre)', async (t) => {
  svuotaCacheCancello();
  const lib = await libreriaStandard(leggiLibreriaStandardTs);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = [{ percorso: 'e/p.ts', testo: 'export const p = 1;\n' }];
  await cancelloSemantico(p, [...p, { percorso: 'e/q.ts', testo: 'export const q = 2;\n' }], lib);
  assert.equal(statoCacheCancello().costruttori, 1);
  t.mock.timers.tick(9 * 60_000);
  assert.equal(statoCacheCancello().costruttori, 1, 'prima dei 10 minuti resta');
  t.mock.timers.tick(61_000);
  assert.deepEqual(statoCacheCancello(), { sorgenti: 0, costruttori: 0, risultati: 0 });
});

test('CANC-A2-05 nessun timer: dopo una scrittura il processo esce da solo (talos -p è un processo breve)', () => {
  const modulo = pathToFileURL(join(import.meta.dirname, '..', 'src', 'kernel', 'dist', 'kernelPerIlBanco.js')).href;
  const harness = pathToFileURL(join(import.meta.dirname, '..', 'src', 'kernel', 'talosHarness.mjs')).href;
  const codice = `const { cancelloSemantico, libreriaStandard } = await import(${JSON.stringify(modulo)});
const { leggiLibreriaStandardTs } = await import(${JSON.stringify(harness)});
const lib = await libreriaStandard(leggiLibreriaStandardTs);
const a = [{ percorso: 'a.ts', testo: 'export const a = 1;\\n' }];
const b = [{ percorso: 'a.ts', testo: 'export const a = 2;\\n' }];
console.log((await cancelloSemantico(a, b, lib)).stato);`;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codice], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /presente/u);
  assert.ok(Date.now() - t0 < 30_000, 'il processo è uscito da solo');
});
