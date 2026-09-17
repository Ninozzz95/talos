import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { extractLegacyContract } from '../../scripts/extract-legacy-contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const fixturePath = path.join(here, '../fixtures/legacy-contract.snapshot.json');

const input = Object.freeze({
  appPath: path.join(repoRoot, 'harness-ui/public/app.js'),
  htmlPath: path.join(repoRoot, 'harness-ui/public/index.html'),
  cssPath: path.join(repoRoot, 'harness-ui/public/styles.css'),
  aguiPath: path.join(repoRoot, 'harness-ui/src/agui-events.mjs'),
  staticPath: path.join(repoRoot, 'harness-ui/src/static-files.mjs'),
});

/*
 * 06/9 — CUTOVER (Fase 3): `public/` è la build modulare. Il contratto non è più «byte per byte
 * uguale» (quello serviva a congelare il monolite DURANTE l'estrazione): è «nessuna chiave pubblica
 * persa» — ogni chiave di localStorage, tipo di evento, frammento di rotta, global dell'host e asset
 * servito che il monolite esponeva deve esistere ancora nella build. Le sole uscite sono nominate
 * qui, col perché; una chiave che sparisce senza essere in questa lista è un test rosso.
 */
const RITIRATE = Object.freeze({
  endpointFragments: [
    '/api/v1/chat', // owner 24/8: niente sezione chat separata — l'harness è l'unica chat
    /* ⛔ PO-27 (17/09/2026, `f0b03c26`): la modale del primo avvio è stata tolta, ed era l'unico
       punto del frontend che chiamava `/api/v1/setup`. La rotta sul server RESTA
       (`/api/v1/setup/stato`, la legge `scripts/avvia-talos.mjs`): è la BUILD a non nominarla più.
       ⛔ Questo rosso è passato alla consegna di PO-27 perché la suite era stata contata PRIMA di
       ricostruire `public/` (`744a00ee`): il contratto legge il pacchetto servito, non il sorgente.
       Trovato il 17/09 sera dall'agente della Fase A frontend, riprodotto da me sulla lane. */
    '/api/v1/setup',
  ],
});
test('il contratto pubblico del monolite è conservato dalla build modulare (cutover 06/09)', async () => {
  const expected = JSON.parse(await readFile(fixturePath, 'utf8'));
  const actual = await extractLegacyContract(input);
  for (const chiave of ['hostGlobals', 'storageKeys', 'eventTypes', 'publicAssets', 'endpointFragments']) {
    const ritirate = RITIRATE[chiave] || [];
    const perse = expected[chiave].filter((valore) => !actual[chiave].includes(valore) && !ritirate.includes(valore));
    assert.deepEqual(perse, [], `${chiave}: chiavi del contratto perse dalla build`);
    for (const valore of ritirate) assert.ok(!actual[chiave].includes(valore), `${chiave}: «${valore}» è dichiarata ritirata ma la build la usa ancora`);
  }
  assert.deepEqual(actual.terminalFrames, expected.terminalFrames);
  assert.equal(actual.source, expected.source);
  for (const nome of ['app', 'html', 'css']) assert.ok(actual.assets[nome].bytes > 0, `${nome}: la build servita è vuota`);
});

test('la baseline contiene i contratti pubblici che il refactor deve conservare', async () => {
  const expected = JSON.parse(await readFile(fixturePath, 'utf8'));

  assert.ok(expected.hostGlobals.includes('__talosHarnessApiBase'));
  assert.ok(expected.hostGlobals.includes('__talosHarnessRoot'));
  assert.ok(expected.hostGlobals.includes('__talosHarnessUiRuntime'));
  assert.ok(expected.storageKeys.includes('talos.harness.desktop.settings.v1'));
  assert.ok(expected.eventTypes.includes('RunStarted'));
  assert.ok(expected.eventTypes.includes('TextMessageContent'));
  assert.ok(expected.eventTypes.includes('ToolCallResult'));
  assert.ok(expected.publicAssets.includes('/'));
  assert.ok(expected.publicAssets.includes('/app.js'));
  assert.ok(expected.publicAssets.includes('/styles.css'));
  assert.ok(expected.endpointFragments.some((value) => value.includes('/api/v1/sessions')));
  assert.ok(expected.endpointFragments.includes('/api/v1/workspace-browser'));
  assert.ok(expected.endpointFragments.includes('/api/v1/workspace-launches'));
  assert.deepEqual(expected.terminalFrames, { data: 0, control: 1 });
  assert.equal(expected.source, 'harness-ui/public');
  assert.ok(expected.assets.app.bytes > 400_000);
  /*
   * ⛔ 03/9 — pavimento abbassato da 60.000 a 55.000, e detto perché.
   *
   * Non è un test indebolito per farlo passare: `index.html` è calato di ~3 KB
   * perché le SETTE schede provider scritte a mano sono diventate un `<div>`
   * riempito dal JS (ridisegno della scheda Provider). Il markup non è
   * sparito, si è spostato — e `assets.app.bytes` infatti è cresciuto.
   *
   * Questi pavimenti servono a cogliere una fixture TRONCATA o vuota, che
   * sarebbe di un ordine di grandezza più piccola: 55.000 li coglie ancora
   * tutti. ⛔ Se un giorno questo numero va abbassato di nuovo, la domanda da
   * farsi è dove sono finiti i byte — non quanto scrivere qui.
   */
  assert.ok(expected.assets.html.bytes > 55_000);
  assert.ok(expected.assets.css.bytes > 140_000);
});
