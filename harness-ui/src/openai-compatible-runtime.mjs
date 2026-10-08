import { ID_MOTORI_LOCALI_OPENAI, REGISTRO_FORNITORI } from './provider-registry.mjs';
import { createStreamPartitioner } from './stream-partition.mjs';

/*
 * ⛔ 12/09 — P-A: l'ottavo dei tredici elenchi. Era l'UNICO posto del repo che conoscesse
 *   `lmstudio`, e proprio per questo LM Studio era scoperto, sondato, caricabile e scaricabile —
 *   e non sceglibile in chat. Adesso i due motori locali su wire OpenAI li nomina il registro.
 */
const PROVIDERS = Object.freeze(Object.fromEntries(ID_MOTORI_LOCALI_OPENAI
  .map((id) => [id, Object.freeze({ baseUrl: REGISTRO_FORNITORI[id].baseUrl, listPath: REGISTRO_FORNITORI[id].catalogo.percorso })])));

export class OpenAiCompatibleRuntimeError extends Error {
  constructor(message, code = 'RUNTIME_FAILED') {
    super(message);
    this.name = 'OpenAiCompatibleRuntimeError';
    this.code = code;
  }
}

function aggiungiAvviso(avvisi, frasiAvvisi, frase) {
  avvisi.push(frase.testo);
  frasiAvvisi.push(frase);
}

function fail(message, code = 'RUNTIME_INVALID') {
  throw new OpenAiCompatibleRuntimeError(message, code);
}

/**
 * P-D, 12/09/2026: adatta il corpo HTTP secondo il profilo del registro.
 * `extra_body` appartiene agli SDK Python: sul wire i campi sono al primo livello.
 * Gli avvisi sono dati locali da rendere al chiamante, mai campi inviati al modello.
 * Il chiamante di produzione richiede l'aggancio in runtime-owner-adapter.mjs:
 * diff non applicato nel rapporto P-D, perché fuori dal perimetro assegnato.
 */
/*
 * ⛔ 04/10/2026, BUG-7 (owner) — il concorrente si legge nel suo codice (regola 20/09):
 *   · pi-mono `packages/ai/src/models.ts:1222-1240` (`clampThinkingLevel`): se il livello chiesto
 *     non è fra quelli che il modello dichiara, si invia il più vicino — PRIMA verso l'alto,
 *     poi verso il basso — e mai un livello non supportato;
 *   · hermes `agent/auxiliary_reasoning_floor.py:1-18`: «The recovery is a *step up*, not a strip…
 *     Dropping the field would also succeed once, but it says nothing about the next call».
 *   TALOS prima cancellava il campo e avvisava a OGNI giro (openai-compatible-runtime.mjs:60-67),
 *   e l'avviso finiva in una bolla assistente nuova a ogni richiesta (agent-service.mjs:2128):
 *   la frase «Z.AI: livello di ragionamento richiesto non previsto dal profilo P-D…» a schermo
 *   a ogni giro dell'owner su glm-5.3-flash con effort «xhigh» (transcript 3eb5e436, giro 25).
 * La scala è quella interna dell'interfaccia (`app.js:7255-7271`: «xhigh» è l'etichetta «max»);
 * un valore del fornitore fuori dalla scala ma presente in `livelli` (es. «max» di z.ai) passa
 * per identità, come il `thinkingLevelMap?.[effort] ?? effort` di pi (openai-completions.ts:882).
 */
/*
 * ⛔ 05/10/2026, BUG-18 (owner) — «non voglio più vedere queste frasi» + «dinamica per tutti
 *   i provider, non ingozzabile» + priorità riferimenti Claude → Hermes → pi/codex (memoria
 *   75cd6a41, che sostituisce il pi-mono-primo del BUG-7):
 *   · la normalizzazione del RAGIONAMENTO smette di essere narrazione in chat: i suoi messaggi
 *     escono in `note` (dati locali come gli avvisi, ma telemetria: il chiamante li consegna al
 *     journal della sessione, mai in bolla) — la temperatura resta un avviso, decisione diversa;
 *   · il clamp diventa «prima il più debole, altrimenti il minimo supportato» (hermes
 *     agent/reasoning_effort.py:120-160), allineato a runtime-owner-adapter.mjs e alla regola
 *     owner 24/09 «mai un costo più alto di quello scelto»;
 *   · alias canonico xhigh≡max: l'etichetta «max» della UI È «xhigh» (app.js:7340, 7390-7391).
 *     ⛔ 08/10/2026: la UI ha un «Max» vero; l'alias resta per le scelte salvate prima (vedi sotto).
 * Il meccanismo resta UNO per ogni provider: le differenze stanno nei DATI del registro
 * (ragionamento.livelli / livelliRagionamento, con fonte+data e gate di validazione), mai in
 * rami per fornitore.
 */
const SCALA_LIVELLI_RAGIONAMENTO = Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/* ⛔ BUG-18: alias canonico xhigh≡max — stesso livello con due grafie (la UI chiama «max»
   ciò che vale «xhigh», app.js:7340/7390): restituisce la grafia documentata del modello,
   o null. Funzione UNICA anche per runtime-owner-adapter.mjs: le due scale gemelle non
   devono più portarsi dietro due alias (D5, malattia «tredici copie»).
   ⛔⛔ 08/10/2026 — L'ALIAS RESTA NEI DUE VERSI, deciso dall'owner. Dall'08/10 la pillola ha un «Max» vero (manda `max`)
   e chiama `xhigh` «Molto alto», e mostra solo i livelli che il modello dichiara: una scelta NUOVA non arriva mai qui
   come `xhigh` su un modello che ha solo `max`. Ci arrivano le sessioni e le preferenze salvate PRIMA, quando «Massimo»
   mandava `xhigh` (BUG-18 del 05/10: su glm-5.3-flash finivano in silenzio a «high»). Owner 08/10: «Restano a Max». */
export function aliasGrafiaRagionamento(richiesto, livelli) {
  const alias = richiesto === 'xhigh' ? 'max' : richiesto === 'max' ? 'xhigh' : null;
  return alias != null && Array.isArray(livelli) && livelli.includes(alias) ? alias : null;
}

/* ⛔ BUG-18 gen.2 (revisore D3/M3): il minimo documentato di una lista — il floor di cura
   per i modelli obbligati al ragionamento (hermes auxiliary_reasoning_floor.py:
   «REASONING_FLOOR_EFFORT = "low"»; «The recovery is a *step up*, not a strip»).
   Valori fuori scala: ignorati, nessuna invenzione. */
export function livelloRagionamentoMinimo(livelli) {
  let minimo = null;
  if (!Array.isArray(livelli)) return null;
  for (const livello of livelli) {
    const posizione = SCALA_LIVELLI_RAGIONAMENTO.indexOf(livello);
    if (posizione === -1) continue;
    if (minimo === null || posizione < SCALA_LIVELLI_RAGIONAMENTO.indexOf(minimo)) minimo = livello;
  }
  return minimo;
}

export function livelloRagionamentoPiuVicino(richiesto, livelli) {
  if (!Array.isArray(livelli) || livelli.length === 0) return null;
  if (livelli.includes(richiesto)) return richiesto;
  const alias = aliasGrafiaRagionamento(richiesto, livelli);
  if (alias) return alias;
  const indice = SCALA_LIVELLI_RAGIONAMENTO.indexOf(richiesto);
  if (indice === -1) return null;
  /* ⛔ BUG-18: prima il più debole (hermes reasoning_effort.py, clamp_effort: «the **nearest
     weaker** supported level is returned so a clamp never escalates cost»; regola owner
     24/09 «mai un costo più alto di quello scelto»), poi il minimo supportato
     (auxiliary_reasoning_floor: step up solo se il modello obbligato non fa di meglio).
     Vale per OGNI provider: il comportamento è uno, i dati cambiano. */
  for (let i = indice - 1; i >= 0; i--) {
    if (livelli.includes(SCALA_LIVELLI_RAGIONAMENTO[i])) return SCALA_LIVELLI_RAGIONAMENTO[i];
  }
  return livelloRagionamentoMinimo(livelli);
}

export function preparaRichiestaCompatibile(provider, corpo) {
  const record = REGISTRO_FORNITORI[provider];
  // P-K — il corpo HTTP usa reasoning_effort, non l'involucro del router.
  if (record?.cloud) return preparaRichiestaCloud(record, corpo);
  // P-K — fine
  if (record?.richiestaCompatibile) return preparaProfiloCompatibile(record, corpo);
  if (record?.ragionamento?.formato !== 'thinking') return { corpo, avvisi: [], note: [] };
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!oggetto(corpo) || typeof corpo.model !== 'string') fail(`${record.etichetta} request is not valid.`);
  if (corpo.extra_body !== undefined && !oggetto(corpo.extra_body)) fail(`${record.etichetta} options are not valid.`);
  const unito = { ...corpo, ...(corpo.extra_body ?? {}) };
  const { extra_body, reasoning, reasoning_effort, thinking, ...resto } = unito;
  if (thinking !== undefined && (!oggetto(thinking) || !['enabled', 'disabled'].includes(thinking.type))) fail(`${record.etichetta} reasoning control is not valid.`);
  const id = corpo.model.startsWith(`${provider}:`) ? corpo.model.slice(provider.length + 1) : corpo.model;
  const modello = record.modelliNoti.find(m => m.id === id);
  const opzioni = modello?.ragionamento;
  const avvisi = [], frasiAvvisi = [];
  const note = []; /* ⛔ BUG-18: telemetria di normalizzazione del ragionamento, mai chat. K4b: classe L, inglese semplice. */
  const effort = reasoning_effort ?? reasoning?.effort;
  const richiesto = typeof effort === 'string' ? effort.trim().toLowerCase() : effort;
  const preferenza = thinking?.type ?? (reasoning?.enabled === false || richiesto === 'none' ? 'disabled' : reasoning?.enabled === true || richiesto != null ? 'enabled' : undefined);
  // L'involucro extra non può cambiare la destinazione o il contenuto dell'utente.
  const risultato = { ...resto, model: corpo.model, ...(corpo.messages !== undefined ? { messages: corpo.messages } : {}) };
  if (preferenza !== undefined && opzioni?.thinking?.length) {
    let tipo = preferenza;
    if (!opzioni.thinking.includes(tipo)) {
      tipo = 'enabled';
      note.push(`${record.etichetta} · ${modello.nome}: this model cannot disable reasoning; it remains active.`);
    }
    risultato.thinking = { type: tipo, ...(typeof thinking?.clear_thinking === 'boolean' ? { clear_thinking: thinking.clear_thinking } : {}) };
  } else if (preferenza !== undefined && richiesto == null) {
    note.push(`${record.etichetta}: reasoning control is not documented for this model; not sent.`);
  }
  if (richiesto != null) {
    /* ⛔ BUG-7 (04/10, owner): il livello chiesto si ADATTA al modello, non si butta.
       ⛔ BUG-18 (05/10): direzione «prima il più debole» (regola 24/09) e alias canonico
       xhigh≡max SILENZIOSO (Decisione 1 del dossier: stesso livello con due grafie — nulla
       cambia per chi ha chiesto, nessuna frase a ogni giro). ⛔ gen.2 (revisore D3): «none»
       su un modello obbligato al ragionamento NON lascia il campo a casa — ometterlo consegna
       la scelta al predefinito del fornitore, che è il livello PIÙ caro (Z.AI default_effort:
       max, misurato 24/09): floor al minimo documentato (hermes auxiliary_reasoning_floor.py:
       «Dropping the field would also succeed once, but it says nothing about the next call and
       hands the effort choice back to the provider default (often medium or higher, the
       opposite of what a thinking-off caller asked for)»). */
    const irrilevante = risultato.thinking?.type === 'disabled';
    let inviato = null;
    if (!irrilevante && richiesto !== 'none') {
      if (opzioni?.livelli?.includes(richiesto)) {
        inviato = richiesto;
      } else {
        const alias = aliasGrafiaRagionamento(richiesto, opzioni?.livelli);
        if (alias != null) {
          inviato = alias; /* stessa grafia del livello: silenzioso (BUG-18, Decisione 1) */
        } else {
          const vicino = livelloRagionamentoPiuVicino(richiesto, opzioni?.livelli);
          if (vicino != null) {
            inviato = vicino;
            note.push(`${record.etichetta} · ${modello?.nome ?? corpo.model}: the level "${richiesto}" is not documented for this model; sent "${vicino}", the nearest.`);
          }
        }
      }
    }
    if (richiesto === 'none' && risultato.thinking?.type === 'enabled') {
      /* ⛔ BUG-18 gen.2 (D3): il modello rifiuta di spegnersi e il chiamante voleva il minimo
         costo: si invia il MINIMO documentato, non il vuoto. */
      const minimo = livelloRagionamentoMinimo(opzioni?.livelli);
      if (minimo != null) {
        risultato.reasoning_effort = minimo;
        note.push(`${record.etichetta} · ${modello?.nome ?? corpo.model}: this model cannot disable reasoning; sent "${minimo}", the lowest documented level (the provider default costs more).`);
      }
    } else if (inviato != null) {
      risultato.reasoning_effort = inviato;
    } else if (!irrilevante && richiesto !== 'none') {
      note.push(`${record.etichetta}: the requested reasoning level is not supported by the P-D profile for this model; not sent.`);
    }
  }
  return { corpo: risultato, avvisi, note, ...(frasiAvvisi.length ? { frasiAvvisi } : {}) };
}

// P-K — OpenAI v1 ufficiale: nessuna deduzione di famiglia dal nome della distribuzione Azure.
function preparaRichiestaCloud(record, corpo) {
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!oggetto(corpo) || typeof corpo.model !== 'string' || !corpo.model.trim()) fail(`${record.etichetta} request is not valid.`);
  const risultato = { ...corpo }, avvisi = [], note = [];
  if (corpo.reasoning !== undefined) {
    if (!oggetto(corpo.reasoning)) fail(`${record.etichetta} reasoning options are not valid.`);
    delete risultato.reasoning;
    if (corpo.reasoning.effort !== undefined) {
      if (corpo.reasoning_effort !== undefined && corpo.reasoning_effort !== corpo.reasoning.effort) fail(`${record.etichetta} reasoning options conflict.`);
      risultato.reasoning_effort = corpo.reasoning.effort;
    }
    if (Object.keys(corpo.reasoning).some(k => k !== 'effort')) note.push(`${record.etichetta}: these reasoning options are not supported by the connection.`);
  }
  // I limiti di generazione restano quelli chiesti; compatibilità finale dipendente dal modello.
  return { corpo: risultato, avvisi, note };
}
// P-K — fine

/** P-G, 12/09/2026: sole differenze documentate nel record, senza confronti sui fornitori. */
function preparaProfiloCompatibile(record, corpo) {
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!oggetto(corpo) || typeof corpo.model !== 'string' || !corpo.model.trim()) fail(`${record.etichetta} request is not valid.`);
  const profilo = record.richiestaCompatibile;
  const id = corpo.model.startsWith(`${record.id}:`) ? corpo.model.slice(record.id.length + 1) : corpo.model;
  const modello = Object.hasOwn(profilo.modelli, id) ? profilo.modelli[id] : null;
  if (['thinking', 'enable_thinking'].includes(profilo.ragionamento)) {
    return modello ? preparaControlloThinking(record, modello, corpo) : { corpo, avvisi: [], note: [] };
  }
  const risultato = { ...corpo };
  const avvisi = [];
  const note = []; /* ⛔ BUG-18: telemetria di normalizzazione del ragionamento, mai chat. K4b: classe L, inglese semplice. */

  if (modello?.strumentiConFormato === false && corpo.tools != null && corpo.response_format != null) {
    fail(`${record.etichetta}: this model does not allow tools and a constrained response format in the same request.`);
  }
  if (profilo.limiteUscita === 'max_completion_tokens' && Object.hasOwn(corpo, 'max_tokens')) {
    if (corpo.max_tokens != null && corpo.max_completion_tokens != null && corpo.max_completion_tokens !== corpo.max_tokens) {
      fail(`${record.etichetta}: two different output limits were given.`);
    }
    risultato.max_completion_tokens = corpo.max_completion_tokens ?? corpo.max_tokens;
    delete risultato.max_tokens;
  }

  if (profilo.ragionamento === 'effort' && corpo.reasoning != null) {
    if (!oggetto(corpo.reasoning)) fail(`${record.etichetta} reasoning options are not valid.`);
    const { effort, enabled, ...altre } = corpo.reasoning;
    if (effort != null && typeof effort !== 'string') fail(`${record.etichetta} reasoning level is not valid.`);
    if (enabled !== undefined && typeof enabled !== 'boolean') fail(`${record.etichetta} reasoning control is not valid.`);
    const richiesto = enabled === false ? 'none' : effort;
    if ((enabled === false && effort != null && effort !== 'none')
      || (richiesto != null && corpo.reasoning_effort != null && corpo.reasoning_effort !== richiesto)) {
      fail(`${record.etichetta}: conflicting reasoning preferences were given.`);
    }
    delete risultato.reasoning;
    if (richiesto != null) risultato.reasoning_effort = richiesto;
    if (Object.keys(altre).length || (enabled === true && richiesto == null && corpo.reasoning_effort == null)) {
      note.push(`${record.etichetta}: some reasoning options have no documented translation; not sent.`);
    }
  }
  // Un modello futuro o non documentato conserva i parametri: nessuna incompatibilità dedotta.
  if (risultato.reasoning_effort != null && modello?.livelliRagionamento
    && !modello.livelliRagionamento.includes(risultato.reasoning_effort)) {
    /* ⛔ BUG-7 (04/10, owner): stesso clamp del ramo thinking — prima il più debole (BUG-18),
       non il taglio secco. ⛔ BUG-18: l'alias canonico xhigh≡max precede il clamp ed è
       SILENZIOSO (Decisione 1): stessa grafia del livello, nessuna frase a ogni giro. */
    const alias = aliasGrafiaRagionamento(risultato.reasoning_effort, modello.livelliRagionamento);
    if (alias != null) {
      risultato.reasoning_effort = alias;
    } else {
      const vicino = livelloRagionamentoPiuVicino(risultato.reasoning_effort, modello.livelliRagionamento);
      if (vicino != null) {
        risultato.reasoning_effort = vicino;
        note.push(`${record.etichetta} · ${modello?.nome ?? id}: the requested reasoning level is not documented for this model; sent "${vicino}", the nearest.`);
      } else {
        delete risultato.reasoning_effort;
        note.push(`${record.etichetta}: the requested reasoning level is not documented for this model; not sent.`);
      }
    }
  }
  return { corpo: risultato, avvisi, note };
}

/** P-I: controllo binario solo per modelli documentati; non inventa livelli di profondità. */
function preparaControlloThinking(record, modello, corpo) {
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const invalida = () => fail(`${record.etichetta}: invalid or conflicting reasoning options.`);
  if (corpo.extra_body !== undefined && !oggetto(corpo.extra_body)) invalida();
  const risultato = { ...corpo };
  for (const [k, v] of Object.entries(corpo.extra_body ?? {})) {
    // L'involucro SDK non può riscrivere destinazione, contenuto o prototipo.
    if (['model', 'messages', 'extra_body', '__proto__', 'constructor', 'prototype'].includes(k)) invalida();
    if (Object.hasOwn(corpo, k) && JSON.stringify(corpo[k]) !== JSON.stringify(v)) invalida();
    risultato[k] = v;
  }
  delete risultato.extra_body;
  const { reasoning, reasoning_effort, thinking, enable_thinking } = risultato;
  const qwen = record.richiestaCompatibile.ragionamento === 'enable_thinking';
  if (reasoning !== undefined && !oggetto(reasoning)) invalida();
  if (reasoning?.enabled !== undefined && typeof reasoning.enabled !== 'boolean') invalida();
  const livelli = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'default'];
  for (const effort of [reasoning?.effort, reasoning_effort]) if (effort !== undefined && !livelli.includes(effort)) invalida();
  if (reasoning?.effort !== undefined && reasoning_effort !== undefined && reasoning.effort !== reasoning_effort) invalida();
  if (enable_thinking !== undefined && (!qwen || typeof enable_thinking !== 'boolean')) invalida();
  if (thinking !== undefined) {
    const tipi = qwen ? ['enabled', 'disabled'] : [modello.thinking.attivo ?? 'adaptive', 'disabled'];
    if (!oggetto(thinking) || !tipi.includes(thinking.type)
      || Object.keys(thinking).some(k => !['type', 'keep'].includes(k))
      || (thinking.keep !== undefined && (qwen || modello.thinking.attivo !== 'enabled' || ![null, 'all'].includes(thinking.keep)))
      || (modello.thinking.conserva && thinking.keep !== undefined && thinking.keep !== modello.thinking.conserva)) invalida();
  }
  const effort = reasoning_effort ?? reasoning?.effort;
  const preferenze = [reasoning?.enabled, effort === undefined ? undefined : effort !== 'none',
    thinking === undefined ? undefined : thinking.type !== 'disabled', enable_thinking].filter(v => v !== undefined);
  if (new Set(preferenze).size > 1) invalida();
  const avvisi = [], frasiAvvisi = [];
  const note = []; /* ⛔ BUG-18: telemetria di normalizzazione del ragionamento, mai chat. K4b: classe L, inglese semplice. */
  let attivo = preferenze[0];
  delete risultato.reasoning;
  delete risultato.reasoning_effort;
  delete risultato.thinking;
  delete risultato.enable_thinking;
  if ((effort !== undefined && effort !== 'none') || Object.keys(reasoning ?? {}).some(k => !['enabled', 'effort'].includes(k))) {
    note.push(`${record.etichetta}: this model only supports switching reasoning on or off; the requested level is not sent.`);
  }
  if (attivo === false && !modello.thinking.disattivabile) {
    attivo = true;
    note.push(`${record.etichetta}: this model cannot disable reasoning; it remains active.`);
  }
  if (attivo !== undefined) {
    if (qwen) risultato.enable_thinking = attivo;
    else if (modello.thinking.attivo !== null) risultato.thinking = { ...(thinking ?? {}),
      type: attivo ? modello.thinking.attivo : 'disabled',
      ...(attivo && modello.thinking.conserva ? { keep: modello.thinking.conserva } : {}) };
  }
  const thinkingEffettivo = attivo ?? modello.thinking.predefinito;
  if (modello.thinking.soloStreaming && thinkingEffettivo && risultato.stream !== true) {
    fail(`${record.etichetta}: this model requires streaming when reasoning is enabled.`);
  }
  if ((modello.sceltaObbligata === false && risultato.tool_choice === 'required')
    || (modello.sceltaForzataConThinking === false && thinkingEffettivo && oggetto(risultato.tool_choice))) {
    fail(`${record.etichetta}: forced tool choice is incompatible with this model and requested mode.`);
  }
  if (modello.temperaturaServer && Object.hasOwn(risultato, 'temperature')) {
    delete risultato.temperature;
    aggiungiAvviso(avvisi, frasiAvvisi, { testo: `${record.etichetta}: temperature is managed by the model; the requested value is not sent.`, testoChiave: 'server.compatibleNotice.temperatureIgnored', testoParams: { provider: record.etichetta } });
  }
  return { corpo: risultato, avvisi, note, ...(frasiAvvisi.length ? { frasiAvvisi } : {}) };
}

function capability(value) {
  return typeof value === 'boolean' ? { state: 'observed', value } : { state: 'unknown', value: null };
}

function context(value) {
  return Number.isSafeInteger(value) && value > 0
    ? { state: 'observed', value }
    : { state: 'unknown', value: null };
}

async function readJson(response) {
  if (!response?.ok) throw new OpenAiCompatibleRuntimeError(`runtime returned HTTP ${response?.status ?? 0}`, 'RUNTIME_HTTP_ERROR');
  try { return await response.json(); } catch { throw new OpenAiCompatibleRuntimeError('runtime returned invalid JSON', 'RUNTIME_RESPONSE_INVALID'); }
}

async function* readStreamLines(response) {
  if (!response?.ok) throw new OpenAiCompatibleRuntimeError(`runtime returned HTTP ${response?.status ?? 0}`, 'RUNTIME_HTTP_ERROR');
  if (!response.body || typeof response.body.getReader !== 'function') fail('runtime stream body is unavailable', 'RUNTIME_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      yield* lines;
      if (done) break;
    }
    if (buffer.trim() !== '') yield buffer;
  } finally { await reader.cancel().catch(() => {}); }
}

function normalizeOllamaModel(raw, observedAt) {
  const id = typeof raw?.name === 'string' && raw.name.trim() ? raw.name : '';
  if (!id) return null;
  const details = raw.details ?? {};
  return {
    id,
    name: id,
    source: 'ollama',
    context: context(details.context_length),
    verifiedContext: Number.isSafeInteger(details.context_length) && details.context_length > 0,
    capabilities: {
      vision: capability(Array.isArray(details.families) && details.families.some((family) => /(?:clip|vision|llava)/iu.test(family))),
      toolUse: { state: 'unknown', value: null },
      reasoning: { state: 'unknown', value: null },
    },
    sizeBytes: Number.isSafeInteger(raw.size) ? raw.size : null,
    quantization: typeof details.quantization_level === 'string' ? details.quantization_level : null,
    observedAt,
  };
}

function normalizeLmModel(raw, observedAt) {
  if (raw?.type !== 'llm' || typeof raw.key !== 'string' || raw.key.trim() === '') return null;
  const reasoning = raw.capabilities?.reasoning;
  const allowedReasoning = Array.isArray(reasoning?.allowed_options) ? reasoning.allowed_options : [];
  return {
    id: raw.key,
    name: typeof raw.display_name === 'string' && raw.display_name ? raw.display_name : raw.key,
    source: 'lmstudio',
    context: context(raw.max_context_length),
    verifiedContext: Number.isSafeInteger(raw.max_context_length) && raw.max_context_length > 0,
    capabilities: {
      vision: capability(raw.capabilities?.vision),
      toolUse: capability(raw.capabilities?.trained_for_tool_use),
      reasoning: allowedReasoning.length > 0 ? { state: 'observed', value: true } : { state: 'observed', value: false },
    },
    sizeBytes: Number.isSafeInteger(raw.size_bytes) ? raw.size_bytes : null,
    quantization: typeof raw.quantization?.name === 'string' ? raw.quantization.name : null,
    observedAt,
  };
}

export function createOpenAiCompatibleRuntime({
  fetchImpl = fetch,
  now = () => new Date(),
  endpoints = {},
} = {}) {
  const activeRequests = new Map();
  /*
   * ⛔ 12/09 — L'INDIRIZZO SI RILEGGE A OGNI CHIAMATA, e non si fotografa all'avvio.
   *
   *   `endpoints[id]` può essere un oggetto (com'era) oppure una FUNZIONE che lo torna adesso. La
   *   differenza conta: chi cambia l'indirizzo di LM Studio nel pannello Provider a server acceso
   *   lo cambia per la chat (`model-destination.mjs` legge il portachiavi a ogni richiesta) — se
   *   il catalogo restasse sull'indirizzo di partenza, la scheda elencherebbe i modelli di un
   *   motore e la chat ne chiamerebbe un altro, senza un errore da nessuna parte.
   *   ⛔ Un override che lancia non spegne il motore: si torna al valore del registro.
   */
  function config(provider) {
    if (!Object.hasOwn(PROVIDERS, provider)) fail(`unknown local provider: ${provider}`);
    const override = endpoints[provider];
    let scelto = override;
    if (typeof override === 'function') { try { scelto = override(); } catch { scelto = null; } }
    return { ...PROVIDERS[provider], ...(scelto && typeof scelto === 'object' ? scelto : {}) };
  }

  async function request(provider, path, options = {}) {
    const target = `${config(provider).baseUrl}${path}`;
    try { return await fetchImpl(target, { ...options, headers: { Accept: 'application/json', ...(options.headers ?? {}) } }); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new OpenAiCompatibleRuntimeError(`runtime ${provider} unreachable: ${error.message}`, 'RUNTIME_UNREACHABLE');
    }
  }

  async function detect(provider) {
    const observedAt = now().toISOString();
    try {
      const body = await readJson(await request(provider, config(provider).listPath));
      const valid = provider === 'ollama' ? Array.isArray(body?.models) : Array.isArray(body?.models);
      if (!valid) return { provider, state: 'unknown', baseUrl: config(provider).baseUrl, observedAt, failureReason: 'INVALID_RESPONSE' };
      return { provider, state: 'observed', baseUrl: config(provider).baseUrl, observedAt };
    } catch (error) {
      return { provider, state: 'unknown', baseUrl: config(provider).baseUrl, observedAt, failureReason: error.code || 'RUNTIME_FAILED' };
    }
  }

  async function listModels(provider) {
    const body = await readJson(await request(provider, config(provider).listPath));
    if (!Array.isArray(body?.models)) fail('runtime model list is invalid', 'RUNTIME_RESPONSE_INVALID');
    const observedAt = now().toISOString();
    const normalize = provider === 'ollama' ? normalizeOllamaModel : normalizeLmModel;
    return body.models.map((model) => normalize(model, observedAt)).filter(Boolean);
  }

  async function inspect(provider, modelId) {
    const model = (await listModels(provider)).find(({ id }) => id === modelId);
    if (!model) fail(`model ${modelId} not found in ${provider}`, 'MODEL_NOT_FOUND');
    return model;
  }

  async function load(provider, modelId, { contextLength } = {}) {
    if (provider !== 'lmstudio') fail('Ollama manages loading through its own lifecycle', 'RUNTIME_OPERATION_UNSUPPORTED');
    const body = await readJson(await request(provider, '/api/v1/models/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelId, ...(contextLength ? { context_length: contextLength } : {}) }) }));
    if (!['loaded', 'already_loaded'].includes(body?.status)) fail('LM Studio did not confirm model load', 'MODEL_LOAD_UNCONFIRMED');
    return { state: 'loaded', provider, modelId, observedAt: now().toISOString() };
  }

  async function unload(provider, modelId) {
    if (provider !== 'lmstudio') fail('Ollama manages unloading through its own lifecycle', 'RUNTIME_OPERATION_UNSUPPORTED');
    const body = await readJson(await request(provider, '/api/v1/models/unload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelId }) }));
    if (!['unloaded', 'already_unloaded'].includes(body?.status)) fail('LM Studio did not confirm model unload', 'MODEL_UNLOAD_UNCONFIRMED');
    return { state: 'unloaded', provider, modelId, observedAt: now().toISOString() };
  }

  async function* generateStream({ provider, modelId, messages, tools, signal, requestId } = {}) {
    if (!Array.isArray(messages) || typeof modelId !== 'string' || modelId.trim() === '') fail('stream request is invalid');
    const controller = new AbortController();
    if (signal?.aborted) controller.abort(signal.reason);
    const combinedSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    if (signal && typeof AbortSignal.any !== 'function') signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    if (requestId) activeRequests.set(requestId, controller);
    const isOllama = provider === 'ollama';
    const body = isOllama
      ? { model: modelId, messages, stream: true, ...(tools ? { tools } : {}) }
      : { model: modelId, messages, stream: true, ...(tools ? { tools } : {}) };
    let taggedEvents = [];
    const taggedContent = createStreamPartitioner({
      onText: (value) => taggedEvents.push({ type: 'text', value }),
      onReasoning: (value) => taggedEvents.push({ type: 'reasoning', value }),
      onToolCall: (value) => taggedEvents.push({ type: 'tool_call', ...value }),
    });
    const flushTaggedEvents = function* () {
      const events = taggedEvents;
      taggedEvents = [];
      for (const event of events) yield event;
    };
    try {
      const response = await request(provider, isOllama ? '/api/chat' : '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: isOllama ? 'application/x-ndjson' : 'text/event-stream' }, body: JSON.stringify(body), signal: combinedSignal });
      for await (const line of readStreamLines(response)) {
      const trimmed = line.trim();
      if (!trimmed || (!isOllama && !trimmed.startsWith('data:'))) continue;
      const payload = isOllama ? trimmed : trimmed.slice(5).trim();
      if (payload === '[DONE]') { taggedContent.finish(); yield* flushTaggedEvents(); yield { type: 'done' }; return; }
      let chunk;
      try { chunk = JSON.parse(payload); } catch { yield { type: 'error', code: 'RUNTIME_RESPONSE_INVALID', message: 'runtime emitted malformed stream JSON' }; continue; }
      if (isOllama) {
        if (typeof chunk.message?.thinking === 'string' && chunk.message.thinking) yield { type: 'reasoning', value: chunk.message.thinking };
        if (typeof chunk.message?.content === 'string' && chunk.message.content) {
          taggedContent.push(chunk.message.content);
          yield* flushTaggedEvents();
        }
        for (const call of chunk.message?.tool_calls ?? []) yield { type: 'tool_call', name: call.function?.name ?? '', arguments: call.function?.arguments ?? {} };
        if (chunk.done === true) yield { type: 'done' };
      } else {
        const delta = chunk.choices?.[0]?.delta ?? {};
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoning === 'string' && reasoning) yield { type: 'reasoning', value: reasoning };
        if (typeof delta.content === 'string' && delta.content) {
          taggedContent.push(delta.content);
          yield* flushTaggedEvents();
        }
        for (const call of delta.tool_calls ?? []) yield { type: 'tool_call', id: call.id, name: call.function?.name ?? '', arguments: call.function?.arguments ?? '' };
      }
      }
      taggedContent.finish();
      yield* flushTaggedEvents();
    } finally {
      if (requestId) activeRequests.delete(requestId);
    }
  }

  function cancel(requestId) {
    const controller = activeRequests.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async function health(provider) {
    const response = await request(provider, provider === 'ollama' ? '/' : '/api/v1/models');
    return { provider, ok: Boolean(response.ok), observedAt: now().toISOString() };
  }

  return Object.freeze({ detect, listModels, inspect, load, unload, generateStream, cancel, health });
}
