/*
 * Sesto giro della riparazione dei permessi (13/11/2026, owner 18:49 «doppio controllo», giudice v1801) — TALOS CHIEDE ALMENO OGNI
 * VOLTA CHE CHIEDEVA LA 0.2.1, PER COSTRUZIONE. Quattro ROSSI di fila con la stessa radice: una lettura più precisa del sottofondo
 * TOGLIEVA una carta che la 0.2.1 dava. Il quarto (revisore del quinto giro): F1, `eval` con una variabile (`cd src; eval 'cd .. & X=$PWD';
 * rm -rf "$X"`: dopo i due casi tornavano le variabili della prima lettura) e F2, una `&` dentro `${…}` (`echo ${x/\}/&} cd progetto &&
 * rm -rf "$PWD"`: un `cd` che bash non esegue). In tutte bash cancella davvero il progetto.
 *  - FERMO-*: la decisione della 0.2.1 sta FERMA nel prodotto (`src/kernel/fermo-0.2.1-5e9fdc1b9/`), il file del commit 5e9fdc1b9 con
 *    i soli cambi del nono giro (l'ambiente letto una volta per chiamata, `aiuto/cambi-della-copia-ferma.mjs`; impronta controllata
 *    contro il commit, contro la 0.2.1 delle prove e contro il numero), importa solo `node:`, e il cancello la usa davvero.
 *  - DOPPIO-*: come si mettono insieme le due letture (carta se una chiede; il motivo della nuova se chiedono tutte e due; il disco letto
 *    una volta sola).
 *  - F1-*, F2-*: le due famiglie del quarto ROSSO (E01-E10, #8708, #12556 ridotte) col cancello intero in Accesso pieno e in Scrive nel
 *    progetto, su Windows, Linux, Android e macOS (`process.platform` finto, solo qui e rimesso), e chiuse ANCHE nella lettura nuova.
 *  - PROP-*: la proprietà carte(prodotto) ⊇ carte(0.2.1) con un oracolo che NON è il file del prodotto: l'albero intero della 0.2.1
 *    estratto dal commit (`aiuto/oracolo-0.2.1.mjs`), su 2.000 forme del generatore dell'autore (seme 20261113), 2.000 di quello del
 *    revisore (seme 7101113, `aiuto/forme-casuali-del-revisore.mjs`, copiato tale e quale) e sulle forme dei quattro ROSSI.
 *  - ZERO-FALSE-M: i quattro gruppi onesti e 15 comandi di macOS: nessuna carta critica anche su macOS.
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono. Nessuna cancellazione; il bash vero non si prova.
 * Fonti (lette il 13/11/2026): man7.org/linux/man-pages/man1/bash.1.html — Parameter Expansion («the matching ending brace is the first
 * `}` not escaped by a backslash or within a quoted string, and not within an embedded arithmetic expansion, command substitution, or
 * parameter expansion»), Lists («If a command is terminated by the control operator &, the shell executes the command in the background
 * in a subshell»); Hermes `tools/approval_detection.py:230` (`rm -r` chiede sempre); Codex `codex-rs/shell-command/src/bash.rs:52`
 * (`&` fuori dalle parole ammesse) e `:260-272` (una parola che si espande non è mai una prova).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import { formeCasuali, riempi as riempiDellAutore } from './aiuto/forme-casuali-della-shell.mjs';
import { forme as formeDelRevisore } from './aiuto/forme-casuali-del-revisore.mjs';
import { COMMIT_DELLA_021, conIlCommitDella021, fileDella021, oracoloDella021, sha256 } from './aiuto/oracolo-0.2.1.mjs';
import { CAMBI_DELLA_COPIA_FERMA, IMPRONTA_DELLA_COPIA_FERMA, applicaICambi } from './aiuto/cambi-della-copia-ferma.mjs';

const BS = String.fromCharCode(92);
const IMPRONTA_DELLA_021 = '254e06446eef4255d8ee85ead9e7e92f32be7f6bdced47d5067858ddf60c4354';
const FERMO = new URL('../src/kernel/fermo-0.2.1-5e9fdc1b9/cancellazioni-critiche.mjs', import.meta.url);
const NEL_COMMIT = 'harness-ui/src/kernel/cancellazioni-critiche.mjs';
const CON_IL_COMMIT = conIlCommitDella021();
/* sulla base (prima della cura) la lettura nuova è la funzione intera: le prove della lettura nuova vi girano lo stesso */
const letturaNuova = critiche.__perLeProve?.letturaNuova ?? critiche.cancellazioneCritica;

const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 2;
const D = liberi[0] ?? 'Q';
const d = D.toLowerCase();
const K = liberi[1] ?? 'K';
const k = K.toLowerCase();

/* `a`: i segnaposti del generatore dell'autore (su Windows le grafie POSIX, dentro `bash -c`); `r`: quelli del revisore e delle forme scritte */
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}lavori${BS}progetto`, home: `${D}:${BS}Users${BS}caio`,
    a: { P: `/${d}/lavori/progetto`, S: `/${d}/lavori/progetto/src`, L: `/${d}/lavori`, F: `/${k}/dati/build` },
    r: { P: `${D}:${BS}lavori${BS}progetto`, S: `${D}:${BS}lavori${BS}progetto${BS}src`, L: `${D}:${BS}lavori`, H: `${D}:${BS}Users${BS}caio`, F: `${K}:${BS}altro${BS}build`,
      PU: `/${d}/lavori/progetto`, SU: `/${d}/lavori/progetto/src`, LU: `/${d}/lavori`, FU: `/${k}/altro/build` } },
  L: { piattaforma: 'linux', cartella: '/home/caio/lavori/progetto', home: '/home/caio',
    a: { P: '/home/caio/lavori/progetto', S: '/home/caio/lavori/progetto/src', L: '/home/caio/lavori', F: '/srv/altro/build' } },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/lavori/progetto', home: '/data/user/0/ai.talos.dev/files',
    a: { P: '/storage/emulated/0/Documents/lavori/progetto', S: '/storage/emulated/0/Documents/lavori/progetto/src', L: '/storage/emulated/0/Documents/lavori', F: '/storage/emulated/0/Download/build' } },
  M: { piattaforma: 'darwin', cartella: '/Users/caio/lavori/progetto', home: '/Users/caio',
    a: { P: '/Users/caio/lavori/progetto', S: '/Users/caio/lavori/progetto/src', L: '/Users/caio/lavori', F: '/private/var/altro/build' } },
};
for (const s of ['L', 'A', 'M']) SIS[s].r = { ...SIS[s].a, H: SIS[s].home, PU: SIS[s].a.P, SU: SIS[s].a.S, LU: SIS[s].a.L, FU: SIS[s].a.F };
const riempiR = (modello, s) => modello.replace(/\{(PU|SU|LU|FU|P|S|L|H|F)\}/gu, (_, x) => SIS[s].r[x]);
const riempiA = (modello, s) => riempiDellAutore(modello, SIS[s].a);
const SISTEMI = SALTA_W ? ['L', 'A', 'M'] : ['W', 'L', 'A', 'M'];
const salta = (s) => (s === 'W' ? SALTA_W : false);
const mondo = (s) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home }, realpathFn: (p) => p });
const LIVELLI = ['accesso-pieno', 'scrittura-progetto'];

/** Il cancello intero (del prodotto o dell'oracolo): le carte chieste, la carta risponde no e niente viene eseguito. */
async function carte(cancello, s, comando, livelloAccesso) {
  const chieste = [];
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  process.env.USERPROFILE = SIS[s].home;
  process.env.HOME = SIS[s].home;
  if (s !== 'W') Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  try {
    await cancello({ toolCallId: 'd6', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return { critiche: chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica.perche), tutte: chieste.length };
}

/* ───────────── FERMO: la copia ferma della 0.2.1 dentro il prodotto ───────────── */

/* Nono giro (14/11/2026, giudice v1880-v1881): la copia ferma è il file della 0.2.1 con UN solo cambio, l'ambiente letto una volta per
   chiamata (`aiuto/cambi-della-copia-ferma.mjs`). Prima di allora era il file del commit byte per byte (impronta 254e0644…4354). */
test('FERMO-IMPRONTA — la copia ferma della 0.2.1 nel prodotto ha l impronta scritta (il file della 0.2.1 più i cambi del nono giro: un byte cambiato = rossa)', () => {
  assert.equal(IMPRONTA_DELLA_COPIA_FERMA, '9484d89beaab932317aaffefe646d402242ade59c11162cc9d75a42c84ea1ea8');
  assert.equal(sha256(readFileSync(FERMO)), IMPRONTA_DELLA_COPIA_FERMA);
});

test('FERMO-CAMBI — la copia ferma è la 0.2.1 delle prove (impronta della 0.2.1) con i SOLI cambi del nono giro, ognuno una volta: niente altro è cambiato', () => {
  const della021 = readFileSync(new URL('./fixtures/cancellazioni-critiche-0.2.1.mjs', import.meta.url));
  assert.equal(sha256(della021), IMPRONTA_DELLA_021, 'la 0.2.1 delle prove');
  const conICambi = applicaICambi(della021.toString('utf8'));
  assert.ok(conICambi, 'ogni cambio si applica una volta sola');
  assert.ok(Buffer.compare(readFileSync(FERMO), Buffer.from(conICambi, 'utf8')) === 0, 'stessi byte');
  assert.equal(CAMBI_DELLA_COPIA_FERMA.length, 3);
});

test('FERMO-COMMIT — la copia ferma è il file del commit 5e9fdc1b9 (git show) con i soli cambi del nono giro, non solo un numero scritto a mano', { skip: CON_IL_COMMIT ? false : `senza il commit ${COMMIT_DELLA_021} (copia senza storia): restano FERMO-IMPRONTA e FERMO-CAMBI` }, () => {
  const delCommit = fileDella021(NEL_COMMIT);
  assert.ok(delCommit, 'il file nel commit');
  assert.equal(sha256(delCommit), IMPRONTA_DELLA_021, 'il commit è quello della 0.2.1');
  const conICambi = applicaICambi(delCommit.toString('utf8'));
  assert.ok(conICambi, 'ogni cambio si applica una volta sola al file del commit');
  assert.ok(Buffer.compare(readFileSync(FERMO), Buffer.from(conICambi, 'utf8')) === 0, 'stessi byte');
});

test('FERMO-SOLO-NODE — la copia ferma importa solo moduli `node:`: nessun modulo cambiato dalla 0.2.1 (mai la path-policy nuova)', () => {
  const importati = [...readFileSync(FERMO, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"\n]*from\s+['"]([^'"]+)['"]/gmu)].map((m) => m[1]);
  assert.ok(importati.length >= 3, `import trovati: ${importati}`);
  assert.deepEqual(importati.filter((x) => !x.startsWith('node:')), []);
  assert.doesNotMatch(readFileSync(FERMO, 'utf8'), /\bimport\s*\(/u, 'nessun import dinamico');
});

test('FERMO-USATO — il cancello del prodotto importa la copia ferma da quel posto, e la funzione di prova è proprio lei', async () => {
  const sorgente = readFileSync(new URL('../src/kernel/cancellazioni-critiche.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /from '\.\/fermo-0\.2\.1-5e9fdc1b9\/cancellazioni-critiche\.mjs'/u);
  const ferma = await import(FERMO.href);
  assert.equal(critiche.__perLeProve?.della021, ferma.cancellazioneCritica);
});

/* ───────────── DOPPIO: come si mettono insieme le due letture ───────────── */

const CARTA_N = Object.freeze({ percorso: '/n', perche: 'progetto' });
const CARTA_V = Object.freeze({ percorso: '/v', perche: 'casa' });
const insieme = (nuova, ferma) => critiche.__perLeProve.unaCartaSeUnaChiede(nuova, ferma);

test('DOPPIO-OPPURE — carta se chiede la nuova OPPURE la 0.2.1; nessuna carta solo se tacciono tutte e due', () => {
  assert.equal(insieme(() => null, () => CARTA_V)('x', { cartella: '/p' }), CARTA_V, 'solo la 0.2.1 chiede: carta, col suo motivo');
  assert.equal(insieme(() => CARTA_N, () => null)('x', { cartella: '/p' }), CARTA_N, 'solo la nuova chiede');
  assert.equal(insieme(() => CARTA_N, () => CARTA_V)('x', { cartella: '/p' }), CARTA_N, 'tutte e due: il motivo della nuova');
  assert.equal(insieme(() => null, () => null)('x', { cartella: '/p' }), null);
});

test('DOPPIO-ORDINE — la 0.2.1 si legge solo se la nuova tace; tutte e due ricevono lo stesso comando e le stesse opzioni', () => {
  const viste = [];
  const nuova = (c, o) => { viste.push(['n', c, o.cartella, o.home, o.piattaforma]); return null; };
  const ferma = (c, o) => { viste.push(['v', c, o.cartella, o.home, o.piattaforma]); return null; };
  insieme(nuova, ferma)('rm -rf .', { cartella: '/p', home: '/h', piattaforma: 'linux' });
  assert.deepEqual(viste, [['n', 'rm -rf .', '/p', '/h', 'linux'], ['v', 'rm -rf .', '/p', '/h', 'linux']]);
  let ferme = 0;
  insieme(() => CARTA_N, () => { ferme += 1; return null; })('rm -rf .', { cartella: '/p' });
  assert.equal(ferme, 0, 'con la carta della nuova la 0.2.1 non si legge');
});

test('DOPPIO-UN-ERRORE — un errore di una lettura non diventa un eccezione del cancello: diventa la carta «troppo complesso» (decimo giro: si fallisce chiusi, mai null)', () => {
  assert.deepEqual(insieme(() => { throw new Error('x'); }, () => CARTA_V)('x', { cartella: '/p' }), { percorso: null, perche: 'troppo-complesso' });
});

test('DOPPIO-DISCO — le due letture leggono ogni percorso UNA volta per comando, e la 0.2.1 riceve la terna dalla memoria', () => {
  let letture = 0;
  const realpathFn = (p) => { if (p === '/p/link') letture += 1; return p; };
  const nuova = (c, o) => { o.realpathFn('/p/link'); o.realpathFn('/p/link'); return null; };
  const ferma = (c, o) => { o.realpathFn('/p/link'); return null; };
  insieme(nuova, ferma)('rm -rf link/', { cartella: '/p', home: '/h', ambiente: {}, piattaforma: 'linux', realpathFn });
  assert.equal(letture, 1, 'lo stesso bersaglio: una lettura sola');
  /* il prodotto vero: 201 comandi che non chiedono, due risoluzioni (cartella e casa) in tutto, anche con la 0.2.1 che li legge tutti */
  critiche.dimenticaPercorsiVeri();
  let vere = 0;
  const a = { cartella: '/sdcard/Progetti/orca', home: '/data/user/0/ai.talos.dev/files/home', piattaforma: 'android', ambiente: {}, realpathFn: (p) => { vere += 1; return p === '/sdcard/Progetti/orca' ? '/storage/emulated/0/Progetti/orca' : p; } };
  assert.equal(critiche.cancellazioneCritica('rm -rf /storage/emulated/0/Progetti', a)?.perche, 'sopra-il-progetto');
  for (let i = 0; i < 200; i += 1) assert.equal(critiche.cancellazioneCritica(`rm -rf build${i} && rm -rf /storage/emulated/0/Progetti/orca/x${i}`, a), null);
  assert.equal(vere, 2, 'cartella e casa, una volta per 201 comandi e due letture');
  critiche.dimenticaPercorsiVeri();
});

test('DOPPIO-DIMENTICA — `dimenticaPercorsiVeri` svuota anche la memoria della 0.2.1 (una giunzione cambiata vale per tutte e due)', () => {
  let vero = '/srv/vero/orca';
  const a = { cartella: '/home/caio/link/orca', home: '/home/caio', piattaforma: 'linux', ambiente: {}, realpathFn: (p) => (p === '/home/caio/link/orca' ? vero : p) };
  critiche.dimenticaPercorsiVeri();
  assert.equal(critiche.__perLeProve.della021('rm -rf /srv/vero/orca', a)?.perche, 'progetto');
  vero = '/srv/altro/orca';
  critiche.dimenticaPercorsiVeri();
  assert.equal(critiche.__perLeProve.della021('rm -rf /srv/vero/orca', a), null, 'la 0.2.1 rilegge la giunzione');
  assert.equal(critiche.__perLeProve.della021('rm -rf /srv/altro/orca', a)?.perche, 'progetto');
  critiche.dimenticaPercorsiVeri();
});

test('DOPPIO-DIMENTICA-TELEFONO — sul telefono `/sdcard` che cambia bersaglio: dopo `dimenticaPercorsiVeri` anche la 0.2.1 rilegge', () => {
  let vero = '/storage/emulated/0/Progetti/orca';
  const a = { cartella: '/sdcard/Progetti/orca', home: '/data/user/0/ai.talos.dev/files', piattaforma: 'android', ambiente: {}, realpathFn: (p) => (p === '/sdcard/Progetti/orca' ? vero : p) };
  critiche.dimenticaPercorsiVeri();
  assert.equal(critiche.__perLeProve.della021('rm -rf /storage/emulated/0/Progetti/orca', a)?.perche, 'progetto');
  vero = '/storage/emulated/0/Altro/orca';
  critiche.dimenticaPercorsiVeri();
  assert.equal(critiche.__perLeProve.della021('rm -rf /storage/emulated/0/Altro/orca', a)?.perche, 'progetto', 'la 0.2.1 vede il bersaglio nuovo');
  critiche.dimenticaPercorsiVeri();
});

test('DOPPIO-DISCO-BERSAGLIO — il prodotto vero: il bersaglio di un rm che non chiede si legge UNA volta, anche se le due letture lo seguono', () => {
  critiche.dimenticaPercorsiVeri();
  const viste = new Map();
  const a = { cartella: '/home/caio/lavori/progetto', home: '/home/caio', piattaforma: 'linux', ambiente: {}, realpathFn: (p) => { viste.set(p, (viste.get(p) ?? 0) + 1); return p; } };
  /* `build/` con la barra: si segue il collegamento (208 bis), lo fanno tutte e due le letture */
  assert.equal(critiche.cancellazioneCritica('rm -rf build/', a), null);
  assert.ok(viste.has('/home/caio/lavori/progetto/build'), `il bersaglio è stato seguito: ${[...viste.keys()]}`);
  assert.deepEqual([...viste].filter(([, n]) => n > 1), [], 'nessun percorso letto due volte nello stesso comando');
  critiche.dimenticaPercorsiVeri();
});

test('FERMO-DENTRO-IL-PRODOTTO — il modulo del cancello importa solo da `node:` e da `src/`: mai dalle prove (che il pacchetto non porta)', () => {
  const qui = new URL('../src/kernel/cancellazioni-critiche.mjs', import.meta.url);
  const importati = [...readFileSync(qui, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"\n]*from\s+['"]([^'"]+)['"]/gmu)].map((m) => m[1]);
  assert.ok(importati.some((x) => x.includes('fermo-0.2.1-5e9fdc1b9')), `import: ${importati}`);
  const src = new URL('../src/', import.meta.url).href;
  for (const x of importati.filter((y) => !y.startsWith('node:'))) assert.ok(new URL(x, qui).href.startsWith(src), `${x} esce da src/`);
});

/* ───────────── F1 e F2: le due famiglie del quarto ROSSO ───────────── */

/* il rapporto del revisore del quinto giro, `forme-c10.txt` e `forme-gen.txt` (seme 7101113, #8708 e #12556 ridotte), più varianti mie */
const F1 = [
  ['E01', `cd src; eval 'cd .. & X=$PWD'; cd "$X"; rm -rf *`],
  ['E02', `cd src; eval 'cd .. && echo \${x/${BS}}/&}; X=$PWD'; cd "$X"; rm -rf *`],
  ['E03', `cd src; eval 'cd .. ${BS}& X=$PWD'; cd "$X"; rm -rf *`],
  ['E04', `cd src; eval 'cd .. | true; X=$PWD'; cd "$X"; rm -rf *`],
  ['E05', `cd src; eval '(cd ..; X=$PWD)'; cd "$X"; rm -rf *`],
  ['E06', `bash -c 'cd src; eval "cd .. && echo ${BS}\${x/${BS}${BS}}/&}; X=${BS}$PWD"; cd "$X"; rm -rf *'`],
  ['E07', `cd src; eval 'cd .. && echo \${x/${BS}}/&}; X=$PWD'; rm -rf "$X"`],
  ['E08', `cd src; eval 'cd .. && echo \${x/${BS}}/&}; X=$PWD'; rm -rf "$X"/*`],
  ['E09', `cd src; eval 'cd ..; X=$PWD'; cd "$X"; rm -rf *`],
  ['E10', `cd src; eval 'cd .. & X=$PWD'; rm -rf "$X"`],
  ['E11', `cd src; eval 'cd .. | cat; X=$PWD'; rm -rf "$X"`],
  ['E12', `cd src; eval 'cd .. & X=$PWD'; pushd "$X"; rm -rf ./*`],
  ['E13', `cd src; bash -c 'true'; eval '(true) ; cd .. & Y=$PWD'; rm -rf "\${Y}"`],
];
const F2 = [
  ['G8708', `echo \${x/${BS}}/&} CDPATH=.. cd progetto && rm -rf "$PWD"`],
  ['G8708a', `echo \${x/${BS}}/&} cd progetto && rm -rf "$PWD"`],
  ['G12556', `echo \${x/${BS}}/&} 'cd' - && case $x in (a|b)) 'cd' .&&echo $((1&2)) ;;& *) git status ; false ;; esac ; find . -exec rm -rf {} + | echo 'x;y'`],
  ['G12556a', `echo \${x/${BS}}/&} cd - && find . -exec rm -rf {} +`],
  ['G01', `echo \${x//${BS}}/&} cd src && rm -rf ../*`],
  ['G02', `echo "\${x/${BS}}/&}" cd .. && rm -rf src`],
  ['G03', `echo \${x:-\${y/${BS}}/&}} cd progetto && rm -rf .`],
  ['G04', `echo \${x:-$(echo \${x/${BS}}/&} cd ..)}; rm -rf *`],
  ['G05', `g() { cat a.txt&&echo $((1&2)) &\necho \${x:-$(make && echo \${x/${BS}}/&} CDPATH={L} cd lavori && false)}; rm -rf -- .[!.]* *; }; g`],
  /* semi 57 e 59 del generatore del revisore (la mia ricerca, 80 semi): dentro le virgolette doppie di `sh -c "…"` */
  ['S59', `sh -c "echo ${BS}\${x/${BS}${BS}}/&} CDPATH=/ cd src ; : ; Remove-Item -Recurse -Force ."`],
  ['S59b', `sh -c "echo ${BS}\${x/${BS}${BS}}/&} cd src ; rm -rf ."`],
  ['S57', `sh -c "sl ~ |& echo ${BS}\${x/${BS}${BS}}/&} 'cd' {F} ; git clean -fdx"`],
  /* le due famiglie insieme: dopo un `eval` letto anche senza dividere, le variabili tengono i valori di tutte e due le letture */
  ['G06', `eval 'echo \${x/${BS}}/&} cd src; X=$PWD'; rm -rf "$X"`],
  ['G07', `eval 'echo \${x/${BS}}/&} cd src; X=$PWD'; cd /; rm -rf "$X"`],
  /* `'${'` fra virgolette singole è testo: non apre graffe, e la `&` dentro le graffe vere dopo si legge lo stesso */
  ['G08', `echo '\${'; echo \${x/${BS}}/&} cd progetto && rm -rf "$PWD"`],
  ['G09', `echo 'a\${b'; echo \${x/${BS}}/&} cd progetto && rm -rf "$PWD"`],
];
/* Windows, seme 66 del revisore: la 0.2.1 fallisce chiusa (troppo annidato), la lettura nuova tace. Non è una delle due famiglie: resta
   (scritto nel rapporto) e la carta la dà la 0.2.1 ferma. È la forma che fa morire il mutante «solo la lettura nuova» sulla proprietà. */
const SOLO_LA_021 = ["pushd ..// >/dev/null &\nfor f in a b; do x=1; done|bash <<'EOF'\nCDPATH=~ cd src\nEOF\nfind . -delete"];
const ferme = await oracoloDella021();
const SENZA_ORACOLO = ferme ? false : `senza il commit ${COMMIT_DELLA_021} l oracolo non c è`;

for (const [famiglia, forme] of [['F1', F1], ['F2', F2]]) {
  for (const [id, modello] of forme) {
    for (const s of SISTEMI) {
      test(`${famiglia}-${id}-${s} — dove la 0.2.1 chiede, il cancello intero chiede, col motivo della 0.2.1, e la lettura nuova da sola chiede anche lei`, { skip: salta(s) || SENZA_ORACOLO }, async () => {
        const comando = riempiR(modello, s);
        const della021 = ferme.cancellazioneCritica(comando, mondo(s));
        for (const livello of LIVELLI) {
          const vecchie = (await carte(ferme.verificaPermessoScrittura, s, comando, livello)).critiche;
          const nuove = (await carte(verificaPermessoScrittura, s, comando, livello)).critiche;
          if (vecchie.length) assert.deepEqual(nuove, vecchie, `${s} ${livello}: ${comando}`);
        }
        if (della021) assert.equal(letturaNuova(comando, mondo(s))?.perche, della021.perche, `${s} lettura nuova: ${comando}`);
      });
    }
  }
}
test('F-QUANTE — le due famiglie danno carte nella 0.2.1 su Linux, Android e macOS (le forme cancellano davvero)', { skip: SENZA_ORACOLO }, () => {
  for (const s of ['L', 'A', 'M']) {
    const date = [...F1, ...F2].filter(([, m]) => ferme.cancellazioneCritica(riempiR(m, s), mondo(s)) !== null).length;
    assert.ok(date >= 18, `${s}: ${date} forme con la carta della 0.2.1`);
  }
});

/* ───────────── PROP: la proprietà con l oracolo estratto dal commit ───────────── */

/* le forme dei primi tre ROSSI, copiate dalla prova del quinto giro (`permessi-solo-carte-in-piu.test.mjs`) */
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

/**
 * carte(prodotto) ⊇ carte(0.2.1): la funzione su ogni forma; il cancello intero (due livelli) su ogni forma dove l oracolo chiede e, per
 * vedere anche il resto, su una forma ogni `passo`. Le violazioni si contano per sistema.
 */
async function proprieta(t, forme, riempiDi, passo) {
  const violate = [];
  const conta = {};
  for (const s of SISTEMI) {
    conta[s] = { forme: 0, della021: 0, prodotto: 0, cancelli: 0 };
    for (const [i, f] of forme.entries()) {
      const comando = riempiDi(f, s);
      const vecchia = ferme.cancellazioneCritica(comando, mondo(s));
      const nuova = critiche.cancellazioneCritica(comando, mondo(s));
      conta[s].forme += 1;
      if (vecchia) conta[s].della021 += 1;
      if (nuova) conta[s].prodotto += 1;
      if (vecchia && !nuova && violate.length < 20) violate.push(`${s} funzione: ${JSON.stringify(comando)}`);
      if (i % passo !== 0) continue;
      for (const livello of LIVELLI) {
        const a = await carte(ferme.verificaPermessoScrittura, s, comando, livello);
        if (a.critiche.length === 0) continue;
        conta[s].cancelli += 1;
        const b = await carte(verificaPermessoScrittura, s, comando, livello);
        if (b.critiche.length === 0 && violate.length < 20) violate.push(`${s} ${livello}: ${JSON.stringify(comando)}`);
      }
    }
  }
  t.diagnostic(JSON.stringify(conta));
  return { violate, conta };
}

test('PROP-ROSSI — le forme dei quattro ROSSI: carte(prodotto) ⊇ carte(0.2.1 estratta dal commit), funzione e cancello, W L A M', { skip: SENZA_ORACOLO }, async (t) => {
  const forme = [...TRE_ROSSI, ...F1.map(([, m]) => m), ...F2.map(([, m]) => m), ...SOLO_LA_021];
  const { violate, conta } = await proprieta(t, forme, riempiR, 1);
  for (const s of ['L', 'A', 'M']) assert.ok(conta[s].della021 > 40, `${s}: ${conta[s].della021}`);
  assert.deepEqual(violate, []);
});

test('PROP-SOLO-LA-021 — dove la lettura nuova tace e la 0.2.1 chiede (Windows, seme 66 del revisore), il cancello chiede col motivo della 0.2.1', { skip: SALTA_W || SENZA_ORACOLO }, async () => {
  for (const m of SOLO_LA_021) {
    const comando = riempiR(m, 'W');
    assert.equal(letturaNuova(comando, mondo('W')), null, 'la lettura nuova da sola tace (se un giorno chiede, questa forma va cambiata)');
    const della021 = ferme.cancellazioneCritica(comando, mondo('W'));
    assert.equal(della021?.perche, 'troppo-annidato');
    assert.deepEqual(critiche.cancellazioneCritica(comando, mondo('W')), della021);
    for (const livello of LIVELLI) assert.deepEqual((await carte(verificaPermessoScrittura, 'W', comando, livello)).critiche, ['troppo-annidato'], livello);
  }
});

test('PROP-AUTORE — 2.000 forme del generatore dell autore (seme 20261113): carte(prodotto) ⊇ carte(0.2.1 estratta dal commit)', { skip: SENZA_ORACOLO }, async (t) => {
  const forme = formeCasuali(20261113, 2000);
  assert.equal(forme.length, 2000);
  const { violate, conta } = await proprieta(t, forme, riempiA, 10);
  for (const s of SISTEMI) assert.ok(conta[s].della021 > 1000, `${s}: ${conta[s].della021}`);
  assert.deepEqual(violate, []);
});

test('PROP-REVISORE — 2.000 forme del generatore del revisore (seme 7101113): carte(prodotto) ⊇ carte(0.2.1 estratta dal commit)', { skip: SENZA_ORACOLO }, async (t) => {
  const forme = formeDelRevisore(7101113, 2000);
  assert.equal(forme.length, 2000);
  const { violate, conta } = await proprieta(t, forme, riempiR, 10);
  for (const s of SISTEMI) assert.ok(conta[s].della021 > 500, `${s}: ${conta[s].della021}`);
  assert.deepEqual(violate, []);
});

test('PROP-GENERATORE-DEL-REVISORE — la copia del generatore del revisore dà le forme che ha dato a lui (#8708 e #12556, seme 7101113)', () => {
  const forme = formeDelRevisore(7101113, 12557);
  assert.match(forme[8708], /CDPATH=\.\. cd progetto && rm -rf "\$PWD"/u);
  assert.match(forme[12556], /find \. -exec rm -rf \{\} \+/u);
});

/* ───────────── ZERO-FALSE su macOS ───────────── */

/* i quattro gruppi onesti, copiati dalla prova del quinto giro */
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
const MACOS = [
  'brew install jq', 'xcode-select -p', 'swift build', 'open -a Safari index.html', 'pbcopy < README.md', 'defaults read com.apple.finder',
  'ls ~/Library/Caches', 'rm -rf ~/Library/Caches/com.example.app', 'rm -rf DerivedData', 'cd ios && pod install', 'rm -rf node_modules && npm ci',
  'mdfind -name Package.swift', 'diskutil list', 'cd build && rm -rf *', 'rm -f .DS_Store',
];
for (const [nome, elenco, quante] of [['TIPICI', TIPICI, 20], ['COMUNI', COMUNI, 12], ['LINUX', LINUX, 14], ['TELEFONO', TELEFONO, 13], ['MACOS', MACOS, 15]]) {
  test(`ZERO-FALSE-${nome}-M — i ${quante} comandi onesti non hanno carte critiche su macOS (funzione e cancello)`, async () => {
    assert.equal(elenco.length, quante);
    for (const m of elenco) {
      assert.equal(critiche.cancellazioneCritica(riempiR(m, 'M'), mondo('M')), null, `funzione: ${m}`);
      for (const livello of LIVELLI) assert.deepEqual((await carte(verificaPermessoScrittura, 'M', riempiR(m, 'M'), livello)).critiche, [], `${livello}: ${m}`);
    }
  });
}
test('ZERO-FALSE-MACOS — i 15 comandi di macOS non hanno carte critiche nemmeno su Windows, Linux e Android', async () => {
  for (const s of SISTEMI.filter((x) => x !== 'M')) for (const m of MACOS) assert.equal(critiche.cancellazioneCritica(riempiR(m, s), mondo(s)), null, `${s}: ${m}`);
});
