/* Revisione avversaria del blocco 9 (27/10/2026), portata nel repo con la cura E-R1 (il lucchetto fra processi su consents.json e
   phones.json, `src/lucchetto-fra-processi.mjs`, e il ricordo della prima chat riapplicato invece di saltare la rilettura). Originale in
   handoff/revisione-blocco-9-prove-2026-10-27/E-rilettura-b9.test.mjs. */
/*
 * Revisione blocco 9 (27/10/2026) — pezzo E (rilettura sulla firma, `ac9a05a6a`) e il file fuso con C-R1. Due istanze VERE di
 * `creaCartelleDeiDispositivi` sugli STESSI file (la finestra e `talos remote` della CLI, che scrivono lo stesso consents.json), cartelle
 * vere in TEMP, nessuna rete. i moduli di questo repo.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync, renameSync, utimesSync } from 'node:fs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { creaCartelleDeiDispositivi } = await import(new URL('../src/remoto/cartelle-dispositivi.mjs', import.meta.url).href);
const { firmaDelFile } = await import(new URL('../src/remoto/firma-file.mjs', import.meta.url).href);

function banco(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rev-b9-cons-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const dati = join(dir, 'dati'); mkdirSync(dati);
  const X = join(dir, 'X'); const Y = join(dir, 'Y'); const chat = join(dati, 'chat');
  mkdirSync(X); mkdirSync(Y);
  const opzioni = { fileConsensi: join(dati, 'consents.json'), fileSegreto: join(dati, 'secret'), cartellaChat: chat, cartelleEscluse: [dati] };
  return { dir, X, Y, chat, file: opzioni.fileConsensi, nuova: (extra = {}) => creaCartelleDeiDispositivi({ ...opzioni, ...extra }) };
}
const nelFile = (file) => Object.fromEntries(Object.entries(JSON.parse(readFileSync(file, 'utf8')).dispositivi).map(([k, v]) => [k, v.map((x) => x.percorso)]));

test('REV-B9-E1 la CLI revoca X mentre la finestra avvia la prima chat del dispositivo (rispondi → avvio → segnaSessioneChat): il salvataggio in fila della finestra rimette X', async (t) => {
  const b = banco(t);
  const finestra = b.nuova(); const cli = b.nuova();
  await finestra.consentiInAnticipo('dev', b.X);
  const { cartellaId: idX } = await cli.consensoDi('dev', b.X) ?? {};
  assert.ok(idX, 'premessa: la CLI vede X consentita');
  const chat = await finestra.chat('dev');
  assert.equal(chat.consentita, false, 'premessa: la Chat non è ancora consentita');
  /* il dispositivo apre la sua prima chat: la carta sul PC, la persona dice «Consenti»; durante l'avvio della sessione (POST, secondi)
     dal terminale `talos remote folders revoke` toglie X */
  const { richiestaId } = await finestra.chiedi({ dispositivoId: 'dev', cartellaId: chat.cartellaId, avvio: async () => {
    await cli.revoca('dev', idX);
    const dopoRevoca = nelFile(b.file).dev;
    await finestra.segnaSessioneChat('s1', 'dev');
    t.diagnostic(`subito dopo la revoca della CLI il file dice: ${JSON.stringify(dopoRevoca)}`);
    return 's1';
  } });
  await finestra.rispondi(richiestaId, 'consentita');
  await finestra.attendiScritture();
  const finale = nelFile(b.file).dev;
  const perLaCli = (await cli.consensiDi('dev')).map((c) => c.percorso);
  const perLaFinestra = (await finestra.consensiDi('dev')).map((c) => c.percorso);
  t.diagnostic(JSON.stringify({ file: finale, cli: perLaCli, finestra: perLaFinestra }));
  assert.ok(!finale.includes(b.X), `X revocata dalla CLI è tornata nel file (${JSON.stringify(finale)}): il dispositivo ci lavora di nuovo`);
});

test('REV-B9-E2 (controllo) in sequenza la revoca della CLI regge: la finestra rilegge prima di scrivere', async (t) => {
  const b = banco(t);
  const finestra = b.nuova(); const cli = b.nuova();
  await finestra.consentiInAnticipo('dev', b.X);
  const { cartellaId: idX } = await cli.consensoDi('dev', b.X);
  await cli.revoca('dev', idX);
  await finestra.consentiInAnticipo('dev', b.Y);
  assert.deepEqual(nelFile(b.file).dev, [b.Y]);
  assert.equal(await finestra.consentita('dev', b.X), false);
});

test('REV-B9-E3 (misura) le due istanze scrivono nello stesso istante (revoca X ‖ consenti Y): chi vince', async (t) => {
  const b = banco(t);
  const finestra = b.nuova(); const cli = b.nuova();
  await finestra.consentiInAnticipo('dev', b.X);
  const { cartellaId: idX } = await cli.consensoDi('dev', b.X);
  const esiti = [];
  for (let i = 0; i < 20; i += 1) {
    await Promise.all([cli.revoca('dev', idX).catch((e) => e.code), finestra.consentiInAnticipo('dev', b.Y).catch((e) => e.code)]);
    esiti.push(nelFile(b.file).dev.includes(b.X) ? 'X-tornata' : 'ok');
    /* rimettere la scena */
    await finestra.consentiInAnticipo('dev', b.X);
    const lista = await finestra.consensiDi('dev');
    for (const c of lista) if (c.percorso === b.Y) await finestra.revoca('dev', c.cartellaId);
  }
  const tornate = esiti.filter((e) => e === 'X-tornata').length;
  t.diagnostic(`su 20 coppie simultanee, X revocata e tornata: ${tornate}`);
  /* 27/10/2026, con la cura E-R1 (il lucchetto fra processi): era 16 su 20, ora deve essere 0 */
  assert.equal(tornate, 0, `${tornate} revoche del terminale annullate da una scrittura simultanea della finestra`);
});

test('REV-B9-E4 il file sostituito con un rename (inode nuovo) mentre la finestra ha una scrittura in fila: la scrittura vince, il file esterno si perde', async (t) => {
  const b = banco(t);
  const finestra = b.nuova();
  await finestra.consentiInAnticipo('dev', b.X);
  /* un altro processo scrive Y con un rename (come scriviAtomico della CLI) */
  const esterno = { v: 1, dispositivi: { dev: [{ percorso: b.X, at: 1, da: 'anticipo' }, { percorso: b.Y, at: 2, da: 'anticipo' }] } };
  const tmp = `${b.file}.esterno.tmp`; writeFileSync(tmp, JSON.stringify(esterno)); renameSync(tmp, b.file);
  await finestra.segnaSessioneChat('s9', 'dev'); // ricordo in sospeso: si salva in fila SENZA rilettura (rilegge solo all'inizio)
  await finestra.attendiScritture();
  const finale = nelFile(b.file).dev;
  t.diagnostic(JSON.stringify(finale));
  assert.ok(finale.includes(b.Y), 'Y scritta dall\'altro processo prima del ricordo: è rimasta?');
});

test('REV-B9-E5 un file a metà scritto da un altro processo (scrittura non atomica): la finestra rilegge e lancia, poi si riprende', async (t) => {
  const b = banco(t);
  const finestra = b.nuova();
  await finestra.consentiInAnticipo('dev', b.X);
  writeFileSync(b.file, '{"v":1,"dispositivi":{"dev":[{"percorso":');
  let primo = null; try { await finestra.consentita('dev', b.X); primo = 'ok'; } catch (e) { primo = e.code; }
  writeFileSync(b.file, JSON.stringify({ v: 1, dispositivi: { dev: [{ percorso: b.X, at: 1, da: 'anticipo' }] } }));
  const dopo = await finestra.consentita('dev', b.X);
  t.diagnostic(JSON.stringify({ mentreAMeta: primo, dopo }));
  assert.equal(dopo, true);
});

test('REV-B9-E6 (misura) la firma: stessa dimensione, mtime rimesso uguale (cp -p, ripristino) dopo i 2 s', async (t) => {
  const b = banco(t);
  writeFileSync(b.file, '{"v":1,"dispositivi":{"dev":[]}}');
  const vecchio = statSync(b.file, { bigint: true });
  const adesso = () => vecchio.mtimeNs + 5_000_000_000n;
  const f1 = await firmaDelFile(fsp, b.file, { adessoNs: adesso });
  writeFileSync(b.file, '{"v":1,"dispositivi":{"xyz":[]}}');
  utimesSync(b.file, vecchio.atime, vecchio.mtime);
  const f2 = await firmaDelFile(fsp, b.file, { adessoNs: adesso });
  t.diagnostic(JSON.stringify({ f1, f2 }));
  assert.notEqual(f1, f2, 'stessa dimensione e mtime rimesso: la firma cambia lo stesso (ctime)');
});

const { creaElencoDispositivi } = await import(new URL('../src/remoto/dispositivi.mjs', import.meta.url).href);
test('REV-B9-E7 (misura) phones.json: la CLI revoca il telefono nello stesso istante in cui la finestra segna «visto» (ogni connessione): il telefono torna ammesso?', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'rev-b9-tel-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  let tornati = 0;
  for (let i = 0; i < 20; i += 1) {
    const file = join(dir, `phones-${i}.json`); // un file per giro: il tetto è 16 telefoni
    const finestra = creaElencoDispositivi({ file }); const cli = creaElencoDispositivi({ file });
    const v = await finestra.aggiungi({ endpointId: `ep${i}`, nome: `Pad ${i}` });
    await cli.elenca();
    await Promise.all([cli.revoca(v.id).catch(() => {}), finestra.visto(v.id).catch(() => {})]);
    const lettore = creaElencoDispositivi({ file });
    if (await lettore.ammesso(`ep${i}`)) tornati += 1;
  }
  t.diagnostic(`su 20 revoche fatte dalla CLI mentre la finestra segnava «visto»: telefono di nuovo ammesso ${tornati} volte`);
  assert.equal(tornati, 0, `${tornati} telefoni revocati dal terminale restano ammessi: Hermes tiene un lucchetto sul file fra processi (gateway/pairing.py:376-388), qui no`);
});

test('REV-B9-E8 (uccide il mutante ME9-2) un disco con la data a grana di 2 s (FAT/exFAT, molte chiavette e certe cartelle di rete): la CLI revoca X e consente Y, file della stessa dimensione nello stesso istante: la finestra vede la revoca', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'rev-b9-fat-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const dati = join(dir, 'dati'); mkdirSync(dati);
  const X = join(dir, 'XX'); const Y = join(dir, 'YY'); mkdirSync(X); mkdirSync(Y); // stessa lunghezza: stessa dimensione del file
  const DUE_S = 2_000_000_000n;
  const fsGrana = { ...fsp, stat: async (f, o) => {
    const s = await fsp.stat(f, { bigint: true });
    const m = (s.mtimeNs / DUE_S) * DUE_S;
    return { dev: s.dev, ino: 0n, size: s.size, mtimeNs: m, ctimeNs: m, isDirectory: () => s.isDirectory() };
  } };
  const opzioni = { fileConsensi: join(dati, 'consents.json'), fileSegreto: join(dati, 'secret'), clock: () => 1_793_000_000_000, fs: fsGrana };
  while (Date.now() % 2000 > 300) await new Promise((r) => setTimeout(r, 20)); // tutto nello stesso intervallo di 2 s
  const finestra = creaCartelleDeiDispositivi(opzioni); const cli = creaCartelleDeiDispositivi(opzioni);
  await finestra.consentiInAnticipo('dev', X);
  const dimPrima = statSync(opzioni.fileConsensi).size;
  assert.equal(await finestra.consentita('dev', X), true);
  const { cartellaId: idX } = await cli.consensoDi('dev', X);
  await cli.revoca('dev', idX);
  await cli.consentiInAnticipo('dev', Y);
  const dimDopo = statSync(opzioni.fileConsensi).size;
  const inX = await finestra.consentita('dev', X); const inY = await finestra.consentita('dev', Y);
  t.diagnostic(JSON.stringify({ dimPrima, dimDopo, finestraInX: inX, finestraInY: inY, msNelIntervallo: Date.now() % 2000 }));
  assert.equal(dimPrima, dimDopo, 'premessa: stessa dimensione');
  assert.equal(inX, false, 'la finestra lascia lavorare il dispositivo in X, revocata dalla CLI');
  assert.equal(inY, true);
});

test('REV-B9-E9 (cura E-R1, uccide il mutante «il ricordo non si riapplica») la CLI scrive, la finestra segna la prima chat: dopo la rilettura sotto il lucchetto il ricordo arriva sul disco', async (t) => {
  const b = banco(t);
  const finestra = b.nuova(); const cli = b.nuova();
  await finestra.consentiInAnticipo('dev', b.X);
  await cli.consentiInAnticipo('dev', b.Y); // il file cambia sotto la finestra
  await finestra.segnaSessioneChat('s1', 'dev');
  await finestra.attendiScritture();
  assert.equal(await b.nuova().dispositivoDellaSessioneChat('s1'), 'dev', 'the first-chat record reached the disk after the re-read');
  assert.deepEqual(nelFile(b.file).dev.sort(), [b.X, b.Y].sort(), 'and the CLI\'s write is kept');
});
