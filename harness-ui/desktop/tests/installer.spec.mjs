import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { cpus, totalmem, version, release } from 'node:os';
import { root, attendi } from './support.mjs';
import { inventario, verificaImpronta } from '../scripts/prepara-pacchetto.mjs';

const require = createRequire(import.meta.url);
const attivo = process.platform === 'win32' && process.env.TALOS_R02_INSTALLER === '1';

async function finche(fn, timeout = 30000) {
  const inizio = Date.now();
  while (Date.now() - inizio < timeout) { const v = await fn(); if (v) return v; await attendi(100); }
  throw new Error(`Condizione non raggiunta entro ${timeout} ms.`);
}

function esegui(file, args, env, timeout = 120000) {
  return new Promise((ok, no) => {
    const p = spawn(file, args, { env, shell: false, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { p.kill(); no(Error('Installer/disinstallatore oltre il timeout.')); }, timeout);
    p.once('error', e => { clearTimeout(timer); no(e); });
    p.once('exit', code => { clearTimeout(timer); code === 0 ? ok() : no(Error(`Processo terminato con codice ${code}: ${file}`)); });
  });
}

function processiDaCartella(cartella) {
  const sicura = cartella.replaceAll("'", "''");
  const script = `Get-CimInstance Win32_Process | Where-Object { ($_.ExecutablePath -and $_.ExecutablePath.StartsWith('${sicura}\\', [StringComparison]::OrdinalIgnoreCase)) -or ($_.Name -like '*TALOS*.exe' -and $_.CommandLine -and $_.CommandLine.Contains('${sicura}')) } | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`;
  const p = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (p.error || p.status !== 0) throw Error('Impossibile verificare i processi installati.');
  return p.stdout.trim() ? [JSON.parse(p.stdout)].flat() : [];
}

test('R02-INSTALLER — installazione reale, cookie, PTY incluso, motori, persistenza e disinstallazione', { skip: !attivo, timeout: 240000 }, async () => {
  const { _electron } = require('../../frontend/node_modules/playwright');
  const installer = join(root, 'dist/TALOS-Setup-0.1.0.exe');
  const zip = join(root, 'dist/TALOS-0.1.0-win.zip');
  assert.ok(existsSync(installer) && existsSync(zip), 'Eseguire prima npm run dist.');
  const predefinita = join(process.env.LOCALAPPDATA, 'Programs', 'talos-desktop');
  const destinazione = process.env.TALOS_R02_INSTALL_DIR || predefinita;
  assert.ok(isAbsolute(destinazione), 'Cartella di installazione assoluta richiesta.');
  assert.equal(existsSync(destinazione), false, 'Installazione preesistente: non sovrascriverla.');
  // Difesa anche dal precedente nome tecnico usato dalle versioni NSIS upstream.
  assert.equal(existsSync(join(process.env.LOCALAPPDATA, 'Programs', 'TALOS')), false, 'Installazione TALOS preesistente.');
  const controlloRegistro = spawnSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'TALOS', '/d'], { encoding: 'utf8', windowsHide: true });
  assert.equal(controlloRegistro.status, 1, 'Registro TALOS esistente o controllo non eseguibile: interrompo prima di installare.');
  const desktop = spawnSync('powershell.exe', ['-NoProfile', '-Command', '[Environment]::GetFolderPath("DesktopDirectory")'], { encoding: 'utf8', windowsHide: true });
  assert.equal(desktop.status, 0, 'Impossibile risolvere il desktop Windows.');
  const collegamenti = [join(desktop.stdout.trim(), 'TALOS.lnk'), join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/TALOS.lnk')];
  for (const file of collegamenti) assert.equal(existsSync(file), false, `Collegamento esistente da preservare: ${file}`);
  mkdirSync(join(root, '.prove'), { recursive: true });
  const dataDir = mkdtempSync(join(root, '.prove', 'installato-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE/i.test(k)));
  Object.assign(env, { TALOS_DESKTOP_DATA_DIR: dataDir, TALOS_INTRO: '0' });
  writeFileSync(join(dataDir, 'da-conservare.txt'), 'Dati utente da conservare dopo la disinstallazione.');
  const misure = { data: new Date().toISOString(), macchina: { sistema: version(), release: release(), arch: process.arch, cpu: cpus()[0].model.trim(), processoriLogici: cpus().length, ramByte: totalmem() }, installazione: destinazione, dati: dataDir, overrideDestinazione: Boolean(process.env.TALOS_R02_INSTALL_DIR), exeByte: statSync(installer).size, zipByte: statSync(zip).size, completato: false };
  let app;
  let pidFiglio;
  let installazioneTentata = false;
  try {
    installazioneTentata = true;
    const inizioInstallazione = performance.now();
    await esegui(installer, ['/S', ...(process.env.TALOS_R02_INSTALL_DIR ? ['/D=' + destinazione] : [])], env);
    misure.installazioneMs = performance.now() - inizioInstallazione;
    const exe = join(destinazione, 'TALOS.exe');
    assert.ok(existsSync(exe), `EXE installato assente in ${destinazione}.`);
    const iniziale = await inventario(destinazione);
    assert.equal(iniziale.some(f => /^resources\/harness-ui\/\./.test(f.path)), false, 'Il pacchetto contiene dati di una prova precedente.');
    misure.installatoByte = iniziale.reduce((n, f) => n + f.bytes, 0);
    const risorse = join(destinazione, 'resources');
    const manifest = JSON.parse(readFileSync(join(risorse, 'MANIFEST.json'), 'utf8'));
    for (const file of manifest.files) await verificaImpronta(join(risorse, file.path), file.sha256);
    assert.equal(iniziale.some(f => /\.gguf$/i.test(f.path)), false);
    misure.manifestFile = manifest.files.length;
    const inizio = performance.now();
    app = await _electron.launch({ executablePath: exe, args: [], env, timeout: 30000 });
    const pagina = await app.firstWindow({ timeout: 30000 });
    misure.finestraCreataMs = performance.now() - inizio;
    await finche(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(w => w.isVisible())));
    misure.primaFinestraMs = performance.now() - inizio;
    misure.metodoTempo = 'performance.now dal lancio Playwright dell’EXE installato alla prima BrowserWindow visibile; nessun doppio clic manuale';
    const erroriPagina = []; pagina.on('pageerror', e => erroriPagina.push(e.message));
    await pagina.waitForURL(u => u.hostname === '127.0.0.1' && u.pathname === '/' && !u.search, { timeout: 30000 });
    await pagina.locator('body').waitFor({ state: 'visible' });
    misure.paginaProntaMs = performance.now() - inizio;
    const base = new URL(pagina.url()).origin;
    assert.notEqual(new URL(base).port, '4174'); misure.porta = Number(new URL(base).port);
    assert.equal((await fetch(base + '/api/v1/health')).status, 401);
    assert.equal(await pagina.evaluate(async () => (await fetch('/api/v1/health')).status), 200);
    assert.ok((await app.context().cookies()).find(c => c.name === 'talos_token')?.httpOnly);
    pidFiglio = await app.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess')?.pid);
    assert.ok(pidFiglio);
    misure.percorsi = await app.evaluate(({ app }) => ({ isPackaged: app.isPackaged, app: app.getAppPath(), risorse: process.resourcesPath, motore: process.env.TALOS_LLAMA_SERVER_PATH, userData: app.getPath('userData') }));
    assert.equal(misure.percorsi.isPackaged, true);
    assert.equal(misure.percorsi.userData, dataDir);
    assert.ok(misure.percorsi.motore.startsWith(join(risorse, 'local-runtime')));
    const runtimes = await pagina.evaluate(async () => (await fetch('/api/v1/runtime')).json());
    const items = runtimes.data?.items ?? runtimes.items;
    const locale = items.find(r => r.runtimeId === 'llama.cpp');
    assert.equal(locale?.state, 'observed'); assert.deepEqual(locale.models, []);
    assert.notEqual(locale.runtimeState, 'ready'); misure.motore = locale;
    misure.binari = {};
    for (const variante of ['cpu', 'vulkan']) {
      const p = spawnSync(join(risorse, 'local-runtime', variante, 'llama-server.exe'), ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 20000 });
      misure.binari[variante] = { codice: p.status, output: (p.stdout || '') + (p.stderr || '') };
      assert.equal(p.status, 0, `Binario ${variante} non eseguibile sul banco.`);
      assert.match(misure.binari[variante].output, /10517/);
    }
    let output = ''; const controlli = [];
    pagina.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
      const frame = Buffer.from(payload);
      if (frame[0] === 0) output += frame.subarray(1).toString();
      if (frame[0] === 1) { try { controlli.push(JSON.parse(frame.subarray(1).toString())); } catch {} }
    }));
    await pagina.locator('[data-mode="terminal"]').first().click();
    await pagina.locator('.xterm-helper-textarea').first().focus();
    await pagina.keyboard.type('echo TALOS-R02-INSTALLATO'); await pagina.keyboard.press('Enter');
    await finche(() => /(^|\n)TALOS-R02-INSTALLATO\r?\n/.test(output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')));
    await pagina.reload();
    assert.equal(await pagina.evaluate(async () => (await fetch('/api/v1/health')).status), 200);
    await pagina.locator('[data-mode="terminal"]').first().click();
    await pagina.locator('.xterm-helper-textarea').first().focus();
    await pagina.keyboard.type('exit'); await pagina.keyboard.press('Enter');
    await finche(() => controlli.some(c => c.evento === 'uscita' && c.codice === 0));
    misure.pty = { marker: 'TALOS-R02-INSTALLATO', uscita: 0 };
    await pagina.emulateMedia({ reducedMotion: 'reduce' });
    for (const [modo, nome] of [['light', 'chiaro'], ['dark', 'scuro']]) {
      await pagina.evaluate(modo => {
        const key = 'talos.harness.desktop.settings.v1'; const settings = JSON.parse(localStorage.getItem(key) || '{}');
        settings.appearance = { ...settings.appearance, colorMode: modo, themePreset: 'calm', themePresetVersione: 2 };
        localStorage.setItem(key, JSON.stringify(settings));
      }, modo);
      await pagina.reload();
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.talosTheme), 'calm');
      for (const size of [[1024, 800], [1440, 900]]) {
        await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), size);
        await attendi(500); await pagina.screenshot({ path: join(root, '.prove', `R02-${nome}-${size[0]}.png`) });
      }
    }
    await pagina.keyboard.press('Tab'); assert.equal(await pagina.evaluate(() => document.activeElement !== document.body), true);
    assert.deepEqual(erroriPagina, []); misure.erroriPagina = erroriPagina;
    await app.close(); app = null;
    await finche(() => { try { process.kill(pidFiglio, 0); return false; } catch (e) { return e.code === 'ESRCH'; } });
    // Scenario permanente: il backend non deve lasciare dati nell'albero del programma.
    const dopo = await inventario(destinazione);
    const prima = new Map(iniziale.map(f => [f.path, f.sha256]));
    misure.scrittureFuoriUserData = dopo.filter(f => prima.get(f.path) !== f.sha256).map(f => f.path);
    misure.flussiVerificati = true;
  } catch (e) { misure.errore = e.message.replace(/([?&]token=)[^\s&'"<>]+/g, '$1[omesso]'); throw e; }
  finally {
    if (app) { try { await app.close(); } catch {} }
    const disinstallatore = join(destinazione, 'Uninstall TALOS.exe');
    try {
      if (installazioneTentata && existsSync(disinstallatore)) {
        await esegui(disinstallatore, ['/S'], env);
        await finche(() => !existsSync(join(destinazione, 'TALOS.exe')), 60000);
        await finche(() => processiDaCartella(destinazione).length === 0, 30000);
        await finche(async () => !existsSync(destinazione) || (await inventario(destinazione)).length === 0, 30000);
        misure.processiResidui = processiDaCartella(destinazione);
        misure.fileResidui = existsSync(destinazione) ? await inventario(destinazione) : [];
        misure.datiConservati = existsSync(join(dataDir, 'da-conservare.txt'));
        misure.collegamentiResidui = collegamenti.filter(existsSync);
        const registroFinale = spawnSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'TALOS', '/d'], { encoding: 'utf8', windowsHide: true });
        misure.registroRimosso = registroFinale.status === 1;
        misure.disinstallato = true;
      }
    } catch (e) { misure.erroreDisinstallazione = e.message; }
    writeFileSync(join(root, '.prove/R02-installer.json'), JSON.stringify(misure, null, 2));
  }
  assert.equal(misure.disinstallato, true, misure.erroreDisinstallazione);
  assert.deepEqual(misure.fileResidui, [], 'File rimasti dopo la disinstallazione.');
  assert.equal(misure.datiConservati, true);
  assert.deepEqual(misure.collegamentiResidui, []);
  assert.equal(misure.registroRimosso, true);
  assert.deepEqual(misure.scrittureFuoriUserData, [], 'R02-DATI: il backend scrive ancora accanto al server; vedere il diff non applicato nel rapporto.');
  misure.completato = true;
  writeFileSync(join(root, '.prove/R02-installer.json'), JSON.stringify(misure, null, 2));
});
