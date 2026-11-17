/*
 * Giro di cura unico della riparazione dei permessi (12/11/2026) — LE SECONDE PROVE delle cancellazioni critiche: ogni riga che nella
 * corsa dei mutanti del giro (B 52, C 70, A 24 e quelli dell'autore, in copia) cadeva per UNA prova sola ha qui una seconda prova, con
 * un ingresso diverso dalla prima (un'altra forma, un altro comando, un'altra shell). Riga → prima prova → questa:
 *  cancellazioni-critiche.mjs:293 (il `;` segnato) SHELL-T1 → SECONDA-C01 · :475 («X:» del proprio disco) PERM-G02 → SECONDA-C02 ·
 *  :476 («X:» ricorda il disco lasciato) PROCESSO-P3 → SECONDA-C03 · :502 (barre doppie, non un indirizzo) GRAFIE-DS2 → SECONDA-C04 ·
 *  :941 e :1020 (la regola della shell detta per nome) SHELL-B1 → SECONDA-C05 · :986 (`chdir` senza /d) PROCESSO-P4 → SECONDA-C06 ·
 *  :987 (le grafie di Git Bash e WSL) SHELL-T1 → SECONDA-C01 · :991 (`cd /d` ricorda il disco lasciato) PROCESSO-P6 → SECONDA-C03 ·
 *  :1001 (`popd` ricorda il disco lasciato) PROCESSO-P6 → SECONDA-C03 · :1173 (`rm` e basta alla POSIX) PERM-K09 → SECONDA-C07 ·
 *  :1174 (le opzioni di PowerShell) GRAFIE-CC1 → SECONDA-C07 · :1267 (ogni lettura col suo contesto) GRAFIE-MU1 → SECONDA-C08.
 * Niente viene eseguito: solo parole, lettere di dischi che non esistono. Nessuna cancellazione.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';

const WINDOWS = process.platform === 'win32';
const BS = String.fromCharCode(92);
const DOLLARO = String.fromCharCode(36);
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA = !WINDOWS || liberi.length < 3;
const [P, A, N] = liberi; // il disco del progetto, un altro disco, il disco del processo
const a = (A ?? 'k').toLowerCase();
const sessione = `${P}:${BS}lavori${BS}progetto`;
const casa = `${A}:${BS}Users${BS}tizio`;
const build = `${A}:${BS}dati${BS}build`;
const cwdVera = process.cwd;
const casaPrima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
const critica = (comando, extra = {}) => {
  process.cwd = () => `${N}:${BS}programmi${BS}app`;
  process.env.USERPROFILE = casa; process.env.HOME = casa;
  try { return cancellazioneCritica(comando, { cartella: sessione, home: casa, piattaforma: 'win32', ambiente: {}, ...extra }); } finally {
    process.cwd = cwdVera;
    if (casaPrima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = casaPrima.USERPROFILE;
    if (casaPrima.HOME === undefined) delete process.env.HOME; else process.env.HOME = casaPrima.HOME;
  }
};
const progetto = { percorso: sessione, perche: 'progetto' };

test('SECONDA-C01 — scritte in testa, senza la shell detta per nome: `chdir X:\\…; rm …` è un cd che fallisce in cmd, e `/x/…`, `/mnt/x/…` sono Git Bash e WSL', { skip: SALTA }, () => {
  for (const comando of [`chdir ${build}; rm -r -fo *`, `cd /${a}/dati/build && rm -rf *`, `cd /mnt/${a}/dati/build && rm -rf *`]) assert.equal(critica(comando), null, comando);
  /* al contrario: in cmd un `cd` senza /d verso un altro disco non sposta, e `rd /s /q .` cancella il progetto */
  assert.deepEqual(critica(`chdir ${build} & rd /s /q .`), progetto);
});

test('SECONDA-C02 — «X:» del proprio disco non sposta: `.` resta il progetto; una sotto-shell non lascia il suo ricordo', { skip: SALTA }, () => {
  assert.deepEqual(critica(`${P}: && rmdir /s /q .`), progetto);
  assert.equal(critica(`cmd /c "cd /d ${casa}${BS}y & ${A}:" & ${A}: & rmdir /s /q Users${BS}tizio`)?.perche, 'casa');
});

test('SECONDA-C03 — chi lascia un disco (con «X:», `cd /d`, `pushd`, `popd`) ne ricorda la cartella: tornati su quel disco con «X:», `.` è quella cartella, non la radice', { skip: SALTA }, () => {
  for (const comando of [
    `${A}: & ${P}: & rmdir /s /q .`, // «X:» ricorda la cartella lasciata sul disco del progetto
    `chdir /d ${A}:${BS}dati${BS}x && ${P}: && rmdir /s /q .`, // `cd /d` la ricorda
    `pushd ${A}:${BS}dati${BS}x && ${P}: && rmdir /s /q .`, // `pushd` la ricorda
  ]) assert.deepEqual(critica(comando), progetto, comando);
  /* «X:» che lascia l'altro disco ne ricorda la cartella: tornati lì con «X:», `.` è quella cartella, non la radice di quel disco */
  assert.equal(critica(`cd /d ${A}:${BS}dati${BS}x & ${P}: & ${A}: & rd /s /q .`), null);
  /* `popd` che torna sul disco del progetto lascia l'altro dov'era: «X:rel» riparte da lì */
  assert.equal(critica(`pushd ${casa}${BS}.. && popd && rmdir /s /q ${A}:tizio`)?.perche, 'casa');
  /* al contrario: tornati nel progetto una sottocartella resta libera */
  assert.equal(critica(`pushd ${A}:${BS}dati${BS}x && ${P}: && rmdir /s /q build`), null);
});

test('SECONDA-C04 — le barre doppie dopo il disco (dritte e rovesce) non sono un indirizzo: il progetto si vede', { skip: SALTA }, () => {
  assert.deepEqual(critica(`rm -rf ${P}://lavori//progetto`), progetto);
  assert.deepEqual(critica(`Remove-Item -Recurse -Force ${P}:${BS}${BS}lavori${BS}${BS}progetto`), progetto);
  assert.equal(critica(`rm -rf ${P}://lavori//progetto//build`), null, 'al contrario: una sottocartella');
});

test('SECONDA-C05 — dentro `bash -c` e `sh -c` un `cd` verso un altro disco sposta (anche scritto `K:/…`); verso il progetto, la carta', { skip: SALTA }, () => {
  for (const comando of [`bash -c "cd ${A}:/dati/build && rm -rf *"`, `sh -c "cd /${a}/dati/build; rm -rf ./*"`, `bash <<< "cd ${A}:/dati/build && rm -rf ./*"`,
    `echo "cd ${A}:/dati/build && rm -rf ./*" | bash`, `pwsh -Command "cd ${build} && Remove-Item -Recurse -Force ./*"`]) assert.equal(critica(comando), null, comando);
  assert.deepEqual(critica(`sh -c "cd ${sessione.replaceAll(BS, '/')} && rm -rf ./*"`), progetto);
  assert.deepEqual(critica(`pwsh -Command "cd ${sessione} && Remove-Item -Recurse -Force ./*"`), progetto);
});

test('SECONDA-C06 — `chdir` senza /d verso un altro disco in cmd non sposta: `rmdir /s /q .` dopo è il progetto; con /d no', { skip: SALTA }, () => {
  assert.deepEqual(critica(`chdir ${A}:${BS}dati${BS}x && rmdir /s /q .`), progetto);
  assert.equal(critica(`chdir /d ${A}:${BS}dati${BS}x && rmdir /s /q .`), null);
});

test('SECONDA-C07 — la lettura «alla POSIX» di `/T` è solo per `rm` con le opzioni corte: con le opzioni di PowerShell, o con un altro comando, `/T` è `\\T` del disco corrente', { skip: !WINDOWS }, () => {
  const w = (s) => s.replaceAll('/', BS);
  const mondo = { cartella: w('C:/lavori/progetto'), home: w('C:/Users/persona'), piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p };
  for (const comando of ['rm -Recurse -Force /T', 'rm -fo -r /T', 'Remove-Item -rf /T', 'rm -force -recurse /T', 'rm -rf -LiteralPath /T']) {
    const r = cancellazioneCritica(comando, mondo);
    assert.deepEqual([r?.perche, r?.percorso], ['primo-livello', w('C:/T')], comando);
  }
  const r = cancellazioneCritica('rm -fr /T', mondo);
  assert.deepEqual([r?.perche, r?.percorso], ['radice', `T:${BS}`], 'al contrario: `rm -fr /T` di Git Bash è il disco T:');
});

test('SECONDA-C08 — ogni lettura del comando ha il suo contesto: una variabile assegnata DOPO non vale prima; senza trucchi il progetto si vede', { skip: !WINDOWS }, () => {
  const mondo = { cartella: `C:${BS}T${BS}mondo${BS}progetto`, home: `C:${BS}Users${BS}persona`, piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p };
  for (const comando of [`rm -rf "${DOLLARO}X" /q/zz/w; X=/T/mondo/progetto`, `rm -rf /q/zz/w ${DOLLARO}{X}; export X=/T/mondo/progetto`]) assert.equal(cancellazioneCritica(comando, mondo), null, comando);
  assert.equal(cancellazioneCritica('X=/T/mondo/progetto; rm -rf "$X"', mondo)?.perche, 'progetto', 'al contrario: assegnata PRIMA vale');
});

/* Giro piccolo dopo il controllore (13/11/2026): le seconde prove dei vivi del controllore (B-K07, M10, K18, K03) e dei dieci mutanti che
   cadevano per UNA prova sola nella sua corsa (B-K04, C-K19, B-K06, B-K10, C-K11, C-K13, K14; quelli di path-policy stanno in
   `permessi-seconde-prove.test.mjs`). Ognuna con un ingresso diverso da quello della prima prova. */
test('SECONDA-C09 — il nome del comando in una variabile che non si sa, con `;` o da solo: la cancellazione dopo resta vista (B-K07)', { skip: SALTA }, () => {
  for (const comando of [`${DOLLARO}cmd --version; Remove-Item -Recurse -Force .`, `${DOLLARO}X & rm -rf .`]) assert.deepEqual(critica(comando), progetto, comando);
});

test('SECONDA-C10 — un `/D` nella parte che il `;` di cmd ingoia non sposta: dopo il `&` si è ancora nel progetto (M10, B-K06)', { skip: SALTA }, () => {
  assert.deepEqual(critica(`cd ${build}; echo a /D & del /s /q *`), progetto);
  assert.deepEqual(critica(`chdir ${build}; echo /d & rd /s /q .`), progetto);
});

test('SECONDA-C11 — dopo `echo … | bash`, `bash <<< …` e `powershell -c … &&` i comandi di cmd tornano alla regola di cmd (K18)', { skip: SALTA }, () => {
  for (const comando of [`powershell -c "echo" && cd ${build} && rd /s /q .`, `echo hi | bash & cd ${build} & rd /s /q .`, `bash <<< "echo hi" & cd ${build} & rd /s /q .`]) {
    assert.deepEqual(critica(comando), progetto, comando);
  }
});

test('SECONDA-C12 — onestà: anche con due `;` dopo il `cd` cmd non esegue niente fino al primo `&` (K03)', { skip: SALTA }, () => {
  assert.equal(critica(`cd ${build}; echo a; echo b; rd /s /q .`), null);
  assert.equal(critica(`chdir ${build}; echo a; rd /s /q .`), null);
});

test('SECONDA-C13 — `cmd /c "pushd … & cd y"` sullo stesso disco non lascia ricordi al comando di fuori, anche con «X:rel» (B-K04, C-K19)', { skip: SALTA }, () => {
  const tizio = `Users${BS}tizio`;
  assert.deepEqual(critica(`cmd /c "pushd ${casa}${BS}x & cd y" & ${A}: & rd /s /q ${tizio}`)?.perche, 'casa');
  assert.deepEqual(critica(`cmd /c "cd /d ${casa}${BS}x & cd y" & rd /s /q ${A}:${tizio}`)?.perche, 'casa');
});

test('SECONDA-C14 — PowerShell: `cd` verso un altro disco, «X:» del progetto, e la cancellazione relativa torna nel progetto (B-K10, C-K11, C-K13)', { skip: SALTA }, () => {
  for (const comando of [`cd ${build}; ${P}:; Remove-Item -Recurse -Force *`, `chdir ${build}; ${P}:; rd -r -fo .`, `cd ${build}; ${P}:; Remove-Item -Recurse -Force ..${BS}progetto`]) {
    assert.deepEqual(critica(comando), progetto, comando);
  }
});

test('SECONDA-C15 — `cmd /c` dentro `pwsh -c` o `powershell -NoProfile -Command` resta cmd: `cd` senza /d non sposta (K14)', { skip: SALTA }, () => {
  for (const comando of [`pwsh -c "cmd /c 'chdir ${build} && del /s /q *'"`, `powershell -NoProfile -Command "cmd /c 'cd ${build} & del /s /q *'"`]) {
    assert.deepEqual(critica(comando), progetto, comando);
  }
});

/* Giro piccolo dopo il controllore, punto 5: le seconde prove delle righe nuove del `cd` che non resta e di `%ComSpec%` (le prime sono
   CURA-CS1, CURA-SF1, CURA-SS1, CURA-PP1, CURA-SF2, CURA-ON1 in `permessi-shell-detta-per-nome.test.mjs`). */
test('SECONDA-C16 — `$env:ComSpec` e `%comspec%` senza la variabile nell ambiente sono cmd: `chdir` senza /d non sposta', { skip: SALTA }, () => {
  for (const comando of [`${DOLLARO}env:ComSpec /c "cd ${build} && rd /s /q ."`, `%comspec% /c "chdir ${build} && del /s /q *"`]) assert.deepEqual(critica(comando), progetto, comando);
});

test('SECONDA-C17 — `sh -c`: sottoshell, pipe in tutti e due i versi e lista in sottofondo non spostano chi viene dopo', { skip: SALTA }, () => {
  for (const comando of [`sh -c "(cd /${a}/dati/build && make) && rm -rf ./*"`, `sh -c "cd /${a}/dati/build | cat && rm -rf *"`, `bash -c "ls | cd /${a}/dati/build; rm -rf *"`,
    `sh -c "cd /${a}/dati/build && make & rm -rf *"`, `cd /mnt/${a}/dati/build & rm -rf ./*`]) assert.deepEqual(critica(comando), progetto, comando);
  for (const comando of [`sh -c "(cd /${a}/dati/build && rm -rf ./*)"`, `bash -c "cd /${a}/dati/build &> log && rm -rf *"`, `bash -c "cd /${a}/dati/build 2>&1 && rm -rf *"`,
    `sh -c "cd /${a}/dati/build; make & rm -rf *"`, `sh -c "echo" && (chdir /d ${build}) && rd /s /q .`]) assert.equal(critica(comando), null, `al contrario: ${comando}`);
});

test('SECONDA-C18 — `bash <<<`, `echo … | bash` e `printf … | sh`: un `cd X:/…` in sottofondo o una sottoshell non spostano chi viene dopo', { skip: SALTA }, () => {
  for (const comando of [`bash <<< "cd ${A}:/dati/build & rm -rf *"`, `echo "cd ${A}:/dati/build & rm -rf *" | bash`, `printf "(cd /${a}/dati/build); rm -rf *" | sh`]) {
    assert.deepEqual(critica(comando), progetto, comando);
  }
});

test('SECONDA-C19 — fuori da Windows `$COMSPEC` non è cmd, e la regola di bash del sottofondo c è (R15, 13/11/2026: il `cd` in pipe non resta)', () => {
  const mondo = { cartella: '/home/u/proj', home: '/home/u', ambiente: {}, realpathFn: (p) => p };
  assert.equal(cancellazioneCritica(`${DOLLARO}COMSPEC /c "rd /s /q ."`, { ...mondo, piattaforma: 'darwin' }), null);
  assert.equal(cancellazioneCritica('sh -c "cd /tmp/x | true; rm -rf *"', { ...mondo, piattaforma: 'android' })?.perche, 'progetto');
});
