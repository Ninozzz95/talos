import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OwnerRuntimeUnavailableError,
  adattaRichiestaConDescrizioneComando,
  chiamaConRitentaLocale,
  compattaConversazioneLocale,
  creaFetchConDescrizioneComando,
  createOwnerRuntimeAdapter,
} from '../src/runtime-owner-adapter.mjs';

test('TOOL-DESCRIPTION-CONTRACT-01 — lo schema desktop richiede al modello una descrizione umana per shell', () => {
  const richiesta = {
    model: 'qwen/qwen3.8-flash',
    messages: [{ role: 'system', content: 'Agisci sul progetto.' }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'shell',
          description: 'Runs a command.',
          parameters: {
            type: 'object',
            properties: { comando: { type: 'string' } },
            required: ['comando'],
          },
        },
      },
    ],
  };
  const originale = structuredClone(richiesta);

  const adattata = adattaRichiestaConDescrizioneComando(richiesta);

  assert.deepEqual(richiesta, originale, 'l’adapter non deve mutare il body costruito dal runtime owner');
  assert.equal(adattata.tools[0].function.parameters.properties.descrizione.type, 'string');
  assert.match(adattata.tools[0].function.parameters.properties.descrizione.description, /italiano/i);
  assert.deepEqual(adattata.tools[0].function.parameters.required, ['comando', 'descrizione']);
});

test('TOOL-DESCRIPTION-THIRD-PARTY-02 — tool non-shell e schemi terzi restano invariati', () => {
  const toolMcp = {
    type: 'function',
    function: {
      name: 'mcp__server__azione',
      description: 'External contract.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  };
  const adattata = adattaRichiestaConDescrizioneComando({ tools: [toolMcp] });
  assert.deepEqual(adattata.tools, [toolMcp]);
});

test('TOOL-DESCRIPTION-FALLBACK-03 — il fetch lascia passare body non JSON e richieste senza tool', async () => {
  const viste = [];
  const fetchFinto = async (url, init) => {
    viste.push({ url, init });
    return { ok: true };
  };
  const fetchAdattato = creaFetchConDescrizioneComando(fetchFinto);
  await fetchAdattato('https://example.test/a', { method: 'POST', body: 'non-json' });
  await fetchAdattato('https://example.test/b', { method: 'POST', body: JSON.stringify({ messages: [] }) });
  assert.equal(viste[0].init.body, 'non-json');
  assert.equal(viste[1].init.body, JSON.stringify({ messages: [] }));
});

test('TOOL-DESCRIPTION-OWNER-BOUNDARY-04 — talosLavora inietta il fetch adattato senza cambiare la firma owner', async () => {
  let bodyRicevuto = null;
  const fetchFinto = async (_url, init) => {
    bodyRicevuto = JSON.parse(init.body);
    return { ok: true };
  };
  const adapter = createOwnerRuntimeAdapter({
    modulePath: 'C:/owner/runtime.mjs',
    importFn: async () => ({
      talosLavora: ({ fetchDiRete }) => fetchDiRete('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          tools: [{
            type: 'function',
            function: {
              name: 'shell',
              parameters: { type: 'object', properties: { comando: { type: 'string' } }, required: ['comando'] },
            },
          }],
        }),
      }),
    }),
  });

  await adapter.talosLavora({ fetchDiRete: fetchFinto });

  assert.deepEqual(bodyRicevuto.tools[0].function.parameters.required, ['comando', 'descrizione']);
});

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

function flussoTemporizzato(passaggi) {
  const timer = [];
  let chiuso = false;
  return new ReadableStream({
    start(controller) {
      for (const { dopo, testo } of passaggi) {
        timer.push(setTimeout(() => {
          if (!chiuso) controller.enqueue(new TextEncoder().encode(testo));
        }, dopo));
      }
      const fine = Math.max(...passaggi.map((passaggio) => passaggio.dopo), 0) + 2;
      timer.push(setTimeout(() => {
        if (!chiuso) { chiuso = true; controller.close(); }
      }, fine));
    },
    cancel() { chiuso = true; for (const id of timer) clearTimeout(id); },
  });
}

test('OPENROUTER-IDLE-01 — keepalive SSE rinnova il limite di inattività oltre il vecchio timeout totale', async () => {
  const { creaFetchOpenRouterResiliente } = await import('../src/runtime-owner-adapter.mjs');
  assert.equal(typeof creaFetchOpenRouterResiliente, 'function');
  const upstream = async () => new Response(flussoTemporizzato([
    { dopo: 0, testo: ': OPENROUTER PROCESSING\n\n' },
    { dopo: 12, testo: ': OPENROUTER PROCESSING\n\n' },
    { dopo: 24, testo: 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n' },
    { dopo: 30, testo: 'data: [DONE]\n\n' },
  ]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const fetchResiliente = creaFetchOpenRouterResiliente(upstream, { timeoutMsFn: () => 15 });

  const risposta = await fetchResiliente('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', body: JSON.stringify({ model: 'qwen/qwen3.8-flash', stream: true }),
    signal: AbortSignal.timeout(1),
  });

  assert.equal(risposta.ok, true);
  assert.match(await risposta.text(), /"content":"ok"/);
});

test('OPENROUTER-IDLE-01 contrario — silenzio vero produce 408 ritentabile, non attesa infinita', async () => {
  const { creaFetchOpenRouterResiliente } = await import('../src/runtime-owner-adapter.mjs');
  const upstream = async () => new Response(new ReadableStream({ start() {} }), {
    status: 200, headers: { 'content-type': 'text/event-stream' },
  });
  const risposta = await creaFetchOpenRouterResiliente(upstream, { timeoutMsFn: () => 10 })(
    'https://openrouter.ai/api/v1/chat/completions',
    { method: 'POST', body: JSON.stringify({ model: 'qwen/qwen3.8-flash', stream: true }) },
  );
  assert.equal(risposta.status, 408);
  assert.match(await risposta.text(), /inattiv/i);
});

test('OPENROUTER-STOP-03 — stop utente interrompe subito e non viene trasformato in retry', async () => {
  const { creaFetchOpenRouterResiliente } = await import('../src/runtime-owner-adapter.mjs');
  const stop = new AbortController();
  const upstream = async (_url, init) => {
    await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  };
  const promessa = creaFetchOpenRouterResiliente(upstream, { timeoutMsFn: () => 1_000, userSignal: stop.signal })(
    'https://openrouter.ai/api/v1/chat/completions',
    { method: 'POST', body: JSON.stringify({ model: 'qwen/qwen3.8-flash', stream: true }) },
  );
  setTimeout(() => stop.abort(new DOMException('Fermato dall’utente', 'AbortError')), 5);
  await assert.rejects(promessa, (error) => error?.name === 'AbortError');
});

test('MODEL-REASONING-04 — modello mandatory non riceve effort none e conserva il resto del body', async () => {
  const { creaFetchOpenRouterResiliente } = await import('../src/runtime-owner-adapter.mjs');
  let body = null;
  const upstream = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  };
  const fetchResiliente = creaFetchOpenRouterResiliente(upstream, {
    timeoutMsFn: () => 1_000,
    modelCapabilityFn: async () => ({ reasoning: { supportedEfforts: ['high', 'medium', 'low'], defaultEffort: 'medium', defaultEnabled: true, mandatory: true } }),
  });
  await fetchResiliente('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', body: JSON.stringify({ model: 'google/gemini-3.7-flash', messages: [{ role: 'user', content: 'continua' }], reasoning: { effort: 'none', summary: 'auto' } }),
  });
  assert.deepEqual(body.reasoning, { effort: 'medium', summary: 'auto' });
  assert.deepEqual(body.messages, [{ role: 'user', content: 'continua' }]);
});

test('OPENROUTER-RETRY-02 — errore SSE come primo evento diventa status ritentabile prima di mostrare output', async () => {
  const { creaFetchOpenRouterResiliente } = await import('../src/runtime-owner-adapter.mjs');
  const upstream = async () => new Response(flussoTemporizzato([
    { dopo: 0, testo: 'data: {"error":{"code":503,"message":"provider unavailable","metadata":{"error_type":"provider_unavailable"}},"choices":[{"delta":{},"finish_reason":"error"}]}\n\n' },
  ]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const risposta = await creaFetchOpenRouterResiliente(upstream, { timeoutMsFn: () => 1_000 })(
    'https://openrouter.ai/api/v1/chat/completions',
    { method: 'POST', body: JSON.stringify({ model: 'qwen/qwen3.8-flash', stream: true }) },
  );
  assert.equal(risposta.status, 503);
  assert.match(await risposta.text(), /provider unavailable/);
});

test('OPENROUTER-RETRY-02 contrario — errore dopo testo non riavvia il turno e chiude lo stream esplicitamente', async () => {
  const { creaFetchOpenRouterResiliente } = await import('../src/runtime-owner-adapter.mjs');
  const upstream = async () => new Response(flussoTemporizzato([
    { dopo: 0, testo: 'data: {"choices":[{"delta":{"content":"parziale"}}]}\n\n' },
    { dopo: 8, testo: 'data: {"error":{"code":"server_error","message":"provider disconnected"},"choices":[{"delta":{},"finish_reason":"error"}]}\n\n' },
  ]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const risposta = await creaFetchOpenRouterResiliente(upstream, { timeoutMsFn: () => 1_000 })(
    'https://openrouter.ai/api/v1/chat/completions',
    { method: 'POST', body: JSON.stringify({ model: 'qwen/qwen3.8-flash', stream: true }) },
  );
  assert.equal(risposta.status, 200);
  await assert.rejects(risposta.text(), /provider disconnected/);
});
