/*
 * Giro di cura unico della riparazione dei permessi (12/11/2026, dopo il secondo ripasso; giudice 19:59 e 20:04) — DENTRO UNA SHELL
 * DETTA PER NOME SI LEGGE CON LA REGOLA DI QUELLA SHELL.
 * La cura di prima (P4) leggeva ogni testo anche come lo legge cmd, dove `cd X:\altro` senza `/d` verso un altro disco non sposta.
 * Ma il testo dentro `powershell -Command "…"` e dentro `bash -c "…"` non lo legge cmd: lì `cd` (alias di `Set-Location`) sposta
 * anche di disco. Con il progetto su un disco e la pulizia di una cartella su un altro, `powershell -Command "cd K:\dati\build;
 * Remove-Item -Recurse -Force *"` prendeva la carta «cancella il progetto» (revisore B 7 onesti su 13, revisore C 11 su 12), che
 * nominava un posto che non si cancella. In cmd la regola resta quella di prima: `cd K:\x && rd /s /q .` cancella il progetto.
 *  - SHELL-B1: i 13 comandi onesti del revisore B (`falsa-critica.mjs`), zero carte, dalla funzione e dal cancello ai tre livelli.
 *  - SHELL-B2: i 3 comandi veri di cmd del revisore B restano critici.
 *  - SHELL-C1, SHELL-C2: le forme del revisore C (`movimento-onesto-2.mjs`): oneste senza carta, vere in cmd con la carta.
 *  - SHELL-T1: le tre oneste che la variante del revisore C lasciava con la carta: un testo che cmd non esegue così.
 *  - SHELL-K1: AL CONTRARIO, dentro PowerShell e bash un `cd` verso un posto critico, e poi la cancellazione: la carta c'è.
 * Niente viene eseguito: solo il cancello a parole, su lettere di dischi che non esistono. Nessuna cancellazione.
 * Fonti (lette il 12/11/2026): learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/set-location
 * («PowerShell includes the following aliases for Set-Location: cd, chdir, sl»); learn.microsoft.com/en-us/windows-server/
 * administration/windows-commands/cd («/d Changes the current drive as well as the current directory for a drive»); misurato con
 * cmd.exe il 12/11/2026 20:41: `cd a; echo X & cd` non esegue `echo` (cmd prende «a; echo X» per il nome della cartella).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';

const WINDOWS = process.platform === 'win32';
const BS = String.fromCharCode(92);
/* due dischi che non esistono: solo parole, niente si tocca */
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA = !WINDOWS || liberi.length < 2;
const P = liberi[0] ?? 'L'; // il disco del progetto
const A = liberi[1] ?? 'K'; // l'altro disco, dove si pulisce
const a = A.toLowerCase();
const casa = `${P}:${BS}Users${BS}tizio`;
const sessione = `${P}:${BS}lavori${BS}progetto`;
const K = `${A}:${BS}dati${BS}build`;
const LIVELLI = ['accesso-pieno', 'scrittura-progetto', 'su-richiesta'];

const critica = (comando, cartella = sessione, home = casa) => cancellazioneCritica(comando, { cartella, home, piattaforma: 'win32', ambiente: {} });
const carte = async (comando, livelloAccesso, cartella = sessione) => {
  const chieste = [];
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = casa; process.env.HOME = casa;
  try {
    await verificaPermessoScrittura({ toolCallId: 'k', tipo: 'shell', comando }, { livelloAccesso, cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return chieste;
};

/* I 13 comandi onesti del revisore B: la shell detta per nome sposta davvero, e si cancella il contenuto di K:\dati\build */
const ONESTI_B = [
  `powershell -NoProfile -Command "cd ${K}; Remove-Item -Recurse -Force *"`,
  `powershell -NoProfile -Command "cd ${K}; Remove-Item -Recurse -Force ."`,
  `pwsh -c "cd ${K}; rm -r -fo *"`,
  `powershell -Command "chdir ${K}; Remove-Item -Recurse -Force *"`,
  `bash -c "cd /${a}/dati/build && rm -rf *"`,
  `bash -c "cd ${A}:/dati/build && rm -rf ./*"`,
  `sh -c "cd /${a}/dati/build && rm -rf ."`,
  `wsl bash -c "cd /mnt/${a}/dati/build && rm -rf *"`,
  `powershell -NoProfile -Command "Set-Location ${K}; Remove-Item -Recurse -Force *"`,
  `cd /d ${K} && del /s /q *`,
  `pushd ${K} && rd /s /q .`,
  `cmd /c "cd /d ${K} && rd /s /q ."`,
  `powershell -NoProfile -Command "cd ${P}:${BS}lavori${BS}altro${BS}build; Remove-Item -Recurse -Force *"`,
];
/* I 3 comandi veri del revisore B: in cmd `cd` senza /d NON sposta, e si cancella il progetto */
const VERI_B = [`cd ${K} && del /s /q *`, `cd ${K} && rd /s /q .`, `cmd /c "cd ${K} && rd /s /q ."`];

test('SHELL-B1 — i 13 comandi onesti del revisore B: nessuna carta critica, dalla funzione e dal cancello ai tre livelli', { skip: SALTA }, async () => {
  for (const comando of ONESTI_B) {
    assert.equal(critica(comando), null, `funzione: ${comando}`);
    for (const livello of LIVELLI) assert.equal((await carte(comando, livello)).length, 0, `${livello}: ${comando}`);
  }
});

test('SHELL-B2 — i 3 comandi veri di cmd del revisore B restano critici, con la carta che nomina il progetto ai tre livelli', { skip: SALTA }, async () => {
  for (const comando of VERI_B) {
    assert.deepEqual(critica(comando), { percorso: sessione, perche: 'progetto' }, comando);
    for (const livello of LIVELLI) {
      const chieste = await carte(comando, livello);
      assert.equal(chieste.length, 1, `${livello}: ${comando}`);
      assert.equal(chieste[0].cancellazioneCritica?.perche, 'progetto', `${livello}: ${comando}`);
    }
  }
});

/* Le forme del revisore C: progetto su P:, pulizia di A:\tmp\build (secondo livello: non critico di suo) */
const T = `${A}:${BS}tmp${BS}build`;
test('SHELL-C1 — le forme oneste del revisore C: la shell detta per nome (anche `-lc`, `-NoProfile`, `ri -r -fo`, la pipe) sposta, e non c\'è carta', { skip: SALTA }, () => {
  for (const comando of [
    `powershell -NoProfile -Command "cd ${T}; Remove-Item -Recurse -Force *"`,
    `powershell -NoProfile -Command "cd ${T}; Get-ChildItem | Remove-Item -Recurse -Force"`,
    `pwsh -c "cd ${T}; ri -r -fo .${BS}*"`,
    `bash -c "cd /${a}/tmp/build && rm -rf ./*"`,
    `bash -lc "cd /${a}/tmp/build && rm -rf *"`,
    `wsl -e bash -lc "cd /mnt/${a}/tmp/build && rm -rf *"`,
    `cd /d ${T} && rd /s /q .`,
    `powershell -Command "Set-Location ${T}; Remove-Item -Recurse -Force *"`,
    `pushd ${T} && rd /s /q . && popd`,
    `powershell -Command "cd ${T}; Remove-Item -Recurse -Force vecchio"`,
  ]) assert.equal(critica(comando), null, comando);
  /* il progetto sull'altro disco e la pulizia su questo; e una cartella di una lettera sullo stesso disco del progetto */
  const altrove = `${A}:${BS}lavori${BS}progetto`;
  assert.equal(critica(`powershell -NoProfile -Command "cd ${P}:${BS}tmp${BS}build; Remove-Item -Recurse -Force *"`, altrove, `${A}:${BS}Users${BS}tizio`), null);
  assert.equal(critica(`bash -c "cd /${P.toLowerCase()}/tmp/build && rm -rf *"`, altrove, `${A}:${BS}Users${BS}tizio`), null);
  assert.equal(critica(`bash -c "cd /T/altro/build && rm -rf *"`), null, 'una cartella di una lettera: per bash è un disco, per il sistema una cartella; nessuna delle due è critica');
});

test('SHELL-C2 — le forme vere di cmd del revisore C restano critiche: `cd` senza /d verso un altro disco non sposta, e si cancella il progetto', { skip: SALTA }, () => {
  for (const comando of [`cd ${T} && rd /s /q .`, `cd ${T} & del /s /q *`, `cmd /c "cd ${T} && rd /s /q ."`]) {
    assert.deepEqual(critica(comando), { percorso: sessione, perche: 'progetto' }, comando);
  }
});

test('SHELL-T1 — le tre oneste scritte in testa, senza la shell detta per nome: un testo che cmd non esegue così non prende la carta della lettura di cmd', { skip: SALTA }, async () => {
  /* (1) e (2) `/x/…` è il disco `x:` solo per Git Bash e WSL, dove `cd` sposta; per cmd è la cartella `\x` del disco corrente, che
     non è un altro disco: la regola di cmd («`cd` senza /d non cambia disco») non si applica a un disco letto alla maniera di Git Bash.
     (3) In cmd il `;` non separa i comandi: `cd X:\…; Remove-Item …` è un `cd` verso una cartella che si chiama «X:\…; Remove-Item …»,
     che fallisce, e `Remove-Item` non parte (misurato con cmd.exe). */
  for (const comando of [`cd /mnt/${a}/tmp/build && rm -rf *`, `cd /${a}/tmp/build && rm -rf *`, `cd ${T}; Remove-Item -Recurse -Force *`]) {
    assert.equal(critica(comando), null, comando);
    for (const livello of LIVELLI) assert.equal((await carte(comando, livello)).length, 0, `${livello}: ${comando}`);
  }
  /* al contrario: in cmd dopo il `cd` col `;` la cartella resta il progetto, e ciò che viene dopo un `&` parte lì */
  assert.deepEqual(critica(`cd ${T}; echo pulizia & rd /s /q .`), { percorso: sessione, perche: 'progetto' }, 'cmd: `cd` fallito, `rd` nel progetto');
  assert.deepEqual(critica(`cd ${T}; echo pulizia & del /s /q *`), { percorso: sessione, perche: 'progetto' });
  /* e PowerShell in testa con un posto critico dopo il `cd`: resta critico */
  assert.equal(critica(`cd ${A}:${BS}; Remove-Item -Recurse -Force *`)?.perche, 'radice', 'PowerShell in testa: `cd X:\\` poi tutto');
  /* e Git Bash in testa verso la radice di un altro disco */
  assert.equal(critica(`cd /${a}/ && rm -rf *`)?.perche, 'radice', 'Git Bash in testa: `/x/` è la radice del disco');
});

test('SHELL-K1 — AL CONTRARIO: dentro PowerShell e bash un `cd` che porta davvero su un posto critico, poi la cancellazione, ha la carta ai tre livelli', { skip: SALTA }, async () => {
  const casaAltrove = `${A}:${BS}Users${BS}tizio`;
  const casi = [
    [`powershell -NoProfile -Command "cd ${casaAltrove}; Remove-Item -Recurse -Force *"`, 'casa', casaAltrove],
    [`pwsh -c "cd ${casaAltrove}; ri -r -fo ."`, 'casa', casaAltrove],
    [`bash -c "cd /${a}/Users/tizio && rm -rf *"`, 'casa', casaAltrove],
    [`sh -c "cd ${A}:/Users/tizio && rm -rf ."`, 'casa', casaAltrove],
    [`powershell -Command "cd ${K}; cd ${sessione}; Remove-Item -Recurse -Force *"`, 'progetto', null],
    [`bash -c "cd /${a}/dati && cd /${P.toLowerCase()}/lavori/progetto && rm -rf ./*"`, 'progetto', null],
    [`powershell -Command "cd ${A}:${BS}; Remove-Item -Recurse -Force *"`, 'radice', null],
    [`bash -c "cd /${a}/ && rm -rf *"`, 'radice', null],
  ];
  for (const [comando, perche, home] of casi) {
    const h = home ?? casa;
    assert.equal(cancellazioneCritica(comando, { cartella: sessione, home: h, piattaforma: 'win32', ambiente: {} })?.perche, perche, comando);
  }
  for (const livello of LIVELLI) {
    const chieste = await carte(`powershell -Command "cd ${A}:${BS}; Remove-Item -Recurse -Force *"`, livello);
    assert.equal(chieste.length, 1, livello);
    assert.equal(chieste[0].cancellazioneCritica?.perche, 'radice', livello);
  }
  /* cmd dentro PowerShell (o bash) resta cmd: lì `cd` senza /d non sposta, e `rd /s /q .` cancella la cartella da cui si parte */
  for (const comando of [`powershell -Command "cmd /c 'cd ${K} && rd /s /q .'"`, `bash -c "cmd /c 'cd ${K} && rd /s /q .'"`]) {
    assert.deepEqual(critica(comando), { percorso: sessione, perche: 'progetto' }, comando);
  }
});

test('SHELL-B3 — le altre porte della shell detta per nome (`pwsh -c` con `&&` o a capo, `bash <<<`, `echo … | bash`) si leggono con la regola di quella shell; e in cmd il `;` ingoia solo fino al primo `&`', { skip: SALTA }, () => {
  const KF = K.replaceAll(BS, '/');
  for (const comando of [
    `pwsh -c "cd ${K} && Remove-Item -Recurse -Force *"`,
    `powershell -Command "cd ${K}\nRemove-Item -Recurse -Force *"`,
    `bash <<< "cd ${KF} && rm -rf *"`,
    `echo "cd ${KF} && rm -rf *" | bash`,
  ]) assert.equal(critica(comando), null, `onesto: ${comando}`);
  /* al contrario: lo stesso testo verso il progetto cancella il progetto */
  const SF = sessione.replaceAll(BS, '/');
  for (const comando of [`pwsh -c "cd ${sessione} && Remove-Item -Recurse -Force *"`, `bash <<< "cd ${SF} && rm -rf *"`, `echo "cd ${SF} && rm -rf *" | bash`]) {
    assert.deepEqual(critica(comando), { percorso: sessione, perche: 'progetto' }, comando);
  }
  /* cmd: `cd K:\x; Remove-Item …` è un cd che fallisce e ingoia fino al primo `&`; dopo, `rd /s /q .` cancella il progetto */
  assert.deepEqual(critica(`cd ${K}; Remove-Item -Recurse -Force * & rd /s /q .`), { percorso: sessione, perche: 'progetto' });
});

/*
 * Giro piccolo dopo il controllore (13/11/2026, punto 5 del brief): IL `cd` CHE NON RESTA e `%ComSpec% /c`. Il controllore ha trovato
 * sei forme vere perse (uguali sulla 0.2.1): in bash un `cd` mandato in sottofondo (`&`), chiuso in una sottoshell (`( … )`) o messo in
 * una pipe gira in un processo figlio e la cartella di chi segue non cambia, quindi `rm -rf *` cancella il PROGETTO; e `%ComSpec%` è
 * cmd anche quando il cancello non ha la variabile nell ambiente. Fonti (lette il 13/11/2026): gnu.org/software/bash/manual/bash.html
 * («Lists of Commands»: con `&` la shell esegue il comando in sottofondo in una sottoshell; «Pipelines»: ogni comando di una pipe gira
 * nella sua sottoshell; «Grouping Commands»: `( list )` in una sottoshell), learn.microsoft.com/windows-server/administration/
 * windows-commands/cmd (`%ComSpec%` è il percorso di cmd.exe). `Start-Job { cd … }` di PowerShell resta un limite scritto.
 */
const progettoS = { percorso: sessione, perche: 'progetto' };
test('CURA-CS1 — `%ComSpec% /c` è cmd anche senza la variabile nell ambiente: `cd X:\…` senza /d non sposta e `rd /s /q .` cancella il progetto', { skip: SALTA }, () => {
  for (const comando of [`%ComSpec% /c "cd ${K} && rd /s /q ."`, '%COMSPEC% /c "rd /s /q ."']) assert.deepEqual(critica(comando), progettoS, comando);
  for (const comando of [`%ComSpec% /c "cd /d ${K} && rd /s /q ."`, '%ComSpec% /c dir']) assert.equal(critica(comando), null, `al contrario: ${comando}`);
});

test('CURA-SF1 — bash: un `cd` mandato in sottofondo con `&` non sposta chi viene dopo; `rm -rf *` dopo cancella il progetto', { skip: SALTA }, () => {
  for (const comando of [`bash -c "cd /${a}/dati/build & rm -rf *"`, `bash -c "cd /${a}/dati/build && npm test & rm -rf *"`, `cd /${a}/dati/build & rm -rf *`, `sh -c "cd /mnt/${a}/dati/build & rm -rf ./*"`]) {
    assert.deepEqual(critica(comando), progettoS, comando);
  }
  /* al contrario: dentro la stessa lista in sottofondo il `cd` vale; e in cmd `&` non manda niente in sottofondo */
  for (const comando of [`bash -c "cd /${a}/dati/build && rm -rf * &"`, `bash -c "cd /${a}/dati/build && rm -rf *"`, `cd /d ${K} & rd /s /q .`, `cd /${a}/dati/build && rm -rf *`]) {
    assert.equal(critica(comando), null, `al contrario: ${comando}`);
  }
});

test('CURA-SS1 — bash: un `cd` dentro una sottoshell `( … )` non sposta chi viene dopo la parentesi', { skip: SALTA }, () => {
  for (const comando of [`bash -c "(cd /${a}/dati/build) && rm -rf *"`, `bash -c "(cd /${a}/dati/build && make); rm -rf *"`]) assert.deepEqual(critica(comando), progettoS, comando);
  assert.equal(critica(`bash -c "(cd /${a}/dati/build && rm -rf *)"`), null, 'al contrario: dentro la sottoshell il `cd` vale');
});

test('CURA-PP1 — bash: un `cd` messo in una pipe non sposta; in PowerShell sì', { skip: SALTA }, () => {
  for (const comando of [`bash -c "cd /${a}/dati/build | true; rm -rf *"`, `bash -c "true | cd /${a}/dati/build; rm -rf *"`]) assert.deepEqual(critica(comando), progettoS, comando);
  assert.equal(critica(`powershell -c "cd ${K} | Out-Null; ri -r -fo *"`), null, 'al contrario: in PowerShell `cd` in una pipe sposta');
});

test('CURA-LV1 — dal cancello: le forme del `cd` che non resta hanno la carta ai tre livelli; quella onesta nessuna', { skip: SALTA }, async () => {
  for (const livello of LIVELLI) {
    const chieste = await carte(`bash -c "cd /${a}/dati/build & rm -rf *"`, livello);
    assert.equal(chieste.length, 1, livello);
    assert.equal(chieste[0].cancellazioneCritica?.perche, 'progetto', livello);
    assert.equal((await carte(`bash -c "cd /${a}/dati/build && rm -rf * &"`, livello)).filter((c) => c.cancellazioneCritica).length, 0, `onesta: ${livello}`);
  }
});

test('CURA-SF2 — le altre porte di bash (`<<<`, `echo … | bash`) e le altre forme in testa (`/mnt/x/…`, `pushd`): il `cd` in sottofondo non sposta', { skip: SALTA }, () => {
  for (const comando of [`bash <<< "cd /${a}/dati/build & rm -rf *"`, `echo "cd /${a}/dati/build & rm -rf *" | bash`, `cd /mnt/${a}/dati/build & rm -rf *`, `pushd /${a}/dati/build & rm -rf *`]) {
    assert.deepEqual(critica(comando), progettoS, comando);
  }
  assert.equal(critica(`bash <<< "cd /${a}/dati/build && rm -rf *"`), null, 'al contrario: senza sottofondo il `cd` sposta');
});

test('CURA-ON1 — onestà: `&>` e `2>&1` non mandano in sottofondo; dopo `;` o a capo il `cd` resta; fuori da bash le parentesi di cmd non sono una sottoshell', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd /${a}/dati/build &>/dev/null && rm -rf *"`,
    `bash -c "cd /${a}/dati/build >/dev/null 2>&1 && rm -rf *"`,
    `bash -c "cd /${a}/dati/build; npm test & rm -rf *"`,
    `bash -c "cd /${a}/dati/build\nnpm test & rm -rf *"`,
    `bash -c "echo hi" & (cd /d ${K}) & rd /s /q .`,
  ]) assert.equal(critica(comando), null, comando);
});

test('CURA-PT1 — `bash <<<` ed `echo … | bash` portano la regola di bash: sottoshell e pipe non spostano chi viene dopo', { skip: SALTA }, () => {
  for (const comando of [`bash <<< "(cd /${a}/dati/build) && rm -rf *"`, `echo "cd /${a}/dati/build | true; rm -rf *" | bash`]) assert.deepEqual(critica(comando), progettoS, comando);
});
