/*
 * 0.2.4, giro dopo i revisori (giudice v2311), commit delle scritture: il lettore delle scritture della shell
 * (`kernel/scritture-della-shell.mjs`, `leggiTesto`) leggeva il testo solo con gli apici di sempre. Un apostrofo o un apice ANSI
 * davanti nascondeva la scrittura fuori dal progetto: `x=$'\''; echo hi > ~/.bashrc` (L M W) e `echo it's & copy a.txt Q:\fuori\x.txt`
 * (W) davano 0 bersagli, e sul cancello intero (W, «Scrive nel progetto», shell «sempre») `echo it's & echo hi > Q:\fuori\x.txt`
 * passava con 0 carte (senza l'apostrofo: 1 carta). Ora il testo si legge anche con gli apici del guscio vero (come le cancellazioni).
 * ⛔ Niente viene eseguito: solo testo, cartelle e dischi che non esistono; la carta risponde «no».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { scrittureDelComando } from '../src/kernel/scritture-della-shell.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 1 ? 'serve Windows con una lettera di disco libera' : false;
const D = liberi[0] ?? 'Q';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio' },
};
const opzioni = (s) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home, USERPROFILE: SIS[s].home } });
const fuori = (s, c) => scrittureDelComando(c, opzioni(s)).bersagli.map((b) => b.percorso ?? b);

async function carte(s, comando) {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  let esito = null;
  try {
    esito = await verificaPermessoScrittura({ toolCallId: 'scritture-apici', tipo: 'shell', comando }, { livelloAccesso: 'scrittura-progetto', cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return { consentito: esito?.consentito ?? null, carte: chieste.length };
}

test('SCRITTURE-ANSI — `x=$\'\\\'\'; echo hi > ~/.bashrc` scrive nella casa: il bersaglio si vede (L M; W se c è un disco libero)', () => {
  for (const s of SALTA_W ? ['L', 'M'] : ['W', 'L', 'M']) {
    const c = String.raw`x=$'\''; echo hi > ~/.bashrc`;
    /* almeno i bersagli di `echo hi > ~/.bashrc` da solo (su W la lettura di cmd ne aggiunge uno) */
    for (const b of fuori(s, 'echo hi > ~/.bashrc')) assert.ok(fuori(s, c).includes(b), `${s} «${c}»: ${b}`);
    assert.ok(fuori(s, c).length >= 1, `${s} «${c}»: almeno un bersaglio`);
  }
});

test('SCRITTURE-CMD — sul PC `echo it\'s & copy …` e `echo it\'s & echo hi > …` scrivono fuori: il bersaglio si vede (W)', { skip: SALTA_W }, () => {
  for (const dopo of [`copy a.txt ${D}:${BS}fuori${BS}x.txt`, `echo hi > ${D}:${BS}fuori${BS}x.txt`]) {
    assert.ok(fuori('W', `echo it's & ${dopo}`).length >= 1, `W «echo it's & ${dopo}»`);
  }
});

test('SCRITTURE-CANCELLO — W, «Scrive nel progetto», shell «sempre»: con l apostrofo davanti la carta c è come senza', { skip: SALTA_W }, async () => {
  const senza = await carte('W', `echo hi > ${D}:${BS}fuori${BS}x.txt`);
  const con = await carte('W', `echo it's & echo hi > ${D}:${BS}fuori${BS}x.txt`);
  assert.equal(senza.carte, 1, 'senza l apostrofo: una carta (misura del revisore)');
  assert.equal(con.carte, senza.carte, 'con l apostrofo: la stessa carta');
  assert.equal(con.consentito, false, 'la carta risponde «no»: non passa');
});

test('SCRITTURE-ONESTI — gli apostrofi di tutti i giorni dentro il progetto non danno bersagli fuori', () => {
  for (const s of SALTA_W ? ['L', 'M'] : ['W', 'L', 'M']) {
    for (const c of [`echo it's fine > note.txt`, String.raw`printf $'a\tb' > dati.tsv`]) {
      assert.deepEqual(scrittureDelComando(c, opzioni(s)).illeggibili, [], `${s} «${c}»`);
    }
  }
});
