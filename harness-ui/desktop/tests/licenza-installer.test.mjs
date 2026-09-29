import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { RIASSUNTO, testoLicenzaInstaller } from '../scripts/genera-licenza-installer.mjs';
import { root } from './support.mjs';

/*
 * F7-2 (owner 27/09/2026): installer assistito, licenza AGPL con «Avanti», immagini nei colori di TALOS, solo per l'utente.
 * La prova vera (installa, avvia, disinstalla) è `installer.spec.mjs` e lo smoke della CI: qui i pezzi che non devono
 * scivolare in silenzio fra un rilascio e l'altro.
 */
const leggi = (percorso) => readFileSync(join(root, percorso));
const nsis = JSON.parse(leggi('package.json')).build.nsis;

test('F7-INST-01 — la licenza dell’installer è il riassunto più il LICENSE del repository, identico byte per byte', () => {
  const atteso = testoLicenzaInstaller(readFileSync(join(root, '..', '..', 'LICENSE'), 'utf8'));
  assert.equal(leggi('assets/licenza-installer.txt').toString('utf8'), atteso, 'rigenerala: node scripts/genera-licenza-installer.mjs');
  assert.deepEqual([...leggi('assets/licenza-installer.txt').subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 con BOM, o gli accenti non si leggono');
  assert.match(atteso, /\r\n {20}GNU AFFERO GENERAL PUBLIC LICENSE\r\n/u);
  assert.ok(RIASSUNTO.some((riga) => /non devi accettare niente/u.test(riga)), 'il riassunto dice che non c’è niente da accettare');
});

test('F7-INST-02 — le immagini sono BMP a 24 bit nelle misure di Modern UI 2', () => {
  for (const [file, larghezza, altezza] of [['assets/installerSidebar.bmp', 164, 314], ['assets/installerHeader.bmp', 150, 57]]) {
    const b = leggi(file);
    assert.equal(b.toString('ascii', 0, 2), 'BM', file);
    assert.deepEqual([b.readInt32LE(18), b.readInt32LE(22), b.readUInt16LE(28)], [larghezza, altezza, 24], file);
  }
});

test('F7-INST-03 — installer assistito, solo per l’utente, in italiano, con licenza e immagini', () => {
  assert.equal(nsis.oneClick, false);
  assert.equal(nsis.perMachine, false);
  assert.equal(nsis.allowElevation, false, 'mai l’amministratore');
  assert.equal(nsis.allowToChangeInstallationDirectory, false);
  assert.equal(nsis.license, 'assets/licenza-installer.txt');
  assert.equal(nsis.installerSidebar, 'assets/installerSidebar.bmp');
  assert.equal(nsis.installerHeader, 'assets/installerHeader.bmp');
  assert.deepEqual(nsis.installerLanguages, ['it_IT']);
  assert.equal(nsis.runAfterFinish, true, 'la pagina finale offre «Avvia TALOS»');
  const script = leggi('assets/installer.nsh').toString('utf8');
  assert.match(script, /!macro customInstallMode\s+StrCpy \$isForceCurrentInstall "1"\s+!macroend/u, 'niente pagina «per me / per tutti»');
  assert.match(script, /!define MUI_LICENSEPAGE_BUTTON "\$\(\^NextBtn\)"/u, '«Avanti», non «Accetto»');
  assert.match(script, /!define MUI_FINISHPAGE_RUN_TEXT "Avvia TALOS"/u);
  assert.match(script, /!macro customWelcomePage[\s\S]*?!insertmacro MUI_PAGE_WELCOME[\s\S]*?!macroend/u);
  assert.match(script, /!insertmacro MUI_PAGE_WELCOME\s+(?:;[^\n]*\s+)*!define MUI_PAGE_HEADER_TEXT "Licenza di TALOS"/u,
    'la testata della pagina di licenza non dice «Accordo»: definita subito dopo il benvenuto, vale per la pagina dopo');
});

test('F7-INST-README-019 — la guida descrive l’installer assistito e la cartella reale', () => {
  const guide = leggi('README.md').toString('utf8');
  assert.match(guide, /per-user assisted NSIS setup/u);
  assert.match(guide, /%LOCALAPPDATA%\\Programs\\TALOS/u);
  assert.match(guide, /does not offer a folder chooser/u);
  assert.doesNotMatch(guide, /one-click setup|Programs\\talos-desktop/u);
});
