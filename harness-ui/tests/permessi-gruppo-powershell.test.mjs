/*
 * 0.2.4, terzo giro sul lettore (owner riga 195, giudice v2334): un gruppo dentro un gruppo «calcolabile» di PowerShell. Il gruppo si
 * decide calcolabile con la STESSA lettura di `calcolaGruppo` (gli apici di PowerShell: l'apice inverso protegge lo spazio, quindi
 * `Join-Path a b` | % {…}` è una pipe, about_Parsing), e un gruppo con un altro `(` dentro si rilegge. Le forme 1, 2, 4 passavano
 * SENZA carta dalla 0.2.3 (`bcd301d95`, 04/11) fino a `d8aec8305`; il pavimento non le ferma (non si tocca).
 * ⛔ Niente viene eseguito: solo testo al riconoscitore, su cartelle e dischi che non esistono. Nessuna cancellazione.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';

const BS = String.fromCharCode(92);
const TICK = String.fromCharCode(96);
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
const mondo = (s) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home, USERPROFILE: SIS[s].home }, realpathFn: (p) => p });
const perche = (s, c) => critiche.cancellazioneCritica(c, mondo(s))?.perche ?? null;

test('GRUPPO-PS-1-4 — un gruppo dentro `(Join-Path …)` si rilegge: le forme 1 e 4 chiedono «radice» (W)', { skip: SALTA_W }, () => {
  for (const c of [`powershell -Command "Write-Output (Join-Path a b${TICK} | % { Remove-Item -Recurse -Force ${D}:${BS} })"`,
    `pwsh -c 'Write-Output (Join-Path a b${TICK} | % { Remove-Item -Recurse -Force ${D}:${BS} })'`,
    `powershell -Command "Write-Output (Join-Path a (Remove-Item -Recurse -Force ${D}:${BS}))"`]) assert.equal(perche('W', c), 'radice', `W «${c}»`);
});

test('GRUPPO-PS-2 — `pwsh -c \'…(Join-Path a b` | % {… /})\'` chiede «radice» (L A M)', () => {
  const c = `pwsh -c 'Write-Output (Join-Path a b${TICK} | % { Remove-Item -Recurse -Force / })'`;
  for (const s of POSIX) assert.equal(perche(s, c), 'radice', `${s} «${c}»`);
});

test('GRUPPO-PS-CONTROLLI — un gruppo calcolabile SENZA cancellazione dentro non chiede; le forme già chiuse restano chiuse', () => {
  for (const s of WINDOWS ? ['W', ...POSIX] : POSIX) {
    for (const c of ['powershell -Command "Remove-Item -Recurse -Force (Join-Path a b)"', 'powershell -Command "Write-Output (Join-Path a (Get-Date))"',
      "pwsh -c 'Write-Output (Join-Path (Get-Location) (Join-Path a b))'"]) assert.equal(perche(s, c), null, `${s} «${c}»`);
    const radice = s === 'W' ? `${D}:${BS}` : '/';
    assert.equal(perche(s, `powershell -Command "Write-Output (Join-Path a b | % { Remove-Item -Recurse -Force ${radice} })"`), 'radice', s);
  }
});

test('R13 — dopo le letture del guscio vale l unione degli stati: `D=..` dentro eval dà «sopra-il-progetto» (L A M)', () => {
  for (const s of POSIX) assert.equal(perche(s, String.raw`eval "D=\$'\''#'; D=..'"; rm -rf "$D"`), 'sopra-il-progetto', s);
});
