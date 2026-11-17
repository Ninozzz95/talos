/*
 * I gialli del revisore della pila delle liste (13/11/2026): mutanti vivi e NON equivalenti, e uccisi da una prova sola.
 *  - EG-Q07: `wsl --cd` verso il PROGETTO (le prove di prima provavano solo `--cd` verso fuori): `wsl --cd <progetto> bash -c "rm -rf *"`
 *    cancella il progetto. SOLO TESTO: WSL non si tocca, niente viene eseguito.
 *  - EG-Q09: `--shell-type <standard|login|none>` prende un valore (il CHANGELOG lo promette): `wsl --shell-type login bash -c …`.
 *  - EG-Q08: seconda prova per `-u` (prima solo `wsl.exe -d Ubuntu -u root bash -c`).
 *  - EG-R06: `case … ;&` (bash 4): il `&` di `;&` non è un sottofondo e la lista vuota prima di lui non conta.
 *  - EG-Q06: seconda prova per il gruppo fra graffe chiuso davanti a una pipe.
 * Niente viene eseguito: solo il cancello a parole, su lettere di dischi che non esistono. Nessuna cancellazione.
 * Fonti (lette il 13/11/2026): `wsl --help` (copia in chrisshort.net/…/wsl-help.txt: «--cd <Directory>», «--shell-type
 * <standard|login|none>», «--user, -u <UserName>»); learn.microsoft.com/windows/wsl/basic-commands (`--distribution`, `--user`);
 * man7.org bash(1), Compound Commands («Using ;& in place of ;; causes execution to continue with the list associated with the next
 * pattern list»), Pipelines.
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
const unaCarta = async (comando, perche = 'progetto') => {
  for (const livello of DUE) {
    const chieste = (await carte(comando, livello)).filter((c) => c.cancellazioneCritica);
    assert.equal(chieste.length, 1, `${livello}: ${comando}`);
    assert.equal(chieste[0].cancellazioneCritica.perche, perche, `${livello}: ${comando}`);
  }
};

test('EG-Q07 — `wsl --cd` verso il progetto prende un valore: `rm -rf *` dentro cancella il progetto (SOLO TESTO)', { skip: SALTA }, async () => {
  for (const comando of [`wsl --cd ${sessione} bash -c "rm -rf *"`, `wsl --cd /mnt/${p}/lavori/progetto -e sh -c "rm -rf ."`, `wsl --cd "${sessione}" -d Debian sh -c "rm -rf *"`]) {
    assert.equal(critica(comando)?.perche, 'progetto', comando);
  }
  assert.equal(critica(`wsl --cd ${P}:${BS}lavori sh -c "rm -rf *"`)?.perche, 'primo-livello', 'il genitore del progetto, primo livello del disco');
  await unaCarta(`wsl --cd ${sessione} bash -c "rm -rf *"`);
});

test('EG-Q09 — `wsl --shell-type` prende un valore (`standard`, `login`, `none`): il testo di bash dopo si legge (SOLO TESTO)', { skip: SALTA }, async () => {
  for (const comando of [`wsl --shell-type login bash -c "rm -rf *"`, `wsl --shell-type standard -e sh -c "rm -rf ."`, `wsl.exe --shell-type none -d Debian bash -c "cd src; cd .. && rm -rf *"`]) {
    assert.equal(critica(comando)?.perche, 'progetto', comando);
  }
  await unaCarta(`wsl --shell-type login bash -c "rm -rf *"`);
  assert.equal(critica(`wsl --shell-type login bash -c "cd /mnt/${a}/dati/build && rm -rf *"`), null, 'al contrario: dentro WSL il cd sposta');
});

test('EG-Q08 — `wsl -u <utente>` prende un valore, anche senza `-d` (SOLO TESTO)', { skip: SALTA }, async () => {
  for (const comando of [`wsl -u tizio sh -c "rm -rf ."`, `wsl -d Debian -u root -e bash -c "rm -rf *"`]) assert.equal(critica(comando)?.perche, 'progetto', comando);
  await unaCarta(`wsl -u tizio sh -c "rm -rf ."`);
});

test('EG-R06 — `case … ;&` (bash 4): il ramo continua, il `cd ..` di prima resta e `rm -rf *` cancella il progetto', { skip: SALTA }, async () => {
  for (const comando of [`bash -c "cd src; cd .. && case a in a) true ;& b) true ;; esac; rm -rf *"`, `bash -c "cd src; cd .. && case a in a) true ;;& *) true ;; esac; rm -rf *"`]) {
    assert.equal(critica(comando)?.perche, 'progetto', comando);
  }
  await unaCarta(`bash -c "cd src; cd .. && case a in a) true ;& b) true ;; esac; rm -rf *"`);
});

test('EG-Q07b — `wsl --cd` col percorso del progetto fra virgolette e con `-u`: la carta c è (SOLO TESTO)', { skip: SALTA }, () => {
  for (const comando of [`wsl --cd "${sessione}" -u tizio bash -c "rm -rf *"`, `wsl.exe --cd ${sessione} -e bash -c "cd src; cd .. && rm -rf *"`]) assert.equal(critica(comando)?.perche, 'progetto', comando);
});

test('EG-Q09b — `wsl --shell-type` con `-u` e con `--cd` dopo: il valore non è il comando (SOLO TESTO)', { skip: SALTA }, () => {
  for (const comando of [`wsl --shell-type login -u tizio sh -c "rm -rf ."`, `wsl --shell-type standard --cd ${sessione} bash -c "rm -rf *"`]) assert.equal(critica(comando)?.perche, 'progetto', comando);
});

test('EG-Q06 — al contrario: dopo un gruppo fra graffe chiuso da `;` la pipe che segue non lo riguarda (seconda prova)', { skip: SALTA }, () => {
  for (const comando of [`bash -c "{ cd /${a}/dati/build; } ; git log | head; rm -rf *"`, `bash -c "{ cd /${a}/dati/build; } ; ls | sort; rm -rf ./*"`]) assert.equal(critica(comando), null, comando);
});

test('EG-R06b — un `&` dopo la barra di continuazione e l a capo è un sottofondo di una lista vera: la lettura non si rompe e `rm -rf *` nel progetto ha la carta', { skip: SALTA }, async () => {
  assert.equal(critica(`bash -c "true ${BS}\n& rm -rf *"`)?.perche, 'progetto');
  await unaCarta(`bash -c "make ${BS}\n& rm -rf *"`);
});

/*
 * Mutanti delle righe nuove (rete e cura precisa), una forma per mutante e almeno due prove per ognuno. Le due letture si coprono
 * a vicenda, quindi le forme scelgono dove una sola delle due decide: le chiusure dei costrutti, i modelli di `case`, le parole
 * riservate, `time` davanti al costrutto (la cura precisa non lo vede, la rete sì), e la rete che chiude come la 0.2.1.
 */
test('EM-1 — le chiusure (`esac`, `fi`, `}` dentro `then`) riprendono la lista di fuori: con un `&` dopo va in sottofondo anche `cd K`', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd /${a}/dati/build && { case a in a) true ;; esac; } & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && if true; then true; fi & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && if true; then { true; }; fi & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && { 'while' x; } & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && echo case & rm -rf *"`,
  ]) assert.equal(critica(comando)?.perche, 'progetto', comando);
  assert.equal(critica(`bash -c "if { cd /${a}/dati/build; } then true & fi; rm -rf *"`), null, 'al contrario: il `cd` nella condizione resta');
});

test('EM-2 — i modelli di `case`: una parola riservata come modello non apre niente', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd /${a}/dati/build && case a in a) true ;; if) true ;; esac & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && case a in\nif) true ;; esac & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && case a in a) { true; } ;; esac & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && case a in\nwhile) true ;; esac & rm -rf *"`,
  ]) assert.equal(critica(comando)?.perche, 'progetto', comando);
});

test('EM-3 — una parola riservata vale solo nuda e in testa: fra apici o come argomento non apre niente', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd /${a}/dati/build && { 'if' x; } & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && echo if & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && case a in a) true ;; until) true ;; esac & rm -rf *"`,
    `bash -c "cd /${a}/dati/build && case a in\nuntil) true ;; esac & rm -rf *"`,
  ]) assert.equal(critica(comando)?.perche, 'progetto', comando);
});

test('EM-4 — al contrario: oneste con `\&`, `<&`, `<&-` e con il `then` dopo una condizione fra graffe', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd /${a}/dati/build && cat <&0; rm -rf *"`,
    `bash -c "cd /${a}/dati/build && printf %s a${BS}&b; rm -rf *"`,
    `bash -c "if { cd /${a}/dati/build; } then true & else true & fi; rm -rf *"`,
    `bash -c "cd /${a}/dati/build && true <&- ; rm -rf *"`,
  ]) assert.equal(critica(comando), null, comando);
});

test('EM-5 — la rete: con `time` davanti al costrutto la cura precisa non vede la lista, la rete sì: il `cd ..` resta e la carta c è', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd src; cd .. && time if make & then true; fi; rm -rf *"`,
    `bash -c "cd src; cd .. && time case a in a) true & ;; esac; rm -rf *"`,
    `bash -c "cd src; cd .. && time while false & do break; done; rm -rf *"`,
    `bash -c "cd src; cd .. && time until false & do break; done; rm -rf *"`,
    `cd src; cd /${P.toLowerCase()}/lavori/progetto & echo a${BS}&b; rm -rf *`,
    `bash -c "cd src; cd .. & true <&0; rm -rf *"`,
  ]) assert.equal(critica(comando)?.perche, 'progetto', comando);
});

test('EM-6 — la rete chiude come la 0.2.1 (Limiti noti): con `\&`, `<&`, `if`, `case` nel testo un `cd` mandato davvero in sottofondo chiede ancora', { skip: SALTA }, () => {
  for (const comando of [
    `bash -c "cd src; cd .. & echo a${BS}&b; rm -rf *"`,
    `bash -c "cd src; cd .. & cat <&0; rm -rf *"`,
    `cd src; cd /${P.toLowerCase()}/lavori/progetto & cat <&0; rm -rf *`,
    `bash -c "cd src; if true; then cd .. & fi; rm -rf *"`,
    `bash -c "cd src; cd .. & case a in a) true ;; esac; rm -rf *"`,
  ]) assert.equal(critica(comando)?.perche, 'progetto', comando);
});

test('EM-7 — le barre prima del `&`: quattro barre e `\\<` lasciano il sottofondo; `sort <&-` dopo `cd K` è onesto; il `&` dopo la continuazione', { skip: SALTA }, () => {
  for (const comando of [`bash -c "cd /${a}/dati/build && echo a${BS}${BS}${BS}${BS}& rm -rf *"`, `bash -c "cd /${a}/dati/build && echo b${BS}<& rm -rf *"`]) {
    assert.equal(critica(comando)?.perche, 'progetto', comando);
  }
  assert.equal(critica(`bash -c "cd /${a}/dati/build && sort <&- ; rm -rf *"`), null, 'al contrario');
  assert.equal(critica(`bash -c "make ${BS}\n& rm -rf ."`)?.perche, 'progetto', 'continuazione: `make & rm -rf .` nel progetto');
});
