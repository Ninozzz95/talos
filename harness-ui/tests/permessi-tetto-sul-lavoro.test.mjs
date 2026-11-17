/*
 * Ottavo giro della riparazione dei permessi (14/11/2026, scelta dell'owner «ottavo giro», giudice v1838-v1839) — UN TETTO SUL LAVORO.
 * Il settimo giro contava le LETTURE di un comando (tetto 300), non il lavoro di ciascuna: ogni lettura rifà tutti i bersagli per tutti
 * i valori del `for`, e nel cancello ogni bersaglio con la barra in coda chiede al disco il percorso vero (un percorso diverso per ogni
 * caso, quindi nessuna memoria lo salva). Il revisore del settimo giro (ROSSO, 14/11 00:08-00:54) ha misurato un comando ONESTO di 551
 * caratteri (otto `(cd packages/x && npm ci)` e un `for` di 16 pacchetti con 6 cartelle ciascuno): 256 letture, nessuna carta, cancello
 * fermo 1,13-1,80 s su Linux, telefono e macOS, 0,92-1,35 s su Windows dentro `bash -c` (la 0.2.1: 20-35 ms); e uno da 864 caratteri
 * (otto sottoshell, un `for` di 16, 60 bersagli) 10,1-14,5 s. Il cancello è sincrono: il server di TALOS resta fermo.
 *  - LAVORO-*: i due comandi del revisore, testo esatto, col cancello intero in un worker col cronometro e un tetto esterno: sotto i
 *    50 ms OPPURE la carta (`troppo-annidato`, il prezzo scelto dall'owner), mai un errore, mai il server fermo.
 *  - DUE-LETTURE-*, IN-PIU-*, GIRI-*: le prove che uccidono i mutanti VIVI e quelli uccisi da una prova sola del revisore (R02 e R05:
 *    contatore azzerato o nuovo fra le due letture di `/x/`; R10: le letture in più di `${…&}` che tacciono il tetto; R06 e R12: i giri
 *    di cmd e PowerShell col contatore nuovo o che tacciono il tetto; R01: l'ambiente ricordato fra un comando e l'altro). Il prodotto
 *    qui è già giusto (bordi del revisore): queste prove sono verdi sulla base, e rosse coi mutanti.
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono. Nessuna cancellazione; il bash vero non si prova.
 * Fonti (lette il 14/11/2026): Codex `codex-rs/shell-command/src/bash.rs:24-29` (si analizzano solo i comandi fatti di parole semplici,
 * altrimenti `None`: niente calcolo esploso) e `codex-rs/shell-command/src/command_safety/is_dangerous_command.rs:35`
 * (`MAX_DANGEROUS_COMMAND_WRAPPER_DEPTH: usize = 8`, un tetto fisso); Hermes `tools/approval_detection.py:228-231` (una espressione per
 * riga, costo lineare).
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
const d = D.toLowerCase();
const K = liberi[1] ?? 'K';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio' },
};
const mondo = (s, altro = {}) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home }, realpathFn: (p) => p, ...altro });
const LIMITE_MS = 50; // la scelta dell'owner: sotto i 50 ms o la carta
const TETTO_ESTERNO_MS = 40000;

/* i due comandi del revisore del settimo giro, testo esatto (`sonda-compatta.mjs`, `tempo7r.mjs`) */
const pk = ['api', 'web', 'cli', 'core', 'ui', 'db', 'auth', 'docs', 'sdk', 'admin', 'jobs', 'mail', 'pay', 'search', 'chat', 'infra'];
const sub8 = pk.slice(0, 8).map((p) => `(cd packages/${p} && npm ci)`).join('; ');
const sub = (n, p) => Array.from({ length: n }, (_, i) => `(cd ${p}${i} && npm i)`).join('; ');
const parole = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join(' ');
const C551 = `${sub8}; for d in ${pk.map((p) => `packages/${p}`).join(' ')}; do rm -rf ${['dist', 'build', '.cache', 'coverage', '.turbo', 'out'].map((x) => `"$d"/${x}/`).join(' ')}; done`;
const C864 = `${sub(8, 'a')}; for d in ${parole(16, (i) => `pkg${i}`)}; do rm -rf "$d"/dist/; done; rm -rf ${parole(60, (i) => `"$d"/c${i}/`)}`;

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

const presto = (r, cosa) => {
  assert.ok(r, `${cosa}: il cancello non ha risposto entro ${TETTO_ESTERNO_MS} ms (server fermo)`);
  assert.equal(r.errore, null, `${cosa}: mai un errore`);
  if (r.perche === 'troppo-annidato') {
    assert.deepEqual(r.critiche, ['troppo-annidato'], `${cosa}: il cancello intero chiede una volta, con quel motivo`);
    return;
  }
  assert.ok(r.ms < LIMITE_MS * MOLTIPLICATORE_CI && r.msFunzione < LIMITE_MS * MOLTIPLICATORE_CI, `[ceiling ${LIMITE_MS * MOLTIPLICATORE_CI} ms] ${cosa}: senza carta deve rispondere in meno di ${LIMITE_MS} ms (funzione ${r.msFunzione?.toFixed(1)} ms, cancello ${r.ms?.toFixed(1)} ms)`);
};

for (const [nome, comando] of [['551', C551], ['864', C864]]) {
  for (const s of ['L', 'A', 'M', 'W']) {
    test(`LAVORO-${nome}-${s} — il comando onesto da ${nome} caratteri del revisore${s === 'W' ? ' (dentro `bash -c`)' : ''}: il cancello intero risponde sotto i ${LIMITE_MS} ms oppure chiede «troppo annidato»`, { skip: s === 'W' ? SALTA_W : false, timeout: 120000 }, async () => {
      const r = await colCronometro(s, s === 'W' ? `bash -c '${comando}'` : comando);
      presto(r, `${nome} ${s}`);
    });
  }
}

test('LAVORO-551-SCRIVE-NEL-PROGETTO — anche in «Scrive nel progetto» il comando da 551 caratteri risponde presto o chiede', { timeout: 120000 }, async () => {
  presto(await colCronometro('L', C551, 'scrittura-progetto'), '551 L scrittura-progetto');
});

/* ───────────── i mutanti vivi del revisore (il prodotto è giusto, mancavano le prove) ───────────── */

const sost = (n) => Array.from({ length: n }, (_, i) => `v${i}=$(git rev-parse HEAD)`).join('; ');
const letture = () => critiche.__perLeProve.letture();

/** il cancello intero su un sistema (con `process.platform` finto fuori da Windows): i motivi delle carte critiche */
async function carteDelCancello(s, comando, livelloAccesso = 'accesso-pieno') {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  try {
    await verificaPermessoScrittura({ toolCallId: 't8', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica.perche);
}

/* R02, R05: le due letture di `/x/` (Git Bash e il sistema) contano nello stesso tetto. k = 74: 4 × 75 = 300 letture, nessuna carta;
   k = 75: 2 × 152, ognuna sotto il tetto da sola, insieme oltre: la carta. */
const DUE_LETTURE = (k) => `${sost(k).replaceAll('; ', ' & ')} & rd /s /q /${d}/w/progetto/dist`;
const DUE_LETTURE_BASH = (k) => `bash -c '${sost(k)}; rm -rf /${d}/w/progetto/dist'`;

test('DUE-LETTURE-X — su Windows le due letture di `/x/…` contano nello stesso tetto del comando: 300 letture passano, la 301ª (nella seconda lettura) chiede', { skip: SALTA_W }, () => {
  assert.equal(critiche.cancellazioneCritica(DUE_LETTURE(74), mondo('W')), null, 'due letture da 150: 300 in tutto');
  assert.equal(letture(), 300);
  assert.equal(critiche.cancellazioneCritica(DUE_LETTURE(75), mondo('W'))?.perche, 'troppo-annidato', 'due letture da 152: ognuna sotto il tetto, insieme oltre');
  assert.equal(letture(), 301);
  const senzaX = `${sost(75).replaceAll('; ', ' & ')} & rd /s /q ${D}:${BS}w${BS}progetto${BS}dist`;
  assert.equal(critiche.cancellazioneCritica(senzaX, mondo('W')), null, 'la stessa senza `/x/`: una lettura sola, 76 letture');
});

test('DUE-LETTURE-X-BASH — la stessa cosa dentro `bash -c`, col cancello intero e nei due livelli', { skip: SALTA_W }, async () => {
  assert.equal(critiche.cancellazioneCritica(DUE_LETTURE_BASH(74), mondo('W')), null);
  for (const livello of ['accesso-pieno', 'scrittura-progetto']) {
    assert.deepEqual(await carteDelCancello('W', DUE_LETTURE_BASH(75), livello), ['troppo-annidato'], livello);
  }
});

/* R10: le letture in più del testo con una `&` dentro `${…}` contano e, oltre il tetto, la loro carta resta. */
const IN_PIU = (k) => `echo \${x/a/&}; ${sost(k)}; rm -rf dist`;

test('IN-PIU-TETTO — le letture in più di `${…&}` contano nel tetto e oltre il tetto chiedono (L A M)', () => {
  for (const s of ['L', 'A', 'M']) {
    assert.equal(critiche.cancellazioneCritica(IN_PIU(149), mondo(s)), null, `${s}: 2 × 150 = 300 letture`);
    assert.equal(letture(), 300, s);
    assert.equal(critiche.cancellazioneCritica(IN_PIU(150), mondo(s))?.perche, 'troppo-annidato', `${s}: 301 letture`);
  }
});

test('IN-PIU-TETTO-CANCELLO — dentro `bash -c` su Windows e col cancello intero su Linux: oltre il tetto la carta, mai il silenzio', { skip: SALTA_W }, async () => {
  assert.equal(critiche.cancellazioneCritica(`bash -c '${IN_PIU(99)}'`, mondo('W')), null, '300 letture');
  assert.equal(critiche.cancellazioneCritica(`bash -c '${IN_PIU(100)}'`, mondo('W'))?.perche, 'troppo-annidato', '301 letture');
  assert.deepEqual(await carteDelCancello('L', IN_PIU(150)), ['troppo-annidato']);
  assert.deepEqual(await carteDelCancello('W', `bash -c '${IN_PIU(100)}'`, 'scrittura-progetto'), ['troppo-annidato']);
});

/* R06, R12: i giri di cmd e PowerShell (un `cd` verso un altro disco senza /d) contano nello stesso tetto e non lo tacciono. */
const GIRI_PS = (k) => `cd ${K}:${BS}build & powershell -c "${Array.from({ length: k }, (_, i) => `$v${i} = $(Get-Date)`).join('; ')}" & rd /s /q dist`;

test('GIRI-POWERSHELL — tre giri con un testo di PowerShell: 300 letture passano, 301 chiedono, anche col cancello intero', { skip: SALTA_W }, async () => {
  assert.equal(critiche.cancellazioneCritica(GIRI_PS(49), mondo('W')), null, 'tre giri, 300 letture');
  assert.equal(letture(), 300);
  assert.equal(critiche.cancellazioneCritica(GIRI_PS(50), mondo('W'))?.perche, 'troppo-annidato');
  assert.deepEqual(await carteDelCancello('W', GIRI_PS(50)), ['troppo-annidato']);
});

/* R01: le cartelle dei progetti si leggono dall'ambiente DI QUEL comando, mai da quello di un comando prima. */
test('AMBIENTE-DI-OGNI-COMANDO — le cartelle dei progetti di un comando non restano al comando dopo (L e W)', () => {
  const casi = [['L', '/srv/progetti/uno', '/srv/progetti/due']];
  if (!SALTA_W) casi.push(['W', `${K}:${BS}progetti${BS}uno`, `${K}:${BS}progetti${BS}due`]);
  for (const [s, uno, due] of casi) {
    critiche.dimenticaPercorsiVeri();
    const conUno = mondo(s, { ambiente: { HOME: SIS[s].home, TALOS_HARNESS_UI_PROJECT_DIRS: uno } });
    const conDue = mondo(s, { ambiente: { HOME: SIS[s].home, TALOS_HARNESS_UI_PROJECT_DIRS: due } });
    const rm = (x) => (s === 'W' ? `rd /s /q ${x}` : `rm -rf ${x}`);
    assert.equal(critiche.__perLeProve.letturaNuova(rm(uno), conUno)?.perche, 'progetto', `${s}: il primo`);
    assert.equal(critiche.__perLeProve.letturaNuova(rm(due), conDue)?.perche, 'progetto', `${s}: il secondo, col suo ambiente`);
    assert.equal(critiche.__perLeProve.letturaNuova(rm(uno), conDue), null, `${s}: il primo non è più un progetto`);
  }
});

/* ───────────── il confine del tetto sul lavoro (le righe nuove dell'ottavo giro) ───────────── */

/* scritti qui, non letti dal modulo: un tetto o un peso cambiato nel sorgente deve far cadere queste prove */
const TETTO = 10000;
const PESI = { lettura: 2, caratteri: 64, comando: 1, bersaglio: 3, realpath: 12 };
const lavoro = () => critiche.__perLeProve.lavoro();
const rmn = (n, p = 'p', coda = '/') => `rm -rf ${Array.from({ length: n }, (_, i) => `${p}${i}${coda}`).join(' ')}`;
/** `rm -rf` di n cartelle con la barra (un bersaglio e un percorso vero ciascuna) e m comandi `:`: il lavoro si calcola a mano */
const forma = (n, m) => `${rmn(n)}${'; :'.repeat(m)}`;
const atteso = (n, m) => PESI.lettura + Math.floor(forma(n, m).length / PESI.caratteri) + (1 + m) * PESI.comando + n * (PESI.bersaglio + PESI.realpath);
const tuttiISistemi = SALTA_W ? ['L', 'A', 'M'] : ['L', 'A', 'M', 'W'];

test('CONFINE-LAVORO-ESATTO — ogni unità conta col suo peso: lettura (2 + 1 ogni 64 caratteri), comando 1, bersaglio 3, percorso vero 12, un bersaglio per valore del `for`, ogni livello', () => {
  assert.equal(critiche.__perLeProve.TETTO_DEL_LAVORO, TETTO);
  assert.deepEqual({ ...critiche.__perLeProve.PESI }, PESI);
  const casi = [
    ['rm -rf dist', 6], // 2 + 1 + 3
    ['rm -rf dist/', 18], // 2 + 1 + 3 + 12
    ['for d in a b c; do rm -rf "$d"/x/; done', 49], // 2 + 2 comandi + 3 valori × 15
    [`bash -c 'rm -rf dist/'`, 21], // fuori 2 + 1, dentro 2 + 1 + 3 + 12
    [`rm -rf dist # ${'x'.repeat(200)}`, 9], // 214 caratteri: 2 + 3 + 1 + 3
    ['find build out -delete', 9], // 2 + 1 + 2 radici × 3
    ['git clean -fdx src lib', 9], // 2 + 1 + 2 percorsi × 3
    ['robocopy vuota build /MIR', 6], // 2 + 1 + 3
    ['X=$HOME; rm -rf "$X$IGNOTA"/x', 7], // 2 + 2 + 3 (0.2.3: con `"$IGNOTA"/x` da sola è la radice, e si giudica)
  ];
  for (const s of tuttiISistemi) for (const [comando, unita] of casi) {
    critiche.__perLeProve.letturaNuova(comando, mondo(s));
    assert.equal(lavoro(), unita, `${s}: ${comando.slice(0, 50)}`);
  }
  for (const s of ['L', 'A', 'M']) {
    critiche.__perLeProve.letturaNuova('(cd a && npm i); rm -rf dist', mondo(s));
    assert.equal(lavoro(), 16, `${s}: due casi da 8`);
    critiche.__perLeProve.letturaNuova('rm -rf {a,b,c}/', mondo(s));
    assert.equal(lavoro(), 48, `${s}: una scelta delle graffe, un bersaglio`);
  }
});

test('CONFINE-LAVORO-10000 — esattamente 10.000 unità non chiedono; 10.001 chiedono «troppo annidato», nella funzione e nel cancello intero', async () => {
  const [n, m] = [600, 901];
  assert.equal(atteso(n, m - 1), TETTO - 1);
  assert.equal(atteso(n, m), TETTO);
  assert.equal(atteso(n, m + 1), TETTO + 1);
  for (const s of tuttiISistemi) {
    assert.equal(critiche.cancellazioneCritica(forma(n, m - 1), mondo(s)), null, `${s}: tetto − 1`);
    assert.equal(lavoro(), TETTO - 1, s);
    assert.equal(critiche.cancellazioneCritica(forma(n, m), mondo(s)), null, `${s}: tetto`);
    assert.equal(lavoro(), TETTO, s);
    assert.equal(critiche.cancellazioneCritica(forma(n, m + 1), mondo(s))?.perche, 'troppo-annidato', `${s}: tetto + 1`);
    assert.equal(lavoro(), TETTO + 1, `${s}: si ferma alla prima unità oltre`);
  }
  for (const livello of ['accesso-pieno', 'scrittura-progetto']) {
    assert.deepEqual(await carteDelCancello('L', forma(n, m + 1), livello), ['troppo-annidato'], livello);
    assert.deepEqual(await carteDelCancello('L', forma(n, m), livello), [], `${livello}: al tetto nessuna carta`);
  }
});

test('CONFINE-LAVORO-LIVELLI — il lavoro si somma su tutti i livelli: 400 cartelle fuori e 400 dentro `bash -c` passano da sole, insieme chiedono', () => {
  for (const s of ['L', 'A', 'M']) {
    assert.equal(critiche.cancellazioneCritica(rmn(400), mondo(s)), null, `${s} fuori`);
    assert.equal(critiche.cancellazioneCritica(`bash -c '${rmn(400, 'q')}'`, mondo(s)), null, `${s} dentro`);
    assert.equal(critiche.cancellazioneCritica(`${rmn(400)}; bash -c '${rmn(400, 'q')}'`, mondo(s))?.perche, 'troppo-annidato', `${s} insieme`);
    assert.equal(critiche.cancellazioneCritica(`${rmn(250)}; bash -c '${rmn(250, 'q')}; sh -c "${rmn(250, 'r')}"'`, mondo(s))?.perche, 'troppo-annidato', `${s} tre livelli da 250`);
  }
});

test('CONFINE-LAVORO-GIRI — su Windows il lavoro dei tre giri (un `cd` verso un altro disco senza /d) si somma: ognuno sotto, insieme oltre', { skip: SALTA_W }, async () => {
  assert.equal(critiche.cancellazioneCritica(rmn(300), mondo('W')), null, 'un giro solo');
  assert.equal(critiche.cancellazioneCritica(`cd ${K}:${BS}build & ${rmn(230)}`, mondo('W'))?.perche, 'troppo-annidato', 'tre giri da ~3.500');
  const ps = `cd ${K}:${BS}build & powershell -c "Remove-Item -Recurse -Force ${Array.from({ length: 230 }, (_, i) => `p${i}`).join(',')}"`;
  assert.equal(critiche.cancellazioneCritica(ps.replace(`cd ${K}:${BS}build & `, ''), mondo('W')), null, 'PowerShell, un giro solo');
  assert.equal(critiche.cancellazioneCritica(ps, mondo('W'))?.perche, 'troppo-annidato', 'PowerShell, tre giri');
  assert.deepEqual(await carteDelCancello('W', ps), ['troppo-annidato'], 'cancello intero');
});

test('CONFINE-LAVORO-DUE-LETTURE-X — su Windows le due letture di `/x/…` sommano il lavoro: 350 cartelle `/x/…` dentro `bash -c` chiedono, le stesse senza `/x/` no', { skip: SALTA_W }, async () => {
  assert.equal(critiche.cancellazioneCritica(`bash -c '${rmn(350)}'`, mondo('W')), null, 'una lettura da ~5.300');
  assert.equal(critiche.cancellazioneCritica(`bash -c '${rmn(350, `/${d}/w/progetto/p`)}'`, mondo('W'))?.perche, 'troppo-annidato', 'due letture da ~5.300');
  assert.deepEqual(await carteDelCancello('W', `bash -c '${rmn(350, `/${d}/w/progetto/p`)}'`, 'scrittura-progetto'), ['troppo-annidato']);
});

test('CONFINE-LAVORO-FOR — ogni valore del `for` moltiplica i bersagli: 16 valori × 42 cartelle chiedono, × 41 no (L A M W)', async () => {
  const per = (k) => `for d in ${Array.from({ length: 16 }, (_, i) => `v${i}`).join(' ')}; do ${rmn(k, '"$d"/c')}; done`;
  for (const s of tuttiISistemi) {
    assert.equal(critiche.cancellazioneCritica(per(41), mondo(s)), null, `${s}: 9.851 unità`);
    assert.equal(critiche.cancellazioneCritica(per(42), mondo(s))?.perche, 'troppo-annidato', `${s}: oltre 10.000`);
  }
  assert.deepEqual(await carteDelCancello('M', per(42)), ['troppo-annidato']);
});

test('CONFINE-LAVORO-PERCORSO-VERO — il percorso vero chiesto per un collegamento è lavoro: 667 cartelle con la barra chiedono, senza la barra no', () => {
  for (const s of tuttiISistemi) {
    assert.equal(critiche.cancellazioneCritica(rmn(667, 'p', ''), mondo(s)), null, `${s}: 667 × 3`);
    assert.equal(critiche.cancellazioneCritica(rmn(667), mondo(s))?.perche, 'troppo-annidato', `${s}: 667 × 15`);
  }
});

test('CONFINE-LAVORO-SEMPRE-CARTA — oltre il tetto del lavoro la carta c è in bash, cmd, PowerShell e misti, nei due livelli, mai un sì muto né un errore (cancello intero)', async () => {
  const forme = [['L', forma(700, 0)], ['A', `bash -c '${forma(700, 0)}'`], ['M', `sh -c "${rmn(350)}; bash -c '${rmn(350, 'q')}'"`]];
  if (!SALTA_W) {
    forme.push(['W', `rd /s /q ${Array.from({ length: 2000 }, (_, i) => `b${i}${BS}`).join(' ')}`]);
    forme.push(['W', `powershell -c "Remove-Item -Recurse -Force ${Array.from({ length: 3400 }, (_, i) => `b${i}`).join(',')}"`]);
    forme.push(['W', `cmd /c "rd /s /q ${Array.from({ length: 1200 }, (_, i) => `b${i}${BS}`).join(' ')}" & powershell -c "Remove-Item -Recurse -Force ${Array.from({ length: 1200 }, (_, i) => `c${i}`).join(',')}" & bash -c '${rmn(300, 'e')}'`]);
  }
  for (const [s, comando] of forme) {
    assert.equal(critiche.cancellazioneCritica(comando, mondo(s))?.perche, 'troppo-annidato', `${s}: ${comando.slice(0, 40)}`);
    assert.ok(lavoro() > TETTO, `${s}: oltre il tetto (${lavoro()})`);
    for (const livello of ['accesso-pieno', 'scrittura-progetto']) assert.deepEqual(await carteDelCancello(s, comando, livello), ['troppo-annidato'], `${s} ${livello}`);
  }
});

/* ───────────── seconde prove: ogni punto dove si conta ha almeno due prove che lo tengono ───────────── */
const lista = (n, p, sep = ' ') => Array.from({ length: n }, (_, i) => `${p}${i}`).join(sep);
/** fuori n cartelle senza barra, dentro `bash -c` una lettura lunga (1.000 caratteri: 2 + 16 unità in un colpo solo) */
const conLetturaLunga = (n) => `${rmn(n, 'p', '')}; bash -c 'rm -rf q0 # ${'x'.repeat(1000)}'`;

test('CONFINE-LAVORO-LETTURA-OLTRE — quando è una lettura nuova a passare il tetto, la carta è «troppo annidato» (mai un altro motivo, mai il silenzio) (L A M)', () => {
  for (const s of ['L', 'A', 'M']) {
    let sotto = 0; let saltoDiUnaLettura = 0;
    for (let n = 3218; n <= 3236; n += 1) {
      const esito = critiche.cancellazioneCritica(conLetturaLunga(n), mondo(s));
      if (lavoro() <= TETTO) { assert.equal(esito, null, `${s} n=${n}: ${lavoro()} unità`); sotto += 1; continue }
      assert.equal(esito?.perche, 'troppo-annidato', `${s} n=${n}: oltre il tetto (${lavoro()})`);
      if (lavoro() > TETTO + PESI.bersaglio) saltoDiUnaLettura += 1 // oltre di più di un bersaglio: l'ha passato la lettura lunga
    }
    assert.ok(sotto >= 3, `${s}: forme sotto il tetto (${sotto})`);
    assert.ok(saltoDiUnaLettura >= 2, `${s}: forme dove la lettura lunga passa il tetto (${saltoDiUnaLettura})`);
  }
});

test('CONFINE-LAVORO-LETTURA-OLTRE-CANCELLO — la stessa forma col cancello intero, nei due livelli: la carta è «troppo annidato» (L A)', async () => {
  for (const s of ['L', 'A']) for (const n of [3229, 3230]) {
    critiche.__perLeProve.letturaNuova(conLetturaLunga(n), mondo(s));
    assert.ok(lavoro() > TETTO + PESI.bersaglio, `${s} n=${n}: passato dalla lettura (${lavoro()})`);
    for (const livello of ['accesso-pieno', 'scrittura-progetto']) assert.deepEqual(await carteDelCancello(s, conLetturaLunga(n), livello), ['troppo-annidato'], `${s} n=${n} ${livello}`);
  }
});

test('CONFINE-LAVORO-GIRI-CMD — su Windows i tre giri sommano il lavoro anche con `rd` di cmd: 1.100 cartelle chiedono in tre giri, da sole no, col cancello intero', { skip: SALTA_W }, async () => {
  const tre = (n) => `cd ${K}:${BS}build & rd /s /q ${lista(n, 'p')}`;
  assert.equal(critiche.cancellazioneCritica(`rd /s /q ${lista(1100, 'p')}`, mondo('W')), null, 'un giro solo');
  assert.ok(lavoro() < TETTO / 2, `un giro (${lavoro()})`);
  assert.equal(critiche.cancellazioneCritica(tre(1000), mondo('W')), null, 'tre giri sotto');
  assert.equal(critiche.cancellazioneCritica(tre(1100), mondo('W'))?.perche, 'troppo-annidato', 'tre giri oltre');
  for (const livello of ['accesso-pieno', 'scrittura-progetto']) assert.deepEqual(await carteDelCancello('W', tre(1100), livello), ['troppo-annidato'], livello);
});

test('CONFINE-LAVORO-DUE-LETTURE-X-PRIMO-LIVELLO — su Windows le due letture di `/x/…` sommano il lavoro anche al primo livello: 350 cartelle chiedono, le stesse senza `/x/` no', { skip: SALTA_W }, async () => {
  assert.equal(critiche.cancellazioneCritica(rmn(350), mondo('W')), null, 'senza /x/');
  assert.equal(critiche.cancellazioneCritica(rmn(300, `/${d}/w/progetto/p`), mondo('W')), null, '300 con /x/');
  assert.equal(critiche.cancellazioneCritica(rmn(350, `/${d}/w/progetto/p`), mondo('W'))?.perche, 'troppo-annidato', '350 con /x/');
  assert.deepEqual(await carteDelCancello('W', rmn(350, `/${d}/w/progetto/p`)), ['troppo-annidato']);
});

test('CONFINE-LAVORO-ALTRI-BERSAGLI — anche i bersagli di `robocopy /MIR`, delle radici di `find` e dei percorsi di `git clean` sono lavoro: oltre il tetto la carta (L e W)', async () => {
  const robocopy = (n, sep) => Array.from({ length: n }, (_, i) => `robocopy vuota b${i} /MIR`).join(sep);
  const forme = [
    ['L', robocopy(2000, '; '), robocopy(2400, '; ')],
    ['L', `find ${lista(3000, 'r')} -delete`, `find ${lista(3400, 'r')} -delete`],
    ['L', `git clean -fdx ${lista(3000, 'g')}`, `git clean -fdx ${lista(3400, 'g')}`],
  ];
  if (!SALTA_W) forme.push(['W', robocopy(2000, ' & '), robocopy(2400, ' & ')], ['W', `find ${lista(3000, 'r')} -delete`, `find ${lista(3400, 'r')} -delete`], ['W', `git clean -fdx ${lista(3000, 'g')}`, `git clean -fdx ${lista(3400, 'g')}`]);
  for (const [s, sotto, oltre] of forme) {
    assert.equal(critiche.cancellazioneCritica(sotto, mondo(s)), null, `${s}: ${sotto.slice(0, 30)} sotto`);
    assert.ok(lavoro() > TETTO * 0.85, `${s}: ${sotto.slice(0, 30)} conta i bersagli (${lavoro()})`);
    assert.equal(critiche.cancellazioneCritica(oltre, mondo(s))?.perche, 'troppo-annidato', `${s}: ${oltre.slice(0, 30)} oltre`);
  }
  assert.deepEqual(await carteDelCancello('L', `find ${lista(3400, 'r')} -delete`), ['troppo-annidato']);
});

/* ───────────── l'ambiente letto una volta per giro (`ambienteDi`) ───────────── */
/* la lettura NUOVA da sola: nel cancello la 0.2.1 ferma coprirebbe una carta persa qui */
const nuova = (comando, opzioni) => critiche.__perLeProve.letturaNuova(comando, opzioni);

test('AMBIENTE-PRIMA-VOCE — su Windows vale la PRIMA voce col nome (senza badare alle maiuscole), come prima: `%DATI%`', { skip: SALTA_W }, () => {
  const ambiente = { HOME: SIS.W.home, Dati: SIS.W.cartella, DATI: `${K}:${BS}altro${BS}x` };
  assert.equal(nuova('rd /s /q %DATI%', mondo('W', { ambiente }))?.perche, 'progetto');
  assert.equal(nuova('rd /s /q %DATI%', mondo('W', { ambiente: { HOME: SIS.W.home, DATI: `${K}:${BS}altro${BS}x`, Dati: SIS.W.cartella } })), null, 'al contrario: la prima è l altra');
});

test('AMBIENTE-PRIMA-VOCE-POWERSHELL — la stessa regola per `$env:dati` dentro PowerShell', { skip: SALTA_W }, () => {
  const ambiente = { HOME: SIS.W.home, dati: SIS.W.cartella, DATI: `${K}:${BS}altro${BS}x` };
  assert.equal(nuova('powershell -c "Remove-Item -Recurse -Force $env:DATI"', mondo('W', { ambiente }))?.perche, 'progetto');
});

test('AMBIENTE-DI-OGNI-GIRO — l ambiente letto è quello del comando: un comando dopo con un altro ambiente non vede quello di prima (L A M)', () => {
  for (const s of ['L', 'A', 'M']) {
    assert.equal(nuova('rm -rf "$DATI"', mondo(s, { ambiente: { HOME: SIS[s].home, DATI: SIS[s].cartella } }))?.perche, 'progetto', s);
    assert.equal(nuova('rm -rf "$DATI"', mondo(s, { ambiente: { HOME: SIS[s].home, DATI: '/srv/altro/x' } })), null, `${s}: il suo ambiente`);
    assert.equal(nuova('rm -rf "$DATI"', mondo(s, { ambiente: { HOME: SIS[s].home } })), null, `${s}: senza la variabile`);
  }
});

test('AMBIENTE-DI-OGNI-GIRO-W — la stessa cosa su Windows con `%DATI%` e con `$DATI` dentro `bash -c`', { skip: SALTA_W }, () => {
  assert.equal(nuova('rd /s /q %DATI%', mondo('W', { ambiente: { HOME: SIS.W.home, DATI: SIS.W.cartella } }))?.perche, 'progetto');
  assert.equal(nuova('rd /s /q %DATI%', mondo('W', { ambiente: { HOME: SIS.W.home, DATI: `${K}:${BS}altro${BS}x` } })), null);
  assert.equal(nuova(`bash -c 'rm -rf "$DATI"'`, mondo('W', { ambiente: { HOME: SIS.W.home, DATI: `${K}:${BS}altro${BS}x` } })), null);
});
