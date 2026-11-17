import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, release, version } from 'node:os';
import { join } from 'node:path';
import { root, attendi, preparaRuntime, osservaTerminali, righeDelTerminale, controllaPaginaServita, lineeDelGancio, nessunPortachiaviVero, figlioColGancio } from './support.mjs';

const require = createRequire(import.meta.url);
const { _electron, request } = require('../../frontend/node_modules/playwright');
const executablePath = require('electron');

async function finche(fn, timeout = 15000) {
  const inizio = Date.now();
  while (Date.now() - inizio < timeout) { const dato = await fn(); if (dato) return dato; await attendi(100); }
  throw new Error('Condizione non raggiunta entro ' + timeout + ' ms.');
}

test('R01-GUSCIO — finestra reale, cookie, Terminale, temi, riavvio, vassoio, seconda istanza e chiusura', { timeout: 120000 }, async t => {
  const prova = preparaRuntime('guscio');
  const primaDelLancio = lineeDelGancio(); // round 3 (K1): the hook trace is read from here on, after the launches below
  const misure = { data: new Date().toISOString(), macchina: { sistema: version(), release: release(), arch: process.arch, cpu: cpus()[0].model.trim(), processoriLogici: cpus().length, ramByte: totalmem() }, launchPrimaFinestraMs: null, launchPaginaProntaMs: null, riposoMs: 3000, completato: false };
  let electronApp; let pidFiglio;
  const errori = [];
  const inizio = performance.now();
  try {
    electronApp = await _electron.launch({ executablePath, args: [root], env: prova.env, timeout: 20000 });
    electronApp.process().stderr.on('data', d => errori.push(String(d).replace(/([?&]token=)[^\s&'"<>]+/g, '$1[omesso]')));
    t.after(async () => { try { await electronApp.close(); } catch {} });
    /* 11/11/2026 (judge v1364 B2): the live positive check. The shell hands its child its own environment (`main.mjs:263`), so
       the shell's main process must hold the in-memory test keyring, or the child server opens the owner's real one. */
    assert.equal(await electronApp.evaluate(() => process.env.TALOS_HARNESS_UI_KEYRING), 'memoria', 'the shell under test must carry the in-memory test keyring');
    // 11/11/2026 (round 3, K1): the shell's main process loaded the keyring hook too (NODE_OPTIONS from tests/support.mjs).
    assert.equal(await electronApp.evaluate(() => Boolean(globalThis[Symbol.for('talos.prova.gancioPortachiavi')])), true, 'the shell under test must carry the keyring hook');
    await finche(async () => {
      pidFiglio = await electronApp.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess')?.pid);
      return pidFiglio;
    });
    // round 3 (K1): the server child of the shell wrote that it loaded the hook; nothing reached for the real keyring so far.
    await finche(() => figlioColGancio(pidFiglio, primaDelLancio), 10000).catch(() => { throw new Error('the server child of the shell does not carry the keyring hook'); });
    nessunPortachiaviVero(primaDelLancio);
    const pagina = await electronApp.firstWindow({ timeout: 25000 });
    misure.launchPrimaFinestraMs = performance.now() - inizio;
    const erroriPagina = [];
    pagina.on('pageerror', e => erroriPagina.push(e.message));
    await pagina.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 20000 });
    await pagina.locator('body').waitFor({ state: 'visible' });
    misure.launchPaginaProntaMs = performance.now() - inizio;
    /* 11/11/2026 (judge v1381 B9): a narrow trip wire. A copy that was never built serves the TRACKED page (`harness-ui/public`,
       frozen on 14/10), which invents the terminal id and gets a silent 403 two minutes later («La shell non ha disegnato il primo
       prompt»). Here the scripts the window really received are read once and the test stops at once, saying what to do. */
    controllaPaginaServita(await pagina.evaluate(() => Promise.all([...document.scripts].filter(s => s.src)
      .map(async s => ({ src: s.src, testo: await (await fetch(s.src)).text() })))));
    // 27/09: il tema di serie è Forge dal 24/09 (owner: «tema default forge»), lo stesso di frontend/src/avvio.js:59.
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.talosTheme), 'forge');
    const base = new URL(pagina.url()).origin;
    assert.notEqual(new URL(base).port, '4174');
    assert.equal((await fetch(base + '/api/v1/health')).status, 401);
    assert.equal(await pagina.evaluate(async () => (await fetch('/api/v1/health')).status), 200);
    const cookies = await electronApp.context().cookies();
    const cookie = cookies.find(c => c.name === 'talos_token');
    assert.ok(cookie?.httpOnly); assert.equal(cookie.sameSite, 'Strict');
    const protezioni = await electronApp.evaluate(({ BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, preload: p.preload };
    });
    assert.deepEqual(protezioni, { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: undefined });
    assert.equal(await pagina.evaluate(() => typeof window.require), 'undefined');
    await attendi(misure.riposoMs);
    misure.ram = await electronApp.evaluate(async ({ app }) => {
      const figlio = process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess');
      const risposta = new Promise(resolve => figlio.once('message', resolve));
      figlio.send({ tipo: 'misura' });
      return { main: process.memoryUsage(), processiGuscio: app.getAppMetrics(), figlio: await risposta };
    });
    // Invoca la vera azione del menu e intercetta soltanto il browser OS:
    // il contesto HTTP indipendente prova redirect e cookie senza esportare il segreto.
    await electronApp.evaluate(async ({ Menu, shell }) => {
      const originale = shell.openExternal;
      shell.openExternal = async url => { globalThis.r01Ingresso = url; };
      try { await Menu.getApplicationMenu().getMenuItemById('apri-browser').click(); }
      finally { shell.openExternal = originale; }
    });
    const ingresso = await electronApp.evaluate(() => globalThis.r01Ingresso);
    const altro = await request.newContext();
    try {
      const browser = await altro.get(ingresso);
      assert.equal(browser.url(), base + '/');
      assert.equal((await altro.get(base + '/api/v1/health')).status(), 200);
    } finally { await altro.dispose(); }
    /* ⛔ 01/10/2026, owner: «la app desktop non apre il browser per accedere a openrouter». Nella finestra VERA: un
       `window.open` della pagina d'accesso arriva a `shell.openExternal` anche dopo un'attesa (cioè senza il gesto della
       persona: il frontend lo chiama dopo la risposta del server); al contrario la finestra vuota e la pagina
       d'accesso con un ritorno estraneo restano negate e non escono. Il browser del sistema si intercetta, come sopra. */
    await electronApp.evaluate(({ shell }) => {
      globalThis.orAperti = [];
      globalThis.orOriginale = shell.openExternal;
      shell.openExternal = async url => { globalThis.orAperti.push(url); };
    });
    const accessoOpenRouter = 'https://openrouter.ai/auth?code_challenge=SFIDA&code_challenge_method=S256&key_label=TALOS';
    // il ritorno sul server di QUESTA app passa (il guscio conosce `base`); un ritorno estraneo no: quella pagina concede una chiave
    const conRitorno = r => `https://openrouter.ai/auth?callback_url=${encodeURIComponent(r)}&code_challenge=SFIDA&code_challenge_method=S256`;
    const accessoNostro = conRitorno(base + '/api/v1/auth/openrouter/ritorno/STATO');
    const accessoEstraneo = conRitorno('https://evil.example/api/v1/auth/openrouter/ritorno/STATO');
    const ritorni = await pagina.evaluate(async ([indirizzo, nostro, estraneo]) => {
      await new Promise(r => setTimeout(r, 300));
      return {
        vuota: window.open('', '_blank'),
        altra: window.open('https://openrouter.ai/settings/keys', '_blank', 'noopener,noreferrer'),
        estraneo: window.open(estraneo, '_blank', 'noopener,noreferrer'),
        accesso: window.open(indirizzo, '_blank', 'noopener,noreferrer'),
        nostro: window.open(nostro, '_blank', 'noopener,noreferrer'),
      };
    }, [accessoOpenRouter, accessoNostro, accessoEstraneo]);
    assert.deepEqual(ritorni, { vuota: null, altra: null, estraneo: null, accesso: null, nostro: null }, 'nessuna finestra nuova dentro la app');
    const aperti = await finche(async () => {
      const visti = await electronApp.evaluate(() => globalThis.orAperti);
      return visti.length >= 3 ? visti : null;
    }, 5000).catch(() => []);
    await attendi(300);
    /* 11/10/2026, decisione owner «Clic + conferma del sito» (`efba058c1`, `apribileNelBrowserDelSistema`): una pagina https NORMALE
       (`openrouter.ai/settings/keys`) ora esce nel browser — la conferma col sito la chiede l'interfaccia prima di aprirla. Restano
       negate la finestra vuota e la pagina che CONCEDE una chiave con un ritorno estraneo. Questa prova era rimasta al contratto di
       prima ed è diventata rossa sui cancelli della 0.1.29. */
    assert.deepEqual(await electronApp.evaluate(() => globalThis.orAperti), ['https://openrouter.ai/settings/keys', accessoOpenRouter, accessoNostro], `aperti fuori: ${JSON.stringify(aperti)}`);
    await electronApp.evaluate(({ shell }) => { shell.openExternal = globalThis.orOriginale; });
    // La UI esistente offre un terminale standalone senza chiamare alcun modello.
    const controlli = []; let uscitaPty = '';
    pagina.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
      const frame = Buffer.from(payload);
      if (frame[0] === 1) { try { controlli.push(JSON.parse(frame.subarray(1).toString())); } catch {} }
      else if (frame[0] === 0) uscitaPty += frame.subarray(1).toString('utf8'); // 13/09 review: xterm con WebGL disegna su canvas, niente .xterm-rows nel DOM — si legge il flusso PTY vero
    }));
    // BOOT-03 starts on Home: reach the real conversation before its mode switch.
    // 09/11/2026 r39b: dal 30/10 (variante D) il gruppo «Spazi di lavoro» nasce chiuso in un profilo nuovo; si apre prima del clic
    const testata = pagina.locator('#testataGruppoLavoro').first();
    if (await testata.getAttribute('aria-expanded') === 'false') await testata.click();
    await pagina.locator('.talos-sidebar [data-vaia="chat"]').first().click();
    assert.equal(await osservaTerminali(pagina), true, 'xterm caricato prima di aprire il Terminale');
    await pagina.locator('[data-mode="terminal"]').first().click();
    const tastiera = pagina.locator('.xterm-helper-textarea').first();
    await tastiera.waitFor({ state: 'attached' });
    /* 09/11/2026, R01-GUSCIO rosso su main (corsa 42660197808, qui alla riga dell'attesa: «Condizione non raggiunta entro 15000 ms»,
       e la foto al guasto mostrava già `TALOS-R01`). Due difetti dell'attesa, misurati nel worktree con la PTY vera:
       1) contava i 15 s da quando si scrive, ma Git Bash `--login` sotto carico disegna il primo prompt dopo più di 15 s (al guasto:
          flusso fermo al primo fotogramma vuoto della ConPTY, nessuna riga mostrata). Si aspetta l'evento giusto, il PRIMO PROMPT
          sullo schermo (una riga non vuota), e solo allora si scrive; la misura va in `misure.primoPromptMs`.
       2) cercava la riga nei byte della PTY togliendo solo le CSI, mentre la ConPTY mette il cambio di titolo (OSC 0) all'inizio di
          un suo fotogramma, anche davanti alla riga d'uscita. Si legge ciò che il terminale MOSTRA (`support.mjs`). Il comando cambia
          il titolo come fa il prompt di Git Bash, dopo mezzo secondo, così l'OSC cade davanti alla riga d'uscita a ogni corsa
          (misurato: `\r\n ESC[?2004l ESC]0;R01 BEL TALOS-R01\r\n`) e la lettura dei byte resterebbe rossa sempre. */
    /*CURA-R01-INIZIO*/
    const promptDa = performance.now();
    await finche(async () => (await righeDelTerminale(pagina)).some(riga => riga.trim()), 60000)
      // giro 2 (revisione 021-A, reperto H): al guasto anche i controlli del terminale (uscita, errori), come le due attese sotto
      .catch(errore => { throw new Error(`${errore.message} La shell non ha disegnato il primo prompt. Controlli: ${JSON.stringify(controlli)} Coda del flusso PTY: ${JSON.stringify(uscitaPty.slice(-1200))}`); });
    misure.primoPromptMs = Math.round(performance.now() - promptDa);
    await tastiera.focus(); await pagina.keyboard.type(String.raw`sleep 0.5; printf '\e]0;R01\a'; echo TALOS-R01`); await pagina.keyboard.press('Enter');
    await finche(async () => (await righeDelTerminale(pagina)).some(riga => riga.trim() === 'TALOS-R01')).catch(async errore => {
      const mostrate = (await righeDelTerminale(pagina).catch(() => [])).filter(riga => riga.trim()).slice(-8);
      throw new Error(`${errore.message} Righe mostrate: ${JSON.stringify(mostrate)} Coda del flusso PTY: ${JSON.stringify(uscitaPty.slice(-1200))}`);
    });
    /*CURA-R01-FINE*/
    await pagina.reload();
    assert.equal(await pagina.evaluate(async () => (await fetch('/api/v1/health')).status), 200);
    // BOOT-03 starts on Home: reach the real conversation before its mode switch.
    await pagina.locator('.talos-sidebar [data-vaia="chat"]').first().click();
    /* 09/11/2026, gemella della cura sopra: qui `exit` partiva subito dopo il clic, prima che la shell riagganciata fosse sullo
       schermo. Rossa 2 volte nel worktree (1 su 10 senza carico, 1 su 5 sotto carico) senza diagnosi; 20 corse strumentate senza
       carico non l'hanno rifatta, quindi la causa NON è misurata. Stesso schema del difetto 1: si aspetta lo schermo della shell
       (il server rigioca il suo arretrato all'aggancio) e solo allora si scrive; al guasto il messaggio porta righe, flusso e controlli. */
    assert.equal(await osservaTerminali(pagina), true, 'xterm caricato prima di riaprire il Terminale');
    await pagina.locator('[data-mode="terminal"]').first().click();
    await finche(async () => (await righeDelTerminale(pagina)).some(riga => riga.trim()), 60000)
      .catch(errore => { throw new Error(`${errore.message} La shell riagganciata non è comparsa. Controlli: ${JSON.stringify(controlli)}`); });
    await pagina.locator('.xterm-helper-textarea').first().focus();
    await pagina.keyboard.type('exit'); await pagina.keyboard.press('Enter');
    await finche(() => controlli.some(c => c.evento === 'uscita' && c.codice === 0)).catch(async errore => {
      const mostrate = (await righeDelTerminale(pagina).catch(() => [])).filter(riga => riga.trim()).slice(-8);
      throw new Error(`${errore.message} Righe mostrate: ${JSON.stringify(mostrate)} Controlli: ${JSON.stringify(controlli)} Coda del flusso PTY: ${JSON.stringify(uscitaPty.slice(-1200))}`);
    });
    await pagina.emulateMedia({ reducedMotion: 'reduce' });
    for (const [modo, nome] of [['light', 'chiaro'], ['dark', 'scuro']]) {
      await pagina.evaluate(modo => {
        const key = 'talos.harness.desktop.settings.v1';
        const settings = JSON.parse(localStorage.getItem(key) || '{}');
        settings.appearance = { ...settings.appearance, colorMode: modo, themePreset: 'calm', themePresetVersione: 2 };
        localStorage.setItem(key, JSON.stringify(settings));
      }, modo);
      await pagina.reload();
      // 27/09: la prima foto dopo il ricaricamento prendeva il velo d'avvio invece della app (a 1024, nei due temi):
      // si fotografa solo quando #talosAvvio è uscito dal DOM (frontend/src/avvio.js:98-113).
      await pagina.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
      for (const [width, height] of [[1024, 800], [1440, 900]]) {
        await electronApp.evaluate(({ BrowserWindow }, dimensioni) => BrowserWindow.getAllWindows()[0].setContentSize(...dimensioni), [width, height]);
        await attendi(500);
        await pagina.screenshot({ path: join(root, '.prove', 'R01-' + nome + '-' + width + '.png') });
      }
    }
    await pagina.keyboard.press('Tab');
    assert.equal(await pagina.evaluate(() => document.activeElement !== document.body), true);
    // Chiusura facoltativa nel vassoio e ripristino dalla seconda istanza.
    // 13/09 review: `MenuItem.click()` di Electron INVERTE da solo `checked` per le voci checkbox prima di
    // chiamare il nostro handler: impostare `checked = true` e poi cliccare la riportava a false. Si clicca
    // una volta sola, come farebbe la persona, e si legge lo stato risultante.
    assert.equal(await electronApp.evaluate(({ Menu }) => { const voce = Menu.getApplicationMenu().getMenuItemById('resta-vassoio'); voce.click(); return voce.checked; }), true);
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await finche(() => electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return Boolean(w) && !w.isVisible(); }));
    assert.equal(JSON.parse(readFileSync(join(prova.dataDir, 'window-state.json'))).restaNelVassoio, true);
    process.kill(pidFiglio, 0);
    const secondoInizio = performance.now();
    const seconda = spawn(executablePath, [root], { env: prova.env, stdio: 'ignore', windowsHide: true });
    const [codice] = await once(seconda, 'exit');
    misure.secondaIstanzaMs = performance.now() - secondoInizio;
    assert.equal(codice, 0);
    nessunPortachiaviVero(primaDelLancio); // round 3 (K1): the second instance too
    await finche(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible() && BrowserWindow.getAllWindows()[0].isFocused()));
    assert.equal(await electronApp.evaluate(() => process._getActiveHandles().filter(h => h.constructor.name === 'ChildProcess').length), 1);
    assert.equal(await electronApp.evaluate(({ Menu }) => { const voce = Menu.getApplicationMenu().getMenuItemById('resta-vassoio'); voce.click(); return voce.checked; }), false);
    const chiusa = electronApp.waitForEvent('close');
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await chiusa;
    assert.throws(() => process.kill(pidFiglio, 0), { code: 'ESRCH' });
    assert.deepEqual(erroriPagina, []);
    nessunPortachiaviVero(primaDelLancio);
    misure.completato = true;
  } catch (errore) {
    misure.errore = errore.message.replace(/([?&]token=)[^\s&'"<>]+/g, '$1[omesso]');
    try { const p = await electronApp?.firstWindow({ timeout: 2000 }); await p?.screenshot({ path: join(root, '.prove', 'R01-errore.png') }); misure.htmlAlGuasto = (await p?.evaluate(() => document.body.innerText.slice(0, 1500))) ?? null; } catch {} // 13/09 review: la foto del guasto
    throw errore;
  } finally {
    if (pidFiglio) {
      try {
        await finche(() => { try { process.kill(pidFiglio, 0); return false; } catch (e) { return e.code === 'ESRCH'; } }, 6500);
        misure.figlioDopoChiusura = 'ESRCH';
      } catch { misure.figlioDopoChiusura = 'ancora presente'; }
    }
    misure.stderr = errori.join('').slice(-12000);
    writeFileSync(join(root, '.prove', 'R01-misure.json'), JSON.stringify(misure, null, 2));
  }
});

test('R01-ARRESO — sei avvii reali falliti, dialogo italiano, registro e Riprova', { timeout: 60000 }, async t => {
  const prova = preparaRuntime('guasto');
  const primaDelLancio = lineeDelGancio(); // round 3 (K1): the hook trace is read from here on, after the launches below
  copyFileSync(join(root, 'tests', 'fixtures', 'figlio-guasto.mjs'), join(prova.runtime, 'server.mjs'));
  const electronApp = await _electron.launch({ executablePath, args: [join(root, 'tests', 'fixtures', 'avvio-guasto.mjs')], env: prova.env, timeout: 15000 });
  t.after(async () => { try { await electronApp.close(); } catch {} });
  await finche(() => electronApp.evaluate(() => globalThis.r01Dialoghi?.length), 30000);
  const primo = await electronApp.evaluate(() => globalThis.r01Dialoghi[0]);
  assert.deepEqual(primo.buttons, ['Riprova', 'Apri il registro', 'Esci']);
  assert.equal((readFileSync(join(prova.dataDir, 'registro.log'), 'utf8').match(/Servizio locale avviato/g) || []).length, 6);
  await electronApp.evaluate(() => globalThis.r01Rispondi(1));
  await finche(() => electronApp.evaluate(() => globalThis.r01RegistroAperto && globalThis.r01Dialoghi.length === 2));
  copyFileSync(join(root, '..', 'server.mjs'), join(prova.runtime, 'server.mjs'));
  await electronApp.evaluate(() => globalThis.r01Rispondi(0));
  await finche(() => /Stato: pronto/.test(readFileSync(join(prova.dataDir, 'registro.log'), 'utf8')), 20000);
  nessunPortachiaviVero(primaDelLancio); // round 3 (K1): no process of this test reached for the real keyring
});
