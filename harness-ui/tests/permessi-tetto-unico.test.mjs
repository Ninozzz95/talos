/*
 * Settimo giro della riparazione dei permessi (13/11/2026, owner SÌ al giro breve, giudice v1823-v1824) — UN TETTO UNICO DI LETTURE PER
 * COMANDO. Il sesto giro leggeva ogni `cd` che può non restare nei due casi, con un tetto di 256 letture PER LIVELLO: i casi dentro i casi
 * si moltiplicavano. Un comando onesto annidato 8+8 (otto `(cd x && npm i)` e dentro un `bash -c` altri otto) costava 2,8-3,8 s; 8+8+8 più
 * di 100 s. Il cancello è sincrono: il server di TALOS restava fermo. Il difetto nasce a f383ee79b (revisore del sesto giro, GIALLO 1).
 *  - TETTO-*: i casi dentro i casi del revisore col cancello intero, in un worker col cronometro e un tetto esterno (se il cancello non
 *    risponde il worker si termina: la prova è rossa e niente resta appeso). Oltre il tetto: la carta `troppo-annidato` (il prezzo scelto
 *    dall'owner, v1824), mai il calcolo fino in fondo, mai un errore.
 *  - OTTO-*, NOVE-*: ciò che il CHANGELOG promette resta vero: otto `cd` che possono non restare, anche dentro `bash -c`, nessuna carta;
 *    nove, la carta.
 *  - QUARTA-*: la quarta carta nuova rispetto alla 0.2.1 (GIALLO 2), voluta e detta nel CHANGELOG: `bash -c "X=/k/dati/out; echo
 *    \${x/a/&}; rm -rf \"\$X\"/*"` su Windows chiede `primo-livello` su `\\k\dati\out`, come la 0.2.1 chiedeva già per la sorella scritta.
 *  - N12-*, N15-*: le carte NUOVE della cura del sesto giro (che la 0.2.1 non dava) difese, non solo quelle della 0.2.1 (GIALLO 3: i due
 *    mutanti vivi del revisore, virgolette doppie ignorate e lettura «come la riceve» solo con `\$`).
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono. Nessuna cancellazione; il bash vero non si prova.
 * Fonti (lette il 13/11/2026): Codex `codex-rs/shell-command/src/command_safety/is_dangerous_command.rs:35`
 * (`MAX_DANGEROUS_COMMAND_WRAPPER_DEPTH: usize = 8`) e `:55-57` (oltre il tetto il comando è pericoloso: carta, non calcolo); Hermes
 * `tools/approval_detection.py:230` (`rm -r` chiede sempre, costo lineare); nodejs.org/api/worker_threads.html (`worker.terminate()`
 * ferma il JavaScript del worker anche mentre gira).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
/* Time ceilings ×4 only under CI (shared runners); locally they stay as they were. Same rule as carta-argomenti-connettore-022-giro6. */
const MOLTIPLICATORE_CI = process.env.CI && process.env.CI !== 'false' ? 4 : 1;

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 2 ? 'serve Windows con due lettere di disco libere' : false;
const D = liberi[0] ?? 'Q';
const K = liberi[1] ?? 'K';
const k = K.toLowerCase();
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}lavori${BS}progetto`, home: `${D}:${BS}Users${BS}caio` },
  L: { piattaforma: 'linux', cartella: '/home/caio/lavori/progetto', home: '/home/caio' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/lavori/progetto', home: '/data/user/0/ai.talos.dev/files' },
  M: { piattaforma: 'darwin', cartella: '/Users/caio/lavori/progetto', home: '/Users/caio' },
};
const mondo = (s) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home }, realpathFn: (p) => p });
const LIMITE_MS = 1000; // nella prova, con le altre prove accese; la misura vera (sotto i 50 ms, CPU sotto il 50 %) sta nel rapporto
const TETTO_ESTERNO_MS = 20000;

const sub = (n, p) => Array.from({ length: n }, (_, i) => `(cd ${p}${i} && npm i)`).join('; ');
const CASI = {
  'L 8+8': ['L', `${sub(8, 'a')}; bash -c '${sub(8, 'b')}; rm -rf dist'`],
  'L 8+8+8': ['L', `${sub(8, 'a')}; bash -c '${sub(8, 'b')}; sh -c "${sub(8, 'c')}; rm -rf dist"'`],
  'W 8+8': ['W', `bash -c '${sub(8, 'a')}; bash -c "${sub(8, 'b')}; rm -rf dist"'`],
  'W 8+8+8': ['W', `bash -c '${sub(8, 'a')}; bash -c "${sub(8, 'b')}; sh -c ${BS}"${sub(8, 'c')}; rm -rf dist${BS}""'`],
};

/** Il cancello intero e la funzione, in un worker col cronometro; oltre il tetto esterno il worker si termina e torna `null`. */
async function colCronometro(s, comando, livelloAccesso = 'accesso-pieno') {
  const worker = new Worker(new URL('./aiuto/cancello-col-cronometro.mjs', import.meta.url));
  try {
    await new Promise((ok, ko) => { worker.once('message', ok); worker.once('error', ko); });
    return await new Promise((ok, ko) => {
      const tempo = setTimeout(() => ok(null), TETTO_ESTERNO_MS);
      worker.once('message', (r) => { clearTimeout(tempo); ok(r); });
      worker.once('error', (e) => { clearTimeout(tempo); ko(e); });
      worker.postMessage({ id: 1, sistema: SIS[s], comando, livelloAccesso });
    });
  } finally {
    await worker.terminate();
  }
}

for (const [nome, [s, comando]] of Object.entries(CASI)) {
  test(`TETTO-${nome.replace(' ', '-')} — il comando onesto annidato ${nome} del revisore: il cancello intero risponde in meno di ${LIMITE_MS} ms (non resta fermo) e chiede «troppo annidato» (il prezzo)`, { skip: s === 'W' ? SALTA_W : false, timeout: 60000 }, async () => {
    const r = await colCronometro(s, comando);
    assert.ok(r, `il cancello non ha risposto entro ${TETTO_ESTERNO_MS} ms: il server resterebbe fermo`);
    assert.equal(r.errore, null);
    assert.ok(r.msFunzione < LIMITE_MS * MOLTIPLICATORE_CI, `[ceiling ${LIMITE_MS * MOLTIPLICATORE_CI} ms] funzione ${r.msFunzione?.toFixed(1)} ms`);
    assert.ok(r.ms < LIMITE_MS * MOLTIPLICATORE_CI, `[ceiling ${LIMITE_MS * MOLTIPLICATORE_CI} ms] cancello intero ${r.ms?.toFixed(1)} ms`);
    assert.equal(r.perche, 'troppo-annidato', 'oltre il tetto la carta, mai il calcolo fino in fondo');
    assert.deepEqual(r.critiche, ['troppo-annidato'], 'il cancello intero chiede una volta, con quel motivo');
  });
}

test('TETTO-SCRIVE-NEL-PROGETTO — anche in «Scrive nel progetto» l 8+8 risponde presto e chiede', { timeout: 60000 }, async () => {
  const r = await colCronometro('L', CASI['L 8+8'][1], 'scrittura-progetto');
  assert.ok(r, 'nessuna risposta: server fermo');
  assert.ok(r.ms < LIMITE_MS * MOLTIPLICATORE_CI, `[ceiling ${LIMITE_MS * MOLTIPLICATORE_CI} ms] cancello intero ${r.ms?.toFixed(1)} ms`);
  assert.deepEqual(r.critiche, ['troppo-annidato']);
});

/* ───────────── ciò che il CHANGELOG promette resta vero ───────────── */

test('OTTO-CD-RESTANO — otto `cd` che possono non restare, a un livello e dentro `bash -c`: nessuna carta (il tetto non tocca i comandi onesti)', () => {
  for (const s of ['L', 'A', 'M']) {
    assert.equal(critiche.cancellazioneCritica(`${sub(8, 'a')}; rm -rf dist`, mondo(s)), null, `${s} a un livello`);
    assert.equal(critiche.cancellazioneCritica(`bash -c '${sub(8, 'a')}; rm -rf dist'`, mondo(s)), null, `${s} dentro bash -c`);
    assert.equal(critiche.cancellazioneCritica(`${sub(4, 'a')}; bash -c '${sub(4, 'b')}; rm -rf dist'`, mondo(s)), null, `${s} 4+4`);
  }
});

test('OTTO-CD-RESTANO-W — su Windows otto `cd` dentro `bash -c`: nessuna carta', { skip: SALTA_W }, () => {
  assert.equal(critiche.cancellazioneCritica(`bash -c "${sub(8, 'a')}; rm -rf dist"`, mondo('W')), null);
  assert.equal(critiche.cancellazioneCritica(`${sub(8, 'a')}; rm -rf dist`, mondo('W')), null, 'al primo livello cmd non ha sottoshell');
});

test('NOVE-CD-CHIEDONO — nove `cd` che possono non restare: «troppo annidato» (fuori da Windows, e dentro bash)', () => {
  for (const s of ['L', 'A', 'M']) {
    assert.equal(critiche.cancellazioneCritica(`${sub(9, 'a')}; rm -rf dist`, mondo(s))?.perche, 'troppo-annidato', s);
    assert.equal(critiche.cancellazioneCritica(`${Array.from({ length: 9 }, (_, i) => `cd m${i}`).join(' & ')} & rm -rf dist`, mondo(s))?.perche, 'troppo-annidato', `${s} sottofondo`);
  }
});

/* ───────────── la quarta carta nuova, voluta e detta ───────────── */

const QUARTA = `bash -c "X=/${k}/dati/out; echo ${BS}\${x/a/&}; rm -rf ${BS}"${BS}$X${BS}"/*"`;
const SORELLA = `bash -c "echo ${BS}\${x/a/&}; rm -rf ${BS}"/${k}/dati/out${BS}"/*"`;

test('QUARTA-CARTA — su Windows la forma del revisore chiede `primo-livello` su \\\\k\\dati\\out, come la 0.2.1 per la sorella scritta (carta detta nel CHANGELOG)', { skip: SALTA_W }, async () => {
  const r = critiche.cancellazioneCritica(QUARTA, mondo('W'));
  assert.equal(r?.perche, 'primo-livello');
  assert.equal(r?.percorso, `${BS}${BS}${k}${BS}dati${BS}out`);
  const ferma = critiche.__perLeProve?.della021;
  assert.equal(typeof ferma, 'function', 'la 0.2.1 ferma nel prodotto');
  assert.equal(ferma(QUARTA, mondo('W')), null, 'la 0.2.1 non la dava: è nuova');
  assert.equal(ferma(SORELLA, mondo('W'))?.perche, 'primo-livello', 'la sorella scritta la dava già la 0.2.1');
  const chieste = [];
  await verificaPermessoScrittura({ toolCallId: 't7', tipo: 'shell', comando: QUARTA }, { livelloAccesso: 'accesso-pieno', cartella: SIS.W.cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  assert.deepEqual(chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica.perche), ['primo-livello'], 'il cancello intero la chiede');
});

test('QUARTA-CARTA-SOLO-CON-LA-E-COMMERCIALE — senza la `&` dentro `${…}` la stessa forma non chiede (la carta nasce solo lì)', { skip: SALTA_W }, () => {
  assert.equal(critiche.cancellazioneCritica(QUARTA.replace('/&}', '/b}'), mondo('W')), null);
});

/* ───────────── le carte NUOVE del sesto giro, difese (N12, N15) ───────────── */

const sistemaDi = (s) => (s === 'W' ? `${D}:${BS}lavori${BS}progetto` : SIS[s].cartella);
const N12_A = (s) => `powershell -c "sh -c 'cd ${sistemaDi(s)} ; echo ${BS}\${x//${BS}${BS}}/&}&&X=..; cd ${BS}'${BS}$X${BS}' ; rm -rf ${BS}$(ls)'"`;
const N12_B = (s) => `powershell -c "sh -c 'cd ${sistemaDi(s)} ; echo ${BS}\${x//${BS}${BS}}/&}; cd ${BS}'..${BS}' ; rm -rf ${BS}$(ls)'"`;
const N12_C = () => `powershell -c "bash -c 'cd src ; echo ${BS}\${x/${BS}${BS}}/&}&&X=..; cd ${BS}'${BS}$X${BS}' ; rm -rf ${BS}$(ls)'"`;
const N15_W = `bash -c 'cd src; eval "cd .. && echo ${BS}\${x/${BS}${BS}}/&}; X=${BS}$PWD"; cd "$X"; rm -rf *'`;
const N15_CMD = `bash -c "cmd /c ${BS}"cd src; echo ${BS}\${x/${BS}${BS}}/&}&&eval 'cd ~'\nexec 3>&1 && rm -r -f -- *${BS}""`;

const nuovaCarta = (comando, s, perche) => {
  const ferma = critiche.__perLeProve?.della021;
  assert.equal(ferma?.(comando, mondo(s)) ?? null, null, `${s}: la 0.2.1 non la dava (carta nuova)`);
  assert.equal(critiche.cancellazioneCritica(comando, mondo(s))?.perche, perche, `${s}: ${comando}`);
};

for (const [nome, forma] of [['A', N12_A], ['B', N12_B], ['C', N12_C]]) {
  test(`N12-${nome} — una \` ' \` dentro le virgolette doppie non apre virgolette semplici: la lettura con la \`&\` delle graffe resa inerte resta, e la carta nuova c è (L A M)`, () => {
    for (const s of ['L', 'A', 'M']) nuovaCarta(forma(s), s, 'sostituzione');
  });
}

test('N15-W — la lettura «come la riceve» toglie la barra anche a `\\\\`: `eval "cd .. && echo \\${x/\\\\}/&}; X=\\$PWD"` porta al progetto (Windows)', { skip: SALTA_W }, () => {
  nuovaCarta(N15_W, 'W', 'progetto');
});

test('N15-CMD — la stessa lettura dentro `bash -c "cmd /c \\"…\\""`: la carta «progetto» fuori da Windows (L A M)', () => {
  for (const s of ['L', 'A', 'M']) nuovaCarta(N15_CMD, s, 'progetto');
});

test('N15-POWERSHELL — la forma di N12 su Windows muore anche per N15 (`\\\\` e `\\\'` letti come li riceve sh)', { skip: SALTA_W }, () => {
  nuovaCarta(N12_A('W'), 'W', 'sostituzione');
  nuovaCarta(N12_B('W'), 'W', 'sostituzione');
});

/* ───────────── il confine del tetto unico (le righe nuove del settimo giro) ───────────── */

const TETTO = 300; // scritto qui, non letto dal modulo: un tetto cambiato nel sorgente deve far cadere queste prove
const letture = () => critiche.__perLeProve.letture();
const sostituzioni = (n) => Array.from({ length: n }, (_, i) => `x${i}=$(true)`).join('; ');

test('CONFINE-300 — un comando onesto che fa esattamente 300 letture (299 `$(…)`) non chiede; con una lettura in più (301) chiede «troppo annidato»', () => {
  assert.equal(critiche.__perLeProve.TETTO_DELLE_LETTURE, TETTO);
  for (const s of ['L', 'A', 'M']) {
    assert.equal(critiche.cancellazioneCritica(`${sostituzioni(299)}; rm -rf dist`, mondo(s)), null, `${s}: 300 letture`);
    assert.equal(letture(), TETTO, `${s}: letture contate`);
    assert.equal(critiche.cancellazioneCritica(`${sostituzioni(300)}; rm -rf dist`, mondo(s))?.perche, 'troppo-annidato', `${s}: 301 letture`);
    assert.equal(letture(), TETTO + 1, `${s}: si ferma alla prima lettura oltre il tetto`);
  }
});

test('CONFINE-CASI — anche le letture dei casi contano nello stesso tetto: una sottoshell e 149 `$(…)` (2 casi × 150 = 300) passa, con 150 `$(…)` chiede', () => {
  for (const s of ['L', 'A', 'M']) {
    assert.equal(critiche.cancellazioneCritica(`${sub(1, 'a')}; ${sostituzioni(149)}; rm -rf dist`, mondo(s)), null, s);
    assert.equal(letture(), TETTO, s);
    assert.equal(critiche.cancellazioneCritica(`${sub(1, 'a')}; ${sostituzioni(150)}; rm -rf dist`, mondo(s))?.perche, 'troppo-annidato', s);
    assert.equal(letture(), TETTO + 1, s);
  }
});

test('CONFINE-LIVELLI — il tetto è uno solo per tutti i livelli: 8+8 si ferma a 301 letture, 4+4 (272 letture) passa', { timeout: 120000 }, () => {
  for (const s of ['L', 'A', 'M']) {
    assert.equal(critiche.cancellazioneCritica(CASI['L 8+8'][1], mondo(s))?.perche, 'troppo-annidato', `${s} 8+8`);
    assert.equal(letture(), TETTO + 1, `${s} 8+8 si ferma subito oltre il tetto`);
    /* (8+8+8 solo nel worker col cronometro, TETTO-*: qui, senza il tetto, terrebbe ferme le prove per minuti) */
    assert.equal(critiche.cancellazioneCritica(`${sub(4, 'a')}; bash -c '${sub(4, 'b')}; rm -rf dist'`, mondo(s)), null, `${s} 4+4`);
    assert.equal(letture(), 272, `${s} 4+4: 16 casi fuori, ognuno coi suoi 16 dentro`);
  }
});

test('CONFINE-GIRI — su Windows il tetto vale per il comando intero, anche quando lo si legge in tre giri (un `cd` verso un altro disco senza /d)', { skip: SALTA_W }, () => {
  assert.equal(critiche.cancellazioneCritica(`cd ${K}:${BS}build & ${sostituzioni(99)}; rm -rf dist`, mondo('W')), null, 'tre giri da 100 letture');
  assert.equal(letture(), TETTO);
  assert.equal(critiche.cancellazioneCritica(`cd ${K}:${BS}build & ${sostituzioni(100)}; rm -rf dist`, mondo('W'))?.perche, 'troppo-annidato', 'tre giri da 101 letture: oltre il tetto del comando');
  assert.equal(letture(), TETTO + 1);
  assert.equal(critiche.cancellazioneCritica(`${sostituzioni(100)}; rm -rf dist`, mondo('W')), null, 'un giro solo da 101 letture');
});

test('CONFINE-OLTRE-SEMPRE-CARTA — oltre il tetto la carta c è a ogni livello e in ogni modo, mai un sì muto e mai un errore (cancello intero)', async () => {
  for (const comando of [`${sostituzioni(300)}; rm -rf dist`, `bash -c '${sostituzioni(300)}; rm -rf dist'`, `${sub(2, 'a')}; sh -c "${sub(8, 'b')}; rm -rf dist"`]) {
    for (const livelloAccesso of ['accesso-pieno', 'scrittura-progetto']) {
      const chieste = [];
      const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
      const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
      process.env.USERPROFILE = SIS.L.home; process.env.HOME = SIS.L.home;
      Object.defineProperty(process, 'platform', { ...descrittore, value: 'linux' });
      try {
        await verificaPermessoScrittura({ toolCallId: 't7c', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS.L.cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
      } finally {
        Object.defineProperty(process, 'platform', descrittore);
        if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
        if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
      }
      assert.deepEqual(chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica.perche), ['troppo-annidato'], `${livelloAccesso}: ${comando.slice(0, 60)}`);
    }
  }
});
