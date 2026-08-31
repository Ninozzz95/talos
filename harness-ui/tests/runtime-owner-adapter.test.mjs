import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OwnerRuntimeUnavailableError,
  chiamaConRitentaLocale,
  compattaConversazioneLocale,
  createOwnerRuntimeAdapter,
} from '../src/runtime-owner-adapter.mjs';

test('owner runtime is fail-closed when no explicit module is configured', async () => {
  const adapter = createOwnerRuntimeAdapter({ modulePath: null });
  assert.equal(await adapter.taskCatalogProvider(), null);
  await assert.rejects(() => adapter.talosLavora({}), (error) => error instanceof OwnerRuntimeUnavailableError && error.code === 'OWNER_RUNTIME_NOT_CONFIGURED');
  await assert.rejects(() => adapter.eseguiComandoSandboxato('echo ok', process.cwd()), (error) => error instanceof OwnerRuntimeUnavailableError && error.code === 'OWNER_RUNTIME_NOT_CONFIGURED');
});

test('owner runtime exposes task catalog only through an explicitly configured module', async () => {
  const adapter = createOwnerRuntimeAdapter({
    modulePath: 'C:/owner/runtime.mjs',
    importFn: async () => ({
      listaTaskDisponibili: () => [{ id: 'real-task', progetto: 'demo', difficolta: 1, consegnaCorta: 'x' }],
      preparaEsecuzione: (taskId) => ({ cartella: 'C:/workspace', comandoProva: 'npm test', task: { id: taskId } }),
    }),
  });
  const provider = await adapter.taskCatalogProvider();
  assert.deepEqual(provider.list(), [{ id: 'real-task', progetto: 'demo', difficolta: 1, consegnaCorta: 'x' }]);
  assert.deepEqual(provider.prepare('real-task'), { cartella: 'C:/workspace', comandoProva: 'npm test', task: { id: 'real-task' } });
});

test('local OpenRouter adapter keeps the existing no-tool compaction contract', async () => {
  const fetchDiRete = async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.deepEqual(body.tools, []);
    return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: '  riassunto vero  ' } }], usage: { total_tokens: 12 } }) };
  };
  const result = await compattaConversazioneLocale(
    [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }],
    (messages) => chiamaConRitentaLocale({ modello: 'm', chiave: 'k', messaggi: messages, attrezzi: [], fetchDiRete }),
  );
  assert.equal(result.compattato, true);
  assert.equal(result.messaggi.at(-1).content.includes('riassunto vero'), true);
});

test('runtime owner snapshot is truthful: absent owner is unavailable, explicit empty owner is available', async () => {
  const absent = createOwnerRuntimeAdapter({ modulePath: null });
  assert.deepEqual(await absent.runtimeSnapshot(), { status: 'unavailable', items: null, reason: 'runtime_not_configured', observedAt: null });
  const configured = createOwnerRuntimeAdapter({
    modulePath: 'C:\\owner\\runtime.mjs',
    importFn: async () => ({ runtimeSnapshot: async () => ({ status: 'available', items: [], reason: null, observedAt: '2026-08-31T12:00:00.000Z' }) }),
  });
  assert.deepEqual(await configured.runtimeSnapshot(), { status: 'available', items: [], reason: null, observedAt: '2026-08-31T12:00:00.000Z' });
});
