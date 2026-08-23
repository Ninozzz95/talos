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
    talosLocalEnginePlanPrompt,
    talosLocalEngineTemplateCapabilities,
    talosKvBytesPerElement,
    talosLocalEngineCancel,
    talosLocalEngineGenerate,
    talosLocalEngineOpen,
    talosLocalEngineOpenWithFallback,
    talosLocalEngineStatus,
    talosLocalEngineTimings,
    talosLocalInstalledModels,
    talosFreezePrefix,
    talosThawPrefix,
    talosEvictPrefixes,
    type TalosLocalTemplateCapabilities,
    type TalosLocalToolTransport,
} from '@/services/localEngine'
import { talosLocalTrace, talosNewLocalTraceId } from '@/lib/chat/providers/localTrace'
import {
    talosPrefixCacheFileName,
    talosShouldFreezePrefix,
    type TalosPrefixIdentity,
} from '@/lib/models/prefixCache'
import { talosMeasureDevice } from '@/services/deviceCapacity'
import { type TalosModelShape, talosMaxContextFor } from '@/lib/models/fit'
import { talosKvBytesPerTokenOf } from '@/lib/models/engineDiagnostics'
import { talosEngineTuning } from '@/lib/models/engineTuning'
import type { TalosTuningKey } from '@/lib/models/tuningProfile'
import { talosStoredTuning } from '@/services/tuningProfileStore'
import { TALOS_APP_BUILD } from '@/lib/appBuild'
import {
    TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS,
    talosLocalEscalatedContextTokens,
} from '@/lib/models/localContextPolicy'
import { talosToolsForLocalEngine } from '@/lib/tools/registry'
import {
    talosNormaliseLocalToolCalls,
    talosRecuperaChiamateNude,
    talosSenzaProtocolloDeiTool,
} from '@/lib/chat/localToolCalls'
import { talosCreateThinkSplitter, talosSplitFinalThink } from '@/lib/chat/thinkStream'
import { talosTrattieniLeChiamate } from '@/lib/chat/trattieniLeChiamate'
import { talosModelSupportsToolCalling } from '@/lib/chat/modelToolCapabilities'
import {
    talosLocalToolTransportOf,
    talosProjectLocalToolConversation,
} from '@/lib/chat/localToolPromptProtocol'

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
 * ⭐⭐ LA CACHE SI SCEGLIE, e non è gratis.
 *
 * ## Le due cose misurate sul Pad il 2026-08-07
 *
 * La prima: il motore sa creare la cache KV in `q8_0` dall'8C — con collaudo e
 * ripiego in `f16` per i modelli che non la reggono — e per due giorni nessuno
 * gliel'ha chiesta. Il predefinito nativo è `f16`, quindi una conversazione da
 * 8470 token girava a **112 KiB per token** invece di 61: 1,72 GB di cache dove
 * ne bastavano 0,91.
 *
 * La seconda, che ha cambiato la conclusione: **la cache leggera costa il 40%
 * del prefill**. A parità di contesto (8192) e di prompt (5475 token), sullo
 * stesso modello e nella stessa sessione:
 *
 * ```text
 * f16   →  75.843 ms → 72,2 token/s
 * q8_0  → 125.668 ms → 43,6 token/s
 * ```
 *
 * Non è una sorpresa una volta vista: chiavi e valori vanno dequantizzati a ogni
 * accesso, e l'attenzione li accede molte volte per token.
 *
 * ## Perché quindi NON è una costante
 *
 * Perché entrambe le risposte fisse sono sbagliate. Sempre `f16` dimezza il
 * contesto massimo — ed è il difetto appena tolto. Sempre `q8_0` fa pagare il
 * 40% del prefill a chi non aveva bisogno di quella memoria, cioè alla
 * maggioranza delle conversazioni.
 *
 * La regola è quella che i numeri sostengono: **la cache pesante finché ci sta,
 * la leggera quando è l'unico modo di avere la conversazione**. Un prefill più
 * lento è meglio di un messaggio rifiutato; un prefill più lento senza motivo è
 * solo un prefill più lento.
 *
 * ⛔ Chiedere non è ottenere, e va bene così: se il modello non regge la cache
 * leggera il motore ripiega in `f16` da solo e lo dichiara in `kvCacheType`. Il
 * tetto si ricalcola sul tipo VERO, non su quello chiesto.
 */
interface TalosPianoDiApertura {
    contextTokens: number
    kvCacheType: string
}

/** The OpenAI-compatible message shape consumed directly by llama.cpp. */
export interface TalosLocalChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content?: string
    tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string, arguments: string }
    }>
    name?: string
    tool_call_id?: string
}

/**
 * Turns the conversation into llama.cpp's canonical message contract.
 *
 * This used to delete every `tool` turn and every assistant `toolCalls` value
 * under the assumption that a GGUF template only knew three roles. llama.cpp's
 * own `common_chat_msg` contract has `tool_calls`, `tool_name` and
 * `tool_call_id`, and Hugging Face's template guidance defines `role: tool` as
 * the standard result turn. Deleting them meant a local model could request a
 * tool and then never receive what that tool returned.
 *
 * Provider-specific punctuation still stays out of TypeScript: these are
 * semantic messages, and `common_chat_msgs_parse_oaicompat()` plus the GGUF's
 * Jinja template render the exact syntax the model was trained on.
 */
export function conversationOf(input: TalosMobileCompletionInput): TalosLocalChatMessage[] {
    const turns: TalosLocalChatMessage[] = []
    if (input.system) turns.push({ role: 'system', content: input.system })
    for (const turn of input.turns) {
        const content = typeof turn.content === 'string' ? turn.content : ''
        if (turn.role === 'tool') {
            // A result without the call identity is malformed for strict
            // templates. Do not relabel it as user prose; omit it and let the
            // agent loop's existing invariant surface the fault.
            if (!turn.toolCallId || !turn.toolName) continue
            turns.push({
                role: 'tool',
                content,
                name: turn.toolName,
                tool_call_id: turn.toolCallId,
            })
            continue
        }

        const toolCalls = turn.role === 'assistant' && turn.toolCalls?.length
            ? turn.toolCalls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: call.arguments },
            }))
            : undefined
        if (content === '' && !toolCalls?.length) continue
        turns.push({
            role: turn.role,
            ...(content !== '' ? { content } : {}),
            ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
        })
    }
    return alternati(turns)
}

/**
 * ⛔⛔ GEMMA-RUOLI-ALTERNATI-01 — due turni dello stesso ruolo, e il modello
 * non parte affatto.
 *
 * MISURATO sul Pad il 2026-08-19 con `gemma-3-4b-it-Q4_K_M`: al posto della
 * risposta, `CHAT_EXECUTION_FAILED · TALOS_LLAMA_NO_CHAT_TEMPLATE`, e nel
 * registro del motore la ragione vera —
 *
 *     Jinja Exception: Conversation roles must alternate user/assistant/...
 *
 * I template della famiglia Gemma (come Mixtral e Devstral) VERIFICANO
 * l'alternanza e sollevano un'eccezione se due turni dello stesso ruolo si
 * toccano. Basta un reinvio, una risposta annullata o due domande di fila
 * perché accada — e allora il modello smette di funzionare del tutto, con un
 * codice tecnico al posto della risposta.
 *
 * La raccomandazione upstream è una sola: **fondere i messaggi dal lato del
 * client**. Si fa qui, dove la conversazione ha ancora la sua semantica.
 *
 * ⛔ I turni `tool` restano intatti: i template che pretendono l'alternanza
 * fanno eccezione esplicita per chiamate e risultati, e un `tool_call_id` è
 * un'identità che non si può sommare. Per lo stesso motivo un assistente che
 * porta `tool_calls` non assorbe il testo del turno successivo.
 */
function alternati(messaggi: TalosLocalChatMessage[]): TalosLocalChatMessage[] {
    const uniti: TalosLocalChatMessage[] = []
    for (const messaggio of messaggi) {
        const ultimo = uniti[uniti.length - 1]
        const fondibile = ultimo !== undefined
            && ultimo.role === messaggio.role
            && (messaggio.role === 'user' || messaggio.role === 'assistant')
            && !ultimo.tool_calls && !messaggio.tool_calls
        if (!fondibile) {
            uniti.push(messaggio)
            continue
        }
        // Una riga vuota fra i due: erano turni distinti, e chi legge deve
        // poterlo vedere ancora.
        uniti[uniti.length - 1] = {
            ...ultimo,
            content: [ultimo.content ?? '', messaggio.content ?? '']
                .filter((pezzo) => pezzo !== '')
                .join('\n\n'),
        }
    }
    return uniti
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
async function talosTuningFor(
    path?: string,
): Promise<{ threads?: number, threadsBatch?: number, microBatch?: number }> {
    const device = await talosMeasureDevice()
    if (!device?.cpuCores) return {}
    const derivato = talosEngineTuning({
        cores: device.cpuCores,
        capacities: device.cpuCapacities,
    })

    /**
     * ⭐ Se questo telefono, con QUESTO modello, è già stato misurato, si usa la
     * misura invece del punto di partenza.
     *
     * Il punto di partenza è dedotto dalla forma della CPU, e la deduzione è
     * onesta ma resta una deduzione: MISURATO sul Pad, sulla generazione **due
     * thread valgono quanto sei**, e nessuna regola sulla topologia lo avrebbe
     * previsto. Il profilo esiste per non ridurre a un'ipotesi ciò che è stato
     * osservato.
     *
     * ⛔ E vale solo per la situazione in cui è stato preso: altro modello,
     * altro file, altra build dell'app e il profilo semplicemente non c'è. Un
     * numero misurato ieri su un'altra cosa è peggio di nessun numero, perché ha
     * l'aria di un fatto.
     */
    const chiave = path ? await talosTuningKeyFor(path, device) : null
    const salvato = chiave ? await talosStoredTuning(chiave) : null

    return {
        threads: salvato?.threads ?? derivato.threads,
        threadsBatch: salvato?.threadsBatch ?? derivato.threadsBatch,
        // Il microbatch non si misura: cambiarlo richiede riaprire il modello,
        // quindi non entra nella griglia e resta quello derivato.
        microBatch: derivato.microBatch,
    }
}

/**
 * La chiave del profilo per questo modello su questo dispositivo.
 *
 * `null` quando il file non si trova più: senza dimensione e data non si può
 * dire «è ancora lo stesso file», e applicare un profilo a un file che non si è
 * potuto identificare è esattamente il modo di usare la misura sbagliata.
 */
async function talosTuningKeyFor(
    path: string,
    device: { deviceModel: string, cpuCores: number | null, engineBuild?: string | null },
): Promise<TalosTuningKey | null> {
    const { models } = await talosLocalInstalledModels().catch(() => ({ models: [] }))
    const file = models.find((candidate) => candidate.path === path)
    if (!file || !device.cpuCores) return null
    return {
        deviceModel: device.deviceModel,
        cpuCores: device.cpuCores,
        appBuild: TALOS_APP_BUILD,
        /*
         * ⛔ Il ripiego sulla build dell'app è lo STESSO della cache dei
         * prefissi, e per la stessa ragione: un lato nativo più vecchio non sa
         * dichiarare la propria versione, e lì si resta prudenti — si invalida
         * troppo invece che troppo poco. Una misura buttata via costa una
         * taratura; una misura sbagliata riusata costa ogni risposta.
         */
        engineBuild: device.engineBuild ?? TALOS_APP_BUILD,
        modelPath: file.path,
        modelBytes: file.bytes,
        modelModifiedAt: file.modifiedAt,
    }
}

/**
 * ⭐ IL PREFISSO CONGELATO, agganciato all'invio.
 *
 * MISURATO sul Pad il 2026-08-07: «ciao» costa **8.410 token**, di cui ~8.250
 * sono i trentotto schemi dei tool. Centocinquanta secondi, l'88% dell'attesa,
 * per un testo **identico in ogni conversazione**.
 *
 * Si calcola una volta, si scrive su disco, e ogni chat nuova lo rilegge — in
 * 0-1 ms, misurato. Al modello arrivano tutti e trentotto gli strumenti come
 * prima: la parità con i provider cloud non si tocca.
 *
 * ⛔ Le due letture stanno in una memoria di modulo perché il percorso di invio
 * è caldo: elencare i file installati e renderizzare il template a ogni
 * messaggio pagherebbe in I/O ciò che si risparmia in calcolo. Cambiano solo
 * quando cambia il modello o il testo del sistema, e in quel caso l'impronta è
 * diversa e la chiave nella mappa pure.
 */
const IDENTITA_FILE = new Map<string, { bytes: number, modifiedAt: number }>()
const PREFISSO_RESO = new Map<string, string>()
/** Come `PREFISSO_RESO`, ma per il testo GIA' proiettato — vedi `prefissoResoDiProiettato`. */
const PREFISSO_RESO_PROIETTATO = new Map<string, string>()
interface TalosTemplateTransportDecision {
    transport: TalosLocalToolTransport
    capabilities: TalosLocalTemplateCapabilities | null
}
const TRASPORTO_TOOL = new Map<string, TalosTemplateTransportDecision>()

async function identitaFileDi(path: string): Promise<{ bytes: number, modifiedAt: number } | null> {
    const memo = IDENTITA_FILE.get(path)
    if (memo) return memo
    try {
        const { models } = await talosLocalInstalledModels()
        for (const file of models) {
            IDENTITA_FILE.set(file.path, { bytes: file.bytes, modifiedAt: file.modifiedAt })
        }
    } catch {
        // Senza identità non si congela: meglio ricalcolare che rischiare di
        // rileggere lo stato di un altro modello.
        return null
    }
    return IDENTITA_FILE.get(path) ?? null
}

/**
 * The model's name is not a protocol. Cache the actual Jinja capability
 * preflight by file identity and app build, so the small vocab-only read is
 * paid once per installed GGUF rather than once per turn.
 */
/**
 * ⭐⭐⭐ QUESTO TESTO E' UNA CHIAMATA MANCATA, non una risposta.
 *
 * ⛔⛔ Misurato sul Pad il 2026-08-21 con Gemma 3 4B. Alla parola "Ciao" la
 * persona ha visto in chat, come se fosse la risposta:
 *
 *     {"name":"library_list"}
 *
 * Il recupero (qui sopra) prende le chiamate ai nomi VERI. Resta il caso in cui
 * il modello inventa un nome, o ne storpia uno: allora il JSON non e' una
 * chiamata, non e' una risposta, ed e' l'unica cosa che la persona legge.
 *
 * ⇒ Non e' un difetto del modello da nascondere: e' un esito, e va detto in
 * parole. ⛔ Ma mostrarlo come **testo dell'assistente** e' una bugia per
 * omissione, perche' fa credere che quella sia la risposta.
 *
 * ⛔ Riconosce SOLO il caso stretto: il testo, ripulito, e' un oggetto JSON
 * con `name` e al massimo gli argomenti. Un discorso che cita un JSON ha
 * discorso intorno e non passa di qui - resta prosa, come deve.
 */
export function talosTestoEUnaChiamataMancata(testo: string): boolean {
    const pulito = testo.trim()
    if (!pulito.startsWith('{') || !pulito.endsWith('}')) return false
    let oggetto: unknown
    try { oggetto = JSON.parse(pulito) }
    catch { return false }
    if (!oggetto || typeof oggetto !== 'object' || Array.isArray(oggetto)) return false
    const campi = oggetto as Record<string, unknown>
    const chiavi = Object.keys(campi)
    if (chiavi.length === 0 || chiavi.length > 3) return false
    if (typeof campi.name !== 'string' || campi.name.trim() === '') return false
    /*
     * ⛔ Le altre chiavi devono essere quelle di una chiamata. Un oggetto dati
     * che per caso ha un campo `name` - una persona, un file - non e' una
     * chiamata mancata, ed e' una risposta legittima.
     */
    return chiavi.every((k) => k === 'name' || k === 'arguments' || k === 'parameters' || k === 'id')
}

async function trasportoToolDi(path: string): Promise<TalosTemplateTransportDecision> {
    const identita = await identitaFileDi(path)
    const chiave = [
        path,
        identita?.bytes ?? '',
        identita?.modifiedAt ?? '',
        TALOS_APP_BUILD,
    ].join('\0')
    const memo = TRASPORTO_TOOL.get(chiave)
    if (memo) return memo

    const capability = await talosLocalEngineTemplateCapabilities(path)
    // An old or malformed bridge cannot be treated as a native tool template.
    // The prompted profile preserves ordinary chat-role alternation and still
    // earns compatibility only through the real parity diagnostic.
    const decision: TalosTemplateTransportDecision = {
        transport: talosLocalToolTransportOf(capability),
        capabilities: capability,
    }
    TRASPORTO_TOOL.set(chiave, decision)
    return decision
}

/**
 * Il testo del prefisso: il template applicato al SOLO sistema, con i tool.
 *
 * ⛔ Lo stesso identico calcolo deve avvenire quando si congela e quando si
 * rilegge, o le impronte non corrispondono e non se ne accorge nessuno — la
 * ricerca su llama.cpp dice che il riuso salta **in silenzio**. Per questo è
 * una funzione sola, chiamata da entrambe le parti.
 */
async function prefissoResoDi(
    system: string | undefined,
    tools: readonly unknown[] | undefined,
    pensa: boolean,
): Promise<string | null> {
    if (!system) return null
    // ⛔ Il ragionamento entra nella chiave: `enable_thinking` cambia cio' che
    // il template rende, quindi due prefissi con impostazioni diverse sono due
    // testi diversi — e un solo posto in memoria per entrambi restituirebbe
    // quello dell'altro.
    const chiave = `${system}\0${JSON.stringify(tools ?? [])}\0${pensa}`
    const memo = PREFISSO_RESO.get(chiave)
    if (memo !== undefined) return memo
    try {
        const piano = await talosLocalEngineChatPlan(
            [{ role: 'system', content: system }], tools, pensa,
        )
        PREFISSO_RESO.set(chiave, piano.prompt)
        return piano.prompt
    } catch {
        return null
    }
}

/**
 * P1-3 — come `prefissoResoDi`, ma per il trasporto che NON passa i tool al
 * template nativo: `prompt-json-v1` inietta il catalogo dentro il testo del
 * turno di sistema, e finora questo era il motivo per cui quel prefisso non
 * si congelava mai (vedi il commento sulla guardia, più sotto).
 *
 * ⛔⛔ CR-09 — NON è una seconda versione del projector, ne usa lo STESSO
 * usato dalla generazione vera (`talosProjectLocalToolConversation`,
 * chiamata identica a quella di riga ~912). `tools` NON va MAI passato di
 * nuovo a `talosLocalEngineChatPlan`: per questo trasporto sono già dentro
 * `projection.turns` come testo — passarli anche come parametro nativo li
 * farebbe applicare una seconda volta, al template Jinja, producendo un
 * prompt DIVERSO da quello che la generazione vera manda.
 *
 * ⛔⛔⛔ VERIFICATO SUL PAD, 23/8 — un turno di sistema DA SOLO non basta.
 * Misurato con `gemma-3-4b-it-Q4_K_M`: `chatPrompt` con un solo turno
 * `{role:'system', ...}` rende `<start_of_turn>model\n` — 4 token, il
 * contenuto del sistema SPARITO. La doc ufficiale lo spiega
 * (ai.google.dev/gemma/docs/core/prompt-structure): Gemma non ha un ruolo
 * system separato, le istruzioni vanno DENTRO il primo turno utente — e il
 * motore, senza un turno a seguire in cui fonderle, non ha dove metterle.
 *
 * Un turno `{role:'system', ...}, {role:'user', content: segnaposto}`
 * rende invece 222 token, l'intero catalogo incluso: il segnaposto NON
 * può essere una stringa vuota — `projectPromptJson` scarta un turno
 * utente con `content` falsy (`if (turn.content) …`), che farebbe
 * ricomparire esattamente questo bug.
 *
 * ⛔ Non è un prefisso "sporco": il segnaposto è un carattere fisso, mai
 * un vero messaggio, quindi il calcolo del prefisso comune (in-memory o
 * su disco) si ferma comunque appena il testo VERO diverge da lui — un
 * paio di token in più scartati, non l'intero catalogo ricalcolato.
 */
const TALOS_PREFIX_PLACEHOLDER_TURN = '.'

// Esportata SOLO per il test diretto (il testo deve condividere un lungo
// prefisso comune con quello che il projector produce per la generazione
// vera, non l'intero output byte-per-byte — il segnaposto lo rende diverso
// in coda, di proposito): non è pensata per essere chiamata da fuori
// questo modulo in produzione.
export async function prefissoResoDiProiettato(
    transport: TalosLocalToolTransport,
    capabilities: TalosLocalTemplateCapabilities | null | undefined,
    system: string | undefined,
    tools: readonly unknown[] | undefined,
    locale: string | null | undefined,
    pensa: boolean,
): Promise<string | null> {
    if (!system) return null
    const chiave = `${transport}\0${system}\0${JSON.stringify(tools ?? [])}\0${locale ?? ''}\0${pensa}`
    const memo = PREFISSO_RESO_PROIETTATO.get(chiave)
    if (memo !== undefined) return memo
    try {
        const projection = talosProjectLocalToolConversation({
            transport,
            capabilities,
            turns: [
                { role: 'system', content: system },
                { role: 'user', content: TALOS_PREFIX_PLACEHOLDER_TURN },
            ],
            tools,
            locale,
        })
        if (!projection.turns.length) return null
        const piano = await talosLocalEngineChatPlan(projection.turns, undefined, pensa)
        PREFISSO_RESO_PROIETTATO.set(chiave, piano.prompt)
        return piano.prompt
    } catch {
        return null
    }
}

/** Dove vive il file: accanto al modello, con l'impronta per nome. */
function accantoAlModello(modelPath: string, nomeFile: string): string {
    const taglio = modelPath.lastIndexOf('/')
    return taglio < 0 ? nomeFile : `${modelPath.slice(0, taglio + 1)}${nomeFile}`
}

interface TalosPrefissoCongelato {
    percorso: string
    prompt: string
    identita: TalosPrefixIdentity
}

/**
 * L'identità completa, o `null` se manca un pezzo.
 *
 * `null` non è un guasto: è «non si congela questa volta». Un'impronta
 * incompleta sarebbe peggio di nessuna — riconoscerebbe come uguali due
 * situazioni che non lo sono.
 */
async function prefissoCongelatoDi(
    modelPath: string,
    system: string | undefined,
    tools: readonly unknown[] | undefined,
    status: TalosLocalEngineStatus,
    contextTokens: number,
    pensa: boolean,
): Promise<TalosPrefissoCongelato | null> {
    const [file, prompt] = await Promise.all([
        identitaFileDi(modelPath),
        prefissoResoDi(system, tools, pensa),
    ])
    if (!file || !prompt) return null
    const identita: TalosPrefixIdentity = {
        modelPath,
        modelBytes: file.bytes,
        modelModifiedAt: file.modifiedAt,
        contextTokens,
        // Quella OTTENUTA, mai quella chiesta: la cache è allocata su questa.
        kvCacheType: status.kvCacheType ?? 'f16',
        /**
         * ⛔ La build del MOTORE, non quella dell'app.
         *
         * Ciò che rende illeggibile uno stato salvato è la versione di
         * llama.cpp: il formato è interno e non promette compatibilità. La
         * build dell'app cambia a **ogni** compilazione, e MISURATO il
         * 2026-08-08 questo buttava via un gigabyte di lavoro a ogni
         * aggiornamento, facendo ripagare 150 secondi al primo messaggio per
         * una ragione che non esiste.
         *
         * Il ripiego sulla build dell'app è per il lato nativo più vecchio, che
         * non sa dichiararla: lì si resta prudenti, cioè si invalida troppo
         * invece che troppo poco.
         */
        engineBuild: status.engineBuild ?? TALOS_APP_BUILD,
        prefixText: prompt,
    }
    return {
        percorso: accantoAlModello(modelPath, talosPrefixCacheFileName(identita)),
        prompt,
        identita,
    }
}

/**
 * P1-3 — come `prefissoCongelatoDi`, ma per il testo GIA' proiettato.
 *
 * L'identità resta lo stesso `TalosPrefixIdentity` di sempre: la protezione
 * "l'impronta è il testo" (`prefixCache.ts`) non ha bisogno di sapere quale
 * dei due percorsi ha prodotto `prefixText` — un testo diverso produce già
 * un nome di file diverso, per costruzione. Cambia solo COME si ottiene il
 * testo, non come lo si custodisce.
 */
async function prefissoCongelatoDiProiettato(
    modelPath: string,
    transport: TalosLocalToolTransport,
    capabilities: TalosLocalTemplateCapabilities | null | undefined,
    system: string | undefined,
    tools: readonly unknown[] | undefined,
    locale: string | null | undefined,
    status: TalosLocalEngineStatus,
    contextTokens: number,
    pensa: boolean,
): Promise<TalosPrefissoCongelato | null> {
    const [file, prompt] = await Promise.all([
        identitaFileDi(modelPath),
        prefissoResoDiProiettato(transport, capabilities, system, tools, locale, pensa),
    ])
    if (!file || !prompt) return null
    const identita: TalosPrefixIdentity = {
        modelPath,
        modelBytes: file.bytes,
        modelModifiedAt: file.modifiedAt,
        contextTokens,
        kvCacheType: status.kvCacheType ?? 'f16',
        engineBuild: status.engineBuild ?? TALOS_APP_BUILD,
        prefixText: prompt,
    }
    return {
        percorso: accantoAlModello(modelPath, talosPrefixCacheFileName(identita)),
        prompt,
        identita,
    }
}

/** Le impronte gia' scritte in questa sessione: evita di riscrivere un GB. */
const GIA_CONGELATI = new Set<string>()

/**
 * Congela, se ne vale la pena e se c'e' spazio.
 *
 * Il verdetto lo da' `talosShouldFreezePrefix`, non questa funzione: qui si
 * scrive o non si scrive. Tre no possibili — prefisso corto, file troppo
 * grande, spazio insufficiente — e ognuno e' una ragione che vale la pena
 * mostrare, non un silenzio.
 *
 * ⛔ Non solleva mai, ed e' deliberato: una risposta gia' consegnata non puo'
 * fallire perche' una cache non si e' scritta.
 */
async function congelaSePossibile(
    congelato: TalosPrefissoCongelato,
    promptTokens: number,
    shape: TalosModelShape | null,
): Promise<void> {
    try {
        if (GIA_CONGELATI.has(congelato.percorso)) return
        if (!shape) return
        // ⛔ La stessa aritmetica del Doctor, non una seconda: due conti sulla
        // KV che divergono sono due schermate che si contraddicono, e nessun
        // modo di sapere quale mente.
        const perToken = talosKvBytesPerTokenOf(shape)
        const device = await talosMeasureDevice()
        const verdetto = talosShouldFreezePrefix({
            // Il prefisso e' una parte del prompt, mai piu' lungo di lui: il
            // conto vero lo fa il tokenizzatore dall'altra parte del ponte, ma
            // per decidere se vale la pena basta questo limite superiore.
            tokens: promptTokens,
            kvBytesPerToken: perToken,
            freeBytes: device?.freeStorageBytes ?? 0,
        })
        if (!verdetto.freeze) return
        const esito = await talosFreezePrefix(congelato.percorso, congelato.prompt)
        if (esito.bytes > 0) {
            GIA_CONGELATI.add(congelato.percorso)
            /*
             * ⛔ Lo sfratto SUBITO DOPO aver scritto, non prima e non a parte.
             *
             * Prima sarebbe inutile — il file che sta per nascere non e' ancora
             * contato. A parte, in un lavoro periodico, vorrebbe dire che fra
             * una pulizia e l'altra il disco puo' crescere senza limite, che e'
             * esattamente il difetto che questo esiste per chiudere.
             *
             * Qui invece il numero di file non puo' superare il tetto per piu'
             * del tempo di una cancellazione: si scrive uno, si toglie
             * l'eccesso.
             */
            await talosEvictPrefixes()
        }
    } catch {
        // Vedi sopra: e' un'ottimizzazione, non una promessa.
    }
}

async function ensureLoaded(
    path: string,
    piano: TalosPianoDiApertura = {
        contextTokens: TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS,
        kvCacheType: 'f16',
    },
): Promise<TalosLocalEngineStatus> {
    const status = await talosLocalEngineStatus()
    if (!status.available) throw new Error('TALOS_LOCAL_ENGINE_UNAVAILABLE')
    if (status.loadedPath === path) return status
    try {
        await talosLocalEngineOpenWithFallback(path, {
            contextTokens: piano.contextTokens,
            kvCacheType: piano.kvCacheType,
            ...(await talosTuningFor(path)),
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
async function localContextCeiling(
    shape: TalosModelShape | null,
    opzioni: { inMemoria: boolean } = { inMemoria: true },
): Promise<number | null> {
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
    /*
     * ⛔ E i pesi si RIMETTONO solo se ci sono davvero.
     *
     * Quando la domanda arriva PRIMA di aprire — il piano `vocab_only` — il
     * modello non è in memoria, `availableRamBytes` non lo ha scontato, e
     * sommarlo regalerebbe un tetto che il dispositivo non può onorare. È lo
     * stesso errore di segno di prima, guardato dall'altro lato.
     */
    return talosMaxContextFor(shape, {
        ...device,
        availableRamBytes: opzioni.inMemoria
            ? device.availableRamBytes + shape.weightBytes
            : device.availableRamBytes,
    })
}

/**
 * ⭐⭐ Con quanto contesto E con quale cache aprire, deciso PRIMA di aprire.
 *
 * ## Perché non basta il predefinito
 *
 * Perché il predefinito è una scommessa che si perde spesso: `4096` token
 * bastano per «ciao» e non per una conversazione di venti turni. Quando non
 * bastano il motore riapriva — e riaprire un modello da 1,8 GB costa **2938 ms**
 * MISURATI sul Pad, che diventano molti di più su un modello grande.
 *
 * Adesso il fabbisogno si sa prima: `talosLocalEnginePlanPrompt` applica il
 * template e conta i token caricando il solo vocabolario, in **~200 ms**. Il
 * modello si apre una volta sola, già della misura giusta.
 *
 * ## L'ordine delle due domande
 *
 * Prima si chiede se la conversazione ci sta con la cache **pesante**, che è la
 * veloce. Se ci sta, finisce lì. Solo se non ci sta si passa alla leggera, che
 * quasi raddoppia il tetto al prezzo del 40% di prefill — le misure stanno su
 * `TalosPianoDiApertura`.
 *
 * L'ordine È la decisione: al contrario si farebbe pagare il pedaggio anche a
 * chi non aveva bisogno di passare il ponte.
 *
 * ## Perché il tetto qui è PRUDENTE, e va bene così
 *
 * Il conto assume che si ottenga la cache chiesta, e potrebbe non essere vero:
 * un modello che rifiuta la `q8_0` riceve `f16` e una cache doppia del previsto.
 * Ma il tetto qui non è l'ultima parola — dopo l'apertura si ricalcola sul tipo
 * VERO — e nel frattempo un contesto sottostimato costa una ricostruzione, non
 * un processo ucciso.
 *
 * ## Perché un fabbisogno impossibile NON viene rifiutato qui
 *
 * Perché il rifiuto va detto col tetto vero — quello di dopo l'apertura — e non
 * con la stima. Si apre col predefinito e a rifiutare, se serve, ci pensa chi ha
 * il numero giusto.
 */
async function pianoDiApertura(
    anticipo: { promptTokens: number, shape: TalosModelShape | null } | null,
): Promise<TalosPianoDiApertura> {
    const forma = anticipo?.shape
    if (!anticipo || !forma) {
        return { contextTokens: TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS, kvCacheType: 'f16' }
    }

    const conCache = async (tipo: string): Promise<number | null> => {
        const tetto = await localContextCeiling(
            { ...forma, kvBytesPerElement: talosKvBytesPerElement(tipo) },
            { inMemoria: false },
        )
        // Il predefinito resta il PAVIMENTO, non il punto di partenza da
        // superare: aprire a misura esatta farebbe ricostruire il contesto a
        // ogni turno.
        const pavimento = tetto === null
            ? TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS
            : Math.min(TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS, tetto)
        return talosLocalEscalatedContextTokens(
            pavimento,
            anticipo.promptTokens,
            MAX_TOKENS,
            tetto,
        )
    }

    const pesante = await conCache('f16')
    if (pesante !== null) return { contextTokens: pesante, kvCacheType: 'f16' }

    const leggera = await conCache('q8_0')
    return leggera !== null
        ? { contextTokens: leggera, kvCacheType: 'q8_0' }
        // Non ci sta nemmeno con la leggera: si apre col predefinito e con la
        // leggera comunque, perché è quella che dà più margine, e il rifiuto —
        // se serve — arriva dopo l'apertura, col tetto vero.
        : { contextTokens: TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS, kvCacheType: 'q8_0' }
}

/**
 * B1 — il confine di cancellazione, separato dal corpo di `run()` invece di
 * avvolgerlo tutto in un try/finally: `runBody` sotto è già 250+ righe, e
 * reindentarle tutte per un try/finally era il modo più facile di introdurre
 * un difetto vero in un file che nessun typecheck avrebbe potuto vedere
 * (rientri sbagliati non sono un errore di sintassi).
 *
 * ⛔ `cancel_requested`/`cancel_effective` con lo STESSO id di `runBody`, non
 * due eventi anonimi. Prima di questo blocco l'annullamento viveva del tutto
 * fuori da `run()` (dentro `streamComplete`, sotto), dove nessun `traceId`
 * esisteva ancora - lo stesso genere di distanza per cui
 * `talosLocalEngineCancel` fu trovata senza chiamante il 6/8: un pezzo
 * separato dal resto della generazione è un pezzo che si dimentica di
 * collegare.
 */
async function run(
    input: TalosMobileCompletionInput,
    onChunk?: (text: string) => void,
    onReasoning?: (text: string) => void,
    signal?: AbortSignal,
): Promise<TalosMobileCompletionResult> {
    const traceId = talosNewLocalTraceId()
    if (signal?.aborted) throw new Error('TALOS_LOCAL_ABORTED')
    const fermaIlMotore = (): void => {
        talosLocalTrace(traceId, 'cancel_requested')
        void Promise.resolve(talosLocalEngineCancel())
            .then(() => talosLocalTrace(traceId, 'cancel_effective'))
            .catch(() => talosLocalTrace(traceId, 'cancel_effective error'))
    }
    signal?.addEventListener('abort', fermaIlMotore, { once: true })
    try {
        return await runBody(input, onChunk, onReasoning, traceId)
    } finally {
        signal?.removeEventListener('abort', fermaIlMotore)
    }
}

async function runBody(
    input: TalosMobileCompletionInput,
    onChunk: ((text: string) => void) | undefined,
    onReasoning: ((text: string) => void) | undefined,
    traceId: string,
): Promise<TalosMobileCompletionResult> {
    /**
     * B1 — un id che lega tutti gli eventi di QUESTA generazione, dal primo
     * istante in cui l'adattatore la prende in carico. Prima di questo
     * blocco: zero id di correlazione in tutto il repo (grep esaustivo).
     * `adapter_start` è l'evento più vicino a "la persona ha premuto
     * invio" che questo file può misurare da sé - il tempo PRIMA di qui
     * (dalla battitura al submit) appartiene a `chatController`, non
     * ancora tracciato: dichiarato, non nascosto.
     */
    talosLocalTrace(traceId, 'adapter_start')

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
    talosLocalTrace(traceId, 'template_project_start')
    const offered = talosModelSupportsToolCalling(input.model) ? input.tools : undefined
    const wireTools = offered?.length ? talosToolsForLocalEngine(offered) : undefined
    const template = await trasportoToolDi(input.model.id)
    const projection = talosProjectLocalToolConversation({
        transport: template.transport,
        capabilities: template.capabilities,
        turns: conversationOf(input),
        tools: wireTools,
        locale: input.locale,
    })
    talosLocalTrace(traceId, 'template_project_done')
    const turns = projection.turns
    const tools = projection.templateTools

    /**
     * ⭐ Prima si conta, poi si apre. UNA volta.
     *
     * Questo è l'unico punto in cui l'ordine conta: il piano `vocab_only` deve
     * precedere l'apertura, altrimenti il fabbisogno si scopre di nuovo troppo
     * tardi e si torna a riaprire. Se il lato nativo non lo sa fare — build più
     * vecchia — `anticipo` è `null` e si riparte col predefinito, esattamente
     * come prima.
     */
    /**
     * ⛔ IL RAGIONAMENTO SI CHIEDE, e non lo chiedevamo mai.
     *
     * `enable_thinking` nasce acceso in llama.cpp, e la parola «thinking» in
     * questo file non compariva: l'impostazione della persona non arrivava mai
     * al motore locale. MISURATO sul Pad il 2026-08-08 — per rispondere «Ciao!
     * Come posso aiutarti oggi?» il modello ha prodotto **105 token**, di cui
     * una decina di risposta: a 4,3 token al secondo sono venticinque secondi
     * spesi per non dire niente.
     *
     * Non è censura del ragionamento — chi lo accende continua ad averlo. È non
     * pagarlo dove nessuno l'ha chiesto.
     */
    const pensa = input.thinking !== false
    const anticipo = await talosLocalEnginePlanPrompt(input.model.id, turns, tools, pensa)
    talosLocalTrace(traceId, 'native_open_start')
    const status = await ensureLoaded(input.model.id, await pianoDiApertura(anticipo))
    // ⛔ Un evento onesto, non un tempo di ricarica garantito: `ensureLoaded`
    // può non fare nulla se il modello era già aperto - e allora la durata
    // fra i due eventi è quella che DICE che non ha ricaricato niente,
    // invece di lasciarlo indovinare a chi legge il log.
    talosLocalTrace(traceId, 'native_open_done')
    const ceiling = await localContextCeiling(status.shape)
    let plan = await talosLocalEngineChatPlan(turns, tools, pensa)
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
                /*
                 * ⛔ La cache che c'è ADESSO, non quella che si era chiesta.
                 *
                 * Allargare il contesto cambiando anche il tipo di cache
                 * significherebbe muovere due cose insieme e non sapere quale
                 * abbia causato un rifiuto. E il tipo vero può già essere
                 * diverso da quello chiesto: un modello che non regge la `q8_0`
                 * riceve `f16` e lo dichiara.
                 */
                kvCacheType: status.kvCacheType ?? 'f16',
                // ⛔ Anche qui. Riaprire per allargare il contesto e nel farlo
                // tornare ai quattro thread di prima significherebbe che una
                // conversazione lunga diventa più lenta man mano che cresce.
                ...(await talosTuningFor(input.model.id)),
            })
        } catch (error) {
            if (error instanceof TalosLocalEngineOpenError) throw actionableOpenFailure(error)
            throw error
        }
        plan = await talosLocalEngineChatPlan(turns, tools, pensa)
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

    /**
     * ⭐ Si prova a RILEGGERE il prefisso prima di generare.
     *
     * Qui e non prima: sopra il contesto può essere stato riaperto per fargli
     * spazio, e riaprire azzera la cache — un prefisso caricato prima sarebbe
     * stato buttato senza che nessuno lo dicesse.
     *
     * Un `null` o uno zero non sono guasti: sono la condizione normale la prima
     * volta e dopo ogni cambio di modello, di contesto o di testo. Si calcola,
     * che è ciò che si faceva prima di tutto questo.
     */
    // P1-3: `prompt-json-v1` injects its catalog into the projected system
    // turn. Freezing used to refuse this transport outright — the native
    // freezer only knew the original `input.system`, and caching THAT under
    // the same identity as the projected prompt would have been a different
    // prompt behind the same name. The guard is not weaker now: it still
    // never freezes `input.system` for this transport. It freezes the exact
    // projected text instead, built by the SAME projector the generation
    // below calls (CR-09) — never a second version of it.
    const congelato = template.transport === 'native-template' || !wireTools?.length
        ? await prefissoCongelatoDi(
            input.model.id, input.system, tools, status, plan.contextTokens, pensa,
        )
        : await prefissoCongelatoDiProiettato(
            input.model.id, template.transport, template.capabilities,
            input.system, wireTools, input.locale, status, plan.contextTokens, pensa,
        )
    if (congelato) await talosThawPrefix(congelato.percorso)

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
        /*
         * ⭐⭐⭐ E il JSON di una chiamata non deve SCORRERE a schermo.
         *
         * ⛔⛔ Il testo finale era gia' filtrato, e ogni verifica guardava
         * quello. L'owner ha fotografato il Pad **mentre elaborava**, il
         * 2026-08-21, e sotto la sua parola "Ciao" c'era:
         *
         *   {"name":"device_status","arguments":{"manufacturer":"OnePlus",…
         *
         * ⇒ Una risposta ha due vite: quella che scorre e quella che resta.
         * Un difetto che dura otto secondi e sparisce e' comunque un difetto che
         * la persona vede - ed e' invisibile a chi controlla dopo.
         */
        const trattieni = talosTrattieniLeChiamate()
        // ⛔ Un flag locale, non un evento per fetta: `first_visible_token`
        // conta una volta sola, la prima, altrimenti la riga di log
        // annegherebbe fra decine di eventi per una risposta lunga - la
        // stessa disciplina di `talosTrattieniLeChiamate` un livello sopra.
        let primoTokenVisibileTracciato = false
        talosLocalTrace(traceId, 'generate_start')
        generation = await talosLocalEngineGenerate(
            plan.prompt,
            (delta) => {
                const fetta = separatore.push(delta)
                if (fetta.text) {
                    const visibile = trattieni.push(fetta.text)
                    if (visibile) {
                        if (!primoTokenVisibileTracciato) {
                            primoTokenVisibileTracciato = true
                            talosLocalTrace(traceId, 'first_visible_token')
                        }
                        onChunk?.(visibile)
                    }
                }
                if (fetta.reasoning) onReasoning?.(fetta.reasoning)
            },
            { maxTokens: MAX_TOKENS, stopAtEndOfGeneration: true },
        )
        // La coda trattenuta va rilasciata: se la risposta finisce con un
        // carattere che POTEVA iniziare un tag, quel carattere è testo.
        const ultima = separatore.flush()
        if (ultima.text) {
            const visibile = trattieni.push(ultima.text)
            if (visibile) onChunk?.(visibile)
        }
        /* ⛔ Cio' che resta trattenuto a fine risposta e' TESTO: mangiarlo
         * sarebbe peggio del difetto che si sta curando. */
        const coda = trattieni.flush()
        if (coda) onChunk?.(coda)
        if (ultima.reasoning) onReasoning?.(ultima.reasoning)
        talosLocalTrace(traceId, 'complete')
        /**
         * ⛔⛔⛔ B1 — questi numeri esistevano già (il cronometro nativo,
         * `talos_cronometro` in talos_llama_jni.cpp), ma non finivano MAI
         * in un posto leggibile: l'unico riferimento a `lastTimings` in
         * tutto `mobile/src` era questa stessa funzione che non la
         * chiamava. Un blob misurato e mai letto è la stessa forma di
         * `funzione-con-i-test-e-nessun-chiamante` - stavolta sui dati,
         * non sul codice.
         */
        const tempi = await talosLocalEngineTimings()
        if (tempi) talosLocalTrace(traceId, `native_timings ${JSON.stringify(tempi)}`)
    } catch (error) {
        talosLocalTrace(traceId, `error ${error instanceof Error ? error.message : String(error)}`)
        if (error instanceof TalosLocalEngineGenerationError) {
            throw actionableGenerationFailure(error)
        }
        throw error
    }
    /**
     * ⭐ E ora si CONGELA, a risposta consegnata.
     *
     * Qui e non prima: la potatura toglie dalla cache i turni di questa
     * conversazione, e chi sta leggendo li ha già ricevuti — lo streaming è
     * finito due righe sopra. Farlo prima significherebbe rallentare la persona
     * che aspetta per far comodo alla prossima.
     *
     * ⛔ E non si sovrascrive: se il file c'è già, quel prefisso è identico per
     * costruzione — l'impronta è il nome — quindi riscriverlo sarebbe quasi un
     * gigabyte speso per ottenere gli stessi byte.
     *
     * `void`: congelare è un'ottimizzazione, e una risposta consegnata non deve
     * aspettare che una cache si scriva. Se fallisce, la prossima volta si
     * calcola — cioè si fa quello che si faceva prima.
     */
    if (congelato) void congelaSePossibile(congelato, plan.promptTokens, status.shape)

    /*
     * ⭐ La seconda lettura: la chiamata che il modello ha scritto a parole.
     *
     * MISURATO tre volte sul Pad il 2026-08-09 con Qwen3-1.7B: a «accendi la
     * torcia» la risposta in chat era esattamente
     * `{"name": "device_torch", "arguments": {"on": true}}` — l'oggetto nudo,
     * senza il tag `<tool_call>` che il template dichiara. Il recupero nativo
     * cerca quel tag, quindi non partiva, e la chiamata moriva come prosa.
     *
     * Qui e non nel motore nativo per una ragione pratica: i nomi degli
     * strumenti offerti in questo giro li ha questo file, ed è quel confronto —
     * non la forma del JSON — a rendere la promozione sicura. In più si prova
     * senza dispositivo, e un difetto che è costato una serata di misure merita
     * un test che lo tenga fermo.
     *
     * ⛔ Solo se il parser non ha trovato NIENTE: quando il formato è stato
     * letto bene, un oggetto JSON nella prosa è prosa.
     */
    /*
     * ⛔ SALTO-DIRETTO-PUNITO-01 — gli ESPOSTI più gli ESEGUIBILI.
     *
     * MISURATO sul Pad il 2026-08-19: Gemma ha scritto
     * `{"name":"device_location","arguments":{…}}` al primo giro, quando gli
     * esposti erano il solo `tool_details`. Cercando il nome solo fra gli
     * esposti la chiamata non veniva riconosciuta, e quel JSON finiva in chat
     * come se fosse la risposta.
     */
    const nomiOfferti = new Set([
        ...(offered ?? []).map((tool) => tool.name),
        ...(input.executableToolNames ?? []),
    ])
    let chiamateGrezze = generation.toolCalls
    let testoGrezzo = generation.text
    /**
     * ⭐⭐⭐ IL RECUPERO SCATTA SEMPRE - e prima no.
     *
     * ⛔⛔ Misurato sul Pad il 2026-08-21, Gemma 3 4B, alla parola "Ciao":
     *
     * ```
     *   Esplorazione della Libreria...     37s     <- chiamata RICONOSCIUTA
     *   {"name":"library_list"}                    <- la seconda, caduta in PROSA
     * ```
     *
     * La condizione era `!chiamateGrezze?.length`: il recupero partiva **solo
     * se il parser nativo non aveva trovato niente**. ⇒ Nel turno in cui una
     * chiamata veniva riconosciuta, una seconda scritta nel testo restava prosa
     * e finiva **in chat**, come JSON grezzo davanti alla persona.
     *
     * ⛔ La ragione della vecchia condizione era buona e va conservata: *quando
     * il formato e' stato letto bene, un oggetto JSON nella prosa e' prosa* - un
     * modello che MOSTRA un esempio di chiamata non la sta chiamando.
     *
     * ⇒ Si tiene la ragione e si cambia la regola: quando il parser aveva gia'
     * trovato qualcosa, il recupero vale solo se il testo era **quasi tutto**
     * quel JSON. Un esempio dentro un discorso lascia discorso intorno; una
     * chiamata scritta a mano no.
     */
    if (nomiOfferti.size > 0) {
        const recuperate = talosRecuperaChiamateNude(generation.text, nomiOfferti)
        const gia = chiamateGrezze?.length ?? 0
        const restaProsa = recuperate.text.trim().length
        /*
         * ⛔ `> 40` non e' un numero magico: e' la soglia sotto la quale cio' che
         * resta non e' un discorso ma un residuo - spazi, una virgola, un a capo.
         * Sopra, il modello stava parlando E ha citato un JSON: e' prosa.
         */
        const eraTuttoLaChiamata = restaProsa <= 40
        if (recuperate.calls.length > 0 && (gia === 0 || eraTuttoLaChiamata)) {
            const viste = new Set((chiamateGrezze ?? []).map((c) => c.name))
            const nuove = recuperate.calls
                .filter((call) => !viste.has(call.name))
                .map((call) => ({ ...call, id: '' }))
            if (nuove.length > 0 || gia === 0) {
                chiamateGrezze = [...(chiamateGrezze ?? []), ...nuove]
                testoGrezzo = recuperate.text
            }
        }
    }
    let chiamataMancata = false
    /*
     * ⛔⛔ E se cio' che resta e' una chiamata MANCATA, non la si mostra.
     *
     * Il recupero qui sopra ha gia' preso le chiamate ai nomi veri. Se dopo
     * quello il testo e' ANCORA solo un oggetto con forma di chiamata, il
     * modello ha nominato qualcosa che non esiste - e quel JSON e' l'unica cosa
     * che la persona leggerebbe.
     *
     * ⇒ Si sostituisce con una frase che dice cosa e' successo. ⛔ Non si
     * cancella e basta: una risposta vuota fa credere che l'assistente sia
     * rotto, e non spiega che il modello scelto non sa chiamare gli strumenti.
     *
     * ⭐ La riga del Doctor - «Strumenti dell'assistente con questo modello» -
     * dice la stessa cosa da un'altra parte, per chi vuole capire perche'.
     */
    if (chiamateGrezze?.length ? false : talosTestoEUnaChiamataMancata(testoGrezzo)) {
        chiamataMancata = true
        /*
         * ⛔⛔ E il testo NON si svuota qui, per quanto sia allettante.
         *
         * La prima versione faceva `testoGrezzo = ''`. Misurato sul Pad il
         * 2026-08-21, il motore ha risposto:
         *
         *     Jinja Exception: Conversation roles must alternate
         *     user/assistant/user/assistant/...
         *
         * ⇒ Il template di Gemma pretende che i ruoli si ALTERNINO, e un turno
         * assistente vuoto lo spezza al giro dopo: `TALOS_LLAMA_NO_CHAT_TEMPLATE`,
         * e la chat non parte affatto. Curando la cosa da mostrare avevo rotto
         * la cosa da dire.
         *
         * ⭐ Il segnale basta: `chatController` sostituisce il testo quando lo
         * mostra, cioe' FUORI dal ciclo, dove nessun template lo rileggera'.
         */
    }
    const normalised = talosNormaliseLocalToolCalls(chiamateGrezze)
    /*
     * Anche il testo FINALE passa dal separatore, non solo lo stream.
     *
     * Visto sul tablet il 2026-08-06 con Qwen3-MoE-6x0.6B: la sezione
     * «Ragionamento» cominciava con `<think> Okay, let's look at…`. Lo streaming
     * era già corretto; era questo il punto scoperto, e proprio quello che
     * finisce nel database — cioè quello che si rilegge riaprendo la chat.
     */
    const finale = talosSplitFinalThink(testoGrezzo, generation.reasoning)
    /*
     * ⛔⛔ IL PROTOCOLLO NON ARRIVA MAI ALLO SCHERMO — e passa da qui perché
     * questo è l'ultimo punto prima del DATABASE: quello che si salva è quello
     * che si rilegge riaprendo la chat. Filtrare solo lo streaming avrebbe
     * lasciato il difetto nella trascrizione, che è lo stesso errore già
     * commesso col `<think>` (vedi il commento qui sopra).
     *
     * ⛔ E su ENTRAMBI i canali: l'owner ha visto la roba tecnica sia nella
     * risposta sia nel ragionamento.
     */
    return {
        text: talosSenzaProtocolloDeiTool(finale.text),
        model: input.model.id,
        finishReason: 'stop',
        // Nello stesso campo che usano i provider di rete, quindi nello stesso
        // cassetto: il ragionamento di un modello locale non è una cosa diversa
        // dal ragionamento di Claude, e non merita una seconda superficie.
        reasoning: talosSenzaProtocolloDeiTool(finale.reasoning) || undefined,
        // E lo stesso vale per le chiamate: l'esecutore a valle non deve sapere
        // da dove arrivano.
        // Normalizzate una volta sola: il formato Hermes che Qwen usa non
        // prevede un identificativo, e senza quello due chiamate nello stesso
        // turno non si sanno riappaiare ai loro risultati.
        toolCalls: normalised.length ? [...normalised] : undefined,
        /*
         * ⛔ Il segnale sale con l'esito, non travestito da testo: chi mostra
         * ha le traduzioni, questo adattatore no.
         */
        ...(chiamataMancata ? { toolCallMissed: true } : {}),
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
            /**
             * ⛔ SOLO i file con cui si puo' PARLARE.
             *
             * Owner 2026-08-06: nel selettore compariva `mmproj-F16.gguf` — il
             * proiettore che accompagna un modello visivo — e sceglierlo dava
             * «questo file non puo' essere aperto come modello GGUF
             * compatibile». MISURATO su un'app appena avviata: veniva perfino
             * scelto **da solo**, perche' era il primo della lista.
             *
             * Resta visibile fra i file sul dispositivo, dove occupa 672 MB e
             * dove chi vuole liberarli deve poterlo trovare. Ma un modello che
             * non puo' rispondere non e' una scelta: e' una trappola.
             *
             * `!== false` e non `=== true`: un lato nativo piu' vecchio non
             * dichiara niente, e nel dubbio si mostra. Nascondere un modello
             * vero e' un danno che l'utente non puo' riparare; offrirne uno che
             * non parla lo dice aprendosi, con un errore che almeno si legge.
             */
            models: files.filter((file) => file.conversational !== false).map((file) => ({
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
         *
         * B1: il collegamento fra segnale e `talosLocalEngineCancel` vive
         * ora dentro `run()`, dove esiste il `traceId` da tracciare insieme
         * a `cancel_requested`/`cancel_effective` - qui resta solo passarlo.
         */
        return run(input, handlers.onChunk, handlers.onReasoning, handlers.signal)
    },
}
