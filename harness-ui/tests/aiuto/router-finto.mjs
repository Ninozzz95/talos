/*
 * A fake llama.cpp router (and a fake standalone llama-server) for the router-mode tests (27/10/2026). It behaves like
 * `tools/server/server-models.cpp` at clone f849095 on the points TALOS relies on:
 *   - the preset is read at spawn and on `GET /models?reload=1`; a reload unloads ONLY the running models whose section changed
 *     (`:1086-1118`);
 *   - `POST /models/load` answers at once and the child goes `loading` → `loaded`, or → `unloaded` with `failed: true` and
 *     `exit_code` (`:2409-2425`, `:2454-2458`), or stays `loading` (#27351);
 *   - `/models/sse` sends `data: {"model","event","data"}` lines, with `progress: {stages, current, value}` while loading
 *     (`:877-887`, `:2020-2027`, `server-context.cpp:1174-1177`);
 *   - `/props?model=` answers only for a loaded child, with its `n_ctx` (= the section's `ctx-size`);
 *   - `/health` is the router's own.
 * Nothing here listens on a port: the supervisors get this `fetchImpl` and this `spawnImpl`.
 */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * J-R1 (block 9 review, 27/10/2026): b11669 reads `--models-preset` and `LLAMA_ARG_API_KEY_FILE` as narrow strings in the ANSI code
 * page (`common/preset.cpp:170-177` builds a `std::filesystem::path` from the UTF-8 `std::string`; `common/arg.cpp` `--api-key-file`
 * opens an `std::ifstream` on the `std::getenv` value), so a non-ASCII letter in either path makes the real router exit 1 at start.
 * Measured on the shipped binary: «preset file does not exist: …\JÃ¶rg\presets-1.ini» and «failed to open file '…\???\presets-1.key'».
 * A relative path is resolved against the process's current folder, which `CreateProcessW` passes in UTF-16: the fake does the same.
 */
const nonAscii = (testo) => typeof testo === 'string' && /[^\x20-\x7e]/u.test(testo);

export function leggiIni(testo) {
  const sezioni = new Map();
  let attuale = null;
  for (const grezza of testo.split(/\r?\n/u)) {
    const riga = grezza.trim();
    if (!riga || riga.startsWith(';') || riga.startsWith('#')) continue;
    const intestazione = /^\[\s*([^\]]+?)\s*\]$/u.exec(riga);
    if (intestazione) { attuale = new Map(); sezioni.set(intestazione[1], attuale); continue; }
    const coppia = /^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/u.exec(riga);
    if (coppia && attuale) attuale.set(coppia[1], coppia[2]);
  }
  return sezioni;
}

const testoDellaSezione = (mappa) => JSON.stringify([...mappa]);

function figlio() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  return c;
}

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * @param {object} [o]
 * @param {(modelId: string, sezione: Map<string,string>) => 'ok'|'fallisce'|'bloccato'} [o.esito] what the router's child does
 * @param {(args: string[]) => 'ok'|'fallisce'} [o.esitoStandalone] what today's engine does
 * @param {number} [o.ritardoMs] how long a router load takes
 * @param {number} [o.scaricoMs] how long an unload takes
 * @param {boolean} [o.sseSpezzato] send every SSE event in two pieces cut mid-line
 */
export function creaRouterFinto({ esito = () => 'ok', esitoStandalone = () => 'ok', ritardoMs = 6, scaricoMs = 0, sseSpezzato = false } = {}) {
  const banco = { routers: [], standalone: [], richieste: [], spawn: [] };
  let prossimaPorta = 18_200;
  banco.portAllocator = async () => prossimaPorta++;

  function inviaSse(router, evento) {
    const riga = `data: ${JSON.stringify(evento)}\n\n`;
    for (const flusso of router.flussi) {
      try {
        if (sseSpezzato) { flusso.enqueue(new TextEncoder().encode(riga.slice(0, 9))); flusso.enqueue(new TextEncoder().encode(riga.slice(9))); }
        else flusso.enqueue(new TextEncoder().encode(riga));
      } catch { /* closed */ }
    }
  }

  function cambiaStato(router, nome, campi) {
    const voce = router.stati.get(nome);
    if (!voce) return;
    Object.assign(voce, campi);
    const dati = { status: voce.value, ...(voce.value === 'unloaded' ? { exit_code: voce.exit_code } : {}), ...(campi.progress ? { progress: campi.progress } : {}) };
    inviaSse(router, { model: nome, event: 'status_change', data: dati });
  }

  function leggiPreset(router) {
    const sezioni = leggiIni(readFileSync(router.preset, 'utf8'));
    for (const [nome, sezione] of sezioni) {
      const voce = router.stati.get(nome);
      if (!voce) { router.stati.set(nome, { value: 'unloaded', failed: false, exit_code: 0, sezione }); continue; }
      const cambiata = testoDellaSezione(voce.sezione) !== testoDellaSezione(sezione);
      if (cambiata && ['loading', 'loaded', 'sleeping'].includes(voce.value)) {
        router.scaricati.push({ nome, motivo: 'reload' });
        voce.value = 'unloaded'; voce.exit_code = 0; voce.failed = false;
      }
      voce.sezione = sezione;
      if (!['loading', 'loaded', 'sleeping'].includes(voce.value)) { voce.failed = false; voce.exit_code = 0; }
    }
    for (const nome of [...router.stati.keys()]) if (!sezioni.has(nome)) router.stati.delete(nome);
  }

  function spawnImpl(binario, args, opzioni) {
    banco.spawn.push({ binario, args: [...args], opzioni });
    const c = figlio();
    c.porta = Number(args[args.indexOf('--port') + 1]);
    c.vivo = true;
    c.kills = [];
    if (args.includes('--models-preset')) {
      c.tipo = 'router';
      c.args = [...args];
      c.cwd = opzioni?.cwd ?? process.cwd();
      const presetDato = args[args.indexOf('--models-preset') + 1];
      const chiaveData = opzioni?.env?.LLAMA_ARG_API_KEY_FILE ?? null;
      c.preset = resolve(c.cwd, presetDato);
      /* the key comes from the file named by LLAMA_ARG_API_KEY_FILE (the router's and its children's), as b11669 reads it */
      c.fileChiave = chiaveData ? resolve(c.cwd, chiaveData) : null;
      c.stati = new Map();
      c.flussi = new Set();
      c.scaricati = [];
      c.caricati = [];
      c.kill = (segnale) => { c.kills.push(segnale); if (c.vivo) { c.vivo = false; for (const f of c.flussi) { try { f.close(); } catch { /* */ } } setTimeout(() => c.emit('close', 0, segnale), 1); } return true; };
      if (nonAscii(chiaveData) || nonAscii(presetDato)) {
        /* J-R1: what b11669 says, then exit 1 before /health ever answers */
        c.vivo = false;
        const riga = nonAscii(chiaveData)
          ? `error while handling environment variable "LLAMA_ARG_API_KEY_FILE": failed to open file '${chiaveData.replace(/[^\x20-\x7e]/gu, '?')}'\n`
          : `E srv  llama_server: failed to initialize router models: preset file does not exist: ${presetDato}\n`;
        banco.routers.push(c);
        setTimeout(() => { c.stderr.emit('data', riga); c.emit('close', 1); }, 1);
        return c;
      }
      c.chiave = c.fileChiave ? readFileSync(c.fileChiave, 'utf8').trim() : null;
      leggiPreset(c);
      /** the router dies by itself (a crash): its children go with it (EOF on their stdin, `server-models.cpp:2156-2175`) */
      c.cade = (codice = 3) => { c.vivo = false; for (const f of c.flussi) { try { f.close(); } catch { /* */ } } c.stderr.emit('data', 'srv  main: fatal crash\n'); setTimeout(() => c.emit('close', codice), 1); };
      banco.routers.push(c);
      return c;
    }
    c.tipo = 'standalone';
    c.args = [...args];
    c.ctx = args.includes('-c') ? Number(args[args.indexOf('-c') + 1]) : null;
    c.esito = esitoStandalone(args);
    c.kill = (segnale) => { c.kills.push(segnale); if (c.vivo) { c.vivo = false; setTimeout(() => c.emit('close', 0, segnale), 1); } return true; };
    if (c.esito === 'fallisce') {
      setTimeout(() => { c.stderr.emit('data', 'ggml_vulkan: ErrorOutOfDeviceMemory\n'); c.vivo = false; c.emit('close', 1); }, 3);
    }
    banco.standalone.push(c);
    return c;
  }

  async function fetchImpl(indirizzo, init = {}) {
    const u = new URL(String(indirizzo));
    const porta = Number(u.port);
    const metodo = String(init.method ?? 'GET').toUpperCase();
    const corpo = typeof init.body === 'string' ? init.body : null;
    const intestazioni = new Headers(init.headers ?? {});
    banco.richieste.push({ porta, metodo, percorso: `${u.pathname}${u.search}`, corpo, autorizzazione: intestazioni.get('Authorization') });
    const router = banco.routers.find((r) => r.porta === porta && r.vivo);
    if (router && banco.reteRotta?.(u.pathname)) throw new TypeError('fetch failed'); // a router that stops answering, alive
    if (router) return rispostaDelRouter(router, u, metodo, corpo, intestazioni, init.signal);
    const solo = banco.standalone.find((s) => s.porta === porta && s.vivo);
    if (solo) {
      if (solo.esito === 'fallisce') return json({}, 503);
      if (u.pathname === '/props') return json({ default_generation_settings: { n_ctx: solo.ctx } });
      return json({ status: 'ok' });
    }
    throw new TypeError('fetch failed');
  }

  function rispostaDelRouter(router, u, metodo, corpo, intestazioni, segnale) {
    if (u.pathname === '/health') return json({ status: 'ok' });
    if (intestazioni.get('Authorization') !== `Bearer ${router.chiave}`) return json({ error: { message: 'Invalid API Key' } }, 401);
    const modello = u.searchParams.get('model');
    if (u.pathname === '/models/sse') {
      let flusso;
      const stream = new ReadableStream({
        start(c) { flusso = c; router.flussi.add(c); },
        cancel() { router.flussi.delete(flusso); },
      });
      segnale?.addEventListener('abort', () => { router.flussi.delete(flusso); try { flusso.close(); } catch { /* */ } }, { once: true });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (u.pathname === '/models' && metodo === 'GET') {
      if (u.searchParams.get('reload')) { router.ricariche = (router.ricariche ?? 0) + 1; leggiPreset(router); }
      return json({ object: 'list', data: [...router.stati].map(([id, v]) => ({ id, status: { value: v.value, ...(v.failed ? { failed: true, exit_code: v.exit_code } : {}) } })) });
    }
    if (u.pathname === '/v1/models' && metodo === 'GET') return json({ object: 'list', data: [...router.stati.keys()].map((id) => ({ id })) });
    if (u.pathname === '/models/load' && metodo === 'POST') {
      const nome = JSON.parse(corpo).model;
      const voce = router.stati.get(nome);
      if (!voce) return json({ error: { message: 'model is not found' } }, 404);
      if (['loading', 'loaded', 'sleeping'].includes(voce.value)) return json({ error: { message: 'model is already running' } }, 400);
      router.caricati.push({ nome, altri: Object.fromEntries([...router.stati].filter(([k]) => k !== nome).map(([k, v]) => [k, v.value])) });
      cambiaStato(router, nome, { value: 'loading', failed: false, exit_code: 0 });
      const sezione = voce.sezione;
      setTimeout(() => {
        if (!router.vivo || router.stati.get(nome)?.value !== 'loading') return;
        cambiaStato(router, nome, { value: 'loading', progress: { stages: ['text_model'], current: 'text_model', value: 0.5 } });
      }, Math.max(1, Math.floor(ritardoMs / 2)));
      setTimeout(() => {
        if (!router.vivo || router.stati.get(nome)?.value !== 'loading') return;
        const fine = esito(nome, sezione);
        if (fine === 'bloccato') return;
        if (fine === 'fallisce') {
          /* as b11669 does: the child's own log on the router's STDOUT, prefixed with its port; the router's stderr only says it exited */
          router.stdout.emit('data', `[65281] 0.00.030 I srv    load_model: loading model '${nome}'\n[65281] 0.00.031 E llama_model_load: error loading model: finto\n`);
          router.stderr.emit('data', `srv           run: instance name=${nome} exited with status 1\n`);
          cambiaStato(router, nome, { value: 'unloaded', failed: true, exit_code: 1 });
          return;
        }
        cambiaStato(router, nome, { value: 'loaded' });
      }, ritardoMs);
      return json({ success: true });
    }
    if (u.pathname === '/models/unload' && metodo === 'POST') {
      const nome = JSON.parse(corpo).model;
      const voce = router.stati.get(nome);
      if (!voce) return json({ error: { message: 'model is not found' } }, 400);
      if (!['loading', 'loaded', 'sleeping'].includes(voce.value)) return json({ error: { message: 'model is not running' } }, 400);
      router.scaricati.push({ nome, motivo: 'unload' });
      const fatto = () => cambiaStato(router, nome, { value: 'unloaded', failed: false, exit_code: 0 });
      if (scaricoMs > 0) setTimeout(fatto, scaricoMs).unref?.(); else fatto(); // unref: an unload that never ends must not hold the test run
      return json({ success: true });
    }
    if (u.pathname === '/props' && metodo === 'GET') {
      const voce = router.stati.get(modello);
      if (!voce || !['loaded', 'sleeping'].includes(voce.value)) return json({ error: { message: 'model is not loaded' } }, 400);
      return json({ default_generation_settings: { n_ctx: Number(voce.sezione.get('ctx-size')) } });
    }
    if (u.pathname === '/slots') return json([{ id: 0, is_processing: false }]);
    if (u.pathname === '/metrics') return new Response('llamacpp:tokens_predicted_total 3850\nllamacpp:tokens_predicted_seconds_total 100\n', { status: 200 });
    if (u.pathname === '/v1/chat/completions' && metodo === 'POST') return json({ model: JSON.parse(corpo).model, choices: [] });
    return json({ error: { message: 'not found' } }, 404);
  }

  banco.spawnImpl = spawnImpl;
  banco.fetchImpl = fetchImpl;
  banco.routerVivo = () => banco.routers.findLast((r) => r.vivo) ?? null;
  return banco;
}
