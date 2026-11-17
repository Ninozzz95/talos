/*
 * Giro di cura unico della riparazione dei permessi (12/11/2026, dopo il secondo ripasso) — LE PROVE CHE MANCAVANO sulle cancellazioni
 * critiche: K09 di C (`ri`/`del` con le opzioni di `rm` non sono `rm`), G02 e N05 di B (una sotto-shell `cmd /c "…"` non lascia il suo
 * ricordo dei dischi al comando di fuori; prima dichiarati equivalenti, B li ha distinti). Casi presi dai revisori (sola lettura):
 * B `C:/T/rev-riparazione-b-mut/lavoro2/prova-b2.test.mjs`, C `C:/T/rev-riparazione-c-mut/lavoro/ripasso-2/vivi-2b.mjs`.
 * Niente viene eseguito: solo parole, lettere di dischi che non esistono.
 * Giro piccolo dopo il controllore (13/11/2026): i tre mutanti che il controllore ha trovato VIVI e NON equivalenti (ognuno toglieva
 * una cancellazione vera) e la prova d onestà del suo K03; ingressi presi dal suo `C:/T/ctrl-giro-unico-lavoro/sonda-k-vivi.log`:
 *  - PERM-K07: un comando scritto con una variabile che non si sa (`$X foo`) non fa saltare i comandi dopo (B-K07, :972).
 *  - PERM-M10: in cmd il `;` ingoia solo fino al primo `&`, anche quando la parte ingoiata ha un `/d` (M10, «ingoiato» che non si ferma).
 *  - PERM-K18: dopo `powershell -c "…"` o `bash -c "…"` la regola di cmd torna per i comandi di fuori (K18, `rileggiCon`).
 *  - PERM-K03: onestà: in cmd `cd X:\…; echo a; rd …` è UN `cd` verso «X:\…; echo a; rd …», che fallisce: niente si cancella.
 * Misurato con cmd.exe il 13/11/2026 (`C:/T/giro-ctrl-lavoro/cmd-prova-k03-k18.log`, solo `cd` ed `echo`): dopo `cd Q:\dati\build; echo
 * a; echo X & cd` la terza parte non parte e la cartella resta quella di prima; dopo `powershell -c "echo hi" & cd Q:\… & cd` anche.
 * Fonte (letta il 13/11/2026): learn.microsoft.com/windows-server/administration/windows-commands/cd (`cd [/d] [<drive>:][<path>]`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';

const WINDOWS = process.platform === 'win32';
const BS = String.fromCharCode(92);
const LIBERI = WINDOWS && ![...'KLN'].some((l) => existsSync(`${l}:${BS}`));
const casa = `K:${BS}Users${BS}tizio`;
const sessione = `L:${BS}lavori${BS}progetto`;
const cwdVera = process.cwd;
const casaPrima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
const critica = (comando, extra = {}) => {
  process.cwd = () => `N:${BS}programmi${BS}app`;
  process.env.USERPROFILE = casa; process.env.HOME = casa;
  try { return cancellazioneCritica(comando, { cartella: sessione, home: casa, piattaforma: 'win32', ambiente: {}, ...extra }); } finally {
    process.cwd = cwdVera;
    if (casaPrima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = casaPrima.USERPROFILE;
    if (casaPrima.HOME === undefined) delete process.env.HOME; else process.env.HOME = casaPrima.HOME;
  }
};

test('PERM-G02 — una sotto-shell che scrive «K:» stando già su K: non lascia un ricordo al comando di fuori: «K:» fuori porta alla radice, la casa relativa è critica', { skip: !LIBERI }, () => {
  assert.equal(critica(`cmd /c "cd /d ${casa}${BS}x & K:" & K: & rd /s /q Users${BS}tizio`)?.perche, 'casa');
  /* senza sotto-shell: K: ricordato dove lo si è lasciato (la casa), L: scritto due volte non cambia niente */
  assert.equal(critica(`cd /d ${casa} & L: & L: & K: & rd /s /q .`)?.perche, 'casa');
  assert.equal(critica('L: & rd /s /q .')?.perche, 'progetto', 'il proprio disco scritto da solo: resta nel progetto');
});

test('PERM-N05 — una sotto-shell che si sposta DENTRO lo stesso disco non lascia un ricordo al comando di fuori', { skip: !LIBERI }, () => {
  assert.equal(critica(`cmd /c "cd /d ${casa}${BS}x & cd y" & K: & rd /s /q Users${BS}tizio`)?.perche, 'casa');
  assert.equal(critica(`cd /d K:${BS}dati${BS}altro && rd /s /q .`), null, 'al contrario: `cd /d` verso un altro disco sposta anche in cmd');
});

test('PERM-K09 — `ri -rf` e `del -rf` non sono `rm`: `/T` è la cartella `\\T` del disco corrente, non il disco T:', { skip: !WINDOWS }, () => {
  const w = (s) => s.replaceAll('/', BS);
  const fuori = { home: w('C:/Users/persona'), realpathFn: (p) => p };
  const r = cancellazioneCritica('ri -rf /T', { cartella: w('C:/lavori/progetto'), piattaforma: 'win32', ambiente: {}, ...fuori });
  assert.deepEqual([r?.perche, r?.percorso], ['primo-livello', w('C:/T')]);
  const d = cancellazioneCritica('del -rf /T/progetto', { cartella: w('C:/T/progetto'), piattaforma: 'win32', ambiente: {}, ...fuori });
  assert.deepEqual([d?.perche, d?.percorso], ['progetto', w('C:/T/progetto')]);
  const rm = cancellazioneCritica('rm -rf /T', { cartella: w('C:/lavori/progetto'), piattaforma: 'win32', ambiente: {}, ...fuori });
  assert.deepEqual([rm?.perche, rm?.percorso], ['radice', 'T:' + BS], 'al contrario: `rm -rf /T` di Git Bash è il disco T:');
});

const kBuild = `K:${BS}dati${BS}build`;
const progettoL = { percorso: sessione, perche: 'progetto' };

test('PERM-K07 — un comando scritto con una variabile che non si sa (`$X foo`, `%X% foo`) non fa saltare la cancellazione che viene dopo', { skip: !LIBERI }, () => {
  for (const comando of ['$X foo & rd /s /q .', '%X% foo & rd /s /q .', '%PROG% build && rd /s /q .']) assert.deepEqual(critica(comando), progettoL, comando);
  assert.equal(critica('$X foo & dir'), null, 'al contrario: senza cancellazione dopo, niente');
});

test('PERM-M10 — in cmd il `;` ingoia solo fino al primo `&`, anche se la parte ingoiata ha un `/d`: il `cd` fallisce e `rd /s /q .` cancella il progetto', { skip: !LIBERI }, () => {
  for (const comando of [`cd ${kBuild}; echo /d & rd /s /q .`, `cd ${kBuild}; dir /d & rd /s /q .`]) assert.deepEqual(critica(comando), progettoL, comando);
  assert.equal(critica(`cd /d ${kBuild} & rd /s /q .`), null, 'al contrario: il `/d` del `cd` sposta davvero');
});

test('PERM-K18 — dopo `powershell -c "…"` o `bash -c "…"` i comandi di fuori tornano alla regola di cmd: `cd X:\…` senza /d non sposta', { skip: !LIBERI }, () => {
  for (const comando of [`powershell -c "echo hi" & cd ${kBuild} & rd /s /q .`, `bash -c "echo hi" & cd ${kBuild} & rd /s /q .`]) {
    assert.deepEqual(critica(comando), progettoL, comando);
  }
  assert.equal(critica(`powershell -c "cd ${kBuild}; Remove-Item -Recurse -Force *"`), null, 'al contrario: DENTRO PowerShell il `cd` sposta');
});

test('PERM-K03 — onestà: `cd X:\…; echo a; rd /s /q .` in cmd è un solo `cd` che fallisce; niente si cancella, nessuna carta in più', { skip: !LIBERI }, () => {
  for (const comando of [`cd ${kBuild}; echo a; rd /s /q .`, `cd ${kBuild}; dir; del /s /q *`]) assert.equal(critica(comando), null, comando);
  assert.deepEqual(critica(`cd ${kBuild}; echo a & rd /s /q .`), progettoL, 'al contrario: dopo il primo `&` il comando parte');
});
