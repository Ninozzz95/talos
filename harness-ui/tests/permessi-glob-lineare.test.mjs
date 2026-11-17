/*
 * Undicesimo giro della riparazione dei permessi (15/11/2026, owner «solo le stelle», giudice v1923-v1924) — IL GLOB DI UN NOME SI
 * CONFRONTA SENZA ESPRESSIONE REGOLARE. Il revisore del decimo giro (ROSSO, 15/11 00:20) ha visto `rm -rf ../************Z` (23
 * caratteri, progetto in una cartella di 19 lettere) tenere il cancello oltre 1 s: le stelle diventavano `^.*.*…Z$`, un'espressione che
 * torna indietro contro il nome della cartella critica, in ogni confronto dei nomi della lettura nuova. Ora il confronto è a due
 * puntatori (passi al massimo (n+1)·(m+1)), e un glob che il confronto non sa leggere chiede (`troppo-complesso`), mai «nome diverso»
 * (lente del giudice v1923: prima un glob che non diventava espressione tornava `null`, e `stessoNome` lo leggeva come un nome diverso).
 *  - STELLE-TEMPO-*: la forma delle stelle, ogni lunghezza fino a 4 KiB, la lettura nuova sotto i 10 ms (solo con la CPU sotto il 50 %),
 *    e nessuna carta, come oggi.
 *  - STELLE-SENZA-FERMA-*: la funzione del cancello con una copia ferma finta: sotto i 10 ms, e la ferma si consulta ancora una volta.
 *  - STELLE-CARTA-*: tante stelle che PRENDONO il nome della cartella danno ancora la carta.
 *  - STELLE-CONTO-*: i passi del confronto, contati: al massimo (n+1)·(m+1) per confronto, e non crescono con le stelle in fila.
 *  - STELLA-*: la stella consuma caratteri, ma mai una barra (il glob di un nome non attraversa le cartelle).
 *  - LENTE-*: classi POSIX (`[[:alpha:]]` e le sorelle) capite davvero; intervalli rovesciati, classi sconosciute, `[=c=]`, `[.c.]`,
 *    parentesi non chiuse con una classe, barre rovesciate e glob estesi (`@(…)`, `!(…)`, `+(…)`, `*(…)`, `?(…)`) danno la carta.
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono; la carta risponde «no». Nessuna
 * cancellazione; il bash vero non si prova.
 * Fonti (riaperte il 15/11/2026): il manuale di bash, «Pattern Matching» (gnu.org: `[!…]` e `[^…]`, `]` per primo, le classi alnum alpha
 * ascii blank cntrl digit graph lower print punct space upper word xdigit, `[=c=]`, `[.s.]`, la barra rovescia, i cinque operatori di
 * extglob); Codex `codex-rs/shell-command/src/bash.rs:30` (`has_error()` → `None`) e `:272` (una parola con `*?[` non vale come
 * letterale); Hermes `tools/approval_detection.py:1032-1045`; pi `core/package-manager.ts:680` (`minimatch`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import os from 'node:os';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
/* Time ceilings ×4 only under CI (shared runners); locally they stay as they were. Same rule as carta-argomenti-connettore-022-giro6. */
const MOLTIPLICATORE_CI = process.env.CI && process.env.CI !== 'false' ? 4 : 1;

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 1 ? 'serve Windows con una lettera di disco libera' : false;
const D = liberi[0] ?? 'Q';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio`, madre: `${D}:/Users`, rm: 'rm -rf' },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio', madre: '/home', rm: 'rm -rf' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files', madre: '/data/user/0/ai.talos.dev', rm: 'rm -rf' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio', madre: '/Users', rm: 'rm -rf' },
};
/* il nome della casa nella sua madre (`tizio`, su Android `files`): le forme del glob lo prendono o no */
const NOME_CASA = { W: 'tizio', L: 'tizio', A: 'files', M: 'tizio' };
/* il progetto in una cartella di 19 lettere, come quella vera (`AVM-harness-desktop`) */
const NOME19 = 'AVM-harness-desktop';
const CARTELLA19 = { W: `${D}:${BS}w${BS}${NOME19}`, L: `/home/tizio/projects/${NOME19}`, A: `/storage/emulated/0/Documents/${NOME19}`, M: `/Users/tizio/projects/${NOME19}` };
const POSIX = ['L', 'A', 'M'];
const SISTEMI = SALTA_W ? POSIX : ['W', ...POSIX];
const LIVELLI = ['accesso-pieno', 'scrittura-progetto'];
const P = critiche.__perLeProve;
const mondo = (s, altro = {}) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home }, realpathFn: (p) => p, ...altro });
const mondo19 = (s) => mondo(s, { cartella: CARTELLA19[s] });
const COMPLESSO = { percorso: null, perche: 'troppo-complesso' };

/* la CPU della macchina, tre campioni da un secondo (nodejs.org/api/os.html#oscpus: tempi cumulativi, si fanno le differenze) */
const totali = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { t: a.t + t, i: a.i + c.times.idle }; }, { t: 0, i: 0 });
const campioni = [];
for (let k = 0; k < 3; k += 1) {
  const a = totali();
  await new Promise((ok) => setTimeout(ok, 1000));
  const b = totali();
  campioni.push(Math.round(100 * (1 - (b.i - a.i) / Math.max(1, b.t - a.t))));
}
const SOTTO_CARICO = os.cpus().length === 0 ? 'os.cpus() vuoto: la CPU non si legge' : Math.max(...campioni) >= 50 ? `sotto carico: CPU ${campioni.join('/')}% (serve sotto il 50%)` : false;

/** Il cancello intero su un sistema, nel processo principale (`process.platform` finto fuori da Windows): carte, esito. */
async function cancello(s, comando, livelloAccesso = 'accesso-pieno') {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  let esito = null;
  try {
    esito = await verificaPermessoScrittura({ toolCallId: 't11', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  const carte = chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica);
  return { consentito: esito?.consentito ?? null, perche: carte.map((c) => c.perche) };
}

/* ───────────── le stelle ───────────── */

/** La forma del revisore: `rm -rf ../` (su W anche `Remove-Item -Recurse ..\`), k stelle, una lettera che il nome non ha in fondo. */
const stelle = (s, k, coda = 'Z', alla = 'rm') => (alla === 'ps' ? `Remove-Item -Recurse ..${BS}${'*'.repeat(k)}${coda}` : `rm -rf ../${'*'.repeat(k)}${coda}`);
const formeDiStelle = (s) => (s === 'W' ? ['rm', 'ps'] : ['rm']);
/* ogni lunghezza fino a 4 KiB su L; un campione fitto sugli altri (le corse lunghe le misura il banco, fuori dalle prove) */
const LUNGHEZZE = (s) => { const tutte = []; const fino = 4096 - 'Remove-Item -Recurse ..'.length - 2; for (let k = 1; k <= fino; k += s === 'L' ? 1 : k < 64 ? 1 : 97) tutte.push(k); tutte.push(fino); return tutte; };

for (const s of SISTEMI) {
  test(`STELLE-TEMPO-${s} — le stelle contro una cartella di 19 lettere, ogni lunghezza fino a 4 KiB: la lettura nuova sotto i 10 ms, nessuna carta`, { skip: SOTTO_CARICO || (s === 'W' ? SALTA_W : false), timeout: 300000 }, () => {
    for (const alla of formeDiStelle(s)) {
      P.letturaNuova(stelle(s, 1, 'Z', alla), mondo19(s)); // scalda
      for (const k of LUNGHEZZE(s)) {
        const c = stelle(s, k, 'Z', alla);
        const t0 = performance.now();
        const r = P.letturaNuova(c, mondo19(s));
        const ms = performance.now() - t0;
        assert.equal(r, null, `${s} k=${k} [${c.length} car]: ${JSON.stringify(r)}`);
        assert.ok(ms < 10 * MOLTIPLICATORE_CI, `[ceiling ${10 * MOLTIPLICATORE_CI} ms] ${s} k=${k} [${c.length} car]: ${ms.toFixed(1)} ms (CPU ${campioni.join('/')}%)`);
      }
    }
  });
}

for (const s of SISTEMI) {
  test(`STELLE-SENZA-FERMA-${s} — le forme da 23 e 41 caratteri con la funzione del cancello e una copia ferma finta: sotto i 10 ms, la ferma consultata una volta`, { skip: s === 'W' ? SALTA_W : false }, () => {
    for (const alla of formeDiStelle(s)) for (const k of [12, 30]) {
      const c = stelle(s, k, 'Z', alla);
      const consultata = [];
      const funzione = P.unaCartaSeUnaChiede(P.letturaNuova, (x) => { consultata.push(x); return null; });
      funzione(c, mondo19(s)); // scalda
      consultata.length = 0;
      const t0 = performance.now();
      const r = funzione(c, mondo19(s));
      const ms = performance.now() - t0;
      assert.equal(r, null, `${s} k=${k}: ${JSON.stringify(r)}`);
      assert.deepEqual(consultata, [c], `${s} k=${k}: la copia ferma si consulta ancora, con lo stesso comando`);
      if (!SOTTO_CARICO) assert.ok(ms < 10 * MOLTIPLICATORE_CI, `[ceiling ${10 * MOLTIPLICATORE_CI} ms] ${s} k=${k} [${c.length} car]: ${ms.toFixed(1)} ms`);
    }
  });
}

for (const s of SISTEMI) {
  test(`STELLE-CARTA-${s} — tante stelle che prendono il nome della cartella del progetto danno ancora la carta (anche 4.000)`, { skip: s === 'W' ? SALTA_W : false }, () => {
    for (const k of [1, 2, 12, 30, 4000]) {
      for (const coda of ['p', 'desktop', `AVM${'*'.repeat(k)}`, `A${'*'.repeat(k)}-${'*'.repeat(k)}p`]) {
        const c = stelle(s, k, coda);
        assert.deepEqual(P.letturaNuova(c, mondo19(s))?.perche, 'progetto', `${s} k=${k} coda «${coda.slice(0, 20)}»`);
      }
    }
    for (const k of [1, 12, 4000]) assert.equal(P.letturaNuova(stelle(s, k, 'q'), mondo19(s)), null, `${s} k=${k}: «…q» non prende il nome`);
  });
}

test('STELLE-CANCELLO — il cancello intero, le stelle contro la cartella del banco: nessuna carta (come oggi) e la carta quando prendono il nome', async () => {
  for (const s of SISTEMI) for (const livello of LIVELLI) {
    const no = await cancello(s, `rm -rf ../${'*'.repeat(12)}Z`, livello);
    assert.deepEqual(no.perche, [], `${s} ${livello}: «…Z»`);
    const si = await cancello(s, `rm -rf ../${'*'.repeat(12)}o`, livello);
    assert.equal(si.perche.length, 1, `${s} ${livello}: «…o» prende «progetto»`);
    assert.equal(si.consentito, false);
  }
});

test('STELLE-CONTO-CONFRONTO — i passi del confronto, contati, sono al massimo (n+1)·(m+1), anche nel caso peggiore dei due puntatori', () => {
  assert.equal(typeof P.globPrende, 'function', 'il confronto delle stelle si prova da solo');
  for (const n of [1, 19, 64, 255]) {
    const nome = 'a'.repeat(n);
    for (const k of [1, 2, 7, 30, 200, 2000]) {
      for (const [glob, atteso] of [[`${'*a'.repeat(k)}*b`, false], [`${'*'.repeat(k)}Z`, false], [`${'*a'.repeat(k)}`, k <= n], [`${'?'.repeat(k)}*`, k <= n]]) {
        const conto = { glob: 0 };
        const m = [...glob].length;
        assert.equal(P.globPrende(glob, nome, false, conto), atteso, `n=${n} k=${k} «${glob.slice(0, 16)}…»`);
        assert.ok(conto.glob >= 1 || n === 0, `n=${n} k=${k}: passi contati`);
        assert.ok(conto.glob <= (n + 1) * (m + 1), `n=${n} k=${k} m=${m}: ${conto.glob} passi > ${(n + 1) * (m + 1)}`);
      }
    }
  }
});

test('STELLE-CONTO-COMANDO — i passi del glob di un comando si contano, e con le stelle in fila non crescono come le stelle', () => {
  assert.equal(typeof P.globPassi, 'function', 'i passi del comando appena giudicato');
  const passi = {};
  for (const k of [12, 1000, 2000, 4000]) {
    assert.equal(P.letturaNuova(stelle('L', k), mondo19('L')), null);
    passi[k] = P.globPassi();
    assert.ok(passi[k] >= 1, `k=${k}: il confronto è passato dai passi contati (${passi[k]})`);
  }
  assert.ok(passi[4000] <= 2.5 * passi[2000], `k=4000 ${passi[4000]} passi, k=2000 ${passi[2000]}: crescono più che in proporzione`);
  /* dodicesimo giro: nel conto c'è anche la lettura del modello, un passo per carattere (k stelle e la `Z`): i confronti sono il resto */
  const confronti = (k) => passi[k] - (k + 1);
  assert.ok(confronti(4000) <= 50 * confronti(12), `k=4000 ${confronti(4000)} passi di confronto, k=12 ${confronti(12)}`);
  /* ogni confronto della forma da 4 KiB contro un nome di 19 lettere sta sotto (19+1)·(m+1) passi */
  assert.ok(passi[4000] <= 64 * (NOME19.length + 1) * (4000 + 2), `k=4000: ${passi[4000]}`);
});

/* ───────────── la stella consuma, ma mai una barra ───────────── */

test('STELLA-CONSUMA — la stella prende zero o più caratteri, il punto interrogativo uno solo', () => {
  assert.equal(typeof P.globPrende, 'function');
  const casi = [['ni*', 'nino', true], ['*o', 'nino', true], ['n*n*', 'nino', true], ['*', 'nino', true], ['*', '', true], ['n*o', 'no', true],
    ['?', '', false], ['ni?', 'nino', false], ['ni??', 'nino', true], ['*x*', 'nino', false], ['n*z', 'nino', false], ['*i*o', 'nino', true],
    ['[!x]ino', 'nino', true], ['[^n]ino', 'nino', false], [`${'*'.repeat(40)}o`, 'nino', true], [`${'*'.repeat(40)}`, NOME19, true]];
  for (const [glob, nome, atteso] of casi) assert.equal(P.globPrende(glob, nome, false), atteso, `«${glob}» contro «${nome}»`);
  /* su Windows senza maiuscole */
  assert.equal(P.globPrende('NI*', 'nino', true), true);
  assert.equal(P.globPrende('NI*', 'nino', false), false);
  assert.equal(P.globPrende('[A-C]vm*', 'avm', true), true);
  /* Revisore del tredicesimo giro (17/11/2026): senza maiuscole un insieme negato prende il carattere quando UNA sua forma è fuori
     (`a` non sta in `[A]`: una shell che bada alle maiuscole la prende); non lo prende solo se tutte le forme sono dentro */
  assert.equal(P.globPrende('[!A]vm*', 'avm', true), true);
  assert.equal(P.globPrende('[!Aa]vm*', 'avm', true), false);
  assert.equal(P.globPrende('[!A]vm*', 'Avm', false), false);
});

test('STELLA-CONSUMA-CANCELLO — con la stella la carta nomina la casa e il progetto (W L A M, i due accessi)', async () => {
  for (const s of SISTEMI) for (const livello of LIVELLI) {
    const casa = await cancello(s, `${SIS[s].rm} ${SIS[s].madre}/${NOME_CASA[s].slice(0, 2)}*`, livello);
    assert.equal(casa.perche.length, 1, `${s} ${livello}: casa ${JSON.stringify(casa.perche)}`);
    const progetto = await cancello(s, 'rm -rf ../pro*o', livello);
    assert.equal(progetto.perche.length, 1, `${s} ${livello}: progetto ${JSON.stringify(progetto.perche)}`);
  }
});

test('STELLA-BARRA — né la stella né il punto interrogativo né un insieme prendono una barra: il glob di un nome non attraversa le cartelle', () => {
  assert.equal(typeof P.globPrende, 'function');
  for (const [glob, nome] of [['a*b', 'a/b'], ['*', 'a/b'], ['a?b', 'a/b'], ['a[!x]b', 'a/b'], ['*b', '/b'], ['a*', 'a/'], ['*/*', 'a/b/c']]) {
    assert.equal(P.globPrende(glob, nome, false), false, `«${glob}» contro «${nome}»`);
  }
  assert.equal(P.globPrende('*/*', 'a/b', false), true, 'la barra scritta prende la barra');
});

test('STELLA-BARRA-WINDOWS — su Windows anche la barra rovesciata separa le cartelle', () => {
  assert.equal(typeof P.globPrende, 'function');
  for (const [glob, nome] of [['a*b', `a${BS}b`], ['a?b', `a${BS}b`], ['*', `x${BS}y`], ['a*b', 'a/b']]) {
    assert.equal(P.globPrende(glob, nome, true), false, `«${glob}» contro «${nome}»`);
  }
  assert.equal(P.globPrende('a*b', 'axyb', true), true);
});

/* ───────────── la lente del giudice v1923: chi non sa leggere chiede ───────────── */

const globDellaCasa = (s, g) => `${SIS[s].rm} ${SIS[s].madre}/${g}`;
const lettera = (s) => NOME_CASA[s][0];
const resto = (s) => NOME_CASA[s].slice(1);

for (const s of SISTEMI) {
  test(`LENTE-ROVESCIO-${s} — un intervallo rovesciato (\`[z-a]\`) non diventava espressione e tornava «nome diverso»: ora chiede, nei due accessi`, { skip: s === 'W' ? SALTA_W : false }, async () => {
    for (const g of [`[z-a]${resto(s)}`, `${lettera(s)}[z-b]*`]) {
      const c = globDellaCasa(s, g);
      assert.deepEqual(P.letturaNuova(c, mondo(s)), COMPLESSO, `${s} «${c}» lettura nuova`);
      for (const livello of LIVELLI) {
        const r = await cancello(s, c, livello);
        assert.deepEqual(r.perche, ['troppo-complesso'], `${s} ${livello} «${c}»`);
        assert.equal(r.consentito, false);
      }
    }
  });
}

for (const s of SISTEMI) {
  test(`LENTE-POSIX-${s} — le classi POSIX si capiscono davvero: \`[[:alpha:]]\` e le sorelle prendono il nome della casa (bash le espande)`, { skip: s === 'W' ? SALTA_W : false }, async () => {
    for (const classe of ['alpha', 'lower', 'alnum', 'word', 'graph', 'print']) {
      const c = globDellaCasa(s, `[[:${classe}:]]${resto(s)}`);
      assert.equal(P.letturaNuova(c, mondo(s))?.perche, 'casa', `${s} «${c}»`);
      for (const livello of LIVELLI) assert.deepEqual((await cancello(s, c, livello)).perche, ['casa'], `${s} ${livello} «${c}»`);
    }
    const due = globDellaCasa(s, `${lettera(s)}[[:alpha:]][[:lower:]]*`);
    assert.equal(P.letturaNuova(due, mondo(s))?.perche, 'casa', `${s} «${due}»`);
    /* una classe che il nome non ha: nessuna carta (le maiuscole contano fuori da Windows) */
    for (const classe of ['digit', 'space', 'punct', 'blank', 'cntrl']) {
      const c = globDellaCasa(s, `[[:${classe}:]]${resto(s)}`);
      assert.equal(P.letturaNuova(c, mondo(s)), null, `${s} «${c}»`);
    }
    /* dodicesimo giro (owner 13:44): su macOS i nomi non badano alle maiuscole, come su Windows */
    assert.deepEqual(P.letturaNuova(globDellaCasa(s, `[[:upper:]]${resto(s)}`), mondo(s))?.perche ?? null, s === 'W' || s === 'M' ? 'casa' : null, `${s} [[:upper:]]`);
  });
}

test('LENTE-POSIX-SORELLE — digit, upper, space, punct, xdigit, blank, cntrl, ascii, alnum, word, graph, print: ognuna prende quello che deve', () => {
  assert.equal(typeof P.globPrende, 'function');
  const casi = [
    ['[[:digit:]]', '7', true], ['[[:digit:]]', 'x', false], ['[[:upper:]]', 'Q', true], ['[[:upper:]]', 'q', false], ['[[:lower:]]', 'q', true],
    ['[[:space:]]', ' ', true], ['[[:space:]]', 'x', false], ['[[:punct:]]', '-', true], ['[[:punct:]]', 'a', false], ['[[:xdigit:]]', 'F', true],
    ['[[:xdigit:]]', 'g', false], ['[[:blank:]]', '\t', true], ['[[:blank:]]', 'x', false], ['[[:cntrl:]]', '\u0001', true], ['[[:cntrl:]]', 'a', false],
    ['[[:ascii:]]', 'a', true], ['[[:ascii:]]', 'è', false], ['[[:alnum:]]', '9', true], ['[[:alnum:]]', '_', false], ['[[:word:]]', '_', true],
    ['[[:graph:]]', '#', true], ['[[:graph:]]', ' ', false], ['[[:print:]]', ' ', true], ['[[:print:]]', '\u0001', false], ['[[:alpha:]]', 'è', true],
    ['[![:digit:]]', 'x', true], ['[![:digit:]]', '7', false], ['[[:digit:][:upper:]]', 'Q', true], ['[a[:digit:]]', '3', true],
  ];
  for (const [glob, nome, atteso] of casi) assert.equal(P.globPrende(glob, nome, false), atteso, `«${glob}» contro «${JSON.stringify(nome)}»`);
  /* la cartella del progetto con maiuscola, cifra, spazio e punteggiatura, tutta in classi */
  const nome = 'Pr0 x-y';
  assert.equal(P.globPrende('[[:upper:]]r[[:digit:]][[:space:]]x[[:punct:]]y', nome, false), true);
  assert.equal(P.globPrende('[[:upper:]]r[[:alpha:]][[:space:]]x[[:punct:]]y', nome, false), false);
});

for (const s of SISTEMI) {
  test(`LENTE-ILLEGGIBILI-${s} — classe sconosciuta, \`[=c=]\`, \`[.c.]\`, una classe in parentesi non chiuse: chiede, mai «nome diverso»`, { skip: s === 'W' ? SALTA_W : false }, async () => {
    for (const g of [`[[:foo:]]${resto(s)}`, `[[=${lettera(s)}=]]${resto(s)}`, `[[.${lettera(s)}.]]${resto(s)}`, `[[:alpha:]${resto(s)}`, `[[:constructor:]]${resto(s)}`, `[[:alpha]]${resto(s)}`]) {
      const c = globDellaCasa(s, g);
      assert.deepEqual(P.letturaNuova(c, mondo(s)), COMPLESSO, `${s} «${c}» lettura nuova`);
      assert.deepEqual((await cancello(s, c)).perche, ['troppo-complesso'], `${s} «${c}» cancello`);
    }
  });
}

for (const s of SISTEMI) {
  test(`LENTE-PARENTESI-${s} — \`]\` per primo, \`[!…]\`, \`[^…]\`, la parentesi non chiusa: la carta giusta`, { skip: s === 'W' ? SALTA_W : false }, async () => {
    const l = lettera(s);
    for (const g of [`[]${l}]${resto(s)}`, `[!]x]${resto(s)}`, `[!x]${resto(s)}`, `[^x]${resto(s)}`, `[${l}-${l}]${resto(s)}`, `[-${l}]${resto(s)}`, `[x${l}-]${resto(s)}`]) {
      const c = globDellaCasa(s, g);
      assert.equal(P.letturaNuova(c, mondo(s))?.perche, 'casa', `${s} «${c}»`);
      assert.deepEqual((await cancello(s, c)).perche, ['casa'], `${s} «${c}» cancello`);
    }
    /* su W non `[^…]`: per cmd il `^` è la fuga, e la lettura di cmd vede `[t]izio`, che prende la casa (una carta in più, giusta per cmd) */
    /* Revisore del tredicesimo giro (17/11/2026): dove il disco non bada alle maiuscole (W, M) il negato della sola minuscola prende la
       casa, perché la shell che espande bada alle maiuscole e la cartella può stare sul disco con l altra forma: carta. Con tutte e due
       le forme nel negato il nome è davvero escluso, ovunque. */
    const senza = s === 'W' || s === 'M';
    for (const g of [`[!${l}]${resto(s)}`, ...(s === 'W' ? [] : [`[^${l}]${resto(s)}`])]) {
      const c = globDellaCasa(s, g);
      if (senza) {
        assert.equal(P.letturaNuova(c, mondo(s))?.perche, 'casa', `${s} «${c}»: una forma del nome è fuori dal negato`);
        assert.deepEqual((await cancello(s, c)).perche, ['casa'], `${s} «${c}» cancello`);
      } else assert.equal(P.letturaNuova(c, mondo(s)), null, `${s} «${c}»: il nome non è quello`);
    }
    for (const g of [`[!${l}${l.toUpperCase()}]${resto(s)}`, `${l}${resto(s).slice(0, 2)}[${resto(s).slice(2)}`, `[]x]${resto(s)}`]) {
      const c = globDellaCasa(s, g);
      assert.equal(P.letturaNuova(c, mondo(s)), null, `${s} «${c}»: il nome non è quello`);
    }
  });
}

for (const s of POSIX) {
  test(`LENTE-BARRE-${s} — una barra rovesciata che arriva nel glob (fra apici semplici, dentro un insieme) chiede`, async () => {
    for (const g of [`'${lettera(s)}${BS}${resto(s).slice(0, 2)}*'`, `[${lettera(s)}${BS}]${resto(s)}`, `${lettera(s)}${BS}${BS}*`]) {
      const c = globDellaCasa(s, g);
      const r = P.letturaNuova(c, mondo(s));
      assert.ok(r !== null, `${s} «${c}»: ${JSON.stringify(r)}`);
      for (const livello of LIVELLI) assert.equal((await cancello(s, c, livello)).perche.length, 1, `${s} ${livello} «${c}»`);
    }
  });
}

/* sul cancello le fughe si tolgono prima del confronto (POSIX) e la barra rovesciata separa le cartelle (Windows): il confronto da solo
   deve comunque chiedere quando una barra rovesciata gli arriva, fuori o dentro un insieme */
for (const [nome, senzaMaiuscole] of [['POSIX', false], ['WINDOWS', true]]) {
  test(`LENTE-BARRE-CONFRONTO-${nome} — una barra rovesciata nel glob fa chiedere il confronto, fuori e dentro un insieme`, () => {
    assert.equal(typeof P.globPrende, 'function');
    for (const glob of [`t${BS}iz*`, `${BS}*`, `[t${BS}]iz*`, `[${BS}-z]iz*`, `t[a-${BS}]*`]) {
      assert.throws(() => P.globPrende(glob, 'tizio', senzaMaiuscole), (e) => e?.trabocco === 'glob', `«${glob}»`);
    }
  });
}

for (const s of SISTEMI) {
  test(`LENTE-ESTESI-${s} — i glob estesi (\`@(…)\`, \`!(…)\`, \`+(…)\`, \`*(…)\`, \`?(…)\`) sul nome della casa danno la carta, nei due accessi`, { skip: s === 'W' ? SALTA_W : false }, async () => {
    const n = NOME_CASA[s];
    for (const g of [`@(${n})`, '!(nessuno)', `+(${n})`, `*(${n})`, `?(${n})`, `@(nessuno|${n})`, `${n.slice(0, 2)}@(${n.slice(2)})`]) {
      const c = globDellaCasa(s, g);
      assert.ok(P.letturaNuova(c, mondo(s)) !== null, `${s} «${c}» lettura nuova`);
      for (const livello of LIVELLI) {
        const r = await cancello(s, c, livello);
        assert.equal(r.perche.length, 1, `${s} ${livello} «${c}»: ${JSON.stringify(r.perche)}`);
        assert.equal(r.consentito, false);
      }
    }
  });
}

test('LENTE-ESTESI-SOTTOSHELL — la lettura nuova vede ancora la cancellazione dentro `!( … )` in testa al comando, dopo `;`, `&&`, `||` e un a capo (W L A M)', () => {
  for (const s of SISTEMI) {
    for (const c of ['!(rm -rf /)', 'cd x; !(rm -rf /)', 'true || !(rm -rf /)', 'echo a\n!(rm -rf /)']) {
      assert.ok(P.letturaNuova(c, mondo(s)) !== null, `${s}: «${JSON.stringify(c)}» senza carta dalla lettura nuova`);
    }
  }
});

test('LENTE-ESTESI-GUARDIE — `!( … )` in testa al comando resta una sottoshell negata, e un glob esteso dentro il progetto non chiede', async () => {
  for (const s of POSIX) {
    assert.equal(P.letturaNuova('!(rm -rf ~)', mondo(s))?.perche, 'casa', `${s}: «!(rm -rf ~)»`);
    assert.equal(P.letturaNuova('true && !(rm -rf ~)', mondo(s))?.perche, 'casa', `${s}: «true && !(rm -rf ~)»`);
    assert.equal(P.letturaNuova('rm -rf ./@(dist|build)', mondo(s)), null, `${s}: «rm -rf ./@(dist|build)»`);
    assert.equal(P.letturaNuova('rm -rf build/*(N)', mondo(s)), null, `${s}: «rm -rf build/*(N)»`);
    assert.deepEqual((await cancello(s, 'rm -rf ./@(dist|build)')).perche, [], `${s}: cancello`);
  }
});
