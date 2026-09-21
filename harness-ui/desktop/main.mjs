import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, Menu, powerMonitor, screen, shell, Tray } from 'electron';
import { creaCicloDiVita } from './lifecycle.mjs';
import { leggiStatoFinestra, salvaStatoFinestra } from './window-state.mjs';
import { creaAvvioFiglio, risolviPercorsi, scegliMotoreLocale, scegliPortaEffimera, urlIngresso, validaHandshake } from './runtime.mjs';
import { creaRegistro } from './log.mjs';
import { desktopProfile } from './profile.mjs';

const packageMetadata = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'));
const profile = desktopProfile({ metadata: packageMetadata, env: process.env, appData: app.getPath('appData') });
app.setName(profile.name);
if (process.platform === 'win32') app.setAppUserModelId(profile.appId);
// Set both paths before the single-instance lock and before Chromium creates a session.
mkdirSync(profile.dataDir, { recursive: true });
mkdirSync(profile.sessionData, { recursive: true });
app.setPath('userData', profile.dataDir);
app.setPath('sessionData', profile.sessionData);
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('lang', 'it');
/*
 * ⛔ (16/09/2026) — LA PULIZIA ALLA DISINSTALLAZIONE (bug 2, gamba 2b). L'uninstaller lancia
 * `TALOS.exe --talos-pulizia-dati` con ExecWait PRIMA di cancellare i file, SOLO se l'utente ha
 * chiesto di eliminare dati e chiavi. Qui si esegue la routine (src/pulizia-dati.mjs, spedita
 * col pacchetto: vedi staging di prepara-pacchetto.mjs) e si esce col suo codice: 0 = tutto
 * pulito, non-0 = fallimento onesto che l'uninstaller mostra e che gli impedisce di cancellare
 * i dati (una pulizia a metà non si nasconde). Il ramo sta PRIMA del lock a istanza singola e
 * di qualunque finestra: questa non è una sessione, è una pulizia — e deve poter girare anche
 * se un'altra istanza fosse rimasta appesa.
 */
if (profile.preview && process.argv.includes('--talos-pulizia-dati')) {
  console.error('La preview non esegue la pulizia dei dati o delle credenziali di TALOS Desktop.');
  app.exit(1);
} else if (process.argv.includes('--talos-pulizia-dati')) {
  void (async () => {
    try {
      const percorsi = risolviPercorsi({ appPath: app.getAppPath(), isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });
      const { puliziaDatiDesktop } = await import(pathToFileURL(join(percorsi.root, 'src', 'pulizia-dati.mjs')).href);
      const esito = await puliziaDatiDesktop();
      app.exit(esito.ok ? 0 : 1);
    } catch (errore) {
      console.error('Pulizia dati non riuscita: ' + (errore?.message ?? errore));
      app.exit(1);
    }
  })();
} else if (!app.requestSingleInstanceLock()) app.exit(0);
else avviaGuscio();

function avviaGuscio() {
  const dataDir = app.getPath('userData');
  mkdirSync(dataDir, { recursive: true });
  const fileStato = join(dataDir, 'window-state.json');
  const fileRegistro = join(dataDir, 'registro.log');
  const token = randomBytes(32).toString('hex');
  const segreti = Object.entries(process.env).filter(([k]) => /TOKEN|KEY|SECRET|PASSWORD/i.test(k)).map(([, v]) => v);
  const registro = creaRegistro(fileRegistro, [token, ...segreti]);
  const cartellaHandshake = mkdtempSync(join(dataDir, 'avvio-'));
  const figli = new Set();
  let finestra = null; let vassoio = null; let base = null;
  let staUscendo = false; let uscitaPronta = false; let dialogoAperto = false;
  let generazione = 0; let generazioneMostrata = 0;
  let restaNelVassoio = leggiStatoFinestra(fileStato).restaNelVassoio;
  let motoreLocalePreferito = leggiStatoFinestra(fileStato).motoreLocale;
  let cambioMotoreInCorso = false;
  const attendi = ms => new Promise(r => setTimeout(r, ms));

  function salva() {
    try {
      const stato = finestra && !finestra.isDestroyed()
        ? { ...finestra.getNormalBounds(), massimizzata: finestra.isMaximized() }
        : leggiStatoFinestra(fileStato);
      salvaStatoFinestra(fileStato, { ...stato, restaNelVassoio, motoreLocale: motoreLocalePreferito });
    } catch { registro.scrivi('Impossibile salvare la posizione della finestra.'); }
  }

  async function fermaFiglio(handle) {
    if (!handle || handle.terminato) return;
    if (handle.chiusura) return handle.chiusura;
    handle.chiusura = new Promise(resolve => {
      const fine = () => { clearTimeout(forza); resolve(); };
      const forza = setTimeout(() => { try { handle.proc.kill(); } catch { /* già uscito */ } }, 5000);
      handle.proc.once('exit', fine);
      handle.proc.once('error', fine);
      if (handle.proc.connected) handle.proc.send({ tipo: 'chiudi' }, errore => {
        if (errore) { try { handle.proc.kill(); } catch { /* già uscito */ } }
      });
      else { try { handle.proc.kill(); } catch { fine(); } }
    });
    return handle.chiusura;
  }

  async function salute(handle) {
    const scadenza = Date.now() + 30000;
    while (!staUscendo && !handle.terminato && Date.now() < scadenza) {
      try {
        const dati = JSON.parse(readFileSync(handle.reportFile, 'utf8'));
        const indirizzo = validaHandshake(dati, handle.port);
        const risposta = await fetch(indirizzo + '/api/v1/health', {
          headers: { cookie: 'talos_token=' + token }, signal: AbortSignal.timeout(1500), redirect: 'error',
        });
        if (risposta.status === 200 && !handle.terminato && !staUscendo) { base = indirizzo; return true; }
      } catch { /* handshake incompleto o salute non ancora disponibile */ }
      await attendi(100);
    }
    return false;
  }

  async function apriRegistro() {
    const errore = await shell.openPath(fileRegistro);
    if (errore) await dialog.showMessageBox({ type: 'error', title: 'TALOS', message: 'Non riesco ad aprire il registro.', detail: 'Puoi leggerlo in ' + fileRegistro, buttons: ['Chiudi'] });
  }

  async function mostraErrore() {
    if (dialogoAperto || staUscendo) return;
    dialogoAperto = true;
    try {
      let risposta;
      do {
        risposta = (await dialog.showMessageBox({ type: 'error', title: 'TALOS', message: 'TALOS non riesce ad avviare il servizio locale.',
          detail: 'I tentativi automatici sono terminati. Puoi riprovare oppure aprire il registro per vedere che cosa è successo.',
          buttons: ['Riprova', 'Apri il registro', 'Esci'], defaultId: 0, cancelId: 2, noLink: true })).response;
        if (risposta === 1) await apriRegistro();
      } while (risposta === 1 && !staUscendo);
      dialogoAperto = false;
      if (!staUscendo && risposta === 0) await ciclo.riprova();
      else if (!staUscendo) app.quit();
    } catch { registro.scrivi('Impossibile mostrare il messaggio di errore.'); app.quit(); }
    finally { dialogoAperto = false; }
  }

  const ciclo = creaCicloDiVita({
    avviaFiglio: async () => {
      await Promise.all([...figli].filter(h => h.chiusura).map(h => h.chiusura));
      if (staUscendo) throw new Error('Chiusura in corso.');
      const percorsi = risolviPercorsi({ appPath: app.getAppPath(), isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, harnessDir: process.env.TALOS_DESKTOP_HARNESS_DIR });
      const motoreLocale = scegliMotoreLocale({ percorsi, preferenza: motoreLocalePreferito });
      if (motoreLocale) registro.scrivi('Motore locale: ' + JSON.stringify(motoreLocale));
      if (!existsSync(percorsi.server)) throw new Error('Il servizio locale manca dal pacchetto.');
      const port = await scegliPortaEffimera();
      if (staUscendo) throw new Error('Chiusura in corso.');
      const reportFile = join(cartellaHandshake, 'figlio-' + (++generazione) + '.json');
      const avvio = creaAvvioFiglio({ execPath: process.execPath, percorsi, port, token, reportFile, dataDir, motoreLocale, keyringScope: profile.keyringScope });
      const proc = spawn(avvio.command, avvio.args, avvio.options);
      const handle = { proc, port, reportFile, generazione, terminato: false, get exitCode() { return proc.exitCode; } };
      figli.add(handle);
      const uscita = registro.canale(); const errori = registro.canale();
      proc.stdout.on('data', chunk => uscita.scrivi(chunk)); proc.stderr.on('data', chunk => errori.scrivi(chunk));
      proc.once('close', () => { uscita.fine(); errori.fine(); });
      const terminato = codice => {
        handle.terminato = true; figli.delete(handle);
        registro.scrivi('Servizio locale terminato (' + (codice ?? 'errore') + '), generazione ' + handle.generazione + '.');
        if (ciclo.handle() === handle) ciclo.figlioUscito(codice);
      };
      proc.once('exit', terminato);
      proc.once('error', errore => { registro.scrivi('Avvio figlio fallito: ' + (errore.code ?? 'errore')); terminato(null); });
      registro.scrivi('Servizio locale avviato: pid ' + proc.pid + ', porta ' + port + ', generazione ' + generazione + '.');
      return handle;
    },
    uccidiFiglio: fermaFiglio, attendiSalute: salute,
    onStato: (stato, dettaglio) => {
      registro.scrivi('Stato: ' + stato + ' ' + (dettaglio ? JSON.stringify(dettaglio) : ''));
      if (vassoio) creaMenu();
      if (stato === 'pronto') void mostraOAggiorna().catch(() => { registro.scrivi('Impossibile aprire la finestra.'); app.quit(); });
      if (stato === 'arreso') void mostraErrore();
    },
    onAvviso: messaggio => registro.scrivi(messaggio),
  });

  async function apriBrowser() {
    if (!base || ciclo.stato() !== 'pronto') {
      await dialog.showMessageBox({ title: 'TALOS', message: 'TALOS si sta avviando. Riprova fra poco.', buttons: ['Chiudi'] });
      return;
    }
    try { await shell.openExternal(urlIngresso(base, token)); }
    catch { registro.scrivi('Apertura browser non riuscita.'); await dialog.showMessageBox({ type: 'error', title: 'TALOS', message: 'Non riesco ad aprire il browser. Controlla il browser predefinito e riprova.', buttons: ['Chiudi'] }); }
  }

  function portaDavanti() {
    if (!finestra || finestra.isDestroyed()) return;
    if (finestra.isMinimized()) finestra.restore();
    finestra.show(); finestra.focus();
  }

  async function cambiaMotoreLocale(preferenza) {
    if (cambioMotoreInCorso || staUscendo || preferenza === motoreLocalePreferito) return;
    cambioMotoreInCorso = true;
    motoreLocalePreferito = preferenza; salva(); creaMenu();
    registro.scrivi('Preferenza manuale del motore locale: ' + preferenza + '. Riavvio del servizio; ricaricare il modello scelto.');
    try { await ciclo.riavvia(); }
    catch (errore) { registro.scrivi('Cambio motore non riuscito: ' + errore.message); }
    finally { cambioMotoreInCorso = false; if (!staUscendo) creaMenu(); }
  }

  function creaMenu() {
    const motore = () => ({ label: 'Motore locale', submenu: [
      ['auto', 'Automatico'], ['vulkan', 'Scheda grafica (Vulkan)'], ['cpu', 'Processore'],
    ].map(([valore, label]) => ({ id: 'motore-' + valore, label, type: 'radio', checked: motoreLocalePreferito === valore,
      enabled: !cambioMotoreInCorso && !['avvio', 'in-chiusura'].includes(ciclo.stato()), click: () => { void cambiaMotoreLocale(valore); } })) });
    const azioni = () => [
      { id: 'apri-talos', label: 'Apri TALOS', click: portaDavanti },
      { id: 'apri-browser', label: 'Apri nel browser', click: apriBrowser },
      motore(),
      { type: 'separator' },
      { id: 'esci', label: 'Esci', click: () => app.quit() },
    ];
    vassoio.setContextMenu(Menu.buildFromTemplate(azioni()));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'TALOS', submenu: [
        ...azioni().slice(0, 3), { type: 'separator' },
        { id: 'resta-vassoio', label: 'Resta nel vassoio alla chiusura', type: 'checkbox', checked: restaNelVassoio,
          click: voce => { restaNelVassoio = voce.checked; salva(); } },
        { label: 'Apri il registro', click: apriRegistro }, { type: 'separator' }, azioni().at(-1),
      ] },
      { label: 'Modifica', submenu: [
        { label: 'Annulla', role: 'undo' }, { label: 'Ripeti', role: 'redo' }, { type: 'separator' },
        { label: 'Taglia', role: 'cut' }, { label: 'Copia', role: 'copy' }, { label: 'Incolla', role: 'paste' }, { label: 'Seleziona tutto', role: 'selectAll' },
      ] },
      { label: 'Visualizza', submenu: [{ label: 'Ricarica', role: 'reload' }, { label: 'Ingrandisci', role: 'zoomIn' }, { label: 'Riduci', role: 'zoomOut' }, { label: 'Dimensione originale', role: 'resetZoom' }] },
    ]));
  }

  async function mostraOAggiorna() {
    if (!base || staUscendo) return;
    if (!finestra || finestra.isDestroyed()) {
      const stato = leggiStatoFinestra(fileStato, screen.getAllDisplays().map(d => d.workArea));
      finestra = new BrowserWindow({
        width: stato.width, height: stato.height, x: stato.x, y: stato.y, minWidth: 900, minHeight: 600,
        title: profile.name, show: false, backgroundColor: '#1e1f22', icon: join(app.getAppPath(), 'assets', 'talos.png'),
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      const questa = finestra;
      if (stato.massimizzata) questa.maximize();
      questa.once('ready-to-show', () => { if (!staUscendo && !questa.isDestroyed()) questa.show(); });
      if (profile.preview) questa.webContents.on('page-title-updated', (event, title) => { event.preventDefault(); questa.setTitle(`${profile.name} — ${title}`); });
      questa.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const controllaNavigazione = (evento, destinazione) => {
        try { if (new URL(destinazione).origin === base) return; } catch { /* URL non valido */ }
        evento.preventDefault();
      };
      questa.webContents.on('will-navigate', controllaNavigazione);
      questa.webContents.on('will-redirect', controllaNavigazione);
      let timer;
      const salvaDifferito = () => { clearTimeout(timer); timer = setTimeout(salva, 300); };
      for (const evento of ['resize', 'move', 'maximize', 'unmaximize']) questa.on(evento, salvaDifferito);
      questa.on('close', evento => {
        clearTimeout(timer); salva();
        if (!staUscendo && restaNelVassoio) { evento.preventDefault(); questa.hide(); }
      });
      questa.on('closed', () => { clearTimeout(timer); finestra = null; });
    }
    if (generazioneMostrata !== generazione) {
      await finestra.loadURL(urlIngresso(base, token));
      generazioneMostrata = generazione;
      registro.scrivi('Finestra pronta, credenziale nel cookie.');
    }
  }

  app.on('second-instance', () => { registro.scrivi('Seconda istanza: riporto TALOS davanti.'); portaDavanti(); });
  app.on('activate', portaDavanti);
  app.on('window-all-closed', () => { if (!restaNelVassoio || staUscendo) app.quit(); });
  app.on('before-quit', evento => {
    if (uscitaPronta) return;
    evento.preventDefault();
    if (staUscendo) return;
    staUscendo = true; salva(); ciclo.chiudi();
    void (async () => {
      await Promise.all([...figli].map(fermaFiglio));
      if (vassoio && !vassoio.isDestroyed()) vassoio.destroy();
      // Cartella creata dal guscio sotto il proprio userData.
      try { rmSync(cartellaHandshake, { recursive: true, force: true }); } catch { registro.scrivi('Pulizia file di avvio non riuscita.'); }
      uscitaPronta = true; app.quit();
    })();
  });
  app.whenReady().then(async () => {
    vassoio = new Tray(join(app.getAppPath(), 'assets', 'talos-tray.png'));
    vassoio.setToolTip(profile.name); vassoio.on('double-click', portaDavanti); creaMenu();
    powerMonitor.on('suspend', () => ciclo.sospendi());
    powerMonitor.on('resume', () => { void ciclo.riprendi(); });
    await ciclo.avvia();
  }).catch(errore => { registro.scrivi('Avvio fallito: ' + errore.message); void mostraErrore(); });
}
