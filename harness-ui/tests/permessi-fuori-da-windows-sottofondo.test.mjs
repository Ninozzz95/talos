/*
 * R15 (13/11/2026, giudice v1757 f, sì dell'owner alle 12:25) — FUORI DA WINDOWS LA REGOLA DI BASH DEL SOTTOFONDO.
 * Su Linux, Android e macOS il comando lo esegue una shell POSIX: un `cd` mandato in sottofondo con `&`, chiuso in una sottoshell o
 * messo in una pipe gira in un processo figlio, e chi viene dopo resta nella cartella del comando. Fino alla 0.2.1 (e fino a questo
 * commit) `cd /x & rm -rf *` passava senza carta fuori da Windows, mentre Windows chiedeva: `rm -rf *` cancella il PROGETTO.
 *  - R15-V*: le carte vere (R15 e varianti del revisore: al primo livello, dentro `bash -c` e `sh -c`, sottoshell, pipe, graffe in pipe).
 *  - R15-O*: al contrario, i comandi onesti e i 12 comuni del revisore letti come Linux: nessuna carta.
 *  - R15-G*: su POSIX la `}` è una parola riservata che chiude il gruppo (`{ cd x; } | true`), e una parola riservata vale solo nuda.
 * Solo la funzione, a parole (il cancello intero legge `process.platform`): niente viene eseguito, nessuna cancellazione.
 * Fonti (lette il 13/11/2026): man7.org/linux/man-pages/man1/bash.1.html — Lists («If a command is terminated by the control
 * operator &, the shell executes the command in the background in a subshell»), Pipelines («Each command in a multi-command
 * pipeline … is executed in a subshell»), Compound Commands («( list ) … executed in a subshell», «{ list; } … executed in the
 * current shell environment», reserved words `{` `}`), QUOTING.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';

const BS = String.fromCharCode(92);
const PIATTAFORME = ['linux', 'android', 'darwin'];
const mondo = (piattaforma) => ({ cartella: '/home/tizio/lavori/progetto', home: '/home/tizio', piattaforma, ambiente: {}, realpathFn: (p) => p });
const perche = (comando, piattaforma) => cancellazioneCritica(comando, mondo(piattaforma))?.perche ?? null;

test('R15-V1 — `cd /x & rm -rf *` e le varianti: il `cd` non resta e `rm -rf *` cancella il progetto, su Linux, Android e macOS', () => {
  for (const piattaforma of PIATTAFORME) {
    for (const comando of [
      'cd /srv/dati/build & rm -rf *',
      'bash -c "cd /srv/dati/build & rm -rf *"',
      'sh -c "cd /srv/dati/build & rm -rf ."',
      '(cd /srv/dati/build); rm -rf *',
      'cd /srv/dati/build | true; rm -rf *',
      'bash -c "(cd /srv/dati/build) && rm -rf *"',
      'sh -c "cd /srv/dati/build | true; rm -rf *"',
      '{ cd /srv/dati/build; } | tee log; rm -rf *',
      '{ cd /srv/dati/build; } & rm -rf *',
    ]) assert.equal(perche(comando, piattaforma), 'progetto', `${piattaforma}: ${comando}`);
  }
});

test('R15-V2 — le forme del ROSSO della pila lette come Linux: un `&` dentro i costrutti o senza sottofondo non riporta indietro il `cd ..`', () => {
  for (const comando of [
    'cd src; cd .. && (npm run dev &) ; rm -rf *',
    `cd src; cd .. && echo a${BS}&b; rm -rf *`,
    'cd src; cd .. && cat <&0; rm -rf *',
    'cd src; cd .. && case a in a) true & ;; esac; rm -rf *',
    'cd src; cd .. && if make & then true; fi; rm -rf *',
    'cd src; cd .. && { make & wait; } ; rm -rf *',
  ]) assert.equal(perche(comando, 'linux'), 'progetto', comando);
});

test('R15-O1 — al contrario: oneste e i 12 comuni del revisore letti come Linux, nessuna carta', () => {
  for (const piattaforma of PIATTAFORME) {
    for (const comando of [
      'cd /srv/dati/build && rm -rf *',
      'cd /srv/dati/build; (npm run dev &); rm -rf *',
      '{ cd /srv/dati/build; } ; rm -rf *',
      'cd /srv/dati/build && { make & wait; } ; rm -rf *',
      '(npm run dev &) && rm -rf dist',
      '{ make & wait; } && rm -rf build/tmp',
      'npm start & npx wait-on http://127.0.0.1:3000 && npm test && rm -rf coverage',
      '(cd src && npm run build) && rm -rf dist',
      'bash -c "cd build && (cmake .. &) ; rm -rf CMakeFiles"',
      'bash -c "cd src && (node server.js &) && sleep 2 && rm -rf .cache"',
      'bash -c "(cd /srv/dati/build && make &) ; cd build && rm -rf *"',
      'bash -c "{ cd build && rm -rf *; } & wait"',
      'bash -c "mkdir -p tmp && (cd tmp && touch a &) && rm -rf tmp/*"',
      'bash -c "cd /srv/dati/build && { npm ci & npm run lint; wait; } && rm -rf node_modules"',
      'bash -c "npm run dev & sleep 3 && rm -rf .next/cache"',
      'bash -c "cd /srv/dati/build && (true &) && rm -rf ./*"',
    ]) assert.equal(perche(comando, piattaforma), null, `${piattaforma}: ${comando}`);
  }
});

test('R15-G1 — su POSIX la `}` chiude il gruppo: in una pipe il gruppo gira in una sottoshell, dopo un `&` va in sottofondo tutto', () => {
  assert.equal(perche('{ cd /srv/dati/build && make; } | tee log && rm -rf .', 'linux'), 'progetto');
  assert.equal(perche('cd /srv/dati/build && { true; } & rm -rf *', 'linux'), 'progetto');
  assert.equal(perche('{ cd /srv/dati/build; rm -rf *; } | true', 'linux'), null, 'al contrario: dentro il gruppo il `cd` vale');
});

test('R15-G2 — una parola riservata vale solo nuda: `\\if` e `"case"` sono comandi, non aprono niente', () => {
  for (const comando of [`cd /srv/dati/build && { ${BS}if x; } & rm -rf *`, 'cd /srv/dati/build && { "case" x; } & rm -rf *']) {
    assert.equal(perche(comando, 'linux'), 'progetto', comando);
  }
});

test('R15-G3 — una parola con una barra di fuga non è riservata nemmeno su macOS e Android: `\\until` e `\\fi` sono comandi', () => {
  for (const piattaforma of ['darwin', 'android']) {
    for (const comando of [`cd /srv/dati/build && { ${BS}until x; } & rm -rf *`, `{ cd /srv/dati/build; ${BS}fi; } | true; rm -rf *`]) {
      assert.equal(perche(comando, piattaforma), 'progetto', `${piattaforma}: ${comando}`);
    }
  }
});
