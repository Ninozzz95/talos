import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextModelAdapter } from './context-provider-adapter.mjs';
import { createContextInferenceScheduler } from './context-inference-scheduler.mjs';
import { createDesktopContextService } from './context-desktop-service.mjs';
import { separaFonteModello } from './model-destination.mjs';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const isLocal = profile => ['local', 'ollama', 'llama.cpp'].includes(profile.provider);

/** Desktop composition root. Model metadata, credentials, counter transport and
 * common usage policy are backend ports; no model payload chooses a DB path. */
export async function createDesktopContextRuntime({ sessionDirectory, enabledSessionIds = [], readSession, resolveModelProfile, tokenCounter, callModel, usagePolicy, onEvent, loadLegacy } = {}) {
  if (!Array.isArray(enabledSessionIds) || enabledSessionIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/u.test(id))) fail('CTX_INVALID_INPUT', 'Elenco delle conversazioni di prova non valido.');
  if (!enabledSessionIds.length) return null;
  if (typeof sessionDirectory !== 'string' || !isAbsolute(sessionDirectory) || typeof readSession !== 'function' || typeof resolveModelProfile !== 'function' || typeof tokenCounter?.countPreparedContext !== 'function' || typeof callModel !== 'function') fail('CTX_PORT_MISSING', 'Configurazione server del motore del contesto incompleta.');
  const enabled = new Set(enabledSessionIds);
  const directory = resolve(sessionDirectory);
  const store = createSqliteContextStore({ databasePath: join(directory, 'context', 'context.sqlite') });
  const scheduler = createContextInferenceScheduler();
  let closing;
  async function profileFor(selected) {
    const resolved = await resolveModelProfile({ provider: selected.provider, model: selected.model });
    if (!resolved || resolved.provider !== selected.provider || resolved.model !== selected.model) fail('CTX_MODEL_MISMATCH', 'Il profilo server non corrisponde al modello selezionato.');
    if (!Number.isSafeInteger(resolved.windowTokens) || !Number.isSafeInteger(resolved.responseReserve) || resolved.responseReserve < 1 || resolved.windowTokens <= resolved.responseReserve) fail('CTX_MODEL_INVALID', 'Finestra e riserva del modello non sono verificate.');
    // Never persist the resolver object: it may contain credentials or endpoints.
    return { provider: resolved.provider, model: resolved.model, windowTokens: resolved.windowTokens, responseReserve: resolved.responseReserve };
  }
  async function sessionProfile({ sessionId, session }) {
    session ??= await readSession(sessionId);
    if (!session) fail('CTX_SESSION_NOT_FOUND', 'Conversazione non trovata.');
    const selected = session.provider === 'local'
      ? { provider: 'local', model: session.modelId ?? session.modello }
      : (() => { const { fonte, modelloRemoto } = separaFonteModello(session.modello); return { provider: fonte, model: modelloRemoto }; })();
    return profileFor(selected);
  }
  const adapter = createContextModelAdapter({
    resolveModel: ({ sessionModel, settings }) => profileFor(settings?.model?.mode === 'explicit' ? settings.model : sessionModel),
    callModel: request => isLocal(request)
      ? scheduler.run({ resource: 'local-inference', priority: 'background', signal: request.signal }, signal => callModel({ ...request, signal }))
      : callModel(request),
  });
  const engine = createContextEngine({ store, model: adapter, tokenCounter, usagePolicy });
  const service = createDesktopContextService({
    engine, store, readSession, isSessionEnabled: id => enabled.has(id), resolveSessionModel: sessionProfile, onEvent,
    loadLegacy: loadLegacy ?? (async ({ sessionId }) => {
      if (!enabled.has(sessionId)) fail('CTX_NOT_ENABLED', 'Conversazione non abilitata.');
      try { return await readFile(join(directory, `${sessionId}.jsonl`), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; fail('CTX_LEGACY_READ_FAILED', 'Il registro originale non è leggibile. Nessuna nuova inferenza è stata avviata.'); }
    }),
    runInference: async ({ sessionId, priority, signal }, operation) => {
      const profile = await sessionProfile({ sessionId });
      return isLocal(profile) ? scheduler.run({ resource: 'local-inference', priority, signal }, operation) : operation(signal);
    },
  });
  try { await store.health(); }
  catch (error) { await store.close(); throw error; }
  return Object.freeze({
    service, engine, store, scheduler,
    close() {
      if (closing) return closing;
      closing = (async () => {
        try {
          await service.close();
          for (const sessionId of enabled) {
            const snapshot = await store.readContextSnapshot({ sessionId });
            for (const job of snapshot?.jobs ?? []) {
              if (!['committed', 'failed', 'cancelled'].includes(job.state)) await engine.cancelCompaction({ sessionId, jobId: job.id });
              await engine.waitForCompaction({ sessionId, jobId: job.id });
            }
          }
        } finally {
          await scheduler.close();
          await store.close();
        }
      })();
      return closing;
    },
  });
}
