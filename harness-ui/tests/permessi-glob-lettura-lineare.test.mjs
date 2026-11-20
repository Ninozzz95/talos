/*
 * Dodicesimo giro della riparazione dei permessi (15/11/2026, owner 13:44 «A con le maiuscole su macOS», giudice v1948-v1949) — IL
 * MODELLO DI UN NOME SI LEGGE UNA VOLTA, IN TEMPO LINEARE, E LA LETTURA ENTRA NEL CONTO. Il revisore dell undicesimo giro (ROSSO,
 * 15/11 13:33) ha visto `a=[[[…` (500 `[`) e `rm -rf ../$a$a…` (64 volte, 642 caratteri, cartella di 19 lettere) tenere il cancello
 * 11,8-12,4 s contro 27-29 ms della 0.2.1: ogni `[` senza chiusura riscorreva il glob fino in fondo, il glob si rileggeva a ogni
 * confronto, e quel lavoro restava fuori dal conto (`conto.glob` = 1).
 *  - PARENTESI-TEMPO-*: le forme del revisore (642 e 578 caratteri) al cancello intero sotto i 50 ms; la lettura sola dei glob di `[`
 *    fino a 4 KiB sotto i 10 ms (solo con la CPU sotto il 50 %).
 *  - PARENTESI-CONTO-*: i passi della lettura, contati, crescono come la lunghezza (raddoppio ⇒ al massimo ×2,2) e non sono mai meno
 *    della lunghezza; il confronto resta sotto (n+1)·(m+1).
 *  - MODELLO-UNA-VOLTA-*: lo stesso glob nello stesso comando si legge una volta sola.
 *  - TETTO-GLOB-*: oltre il tetto del glob la lettura chiede (`troppo-complesso`), mai «nome diverso» e mai null.
 *  - LETTURA-UGUALE-*: le risposte del modello restano quelle di prima, anche quando una `[` senza chiusura ne precede un'altra.
 *  - MAC-MAIUSCOLE-*: su macOS (APFS, di serie senza maiuscole) `rm -rf /Users/TIZIO` è la casa, come su Windows; su Linux no.
 *  - FORFILES-MASCHERA-*, ESTESI-NON-CHIUSI-CMD-*, STELLE-FUSE-*, ALPHA-UNICODE-*, LETTERE-W-*: le seconde prove dei mutanti del
 *    revisore (N08, N12, N01, N06, N10).
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono; la carta risponde «no». Nessuna cancellazione.
 * Fonti (riaperte il 15/11/2026): il manuale di bash, «Pattern Matching» (gnu.org); Hermes `tools/approval_detection.py:700-712`
 * (il lavoro del lettore si limita prima di leggere, oltre il tetto chiude verso l approvazione) e `:1550`; Codex
 * `codex-rs/shell-command/src/bash.rs:272`; Claude Code `CHANGELOG.md:3243` e `:4919`; pi `core/package-manager.ts:680`.
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
const NOME19 = 'AVM-harness-desktop';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio' },
};
const CARTELLA19 = { W: `${D}:${BS}w${BS}${NOME19}`, L: `/home/tizio/projects/${NOME19}`, A: `/storage/emulated/0/Documents/${NOME19}`, M: `/Users/tizio/projects/${NOME19}` };
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

/** Il cancello intero su un sistema, nel processo principale (`process.platform` finto fuori da Windows): carte, esito, millisecondi. */
async function cancello(s, comando, livelloAccesso = 'accesso-pieno', cartella = SIS[s].cartella) {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  let esito = null;
  const t0 = performance.now();
  try {
    esito = await verificaPermessoScrittura({ toolCallId: 't12', tipo: 'shell', comando }, { livelloAccesso, cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  const ms = performance.now() - t0;
  const carte = chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica);
  return { consentito: esito?.consentito ?? null, perche: carte.map((c) => c.perche), ms };
}

/* ───────────── le parentesi quadre aperte: il tempo ───────────── */

/** La forma del revisore: 500 `[` in una variabile, poi `rm -rf ../` con la variabile k volte (64 ⇒ 642 caratteri, 32 ⇒ 578). */
const espansa = (k) => `a=${'['.repeat(500)}; rm -rf ../${'$a'.repeat(k)}`;

test('PARENTESI-TEMPO-CANCELLO — le forme del revisore da 642 e 578 caratteri, al cancello intero, sotto i 50 ms e senza carta (come la 0.2.1)', { timeout: 300000 }, async () => {
  /* a caldo: la prima chiamata del processo compila le funzioni (la misura a freddo, a processo fresco, sta nel banco del rapporto) */
  /* 0.2.4 B3: «Scrive nel progetto» ha una strada sua (il lettore delle scritture fuori), che si scalda anche lei */
  for (const livello of LIVELLI) await cancello('L', espansa(64), livello, CARTELLA19.L);
  for (const k of [64, 32]) {
    const c = espansa(k);
    assert.equal(c.length, k === 64 ? 642 : 578);
    for (const livello of LIVELLI) {
      const r = await cancello('L', c, livello, CARTELLA19.L);
      assert.deepEqual(r.perche, [], `k=${k} ${livello}: ${JSON.stringify(r.perche)}`);
      if (!SOTTO_CARICO) assert.ok(r.ms < 50 * MOLTIPLICATORE_CI, `[ceiling ${50 * MOLTIPLICATORE_CI} ms] k=${k} ${livello} [${c.length} car]: ${r.ms.toFixed(1)} ms (CPU ${campioni.join('/')}%)`);
    }
  }
});

test('PARENTESI-TEMPO-LETTURA — la lettura sola dei glob di `[` (e `[a`, `[a-b`, `[*`, `[!`), ogni 61 caratteri fino a 4 KiB: sotto i 10 ms', { skip: SOTTO_CARICO, timeout: 300000 }, () => {
  const forme = [(n) => '['.repeat(n), (n) => '[a'.repeat(n / 2), (n) => '[a-b'.repeat(n / 4), (n) => '[*'.repeat(n / 2), (n) => '[!'.repeat(n / 2)];
  for (const s of ['L', 'M', 'A']) {
    P.letturaNuova('rm -rf ../[[[', mondo19(s)); // scalda
    for (const f of forme) {
      for (let n = 4; n <= 4096 - 10; n += 61) {
        const c = `rm -rf ../${f(n)}`;
        const t0 = performance.now();
        const r = P.letturaNuova(c, mondo19(s));
        const ms = performance.now() - t0;
        assert.equal(r, null, `${s} [${c.length} car «${c.slice(10, 22)}…»]: ${JSON.stringify(r)}`);
        assert.ok(ms < 10 * MOLTIPLICATORE_CI, `[ceiling ${10 * MOLTIPLICATORE_CI} ms] ${s} [${c.length} car «${c.slice(10, 22)}…»]: ${ms.toFixed(1)} ms (CPU ${campioni.join('/')}%)`);
      }
    }
  }
});

/* ───────────── il conto ───────────── */

/** I passi di UNA lettura del glob contro un nome (il confronto, con la prima lettera che non prende, costa un passo). */
const passiDellaLettura = (glob, nome = NOME19) => { const conto = { glob: 0 }; try { P.globPrende(glob, nome, false, conto); } catch { /* chiede: i passi contati restano */ } return conto.glob; };

test('PARENTESI-CONTO-LETTURA — i passi della lettura crescono come la lunghezza (raddoppio ⇒ al massimo ×2,2) e non sono mai meno della lunghezza', () => {
  assert.equal(typeof P.globPrende, 'function');
  const forme = { quadre: (n) => '['.repeat(n), 'quadra-a': (n) => '[a'.repeat(n / 2), 'quadra-trattino': (n) => '[a-b'.repeat(n / 4), 'quadre-stella': (n) => '[*'.repeat(n / 2), 'quadra-nega': (n) => '[!'.repeat(n / 2), 'quadra-chiusa-in-fondo': (n) => `${'['.repeat(n - 1)}]` };
  for (const [nome, f] of Object.entries(forme)) {
    let prima = null;
    for (const n of [1000, 2000, 4000, 8000, 16000]) {
      const passi = passiDellaLettura(f(n));
      assert.ok(passi >= n, `${nome} n=${n}: ${passi} passi, la lettura è fuori dal conto`);
      if (prima !== null) assert.ok(passi <= 2.2 * prima, `${nome} n=${n}: ${passi} passi contro ${prima} con la metà (×${(passi / prima).toFixed(2)})`);
      prima = passi;
    }
  }
});

test('PARENTESI-CONTO-COMANDO — il comando della forma del revisore: i passi del glob contati crescono come le ripetizioni', () => {
  const passi = {};
  for (const k of [8, 16, 32, 64]) {
    assert.equal(P.letturaNuova(espansa(k), mondo19('L')), null, `k=${k}`);
    passi[k] = P.globPassi();
    assert.ok(passi[k] >= 500 * k, `k=${k}: ${passi[k]} passi, la lettura del glob di ${500 * k} caratteri è fuori dal conto`);
  }
  for (const k of [16, 32, 64]) assert.ok(passi[k] <= 2.2 * passi[k / 2], `k=${k}: ${passi[k]} passi contro ${passi[k / 2]} (×${(passi[k] / passi[k / 2]).toFixed(2)})`);
});

test('PARENTESI-CONTO-CONFRONTO — il confronto, a modello già letto, resta sotto (n+1)·(m+1) anche coi glob di `[` aperte', () => {
  const nomi = ['a', 'progetto', NOME19, 'x'.repeat(255), '['.repeat(40), '[a'.repeat(30)];
  const globi = ['['.repeat(50), '[a'.repeat(40), `${'['.repeat(30)}*`, `*${'['.repeat(30)}`, `${'*['.repeat(30)}*`, '[*'.repeat(40), `[${'*a'.repeat(30)}`, `${'[!'.repeat(20)}]`];
  for (const glob of globi) {
    for (const nome of nomi) {
      const conto = { glob: 0 };
      P.globPrende(glob, nome, false, conto);
      const letto = conto.glob;
      P.globPrende(glob, nome, false, conto);
      const confronto = conto.glob - letto;
      const n = [...nome].length;
      const m = [...glob].length;
      assert.ok(confronto <= (n + 1) * (m + 1), `«${glob.slice(0, 12)}…» contro «${nome.slice(0, 12)}…»: ${confronto} passi > ${(n + 1) * (m + 1)}`);
    }
  }
});

/* ───────────── il modello si legge una volta ───────────── */

test('MODELLO-UNA-VOLTA-CONFRONTO — lo stesso glob confrontato due volte nello stesso conto si legge una volta sola', () => {
  for (const n of [1000, 8000]) {
    const glob = '['.repeat(n);
    const conto = { glob: 0 };
    P.globPrende(glob, NOME19, false, conto);
    const una = conto.glob;
    for (let k = 0; k < 10; k += 1) P.globPrende(glob, `${NOME19}${k}`, false, conto);
    /* tredicesimo giro: un nome nuovo conta anche i suoi caratteri, una volta per comando (`caratteriDel`) */
    assert.ok(conto.glob - una <= 10 * (NOME19.length + 1 + 2), `n=${n}: dieci confronti in più costano ${conto.glob - una} passi (la lettura sola ${una})`);
  }
});

test('MODELLO-UNA-VOLTA-COMANDO — nel cancello lo stesso glob (cartella e cartella vera, ogni lettura del comando) si legge una volta', () => {
  for (const n of [2000, 8000]) {
    const glob = '['.repeat(n);
    const sola = passiDellaLettura(glob);
    assert.equal(P.letturaNuova(`rm -rf ../${glob}`, mondo19('L')), null);
    assert.ok(P.globPassi() <= sola + 50, `n=${n}: il comando conta ${P.globPassi()} passi, la lettura sola ${sola}: il glob si rilegge`);
    assert.equal(P.letturaNuova(`rm -rf ../${glob}; rm -rf ../${glob}`, mondo19('L')), null);
    assert.ok(P.globPassi() <= sola + 100, `n=${n} due volte: ${P.globPassi()} passi, la lettura sola ${sola}`);
  }
});

/* ───────────── il tetto del glob ───────────── */

test('TETTO-GLOB-COMANDO — un glob oltre il tetto del lavoro del glob chiede (`troppo-complesso`), mai «nome diverso» né null', { timeout: 120000 }, () => {
  assert.equal(typeof P.TETTO_DEL_GLOB, 'number', 'il tetto del glob si legge dalle prove');
  const ripetizioni = Math.ceil((P.TETTO_DEL_GLOB + 1) / 10000);
  for (const s of ['L', 'M', 'A']) {
    const c = `a=${'['.repeat(10000)}; rm -rf ../${'$a'.repeat(ripetizioni)}`;
    assert.deepEqual(P.letturaNuova(c, mondo19(s)), COMPLESSO, `${s}: ${ripetizioni} ripetizioni`);
    /* sotto il tetto la stessa forma tace, come la 0.2.1 */
    assert.equal(P.letturaNuova(`a=${'['.repeat(10000)}; rm -rf ../$a$a`, mondo19(s)), null, `${s}: due ripetizioni`);
  }
});

test('TETTO-GLOB-CONFRONTO — il confronto da solo: oltre il tetto, contato prima di leggere e durante il confronto, lancia `GLOB_ILLEGGIBILE`', () => {
  assert.equal(typeof P.TETTO_DEL_GLOB, 'number');
  const illeggibile = (e) => e?.trabocco === 'glob';
  /* prima di leggere: un glob più lungo di quello che resta */
  assert.throws(() => P.globPrende('['.repeat(200), NOME19, false, { glob: P.TETTO_DEL_GLOB - 100 }), illeggibile);
  /* durante il confronto: il caso peggiore dei due puntatori, col tetto quasi pieno */
  assert.throws(() => P.globPrende(`${'*a'.repeat(100)}*b`, 'a'.repeat(255), false, { glob: P.TETTO_DEL_GLOB - 250 }), illeggibile);
  /* durante la lettura: un modello lungo quanto resta, ma che costa tre passi per carattere */
  const quasiPieno = { glob: P.TETTO_DEL_GLOB - 1500 };
  assert.throws(() => P.globPrende('['.repeat(1000), NOME19, false, quasiPieno), illeggibile);
  assert.ok(quasiPieno.glob <= P.TETTO_DEL_GLOB + 1, `${quasiPieno.glob - P.TETTO_DEL_GLOB} passi oltre il tetto: la lettura non si è fermata`);
  /* lontano dal tetto la risposta è quella di sempre */
  assert.equal(P.globPrende(`${'*a'.repeat(100)}*b`, 'a'.repeat(255), false, { glob: 0 }), false);
  assert.equal(P.globPrende('['.repeat(200), NOME19, false, { glob: 0 }), false);
});

test('TETTO-GLOB-DURANTE-LA-LETTURA — un modello più corto del tetto ma che costa più passi del tetto si ferma mentre si legge e chiede', { timeout: 120000 }, () => {
  /* 10 ripetizioni di 10.000 `[`: 100.000 caratteri (sotto il tetto), circa 300.000 passi di lettura (sopra) */
  assert.ok(100000 < P.TETTO_DEL_GLOB && 3 * 100000 > P.TETTO_DEL_GLOB, 'la forma sta fra la lunghezza e i passi');
  for (const s of ['L', 'M', 'A']) {
    assert.deepEqual(P.letturaNuova(`a=${'['.repeat(10000)}; rm -rf ../${'$a'.repeat(10)}`, mondo19(s)), COMPLESSO, s);
    assert.ok(P.globPassi() <= P.TETTO_DEL_GLOB + 1, `${s}: ${P.globPassi()} passi, la lettura non si è fermata al tetto`);
  }
});

test('TETTO-GLOB-CONFRONTI-RIPETUTI — tanti confronti dello stesso modello nello stesso conto arrivano al tetto e chiedono, mai «nome diverso»', () => {
  const conto = { glob: 0 };
  const glob = `*${'a'.repeat(127)}b`;
  const nome = 'a'.repeat(255);
  let chiesto = false;
  for (let k = 0; k < 200 && !chiesto; k += 1) {
    try { assert.equal(P.globPrende(glob, nome, false, conto), false); } catch (e) { if (e?.trabocco !== 'glob') throw e; chiesto = true; }
  }
  assert.ok(chiesto, `200 confronti da ~16.000 passi non sono mai arrivati al tetto (${conto.glob} passi)`);
  assert.ok(conto.glob <= P.TETTO_DEL_GLOB + 1, `${conto.glob} passi contati oltre il tetto`);
});

/* ───────────── le risposte non cambiano ───────────── */

test('LETTURA-UGUALE — le risposte del modello sono quelle di prima, anche con `[` senza chiusura prima di un altra', () => {
  const illeggibile = (glob, nome) => assert.throws(() => P.globPrende(glob, nome, false), (e) => e?.trabocco === 'glob', `«${glob}» deve chiedere`);
  /* una `[` aperta, poi una lettura diversa dalla `[` dopo: l intervallo rovesciato si vede solo dalla seconda */
  illeggibile('[[!-z-a', '[[!-z-a');
  illeggibile('[[z-a', 'x');
  illeggibile('[x[[:alpha:]', 'x');
  illeggibile(`[a[${BS}`, 'a');
  /* parentesi aperte che restano lettere */
  for (const [glob, nome, atteso] of [['[', '[', true], ['[[', '[[', true], ['[a', '[a', true], ['a[', 'a[', true], ['[!', '[!', true], ['[*', '[xyz', true], ['[*', 'xyz', false],
    ['[[a]', '[', true], ['[[a]', 'a', true], ['[[a]', '[a', false],[`${'['.repeat(30)}x`, `${'['.repeat(30)}x`, true], [`${'['.repeat(30)}]`, '[', true],
    [`${'['.repeat(30)}]`, '[[', false], ['[]', '[]', true], ['[!]', '[!]', true], ['[]a', '[]a', true], ['[a]b[', 'ab[', true], ['[!a][', 'b[', true],
    ['[a-b-a', '[a-b-a', true], ['[[-a', '[[-a', true]]) {
    assert.equal(P.globPrende(glob, nome, false), atteso, `«${glob}» contro «${nome}»`);
  }
});

/* ───────────── macOS senza maiuscole ───────────── */

for (const [nome, comando, perche] of [['casa-maiuscole', 'rm -rf /Users/TIZIO', 'casa'], ['casa-minuscole', 'rm -rf /users/tizio', 'casa'], ['progetto', 'rm -rf ../PROGETTO', 'progetto'],
  ['glob-lettere', 'rm -rf ../PRO*O', 'progetto'], ['glob-classe', 'rm -rf /Users/[[:upper:]]izio', 'casa'], ['glob-insieme', 'rm -rf /Users/[T]izio', 'casa']]) {
  test(`MAC-MAIUSCOLE-${nome} — su macOS (APFS senza maiuscole) «${comando}» nomina un posto critico, nei due accessi`, async () => {
    assert.equal(P.letturaNuova(comando, mondo('M'))?.perche, perche, `M lettura nuova «${comando}»`);
    for (const livello of LIVELLI) {
      const r = await cancello('M', comando, livello);
      assert.deepEqual(r.perche, [perche], `M ${livello} «${comando}»`);
      assert.equal(r.consentito, false);
    }
  });
}

test('MAC-MAIUSCOLE-GUARDIE — su Linux le maiuscole contano ancora; su macOS un nome davvero diverso resta diverso', async () => {
  for (const c of ['rm -rf /home/TIZIO', 'rm -rf ../PROGETTO', 'rm -rf /home/[T]izio', 'rm -rf ../PRO*O']) assert.equal(P.letturaNuova(c, mondo('L')), null, `L «${c}»`);
  for (const c of ['rm -rf /Users/TIZIA', 'rm -rf ../PROGETTI', 'rm -rf /Users/[!tT]izio', 'rm -rf ../PRO*X']) assert.equal(P.letturaNuova(c, mondo('M')), null, `M «${c}»`);
  /* Revisore del tredicesimo giro (17/11/2026): il negato della sola minuscola non esclude la casa su un disco che non bada alle
     maiuscole (la shell bada alle maiuscole, la cartella può stare sul disco come `Tizio`): carta. Su Linux resta un nome diverso. */
  assert.equal(P.letturaNuova('rm -rf /Users/[!t]izio', mondo('M'))?.perche, 'casa', 'M «[!t]izio»');
  assert.equal(P.letturaNuova('rm -rf /home/[!t]izio', mondo('L')), null, 'L «[!t]izio»');
  assert.deepEqual((await cancello('L', 'rm -rf /home/TIZIO')).perche, [], 'L cancello');
});

/* ───────────── le seconde prove dei mutanti del revisore ───────────── */

test('FORFILES-MASCHERA-ROVESCIO — una maschera di forfiles col nome rovesciato (`[z-a]*`) sopra la casa chiede, mai «nome diverso» (N08)', { skip: SALTA_W }, () => {
  const c = `forfiles /p ${D}:${BS}Users /m [z-a]* /c "cmd /c rd /s /q @path"`;
  assert.deepEqual(P.letturaNuova(c, mondo('W')), COMPLESSO, c);
});

test('FORFILES-MASCHERA-CLASSE — una maschera di forfiles con una classe sconosciuta sopra la casa chiede (N08)', { skip: SALTA_W }, () => {
  for (const m of ['t[[:foo:]]*', '[[=t=]]izio', `t${BS}*`]) {
    const c = `forfiles /p ${D}:${BS}Users /s /m ${m} /c "cmd /c rd /s /q @path"`;
    assert.deepEqual(P.letturaNuova(c, mondo('W')), COMPLESSO, c);
  }
});

test('ESTESI-NON-CHIUSI-CMD — per cmd una `(` non chiusa dopo `x*` è una lettera: la cancellazione dopo `&` si legge ancora (N12)', { skip: SALTA_W }, () => {
  for (const c of ['echo x*( & rd /s /q %USERPROFILE%', `echo x*( & rd /s /q ..${BS}..${BS}Users${BS}tizio`, 'echo a@( & rd /s /q %USERPROFILE%']) {
    assert.equal(P.letturaNuova(c, mondo('W'))?.perche, 'casa', c);
  }
});

test('ESTESI-NON-CHIUSI-CMD-ANNIDATO — lo stesso dentro `cmd /c "…"`: la cancellazione dopo la `(` non chiusa si legge (N12)', { skip: SALTA_W }, () => {
  for (const c of [`cmd /c "echo x*( & rd /s /q ..${BS}..${BS}Users${BS}tizio"`, 'cmd /c "echo y?( & rd /s /q %USERPROFILE%"']) {
    assert.equal(P.letturaNuova(c, mondo('W'))?.perche, 'casa', c);
  }
});

test('STELLE-FUSE-CONFRONTO — le stelle in fila sono una stella sola: il confronto non costa di più con 4.000 stelle che con una (N01)', () => {
  const confronto = (glob, nome) => { const conto = { glob: 0 }; P.globPrende(glob, nome, false, conto); const letto = conto.glob; P.globPrende(glob, nome, false, conto); return conto.glob - letto; };
  for (const nome of [NOME19, 'progetto']) {
    const una = confronto('*Z', nome);
    assert.equal(confronto(`${'*'.repeat(4000)}Z`, nome), una, `«*…Z» contro «${nome}»`);
  }
});

test('STELLE-FUSE-MEZZO — anche in mezzo al glob: `A****-****p` costa quanto `A*-*p` (N01)', () => {
  const confronto = (glob, nome) => { const conto = { glob: 0 }; assert.equal(P.globPrende(glob, nome, false, conto), true); const letto = conto.glob; P.globPrende(glob, nome, false, conto); return conto.glob - letto; };
  assert.equal(confronto(`A${'*'.repeat(500)}-${'*'.repeat(500)}p`, NOME19), confronto('A*-*p', NOME19));
});

test('ALPHA-UNICODE — `[[:alpha:]]` prende le lettere di ogni alfabeto e le maiuscole, anche al cancello (N06)', async () => {
  for (const x of ['É', 'ü', 'Ж', 'Q', 'ß']) assert.equal(P.globPrende('[[:alpha:]]', x, false), true, x);
  const casa = '/home/élodie';
  const r = P.letturaNuova('rm -rf /home/[[:alpha:]]lodie', mondo('L', { home: casa, ambiente: { HOME: casa } }));
  assert.equal(r?.perche, 'casa');
});

test('LETTERE-W — su Windows le lettere del glob non badano alle maiuscole, al cancello (N10)', { skip: SALTA_W }, async () => {
  for (const c of [`rd /s /q ..${BS}PRO*O`, `Remove-Item -Recurse ..${BS}PROG?TTO`]) {
    assert.equal(P.letturaNuova(c, mondo('W'))?.perche, 'progetto', c);
    for (const livello of LIVELLI) assert.deepEqual((await cancello('W', c, livello)).perche, ['progetto'], `${livello} ${c}`);
  }
});
