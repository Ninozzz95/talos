import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MASSIMO_BYTE_PER_FILE, cartellaTroppoLarga, contaFile, creaPuntiDiRipristino } from '../src/punti-di-ripristino.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 18/10/2026 — R5.11, «Annulla le modifiche ai file» come Hermes (owner: «Come Hermes, PC e telefono»). Le prove usano il git
 * VERO della macchina su cartelle temporanee: l'archivio ombra sta in una cartella separata dal progetto, come sul desktop (PO-26).
 */
async function banco() {
  const radice = await mkdtemp(join(tmpdir(), 'talos-punti-'));
  const progetto = join(radice, 'progetto');
  const dati = join(radice, 'dati');
  await mkdir(join(progetto, 'src'), { recursive: true });
  await writeFile(join(progetto, 'src', 'a.txt'), 'uno\n');
  await writeFile(join(progetto, 'b.txt'), 'bi\r\nci\r\n'); // CRLF: deve tornare byte per byte
  await writeFile(join(progetto, '.gitattributes'), '* text=auto eol=lf\n'); // un progetto che normalizza: non deve toccare i byte
  let t = Date.parse('2026-10-18T12:00:00Z');
  const punti = creaPuntiDiRipristino({ cartellaDelloStore: async () => dati, clock: () => (t += 1000) });
  /** Un attrezzo che scrive, come lo vede il registro: prima, la scrittura, dopo. */
  const scrive = async (sessionId, turno, rel, contenuto) => {
    await punti.primaDiScrivere({ sessionId, turno, progetto, percorso: rel });
    if (contenuto === null) await (await import('node:fs/promises')).rm(join(progetto, rel), { force: true });
    else { await mkdir(join(progetto, rel, '..'), { recursive: true }); await writeFile(join(progetto, rel), contenuto); }
    await punti.dopoLaScrittura({ progetto, chiamante: sessionId });
  };
  return { radice, progetto, dati, punti, scrive, leggi: (rel) => readFile(join(progetto, rel)), via: () => rimuoviCartellaDiProvaAttesa(radice) };
}

test('PDR-01 una foto per turno, prima della prima scrittura; la seconda scrittura dello stesso turno non ne fa un\'altra', async () => {
  const b = await banco();
  try {
    const r1 = await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: 'src/a.txt' });
    assert.equal(r1.fatto, true);
    const r2 = await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: 'b.txt' });
    assert.equal(r2.motivo, 'gia-fatto');
    const r3 = await b.punti.primaDiScrivere({ sessionId: 's1', turno: 2, progetto: b.progetto });
    assert.equal(r3.fatto, true);
    const el = await b.punti.elenco({ sessionId: 's1', progetto: b.progetto });
    assert.deepEqual(el.map((p) => [p.turno, p.annullabile]), [[1, true], [2, true]]);
    await assert.rejects(stat(join(b.progetto, '.git')), { code: 'ENOENT' }, 'nessun .git nel progetto: l’archivio sta fuori');
  } finally { await b.via(); }
});

test('PDR-02 annulla dal turno 1: i file scritti da TALOS tornano BYTE PER BYTE, quelli creati spariscono, quelli cancellati tornano', async () => {
  const b = await banco();
  try {
    const crlfPrima = await b.leggi('b.txt');
    await b.scrive('s1', 1, 'src/a.txt', 'cambiato\n');
    await b.scrive('s1', 1, 'nuovo/c.txt', 'creato\n');
    await b.scrive('s1', 1, 'b.txt', null); // cancellato dall'agente
    const ant = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal(ant.ok, true);
    assert.deepEqual(ant.ripristina.map((x) => `${x.stato} ${x.percorso}`).sort(), ['A nuovo/c.txt', 'D b.txt', 'M src/a.txt']);
    assert.deepEqual(ant.salta, []);
    assert.match(ant.diff, /-uno\n\+cambiato/);
    const r = await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal(r.ok, true);
    assert.equal((await b.leggi('src/a.txt')).toString(), 'uno\n');
    assert.deepEqual(await b.leggi('b.txt'), crlfPrima, 'CRLF intatto nonostante .gitattributes del progetto');
    await assert.rejects(stat(join(b.progetto, 'nuovo', 'c.txt')), { code: 'ENOENT' });
  } finally { await b.via(); }
});

test('PDR-03 al contrario: un file che la persona ha toccato DOPO l\'agente si salta e resta com\'è; uno mai scritto da TALOS pure', async () => {
  const b = await banco();
  try {
    await b.scrive('s1', 1, 'src/a.txt', 'agente\n');
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'persona\n'); // la persona ritocca
    await writeFile(join(b.progetto, 'b.txt'), 'da un comando\n'); // cambiato fuori dagli attrezzi di scrittura (shell)
    const ant = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.deepEqual(ant.ripristina, []);
    assert.deepEqual(ant.salta.map((x) => `${x.percorso}:${x.motivo}`).sort(), ['b.txt:non-di-talos', 'src/a.txt:persona']);
    const r = await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.deepEqual(r.ripristinati, []);
    assert.equal((await b.leggi('src/a.txt')).toString(), 'persona\n');
    assert.equal((await b.leggi('b.txt')).toString(), 'da un comando\n');
  } finally { await b.via(); }
});

test('PDR-04 la persona può includere un file saltato, per nome: si rimette solo quello', async () => {
  const b = await banco();
  try {
    await b.scrive('s1', 1, 'src/a.txt', 'agente\n');
    await writeFile(join(b.progetto, 'b.txt'), 'da un comando\n');
    const r = await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1, includi: ['b.txt', 'inventato.txt'] });
    assert.deepEqual(r.ripristinati.sort(), ['b.txt', 'src/a.txt']);
    assert.equal((await b.leggi('b.txt')).toString(), 'bi\r\nci\r\n');
  } finally { await b.via(); }
});

test('PDR-05 annullare dal turno 2 tiene il turno 1; e l\'annullamento stesso lascia un punto «prima di annullare»', async () => {
  const b = await banco();
  try {
    await b.scrive('s1', 1, 'src/a.txt', 'turno1\n');
    await b.scrive('s1', 2, 'src/a.txt', 'turno2\n');
    const r = await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 2 });
    assert.deepEqual(r.ripristinati, ['src/a.txt']);
    assert.equal((await b.leggi('src/a.txt')).toString(), 'turno1\n');
    const s = JSON.parse(await readFile(join(b.dati, 'sessioni', 's1.json'), 'utf8'));
    assert.equal(s.punti.at(-1).tipo, 'prima-di-annullare');
    assert.ok(/^[0-9a-f]{40}/.test(s.punti.at(-1).commit));
  } finally { await b.via(); }
});

test('PDR-06 un turno senza un suo punto usa il primo DOPO; prima di ogni punto: «nessun-punto»', async () => {
  const b = await banco();
  try {
    await b.scrive('s1', 3, 'src/a.txt', 'tre\n');
    const ant = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal(ant.turno, 3);
    const nessuno = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 4 });
    assert.deepEqual([nessuno.ok, nessuno.motivo], [false, 'nessun-punto']);
  } finally { await b.via(); }
});

test('PDR-07 le scritture FUORI dal progetto si contano e si dicono (non si possono annullare)', async () => {
  const b = await banco();
  try {
    await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: join(b.radice, 'fuori.txt') });
    await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: join(b.radice, 'fuori2.txt') });
    const el = await b.punti.elenco({ sessionId: 's1', progetto: b.progetto });
    assert.equal(el[0].fuori, 2);
    const ant = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal(ant.fuori.length, 2);
  } finally { await b.via(); }
});

test('PDR-08 una cartella troppo larga (radice del disco, home) non si fotografa; argomenti storti non lanciano', async () => {
  assert.equal(cartellaTroppoLarga(process.platform === 'win32' ? 'C:\\' : '/'), true);
  assert.equal(cartellaTroppoLarga((await import('node:os')).homedir()), true);
  assert.equal(cartellaTroppoLarga(join(tmpdir(), 'x')), false);
  const punti = creaPuntiDiRipristino({ cartellaDelloStore: async () => { throw new Error('mai'); } });
  assert.equal((await punti.primaDiScrivere({ sessionId: '../x', turno: 1, progetto: 'C:\\p' })).motivo, 'argomenti');
  assert.equal((await punti.primaDiScrivere({ sessionId: 's', turno: 1, progetto: tmpdir() })).motivo, 'store', 'un guasto dello store è un motivo, non un\'eccezione');
});

test('PDR-09 un file oltre i 10 MB non entra nella foto e non risulta né cambiato né cancellato', async () => {
  const b = await banco();
  try {
    await writeFile(join(b.progetto, 'grande.bin'), Buffer.alloc(MASSIMO_BYTE_PER_FILE + 1, 1));
    await b.scrive('s1', 1, 'src/a.txt', 'x\n');
    await writeFile(join(b.progetto, 'grande.bin'), Buffer.alloc(MASSIMO_BYTE_PER_FILE + 1, 2)); // cambia DOPO la foto
    await writeFile(join(b.progetto, 'grande-nuovo.bin'), Buffer.alloc(MASSIMO_BYTE_PER_FILE + 1, 3)); // e uno nasce
    const ant = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.deepEqual(ant.ripristina.map((x) => x.percorso), ['src/a.txt']);
    assert.deepEqual(ant.salta, [], 'i file grandi non risultano né cambiati né nuovi');
    assert.deepEqual([...ant.troppoGrandi].sort(), ['grande-nuovo.bin', 'grande.bin'], 'e si dicono a parte');
  } finally { await b.via(); }
});

test('PDR-10 il conteggio salta le cartelle escluse e si ferma al tetto', async () => {
  const b = await banco();
  try {
    await mkdir(join(b.progetto, 'node_modules', 'p'), { recursive: true });
    for (let i = 0; i < 5; i++) await writeFile(join(b.progetto, 'node_modules', 'p', `${i}.js`), '');
    assert.equal(await contaFile(b.progetto), 3);
    assert.equal(await contaFile(b.progetto, 1), 2);
    const punti = creaPuntiDiRipristino({ cartellaDelloStore: async () => b.dati, contaFileFn: async () => 60_000 });
    const r = await punti.primaDiScrivere({ sessionId: 's9', turno: 1, progetto: b.progetto });
    assert.deepEqual([r.fatto, r.motivo], [false, 'troppi-file']);
    const el = await punti.elenco({ sessionId: 's9', progetto: b.progetto });
    assert.deepEqual([el[0].annullabile, el[0].motivo], [false, 'troppi-file']);
  } finally { await b.via(); }
});

test('PDR-12 «Rifai» rimette com\'erano prima dell\'annullamento i file che l\'annullamento aveva cambiato, una volta sola', async () => {
  const b = await banco();
  try {
    await b.scrive('s1', 1, 'src/a.txt', 'agente\n');
    await b.scrive('s1', 1, 'nuovo.txt', 'creato\n');
    await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal((await b.leggi('src/a.txt')).toString(), 'uno\n');
    const r = await b.punti.rifai({ sessionId: 's1', progetto: b.progetto });
    assert.deepEqual([r.ok, [...r.rifatti].sort(), r.saltati], [true, ['nuovo.txt', 'src/a.txt'], []]);
    assert.equal((await b.leggi('src/a.txt')).toString(), 'agente\n');
    assert.equal((await b.leggi('nuovo.txt')).toString(), 'creato\n');
    assert.equal((await b.punti.rifai({ sessionId: 's1', progetto: b.progetto })).motivo, 'gia-rifatto');
    /* e dopo il «Rifai» i file sono di nuovo di TALOS: un secondo annullamento li rimette */
    const ant = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.deepEqual(ant.ripristina.map((x) => x.percorso).sort(), ['nuovo.txt', 'src/a.txt']);
  } finally { await b.via(); }
});

test('PDR-13 al contrario: un file toccato DOPO l\'annullamento il «Rifai» lo salta e lo lascia com\'è; senza annullamenti non c\'è niente da rifare', async () => {
  const b = await banco();
  try {
    assert.equal((await b.punti.rifai({ sessionId: 's1', progetto: b.progetto })).motivo, 'niente-da-rifare');
    await b.scrive('s1', 1, 'src/a.txt', 'agente\n');
    await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'persona dopo\n');
    const r = await b.punti.rifai({ sessionId: 's1', progetto: b.progetto });
    assert.deepEqual([r.rifatti, r.saltati], [[], ['src/a.txt']]);
    assert.equal((await b.leggi('src/a.txt')).toString(), 'persona dopo\n');
  } finally { await b.via(); }
});

test('PDR-11 due conversazioni nello stesso progetto: le scritture in corso non si mescolano', async () => {
  const b = await banco();
  try {
    await b.punti.primaDiScrivere({ sessionId: 'sa', turno: 1, progetto: b.progetto, percorso: 'src/a.txt' });
    await b.punti.primaDiScrivere({ sessionId: 'sb', turno: 1, progetto: b.progetto, percorso: 'b.txt' });
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'da A\n');
    await b.punti.dopoLaScrittura({ progetto: b.progetto, chiamante: 'sa' }); // A ha finito, B non ancora scritto
    await writeFile(join(b.progetto, 'b.txt'), 'da B\n');
    await b.punti.dopoLaScrittura({ progetto: b.progetto, chiamante: 'sb' });
    const ant = await b.punti.anteprima({ sessionId: 'sb', progetto: b.progetto, turno: 1 });
    assert.ok(ant.ripristina.some((x) => x.percorso === 'b.txt'), 'la scrittura di B è registrata come di TALOS');
  } finally { await b.via(); }
});
