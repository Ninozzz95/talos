import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextModelAdapter } from './context-provider-adapter.mjs';
import { createContextInferenceScheduler } from './context-inference-scheduler.mjs';
import { createDesktopContextService } from './context-desktop-service.mjs';
import { conAncoraDelFornitore } from './context-token-counters.mjs';
import { separaFonteModello } from './model-destination.mjs';
import { storiaPerIlMotore } from './session-registry.mjs'; // C1: le regole del giornale stanno nel registro
import { RIGA_RECUPERO, indiceMeccanico, leggiTettoEsplicito, TETTO_TOKEN_DEFAULT, FRAZIONE_FINESTRA } from './kernel/compattazione-desktop.mjs';
/*
 * C1, review del bugfixer su 59cdfdcba (Y1): le BUSTE che TALOS scrive nella conversazione come messaggi `user` — il risultato di
 * un sotto-agente (`confine-dati.mjs::testoDelRisultatoFiglio`), l'esito di un Workflow (`testoDellEsitoWorkflow`), la domanda
 * di un altro agente (`session-registry.mjs::dialogueMessage`) — non sono richieste della persona: il loro testo è marcato non
 * fidato, e nel registro del motore («Requests of the person … verbatim») ne prenderebbe l'autorità. La forma comune è una riga
 * di TALOS e il JSON sulla seconda, col suo `schema`: si riconosce da lì, non da una parola nel testo.
 */
const SCHEMI_DELLE_BUSTE = new Set(['talos.subagent-result.v1', 'talos.workflow-outcome.v1', 'talos.agent-dialogue.v1']);
const testoDi = (contenuto) => typeof contenuto === 'string' ? contenuto : Array.isArray(contenuto) ? contenuto.filter((p) => typeof p?.text === 'string').map((p) => p.text).join('\n') : '';
export function eRichiestaDellaPersonaPerIlRegistro(messaggio) {
  if (messaggio?.role !== 'user') return false;
  const seconda = testoDi(messaggio.content).split('\n')[1];
  if (!seconda?.startsWith('{')) return true;
  try { return !SCHEMI_DELLE_BUSTE.has(JSON.parse(seconda)?.schema); } catch { return true; }
}

// C1 livello 1: l'uscita vecchia tolta dice come riaverla (conversation_search sulla conversazione corrente, `conversazioni-per-il-modello.mjs`)
export const PUNTATORE_USCITA_TOLTA = 'To read it again, call conversation_search with this_conversation=true and words from the call.';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const isLocal = profile => ['local', 'ollama', 'llama.cpp'].includes(profile.provider);

export async function resolveDesktopContextProfile({ profiles, provider, model, readLocalRuntime }) {
  const profile = profiles?.find(item => item.provider === provider && item.model === model);
  if (!profile) fail('CTX_MODEL_NOT_CONFIGURED', 'The model does not have a fixed profile for this trial.');
  if (provider === 'local') {
    const runtime = await readLocalRuntime?.();
    if (runtime?.state !== 'ready' || runtime.modelId !== model || !Number.isSafeInteger(runtime.windowTokens) || runtime.windowTokens !== profile.windowTokens) fail('CTX_RUNTIME_PROFILE_MISMATCH', 'The loaded local model or the actual window does not match the trial profile.');
  }
  return { provider: profile.provider, model: profile.model, windowTokens: profile.windowTokens, responseReserve: profile.responseReserve };
}

/*
 * C1 (owner 09/10/2026 sera, «Motore col metodo» di serie) — il profilo di un modello QUALUNQUE, non più l'elenco fisso della
 * prova. La finestra viene dalla stessa fonte del legacy (il catalogo della rotta, `finestraDallaRoute` in server.mjs) e non
 * supera tetto/0,75: il legacy compatta a min(tetto, 0,75 × finestra) (decisione F2 del 24/09: tetto assoluto 200K, configurabile
 * con TALOS_COMPACTION_TOKEN_CAP, più 0,75 della finestra) e il motore, che compatta a 0,75 del suo limite, così scatta vicino
 * allo stesso punto anche su un modello da 1M. Finestra ignota ⇒ la stessa, prudenziale. Il motore locale vale solo se è
 * pronto con QUEL modello e dice la sua finestra vera.
 */
export async function resolveDesktopDefaultProfile({ provider, model, finestraFn, readLocalRuntime, env = process.env }) {
  const tetto = leggiTettoEsplicito(env) ?? TETTO_TOKEN_DEFAULT;
  const massima = Math.ceil(tetto / FRAZIONE_FINESTRA);
  let finestra;
  if (provider === 'local') {
    const runtime = await readLocalRuntime?.();
    if (runtime?.state !== 'ready' || runtime.modelId !== model || !Number.isSafeInteger(runtime.windowTokens) || runtime.windowTokens <= 0) fail('CTX_RUNTIME_PROFILE_MISMATCH', 'The local model is not ready with this model and a known window.');
    finestra = runtime.windowTokens;
  } else {
    let dalCatalogo = null;
    try { dalCatalogo = finestraFn?.(model) ?? null; } catch { dalCatalogo = null; }
    finestra = Number.isSafeInteger(dalCatalogo) && dalCatalogo > 0 ? Math.min(dalCatalogo, massima) : massima;
  }
  return { provider, model, windowTokens: finestra, responseReserve: Math.min(16_384, Math.floor(finestra / 8)) };
}

/** Desktop composition root. Model metadata, credentials, counter transport and
 * common usage policy are backend ports; no model payload chooses a DB path. */
/*
 * 24/09/2026 — F4: ABILITAZIONE PER POLITICA. `politicaAbilitazione({ sessionId, createdAt, modello, session })
 * → boolean | Promise<boolean>` è iniettabile; si valuta alla PRIMA richiesta della sessione e si ricorda per la
 * vita del processo (sì e no). Senza politica resta l'elenco fisso di oggi, e senza elenco il motore resta
 * spento: nessun cambio di comportamento sul 4174 (`config.mjs:501` continua a vietare il trial là; chi lo
 * accende è un'altra fase). ⛔ `createdAt` oggi è `null`: `leggiSessioneContesto` (`session-registry.mjs:4652`)
 * non lo espone — la riga è di F3, qui si passa ciò che il registro dà.
 */
export async function createDesktopContextRuntime({ sessionDirectory, enabledSessionIds = [], politicaAbilitazione, readSession, resolveModelProfile, tokenCounter, callModel, usagePolicy, onEvent, onPrepared, loadLegacy } = {}) {
  if (!Array.isArray(enabledSessionIds) || enabledSessionIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/u.test(id))) fail('CTX_INVALID_INPUT', 'Invalid list of trial conversations.');
  if (politicaAbilitazione !== undefined && typeof politicaAbilitazione !== 'function') fail('CTX_INVALID_INPUT', 'The enablement policy must be a function.');
  if (!enabledSessionIds.length && !politicaAbilitazione) return null;
  if (typeof sessionDirectory !== 'string' || !isAbsolute(sessionDirectory) || typeof readSession !== 'function' || typeof resolveModelProfile !== 'function' || typeof tokenCounter?.countPreparedContext !== 'function' || typeof callModel !== 'function') fail('CTX_PORT_MISSING', 'Incomplete context engine server configuration.');
  const enabled = new Set(enabledSessionIds);
  const decisioni = new Map();
  async function isEnabled(sessionId) {
    if (enabled.has(sessionId)) return true;
    if (!politicaAbilitazione) return false;
    if (decisioni.has(sessionId)) return decisioni.get(sessionId);
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/u.test(sessionId)) return false;
    const session = await readSession(sessionId);
    if (!session) return false; // una sessione che il registro non conosce non si giudica (e non si ricorda)
    const esito = (await politicaAbilitazione({ sessionId, createdAt: session.createdAt ?? null, modello: session.modello ?? null, session })) === true;
    decisioni.set(sessionId, esito);
    return esito;
  }
  const abilitate = () => new Set([...enabled, ...[...decisioni].filter(([, esito]) => esito).map(([sessionId]) => sessionId)]);
  /* 24/09 — F4, punto 5: l'ultimo `prompt_tokens` del fornitore ancora la misura successiva (vedi `conAncoraDelFornitore`). */
  const contatore = conAncoraDelFornitore(tokenCounter);
  const directory = resolve(sessionDirectory);
  const store = createSqliteContextStore({ databasePath: join(directory, 'context', 'context.sqlite') });
  const scheduler = createContextInferenceScheduler();
  let closing;
  async function profileFor(selected) {
    const resolved = await resolveModelProfile({ provider: selected.provider, model: selected.model });
    if (!resolved || resolved.provider !== selected.provider || resolved.model !== selected.model) fail('CTX_MODEL_MISMATCH', 'The server profile does not match the selected model.');
    if (!Number.isSafeInteger(resolved.windowTokens) || !Number.isSafeInteger(resolved.responseReserve) || resolved.responseReserve < 1 || resolved.windowTokens <= resolved.responseReserve) fail('CTX_MODEL_INVALID', 'Model window and reserve are not verified.');
    // Never persist the resolver object: it may contain credentials or endpoints.
    return { provider: resolved.provider, model: resolved.model, windowTokens: resolved.windowTokens, responseReserve: resolved.responseReserve };
  }
  async function sessionProfile({ sessionId, session }) {
    session ??= await readSession(sessionId);
    if (!session) fail('CTX_SESSION_NOT_FOUND', 'Conversation not found.');
    const selected = session.provider === 'local'
      ? { provider: 'local', model: session.modelId ?? session.modello }
      : (() => { const { fonte, modelloRemoto } = separaFonteModello(session.modello); return { provider: fonte, model: modelloRemoto }; })();
    const profile = await profileFor(selected);
    return { ...profile, requestOptions: session.reasoning == null ? {} : { reasoning: structuredClone(session.reasoning) } };
  }
  const adapter = createContextModelAdapter({
    resolveModel: ({ sessionModel, settings }) => profileFor(settings?.model?.mode === 'explicit' ? settings.model : sessionModel),
    callModel: request => isLocal(request)
      ? scheduler.run({ resource: 'local-inference', priority: 'background', signal: request.signal }, signal => callModel({ ...request, signal }))
      : callModel(request),
  });
  // C1: il riassunto del motore porta lo stesso puntatore di recupero del legacy (conversation_search, this_conversation)
  // C1: e l'indice meccanico del legacy sulla parte riassunta (gli «aghi» che il riassunto del motore perdeva nel banco A/B)
  const engine = createContextEngine({ store, model: adapter, tokenCounter: contatore, usagePolicy, recoveryHint: RIGA_RECUPERO, anchorIndex: (messaggi) => indiceMeccanico(messaggi)?.testo ?? null, clearedToolPointer: PUNTATORE_USCITA_TOLTA, isPersonRequest: eRichiestaDellaPersonaPerIlRegistro });
  const service = createDesktopContextService({
    engine, store, readSession, isSessionEnabled: isEnabled, resolveSessionModel: sessionProfile, onEvent, onPrepared, registraAncora: contatore.registraAncora,
    // C1 (09/10/2026): il giornale si legge con le regole del registro (checkpoint + delta, buchi, riavvolgimenti), mai con una copia
    selectLegacyCheckpoint: storiaPerIlMotore,
    loadLegacy: loadLegacy ?? (async ({ sessionId }) => {
      if (!await isEnabled(sessionId)) fail('CTX_NOT_ENABLED', 'Conversation not enabled.');
      try { return await readFile(join(directory, `${sessionId}.jsonl`), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; fail('CTX_LEGACY_READ_FAILED', 'The original log is not readable. No new inference was started.'); }
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
          for (const sessionId of abilitate()) {
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
