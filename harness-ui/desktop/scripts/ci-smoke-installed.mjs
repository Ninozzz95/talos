import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const attendi = ms => new Promise(r => setTimeout(r, ms));

export async function provaInstallato({ executablePath, dataDir }) {
  const { _electron } = createRequire(import.meta.url)('../../frontend/node_modules/playwright');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE/i.test(k)));
  Object.assign(env, { TALOS_DESKTOP_DATA_DIR: resolve(dataDir), TALOS_INTRO: '0' });
  let app;
  let pidFiglio;
  const inizio = performance.now();
  const misure = {};
  try {
    app = await _electron.launch({ executablePath: resolve(executablePath), args: [], env, timeout: 45000 });
    const pagina = await app.firstWindow({ timeout: 45000 });
    await pagina.waitForURL(u => u.hostname === '127.0.0.1' && u.pathname === '/' && !u.search, { timeout: 45000 });
    await pagina.locator('body').waitFor({ state: 'visible' });
    const base = new URL(pagina.url()).origin;
    assert.notEqual(new URL(base).port, '4174');
    misure.porta = Number(new URL(base).port);
    misure.avvioMs = Math.round(performance.now() - inizio);
    const percorsi = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, risorse: process.resourcesPath, dati: app.getPath('userData') }));
    assert.equal(percorsi.packaged, true, 'Lo smoke deve avviare il pacchetto installato.');
    assert.equal(resolve(percorsi.risorse).toLowerCase(), join(dirname(resolve(executablePath)), 'resources').toLowerCase());
    assert.equal(resolve(percorsi.dati).toLowerCase(), resolve(dataDir).toLowerCase());
    pidFiglio = await app.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess')?.pid);
    assert.ok(pidFiglio, 'Backend figlio assente.');
    misure.pidFiglio = pidFiglio;
    const cookie = (await app.context().cookies()).find(c => c.name === 'talos_token');
    assert.ok(cookie?.httpOnly);
    assert.equal(cookie.sameSite, 'Strict');
    // Il valore della credenziale resta nel browser. Non finisce nel report né negli argomenti.
    misure.cookie = { nome: cookie.name, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite };
    misure.healthSenzaCookie = (await fetch(base + '/api/v1/health', { signal: AbortSignal.timeout(5000), redirect: 'error' })).status;
    assert.equal(misure.healthSenzaCookie, 401);
    misure.healthConCookie = await pagina.evaluate(async () => (await fetch('/api/v1/health', { signal: AbortSignal.timeout(5000) })).status);
    assert.equal(misure.healthConCookie, 200);
    await pagina.reload();
    misure.healthDopoReload = await pagina.evaluate(async () => (await fetch('/api/v1/health', { signal: AbortSignal.timeout(5000) })).status);
    assert.equal(misure.healthDopoReload, 200);
  } finally {
    if (app) {
      const chiusura = performance.now();
      await app.close();
      misure.chiusuraMs = Math.round(performance.now() - chiusura);
    }
  }
  const scadenza = Date.now() + 10000;
  let presente = true;
  while (presente && Date.now() < scadenza) {
    try { process.kill(pidFiglio, 0); await attendi(100); }
    catch (e) { if (e.code !== 'ESRCH') throw e; presente = false; }
  }
  assert.equal(presente, false, 'Il backend è rimasto attivo dopo la chiusura.');
  return { ...misure, completato: true };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [exe, dati, report] = process.argv.slice(2);
  try {
    if (!exe || !dati || !report) throw Error('Richiesti EXE installato, cartella dati e rapporto.');
    await writeFile(report, JSON.stringify(await provaInstallato({ executablePath: exe, dataDir: dati }), null, 2));
  } catch (e) {
    // Playwright può includere l'URL di navigazione nell'errore: omettere tutte le credenziali.
    const errore = e.message.replace(/([?&]token=)[^\s&'"<>]+/gi, '$1[omesso]').replace(/talos_token=[^\s;]+/gi, 'talos_token=[omesso]');
    if (report) await writeFile(report, JSON.stringify({ completato: false, errore }, null, 2));
    console.error('Smoke dell’eseguibile installato fallito; vedere il rapporto isolato.');
    process.exitCode = 1;
  }
}
