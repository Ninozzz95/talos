/*
 * L'aiutante del PC nel rilascio (decisioni dell'owner 248 e 249, 05/11/2026; cancelli rossi del Tester delle 16:30).
 *
 * - S2 (a): senza un aiutante usabile (impronta non fissata o non sha256, file assente) il nucleo NON riceve gli ospiti del computer use:
 *   `computer_use` e `computer_use_places_*` non esistono per il modello, che quindi non può dire «attiva il computer use».
 * - S2 (b): se l'attrezzo c'è ma l'aiutante non parte, il testo dice che non c'è niente da accendere, e lo dice una volta sola.
 * - L'impronta del binario di rilascio è fissata per commit (sha256 misurato sul file della build del 05/11).
 * - Il pacchetto porta l'aiutante in `resources/aiutante-pc/` con la sua licenza; il guscio passa il percorso al server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { porteDelComputerUse } from '../src/computer-use/interruttore.mjs';
import { IMPRONTA_AIUTANTE_PC, NON_DISPONIBILE, percorsoAiutantePredefinito } from '../src/computer-use/aiutante-mcp.mjs';
import { creaOspiteComputerUse } from '../src/computer-use/attrezzo.mjs';
import { VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE } from '../src/ambiente-solo-server.mjs';
import { creaAvvioFiglio, risolviPercorsi } from '../desktop/runtime.mjs';
import { copiaAiutantePc } from '../desktop/scripts/prepara-pacchetto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const QUI = import.meta.dirname;
const SHA = (b) => createHash('sha256').update(b).digest('hex');

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-aiutante-rilascio-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}

test('RIL-01 (S2 a): senza aiutante usabile il nucleo non riceve gli ospiti del computer use; le rotte dei luoghi restano', (t) => {
  const c = cartella(t);
  const exe = join(c, 'cua-driver.exe');
  writeFileSync(exe, 'MZ finto');
  const buona = 'b'.repeat(64);
  const casi = [
    ['impronta non fissata', { exe, impronta: null }],
    ['impronta che non è uno sha256', { exe, impronta: 'non-una-impronta' }],
    ['impronta maiuscola (non è la forma fissata)', { exe, impronta: 'B'.repeat(64) }],
    ['file assente', { exe: join(c, 'manca.exe'), impronta: buona }],
    ['percorso vuoto', { exe: '', impronta: buona }],
  ];
  for (const [nome, o] of casi) {
    const porte = porteDelComputerUse({ fileLuoghi: join(c, `${nome.length}.json`), acceso: true, ...o }); // decisione 310: acceso a mano
    assert.deepEqual(porte.perNucleo, {}, `${nome}: nessun attrezzo del computer use per il modello`);
    assert.equal(typeof porte.perHttp.luoghiFn, 'function', `${nome}: la pagina dei luoghi ricordati resta`);
  }
  const usabile = porteDelComputerUse({ fileLuoghi: join(c, 'si.json'), acceso: true, exe, impronta: buona });
  assert.deepEqual(Object.keys(usabile.perNucleo).sort(), ['ospiteComputerUseFn', 'ospiteLuoghiFn'], 'file presente e impronta fissata: gli attrezzi ci sono');
});

test('RIL-02 (S2 b): il testo dice che non c\'è niente da accendere, e l\'attrezzo lo dà intero e una volta', async () => {
  assert.match(NON_DISPONIBILE, /^computer_use is not available on this computer/u);
  assert.match(NON_DISPONIBILE, /no setting the person can turn on/u);
  assert.match(NON_DISPONIBILE, /Do not tell the person to enable computer use/u);
  assert.match(NON_DISPONIBILE, /Do not retry\.$/u);
  const sessione = { testoDellaPersona: 'apri il blocco note', chiediModello: async () => { throw new Error('mai'); }, chiediDomanda: async () => null, emetti: () => {}, fermato: () => null };
  const opz = { fase: 'esegui', toolCallId: 'x', livelloAccesso: 'accesso-pieno', sessione };
  const senza = await creaOspiteComputerUse({ aiutante: null, registroLuoghi: null })('computer_use', { task: 'open Notepad' }, opz);
  assert.deepEqual(senza, { ok: false, testo: NON_DISPONIBILE });
  const nonParte = { apri: async () => ({ ok: false, motivo: 'impronta' }), chiama: async () => { throw new Error('mai'); }, compito: () => () => {} };
  const rotto = await creaOspiteComputerUse({ aiutante: nonParte, registroLuoghi: null })('computer_use', { task: 'open Notepad' }, opz);
  assert.deepEqual(rotto, { ok: false, testo: NON_DISPONIBILE });
});

test('RIL-03: l\'impronta del binario di rilascio è fissata per commit, e il commento non nomina un file che non esiste', () => {
  assert.equal(IMPRONTA_AIUTANTE_PC, '592abc5c72494fb8afa203acb075032a6e2eedc932c9e4fa0ef21a8e0dc35f8e');
  const sorgente = readFileSync(join(QUI, '..', 'src', 'computer-use', 'aiutante-mcp.mjs'), 'utf8');
  assert.doesNotMatch(sorgente, /binario\.sha256/u, 'costruisci.mjs scrive lo sha256 solo nel rapporto JSON');
});

test('RIL-04: il percorso dell\'aiutante è quello che passa il guscio installato, altrimenti quello della build di sviluppo', () => {
  const pacchetto = 'C:\\Programmi\\TALOS\\resources\\aiutante-pc\\cua-driver.exe';
  const sviluppo = join('C:\\L', 'tb', 'potato-target', 'release', 'cua-driver.exe');
  assert.equal(percorsoAiutantePredefinito({ TALOS_AIUTANTE_PC: pacchetto, LOCALAPPDATA: 'C:\\L' }), pacchetto);
  assert.equal(percorsoAiutantePredefinito({ TALOS_AIUTANTE_PC: `  ${pacchetto}  `, LOCALAPPDATA: 'C:\\L' }), pacchetto);
  for (const v of [undefined, '', '   ', 'relativo\\cua-driver.exe']) {
    assert.equal(percorsoAiutantePredefinito({ TALOS_AIUTANTE_PC: v, LOCALAPPDATA: 'C:\\L' }), sviluppo, `valore ${JSON.stringify(v)}`);
  }
});

test('RIL-05: il guscio installato passa al server il percorso dell\'aiutante nel pacchetto; dal sorgente no', () => {
  const app = resolve('app');
  const risorse = resolve('risorse');
  const installato = risolviPercorsi({ appPath: app, isPackaged: true, resourcesPath: risorse });
  assert.equal(installato.aiutantePc, join(risorse, 'aiutante-pc', 'cua-driver.exe'));
  assert.equal(risolviPercorsi({ appPath: app }).aiutantePc, undefined);
  assert.equal(risolviPercorsi({ appPath: app, isPackaged: true, resourcesPath: risorse, harnessDir: resolve('h') }).aiutantePc, undefined);
  const base = { execPath: resolve('Electron.exe'), port: 49152, token: 'a'.repeat(64), dataDir: resolve('dati'), env: {} };
  assert.equal(creaAvvioFiglio({ ...base, percorsi: installato }).options.env.TALOS_AIUTANTE_PC, join(risorse, 'aiutante-pc', 'cua-driver.exe'));
  assert.equal('TALOS_AIUTANTE_PC' in creaAvvioFiglio({ ...base, percorsi: risolviPercorsi({ appPath: app }) }).options.env, false);
  assert.ok(VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE.includes('TALOS_AIUTANTE_PC'), 'un percorso dentro l\'installazione, deciso per nome');
});

test('RIL-06: il pacchetto copia l\'aiutante solo con l\'impronta fissata, con la licenza di cua e gli avvisi', async (t) => {
  const c = cartella(t);
  const exe = join(c, 'cua-driver.exe');
  const byte = Buffer.from('MZ aiutante di prova');
  writeFileSync(exe, byte);
  const licenza = join(c, 'LICENSE.md'); writeFileSync(licenza, 'MIT License\n');
  const avvisi = join(c, 'THIRD_PARTY_NOTICES.md'); writeFileSync(avvisi, 'avvisi\n');
  const fuori = join(c, 'staging', 'aiutante-pc');
  await assert.rejects(copiaAiutantePc({ exe: join(c, 'manca.exe'), licenza, avvisi, destinazione: fuori, impronta: SHA(byte) }), /costruisci\.mjs potato/u);
  await assert.rejects(copiaAiutantePc({ exe, licenza, avvisi, destinazione: fuori, impronta: 'c'.repeat(64) }), /SHA256 non corrispondente/u);
  assert.equal(existsSync(join(fuori, 'cua-driver.exe')), false, 'un aiutante con un\'altra impronta non resta nel pacchetto');
  await assert.rejects(copiaAiutantePc({ exe, licenza, avvisi, destinazione: fuori, impronta: null }), /impronta/u);
  assert.equal(await copiaAiutantePc({ exe, licenza, avvisi, destinazione: fuori, impronta: SHA(byte) }), SHA(byte));
  assert.deepEqual(readFileSync(join(fuori, 'cua-driver.exe')), byte);
  assert.equal(readFileSync(join(fuori, 'LICENSE.md'), 'utf8'), 'MIT License\n');
  assert.equal(readFileSync(join(fuori, 'THIRD_PARTY_NOTICES.md'), 'utf8'), 'avvisi\n');
  // cablaggio: electron-builder porta la cartella, preparaPacchetto la riempie con l'impronta del codice e la dichiara negli avvisi
  const pkg = JSON.parse(readFileSync(join(QUI, '..', 'desktop', 'package.json'), 'utf8'));
  assert.ok(pkg.build.extraResources.some((r) => r.from === '.staging/aiutante-pc' && r.to === 'aiutante-pc'));
  const script = readFileSync(join(QUI, '..', 'desktop', 'scripts', 'prepara-pacchetto.mjs'), 'utf8');
  assert.match(script, /await copiaAiutantePc\(\{[^}]*impronta: IMPRONTA_AIUTANTE_PC[^}]*\}\)/u);
  assert.match(script, /cua-driver[^\n]*MIT[^\n]*uniffi[^\n]*MPL-2\.0/u);
});
