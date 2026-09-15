import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

const CORPO_BUONO = JSON.stringify({
  enhanced_prompt: 'Obiettivo: verificare il provider diretto. Output: una risposta migliorata.',
  summary: 'Reso esplicito obiettivo e risultato.',
  applied_principles: ['obiettivo esplicito'],
});

function rispostaModello(contenuto) {
  const corpo = { choices: [{ message: { content: contenuto } }] };
  return { ok: true, status: 200, json: async () => corpo, text: async () => JSON.stringify(corpo) };
}

async function listen(t, opzioni) {
  const app = createHttpApp({ staticHandler: async () => null, ...opzioni });
  const server = createServer(app);
  await new Promise((risolvi, rifiuta) => {
    server.once('error', rifiuta);
    server.listen(0, '127.0.0.1', risolvi);
  });
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('BC-15-13 provider diretto: Migliora usa il provider DELLA SESSIONE, non OpenRouter', async (t) => {
  const chiaveDeepSeek = 'sk-deepseek-solo-test';
  let richiesta = null;
  const base = await listen(t, {
    sessionRegistry: {
      leggiSessioneContesto: (id) => id === 'sessione-1'
        ? { sessionId: id, modello: 'deepseek:deepseek-chat', provider: 'cloud', runtimeId: null, modelId: null }
        : null,
    },
    providerStore: {
      getKey: (provider) => provider === 'deepseek' ? chiaveDeepSeek : null,
      getRuntime: (provider) => provider === 'deepseek'
        ? { provider, endpoint: 'https://deepseek.example', endpointConfigured: true, timeoutSeconds: 60 }
        : provider === 'openrouter'
          ? { provider, endpoint: 'https://openrouter.example/api/v1', endpointConfigured: false, timeoutSeconds: 60 }
          : null,
    },
    fetchMiglioraPromptFn: async (indirizzo, opzioni) => {
      richiesta = { indirizzo, opzioni };
      return rispostaModello(CORPO_BUONO);
    },
  });

  const risposta = await fetch(`${base}/api/v1/sessions/sessione-1/migliora-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'sistema questa richiesta', profondita: 'equilibrata' }),
  });

  assert.equal(risposta.status, 200, 'una chat DeepSeek funzionante non deve dipendere da OpenRouter');
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.data.fornitore, 'deepseek');
  assert.equal(richiesta.indirizzo, 'https://deepseek.example/chat/completions');
  assert.equal(richiesta.opzioni.headers.Authorization, `Bearer ${chiaveDeepSeek}`);
  const inviato = JSON.parse(richiesta.opzioni.body);
  assert.equal(inviato.model, 'deepseek-chat');
  assert.equal(inviato.stream, false);
});
