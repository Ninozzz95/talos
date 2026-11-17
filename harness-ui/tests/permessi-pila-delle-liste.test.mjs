/*
 * Cura del ROSSO del revisore sul giro piccolo dei permessi (13/11/2026) — LA PILA DELLE LISTE.
 * Il giro piccolo leggeva con la regola di bash un `&` da solo come «la lista prima di lui va in sottofondo», ma la lista partiva da
 * `inizioLista`, che `(` e `{` non azzeravano: un `&` DENTRO una sottoshell o un gruppo fra graffe mandava in sottofondo anche i
 * comandi di FUORI, e la cartella tornava a una di prima.
 *  - PILA-V*: le 9 forme vere del revisore (`forme2.log`, `carte-ap.log` R1-R3): 0.2.1 e la base 7888d4413 davano la carta, la testa
 *    25378b560 no. `bash -c "cd src; cd .. && (npm run dev &) ; rm -rf *"` cancella il progetto. Dalla funzione e dal cancello, in
 *    Accesso pieno e in Scrive nel progetto. La V-A8 del revisore si scrive con `| true` (il nome dice `||`): in bash il `cd ..` di
 *    una pipe non resta (gnu.org «Pipelines») e `rm -rf *` cade in `src`, quindi la forma vera col nome della riga è quella con `||`.
 *  - PILA-O*: le 4 carte false nuove (base 0): `cd K && (npm start &) && rm -rf *` cancella K, non il progetto.
 *  - PILA-R*: due mutanti vivi del revisore (R10 «se ne riprende una sola», R11 `shift` al posto di `pop`): due forme diverse.
 *  - PILA-N*: sottoshell e graffe una dentro l'altra, con e senza `&`; PILA-G*: le graffe in una pipe (`{ cd x; } | true`) girano in
 *    una sottoshell; PILA-ON2: l'a capo fa ripartire la lista (seconda prova per R08).
 *  - PILA-W*: `wsl bash -c`, `wsl -e bash -c`, `wsl sh -c` (giudice v1742): il testo che riceve bash dentro WSL, che parte nella
 *    cartella di Windows del comando. SOLO TESTO: niente viene eseguito, WSL non si tocca.
 * Niente viene eseguito: solo il cancello a parole, su lettere di dischi che non esistono. Nessuna cancellazione.
 * Fonti (lette il 13/11/2026): gnu.org/software/bash/manual «Command Grouping» («( list ) … a subshell», «{ list; } … executed in
 * the current shell context. No subshell is created»), «Lists of Commands» («terminated by the control operator ‘&’, the shell
 * executes the command asynchronously in a subshell»), «Pipelines»; learn.microsoft.com/windows/wsl/basic-commands (`wsl
 * --distribution <Name> --user <User>`, `wsl ~`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';

const WINDOWS = process.platform === 'win32';
const BS = String.fromCharCode(92);
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA = !WINDOWS || liberi.length < 2;
const P = liberi[0] ?? 'L'; // il disco del progetto
const A = liberi[1] ?? 'K'; // l'altro disco
const p = P.toLowerCase();
const a = A.toLowerCase();
const casa = `${P}:${BS}Users${BS}tizio`;
const sessione = `${P}:${BS}lavori${BS}progetto`;
const progettoS = { percorso: sessione, perche: 'progetto' };

const critica = (comando, cartella = sessione) => cancellazioneCritica(comando, { cartella, home: casa, piattaforma: 'win32', ambiente: {} });
const carte = async (comando, livelloAccesso) => {
  const chieste = [];
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = casa; process.env.HOME = casa;
  try {
    await verificaPermessoScrittura({ toolCallId: 'k', tipo: 'shell', comando }, { livelloAccesso, cartella: sessione, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return chieste;
};
const DUE = ['accesso-pieno', 'scrittura-progetto'];

/* Le 9 forme vere del revisore: [id, comando, perché della carta] */
const VERE = [
  ['V-A1', `bash -c "cd /${a}/dati/build; cd /${p}/lavori/progetto && (true &); rm -rf *"`, 'progetto'],
  ['V-A2', `bash -c "cd src; cd .. && (npm run dev &) ; rm -rf *"`, 'progetto'],
  ['V-A3', `bash -c "cd /${a}/dati/build; cd /${p}/lavori/progetto && { make & wait; } ; rm -rf *"`, 'progetto'],
  ['V-A4', `bash -c "cd src\ncd .. && (true &)\nrm -rf *"`, 'progetto'],
  ['V-A5', `bash -c "cd src; cd .. && (true &); rm -rf ."`, 'progetto'],
  ['V-A6', `bash -c "cd /${a}/dati/build; cd /${p}/lavori && (true &); rm -rf *"`, 'primo-livello'],
  ['V-A7', `bash -c "cd src; pushd .. && (true &); rm -rf *"`, 'progetto'],
  ['V-A8', `bash -c "cd src; cd .. || (true &); rm -rf *"`, 'progetto'],
  ['V-A9', `sh -c "cd src; cd .. && (sleep 1 &); rm -rf *"`, 'progetto'],
];
for (const [id, comando, perche] of VERE) {
  test(`PILA-${id} — un \`&\` dentro \`( … )\` o \`{ … }\` non riporta la cartella a una lista di fuori: la carta c'è, dalla funzione e dal cancello (Accesso pieno, Scrive nel progetto)`, { skip: SALTA }, async () => {
    assert.equal(critica(comando)?.perche, perche, `funzione: ${comando}`);
    for (const livello of DUE) {
      const chieste = (await carte(comando, livello)).filter((c) => c.cancellazioneCritica);
      assert.equal(chieste.length, 1, `${livello}: ${comando}`);
      assert.equal(chieste[0].cancellazioneCritica.perche, perche, `${livello}: ${comando}`);
    }
  });
}

/* Quinto giro (13/11/2026, «la regola del sottofondo può solo aggiungere carte»): il `cd ..` della pipe vale nei due casi, e se resta
   `rm -rf *` cade nel progetto. Bash resta in `src`: la carta è FALSA, ed è il prezzo scritto (come nella 0.2.1). */
test('PILA-V-A8-PIPE — la V-A8 com è scritta (`cd .. | true`): bash resta in `src`, ma il caso «il cd resta» cade nel progetto: carta (il prezzo, come nella 0.2.1)', { skip: SALTA }, () => {
  assert.deepEqual(critica(`bash -c "cd src; cd .. | true && (true &); rm -rf *"`), progettoS);
  assert.deepEqual(critica(`bash -c "cd .. | true && (true &); rm -rf *"`), progettoS, 'al contrario: senza il primo `cd src` resta il progetto');
});

/* Le 4 carte false nuove: il `cd` vale per tutta la lista di fuori, la sottoshell o il gruppo in sottofondo dentro non la toccano */
const ONESTE = [
  ['O1', `bash -c "cd /${a}/dati/build && (npm start &) && rm -rf *"`],
  ['O2', `bash -c "cd /${a}/dati/build && (true &) ; rm -rf *"`],
  ['O3', `bash -c "cd /${a}/dati/build && { make & wait; } ; rm -rf *"`],
  ['O4', `bash -c "cd /${a}/dati/build && (npm run build &) ; rm -rf *"`],
];
for (const [id, comando] of ONESTE) {
  test(`PILA-${id} — onesta: \`cd K && ( … & )\` cancella K, non il progetto: nessuna carta, dalla funzione e dal cancello`, { skip: SALTA }, async () => {
    assert.equal(critica(comando), null, `funzione: ${comando}`);
    for (const livello of DUE) assert.equal((await carte(comando, livello)).length, 0, `${livello}: ${comando}`);
  });
}

test('PILA-R1 — sottoshell una dentro l altra: all uscita si riprendono TUTTE le cartelle messe da parte, dalla più nuova', { skip: SALTA }, async () => {
  const comando = `bash -c "(cd /${a}/a; (cd /${a}/b)); rm -rf *"`;
  assert.deepEqual(critica(comando), progettoS);
  for (const livello of DUE) assert.equal((await carte(comando, livello)).filter((c) => c.cancellazioneCritica?.perche === 'progetto').length, 1, livello);
});

test('PILA-R2 — dopo `cd src`, due sottoshell annidate: si torna in `src`, e `rm -rf ..` cancella il progetto', { skip: SALTA }, () => {
  assert.deepEqual(critica(`bash -c "cd src && (cd /${a}/a/b; (cd /${a}/c)); rm -rf .."`), progettoS);
  assert.deepEqual(critica(`bash -c "cd src; (cd /${a}/a/b && (cd /${a}/c &)); rm -rf .."`), progettoS, 'con un `&` dentro');
});

test('PILA-N1 — sottoshell e graffe annidate, con e senza `&`', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd /${a}/dati/build && (true &) & rm -rf *"`, // tutta la lista di fuori va in sottofondo
    `bash -c "(cd /${a}/dati/build &) ; rm -rf *"`,
    `bash -c "{ cd /${a}/dati/build & } ; rm -rf *"`,
    `bash -c "{ cd /${a}/dati/build; } & rm -rf *"`,
    `bash -c "( { cd /${a}/dati/build; } ) ; rm -rf *"`,
  ]) assert.deepEqual(critica(comando), progettoS, comando);
  /* quinto giro: la sottoshell torna in `src` per bash, ma il caso «il cd resta» cade nel progetto: carta (il prezzo, come nella 0.2.1) */
  assert.deepEqual(critica(`bash -c "cd src; (cd .. && { true & }); rm -rf *"`), progettoS);
  for (const comando of [
    `bash -c "{ cd /${a}/dati/build; } ; rm -rf *"`, // le graffe girano qui: il cd resta
    `bash -c "{ cd /${a}/dati/build; { true & } ; } ; rm -rf *"`,
    `bash -c "cd /${a}/dati/build && { (true &) ; } && rm -rf *"`,
  ]) assert.equal(critica(comando), null, `al contrario: ${comando}`);
});

test('PILA-G1 — graffe in una pipe: girano in una sottoshell, il `cd` dentro non resta', { skip: SALTA }, async () => {
  for (const comando of [`bash -c "{ cd /${a}/dati/build; } | true; rm -rf *"`, `bash -c "{ cd /${a}/dati/build; make; } | tee log; rm -rf *"`]) {
    assert.deepEqual(critica(comando), progettoS, comando);
  }
  for (const livello of DUE) assert.equal((await carte(`bash -c "{ cd /${a}/dati/build; } | true; rm -rf *"`, livello)).filter((c) => c.cancellazioneCritica).length, 1, livello);
});

test('PILA-G2 — al contrario: dentro le graffe della pipe il `cd` vale; graffe senza pipe girano qui', { skip: SALTA }, () => {
  for (const comando of [`bash -c "{ cd /${a}/dati/build; rm -rf *; } | true"`, `bash -c "{ cd /${a}/dati/build; } ; true | cat; rm -rf *"`]) {
    assert.equal(critica(comando), null, comando);
  }
});

test('PILA-ON2 — l a capo fa ripartire la lista: un `&` dopo l a capo non manda in sottofondo il `cd` di prima', { skip: SALTA }, () => {
  for (const comando of [`sh -c "cd /${a}/dati/build\n(true) & rm -rf ./*"`, `bash -c "cd /${a}/dati/build\n{ make; } & rm -rf *"`]) {
    assert.equal(critica(comando), null, comando);
  }
});

test('PILA-W1 — `wsl bash -c`, `wsl -e bash -c`, `wsl sh -c`: il testo lo riceve bash nella cartella del comando; `rm -rf *` cancella il progetto (SOLO TESTO)', { skip: SALTA }, async () => {
  for (const comando of [`wsl bash -c "rm -rf *"`, `wsl -e bash -c "rm -rf *"`, `wsl sh -c "rm -rf ."`, `wsl.exe -d Ubuntu -u root bash -c "rm -rf *"`, `wsl --distribution Ubuntu -e bash -c "rm -rf *"`, `wsl -- bash -c "cd src; cd .. && (true &); rm -rf *"`]) {
    assert.deepEqual(critica(comando), progettoS, comando);
  }
  for (const livello of DUE) assert.equal((await carte(`wsl bash -c "rm -rf *"`, livello)).filter((c) => c.cancellazioneCritica?.perche === 'progetto').length, 1, livello);
});

/* Seconde prove: ogni mutante delle righe nuove ucciso da una prova sola (P04, P06, P09, P10, P11, P12, P13, P15), i vivi non
   equivalenti (P07 «del gruppo solo l ultimo comando», P14 «--distribution senza valore», R13 del revisore), con forme diverse.
   Le graffe col `;` dentro non bastano: la lettura di cmd le fonde in un comando solo, così si usano `&&` e l'a capo. */
test('PILA-S1 — graffe in una pipe con `&&` e con l a capo: tutto il gruppo gira in una sottoshell', { skip: SALTA }, () => {
  for (const comando of [`bash -c "{ cd /${a}/dati/build && make; } | tee log; rm -rf *"`, `bash -c "{ cd /${a}/dati/build\nmake\n} | tee log\nrm -rf *"`, `bash -c "{ cd /${a}/dati/build && make; } | tee log && rm -rf ."`]) {
    assert.deepEqual(critica(comando), progettoS, comando);
  }
  assert.equal(critica(`bash -c "{ cd /${a}/dati/build && make && rm -rf *; } | tee log"`), null, 'al contrario: dentro il gruppo il `cd` vale');
});

test('PILA-S4 — dal cancello: le graffe con `&&` in una pipe, poi `rm -rf *`, hanno la carta del progetto (Accesso pieno, Scrive nel progetto)', { skip: SALTA }, async () => {
  for (const livello of DUE) {
    const chieste = (await carte(`bash -c "{ cd /${a}/dati/build && npm run build; } | tee build.log; rm -rf *"`, livello)).filter((c) => c.cancellazioneCritica);
    assert.equal(chieste.length, 1, livello);
    assert.equal(chieste[0].cancellazioneCritica.perche, 'progetto', livello);
  }
});

test('PILA-S2 — dopo la parentesi o le graffe torna la lista di fuori: con un `&` dopo, va in sottofondo tutta', { skip: SALTA }, () => {
  for (const comando of [`bash -c "cd /${a}/dati/build && (true) & rm -rf *"`, `bash -c "cd /${a}/dati/build && { make; } & rm -rf ."`]) assert.deepEqual(critica(comando), progettoS, comando);
});

test('PILA-S3 — wsl con le opzioni che prendono un valore (`--distribution`, `-d`) e `--cd` (SOLO TESTO)', { skip: SALTA }, () => {
  for (const comando of [`wsl --distribution Ubuntu sh -c "rm -rf ."`, `wsl -d Debian -e sh -c "rm -rf ."`, `wsl.exe --distribution Debian --user tizio bash -c "cd src; cd .. && (true &); rm -rf *"`]) {
    assert.deepEqual(critica(comando), progettoS, comando);
  }
  assert.equal(critica(`wsl --cd /mnt/${a}/dati/build -e sh -c "rm -rf ."`), null, 'al contrario: `--cd` sposta');
});

test('PILA-W2 — al contrario: dentro WSL un `cd` verso un altra cartella sposta; `wsl --cd` sposta; `wsl ls` non cancella (SOLO TESTO)', { skip: SALTA }, () => {
  for (const comando of [`wsl bash -c "cd /mnt/${a}/dati/build && rm -rf *"`, `wsl --cd /mnt/${a}/dati/build bash -c "rm -rf *"`, 'wsl ls -la', 'wsl --status', `wsl -e bash -lc "cd /mnt/${a}/tmp/build && rm -rf *"`]) {
    assert.equal(critica(comando), null, comando);
  }
});
