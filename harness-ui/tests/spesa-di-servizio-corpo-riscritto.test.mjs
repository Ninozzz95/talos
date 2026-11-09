/*
 * Spesa di servizio, parte 2 A — la strada che si era rotta (suite intera, 30/10/2026 14:23Z): una richiesta il cui CORPO il multi-fornitore
 * riscrive (`talos_recovery` / `talos_provider_state` tolti prima della rete, `creaFetchInstradata`) con il segno `talosServizio` presente.
 * `const opzioni` lì faceva lanciare un TypeError e il giro moriva con «The provider did not accept the request» prima della rete
 * (Performance: «proprio la strada che si è rotta», sulle due porte). Server finto locale, nessuna chiave vera, nessuna porta fissa.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

async function banco(t) {
  const corpi = [];
  const server = createServer(async (req, res) => {
    let corpo = ''; for await (const pezzo of req) corpo += pezzo;
    corpi.push(corpo);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 2 } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  const valori = new Map();
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'finta-openrouter' }, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  store.setRuntime('openrouter', { endpoint: `http://127.0.0.1:${server.address().port}/openrouter` });
  return { corpi, store };
}

const messaggi = [
  { role: 'system', content: 'Riassumi.' },
  { role: 'user', content: 'Storia ripresa.', talos_recovery: { kind: 'partial', from: 'legacy' } },
];

for (const conSegno of [false, true]) {
  test(`SERVIZIO-CORPO-RISCRITTO ${conSegno ? '(segno: consumo-di-servizio)' : '(chat: consumo-fornitore)'} — il corpo si riscrive, la richiesta parte, il segno non va in rete`, async (t) => {
    const { corpi, store } = await banco(t);
    const fornitore = []; const servizio = [];
    const f = creaFetchMultiProvider(fetch, { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) }, fallbackProviders: [],
      onCambioFornitore: async () => {}, onConsumoFornitore: async (v) => { fornitore.push(v); }, onConsumoDiServizio: async (v) => { servizio.push(v); } });
    const risposta = await f('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer finta-openrouter' },
      body: JSON.stringify({ model: 'z-ai/glm-5.3-flash', messages: messaggi, max_tokens: 64 }),
      ...(conSegno ? { talosServizio: { scopo: 'riassunto', inPrimoPiano: true } } : {}),
    });
    assert.equal(risposta.status, 200);
    assert.equal(corpi.length, 1, 'la richiesta è arrivata al fornitore');
    const arrivato = JSON.parse(corpi[0]);
    assert.equal(JSON.stringify(arrivato).includes('talos_recovery'), false, 'premessa: il corpo è stato RISCRITTO (talos_recovery tolto)');
    assert.equal(corpi[0].includes('talosServizio'), false);
    await risposta.text();
  });
}
