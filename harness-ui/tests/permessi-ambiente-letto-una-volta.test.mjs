/*
 * Nono giro della riparazione dei permessi (14/11/2026, owner 14:34 «nono giro piccolo», giudice v1880-v1881) — L'AMBIENTE LETTO UNA
 * VOLTA PER CHIAMATA, ANCHE NELLA COPIA FERMA DELLA 0.2.1.
 * Il revisore dell'ottavo giro (ROSSO, 14/11 14:26) ha misurato `rm -rf "$a$a…$a"/x` (16.011 caratteri, una variabile ignota ripetuta,
 * lavoro 178-256, nessuna carta): cancello fermo 1,22-1,91 s su Linux e 1,23-1,39 s su Windows. La causa: la copia ferma della 0.2.1
 * (`src/kernel/fermo-0.2.1-5e9fdc1b9/`) rifaceva `Object.entries(ctx.ambiente)` per ogni variabile e, per le cartelle dei progetti, per
 * ogni bersaglio. Ora legge l'ambiente UNA volta per chiamata (una Map nel contesto della chiamata), solo nel modo di leggere.
 *  - LETTA-UNA-VOLTA-*: un ambiente che conta quante volte lo si scorre (`Proxy`, trappola `ownKeys`): la copia ferma lo scorre al più una
 *    volta per chiamata, qualunque sia il numero di variabili e di bersagli; il cancello intero un numero fisso di volte.
 *  - PER-CHIAMATA-*: (giudice v1881 b) l'ambiente non resta da una chiamata all'altra: una variabile cambiata fra due comandi conta.
 *  - MAIUSCOLE-*, PRIMA-VOCE-*, PROGETTI-NOME-ESATTO-*, VUOTA-*: le regole di lettura della 0.2.1, identiche (la copia ferma confrontata
 *    con la 0.2.1 delle prove, `fixtures/cancellazioni-critiche-0.2.1.mjs`).
 *  - IDENTITA-*: copia ferma e 0.2.1 delle prove danno lo stesso risultato su forme casuali con ambienti di ogni tipo.
 *  - ULTIMO-*: i tre mutanti vivi del revisore (la variabile vuota presa per valore nella lettura nuova; robocopy/rsync oltre il tetto
 *    saltati; i gruppi di PowerShell non contati): l'ultimo bersaglio che passa il tetto del lavoro dà la carta, anche quando è l'ultimo.
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono. Nessuna cancellazione; il bash vero non si prova.
 * Fonti (lette il 14/11/2026): Hermes `tools/approval.py:44-46` (l'ambiente letto una volta all'import, per sicurezza); Codex
 * `codex-rs/shell-command/src/command_safety/is_dangerous_command.rs:35` e `:55` (tetto fisso, oltre il tetto la risposta subito);
 * nodejs.org/api/process.html#processenv (su Windows le variabili non badano alle maiuscole; nei worker l'ambiente è una copia).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import * as della021 from './fixtures/cancellazioni-critiche-0.2.1.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { formeCasuali, riempi as riempiDellAutore } from './aiuto/forme-casuali-della-shell.mjs';
import { forme as formeDelRevisore } from './aiuto/forme-casuali-del-revisore.mjs';

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 2 ? 'serve Windows con due lettere di disco libere' : false;
const D = liberi[0] ?? 'Q';
const d = D.toLowerCase();
const K = liberi[1] ?? 'K';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio`, tutti: `${K}:${BS}dati${BS}progetti`, altro: `${K}:${BS}altro${BS}x` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio', tutti: '/srv/progetti', altro: '/srv/altro/x' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files', tutti: '/storage/emulated/0/Download/progetti', altro: '/storage/emulated/0/Download/x' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio', tutti: '/opt/progetti', altro: '/usr/local/altro/x' },
};
const SISTEMI = SALTA_W ? ['L', 'A', 'M'] : ['W', 'L', 'A', 'M'];
const mondo = (s, ambiente = {}, altro = {}) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home, ...ambiente }, realpathFn: (p) => p, ...altro });
const P = critiche.__perLeProve;
const ferma = (comando, opzioni) => P.della021(comando, opzioni);
const nuova = (comando, opzioni) => P.letturaNuova(comando, opzioni);
const oracolo = (comando, opzioni) => della021.cancellazioneCritica(comando, opzioni);
const lavoro = () => P.lavoro();
const TETTO = P.TETTO_DEL_LAVORO;

/** Un ambiente che conta quante volte lo si scorre (`Object.entries` chiama `ownKeys` una volta per giro). */
function ambienteContato(voci) {
  const conto = { giri: 0 };
  const ambiente = new Proxy({ ...voci }, { ownKeys(t) { conto.giri += 1; return Reflect.ownKeys(t); } });
  return { conto, ambiente };
}

/** il cancello intero su un sistema (con `process.platform` finto fuori da Windows): i motivi delle carte critiche */
async function carteDelCancello(s, comando, livelloAccesso = 'accesso-pieno') {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  try {
    await verificaPermessoScrittura({ toolCallId: 't9', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica.perche);
}

const ripeti = (x, n) => x.repeat(n);
const lista = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join(' ');
const VARIABILE = (s) => (s === 'W' ? '%DATI%' : '"$DATI"');
const CANCELLA = (s, x) => (s === 'W' ? `rd /s /q ${x}` : `rm -rf ${x}`);

/* ───────────── l'ambiente scorso una volta per chiamata ───────────── */

test('LETTA-UNA-VOLTA-VARIABILI — la copia ferma scorre l ambiente al più UNA volta per chiamata, con 5 o 500 variabili ignote (W L A M)', () => {
  for (const s of SISTEMI) {
    for (const n of [5, 500]) {
      const comando = s === 'W' ? `rd /s /q "${ripeti('%a%', n)}${BS}x"` : `rm -rf "${ripeti('$a', n)}"/x`;
      const { conto, ambiente } = ambienteContato({ HOME: SIS[s].home, PATH: '/usr/bin' });
      ferma(comando, mondo(s, {}, { ambiente }));
      assert.ok(conto.giri <= 1, `${s} ${n} variabili: l ambiente scorso ${conto.giri} volte`);
    }
  }
});

test('LETTA-UNA-VOLTA-BERSAGLI — la copia ferma scorre l ambiente al più UNA volta per chiamata con 3 o 600 bersagli, anche con le cartelle dei progetti (W L A M)', () => {
  for (const s of SISTEMI) {
    for (const n of [3, 600]) {
      const { conto, ambiente } = ambienteContato({ HOME: SIS[s].home, TALOS_HARNESS_UI_PROJECT_DIRS: `${SIS[s].tutti};${SIS[s].altro}` });
      assert.equal(ferma(CANCELLA(s, lista(n, (i) => `p${i}`)), mondo(s, {}, { ambiente })), null);
      assert.ok(conto.giri <= 1, `${s} ${n} bersagli: l ambiente scorso ${conto.giri} volte`);
    }
  }
});

test('LETTA-UNA-VOLTA-CANCELLO — la funzione del cancello (lettura nuova + 0.2.1 ferma) scorre l ambiente lo stesso numero di volte con 5 o 500 variabili, e poche volte (W L A M)', () => {
  for (const s of SISTEMI) {
    const giri = [5, 500].map((n) => {
      const comando = s === 'W' ? `rd /s /q "${ripeti('%a%', n)}${BS}x"` : `rm -rf "${ripeti('$a', n)}"/x`;
      const { conto, ambiente } = ambienteContato({ HOME: SIS[s].home });
      critiche.cancellazioneCritica(comando, mondo(s, {}, { ambiente }));
      return conto.giri;
    });
    assert.equal(giri[0], giri[1], `${s}: ${giri}`);
    assert.ok(giri[1] <= 8, `${s}: ${giri}`);
  }
});

test('LETTA-UNA-VOLTA-CANCELLO-BERSAGLI — la funzione del cancello scorre l ambiente lo stesso numero di volte con 3 o 600 bersagli e le cartelle dei progetti (W L A M)', () => {
  for (const s of SISTEMI) {
    const giri = [3, 600].map((n) => {
      const { conto, ambiente } = ambienteContato({ HOME: SIS[s].home, TALOS_HARNESS_UI_PROJECT_DIRS: `${SIS[s].tutti};${SIS[s].altro}` });
      assert.equal(critiche.cancellazioneCritica(CANCELLA(s, lista(n, (i) => `p${i}`)), mondo(s, {}, { ambiente })), null);
      return conto.giri;
    });
    assert.equal(giri[0], giri[1], `${s}: ${giri}`);
    assert.ok(giri[1] <= 8, `${s}: ${giri}`);
  }
});

/* ───────────── giudice v1881 (b): l'ambiente non resta da una chiamata all'altra ───────────── */

test('PER-CHIAMATA-FERMA — la copia ferma: due chiamate di fila con ambienti diversi danno carte diverse, anche con lo STESSO oggetto cambiato fra le due (W L A M)', () => {
  for (const s of SISTEMI) {
    const comando = CANCELLA(s, VARIABILE(s));
    assert.equal(ferma(comando, mondo(s, { DATI: SIS[s].cartella }))?.perche, 'progetto', `${s}: prima`);
    assert.equal(ferma(comando, mondo(s, { DATI: SIS[s].altro })), null, `${s}: dopo, un altro ambiente`);
    const stesso = { HOME: SIS[s].home, DATI: SIS[s].altro };
    assert.equal(ferma(comando, mondo(s, {}, { ambiente: stesso })), null, `${s}: lo stesso oggetto, prima`);
    stesso.DATI = SIS[s].cartella;
    assert.equal(ferma(comando, mondo(s, {}, { ambiente: stesso }))?.perche, 'progetto', `${s}: lo stesso oggetto cambiato`);
    delete stesso.DATI;
    assert.equal(ferma(comando, mondo(s, {}, { ambiente: stesso })), null, `${s}: la variabile tolta`);
  }
});

test('PER-CHIAMATA-CANCELLO — la funzione del cancello: la variabile cambiata fra due comandi conta, e le cartelle dei progetti anche (W L A M)', () => {
  for (const s of SISTEMI) {
    const comando = CANCELLA(s, VARIABILE(s));
    const stesso = { HOME: SIS[s].home, DATI: SIS[s].cartella };
    assert.equal(critiche.cancellazioneCritica(comando, mondo(s, {}, { ambiente: stesso }))?.perche, 'progetto', s);
    stesso.DATI = SIS[s].altro;
    assert.equal(critiche.cancellazioneCritica(comando, mondo(s, {}, { ambiente: stesso })), null, `${s}: cambiata`);
    const tutti = CANCELLA(s, SIS[s].tutti);
    const conProgetti = { HOME: SIS[s].home, TALOS_HARNESS_UI_PROJECT_DIRS: SIS[s].tutti };
    assert.ok(ferma(tutti, mondo(s, {}, { ambiente: conProgetti })), `${s}: con le cartelle dei progetti`);
    conProgetti.TALOS_HARNESS_UI_PROJECT_DIRS = SIS[s].altro;
    assert.equal(ferma(tutti, mondo(s, {}, { ambiente: conProgetti })), null, `${s}: le cartelle dei progetti cambiate`);
    assert.equal(critiche.cancellazioneCritica(tutti, mondo(s, {}, { ambiente: conProgetti })), null, `${s}: il cancello, cambiate`);
  }
});

test('PER-CHIAMATA-PROCESSO — col `process.env` vero (quello che usa il cancello): una variabile messa e tolta fra due comandi conta (L e W)', () => {
  const sistemi = SALTA_W ? ['L'] : ['L', 'W'];
  const prima = process.env.TALOS_PROVA_NONO_GIRO_DATI;
  try {
    for (const s of sistemi) {
      const comando = CANCELLA(s, s === 'W' ? '%TALOS_PROVA_NONO_GIRO_DATI%' : '"$TALOS_PROVA_NONO_GIRO_DATI"');
      const o = { cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, realpathFn: (p) => p };
      process.env.TALOS_PROVA_NONO_GIRO_DATI = SIS[s].cartella;
      assert.equal(ferma(comando, o)?.perche, 'progetto', `${s}: messa`);
      assert.equal(critiche.cancellazioneCritica(comando, o)?.perche, 'progetto', `${s}: messa, cancello`);
      delete process.env.TALOS_PROVA_NONO_GIRO_DATI;
      assert.equal(ferma(comando, o), null, `${s}: tolta`);
      assert.equal(critiche.cancellazioneCritica(comando, o), null, `${s}: tolta, cancello`);
    }
  } finally {
    if (prima === undefined) delete process.env.TALOS_PROVA_NONO_GIRO_DATI; else process.env.TALOS_PROVA_NONO_GIRO_DATI = prima;
  }
});

/* ───────────── le regole di lettura della 0.2.1, identiche ───────────── */

const comeLa021 = (comando, opzioni, cosa) => assert.deepEqual(ferma(comando, opzioni), oracolo(comando, opzioni), cosa);

test('MAIUSCOLE-W — su Windows la copia ferma trova la variabile senza badare alle maiuscole (`%DATI%`, `$env:dati`, `${env:Dati}`), come la 0.2.1', { skip: SALTA_W }, () => {
  for (const [comando, ambiente] of [
    ['rd /s /q %DATI%', { Dati: SIS.W.cartella }], ['rd /s /q %dati%', { DATI: SIS.W.cartella }], ['powershell -c "Remove-Item -Recurse -Force $env:dati"', { DATI: SIS.W.cartella }],
    ['powershell -c "Remove-Item -Recurse -Force ${env:Dati}"', { dAtI: SIS.W.cartella }], [`bash -c 'rm -rf "$DATI"'`, { Dati: SIS.W.cartella }],
  ]) {
    assert.equal(ferma(comando, mondo('W', ambiente))?.perche, 'progetto', `${comando} ${JSON.stringify(ambiente)}`);
    comeLa021(comando, mondo('W', ambiente), comando);
  }
});

test('MAIUSCOLE-POSIX — fuori da Windows la copia ferma bada alle maiuscole: `$DATI` non è `dati`, come la 0.2.1 (L A M)', () => {
  for (const s of ['L', 'A', 'M']) {
    assert.equal(ferma('rm -rf "$DATI"', mondo(s, { dati: SIS[s].cartella })), null, `${s}: dati`);
    assert.equal(ferma('rm -rf "$dati"', mondo(s, { dati: SIS[s].cartella }))?.perche, 'progetto', `${s}: dati esatto`);
    comeLa021('rm -rf "$DATI"', mondo(s, { dati: SIS[s].cartella }), s);
    comeLa021('rm -rf "$Dati"', mondo(s, { DATI: SIS[s].cartella, Dati: SIS[s].altro }), s);
  }
});

test('PRIMA-VOCE-W — su Windows vale la PRIMA voce col nome, come la 0.2.1: nei due ordini, in cmd e in PowerShell', { skip: SALTA_W }, () => {
  for (const comando of ['rd /s /q %DATI%', 'powershell -c "Remove-Item -Recurse -Force $env:DATI"']) {
    assert.equal(ferma(comando, mondo('W', { Dati: SIS.W.cartella, DATI: SIS.W.altro }))?.perche, 'progetto', `${comando}: la prima è il progetto`);
    assert.equal(ferma(comando, mondo('W', { DATI: SIS.W.altro, Dati: SIS.W.cartella })), null, `${comando}: la prima è l altra`);
    comeLa021(comando, mondo('W', { dati: '', DATI: SIS.W.cartella }), `${comando}: la prima vuota`);
    comeLa021(comando, mondo('W', { DATI: SIS.W.cartella, dati: '' }), `${comando}: la seconda vuota`);
  }
});

test('PROGETTI-NOME-ESATTO — le cartelle dei progetti si leggono dal nome ESATTO `TALOS_HARNESS_UI_PROJECT_DIRS`, anche su Windows, come la 0.2.1 (W L A M)', () => {
  for (const s of SISTEMI) {
    const comando = CANCELLA(s, SIS[s].tutti);
    assert.ok(ferma(comando, mondo(s, { TALOS_HARNESS_UI_PROJECT_DIRS: SIS[s].tutti })), `${s}: nome esatto`);
    for (const nome of ['talos_harness_ui_project_dirs', 'Talos_Harness_Ui_Project_Dirs']) {
      assert.equal(ferma(comando, mondo(s, { [nome]: SIS[s].tutti })), null, `${s}: ${nome}`);
      comeLa021(comando, mondo(s, { [nome]: SIS[s].tutti }), `${s}: ${nome}`);
    }
    comeLa021(comando, mondo(s, { talos_harness_ui_project_dirs: SIS[s].altro, TALOS_HARNESS_UI_PROJECT_DIRS: SIS[s].tutti }), `${s}: le due`);
  }
});

test('PROGETTI-NOME-ESATTO-CANCELLO — su Windows la funzione del cancello (lettura nuova + 0.2.1 ferma) legge le cartelle dei progetti solo dal nome esatto, come la 0.2.1', { skip: SALTA_W }, () => {
  const comando = CANCELLA('W', SIS.W.tutti);
  assert.ok(critiche.cancellazioneCritica(comando, mondo('W', { TALOS_HARNESS_UI_PROJECT_DIRS: SIS.W.tutti })), 'nome esatto');
  for (const nome of ['talos_harness_ui_project_dirs', 'Talos_Harness_Ui_Project_Dirs', 'TALOS_HARNESS_UI_PROJECT_dirs']) {
    assert.equal(critiche.cancellazioneCritica(comando, mondo('W', { [nome]: SIS.W.tutti })), null, nome);
    assert.equal(oracolo(comando, mondo('W', { [nome]: SIS.W.tutti })), null, `${nome}: la 0.2.1`);
  }
});

test('VUOTA-FERMA — una variabile vuota resta ignota nella copia ferma, come nella 0.2.1: `rm -rf "$VUOTA"` e `"$VUOTA"/x` (W L A M)', () => {
  for (const s of SISTEMI) {
    for (const comando of s === 'W' ? [`bash -c 'rm -rf "$VUOTA"'`, `bash -c 'rm -rf "$VUOTA"/x'`, 'powershell -c "Remove-Item -Recurse -Force $env:VUOTA"'] : ['rm -rf "$VUOTA"', 'rm -rf "$VUOTA"/x', 'rm -rf $VUOTA/']) {
      assert.equal(ferma(comando, mondo(s, { VUOTA: '' })), null, `${s}: ${comando}`);
      comeLa021(comando, mondo(s, { VUOTA: '' }), `${s}: ${comando}`);
    }
  }
});

/* ───────────── identità della copia ferma con la 0.2.1 delle prove, su forme casuali con ambienti di ogni tipo ───────────── */

/** Gli ambienti delle forme: senza variabili, con variabili vuote, con le maiuscole mescolate, con le cartelle dei progetti. */
const AMBIENTI = (s) => {
  const S = SIS[s];
  return [
    { HOME: S.home },
    { HOME: S.home, X: S.cartella, D: '', d: S.altro, DATI: S.altro, Dati: S.cartella, OLDPWD: S.altro, TMPDIR: S.altro, TEMP: S.cartella, GIT_WORK_TREE: S.cartella },
    { HOME: S.home, TALOS_HARNESS_UI_PROJECT_DIRS: `${S.tutti};${S.altro}`, x: '', X: S.home, dir: S.cartella, GIT_DIR: S.altro },
    { HOME: S.home, talos_harness_ui_project_dirs: S.tutti, T: S.cartella, t: '', DATI: '', USERPROFILE: S.altro },
  ];
};
const VARIABILI_IN_FORMA = ['$X', '"$D"', '$d/', '"$DATI"/x', '%DATI%', '%dati%\\x', '$env:Dati', '${X}', '"$T"', '$dir/..', '$x', '%X%', '$OLDPWD', '"${TMPDIR}"/', '$GIT_DIR'];

function formeDiAmbiente(seme, n) {
  let a = seme >>> 0;
  const caso = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const uno = (xs) => xs[Math.floor(caso() * xs.length)];
  const forme = [];
  for (let i = 0; i < n; i += 1) {
    const v = () => uno(VARIABILI_IN_FORMA);
    forme.push(uno([
      () => `rm -rf ${v()} ${v()}`, () => `rd /s /q ${v()}`, () => `Remove-Item -Recurse -Force ${v()}`, () => `bash -c 'rm -rf ${v()}'`,
      () => `cd ${v()} && rm -rf *`, () => `for x in a ${v()}; do rm -rf "$x"; done`, () => `git clean -fdx ${v()}`, () => `find ${v()} -delete`,
      () => `robocopy vuota ${v()} /MIR`, () => `D=${v()}; rm -rf "$D"`, () => `set D=${v()} & rd /s /q %D%`, () => `rm -rf {P} ${v()}`, () => `rm -rf ${v()}{S}`,
    ])());
  }
  return forme;
}

const riempiTutto = (forma, s) => {
  const S = SIS[s];
  const m = { P: S.cartella, S: s === 'W' ? `${S.cartella}${BS}src` : `${S.cartella}/src`, L: s === 'W' ? `${D}:${BS}w` : S.cartella.replace(/\/progetto$/u, ''), F: S.altro, H: S.home };
  return forma.replace(/\{(PU|SU|LU|FU|P|S|L|H|F)\}/gu, (_, x) => (x.endsWith('U') && s === 'W' ? `/${d}/w${x === 'PU' ? '/progetto' : x === 'SU' ? '/progetto/src' : ''}` : m[x[0]] ?? x));
};

test('IDENTITA-FORME — la copia ferma e la 0.2.1 delle prove danno lo STESSO risultato su 1.500 forme casuali (autore, revisore, ambiente) × 4 ambienti (W L A M)', (t) => {
  const forme = [...formeCasuali(9141114, 500).map((f) => riempiDellAutore.bind(null, f)), ...formeDelRevisore(9141115, 500).map((f) => (s) => riempiTutto(f, s)), ...formeDiAmbiente(9141116, 500).map((f) => (s) => riempiTutto(f, s))];
  const diverse = [];
  let carte = 0;
  for (const s of SISTEMI) {
    const ambienti = AMBIENTI(s);
    for (const [i, forma] of forme.entries()) {
      const comando = i < 500 ? forma({ P: SIS[s].cartella, S: `${SIS[s].cartella}${s === 'W' ? BS : '/'}src`, L: s === 'W' ? `${D}:${BS}w` : SIS[s].cartella.replace(/\/progetto$/u, ''), F: SIS[s].altro }) : forma(s);
      for (const ambiente of ambienti) {
        const o = mondo(s, {}, { ambiente });
        const a = ferma(comando, o);
        const b = oracolo(comando, o);
        if (a) carte += 1;
        if (JSON.stringify(a) !== JSON.stringify(b)) diverse.push(`${s} #${i} ${JSON.stringify(ambiente).slice(0, 60)}: ferma=${JSON.stringify(a)} 0.2.1=${JSON.stringify(b)} ${comando.slice(0, 120)}`);
      }
    }
  }
  t.diagnostic(`${forme.length} forme × ${SISTEMI.length} sistemi × 4 ambienti; carte ${carte}; diverse ${diverse.length}`);
  assert.ok(carte > 3000, `carte: ${carte}`);
  assert.deepEqual(diverse.slice(0, 5), []);
});

/* ───────────── i tre mutanti vivi del revisore dell'ottavo giro ───────────── */

test('VUOTA-NUOVA — la lettura nuova tiene ignota una variabile vuota, come la 0.2.1: `rm -rf "$VUOTA"` non è una carta falsa sulla cartella del progetto (L A M)', () => {
  /* `rm -rf ""` non cancella niente (rm: cannot remove ''): presa come valore, la variabile vuota darebbe una carta falsa «progetto» */
  for (const s of ['L', 'A', 'M']) {
    for (const comando of ['rm -rf "$VUOTA"', 'rm -rf "${VUOTA}"', 'rm -r -f -- "$VUOTA"']) {
      assert.equal(nuova(comando, mondo(s, { VUOTA: '' })), null, `${s}: ${comando}`);
      assert.deepEqual(nuova(comando, mondo(s, { VUOTA: '' })), oracolo(comando, mondo(s, { VUOTA: '' })), `${s}: ${comando} come la 0.2.1`);
    }
  }
});

test('VUOTA-NUOVA-W — la stessa regola su Windows, dentro `bash -c` e con `$env:` di PowerShell', { skip: SALTA_W }, () => {
  for (const comando of [`bash -c 'rm -rf "$VUOTA"'`, `sh -c 'rm -rf "\${VUOTA}"'`, 'powershell -c "Remove-Item -Recurse -Force \\"$env:VUOTA\\""']) {
    assert.equal(nuova(comando, mondo('W', { VUOTA: '' })), null, comando);
    assert.deepEqual(nuova(comando, mondo('W', { VUOTA: '' })), oracolo(comando, mondo('W', { VUOTA: '' })), `${comando} come la 0.2.1`);
  }
});

/* Con la variabile vuota questi bersagli diventano `.`, `./`, `..` o `../`: rm non li tocca (POSIX, pubs.opengroup.org rm, letto il
   14/11/2026: «If either of the files dot or dot-dot are specified as the basename portion of an operand … rm shall write a diagnostic
   message to standard error and do nothing more with such operands»). Presa per valore, la variabile vuota darebbe carte false. */
const PUNTI = ['rm -rf "$VUOTA".', 'rm -rf .."$VUOTA"', 'rm -rf ./"$VUOTA"', 'rm -rf "../$VUOTA"', 'rm -rf "${VUOTA}.."'];

test('VUOTA-NUOVA-PUNTI — la lettura nuova: `"$VUOTA".`, `.."$VUOTA"`, `./"$VUOTA"`, `"../$VUOTA"` con la variabile vuota non sono carte false, come nella 0.2.1 (L A M)', () => {
  for (const s of ['L', 'A', 'M']) {
    for (const comando of PUNTI) {
      assert.equal(nuova(comando, mondo(s, { VUOTA: '' })), null, `${s}: ${comando}`);
      assert.deepEqual(nuova(comando, mondo(s, { VUOTA: '' })), oracolo(comando, mondo(s, { VUOTA: '' })), `${s}: ${comando} come la 0.2.1`);
    }
  }
});

test('VUOTA-NUOVA-PUNTI-W — la stessa cosa su Windows dentro `bash -c`', { skip: SALTA_W }, () => {
  for (const comando of PUNTI.map((c) => `bash -c '${c}'`)) {
    assert.equal(nuova(comando, mondo('W', { VUOTA: '' })), null, comando);
    assert.deepEqual(nuova(comando, mondo('W', { VUOTA: '' })), oracolo(comando, mondo('W', { VUOTA: '' })), `${comando} come la 0.2.1`);
  }
});

/*
 * L'ULTIMO bersaglio che passa il tetto. Un `rm` di n cartelle innocue porta il lavoro vicino al tetto; poi un ultimo comando con UN
 * bersaglio (lo specchio di robocopy/rsync, la radice di find, il percorso di git clean, un gruppo di PowerShell). La variante con lo
 * stesso numero di caratteri e un comando che non cancella (`echo …`) dice il lavoro PRIMA di quel bersaglio: si sceglie n perché sia
 * 9.998-10.000, cioè perché il tetto lo passi proprio quel bersaglio (peso 3). Allora la carta deve esserci: un bersaglio oltre il tetto
 * saltato (`continue`) invece della carta tacerebbe, perché dopo non c'è altro lavoro.
 */
function ultimoOltreIlTetto(s, ultimo) {
  const giunto = s === 'W' ? ' & ' : '; ';
  for (let n = 3180; n < 3260; n += 1) {
    const prima = `${s === 'W' ? 'rd /s /q' : 'rm -rf'} ${lista(n, (i) => `p${i}`)}${giunto}`;
    const finto = `echo ${'x'.repeat(ultimo.length - 5)}`;
    if (nuova(prima + finto, mondo(s)) !== null) break; // la variante senza il bersaglio è già oltre: nessun n va
    const avanti = lavoro();
    if (avanti >= TETTO - 2 && avanti <= TETTO) return { comando: prima + ultimo, variante: prima + finto, avanti };
  }
  throw new Error(`${s}: nessun n porta il lavoro a 9.998-10.000 prima di «${ultimo}»`);
}

/* il gruppo `(Join-Path a b)` è di PowerShell: si legge così solo su Windows (fuori, dentro `pwsh -c`, la lettura in più sposta il conto) */
const ULTIMI = {
  robocopy: [(s) => (s === 'W' ? `robocopy vuota ${D}:${BS}w${BS}progetto${BS}dst /MIR` : 'robocopy vuota dst /MIR'), ['W', 'L', 'A', 'M']],
  rsync: [() => 'rsync -a --delete vuota/ dst', ['W', 'L', 'A', 'M']],
  find: [() => 'find dst -delete', ['W', 'L', 'A', 'M']],
  'git clean': [() => 'git clean -fdx dst', ['W', 'L', 'A', 'M']],
  'gruppo di PowerShell': [() => 'Remove-Item -Recurse -Force (Join-Path a b)', ['W']],
};

for (const [nome, [ultimo, dove]] of Object.entries(ULTIMI)) {
  const sistemi = dove.filter((s) => SISTEMI.includes(s));
  const nelCancello = sistemi.filter((s) => s === 'L' || s === 'W');
  test(`ULTIMO-OLTRE-${nome.toUpperCase().replaceAll(' ', '-')} — il bersaglio di ${nome} che passa il tetto del lavoro da ULTIMO dà «troppo annidato» nella lettura nuova (${dove.join(' ')})`, { skip: sistemi.length ? false : SALTA_W }, () => {
    for (const s of sistemi) {
      const { comando, avanti } = ultimoOltreIlTetto(s, ultimo(s));
      assert.equal(nuova(comando, mondo(s))?.perche, 'troppo-annidato', `${s}: lavoro prima ${avanti}, poi ${lavoro()}`);
      assert.ok(lavoro() > TETTO && lavoro() <= TETTO + 3, `${s}: il tetto l ha passato quel bersaglio (${lavoro()})`);
    }
  });
  test(`ULTIMO-OLTRE-${nome.toUpperCase().replaceAll(' ', '-')}-CANCELLO — la stessa forma con la funzione del cancello e col cancello intero: la carta c è (${dove.includes('L') ? 'L e W' : 'W'})`, { skip: nelCancello.length ? false : SALTA_W }, async () => {
    for (const s of nelCancello) {
      const { comando, variante } = ultimoOltreIlTetto(s, ultimo(s));
      assert.equal(critiche.cancellazioneCritica(comando, mondo(s))?.perche, 'troppo-annidato', `${s}: funzione`);
      assert.equal(critiche.cancellazioneCritica(variante, mondo(s)), null, `${s}: la variante, funzione`);
      assert.deepEqual(await carteDelCancello(s, comando), ['troppo-annidato'], `${s}: cancello`);
    }
  });
}
