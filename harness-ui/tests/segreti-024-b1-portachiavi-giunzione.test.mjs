/*
 * 0.2.4, block 1, round 2, item A (reviewer ROSSO 1, judge's form): TALOS installed behind a junction (AppData or the profile moved to
 * another disk) must keep its keys. The check compared `execPath` as it is with the server root that Node had already RESOLVED from
 * `import.meta.url`: through a junction the two differ, so the installed app opened the empty `-desktop-sorgente` and the uninstall cleanup
 * would have wiped the wrong namespace. Now: inside the Electron main process `app.isPackaged` (Electron docs, docs/api/app.md, read
 * 19/11/2026 through ctx7) decides; in the server child (ELECTRON_RUN_AS_NODE, where `app` does not exist) both sides go through
 * `realpathSync.native`, and the tree must be the PACKAGE's, never a source tree.
 * ⛔ Junctions live only under the FAKE temp folder of this test (C:/T/finto-…), and are removed with `rmdir` on their exact path.
 *   No keychain is opened here: `serverDelPacchetto` is a pure check on paths.
 * Red on a353131d8: B1-GIUNZIONE-01 is false (the installed app behind a junction loses its keys).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { segnaDiSistema, serverDelPacchetto } from '../src/adattatore-keyring.mjs';
import { puliziaDatiDesktop } from '../src/pulizia-dati.mjs';

const TEMP = tmpdir();
const NEL_PROFILO_FINTO = /^C:[\\/]T[\\/]finto-/iu.test(TEMP);
const ELECTRON = { electron: '38.0.0' };
const SORGENTE = realpathSync.native(fileURLToPath(new URL('..', import.meta.url)));

/** a package as electron-builder lays it out (asar: false): TALOS.exe, resources/app/main.mjs, resources/harness-ui/src */
function pacchettoFinto(cartella) {
  mkdirSync(join(cartella, 'resources', 'app'), { recursive: true });
  mkdirSync(join(cartella, 'resources', 'harness-ui', 'src'), { recursive: true });
  writeFileSync(join(cartella, 'TALOS.exe'), '');
  writeFileSync(join(cartella, 'resources', 'app', 'main.mjs'), '// fake shell of the fake package\n');
  writeFileSync(join(cartella, 'resources', 'harness-ui', 'server.mjs'), '// fake server of the fake package\n');
  return cartella;
}
function giunzione(t, bersaglio, dove) {
  symlinkSync(bersaglio, dove, 'junction');
  t.after(() => { execFileSync('cmd.exe', ['/d', '/c', 'rmdir', dove], { windowsHide: true }); });
  return dove;
}

test('B1-GIUNZIONE-01: TALOS installed behind a junction is still the package: the keys of the installed app stay reachable', { skip: process.platform !== 'win32' || !NEL_PROFILO_FINTO }, (t) => {
  const base = mkdtempSync(join(TEMP, 'b1-giunzione-'));
  const vero = pacchettoFinto(join(base, 'disco-vero', 'TALOS'));
  const attraverso = giunzione(t, join(base, 'disco-vero'), join(base, 'AppData-spostato'));
  /* Node resolves the module URL: the root the module sees is the REAL one, the execPath Electron reports goes through the junction */
  const radice = realpathSync.native(join(vero, 'resources', 'harness-ui'));
  assert.equal(serverDelPacchetto({ versions: ELECTRON, execPath: join(attraverso, 'TALOS', 'TALOS.exe'), radice, piattaforma: 'win32' }), true);
  assert.equal(serverDelPacchetto({ versions: ELECTRON, execPath: join(vero, 'TALOS.exe'), radice, piattaforma: 'win32' }), true, 'and without the junction, as before');
});

test('B1-GIUNZIONE-02: from source the package namespace never opens, whatever path is faked', { skip: process.platform !== 'win32' || !NEL_PROFILO_FINTO }, (t) => {
  const base = mkdtempSync(join(TEMP, 'b1-finta-'));
  /* an Electron folder whose resources/harness-ui is a junction to THIS source tree, with a fake shell beside it */
  const finto = join(base, 'electron-finto');
  mkdirSync(join(finto, 'resources', 'app'), { recursive: true });
  writeFileSync(join(finto, 'electron.exe'), '');
  writeFileSync(join(finto, 'resources', 'app', 'main.mjs'), '');
  giunzione(t, SORGENTE, join(finto, 'resources', 'harness-ui'));
  assert.equal(serverDelPacchetto({ versions: ELECTRON, execPath: join(finto, 'electron.exe'), radice: SORGENTE, piattaforma: 'win32' }), false, 'a source tree is never the package');
  /* a package-shaped folder without the shell beside it, or holding a source tree (desktop/main.mjs), is not the package either */
  const senzaGuscio = join(base, 'senza-guscio');
  mkdirSync(join(senzaGuscio, 'resources', 'harness-ui', 'src'), { recursive: true });
  assert.equal(serverDelPacchetto({ versions: ELECTRON, execPath: join(senzaGuscio, 'TALOS.exe'), radice: realpathSync.native(join(senzaGuscio, 'resources', 'harness-ui')), piattaforma: 'win32' }), false);
  const conSorgente = pacchettoFinto(join(base, 'con-sorgente'));
  mkdirSync(join(conSorgente, 'resources', 'harness-ui', 'desktop'), { recursive: true });
  writeFileSync(join(conSorgente, 'resources', 'harness-ui', 'desktop', 'main.mjs'), '');
  assert.equal(serverDelPacchetto({ versions: ELECTRON, execPath: join(conSorgente, 'TALOS.exe'), radice: realpathSync.native(join(conSorgente, 'resources', 'harness-ui')), piattaforma: 'win32' }), false);
  /* plain Node, and this very test process, whatever the environment says */
  const pacchetto = pacchettoFinto(join(base, 'buono'));
  assert.equal(serverDelPacchetto({ versions: {}, execPath: join(pacchetto, 'TALOS.exe'), radice: realpathSync.native(join(pacchetto, 'resources', 'harness-ui')), piattaforma: 'win32' }), false);
  assert.equal(serverDelPacchetto(), false);
  /* a path that does not exist cannot be resolved: never the package */
  assert.equal(serverDelPacchetto({ versions: ELECTRON, execPath: join(base, 'non-esiste', 'TALOS.exe'), radice: join(base, 'non-esiste', 'resources', 'harness-ui'), piattaforma: 'win32' }), false);
});

test('B1-GIUNZIONE-04: the uninstall cleanup takes the same gate, and the shell gives it `app.isPackaged`', async () => {
  const visti = (pacchetto) => {
    const servizi = new Set();
    const finto = segnaDiSistema({ get: (s) => { servizi.add(s); return null; }, set: (s) => { servizi.add(s); }, remove: (s) => { servizi.add(s); return false; } });
    return { finto, servizi, pacchetto };
  };
  const silenzio = { log() {}, info() {}, warn() {}, error() {} };
  for (const [pacchetto, finale] of [[true, /-desktop$/u], [false, /-desktop-sorgente$/u]]) {
    const { finto, servizi } = visti(pacchetto);
    await puliziaDatiDesktop({ keyring: finto, logger: silenzio, delPacchetto: () => pacchetto });
    assert.ok(servizi.size > 0);
    for (const s of servizi) assert.match(s, finale, `${pacchetto}: ${s}`);
  }
  const main = readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /puliziaDatiDesktop\(\{ delPacchetto: \(\) => app\.isPackaged \}\)/u);
});

test('B1-GIUNZIONE-03: in the Electron main process (the uninstall cleanup) `app.isPackaged` decides, and nothing else', () => {
  assert.equal(serverDelPacchetto({ versions: ELECTRON, tipo: 'browser', appImpacchettata: () => true }), true);
  assert.equal(serverDelPacchetto({ versions: ELECTRON, tipo: 'browser', appImpacchettata: () => false }), false, 'Electron from source: false');
  assert.equal(serverDelPacchetto({ versions: ELECTRON, tipo: 'browser', appImpacchettata: () => 'true' }), false, 'only the boolean true');
  assert.equal(serverDelPacchetto({ versions: {}, tipo: 'browser', appImpacchettata: () => true }), false, 'outside Electron there is no main process');
});
