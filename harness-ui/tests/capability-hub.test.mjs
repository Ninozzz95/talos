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

