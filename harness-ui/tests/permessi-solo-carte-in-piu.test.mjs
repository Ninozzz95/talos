/*
 * Quinto giro della riparazione dei permessi (13/11/2026, giudice v1776, owner 16:33 «solo domande in più») — LA REGOLA DEL SOTTOFONDO
 * PUÒ SOLO AGGIUNGERE CARTE. Tre ROSSI di fila avevano la stessa radice: la regola di bash (un `cd` in sottofondo, in una sottoshell o in
 * una pipe non resta per chi viene dopo) leggeva male una `&` e TOGLIEVA una carta che la 0.2.1 dava. Il terzo: una `&` DENTRO `${…}`,
 * `$(…)` o `$[…]` (`bash -c 'cd src; cd .. && echo ${x/\}/&}; rm -rf *'` cancella la radice del progetto, la testa a5a246ea0 taceva).
 *  - ESP-*: le forme del terzo ROSSO (9+ su Windows dentro `bash -c`, 17 su Linux e Android anche al primo livello), dalla funzione e
 *    dal cancello intero, in Accesso pieno e in Scrive nel progetto. Linux e Android con `process.platform` finto, solo qui e rimesso.
 *  - PROP-*: la proprietà carte(testa) ⊇ carte(0.2.1), su Windows, Linux e Android, sulle forme dei TRE ROSSI e su 2.000 forme casuali
 *    col seme scritto (`tests/aiuto/forme-casuali-della-shell.mjs`); la 0.2.1 è il suo file vero (`fixtures/`, impronta controllata).
 *  - MISTI, TETTO: ogni `cd` che la regola dice «non resta» vale nei DUE casi, in ogni combinazione; oltre il tetto si chiede.
 *  - GIALLI del revisore: T06-T08 (`until`, `select`, `for` aprono la lista), Q14 su Windows, i composti in pipe su Linux e Android.
 *  - PREZZO: dove la regola leggeva giusto (`cd .. | true` da `src`) ora la carta c'è, come nella 0.2.1; F09 resta (la causa sotto).
 *  - ZERO-FALSE: i 20 comandi tipici, i 12 comuni, 14 di Linux e 13 del telefono: nessuna carta, su Windows, Linux e Android.
 * Niente viene eseguito: solo il cancello a parole, su dischi che non esistono. Nessuna cancellazione; il bash vero non si prova.
 * Fonti (lette il 13/11/2026): man7.org/linux/man-pages/man1/bash.1.html — Pipelines («Each command in a multi-command pipeline, where
 * pipes are created, is executed in a subshell»), Lists («If a command is terminated by the control operator &, the shell executes the
 * command in the background in a subshell»), Parameter Expansion, Arithmetic Expansion; Hermes `tools/approval_detection.py:230`
 * (`rm -r` chiede sempre); Codex `codex-rs/shell-command/src/bash.rs:52` (`&` fuori dalle parole ammesse) e `:262-272`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';
import { cancellazioneCritica as della021 } from './fixtures/cancellazioni-critiche-0.2.1.mjs';
import { formeCasuali, riempi } from './aiuto/forme-casuali-della-shell.mjs';

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 2;
const D = liberi[0] ?? 'Q'; // il disco del progetto
const d = D.toLowerCase();
const k = (liberi[1] ?? 'K').toLowerCase(); // l'altro disco

const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}lavori${BS}progetto`, home: `${D}:${BS}Users${BS}tizio`,
    m: { P: `/${d}/lavori/progetto`, S: `/${d}/lavori/progetto/src`, L: `/${d}/lavori`, F: `/${k}/dati/build` } },
  L: { piattaforma: 'linux', cartella: '/home/tizio/lavori/progetto', home: '/home/tizio',
    m: { P: '/home/tizio/lavori/progetto', S: '/home/tizio/lavori/progetto/src', L: '/home/tizio/lavori', F: '/srv/dati/build' } },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/lavori/progetto', home: '/data/user/0/ai.talos.dev/files',
    m: { P: '/storage/emulated/0/Documents/lavori/progetto', S: '/storage/emulated/0/Documents/lavori/progetto/src', L: '/storage/emulated/0/Documents/lavori', F: '/storage/emulated/0/Download/build' } },
};
const mondo = (s) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: {}, realpathFn: (p) => p });
const critica = (s, modello) => cancellazioneCritica(riempi(modello, SIS[s].m), mondo(s));
const critica021 = (s, modello) => della021(riempi(modello, SIS[s].m), mondo(s));
const salta = (s) => (s === 'W' ? SALTA_W : false);

/** Il cancello intero: le carte critiche chieste (la carta risponde no: niente viene eseguito). Linux e Android con la piattaforma finta. */
async function carte(s, modello, livelloAccesso) {
  const chieste = [];
  const comando = riempi(modello, SIS[s].m);
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  if (s === 'W') { process.env.USERPROFILE = SIS.W.home; process.env.HOME = SIS.W.home; } else Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  try {
    await verificaPermessoScrittura({ toolCallId: 'k', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return chieste.filter((c) => c.cancellazioneCritica);
}
const DUE = ['accesso-pieno', 'scrittura-progetto'];
const vuoleLaCarta = async (s, modello, perche = 'progetto') => {
  assert.equal(critica(s, modello)?.perche, perche, `${s} funzione: ${modello}`);
  for (const livello of DUE) {
    const chieste = await carte(s, modello, livello);
    assert.equal(chieste.length, 1, `${s} ${livello}: ${modello}`);
    assert.equal(chieste[0].cancellazioneCritica.perche, perche, `${s} ${livello}: ${modello}`);
  }
};

/* Il terzo ROSSO (rapporto del revisore, `mie.log` M26 M28 M33, `mie2.log` F01-F18): [id, modello, sistemi]. In tutte bash esegue
   `rm -rf *` nella radice del progetto: la `&` sta DENTRO l'espansione e non manda niente in sottofondo, il `cd ..` resta. */
const FAMIGLIA = [
  ['M26', `bash -c 'cd src; cd .. && echo \${x/${BS}}/&}; rm -rf *'`, 'WLA'],
  ['F01', `bash -c 'cd src; cd .. && echo \${x//${BS}}/&}; rm -rf *'`, 'WLA'],
  ['F02', `bash -c 'cd src; cd .. && echo \${x:-${BS}}&}; rm -rf *'`, 'WLA'],
  ['F03', `bash -c 'cd src; cd .. && echo \${x%${BS}}&}; rm -rf *'`, 'WLA'],
  ['M28', "bash -c 'cd src; cd .. && echo $[1&1]; rm -rf *'", 'WLA'],
  ['F04', "bash -c 'cd src; cd .. && echo $[ 1 & 2 ]; rm -rf *'", 'WLA'],
  ['F05', "bash -c 'cd src; cd .. && x=$[1&1]; rm -rf *'", 'WLA'],
  ['F06', `bash -c 'cd src; cd .. && x=$(echo ${BS}) & ); rm -rf *'`, 'WLA'],
  ['F10', `sh -c 'cd src; cd .. && echo \${x/${BS}}/&}; rm -rf *'`, 'WLA'],
  ['F11', `bash <<< 'cd src; cd .. && echo \${x/${BS}}/&}; rm -rf *'`, 'WLA'],
  ['F18', `bash -c 'cd {F}; cd {P} && echo \${x/${BS}}/&}; rm -rf *'`, 'WLA'],
  ['F17', `wsl bash -c 'cd src; cd .. && echo \${x/${BS}}/&}; rm -rf *'`, 'W'],
  ['M33', `cd src; cd .. && echo \${x/${BS}}/&}; rm -rf *`, 'LA'],
  ['F12', 'cd src; cd .. && echo $[1&1]; rm -rf *', 'LA'],
  ['F13', `cd src; cd .. && x=$(echo ${BS}) & ); rm -rf *`, 'LA'],
  ['F14', `cd src; cd .. && echo \${x:-${BS}}&}; rm -rf *`, 'LA'],
  ['F15', `cd {S}; cd {P} && echo \${x/${BS}}/&}; rm -rf *`, 'LA'],
  ['F16', 'cd {F}; cd {P} && echo $[1&1]; rm -rf *', 'LA'],
];
for (const [id, modello, sistemi] of FAMIGLIA) {
  for (const s of sistemi) {
    test(`ESP-${id}-${s} — una \`&\` dentro un'espansione non riporta indietro il \`cd ..\`: la carta del progetto c'è (funzione e cancello, Accesso pieno e Scrive nel progetto)`, { skip: salta(s) }, async () => {
      await vuoleLaCarta(s, modello);
    });
  }
}

/* Le forme dei TRE ROSSI, per la proprietà: il primo (V-A1..V-A9 e le oneste O1-O4, giro piccolo), il secondo (le 9 della «&», pila),
   il terzo (sopra), e le forme di R15 e dei composti. Si confronta solo la funzione: il cancello la chiama così com'è. */
const TRE_ROSSI = [
  ...FAMIGLIA.map(([, m]) => m),
  `bash -c 'echo \${x/${BS}}/&}; rm -rf *'`, `bash -c 'cd {F} && echo \${x/${BS}}/&}; rm -rf *'`, "bash -c 'cd src; cd .. && x=$( # )\ntrue &\n); rm -rf *'",
  'bash -c "cd {F}; cd {P} && (true &); rm -rf *"', 'bash -c "cd src; cd .. && (npm run dev &) ; rm -rf *"', 'bash -c "cd {F}; cd {P} && { make & wait; } ; rm -rf *"',
  'bash -c "cd src\ncd .. && (true &)\nrm -rf *"', 'bash -c "cd src; cd .. && (true &); rm -rf ."', 'bash -c "cd {F}; cd {L} && (true &); rm -rf *"',
  'bash -c "cd src; pushd .. && (true &); rm -rf *"', 'bash -c "cd src; cd .. | true && (true &); rm -rf *"', 'bash -c "cd src; cd .. || (true &); rm -rf *"',
  'bash -c "cd {F} | true && (true &); rm -rf *"', 'bash -c "cd {F} | true; rm -rf *"', 'bash -c "cd src/deep; cd .. | true && (true &); rm -rf *"',
  'bash -c "cd src; cd ../.. | true && (true &); rm -rf *"', 'sh -c "cd src; cd .. && (sleep 1 &); rm -rf *"',
  'bash -c "cd {F} && (npm start &) && rm -rf *"', 'bash -c "cd {F} && (true &) ; rm -rf *"', 'bash -c "cd {F} && { make & wait; } ; rm -rf *"',
  `bash -c "cd src; cd .. && echo a${BS}&b; rm -rf *"`, 'bash -c "cd src; cd .. && cat <&0; rm -rf *"', 'bash -c "cd src; cd .. && true <&- ; rm -rf *"',
  `bash <<< 'cd src; cd .. && echo a${BS}&b; rm -rf *'`, 'bash -c "cd src; cd .. && case a in a) true & ;; esac; rm -rf *"',
  'bash -c "cd src; cd .. && (case a in a) true & ;; esac); rm -rf *"', 'bash -c "cd src; cd .. && case a in (a) true & ;; esac; rm -rf *"',
  'bash -c "cd src; cd .. && if make & then true; fi; rm -rf *"', 'bash -c "cd src; cd .. && while false & do break; done; rm -rf *"',
  'cd {F} & rm -rf *', 'bash -c "cd {F} & rm -rf *"', 'sh -c "cd {F} & rm -rf ."', '(cd {F}); rm -rf *', 'cd {F} | true; rm -rf *',
  'if true; then cd {F}; fi | cat; rm -rf *', 'while true; do cd {F}; break; done | cat; rm -rf *', 'case x in x) cd {F} ;; esac | cat; rm -rf *',
  '(cd {F}) | cat; rm -rf *', 'for x in 1; do cd {F}; done & rm -rf *', 'bash -c "for x in 1; do cd {F}; done | cat; rm -rf *"',
  'bash -c "if true; then cd {F}; fi | cat; rm -rf *"', 'cd {F} | cat & rm -rf *', '{ cd {F}; } 2>&1 | cat; rm -rf *', 'for x in 1; do cd {F}; done; rm -rf *',
];

test('PROP-ORACOLO — la 0.2.1 delle prove è il file vero della 0.2.1 (impronta del blob della versione desktop-v0.2.1)', () => {
  const impronta = createHash('sha256').update(readFileSync(new URL('./fixtures/cancellazioni-critiche-0.2.1.mjs', import.meta.url))).digest('hex');
  assert.equal(impronta, '254e06446eef4255d8ee85ead9e7e92f32be7f6bdced47d5067858ddf60c4354');
});

test('PROP-TRE-ROSSI — su ogni forma dei tre ROSSI, ogni carta della 0.2.1 c è ancora: carte(testa) ⊇ carte(0.2.1), su Windows, Linux e Android', () => {
  const violate = [];
  let della021Date = 0;
  for (const s of ['W', 'L', 'A']) for (const m of TRE_ROSSI) {
    if (critica021(s, m) === null) continue;
    della021Date += 1;
    if (critica(s, m) === null) violate.push(`${s}: ${m}`);
  }
  assert.ok(della021Date > 100, `le forme devono dare carte nella 0.2.1 (${della021Date})`);
  assert.deepEqual(violate, []);
});

const SEME = 20261113;
const QUANTE = 2000;
test(`PROP-CASUALI — ${QUANTE} forme casuali (seme ${SEME}): carte(testa) ⊇ carte(0.2.1) su Windows, Linux e Android, per TUTTE`, (t) => {
  const forme = formeCasuali(SEME, QUANTE);
  assert.equal(forme.length, QUANTE);
  const inizio = performance.now();
  const violate = [];
  const conta = {};
  for (const s of ['W', 'L', 'A']) {
    conta[s] = { della021: 0, testa: 0 };
    for (const f of forme) {
      const vecchia = critica021(s, f) !== null;
      const nuova = critica(s, f) !== null;
      if (vecchia) conta[s].della021 += 1;
      if (nuova) conta[s].testa += 1;
      if (vecchia && !nuova && violate.length < 20) violate.push(`${s}: ${riempi(f, SIS[s].m)}`);
    }
    assert.ok(conta[s].della021 > QUANTE / 2, `${s}: forme che cancellano davvero (${conta[s].della021})`);
  }
  t.diagnostic(`seme ${SEME}, ${QUANTE} forme x 3 sistemi in ${Math.round(performance.now() - inizio)} ms; carte 0.2.1/testa ${JSON.stringify(conta)}`);
  assert.deepEqual(violate, []);
});

test('MISTI — due `cd` che la regola dice «non resta», uno letto giusto e uno male: vale anche il caso misto (il primo non resta, il secondo sì)', async () => {
  /* bash: `cd deep &` va in sottofondo (resta `src`), `cd ..` resta (la `&` è dentro `${…}`): `rm -rf *` cade nella radice del progetto.
     Né «nessuno resta» (src) né «tutti restano» (src/deep, poi src) lo vedono: serve la combinazione. */
  for (const s of ['W', 'L', 'A']) {
    if (salta(s)) continue;
    await vuoleLaCarta(s, `bash -c 'cd src; cd deep & cd .. && echo \${x/${BS}}/&}; rm -rf *'`);
  }
  for (const s of ['L', 'A']) await vuoleLaCarta(s, 'cd src; cd deep & cd .. && echo $[1&1]; rm -rf *');
});

const sottoshell = (n) => `bash -c "${Array.from({ length: n }, (_, i) => `(cd p${i} && npm i)`).join('; ')}; rm -rf dist"`;
for (const s of ['W', 'L', 'A']) {
  test(`TETTO-${s} — oltre 256 letture (nove \`cd\` che possono restare o no) si chiede; con otto, nessuna carta per una cancellazione onesta`, () => {
    assert.equal(critica(s, sottoshell(9))?.perche, 'troppo-annidato', `${s}: nove`);
    assert.equal(critica(s, sottoshell(8)), null, `${s}: otto`);
  });
  /* due `&` lette male una dopo l'altra: serve la combinazione dove TUTTI E DUE i `cd ..` restano (src/deep → src → progetto) */
  test(`DUE-SBAGLIATE-${s} — due \`&\` dentro espansioni, ognuna dopo un \`cd ..\`: la carta arriva solo dalla combinazione dei due casi`, () => {
    assert.equal(critica(s, `bash -c 'cd src/deep; cd .. && echo \${x/${BS}}/&}; cd .. && echo $[1&1]; rm -rf *'`)?.perche, 'progetto', s);
  });
  /* ogni caso riparte dalle variabili di prima: una variabile assegnata DOPO la cancellazione non vale per la lettura seguente */
  test(`FOTOGRAFIA-${s} — una variabile assegnata dopo \`rm -rf "$D"\` non arriva al caso dopo (nessuna carta falsa sulla radice)`, () => {
    assert.equal(critica(s, `bash -c 'cd src; rm -rf "$D"; cd .. | true; D=/'`), null, s);
    assert.equal(critica(s, `bash -c 'D=/; rm -rf "$D"'`)?.perche, 'radice', `${s}: al contrario, assegnata prima vale`);
  });
  /* il caso misto fra i due punti della regola: il `cd ..` della sottoshell resta, il `cd` in pipe no (un ritorno scelto non deve
     far restare anche i `cd` saltati) */
  test(`MISTO-${s} — il \`cd\` della sottoshell resta e quello in pipe no: \`rm -rf *\` cade nel progetto`, () => {
    assert.equal(critica(s, `bash -c 'cd src; (cd ..); cd {F} | true; rm -rf *'`)?.perche, 'progetto', s);
  });
  /* una sottoshell che non cambia cartella non è un caso: nove `(npm i)` non arrivano al tetto */
  test(`SENZA-MOTO-${s} — nove sottoshell senza \`cd\`: nessun caso, nessuna carta (il tetto conta solo i \`cd\` che spostano)`, () => {
    assert.equal(critica(s, `bash -c "${Array.from({ length: 9 }, () => '(npm i)').join('; ')}; rm -rf dist"`), null, s);
  });
}

/* GIALLI T06-T08 del revisore: `until`, `select`, `for` aprono la lista come `if`/`while`, quindi la `&` dopo `done` manda in sottofondo
   TUTTA la lista `cd F && … done`: il `cd` non resta e `rm -rf *` cancella il progetto (anche dentro `bash -c`). */
const COMPOSTI_IN_SOTTOFONDO = [
  ['UNTIL', 'cd {F} && until false; do break; done & rm -rf *'],
  ['SELECT', 'cd {F} && select x in 1; do break; done & rm -rf *'],
  ['FOR', 'cd {F} && for x in 1; do true; done & rm -rf *'],
];
for (const [id, modello] of COMPOSTI_IN_SOTTOFONDO) {
  for (const s of ['L', 'A']) {
    test(`T-${id}-${s} — \`${id.toLowerCase()} … done &\` manda in sottofondo anche il \`cd\` di prima: carta del progetto`, async () => { await vuoleLaCarta(s, modello); });
  }
  test(`T-${id}-W — lo stesso dentro \`bash -c\` su Windows`, { skip: SALTA_W }, async () => { await vuoleLaCarta('W', `bash -c "${modello}"`); });
}

/* GIALLO Q14 del revisore: `wsl --distribution-id X` prende un valore anche su Windows, e il comando dopo `-e`/`--` gira nella cartella del comando */
const Q14 = ['wsl --distribution-id 7b2a-11 -e rm -rf .', 'wsl.exe --distribution-id 7b2a-11 -- rm -rf *'];
test('Q14-FUNZIONE — `wsl --distribution-id X -e rm -rf .` su Windows: carta del progetto', { skip: SALTA_W }, () => {
  for (const m of Q14) assert.equal(critica('W', m)?.perche, 'progetto', m);
});
test('Q14-CANCELLO — lo stesso dal cancello intero, in Accesso pieno e in Scrive nel progetto', { skip: SALTA_W }, async () => {
  for (const m of Q14) for (const livello of DUE) assert.equal((await carte('W', m, livello)).length, 1, `${livello}: ${m}`);
});

/* GIALLO dei composti in pipe fuori da Windows: `if … fi | cat` gira in una sottoshell come `( … )` («Pipelines»): il `cd` dentro non resta */
const COMPOSTI_IN_PIPE = [
  ['IF', 'if true; then cd {F}; fi | cat; rm -rf *'],
  ['WHILE', 'while true; do cd {F}; break; done | cat; rm -rf *'],
  ['CASE', 'case x in x) cd {F} ;; esac | cat; rm -rf *'],
  ['FOR', 'for x in 1; do cd {F}; done | cat; rm -rf *'],
  ['BASH-FOR', 'bash -c "for x in 1; do cd {F}; done | cat; rm -rf *"'],
  ['BASH-IF', 'bash -c "if true; then cd {F}; fi | cat; rm -rf *"'],
  /* il `cd` è il PRIMO comando del composto: anche lui sta nel gruppo della pipe */
  ['IF-PRIMO', 'if cd {F}; then true; fi | cat; rm -rf *'],
  ['WHILE-PRIMO', 'while cd {F}; do break; done | cat; rm -rf *'],
];
for (const [id, modello] of COMPOSTI_IN_PIPE) {
  for (const s of ['L', 'A']) test(`PIPE-${id}-${s} — un composto in pipe gira in una sottoshell: il \`cd\` non resta, carta del progetto`, async () => { await vuoleLaCarta(s, modello); });
}
test('PIPE-ONESTA — al contrario: senza pipe il `cd` del composto resta e `rm -rf *` cade fuori, nessuna carta (Linux e Android)', async () => {
  for (const s of ['L', 'A']) {
    assert.equal(critica(s, 'for x in 1; do cd {F}; done; rm -rf *'), null, s);
    assert.equal(critica(s, 'if true; then cd {F}; fi; rm -rf *'), null, s);
    for (const livello of DUE) assert.equal((await carte(s, 'if true; then cd {F}; fi && rm -rf *', livello)).length, 0, `${s} ${livello}`);
  }
});

/* IL PREZZO, scritto: dove la regola leggeva giusto e il `cd` davvero non resta, ora la carta c'è (come nella 0.2.1). E F09: `${` si chiude
   alla prima `}`, anche scritta (`\}`), la `&` dopo diventa un sottofondo, il `cd F` «torna indietro» e `rm -rf *` sembra cadere nel progetto:
   la carta è falsa (bash resta in F) e RESTA finché il lettore vero della shell (0.2.3) non legge `${…}` per intero. */
test('PREZZO — le carte false accettate: `cd .. | true` da `src` (V-A8 scritta) e F09, su Windows dentro `bash -c`, su Linux e Android', () => {
  for (const s of ['W', 'L', 'A']) {
    assert.notEqual(critica(s, 'bash -c "cd src; cd .. | true && (true &); rm -rf *"'), null, `${s} V-A8`);
    assert.notEqual(critica(s, 'bash -c "cd src; cd ../.. | true && (true &); rm -rf *"'), null, `${s} V-A8 primo livello`);
    assert.notEqual(critica(s, `bash -c 'cd {F} && echo \${x/${BS}}/&}; rm -rf *'`), null, `${s} F09`);
  }
  assert.equal(critica('L', 'bash -c "cd src/deep; cd .. | true && (true &); rm -rf *"'), null, 'da src/deep il `cd ..` resta in src: nessuna carta in nessun caso');
});

/* ZERO-FALSE: i 20 comandi tipici (C:/T/perm-amp-lavoro/venti-comandi-tipici.txt, scritti prima di misurare), i 12 comuni del revisore
   della pila, 14 comuni di Linux e 13 del telefono del revisore permessi 3: nessuna carta critica su Windows, Linux e Android. */
const TIPICI = [
  'node --test --test-reporter=tap harness-ui/tests/session-registry.test.mjs', 'node --test --test-reporter=tap harness-ui/tests/agent-service.test.mjs harness-ui/tests/session-registry.test.mjs',
  'mkdir -p scripts', 'which node', 'pwd && ls', 'node scripts/somma.mjs 3 4', 'ls scripts/somma.mjs', 'ls -la scripts/', 'cat scripts/somma.mjs',
  'node --test --test-reporter=tap harness-ui/frontend/tests/unit/chat-foot.test.mjs', 'git status --short', 'git log --oneline -22', 'git diff --stat HEAD~3 HEAD',
  'grep -n "troppe" src/path-policy.mjs', 'sed -n 2060,2150p src/path-policy.mjs', 'cd harness-ui && npm run test:unit', 'df -h /c', 'date', 'tasklist | grep -i node', 'head -80 README.md',
];
const COMUNI = [
  '(npm run dev &) && rm -rf dist', '{ make & wait; } && rm -rf build/tmp', 'npm start & npx wait-on http://127.0.0.1:3000 && npm test && rm -rf coverage',
  '(cd src && npm run build) && rm -rf dist', 'bash -c "cd build && (cmake .. &) ; rm -rf CMakeFiles"', 'bash -c "cd src && (node server.js &) && sleep 2 && rm -rf .cache"',
  'bash -c "(cd {F} && make &) ; cd build && rm -rf *"', 'bash -c "{ cd build && rm -rf *; } & wait"', 'bash -c "mkdir -p tmp && (cd tmp && touch a &) && rm -rf tmp/*"',
  'bash -c "cd {F} && { npm ci & npm run lint; wait; } && rm -rf node_modules"', 'bash -c "npm run dev & sleep 3 && rm -rf .next/cache"', 'bash -c "cd {F} && (true &) && rm -rf ./*"',
];
const LINUX = [
  'make & tail -n 20 log', '(cd build && cmake ..)', 'npm run dev & sleep 2; curl -s http://127.0.0.1:3000', '(cd build && make) && rm -rf build/tmp',
  'python3 -m http.server 8000 & sleep 1; kill %1', '{ cd build; make; } | tee build.log', 'cd build && rm -rf CMakeFiles &', "find . -name '*.o' -print0 | xargs -0 rm -f",
  'for f in *.log; do gzip "$f" & done; wait', 'if [ -d dist ]; then rm -rf dist; fi', 'docker compose up -d & sleep 5; docker ps', 'cd src && rm -rf __pycache__ && cd .. && ls',
  'while read l; do echo "$l" & done < files.txt; wait', 'case "$1" in a) make & ;; *) true ;; esac',
];
const TELEFONO = [
  'ls -la', 'cat file.txt | grep x', 'npm test', 'git status', 'cd src && node app.js', '(cd build && make)', 'pwd; ls src', 'node server.js & sleep 1; curl -s http://127.0.0.1:8080',
  'rm -rf node_modules/.cache', 'git log --oneline | head -5', 'mkdir -p out && cd out && rm -rf *', 'sh -c "cd src && ls"', 'cd src; rm -rf tmp & wait',
];
for (const [nome, elenco, quanti] of [['TIPICI', TIPICI, 20], ['COMUNI', COMUNI, 12], ['LINUX', LINUX, 14], ['TELEFONO', TELEFONO, 13]]) {
  for (const s of ['W', 'L', 'A']) {
    test(`ZERO-FALSE-${nome}-${s} — i ${quanti} comandi onesti non hanno carte critiche (funzione e cancello)`, { skip: salta(s) }, async () => {
      assert.equal(elenco.length, quanti);
      for (const m of elenco) {
        assert.equal(critica(s, m), null, `${s} funzione: ${m}`);
        for (const livello of DUE) assert.equal((await carte(s, m, livello)).length, 0, `${s} ${livello}: ${m}`);
      }
    });
  }
}
