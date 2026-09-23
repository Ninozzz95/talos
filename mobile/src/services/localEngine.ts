import { registerPlugin } from '@capacitor/core'
import {
    talosLocalContextCandidates,
    talosShouldRetryLocalOpen,
} from '@/lib/models/localContextPolicy'
import type { TalosModelShape } from '@/lib/models/fit'
import { talosPrefixesToEvict } from '@/lib/models/prefixCache'
import { talosLocalBackendPlan } from '@/lib/models/localBackendPlan'
import { talosStoredLocalBackendPreference } from '@/lib/models/localBackendPreferenceStore'
import { talosT } from '@/i18n'
import { useTalosMobileToasts } from '@/stores/toasts'

/**
 * The on-device engine, from JavaScript's side of the bridge.
 *
 * llama.cpp lives behind JNI, which a WebView cannot reach. This is the only
 * door, and it is deliberately thin: it starts and stops a model and hands back
 * text as it arrives. Nothing here decides which backend to use, what counts as
 * a valid measurement, or whether a model fits — those live in Java
 * (`TalosBackendChoice`, `TalosBenchmarkHarness`) and in `fit.ts`, already
 * written and already tested, and a second opinion expressed in TypeScript
 * would be a second answer to a question that must have one.
 */

export interface TalosLocalEngineStatus {
    /** False on the web build, and on any APK built without the native library. */
    available: boolean
    /** Registered ggml backends, comma-separated. Empty when none loaded. */
    backends: string
    /** The model currently held in memory, or null. */
    loadedPath: string | null
    /**
     * La forma del modello caricato, dichiarata da lui — o null.
     *
     * È ciò che permette di chiedere a `talosMaxContextFor` quanto contesto
     * QUESTO dispositivo può dare a QUESTO modello, invece del tetto scritto a
     * mano che valeva per tutti (owner 2026-08-05: «una cosa scritta a mano non
     * potrebbe mai esistere»).
     *
     * Null in tre casi diversi che qui collassano di proposito in uno: niente
     * modello aperto, motore assente, oppure una build nativa più vecchia che
     * non sa rispondere. Per chi legge sono la stessa cosa — «non lo so» — e
     * l'unica reazione corretta è non imporre nessun tetto invece di inventarne
     * uno.
     */
    shape: TalosModelShape | null
    /**
     * La cache KV creata DAVVERO — non quella chiesta.
     *
     * ⛔ Sta qui, e non solo nel lettore grezzo del Doctor, perche' il percorso
     * caldo ne ha bisogno: allargare un contesto senza sapere con quale cache
     * sta girando significherebbe cambiarla sotto i piedi alla conversazione, e
     * il tipo vero puo' gia' essere diverso da quello chiesto — un modello che
     * non regge la `q8_0` riceve `f16` e lo dichiara.
     *
     * `null` quando non c'e' un modello aperto, o contro una build nativa piu'
     * vecchia che non sa rispondere.
     */
    kvCacheType: string | null
    /**
     * La build di llama.cpp, tipo `b10218-<commit>`, o `null` su una build
     * nativa più vecchia.
     *
     * ⛔ Sta qui e non solo nel Doctor perché serve al PERCORSO CALDO:
     * l'impronta di un prefisso congelato deve invalidarsi quando cambia il
     * motore — è la versione di llama.cpp che decide se uno stato salvato è
     * ancora leggibile — e **non** quando cambia l'app. Usare la build dell'app
     * buttava via un gigabyte di lavoro a ogni aggiornamento, per una ragione
     * che non esiste.
     */
    engineBuild: string | null
}

/**
 * What the GGUF's own Jinja template actually renders. These are observed from
 * llama.cpp's capability analyzer; absence is never interpreted as tool
 * support.
 */
export interface TalosLocalTemplateCapabilities {
    supportsTools: boolean
    supportsToolCalls: boolean
    supportsSystemRole: boolean
    /**
     * ⭐⭐⭐ Se una GRAMMATICA potra' tenere le chiamate di questo modello.
     *
     * ⛔ NON e' `supportsToolCalls`, ed e' il punto: due modelli possono
     * entrambi «supportare gli strumenti» e comportarsi in modo opposto.
     * Misurato sul Pad l'11/09/2026 — alla domanda «Come ti chiami»,
     * `Llama-3.2-3B` ha emesso `{"name":"tool_details","parameters":{"names":
     * "['library_list', …]"}}`: due chiamate al posto di un nome, e `names`
     * come **stringa** dove lo schema vuole un array. Nel log,
     * `grammatica: no`.
     *
     * In `common/chat.cpp` ci sono handler dedicati per gemma4, lfm2,
     * qwen3-coder e altri dodici, ognuno con la propria grammatica; per Llama
     * 3.x non ce n'e' nessuno, e senza grammatica quel valore sbagliato **puo'**
     * nascere. Con una, non potrebbe.
     *
     * ⛔ `false` vuol dire «non vincolabile», e comprende «non lo so»: chi
     * decide qualcosa su questo campo deve trattare l'incertezza come il caso
     * peggiore, non come un permesso.
     *
     * ⛔ Assente su un ponte piu' vecchio = `false`, per la stessa ragione.
     */
    grammarForTools: boolean
    /**
     * ⭐⭐⭐ Se il ragionamento di questo modello si puo' SPEGNERE.
     *
     * ⛔ Non e' «questo modello ragiona»: quello lo dicono gia' altri campi, e
     * per LFM2 il parser di llama.cpp lo mette a vero senza guardare niente.
     * Questo dice se l'interruttore esiste davvero su QUESTO file, e la
     * risposta si ottiene applicando il template due volte e confrontando i
     * due prompt — mai da un elenco di nomi di modello.
     *
     * Misurato sul Pad l'11/09/2026: su `LFM2.5-2.6B-Q4_0` fra «primo token del
     * motore» (3,1 s) e «prima parola» (10,7 s) ci sono ~130 token di
     * ragionamento. La chat chiedeva gia' di spegnerlo, e non e' servito.
     */
    thinkingCanBeDisabled: boolean
}

/** The wire strategy chosen after inspecting the embedded GGUF template. */
export type TalosLocalToolTransport = 'native-template' | 'prompt-json-v1'

export interface TalosLocalEngineOpenResult {
    /** What the engine actually granted, which may be less than was asked for. */
    contextTokens: number
}

export interface TalosLocalEngineGeneration {
    text: string
    tokens: number
    /**
     * Ciò che il modello ha pensato, già staccato da ciò che ha detto.
     *
     * Owner 2026-08-03: `<think></think>` stampati sopra la risposta. Non era
     * una mancanza del cassetto «Ragionamento» — quello esiste e funziona coi
     * provider di rete — ma del motore locale, che passava al modello ChatML
     * nudo e poi rileggeva l'uscita senza sapere che formato aspettarsi.
     *
     * La separazione la fa `common_chat_parse` sul lato nativo, cioè lo stesso
     * codice che ha applicato il template: la documentazione di Qwen avverte di
     * non usare parser a parole d'arresto per i modelli che ragionano, «because
     * the model may output stopwords in the thought section».
     */
    reasoning?: string
    /**
     * Le chiamate che il modello ha chiesto di eseguire.
     *
     * Owner 2026-08-03: «i locali devono avere le stesse possibilità dei key».
     * Nella stessa forma degli altri provider, perché l'esecutore a valle non
     * deve sapere da dove arriva una chiamata: un tool eseguito per un modello
     * locale è lo stesso tool.
     */
    toolCalls?: ReadonlyArray<{ name: string, arguments: string, id: string }>
}

/** Exact native plan for one templated local conversation. */
export interface TalosLocalEngineChatPlan {
    prompt: string
    promptTokens: number
    contextTokens: number
}

/**
 * P2-3 — i segnali di prestazione reali di Android 16, letti ADESSO.
 * `null` sotto la soglia API di quel campo, o quando il device non sa
 * rispondere in questo istante (rate-limit, carico insufficiente per le
 * headroom CPU/GPU — l'esito documentato dell'API, non un guasto).
 */
export interface TalosPerformanceSignals {
    /** [0,100], 0 = nessuna risorsa CPU concedibile. `null` sotto API 36. */
    cpuHeadroom: number | null
    /** Come `cpuHeadroom`, per la GPU. */
    gpuHeadroom: number | null
    /** [0,100], previsione ADESSO. `null` sotto API 30. */
    thermalHeadroom: number | null
    /** Come `thermalHeadroom`, previsto qualche secondo avanti. */
    thermalForecast: number | null
    thermalStatus: 'none' | 'light' | 'moderate' | 'severe' | 'critical' | null
    /** `SystemClock.elapsedRealtime()` di QUANDO è stata presa questa lettura. */
    sampledAtElapsedMs: number
}

interface TalosLlamaPlugin {
    available(): Promise<{
        available: boolean
        backends: string
        loadedPath: string | null
        /** Assente sulle build native che non sanno ancora dichiararla. */
        shape?: Record<string, unknown>
        /** La cache creata DAVVERO, non quella chiesta. */
        kvCacheType?: string
        /** La build di llama.cpp: cio' che invalida un prefisso congelato. */
        engineBuild?: string
        /**
         * ⛔⛔ Quanti acceleratori il registro ggml ha DAVVERO caricato in
         * questa build. Assente su un ponte più vecchio, e assente non è zero:
         * zero è un fatto («nessuna richiesta di offload poteva essere
         * onorata»), assente è «non lo so».
         */
        offloadDevices?: number
        /** Due insiemi di thread VERI, o uno solo condiviso. Assente = ponte più vecchio. */
        threadPoolSplit?: boolean
        /** Il dispositivo risolto, quando un bersaglio era stato nominato. */
        backendDevice?: string
        /** Gli strati chiesti, già azzerati dal nativo se nessun acceleratore esiste. */
        gpuLayersEffective?: number
    }>
    deleteInstalled(options: { path: string }): Promise<{ deleted: boolean }>
    /**
     * Fa girare, se e quanto serve, il sondaggio che riempie
     * `TalosBackendEvidenceStore` — una generazione VERA su CPU e, quando
     * questa build ha davvero compilato OpenCL, sulla GPU, per decidere se
     * conviene offrirla su QUESTO telefono.
     *
     * ⛔ Costa batteria e calore, non una chiamata di rete: per questo non
     * parte mai da sola. Chi chiama deve già avere il consenso — automatico
     * al primo modello locale scelto, o dal comando manuale nelle
     * impostazioni — vedi `localEngineProbeConsent.ts`.
     */
    qualifyBackend(options: { path: string }): Promise<{
        ran: boolean
        /** Presente solo quando `ran` è falso: perché non ha girato. */
        reason?: string
        probedCpu?: boolean
        cpuInconclusive?: boolean
        probedGpu?: boolean
        gpuInconclusive?: boolean
        /**
         * ⛔⛔ IL TERZO MOTORE — il nativo li mandava dall'11/09/2026 e da
         * questa parte del ponte nessuno li leggeva.
         *
         * `runQualification` scrive `probedNpu` e `npuInconclusive` nella
         * risposta da quando l'NPU è nel sondaggio. Il tipo qui sotto non li
         * nominava, quindi la scheda a schermo continuava a raccontare una
         * corsa a due — e una corsa dell'NPU non abbastanza stabile per
         * fidarsene spariva senza lasciare traccia.
         */
        probedNpu?: boolean
        npuInconclusive?: boolean
        decisionBackend?: string
        decisionReason?: string
    }>
    /**
     * P1-5 — i profili già misurati da `qualifyBackend` per questo modello,
     * sull'identità di ADESSO. Sola lettura: non fa mai partire una misura.
     */
    localPerformanceProfiles(options: { path: string }): Promise<{
        profiles: ReadonlyArray<{
            backendRegistry: string
            backendDevice: string | null
            outcome: 'CORRECT' | 'FAILED'
            ttftMs: number
            /** -1 = non misurato (righe scritte prima di questo campo). */
            decodeTokPerSec: number
            /** D-53: -1 o assente = non misurato (profili scritti prima dell'11/09/2026). */
            prefillTokPerSec?: number
            openMs?: number
            qualificationLevel: 'Q0' | 'Q1' | 'Q2'
            measuredAtMs: number
        }>
    }>
    /**
     * P2-3 — CPU/GPU/termico ADESSO, letti da Android 16 dove esistono
     * (`SystemHealthManager`/`PowerManager`). Girato fuori dal thread che
     * genera token: sicuro da chiamare spesso.
     */
    performanceSignals(): Promise<TalosPerformanceSignals>
    open(options: {
        path: string
        threads?: number
        threadsBatch?: number
        microBatch?: number
        contextTokens?: number
        gpuLayers?: number
        /**
         * L'argmax, per MISURARE — mai per parlare.
         *
         * Confrontare due backend vuol dire pretendere lo stesso identico testo
         * da entrambi, quindi il banco di prova chiede questo. La chat no: con
         * l'argmax un 4B quantizzato si impunta sul token in testa di un
         * millesimo e finisce a ripetere la stessa frase fino a esaurire i
         * token. Misurato sul tablet il 2026-08-03, stesso modello e stesso
         * prompt: acceso, cinque ripetizioni di fila; spento, una risposta che
         * si chiude da sola in 112 token invece di 160.
         */
        deterministic?: boolean
        /** `q8_0` per la cache leggera. Chiedere non e' ottenere: vedi `open`. */
        kvCacheType?: string
        /**
         * ⭐⭐⭐ COME i pesi entrano in memoria. Assente = come si è sempre
         * fatto (`auto`), e resta il predefinito finché non c'è la misura:
         * `.claude/TACCUINO-VELOCITA-LOCALE-2026-09-10.md`.
         *
         * ⛔ Cambiarla RICARICA i pesi. Agisce su `llama_model_params`, non sul
         * contesto, quindi la strada veloce che riusa i gigabyte già in memoria
         * non la vedrebbe: il ponte se ne accorge e riapre per intero. Chiederla
         * a metà conversazione costa quanto la prima apertura.
         */
        loadMode?: TalosLocalLoadMode
        /**
         * ⭐⭐⭐ Il ripacchettamento dei pesi. Assente = il predefinito di
         * llama.cpp (acceso), e assente NON è `true`: solo così il predefinito
         * resta quello di upstream anche se upstream lo cambia.
         *
         * È una manopola SEPARATA da `loadMode` — verificato nel submodule, è
         * il campo `llama_model_params.use_extra_bufts` (`include/llama.h:338`)
         * e il flag `-nr/--no-repack` (`common/arg.cpp:2413-2416`). ⛔ Ma i due
         * si incrociano: i tensori ripacchettati finiscono in un buffer «extra»
         * che non è quello di default, quindi non passano dalla strada veloce
         * della mmap. ⇒ Il repack accelera il prefill e conviene **quando la
         * mmap è spenta** — la stessa cosa che PocketPal scrive sotto il suo
         * interruttore.
         *
         * ⛔ Riguarda il nostro catalogo più di quanto sembri: llama.cpp
         * ripacchetta anche **Q4_K** e **Q2_K**, non solo Q4_0 — cioè i
         * `*-Q4_K_M.gguf` che scarichiamo di default.
         */
        weightRepack?: boolean
        /**
         * ⭐⭐⭐ DOVE far girare il modello, per NOME — la scelta dell'utente.
         *
         * Owner 2026-09-10: «LA SCELTA RESTA ALL UTENTE, SCEGLIE SEMPRE LUI,
         * CPU GPU O HEXAGON, DI DEFAULT SCEGLIAMO QUELLO PIU VELOCE (DI SOLITO
         * GPU)». Il nome è quello che ggml dichiara di sé — `OpenCL`,
         * `Vulkan`, `HTP` — e la traduzione da «famiglia» a nome vive in
         * `lib/models/localBackendChoice.ts`, non qui.
         *
         * ⛔ Assente = nessuna richiesta = come si è sempre fatto: `gpuLayers`
         * dice QUANTI strati e llama.cpp sceglie DOVE. `none`/`cpu` dicono
         * «nessun offload» ad alta voce, che non è la stessa cosa di tacere.
         *
         * ⛔ Nominare è l'unico modo perché il motore possa poi DIRE quale
         * dispositivo ha preso (`backendDevice`): senza nome quel campo resta
         * vuoto e «quale motore sta girando» torna a essere una deduzione. E
         * un nome che non si risolve fa FALLIRE l'apertura invece di ripiegare
         * in silenzio sulla CPU — la differenza fra «selezionabile» e
         * «realmente utilizzato».
         *
         * ⛔ Cambiarlo RICARICA i pesi, come `loadMode`: il bersaglio vive in
         * `llama_model_params.devices`, cioè in dove i tensori sono stati
         * allocati, e la strada veloce che riusa i gigabyte non lo vedrebbe.
         * Il ponte se ne accorge da solo e riapre per intero.
         */
        backend?: string
        /**
         * Il dispositivo esatto dentro quel registry. Assente = accettato solo
         * se il registry ne espone UNO solo; con due, il motore rifiuta invece
         * di sorteggiare.
         */
        device?: string
    }): Promise<TalosLocalEngineOpenResult>
    generate(options: {
        prompt: string
        maxTokens?: number
        stopAtEndOfGeneration?: boolean
    }): Promise<TalosLocalEngineGeneration>
    /**
     * ⭐ Congela su disco il prefisso gia' calcolato, coi suoi token.
     *
     * MISURATO 2026-08-07: «ciao» costa 8.410 token di prompt, ~8.250 dei quali
     * sono i trentotto schemi dei tool — 150 secondi, l'88% dell'attesa, e sono
     * identici in ogni conversazione.
     */
    saveState(options: {
        path: string
        /**
         * ⭐ Il TESTO del prefisso da tenere. Assente = si salva tutto.
         *
         * Il prefisso da congelare è già dentro la cache dopo il primo
         * messaggio: potarlo e salvarlo costa **zero calcolo**, mentre
         * riscaldarlo a parte lo rifarebbe da capo — altri 150 secondi.
         *
         * ⛔ Il testo, non un conteggio: il template mette il marcatore
         * dell'assistente in fondo (`add_generation_prompt`), quindi il
         * rendering del solo sistema NON è un prefisso di quello completo, e un
         * numero ricavato da lì taglierebbe dentro il turno dell'utente — una
         * briciola di conversazione finirebbe nel file e ogni chat nuova la
         * erediterebbe come se l'avesse scritta lei. Il confine lo trova il
         * tokenizzatore, dall'altra parte del ponte.
         */
        prefixPrompt?: string
    }): Promise<{
        bytes: number
        saved: boolean
        ms: number
    }>
    /**
     * Rilegge un prefisso congelato nel contesto aperto.
     *
     * ⛔ Il percorso DEVE venire da `talosPrefixCacheFileName`: uno stato
     * caricato sul modello sbagliato non da' errore, da' risposte sbagliate.
     */
    loadState(options: { path: string }): Promise<{
        restoredTokens: number
        ms: number
    }>
    /**
     * I prefissi congelati sul disco. `modifiedAt` è l'ULTIMO USO, non la
     * creazione: `loadState` la aggiorna a ogni rilettura riuscita.
     */
    prefixCaches(): Promise<{
        caches: Array<{ path: string, bytes: number, modifiedAt: number }>
        totalBytes: number
    }>
    lastTimings(): Promise<{ timings: string }>
    /**
     * Quali `libggml-*.so` entrano davvero, e per gli altri l'errore.
     * Vedi il cappello su `talosProbeBackendLoad`.
     */
    probeBackendLoad(): Promise<{ report: string, ms: number }>
    /** Il formato dei pesi, letto dall'intestazione GGUF. Vedi `talosLocalModelQuantisation`. */
    modelFormat(options: { path: string }): Promise<{ format: string }>
    /**
     * A che punto e' il caricamento del modello. `loading: false` = non sta
     * caricando niente, e in quel caso `permille` vale -1.
     */
    loadProgress(): Promise<{ permille: number, loading: boolean }>
    /** Ferma il caricamento in corso. Vedi `talosCancelLocalModelLoad`. */
    cancelLoad(): Promise<{ ok: boolean }>
    /** Il fabbisogno e la forma, letti senza caricare i pesi. */
    planPrompt(options: {
        path: string
        turns: ReadonlyArray<TalosLocalEngineTurn>
        tools?: readonly unknown[]
        /**
         * ⛔ Se il modello deve RAGIONARE. Assente = sì, come prima.
         *
         * `enable_thinking` nasce acceso in llama.cpp e non glielo dicevamo
         * mai: TALOS chiedeva a Qwen3 di ragionare **anche per «ciao»**,
         * ignorando l'impostazione della persona. MISURATO sul Pad il
         * 2026-08-08: 105 token prodotti per rispondere «Ciao! Come posso
         * aiutarti oggi?», di cui una decina di risposta.
         *
         * Non è censura del ragionamento: è non pagarlo dove nessuno l'ha
         * chiesto. Chi lo accende continua ad averlo.
         */
        thinking?: boolean
    }): Promise<{ plan: string }>
    tuneThreads(options: { candidates: number[], probeTokens?: number }): Promise<{ tuning: string }>
    installed(): Promise<{
        models: Array<{
            path: string, bytes: number, name: string, modifiedAt?: number,
            /** Falso per un proiettore multimodale: e' un GGUF con cui non si parla. */
            conversational?: boolean,
        }>
        unreadable?: Array<{ path: string, reason: string }>
    }>
    /**
     * Reads only the Jinja capability map from a vocab-only GGUF open. The
     * template source itself never crosses the bridge.
     */
    templateCapabilities(options: { path: string }): Promise<{ capabilities: string }>
    chatPrompt(options: {
        turns: ReadonlyArray<TalosLocalEngineTurn>
        /** Vedi `planPrompt.thinking`: assente = sì, come prima. */
        thinking?: boolean
        /**
         * I tool, in forma OpenAI, passati al TEMPLATE del modello.
         *
         * Non descritti a parole nel prompt: ogni famiglia annuncia una
         * chiamata a modo suo — `<tool_call>`, JSON puro, blocchi speciali — e
         * quel formato lo conosce il GGUF. Il template restituisce anche la
         * grammatica che rende la chiamata valida per costruzione.
         */
        tools?: readonly unknown[]
    }): Promise<TalosLocalEngineChatPlan>
    cancel(): Promise<void>
    close(): Promise<void>
    addListener(
        event: 'token',
        handler: (payload: { delta: string }) => void,
    ): Promise<{ remove: () => Promise<void> }>
}

/**
 * Semantic chat message handed to llama.cpp's OpenAI-compatible parser.
 * Optional fields preserve assistant tool calls and their result identity;
 * punctuation remains the GGUF template's responsibility.
 */
export interface TalosLocalEngineTurn {
    role: string
    content?: string
    tool_calls?: ReadonlyArray<{
        id?: string
        type: 'function'
        function: { name: string, arguments: string }
    }>
    name?: string
    tool_call_id?: string
}

const plugin = registerPlugin<TalosLlamaPlugin>('TalosLlama')

/**
 * ⭐⭐⭐ COME i pesi entrano in memoria — i nomi sono quelli di llama.cpp.
 *
 * `'default'` vuol dire «non toccare», cioè il predefinito della libreria
 * (`auto`), cioè ciò che TALOS ha sempre fatto. Gli altri sono i nomi esatti
 * che `llama_load_mode_from_str()` riconosce — deliberatamente gli stessi, per
 * non avere due vocabolari per la stessa cosa.
 *
 * ⛔ `'mlock'` da solo NON accende la mmap: legge il file intero in RAM
 * (caricamento più lento, memoria piena subito). È `'mmap+mlock'` che mappa e
 * poi inchioda le pagine. Fonte: discussione upstream
 * ggml-org/llama.cpp#27912, 28/08/2026, e `src/llama-model-loader.cpp:554` nel
 * submodule pinnato.
 *
 * ⛔ NIENTE DI TUTTO QUESTO VA A SCHERMO COSÌ COM'È. Sono nomi di libreria: se
 * un giorno la scelta arriva in Impostazioni, l'utente legge una frase in
 * inglese che dice l'effetto — come fa PocketPal, *"Force system to keep model
 * in RAM rather than swapping or compressing"* — non la parola `mlock`.
 */
export type TalosLocalLoadMode =
    | 'default'
    | 'auto'
    | 'none'
    | 'mmap'
    | 'mlock'
    | 'mmap+mlock'
    | 'dio'

export type TalosLocalEngineOpenStage =
    | 'path'
    | 'model-load'
    /**
     * ⛔ NON e' un errore: e' chi ha premuto «annulla» mentre il modello si
     * apriva. Ha uno stadio suo perche' a schermo deve diventare una frase
     * diversa — «l'hai fermato tu» non e' «non ce l'ha fatta».
     */
    | 'load-cancelled'
    | 'context'
    | 'sampler'
    | 'template'
    | 'generation'
    | 'unknown'

/** A stable, non-sensitive native failure that callers can act on. */
export class TalosLocalEngineOpenError extends Error {
    readonly stage: TalosLocalEngineOpenStage
    readonly nativeCode: string

    constructor(stage: TalosLocalEngineOpenStage, nativeCode: string) {
        super(nativeCode)
        this.name = 'TalosLocalEngineOpenError'
        this.stage = stage
        this.nativeCode = nativeCode
    }
}

export type TalosLocalEngineGenerationStage = 'context-required' | 'generation'

/** Stable, non-sensitive failure from the asynchronous generation boundary. */
export class TalosLocalEngineGenerationError extends Error {
    readonly stage: TalosLocalEngineGenerationStage
    readonly nativeCode: string
    readonly promptTokens: number | null
    readonly contextTokens: number | null
    readonly requiredContextTokens: number | null

    constructor(options: {
        stage: TalosLocalEngineGenerationStage
        nativeCode: string
        promptTokens?: number | null
        contextTokens?: number | null
        requiredContextTokens?: number | null
    }) {
        super(options.nativeCode)
        this.name = 'TalosLocalEngineGenerationError'
        this.stage = options.stage
        this.nativeCode = options.nativeCode
        this.promptTokens = options.promptTokens ?? null
        this.contextTokens = options.contextTokens ?? null
        this.requiredContextTokens = options.requiredContextTokens ?? null
    }
}

type TalosLocalEngineOpenOptions = {
    threads?: number
    contextTokens?: number
    gpuLayers?: number
    deterministic?: boolean
    /**
     * I thread del PREFILL, separati da quelli della generazione.
     *
     * Erano lo stesso numero, e sono due carichi opposti: il prefill macina
     * matrici e si spalma sui core, generare un token per volta è legato alla
     * banda di memoria. Omesso significa «come prima», che è ciò che il banco
     * di prova vuole perché misura apposta la configurazione di riferimento.
     */
    threadsBatch?: number
    /**
     * Il batch fisico. Grande fa correre il prefill e gonfia i buffer di
     * calcolo; piccolo tiene bassa la memoria e rende Stop più pronto, perché
     * l'attesa massima per fermarsi è un microbatch intero.
     */
    microBatch?: number
    /**
     * `q8_0` chiede la cache delle chiavi piu' leggera: su un contesto lungo
     * libera quasi meta' della memoria che serve, e quello che si libera
     * diventa contesto.
     *
     * ⛔ Chiedere non e' ottenere. `type_k`/`type_v` sono sperimentali e la
     * compatibilita' dipende dalla combinazione modello × backend × Flash
     * Attention: la creazione del contesto E' il collaudo, e se fallisce il
     * motore ripiega in f16 e lo dichiara.
     */
    kvCacheType?: string
    /**
     * ⭐⭐⭐ COME i pesi entrano in memoria. Assente = come si è sempre
     * fatto (`auto`), e resta il predefinito finché non c'è la misura:
     * `.claude/TACCUINO-VELOCITA-LOCALE-2026-09-10.md`.
     *
     * ⛔ Cambiarla RICARICA i pesi. Agisce su `llama_model_params`, non sul
     * contesto, quindi la strada veloce che riusa i gigabyte già in memoria
     * non la vedrebbe: il ponte se ne accorge e riapre per intero. Chiederla
     * a metà conversazione costa quanto la prima apertura.
     */
    loadMode?: TalosLocalLoadMode
    /**
     * ⭐⭐⭐ Il ripacchettamento dei pesi. Assente = il predefinito di
     * llama.cpp (acceso), e assente NON è `true`: solo così il predefinito
     * resta quello di upstream anche se upstream lo cambia.
     *
     * È una manopola SEPARATA da `loadMode` — verificato nel submodule, è
     * il campo `llama_model_params.use_extra_bufts` (`include/llama.h:338`)
     * e il flag `-nr/--no-repack` (`common/arg.cpp:2413-2416`). ⛔ Ma i due
     * si incrociano: i tensori ripacchettati finiscono in un buffer «extra»
     * che non è quello di default, quindi non passano dalla strada veloce
     * della mmap. ⇒ Il repack accelera il prefill e conviene **quando la
     * mmap è spenta** — la stessa cosa che PocketPal scrive sotto il suo
     * interruttore.
     *
     * ⛔ Riguarda il nostro catalogo più di quanto sembri: llama.cpp
     * ripacchetta anche **Q4_K** e **Q2_K**, non solo Q4_0 — cioè i
     * `*-Q4_K_M.gguf` che scarichiamo di default.
     */
    weightRepack?: boolean
    /**
     * ⭐⭐⭐ DOVE far girare il modello, per NOME — la scelta dell'utente.
     *
     * Owner 2026-09-10: «LA SCELTA RESTA ALL UTENTE, SCEGLIE SEMPRE LUI,
     * CPU GPU O HEXAGON, DI DEFAULT SCEGLIAMO QUELLO PIU VELOCE (DI SOLITO
     * GPU)». Il nome è quello che ggml dichiara di sé — `OpenCL`,
     * `Vulkan`, `HTP` — e la traduzione da «famiglia» a nome vive in
     * `lib/models/localBackendChoice.ts`, non qui.
     *
     * ⛔ Assente = nessuna richiesta = come si è sempre fatto: `gpuLayers`
     * dice QUANTI strati e llama.cpp sceglie DOVE. `none`/`cpu` dicono
     * «nessun offload» ad alta voce, che non è la stessa cosa di tacere.
     *
     * ⛔ Nominare è l'unico modo perché il motore possa poi DIRE quale
     * dispositivo ha preso (`backendDevice`): senza nome quel campo resta
     * vuoto e «quale motore sta girando» torna a essere una deduzione. E
     * un nome che non si risolve fa FALLIRE l'apertura invece di ripiegare
     * in silenzio sulla CPU — la differenza fra «selezionabile» e
     * «realmente utilizzato».
     *
     * ⛔ Cambiarlo RICARICA i pesi, come `loadMode`: il bersaglio vive in
     * `llama_model_params.devices`, cioè in dove i tensori sono stati
     * allocati, e la strada veloce che riusa i gigabyte non lo vedrebbe.
     * Il ponte se ne accorge da solo e riapre per intero.
     */
    backend?: string
    /**
     * Il dispositivo esatto dentro quel registry. Assente = accettato solo
     * se il registry ne espone UNO solo; con due, il motore rifiuta invece
     * di sorteggiare.
     */
    device?: string
}

function recordOf(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object'
        ? value as Record<string, unknown>
        : null
}

function openStageOf(error: unknown): TalosLocalEngineOpenStage {
    const failure = recordOf(error)
    const data = recordOf(failure?.data)
    const stage = data?.stage
    if (
        stage === 'path'
        || stage === 'model-load'
        || stage === 'load-cancelled'
        || stage === 'context'
        || stage === 'sampler'
        || stage === 'template'
        || stage === 'generation'
        || stage === 'unknown'
    ) return stage
    /*
     * ⛔ `load-mode` — il motore rifiuta una modalità di caricamento che non
     * conosce — arriva qui come `unknown`, e la perdita di dettaglio è
     * DELIBERATA, non una dimenticanza.
     *
     * Allargare `TalosLocalEngineOpenStage` costringerebbe a toccare la mappa
     * `LOCAL_OPEN_FAILURE` in `src/lib/chat/providers/localAdapter.ts`, che
     * elenca un messaggio per ogni stadio ed è di un'altra area di lavoro. Il
     * comportamento comunque non cambia di niente: `unknown` non viene
     * riprovato (`talosShouldRetryLocalOpen`) — che è esattamente quello che
     * serve, perché riaprire con meno contesto non rende comprensibile un nome
     * sbagliato — e all'utente arriva lo stesso messaggio generico.
     *
     * E il caso è quasi irraggiungibile da qui: `TalosLocalLoadMode` è
     * un'unione CHIUSA, quindi un nome sbagliato scritto in TypeScript non
     * compila nemmeno. Il cancello nativo esiste per le altre porte — il banco
     * di prova e i test su dispositivo — dove la stringa non passa da questo
     * tipo.
     *
     * 🔜 DEBITO DICHIARATO: quando `localAdapter.ts` potrà essere toccato,
     * aggiungere `'load-mode'` all'unione qui sopra, una voce a
     * `LOCAL_OPEN_FAILURE` e la stringa (in inglese) che dice all'utente che la
     * modalità di caricamento richiesta non è supportata.
     */
    if (stage === 'load-mode') return 'unknown'

    const code = typeof failure?.code === 'string'
        ? failure.code
        : error instanceof Error ? error.message : ''
    if (code === 'TALOS_LLAMA_PATH_REQUIRED' || code === 'TALOS_LLAMA_MODEL_MISSING') {
        return 'path'
    }
    return 'unknown'
}

function nativeCodeOf(error: unknown): string {
    const failure = recordOf(error)
    if (typeof failure?.code === 'string' && failure.code) return failure.code
    if (error instanceof Error && error.message) return error.message
    return 'TALOS_LLAMA_OPEN_FAILED'
}

function integerOf(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : null
}

function generationErrorOf(error: unknown): TalosLocalEngineGenerationError {
    if (error instanceof TalosLocalEngineGenerationError) return error
    const failure = recordOf(error)
    const data = recordOf(failure?.data)
    const nativeCode = typeof failure?.code === 'string' && failure.code
        ? failure.code
        : error instanceof Error && error.message
            ? error.message
            : 'TALOS_LLAMA_GENERATION_FAILED'
    const stage = data?.stage === 'context-required'
        || nativeCode === 'TALOS_LLAMA_CONTEXT_REQUIRED'
        ? 'context-required'
        : 'generation'
    return new TalosLocalEngineGenerationError({
        stage,
        nativeCode,
        promptTokens: integerOf(data?.promptTokens),
        contextTokens: integerOf(data?.contextTokens),
        requiredContextTokens: integerOf(data?.requiredContextTokens),
    })
}

/**
 * Absent on the web, and that is the honest answer rather than an inconvenience.
 *
 * A browser has no NDK, no Hexagon, and no gigabyte of weights on local storage.
 * A JavaScript fallback that "sort of" ran a model would be a lie told in the
 * one place this app promises not to — the one where it says the words never
 * leave the device.
 */
export async function talosLocalEngineStatus(): Promise<TalosLocalEngineStatus> {
    try {
        const status = await plugin.available()
        return {
            available: status.available,
            backends: status.backends,
            loadedPath: status.loadedPath,
            shape: talosModelShapeOf(status.shape, status.kvCacheType),
            kvCacheType: typeof status.kvCacheType === 'string' ? status.kvCacheType : null,
            engineBuild: typeof status.engineBuild === 'string' && status.engineBuild !== ''
                ? status.engineBuild
                : null,
        }
    } catch {
        return {
            available: false, backends: '', loadedPath: null,
            shape: null, kvCacheType: null, engineBuild: null,
        }
    }
}

/** Cosa ha fatto un sondaggio: mai un «fatto» muto — la scheda ha bisogno di sapere se ha girato, e su cosa. */
export interface TalosLocalBackendQualification {
    ran: boolean
    /** `'hot'` (il telefono era troppo caldo) o `'already-proven'` (nessun backend aveva bisogno del sondaggio). Null se `ran`. */
    reason: string | null
    probedCpu: boolean
    cpuInconclusive: boolean
    probedGpu: boolean
    gpuInconclusive: boolean
    probedNpu: boolean
    npuInconclusive: boolean
    decisionBackend: string | null
    decisionReason: string | null
}

const TALOS_LOCAL_BACKEND_QUALIFICATION_UNAVAILABLE: TalosLocalBackendQualification = Object.freeze({
    ran: false, reason: null, probedCpu: false, cpuInconclusive: false,
    probedGpu: false, gpuInconclusive: false, probedNpu: false, npuInconclusive: false,
    decisionBackend: null, decisionReason: null,
})

/**
 * Fa girare il sondaggio del backend, se e quanto serve. Chi chiama deve già
 * avere il consenso — questa funzione non lo chiede e non lo controlla.
 *
 * ⛔ Non lancia mai: un ponte assente, una build web, o un native più vecchio
 * senza questo metodo tornano tutti "non ha girato", mai un'eccezione che
 * romperebbe una chiamata pensata per essere fatta in background, senza
 * bloccare niente.
 */
export async function talosQualifyLocalBackend(path: string): Promise<TalosLocalBackendQualification> {
    try {
        const result = await plugin.qualifyBackend({ path })
        return {
            ran: result.ran === true,
            reason: typeof result.reason === 'string' ? result.reason : null,
            probedCpu: result.probedCpu === true,
            cpuInconclusive: result.cpuInconclusive === true,
            probedGpu: result.probedGpu === true,
            gpuInconclusive: result.gpuInconclusive === true,
            probedNpu: result.probedNpu === true,
            npuInconclusive: result.npuInconclusive === true,
            decisionBackend: typeof result.decisionBackend === 'string' ? result.decisionBackend : null,
            decisionReason: typeof result.decisionReason === 'string' ? result.decisionReason : null,
        }
    } catch {
        return TALOS_LOCAL_BACKEND_QUALIFICATION_UNAVAILABLE
    }
}

/** Feedback for the consent sheet's background run; the sheet closes immediately. */
export async function talosRunProbe(path: string, running?: number): Promise<void> {
    /*
     * ⛔⛔⛔ IL SONDAGGIO ASPETTA IL RISCALDAMENTO — 2026-09-10, la cura dei 32 s.
     *
     * Le due cose partono nello stesso respiro alla prima scelta di un modello
     * locale, e dall'altra parte del ponte finiscono sullo STESSO
     * `Executors.newSingleThreadExecutor()` (`TalosLlamaPlugin`, riga 1303):
     * `qualifyBackend` ci fa girare due aperture piene del modello e due
     * generazioni vere, `localPerformanceProfiles` — che il riscaldamento
     * interroga prima di aprire — ci fa girare uno sha256 di tutto il file.
     * Chi arriva secondo aspetta il primo per intero.
     *
     * ⇒ L'ordine non è indifferente, ed è deciso da chi sta aspettando: il
     * riscaldamento è il tempo che una PERSONA sta guardando adesso, il
     * sondaggio è una misura che nessuno ha chiesto di aspettare (lo dice già
     * la modale: «non blocca la chat»). Prima il primo, poi il secondo — e
     * senza toccare né il Java né il grafo d'avvio.
     *
     * ⛔ `.catch`: un riscaldamento fallito non deve impedire il sondaggio.
     * Sono due lavori indipendenti che qui si mettono solo in fila.
     */
    if (talosWarmInFlight) await talosWarmInFlight.catch(() => undefined)
    const toasts = useTalosMobileToasts()
    const runningId = running ?? toasts.push({ message: talosT('privacyPermissions.localEngineProbe.running') })
    try {
        const result = await talosQualifyLocalBackend(path)
        const backend = result.decisionBackend === 'opencl' ? 'GPU'
            : result.decisionBackend === 'cpu' ? 'CPU' : null
        const message = result.ran && backend
            ? talosT('privacyPermissions.localEngineProbe.resultRan', { backend })
            : result.reason === 'hot'
                ? talosT('privacyPermissions.localEngineProbe.resultNotRun.hot')
                : result.reason === 'already-proven'
                    ? talosT('privacyPermissions.localEngineProbe.resultNotRun.alreadyProven')
                    : talosT('privacyPermissions.localEngineProbe.resultInconclusive')
        toasts.push({ message, durationMs: 10000 })
    } catch {
        toasts.push({ message: talosT('rejectGeneric'), durationMs: 10000 })
    } finally {
        toasts.dismiss(runningId)
    }
}

function templateCapabilitiesOf(raw: unknown): TalosLocalTemplateCapabilities | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const record = raw as Record<string, unknown>
    const supportsTools = record.supportsTools
    const supportsToolCalls = record.supportsToolCalls
    const supportsSystemRole = record.supportsSystemRole
    if (
        typeof supportsTools !== 'boolean'
        || typeof supportsToolCalls !== 'boolean'
        || typeof supportsSystemRole !== 'boolean'
    ) return null
    // ⛔ Un ponte piu' vecchio non manda questo campo, e la sua assenza NON fa
    // fallire la lettura: le altre tre capability sono utili anche da sole.
    // Ma vale `false`, mai «probabilmente si'» — vedi il tipo.
    const grammarForTools = record.grammarForTools === true
    // ⛔ Assente = no: un ponte piu' vecchio non promette un interruttore.
    const thinkingCanBeDisabled = record.thinkingCanBeDisabled === true
    return {
        supportsTools, supportsToolCalls, supportsSystemRole,
        grammarForTools, thinkingCanBeDisabled,
    }
}

/**
 * Preflights the embedded template without loading model tensors. A malformed,
 * unavailable, or old native bridge is an unknown capability result, never an
 * implicit assertion that a GGUF can render OpenAI tool turns.
 */
export async function talosLocalEngineTemplateCapabilities(
    path: string,
): Promise<TalosLocalTemplateCapabilities | null> {
    try {
        const response = await plugin.templateCapabilities({ path })
        if (typeof response?.capabilities !== 'string') return null
        return templateCapabilitiesOf(JSON.parse(response.capabilities))
    } catch {
        return null
    }
}

/** Positivo e finito, o niente. Zero e NaN non sono misure. */
function positiveOf(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/**
 * La forma dichiarata dal motore, accettata solo se completa.
 *
 * Tutto o niente, deliberatamente: un solo campo mancante e il calcolo del
 * tetto darebbe un numero comunque: `headDim` assente lo manderebbe all'infinito,
 * `weightBytes` assente lo alzerebbe di quanto pesa il modello. Un tetto
 * sbagliato è peggio di nessun tetto, perché nessun tetto lascia rispondere il
 * dispositivo mentre uno sbagliato risponde al suo posto.
 *
 * Esportata perché è il confine dove un oggetto arrivato dal ponte diventa una
 * misura, e quel confine merita una prova sua.
 */
/**
 * Quanto pesa un elemento della cache, per tipo.
 *
 * ⛔ Numeri esatti, non arrotondati. `q8_0` è un blocco da **34 byte ogni 32
 * elementi** — 1,0625, non 1. Sembra pedanteria e non lo è: questo numero
 * moltiplica strati × teste × dimensione × contesto, e su un modello da 28
 * strati a 14.000 token l'arrotondamento a 1 sottostima la cache di quasi cento
 * megabyte. Un tetto di contesto ottimista non dà un errore: dà una chat che si
 * apre e poi muore quando la conversazione cresce.
 */
export const TALOS_KV_BYTES_PER_ELEMENT: Readonly<Record<string, number>> = {
    f16: 2,
    q8_0: 34 / 32,
}

export function talosKvBytesPerElement(type: string | null | undefined): number {
    // La f16 è il ripiego, ed è anche quello che llama.cpp fa da sé quando non
    // gli si chiede altro: un tipo che non conosciamo è un tipo che non abbiamo
    // chiesto, e sovrastimare la cache è l'errore innocuo dei due.
    return TALOS_KV_BYTES_PER_ELEMENT[type ?? ''] ?? TALOS_KV_BYTES_PER_ELEMENT.f16!
}

/**
 * ⛔⛔ PERCHÉ `kvHeads = 0` RESTA UN RIFIUTO, e `layers` non è la profondità.
 *
 * Il 2026-09-10 questa funzione tornava `null` su `LFM2.5-2.6B` — un modello
 * IBRIDO, 30 blocchi di cui solo alcuni con cache KV — e da lì
 * `decidiPrefisso()` usciva muto: nessun prefisso congelato, **31 s** al
 * primo token contro i **3,1** di gemma3, e 0 token riusati su 2.847.
 *
 * ⛔ La cura NON è ammorbidire questo cancello. Lo zero arrivava dal ponte,
 * perché `llama_model_n_head_kv()` risponde per lo **strato 0** — che su LFM2 è
 * una convoluzione ricorrente. È stato curato **alla fonte**
 * (`talos_llama_jni.cpp`, `talos_geometria_kv_di()`): il nativo ora conta gli
 * strati che hanno davvero una cache leggendo l'array per-strato del GGUF, e
 * manda `layers = quegli strati`, `kvHeads = le loro teste`.
 *
 * ⇒ Uno zero che arrivasse ancora qui vorrebbe dire una cosa sola e vera:
 * **nessuno** strato ha una cache KV, cioè un modello interamente ricorrente
 * (Mamba, RWKV). Lì l'aritmetica «byte per token» non descrive la memoria, e
 * farla passare con un ripiego a 1 renderebbe il tetto del contesto quasi
 * infinito — la direzione d'errore che fa aprire modelli che non ci stanno.
 * Chi passasse di qui a «sistemare lo zero» sta guardando il sintomo.
 */
export function talosModelShapeOf(raw: unknown, kvCacheType?: string | null): TalosModelShape | null {
    if (raw === null || typeof raw !== 'object') return null
    const record = raw as Record<string, unknown>
    // ⛔ Gli strati CON CACHE, non i blocchi del modello: su un ibrido sono
    // meno, e il ponte manda già il conteggio giusto (vedi la nota qui sopra).
    const layers = positiveOf(record.layers)
    const kvHeads = positiveOf(record.kvHeads)
    const headDim = positiveOf(record.headDim)
    const trainedContext = positiveOf(record.trainedContext)
    const weightBytes = positiveOf(record.weightBytes)
    if (
        layers === null || kvHeads === null || headDim === null
        || trainedContext === null || weightBytes === null
    ) return null
    return {
        layers,
        kvHeads,
        headDim,
        trainedContext,
        weightBytes,
        // La NOSTRA scelta di esecuzione, non un fatto del modello — e ora la
        // legge dal motore invece di darla per scontata: chiedere `q8_0` non
        // è ottenerlo, perché la creazione del contesto è il collaudo e può
        // ripiegare in silenzio sulla f16. Calcolare il tetto sul tipo CHIESTO
        // invece che su quello ottenuto vuol dire promettere una conversazione
        // che poi non entra in memoria.
        kvBytesPerElement: talosKvBytesPerElement(kvCacheType),
    }
}

/**
 * ⭐⭐⭐ DOVE sta girando il modello aperto adesso — i fatti grezzi, non una
 * conclusione.
 *
 * ⛔ Questa funzione non decide niente e non traduce niente: raccoglie i tre
 * campi che il nativo dichiara e li passa a chi sa leggerli
 * (`talosLocalBackendInUse`, `lib/models/localBackendChoice.ts`). Tenere la
 * lettura separata dall'interpretazione è ciò che permette di provare la
 * seconda senza un telefono.
 *
 * ⛔ `offloadDevices: null` significa «questo ponte non lo dichiara», MAI
 * «zero»: un ponte più vecchio che rispondesse zero farebbe concludere «gira
 * su CPU» con la stessa faccia di una certezza. È la stessa disciplina del
 * tri-stato di `weightRepack`.
 *
 * Non solleva mai: un ponte assente o una build web tornano tutti «non lo so».
 */
export async function talosLocalEngineBackendFacts(): Promise<{
    backendDevice: string | null
    gpuLayersEffective: number
    offloadDevices: number | null
    threadPoolSplit: boolean | null
}> {
    try {
        const stato = await plugin.available()
        return {
            backendDevice: typeof stato.backendDevice === 'string' && stato.backendDevice !== ''
                ? stato.backendDevice
                : null,
            gpuLayersEffective: typeof stato.gpuLayersEffective === 'number'
                && Number.isFinite(stato.gpuLayersEffective)
                ? stato.gpuLayersEffective
                : 0,
            offloadDevices: typeof stato.offloadDevices === 'number'
                && Number.isFinite(stato.offloadDevices) && stato.offloadDevices >= 0
                ? stato.offloadDevices
                : null,
            threadPoolSplit: typeof stato.threadPoolSplit === 'boolean'
                ? stato.threadPoolSplit
                : null,
        }
    } catch {
        return {
            backendDevice: null, gpuLayersEffective: 0,
            offloadDevices: null, threadPoolSplit: null,
        }
    }
}

export async function talosLocalEngineOpen(
    path: string,
    options: TalosLocalEngineOpenOptions = {},
): Promise<TalosLocalEngineOpenResult> {
    try {
        return await plugin.open({ path, ...options })
    } catch (error) {
        if (error instanceof TalosLocalEngineOpenError) throw error
        throw new TalosLocalEngineOpenError(openStageOf(error), nativeCodeOf(error))
    }
}

/** Opens once at the requested context and retries only a native context fault. */
export async function talosLocalEngineOpenWithFallback(
    path: string,
    options: TalosLocalEngineOpenOptions = {},
): Promise<TalosLocalEngineOpenResult> {
    const candidates = talosLocalContextCandidates(options.contextTokens)
    for (let index = 0; index < candidates.length; index += 1) {
        try {
            return await talosLocalEngineOpen(path, {
                ...options,
                contextTokens: candidates[index],
            })
        } catch (error) {
            const retry = error instanceof TalosLocalEngineOpenError
                && talosShouldRetryLocalOpen(error.stage)
                && index + 1 < candidates.length
            if (!retry) throw error
        }
    }
    throw new TalosLocalEngineOpenError('unknown', 'TALOS_LLAMA_OPEN_FAILED')
}

/**
 * P3-1 — apre un modello locale PRIMA che il primo messaggio lo richieda,
 * silenziosamente. Zero giudizio ambientale qui (vedi `localWarmTrigger.ts`
 * per il perché): questa porta esegue, non decide.
 *
 * ## La guardia di concorrenza, e perché serve
 *
 * TALOS tiene un solo modello alla volta — se l'utente sceglie un modello
 * locale, poi un altro, prima che la prima apertura sia finita, DUE
 * `open()` native in volo insieme sono esattamente la classe di corsa che
 * TalosLlamaEngine non tollera (un solo thread attore, P0-3). La guardia
 * qui sotto elimina il rischio lato TS senza dover sapere nulla del
 * lifecycle nativo: al massimo un warm in volo per volta, e un secondo
 * trigger arrivato nel frattempo aspetta il primo prima di partire — non
 * lo salta, altrimenti l'ultima scelta dell'utente perderebbe la corsa.
 *
 * ## Perché nessun errore esce da qui
 *
 * Un warm-load fallito non è un fallimento per l'utente: il primo
 * messaggio, quando arriverà davvero, riapre nel percorso normale
 * (`ensureLoaded` in `localAdapter.ts`) esattamente come se il warm non
 * fosse mai partito. È un'ottimizzazione silenziosa, non una promessa —
 * stesso principio già in uso per il congelamento del prefisso.
 */
let talosWarmInFlight: Promise<TalosLocalWarmOutcome> | null = null

/**
 * Le sole opzioni di apertura che il riscaldamento chiede: DOVE.
 *
 * ⛔ Non tocca contesto, thread né cache — il riscaldamento apre col
 * predefinito da sempre, e allargare qui la superficie sarebbe un'altra
 * decisione, non questa. Il bersaglio invece non è rimandabile: cambiarlo dopo
 * costa una rilettura dei pesi, cioè tutto il vantaggio che il riscaldamento
 * esiste per regalare.
 *
 * ⛔ Non solleva mai, come tutto il resto di questo percorso: un ponte più
 * vecchio o una lettura storta valgono «nessuna richiesta», cioè il
 * comportamento di prima.
 */
/**
 * ⛔⛔⛔ QUANTO SI ASPETTA LE MISURE — 2026-09-10, la diagnosi dei 32 secondi.
 *
 * Sembra una manopola e non lo è: è il confine oltre il quale questo
 * riscaldamento smette di essere un'ottimizzazione e diventa il ritardo che
 * doveva togliere.
 *
 * ## Cosa costa DAVVERO `talosLocalPerformanceProfiles`, letto dall'altra parte
 *
 * `TalosLlamaPlugin.localPerformanceProfiles` (righe 1352-1382) gira su
 * `qualificationWorker`, e la PRIMA cosa che fa è `sha256Del(path)` — che apre
 * il GGUF e lo legge **tutto**, a blocchi da 64 KB, senza nessuna cache (righe
 * 1755-1767). Per `LFM2.5-2.6B-Q4_0` sono **1,6 GB letti dal disco per sapere
 * DOVE aprire**, prima ancora di cominciare ad aprire.
 *
 * ⛔ E `qualificationWorker` è `Executors.newSingleThreadExecutor()` (riga
 * 1303) — **lo stesso** su cui `qualifyBackend` fa girare il sondaggio GPU,
 * cioè due aperture piene del modello e due generazioni vere, fino a
 * `MAX_PROBE_ATTEMPTS` tentativi ciascuna. Alla PRIMA scelta di un modello
 * locale le due cose partono insieme (`chatController.selectModel` apre la
 * modale del consenso e accende il riscaldamento nello stesso respiro): se la
 * persona dice «sì, verifica», il riscaldamento resta **in coda dietro il
 * sondaggio**, e il suo `open()` non parte affatto. È così che il modello
 * risultava freddo due minuti dopo essere stato scelto.
 *
 * ## Perché un tetto e non «aspetta e basta»
 *
 * Questo riscaldamento esiste per nascondere l'apertura. Se scoprire DOVE
 * aprire costa più che aprire, l'ottimizzazione si è mangiata da sola. Il
 * tetto non è «rinuncia»: è «apri comunque, col piano che si può fare con i
 * fatti che si hanno già» — e i fatti che restano sono esattamente quelli che
 * contano di più, perché la scelta MANUALE della persona non passa di qui
 * (vive nelle Preferences, non sul ponte nativo) e non si perde mai.
 *
 * ⛔ Il numero è una PAZIENZA, non una misura del telefono: 1,5 s è il tempo
 * oltre il quale l'attesa smette di essere un dettaglio del ponte e comincia a
 * essere un pezzo dei secondi che stiamo cercando di togliere. Va rimisurato
 * il giorno in cui il lato nativo ricorderà lo sha invece di rifarlo — quella
 * sì sarebbe la cura vera, e sta in Java.
 */
const TALOS_WARM_PROFILES_BUDGET_MS = 1_500

/** Il valore, o `null` se non è arrivato entro il tetto. Non annulla niente: smette di aspettare. */
async function entroIlTetto<T>(lavoro: Promise<T>, tettoMs: number): Promise<T | null> {
    let sveglia: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            lavoro,
            new Promise<null>((risolvi) => { sveglia = setTimeout(() => risolvi(null), tettoMs) }),
        ])
    } finally {
        if (sveglia !== undefined) clearTimeout(sveglia)
    }
}

/** Cosa si chiederà al motore, e se lo si è deciso senza le misure. */
export interface TalosWarmBackendPlan {
    options: { gpuLayers?: number, backend?: string }
    /**
     * Vero quando il piano è stato fatto SENZA i profili misurati — perché non
     * potevano cambiarlo, o perché non sono arrivati in tempo. Non è un
     * dettaglio interno: è la differenza fra «CPU perché l'ha vinta» e «CPU
     * perché non ho aspettato», e chi legge lo stato deve poterle distinguere.
     */
    withoutMeasuredProfiles: boolean
}

async function backendDelRiscaldamento(
    path: string,
    status: TalosLocalEngineStatus,
): Promise<TalosWarmBackendPlan> {
    try {
        const [preferenza, fatti] = await Promise.all([
            talosStoredLocalBackendPreference(),
            talosLocalEngineBackendFacts(),
        ])
        /*
         * ⭐ La domanda cara si fa solo se la sua risposta può cambiare
         * qualcosa. `talosDecideLocalBackend` legge `profiles` SOLO dopo il
         * primo cancello: con una scelta manuale valida esce alla prima riga e
         * i profili non li guarda mai (`localBackendChoice.ts`, righe
         * 258-265). ⇒ In quel caso leggere 1,6 GB dal disco per ottenere un
         * elenco che nessuno leggerà è puro ritardo, e non chiederlo non è
         * un'approssimazione: è la stessa risposta, senza il costo.
         */
        const misureNonServono = preferenza.mode === 'manual' && preferenza.manual !== null
        const profili = misureNonServono
            ? []
            : await entroIlTetto(talosLocalPerformanceProfiles(path), TALOS_WARM_PROFILES_BUDGET_MS)
        return {
            options: talosLocalBackendPlan({
                preference: preferenza,
                backends: status.backends,
                offloadDevices: fatti.offloadDevices,
                profiles: profili ?? [],
                // Si sta per aprire comunque: nessun candidato è già attivo, quindi
                // nessuno merita lo sconto sul costo di transizione (CR-12).
                activeRegistry: null,
            }).options,
            withoutMeasuredProfiles: profili === null,
        }
    } catch {
        return { options: {}, withoutMeasuredProfiles: true }
    }
}

/**
 * ⛔⛔ COM'E' ANDATA — 2026-09-10.
 *
 * Prima tornava `void`, e `void` era il difetto: fra «l'ho aperto in 31
 * secondi», «era gia' aperto», «su questa build non c'e' motore» e «ci ho
 * provato e non ce l'ho fatta» chi chiamava non poteva distinguere niente, e
 * infatti nessuno ha mai potuto dire perche' il modello risultasse freddo. Il
 * contratto si ALLARGA: chi non lo legge si comporta esattamente come prima
 * (nessun errore esce ancora da qui), chi lo legge puo' finalmente dirlo a chi
 * sta aspettando.
 *
 * `ms` e' il tempo dell'APERTURA e nient'altro — non il tempo alla prima
 * parola. Tenerli separati e' meta' dell'ordine dell'owner del 10/09: confusi
 * insieme fanno sembrare lento il motore quando e' lento il disco.
 */
export type TalosLocalWarmOutcome =
    | { opened: true, ms: number, withoutMeasuredProfiles: boolean }
    | { opened: false, why: 'already-open' | 'engine-absent' | 'failed' }

export async function talosWarmLocalModel(path: string): Promise<TalosLocalWarmOutcome> {
    if (talosWarmInFlight) await talosWarmInFlight.catch(() => undefined)
    const eseguito = (async (): Promise<TalosLocalWarmOutcome> => {
        const inizio = Date.now()
        try {
            const status = await talosLocalEngineStatus()
            if (!status.available) return { opened: false, why: 'engine-absent' }
            if (status.loadedPath === path) return { opened: false, why: 'already-open' }
            /*
             * ⛔⛔ IL RISCALDAMENTO DECIDE DOVE, altrimenti decide per tutti.
             *
             * Questa apertura arriva PRIMA del primo messaggio, e
             * `ensureLoaded` in `localAdapter.ts` torna subito se il modello
             * chiesto è già quello aperto. ⇒ Se qui non si chiedesse il
             * backend, la scelta della persona non verrebbe mai applicata:
             * l'aggancio nell'adattatore esisterebbe e nessun percorso
             * predefinito lo attraverserebbe — la forma esatta del difetto che
             * questo lavoro chiude (`la-gpu-non-e-spedita-non-e-scelta-non-e-usata`).
             *
             * La politica non vive qui: è la stessa funzione pura che chiama
             * l'adattatore, `talosLocalBackendPlan`.
             */
            const piano = await backendDelRiscaldamento(path, status)
            await talosLocalEngineOpenWithFallback(path, piano.options)
            return {
                opened: true,
                ms: Date.now() - inizio,
                withoutMeasuredProfiles: piano.withoutMeasuredProfiles,
            }
        } catch {
            // Vedi sopra: un'ottimizzazione, non una promessa. Ma adesso lo
            // DICE invece di tacere: il primo messaggio riaprira' comunque, e
            // chi aspetta ha il diritto di sapere che l'anticipo e' saltato.
            return { opened: false, why: 'failed' }
        }
    })()
    talosWarmInFlight = eseguito
    try {
        return await eseguito
    } finally {
        if (talosWarmInFlight === eseguito) talosWarmInFlight = null
    }
}

export interface TalosLocalModelFile {
    path: string
    bytes: number
    name: string
    /**
     * Se con questo file si puo' PARLARE.
     *
     * Falso per un proiettore multimodale: un GGUF valido, che pero' non genera
     * un token. Resta nella lista dei file — occupa spazio e chi vuole liberarlo
     * deve poterlo trovare — ma la chat non deve offrirlo.
     *
     * ⛔ `undefined` significa «non lo so», e nel dubbio si tratta come
     * conversabile: un lato nativo piu' vecchio non risponde, e nascondere un
     * modello vero e' un danno che l'utente non puo' riparare.
     */
    conversational?: boolean
    /**
     * Epoch milliseconds from the file itself. The question a person asks
     * right after a download is "which one did I just get", and a list that
     * can only be ordered by name or size cannot answer it.
     *
     * Zero when the filesystem refused to say — `lastModified()` returns 0
     * rather than throwing, and a 1970 date on screen would be a lie the
     * list tells confidently.
     */
    modifiedAt: number
}

/** A folder the walk could not open, and the cause it reported. */
export interface TalosLocalModelUnreadable {
    path: string
    reason: string
}

export interface TalosLocalModelListing {
    models: TalosLocalModelFile[]
    /**
     * Empty when the answer is complete. Anything in here means the list above
     * is a PARTIAL answer, and "no models" must not be said on its own.
     */
    unreadable: TalosLocalModelUnreadable[]
}

/**
 * The models on this device that can actually be opened.
 *
 * Read from the disk on every call, never remembered. Android reclaims storage
 * without asking, and the user can delete a file from the system's own storage
 * screen; a cached list would go on offering something that is gone, and fail
 * halfway into loading it rather than at the moment of choosing.
 *
 * Returns what it found AND what it could not look at. This used to be an array
 * with `catch { return [] }` around it, which turned three different situations
 * — nothing downloaded, a folder that refused to open, and the bridge itself
 * failing — into one sentence in the model picker: "no models". On a tablet
 * holding a two-gigabyte model that sentence sent the search in the wrong
 * direction for three rounds. A failure that reaches the user as an empty list
 * is a failure that has been hidden, not handled.
 */
export async function talosLocalInstalledModels(): Promise<TalosLocalModelListing> {
    const { models, unreadable } = await plugin.installed()
    return {
        // `modifiedAt` is optional on the wire so an older native side —
        // side-by-side installs make that a real case — degrades to «date
        // unknown» instead of putting 1970 at the top of the list.
        models: Array.isArray(models)
            ? models.map((file) => ({ ...file, modifiedAt: file.modifiedAt ?? 0 }))
            : [],
        unreadable: Array.isArray(unreadable) ? unreadable : [],
    }
}

/**
 * The conversation, punctuated the way THIS model expects.
 *
 * Deliberately not built in TypeScript. Every model family marks turns
 * differently and the marks live inside the GGUF; writing "User: … Assistant: …"
 * here would work in the sense of producing output, and would quietly cost
 * quality on every answer — a defect that reads as the model being weak and
 * sends people to download a different one.
 *
 * Rejects with `TALOS_LLAMA_NO_CHAT_TEMPLATE` when the file declares none. That
 * is a refusal to be shown, not a case to paper over.
 */
export async function talosLocalEngineChatPlan(
    turns: ReadonlyArray<TalosLocalEngineTurn>,
    tools?: readonly unknown[],
    thinking = true,
): Promise<TalosLocalEngineChatPlan> {
    const plan = await plugin.chatPrompt({ turns, tools, thinking })
    return {
        prompt: plan.prompt,
        promptTokens: integerOf(plan.promptTokens) ?? 0,
        contextTokens: integerOf(plan.contextTokens) ?? 0,
    }
}

/**
 * P2-3 — una lettura, adesso. Non lancia mai: un servizio assente o una
 * chiamata che il device rifiuta tornano già `null` campo per campo dal
 * lato nativo (vedi `TalosPerformanceSignals.java`), non un'eccezione che
 * spegnerebbe un segnale opzionale.
 */
export async function talosLocalPerformanceSignals(): Promise<TalosPerformanceSignals> {
    return plugin.performanceSignals()
}

/**
 * ⭐⭐ QUANTO SERVE, chiesto PRIMA di caricare i pesi.
 *
 * ## Il cerchio che questa funzione spezza
 *
 * Il contesto giusto per una conversazione si conosce solo dopo aver applicato
 * il template del modello e contato i token — e applicare il template richiedeva
 * un modello aperto, mentre aprirlo richiede di sapere quanto contesto dargli.
 * La soluzione era: apri col predefinito, scopri che serve di più, riapri.
 * **Due aperture per un messaggio.**
 *
 * `vocab_only` carica il solo vocabolario, e con quello si applica il template e
 * si conta. La forma arriva dai metadati GGUF, che si leggono senza caricare
 * niente. MISURATO sul Pad il 2026-08-07: **~200 ms** contro **2938 ms** di
 * apertura, e la forma letta dai metadati è risultata IDENTICA a quella
 * dichiarata dal modello aperto.
 *
 * ## `null` non è un guasto
 *
 * Contro un lato nativo più vecchio — caso reale, le installazioni affiancate —
 * il metodo non esiste. Chi chiama torna al comportamento di prima: apre col
 * predefinito e allarga se serve. Una funzione che serve a **risparmiare** un
 * lavoro non deve poter impedire quel lavoro.
 */
export async function talosLocalEnginePlanPrompt(
    path: string,
    turns: ReadonlyArray<TalosLocalEngineTurn>,
    tools?: readonly unknown[],
    thinking = true,
): Promise<{ promptTokens: number, shape: TalosModelShape | null } | null> {
    try {
        const risposta = await plugin.planPrompt({ path, turns, tools, thinking })
        const grezzo: unknown = JSON.parse(risposta.plan)
        const record = grezzo as Record<string, unknown>
        const promptTokens = integerOf(record.promptTokens)
        if (promptTokens === null || promptTokens <= 0) return null
        return { promptTokens, shape: talosModelShapeOf(record) }
    } catch {
        return null
    }
}

/** Compatibility projection for callers that only need the formatted text. */
export async function talosLocalEngineChatPrompt(
    turns: ReadonlyArray<TalosLocalEngineTurn>,
    tools?: readonly unknown[],
): Promise<string> {
    return (await talosLocalEngineChatPlan(turns, tools)).prompt
}

export async function talosLocalEngineClose(): Promise<void> {
    await plugin.close()
}

export async function talosLocalEngineCancel(): Promise<void> {
    await plugin.cancel()
}

/**
 * Generates, calling `onDelta` with each new piece as it arrives.
 *
 * The listener is attached BEFORE the generation starts and removed in a
 * `finally`. Both matter, and for opposite reasons: attach late and the opening
 * words of every answer are lost, because the model is already talking; forget
 * to remove and the next generation is drawn into the previous conversation,
 * which looks like the app hallucinating rather than like a leaked subscription.
 */
export async function talosLocalEngineGenerate(
    prompt: string,
    onDelta: (delta: string) => void,
    options: { maxTokens?: number, stopAtEndOfGeneration?: boolean } = {},
): Promise<TalosLocalEngineGeneration> {
    const subscription = await plugin.addListener('token', (payload) => {
        if (typeof payload?.delta === 'string' && payload.delta !== '') {
            onDelta(payload.delta)
        }
    })
    try {
        try {
            return await plugin.generate({ prompt, ...options })
        } catch (error) {
            throw generationErrorOf(error)
        }
    } finally {
        await subscription.remove()
    }
}

/**
 * Gli stadi dell'ultima generazione locale.
 *
 * ⛔ È una DIAGNOSI, non una statistica da mostrare in chat. Serve a rispondere
 * alla sola domanda che finora non aveva risposta: quando la prima parola tarda
 * nove secondi, quale dei cinque stadi se li è presi.
 *
 * `reusedTokens` alto e `prefillMs` basso significa che il contesto sta
 * lavorando: il turno nuovo rielabora solo ciò che è stato aggiunto.
 * `reusedTokens` a zero su un turno che non è il primo significa che qualcosa
 * ha invalidato il prefisso — template cambiato, tool diversi, un'altra chat —
 * ed è la traccia da seguire.
 *
 * Torna `null` se il motore non è aperto: chiedere i tempi di una generazione
 * che non c'è stata non è un errore, è una domanda senza risposta.
 */
export interface TalosLocalEngineTimings {
    tokenizeMs: number
    prefixMs: number
    prefillMs: number
    firstTokenMs: number
    totalMs: number
    promptTokens: number
    reusedTokens: number
    newTokens: number
    producedTokens: number
    reusedContext: boolean
    /**
     * ⭐⭐⭐ Il motore ha RIFIUTATO il taglio parziale della KV.
     *
     * ⛔⛔ Distingue due casi che «zero riusati» confonde in uno:
     *   - il prefisso e' cambiato    ⇒ difetto NOSTRO, curabile
     *   - la memoria non sa tagliare ⇒ architettura, non curabile
     *
     * `llama_memory_seq_rm` puo' fallire per costruzione. ⇒ Le architetture
     * con KV condivisa fra gli ultimi strati - la famiglia Gemma - sono quel
     * caso: `ggml-org/llama.cpp#21468` documenta che li' il riuso della cache
     * **non e' supportato**, nemmeno con flash attention e SWA piena.
     *
     * ⛔ Facoltativo: un ponte nativo piu' vecchio non lo manda, e allora e'
     * IGNOTO - non «non e' successo».
     */
    partialTrimRefused?: boolean
}

/**
 * Tara i thread di QUESTO modello su QUESTO telefono, e restituisce la misura.
 *
 * ⛔ Costa: prova ogni candidato con un prefill vero e **azzera la
 * conversazione in memoria**. Per questo non si chiama da sola all'apertura —
 * aggiungerebbe secondi al primo messaggio, che e' gia' la parte lenta — ma da
 * un comando esplicito, dove chi lo tocca sa cosa sta chiedendo e vede i numeri
 * che ne escono.
 */
export interface TalosMeasuredThreadTuning {
    threads: number
    threadsBatch: number
    prefillPerSecond: number
    decodePerSecond: number
    grid: Array<{ threads: number, prefill: number, decode: number }>
}

export async function talosMeasureThreadTuning(
    candidates: readonly number[],
    probeTokens = 256,
): Promise<TalosMeasuredThreadTuning | null> {
    if (candidates.length === 0) return null
    try {
        const raw = (await plugin.tuneThreads({ candidates: [...candidates], probeTokens })).tuning
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        const misura = parsed as TalosMeasuredThreadTuning
        return Array.isArray(misura.grid) ? misura : null
    } catch {
        // Una taratura fallita non e' un guasto del modello: si continua col
        // punto di partenza derivato, che e' esattamente cio' che c'era prima.
        return null
    }
}

/**
 * ⭐ Congela il prefisso, se ne vale la pena.
 *
 * Il verdetto lo dà `talosShouldFreezePrefix` e non questa funzione: qui si
 * scrive o non si scrive, e il perché torna a chi ha chiesto. Un motivo che
 * resta dentro è un motivo che il Doctor non può mostrare.
 *
 * ⛔ Non solleva mai. Congelare è un'ottimizzazione: se fallisce si torna a
 * calcolare, che è ciò che si faceva prima. Far cadere un invio perché non si è
 * potuto scrivere una cache sarebbe scambiare il rimedio per la cura.
 */
export async function talosFreezePrefix(path: string, prefixPrompt?: string): Promise<{
    bytes: number
    ms: number
    /**
     * ⛔⛔ DUE GUASTI DIVERSI, e per mesi uscivano dalla stessa porta.
     *
     * Fino al 2026-09-10 questa funzione rispondeva `bytes: 0` sia quando il
     * **motore** rifiutava di scrivere, sia quando il **ponte** esplodeva — e
     * chi chiamava non aveva modo di distinguerli, quindi diceva alla persona
     * la frase piu' prudente delle due, cioe' quella sbagliata meta' delle
     * volte.
     *
     * Non sono la stessa cosa, e alla fonte sono proprio due strade:
     * `llama_state_seq_save_file` **torna 0** quando il salvataggio non
     * riesce, e il wrapper C **cattura da se'** qualunque eccezione prima di
     * tornare quello zero (`llama-context.cpp:4098-4106`, letto nel nostro
     * submodule pinnato il 2026-09-10). ⇒ Uno zero che arriva fin qui e' una
     * risposta del motore; un'eccezione che arriva fin qui **non lo e'**: e'
     * il ponte, il plugin o l'argomento.
     *
     *   - `'written'`        il file c'e'
     *   - `'engine-refused'` il motore ha detto di no, e lo ha detto lui
     *   - `'bridge-failed'`  la chiamata non e' mai arrivata a una risposta
     */
    reason: 'written' | 'engine-refused' | 'bridge-failed'
}> {
    try {
        const esito = await plugin.saveState(
            prefixPrompt === undefined ? { path } : { path, prefixPrompt },
        )
        const bytes = esito.saved ? esito.bytes : 0
        return { bytes, ms: esito.ms, reason: bytes > 0 ? 'written' : 'engine-refused' }
    } catch {
        // ⛔ Si continua a NON sollevare: chi chiama la invoca con `void` a
        // risposta gia' consegnata, e una promessa rifiutata senza gestore in
        // una WebView e' un errore non gestito a schermo. Cambia solo che
        // adesso il guasto ha un NOME invece di travestirsi da rifiuto.
        return { bytes: 0, ms: 0, reason: 'bridge-failed' }
    }
}

/**
 * ⭐⭐⭐ QUALI MOTORI ENTRANO DAVVERO — e per gli altri PERCHÉ no.
 *
 * ## Il fatto che l'ha resa necessaria
 *
 * Misurato sul Pad il 2026-09-10: **trenta strati su trenta assegnati alla
 * CPU**, con **3,2 MB** di `libggml-opencl.so` dentro il pacchetto installato
 * che nessuno eseguiva. Il driver di sistema c'è ed è pubblico, la nostra
 * libreria lo cerca — e nel logcat non compariva **nessuna** riga di
 * registrazione, né di successo né di errore.
 *
 * ⛔ Non poteva comparire: `ggml_backend_load_all_from_path` sceglie
 * `silent = true` sotto `NDEBUG`, e la nostra è una build di rilascio. Il
 * fallimento è **muto per costruzione**, ed è un problema noto upstream con
 * `GGML_BACKEND_DL` — https://github.com/ggml-org/llama.cpp/issues/22547 e
 * https://github.com/ggml-org/llama.cpp/discussions/12821 (letti il 2026-09-10).
 *
 * ## Cosa risponde, e cosa NON risponde
 *
 * Risponde a: *questa libreria entra su questo telefono, sì o no, e se no con
 * quale errore.* **Non** risponde a «la GPU è più veloce»: quello lo dice il
 * sondaggio, che è un'altra cosa e costa batteria.
 *
 * ⛔ Ha un EFFETTO: caricare una libreria registra il suo backend. Per questo
 * non gira da sola e non sta in nessun percorso automatico — si chiama quando
 * una persona lo chiede.
 *
 * `null` quando il ponte non risponde o il rapporto è illeggibile: «non lo so»,
 * che non è «nessun motore».
 */
export async function talosProbeBackendLoad(): Promise<{
    directory: string
    attempts: Array<{ library: string, loaded: boolean, registry?: string, deviceCount?: number }>
    registriesBefore?: number
    registriesAfter?: number
    error?: string
    ms: number
} | null> {
    try {
        const esito = await plugin.probeBackendLoad()
        const letto: unknown = JSON.parse(esito.report)
        if (letto === null || typeof letto !== 'object') return null
        const record = letto as Record<string, unknown>
        if (!Array.isArray(record.attempts)) return null
        return {
            directory: typeof record.directory === 'string' ? record.directory : '',
            attempts: record.attempts as Array<{ library: string, loaded: boolean }>,
            ...(typeof record.registriesBefore === 'number' ? { registriesBefore: record.registriesBefore } : {}),
            ...(typeof record.registriesAfter === 'number' ? { registriesAfter: record.registriesAfter } : {}),
            ...(typeof record.error === 'string' ? { error: record.error } : {}),
            ms: esito.ms,
        }
    } catch {
        return null
    }
}

/**
 * ⭐⭐⭐ IN CHE FORMATO SONO I PESI DI QUESTO MODELLO — `Q4_0`, `Q4_K_M`…
 *
 * ## Perche' esiste, con il numero che l'ha resa necessaria
 *
 * Misurato sul Pad l'11/09/2026. Stesso modello, stesso giorno, stesso
 * telefono; cambia solo il formato:
 *
 * ```
 *   Qwen3-4B  Q4_0     NPU  lettura 1126 t/s
 *   Qwen3-4B  Q4_K_M   NPU  lettura   55,7      ← venti volte piu' piano
 *                      GPU  lettura  206
 * ```
 *
 * L'NPU ha kernel nativi solo per alcuni formati; su tutto il resto ricade
 * operazione per operazione, e il rimbalzo costa piu' del calcolo. ⇒ Accendere
 * l'NPU su un Q4_K_M rende l'app **quattro volte piu' lenta** di non averla.
 *
 * ## ⛔ Dal FILE, mai dal nome del file
 *
 * `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` lo dice nel nome, ed e' una coincidenza
 * di convenzione: chi rinomina un file cambierebbe il motore su cui gira. Qui
 * si legge `general.file_type` dall'intestazione GGUF, che e' il modello a
 * dichiarare di se'.
 *
 * ## Il cache, e perche' e' per percorso
 *
 * La risposta non cambia finche' il file non cambia, e il percorso di un GGUF
 * porta gia' la revisione dentro. Una lettura per modello per avvio: il costo
 * e' un `open` e qualche kilobyte, ma ripeterla a ogni messaggio sarebbe un
 * costo a ogni messaggio.
 *
 * @returns `null` quando non si e' potuto leggere — e `null` **non e'** un
 *     formato: chi decide deve trattarlo come «non lo so», che per l'NPU
 *     significa no.
 */
const formatiLetti = new Map<string, string | null>()

export async function talosLocalModelQuantisation(path: string): Promise<string | null> {
    if (!path) return null
    const gia = formatiLetti.get(path)
    if (gia !== undefined) return gia
    let esito: string | null = null
    try {
        const risposta = await plugin.modelFormat({ path })
        const letto: unknown = JSON.parse(risposta.format)
        if (letto !== null && typeof letto === 'object') {
            const tipo = (letto as Record<string, unknown>).fileType
            if (typeof tipo === 'number' && tipo >= 0) {
                const { talosQuantisationOfFileType } = await import('@/lib/models/gguf')
                esito = talosQuantisationOfFileType(tipo)
            }
        }
    } catch {
        esito = null
    }
    formatiLetti.set(path, esito)
    return esito
}

/**
 * ⭐⭐⭐ A CHE PUNTO E' IL CARICAMENTO — i 50 secondi che nessun numero diceva.
 *
 * Misurato sul Pad il 10/09 (ledger §44): sul primo messaggio di una chat
 * nuova, `gemma-4-E2B-it-Q4_0` sulla GPU costa **76 secondi** alla prima
 * parola, e **50** sono i soli tensori che si spostano dal file ai buffer.
 * In quei 50 secondi il telefono mostrava tre puntini e nient'altro, e la riga
 * dei numeri sotto la risposta ne dichiarava **24,2** — perche' il suo orologio
 * parte a modello gia' aperto.
 *
 * ⛔ Si CHIEDE, non arriva. Chi disegna la barra la chiama a intervalli; il
 * nativo tiene un contatore atomico che il thread del caricamento aggiorna a
 * ogni tensore. Una callback per tensore attraverserebbe il confine JNI 601
 * volte per un modello da 2,8 GiB — e' scritto in testa al JNI, e vale qui.
 *
 * ⛔ `null` non e' zero e non e' un errore: e' **«non lo so»**, cioe' il ponte
 * non ha risposto. Chi disegna deve lasciare la barra com'era, non riportarla
 * a zero: un progresso che torna indietro sembra un caricamento ricominciato.
 */
export async function talosLocalModelLoadProgress(): Promise<number | null> {
    try {
        const esito = await plugin.loadProgress()
        if (!esito.loading) return null
        const permille = Number(esito.permille)
        if (!Number.isFinite(permille) || permille < 0) return null
        return Math.min(1, permille / 1000)
    } catch {
        return null
    }
}

/**
 * Ferma il caricamento in corso.
 *
 * ⛔ Chi stava aprendo riceve lo stesso `0` di un errore qualunque: la
 * differenza sta in `lastOpenError`, che dice `load-cancelled`. A schermo
 * restano due frasi diverse, perche' «l'hai fermato tu» non e' «non ce l'ha
 * fatta» — e una persona che ha appena premuto annulla non deve leggere che
 * qualcosa e' andato storto.
 *
 * ⛔ Premerlo quando non sta caricando niente non fa danni: il flag si azzera
 * all'inizio di ogni apertura, quindi non puo' uccidere quella successiva.
 */
export async function talosCancelLocalModelLoad(): Promise<boolean> {
    try {
        const esito = await plugin.cancelLoad()
        return esito.ok === true
    } catch {
        return false
    }
}

/**
 * Rilegge un prefisso congelato.
 *
 * ⛔ Il percorso deve venire da `talosPrefixCacheFileName`. Qui non si può
 * verificare: il formato di llama.cpp non porta l'impronta del nostro prompt, e
 * uno stato caricato sul modello sbagliato **non dà errore** — dà risposte
 * sbagliate, che è il modo peggiore di fallire.
 *
 * `0` è la condizione NORMALE la prima volta e dopo ogni cambio: il file non
 * c'è, e si calcola.
 */
export async function talosThawPrefix(path: string): Promise<{
    tokens: number
    ms: number
}> {
    try {
        const esito = await plugin.loadState({ path })
        return { tokens: esito.restoredTokens, ms: esito.ms }
    } catch {
        return { tokens: 0, ms: 0 }
    }
}

/**
 * ⛔ LO SFRATTO, che è la metà mancante del congelamento.
 *
 * Un prefisso pesa quasi un gigabyte e ne nasce uno per ogni combinazione di
 * modello, contesto, cache e interruttore del ragionamento. Senza questo,
 * usare TALOS riempie il telefono **in silenzio**.
 *
 * La politica sta in `prefixCache.ts`, pura e provata; qui si legge il disco e
 * si cancella. Non solleva mai: se lo sfratto fallisce si è occupato spazio,
 * non si è rotto niente, e la volta dopo si riprova.
 *
 * @returns quanti file sono stati tolti e quanti byte liberati.
 */
export async function talosEvictPrefixes(): Promise<{ removed: number, bytes: number }> {
    try {
        const { caches } = await plugin.prefixCaches()
        const daTogliere = new Set(talosPrefixesToEvict(caches))
        if (daTogliere.size === 0) return { removed: 0, bytes: 0 }
        let bytes = 0
        let removed = 0
        for (const voce of caches) {
            if (!daTogliere.has(voce.path)) continue
            const { deleted } = await plugin.deleteInstalled({ path: voce.path })
            if (deleted) {
                removed += 1
                bytes += voce.bytes
            }
        }
        return { removed, bytes }
    } catch {
        return { removed: 0, bytes: 0 }
    }
}

/** Quanto occupano i prefissi congelati, per il Doctor. */
export async function talosPrefixCacheUsage(): Promise<{ count: number, bytes: number } | null> {
    try {
        const { caches, totalBytes } = await plugin.prefixCaches()
        return { count: caches.length, bytes: totalBytes }
    } catch {
        return null
    }
}

export async function talosLocalEngineTimings(): Promise<TalosLocalEngineTimings | null> {
    try {
        const raw = (await plugin.lastTimings()).timings
        if (typeof raw !== 'string' || raw === '') return null
        const parsed: unknown = JSON.parse(raw)
        return parsed && typeof parsed === 'object'
            ? parsed as TalosLocalEngineTimings
            : null
    } catch {
        return null
    }
}

/**
 * Cancella un modello scaricato.
 *
 * Owner 2026-08-04: sui modelli locali non si poteva fare CRUD — si scaricavano
 * e non si toglievano, se non dalle impostazioni di sistema, cioe' uscendo da
 * TALOS per rimediare a una cosa fatta dentro TALOS.
 *
 * `deleted: false` non e' un guasto: vuol dire che il file non c'era gia' piu'
 * — l'esito che si voleva, ottenuto da qualcun altro.
 */
export async function talosLocalModelDelete(path: string): Promise<boolean> {
    const { deleted } = await plugin.deleteInstalled({ path })
    return deleted
}

export interface TalosLocalPerformanceProfile {
    backendRegistry: string
    backendDevice: string | null
    outcome: 'CORRECT' | 'FAILED'
    ttftMs: number
    /** `null` quando non misurato — mai 0, che sarebbe una velocità infinita. */
    decodeTokPerSec: number | null
    /** D-53: token letti al secondo nel prefill del sondaggio. `null` = non misurato. */
    prefillTokPerSec: number | null
    /** D-53: quanto e' costato aprire su questo motore. `null` = non misurato. */
    openMs: number | null
    qualificationLevel: 'Q0' | 'Q1' | 'Q2'
    measuredAtMs: number
}

/**
 * P1-5 — i profili misurati per questo modello, sull'identità di adesso.
 *
 * Assente sul web per lo stesso motivo di `talosLocalEngineStatus`: nessun
 * profilo esiste dove non esiste il motore che li misura. Un errore di
 * lettura (plugin assente, file corrotto) torna un elenco vuoto — "nessun
 * profilo" è la lettura onesta di entrambi i casi, mai un'eccezione che il
 * selettore dovrebbe intercettare per continuare a funzionare.
 */
export async function talosLocalPerformanceProfiles(
    path: string,
): Promise<readonly TalosLocalPerformanceProfile[]> {
    try {
        const { profiles } = await plugin.localPerformanceProfiles({ path })
        return profiles.map((p) => ({
            backendRegistry: p.backendRegistry,
            backendDevice: p.backendDevice,
            outcome: p.outcome,
            ttftMs: p.ttftMs,
            decodeTokPerSec: p.decodeTokPerSec >= 0 ? p.decodeTokPerSec : null,
            // D-53: stessa regola del decode — assente o non positivo vale «non
            // misurato», mai zero: zero token/s in lettura sarebbe un prefill
            // infinito, zero ms di apertura un'apertura gratis.
            prefillTokPerSec: typeof p.prefillTokPerSec === 'number' && p.prefillTokPerSec > 0
                ? p.prefillTokPerSec : null,
            openMs: typeof p.openMs === 'number' && p.openMs >= 0 ? p.openMs : null,
            qualificationLevel: p.qualificationLevel,
            measuredAtMs: p.measuredAtMs,
        }))
    } catch {
        return []
    }
}
