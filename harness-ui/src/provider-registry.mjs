/**
 * provider-registry.mjs — UN record per fornitore, e tutto il resto si deriva da qui.
 *
 * ## Perché esiste
 *
 * Inventario del 12/09/2026 (`.claude/INVENTARIO-PROVIDER-2026-09-12.md`, §3b): non c'era un
 * record di fornitore. C'era lo stesso insieme di sette nomi **riscritto tredici volte**, in
 * tredici forme diverse — array, oggetti congelati, una stringa dentro una regex, due regex di
 * rotta HTTP duplicate, un `<select>` di `<option>` scritte a mano — e **nessun test** teneva
 * insieme le tredici. Due bugie erano già lì, visibili a chiunque aprisse due file invece di uno:
 *
 *  1. `lmstudio` era **scoperto, sondato, caricabile e scaricabile** in
 *     `openai-compatible-runtime.mjs`, con capacità OSSERVATE che Ollama non dà — e non era in
 *     `FONTI_MODELLO`: non si poteva scegliere in chat. Il lavoro era fatto al 90% e non arrivava
 *     all'utente.
 *  2. `deepseek` dichiarava `execution: 'in preparazione'` nel portachiavi mentre
 *     `model-destination.mjs` lo instradava **da sempre**. Due elenchi, due verità.
 *
 * ⛔ È la stessa forma della lezione del 02/09 (`viewport-desktop-non-solo-tablet`: «c'erano NOVE
 *    copie sparse, due le ha trovate il test»). La cura è identica: la verità sta in UN posto, e
 *    un **cancello di parità** (`tests/provider-registry-parita.test.mjs`) fallisce se un elenco
 *    derivato diverge. Senza quel cancello la grammatica unica ridiventa tredici elenchi al primo
 *    fornitore aggiunto di fretta — è esattamente ciò che Hermes dichiara di aver già vissuto
 *    (`hermes_cli/provider_catalog.py:35`: «ogni provider aggiunto dopo che quelle liste sono
 *    state scritte spariva in silenzio dalla GUI»).
 *
 * ## La forma, e da dove viene
 *
 * Lo schema è quello proposto nel §6a dell'inventario, che a sua volta ricalca il `ProviderProfile`
 * di Hermes v0.21 (`providers/base.py:38-100`, letto nel codice clonato a commit fissato). Le
 * differenze sono deliberate e dette:
 *
 *  · **niente hook eseguibili** — qui è dato, non codice: un record che porta funzioni torna a
 *    essere codice sparso con un altro nome. Le uniche funzioni ammesse sono `conta` della sonda
 *    (una proiezione pura sul corpo della risposta) e i lettori della cache, che sono PERCORSI
 *    dichiarati, non logica;
 *  · **tre stati per le capacità**, mai un booleano solo: `osservato` (l'abbiamo misurato),
 *    `dichiarato` (lo dice la documentazione del fornitore), `ignoto`. È la lezione
 *    «`ok:false` su un elenco vero fa INVENTARE — gli stati sono TRE»;
 *  · **come si legge la cache** è una colonna del record, non un `??` sparso: vedi `usage-cache.mjs`.
 *
 * ## Ricerca fatta PRIMA di scrivere (12/09/2026)
 *
 *  · DeepSeek — `https://api-docs.deepseek.com/api/create-chat-completion`: «prompt_tokens … It
 *    equals prompt_cache_hit_tokens + prompt_cache_miss_tokens», e `prompt_tokens_details.cached_tokens`
 *    ESISTE nella stessa risposta. ⇒ la forma DeepSeek è **alternativa**, non additiva: sommarla ai
 *    `prompt_tokens` conterebbe due volte.
 *  · DeepSeek — `https://api-docs.deepseek.com/guides/kv_cache`: definizione dei due campi.
 *  · Kimi/Moonshot — `https://platform.kimi.ai/docs/api/chat`: `cached_tokens` — «Number of tokens
 *    served from cache» — al PRIMO livello di `usage`, non dentro `prompt_tokens_details`.
 *  · OpenRouter — `https://openrouter.ai/docs/features/prompt-caching`: `usage.prompt_tokens_details.
 *    cached_tokens` e `cache_write_tokens`; **`cache_discount` sta al livello del corpo della
 *    risposta** ed è un risparmio in DENARO, non un conteggio di token («Some providers, like
 *    Anthropic, will have a negative discount on cache writes»).
 *  · LM Studio — `https://lmstudio.ai/docs/app/api/endpoints/openai`: `/v1/models`, `/v1/responses`,
 *    `/v1/chat/completions`, `/v1/embeddings`, `/v1/completions` su `http://localhost:1234/v1`,
 *    nessuna chiave richiesta negli esempi.
 *  · LM Studio — `https://lmstudio.ai/docs/app/api/endpoints/rest`: l'API nativa `/api/v1/models`,
 *    `/api/v1/models/load`, `/api/v1/models/unload` (v0.4.0), con «authentication configuration
 *    with API tokens» ⇒ la chiave esiste ma è **facoltativa**.
 *
 * ⛔ Nessuna chiamata vera a un fornitore è stata fatta per scrivere questo file: sono documenti.
 */

/** I trasporti che sappiamo parlare. ⛔ Un `wire` fuori da qui è un errore, non un ripiego. */
export const WIRE = Object.freeze([
  'openai-chat',          // POST {base}{percorso} con Bearer, corpo OpenAI chat/completions
  'openai-responses',     // POST {base}/responses — oggi via SDK fissato nel lock
  'anthropic-messages',   // POST {base}/messages — oggi via SDK fissato nel lock
  'gemini',               // :generateContent — oggi via SDK fissato nel lock
  'locale',               // il supervisore llama-server: la chiave vive solo lì dentro
]);

/** Gli schemi di autenticazione riconosciuti. */
export const AUTH = Object.freeze(['bearer', 'header', 'query', 'oauth-pkce', 'keyless', 'effimera']);

/** I tre stati di una capacità. ⛔ Mai un booleano: «non dichiarato» non è «no». */
export const STATI_CAPACITA = Object.freeze(['osservato', 'dichiarato', 'ignoto']);

const congela = (valore) => Object.freeze(valore);

/**
 * ⛔ IL REGISTRO. Una riga per fornitore, e nient'altro al mondo che nomini un fornitore.
 *
 * L'ordine di dichiarazione è quello con cui i derivati si presentano: cambiarlo cambia l'ordine
 * nel pannello Provider e nel prefisso ammesso dalla regex del modello, quindi si cambia apposta.
 */
export const REGISTRO_FORNITORI = congela({
  // ── OpenAI — wire Responses, non chat/completions ──────────────────────────────────────────
  openai: congela({
    id: 'openai',
    // P-F, fonti e strumenti verificati il 12/09/2026; parità con models.dev nel test.
    modelliDiRiserva: congela([
      // 12/09/2026 — https://developers.openai.com/api/docs/models/gpt-5-nano
      congela({ id: 'gpt-5-nano', nome: 'GPT-5 Nano', toolCalling: true,
        fonte: 'https://developers.openai.com/api/docs/models/gpt-5-nano', data: '2026-09-12' }),
      // 12/09/2026 — https://developers.openai.com/api/docs/models/gpt-5-mini
      congela({ id: 'gpt-5-mini', nome: 'GPT-5 Mini', toolCalling: true,
        fonte: 'https://developers.openai.com/api/docs/models/gpt-5-mini', data: '2026-09-12' }),
    ]),
    // 12/09/2026 — Nano: 0,05/0,40 USD per milione ingresso/uscita; fonte prezzi nelle schede ufficiali.
    modelloAusiliario: 'gpt-5-nano',
    modelsDevId: 'openai',
    etichetta: 'OpenAI',
    descrizione: 'API diretta OpenAI, sul wire Responses.',
    paginaChiavi: 'https://platform.openai.com/api-keys',
    wire: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['OPENAI_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/responses', modelli: '/models' }),
    streaming: 'osservato',
    toolCalling: 'osservato',
    cache: congela({
      marcatore: null,               // automatica lato fornitore
      letturaUsage: congela(['input_tokens_details.cached_tokens', 'prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela(['input_tokens_details.cache_write_tokens', 'input_tokens_details.cache_creation_tokens']),
      inclusiNelTotale: true,
      scontoDichiarato: null,
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'nessuna' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null, conta: (c) => c?.data?.length }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // ── DeepSeek — la cache che già paghiamo (vedi usage-cache.mjs) ─────────────────────────────
  deepseek: congela({
    id: 'deepseek',
    // P-F, fonti e strumenti verificati il 12/09/2026; parità con models.dev nel test.
    modelliDiRiserva: congela([
      // 12/09/2026 — https://api-docs.deepseek.com/quick_start/pricing/
      congela({ id: 'deepseek-flash', nome: 'DeepSeek V4.1 Flash', toolCalling: true,
        fonte: 'https://api-docs.deepseek.com/quick_start/pricing/', data: '2026-09-12' }),
      // 12/09/2026 — https://api-docs.deepseek.com/quick_start/pricing/
      congela({ id: 'deepseek-v4-pro', nome: 'DeepSeek V4 Pro', toolCalling: true,
        fonte: 'https://api-docs.deepseek.com/quick_start/pricing/', data: '2026-09-12' }),
    ]),
    // 12/09/2026 — Flash costa meno di Pro sia al picco sia fuori picco; fonte nella tabella ufficiale.
    modelloAusiliario: 'deepseek-flash',
    modelsDevId: 'deepseek',
    etichetta: 'DeepSeek',
    descrizione: 'API diretta DeepSeek, wire OpenAI.',
    paginaChiavi: 'https://platform.deepseek.com/api_keys',
    wire: 'openai-chat',
    /*
     * ⛔ Senza `/v1`, e la concatenazione aggiunge `/chat/completions`. È il valore che il
     *   portachiavi ha SEMPRE avuto: cambiarlo qui cambierebbe l'indirizzo di chi ha già salvato.
     *   ❓ NON verificato dal vivo quale delle due forme risponda (§7.7 dell'inventario): questo
     *   record non scioglie quel dubbio, lo lascia dov'era e lo dichiara.
     */
    baseUrl: 'https://api.deepseek.com',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['DEEPSEEK_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null,               // automatica: nessun marcatore da mandare
      /*
       * ⛔ L'ORDINE È IL CONTRATTO. `prompt_tokens_details.cached_tokens` c'è ed è il nome
       *   canonico; `prompt_cache_hit_tokens` è la forma NATIVA di DeepSeek. Si legge il primo che
       *   risponde, MAI la somma: 🌐 «prompt_tokens … equals prompt_cache_hit_tokens +
       *   prompt_cache_miss_tokens» — sommarli conterebbe due volte lo stesso token.
       */
      letturaUsage: congela(['prompt_tokens_details.cached_tokens', 'prompt_cache_hit_tokens']),
      scritturaUsage: congela([]),
      inclusiNelTotale: true,
      scontoDichiarato: null,
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'nessuna' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null, conta: (c) => c?.data?.length }),
    destinazioneChat: true,
    credenziale: true,
    /*
     * ⛔ 12/09 — ERA `in preparazione`, E IL ROUTER LO INSTRADAVA DA SEMPRE.
     *   Lo stato lo calcola il record, non una stringa scritta a mano in un secondo elenco: se è
     *   una `destinazioneChat` con un `wire` che sappiamo parlare, allora è collegato. La sonda
     *   dice se la CHIAVE funziona — che è un'altra domanda, e ha già il suo posto.
     */
    esecuzione: 'collegato',
  }),

  // P-I, 12/09/2026 — API internazionali dirette. Dossier e impronta models.dev nel rapporto P-I.
  kimi: congela({
    id: 'kimi', etichetta: 'Kimi',
    descrizione: 'Modelli Kimi, collegamento diretto internazionale.',
    paginaChiavi: 'https://platform.moonshot.ai/console/api-keys',
    modelliDiRiserva: congela([
      congela({ id: 'kimi-k2.6', nome: 'Kimi K2.6', toolCalling: true,
        fonte: 'https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart', data: '2026-09-12' }),
      congela({ id: 'kimi-k2.7-code', nome: 'Kimi K2.7 Code', toolCalling: true,
        fonte: 'https://platform.kimi.ai/docs/api/models-overview', data: '2026-09-12' }),
    ]),
    modelloAusiliario: 'kimi-k2.6', modelsDevId: 'moonshotai',
    wire: 'openai-chat', baseUrl: 'https://api.moonshot.ai/v1',
    // Cina: https://api.moonshot.cn/v1; nessun secondo record o cambio implicito di regione.
    indirizzoModificabile: true, envIndirizzo: congela(['MOONSHOT_BASE_URL']),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['MOONSHOT_API_KEY', 'KIMI_API_KEY']) }),
    chiaveObbligatoria: true, formaIdModello: 'nome', oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato', toolCalling: 'dichiarato',
    cache: congela({ marcatore: null, letturaUsage: congela(['cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata nella risposta; senza conteggio: non misurato.',
      fonte: 'https://platform.kimi.ai/docs/api/chat', data: '2026-09-12' }),
    richiestaCompatibile: congela({ limiteUscita: null, ragionamento: 'thinking',
      modelli: congela({
        'kimi-k2.6': congela({ livelliRagionamento: congela([]), temperaturaServer: true, sceltaObbligata: false, sceltaForzataConThinking: false,
          thinking: congela({ attivo: 'enabled', disattivabile: true, predefinito: true }) }),
        'kimi-k2.7-code': congela({ livelliRagionamento: congela([]), temperaturaServer: true, sceltaObbligata: false, sceltaForzataConThinking: false,
          thinking: congela({ attivo: 'enabled', disattivabile: false, predefinito: true, conserva: 'all' }) }),
      }), fonte: 'https://platform.kimi.ai/docs/api/models-overview', data: '2026-09-12' }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: c => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true, credenziale: true, esecuzione: 'collegato',
  }),

  minimax: congela({
    id: 'minimax', etichetta: 'MiniMax',
    descrizione: 'Modelli MiniMax, collegamento diretto internazionale.',
    paginaChiavi: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    modelliDiRiserva: congela([
      congela({ id: 'MiniMax-M3', nome: 'MiniMax M3', toolCalling: true,
        fonte: 'https://platform.minimax.io/docs/api-reference/text-openai-api', data: '2026-09-12' }),
      congela({ id: 'MiniMax-M2.5', nome: 'MiniMax M2.5', toolCalling: true,
        fonte: 'https://platform.minimax.io/docs/api-reference/text-openai-api', data: '2026-09-12' }),
    ]),
    // Minimo ingresso/uscita condiviso con M3; M2.5 ha un prezzo di lettura cache inferiore.
    modelloAusiliario: 'MiniMax-M2.5', modelsDevId: 'minimax',
    // Anthropic raccomandato upstream; OpenAI è un percorso ufficialmente supportato.
    wire: 'openai-chat', baseUrl: 'https://api.minimax.io/v1',
    indirizzoModificabile: true, envIndirizzo: congela(['MINIMAX_BASE_URL']),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['MINIMAX_API_KEY']) }),
    chiaveObbligatoria: true, formaIdModello: 'nome', oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato', toolCalling: 'dichiarato',
    cache: congela({ marcatore: null, letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata nella risposta; senza conteggio: non misurato.',
      fonte: 'https://platform.minimax.io/docs/api-reference/text-prompt-caching', data: '2026-09-12' }),
    richiestaCompatibile: congela({ limiteUscita: null, ragionamento: 'thinking',
      modelli: congela({
        'MiniMax-M3': congela({ livelliRagionamento: congela([]),
          thinking: congela({ attivo: 'adaptive', disattivabile: true, predefinito: true }) }),
        'MiniMax-M2.7': congela({ livelliRagionamento: congela([]),
          thinking: congela({ attivo: null, disattivabile: false, predefinito: true }) }),
        'MiniMax-M2.5': congela({ livelliRagionamento: congela([]),
          thinking: congela({ attivo: null, disattivabile: false, predefinito: true }) }),
      }), fonte: 'https://platform.minimax.io/docs/api-reference/text-openai-api', data: '2026-09-12' }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: c => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true, credenziale: true, esecuzione: 'collegato',
  }),

  qwen: congela({
    id: 'qwen', etichetta: 'Qwen',
    descrizione: 'Modelli Qwen, collegamento diretto internazionale.',
    paginaChiavi: 'https://modelstudio.console.alibabacloud.com/',
    modelliDiRiserva: congela([
      congela({ id: 'qwen-flash', nome: 'Qwen Flash', toolCalling: true,
        fonte: 'https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling', data: '2026-09-12' }),
      congela({ id: 'qwen3.8-flash', nome: 'Qwen 3.8 Flash', toolCalling: true,
        fonte: 'https://www.alibabacloud.com/help/en/model-studio/qwen3-8-flash', data: '2026-09-12' }),
    ]),
    // Turbo escluso: discordanza sul supporto agli strumenti tra scheda ufficiale e catalogo.
    modelloAusiliario: 'qwen-flash', modelsDevId: 'alibaba',
    wire: 'openai-chat', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    // Cina: https://dashscope.aliyuncs.com/compatible-mode/v1; anche i domini workspace sono modificabili.
    indirizzoModificabile: true, envIndirizzo: congela(['DASHSCOPE_BASE_URL']),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['DASHSCOPE_API_KEY']) }),
    chiaveObbligatoria: true, formaIdModello: 'nome', oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/api/v1/models' }),
    streaming: 'dichiarato', toolCalling: 'dichiarato',
    cache: congela({ marcatore: 'cache_control', letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela(['prompt_tokens_details.cache_creation_input_tokens']), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata nella risposta; senza conteggio: non misurato.',
      fonte: 'https://www.alibabacloud.com/help/en/model-studio/context-cache', data: '2026-09-12' }),
    richiestaCompatibile: congela({ limiteUscita: null, ragionamento: 'enable_thinking',
      modelli: congela({
        'qwen-flash': congela({ livelliRagionamento: congela([]), sceltaForzataConThinking: false,
          thinking: congela({ attivo: true, disattivabile: true, predefinito: false }) }),
        'qwen3.8-flash': congela({ livelliRagionamento: congela([]), sceltaForzataConThinking: false,
          thinking: congela({ attivo: true, disattivabile: true, predefinito: true }) }),
        'qwen3-32b': congela({ livelliRagionamento: congela([]), sceltaForzataConThinking: false,
          thinking: congela({ attivo: true, disattivabile: true, predefinito: true, soloStreaming: true }) }),
      }), fonte: 'https://www.alibabacloud.com/help/en/model-studio/deep-thinking', data: '2026-09-12' }),
    catalogo: congela({ fonte: 'fornitore', forma: 'dashscope-output', percorso: '/api/v1/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    // Il catalogo nativo è relativo all'origine, non alla base del wire OpenAI.
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/api/v1/models', dallaRadice: true, urlAssoluto: null,
      conta: c => c?.output?.models?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true, credenziale: true, esecuzione: 'collegato',
  }),

  // P-D — API diretta, contratto v4. Fonti ufficiali e snapshot: 12/09/2026.
  // docs.z.ai/api-reference/llm/chat-completion e guides/overview/pricing.
  zai: congela({
    id: 'zai',
    // P-F, fonti e strumenti verificati il 12/09/2026; parità con models.dev nel test.
    modelliDiRiserva: congela([
      // 12/09/2026 — https://docs.z.ai/guides/llm/glm-4.7
      congela({ id: 'glm-4.7-flash', nome: 'GLM 4.7 Flash', toolCalling: true,
        fonte: 'https://docs.z.ai/guides/llm/glm-4.7', data: '2026-09-12' }),
      // 12/09/2026 — https://docs.z.ai/guides/llm/glm-4.7
      congela({ id: 'glm-4.7', nome: 'GLM 4.7', toolCalling: true,
        fonte: 'https://docs.z.ai/guides/llm/glm-4.7', data: '2026-09-12' }),
    ]),
    // 12/09/2026 — Flash: minimo gratuito a pari merito; https://docs.z.ai/guides/overview/pricing.
    modelloAusiliario: 'glm-4.7-flash',
    modelsDevId: 'zai',
    etichetta: 'Z.AI',
    descrizione: 'Modelli GLM tramite API diretta Z.AI.',
    paginaChiavi: 'https://z.ai/manage-apikey/apikey-list',
    wire: 'openai-chat',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['GLM_API_KEY', 'ZAI_API_KEY', 'Z_AI_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    profili: congela({
      'openai-chat': congela({ stato: 'dichiarato', versione: 'v4' }),
      'anthropic-messages': congela({ stato: 'in preparazione', baseUrl: 'https://api.z.ai/api/anthropic', lotto: 'P-J' }),
    }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null,
      letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]),
      inclusiNelTotale: true,
      scontoDichiarato: null,
      etichetta: 'Cache automatica; senza conteggio: non misurato.',
      fonte: 'https://docs.z.ai/guides/capabilities/cache',
      data: '2026-09-12',
    }),
    // GET /models non è documentato nell'indice ufficiale: il 404 resta esplicito.
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true, ripiegoSu404: 'documentazione' }),
    prezzi: congela({ fonte: 'https://docs.z.ai/guides/overview/pricing', data: '2026-09-12', valuta: 'USD', unita: 'milione di token', archiviazioneCache: 'Gratuita temporaneamente; durata non dichiarata.' }),
    // Vincolo esplicito P-D. La fonte oggi ammette anche low su 5.3/Flash:
    // non lo inviamo, e il traduttore dichiara che è una scelta del profilo AVM.
    ragionamento: congela({ formato: 'thinking', livelli: congela(['high', 'max']), fonte: 'https://docs.z.ai/api-reference/llm/chat-completion', data: '2026-09-12' }),
    modelliNoti: congela([
      congela({ id: 'glm-5.3-flash', nome: 'GLM-5.3-Flash', contextLength: 1_000_000, contestoDichiarato: '1M', maxOutputTokens: 131_072,
        fonte: 'https://docs.z.ai/guides/vlm/glm-5.3-flash', data: '2026-09-12',
        prezzi: congela({ ingresso: 0.15, cache: 0.03, uscita: 0.50 }),
        ragionamento: congela({ livelli: congela(['high', 'max']), thinking: congela(['enabled']) }) }),
      congela({ id: 'glm-5.3', nome: 'GLM-5.3', contextLength: 1_000_000, contestoDichiarato: '1M', maxOutputTokens: 131_072,
        fonte: 'https://docs.z.ai/guides/llm/glm-5.3', data: '2026-09-12',
        prezzi: congela({ ingresso: 1.40, cache: 0.26, uscita: 4.40 }),
        ragionamento: congela({ livelli: congela(['high', 'max']), thinking: congela(['enabled']) }) }),
      congela({ id: 'glm-5.2', nome: 'GLM-5.2', contextLength: 1_000_000, contestoDichiarato: '1M', maxOutputTokens: 131_072,
        fonte: 'https://docs.z.ai/guides/llm/glm-5.2', data: '2026-09-12',
        prezzi: congela({ ingresso: 1.40, cache: 0.26, uscita: 4.40 }),
        ragionamento: congela({ livelli: congela(['high', 'max']), thinking: congela(['enabled', 'disabled']) }) }),
      congela({ id: 'glm-5', nome: 'GLM-5', contextLength: 200_000, contestoDichiarato: '200K', maxOutputTokens: 131_072,
        fonte: 'https://docs.z.ai/guides/llm/glm-5', data: '2026-09-12',
        prezzi: congela({ ingresso: 1, cache: 0.20, uscita: 3.20 }),
        ragionamento: congela({ livelli: congela([]), thinking: congela(['enabled', 'disabled']) }) }),
      congela({ id: 'glm-4.6', nome: 'GLM-4.6', contextLength: 200_000, contestoDichiarato: '200K', maxOutputTokens: 131_072,
        fonte: 'https://docs.z.ai/guides/llm/glm-4.6', data: '2026-09-12',
        prezzi: congela({ ingresso: 0.60, cache: 0.11, uscita: 2.20 }),
        ragionamento: congela({ livelli: congela([]), thinking: congela(['enabled', 'disabled']) }) }),
    ]),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true, frequenza: null, fonte: 'https://docs.z.ai/api-reference/rate-limit' }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null, conta: (c) => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // ── Anthropic ──────────────────────────────────────────────────────────────────────────────
  anthropic: congela({
    id: 'anthropic',
    // P-F, fonti e strumenti verificati il 12/09/2026; parità con models.dev nel test.
    modelliDiRiserva: congela([
      // 12/09/2026 — https://platform.claude.com/docs/en/models/overview
      congela({ id: 'claude-haiku-4-5-20251001', nome: 'Claude Haiku 4.5', toolCalling: true,
        fonte: 'https://platform.claude.com/docs/en/models/overview', data: '2026-09-12' }),
      // 12/09/2026 — https://platform.claude.com/docs/en/models/overview
      congela({ id: 'claude-sonnet-5', nome: 'Claude Sonnet 5', toolCalling: true,
        fonte: 'https://platform.claude.com/docs/en/models/overview', data: '2026-09-12' }),
    ]),
    // 12/09/2026 — Haiku: 1/5 USD per milione ingresso/uscita, minimo tra i modelli correnti della fonte.
    modelloAusiliario: 'claude-haiku-4-5-20251001',
    modelsDevId: 'anthropic',
    etichetta: 'Anthropic',
    descrizione: 'API diretta Anthropic, wire Messages.',
    paginaChiavi: 'https://console.anthropic.com/settings/keys',
    wire: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com/v1',
    indirizzoModificabile: false,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'header', header: 'x-api-key', nomeVariabile: congela(['ANTHROPIC_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/messages', modelli: '/models' }),
    streaming: 'osservato',
    toolCalling: 'osservato',
    cache: congela({
      marcatore: 'cache_control',
      letturaUsage: congela(['cache_read_input_tokens', 'prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela(['cache_creation_input_tokens']),
      /*
       * ⛔⛔ QUI IL TOTALE **NON** LI INCLUDE — è l'opposto del wire OpenAI.
       *   🌐 platform.claude.com/docs/…/prompt-caching: `total_input = cache_read +
       *   cache_creation + input`. Chi somma con la formula sbagliata sbaglia del doppio, e
       *   questo campo esiste per non far dipendere quel conto dalla memoria di chi legge.
       */
      inclusiNelTotale: false,
      scontoDichiarato: null,
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'nessuna' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'x-api-key', percorso: '/models', urlAssoluto: null, conta: (c) => c?.data?.length }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // ── Gemini ─────────────────────────────────────────────────────────────────────────────────
  gemini: congela({
    id: 'gemini',
    // P-F, fonti e strumenti verificati il 12/09/2026; parità con models.dev nel test.
    modelliDiRiserva: congela([
      // 12/09/2026 — https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
      congela({ id: 'gemini-2.5-flash-lite', nome: 'Gemini 2.5 Flash-Lite', toolCalling: true,
        fonte: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite', data: '2026-09-12' }),
      // 12/09/2026 — https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
      congela({ id: 'gemini-3.1-flash-lite', nome: 'Gemini 3.1 Flash-Lite', toolCalling: true,
        fonte: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite', data: '2026-09-12' }),
    ]),
    // 12/09/2026 — 2.5: 0,10/0,40 USD per milione sul piano standard; https://ai.google.dev/gemini-api/docs/pricing.
    modelloAusiliario: 'gemini-2.5-flash-lite',
    modelsDevId: 'google',
    etichetta: 'Google Gemini',
    descrizione: 'API diretta Google AI Studio.',
    paginaChiavi: 'https://aistudio.google.com/app/apikey',
    wire: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    indirizzoModificabile: false,
    envIndirizzo: congela([]),
    /* ⛔ Due schemi per lo stesso fornitore: la sonda usa `?key=`, il catalogo `x-goog-api-key`. */
    auth: congela({ tipo: 'query', header: 'x-goog-api-key', nomeVariabile: congela(['GEMINI_API_KEY', 'GOOGLE_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: ':generateContent', modelli: '/models' }),
    streaming: 'osservato',
    toolCalling: 'osservato',
    cache: congela({
      marcatore: null,
      /*
       * ⛔ DUE NOMI PER LO STESSO NUMERO, a due livelli diversi: `usageMetadata.cachedContentTokenCount`
       *   sul REST, `total_cached_tokens` negli SDK. Chi ne legge uno solo trova 0. Noi passiamo
       *   dall'AI SDK, che appiattisce in `inputTokenDetails.cacheReadTokens`; gli altri due
       *   restano qui come ripiego, perché costano niente e coprono il giorno in cui il percorso cambia.
       *   ❓ NON verificato che l'adattatore fissato nel lock mappi davvero quel campo (§7.8).
       */
      letturaUsage: congela(['prompt_tokens_details.cached_tokens', 'usageMetadata.cachedContentTokenCount', 'total_cached_tokens']),
      scritturaUsage: congela([]),
      inclusiNelTotale: true,
      scontoDichiarato: null,
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'gemini-models', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'nessuna' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'query', percorso: '/models', urlAssoluto: null, conta: (c) => c?.models?.length }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // ── OpenRouter — l'aggregatore, e l'unico che oggi porta anche i PREZZI ────────────────────
  openrouter: congela({
    id: 'openrouter',
    // P-F, fonti e strumenti verificati il 12/09/2026; parità con models.dev nel test.
    modelliDiRiserva: congela([
      // 12/09/2026 — https://openrouter.ai/api/v1/models
      congela({ id: 'liquid/lfm-2.5-2.6b:free', nome: 'LiquidAI LFM 2.5 2.6B (gratuito)', toolCalling: true,
        fonte: 'https://openrouter.ai/api/v1/models', data: '2026-09-12' }),
      // 12/09/2026 — https://openrouter.ai/api/v1/models
      congela({ id: 'openai/gpt-5-nano', nome: 'OpenAI GPT-5 Nano', toolCalling: true,
        fonte: 'https://openrouter.ai/api/v1/models', data: '2026-09-12' }),
    ]),
    // 12/09/2026 — LFM: 0/0, minimo a pari merito tra SKU gratuiti; https://openrouter.ai/liquid/lfm-2.5-2.6b:free.
    modelloAusiliario: 'liquid/lfm-2.5-2.6b:free',
    modelsDevId: 'openrouter',
    etichetta: 'OpenRouter',
    descrizione: 'Aggregatore: centinaia di modelli dietro una sola chiave.',
    paginaChiavi: 'https://openrouter.ai/keys',
    wire: 'openai-chat',
    baseUrl: 'https://openrouter.ai/api/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['OPENROUTER_API_KEY']) }),
    chiaveObbligatoria: true,
    /* ⛔ `vendor/nome`: lo slash è OCCUPATO, ed è la ragione per cui la fonte si separa con `:`. */
    formaIdModello: 'vendor/nome',
    oauth: congela({ tipo: 'pkce', etichetta: 'OpenRouter' }),
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'osservato',
    toolCalling: 'osservato',
    cache: congela({
      marcatore: 'cache_control',   // sull'inviluppo del messaggio, per i modelli che lo onorano
      letturaUsage: congela(['prompt_tokens_details.cached_tokens', 'cache_read_input_tokens']),
      scritturaUsage: congela(['prompt_tokens_details.cache_write_tokens']),
      inclusiNelTotale: true,
      /* ⛔ `cache_discount` è DENARO, non token: sta fuori da `usage`, e non si somma mai ai conteggi. */
      scontoDichiarato: 'cache_discount',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: false }),
    prezzi: congela({ fonte: 'openrouter-models' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null, conta: (c) => c?.data?.length }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // ── Ollama — in casa, senza account ────────────────────────────────────────────────────────
  ollama: congela({
    id: 'ollama',
    // P-F, 12/09/2026: scoperta locale, nessuna inferenza sui modelli installati.
    modelliDiRiserva: null,
    modelloAusiliario: null,
    modelsDevId: null, // Ollama Cloud è un servizio diverso dal runtime locale.
    etichetta: 'Ollama Local',
    descrizione: 'Motore locale Ollama su questo computer.',
    paginaChiavi: 'https://ollama.com/download',
    wire: 'openai-chat',
    /* ⛔ Ollama espone il protocollo OpenAI sotto `/v1`, il suo indirizzo base no. */
    baseUrl: 'http://127.0.0.1:11434',
    indirizzoModificabile: true,
    envIndirizzo: congela(['OLLAMA_BASE_URL']),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['OLLAMA_API_KEY']) }),
    chiaveObbligatoria: false,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/v1/chat/completions', modelli: '/api/tags' }),
    streaming: 'osservato',
    toolCalling: 'ignoto',     // ⛔ dipende dal modello caricato, non dal motore
    cache: congela({ marcatore: null, letturaUsage: congela([]), scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null }),
    catalogo: congela({ fonte: 'runtime-locale', forma: 'ollama-tags', percorso: '/api/tags', inUI: false }),
    prezzi: congela({ fonte: 'nessuna' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'nessuna', percorso: '/api/tags', urlAssoluto: null, conta: (c) => c?.models?.length }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'runtime locale',
  }),

  // ── LM Studio — P-C: scoperto e sondato da sempre, e fino a oggi non sceglibile in chat ─────
  lmstudio: congela({
    id: 'lmstudio',
    // P-F, 12/09/2026: scoperta locale, nessuna inferenza sui modelli installati.
    modelliDiRiserva: null,
    modelloAusiliario: null,
    modelsDevId: 'lmstudio', // Metadati pubblici: l'elenco installato resta del runtime.
    etichetta: 'LM Studio',
    descrizione: 'Motore locale LM Studio su questo computer.',
    paginaChiavi: 'https://lmstudio.ai/download',
    wire: 'openai-chat',
    /* 🌐 lmstudio.ai/docs/app/api/endpoints/openai: `http://localhost:1234/v1`, porta 1234. */
    baseUrl: 'http://127.0.0.1:1234',
    indirizzoModificabile: true,
    envIndirizzo: congela(['LMSTUDIO_BASE_URL', 'LM_BASE_URL']),
    /*
     * ⛔ Chiave FACOLTATIVA, non assente: la REST v1 di LM Studio 0.4 dichiara «authentication
     *   configuration with API tokens» 🌐, ma gli esempi OpenAI-compatibili non ne usano nessuna.
     *   Pretenderla lo escluderebbe per una regola che non lo riguarda — stessa scelta di Ollama.
     */
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['LMSTUDIO_API_KEY', 'LM_API_KEY']) }),
    chiaveObbligatoria: false,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/v1/chat/completions', modelli: '/api/v1/models' }),
    streaming: 'osservato',
    /*
     * ⭐ L'unico che dichiara le capacità OSSERVATE modello per modello
     *   (`capabilities.trained_for_tool_use`, `vision`, `reasoning.allowed_options`,
     *   `max_context_length`): `openai-compatible-runtime.mjs` le legge già. È la ragione per cui
     *   questo fornitore vale più di una riga in più nel selettore.
     */
    toolCalling: 'osservato',
    cache: congela({ marcatore: null, letturaUsage: congela([]), scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null }),
    catalogo: congela({ fonte: 'runtime-locale', forma: 'lmstudio-models', percorso: '/api/v1/models', inUI: true }),
    prezzi: congela({ fonte: 'nessuna' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'nessuna', percorso: '/api/v1/models', urlAssoluto: null, conta: (c) => c?.models?.length }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'runtime locale',
  }),

  // P-G, 12/09/2026 — Groq. Fonte HTTP: https://console.groq.com/docs/api-reference
  groq: congela({
    id: 'groq',
    modelliDiRiserva: congela([
      congela({ id: 'openai/gpt-oss-20b', nome: 'GPT OSS 20B', toolCalling: true,
        fonte: 'https://console.groq.com/docs/tool-use/overview', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'groq',
    etichetta: 'Groq',
    descrizione: 'Modelli tramite Groq.',
    paginaChiavi: 'https://console.groq.com/keys',
    wire: 'openai-chat',
    baseUrl: 'https://api.groq.com/openai/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['GROQ_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'vendor/nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://console.groq.com/docs/prompt-caching', data: '2026-09-12',
    }),
    richiestaCompatibile: congela({
      limiteUscita: 'max_completion_tokens', ragionamento: 'effort',
      modelli: congela({
        'openai/gpt-oss-20b': congela({ livelliRagionamento: congela(['low', 'medium', 'high']), }),
        'openai/gpt-oss-120b': congela({ livelliRagionamento: congela(['low', 'medium', 'high']), }),
      }),
      fonte: 'https://console.groq.com/docs/api-reference', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — Cerebras. Fonte HTTP: https://inference-docs.cerebras.ai/api-reference/chat-completions
  cerebras: congela({
    id: 'cerebras',
    modelliDiRiserva: congela([
      congela({ id: 'gpt-oss-120b', nome: 'GPT OSS 120B', toolCalling: true,
        fonte: 'https://inference-docs.cerebras.ai/capabilities/tool-use', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'cerebras',
    etichetta: 'Cerebras',
    descrizione: 'Modelli tramite Cerebras.',
    paginaChiavi: 'https://cloud.cerebras.ai/platform',
    wire: 'openai-chat',
    baseUrl: 'https://api.cerebras.ai/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['CEREBRAS_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://inference-docs.cerebras.ai/capabilities/prompt-caching', data: '2026-09-12',
    }),
    richiestaCompatibile: congela({
      limiteUscita: 'max_completion_tokens', ragionamento: 'effort',
      modelli: congela({
        'gpt-oss-120b': congela({ livelliRagionamento: congela(['low', 'medium', 'high']), strumentiConFormato: false, fonte: 'https://inference-docs.cerebras.ai/resources/openai', }),
        'qwen-3.8-27b': congela({ livelliRagionamento: congela(['none', 'low', 'medium', 'high']), }),
      }),
      fonte: 'https://inference-docs.cerebras.ai/api-reference/chat-completions', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — Mistral. Fonte HTTP: https://docs.mistral.ai/api/endpoint/chat
  mistral: congela({
    id: 'mistral',
    modelliDiRiserva: congela([
      congela({ id: 'mistral-small-latest', nome: 'Mistral Small', toolCalling: true,
        fonte: 'https://docs.mistral.ai/studio/conversations/function-calling', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'mistral',
    etichetta: 'Mistral',
    descrizione: 'Modelli tramite Mistral.',
    paginaChiavi: 'https://console.mistral.ai/api-keys',
    wire: 'openai-chat',
    baseUrl: 'https://api.mistral.ai/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['MISTRAL_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: 'prompt_cache_key', letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://docs.mistral.ai/studio/conversations/advanced/prompt-caching', data: '2026-09-12',
    }),
    richiestaCompatibile: congela({
      limiteUscita: null, ragionamento: 'effort',
      modelli: congela({}),
      fonte: 'https://docs.mistral.ai/api/endpoint/chat', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — Together. Fonte HTTP: https://docs.together.ai/docs/inference/openai-compatibility
  together: congela({
    id: 'together',
    modelliDiRiserva: congela([
      congela({ id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', nome: 'Llama 3.3 70B', toolCalling: true,
        fonte: 'https://docs.together.ai/docs/serverless/models', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'togetherai',
    etichetta: 'Together',
    descrizione: 'Modelli tramite Together.',
    paginaChiavi: 'https://api.together.ai/settings/api-keys',
    wire: 'openai-chat',
    baseUrl: 'https://api.together.ai/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['TOGETHER_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'vendor/nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela(['cached_tokens', 'prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://docs.together.ai/docs/inference/openai-compatibility', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — Fireworks. Fonte HTTP: https://docs.fireworks.ai/api-reference/post-chatcompletions
  // GET /inference/v1/models non trovato nella documentazione: il 401 senza chiave non ne prova il funzionamento. Il 404 deve restare esplicito.
  fireworks: congela({
    id: 'fireworks',
    modelliDiRiserva: congela([
      congela({ id: 'accounts/fireworks/models/gpt-oss-120b', nome: 'GPT OSS 120B', toolCalling: true,
        fonte: 'https://fireworks.ai/models/fireworks/gpt-oss-120b', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'fireworks-ai',
    etichetta: 'Fireworks',
    descrizione: 'Modelli tramite Fireworks.',
    paginaChiavi: 'https://app.fireworks.ai/settings/users/api-keys',
    wire: 'openai-chat',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['FIREWORKS_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'vendor/nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://docs.fireworks.ai/api-reference/post-chatcompletions', data: '2026-09-12',
    }),
    richiestaCompatibile: congela({
      limiteUscita: null, ragionamento: 'effort',
      modelli: congela({}),
      fonte: 'https://docs.fireworks.ai/api-reference/post-chatcompletions', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — DeepInfra. Fonte HTTP: https://docs.deepinfra.com/chat/overview
  deepinfra: congela({
    id: 'deepinfra',
    modelliDiRiserva: congela([
      congela({ id: 'openai/gpt-oss-20b', nome: 'GPT OSS 20B', toolCalling: true,
        fonte: 'https://deepinfra.com/openai/gpt-oss-20b', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'deepinfra',
    etichetta: 'DeepInfra',
    descrizione: 'Modelli tramite DeepInfra.',
    paginaChiavi: 'https://deepinfra.com/dash/api_keys',
    wire: 'openai-chat',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['DEEPINFRA_API_KEY', 'DEEPINFRA_TOKEN']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'vendor/nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://docs.deepinfra.com/chat/prompt-caching', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true, catalogoPubblico: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — Novita. Fonte HTTP: https://docs.novita.ai/api-reference/model-apis-llm-create-chat-completion
  // La documentazione HTTP usa /openai/v1; alcuni esempi SDK e models.dev indicano /openai. Qui si segue il riferimento HTTP, senza aggiungere un secondo /v1.
  novita: congela({
    id: 'novita',
    modelliDiRiserva: congela([
      congela({ id: 'qwen/qwen3-coder-30b-a3b-instruct', nome: 'Qwen3 Coder 30B', toolCalling: true,
        fonte: 'https://novita.ai/models/model-detail/qwen-qwen3-coder-30b-a3b-instruct', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'novita-ai',
    etichetta: 'Novita',
    descrizione: 'Modelli tramite Novita.',
    paginaChiavi: 'https://novita.ai/settings/key-management',
    wire: 'openai-chat',
    baseUrl: 'https://api.novita.ai/openai/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['NOVITA_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'vendor/nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://docs.novita.ai/guides/llm-prompt-cache', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true, catalogoPubblico: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — Nebius. Fonte HTTP: https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion
  nebius: congela({
    id: 'nebius',
    modelliDiRiserva: congela([
      congela({ id: 'openai/gpt-oss-120b', nome: 'GPT OSS 120B', toolCalling: true,
        fonte: 'https://nebius.com/services/token-factory', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'nebius',
    etichetta: 'Nebius',
    descrizione: 'Modelli tramite Nebius.',
    paginaChiavi: 'https://tokenfactory.nebius.com',
    wire: 'openai-chat',
    baseUrl: 'https://api.tokenfactory.nebius.com/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['NEBIUS_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'vendor/nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion', data: '2026-09-12',
    }),
    richiestaCompatibile: congela({
      limiteUscita: null, ragionamento: 'effort',
      modelli: congela({}),
      fonte: 'https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — xAI. Fonte HTTP: https://docs.x.ai/developers/rest-api-reference/inference/chat-completions
  xai: congela({
    id: 'xai',
    modelliDiRiserva: congela([
      congela({ id: 'grok-4.3', nome: 'Grok 4.3', toolCalling: true,
        fonte: 'https://docs.x.ai/developers/models/grok-4.3', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'xai',
    etichetta: 'xAI',
    descrizione: 'Modelli tramite xAI.',
    paginaChiavi: 'https://console.x.ai',
    wire: 'openai-chat',
    baseUrl: 'https://api.x.ai/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['XAI_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela(['prompt_tokens_details.cached_tokens']),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Cache dichiarata dal fornitore; senza conteggio: non misurato.',
      fonte: 'https://docs.x.ai/developers/rest-api-reference/inference/chat-completions', data: '2026-09-12',
    }),
    richiestaCompatibile: congela({
      limiteUscita: 'max_completion_tokens', ragionamento: 'effort',
      modelli: congela({
        'grok-4.3': congela({ livelliRagionamento: congela(['none', 'low', 'medium', 'high', 'xhigh']), fonte: 'https://docs.x.ai/developers/models/grok-4.3', }),
        'grok-4.6': congela({ livelliRagionamento: congela(['low', 'medium', 'high', 'xhigh']), fonte: 'https://docs.x.ai/developers/models/grok-4.6', }),
      }),
      fonte: 'https://docs.x.ai/developers/rest-api-reference/inference/chat-completions', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — Ollama Cloud. Fonte HTTP: https://docs.ollama.com/api/openai-compatibility
  'ollama-cloud': congela({
    id: 'ollama-cloud',
    modelliDiRiserva: congela([
      congela({ id: 'gpt-oss:20b', nome: 'GPT OSS 20B', toolCalling: true,
        fonte: 'https://ollama.com/library/gpt-oss', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'ollama-cloud',
    etichetta: 'Ollama Cloud',
    descrizione: 'Modelli tramite Ollama Cloud.',
    paginaChiavi: 'https://ollama.com/settings/keys',
    wire: 'openai-chat',
    baseUrl: 'https://ollama.com/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['OLLAMA_API_KEY']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela([]),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Conteggio della cache non documentato; senza dati: non misurato.',
      fonte: 'https://docs.ollama.com/api/openai-compatibility', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true, catalogoPubblico: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // P-G, 12/09/2026 — Hugging Face. Fonte HTTP: https://huggingface.co/docs/inference-providers/tasks/chat-completion
  // Lo stesso account del portachiavi resta disponibile per i download. La chiave è obbligatoria per l'inferenza, non per scaricare modelli pubblici.
  huggingface: congela({
    id: 'huggingface',
    modelliDiRiserva: congela([
      congela({ id: 'openai/gpt-oss-20b', nome: 'GPT OSS 20B', toolCalling: true,
        fonte: 'https://huggingface.co/openai/gpt-oss-20b', data: '2026-09-12' }),
    ]),
    modelloAusiliario: null,
    motivoAusiliario: 'Nessun modello ausiliario qualificato per questo fornitore.',
    modelsDevId: 'huggingface',
    etichetta: 'Hugging Face',
    descrizione: 'Inferenza, catalogo e scaricamento dei modelli Hugging Face.',
    paginaChiavi: 'https://huggingface.co/settings/tokens',
    wire: 'openai-chat',
    baseUrl: 'https://router.huggingface.co/v1',
    indirizzoModificabile: true,
    envIndirizzo: congela([]),
    auth: congela({ tipo: 'bearer', header: 'Authorization', nomeVariabile: congela(['HF_TOKEN', 'HUGGINGFACE_HUB_TOKEN']) }),
    chiaveObbligatoria: true,
    formaIdModello: 'vendor/nome',
    oauth: null,
    endpoint: congela({ chat: '/chat/completions', modelli: '/models' }),
    streaming: 'dichiarato',
    toolCalling: 'dichiarato',
    cache: congela({
      marcatore: null, letturaUsage: congela([]),
      scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null,
      etichetta: 'Conteggio della cache non documentato; senza dati: non misurato.',
      fonte: 'https://huggingface.co/docs/inference-providers/tasks/chat-completion', data: '2026-09-12',
    }),
    richiestaCompatibile: congela({
      limiteUscita: null, ragionamento: 'effort',
      modelli: congela({}),
      fonte: 'https://huggingface.co/docs/inference-providers/tasks/chat-completion', data: '2026-09-12',
    }),
    catalogo: congela({ fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: true }),
    prezzi: congela({ fonte: 'https://models.dev/api.json', data: '2026-09-12' }),
    // Tempo massimo applicativo già adottato; non è una misura o una promessa del fornitore.
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true }),
    sonda: congela({ attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null,
      conta: (c) => c?.data?.length, richiedeCatalogoValido: true, catalogoPubblico: true }),
    destinazioneChat: true,
    credenziale: true,
    esecuzione: 'collegato',
  }),

  // ── Il motore locale llama-server — nessuna credenziale su disco, mai ───────────────────────
  local: congela({
    id: 'local',
    // P-F, 12/09/2026: scoperta locale, nessuna inferenza sui modelli installati.
    modelliDiRiserva: null,
    modelloAusiliario: null,
    modelsDevId: null,
    etichetta: 'Motore locale (llama.cpp)',
    descrizione: 'Il supervisore llama-server di questo computer.',
    paginaChiavi: null,
    wire: 'locale',
    baseUrl: null,               // lo decide il supervisore, e non esce di lì
    indirizzoModificabile: false,
    envIndirizzo: congela([]),
    /*
     * ⛔⛔ LA CHIAVE È EFFIMERA E NON ESISTE SU DISCO: `randomBytes(32)` a ogni avvio, passata come
     *   `--api-key` dal supervisore, che `status()` NON espone — quella risposta finisce nel
     *   browser. Misurato costruendo l'URL a mano: HTTP 401 «Invalid API Key» in 4 ms.
     *   ⇒ `credenziale: false`: questo fornitore non compare nel portachiavi, e non deve.
     */
    auth: congela({ tipo: 'effimera', header: 'Authorization', nomeVariabile: congela([]) }),
    chiaveObbligatoria: false,
    formaIdModello: 'nome',
    oauth: null,
    endpoint: congela({ chat: '/v1/chat/completions', modelli: null }),
    streaming: 'osservato',
    toolCalling: 'osservato',
    cache: congela({ marcatore: null, letturaUsage: congela([]), scritturaUsage: congela([]), inclusiNelTotale: true, scontoDichiarato: null }),
    catalogo: congela({ fonte: 'runtime-locale', forma: null, percorso: null, inUI: false }),
    prezzi: congela({ fonte: 'nessuna' }),
    limiti: congela({ timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: false }),
    sonda: congela({ attiva: false, auth: 'nessuna', percorso: null, urlAssoluto: null, conta: () => null }),
    destinazioneChat: true,
    credenziale: false,
    esecuzione: 'motore locale',
  }),
});

export class ProviderRegistryError extends Error {
  constructor(message, code = 'PROVIDER_REGISTRY_INVALID') {
    super(message);
    this.name = 'ProviderRegistryError';
    this.code = code;
  }
}

/**
 * Controlla che ogni record sia dicibile. Gira all'import: un registro rotto non deve arrivare
 * a una sessione viva, deve rompere il processo mentre qualcuno sta ancora guardando.
 *
 * ⛔ Il verso contrario è provato nel test: un record con `wire` inventato, una destinazione di
 *   chat senza `wire`, una capacità con un booleano al posto dei tre stati — tutti e tre devono
 *   LANCIARE, non degradare.
 */
export function verificaRegistro(registro = REGISTRO_FORNITORI) {
  const visti = new Set();
  for (const [chiave, record] of Object.entries(registro)) {
    const dove = `fornitore ${chiave}`;
    if (!record || typeof record !== 'object') throw new ProviderRegistryError(`${dove}: record assente`);
    if (record.id !== chiave) throw new ProviderRegistryError(`${dove}: id "${record.id}" diverso dalla chiave`);
    if (!/^[a-z][a-z0-9-]{0,31}$/u.test(record.id)) throw new ProviderRegistryError(`${dove}: id non utilizzabile come prefisso di fonte`);
    if (visti.has(record.id)) throw new ProviderRegistryError(`${dove}: id duplicato`);
    visti.add(record.id);
    if (typeof record.etichetta !== 'string' || record.etichetta.trim() === '') throw new ProviderRegistryError(`${dove}: etichetta mancante`);
    if (record.destinazioneChat === true && !WIRE.includes(record.wire)) throw new ProviderRegistryError(`${dove}: wire "${record.wire}" sconosciuto su una destinazione di chat`);
    if (record.destinazioneChat !== true && record.wire !== null && !WIRE.includes(record.wire)) throw new ProviderRegistryError(`${dove}: wire "${record.wire}" sconosciuto`);
    if (!AUTH.includes(record.auth?.tipo)) throw new ProviderRegistryError(`${dove}: auth "${record.auth?.tipo}" sconosciuta`);
    if (!Array.isArray(record.auth?.nomeVariabile)) throw new ProviderRegistryError(`${dove}: nomeVariabile deve essere una lista`);
    if (!['vendor/nome', 'nome'].includes(record.formaIdModello)) throw new ProviderRegistryError(`${dove}: formaIdModello sconosciuta`);
    for (const capacita of ['streaming', 'toolCalling']) {
      if (!STATI_CAPACITA.includes(record[capacita])) throw new ProviderRegistryError(`${dove}: ${capacita} deve essere uno dei tre stati, non "${record[capacita]}"`);
    }
    if (!Array.isArray(record.cache?.letturaUsage)) throw new ProviderRegistryError(`${dove}: cache.letturaUsage deve essere una lista di percorsi`);
    if (typeof record.cache?.inclusiNelTotale !== 'boolean') throw new ProviderRegistryError(`${dove}: cache.inclusiNelTotale deve dire se il totale li comprende`);
    if (record.credenziale === true && record.auth.tipo === 'effimera') throw new ProviderRegistryError(`${dove}: una credenziale effimera non può stare nel portachiavi`);
    /* ⛔ Una destinazione di chat DEVE sapere dove bussare, tranne il locale (lo sa il supervisore). */
    if (record.destinazioneChat === true && record.wire !== 'locale' && (typeof record.baseUrl !== 'string' || !record.endpoint?.chat)) {
      throw new ProviderRegistryError(`${dove}: destinazione di chat senza indirizzo o senza endpoint`);
    }
    if (record.sonda?.attiva === true && !record.sonda.percorso && !record.sonda.urlAssoluto) {
      throw new ProviderRegistryError(`${dove}: sonda attiva senza un indirizzo da chiamare`);
    }
    if (record.sonda?.dallaRadice !== undefined && (record.sonda.dallaRadice !== true
      || !/^\/(?!\/)/u.test(record.sonda.percorso ?? '') || /[\\\s]/u.test(record.sonda.percorso)
      || record.sonda.urlAssoluto)) {
      throw new ProviderRegistryError(`${dove}: percorso della sonda relativo all'origine non valido`);
    }
    if (record.richiestaCompatibile !== undefined) {
      const p = record.richiestaCompatibile;
      if (!p || ![null, 'max_completion_tokens'].includes(p.limiteUscita) || ![null, 'effort', 'thinking', 'enable_thinking'].includes(p.ragionamento)
        || !p.modelli || typeof p.modelli !== 'object' || Array.isArray(p.modelli)
        || typeof p.fonte !== 'string' || !p.fonte.startsWith('https://') || !/^\d{4}-\d{2}-\d{2}$/u.test(p.data ?? '')) {
        throw new ProviderRegistryError(`${dove}: profilo di compatibilità senza contratto o fonte datata`);
      }
      for (const m of Object.values(p.modelli)) {
        if (!m || !Array.isArray(m.livelliRagionamento) || (!m.livelliRagionamento.length && !m.thinking)
          || new Set(m.livelliRagionamento).size !== m.livelliRagionamento.length
          || m.livelliRagionamento.some(l => !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'default'].includes(l))
          || (m.strumentiConFormato !== undefined && typeof m.strumentiConFormato !== 'boolean')) {
          throw new ProviderRegistryError(`${dove}: particolarità del modello non valide`);
        }
        if (['thinking', 'enable_thinking'].includes(p.ragionamento)) {
          const t = m.thinking;
          if (!t || m.livelliRagionamento.length || typeof t.disattivabile !== 'boolean' || typeof t.predefinito !== 'boolean'
            || (p.ragionamento === 'enable_thinking' ? t.attivo !== true : ![null, 'enabled', 'adaptive'].includes(t.attivo))
            || (t.attivo === null && t.disattivabile) || (!t.disattivabile && !t.predefinito)
            || (t.conserva !== undefined && (t.conserva !== 'all' || t.attivo !== 'enabled'))
            || (t.soloStreaming !== undefined && typeof t.soloStreaming !== 'boolean')
            || ['temperaturaServer', 'sceltaObbligata', 'sceltaForzataConThinking'].some(k => m[k] !== undefined && typeof m[k] !== 'boolean')) {
            throw new ProviderRegistryError(`${dove}: controllo del ragionamento non valido`);
          }
        } else if (m.thinking !== undefined) {
          throw new ProviderRegistryError(`${dove}: controllo del ragionamento senza formato`);
        }
      }
    }
    for (const campo of ['modelliDiRiserva', 'modelloAusiliario']) {
      if (!Object.hasOwn(record, campo)) throw new ProviderRegistryError(`${dove}: ${campo} deve essere dichiarato`);
    }
    if (record.destinazioneChat && record.catalogo?.fonte === 'fornitore') {
      if (!Array.isArray(record.modelliDiRiserva) || !record.modelliDiRiserva.length) throw new ProviderRegistryError(`${dove}: riserva remota vuota`);
      const riserveViste = new Set();
      for (const m of record.modelliDiRiserva) {
        if (!m || typeof m.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u.test(m.id) || riserveViste.has(m.id)
          || typeof m.nome !== 'string' || !m.nome.trim() || m.toolCalling !== true
          || typeof m.fonte !== 'string' || !m.fonte.startsWith('https://') || !/^\d{4}-\d{2}-\d{2}$/u.test(m.data ?? '')) {
          throw new ProviderRegistryError(`${dove}: riserva senza identità, strumenti o fonte datata`);
        }
        riserveViste.add(m.id);
      }
      if (record.modelloAusiliario !== null && !riserveViste.has(record.modelloAusiliario)) throw new ProviderRegistryError(`${dove}: ausiliario fuori dalla riserva dichiarata`);
    } else if (record.modelliDiRiserva !== null || record.modelloAusiliario !== null) {
      throw new ProviderRegistryError(`${dove}: locali e download devono dichiarare riserva e ausiliario null`);
    }
    if (record.modelliNoti !== undefined) {
      if (!Array.isArray(record.modelliNoti)) throw new ProviderRegistryError(`${dove}: modelliNoti deve essere una lista`);
      const modelliVisti = new Set();
      for (const modello of record.modelliNoti) {
        if (!modello?.id || modelliVisti.has(modello.id) || !modello.nome || !modello.fonte || !/^\d{4}-\d{2}-\d{2}$/u.test(modello.data ?? '')) throw new ProviderRegistryError(`${dove}: modello senza identità o fonte datata`);
        modelliVisti.add(modello.id);
        if (!Number.isSafeInteger(modello.contextLength) || modello.contextLength <= 0 || !Number.isSafeInteger(modello.maxOutputTokens) || modello.maxOutputTokens <= 0) throw new ProviderRegistryError(`${dove}: limiti del modello non validi`);
        if (['ingresso', 'cache', 'uscita'].some(k => typeof modello.prezzi?.[k] !== 'number' || !Number.isFinite(modello.prezzi[k]) || modello.prezzi[k] < 0)) throw new ProviderRegistryError(`${dove}: prezzi del modello non validi`);
        if (!Array.isArray(modello.ragionamento?.livelli) || modello.ragionamento.livelli.some(l => !record.ragionamento?.livelli?.includes(l)) || !Array.isArray(modello.ragionamento.thinking) || modello.ragionamento.thinking.some(t => !['enabled', 'disabled'].includes(t))) throw new ProviderRegistryError(`${dove}: opzioni di ragionamento non valide`);
      }
    }
  }
  return true;
}

verificaRegistro();

/** Tutti gli id, nell'ordine di dichiarazione. */
export const ID_FORNITORI = Object.freeze(Object.keys(REGISTRO_FORNITORI));

/** @returns {object|null} il record, o `null` se l'id non esiste. ⛔ Mai un ripiego inventato. */
export function fornitore(id) {
  return Object.hasOwn(REGISTRO_FORNITORI, id) ? REGISTRO_FORNITORI[id] : null;
}

/** Id upstream, senza prefisso di destinazione; nessuna selezione o chiamata implicita.
 * La compattazione futura deve qualificare questo esatto modello dal vivo: CTX_NATIVE_UNQUALIFIED.
 */
export function modelloAusiliarioPer(fornitoreId) {
  return fornitore(fornitoreId)?.modelloAusiliario ?? null;
}

/** Proiezione del solo registro nel contratto del selettore: nessun prezzo o limite inventato. */
export function catalogoDiRiservaPer(fornitoreId) {
  const record = fornitore(fornitoreId);
  if (!record?.modelliDiRiserva?.length) return null;
  const dataRiserva = record.modelliDiRiserva.map(m => m.data).sort().at(-1);
  const [anno, mese, giorno] = dataRiserva.split('-');
  const motivo = `catalogo non raggiungibile: elenco di riserva del ${giorno}/${mese}/${anno}`;
  const metadati = { fonte: 'riserva', motivo, dataRiserva, aggiornatoAlle: null,
    verificatoAlle: null, etaCacheMs: null, daCache: false, fallbackRete: true, avvisi: [] };
  const modelli = record.modelliDiRiserva.map(m => ({
    id: record.id === 'openrouter' ? m.id : `${record.id}:${m.id}`,
    modelId: m.id, provider: record.id === 'openrouter' ? m.id.split('/')[0] : record.id,
    nome: m.nome, alias: false, contextLength: null, maxOutputTokens: null, maxInputTokens: null,
    contestoVerificato: false, prezzoPrompt: null, prezzoCompletion: null, prezzoCacheRead: null, prezzoCacheWrite: null,
    capacita: { toolCall: true, reasoning: null }, reasoning: null,
    inputModalities: null, outputModalities: null, supportedParameters: ['tools'],
    fonteDichiarazione: m.fonte, dataDichiarazione: m.data, catalogo: structuredClone(metadati),
  }));
  return { provider: record.id, modelsDevId: record.modelsDevId, disponibile: true,
    modelli, modelliDiRiserva: modelli, ...metadati };
}

/** Gli id che soddisfano un predicato, nell'ordine del registro. */
export function idFornitori(predicato) {
  return Object.freeze(ID_FORNITORI.filter((id) => predicato(REGISTRO_FORNITORI[id])));
}

/** Chi ha una chiave da custodire: è l'universo del pannello Provider e del portachiavi. */
export const ID_CON_CREDENZIALE = idFornitori((r) => r.credenziale === true);

/** Chi si può scegliere in chat: è l'universo del prefisso `fonte:modello`. */
export const ID_DESTINAZIONE_CHAT = idFornitori((r) => r.destinazioneChat === true);

/** Chi parla un dato wire. */
export function idPerWire(wire) {
  return idFornitori((r) => r.wire === wire);
}

/** Chi espone un catalogo diretto nella UI (una scheda propria nel selettore modelli). */
export const ID_CATALOGO_IN_UI = idFornitori((r) => r.catalogo?.inUI === true);

/**
 * Chi passa dagli SDK fissati nel lock (`native-provider-adapter.mjs`): tre wire, tre pacchetti.
 *
 * ⛔ Era la stessa terna `['openai','anthropic','gemini']` scritta a mano in CINQUE posti —
 *   `model-destination.mjs`, `native-provider-adapter.mjs`, `context-provider-adapter.mjs`,
 *   `context-token-counters.mjs` e due regex di rotta in `http-app.mjs`. Cinque copie di una
 *   verità che cambia quando si aggiunge un SDK.
 */
export const ID_NATIVI_SDK = Object.freeze([
  ...idPerWire('openai-responses'),
  ...idPerWire('anthropic-messages'),
  ...idPerWire('gemini'),
]);

/**
 * I motori che girano su questo computer e parlano il wire OpenAI (Ollama, LM Studio).
 *
 * ⛔ Serve in due posti che devono restare d'accordo: `openai-compatible-runtime.mjs` (chi sonda,
 *   elenca, carica e scarica) e `server.mjs` (che gli passa l'indirizzo scelto nel pannello).
 *   Erano due letterali `['ollama','lmstudio']` in attesa di divergere.
 */
export const ID_MOTORI_LOCALI_OPENAI = idFornitori((r) => r.catalogo?.fonte === 'runtime-locale' && r.wire === 'openai-chat');
