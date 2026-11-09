// AVM owns canonical messages. The existing pinned SDK adapter owns wire formats.
import { senzaCampoImmagini } from './kernel/immagine-da-guardare.mjs';
import { ID_NATIVI_SDK, REGISTRO_FORNITORI } from './provider-registry.mjs';
import { creaIniettoreSezioni } from './sezioni-istruzioni.mjs';
import { healEchoedMarker } from './eco-del-marcatore.mjs';
import { ripristinaArgomentiVuotiInPlace } from './argomenti-vuoti.mjs';
import { anelloNonDisponibile, classificaErroreDelRiassunto, dimenticaModello, fornitoreDi, ricordaGiudizio, statoDallaMemoria } from './kernel/catena-del-riassunto.mjs'; // C6-bis
import { valoreConsumoDiServizio } from './kernel/consumo-di-servizio.mjs'; // spesa di servizio, parte 2 B

// BC-48 A: gli originali ricevono soltanto nuovi messaggi, prima di archivio e misura.
export function collegaSezioniAiContextHooks({ contextHooks, file, cartella, radice } = {}) {
  if (!contextHooks) return contextHooks;
  const inietta = creaIniettoreSezioni({ file, cartella, radice });
  return {
    ...contextHooks,
    async capture(input) {
      inietta(input.messages);
      return contextHooks.capture?.(input);
    },
    async prepare(input) {
      inietta(input.messages);
      return contextHooks.prepare(input);
    },
  };
}

const fail = (code, message, extra = {}) => { throw Object.assign(new Error(message), { code, ...extra }); };
const clone = value => structuredClone(value);
const identity = value => value && typeof value.provider === 'string' && value.provider && typeof value.model === 'string' && value.model;
// Historical tool arguments are re-canonicalized before replay (Hermes-style) so strict providers
// never see whitespace or ordering drift accumulated by older builds. Unparseable text is kept as-is.
const canonicalArgs = value => {
  if (typeof value !== 'string') return value;
  try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === 'object' ? JSON.stringify(parsed) : value; } catch { return value; }
};

/**
 * C6 (contratto «mai aspettare» del 27/10; forma concordata con la CLI il 28/10) — CHI scrive i riassunti, in un posto solo che desktop e
 * CLI importano. Come Hermes `auxiliary.<task>.model` (`agent/auxiliary_client.py` `_resolve_task_provider_model`: la scelta per il compito
 * prima del modello principale), con la persona davanti all'ospite:
 *   1. un lavoro già avviato tiene il SUO modello (`pinned`): un cambio di scelta vale dal lavoro dopo, non lo fa fallire;
 *   2. la scelta della persona per QUESTA conversazione (`mode:'explicit'`, `origine:'persona'`);
 *   3. la scelta globale della persona;
 *   4. la scelta dell'ospite (`mode:'explicit'` con `origine:'ospite'` o senza: la CLI ci scrive il suo modello leggero, owner 14/10);
 *   5. il modello della conversazione.
 * Torna `{ provider, model }`; una scelta che non ha questa forma non vale e si passa alla successiva.
 */
export function modelloDelRiassuntoScelto({ settings, sceltaDellaPersona = null, sessionModel, pinned = null } = {}) {
  const solo = (m) => (identity(m) ? { provider: m.provider, model: m.model } : null);
  const esplicita = settings?.model?.mode === 'explicit' ? settings.model : null;
  return solo(pinned)
    ?? (esplicita?.origine === 'persona' ? solo(esplicita) : null)
    ?? solo(sceltaDellaPersona)
    ?? solo(esplicita)
    ?? solo(sessionModel);
}

/** C6-bis: CHI ha scelto il modello dei riassunti della precedenza — 'persona', 'ospite', o null (è il modello della conversazione o fissato). */
export function origineDelRiassuntoScelto({ settings, sceltaDellaPersona = null, sessionModel, pinned = null } = {}) {
  const esplicita = settings?.model?.mode === 'explicit' ? settings.model : null;
  if (identity(pinned)) return null;
  if (esplicita?.origine === 'persona' && identity(esplicita)) return 'persona';
  if (identity(sceltaDellaPersona)) return 'persona';
  if (identity(esplicita)) return 'ospite';
  return null;
}
/* Perf-C1: due conteggi d'uso sommati campo per campo (solo i numeri; un campo che manca da una parte vale l'altra). Solo il PRIMO
   livello: i dettagli annidati (`prompt_tokens_details.cached_tokens`) restano quelli della riserva — basta per il costo, non per la cache */
function sommaUso(a, b) {
  if (!a || typeof a !== 'object') return structuredClone(b);
  const somma = structuredClone(a);
  for (const [k, v] of Object.entries(b)) if (Number.isFinite(v)) somma[k] = (Number.isFinite(somma[k]) ? somma[k] : 0) + v;
  return somma;
}
/* lo stesso id del modello sulle due strade (la memoria è una sola): OpenRouter senza via, le altre «via:modello» */
const idDelModello = (m) => (m.provider === 'openrouter' ? m.model : `${m.provider}:${m.model}`);

/*
 * C6-bis (owner 28/10/2026; contratto «mai aspettare», sezioni C6-bis; OK di CLI e Mobile 30/10) — le PORTE della riserva, tutte
 * facoltative: senza, l'adattatore fa esattamente quello di prima.
 *   memoriaRiassunto({ sessionId }) → Map | null      la memoria della CONVERSAZIONE (la stessa della strada legacy)
 *   riservaDelRiassunto({ sessionId, model }) → profilo | null   la riserva della persona già risolta (finestra compresa); null se non c'è o
 *                                                       non si può usare adesso (un modello locale diverso da quello caricato)
 *   sostitutoDelRiassunto({ sessionId, model }) → profilo | null   il modello aperto della chat, quando quello scelto le toglierebbe il posto (owner 01/11/2026)
 *   onModelloInutilizzabile({ sessionId, at, modello, motivo, scelto, ruolo })   SOLO per «inutilizzabile», una volta per modello
 *   onRiassuntoScritto({ sessionId, modello, dallaRiserva })   chi ha scritto il riassunto quando non è il modello scelto
 *   onConsumoDiServizio({ sessionId, valore })   spesa di servizio, parte 2 B (30/10/2026): UNA riga per chiamata pagata (scelto e
 *                                                       riserva), col SUO uso, `scopo: 'motore'`, `jobId` del lavoro; un guasto non
 *                                                       ferma mai il riassunto
 * ⛔ La riserva passa dalla STESSA porta `callModel` (condizione della CLI: è la sua porta di rete, con la regola dell'indirizzo Z.AI e il
 *   conto dei riassunti pagati), una volta sola, nello stesso `signal` (Mobile: nessuna attesa in più per la chat), e solo se la sua
 *   finestra è almeno quella dello scelto (il motore ha tagliato i pezzi su quella: una più piccola rifiuterebbe; si salta in silenzio).
 */
export function createContextModelAdapter({ resolveModel, callModel, usagePolicy, sceltaDellaPersona = null,
  memoriaRiassunto = null, riservaDelRiassunto = null, sostitutoDelRiassunto = null, onModelloInutilizzabile = null, onRiassuntoScritto = null, onConsumoDiServizio = null } = {}) {
  if (typeof resolveModel !== 'function' || typeof callModel !== 'function') fail('CTX_MODEL_PORT_INVALID', 'Model resolution and invocation must be injected.');
  /* chi ha scelto il modello dei riassunti, per modello: lo dice la precedenza in `resolveModel`, lo legge l'avviso in `summarize` */
  const origini = new Map();
  return {
    prepareContext({ messages, model, reset = false }) {
      return prepareProviderContext({ messages, provider: model.provider, model: model.model, reset });
    },
    /* D3 (revisione di fine fase, 01/11/2026; `tool-output-clearing.mjs`): il livello 1 accorcia il ragionamento vecchio invece di toglierlo, tranne sui motori
       locali: lo stesso elenco del reset, qui e non una copia nel motore del contesto, che non conosce i fornitori */
    accorciaIlRagionamento(modello) { return typeof modello?.provider === 'string' && !RAGIONAMENTO_VIA_SUL_RESET.has(modello.provider) && !vuoleIlRagionamentoIntero(modello.provider); },
    async resolveModel({ sessionModel, settings, pinned = null }) {
      /* ⛔ C6 (trappola trovata dalla CLI): il «selezionato» viene dalla STESSA funzione della precedenza, e chi risolve lo riceve
         (`selected`); prima si confrontava con `explicit ? settings.model : sessionModel` e la scelta della persona faceva scattare la guardia */
      let persona = null;
      try { persona = typeof sceltaDellaPersona === 'function' ? await sceltaDellaPersona() : null; } catch { persona = null; }
      const selected = modelloDelRiassuntoScelto({ settings, sceltaDellaPersona: persona, sessionModel, pinned });
      if (!identity(selected)) fail('CTX_MODEL_INVALID', 'A session or explicit model is required.');
      /* un lavoro già avviato richiama la precedenza col modello FISSATO: chi l'aveva scelto resta quello detto alla prima chiamata */
      if (!identity(pinned) || !origini.has(idDelModello(selected))) origini.set(idDelModello(selected), origineDelRiassuntoScelto({ settings, sceltaDellaPersona: persona, sessionModel, pinned }));
      const resolved = await resolveModel(clone({ sessionModel, settings, selected }));
      if (!identity(resolved) || resolved.provider !== selected.provider || resolved.model !== selected.model) fail('CTX_MODEL_MISMATCH', 'The resolver changed the selected provider or model.');
      if (!Number.isSafeInteger(resolved.windowTokens) || resolved.windowTokens <= 0 || !Number.isSafeInteger(resolved.responseReserve) || resolved.responseReserve < 0 || resolved.responseReserve >= resolved.windowTokens) fail('CTX_MODEL_INVALID', 'The model context window and response reserve are invalid.');
      return clone(resolved);
    },
    async summarize({ model, messages, maxOutputTokens, signal, operationId, focus, sessionId = null, jobId = null, attese = null }) {
      signal?.throwIfAborted();
      if (!identity(model) || !Array.isArray(messages) || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) fail('CTX_MODEL_INVALID', 'A model, messages and positive output limit are required.');
      /* ⛔ `sessionId` instrada solo le porte: non entra nella richiesta (i campi qui sotto sono elencati uno per uno) */
      const request = { provider: model.provider, model: model.model, messages: clone(messages), maxOutputTokens, signal, operationId, tools: [], maxRetries: 0, ...(focus !== undefined ? { focus } : {}) };
      if (usagePolicy?.authorize && await usagePolicy.authorize({ model: clone(model), operationId, maxOutputTokens, signal }) !== true) fail('CTX_USAGE_DENIED', 'The session usage policy declined this summary.');
      signal?.throwIfAborted();
      const response = await chiamaConLaCatena({ model, request, signal, sessionId, operationId, jobId, attese });
      // Usage must survive validation failure so the caller can account for a billed attempt.
      const usage = response?.usage === undefined ? undefined : clone(response.usage);
      if (signal?.aborted) {
        try { signal.throwIfAborted(); } catch (error) { if (usage !== undefined) error.usage = usage; throw error; }
      }
      if (typeof response?.text !== 'string' || typeof response?.finishReason !== 'string' || !response.finishReason) fail('CTX_SUMMARY_RESPONSE_INVALID', 'The summary response lacks text or an explicit finish reason.', { usage });
      return { text: response.text, finishReason: response.finishReason, usage, model: clone(model), ...(response.provenienza ? { provenienza: response.provenienza } : {}) };
    },
  };

  /* C6-bis: lo scelto, e se un errore CLASSIFICATO lo ferma (o la memoria dice che è fermo) la riserva, una volta; altrimenti l'errore di prima */
  /* Spesa di servizio, parte 2 B: la chiamata pagata con la sua riga. Il suo uso si legge PRIMA della somma C1b (`sommaUso` dopo, per il
     motore), l'esito come la parte 1. `inPrimoPiano` (regola della CLI): qualcuno aspettava il lavoro all'inizio, un'attesa è cominciata
     durante, o ce n'è una alla fine. */
  async function pagata(richiesta, { signal, sessionId, jobId, attese, riserva }) {
    const leggi = () => { try { const a = typeof attese === 'function' ? attese() : null; return { inCorso: a?.inCorso ?? 0, totale: a?.totale ?? 0 }; } catch { return { inCorso: 0, totale: 0 }; } };
    const prima = leggi(); const t0 = Date.now();
    const scrivi = (usage, esito, tentativi) => {
      if (typeof onConsumoDiServizio !== 'function') return;
      try {
        const dopo = leggi();
        const valore = valoreConsumoDiServizio({ scopo: 'motore', riserva, fonte: richiesta.provider, modelloRemoto: richiesta.model, usage, esito,
          maxTokensInviato: richiesta.maxOutputTokens, durataMs: Date.now() - t0, tentativi, // 04/11: 2 = la sintesi col pensiero spento ha preso un 400 ed è ripartita con `low` (`callContextModel`)
          inPrimoPiano: prima.inCorso > 0 || dopo.totale !== prima.totale || dopo.inCorso > 0, ...(typeof jobId === 'string' && jobId ? { jobId } : {}) });
        Promise.resolve(onConsumoDiServizio({ sessionId, valore })).catch(() => {}); // il conto è un di più: mai un riassunto fallito per lui
      } catch { /* idem */ }
    };
    try { const risposta = await callModel(richiesta); scrivi(risposta?.usage ?? null, 'completato', risposta?.tentativi); return risposta; }
    catch (e) { scrivi(e?.usage ?? null, signal?.aborted ? 'fermato' : 'interrotto'); throw e; }
  }

  async function chiamaConLaCatena({ model, request, signal, sessionId, operationId, jobId = null, attese = null }) {
    let memoria = null;
    try { memoria = typeof memoriaRiassunto === 'function' ? memoriaRiassunto({ sessionId }) ?? null : null; } catch { memoria = null; }
    const id = idDelModello(model);
    /* Owner 01/11/2026, «Scrive il modello aperto», la stessa regola della strada legacy: il modello scelto toglierebbe il posto alla chat. Mai più piccolo: la richiesta è fatta per la
       finestra dello scelto. Lo scelto non si tocca: né la sua memoria né `riusciti`. */
    let sostituto = null;
    try { sostituto = typeof sostitutoDelRiassunto === 'function' ? await sostitutoDelRiassunto({ sessionId, model: clone(model) }) : null; } catch { sostituto = null; }
    const alPosto = identity(sostituto) && Number.isSafeInteger(sostituto.windowTokens) && Number.isSafeInteger(model.windowTokens) && sostituto.windowTokens >= model.windowTokens;
    const postoOccupato = { modello: id, stato: 'bloccato', motivo: 'posto-occupato' };
    /* the last ring, after the person's backup (form, point 4; fifth review, R-12, R-13): only when the backup is not there or did not answer */
    const colSostituto = async (errorePrima) => {
      signal?.throwIfAborted();
      const tetto = Number.isSafeInteger(sostituto.responseReserve) && sostituto.responseReserve > 0 ? Math.min(request.maxOutputTokens, sostituto.responseReserve) : request.maxOutputTokens;
      const risposta = await pagata({ ...request, provider: sostituto.provider, model: sostituto.model, maxOutputTokens: tetto, operationId: `${operationId ?? request.operationId}:sostituto` }, { signal, sessionId, jobId, attese, riserva: false });
      if (errorePrima?.usage && typeof errorePrima.usage === 'object') risposta.usage = sommaUso(risposta.usage, errorePrima.usage);
      return { ...risposta, provenienza: { riassuntoDi: idDelModello(sostituto), nonDisponibile: postoOccupato } };
    };
    const noto = alPosto ? null : statoDallaMemoria(memoria, id);
    const fermo = alPosto || (noto && (noto.stato === 'inutilizzabile' || (noto.stato === 'bloccato' && Number.isFinite(noto.finoAlle)))); // the chosen one would unload the chat: never asked
    let errore = null;
    let giudizioScelto = alPosto ? postoOccupato : noto ?? null;
    if (!fermo) {
      try {
        const risposta = await pagata(request, { signal, sessionId, jobId, attese, riserva: false });
        dimenticaModello(memoria, id);
        return risposta;
      } catch (e) {
        const giudizio = classificaErroreDelRiassunto(e);
        if (!giudizio || signal?.aborted) throw e;
        giudizioScelto = giudizio;
        const { daAvvisare } = ricordaGiudizio(memoria, id, giudizio);
        const scelto = origini.get(id) ?? null;
        if (giudizio.stato === 'inutilizzabile' && daAvvisare && scelto && typeof onModelloInutilizzabile === 'function') {
          try { onModelloInutilizzabile({ sessionId, at: new Date().toISOString(), modello: id, motivo: giudizio.motivo, scelto, ruolo: 'scelto' }); } catch { /* l'avviso non ferma il riassunto */ }
        }
        errore = e;
      }
    }
    /* la riserva: risolta con la finestra, mai uguale allo scelto, mai più piccola, mai una nota come ferma */
    let riserva = null;
    try { riserva = typeof riservaDelRiassunto === 'function' ? await riservaDelRiassunto({ sessionId, model: clone(model) }) : null; } catch { riserva = null; }
    const idRiserva = identity(riserva) ? idDelModello(riserva) : null;
    const notaRiserva = idRiserva ? statoDallaMemoria(memoria, idRiserva) : null;
    const usabile = idRiserva && idRiserva !== id && Number.isSafeInteger(riserva.windowTokens) && Number.isSafeInteger(model.windowTokens)
      && riserva.windowTokens >= model.windowTokens && !(notaRiserva && (notaRiserva.stato === 'inutilizzabile' || Number.isFinite(notaRiserva.finoAlle)))
      /* CLI e Mobile (30/10): un limite del piano o dell'account vale anche per la riserva sullo stesso fornitore: la chiamata sarebbe sprecata */
      && !(giudizioScelto?.diAccount && fornitoreDi(idRiserva) === fornitoreDi(id));
    if (!usabile && alPosto) return colSostituto(errore);
    if (!usabile) throw errore ?? Object.assign(new Error('The summary model is not available right now and no usable backup is set.'), { code: 'CTX_SUMMARY_MODEL_UNAVAILABLE', stato: noto.stato, motivo: noto.motivo });
    signal?.throwIfAborted();
    /* CLI-1: il tetto d'uscita della RISERVA (dopo R-31 lo scelto può riservarne 32.000; una riserva con un limite più basso rifiuterebbe).
       Perf-C2: un operationId suo (due chiamate pagate restano due). CLI-2: la riserva è un'altra chiamata pagata: la si autorizza come lo scelto,
       e se la politica dice no si rilancia l'errore di prima, senza chiamare. */
    const tettoRiserva = Number.isSafeInteger(riserva.responseReserve) && riserva.responseReserve > 0 ? Math.min(request.maxOutputTokens, riserva.responseReserve) : request.maxOutputTokens;
    const operazioneRiserva = `${operationId ?? request.operationId}:riserva`;
    if (usagePolicy?.authorize && await usagePolicy.authorize({ model: clone(riserva), operationId: operazioneRiserva, maxOutputTokens: tettoRiserva, signal }) !== true) {
      if (alPosto) return colSostituto(errore);
      throw errore ?? Object.assign(new Error('The summary model is not available right now and the backup was not authorized.'), { code: 'CTX_SUMMARY_MODEL_UNAVAILABLE', stato: noto?.stato ?? null, motivo: noto?.motivo ?? null });
    }
    signal?.throwIfAborted();
    try {
      const risposta = await pagata({ ...request, provider: riserva.provider, model: riserva.model, maxOutputTokens: tettoRiserva, operationId: operazioneRiserva }, { signal, sessionId, jobId, attese, riserva: true });
      dimenticaModello(memoria, idRiserva);
      /* Perf-C1: i token del tentativo fallito (un flusso tagliato, un 5xx a metà) restano nel conto: si sommano a quelli della riserva */
      if (errore?.usage && typeof errore.usage === 'object') risposta.usage = sommaUso(risposta.usage, errore.usage);
      if (typeof onRiassuntoScritto === 'function') { try { onRiassuntoScritto({ sessionId, modello: idRiserva, dallaRiserva: true }); } catch { /* solo un'informazione */ } }
      /* FE-053 (forma del Mobile, 01/11/2026): chi ha scritto viaggia con la risposta e finisce in `context.version.committed`: un lavoro scartato non lascia niente */
      const nonDisponibile = anelloNonDisponibile(giudizioScelto ? { modello: id, ...giudizioScelto } : null);
      return { ...risposta, provenienza: { riassuntoDi: idRiserva, dallaRiserva: true, ...(nonDisponibile ? { nonDisponibile } : {}) } };
    } catch (e) {
      const giudizio = classificaErroreDelRiassunto(e);
      if (giudizio) {
        const { daAvvisare } = ricordaGiudizio(memoria, idRiserva, giudizio);
        if (giudizio.stato === 'inutilizzabile' && daAvvisare && typeof onModelloInutilizzabile === 'function') {
          try { onModelloInutilizzabile({ sessionId, at: new Date().toISOString(), modello: idRiserva, motivo: giudizio.motivo, scelto: 'persona', ruolo: 'riserva' }); } catch { /* idem */ }
        }
      }
      /* Performance (OK al diff finale, 30/10): falliti TUTTI E DUE, l'uso del primo tentativo viaggia con l'errore della riserva, così il
         motore conta entrambi (lo legge da `error.usage` nel suo catch) */
      if (errore?.usage && typeof errore.usage === 'object') e.usage = sommaUso(e?.usage, errore.usage);
      if (alPosto && giudizio && !signal?.aborted) return colSostituto(e);
      throw e;
    }
  }
}

const RAGIONAMENTO_VIA_SUL_RESET = new Set(['local', 'locale-ospite', 'ollama', 'lmstudio', 'llama.cpp']);
/* D3: un fornitore che il registro segna `conservaRagionamento` vuole il ragionamento intero o niente: accorciarlo è la modifica che la sua documentazione vieta */
const vuoleIlRagionamentoIntero = (provider) => {
  const scheda = Object.hasOwn(REGISTRO_FORNITORI, provider) ? REGISTRO_FORNITORI[provider] : null;
  return Boolean(scheda?.ragionamento?.conservaRagionamento ?? scheda?.richiestaCompatibile?.conservaRagionamento);
};

export function prepareProviderContext({ messages, provider, model, reset = false } = {}) {
  if (!Array.isArray(messages) || typeof provider !== 'string' || typeof model !== 'string') fail('CTX_PROVIDER_CONTEXT_INVALID', 'Messages and target provider/model are required.');
  const prepared = clone(messages);
  const pending = new Map(); const seen = new Set(); const warnings = new Set();
  if (healEchoedMarker(prepared)) warnings.add('CTX_ECHOED_MARKER_REMOVED');
  // Una chiamata salvata con argomenti vuoti (zero frammenti dallo stream) parte come l'oggetto vuoto: la copia, mai la storia.
  ripristinaArgomentiVuotiInPlace(prepared);
  for (const message of prepared) {
    if (!message || typeof message !== 'object') fail('CTX_PROVIDER_CONTEXT_INVALID', 'Invalid message.');
    for (const call of message.tool_calls ?? []) {
      if (message.role !== 'assistant' || !call?.id || !call.function?.name || seen.has(call.id)) fail('CTX_PENDING_TOOLS', 'Tool calls must have unique IDs and an assistant owner.');
      if (pending.size && !message.tool_calls.some(c => pending.has(c.id))) fail('CTX_PENDING_TOOLS', 'A tool batch must close before a new assistant call.');
      seen.add(call.id); pending.set(call.id, call);
    }
    if (message.role === 'tool') {
      if (!pending.has(message.tool_call_id)) fail('CTX_PENDING_TOOLS', 'Tool result has no pending call.');
      pending.delete(message.tool_call_id);
    } else if (pending.size && !message.tool_calls?.length) fail('CTX_PENDING_TOOLS', 'A tool batch must close before another conversational message.');
  }
  // An interrupted turn leaves its tool calls unanswered at the tail of the history. Close them
  // with synthetic results in the prepared view only, so strict pairing wires accept the replay
  // without rewriting the stored history. Structural breaks mid-history remain hard failures.
  if (pending.size) {
    for (const [id] of pending) prepared.push({ role: 'tool', tool_call_id: id, content: JSON.stringify({ status: 'error', error: 'interrupted_before_result', interrupted: true }) });
    pending.clear();
  }
  let resetApplied = reset;
  for (const message of prepared) {
    const state = message.talos_provider_state;
    const matching = state?.version === 1 && state.provider === provider && state.model === model && Array.isArray(state.content);
    const incompatible = Boolean(state) && !matching;
    // Gemini 3 SDK injects a validator-bypass sentinel for unsigned tool replay.
    // Keep original signatures, or carry a closed exchange as historical data.
    const firstNativeCall = matching ? state.content.find(p => p.type === 'tool-call') : undefined;
    const signature = firstNativeCall?.providerOptions?.google?.thoughtSignature;
    const unsignedGemini = provider === 'gemini' && message.tool_calls?.length && !(typeof signature === 'string' && signature && signature !== 'skip_thought_signature_validator');
    if (reset) {
      // Explicit reset strips the opaque state only; the exchange stays native and paired.
      // R-49 (01/11/2026): after a summary this runs on every request, and plain reasoning went from the whole tail: a provider that
      // wants it back refused with a 400 and the chat stopped. It stays, as on the path without reset, and it goes when the turn's state names
      // another model. Declared limit: a turn with no state has no model to compare, so after a model switch its reasoning stays, as without reset.
      // Local engines: as before. They never refuse with that 400, so keeping the field gains nothing there, and what the template does with it
      // depends on the model.
      resetApplied = true;
      delete message.talos_provider_state;
      if (incompatible || RAGIONAMENTO_VIA_SUL_RESET.has(provider)) delete message.reasoning_content;
      if (state) warnings.add('CTX_NATIVE_STATE_RESET');
    } else if (incompatible) {
      // The recorded state no longer matches the target (model switch, restart, version bump).
      // Re-anchor the native exchange instead of degrading tool calls to historical text: a
      // same-provider state keeps its recorded native content re-anchored to the target model,
      // anything else drops the opaque state while keeping the portable tool pairing. Historical
      // arguments are re-canonicalized so every provider receives a stable, idempotent payload.
      resetApplied = true;
      if (Array.isArray(state.content) && state.provider === provider) message.talos_provider_state = { ...state, version: 1, provider, model };
      else delete message.talos_provider_state;
      delete message.reasoning_content;
      if (state) warnings.add('CTX_NATIVE_MODEL_CHANGED');
      for (const call of message.tool_calls ?? []) call.function.arguments = canonicalArgs(call.function.arguments);
    } else if (unsignedGemini) {
      // Keep the exchange native: never fabricate or strip signatures here, replay unsigned calls
      // as recorded. The previous data conversion hid the gap and poisoned every later turn.
      warnings.add('CTX_GEMINI_SIGNATURE_MISSING');
    }
  }
  // No historical-data conversion happens here anymore: tool exchanges stay native and paired,
  // interrupted tails carry synthetic closing results, and incompatible states are re-anchored
  // above. The prepared context is a pure, idempotent function of its input.
  return { messages: prepared, resetApplied, warnings: [...warnings] };
}

/** Compile through the same public SDK API as inference, stopping before I/O. */
export async function buildPreparedProviderRequest({ messages: storia, tools = [], model, signal, requestOptions = {} } = {}) {
  signal?.throwIfAborted();
  /* view_image (owner 27/10/2026): il campo interno delle immagini non parte mai, nemmeno dalla compattazione nativa o da un conteggio */
  const messages = senzaCampoImmagini(storia);
  if (!identity(model) || !Array.isArray(tools)) fail('CTX_PROVIDER_CONTEXT_INVALID', 'A target model and tool list are required.');
  const allowed = ['reasoning_effort', 'reasoning', 'tool_choice', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p', 'stop'];
  if (!requestOptions || typeof requestOptions !== 'object' || Array.isArray(requestOptions) || Object.keys(requestOptions).some(key => !allowed.includes(key))) fail('CTX_PROVIDER_CONTEXT_INVALID', 'Only supported nonsecret request options may be compiled.');
  for (const key of ['max_tokens', 'max_completion_tokens']) {
    if (requestOptions[key] !== undefined && (!Number.isSafeInteger(requestOptions[key]) || requestOptions[key] < 1 || (Number.isSafeInteger(model.responseReserve) && requestOptions[key] > model.responseReserve))) fail('CTX_PROVIDER_CONTEXT_INVALID', 'The output token limit must fit the reserved model budget.');
  }
  const prepared = prepareProviderContext({ messages, provider: model.provider, model: model.model });
  if (!ID_NATIVI_SDK.includes(model.provider)) {
    return { body: { model: model.model, messages: prepared.messages.map(({ talos_provider_state, ...message }) => message), ...(tools.length ? { tools: clone(tools) } : {}), ...clone(requestOptions) }, headers: {} };
  }
  const { nativeProviderResponse } = await import('./native-provider-adapter.mjs');
  const sentinel = new Error('Context request compiled locally.');
  let captured;
  try {
    await nativeProviderResponse({
      provider: model.provider, model: model.model, apiKey: 'context-local-serialization-only',
      body: { messages: prepared.messages, tools: clone(tools), ...clone(requestOptions), stream: false }, signal,
      fetchFn: async (_url, init) => {
        signal?.throwIfAborted();
        const headers = new Headers(init.headers);
        captured = { body: JSON.parse(init.body), headers: Object.fromEntries(['anthropic-version', 'anthropic-beta'].filter(name => headers.has(name)).map(name => [name, headers.get(name)])) };
        throw sentinel;
      },
    });
  } catch {
    signal?.throwIfAborted();
    if (!captured) fail('CTX_PROVIDER_SERIALIZATION', 'The pinned SDK could not serialize this context.');
  }
  if (!captured) fail('CTX_PROVIDER_SERIALIZATION', 'The pinned SDK did not produce a request.');
  return captured;
}
