import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { creaAttesaScheda, creaLettoreScheda, creaMemoriaScheda, liberaDellaSolaScheda } from '../src/attesa-scheda.mjs';

const RIGHE_UNA = 'Available devices:\n  Vulkan0: AMD Radeon RX 9070 XT (16304 MiB, 15419 MiB free)\n';
const RIGHE_DUE = `${RIGHE_UNA}  Vulkan1: AMD Radeon(TM) Graphics (8192 MiB, 8000 MiB free)\n`;

/** Fake clock: `dormi` moves it, a read costs `costoLettura`. */
function orologio() {
  let adesso = 1_000;
  return { now: () => adesso, avanza: (ms) => { adesso += ms; }, dormi: async (ms) => { adesso += ms; } };
}

function figlioFinto({ testo = RIGHE_UNA, codice = 0, chiudeDaSolo = true } = {}) {
  const figlio = new EventEmitter();
  figlio.stdout = new EventEmitter();
  figlio.stderr = new EventEmitter();
  figlio.uccisi = 0;
  figlio.kill = () => { figlio.uccisi += 1; setImmediate(() => figlio.emit('close', null)); return true; };
  if (chiudeDaSolo) setImmediate(() => { figlio.stderr.emit('data', Buffer.from(testo)); figlio.emit('close', codice); });
  return figlio;
}

test('AS-01 the free memory of the only device; none or two say nothing', () => {
  assert.equal(liberaDellaSolaScheda(RIGHE_UNA), 15_419);
  assert.equal(liberaDellaSolaScheda(RIGHE_DUE), null, 'two devices: which one does the engine use?');
  assert.equal(liberaDellaSolaScheda('Available devices:\n'), null);
  assert.equal(liberaDellaSolaScheda(''), null);
});

test('AS-02 it comes back when the recovered memory reaches the quota of what the engine really used', async () => {
  const c = orologio();
  const letture = [10_000, 12_999, 13_000];
  const attesa = creaAttesaScheda({ leggiLibera: async () => letture.shift(), now: c.now, dormi: c.dormi });
  /* used 4.000 MiB, 75% is 3.000: 12.999 is one short, 13.000 is exactly it */
  const esito = await attesa.attendi({ liberaPrima: 14_000, liberaAperto: 10_000 });
  assert.equal(esito.esito, 'tornata');
  assert.equal(esito.liberaMiB, 13_000);
  assert.equal(letture.length, 0, 'it read until the limit and not one read less');
  assert.equal(esito.ms, 500, 'two pauses of 250 ms');
});

test('AS-03 a card already free costs one read and no pause', async () => {
  const c = orologio();
  let letture = 0;
  const attesa = creaAttesaScheda({ leggiLibera: async () => { letture += 1; return 14_000; }, now: c.now, dormi: c.dormi });
  const esito = await attesa.attendi({ liberaPrima: 14_000, liberaAperto: 10_000 });
  assert.deepEqual([esito.esito, esito.ms, letture], ['tornata', 0, 1]);
});

test('AS-04 at the ceiling it goes on and says so: a ceiling, not a gate', async () => {
  const c = orologio();
  const attesa = creaAttesaScheda({ leggiLibera: async () => 10_500, tettoMs: 1_000, now: c.now, dormi: c.dormi });
  const esito = await attesa.attendi({ liberaPrima: 14_000, liberaAperto: 10_000 });
  assert.equal(esito.esito, 'scaduta');
  assert.equal(esito.liberaMiB, 10_500);
  assert.equal(esito.ms, 1_000);
});

test('AS-05 a failed read never blocks: it opens as today', async () => {
  const c = orologio();
  for (const leggiLibera of [async () => null, async () => { throw new Error('rotto'); }, () => { throw new Error('rotto prima della promessa'); }]) {
    const esito = await creaAttesaScheda({ leggiLibera, now: c.now, dormi: c.dormi }).attendi({ liberaPrima: 14_000, liberaAperto: 10_000 });
    assert.equal(esito.esito, 'saltata');
  }
});

test('AS-06 without both measures, or with an engine that used nothing, it does not even read', async () => {
  const c = orologio();
  let letture = 0;
  const attesa = creaAttesaScheda({ leggiLibera: async () => { letture += 1; return 1; }, now: c.now, dormi: c.dormi });
  for (const misure of [{}, { liberaPrima: 14_000 }, { liberaAperto: 10_000 }, { liberaPrima: 10_000, liberaAperto: 10_000 }, { liberaPrima: 9_000, liberaAperto: 10_000 }, { liberaPrima: null, liberaAperto: null }]) {
    assert.equal((await attesa.attendi(misure)).esito, 'saltata', JSON.stringify(misure));
  }
  assert.equal(letture, 0);
});

test('AS-07 the Stop wins: before the first read, during a read, during a pause, and nothing is read after it', async () => {
  const c = orologio();
  const fermo = new AbortController();
  fermo.abort();
  let letture = 0;
  const prima = await creaAttesaScheda({ leggiLibera: async () => { letture += 1; return 1; }, now: c.now, dormi: c.dormi })
    .attendi({ liberaPrima: 14_000, liberaAperto: 10_000, signal: fermo.signal });
  assert.deepEqual([prima.esito, letture], ['annullata', 0]);

  const durante = new AbortController();
  const inLettura = await creaAttesaScheda({ leggiLibera: async () => { letture += 1; durante.abort(); return 14_000; }, now: c.now, dormi: c.dormi })
    .attendi({ liberaPrima: 14_000, liberaAperto: 10_000, signal: durante.signal });
  assert.equal(inLettura.esito, 'annullata', 'a read that arrives after the Stop does not decide');

  const inPausa = new AbortController();
  letture = 0;
  const pausa = await creaAttesaScheda({ leggiLibera: async () => { letture += 1; return 10_500; }, now: c.now, dormi: async () => { inPausa.abort(); } })
    .attendi({ liberaPrima: 14_000, liberaAperto: 10_000, signal: inPausa.signal });
  assert.deepEqual([pausa.esito, letture], ['annullata', 1]);
});

test('AS-08 the real pause ends at the Stop, not at its own time', async () => {
  const fermo = new AbortController();
  const attesa = creaAttesaScheda({ leggiLibera: async () => 10_500, ogniMs: 60_000, tettoMs: 120_000 });
  const inizio = performance.now();
  setTimeout(() => fermo.abort(), 20);
  const esito = await attesa.attendi({ liberaPrima: 14_000, liberaAperto: 10_000, signal: fermo.signal });
  assert.equal(esito.esito, 'annullata');
  assert.ok(performance.now() - inizio < 5_000, 'it did not sleep the minute');
});

test('AS-09 reads never overlap: the next one starts when the last one ends, however slow', async () => {
  let inCorso = 0;
  let massimo = 0;
  let letture = 0;
  const leggiLibera = async () => {
    inCorso += 1;
    massimo = Math.max(massimo, inCorso);
    letture += 1;
    await new Promise((fatto) => { setTimeout(fatto, 15); });
    inCorso -= 1;
    return letture >= 4 ? 14_000 : 10_500;
  };
  const esito = await creaAttesaScheda({ leggiLibera, ogniMs: 1 }).attendi({ liberaPrima: 14_000, liberaAperto: 10_000 });
  assert.equal(esito.esito, 'tornata');
  assert.equal(massimo, 1);
  assert.equal(letture, 4);
});

test('AS-10 each read is told the time left, so a slow one cannot outlive the ceiling', async () => {
  const c = orologio();
  const tetti = [];
  const leggiLibera = async ({ tettoMs }) => { tetti.push(tettoMs); c.avanza(300); return 10_500; };
  const esito = await creaAttesaScheda({ leggiLibera, ogniMs: 100, tettoMs: 1_000, now: c.now, dormi: c.dormi }).attendi({ liberaPrima: 14_000, liberaAperto: 10_000 });
  assert.equal(esito.esito, 'scaduta');
  assert.deepEqual(tetti, [1_000, 600, 200]);
});

test('AS-11 a read cut by the ceiling is the ceiling, not a broken read', async () => {
  const c = orologio();
  const leggiLibera = async ({ tettoMs }) => { c.avanza(tettoMs); return null; };
  const esito = await creaAttesaScheda({ leggiLibera, tettoMs: 1_000, now: c.now, dormi: c.dormi }).attendi({ liberaPrima: 14_000, liberaAperto: 10_000 });
  assert.equal(esito.esito, 'scaduta');
});

test('AS-12 the reader runs the engine\'s own program and reads stderr or stdout', async () => {
  const chiamate = [];
  const leggi = creaLettoreScheda({ binaryPath: 'C:/m/llama-server.exe', spawnImpl: (programma, argomenti, opzioni) => { chiamate.push([programma, argomenti, opzioni]); return figlioFinto(); } });
  assert.equal(await leggi(), 15_419);
  assert.equal(chiamate[0][0], 'C:/m/llama-server.exe');
  assert.deepEqual(chiamate[0][1], ['--list-devices']);
  assert.equal(chiamate[0][2].windowsHide, true);
  assert.equal(chiamate[0][2].shell, false);
});

test('AS-13 the reader says nothing on a bad exit, on a spawn error and on two devices', async () => {
  assert.equal(await creaLettoreScheda({ binaryPath: 'x', spawnImpl: () => figlioFinto({ codice: 1 }) })(), null);
  assert.equal(await creaLettoreScheda({ binaryPath: 'x', spawnImpl: () => figlioFinto({ testo: RIGHE_DUE }) })(), null);
  const rotto = () => { const f = figlioFinto({ chiudeDaSolo: false }); setImmediate(() => f.emit('error', new Error('ENOENT'))); return f; };
  const inizio = performance.now();
  assert.equal(await creaLettoreScheda({ binaryPath: 'x', spawnImpl: rotto })(), null);
  assert.ok(performance.now() - inizio < 2_000, 'a spawn error answers at once, not at the ceiling');
  assert.equal(await creaLettoreScheda({ binaryPath: 'x', spawnImpl: () => { throw new Error('spawn'); } })(), null);
});

test('AS-14 the Stop kills the read in course, and the wait ends only when that process is gone', async () => {
  const fermo = new AbortController();
  const figlio = figlioFinto({ chiudeDaSolo: false });
  let uscito = false;
  const leggi = creaLettoreScheda({ binaryPath: 'x', spawnImpl: () => { figlio.once('close', () => { uscito = true; }); return figlio; } });
  const attesa = creaAttesaScheda({ leggiLibera: leggi }).attendi({ liberaPrima: 14_000, liberaAperto: 10_000, signal: fermo.signal });
  await new Promise((fatto) => { setImmediate(fatto); });
  fermo.abort();
  const esito = await attesa;
  assert.equal(esito.esito, 'annullata');
  assert.equal(figlio.uccisi, 1);
  assert.equal(uscito, true, 'no process alive after the answer');
});

test('AS-14b a read stopped says nothing even if the process managed to end well', async () => {
  const fermo = new AbortController();
  const figlio = figlioFinto({ chiudeDaSolo: false });
  figlio.kill = () => { figlio.uccisi += 1; setImmediate(() => { figlio.stderr.emit('data', Buffer.from(RIGHE_UNA)); figlio.emit('close', 0); }); return true; };
  const lettura = creaLettoreScheda({ binaryPath: 'x', spawnImpl: () => figlio })({ signal: fermo.signal });
  fermo.abort();
  assert.equal(await lettura, null);
});

test('AS-15 a read that hangs is killed at its ceiling', async () => {
  const figlio = figlioFinto({ chiudeDaSolo: false });
  const leggi = creaLettoreScheda({ binaryPath: 'x', tettoMs: 10, spawnImpl: () => figlio });
  assert.equal(await leggi(), null);
  assert.equal(figlio.uccisi, 1);
});

test('AS-16 the reader takes the shorter of its own ceiling and the time left', async () => {
  const figlio = figlioFinto({ chiudeDaSolo: false });
  const leggi = creaLettoreScheda({ binaryPath: 'x', tettoMs: 60_000, spawnImpl: () => figlio });
  const inizio = performance.now();
  assert.equal(await leggi({ tettoMs: 10 }), null);
  assert.ok(performance.now() - inizio < 5_000);
});

test('AS-17 a Stop already given starts no process', async () => {
  const fermo = new AbortController();
  fermo.abort();
  let partiti = 0;
  const leggi = creaLettoreScheda({ binaryPath: 'x', spawnImpl: () => { partiti += 1; return figlioFinto(); } });
  assert.equal(await leggi({ signal: fermo.signal }), null);
  assert.equal(partiti, 0);
});

test('AS-18 a process that talks too much cannot fill the memory', async () => {
  const leggi = creaLettoreScheda({ binaryPath: 'x', spawnImpl: () => {
    const f = figlioFinto({ chiudeDaSolo: false });
    setImmediate(() => { for (let i = 0; i < 2_000; i += 1) f.stdout.emit('data', Buffer.alloc(1_024, 97)); f.stdout.emit('data', Buffer.from(RIGHE_UNA)); f.emit('close', 0); });
    return f;
  } });
  assert.equal(await leggi(), 15_419, 'the last part is what stays');
  const lungo = creaLettoreScheda({ binaryPath: 'x', spawnImpl: () => {
    const f = figlioFinto({ chiudeDaSolo: false });
    setImmediate(() => { f.stdout.emit('data', Buffer.from(RIGHE_UNA)); for (let i = 0; i < 70; i += 1) f.stdout.emit('data', Buffer.alloc(1_024, 97)); f.emit('close', 0); });
    return f;
  } });
  assert.equal(await lungo(), null, 'beyond 64 KB the head is gone: the text has a ceiling');
});

/** A card with a list of reads to give, and the record of who asked. */
function schedaFinta(letture) {
  const c = orologio();
  const chieste = [];
  const leggi = async (opzioni) => { chieste.push(opzioni); const v = letture.shift(); if (v instanceof Error) throw v; return v ?? null; };
  const attese = [];
  const attesa = { attendi: async (o) => { attese.push(o); return creaAttesaScheda({ leggiLibera: leggi, now: c.now, dormi: c.dormi }).attendi(o); } };
  return { memoria: creaMemoriaScheda({ leggi, attesa }), chieste, attese };
}
const dopoLaLettura = () => new Promise((fatto) => { setImmediate(fatto); });

test('AS-19 the first opening only reads; the next one waits on what the first really used', async () => {
  const { memoria, attese } = schedaFinta([14_000, 10_000, 14_000, 14_000]);
  assert.equal(await memoria.primaDiAprire(), null, 'nothing to wait for');
  memoria.aperto();
  await dopoLaLettura();
  const esito = await memoria.primaDiAprire();
  assert.deepEqual(attese.map(({ liberaPrima, liberaAperto }) => [liberaPrima, liberaAperto]), [[14_000, 10_000]]);
  assert.equal(esito.esito, 'tornata');
  assert.equal(memoria.ultima(), esito, 'the time of the wait stays readable for the log and the bench');
});

test('AS-20 the reading of the wait is the reading before the next engine: no second process', async () => {
  const { memoria, chieste } = schedaFinta([14_000, 10_000, 13_500, 9_000]);
  await memoria.primaDiAprire();
  memoria.aperto();
  await dopoLaLettura();
  await memoria.primaDiAprire();
  assert.equal(chieste.length, 3);
  memoria.aperto();
  await dopoLaLettura();
  assert.equal(chieste.length, 4);
  const { attese, memoria: altra } = schedaFinta([]);
  assert.equal(altra.liberando(), false);
  assert.equal(attese.length, 0);
});

test('AS-21 the router\'s change of model neither waits nor reads, and a stop after two models waits for both', async () => {
  const { memoria, attese, chieste } = schedaFinta([14_000, 10_000, 6_000, 12_000]);
  await memoria.primaDiAprire();
  memoria.aperto();
  await dopoLaLettura();
  assert.equal(await memoria.primaDiAprire({ liberato: false }), null);
  assert.equal(attese.length, 0);
  assert.equal(chieste.length, 2, 'coming back to an open model stays instant');
  memoria.aperto();
  await dopoLaLettura();
  await memoria.primaDiAprire();
  assert.deepEqual(attese.map(({ liberaPrima, liberaAperto }) => [liberaPrima, liberaAperto]), [[14_000, 6_000]]);
});

test('AS-22 a failed reading at ready never rises: the next opening is skipped', async () => {
  const { memoria } = schedaFinta([14_000, new Error('rotto'), 14_000]);
  await memoria.primaDiAprire();
  memoria.aperto();
  await dopoLaLettura();
  assert.equal((await memoria.primaDiAprire()).esito, 'saltata', 'the card is as it was before: nothing to wait for');
});

test('AS-22b an opening cancelled before it was ready: what is missing now against before is its memory, and that is what is waited for', async () => {
  const { memoria, attese, chieste } = schedaFinta([14_000, 11_000, 13_500]);
  await memoria.primaDiAprire();
  /* no `aperto`: the Stop came first */
  const esito = await memoria.primaDiAprire();
  assert.deepEqual(attese.map(({ liberaPrima, liberaAperto }) => [liberaPrima, liberaAperto]), [[14_000, 11_000]]);
  assert.equal(esito.esito, 'tornata');
  assert.equal(chieste.length, 3);
});

test('AS-23 a failed reading before opening never rises, and a missing first measure asks nothing at ready', async () => {
  const { memoria, chieste } = schedaFinta([new Error('rotto')]);
  assert.equal(await memoria.primaDiAprire(), null);
  memoria.aperto();
  await dopoLaLettura();
  assert.equal(chieste.length, 1);
});

test('AS-24 a reading at ready still running is cut before the next opening, and its figure does not count', async () => {
  const chieste = [];
  let rilascia;
  const leggi = ({ signal } = {}) => {
    chieste.push(signal);
    if (chieste.length === 1) return Promise.resolve(14_000);
    if (chieste.length === 3) return Promise.resolve(12_000);
    return new Promise((fatto) => { rilascia = fatto; signal.addEventListener('abort', () => fatto(14_000), { once: true }); });
  };
  const attese = [];
  const memoria = creaMemoriaScheda({ leggi, attesa: { attendi: async (o) => { attese.push(o); return { esito: 'tornata', ms: 0, liberaMiB: 1 }; } } });
  await memoria.primaDiAprire();
  memoria.aperto();
  memoria.aperto();
  assert.equal(chieste.length, 2, 'one at a time');
  await memoria.primaDiAprire();
  assert.equal(chieste[1].aborted, true);
  assert.deepEqual(attese.map((o) => o.liberaAperto), [12_000], 'a figure read after the stop would be free memory, not the engine');
  assert.equal(typeof rilascia, 'function');
});

test('AS-24b the next opening reads only when the reading at ready has really ended', async () => {
  let inCorso = 0;
  let massimo = 0;
  let quante = 0;
  const leggi = async ({ signal } = {}) => {
    quante += 1;
    inCorso += 1;
    massimo = Math.max(massimo, inCorso);
    /* the second one, at ready, takes a while to die after the Stop, as a process does */
    if (quante === 2) await new Promise((fatto) => { signal.addEventListener('abort', () => setTimeout(fatto, 10), { once: true }); });
    inCorso -= 1;
    return 14_000;
  };
  const memoria = creaMemoriaScheda({ leggi, attesa: { attendi: async () => ({ esito: 'saltata', ms: 0, liberaMiB: null }) } });
  await memoria.primaDiAprire();
  memoria.aperto();
  await memoria.primaDiAprire();
  assert.equal(quante, 3, 'the reading of the wait is used again: no fourth process');
  assert.equal(massimo, 1, 'two reads together');
});

test('AS-24c an opening that failed leaves nothing to wait for the next time', async () => {
  const { memoria, attese } = schedaFinta([14_000, 10_000, 14_000, 14_000]);
  await memoria.primaDiAprire();
  memoria.aperto();
  await dopoLaLettura();
  await memoria.primaDiAprire();
  /* the engine failed: no `aperto`, so the measure of the old one must not be used twice */
  assert.equal((await memoria.primaDiAprire()).esito, 'saltata');
  assert.deepEqual(attese.map((o) => o.liberaAperto), [10_000, 14_000]);
});

test('AS-25 `liberando` is true only during the wait, and the Stop leaves it false and reads no more', async () => {
  const fermo = new AbortController();
  const viste = [];
  let memoria;
  const letture = [14_000, 10_000];
  let dopoIlFerma = 0;
  const leggi = async () => { if (letture.length) return letture.shift(); dopoIlFerma += 1; return null; };
  memoria = creaMemoriaScheda({ leggi, attesa: { attendi: async () => { viste.push(memoria.liberando()); fermo.abort(); return { esito: 'annullata', ms: 3, liberaMiB: null }; } } });
  await memoria.primaDiAprire();
  memoria.aperto();
  await dopoLaLettura();
  const esito = await memoria.primaDiAprire({ signal: fermo.signal });
  assert.equal(esito.esito, 'annullata');
  assert.deepEqual(viste, [true]);
  assert.equal(memoria.liberando(), false);
  assert.equal(dopoIlFerma, 0);
});

test('AS-26 a wait that throws leaves `liberando` false', async () => {
  const letture = [14_000, 10_000];
  const memoria = creaMemoriaScheda({ leggi: async () => letture.shift(), attesa: { attendi: async () => { throw new Error('rotto'); } } });
  await memoria.primaDiAprire();
  memoria.aperto();
  await dopoLaLettura();
  await assert.rejects(memoria.primaDiAprire(), /rotto/u);
  assert.equal(memoria.liberando(), false);
});
