/*
 * 0.2.4, lettore del guscio vero: giro unico di cura dopo i tre revisori di cb7bde8d6 (giudice v2311). Ogni caso qui sotto passava
 * SENZA carta sulla base 6e8cb57cf e sulla testa cb7bde8d6 (sicurezza già uscita, misurata a testo dai revisori), tranne le prove dei
 * mutanti R06, R08, R17 e R07, che erano già verdi e mancavano (revisore di riproduzione).
 * - (a) `\$'` dentro le doppie virgolette di un involucro: alla shell arriva `$'…'`, un apice ANSI (POSIX «Double-Quotes»).
 * - (b) un gruppo di PowerShell si salta solo se è UN comando calcolabile; (c) il gruppo si legge con gli apici di PowerShell.
 * - (d) il carattere zero dentro `$'…'`: bash tronca lì il contenuto (`lib/sh/strtrans.c` `ansicstr`); POSIX 2024 §2.2.4 lo lascia
 *   aperto, quindi la lettura che lo tiene resta accanto. (g) `r$"m"` e il nome in ANSI anche per il secondo filtro.
 * ⛔ Niente viene eseguito: solo testo al riconoscitore, su cartelle e dischi che non esistono. Nessuna cancellazione.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import { decodificaAnsiC } from '../src/kernel/apici-ansi-c.mjs';

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 1 ? 'serve Windows con una lettera di disco libera' : false;
const D = liberi[0] ?? 'Q';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio' },
};
const POSIX = ['L', 'A', 'M'];
const SISTEMI = SALTA_W ? POSIX : ['W', ...POSIX];
const mondo = (s, home = SIS[s].home) => ({ cartella: SIS[s].cartella, home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: home, USERPROFILE: home }, realpathFn: (p) => p });
const chiede = (s, c, home) => critiche.cancellazioneCritica(c, mondo(s, home));

test('INVOLUCRI — `\\$\'` fra le doppie di `bash -c`, `sh -c`, `eval` (anche a due livelli) e `$\'…\'` dato a eval chiedono su W L A M', () => {
  const casi = [
    String.raw`bash -c "x=\$'\''; rm -rf ../ #'"`,
    String.raw`sh -c "x=\$'\''; rm -rf ../ #'"`,
    String.raw`eval "x=\$'\''; rm -rf ../ #'"`,
    String.raw`bash -c "bash -c \"x=\\\$'\\''; rm -rf ../ #'\""`,
    String.raw`eval "$'\x72m' -rf ~"`,
    String.raw`sh -c "rm -rf \$'/'"`,
  ];
  for (const s of SISTEMI) for (const c of casi) assert.notEqual(chiede(s, c), null, `${s} «${c}»`);
  for (const s of POSIX) {
    assert.equal(chiede(s, casi[0])?.perche, 'sopra-il-progetto', `${s}: la carta nomina la madre del progetto`);
    assert.equal(chiede(s, casi[5])?.perche, 'radice', `${s}: \$'/' è la radice`);
  }
});

test('GRUPPO-PS — un gruppo di PowerShell che comincia con un nome calcolabile ma ha una pipe si rilegge (W)', { skip: SALTA_W }, () => {
  for (const testa of ['Join-Path a b', 'Resolve-Path .', 'Get-Location']) {
    const c = `powershell -Command "Write-Output (${testa} | % { Remove-Item -Recurse -Force ${D}:${BS} })"`;
    assert.equal(chiede('W', c)?.perche, 'radice', `W «${c}»`);
  }
  /* il gruppo di UN comando calcolabile si calcola come prima: il progetto, non una carta in più */
  assert.equal(chiede('W', `powershell -Command "Remove-Item -Recurse -Force (Join-Path ${D}:${BS}w progetto)"`)?.perche, 'progetto');
});

test('GRUPPO-PS-APICI — `(Join-Path … \'O\'\'Brien\')` e `\'…O\'\'Brien\'` si leggono con gli apici di PowerShell: la casa (W)', { skip: SALTA_W }, () => {
  const casa = `${D}:${BS}Users${BS}O'Brien`;
  assert.equal(chiede('W', `powershell -Command "Remove-Item -Recurse -Force (Join-Path ${D}:${BS}Users 'O''Brien')"`, casa)?.perche, 'casa');
  /* R07 (revisore di riproduzione): `''` dentro `'…'` è un apostrofo anche nella lettura diretta */
  assert.equal(chiede('W', `powershell -Command "Remove-Item -Recurse -Force '${casa.replace("'", "''")}'"`, casa)?.perche, 'casa');
});

test('NUL — il carattere zero dentro `$\'…\'` chiude il contenuto come in bash: le forme del revisore chiedono su W L A M', () => {
  const casi = [String.raw`rm -rf ~/$'\0x'`, String.raw`$'rm\0x' -rf ~`, String.raw`r$'\0'm -rf ~`, String.raw`rm -rf ..$'\0'`,
    String.raw`rm -rf $'\0abc'"$HOME"`, String.raw`rm -rf $'\0x'/*`];
  for (const s of SISTEMI) for (const c of casi) assert.notEqual(chiede(s, c), null, `${s} «${c}»`);
  for (const s of SISTEMI) for (const zero of [String.raw`\0`, String.raw`\x00`, `${BS}u0000`, String.raw`\c@`]) {
    assert.equal(chiede(s, `rm -rf $'/${zero}x'`)?.perche, 'radice', `${s}: $'/${zero}x' è la radice`);
  }
  /* onesti: lo zero in un valore che non tocca una cancellazione critica */
  for (const s of SISTEMI) for (const c of [String.raw`printf $'a\0b' > f; rm -rf dist`, String.raw`IFS=$'\0'; rm -rf build/`]) {
    assert.equal(chiede(s, c), null, `${s} «${c}»`);
  }
});

test('DECODIFICA — `\\c?` è DEL come in bash, `\\\'` è l apostrofo, lo zero tronca solo con `troncaAlNul`', () => {
  assert.equal(decodificaAnsiC(String.raw`\c?`), String.fromCharCode(0x7f));
  assert.equal(decodificaAnsiC(String.raw`\cA`), String.fromCharCode(1));
  assert.equal(decodificaAnsiC(String.raw`a\'b`), "a'b");
  assert.equal(decodificaAnsiC(String.raw`/\0x`, { troncaAlNul: true }), '/');
  assert.equal(decodificaAnsiC(String.raw`/\c@x`, { troncaAlNul: true }), '/');
  assert.equal(decodificaAnsiC(String.raw`/\0x`), `/${String.fromCharCode(0)}x`);
});

test('NOMI — `r$"m"`, il nome in ANSI per il secondo filtro e le grafie dei mutanti R06/R08 chiedono su W L A M', () => {
  const attese = [
    [String.raw`r$"m" -rf ~`, 'casa'],
    [String.raw`$'\x66ind' / -delete`, 'radice'],
    /* R06: il primo filtro toglie apici e barre anche dopo la decodifica */
    [String.raw`"r"$'m' -rf ~`, 'casa'],
    [String.raw`'r'$'\x6d' -rf ~`, 'casa'],
    /* R08: `$"…"` è `"…"` */
    [String.raw`rm -rf $"/"`, 'radice'],
    [String.raw`rm -rf $"$HOME"`, 'casa'],
  ];
  for (const s of SISTEMI) for (const [c, perche] of attese) assert.equal(chiede(s, c)?.perche, perche, `${s} «${c}»`);
});

test('APERTO-BARRA (R17) — nella prova dell apice aperto la barra protegge: `\'l\'\'altro\'\'\'` di PowerShell chiede (L A M)', () => {
  for (const s of POSIX) {
    const c = `pwsh -c "Write-Host 'l''altro'''; Remove-Item -Recurse -Force ${D}:${BS}"`;
    assert.equal(chiede(s, c)?.perche, 'troppo-complesso', `${s} «${c}»`);
  }
});
