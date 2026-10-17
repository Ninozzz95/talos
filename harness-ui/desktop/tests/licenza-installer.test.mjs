import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { RIASSUNTI, fileDellaLicenza, testoLicenzaInstaller } from '../scripts/genera-licenza-installer.mjs';
import { root } from './support.mjs';

/*
 * F7-2 (owner 27/09/2026): installer assistito, licenza AGPL con «Avanti», immagini nei colori di TALOS, solo per l'utente.
 * La prova vera (installa, avvia, disinstalla) è `installer.spec.mjs` e lo smoke della CI: qui i pezzi che non devono
 * scivolare in silenzio fra un rilascio e l'altro.
 */
const leggi = (percorso) => readFileSync(join(root, percorso));
const nsis = JSON.parse(leggi('package.json')).build.nsis;

test('F7-INST-01 — la licenza dell’installer è il riassunto più il LICENSE del repository, identico byte per byte, in ogni lingua', () => {
  const licenza = readFileSync(join(root, '..', '..', 'LICENSE'), 'utf8');
  for (const lingua of ['en_US', 'it_IT']) {
    const file = `assets/${fileDellaLicenza(lingua)}`;
    const atteso = testoLicenzaInstaller(licenza, lingua);
    assert.equal(leggi(file).toString('utf8'), atteso, `${file}: rigenerala con node scripts/genera-licenza-installer.mjs`);
    assert.deepEqual([...leggi(file).subarray(0, 3)], [0xef, 0xbb, 0xbf], `${file}: UTF-8 con BOM, o gli accenti non si leggono`);
    assert.match(atteso, /\r\n {20}GNU AFFERO GENERAL PUBLIC LICENSE\r\n/u);
  }
  assert.ok(RIASSUNTI.en_US.some((riga) => /do not have to accept anything/u.test(riga)), 'the summary says there is nothing to accept');
  assert.ok(RIASSUNTI.it_IT.some((riga) => /non devi accettare niente/u.test(riga)), 'il riassunto dice che non c’è niente da accettare');
  assert.equal(RIASSUNTI.en_US.length, RIASSUNTI.it_IT.length, 'stesse righe nelle due lingue');
  assert.notEqual(testoLicenzaInstaller(licenza, 'en_US'), testoLicenzaInstaller(licenza, 'it_IT'));
});

/*
 * Owner 12/10/2026: «inglese di default e italiano solo se il sistema in cui gira è in italiano, come da regola». L'installer
 * era SOLO italiano (`installerLanguages: ['it_IT']`, `language: '1040'`, frasi italiane fisse nello script). Qui i pezzi che lo
 * riporterebbero a una lingua sola senza un rosso: l'ordine delle lingue (la prima è il ripiego di NSIS), la licenza unica che
 * vincerebbe sulle due per lingua, una frase scritta in chiaro, una frase tradotta a metà.
 */
test('F7-INST-LINGUA-01 — inglese per primo (il ripiego), italiano accanto, nessuna licenza unica e nessuna lingua forzata', () => {
  assert.deepEqual(nsis.installerLanguages, ['en_US', 'it_IT'], 'la PRIMA lingua è quella di ogni sistema che non è italiano');
  assert.equal(nsis.license, undefined, '`license` vincerebbe con un file solo per tutte le lingue (nsisLicense.js:33-54)');
  assert.equal(nsis.language, undefined, 'niente LCID forzato nelle informazioni di versione');
  assert.notEqual(nsis.displayLanguageSelector, true, 'la lingua la sceglie il sistema, senza una finestra in più');
  assert.notEqual(nsis.multiLanguageInstaller, false);
});

test('F7-INST-LINGUA-02 — ogni frase dello script è una $(Talos…) definita in inglese E in italiano, mai scritta in chiaro', () => {
  const script = leggi('assets/installer.nsh').toString('utf8');
  const codice = script.replace(/\/\*[\s\S]*?\*\//gu, '').split('\n').filter((riga) => !/^\s*;/u.test(riga));
  const perLingua = { ENGLISH: new Map(), ITALIAN: new Map() };
  for (const riga of codice) {
    const m = /^\s*LangString (\w+) \$\{LANG_(\w+)\} "(.*)"\s*$/u.exec(riga);
    if (!m) { assert.doesNotMatch(riga, /^\s*LangString\b/u, `LangString non riconosciuta: ${riga.slice(0, 80)}`); continue; }
    assert.ok(perLingua[m[2]], `lingua non prevista: ${m[2]}`);
    assert.equal(perLingua[m[2]].has(m[1]), false, `${m[1]} definita due volte in ${m[2]}`);
    perLingua[m[2]].set(m[1], m[3]);
  }
  assert.ok(perLingua.ENGLISH.size >= 11, `frasi trovate: ${perLingua.ENGLISH.size}`);
  assert.deepEqual([...perLingua.ITALIAN.keys()].sort(), [...perLingua.ENGLISH.keys()].sort(), 'stesse frasi nelle due lingue');
  for (const [nome, inglese] of perLingua.ENGLISH) {
    const italiano = perLingua.ITALIAN.get(nome);
    assert.notEqual(inglese, italiano, `${nome}: l'italiano è una copia dell'inglese`);
    // stessi ritorni a capo e stesse variabili: una traduzione non cambia la forma della finestra
    const forma = (testo) => (testo.match(/\$\\r\$\\n|\$\\n|\$R\d|%[A-Z]+%\\TALOS/gu) ?? []).join(' ');
    assert.equal(forma(italiano), forma(inglese), `${nome}: a capo o variabili diversi fra le lingue`);
  }
  // usate tutte, e nessuna usata senza definizione
  const usate = new Set([...codice.filter((riga) => !/^\s*LangString\b/u.test(riga)).join('\n').matchAll(/\$\((Talos\w+)\)/gu)].map((m) => m[1]));
  assert.deepEqual([...usate].sort(), [...perLingua.ENGLISH.keys()].sort(), 'ogni frase definita è usata, ogni frase usata è definita');
  // nessun testo in chiaro: titoli e testi di Modern UI e ogni MessageBox passano da una $(…)
  for (const riga of codice) {
    const definizione = /^\s*!define (MUI_\w*(?:TEXT|TITLE|SUBTEXT|BUTTON)\w*) "(.*)"\s*$/u.exec(riga);
    // i colori (MUI_TEXTCOLOR, MUI_BGCOLOR, …_COLORS) non sono frasi
    if (definizione && !/COLOR/u.test(definizione[1])) assert.match(definizione[2], /^\$\((?:Talos\w+|\^\w+)\)$/u, `${definizione[1]} è scritto in una lingua sola`);
    const domanda = /^\s*MessageBox \S+ "(.*?)"/u.exec(riga);
    if (domanda) assert.match(domanda[1], /^\$\(Talos\w+\)$/u, 'un MessageBox scritto in una lingua sola');
  }
  // le lingue esistono solo dopo addLangs: le frasi stanno nel primo gancio che viene dopo
  assert.match(script, /!macro customHeader[\s\S]*?LangString TalosBenvenutoTitolo \$\{LANG_ENGLISH\} "Install TALOS"[\s\S]*?!macroend/u);
});

test('F7-INST-02 — le immagini sono BMP a 24 bit nelle misure di Modern UI 2', () => {
  for (const [file, larghezza, altezza] of [['assets/installerSidebar.bmp', 164, 314], ['assets/installerHeader.bmp', 150, 57]]) {
    const b = leggi(file);
    assert.equal(b.toString('ascii', 0, 2), 'BM', file);
    assert.deepEqual([b.readInt32LE(18), b.readInt32LE(22), b.readUInt16LE(28)], [larghezza, altezza, 24], file);
  }
});

test('F7-INST-03 — installer assistito, solo per l’utente, con licenza e immagini', () => {
  assert.equal(nsis.oneClick, false);
  assert.equal(nsis.perMachine, false);
  assert.equal(nsis.allowElevation, false, 'mai l’amministratore');
  assert.equal(nsis.allowToChangeInstallationDirectory, false);
  assert.equal(nsis.installerSidebar, 'assets/installerSidebar.bmp');
  assert.equal(nsis.installerHeader, 'assets/installerHeader.bmp');
  assert.equal(nsis.runAfterFinish, true, 'la pagina finale offre «Avvia TALOS»');
  const script = leggi('assets/installer.nsh').toString('utf8');
  assert.match(script, /!macro customInstallMode\s+StrCpy \$isForceCurrentInstall "1"\s+!macroend/u, 'niente pagina «per me / per tutti»');
  assert.match(script, /!define MUI_LICENSEPAGE_BUTTON "\$\(\^NextBtn\)"/u, '«Avanti», non «Accetto»');
  assert.match(script, /!define MUI_FINISHPAGE_RUN_TEXT "\$\(TalosAvviaTesto\)"/u);
  assert.match(script, /LangString TalosAvviaTesto \$\{LANG_ITALIAN\} "Avvia TALOS"/u);
  assert.match(script, /!macro customWelcomePage[\s\S]*?!insertmacro MUI_PAGE_WELCOME[\s\S]*?!macroend/u);
  assert.match(script, /!insertmacro MUI_PAGE_WELCOME\s+(?:;[^\n]*\s+)*!define MUI_PAGE_HEADER_TEXT "\$\(TalosLicenzaTitolo\)"/u,
    'la testata della pagina di licenza non dice «Accordo»: definita subito dopo il benvenuto, vale per la pagina dopo');
  assert.match(script, /LangString TalosLicenzaTitolo \$\{LANG_ITALIAN\} "Licenza di TALOS"/u);
});

test('F7-INST-README-019 — la guida descrive l’installer assistito e la cartella reale', () => {
  const guide = leggi('README.md').toString('utf8');
  assert.match(guide, /per-user assisted NSIS setup/u);
  assert.match(guide, /%LOCALAPPDATA%\\Programs\\TALOS/u);
  assert.match(guide, /does not offer a folder chooser/u);
  assert.doesNotMatch(guide, /one-click setup|Programs\\talos-desktop/u);
});
