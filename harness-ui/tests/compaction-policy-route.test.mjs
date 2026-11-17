import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';

test('CTX-WINDOW-HTTP — policy read-only della sessione con guardia token e busta standard', async (t) => {
  const expected = {
    // owner 11/11 17:47 e punto 4 del passaggio dopo il revisore unico: 1M ⇒ tetto del motore 200.000, detto `explicit-cap` + `engineCeiling`
    windowTokens: 1_000_000, triggerTokens: 200_000, warningTokens: 160_000,
    emergencyTokens: 240_000, source: 'explicit-cap', engineCeiling: true, modelId: 'z-ai/glm-5.3-flash', inProgress: false,
  };
  const app = createHttpApp({ senzaGettone: 'prove', 
    staticHandler: async () => null,
    token: 'token-di-prova',
    sessionRegistry: { politicaCompattazione: (id) => id === 's1' ? expected : { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' } },
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions`;
  const headers = { cookie: 'talos_token=token-di-prova' };

  const denied = await fetch(`${base}/s1/compaction-policy`);
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).error.code, 'AUTH_REQUIRED');

  const response = await fetch(`${base}/s1/compaction-policy`, { headers });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.data, expected);
  assert.equal((await fetch(`${base}/other/compaction-policy`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/s1/compaction-policy?q=1`, { headers })).status, 400);
});
