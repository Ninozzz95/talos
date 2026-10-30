/*
 * R-28 (29/10/2026 notte; misura della Performance: su 1.414 file JavaScript un file_edit costava 270-400 ms di sola lettura del disco
 * e di espressioni regolari). `fontiDaDisco.leggiSpazio` ricorda il testo per (dimensione, data di modifica) e rilegge solo ciò che
 * cambia; un file con la data a meno di un secondo dalla lettura si rilegge sempre (racy git). Ogni regola col suo verso contrario.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fontiDaDisco, svuotaCacheCancello } from '../src/kernel/dist/kernelPerIlBanco.js';
import { premessaDellaScrittura } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const UN_ORA_FA = Date.now() - 3_600_000;
function discoFinto({ chiave = 'C:\\finta', file }) {
  const letture = [];
  return {
    letture,
    disco: {
      ...(chiave ? { chiave } : {}),
      async elenca(cartella) {
        if (cartella) return [];
        return [...file].map(([nome, f]) => ({ nome, cartella: false, byte: f.testo.length, mtimeMs: f.mtimeMs }));
      },
      async leggi(p) { letture.push(p); return file.get(p).testo; },
    },
  };
}

test('CANC-IO-01 la seconda lettura dello spazio non rilegge i file invariati; un file con data o dimensione nuova sì', async () => {
  svuotaCacheCancello();
  const file = new Map([['a.mjs', { testo: 'export const a = 1;\n', mtimeMs: UN_ORA_FA }], ['b.mjs', { testo: 'export const b = 2;\n', mtimeMs: UN_ORA_FA }]]);
  const { disco, letture } = discoFinto({ file });
  const primo = await fontiDaDisco(disco).leggiSpazio();
  assert.deepEqual(letture.sort(), ['a.mjs', 'b.mjs']);
  letture.length = 0;
  const secondo = await fontiDaDisco(disco).leggiSpazio();
  assert.deepEqual(letture, [], 'niente da rileggere');
  assert.deepEqual(secondo.sorgenti, primo.sorgenti);
  file.set('a.mjs', { testo: 'export const a = 9;\n', mtimeMs: UN_ORA_FA + 5_000 }); // stessa dimensione, data nuova
  file.set('b.mjs', { testo: 'export const bb = 22;\n', mtimeMs: UN_ORA_FA }); // stessa data, dimensione nuova
  const terzo = await fontiDaDisco(disco).leggiSpazio();
  assert.deepEqual(letture.sort(), ['a.mjs', 'b.mjs']);
  assert.equal(terzo.sorgenti.find((s) => s.percorso === 'a.mjs').testo, 'export const a = 9;\n');
  assert.equal(terzo.sorgenti.find((s) => s.percorso === 'b.mjs').testo, 'export const bb = 22;\n');
});

test('CANC-IO-02 AL CONTRARIO (racy git): un file con la data a meno di un secondo dalla lettura si rilegge sempre, anche con data e dimensione uguali', async () => {
  svuotaCacheCancello();
  const appenaScritto = Date.now();
  const file = new Map([['c.mjs', { testo: 'export const c = 1;\n', mtimeMs: appenaScritto }]]);
  const { disco, letture } = discoFinto({ file });
  await fontiDaDisco(disco).leggiSpazio();
  file.set('c.mjs', { testo: 'export const c = 2;\n', mtimeMs: appenaScritto }); // riscritto nello stesso istante: niente cambia fuori
  const dopo = await fontiDaDisco(disco).leggiSpazio();
  assert.equal(letture.length, 2, 'riletto');
  assert.equal(dopo.sorgenti[0].testo, 'export const c = 2;\n');
});

test('CANC-IO-06 (revisione della CLI) un disco FAT32/exFAT tiene la data a passi di 2 s: un file letto 1,5 s dopo la sua data e riscritto prima del passo dopo si rilegge', async () => {
  svuotaCacheCancello();
  /* la data che FAT conserva (un passo di 2 s, arrotondato in basso) e la lettura 1,5 s dopo: il caso della CLI. Fissata a 1,5 s
     esatti e non ricalcolata col passo, perché l'arrotondamento sposterebbe la data fino a 3,5 s indietro e la prova dipenderebbe
     dall'orologio */
  const scrittoAlle = Date.now() - 1500;
  const file = new Map([['g.mjs', { testo: 'export const g = 1;\n', mtimeMs: scrittoAlle }]]);
  const { disco, letture } = discoFinto({ file });
  await fontiDaDisco(disco).leggiSpazio();
  file.set('g.mjs', { testo: 'export const g = 2;\n', mtimeMs: scrittoAlle }); // riscritto nello stesso passo: data e dimensione uguali
  const dopo = await fontiDaDisco(disco).leggiSpazio();
  assert.equal(letture.length, 2, 'un file con la data dentro la finestra incerta non si serve dalla memoria');
  assert.equal(dopo.sorgenti[0].testo, 'export const g = 2;\n');
});

test('CANC-IO-03 un disco senza la sua cartella (il banco, le prove) si legge tutto ogni volta, come prima', async () => {
  svuotaCacheCancello();
  const file = new Map([['d.mjs', { testo: 'export const d = 1;\n', mtimeMs: UN_ORA_FA }]]);
  const { disco, letture } = discoFinto({ chiave: null, file });
  await fontiDaDisco(disco).leggiSpazio();
  await fontiDaDisco(disco).leggiSpazio();
  assert.equal(letture.length, 2);
});

test('CANC-IO-04 un file tolto non torna dalla memoria; rimesso, si rilegge', async () => {
  svuotaCacheCancello();
  const file = new Map([['e.mjs', { testo: 'export const e = 1;\n', mtimeMs: UN_ORA_FA }], ['f.mjs', { testo: 'export const f = 1;\n', mtimeMs: UN_ORA_FA }]]);
  const { disco, letture } = discoFinto({ file });
  await fontiDaDisco(disco).leggiSpazio();
  const f = file.get('f.mjs');
  file.delete('f.mjs');
  const senza = await fontiDaDisco(disco).leggiSpazio();
  assert.deepEqual(senza.sorgenti.map((s) => s.percorso), ['e.mjs']);
  letture.length = 0;
  file.set('f.mjs', f);
  await fontiDaDisco(disco).leggiSpazio();
  assert.deepEqual(letture, ['f.mjs'], 'dimenticato quando è sparito: rimesso, si rilegge');
});

test('CANC-IO-05 VERO, su disco: una dipendenza cambiata fra due scritture (data rimessa indietro ma diversa) si vede, e il cancello la giudica', async (t) => {
  svuotaCacheCancello();
  const cartella = mkdtempSync(join(tmpdir(), 'talos-letture-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  mkdirSync(join(cartella, 'src'));
  writeFileSync(join(cartella, 'src', 'dip.ts'), 'export function f5(x: number) { return x; }\n');
  utimesSync(join(cartella, 'src', 'dip.ts'), new Date(UN_ORA_FA), new Date(UN_ORA_FA));
  const primo = await premessaDellaScrittura(cartella, 'src/uso.ts', 'import { f5 } from "./dip";\nexport const z = f5(1);\n');
  assert.equal(primo.stato, 'presente');
  writeFileSync(join(cartella, 'src', 'dip.ts'), 'export function g5(x: number) { return x; }\n'); // stessa dimensione
  utimesSync(join(cartella, 'src', 'dip.ts'), new Date(UN_ORA_FA + 7_000), new Date(UN_ORA_FA + 7_000));
  const secondo = await premessaDellaScrittura(cartella, 'src/uso.ts', 'import { f5 } from "./dip";\nexport const z = f5(1);\n');
  assert.equal(secondo.stato, 'assente', 'la dipendenza non esporta più f5: se la memoria tenesse il testo vecchio passerebbe');
  assert.match(secondo.perche, /f5/u);
});
