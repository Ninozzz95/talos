import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import type {
    TalosMobileCompletionInput,
    TalosMobileCompletionResult,
    TalosMobileProviderAdapter,
    TalosMobileProviderCatalog,
    TalosProviderStreamHandlers,
} from '@/lib/chat/providerContracts'
import {
    TalosLocalEngineGenerationError,
    TalosLocalEngineOpenError,
    type TalosLocalEngineStatus,
    talosLocalEngineChatPlan,
    talosLocalEngineCancel,
    talosLocalEngineGenerate,
    talosLocalEngineOpen,
    talosLocalEngineOpenWithFallback,
    talosLocalEngineStatus,
    talosLocalInstalledModels,
} from '@/services/localEngine'
import { talosMeasureDevice } from '@/services/deviceCapacity'
import { type TalosModelShape, talosMaxContextFor } from '@/lib/models/fit'
import { talosEngineTuning } from '@/lib/models/engineTuning'
import {
    TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS,
    talosLocalEscalatedContextTokens,
} from '@/lib/models/localContextPolicy'
import { talosToolsForOpenAi } from '@/lib/tools/registry'
import { talosNormaliseLocalToolCalls } from '@/lib/chat/localToolCalls'
import { talosCreateThinkSplitter, talosSplitFinalThink } from '@/lib/chat/thinkStream'
import { talosModelSupportsToolCalling } from '@/lib/chat/modelToolCapabilities'

/**
 * The engine on this device, answering through the same contract as everyone
 * else.
 *
 * That is the whole design decision. A local runtime bolted in beside the send
 * path would have been simpler to write and would have created a second one:
 * two places that assemble a conversation, two that stream, two that record a
 * receipt, and every future feature written twice. Made an adapter, it inherits
 * the model picker, the abort signal, the persistence and the audit trail
 * without any of them knowing it is special.
 *
 * What it does NOT inherit is a network, and that shows in three places: there
 * is no key, no endpoint, and the transport argument is ignored. Nothing here
 * can reach anything, which is the property the app promises about local models
 * and the one place where "unused parameter" is the point rather than an
 * oversight.
 */

/** Long enough for a real answer; a phone is not the place for an unbounded one. */
const MAX_TOKENS = 1024

/**
 * Turns the conversation into what the engine expects.
 *
 * Tool turns are dropped rather than translated. A GGUF chat template knows
 * `system`, `user` and `assistant` and nothing else, so a tool result rendered
 * through it would arrive as an unlabelled block of text in the middle of the
 * conversation — worse than absent, because the model would read it as
 * something the user said.
 */
function conversationOf(input: TalosMobileCompletionInput): Array<{ role: string, content: string }> {
    const turns: Array<{ role: string, content: string }> = []
    if (input.system) turns.push({ role: 'system', content: input.system })
    for (const turn of input.turns) {
        // Only the two roles a GGUF template knows how to punctuate. The
        // compiler confirms `tool` is the only other one a turn can carry, and
        // it is exactly the one that must not be rendered.
        if (turn.role !== 'user' && turn.role !== 'assistant') continue
        const content = typeof turn.content === 'string' ? turn.content : ''
        if (content === '') continue
        turns.push({ role: turn.role, content })
    }
    return turns
}

/** Stable machine codes and localized actions for every native open stage. */
const LOCAL_OPEN_FAILURE = {
    path: ['TALOS_LOCAL_MODEL_OPEN_PATH', 'models.localModelOpenPath'],
    'model-load': ['TALOS_LOCAL_MODEL_OPEN_LOAD', 'models.localModelOpenLoad'],
    context: ['TALOS_LOCAL_MODEL_OPEN_CONTEXT', 'models.localModelOpenContext'],
    sampler: ['TALOS_LOCAL_MODEL_OPEN_SAMPLER', 'models.localModelOpenSampler'],
    template: ['TALOS_LOCAL_MODEL_OPEN_UNKNOWN', 'models.localModelOpenUnknown'],
    generation: ['TALOS_LOCAL_MODEL_OPEN_UNKNOWN', 'models.localModelOpenUnknown'],
    unknown: ['TALOS_LOCAL_MODEL_OPEN_UNKNOWN', 'models.localModelOpenUnknown'],
} as const

function actionableOpenFailure(error: TalosLocalEngineOpenError): TalosMobileProviderError {
    const [message, uiMessageKey] = LOCAL_OPEN_FAILURE[error.stage]
    return new TalosMobileProviderError({
        provider: 'local',
        operation: 'complete',
        message,
        uiMessageKey,
    })
}

/**
 * Il rifiuto, CON I NUMERI.
 *
 * ## Perché i numeri non sono un dettaglio
 *
 * Owner 2026-08-06, secondo `PROVIDER_CHAT_FAILED` (Qwen3-1.7B-Q8_0): il tetto
 * dinamico funzionava — la conversazione superava davvero quello che il
 * dispositivo poteva tenere. Ma il messaggio diceva soltanto «serve più contesto
 * di quanto TALOS possa allocare», e consigliava di «disattivare gli strumenti
 * che non servono» **senza dire quanti token servono né quanti ce ne sono**.
 *
 * Cioè chiedeva una decisione senza dare la misura su cui prenderla: chi legge
 * non può sapere se spegnere due tool basti o se serva una chat nuova. Un
 * rifiuto che non si può agire è un vicolo cieco con una frase gentile davanti.
 *
 * Adesso dice: quanto serve, quanto ce n'è, e da lì la scelta è possibile.
 */
function promptTooLongFailure(required?: number, ceiling?: number): TalosMobileProviderError {
    const misurato = Number.isFinite(required) && Number.isFinite(ceiling)
        && (required ?? 0) > 0 && (ceiling ?? 0) > 0
    return new TalosMobileProviderError({
        provider: 'local',
        operation: 'complete',
        message: 'TALOS_LOCAL_PROMPT_TOO_LONG',
        // Due messaggi, non uno con i numeri opzionali: quando la misura non
        // c'è — motore vecchio, dispositivo che non si lascia misurare — una
        // frase con dei buchi al posto delle cifre è peggio della frase senza.
        uiMessageKey: misurato ? 'models.localPromptTooLongMeasured' : 'models.localPromptTooLong',
        ...(misurato
            ? {
                uiMessageParameters: {
                    required: String(Math.round(required ?? 0)),
                    available: String(Math.round(ceiling ?? 0)),
                },
            }
            : {}),
    })
}

function actionableGenerationFailure(error: TalosLocalEngineGenerationError): TalosMobileProviderError {
    if (error.stage === 'context-required') return promptTooLongFailure()
    return new TalosMobileProviderError({
        provider: 'local',
        operation: 'complete',
        message: 'TALOS_LOCAL_GENERATION_FAILED',
        uiMessageKey: 'models.localModelGenerationFailed',
    })
}

/**
 * Makes sure the requested model is the one in memory.
 *
 * The engine holds one at a time, deliberately — two multi-gigabyte models on a
 * phone is how an app is killed mid-sentence. So switching models is opening
 * another, and asking first avoids paying a reload for a message that is
 * already on the right one.
 */
/**
 * Quanti thread e che microbatch, chiesti a QUESTO telefono.
 *
 * Il motore apriva ogni modello con quattro thread — una costante — e lo stesso
 * numero per prefill e generazione, che sono carichi opposti. Sul Pad
 * significava metà chip fermo mentre il prompt veniva macinato.
 *
 * Se il dispositivo non sa dire com'è fatto, non si inventa niente: si torna un
 * oggetto vuoto e il nativo si comporta esattamente come prima. Un valore
 * indovinato sarebbe peggio del comportamento noto.
 */
async function talosTuningFor(): Promise<{ threads?: number, threadsBatch?: number, microBatch?: number }> {
    const device = await talosMeasureDevice()
    if (!device?.cpuCores) return {}
    const tuning = talosEngineTuning({
        cores: device.cpuCores,
        capacities: device.cpuCapacities,
    })
    return {
        threads: tuning.threads,
        threadsBatch: tuning.threadsBatch,
        microBatch: tuning.microBatch,
    }
}

async function ensureLoaded(path: string): Promise<TalosLocalEngineStatus> {
    const status = await talosLocalEngineStatus()
    if (!status.available) throw new Error('TALOS_LOCAL_ENGINE_UNAVAILABLE')
    if (status.loadedPath === path) return status
    try {
        await talosLocalEngineOpenWithFallback(path, {
            contextTokens: TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS,
            ...(await talosTuningFor()),
        })
    } catch (error) {
        if (error instanceof TalosLocalEngineOpenError) throw actionableOpenFailure(error)
        throw error
    }
    // Richiesto di nuovo perché la risposta di prima descriveva la memoria
    // com'era: senza modello aperto non c'era nessuna forma da dichiarare.
    return talosLocalEngineStatus()
}

/**
 * Quanto contesto QUESTO dispositivo può onestamente dare a QUESTO modello.
 *
 * ## Perché non è più un numero
 *
 * Era `8192`, scritto a mano, uguale per tutti — e su un tablet da 12 GB con un
 * 3B rifiutava conversazioni che il dispositivo reggeva senza fatica. Il calcolo
 * giusto era già in casa e già provato: `talosMaxContextFor` è la stessa
 * funzione che disegna la barra di capienza nel centro modelli. Non la chiamava
 * nessuno da qui.
 *
 * Riusarla — invece di scriverne una seconda — è il punto: se la scheda del
 * modello dice «ci sta fino a 32k» e poi la chat rifiuta a 8k, una delle due sta
 * mentendo, e non c'è modo di sapere quale finché le aritmetiche sono due.
 *
 * ## `null` è un esito, non un guasto
 *
 * Se il dispositivo non si lascia misurare, o il motore nativo di questa build
 * non sa dichiarare la forma, non si inventa un tetto: si lascia rispondere il
 * motore, che è l'unico ad avere l'ultima parola comunque. Un rifiuto nativo
 * alla fase `context` resta gestito come sempre.
 */
async function localContextCeiling(shape: TalosModelShape | null): Promise<number | null> {
    if (!shape) return null
    const device = await talosMeasureDevice()
    if (!device) return null
    /**
     * I pesi vanno RIMESSI nella memoria disponibile, e non è un trucco.
     *
     * `talosMaxContextFor` è nata per la domanda che si fa PRIMA di scaricare —
     * «se caricassi questo modello, quanto contesto mi resterebbe?» — e quindi
     * sottrae `weightBytes` dalla memoria libera. Qui la domanda arriva DOPO: il
     * modello è già in memoria, e `availableRamBytes` lo ha già scontato.
     * Passarla così com'è toglierebbe i pesi due volte.
     *
     * Non è un errore da poco: su un 3B da ~1,75 GB sono tre gigabytes e mezzo
     * sottratti invece di uno e tre quarti, cioè un tetto più basso della metà
     * del vero — proprio la forma di difetto che stiamo togliendo, riscritta in
     * un altro punto.
     *
     * Sommandoli si ricostruisce la condizione che la funzione si aspetta, e
     * l'aritmetica resta una sola invece di biforcarsi in una «versione per il
     * catalogo» e una «versione per la chat» che poi si contraddicono.
     *
     * Con mmap una parte dei pesi può non essere residente, quindi la somma può
     * restituire un pelo più di quanto il sistema stia davvero tenendo. È la
     * direzione da sorvegliare, ed è esattamente ciò che `SAFETY_MARGIN` e
     * `SAFE_SHARE` sono lì a coprire: sono politiche nostre, dichiarate, e
     * questo è il caso per cui esistono.
     */
    /**
     * Zero si restituisce COM'È, e la tentazione era di non farlo.
     *
     * `talosMaxContextFor` risponde zero quando per questo modello non resta
     * memoria nemmeno per un token di cache. Tradurlo in `null` — «non
     * misurato» — sembrava prudente e faceva l'opposto: toglieva ogni tetto
     * proprio sul dispositivo che ne aveva più bisogno, e lo mandava a chiedere
     * al motore un contesto che non poteva reggere. Il rifiuto sarebbe arrivato
     * lo stesso, ma dopo aver tentato un'allocazione da gigabyte su un telefono
     * già al limite, cioè col rischio di essere uccisi invece che di ricevere un
     * no.
     *
     * Passato com'è, chi legge lo alza al contesto già aperto e non cresce oltre:
     * si continua con ciò che c'è, e se il messaggio non ci sta lo si dice.
     */
    return talosMaxContextFor(shape, {
        ...device,
        availableRamBytes: device.availableRamBytes + shape.weightBytes,
    })
}

async function run(
    input: TalosMobileCompletionInput,
    onChunk?: (text: string) => void,
    onReasoning?: (text: string) => void,
): Promise<TalosMobileCompletionResult> {
    const status = await ensureLoaded(input.model.id)
    const ceiling = await localContextCeiling(status.shape)
    /**
     * I tool, nella STESSA forma che ricevono i provider di rete.
     *
     * Owner 2026-08-03: «i locali devono avere le stesse possibilità dei key».
     * `talosToolsForOpenAi` è la funzione che serve già gli altri adattatori —
     * riusarla vuol dire che un tool non ha due descrizioni a seconda di chi lo
     * esegue, e la guardia `anthropicAcceptsEveryTool` continua a valere per
     * tutti.
     *
     * Il filtro sulle capacità del modello resta al suo posto: è lì che si
     * decide se questo modello può chiamare qualcosa, e non qui.
     */
    const offered = talosModelSupportsToolCalling(input.model) ? input.tools : undefined
    const tools = offered?.length ? talosToolsForOpenAi(offered) : undefined
    const turns = conversationOf(input)
    let plan = await talosLocalEngineChatPlan(turns, tools)
    const targetContext = talosLocalEscalatedContextTokens(
        plan.contextTokens,
        plan.promptTokens,
        MAX_TOKENS,
        ceiling,
    )
    if (targetContext === null) {
        // Il fabbisogno è prompt + risposta + un posto per il token finale: la
        // stessa aritmetica del tetto, detta a chi legge invece che tenuta per sé.
        throw promptTooLongFailure(plan.promptTokens + MAX_TOKENS + 1, ceiling ?? undefined)
    }
    if (targetContext > plan.contextTokens) {
        try {
            // Exact by design: a known 6804-token requirement cannot recover
            // by falling back to 2048 after an 8192 allocation failure.
            await talosLocalEngineOpen(input.model.id, {
                contextTokens: targetContext,
                // ⛔ Anche qui. Riaprire per allargare il contesto e nel farlo
                // tornare ai quattro thread di prima significherebbe che una
                // conversazione lunga diventa più lenta man mano che cresce.
                ...(await talosTuningFor()),
            })
        } catch (error) {
            if (error instanceof TalosLocalEngineOpenError) throw actionableOpenFailure(error)
            throw error
        }
        plan = await talosLocalEngineChatPlan(turns, tools)
        const confirmed = talosLocalEscalatedContextTokens(
            plan.contextTokens,
            plan.promptTokens,
            MAX_TOKENS,
            ceiling,
        )
        if (confirmed === null || confirmed > plan.contextTokens) {
            throw promptTooLongFailure(plan.promptTokens + MAX_TOKENS + 1, ceiling ?? undefined)
        }
    }

    let generation
    try {
        /**
         * Il ragionamento si separa MENTRE arriva, non alla fine.
         *
         * Visto sul tablet il 2026-08-06 con Qwen3-1.7B-Q8_0: la bolla mostrava
         * `<think> Okay, the user wants me to…` per tutta la generazione. Il
         * lato nativo separa a risposta FINITA — ed è ciò che ha chiuso il
         * difetto del 2026-08-03, sul testo finale. Ma su un modello locale la
         * generazione dura decine di secondi, che è quasi tutto il tempo in cui
         * qualcuno sta guardando: il marcatore era invisibile solo a chi lo
         * cercava nel risultato salvato.
         *
         * Instradare e non cancellare: il cassetto «Ragionamento» esiste già e
         * i provider di rete lo riempiono via `onReasoning`. Il modello locale
         * era l'unico che non lo faceva.
         */
        const separatore = talosCreateThinkSplitter()
        generation = await talosLocalEngineGenerate(
            plan.prompt,
            (delta) => {
                const fetta = separatore.push(delta)
                if (fetta.text) onChunk?.(fetta.text)
                if (fetta.reasoning) onReasoning?.(fetta.reasoning)
            },
            { maxTokens: MAX_TOKENS, stopAtEndOfGeneration: true },
        )
        // La coda trattenuta va rilasciata: se la risposta finisce con un
        // carattere che POTEVA iniziare un tag, quel carattere è testo.
        const ultima = separatore.flush()
        if (ultima.text) onChunk?.(ultima.text)
        if (ultima.reasoning) onReasoning?.(ultima.reasoning)
    } catch (error) {
        if (error instanceof TalosLocalEngineGenerationError) {
            throw actionableGenerationFailure(error)
        }
        throw error
    }
    const normalised = talosNormaliseLocalToolCalls(generation.toolCalls)
    /*
     * Anche il testo FINALE passa dal separatore, non solo lo stream.
     *
     * Visto sul tablet il 2026-08-06 con Qwen3-MoE-6x0.6B: la sezione
     * «Ragionamento» cominciava con `<think> Okay, let's look at…`. Lo streaming
     * era già corretto; era questo il punto scoperto, e proprio quello che
     * finisce nel database — cioè quello che si rilegge riaprendo la chat.
     */
    const finale = talosSplitFinalThink(generation.text, generation.reasoning)
    return {
        text: finale.text,
        model: input.model.id,
        finishReason: 'stop',
        // Nello stesso campo che usano i provider di rete, quindi nello stesso
        // cassetto: il ragionamento di un modello locale non è una cosa diversa
        // dal ragionamento di Claude, e non merita una seconda superficie.
        reasoning: finale.reasoning || undefined,
        // E lo stesso vale per le chiamate: l'esecutore a valle non deve sapere
        // da dove arrivano.
        // Normalizzate una volta sola: il formato Hermes che Qwen usa non
        // prevede un identificativo, e senza quello due chiamate nello stesso
        // turno non si sanno riappaiare ai loro risultati.
        toolCalls: normalised.length ? [...normalised] : undefined,
        // Only what was actually counted. A local run has no billing and no
        // prompt-token figure to report, and inventing one would put a number
        // in the receipt that means nothing.
        usage: { completion_tokens: generation.tokens },
    }
}

export const localAdapter: TalosMobileProviderAdapter = {
    provider: 'local',
    requiresSecret: false,
    // Neither of the two things a provider is normally asked for. This pair is
    // load-bearing: while `requiresEndpoint` was inferred from `requiresSecret`,
    // the catalogue below was never once requested.
    requiresEndpoint: false,

    /**
     * The catalogue is the disk.
     *
     * There is no remote list to fetch and no version to be behind: what can be
     * run is what has finished downloading, asked of the device every time.
     */
    async listModels(): Promise<TalosMobileProviderCatalog> {
        const { models: files, unreadable } = await talosLocalInstalledModels()
        // Nothing found AND something refused to open is not an empty disk.
        //
        // Said as an error rather than as an empty catalogue because the advice
        // is opposite: an empty disk means "download a model", and this means
        // "downloading another one will change nothing". The path travels with
        // it, because a folder nobody can name is a folder nobody can fix.
        //
        // Only when the list is empty. A folder that refuses to open beside
        // three that opened must not hide those three — the user can still run
        // what is runnable.
        if (files.length === 0 && unreadable.length > 0) {
            throw new TalosMobileProviderError({
                provider: 'local',
                operation: 'list_models',
                message: 'TALOS_LOCAL_MODELS_UNREADABLE',
                uiMessageKey: 'models.localModelsUnreadable',
                uiMessageParameters: {
                    path: unreadable[0].path,
                    reason: unreadable[0].reason,
                },
            })
        }
        return {
            provider: 'local',
            models: files.map((file) => ({
                // The path is the identity. Two models can share a filename
                // across repositories, and a name that collides would load the
                // wrong weights without anything looking wrong.
                id: file.path,
                provider: 'local' as const,
                displayName: file.name.replace(/\.gguf$/i, ''),
                chatCompatibility: 'unknown' as const,
                supportedParameters: [],
                // Text in, text out. Stated rather than left empty: a GGUF run
                // through this engine has no image path, and a picker that
                // implied otherwise would let someone attach a photo to a model
                // that will silently ignore it.
                inputModalities: ['text'],
                outputModalities: ['text'],
            })),
        }
    },

    async complete(input): Promise<TalosMobileCompletionResult> {
        return run(input)
    },

    async streamComplete(
        input,
        _credential,
        handlers: TalosProviderStreamHandlers,
    ): Promise<TalosMobileCompletionResult> {
        /*
         * Fermarsi vuol dire fermare il NATIVO, non smettere di ascoltarlo.
         *
         * Owner 2026-08-06: «il pulsante stop non funziona bene nei modelli
         * locali, anzi non funziona proprio». Aveva ragione, e il difetto era
         * qui: il commento che stava in queste righe diceva che «il cancel del
         * motore copre la parte che conta, cioè la generazione» — ma
         * `talosLocalEngineCancel` **non era chiamata da nessuno**, in tutto il
         * progetto. La catena esisteva intera e finiva nel vuoto: flag atomico
         * nel C++, metodo nel plugin Java, funzione in TypeScript, e nessun
         * chiamante.
         *
         * Il risultato era la forma peggiore di finto annullamento: la chat
         * smetteva di mostrare le parole e il telefono continuava a macinare
         * token, con la CPU al massimo, finché il modello non finiva da solo.
         *
         * L'annullamento resta per la GENERAZIONE e non per il caricamento:
         * interrompere un caricamento a metà lascia gigabyte mappati a metà, e
         * quella è davvero la parte che non conviene toccare.
         */
        if (handlers.signal?.aborted) throw new Error('TALOS_LOCAL_ABORTED')
        const fermaIlMotore = () => {
            // Un annullamento che fallisce non deve rovesciare la risposta già
            // ricevuta: il peggio che può capitare è che il motore finisca da
            // solo, cioè esattamente com'era prima di questa correzione.
            // `Promise.resolve` attorno: il ponte nativo può restituire
            // `undefined` invece di una promessa, e un annullamento che va in
            // eccezione mentre si sta annullando è il modo più stupido di
            // perdere una risposta già ricevuta.
            void Promise.resolve(talosLocalEngineCancel()).catch(() => {})
        }
        handlers.signal?.addEventListener('abort', fermaIlMotore, { once: true })
        try {
            return await run(input, handlers.onChunk, handlers.onReasoning)
        } finally {
            handlers.signal?.removeEventListener('abort', fermaIlMotore)
        }
    },
}
