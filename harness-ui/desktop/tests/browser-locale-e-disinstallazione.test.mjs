import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync as cpReale, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync as renameReale, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopProfile } from '../profile.mjs';
import { FILE_SEGNO_MIGRAZIONE, migraDatiBrowser } from '../migrazione-browser.mjs';

/*
 * Corsia SCRATCH, 24/09/2026 — le tre risposte dell'owner alle domande della prima consegna:
 * (1) alla disinstallazione la radice dei temporanei si toglie SEMPRE, i dati restano una scelta dell'utente;
 * (2) la cache di Chromium lascia Roaming per %LOCALAPPDATA%\TALOS, con migrazione automatica e mai perdita;
 * (3) il profilo del browser pilotato va sotto la radice (provato in tests/scratch.test.mjs, SCRATCH-10).
 */
const qui = dirname(fileURLToPath(import.meta.url));
const desktop = join(qui, '..');
const nsh = readFileSync(join(desktop, 'assets', 'installer.nsh'), 'utf8');
const main = readFileSync(join(desktop, 'main.mjs'), 'utf8');
const appData = 'C:\\Users\\P\\AppData\\Roaming';
const localAppData = 'C:\\Users\\P\\AppData\\Local';

const cartelle = [];
test.after(() => { for (const c of cartelle) rmSync(c, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); });
function prova() { const c = mkdtempSync(join(tmpdir(), 'talos-browser-locale-')); cartelle.push(c); return c; }
function corpoMacro(nome) {
  const inizio = nsh.indexOf(`!macro ${nome}\n`);
  assert.ok(inizio > -1, `macro ${nome} assente`);
  return nsh.slice(inizio, nsh.indexOf('!macroend', inizio));
}

test('BROWSER-LOCALE-01 — la sessione di Chromium sta in %LOCALAPPDATA%\\<nome>\\browser; le preferenze di TALOS restano in Roaming', () => {
  const p = desktopProfile({ appData, localAppData, platform: 'win32' });
  assert.equal(p.dataDir, appData + '\\TALOS', 'la cartella dati delle preferenze resta dov\'è');
  assert.equal(p.sessionData, localAppData + '\\TALOS\\browser');
  assert.equal(p.sessionDataPrecedente, appData + '\\TALOS', 'da dove migrare: la vecchia sessionData coincideva con i dati');
  // la sotto-cartella evita lo scontro, su un NTFS senza maiuscole, fra la «Cache» di Chromium e la nostra «cache\\scratch»
  assert.notEqual(p.sessionData.toLowerCase(), (localAppData + '\\TALOS').toLowerCase());
  assert.ok(!p.scratchDir.toLowerCase().startsWith(p.sessionData.toLowerCase()), 'la radice dei temporanei non sta dentro la sessione di Chromium');
  const preview = desktopProfile({ appData, localAppData, metadata: { talosProfile: 'preview' }, platform: 'win32' });
  assert.equal(preview.sessionData, localAppData + '\\TALOS Preview\\browser');
  assert.equal(preview.sessionDataPrecedente, appData + '\\TALOS Preview\\browser');
});

test('BROWSER-LOCALE-02 — cartella dati spostata o nessun LOCALAPPDATA: la sessione resta dov\'era, niente da migrare', () => {
  const spostata = desktopProfile({ appData, localAppData, env: { TALOS_DESKTOP_DATA_DIR: 'D:\\Dati' }, platform: 'win32' });
  assert.equal(spostata.sessionData, 'D:\\Dati'); assert.equal(spostata.sessionDataPrecedente, null);
  const senza = desktopProfile({ appData, platform: 'win32' });
  assert.equal(senza.sessionData, senza.dataDir); assert.equal(senza.sessionDataPrecedente, null);
});

function vecchiaCartella() {
  const base = prova();
  const da = join(base, 'Roaming', 'TALOS'); const a = join(base, 'Local', 'TALOS', 'browser');
  for (const d of ['Local Storage', 'Cache', 'Network', 'sessions', '.notes-store']) mkdirSync(join(da, d), { recursive: true });
  writeFileSync(join(da, 'Local Storage', 'leveldb.log'), 'tema=scuro');
  writeFileSync(join(da, 'Local State'), '{}');
  writeFileSync(join(da, 'window-state.json'), '{}');
  writeFileSync(join(da, 'sessions', 's1.jsonl'), 'x');
  return { da, a };
}

test('BROWSER-LOCALE-03 — la migrazione sposta SOLO le voci di Chromium, lascia i file di TALOS, scrive il segno e non si ripete', () => {
  const { da, a } = vecchiaCartella();
  const esito = migraDatiBrowser({ da, a });
  assert.equal(esito.stato, 'migrata'); assert.equal(esito.cartella, a);
  assert.deepEqual(esito.spostate.sort(), ['Cache', 'Local State', 'Local Storage', 'Network']);
  assert.equal(readFileSync(join(a, 'Local Storage', 'leveldb.log'), 'utf8'), 'tema=scuro', 'i dati arrivano intatti');
  assert.deepEqual(readdirSync(da).sort(), ['.notes-store', 'sessions', 'window-state.json'], 'i file di TALOS restano in Roaming');
  assert.ok(existsSync(join(a, FILE_SEGNO_MIGRAZIONE)));
  writeFileSync(join(da, 'Preferences'), '{}'); // qualcosa di Chromium ricomparso in Roaming dopo: non si rimigra
  assert.equal(migraDatiBrowser({ da, a }).stato, 'gia-migrata');
  assert.ok(existsSync(join(da, 'Preferences')));
});

test('BROWSER-LOCALE-04 — una destinazione già presente non si sovrascrive mai: la vecchia resta in Roaming', () => {
  const { da, a } = vecchiaCartella();
  mkdirSync(join(a, 'Local Storage'), { recursive: true }); writeFileSync(join(a, 'Local Storage', 'nuovo.log'), 'nuovo');
  const esito = migraDatiBrowser({ da, a });
  assert.equal(esito.stato, 'migrata');
  assert.deepEqual(esito.lasciate, ['Local Storage']);
  assert.equal(readFileSync(join(da, 'Local Storage', 'leveldb.log'), 'utf8'), 'tema=scuro', 'la vecchia è ancora lì');
  assert.equal(readFileSync(join(a, 'Local Storage', 'nuovo.log'), 'utf8'), 'nuovo');
});

test('BROWSER-LOCALE-05 — una voce occupata: si rimette a posto ciò che era già spostato e si resta in Roaming per questo avvio', () => {
  const { da, a } = vecchiaCartella();
  const reali = { cpSync: undefined, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync };
  let chiamate = 0;
  const renameSync = (x, y) => {
    chiamate += 1;
    if (x.endsWith('Network')) { const e = new Error('occupata'); e.code = 'EBUSY'; throw e; }
    return renameReale(x, y);
  };
  const esito = migraDatiBrowser({ da, a, fs: { ...reali, renameSync } });
  assert.equal(esito.stato, 'rimandata'); assert.equal(esito.cartella, da, 'questo avvio usa ancora la cartella vecchia');
  assert.deepEqual(esito.errori[0], { nome: 'Network', codice: 'EBUSY' });
  for (const nome of ['Cache', 'Local State', 'Local Storage', 'Network']) assert.ok(existsSync(join(da, nome)), `${nome} deve essere tornata/rimasta in Roaming`);
  assert.equal(readFileSync(join(da, 'Local Storage', 'leveldb.log'), 'utf8'), 'tema=scuro');
  assert.equal(existsSync(join(a, FILE_SEGNO_MIGRAZIONE)), false, 'nessun segno: si ritenta al prossimo avvio');
  assert.ok(chiamate > 1);
  const dopo = migraDatiBrowser({ da, a });
  assert.equal(dopo.stato, 'migrata', 'al prossimo avvio, libera, la voce passa');
});

test('BROWSER-LOCALE-09 — con un\'istanza viva sulla cartella vecchia NON si sposta niente: si prova per prima una voce che un Chromium vivo tiene chiusa', () => {
  /* Misurato (Electron 44.3.0, 24/09/2026): con Chromium vivo `Cache`/`Code Cache`/`blob_storage` si lasciano
     rinominare, `Local Storage`/`Network`/`GPUCache`… no. Se si provassero prima le prime, si porterebbe via la cache
     a un'istanza che la sta usando. */
  const { da, a } = vecchiaCartella();
  const tentate = [];
  const renameSync = (x, y) => {
    tentate.push(x.slice(da.length + 1));
    if (/Local Storage|Network/.test(x)) { const e = new Error('istanza viva'); e.code = 'EPERM'; throw e; }
    return renameReale(x, y);
  };
  const esito = migraDatiBrowser({ da, a, fs: { cpSync: cpReale, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, renameSync } });
  assert.equal(esito.stato, 'rimandata');
  assert.deepEqual(tentate, ['Local Storage'], 'il primo tentativo è la voce che un\'istanza viva tiene chiusa, e ci si ferma lì');
  assert.ok(existsSync(join(da, 'Cache')));
});

test('BROWSER-LOCALE-06 — su un altro volume (EXDEV) si COPIA e l\'originale resta; una copia fallita non lascia mezze cartelle', () => {
  const { da, a } = vecchiaCartella();
  const exdev = () => { const e = new Error('cross-device'); e.code = 'EXDEV'; throw e; };
  const esito = migraDatiBrowser({ da, a, fs: { cpSync: (...x) => cpReale(...x), existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, renameSync: exdev } });
  assert.equal(esito.stato, 'migrata'); assert.equal(esito.copiate.length, 4);
  assert.equal(readFileSync(join(a, 'Local Storage', 'leveldb.log'), 'utf8'), 'tema=scuro');
  assert.equal(readFileSync(join(da, 'Local Storage', 'leveldb.log'), 'utf8'), 'tema=scuro', 'copia, non spostamento: l\'originale resta');
  const altra = vecchiaCartella();
  const rotta = migraDatiBrowser({ da: altra.da, a: altra.a, fs: { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, renameSync: exdev,
    cpSync: (x, y) => { mkdirSync(y, { recursive: true }); writeFileSync(join(y, 'mezzo'), 'x'); const e = new Error('disco pieno'); e.code = 'ENOSPC'; throw e; } } });
  assert.equal(rotta.stato, 'rimandata'); assert.equal(rotta.cartella, altra.da);
  assert.deepEqual(readdirSync(altra.a).filter((n) => n !== FILE_SEGNO_MIGRAZIONE), [], 'nessuna mezza copia resta nella destinazione');
});

test('BROWSER-LOCALE-07 — il guscio migra PRIMA di app.setPath(\'sessionData\') e salta la migrazione nei rami di pulizia', () => {
  const migra = main.indexOf('migraDatiBrowser(');
  const setPath = main.indexOf("app.setPath('sessionData'");
  assert.ok(migra > -1 && setPath > -1 && migra < setPath, 'la cartella di sessione si decide dopo la migrazione');
  assert.match(main, /app\.setPath\('sessionData', migrazioneBrowser\.cartella\)/);
  assert.match(main, /PULIZIA_IN_CORSO\s*\?/, 'un ramo di pulizia (disinstallazione) non deve spostare dati');
});

test('BROWSER-LOCALE-08 — ogni modulo che il guscio importa è nell\'elenco dei file del pacchetto', () => {
  const pacchetto = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
  /* 02/10/2026: anche gli import DEI moduli importati (`aggiornamenti.mjs` → `fonte-aggiornamenti.mjs`): la prima stesura guardava
     solo `main.mjs`, e un modulo nuovo importato da un altro modulo sarebbe mancato nel pacchetto senza nessun rosso. */
  const importati = [];
  const daGuardare = [...main.matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
  while (daGuardare.length) {
    const f = daGuardare.shift();
    if (importati.includes(f)) continue;
    importati.push(f);
    daGuardare.push(...[...readFileSync(join(desktop, f), 'utf8').matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]));
  }
  assert.ok(importati.includes('migrazione-browser.mjs'));
  assert.ok(importati.includes('firma-aggiornamenti.mjs'), 'la camminata scende nei moduli importati');
  const mancanti = importati.filter((f) => !pacchetto.build.files.includes(f));
  assert.deepEqual(mancanti, [], `moduli importati da main.mjs e non spediti (l'app installata non partirebbe): ${mancanti.join(', ')}`);
});

test('DISINSTALLA-SCRATCH-01 — la radice dei temporanei si toglie a OGNI disinstallazione, fuori dalla scelta sui dati, mai all\'aggiornamento', () => {
  const unInstall = corpoMacro('customUnInstall');
  const scratch = unInstall.indexOf("--talos-pulizia-scratch'");
  const scelta = unInstall.indexOf('PulisciDatiUtente == "1"');
  const aggiornamento = unInstall.indexOf('"--updated"');
  assert.ok(scratch > -1, 'la pulizia dei temporanei non è chiamata');
  assert.ok(aggiornamento > -1 && aggiornamento < scratch, 'sotto la guardia anti-aggiornamento');
  assert.ok(scratch < scelta, 'PRIMA e FUORI dal ramo della scelta sui dati');
  assert.match(unInstall, /ExecWait\s+'"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}" --talos-pulizia-scratch'/);
  // ⛔ nessun RMDir /r NSIS sulla radice: NSIS scende nelle giunzioni (Source/exehead/util.c, myDelete) — la toglie Node
  assert.doesNotMatch(unInstall, /RMDir \/r "\$LOCALAPPDATA[^"]*scratch"/);
  const flag = main.indexOf("else if (process.argv.includes('--talos-pulizia-scratch'))");
  assert.ok(flag > -1 && flag < main.indexOf('requestSingleInstanceLock'), 'il guscio gestisce il flag prima del lock');
  assert.match(main.slice(flag, flag + 1500), /rmSync\(profile\.scratchDir/);
});

test('DISINSTALLA-SCRATCH-02 — «Sì, elimina i dati» porta via anche la sessione di Chromium in %LOCALAPPDATA%, solo a pulizia riuscita', () => {
  const unInstall = corpoMacro('customUnInstall');
  const esito = unInstall.indexOf('${If} $R9 == 0');
  const browser = unInstall.indexOf('RMDir /r "$LOCALAPPDATA\\${APP_FILENAME}\\browser"');
  assert.ok(browser > -1, 'la sessione di Chromium in Local non viene tolta con i dati');
  assert.ok(esito > -1 && esito < browser && browser < unInstall.indexOf('${Else}', esito), 'solo nel ramo di successo');
  assert.match(corpoMacro('customUnInit'), /%LOCALAPPDATA%\\TALOS/, 'la domanda dice anche dove sta la cache del browser');
});

