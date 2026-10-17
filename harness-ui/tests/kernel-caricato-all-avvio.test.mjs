/*
 * 13/10/2026 (bugfixer, lotto 2, C1) — IL SERVER DICE QUALE KERNEL HA CARICATO.
 *
 * Il difetto, visto tre volte (10/09 e 05/10 sul 4174, 13/10 sul 4177): senza `TALOS_OWNER_RUNTIME_MODULE` il server carica il
 * kernel di BASE (`src/kernel/talosHarness.mjs`) e non l'adattatore desktop (`talosHarness.desktop-hotfix.mjs`) che l'app e il
 * server dell'owner usano. Parte, risponde 200, i giri funzionano — ma compattazione, ganci del contesto e correzioni degli esiti
 * sono quelli di un altro prodotto, e niente lo dice: una cura provata lì dà numeri plausibili sul codice sbagliato.
 * Ora all'avvio c'è UNA riga `[kernel]`, e quando non è l'adattatore desktop è un avviso che lo dice.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const AMBIENTE_PRIMA = process.env.TALOS_OWNER_RUNTIME_MODULE;
import { descriviKernelCaricato } from '../src/kernel-caricato.mjs';
import { applicaKernelDiSerieDesktop } from '../src/kernel-di-serie-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const RADICE = fileURLToPath(new URL('..', import.meta.url));
const BASE = join(RADICE, 'src', 'kernel', 'talosHarness.mjs');
const ADATTATORE = join(RADICE, 'src', 'kernel', 'talosHarness.desktop-hotfix.mjs');

test('KERNEL-AVVIO-01 — la frase: adattatore desktop, kernel di base (avviso), modulo sconosciuto (avviso), nessuno (avviso)', () => {
  const adattatore = descriviKernelCaricato({ percorso: ADATTATORE, modulo: { talosLavora() {}, DESKTOP_BLACKBOX_HOTFIX_VERSION: '2026-09-15' }, daVariabile: true });
  assert.deepEqual({ tipo: adattatore.tipo, avviso: adattatore.avviso }, { tipo: 'adattatore-desktop', avviso: false });
  assert.match(adattatore.riga, /^\[kernel\] desktop adapter 2026-09-15/u);
  assert.ok(adattatore.riga.includes(ADATTATORE));

  const base = descriviKernelCaricato({ percorso: BASE, modulo: { talosLavora() {} }, daVariabile: false });
  assert.deepEqual({ tipo: base.tipo, avviso: base.avviso }, { tipo: 'base', avviso: true });
  assert.match(base.riga, /^\[kernel\] WARNING: BASE kernel, NOT the desktop adapter/u);
  assert.match(base.riga, /TALOS_OWNER_RUNTIME_MODULE is not set: the desktop default/u);
  assert.ok(base.riga.includes(BASE));
  assert.match(descriviKernelCaricato({ percorso: BASE, modulo: { talosLavora() {} }, daVariabile: true }).riga, /chosen by TALOS_OWNER_RUNTIME_MODULE/u);

  /* il fatto si legge dal modulo CARICATO, non dal nome del file: un adattatore copiato sotto un altro nome resta un adattatore,
     e un file che si chiama come lui ma non lo è non passa */
  assert.equal(descriviKernelCaricato({ percorso: 'C:\\altrove\\k.mjs', modulo: { talosLavora() {}, DESKTOP_BLACKBOX_HOTFIX_VERSION: 'x' }, daVariabile: true }).tipo, 'adattatore-desktop');
  assert.equal(descriviKernelCaricato({ percorso: ADATTATORE, modulo: { talosLavora() {} }, daVariabile: true }).tipo, 'base');

  const strano = descriviKernelCaricato({ percorso: 'C:\\altrove\\k.mjs', modulo: {}, daVariabile: true });
  assert.deepEqual({ tipo: strano.tipo, avviso: strano.avviso }, { tipo: 'sconosciuto', avviso: true });
  const nessuno = descriviKernelCaricato({ percorso: null, modulo: null, daVariabile: false });
  assert.deepEqual({ tipo: nessuno.tipo, avviso: nessuno.avviso }, { tipo: 'nessuno', avviso: true });
  const rotto = descriviKernelCaricato({ percorso: BASE, modulo: null, errore: new Error('SyntaxError: boom'), daVariabile: true });
  assert.deepEqual({ tipo: rotto.tipo, avviso: rotto.avviso }, { tipo: 'non-caricato', avviso: true });
  assert.match(rotto.riga, /could not be loaded/u);
});

async function portaLibera() {
  const s = createServer();
  await new Promise((fatto) => s.listen(0, '127.0.0.1', fatto));
  const { port } = s.address();
  await new Promise((fatto) => s.close(fatto));
  return port;
}

/** Avvia il server vero in una cartella di prova e ritorna ciò che ha scritto fino alla riga `[kernel]` (o fino al tempo massimo). */
async function avvia(t, variabile) {
  const radice = cartellaDiProva('talos-kernel-avvio-');
  const temp = join(radice, 'temp');
  mkdirSync(temp, { recursive: true });
  mkdirSync(join(radice, 'workspace'), { recursive: true });
  const porta = await portaLibera();
  const env = {
    ...process.env,
    TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_TOKEN: '',
    TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'),
    TALOS_DESKTOP_DATA_DIR: join(radice, 'desktop'), TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_HARNESS_UI_KEYRING_SCOPE: '', TALOS_SCRATCH_DIR: join(radice, 'scratch'),
    TEMP: temp, TMP: temp, TMPDIR: temp,
  };
  delete env.TALOS_OWNER_RUNTIME_MODULE;
  if (variabile) env.TALOS_OWNER_RUNTIME_MODULE = variabile;
  const figlio = spawn(process.execPath, ['server.mjs'], { cwd: RADICE, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  t.after(() => { figlio.kill(); });
  const scritto = { out: '', err: '' };
  figlio.stdout.on('data', (c) => { scritto.out += c; });
  figlio.stderr.on('data', (c) => { scritto.err += c; });
  for (let i = 0; i < 300 && figlio.exitCode === null; i += 1) {
    if (/^\[kernel\]/mu.test(scritto.out + '\n' + scritto.err)) break;
    await delay(100);
  }
  const righe = (testo) => testo.split(/\r?\n/u).filter((riga) => riga.startsWith('[kernel]'));
  assert.match(scritto.out, /Harness UI disponibile/u, `il server non è partito: ${(scritto.out + scritto.err).slice(-1500)}`);
  return { out: righe(scritto.out), err: righe(scritto.err) };
}

/* L3-9 (owner 13/10/2026, D7-bis: «di serie l'adattatore desktop»). Fino al lotto 2 questa prova chiedeva l'AVVISO del kernel di
   base: era il comportamento di allora, dichiarato. Ora il server a mano senza variabile carica ciò che carica il prodotto. */
test('KERNEL-AVVIO-02 — il server vero SENZA la variabile: carica l’ADATTATORE desktop, e la riga dice che è il valore di serie', async (t) => {
  const { out, err } = await avvia(t, null);
  assert.equal(err.length, 0, `nessun avviso: ${JSON.stringify(err)}`);
  assert.equal(out.length, 1, `una riga sola: ${JSON.stringify(out)}`);
  assert.match(out[0], /^\[kernel\] desktop adapter /u);
  assert.ok(out[0].includes(ADATTATORE), 'dice quale file ha caricato');
  assert.match(out[0], /TALOS_OWNER_RUNTIME_MODULE is not set: the desktop default/u);
});

test('KERNEL-AVVIO-02b, al contrario — il kernel di BASE resta chiedibile: con la variabile sul suo file parte quello, con l’avviso', async (t) => {
  const { out, err } = await avvia(t, BASE);
  assert.equal(out.length, 0);
  assert.equal(err.length, 1, `una riga sola: ${JSON.stringify(err)}`);
  assert.match(err[0], /^\[kernel\] WARNING: BASE kernel, NOT the desktop adapter/u);
  assert.ok(err[0].includes(BASE));
  assert.match(err[0], /chosen by TALOS_OWNER_RUNTIME_MODULE/u);
});

test('KERNEL-AVVIO-04 — il valore di serie: solo se la variabile manca, solo se il file c’è, e chi la imposta vince byte per byte', () => {
  const env = {};
  assert.deepEqual(applicaKernelDiSerieDesktop(env), { applicato: true, percorso: ADATTATORE });
  assert.equal(env.TALOS_OWNER_RUNTIME_MODULE, ADATTATORE);
  for (const vuota of ['', '   ']) { const e = { TALOS_OWNER_RUNTIME_MODULE: vuota }; assert.equal(applicaKernelDiSerieDesktop(e).applicato, true); assert.equal(e.TALOS_OWNER_RUNTIME_MODULE, ADATTATORE); }
  const scelta = { TALOS_OWNER_RUNTIME_MODULE: BASE };
  assert.deepEqual(applicaKernelDiSerieDesktop(scelta), { applicato: false, percorso: null });
  assert.equal(scelta.TALOS_OWNER_RUNTIME_MODULE, BASE);
  /* pacchetto tagliato: l'adattatore non c'è ⇒ non si inventa niente, vale la regola di prima (il kernel nel repo, da config.mjs) */
  const senza = {};
  assert.deepEqual(applicaKernelDiSerieDesktop(senza, { adattatore: join(RADICE, 'src', 'kernel', 'non-esiste.mjs') }), { applicato: false, percorso: null });
  assert.equal(Object.hasOwn(senza, 'TALOS_OWNER_RUNTIME_MODULE'), false);
  /* ⛔ importare il modulo NON tocca l'ambiente di chi lo importa (questa prova lo ha appena fatto): lo fa solo `.avvio.mjs` */
  assert.equal(process.env.TALOS_OWNER_RUNTIME_MODULE, AMBIENTE_PRIMA);
});

test('KERNEL-AVVIO-05 — TUTTO il processo del server vede lo stesso kernel: il valore di serie si applica PRIMA di ogni altro modulo', () => {
  /* (a) nell'ordine di server.mjs, l'adattatore del runtime creato SENZA modulePath (è così che lo crea agent-service.mjs per
         compattazione, comandi e ritenti) chiede di caricare l'adattatore desktop */
  const env = { ...process.env }; delete env.TALOS_OWNER_RUNTIME_MODULE;
  const figlio = spawnSync(process.execPath, [join(RADICE, 'tests', 'aiuto', 'figlio-kernel-di-serie.mjs')], { cwd: RADICE, env, encoding: 'utf8' });
  assert.equal(figlio.status, 0, figlio.stderr);
  assert.deepEqual(JSON.parse(figlio.stdout), { applicato: true, variabile: ADATTATORE, chiesto: pathToFileURL(ADATTATORE).href });
  /* (b) e in server.mjs quell'import sta prima di ogni altro modulo di src/ tranne la difesa della ricerca dei programmi */
  const importi = readFileSync(join(RADICE, 'server.mjs'), 'utf8').split(/\r?\n/u).filter((riga) => /^import .*['"]\.\/src\//u.test(riga));
  assert.match(importi[0], /difesa-ricerca-programmi\.mjs/u);
  assert.match(importi[1], /kernel-di-serie-desktop\.avvio\.mjs/u);
});

test('KERNEL-AVVIO-03, al contrario — il server vero CON l’adattatore: una riga normale, nessun avviso', async (t) => {
  const { out, err } = await avvia(t, ADATTATORE);
  assert.equal(err.length, 0, `nessun avviso: ${JSON.stringify(err)}`);
  assert.equal(out.length, 1);
  assert.match(out[0], /^\[kernel\] desktop adapter /u);
  assert.ok(out[0].includes(ADATTATORE));
});
