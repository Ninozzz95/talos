/*
 * 16/10/2026 (bugfixer) — revisione avversaria delle quattro cure per la CLI 0.6.8 (f92bbdff7, 13c0225ba, 04de7c558).
 * Le ROSSE sono difetti; le VERDI dicono ciò che regge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaPuliziaDeiGruppi } from '../src/kernel/talosHarness.mjs';
import { createContextTokenCounter } from '../src/context-token-counters.mjs';

/* Lo stesso processo finto e lo stesso signal-exit in miniatura di pulizia-gruppi-chi-decide.test.mjs */
function processoFinto(gruppi = []) {
  const p = new EventEmitter();
  p.pid = 500; p.colpi = []; p.gruppi = new Set(gruppi);
  p.kill = (pid, s) => { if (s === 0) { if (!p.gruppi.has(-pid)) { const e = new Error('kill ESRCH'); e.code = 'ESRCH'; throw e; } return; } p.colpi.push([pid, s]); };
  p.exit = () => {};
  return p;
}
const timerFinti = () => { const t = []; t.imposta = (f, ms) => { t.push([f, ms]); return { unref() {} }; }; return t; };
const figlio = (pid) => Object.assign(new EventEmitter(), { pid });
const rimandato = (proc, s) => proc.colpi.some(([pid, seg]) => pid === proc.pid && seg === s);
function signalExitFinto(proc, segnale) {
  const emitter = { count: 1 };
  const stato = { agito: 0 };
  const ascolta = function () {
    const listeners = proc.listeners(segnale);
    if (listeners.length === emitter.count) { stato.agito++; proc.removeListener(segnale, ascolta); proc.kill(proc.pid, segnale); }
  };
  proc.on(segnale, ascolta);
  return { stato, ascolta };
}

test('CHI-REV-01 — [VERDE] un secondo SIGTERM durante la grazia, accanto a signal-exit: SIGKILL ai gruppi subito e il segnale torna al processo (insiste)', () => {
  const proc = processoFinto([11]);
  signalExitFinto(proc, 'SIGTERM');
  const timer = timerFinti();
  const pulizia = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: timer.imposta });
  pulizia.registra(figlio(11));
  proc.emit('SIGTERM');
  assert.ok(!rimandato(proc, 'SIGTERM'), 'premessa: al primo si aspetta la grazia');
  proc.emit('SIGTERM');
  assert.ok(proc.colpi.some(([pid, s]) => pid === -11 && s === 'SIGKILL'), JSON.stringify(proc.colpi));
  assert.ok(rimandato(proc, 'SIGTERM'), JSON.stringify(proc.colpi));
});

test('CHI-REV-02 — [LIMITE DICHIARATO 16/10] DUE copie del kernel nello stesso processo (due `creaPuliziaDeiGruppi`): ognuna vede i listener dell\'altra come «dell\'host», e con signal-exit nessuno fa uscire il processo', { todo: 'limite dichiarato in creaPuliziaDeiGruppi: oggi CLI e desktop caricano un kernel solo' }, () => {
  const proc = processoFinto([11, 12]);
  const se = signalExitFinto(proc, 'SIGINT');
  const a = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: timerFinti().imposta });
  const b = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: timerFinti().imposta });
  a.registra(figlio(11)); b.registra(figlio(12));
  proc.emit('SIGINT');
  assert.ok(rimandato(proc, 'SIGINT') || se.stato.agito > 0, `nessuno rimanda il SIGINT: ${JSON.stringify(proc.colpi)} — \`nostri\` è un Set per istanza (talosHarness.mjs, creaPuliziaDeiGruppi): la marca e il gestore dell'altra copia contano come host. Oggi la CLI carica UN kernel (bundle-kernel.mjs, chunk condivisi), quindi è un limite da dichiarare, non un difetto visto`);
});

test('CONTA-REV-01 — [CURATO 16/10, era S4] un contatore che accetta la connessione e non risponde non tiene fermo il giro: dopo il tetto di tempo, la stima dichiarata', async (t) => {
  const appese = [];
  const server = createServer((req) => { appese.push(req); /* non risponde mai */ });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const porta = server.address().port;
  assert.notEqual(porta, 4174);
  const ferma = new AbortController();
  t.after(() => new Promise((risolvi) => { ferma.abort(); server.closeAllConnections(); server.close(risolvi); }));
  const counter = createContextTokenCounter({ resolveProfile: async () => ({ baseURL: `http://127.0.0.1:${porta}/v1` }), fetchFn: (url, opzioni) => fetch(url, opzioni), tempoMassimoMs: 300 }); // il tetto vero è TEMPO_MASSIMO_DEL_CONTEGGIO_MS (10 s)
  const modello = { provider: 'local', model: 'qwen', windowTokens: 16384, responseReserve: 2048 };
  const esito = await Promise.race([
    counter.countPreparedContext({ messages: [{ role: 'user', content: 'ciao' }], model: modello, signal: ferma.signal }).then((r) => ({ r }), (e) => ({ e })),
    new Promise((r) => { setTimeout(() => r({ appeso: true }), 8_000); }),
  ]);
  assert.ok(!esito.appeso, `dopo 8 s il conteggio aspetta ancora (${appese.length} richiesta ricevuta dal contatore): server.mjs (~829) passa \`fetch(url, options)\` col solo segnale del giro, senza un tetto (undici aspetta le intestazioni fino a 300 s). È la «rete che non risponde» della cura, nella forma più comune: un proxy appeso`);
  assert.equal(esito.r?.fallback, 'CTX_TOKEN_TIMEOUT');
});

test('FILTRO-REV-01 — [CURATO 16/10, il punto finale del DNS] l\'indirizzo UFFICIALE di OpenAI scritto con una porta, con http://, con un altro percorso o col punto finale del DNS: il filtro dei nomi resta?', async () => {
  const { createProviderProbe } = await import('../src/provider-probe.mjs');
  const righe = { data: [{ id: 'mock-model' }, { id: 'gpt-5.4' }, { id: 'tts-1' }, { id: 'text-embedding-3-small' }] };
  const conIndirizzo = (endpoint) => createProviderProbe({ leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint, timeoutSeconds: 5 }), fetchImpl: async () => Response.json(righe) });
  const esiti = {};
  for (const endpoint of ['https://api.openai.com:443/v1', 'http://api.openai.com/v1', 'https://api.openai.com/openai/v1', 'https://api.openai.com./v1']) {
    esiti[endpoint] = (await conIndirizzo(endpoint).elencaModelli('openai')).modelli.map((m) => m.id);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(esiti).map(([k, v]) => [k, v.join(',')])), {
    'https://api.openai.com:443/v1': 'openai:gpt-5.4', 'http://api.openai.com/v1': 'openai:gpt-5.4', 'https://api.openai.com/openai/v1': 'openai:gpt-5.4',
    'https://api.openai.com./v1': 'openai:gpt-5.4',
  }, 'il confronto è sul nome dell\'host (provider-probe.mjs, `catalogoUfficiale`): «api.openai.com.» (FQDN col punto) è lo stesso host per il DNS ma un nome diverso per URL — e porta TTS ed embedding in /model');
});

test('FILTRO-REV-02 — [CURATO 16/10, owner «Nascondili anche lì»] un proxy (LiteLLM) davanti a OpenAI elenca anche TTS, embedding e immagini: non finiscono più in /model né fra i modelli di un sotto-agente', async () => {
  const { createProviderProbe } = await import('../src/provider-probe.mjs');
  const righe = { data: [{ id: 'gpt-5.4' }, { id: 'tts-1' }, { id: 'text-embedding-3-small' }, { id: 'dall-e-3' }, { id: 'whisper-1' }, { id: 'qwen3-coder' }] };
  const probe = createProviderProbe({ leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://litellm.example.test/v1', timeoutSeconds: 5 }), fetchImpl: async () => Response.json(righe) });
  const ids = (await probe.elencaModelli('openai')).modelli.map((m) => m.id);
  assert.deepEqual(ids.filter((id) => /(tts|embedding|dall-e|whisper)/u.test(id)), [], `${ids.join(', ')} — la cura toglie il filtro dei NOMI (giusto: «mock-model», «qwen3-coder»), ma insieme toglie anche quello dei modelli che non conversano (audio|realtime|transcribe|tts|image); quello si potrebbe tenere su ogni indirizzo`);
});
