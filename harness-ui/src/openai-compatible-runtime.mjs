import { createHash } from 'node:crypto';

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

/*
 * 21/10/2026, P0 della ricognizione (passata 2): un fornitore rigido dichiara i campi che rifiuta (`campiRifiutati`), e questo è
 * l'UNICO punto che li toglie, dopo ogni ramo del traduttore — come Hermes, che li toglie alla ricostruzione e di nuovo sui messaggi
 * già pronti (`reapply_reasoning_echo`, `agent/message_sanitization.py:793-800`). Il corpo del chiamante non si tocca.
 */
function togliCampiRifiutati(record, esito) {
  if (!record || !esito?.corpo || typeof esito.corpo !== 'object') return esito;
  /* owner 21/10/2026 sera, «come Hermes»: il marcatore `cache_control` (il kernel lo mette sul sistema per TUTTI, `talosHarness.mjs:2046`)
     parte solo verso chi lo dichiara nel registro (`cache.marcatore`), come `anthropic_prompt_cache_policy` in Hermes
     (`agent/agent_runtime_helpers.py:1779-1850`): altrove è un campo in più, nel migliore dei casi ignorato, nel peggiore un 400. */
  const campi = [...(record.campiRifiutati?.campi ?? []), ...(record.cache?.marcatore === 'cache_control' ? [] : ['cache_control'])];
  if (campi.length === 0) return esito;
  const corpo = { ...esito.corpo };
  if (campi.includes('stream_options')) delete corpo.stream_options;
  if (Array.isArray(corpo.messages) && (campi.includes('reasoning_content') || campi.includes('cache_control'))) {
    corpo.messages = corpo.messages.map((m) => {
      if (!m || typeof m !== 'object') return m;
      let nuovo = m;
      if (campi.includes('reasoning_content') && m.role === 'assistant' && Object.hasOwn(m, 'reasoning_content')) {
        const { reasoning_content: tolto, ...resto } = m; nuovo = resto;
        /* revisione F1 (Cerebras): dove il fornitore ha un campo SUO per il ragionamento rimandato, il testo vero ci va (mai il riempimento
           di un altro fornitore, mai un vuoto) */
        const campoProprio = record.ragionamentoNeiMessaggi?.campo;
        if (campoProprio && typeof tolto === 'string' && tolto.trim() !== '' && !Object.hasOwn(resto, campoProprio)) nuovo = { ...resto, [campoProprio]: tolto };
      }
      if (campi.includes('cache_control') && Array.isArray(nuovo.content) && nuovo.content.some((p) => p && typeof p === 'object' && Object.hasOwn(p, 'cache_control'))) {
        const parti = nuovo.content.map((p) => (p && typeof p === 'object' && Object.hasOwn(p, 'cache_control') ? (({ cache_control: _c, ...r }) => r)(p) : p));
        /* il kernel trasforma il sistema in UN pezzo di testo solo per appendergli il marcatore: tolto quello, torna la stringa che era */
        nuovo = { ...nuovo, content: parti.length === 1 && parti[0]?.type === 'text' && Object.keys(parti[0]).length === 2 && typeof parti[0].text === 'string' ? parti[0].text : parti };
      }
      return nuovo;
    });
  }
  return { ...esito, corpo };
}

export function preparaRichiestaCompatibile(provider, corpo) {
  const record = REGISTRO_FORNITORI[provider];
  return conAttrezziCoerenti(conTettoDiUscita(record, conChiaveDellaCache(record, conIdChiamateDelFornitore(record, togliCampiRifiutati(record, preparaRichiestaPerFornitore(provider, corpo))))));
}

/* P2 della ricognizione (revisione dei rigidi, 21/10/2026): il riassunto parte con `tools: []` e `tool_choice: 'auto'`
   (`talosHarness.mjs:2047-2048`, `runtime-owner-adapter.mjs:2115`), e un `tool_choice` senza attrezzi l'API di OpenAI lo rifiuta. Senza
   attrezzi la scelta dell'attrezzo e le chiamate parallele non significano niente: si tolgono. La lista vuota si toglie come fa Hermes
   (`agent/transports/chat_completions.py:366`, `if tools:`), tranne quando la storia ha chiamate d'attrezzo: lì resta, come pi
   (`api/openai-completions.ts:862-865`, «requires tools param when conversation has tool_calls/tool_results»). */
function conAttrezziCoerenti(esito) {
  const corpo = esito?.corpo;
  if (!corpo || !Array.isArray(corpo.tools) || corpo.tools.length > 0) return esito;
  const conStoria = Array.isArray(corpo.messages) && corpo.messages.some((m) => (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) || m?.role === 'tool');
  const { tools, tool_choice, parallel_tool_calls, ...resto } = corpo;
  esito.corpo = conStoria ? { ...resto, tools } : resto;
  return esito;
}

/* P1 della ricognizione (21/10/2026): un limite d'uscita più alto del massimo che il registro DICHIARA per il modello (`modelliNoti`,
   `maxOutputTokens`, con fonte e data) si abbassa a quel massimo PRIMA di partire, e lo si dice. Hermes lo fa solo dopo il rifiuto del
   fornitore (`agent/turn_overflow.py:285-300`, «max_tokens too large» ⇒ ritenta); pi lo taglia prima, sul contesto
   (`api/simple-options.ts:18-22`). Un modello che il registro non conosce resta com'è: niente tetto inventato. */
function conTettoDiUscita(record, esito) {
  if (!Array.isArray(record?.modelliNoti) || !esito?.corpo || typeof esito.corpo.model !== 'string') return esito;
  const id = esito.corpo.model.startsWith(`${record.id}:`) ? esito.corpo.model.slice(record.id.length + 1) : esito.corpo.model;
  const modello = record.modelliNoti.find((m) => m.id.toLowerCase() === id.toLowerCase());
  if (!Number.isSafeInteger(modello?.maxOutputTokens)) return esito;
  for (const campo of ['max_tokens', 'max_completion_tokens']) {
    const chiesto = esito.corpo[campo];
    if (Number.isSafeInteger(chiesto) && chiesto > modello.maxOutputTokens) {
      esito.corpo = { ...esito.corpo, [campo]: modello.maxOutputTokens };
      esito.note = [...(esito.note ?? []), `${record.etichetta}: the output limit ${chiesto} is above this model's maximum; sent ${modello.maxOutputTokens}.`];
    }
  }
  return esito;
}

/* P1 della ricognizione (21/10/2026): `prompt_cache_key` verso i fornitori che lo DICHIARANO (`cache.marcatore`), per tenere le richieste
   della stessa conversazione sulla stessa macchina della cache. Come per il piano ChatGPT (`chatgpt-richiesta.mjs:46-63`): la chiave è
   l'IMPRONTA del prefisso stabile — modello, attrezzi e messaggi fino al primo della persona — così ogni giro della stessa chat la ritrova
   senza che il traduttore conosca la sessione. Una chiave messa da chi chiama resta sua. Tetto di 64 caratteri come pi
   (`openai-prompt-cache.ts:1`). */
/* P1 OpenRouter (21/10/2026): lo stesso valore va anche nel `session_id` a radice verso chi dichiara `instradamento.campo: 'session_id'`.
   OpenRouter (openrouter.ai/docs/guides/best-practices/prompt-caching, letta il 21/10): con `session_id` l'instradamento «sticky» parte
   dalla PRIMA richiesta riuscita, senza aspettare un colpo di cache, e non dipende dall'hash dei primi messaggi; massimo 256 caratteri;
   vince sull'intestazione `x-session-id`. Hermes lo manda con l'id della sessione (`plugins/model-providers/openrouter/__init__.py:126-133`). */
function conChiaveDellaCache(record, esito) {
  const perCache = record?.cache?.marcatore === 'prompt_cache_key';
  const perInstradamento = record?.instradamento?.campo === 'session_id';
  if ((!perCache && !perInstradamento) || !esito?.corpo || !Array.isArray(esito.corpo.messages)) return esito;
  const suo = (campo) => typeof esito.corpo[campo] === 'string' && esito.corpo[campo] !== '';
  if ((!perCache || suo('prompt_cache_key')) && (!perInstradamento || suo('session_id'))) return esito;
  const messaggi = esito.corpo.messages;
  const primoDellaPersona = messaggi.findIndex((m) => m?.role === 'user');
  const prefisso = primoDellaPersona >= 0 ? messaggi.slice(0, primoDellaPersona + 1) : messaggi.slice(0, 1);
  const impronta = createHash('sha256').update(JSON.stringify([esito.corpo.model ?? null, esito.corpo.tools ?? null, prefisso])).digest('hex');
  const chiave = `talos-${impronta}`.slice(0, 64);
  return { ...esito, corpo: { ...esito.corpo,
    ...(perCache && !suo('prompt_cache_key') ? { prompt_cache_key: chiave } : {}),
    ...(perInstradamento && !suo('session_id') ? { session_id: chiave } : {}) } };
}

/* revisione F4 (21/10/2026): gli id delle chiamate nella forma che il fornitore accetta (Mistral: 9 caratteri alfanumerici). Ogni id non
   valido diventa un hash deterministico (FNV-1a su due semi, base 36, come opencode); gli id già validi della storia sono riservati
   prima, così due id diversi non diventano mai lo stesso; chiamata (`tool_calls[].id`) ed esito (`tool_call_id`) restano accoppiati. */
const ID_ALFANUMERICO_9 = /^[A-Za-z0-9]{9}$/u;
function hashId(valore) {
  const passata = (seme) => { let h = seme; for (const c of valore) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
  return `${passata(2166136261).padStart(7, '0')}${passata(2246822519).padStart(7, '0')}`.slice(-9);
}
function conIdChiamateDelFornitore(record, esito) {
  if (record?.idChiamate?.forma !== 'alfanumerico-9' || !Array.isArray(esito?.corpo?.messages)) return esito;
  const messaggi = esito.corpo.messages;
  const tutti = messaggi.flatMap((m) => [...(Array.isArray(m?.tool_calls) ? m.tool_calls.map((t) => t?.id) : []), m?.tool_call_id]).filter((id) => typeof id === 'string');
  if (tutti.every((id) => ID_ALFANUMERICO_9.test(id))) return esito;
  const usati = new Set(tutti.filter((id) => ID_ALFANUMERICO_9.test(id)));
  const mappa = new Map();
  const nuovo = (id) => {
    if (typeof id !== 'string' || ID_ALFANUMERICO_9.test(id)) return id;
    if (mappa.has(id)) return mappa.get(id);
    let tentativo = 0; let candidato = hashId(id);
    while (usati.has(candidato)) candidato = hashId(`${id}:${++tentativo}`);
    usati.add(candidato); mappa.set(id, candidato);
    return candidato;
  };
  const corpo = { ...esito.corpo, messages: messaggi.map((m) => {
    if (!m || typeof m !== 'object') return m;
    let n = m;
    if (Array.isArray(m.tool_calls)) n = { ...n, tool_calls: m.tool_calls.map((t) => (t && typeof t === 'object' ? { ...t, id: nuovo(t.id) } : t)) };
    if (typeof m.tool_call_id === 'string') n = { ...n, tool_call_id: nuovo(m.tool_call_id) };
    return n;
  }) };
  return { ...esito, corpo };
}

function preparaRichiestaPerFornitore(provider, corpo) {
  const record = REGISTRO_FORNITORI[provider];
  // P-K — il corpo HTTP usa reasoning_effort, non l'involucro del router.
  if (record?.cloud) return preparaRichiestaCloud(record, corpo);
  // P-K — fine
  if (record?.richiestaCompatibile) return preparaProfiloCompatibile(record, corpo);
  if (['together', 'reasoning_effort', 'enable_thinking'].includes(record?.ragionamento?.formato)) return preparaFormatoSemplice(record, corpo);
  if (record?.ragionamento?.formato !== 'thinking') return { corpo, avvisi: [], note: [] };
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!oggetto(corpo) || typeof corpo.model !== 'string') fail(`${record.etichetta} request is not valid.`);
  if (corpo.extra_body !== undefined && !oggetto(corpo.extra_body)) fail(`${record.etichetta} options are not valid.`);
  const unito = { ...corpo, ...(corpo.extra_body ?? {}) };
  const { extra_body, reasoning, reasoning_effort, thinking, ...resto } = unito;
  if (thinking !== undefined && (!oggetto(thinking) || !['enabled', 'disabled'].includes(thinking.type))) fail(`${record.etichetta} reasoning control is not valid.`);
  const id = corpo.model.startsWith(`${provider}:`) ? corpo.model.slice(provider.length + 1) : corpo.model;
  const modello = record.modelliNoti.find(m => m.id === id);
  /* 21/10/2026 (P0 DeepSeek): un id fuori da modelliNoti usa le opzioni del FORNITORE se le dichiara (`modelliIgnoti`). */
  const opzioni = modello?.ragionamento ?? (modello ? undefined : record.ragionamento.modelliIgnoti);
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
      note.push(`${record.etichetta} · ${modello?.nome ?? corpo.model}: this model cannot disable reasoning; it remains active.`);
    }
    /* 21/10/2026, owner «Tenerlo, come pi e opencode»: col pensiero acceso Z.AI riceve `clear_thinking: false` e rilegge il ragionamento
       dei giri passati (docs.z.ai/guides/capabilities/thinking-mode, letta il 21/10: «disabled by default on the standard API endpoint»;
       pi `api/openai-completions.ts:886`, opencode `core/src/variant.ts:293`). Una scelta del chiamante resta sua. */
    const conserva = tipo === 'enabled' && record.ragionamento.conservaRagionamento?.forma === 'clear_thinking';
    risultato.thinking = { type: tipo, ...(typeof thinking?.clear_thinking === 'boolean' ? { clear_thinking: thinking.clear_thinking } : conserva ? { clear_thinking: false } : {}) };
  } else if (preferenza !== undefined && richiesto == null) {
    note.push(`${record.etichetta}: reasoning control is not documented for this model; not sent.`);
  } else if (preferenza === undefined && thinking === undefined
    && record.ragionamento.conservaRagionamento?.forma === 'clear_thinking'
    && (record.ragionamento.conservaRagionamento.diSerie ?? []).some((m) => m.toLowerCase() === String(id).toLowerCase())) {
    /* revisione Z-1 (21/10/2026): «Automatico» (nessuna preferenza) lasciava il pensiero acceso di serie SENZA `clear_thinking`, quindi
       il ragionamento passato si cancellava, mentre Qwen nello stesso caso lo teneva. Sui modelli che la pagina di Z.AI dà accesi di
       serie (GLM-5.x) si manda lo stato di serie dichiarato, col ragionamento tenuto — come pi, che manda `thinking` sempre (:886). */
    risultato.thinking = { type: 'enabled', clear_thinking: false };
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
  if (record.ragionamento.rimandaRagionamento === true && Array.isArray(risultato.messages)) risultato.messages = conRagionamentoRimandato(risultato.messages);
  return { corpo: risultato, avvisi, note, ...(frasiAvvisi.length ? { frasiAvvisi } : {}) };
}

/* Il riempimento del ragionamento (revisione D1, 21/10/2026), condiviso da DeepSeek e Kimi: vedi il commento qui sotto. */
function conRagionamentoRimandato(messages) {
  {
    /* Revisione D1, 21/10/2026 — come Hermes `apply_reasoning_content_policy` (`agent/message_sanitization.py:748-790`) e
       `build_assistant_message` (`agent/chat_completion_helpers.py:1684-1691`): il ragionamento del messaggio resta com'è; se manca,
       o è la stringa vuota, uno SPAZIO — DeepSeek V4 Pro rifiuta anche "" (pi usa "", ed è il caso che Hermes ha corretto, #17341).
       Il riempimento non inventa pensiero e non ne copia: un messaggio senza ragionamento riceve uno spazio. ⛔ Ma il ragionamento GIÀ
       salvato non dice da quale fornitore viene (revisione D-1, 21/10): dopo un cambio di modello quello di GLM riparte verso DeepSeek
       come se fosse suo. Hermes tiene due campi (`message_sanitization.py:775-780`); qui è un aperto dichiarato. Il corpo del chiamante
       non si tocca. */
    return messages.map((m) => (m?.role === 'assistant'
      && !(typeof m.reasoning_content === 'string' && m.reasoning_content.length > 0)
      ? { ...m, reasoning_content: ' ' }
      : m));
  }
}

/*
 * 21/10/2026, P1 della ricognizione dei parametri: tre forme dello sforzo che non sono né OpenRouter né `thinking`.
 *   together         `reasoning: { enabled }` + `reasoning_effort` fra i livelli dichiarati (pi `openai-completions.ts:955-963`)
 *   reasoning_effort `reasoning_effort` a radice, «none» per spegnere (Hermes `deepinfra/__init__.py:18-30`)
 *   enable_thinking  `enable_thinking` + `separate_reasoning: true`; lo sforzo non è documentato (docs.novita.ai, 21/10)
 * Il livello si adatta come altrove (BUG-18: prima il più debole, mai un costo più alto di quello scelto). Prima di questa funzione
 * il corpo partiva con l'involucro di OpenRouter, che questi fornitori non documentano: la scelta della persona si perdeva in silenzio.
 */
function preparaFormatoSemplice(record, corpo) {
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!oggetto(corpo) || typeof corpo.model !== 'string') fail(`${record.etichetta} request is not valid.`);
  if (corpo.reasoning !== undefined && !oggetto(corpo.reasoning)) fail(`${record.etichetta} reasoning options are not valid.`);
  const { reasoning, reasoning_effort, enable_thinking, ...resto } = corpo;
  const grezzo = reasoning_effort ?? reasoning?.effort;
  const richiesto = typeof grezzo === 'string' ? grezzo.trim().toLowerCase() : (grezzo ?? null);
  const spento = reasoning?.enabled === false || enable_thinking === false || richiesto === 'none';
  const acceso = !spento && (reasoning?.enabled === true || enable_thinking === true || richiesto != null);
  const risultato = { ...resto };
  const note = [];
  const livelli = record.ragionamento.livelli;
  const livello = () => {
    if (richiesto == null || richiesto === 'none') return null;
    const vicino = livelloRagionamentoPiuVicino(richiesto, livelli);
    if (vicino != null && vicino !== richiesto && aliasGrafiaRagionamento(richiesto, livelli) == null) {
      note.push(`${record.etichetta}: the level "${richiesto}" is not documented; sent "${vicino}", the nearest.`);
    }
    return vicino;
  };
  if (record.ragionamento.formato === 'together') {
    if (spento || acceso) risultato.reasoning = { enabled: acceso };
    const l = acceso ? livello() : null;
    if (l != null) risultato.reasoning_effort = l;
  } else if (record.ragionamento.formato === 'reasoning_effort') {
    if (spento) risultato.reasoning_effort = 'none';
    else { const l = livello(); if (l != null) risultato.reasoning_effort = l; }
  } else {
    if (spento || acceso) risultato.enable_thinking = acceso;
    if (richiesto != null && richiesto !== 'none') note.push(`${record.etichetta}: reasoning levels are not documented; only on/off is sent.`);
    risultato.separate_reasoning = true;
  }
  return { corpo: risultato, avvisi: [], note };
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
  /* 21/10/2026 (Vertex): i livelli documentati dalla connessione; «none» = il minimo (BUG-18 gen.2: senza campo decide il modello),
     il resto il più vicino senza superare il costo scelto (BUG-18), la grafia xhigh≡max in silenzio */
  const livelli = record.cloud?.livelliRagionamento;
  /* revisione V-1 + G-1 (21/10/2026): «Spento» NON è «minimal», e non si spegne ovunque. La pagina «Thinking» di Vertex
     (docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking, aggiornata il 20/10/2026, letta il 21/10) dice:
     - «You can turn off thinking for Gemini 2.5 Flash and Gemini 2.5 Flash-Lite by setting thinking_budget to 0» ⇒ lì si spegne;
     - «You can't turn off thinking for Gemini 2.5 Pro» (budget 128-32.768) ⇒ il minimo documentato, 128, e si dice;
     - «The thinking_budget parameter is deprecated for Gemini 3 and later models» (400 intermittenti sul 3, sempre sul 4) ⇒ il
       livello più basso che OGNI Gemini 3 documenta, `low` (3.1 Pro non elenca MINIMAL, e MINIMAL vuole le firme del pensiero
       nei giri multipli), e si dice.
     Hermes (`agent/transports/chat_completions.py:177-188`, #91927) manda budget 0 a 2.5 e 3+: qui si segue la pagina di oggi.
     Il `thinking_config` del chiamante si sostituisce SOLO col nostro spegnimento, e lo si dice; il resto di `extra_body` resta suo. */
  if (Array.isArray(livelli) && risultato.reasoning_effort === 'none') {
    delete risultato.reasoning_effort;
    const nome = String(corpo.model).trim().toLowerCase().replace(/^google\//u, '');
    const maggiore = /^gemini-(\d+)/u.exec(nome);
    const conBudget = (budget) => {
      const extra = oggetto(risultato.extra_body) ? risultato.extra_body : {};
      const google = oggetto(extra.google) ? extra.google : {};
      if (google.thinking_config !== undefined) note.push(`${record.etichetta}: your thinking_config was replaced to turn reasoning off.`);
      risultato.extra_body = { ...extra, google: { ...google, thinking_config: { include_thoughts: false, thinking_budget: budget } } };
    };
    if (nome.startsWith('gemini-2.5-flash')) conBudget(0);
    else if (nome.startsWith('gemini-2.5-pro')) {
      conBudget(128);
      note.push(`${record.etichetta}: reasoning cannot be turned off on this model; sent the documented minimum budget (128).`);
    } else if (nome === 'gemini-flash-latest' || (maggiore && Number(maggiore[1]) >= 3)) {
      risultato.reasoning_effort = 'low';
      note.push(`${record.etichetta}: reasoning cannot be turned off on this model; sent "low", the lowest level it documents.`);
      /* revisione V-1 (21/10/2026): Vertex accetta UNO solo fra `reasoning_effort` e `thinking_config` («only one … may be specified»,
         pagina OpenAI-compatibile): quello del chiamante si toglie, e lo si dice; il resto di `extra_body` resta suo. */
      const extra = oggetto(risultato.extra_body) ? risultato.extra_body : null;
      if (extra && oggetto(extra.google) && extra.google.thinking_config !== undefined) {
        const { thinking_config: _tolto, ...google } = extra.google;
        risultato.extra_body = { ...extra, google };
        note.push(`${record.etichetta}: your thinking_config was removed: only one reasoning control can be sent.`);
      }
    } else {
      note.push(`${record.etichetta}: turning reasoning off is not documented for this model; nothing is sent.`);
    }
  }
  if (Array.isArray(livelli) && typeof risultato.reasoning_effort === 'string') {
    const chiesto = risultato.reasoning_effort;
    const scelto = chiesto === 'none' ? livelloRagionamentoMinimo(livelli) : livelloRagionamentoPiuVicino(chiesto, livelli);
    if (scelto == null) { delete risultato.reasoning_effort; note.push(`${record.etichetta}: the level "${chiesto}" is not documented; not sent.`); }
    else if (scelto !== chiesto) {
      risultato.reasoning_effort = scelto;
      if (chiesto === 'none' || aliasGrafiaRagionamento(chiesto, livelli) == null) note.push(`${record.etichetta}: the level "${chiesto}" is not documented; sent "${scelto}", the nearest.`);
    }
  }
  /* Revisione V-2 (21/10/2026): la regola di V-1 vale per OGNI livello, non solo per «Spento». Vertex accetta UNO solo fra
     `reasoning_effort` e il `thinking_config` del chiamante («only one … may be specified»): se parte un livello, quello del chiamante
     si toglie e lo si dice; il resto di `extra_body` resta suo. */
  if (Array.isArray(livelli) && typeof risultato.reasoning_effort === 'string' && oggetto(risultato.extra_body)
    && oggetto(risultato.extra_body.google) && risultato.extra_body.google.thinking_config !== undefined) {
    const { thinking_config: _tolto, ...google } = risultato.extra_body.google;
    risultato.extra_body = { ...risultato.extra_body, google };
    note.push(`${record.etichetta}: your thinking_config was removed: only one reasoning control can be sent.`);
  }
  /* 21/10/2026 (Azure): il limite d'uscita che la connessione dichiara */
  if (record.cloud?.limiteUscita === 'max_completion_tokens' && Object.hasOwn(risultato, 'max_tokens')) {
    if (risultato.max_tokens != null && risultato.max_completion_tokens != null && risultato.max_completion_tokens !== risultato.max_tokens) {
      fail(`${record.etichetta}: two different output limits were given.`);
    }
    risultato.max_completion_tokens = risultato.max_completion_tokens ?? risultato.max_tokens;
    delete risultato.max_tokens;
  }
  return { corpo: risultato, avvisi, note };
}
// P-K — fine

/** Owner 21/10/2026 (Qwen): `parallel_tool_calls: true` solo se il profilo lo ACCENDE e la richiesta porta attrezzi; spento di serie.
 *  Una scelta del chiamante resta sua. Esportata per provare anche il verso acceso, che il registro di serie non ha. */
export function conChiamateParallele(profilo, corpo) {
  if (profilo?.chiamateParallele?.attiva !== true || !Array.isArray(corpo?.tools) || corpo.tools.length === 0
    || Object.hasOwn(corpo, 'parallel_tool_calls')) return corpo;
  return { ...corpo, parallel_tool_calls: true };
}

/** P-G, 12/09/2026: sole differenze documentate nel record, senza confronti sui fornitori. */
function preparaProfiloCompatibile(record, corpo) {
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!oggetto(corpo) || typeof corpo.model !== 'string' || !corpo.model.trim()) fail(`${record.etichetta} request is not valid.`);
  const profilo = record.richiestaCompatibile;
  const id = corpo.model.startsWith(`${record.id}:`) ? corpo.model.slice(record.id.length + 1) : corpo.model;
  /* revisione K1 (21/10/2026): l'id si confronta senza badare alle maiuscole (`minimax-m3.1-flash` è lo stesso modello) */
  const idProfilo = Object.hasOwn(profilo.modelli, id) ? id : Object.keys(profilo.modelli).find(k => k.toLowerCase() === id.toLowerCase());
  const modello = idProfilo ? profilo.modelli[idProfilo] : null;
  if (['thinking', 'enable_thinking'].includes(profilo.ragionamento)) {
    /* revisione K1: un id che il profilo non elenca (kimi-latest, MiniMax-M2.1) prima partiva senza NESSUNA cura. Del fornitore valgono
       comunque il limite d'uscita e i parametri fissi; l'involucro di OpenRouter (`reasoning`) il fornitore non lo documenta: si toglie e
       si dice, e un `reasoning_effort` a radice scelto dal chiamante resta com'è. */
    const esito = modello ? preparaControlloThinking(record, modello, corpo)
      : (() => {
        const { reasoning, ...resto } = corpo;
        return { corpo: resto, avvisi: [], note: reasoning !== undefined ? [`${record.etichetta}: reasoning options are not documented for this model; not sent.`] : [] };
      })();
    /* 21/10/2026 (MiniMax): i parametri fissi del profilo, dichiarati con la loro fonte, partono sempre. Revisione M1: se il chiamante ne
       aveva scelto un altro valore, lo si dice */
    for (const [k, v] of Object.entries(profilo.parametriFissi ?? {})) {
      if (Object.hasOwn(esito.corpo, k) && esito.corpo[k] !== v) esito.note.push(`${record.etichetta}: "${k}" is always ${JSON.stringify(v)} for this provider; the requested value is not sent.`);
      esito.corpo[k] = v;
    }
    /* 21/10/2026 (Kimi): il limite d'uscita del profilo vale anche su questo ramo, che prima tornava prima di arrivarci */
    if (profilo.limiteUscita === 'max_completion_tokens' && Object.hasOwn(esito.corpo, 'max_tokens')) {
      if (esito.corpo.max_tokens != null && esito.corpo.max_completion_tokens != null && esito.corpo.max_completion_tokens !== esito.corpo.max_tokens) {
        fail(`${record.etichetta}: two different output limits were given.`);
      }
      esito.corpo.max_completion_tokens = esito.corpo.max_completion_tokens ?? esito.corpo.max_tokens;
      delete esito.corpo.max_tokens;
    }
    esito.corpo = conChiamateParallele(profilo, esito.corpo);
    /* solo a pensiero acceso, come Hermes (`_needs_kimi_tool_reasoning`): con `thinking: disabled` il campo non serve */
    if (profilo.rimandaRagionamento === true && esito.corpo.thinking?.type !== 'disabled' && Array.isArray(esito.corpo.messages)) esito.corpo.messages = conRagionamentoRimandato(esito.corpo.messages);
    return esito;
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
  /* P1 Mistral, 21/10/2026: un profilo che dichiara `soloModelliElencati` manda lo sforzo solo ai modelli che elenca (gli altri rifiutano il
     campo); per ogni altro profilo vale la regola qui sotto. */
  if (profilo.soloModelliElencati === true && !modello && risultato.reasoning_effort != null) {
    delete risultato.reasoning_effort;
    note.push(`${record.etichetta}: reasoning effort is not documented for this model; not sent.`);
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
    const tipi = qwen ? ['enabled', 'disabled'] : modello.thinking.attivo === null && modello.livelliRagionamento.length
      ? ['enabled', 'adaptive', 'disabled'] // revisione K2: kimi-k3/M3.1-Flash non hanno l'interruttore, lo si toglie (sotto) e si dice
      : [modello.thinking.attivo ?? 'adaptive', 'disabled'];
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
  const soloLivelli = modello.livelliRagionamento.length > 0 && modello.thinking.attivo === null;
  if (soloLivelli) {
    /* kimi-k3 (21/10/2026): ragiona sempre, la leva è `reasoning_effort` fra i livelli dichiarati; «Spento» non esiste ⇒ il MINIMO
       (BUG-18 gen.2: lasciare il campo a casa darebbe il predefinito del fornitore, `max`, il più caro); il resto come altrove,
       prima il più debole (BUG-18). Mai `thinking` accanto: Moonshot rifiuta i due insieme (Hermes `kimi-coding/__init__.py:52-56`). */
    const vuoleSpento = effort === 'none' || reasoning?.enabled === false || thinking?.type === 'disabled';
    const scelto = vuoleSpento ? livelloRagionamentoMinimo(modello.livelliRagionamento)
      : effort !== undefined ? livelloRagionamentoPiuVicino(effort, modello.livelliRagionamento) : null;
    delete risultato.reasoning; delete risultato.reasoning_effort; delete risultato.thinking; delete risultato.enable_thinking;
    if (scelto != null) risultato.reasoning_effort = scelto;
    if (thinking !== undefined && !vuoleSpento) note.push(`${record.etichetta}: this model has no reasoning switch; only the level is sent.`);
    if (vuoleSpento) note.push(`${record.etichetta}: this model cannot disable reasoning; sent "${scelto}", the lowest documented level (the provider default costs more).`);
    else if (scelto != null && scelto !== effort && aliasGrafiaRagionamento(effort, modello.livelliRagionamento) == null) {
      note.push(`${record.etichetta}: the level "${effort}" is not documented for this model; sent "${scelto}", the nearest.`);
    }
    if (modello.temperaturaServer && Object.hasOwn(risultato, 'temperature')) {
      delete risultato.temperature;
      aggiungiAvviso(avvisi, frasiAvvisi, { testo: `${record.etichetta}: temperature is managed by the model; the requested value is not sent.`, testoChiave: 'server.compatibleNotice.temperatureIgnored', testoParams: { provider: record.etichetta } });
    }
    return { corpo: risultato, avvisi, note, ...(frasiAvvisi.length ? { frasiAvvisi } : {}) };
  }
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
  /* 21/10/2026, owner «la stessa scelta di Z.AI»: col pensiero acceso Qwen rilegge il ragionamento dei giri passati, solo sui modelli che
     Alibaba elenca (alibabacloud.com/help/en/model-studio/deep-thinking, aggiornata il 19/10/2026: «This Parameter only supports …»);
     senza `reasoning_content` nella storia non dà errore. Costa token d'ingresso, e si dichiara. Una scelta del chiamante resta sua. */
  const conservaQwen = record.richiestaCompatibile.conservaRagionamento;
  if (qwen && thinkingEffettivo && conservaQwen?.forma === 'preserve_thinking' && conservaQwen.modelli.includes(String(corpo.model).replace(/^[^:/]+:/u, ''))
    && risultato.preserve_thinking === undefined) risultato.preserve_thinking = true;
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
