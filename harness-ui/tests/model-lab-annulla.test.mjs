import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createHttpApp } from '../src/http-app.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * ⭐⭐⭐ 04/9 — W0-05, PREMESSA FALSA. La riga del ledger diceva che «Annulla»
 * della prova runtime nel Model Lab chiamava `POST /sessions/:id/cancel`,
 * «rotta inesistente» (404 ⇒ «Errore» a schermo). Misurato con la app HTTP
 * vera: la rotta ESISTE (`http-app.mjs`, `/^\/api\/v1\/sessions\/([^/]+)\/cancel$/`)
 * e chiama `sessionRegistry.ferma(sessionId)` esattamente come `/stop`.
 * Nessun difetto ⇒ nessuna modifica al monolite. Questo test PINNA il fatto:
 * se qualcuno toglie `/cancel` mentre `app.js` la chiama ancora, qui diventa
 * rosso — è il modo in cui il difetto immaginato potrebbe nascere davvero.
 */
test('W0-05 — annullaProvaRuntimeModelLab chiama /cancel (invariato)', async () => {
  const app = await readFile(join(root, 'public/app.js'), 'utf8');
  const inizio = app.indexOf('async function annullaProvaRuntimeModelLab');
  assert.ok(inizio > 0);
  const corpo = app.slice(inizio, app.indexOf('\n  }\n', inizio));
  assert.match(corpo, /runtimeSessionId\)\}\/cancel`, \{\}\)/);
});

test('W0-05 — POST /sessions/:id/cancel con corpo {} ferma la sessione (200); id ignoto è 404; /stop fa lo stesso', async (t) => {
  const fermate = [];
  const sessionRegistry = { ferma: (id, opzioni) => { fermate.push([id, opzioni]); return id === 'viva'; } };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (percorso) => fetch(`${base}${percorso}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });

  const cancel = await post('/api/v1/sessions/viva/cancel');
  assert.equal(cancel.status, 200);
  assert.deepEqual((await cancel.json()).data, { ok: true, sessionId: 'viva' });
  assert.deepEqual(fermate, [['viva', undefined]], 'la rotta /cancel ferma la sessione senza opzioni');

  const ignota = await post('/api/v1/sessions/morta/cancel');
  assert.equal(ignota.status, 404, 'AL CONTRARIO: un id ignoto non viene fermato');

  const stop = await post('/api/v1/sessions/viva/stop');
  assert.equal(stop.status, 200);
  assert.deepEqual((await stop.json()).data, { stopped: true });
  assert.deepEqual(fermate.at(-1), ['viva', {}], '/stop ferma la stessa sessione con le opzioni del corpo');
});
