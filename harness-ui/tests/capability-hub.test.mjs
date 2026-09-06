import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createHttpApp } from '../src/http-app.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await readFile(join(root, 'frontend/src/legacy/app.js'), 'utf8');
const css = await readFile(join(root, 'frontend/src/styles/index.css'), 'utf8');
const indexHtml = await readFile(join(root, 'frontend/index.template.html'), 'utf8');

/** ⛔ Mai `assert.match` su un file intero: in caso di rosso il runner stamperebbe 700 KB di sorgente e il messaggio vero sparirebbe. */
function ok(testo, regex, messaggio) { assert.ok(regex.test(testo), messaggio || `atteso: ${regex}`); }
function no(testo, regex, messaggio) { assert.ok(!regex.test(testo), messaggio || `NON atteso: ${regex}`); }


/*
 * ⛔⛔⛔ O-01 — owner 04/9: «quando clicco il pulsante + nel chat composer ogni
 * riga della modale che si apre deve essere funzionante al 100% e non avere
 * funzionalità o ui mock».
 *
 * Censimento dal vivo: il foglio dichiarava «Attrezzi dell'harness · sempre
 * offerti al modello» ed elencava SETTE nomi scritti a mano dentro una
 * stringa di template — mentre il kernel ne offre DAVVERO 43 (7 base +
 * `strumentiEstesi`, 36, in session-registry.mjs). Un elenco statico
 * presentato come inventario è uno stato inventato come un contatore
 * inventato: non «3 server MCP» ma «questi sono i tuoi attrezzi», con 36
 * mancanti — `web_search`, `document_create`, `generate_image`,
 * `delega_sottotask`, tutta Libreria/Notes/Tasks/Memory/Research/Forge.
 *
 * ⛔ La cura NON è aggiungere 36 righe scritte a mano (invecchierebbero come
 * le sette): l'elenco si CHIEDE al kernel, per la sessione aperta, come già
 * fanno MCP/skill/plugin/libreria/note/attività/memoria/ricerche/forge.
 */

// --------------------------------------------------------------------
// 1. L'adattatore del runtime owner sa chiedere al kernel i suoi attrezzi.
// --------------------------------------------------------------------

test('O-01 — attrezziKernel(): nomi e descrizioni VERI dal kernel, base ed estesi separati', async () => {
  const adapter = createOwnerRuntimeAdapter({
    modulePath: 'C:/finto/kernel.mjs',
    importFn: async () => ({
      ATTREZZI_OPENAI: [{ type: 'function', function: { name: 'elenca', description: 'Lists the files', parameters: { type: 'object', properties: {} } } }],
      ATTREZZI_ESTESI_OPENAI: [{ type: 'function', function: { name: 'web_search', description: 'Searches the web', parameters: { type: 'object', properties: { query: { type: 'string' } } } } }],
    }),
  });
  const esito = await adapter.attrezziKernel();
  assert.deepEqual(esito.base.map((a) => a.nome), ['elenca']);
  assert.deepEqual(esito.estesi.map((a) => a.nome), ['web_search']);
  assert.equal(esito.base[0].descrizione, 'Lists the files');
  assert.ok(esito.estesi[0].tokenSchemaStimati > 0, 'la stima di token dello schema è un numero misurato sul JSON vero');
});

test('O-01 AL CONTRARIO — un kernel che non espone gli attrezzi non produce una lista vuota: dichiara il contratto mancante', async () => {
  const adapter = createOwnerRuntimeAdapter({ modulePath: 'C:/finto/kernel.mjs', importFn: async () => ({}) });
  await assert.rejects(() => adapter.attrezziKernel(), (errore) => {
    assert.equal(errore.code, 'OWNER_RUNTIME_CONTRACT_INVALID');
    return true;
  });
});

test('O-01 AL CONTRARIO — senza kernel configurato non si inventa nessun attrezzo', async () => {
  const adapter = createOwnerRuntimeAdapter({ modulePath: null });
  await assert.rejects(() => adapter.attrezziKernel(), (errore) => {
    assert.equal(errore.code, 'OWNER_RUNTIME_NOT_CONFIGURED');
    return true;
  });
});

// --------------------------------------------------------------------
// 2. La rotta HTTP che il foglio usa.
// --------------------------------------------------------------------

function registroFinto({ attrezzi = null, erroreAvvio = null } = {}) {
  return {
    async elencaAttrezzi(sessionId) {
      if (erroreAvvio) return { erroreAvvio, code: 'NOT_FOUND' };
      return { ok: true, attrezzi, errore: attrezzi ? null : 'Il runtime agente non è configurato per questa installazione.', sessionId };
    },
  };
}

async function ascolta(t, sessionRegistry) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('O-01 — GET /api/v1/sessions/:id/tools torna gli attrezzi VERI della sessione', async (t) => {
  const base = await ascolta(t, registroFinto({ attrezzi: [
    { nome: 'elenca', descrizione: 'Lists the files', categoria: 'base', permessoConfigurabile: false, permesso: null, dipendenza: null, tokenSchemaStimati: 30 },
    { nome: 'web_search', descrizione: 'Searches the web', categoria: 'esteso', permessoConfigurabile: false, permesso: null, dipendenza: { stato: 'pronta', dettaglio: 'DuckDuckGo (senza chiave)' }, tokenSchemaStimati: 60 },
  ] }));
  const risposta = await fetch(`${base}/api/v1/sessions/s1/tools`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.data.attrezzi.length, 2);
  assert.equal(corpo.data.attrezzi[1].dipendenza.stato, 'pronta');
  assert.equal(corpo.data.errore, null);
});

test('O-01 AL CONTRARIO — sessione inesistente: 404, mai un elenco finto', async (t) => {
  const base = await ascolta(t, registroFinto({ erroreAvvio: 'Sessione non trovata' }));
  const risposta = await fetch(`${base}/api/v1/sessions/ignota/tools`);
  assert.equal(risposta.status, 404);
});

test('O-01 AL CONTRARIO — kernel non configurato: `attrezzi:null` + errore dichiarato, mai `attrezzi:[]`', async (t) => {
  const base = await ascolta(t, registroFinto({ attrezzi: null }));
  const risposta = await fetch(`${base}/api/v1/sessions/s1/tools`);
  const corpo = await risposta.json();
  assert.equal(risposta.status, 200);
  assert.equal(corpo.data.attrezzi, null, 'null («non osservato») non è la stessa cosa di [] («nessun attrezzo»)');
  assert.match(corpo.data.errore, /non è configurato/);
});

test('O-01 — la rotta rifiuta una query non dichiarata, come le sorelle', async (t) => {
  const base = await ascolta(t, registroFinto({ attrezzi: [] }));
  const risposta = await fetch(`${base}/api/v1/sessions/s1/tools?refresh=1`);
  assert.equal(risposta.status, 400);
});

// --------------------------------------------------------------------
// 3. Il foglio del pulsante «+» nel monolite: nessuna riga finta.
// --------------------------------------------------------------------

/** Il corpo della voce `capabilities` di `sheetTemplates`, dal titolo alla voce successiva. */
function fogliocapabilities() {
  const inizio = app.indexOf('    capabilities: {');
  assert.ok(inizio > 0, 'sheetTemplates.capabilities deve esistere');
  const fine = app.indexOf('\n    control: {', inizio);
  assert.ok(fine > inizio, 'il foglio "control" segue "capabilities"');
  return app.slice(inizio, fine);
}

test('O-01 — «Attrezzi dell\'harness»: un mount point riempito dal server, MAI sette nomi scritti nel template', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, () => {
  const foglio = fogliocapabilities();
  ok(foglio, /id="toolsListMount"/, 'la sezione attrezzi è un punto di montaggio, come MCP/skill/plugin');
  for (const nome of ['elenca', 'cerca', 'leggi', 'scrivi', 'prova', 'shell', 'naviga']) {
    no(foglio, new RegExp(`\\['${nome}',`), `«${nome}» non deve più essere una riga scritta a mano nel template`);
  }
  ok(app, /async function caricaPannelloAttrezzi\(\)/);
  const carica = app.slice(app.indexOf('async function caricaPannelloAttrezzi('), app.indexOf('async function caricaPannelloAttrezzi(') + 3000);
  ok(carica, /\/tools`/, 'legge la rotta vera');
  ok(carica, /'\/api\/v1\/tools'/, 'senza sessione chiede la rotta senza sessione, invece di tacere');
  ok(carica, /nessuna sessione aperta/, 'e DICHIARA che quelli elencati sono gli attrezzi della PROSSIMA sessione, mai lo stato di una che non esiste');
  const apertura = app.slice(app.indexOf("if (type === 'capabilities')"), app.indexOf("if (type === 'sessionTree')"));
  ok(apertura, /caricaPannelloAttrezzi\(\)/, 'openSheet monta il pannello attrezzi come gli altri nove');
});

test('O-01 — «Allega file» fa DAVVERO qualcosa: apre i riferimenti @ veri del workspace, niente toast «simulato»', () => {
  const foglio = fogliocapabilities();
  ok(foglio, /data-capability-action="file"/);
  no(app, /toast\('File picker simulato'/, 'il toast finto non deve più essere chiamato da nessuna parte');
  no(app, /toast\('Cattura visiva pronta'/);
  const wiring = app.slice(app.indexOf("$$('[data-capability-action]', sheetBody)"), app.indexOf("$$('[data-environment-choice]', sheetBody)"));
  ok(wiring, /openSheet\('references'\)/, 'porta al foglio dei riferimenti VERI (suggerimentiRiferimentiReali)');
});

test('O-01 AL CONTRARIO — «Screenshot / immagine» non promette più un ingresso immagine che il kernel non ha (zero `image_url`)', () => {
  const foglio = fogliocapabilities();
  no(foglio, /data-capability-action="image"/, 'nessuna azione: non esiste un canale immagine verso il modello');
  ok(foglio, /Immagini in ingresso/, 'resta dichiarata fra le cose NON implementate, mai cancellata in silenzio');
});

test('O-01 — le voci «Non ancora implementato» non hanno più una casella che finge di essere un interruttore', () => {
  const foglio = fogliocapabilities();
  const nonImplementato = foglio.slice(foglio.indexOf('Non ancora implementato'));
  no(nonImplementato, /type="checkbox"/, 'una checkbox disabilitata è un comando che non esiste: si dice lo stato, non si mima un controllo');
  ok(nonImplementato, /status-chip/, 'lo stato si dichiara con la stessa pastiglia usata ovunque');
});

test('O-01 — la scheda «Capability» del Context rail non mostra più trattini fissi: legge i numeri veri', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, () => {
  ok(app, /function aggiornaSchedaCapability\(/);
  const fn = app.slice(app.indexOf('function aggiornaSchedaCapability('), app.indexOf('function aggiornaSchedaCapability(') + 2500);
  for (const chiave of ['attrezzi', 'mcp', 'ricerca']) ok(fn, new RegExp(`scrivi\\('${chiave}'`), `la riga «${chiave}» viene scritta da questa funzione`);
  ok(app, /data-capability-row="browser"/, 'la riga Browser ha il suo aggiornatore locale, senza fetch');
  ok(fn, /Non osservato/, 'quando il dato non c\'è si dice, non si scrive uno zero');
  for (const chiave of ['attrezzi', 'mcp', 'ricerca', 'browser']) ok(indexHtml, new RegExp(`data-capability-row="${chiave}"`), `index.html porta il gancio per «${chiave}»`);
  no(indexHtml, /<b>—<\/b><\/div><div class="capability-row">/, 'niente più trattini fissi nella scheda');
});

test('O-01 — «Apertura del pulsante +»: «Menu» cambia DAVVERO come si apre il foglio (prima era un dataset che nessuno leggeva)', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, () => {
  ok(css, /data-talos-composer-plus="menu"/, 'il valore dell\'impostazione ha un effetto dichiarato nel CSS');
  ok(app, /sheet-dialog--dal-composer/, 'il foglio aperto dal «+» porta il marcatore che il CSS usa');
});
