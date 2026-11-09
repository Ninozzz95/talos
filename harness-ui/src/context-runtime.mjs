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
import { RIGA_RECUPERO, indiceMeccanico, leggiTettoEsplicito, TETTO_TOKEN_DEFAULT, FRAZIONE_FINESTRA, eNotaDiTalos } from './kernel/compattazione-desktop.mjs';
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
  /* 13/10/2026 (review di 28c973bdc): nemmeno una nota del kernel (copie scartate, risposta tagliata) è una richiesta della persona */
  if (eNotaDiTalos(messaggio)) return false;
  const seconda = testoDi(messaggio.content).split('\n')[1];
  if (!seconda?.startsWith('{')) return true;
  try { return !SCHEMI_DELLE_BUSTE.has(JSON.parse(seconda)?.schema); } catch { return true; }
}

// C1 livello 1: l'uscita vecchia tolta dice come riaverla (conversation_search sulla conversazione corrente, `conversazioni-per-il-modello.mjs`)
export const PUNTATORE_USCITA_TOLTA = 'To read it again, call conversation_search with this_conversation=true and words from the call.';

const fail = (code, message, details) => { throw Object.assign(new Error(message), { code }, details ? { details } : {}); };
/*
 * D9 del Tester (blocco 25, 02/11/2026; forma del 04/11, OK di Desktop, CLI, Mobile e Performance): col modello locale ancora in apertura
 * il profilo alzava lo stesso guasto di un modello diverso o di una finestra sbagliata, e la chat diceva «ripiego» su una chat di tre
 * messaggi. Stesso codice (nessun codice nuovo), più `details.nonPronto` SOLO quando il motore non è pronto o non si legge: chi riceve può
 * saltare la prima richiesta come lo «skipped» di Hermes (`agent/compaction_events.py:67`). Pronto col modello o la finestra sbagliati resta
 * un guasto vero, senza il segno.
 */
const NON_PRONTO = Object.freeze({ nonPronto: true });
const nonPronto = (runtime) => runtime?.state !== 'ready' ? NON_PRONTO : undefined;
const isLocal = profile => ['local', 'ollama', 'llama.cpp'].includes(profile.provider);

export async function resolveDesktopContextProfile({ profiles, provider, model, readLocalRuntime }) {
  const profile = profiles?.find(item => item.provider === provider && item.model === model);
  if (!profile) fail('CTX_MODEL_NOT_CONFIGURED', 'The model does not have a fixed profile for this trial.');
  if (provider === 'local') {
    const runtime = await readLocalRuntime?.();
    if (runtime?.state !== 'ready' || runtime.modelId !== model || !Number.isSafeInteger(runtime.windowTokens) || runtime.windowTokens !== profile.windowTokens) fail('CTX_RUNTIME_PROFILE_MISMATCH', 'The loaded local model or the actual window does not match the trial profile.', nonPronto(runtime));
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
/** La finestra prudente per un modello del motore dell'app di cui non si conosce l'apertura (come il motore locale del PC, L1-d). */
export const FINESTRA_PRUDENTE_MOTORE_DELL_APP = 16_384;

export async function resolveDesktopDefaultProfile({ provider, model, finestraFn, readLocalRuntime, env = process.env }) {
  const tetto = leggiTettoEsplicito(env) ?? TETTO_TOKEN_DEFAULT;
  const massima = Math.ceil(tetto / FRAZIONE_FINESTRA);
  let finestra;
  if (provider === 'local') {
    const runtime = await readLocalRuntime?.();
    if (runtime?.state !== 'ready' || runtime.modelId !== model || !Number.isSafeInteger(runtime.windowTokens) || runtime.windowTokens <= 0) fail('CTX_RUNTIME_PROFILE_MISMATCH', 'The local model is not ready with this model and a known window.', nonPronto(runtime));
    finestra = runtime.windowTokens;
  } else {
    /* ⛔ 21/10/2026, dal vivo sul Pad (sessione lunga del Mobile, LFM2.5 sul motore dell'app): il motore del contesto chiedeva la
       finestra con l'id NUDO del modello, e `finestraDallaRoute` riconosce il motore dell'app solo dal prefisso `locale-ospite:`
       (`finestraDelModelloOspite`, `accesso-locale-ospite.mjs:131-133`) ⇒ nessuna finestra ⇒ la massima da cloud, 266.667 token, con la
       soglia a 177.711: in un giro da 32k su un motore da ~32k la compattazione non scattava mai, mentre la politica del registro
       (che passa l'id col fornitore) diceva 28.160. Ora l'id parte col suo fornitore, come nel registro; OpenRouter resta com'era. */
    const id = provider && provider !== 'openrouter' && !String(model).startsWith(`${provider}:`) ? `${provider}:${model}` : model;
    let dalCatalogo = null;
    try { dalCatalogo = finestraFn?.(id) ?? null; } catch { dalCatalogo = null; }
    /* e il motore dell'app senza una finestra nota non è un modello da cloud: la prudente del motore locale (L1-d, 16.384), mai 266.667 */
    if (!(Number.isSafeInteger(dalCatalogo) && dalCatalogo > 0) && provider === 'locale-ospite') dalCatalogo = FINESTRA_PRUDENTE_MOTORE_DELL_APP;
    finestra = Number.isSafeInteger(dalCatalogo) && dalCatalogo > 0 ? Math.min(dalCatalogo, massima) : massima;
  }
  /* 21/10/2026: un motore a posto unico (motore dell'app, motore del PC con `-np 1`) non riceve riassunti in sottofondo durante il giro */
  /* CONTRATTO-R30-R31 (owner 30/10/2026): 32.000 come Claude Code (era 16.384, che GLM col ragionamento alto si mangiava tutto); sotto una
     finestra di 131.072 non cambia niente (un ottavo della finestra), e il nucleo non supera il limite d'uscita del modello */
  return { provider, model, windowTokens: finestra, responseReserve: Math.min(32_000, Math.floor(finestra / 8)),
    ...(provider === 'local' || provider === 'locale-ospite' ? { singleSlot: true } : {}) };
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
export async function createDesktopContextRuntime({ sessionDirectory, enabledSessionIds = [], politicaAbilitazione, readSession, resolveModelProfile, tokenCounter, callModel, usagePolicy, onEvent, onPrepared, loadLegacy, modelloDelRiassuntoFn = null,
  /* C6-bis (owner 28/10, OK di CLI e Mobile 30/10): la riserva della persona (`{provider, model}` | 'conversazione' | null), la memoria della
     CONVERSAZIONE (la stessa della strada legacy, dal registro) e l'avviso durevole. Assenti ⇒ il motore riassume come prima. */
  riservaDelRiassuntoFn = null, memoriaRiassuntoFn = null, localiInsiemeFn = null, onModelloInutilizzabile = null,
  /* spesa di servizio, parte 2 B (30/10/2026): la riga di ogni chiamata pagata del motore, `({ sessionId, valore })`; assente ⇒ niente */
  onConsumoDiServizio = null } = {}) {
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
    /* 21/10/2026: `singleSlot` arriva fino al motore del contesto, o la cura del posto unico si perderebbe qui (profilo ricostruito) */
    return { provider: resolved.provider, model: resolved.model, windowTokens: resolved.windowTokens, responseReserve: resolved.responseReserve,
      ...(resolved.singleSlot === true ? { singleSlot: true } : {}) };
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
  /* C6 (28/10/2026): la scelta globale della persona (Impostazioni → Memoria e contesto, `impostazioni-contesto.mjs`) è un id del selettore
     dei modelli ⇒ `{ provider, model }` come la conversazione (`sessionProfile`). Una scelta che non si legge non vale: decide la precedenza. */
  const sceltaDellaPersona = () => {
    const id = typeof modelloDelRiassuntoFn === 'function' ? modelloDelRiassuntoFn() : null;
    if (typeof id !== 'string' || !id) return null;
    try { const { fonte, modelloRemoto } = separaFonteModello(id); return { provider: fonte, model: modelloRemoto }; } catch { return null; }
  };
  /* C6-bis: la riserva come profilo VERO (finestra compresa). Un modello locale diverso da quello della conversazione non si usa: col posto
     unico vorrebbe dire scaricare il modello della chat (Mobile 30/10, vale anche sul PC). Una riserva che non si legge non vale. */
  const riservaDelRiassunto = async ({ sessionId }) => {
    const scelta = typeof riservaDelRiassuntoFn === 'function' ? riservaDelRiassuntoFn() : null;
    if (!scelta) return null;
    const conversazione = await sessionProfile({ sessionId });
    const selected = scelta === 'conversazione' ? { provider: conversazione.provider, model: conversazione.model }
      : typeof scelta === 'object' && typeof scelta.model === 'string' && scelta.model.trim() ? { provider: scelta.provider || 'openrouter', model: scelta.model.trim() } : null;
    if (!selected) return null;
    /* Perf-Q1 (30/10): solo se la chat è su un modello locale — con la chat remota un locale non toglie il posto a nessuno */
    const fonteLocale = (fonte) => fonte === 'local' || fonte === 'locale-ospite'; // anche il motore del telefono ha un posto solo (Mobile, FE-053)
    if (fonteLocale(selected.provider) && fonteLocale(conversazione.provider) && conversazione.model !== selected.model) return null;
    try { return await profileFor(selected); } catch { return null; }
  };
  /* Owner 01/11/2026, «Scrive il modello aperto»: solo il motore di questo PC, solo se il modello scelto toglierebbe il posto alla chat. Col router che regge i due vale la scelta. */
  const sostitutoDelRiassunto = async ({ sessionId, model }) => {
    if (localiInsiemeFn?.() === true || model?.provider !== 'local') return null;
    const conversazione = await sessionProfile({ sessionId });
    if (conversazione.provider !== 'local' || conversazione.model === model.model) return null;
    return conversazione;
  };
  const adapter = createContextModelAdapter({
    sceltaDellaPersona,
    sostitutoDelRiassunto,
    ...(typeof riservaDelRiassuntoFn === 'function' ? { riservaDelRiassunto } : {}),
    ...(typeof memoriaRiassuntoFn === 'function' ? { memoriaRiassunto: ({ sessionId }) => (sessionId ? memoriaRiassuntoFn(sessionId) : null) } : {}),
    ...(typeof onModelloInutilizzabile === 'function' ? { onModelloInutilizzabile } : {}),
    ...(typeof onConsumoDiServizio === 'function' ? { onConsumoDiServizio } : {}),
    // il modello l'ha già scelto l'adattatore (`modelloDelRiassuntoScelto`): qui si risolve quello, mai una seconda volta la precedenza
    resolveModel: ({ sessionModel, settings, selected }) => profileFor(selected ?? (settings?.model?.mode === 'explicit' ? settings.model : sessionModel)),
    callModel: request => isLocal(request)
      ? scheduler.run({ resource: 'local-inference', priority: 'background', signal: request.signal }, signal => callModel({ ...request, signal }))
      : callModel(request),
  });
  // C1: il riassunto del motore porta lo stesso puntatore di recupero del legacy (conversation_search, this_conversation)
  // C1: e l'indice meccanico del legacy sulla parte riassunta (gli «aghi» che il riassunto del motore perdeva nel banco A/B)
  const engine = createContextEngine({ store, model: adapter, tokenCounter: contatore, usagePolicy, ...(process.env.TALOS_PIANO_SENZA_COLLEGAMENTO === '1' ? { pesoDelBloccoFirmato: 1 } : {}), recoveryHint: RIGA_RECUPERO, anchorIndex: (messaggi) => indiceMeccanico(messaggi)?.testo ?? null, clearedToolPointer: PUNTATORE_USCITA_TOLTA, isPersonRequest: eRichiestaDellaPersonaPerIlRegistro });
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
