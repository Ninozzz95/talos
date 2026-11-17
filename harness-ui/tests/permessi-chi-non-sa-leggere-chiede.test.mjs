/*
 * Decimo giro della riparazione dei permessi (14/11/2026, owner 18:10 «strada sicura», giudice v1901-v1902) — CHI NON SA LEGGERE
 * CHIEDE. Il revisore del nono giro (ROSSO, 14/11 18:00) ha trovato due cose, tutte e due dalle variabili assegnate nel testo che si
 * moltiplicano (`a=x…; b=$a$a…; c=$b$b…`):
 *  - un buco silenzioso, già nella 0.2.1: quando il valore supera la lunghezza massima di una stringa nasce un errore, e la lettura
 *    rispondeva «nessuna carta». Una cancellazione critica scritta DOPO passava senza carta nei due accessi (anche dentro un ramo che
 *    la shell non esegue, o in una funzione mai chiamata);
 *  - un comando corto (285 caratteri) teneva il cancello intero 1,65-4,27 s, perché le due letture moltiplicavano ognuna per conto suo.
 * Ora la lettura nuova conta i caratteri che le variabili aggiungono, PRIMA di costruire la stringa, e oltre il tetto chiede («comando
 * troppo complesso per essere letto», `troppo-complesso`). Ogni errore della lettura nuova chiede allo stesso modo, mai `null`. Quando la
 * lettura nuova chiede, la copia ferma della 0.2.1 non si consulta (la carta c'è già); quando tace, si consulta come prima.
 *  - TRABOCCO-*: le forme del revisore danno la carta, nei due accessi, W L A M.
 *  - TRABOCCO-285-* e TRABOCCO-438-W: la carta, e sotto i 100 ms col cancello intero (solo con la CPU sotto il 50 %).
 *  - INIEZIONE-*: un errore qualsiasi dentro la lettura nuova (un ambiente o un elenco di progetti che lanciano) dà la carta.
 *  - ORDINE-*: la copia ferma si salta solo quando la carta è già data; quando la lettura nuova tace, si consulta, dopo.
 *  - TETTO-ESPANSIONE-*: il confine esatto del tetto (al tetto niente carta, un carattere sopra la carta).
 *  - FERMA-R4/R6/R7/R11-*: le regole della copia ferma che il revisore ha visto senza prove (o con una sola).
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono; la carta risponde «no». Nessuna
 * cancellazione; il bash vero non si prova.
 * Fonti (riaperte il 14/11/2026): Hermes `tools/approval_detection.py:702-703` (oltre il tetto «fails closed rather than letting an
 * uninspected suffix execute»); Codex `codex-rs/shell-command/src/bash.rs:30-31` (`has_error()` → `None`: niente sì automatico); Claude
 * Code `CHANGELOG.md:4699` («Bash permission checks to fail closed…»); la lunghezza massima di una stringa in V8 (2^30 - 25 caratteri
 * da Node 9, oltre: RangeError «Invalid string length»), engineered.at, «maximum string length across node js versions».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import * as della021 from './fixtures/cancellazioni-critiche-0.2.1.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
/* Time ceilings ×4 only under CI (shared runners); locally they stay as they were. Same rule as carta-argomenti-connettore-022-giro6. */
const MOLTIPLICATORE_CI = process.env.CI && process.env.CI !== 'false' ? 4 : 1;

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 1 ? 'serve Windows con una lettera di disco libera' : false;
const D = liberi[0] ?? 'Q';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio`, fuori: `${D}:${BS}dati${BS}out` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio', fuori: '/opt/dati/out' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files', fuori: '/storage/emulated/0/Download/out' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio', fuori: '/usr/local/dati/out' },
};
const POSIX = ['L', 'A', 'M'];
const SISTEMI = SALTA_W ? POSIX : ['W', ...POSIX];
const LIVELLI = ['accesso-pieno', 'scrittura-progetto'];
const P = critiche.__perLeProve;
const mondo = (s, ambiente = {}, altro = {}) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home, ...ambiente }, realpathFn: (p) => p, ...altro });
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

/** Il cancello intero su un sistema, nel processo principale (`process.platform` finto fuori da Windows): carte, esito, millisecondi. */
async function cancello(s, comando, livelloAccesso = 'accesso-pieno', altro = {}) {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  let esito = null;
  const t0 = performance.now();
  try {
    esito = await verificaPermessoScrittura({ toolCallId: 't10', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; }, ...altro });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  const ms = performance.now() - t0;
  const carte = chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica);
  return { ms, consentito: esito?.consentito ?? null, perche: carte.map((c) => c.perche), frasi: carte.map((c) => c.fraseChiave) };
}

/* ───────────── le forme del revisore del nono giro ───────────── */

const NOMI = 'abcdefg';
/** Sei assegnazioni che si moltiplicano (`a=x×n; b=$a×n; …; f=$e×n`): in bash e in cmd. */
const asse = (n = 32, livelli = 5) => { const p = [`a=${'x'.repeat(n)}`]; for (let i = 1; i <= livelli; i += 1) p.push(`${NOMI[i]}=${`$${NOMI[i - 1]}`.repeat(n)}`); return p.join('; '); };
const asseCmd = (n = 32, livelli = 5) => { const p = [`set a=${'x'.repeat(n)}`]; for (let i = 1; i <= livelli; i += 1) p.push(`set ${NOMI[i]}=${`%${NOMI[i - 1]}%`.repeat(n)}`); return p.join(' & '); };
const FINALI_POSIX = ['rm -rf ~', 'rm -rf /', 'rm -rf .', 'rm -rf ..'];
const FORME_POSIX = (n) => FINALI_POSIX.flatMap((fine) => [
  [`prima, ${fine}`, `${asse(n)}; ${fine}`],
  [`true || {…}, ${fine}`, `true || { ${asse(n)}; }; ${fine}`],
  [`funzione mai chiamata, ${fine}`, `mai() { ${asse(n)}; }; ${fine}`],
]);
const FINALI_W = ['rd /s /q %USERPROFILE%', `rd /s /q C:${BS}`, 'rd /s /q .', 'Remove-Item -Recurse -Force ~'];
const FORME_W = (n) => [
  ...FINALI_W.map((fine) => [`cmd, ${fine}`, `${asseCmd(n)} & ${fine}`]),
  ['bash true || {…}, rm -rf ~', `true || { ${asse(n)}; }; rm -rf ~`],
  ['bash funzione mai chiamata, rm -rf ~', `mai() { ${asse(n)}; }; rm -rf ~`],
];
const formeDi = (s, n) => (s === 'W' ? FORME_W(n) : FORME_POSIX(n));

test('TRABOCCO-CONTROLLO — le stesse forme con 2 copie (niente che si moltiplica) danno già la carta: il comando dopo è critico', async () => {
  for (const s of SISTEMI) for (const [nome, c] of formeDi(s, 2)) {
    const g = await cancello(s, c);
    assert.equal(g.perche.length, 1, `${s} «${nome}»: ${JSON.stringify(g.perche)}`);
  }
});

for (const s of SISTEMI) {
  test(`TRABOCCO-${s} — le forme del revisore (32 copie per livello, il valore supera ogni stringa) danno la carta nei due accessi, mai il silenzio`, { skip: s === 'W' ? SALTA_W : false, timeout: 120000 }, async () => {
    for (const [nome, c] of formeDi(s, 32)) for (const livello of LIVELLI) {
      const g = await cancello(s, c, livello);
      assert.equal(g.consentito, false, `${s} ${livello} «${nome}» [${c.length} car]: consentito`);
      assert.equal(g.perche.length, 1, `${s} ${livello} «${nome}» [${c.length} car]: ${JSON.stringify(g.perche)}`);
    }
  });
}

test('TRABOCCO-FUNZIONE — la lettura nuova e la funzione del cancello: oltre il tetto «troppo complesso», con percorso nullo (W L A M)', () => {
  for (const s of SISTEMI) for (const [nome, c] of formeDi(s, 32)) {
    assert.deepEqual(P.letturaNuova(c, mondo(s)), COMPLESSO, `${s} «${nome}» lettura nuova`);
    assert.deepEqual(critiche.cancellazioneCritica(c, mondo(s)), COMPLESSO, `${s} «${nome}» funzione del cancello`);
  }
});

test('TRABOCCO-FRASE — la carta del comando troppo complesso ha la sua frase, in inglese nel nucleo e in inglese E italiano nell interfaccia', async () => {
  const g = await cancello('L', `true || { ${asse(32)}; }; rm -rf ~`);
  assert.deepEqual(g.perche, ['troppo-complesso']);
  assert.deepEqual(g.frasi, ['server.approval.criticalDelete.tooComplex']);
  const testi = readFileSync(new URL('../frontend/src/i18n/testi/server.js', import.meta.url), 'utf8');
  assert.equal(testi.split("'approval.criticalDelete.tooComplex'").length - 1, 2, 'una frase italiana e una inglese');
});

/* ───────────── la forma corta che moltiplica (285 caratteri su L, 438 su W) ───────────── */

const CORTA = (s) => {
  if (s === 'W') { const p = ['set a=xxxxxxxx']; for (let i = 1; i <= 5; i += 1) p.push(`set ${NOMI[i]}=${`%${NOMI[i - 1]}%`.repeat(24)}`); return `${p.join(' & ')} & rd /s /q "%f%${BS}x"`; }
  const p = ['a=xxxxxxxx']; for (let i = 1; i <= 5; i += 1) p.push(`${NOMI[i]}=${`$${NOMI[i - 1]}`.repeat(24)}`); return `${p.join('; ')}; rm -rf "$f"/x`;
};

test('TRABOCCO-285-LUNGHEZZE — le forme del revisore hanno la lunghezza che ha misurato lui (285 su L A M, 438 su W)', () => {
  assert.equal(CORTA('L').length, 285);
  assert.equal(CORTA('W').length, 438);
});

for (const s of SISTEMI) {
  const nome = s === 'W' ? 'TRABOCCO-438-W' : `TRABOCCO-285-${s}`;
  test(`${nome} — la forma corta che moltiplica dà la carta «troppo complesso» nei due accessi`, { skip: s === 'W' ? SALTA_W : false, timeout: 120000 }, async () => {
    for (const livello of LIVELLI) {
      const g = await cancello(s, CORTA(s), livello);
      assert.deepEqual(g.perche, ['troppo-complesso'], `${s} ${livello}`);
      assert.equal(g.consentito, false);
    }
  });
  test(`${nome}-TEMPO — la stessa forma: il cancello intero risponde sotto i 100 ms (il migliore di tre, CPU sotto il 50 %)`, { skip: s === 'W' ? SALTA_W || SOTTO_CARICO : SOTTO_CARICO, timeout: 120000 }, async (t) => {
    await cancello(s, CORTA(s)); // scalda i moduli
    const tempi = [];
    for (let k = 0; k < 3; k += 1) tempi.push((await cancello(s, CORTA(s))).ms);
    t.diagnostic(`CPU ${campioni.join('/')}%; ${s} ${tempi.map((x) => x.toFixed(1)).join(' / ')} ms`);
    assert.ok(Math.min(...tempi) < 100 * MOLTIPLICATORE_CI, `[ceiling ${100 * MOLTIPLICATORE_CI} ms] ${s}: ${Math.min(...tempi).toFixed(1)} ms`);
  });
}

/* ───────────── un errore qualsiasi della lettura nuova chiede ───────────── */

/** Un ambiente che lancia appena lo si scorre (`Object.entries` → trappola `ownKeys`): come un errore qualsiasi dentro la lettura. */
const ambienteCheLancia = () => new Proxy({}, { ownKeys() { throw new Error('ambiente illeggibile (prova)'); } });
/** Un elenco di progetti che lancia appena lo si legge (`Array.isArray` dice sì, `filter` lancia). */
const progettiCheLanciano = () => new Proxy([], { get(t, k) { if (k === 'filter') throw new Error('progetti illeggibili (prova)'); return Reflect.get(t, k); } });

test('INIEZIONE-AMBIENTE — un errore dentro la lettura nuova (l ambiente che lancia) dà la carta «troppo complesso», non null (W L A M)', () => {
  for (const s of SISTEMI) for (const c of [s === 'W' ? `rd /s /q %X%${BS}build` : 'rm -rf "$X"/build', s === 'W' ? 'rd /s /q build' : 'rm -rf build']) {
    assert.deepEqual(P.letturaNuova(c, { ...mondo(s), ambiente: ambienteCheLancia() }), COMPLESSO, `${s} ${c} lettura nuova`);
    assert.deepEqual(critiche.cancellazioneCritica(c, { ...mondo(s), ambiente: ambienteCheLancia() }), COMPLESSO, `${s} ${c} funzione del cancello`);
  }
});

test('INIEZIONE-PROGETTI — un errore dentro la lettura nuova (l elenco dei progetti che lancia) dà la carta col cancello intero, nei due accessi (W L A M)', async () => {
  for (const s of SISTEMI) for (const livello of LIVELLI) {
    const g = await cancello(s, s === 'W' ? 'rd /s /q build' : 'rm -rf build', livello, { progettiCritici: progettiCheLanciano() });
    assert.deepEqual(g.perche, ['troppo-complesso'], `${s} ${livello}`);
    assert.deepEqual(g.frasi, ['server.approval.criticalDelete.tooComplex'], `${s} ${livello}: la frase`);
    assert.equal(g.consentito, false, `${s} ${livello}`);
  }
});

test('INIEZIONE-SENZA-CANCELLAZIONE — l errore non tocca i comandi che non cancellano: la lettura nuova non li guarda (W L A M)', () => {
  for (const s of SISTEMI) for (const c of ['ls -la', 'git status', 'npm test']) {
    assert.equal(P.letturaNuova(c, { ...mondo(s), ambiente: ambienteCheLancia(), progettiCritici: progettiCheLanciano() }), null, `${s} ${c}`);
  }
});

test('INIEZIONE-UNIONE — se la lettura nuova o la copia ferma lanciano, la funzione del cancello dà la carta, mai null', () => {
  const lancia = () => { throw new Error('lettura rotta (prova)'); };
  for (const s of SISTEMI) {
    assert.deepEqual(P.unaCartaSeUnaChiede(lancia, () => null)('rm -rf build', mondo(s)), COMPLESSO, `${s} la nuova lancia`);
    assert.deepEqual(P.unaCartaSeUnaChiede(() => null, lancia)('rm -rf build', mondo(s)), COMPLESSO, `${s} la ferma lancia`);
  }
});

/* ───────────── l ordine: la copia ferma si salta solo con la carta già data ───────────── */

test('ORDINE-CARTA-NUOVA — quando la lettura nuova chiede, la copia ferma NON si consulta e la carta è quella della nuova', () => {
  const chiamate = [];
  const carta = { percorso: '/home/tizio', perche: 'casa' };
  const f = P.unaCartaSeUnaChiede((c) => { chiamate.push(['nuova', c]); return carta; }, (c) => { chiamate.push(['ferma', c]); return { percorso: '/', perche: 'radice' }; });
  assert.deepEqual(f('rm -rf ~', mondo('L')), carta);
  assert.deepEqual(chiamate, [['nuova', 'rm -rf ~']]);
  chiamate.length = 0;
  assert.deepEqual(P.unaCartaSeUnaChiede(() => COMPLESSO, (c) => { chiamate.push(['ferma', c]); return null; })('x', mondo('L')), COMPLESSO);
  assert.deepEqual(chiamate, []);
});

test('ORDINE-SENZA-CARTA — quando la lettura nuova tace, la copia ferma si consulta UNA volta, DOPO, con lo stesso comando e le stesse opzioni', () => {
  const chiamate = [];
  const carta = { percorso: '/', perche: 'radice' };
  const o = mondo('L', {}, { progettiCritici: ['/srv/p'] });
  const f = P.unaCartaSeUnaChiede((c, op) => { chiamate.push(['nuova', c, op.cartella, op.piattaforma]); return null; }, (c, op) => { chiamate.push(['ferma', c, op.cartella, op.piattaforma, op.progettiCritici]); return carta; });
  assert.deepEqual(f('rm -rf /', o), carta);
  assert.deepEqual(chiamate, [['nuova', 'rm -rf /', o.cartella, 'linux'], ['ferma', 'rm -rf /', o.cartella, 'linux', ['/srv/p']]]);
  chiamate.length = 0;
  assert.equal(P.unaCartaSeUnaChiede(() => null, (c) => { chiamate.push(c); return null; })('rm -rf build', o), null);
  assert.deepEqual(chiamate, ['rm -rf build']);
});

test('ORDINE-PROPRIETA — dove la 0.2.1 chiede, la funzione del cancello chiede lo stesso (la ferma consultata quando la nuova tace) (L A M)', () => {
  const forme = ['rm -rf ~', 'rm -rf /', 'rm -rf .', 'rm -rf ..', 'cd .. && rm -rf progetto', 'rm -rf "$HOME"', 'D=..; rm -rf $D', 'bash -c "rm -rf ~"', 'rm -rf build', 'rm -rf node_modules'];
  let carte = 0;
  for (const s of POSIX) for (const c of forme) {
    const vecchia = della021.cancellazioneCritica(c, mondo(s));
    if (vecchia) { carte += 1; assert.ok(critiche.cancellazioneCritica(c, mondo(s)), `${s} ${c}: la 0.2.1 chiede (${vecchia.perche}), la testa no`); }
  }
  assert.ok(carte >= 18, `carte della 0.2.1: ${carte}`);
});

/* ───────────── il tetto dell espansione, al confine ───────────── */

test('TETTO-ESPANSIONE-CONFINE — al tetto esatto niente carta; un carattere sopra la carta «troppo complesso» (L A M)', () => {
  const T = P.TETTO_DELL_ESPANSIONE;
  assert.ok(Number.isInteger(T) && T > 0, `il tetto: ${T}`);
  const n = 1024;
  const forma = (k) => `a=${'x'.repeat(n)}; b=${'$a'.repeat(k)}; rm -rf build`;
  for (const s of POSIX) {
    assert.equal(P.letturaNuova(forma(1), mondo(s)), null);
    const m = P.espansi() / n; // quante volte la lettura espande l assegnazione (un giro solo: una volta)
    assert.ok(Number.isInteger(m) && m >= 1, `${s}: ${P.espansi()} caratteri per una copia`);
    const k = Math.floor(T / (n * m));
    assert.equal(P.letturaNuova(forma(k), mondo(s)), null, `${s}: ${k} copie, ${k * n * m} caratteri`);
    assert.ok(P.espansi() <= T, `${s}: contati ${P.espansi()}`);
    assert.deepEqual(P.letturaNuova(forma(k + 1), mondo(s)), COMPLESSO, `${s}: ${k + 1} copie`);
    assert.ok(P.espansi() > T, `${s}: contati ${P.espansi()}`);
  }
});

test('TETTO-ESPANSIONE-CONFINE-CANCELLO — lo stesso confine con la funzione del cancello e col cancello intero, nei due accessi: al tetto esatto nessuna carta, una copia sopra la carta (L e M)', async () => {
  const T = P.TETTO_DELL_ESPANSIONE;
  const n = 1024;
  const forma = (k) => `a=${'x'.repeat(n)}; b=${'$a'.repeat(k)}; rm -rf build`;
  for (const s of ['L', 'M']) {
    assert.equal(critiche.cancellazioneCritica(forma(1), mondo(s)), null);
    const m = P.espansi() / n;
    const k = Math.floor(T / (n * m));
    assert.equal(k * n * m, T, `${s}: il confine cade esatto sul tetto (${k} copie da ${n}, ${m} letture)`);
    assert.equal(critiche.cancellazioneCritica(forma(k), mondo(s)), null, `${s}: al tetto esatto`);
    assert.deepEqual(critiche.cancellazioneCritica(forma(k + 1), mondo(s)), COMPLESSO, `${s}: una copia sopra`);
    for (const livello of LIVELLI) {
      assert.deepEqual((await cancello(s, forma(k), livello)).perche, [], `${s} ${livello}: al tetto esatto`);
      assert.deepEqual((await cancello(s, forma(k + 1), livello)).perche, ['troppo-complesso'], `${s} ${livello}: una copia sopra`);
    }
  }
});

test('TETTO-ESPANSIONE-COMANDO —il tetto vale per il comando intero: due assegnazioni sotto il tetto ciascuna, insieme sopra, chiedono (L)', () => {
  const T = P.TETTO_DELL_ESPANSIONE;
  const n = 1024;
  const k = Math.floor(T / n / 2) + 1; // ognuna poco più di metà tetto
  const una = `a=${'x'.repeat(n)}; b=${'$a'.repeat(k)}; rm -rf build`;
  assert.equal(P.letturaNuova(una, mondo('L')), null);
  const due = `a=${'x'.repeat(n)}; b=${'$a'.repeat(k)}; c=${'$a'.repeat(k)}; rm -rf build`;
  assert.deepEqual(P.letturaNuova(due, mondo('L')), COMPLESSO);
});

test('TETTO-ESPANSIONE-FOR-E-CMD — contano anche i pezzi di cmd (`%X:a=…%`) e i valori del `for` ripetuti nel bersaglio: oltre il tetto la carta', { skip: SALTA_W }, () => {
  const T = P.TETTO_DELL_ESPANSIONE;
  const n = 1024;
  const k = Math.floor(T / n) + 1;
  /* cmd: ogni «a» del valore diventa 1.024 caratteri */
  assert.deepEqual(P.letturaNuova(`set a=${'a'.repeat(k)} & rd /s /q "%a:a=${'x'.repeat(n)}%"`, mondo('W')), COMPLESSO);
  /* bash: il valore del `for` ripetuto nel bersaglio */
  assert.deepEqual(P.letturaNuova(`v=${'x'.repeat(n)}; for d in "$v" "$v"; do rm -rf ${'$d'.repeat(Math.ceil(k / 2))}; done`, mondo('L')), COMPLESSO);
});

test('TETTO-ESPANSIONE-PRIMA-DI-COSTRUIRE — la forma corta si ferma PRIMA di costruire il valore che passa il tetto: contati al più il tetto più un valore (W L A M)', () => {
  /* il valore più lungo che la forma corta mette in una stringa sotto il tetto è `e` (8 × 24^4 = 2.654.208 caratteri); `f` (63.700.992)
     non si costruisce mai. Contare DOPO la sostituzione costruirebbe `f` e conterebbe più di 60 milioni di caratteri. */
  const T = P.TETTO_DELL_ESPANSIONE;
  for (const s of SISTEMI) {
    assert.deepEqual(P.letturaNuova(CORTA(s), mondo(s)), COMPLESSO, s);
    assert.ok(P.espansi() > T && P.espansi() <= T + 8 * 24 ** 4, `${s}: contati ${P.espansi()}`);
  }
});

test('TETTO-ESPANSIONE-PRIMA-DI-COSTRUIRE-GRAFFE — lo stesso con le graffe (`${a}`) e con la funzione del cancello: contati al più il tetto più un valore, la carta «troppo complesso» (L A M)', () => {
  const T = P.TETTO_DELL_ESPANSIONE;
  const p = ['a=xxxxxxxx']; for (let i = 1; i <= 5; i += 1) p.push(`${NOMI[i]}=${`\${${NOMI[i - 1]}}`.repeat(24)}`);
  const graffe = `${p.join('; ')}; rm -rf "\${f}"/x`;
  for (const s of POSIX) {
    assert.deepEqual(critiche.cancellazioneCritica(graffe, mondo(s)), COMPLESSO, s);
    assert.ok(P.espansi() > T && P.espansi() <= T + 8 * 24 ** 4, `${s}: contati ${P.espansi()}`);
  }
});

/* i valori del `for` ripetuti nel bersaglio e i pezzi `%X:a=…%` di cmd: un mutante che non li conta resta vivo con una prova sola */
const FOR_LUNGO = () => { const n = 1024; const k = Math.floor(P.TETTO_DELL_ESPANSIONE / n) + 1; return `v=${'x'.repeat(n)}; for d in "$v" "$v"; do rm -rf ${'$d'.repeat(Math.ceil(k / 2))}; done`; };
const CMD_LUNGO = () => { const n = 1024; const k = Math.floor(P.TETTO_DELL_ESPANSIONE / n) + 1; return `set a=${'a'.repeat(k)} & rd /s /q "%a:a=${'x'.repeat(n)}%"`; };

test('TETTO-ESPANSIONE-FOR-POSIX — i valori del `for` messi nel bersaglio contano: oltre il tetto «troppo complesso» (L A M)', () => {
  for (const s of POSIX) assert.deepEqual(P.letturaNuova(FOR_LUNGO(), mondo(s)), COMPLESSO, s);
});

test('TETTO-ESPANSIONE-FOR-CANCELLO — la stessa forma col cancello intero, nei due accessi: la carta (L e M)', async () => {
  for (const s of ['L', 'M']) for (const livello of LIVELLI) assert.deepEqual((await cancello(s, FOR_LUNGO(), livello)).perche, ['troppo-complesso'], `${s} ${livello}`);
});

test('TETTO-ESPANSIONE-CMD-CANCELLO — `%a:a=…%` di cmd che moltiplica il valore, col cancello intero, nei due accessi: la carta (W)', { skip: SALTA_W }, async () => {
  assert.deepEqual(P.letturaNuova(CMD_LUNGO(), mondo('W')), COMPLESSO);
  for (const livello of LIVELLI) assert.deepEqual((await cancello('W', CMD_LUNGO(), livello)).perche, ['troppo-complesso'], livello);
});

/* ───────────── la copia ferma: le regole della 0.2.1 che il revisore ha visto senza prove ───────────── */

const ferma = (c, o) => P.della021(c, o);

test('FERMA-R4 — un valore NON stringa nell ambiente resta ignoto nella copia ferma, come nella 0.2.1 (un elenco, un oggetto) (L A M)', () => {
  for (const s of POSIX) for (const valore of [[SIS[s].home], { toString: () => SIS[s].home }]) {
    const o = mondo(s, { DATI: valore });
    assert.equal(della021.cancellazioneCritica('rm -rf "$DATI"', o), null, `${s} la 0.2.1`);
    assert.equal(ferma('rm -rf "$DATI"', o), null, `${s} la copia ferma`);
  }
});

test('FERMA-R4-CANCELLO — lo stesso con la funzione del cancello (nuova + ferma), W L A M: nessuna carta falsa da un valore non stringa', () => {
  for (const s of SISTEMI) for (const valore of [[SIS[s].home], { toString: () => SIS[s].home }]) {
    const c = s === 'W' ? 'rd /s /q %DATI%' : 'rm -rf "$DATI"';
    assert.equal(critiche.cancellazioneCritica(c, mondo(s, { DATI: valore })), null, `${s} ${typeof valore}`);
  }
});

test('FERMA-R6 — le cartelle dei progetti con spazi intorno si leggono tagliate nella copia ferma, come nella 0.2.1 (L e M)', () => {
  for (const s of ['L', 'M']) {
    const o = mondo(s, { TALOS_HARNESS_UI_PROJECT_DIRS: `  ${SIS[s].fuori}  ; /srv/altro ` });
    assert.equal(della021.cancellazioneCritica(`rm -rf ${SIS[s].fuori}`, o)?.perche, 'progetto', `${s} la 0.2.1`);
    assert.equal(ferma(`rm -rf ${SIS[s].fuori}`, o)?.perche, 'progetto', `${s} la copia ferma`);
  }
});

test('FERMA-R6-TELEFONO — sul telefono la cartella dei progetti con uno spazio in coda è «tutti i progetti» nella copia ferma, come nella 0.2.1', () => {
  const o = mondo('A', { TALOS_HARNESS_UI_PROJECT_DIRS: `${SIS.A.home}/codice/workspace ` });
  assert.equal(della021.cancellazioneCritica(`rm -rf ${SIS.A.home}/codice/workspace`, o)?.perche, 'tutti-i-progetti', 'la 0.2.1');
  assert.equal(ferma(`rm -rf ${SIS.A.home}/codice/workspace`, o)?.perche, 'tutti-i-progetti', 'la copia ferma');
});

test('FERMA-R7 — col `process.env` vero la copia ferma non tiene l ambiente fra due chiamate: la variabile messa, poi tolta, conta (L)', () => {
  const nome = 'TALOS_PROVA_DECIMO_R7';
  const o = { ...mondo('L'), ambiente: process.env };
  const c = `rm -rf "$${nome}"`;
  try {
    delete process.env[nome];
    assert.equal(ferma(c, o), null, 'senza la variabile');
    process.env[nome] = SIS.L.home;
    assert.equal(ferma(c, o)?.perche, 'casa', 'con la variabile');
    delete process.env[nome];
    assert.equal(ferma(c, o), null, 'tolta di nuovo');
  } finally { delete process.env[nome]; }
});

test('FERMA-R7-PROGETTI — col `process.env` vero le cartelle dei progetti cambiate fra due chiamate contano nella copia ferma (M)', () => {
  const o = { ...mondo('M'), ambiente: process.env };
  const prima = process.env.TALOS_HARNESS_UI_PROJECT_DIRS;
  try {
    process.env.TALOS_HARNESS_UI_PROJECT_DIRS = SIS.M.fuori;
    assert.equal(ferma(`rm -rf ${SIS.M.fuori}`, o)?.perche, 'progetto');
    process.env.TALOS_HARNESS_UI_PROJECT_DIRS = '/srv/altro';
    assert.equal(ferma(`rm -rf ${SIS.M.fuori}`, o), null);
  } finally { if (prima === undefined) delete process.env.TALOS_HARNESS_UI_PROJECT_DIRS; else process.env.TALOS_HARNESS_UI_PROJECT_DIRS = prima; }
});

const molte = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`VOCE_${i}`, `/srv/voce${i}`]));

test('FERMA-R11 — la copia ferma legge TUTTE le voci dell ambiente: la variabile dopo 150 voci si trova, come nella 0.2.1 (L A M)', () => {
  for (const s of POSIX) {
    const o = mondo(s, { ...molte(150), DATI: SIS[s].home });
    assert.equal(della021.cancellazioneCritica('rm -rf "$DATI"', o)?.perche, ferma('rm -rf "$DATI"', o)?.perche, `${s} come la 0.2.1`);
    assert.ok(ferma('rm -rf "$DATI"', o), `${s} la carta`);
  }
});

test('FERMA-R11-PROGETTI — le cartelle dei progetti dopo 100 voci dell ambiente si leggono nella copia ferma, come nella 0.2.1 (L e M)', () => {
  for (const s of ['L', 'M']) {
    const o = mondo(s, { ...molte(100), TALOS_HARNESS_UI_PROJECT_DIRS: SIS[s].fuori });
    assert.equal(della021.cancellazioneCritica(`rm -rf ${SIS[s].fuori}`, o)?.perche, 'progetto', `${s} la 0.2.1`);
    assert.equal(ferma(`rm -rf ${SIS[s].fuori}`, o)?.perche, 'progetto', `${s} la copia ferma`);
  }
});
