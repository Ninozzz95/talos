/*
 * Cura del ROSSO del revisore della pila delle liste (13/11/2026) — LA «&» CHE NON MANDA IN SOTTOFONDO.
 * Con la regola di bash un `&` da solo manda in sottofondo la lista prima di lui, e la cartella torna com'era (giro piccolo 25378b560).
 * Ma non ogni `&` è un sottofondo, e non ogni lista parte dove partiva la pila: allora il `cd ..` di prima «tornava indietro» e
 * `rm -rf *` cadeva in `src`, mentre bash lo esegue nella RADICE del progetto. 0.2.1 e 7888d4413 davano la carta (1 e 1), la testa no.
 *  - EC-*: le 9 forme del revisore (`forme-nuove.log` A1-A4, B1-B3, C1-C2), dalla funzione e dal cancello intero, in Accesso pieno e
 *    in Scrive nel progetto: `echo a\&b` (la barra toglie il senso al `&`), `cat <&0` e `true <&-` (redirezioni), `bash <<<` con
 *    `\&`, un `&` dentro un ramo di `case` (anche in una sottoshell e con la `(` davanti al modello), nella condizione di `if` e `while`.
 *  - EC-COMUNI: i 12 comandi comuni del revisore con `&` e sottoshell, onesti: nessuna carta (al contrario).
 * Niente viene eseguito: solo il cancello a parole, su lettere di dischi che non esistono. Nessuna cancellazione; il bash vero non si prova.
 * Fonti (lette il 13/11/2026): man7.org/linux/man-pages/man1/bash.1.html — QUOTING («A non-quoted backslash (\) is the escape
 * character. It preserves the literal value of the next character»), REDIRECTION («[n]<&word is used to duplicate input file
 * descriptors», «If word evaluates to -, file descriptor n is closed»), Compound Commands («case word in [ [(] pattern [ | pattern ]
 * ... ) list ;; ] ... esac», «Using ;& in place of ;; causes execution to continue with the list associated with the next pattern
 * list»; «if list; then list; ... fi», «while list-1; do list-2; done»), Lists («If a command is terminated by the control operator
 * &, the shell executes the command in the background in a subshell»).
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
const a = A.toLowerCase();
const casa = `${P}:${BS}Users${BS}tizio`;
const sessione = `${P}:${BS}lavori${BS}progetto`;

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

/* Le 9 forme del revisore: [id, comando]. In tutte bash esegue `rm -rf *` nella radice del progetto. */
const NOVE = [
  ['EC-A1', `bash -c "cd src; cd .. && echo a${BS}&b; rm -rf *"`],
  ['EC-A2', `bash -c "cd src; cd .. && cat <&0; rm -rf *"`],
  ['EC-A3', `bash -c "cd src; cd .. && true <&- ; rm -rf *"`],
  ['EC-A4', `bash <<< 'cd src; cd .. && echo a${BS}&b; rm -rf *'`],
  ['EC-B1', `bash -c "cd src; cd .. && case a in a) true & ;; esac; rm -rf *"`],
  ['EC-B2', `bash -c "cd src; cd .. && (case a in a) true & ;; esac); rm -rf *"`],
  ['EC-B3', `bash -c "cd src; cd .. && case a in (a) true & ;; esac; rm -rf *"`],
  ['EC-C1', `bash -c "cd src; cd .. && if make & then true; fi; rm -rf *"`],
  ['EC-C2', `bash -c "cd src; cd .. && while false & do break; done; rm -rf *"`],
];
for (const [id, comando] of NOVE) {
  test(`${id} — un \`&\` che non manda in sottofondo (o che manda solo la lista dentro il costrutto) non riporta indietro il \`cd ..\`: la carta del progetto c'è, dalla funzione e dal cancello (Accesso pieno, Scrive nel progetto)`, { skip: SALTA }, async () => {
    assert.equal(critica(comando)?.perche, 'progetto', `funzione: ${comando}`);
    for (const livello of DUE) {
      const chieste = (await carte(comando, livello)).filter((c) => c.cancellazioneCritica);
      assert.equal(chieste.length, 1, `${livello}: ${comando}`);
      assert.equal(chieste[0].cancellazioneCritica.perche, 'progetto', `${livello}: ${comando}`);
    }
  });
}

/* I 12 comandi comuni del revisore (`casi-comuni.mjs`), onesti: nessuna carta, né dalla funzione né dal cancello */
const COMUNI = [
  '(npm run dev &) && rm -rf dist',
  '{ make & wait; } && rm -rf build/tmp',
  'npm start & npx wait-on http://127.0.0.1:3000 && npm test && rm -rf coverage',
  '(cd src && npm run build) && rm -rf dist',
  'bash -c "cd build && (cmake .. &) ; rm -rf CMakeFiles"',
  'bash -c "cd src && (node server.js &) && sleep 2 && rm -rf .cache"',
  `bash -c "(cd /${a}/dati/build && make &) ; cd build && rm -rf *"`,
  'bash -c "{ cd build && rm -rf *; } & wait"',
  'bash -c "mkdir -p tmp && (cd tmp && touch a &) && rm -rf tmp/*"',
  `bash -c "cd /${a}/dati/build && { npm ci & npm run lint; wait; } && rm -rf node_modules"`,
  'bash -c "npm run dev & sleep 3 && rm -rf .next/cache"',
  `bash -c "cd /${a}/dati/build && (true &) && rm -rf ./*"`,
];
test('EC-COMUNI — al contrario: i 12 comandi comuni con `&` e sottoshell non hanno carta, dalla funzione e dal cancello', { skip: SALTA }, async () => {
  for (const comando of COMUNI) {
    assert.equal(critica(comando), null, `funzione: ${comando}`);
    for (const livello of DUE) assert.equal((await carte(comando, livello)).filter((c) => c.cancellazioneCritica).length, 0, `${livello}: ${comando}`);
  }
});

/*
 * La cura precisa (sopra la rete): `if`, `case`, `while`, `until`, `for`, `select` aprono una lista come `{`, la lista riparte a `then`,
 * `do`, `else`, `elif` e alla `)` del modello di un ramo di `case`; un `&` dopo `\`, `<` o `;` non è un sottofondo. Le carte false che la
 * regola del sottofondo dava (la testa 5865b474f e la sola rete: 1 e 1) e che 0.2.1 non dava: `cd K && … ; rm -rf *` cancella K.
 */
const ONESTE_PRECISE = [
  ['EC-P1 case in sottoshell', `bash -c "cd /${a}/dati/build && (case a in a) true & ;; esac) ; rm -rf *"`],
  ['EC-P2 case in sottoshell con cd', `bash -c "cd /${a}/dati/build && (case a in a) cd /${a}/dati/altro ;; esac) ; rm -rf *"`],
  ['EC-P3 case con & nel ramo', `bash -c "cd /${a}/dati/build && case a in a) true & ;; esac; rm -rf *"`],
  ['EC-P4 if make & then', `bash -c "cd /${a}/dati/build && if make & then true; fi; rm -rf *"`],
  ['EC-P5 echo a\&b', `bash -c "cd /${a}/dati/build && echo a${BS}&b; rm -rf *"`],
];
for (const [id, comando] of ONESTE_PRECISE) {
  test(`${id} — onesta: \`cd K && …\` con un \`&\` dentro un costrutto o senza sottofondo cancella K, non il progetto: nessuna carta, dalla funzione e dal cancello`, { skip: SALTA }, async () => {
    assert.equal(critica(comando), null, `funzione: ${comando}`);
    for (const livello of DUE) assert.equal((await carte(comando, livello)).filter((c) => c.cancellazioneCritica).length, 0, `${livello}: ${comando}`);
  });
}

test('EC-P6 — la lista dentro i costrutti: un `&` nel ramo, nel `then` o nel `do` manda in sottofondo solo quella; il `cd ..` di prima resta', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd src; cd .. && case a in a) case b in b) true & ;; esac ;; esac; rm -rf *"`,
    `bash -c "cd src; cd .. && if make; then true & else false & fi; rm -rf *"`,
    `bash -c "cd src; cd .. && until false & do break; done; rm -rf *"`,
    `bash -c "cd src; cd .. && for f in a; do true & done; rm -rf *"`,
    `bash -c "cd src; cd .. && case a in a) true ;;& b) true & ;; esac; rm -rf *"`,
    `bash -c "cd src; cd .. && if false; then true; elif make & then true; fi; rm -rf *"`,
    `bash -c "cd src; cd .. && case a in\n a) true &\n ;;\nesac\nrm -rf *"`,
    `bash -c "cd src; cd .. && case a in a|b) true & ;; esac; rm -rf *"`,
    `bash -c "cd src; cd .. && { if make & then true; fi; } ; rm -rf *"`,
    `bash -c "cd src; cd .. && if make 2>&1 & then true; fi; rm -rf *"`,
  ]) assert.equal(critica(comando)?.perche, 'progetto', comando);
});

/*
 * La barra toglie il senso solo al carattere dopo di lei: dopo un numero PARI di barre (`\` è una barra scritta) il `&` è un
 * sottofondo, e dopo `\<` il `<` è scritto e il `&` è un sottofondo (man7.org bash(1), QUOTING). La cura precisa li leggeva come
 * `\&` e `<&`, e la carta del giro piccolo (5865b474f: 1 e 1) spariva: `cd K && echo a\& rm -rf *` manda `cd K` in sottofondo e
 * `rm -rf *` cancella il progetto.
 */
const FUGHE = [
  ['EC-X1 due barre', `bash -c "cd /${a}/dati/build && echo a${BS}${BS}& rm -rf *"`],
  ['EC-X2 minore scritto', `bash -c "cd /${a}/dati/build && echo a${BS}<& rm -rf *"`],
];
for (const [id, comando] of FUGHE) {
  test(`${id} — un \`&\` dopo una barra scritta è un sottofondo: \`cd K\` va in sottofondo e \`rm -rf *\` cancella il progetto, dalla funzione e dal cancello`, { skip: SALTA }, async () => {
    assert.equal(critica(comando)?.perche, 'progetto', `funzione: ${comando}`);
    for (const livello of DUE) {
      const chieste = (await carte(comando, livello)).filter((c) => c.cancellazioneCritica);
      assert.equal(chieste.length, 1, `${livello}: ${comando}`);
      assert.equal(chieste[0].cancellazioneCritica.perche, 'progetto', `${livello}: ${comando}`);
    }
  });
}
test('EC-X3 — al contrario: tre barre prima del `&` (`a\\\&b`) sono una barra scritta e un `&` scritto: il `cd ..` resta', { skip: SALTA }, () => {
  assert.equal(critica(`bash -c "cd src; cd .. && echo a${BS}${BS}${BS}&b; rm -rf *"`)?.perche, 'progetto');
});
