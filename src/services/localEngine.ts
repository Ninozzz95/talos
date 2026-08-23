import { registerPlugin } from '@capacitor/core'
import {
    talosLocalContextCandidates,
    talosShouldRetryLocalOpen,
} from '@/lib/models/localContextPolicy'
import type { TalosModelShape } from '@/lib/models/fit'
import { talosPrefixesToEvict } from '@/lib/models/prefixCache'

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
            qualificationLevel: 'Q0' | 'Q1' | 'Q2'
            measuredAtMs: number
        }>
    }>
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

export type TalosLocalEngineOpenStage =
    | 'path'
    | 'model-load'
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
        || stage === 'context'
        || stage === 'sampler'
        || stage === 'template'
        || stage === 'generation'
        || stage === 'unknown'
    ) return stage

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
    decisionBackend: string | null
    decisionReason: string | null
}

const TALOS_LOCAL_BACKEND_QUALIFICATION_UNAVAILABLE: TalosLocalBackendQualification = Object.freeze({
    ran: false, reason: null, probedCpu: false, cpuInconclusive: false,
    probedGpu: false, gpuInconclusive: false, decisionBackend: null, decisionReason: null,
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
            decisionBackend: typeof result.decisionBackend === 'string' ? result.decisionBackend : null,
            decisionReason: typeof result.decisionReason === 'string' ? result.decisionReason : null,
        }
    } catch {
        return TALOS_LOCAL_BACKEND_QUALIFICATION_UNAVAILABLE
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
    return { supportsTools, supportsToolCalls, supportsSystemRole }
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

export function talosModelShapeOf(raw: unknown, kvCacheType?: string | null): TalosModelShape | null {
    if (raw === null || typeof raw !== 'object') return null
    const record = raw as Record<string, unknown>
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
}> {
    try {
        const esito = await plugin.saveState(
            prefixPrompt === undefined ? { path } : { path, prefixPrompt },
        )
        return { bytes: esito.saved ? esito.bytes : 0, ms: esito.ms }
    } catch {
        return { bytes: 0, ms: 0 }
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
            qualificationLevel: p.qualificationLevel,
            measuredAtMs: p.measuredAtMs,
        }))
    } catch {
        return []
    }
}
