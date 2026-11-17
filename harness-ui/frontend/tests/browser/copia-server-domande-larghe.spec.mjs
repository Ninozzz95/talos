import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

/*
 * 0.2.2-DL, giro 3 (revisione del 09/11/2026, reperto 4; decisione dell'owner delle 21:57) — IL PERCORSO VERO DELLA COPIA DEL SERVER
 *   nel browser. `playwright.config.mjs:255-257` semina la revisione vista al massimo (le prove condividono un server): così la suite
 *   non passa mai di qui. Questa prova avvia un server SUO su una cartella dei dati seminata come la lasciava la 0.2.0 (il file della
 *   copia senza timbro, col `userBubbleFullWidth:false` della prima apertura) e una finestra che aveva visto quella revisione:
 *   · senza ricevute: il server scarta il false, la pagina si apre ACCESA (la bolla a tutta larghezza);
 *   · con la ricevuta di un `set` del modello «true → false»: il false resta, la revisione avanza e la pagina si SPEGNE da sola.
 *   Il formato dei due file è quello scritto dal codice vero: `copia-finestra.mjs` (`salva`) e `servizio-impostazioni.mjs`
 *   (`nuovaRicevuta`, `scriviFile`).
 */
const harness = fileURLToPath(new URL('../../../', import.meta.url));
const REVISIONE_020 = 5;
const VISTA = 'talos.harness.desktop.settings.copy.v1';
const ASPETTO = 'talos.harness.desktop.settings.v1';

test.use({ viewport: { width: 1920, height: 1080 }, storageState: { cookies: [], origins: [] } });

async function portaLibera() {
  for (;;) {
    const socket = createServer();
    await new Promise((ok) => { socket.listen(0, '127.0.0.1', ok); });
    const porta = socket.address().port;
    await new Promise((ok) => { socket.close(ok); });
    if (![4174, 4181, 4391].includes(porta)) return porta;
  }
}

/** Un server di prova sulla cartella seminata: porta libera, solo 127.0.0.1, gettone, chiavi in memoria, nessun dato vero. */
async function avviaServer({ ricevute }) {
  const cartella = mkdtempSync(join(tmpdir(), 'dlb-')); // giro 6 (R-E): nel TEMP di chi lancia
  const progetti = join(cartella, 'progetti');
  mkdirSync(progetti);
  writeFileSync(join(cartella, '.preferenze-finestra.json'), `${JSON.stringify({ schema: 'talos.window-preferences.v1', revisione: REVISIONE_020,
    valori: { themePreset: 'forge', userBubbleFullWidth: false, chatFullWidth: false, uiLanguage: 'it' }, aggiornataIl: '2026-11-05T10:00:00.000Z' }, null, 1)}\n`);
  if (ricevute) writeFileSync(join(cartella, '.impostazioni-ricevute.json'), `${JSON.stringify({ schema: 'talos.app-settings.receipts.v1', ricevute, limiteRevisioni: 21000 }, null, 1)}\n`);
  const porta = await portaLibera();
  const gettone = randomBytes(24).toString('hex');
  const figlio = spawn(process.execPath, ['server.mjs'], { cwd: harness, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: {
    ...process.env, TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_SCRATCH_DIR: join(cartella, 'scratch'),
    TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_SEGRETI_DA: 'stdin',
    TALOS_HARNESS_UI_SESSIONS_DIR: cartella, TALOS_HARNESS_UI_PROJECT_DIRS: progetti, TALOS_DESKTOP_DATA_DIR: cartella,
    TALOS_HARNESS_UI_PUBLIC_DIR: resolve(harness, 'frontend/dist'),
  } });
  figlio.stdin.end(`TALOS_HARNESS_UI_TOKEN=${gettone}\n`);
  figlio.stdout.resume(); figlio.stderr.resume();
  const base = `http://127.0.0.1:${porta}`;
  await expect.poll(async () => { try { return (await fetch(`${base}/api/v1/health`, { headers: { Cookie: `talos_token=${gettone}` }, signal: AbortSignal.timeout(500) })).status; } catch { return 0; } }, { timeout: 30_000 }).toBe(200);
  const ferma = async () => { if (figlio.exitCode === null && figlio.signalCode === null) { const fine = new Promise((ok) => { figlio.once('exit', ok); }); figlio.kill(); await fine; } };
  return { base, gettone, cartella, ferma };
}

/** La finestra che aveva aperto TALOS con la 0.2.0: ha visto la revisione 5 e in locale non ha salvato la voce (salvataggio rado). */
async function apriComeDopoLAggiornamento(page, context, s) {
  await context.addCookies([{ name: 'talos_token', value: s.gettone, url: s.base, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(([vista, aspetto, revisione]) => {
    try {
      if (localStorage.getItem(vista) !== null) return; // solo la prima volta: la pagina poi scrive ciò che ha visto
      localStorage.setItem(vista, String(revisione));
      localStorage.setItem(aspetto, JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' } }));
      localStorage.setItem('talos.harness.desktop.barra.gruppi.v1', '{"lavoro":true}');
    } catch { /* storage assente */ }
  }, [VISTA, ASPETTO, REVISIONE_020]);
  await page.goto(s.base);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
}
const copiaDelServer = (page) => page.evaluate(async () => (await (await fetch('/api/v1/app-settings/window')).json()));
const sulDisco = (s) => JSON.parse(readFileSync(join(s.cartella, '.preferenze-finestra.json'), 'utf8'));

test('DL-COPIA-01 · 0.2.0 mai toccata (nessuna ricevuta): il server scarta il false e la pagina si apre ACCESA', async ({ page, context }) => {
  const s = await avviaServer({ ricevute: null });
  try {
    await apriComeDopoLAggiornamento(page, context, s);
    await expect.poll(() => page.evaluate((k) => Number(localStorage.getItem(k)), VISTA), { timeout: 15_000 }).toBe(REVISIONE_020 + 1);
    await expect(page.locator('html')).toHaveClass(/user-bubble-full-width/);
    const copia = await copiaDelServer(page);
    const dati = copia.data ?? copia;
    expect(dati.revisione).toBe(REVISIONE_020 + 1);
    expect(Object.hasOwn(dati.valori, 'userBubbleFullWidth')).toBe(false);
    expect(sulDisco(s).migrazioni).toEqual(['user-bubble-full-width-default-on-0.2.2']);
    expect(sulDisco(s).valori).toEqual({ themePreset: 'forge', chatFullWidth: false, uiLanguage: 'it' });
    await page.reload();
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await expect(page.locator('html')).toHaveClass(/user-bubble-full-width/);
  } finally { await s.ferma(); }
});

test('DL-COPIA-02 · 0.2.0 spenta dal modello (ricevuta «true → false»): il false resta, la revisione avanza e la pagina si SPEGNE', async ({ page, context }) => {
  const s = await avviaServer({ ricevute: [{
    id: 'set-0a1b2c3d4e5f', sessionId: null, quando: '2026-11-06T09:00:00.000Z', origine: { tipo: 'modello', sessionId: null, dispositivoId: null },
    confermatoDa: { tipo: 'finestra-pc' }, cambi: [{ chiave: 'appearance.userBubbleFullWidth', ambito: 'app', prima: true, dopo: false }], annullata: null,
  }] });
  try {
    await apriComeDopoLAggiornamento(page, context, s);
    await expect.poll(() => page.evaluate((k) => Number(localStorage.getItem(k)), VISTA), { timeout: 15_000 }).toBe(REVISIONE_020 + 1);
    await expect(page.locator('html')).not.toHaveClass(/user-bubble-full-width/);
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).appearance.userBubbleFullWidth, ASPETTO)).toBe(false);
    const dati = (await copiaDelServer(page)).data ?? (await copiaDelServer(page));
    expect(dati.valori.userBubbleFullWidth).toBe(false);
    await page.reload();
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await expect(page.locator('html')).not.toHaveClass(/user-bubble-full-width/);
  } finally { await s.ferma(); }
});
