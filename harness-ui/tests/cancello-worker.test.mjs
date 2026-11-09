/*
 * R-39 (Performance, 30/10/2026; forma chiusa con Desktop, CLI e Mobile, PROPOSTA-CANCELLO-CALDO-2026-10-30.md): il cancello delle
 * scritture gira in un worker del nucleo. Misurato prima: sul filo principale il compilatore fermava il processo 1,4–1,5 s alla prima
 * scrittura di un sorgente e ~0,4 s alle altre. Qui si prova che:
 *   · l'esito è lo STESSO della strada di prima (stesse coppie, con e senza worker) — condizione del Desktop;
 *   · il worker parte davvero quando deve, e non parte quando non deve (condizione della CLI: il ripiego non deve nasconderlo);
 *   · il filo principale non si ferma durante una scrittura a freddo;
 *   · un worker che supera il tetto della memoria muore, la scrittura si giudica sulla strada di prima, il processo vive (CLI);
 *   · su `android` niente worker (Mobile), e la casa Linux resta sulla strada di prima (CLI);
 *   · il preriscaldamento parte solo dopo una scrittura giudicata di quella cartella (regola della CLI, imposta dalla misura).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { premessaDellaScrittura, PERCORSO_DEL_CANCELLO_WORKER } from '../src/kernel/talosHarness.mjs';
import { azzeraCancelloWorker, cancelloWorkerAmmesso, scaldaIlCancello, statoCancelloWorker, limiteMemoriaWorkerMb, RIAPERTURA_DOPO_MS } from '../src/kernel/cancello-in-worker.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function progetto(t, quanti = 40) {
  const c = mkdtempSync(join(tmpdir(), 'talos-cancello-worker-'));
  t.after(() => rimuoviCartellaDiProva(c));
  mkdirSync(join(c, 'src'));
  for (let i = 0; i < quanti; i++) {
    writeFileSync(join(c, 'src', `m${i}.ts`), `import { f${(i + 1) % quanti} } from './m${(i + 1) % quanti}';\nexport function f${i}(x: number): number {\n  return x > ${i} ? x : f${(i + 1) % quanti}(x + 1);\n}\n`);
  }
  writeFileSync(join(c, 'src', 'controllato.mjs'), '// @ts-check\nimport { f1 } from "./m1";\nexport const v = f1(1);\n');
  return c;
}

/* Le coppie: valide, che rompono un riferimento, che zittiscono un errore, su un .ts e su un .mjs con @ts-check, file nuovo e esistente. */
const COPPIE = [
  ['src/m3.ts', 'import { f4 } from "./m4";\nexport function f3(x: number): number { return f4(x); }\n'],
  ['src/m3.ts', 'import { f4 } from "./m4";\nexport function f3(x: number): number { return inventata(x); }\n'],
  ['src/m5.ts', 'export function nonPiuF5(x: number): number { return x; }\n'],
  ['src/nuovo.ts', 'import { f7 } from "./m7";\nexport const n = f7(2);\n'],
  ['src/nuovo.ts', 'import { fNonCe } from "./m7";\nexport const n = fNonCe(2);\n'],
  ['src/m8.ts', '// @ts-ignore\nimport { f9 } from "./m9";\nexport function f8(x: number): number { return f9(x); }\n'],
  ['src/controllato.mjs', '// @ts-check\nimport { f1 } from "./m1";\nexport const v = f1(1);\n'],
  ['src/controllato.mjs', '// @ts-check\nimport { f1 } from "./m1";\nexport const v = sparita(1);\n'],
];
const senzaCampiVolatili = ({ stato, perche, codice, esisteva, contenutoPrima }) => ({ stato, perche, codice, esisteva, contenutoPrima });

test('CW-01 stesso esito con e senza worker, su 8 coppie (valide, riferimenti rotti, errore zittito, .ts e .mjs con @ts-check, file nuovo)', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t);
  const conWorker = [];
  for (const [percorso, testo] of COPPIE) conWorker.push(senzaCampiVolatili(await premessaDellaScrittura(c, percorso, testo)));
  assert.ok(statoCancelloWorker().giudizi >= COPPIE.length, 'il worker ha giudicato tutte le coppie');
  process.env.TALOS_CANCELLO_WORKER = '0';
  try {
    const senza = [];
    for (const [percorso, testo] of COPPIE) senza.push(senzaCampiVolatili(await premessaDellaScrittura(c, percorso, testo)));
    assert.deepEqual(conWorker, senza);
  } finally { delete process.env.TALOS_CANCELLO_WORKER; }
  /* e le coppie dicono davvero qualcosa: almeno una passa e almeno tre sono rifiutate */
  assert.ok(conWorker.filter((e) => e.stato === 'presente').length >= 3);
  assert.ok(conWorker.filter((e) => e.stato === 'assente').length >= 3);
  await azzeraCancelloWorker();
});

test('CW-02 il worker parte DAVVERO quando deve (il ripiego non lo nasconde): una scrittura di un .ts lo fa nascere e giudicare, zero ripieghi', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 5);
  const r = await premessaDellaScrittura(c, 'src/m1.ts', 'import { f2 } from "./m2";\nexport function f1(x: number): number { return f2(x); }\n');
  assert.equal(r.stato, 'presente');
  const s = statoCancelloWorker();
  assert.equal(s.nati, 1, `il worker doveva nascere (ingresso: ${PERCORSO_DEL_CANCELLO_WORKER})`);
  assert.equal(s.giudizi, 1);
  assert.equal(s.ripieghi, 0, `nessun ripiego: ${s.ultimoErrore ?? ''}`);
  await azzeraCancelloWorker();
});

test('CW-03 un file che il cancello non giudica (.txt) e il cancello delle prove non toccano il worker', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 3);
  writeFileSync(join(c, 'note.txt'), 'x\n');
  await premessaDellaScrittura(c, 'note.txt', 'y\n');
  await premessaDellaScrittura(c, 'src/m1.ts', 'export const a = 1;\n', { cancello: async () => ({ stato: 'presente', fatto: {} }) });
  assert.equal(statoCancelloWorker().nati, 0);
  await azzeraCancelloWorker();
});

test('CW-04 la casa Linux (leggiPrima del disco remoto) resta sulla strada di prima, apposta (condizione della CLI)', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 3);
  const letti = [];
  const r = await premessaDellaScrittura(c, 'src/m1.ts', 'import { f2 } from "./m2";\nexport function f1(x: number): number { return f2(x); }\n', { leggiPrima: async (p) => { letti.push(p); return 'prima'; } });
  assert.equal(r.stato, 'presente');
  assert.deepEqual(letti, ['src/m1.ts'], 'il «prima» si legge dal disco della casa');
  assert.equal(statoCancelloWorker().nati, 0, 'nessun worker per la casa Linux');
  await azzeraCancelloWorker();
});

test('CW-05 su android niente worker e niente preriscaldamento (UN punto che legge la piattaforma), anche con TypeScript presente', async () => {
  await azzeraCancelloWorker();
  assert.equal(cancelloWorkerAmmesso({ piattaforma: 'android' }), false);
  assert.equal(cancelloWorkerAmmesso({ piattaforma: 'win32' }), true);
  assert.equal(cancelloWorkerAmmesso({ piattaforma: 'linux', ambiente: { TALOS_CANCELLO_WORKER: '0' } }), false, 'TALOS_CANCELLO_WORKER=0 lo spegne');
  assert.equal(scaldaIlCancello('C:/qualunque', { piattaforma: 'android' }), false);
  assert.equal(statoCancelloWorker().nati, 0);
});

test('CW-06 il filo principale NON si ferma durante una scrittura a freddo (prima, sul filo: 1,4 s di blocco)', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 120);
  let ultimo = performance.now(), bucoMax = 0;
  const battito = setInterval(() => { const ora = performance.now(); bucoMax = Math.max(bucoMax, ora - ultimo); ultimo = ora; }, 5);
  const t0 = performance.now();
  const r = await premessaDellaScrittura(c, 'src/m1.ts', 'import { f2 } from "./m2";\nexport function f1(x: number): number { return f2(x); }\n');
  const durata = performance.now() - t0;
  await new Promise((ok) => setTimeout(ok, 30));
  clearInterval(battito);
  assert.equal(r.stato, 'presente');
  /* tetto largo apposta (una prova sensibile al carico non deve ballare): il blocco va confrontato con la durata del lavoro, che sul
     filo principale coincideva col blocco. PRIMA del conteggio dei giudizi: con TALOS_CANCELLO_WORKER=0 questa riga deve essere la
     rossa (provato il 30/10), non quella sotto */
  assert.ok(bucoMax < Math.max(250, durata / 3), `il filo principale si è fermato ${bucoMax.toFixed(0)} ms su ${durata.toFixed(0)} ms di lavoro`);
  assert.equal(statoCancelloWorker().giudizi, 1);
  await azzeraCancelloWorker();
});

test('CW-07 un worker che supera il tetto della memoria muore: la scrittura si giudica sulla strada di prima, il processo vive; due cadute ⇒ spento', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 5);
  const testo = 'import { f2 } from "./m2";\nexport function f1(x: number): number { return inventata(f2(x)); }\n';
  /* «1» chiesto diventa il minimo misurato (4 MB): con 1 MB V8 abortiva il PROCESSO intero, qui deve morire solo il worker */
  process.env.TALOS_CANCELLO_WORKER_MB = '1';
  try {
    const primo = await premessaDellaScrittura(c, 'src/m1.ts', testo);
    assert.equal(primo.stato, 'assente', 'giudicata lo stesso, sulla strada di prima');
    assert.match(primo.perche, /inventata/u);
    const secondo = await premessaDellaScrittura(c, 'src/m1.ts', testo);
    assert.equal(secondo.stato, 'assente');
    const s = statoCancelloWorker();
    assert.equal(s.ripieghi, 2);
    assert.equal(s.cadute, 2);
    assert.equal(s.spento, true, 'dopo due cadute il processo resta sulla strada di prima');
    assert.equal(s.ultimoErrore, 'ERR_WORKER_OUT_OF_MEMORY', 'solo il codice, mai il messaggio grezzo (può contenere un percorso)');
    assert.equal(cancelloWorkerAmmesso(), false);
  } finally { delete process.env.TALOS_CANCELLO_WORKER_MB; }
  await azzeraCancelloWorker();
});

test('CW-08 il preriscaldamento parte solo dopo una scrittura giudicata di quella cartella (regola della CLI imposta dalla misura)', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 5);
  assert.equal(scaldaIlCancello(c), false, 'nessuna scrittura ancora: niente preriscaldamento');
  assert.equal(statoCancelloWorker().nati, 0);
  await premessaDellaScrittura(c, 'src/m1.ts', 'import { f2 } from "./m2";\nexport function f1(x: number): number { return f2(x); }\n');
  assert.equal(scaldaIlCancello(c), true);
  assert.equal(statoCancelloWorker().riscaldamenti, 1);
  await azzeraCancelloWorker();
});

test('CW-10 nessuna variabile d\'ambiente sceglie il file del worker: un percorso fuori dal nucleo non viene eseguito (revisione della CLI)', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 3);
  const fuori = mkdtempSync(join(tmpdir(), 'talos-worker-estraneo-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  const segno = join(fuori, 'eseguito.txt');
  writeFileSync(join(fuori, 'estraneo.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(segno)}, 'si');\n`);
  for (const nome of ['TALOS_CANCELLO_WORKER_FILE', 'TALOS_CANCELLO_WORKER_PATH']) process.env[nome] = join(fuori, 'estraneo.mjs');
  try {
    const r = await premessaDellaScrittura(c, 'src/m1.ts', 'import { f2 } from "./m2";\nexport function f1(x: number): number { return f2(x); }\n');
    assert.equal(r.stato, 'presente');
    assert.equal(statoCancelloWorker().giudizi, 1, 'ha giudicato il worker di sempre');
    assert.equal(existsSync(segno), false, 'il file indicato dall\'ambiente non è stato eseguito');
  } finally { delete process.env.TALOS_CANCELLO_WORKER_FILE; delete process.env.TALOS_CANCELLO_WORKER_PATH; }
  await azzeraCancelloWorker();
});

test('CW-11 (revisione del Desktop R1) un worker che non risponde in tempo si CHIUDE e conta come caduta: la scrittura dopo fa nascere un worker nuovo, non aspetta in fila', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 5);
  const testo = 'import { f2 } from "./m2";\nexport function f1(x: number): number { return inventata(f2(x)); }\n';
  const avvisi = [];
  const avvisoVero = console.warn;
  console.warn = (...a) => { avvisi.push(a.join(' ')); };
  process.env.TALOS_CANCELLO_WORKER_ATTESA_MS = '1';
  try {
    const primo = await premessaDellaScrittura(c, 'src/m1.ts', testo);
    assert.equal(primo.stato, 'assente', 'giudicata sulla strada di prima');
    let s = statoCancelloWorker();
    assert.equal(s.tempiScaduti, 1);
    assert.equal(s.cadute, 1, 'il tempo scaduto conta come caduta');
    assert.equal(s.vivo, false, 'il worker fermo è stato chiuso');
    const secondo = await premessaDellaScrittura(c, 'src/m1.ts', testo);
    assert.equal(secondo.stato, 'assente');
    s = statoCancelloWorker();
    assert.equal(s.nati, 2, 'la scrittura dopo ha fatto nascere un worker nuovo');
    assert.equal(s.spento, true);
    await premessaDellaScrittura(c, 'src/m1.ts', testo);
    assert.equal(avvisi.filter((r) => /write check worker off/u.test(r)).length, 1, 'una riga nel registro, una volta, col motivo');
    assert.match(avvisi.find((r) => /write check worker off/u.test(r)), /timeout/u);
  } finally { delete process.env.TALOS_CANCELLO_WORKER_ATTESA_MS; console.warn = avvisoVero; }
  await azzeraCancelloWorker();
});

test('CW-12 (revisione del Desktop R2) «spento» non è per sempre: dopo RIAPERTURA_DOPO_MS il worker si riprova', async (t) => {
  await azzeraCancelloWorker();
  const c = progetto(t, 3);
  const avvisoVero = console.warn;
  console.warn = () => {};
  process.env.TALOS_CANCELLO_WORKER_ATTESA_MS = '1';
  try {
    await premessaDellaScrittura(c, 'src/m1.ts', 'export const a = 1;\n');
    await premessaDellaScrittura(c, 'src/m1.ts', 'export const a = 2;\n');
  } finally { delete process.env.TALOS_CANCELLO_WORKER_ATTESA_MS; console.warn = avvisoVero; }
  assert.equal(statoCancelloWorker().spento, true);
  const ora = Date.now();
  assert.equal(cancelloWorkerAmmesso({ ora: ora + RIAPERTURA_DOPO_MS - 60_000 }), false, 'prima del tempo resta spento');
  assert.equal(cancelloWorkerAmmesso({ ora: ora + RIAPERTURA_DOPO_MS + 1_000 }), true, 'dopo si riprova');
  assert.equal(statoCancelloWorker().cadute, 0, 'e le cadute ripartono da zero');
  await azzeraCancelloWorker();
});

test('CW-13 (revisione del Desktop R3) le cartelle ricordate per il preriscaldamento hanno un tetto: la più vecchia esce', async (t) => {
  await azzeraCancelloWorker();
  const cartelle = [];
  for (let i = 0; i < 70; i++) {
    const c = mkdtempSync(join(tmpdir(), 'talos-cancello-radici-'));
    t.after(() => rimuoviCartellaDiProva(c));
    writeFileSync(join(c, 'a.mjs'), 'export const a = 1;\n');
    await premessaDellaScrittura(c, 'a.mjs', 'export const a = 2;\n');
    cartelle.push(c);
  }
  assert.equal(statoCancelloWorker().radiciScritte, 64);
  assert.equal(scaldaIlCancello(cartelle[0]), false, 'la più vecchia è uscita');
  assert.equal(scaldaIlCancello(cartelle[69]), true);
  await azzeraCancelloWorker();
});

test('CW-09 il tetto della memoria del worker segue il tetto del cancello (TALOS_CANCELLO_CACHE_KIB) e si può forzare', () => {
  assert.equal(limiteMemoriaWorkerMb({ ambiente: { TALOS_CANCELLO_WORKER_MB: '300' } }), 300);
  assert.equal(limiteMemoriaWorkerMb({ ambiente: { TALOS_CANCELLO_WORKER_MB: '1' } }), 4, 'mai sotto il minimo misurato: sotto, V8 abortisce il processo');
  const piccolo = limiteMemoriaWorkerMb({ ambiente: { TALOS_CANCELLO_CACHE_KIB: '64' } });
  const grande = limiteMemoriaWorkerMb({ ambiente: { TALOS_CANCELLO_CACHE_KIB: '4096' } });
  assert.ok(piccolo >= 256 && grande > piccolo && grande <= 2048, `${piccolo} / ${grande}`);
});
