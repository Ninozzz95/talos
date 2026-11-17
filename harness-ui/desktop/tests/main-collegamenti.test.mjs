/*
 * Giro di sicurezza 4 (11/11/2026; controllore del giro 3, reperto C2) — I FILI DI `main.mjs`, provati facendolo GIRARE.
 *   Il controllore ha messo un `if` davanti a `isolaPagineRese(app.commandLine)` (C01) e davanti a `sorvegliaAnteprime(...)` (C02): nessuna
 *   prova diventava rossa, perché ART-GUSCIO-08 legge il testo di `main.mjs` e nessuna prova lo esegue. Il ritorno di N1 (una pagina che
 *   cade porta via le sorelle, e l'app non lo sa) sarebbe passato in silenzio.
 * ⇒ Qui `main.mjs` VERO gira sotto Node con un `electron` finto (`fixtures/electron-finto/`, agganciato con `module.register`) e un servizio
 *   locale finto su 127.0.0.1. Si guarda che cosa FA: chiede a Chromium un processo per pagina resa PRIMA di «ready», e quando il processo
 *   di un'anteprima cade avvisa il documento dell'app, una volta, col suo percorso. Niente Electron, niente finestre, profilo finto.
 * Concorrenti: Hermes prova la politica del guscio senza Electron, iniettando i pezzi (`apps/desktop/electron/window-renderer-lifecycle.ts:7-10`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { root } from './support.mjs';
import { ISOLAMENTO_PAGINE_RESE } from '../finestra-artefatto.mjs';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const registra = new URL('./fixtures/electron-finto/registra.mjs', import.meta.url);
const servizio = fileURLToPath(new URL('./fixtures/electron-finto/servizio/', import.meta.url));
const VIETATE = new Set([4174, 4181, 4391, 4392]);

async function portaLibera() {
  for (;;) {
    const porta = await new Promise((fatto, errore) => {
      const s = createServer();
      s.once('error', errore);
      s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => fatto(p)); });
    });
    if (!VIETATE.has(porta) && porta >= 1024) return porta;
  }
}

async function giraMain() {
  const prove = process.env.TALOS_PROVE_DIR || join(root, '.prove');
  mkdirSync(prove, { recursive: true });
  const cartella = mkdtempSync(join(prove, 'main-collegamenti-'));
  const dati = join(cartella, 'dati');
  mkdirSync(dati, { recursive: true });
  /* la porta del servizio finto la sceglie la prova (mai una di quelle dell'owner) e la scrive dove la cerca `scegliPortaPersistente` */
  writeFileSync(join(dati, 'desktop-origin.json'), JSON.stringify({ version: 1, port: await portaLibera() }));
  const uscita = join(cartella, 'rapporto.json');
  /* come `preparaRuntime`: nessuna chiave e nessuna variabile di TALOS arriva; il profilo è tutto nella cartella della prova */
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE|^PROVA_/iu.test(k)));
  Object.assign(env, { APPDATA: join(cartella, 'Roaming'), LOCALAPPDATA: join(cartella, 'Local'), TALOS_DESKTOP_DATA_DIR: dati,
    TALOS_DESKTOP_HARNESS_DIR: servizio.replace(/[\\/]$/u, ''), TALOS_HARNESS_UI_KEYRING: 'memoria', PROVA_USCITA: uscita,
    /* round k (11/11): the explicit test mark the product guard reads, as every rebuilt child env of the tests (MARK-REBUILD) */
    TALOS_PROVA_ISOLATA: '1' });
  const figlio = spawn(process.execPath, ['--import', registra.href, join(desktop, 'main.mjs')], { cwd: desktop, env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let errori = '';
  figlio.stderr.on('data', (d) => { errori = (errori + String(d)).slice(-3000); });
  const tetto = setTimeout(() => { try { figlio.kill(); } catch { /* già uscito */ } }, 40000);
  await once(figlio, 'exit');
  clearTimeout(tetto);
  let rapporto = null;
  try { rapporto = JSON.parse(readFileSync(uscita, 'utf8')); } catch { rapporto = null; }
  if (process.env.TALOS_PROVE_TIENI !== '1') { try { rmSync(cartella, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* un file ancora aperto */ } }
  return { rapporto, errori };
}

test('ART-GUSCIO-30 (giro 4, C2) main.mjs VERO, fatto girare: un processo per pagina resa chiesto prima di «ready», e l anteprima caduta detta al documento dell app', { timeout: 60000 }, async () => {
  const { rapporto: r, errori } = await giraMain();
  assert.ok(r, `main.mjs non ha scritto il rapporto: ${errori}`);
  assert.deepEqual(r.errori, [], 'main.mjs gira senza eccezioni');
  assert.deepEqual(r.dialoghi, [], 'il servizio finto è partito: nessun messaggio d errore');
  assert.equal(r.fine, 'copione', `il copione è arrivato in fondo (${r.fine})`);
  /* C01: l isolamento, chiesto UNA volta, prima di «ready» (dopo non varrebbe), col valore esatto */
  const isolamento = r.switch.filter((s) => s.nome === 'enable-features' && String(s.valore).split(',').includes(ISOLAMENTO_PAGINE_RESE));
  assert.equal(isolamento.length, 1, `oggi: ${JSON.stringify(r.switch)}`);
  assert.equal(isolamento[0].primaDiReady, true, 'Chromium legge le funzioni solo prima di «ready»');
  /* C02: la sorveglianza c è sulla principale, e funziona: il processo dell anteprima cade ⇒ UN avviso, alla cornice principale, col percorso */
  assert.equal(r.finestre, 1, 'una finestra: la principale');
  assert.ok(r.ascoltiCornici >= 1, 'qualcuno ascolta le cornici della principale');
  assert.deepEqual(r.avvisi, [{ dove: 'cornice-principale', percorso: true }], `oggi l anteprima caduta non si dice: ${JSON.stringify(r.copioni.map((c) => c.copione.slice(0, 60)))}`);
});

test('ART-GUSCIO-31 (giro 4, C2) l elettrone finto è davvero quello che main.mjs trova: l aggancio riguarda solo «electron»', async () => {
  const { resolve } = await import(new URL('./fixtures/electron-finto/aggancio.mjs', import.meta.url));
  const avanti = (s) => ({ url: `avanti:${s}` });
  assert.match((await resolve('electron', {}, avanti)).url, /electron-finto\/electron\.mjs$/u);
  assert.equal((await resolve('node:fs', {}, avanti)).url, 'avanti:node:fs');
  assert.equal((await resolve('electron-updater', {}, avanti)).url, 'avanti:electron-updater');
  assert.ok(pathToFileURL(join(desktop, 'main.mjs')).href.endsWith('/desktop/main.mjs'));
});
