import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = dirname(fileURLToPath(import.meta.url));
const nsh = readFileSync(join(qui, '..', 'assets', 'installer.nsh'), 'utf8');
const main = readFileSync(join(qui, '..', 'main.mjs'), 'utf8');

/** Il corpo di una macro installer.nsh: da `!macro <nome>` al `!macroend` che la chiude.
 *  Serve a esaminare SOLO il codice della macro, senza far combaciare le asserzioni con i
 *  commenti che parlano di esse (es. il racconto che cita `${Silent}`). */
function corpoMacro(nome) {
  const inizio = nsh.indexOf(`!macro ${nome}\n`);
  assert.ok(inizio > -1, `macro ${nome} assente da installer.nsh`);
  const fine = nsh.indexOf('!macroend', inizio);
  assert.ok(fine > inizio, `macroend mancante per ${nome}`);
  return nsh.slice(inizio, fine);
}

const unInit = corpoMacro('customUnInit');
const unInstall = corpoMacro('customUnInstall');

/*
 * ⛔ (16/09/2026) — CUSTODIA DELLA DOMANDA ALLA DISINSTALLAZIONE (bug 2, gamba 2b). Il flag
 * anti-recidiva per la FUTURA PR che cambierà l'installer (principalmente UI): se qualcuno
 * tocca installer.nsh e perde una di queste garanzie, il test lo dice PRIMA del rilascio.
 * I fatti misurati sui template app-builder-lib 26.16.1 (documentati nel file .nsh stesso):
 * l'uninstaller one-click si mette in silent da solo (le pagine custom non girano MAI) e
 * all'altezza di customUnInit ${Silent} è sempre vero — il segnale vero è $CMDLINE.
 */

test('R02-DISINSTALLA — la domanda vive in customUnInit e guarda la riga di comando, mai ${Silent}', () => {
  assert.match(nsh, /!macro\s+customUnInit\b/, 'customUnInit assente: la domanda non comparirebbe mai');
  // ⛔ Il guard è il RI-PARSING di $CMDLINE: ${Silent} lì è sempre vero (SetSilent è già passato).
  assert.match(unInit, /\$\{GetParameters\}/, 'customUnInit non legge $CMDLINE');
  assert.match(unInit, /"--updated"/, 'guard anti-upgrade (--updated) mancante in customUnInit');
  assert.match(unInit, /GetOptions[\s\S]*?\/S/, 'guard installazione silenziosa (/S) mancante in customUnInit');
  assert.doesNotMatch(unInit, /\$\{Silent\}/, '${Silent} in customUnInit è sempre vero: userebbe il guard sbagliato');
});

test('R02-DISINSTALLA — il default è MANTENERE: solo un «Sì» esplicito accende la pulizia', () => {
  // La variabile parte a 0, e solo IDYES la porta a 1: la domanda scartata (No, Esc,
  // installazione silenziosa) lascia sempre 0.
  assert.match(unInit, /StrCpy\s+\$PulisciDatiUtente\s+"0"/);
  assert.match(unInit, /IDYES[\s\S]*?StrCpy\s+\$PulisciDatiUtente\s+"1"/);
  // Il pulsante predefinito è il secondo (No): anche un Invio distratto conserva i dati.
  assert.match(unInit, /MB_YESNO\|MB_DEFBUTTON2/, 'defbutton non è «No»: Invio cancellerebbe');
});

test('R02-DISINSTALLA — doppia guardia in customUnInstall, ExecWait col define, RMDir SOLO a pulizia riuscita', () => {
  // Belt-and-braces: customUnInstall RICONTROLLA entrambi i segnali della riga di comando.
  assert.match(unInstall, /"--updated"[\s\S]*?\/S[\s\S]*?PulisciDatiUtente == "1"/);
  // Nessun nome eseguibile hardcodato: il define di electron-builder segue il productName.
  assert.match(unInstall, /ExecWait\s+'"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}" --talos-pulizia-dati'/);
  // ⛔ I dati utente si cancellano SOLO se la routine esce 0: un fallimento onesto non si
  // nasconde e non perde dati a metà.
  const rmdir = unInstall.indexOf('RMDir /r "$APPDATA\\${APP_FILENAME}"');
  const esito = unInstall.indexOf('${If} $R9 == 0');
  assert.ok(rmdir > -1, 'RMDir di %APPDATA% mancante');
  assert.ok(esito > -1 && esito < rmdir, 'RMDir fuori dal ramo di successo: cancellerebbe anche a pulizia fallita');
});

test('R02-DISINSTALLA — il guscio esegue la pulizia PRIMA del lock a istanza singola ed esce col codice della routine', () => {
  const flag = main.indexOf("'--talos-pulizia-dati'");
  const lock = main.indexOf('requestSingleInstanceLock');
  assert.ok(flag > -1, 'flag di pulizia assente dal guscio');
  assert.ok(lock > -1 && flag < lock, 'il ramo di pulizia sta DOPO il lock: una pulizia non è una sessione');
  assert.match(main, /puliziaDatiDesktop/);
  assert.match(main, /esito\.ok \? 0 : 1/, 'il guscio deve uscire col codice onesto della routine');
});
