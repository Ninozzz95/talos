import type { ChatTurn, TalosToolCall } from '@/stores/chat'
import type {
    TalosMobileImageInputPart,
    TalosMobileInputPart,
} from '@/lib/chat/attachmentContracts'
import type { AppendChatAttachmentInput } from '@/repositories/chatRepository'

/**
 * The agent loop: ask, run what the model asked for, tell it what happened,
 * ask again. Bounded, because an unbounded loop is an elegant way to spend the
 * owner's tokens without asking him.
 *
 * The bounds are two, and they answer different failure modes:
 *  - ROUNDS caps "think, call, think, call" ping-pong;
 *  - CALLS caps a single round that asks for forty tools at once.
 * When either is reached the model is TOLD, as a tool result, rather than
 * being cut off mid-thought: a model that knows it has run out of tool budget
 * writes a final answer, while one that is simply silenced leaves the user with
 * whatever half-sentence it had produced.
 */
export const TALOS_AGENT_MAX_ROUNDS = 5
export const TALOS_AGENT_MAX_CALLS = 12

/**
 * How many of a round's calls run at once.
 *
 * Owner 2026-07-26: a research-then-PDF prompt was "incredibilmente lento". The
 * round ran single file — five searches at a second each cost five seconds to
 * produce what one second of concurrency would have. Anthropic, on their own
 * Research product: "Our early agents executed sequential searches, which was
 * painfully slow"; parallelising it "cut research time by up to 90% for complex
 * queries". Independent measurement puts tool EXECUTION at ~50% of the wall
 * clock on deep-research tasks (arXiv 2603.18897).
 *
 * Four, not unbounded. This runs on a phone: Chromium allows 6 sockets per
 * host, and Android's radio charges a promotion for every burst, so ten fetches
 * at once are not faster — only hotter. Four keeps the useful part of the win
 * and leaves headroom for the response stream that is still open.
 */
export const TALOS_AGENT_MAX_PARALLEL = 4

export interface TalosAgentCompletion {
    text: string
    finishReason?: string | null
    reasoning?: string
    toolCalls?: TalosToolCall[]
}

export interface TalosAgentLoopDeps {
    /** One provider round trip. */
    /**
     * ⭐ `senzaStrumenti` NON è un'ottimizzazione: è l'unica uscita da un ciclo.
     *
     * MISURATO sul Pad il 2026-08-09, Qwen3-1.7B, «elenca le notifiche»: il
     * tool parte, il risultato torna, e il modello richiede **la stessa
     * identica chiamata** cinque volte di fila. La rete anti-ripetizione la
     * ferma ogni volta e gli risponde «già fatto, usa il risultato che hai
     * sopra» — e lui la richiede di nuovo, finché i giri finiscono. Il
     * messaggio che arriva alla persona è **vuoto**.
     *
     * Chiedere di nuovo con le stesse carte in mano non ha nessuna ragione di
     * andare diversamente. Togliere gli strumenti per UN giro cambia il
     * problema: senza schemi da compilare, l'unica cosa che il modello può
     * produrre è prosa — cioè la risposta.
     *
     * ⛔ Un modello con la chiave non ci finisce quasi mai, ma la garanzia non
     * può dipendere da quale modello si è scelto: è la stessa regola della rete
     * anti-ripetizione qui sopra.
     */
    complete(turns: ChatTurn[], opzioni?: { senzaStrumenti?: boolean }): Promise<TalosAgentCompletion>
    /**
     * Resolves every call in a round before any call is allowed to execute.
     * Omit only for legacy callers whose executor owns the complete gate.
     */
    preflight?(call: TalosToolCall): Promise<
        | { status: 'ready' }
        | { status: 'authorization_required'; request: unknown }
    >
    /** Runs one call through the permission gate and the audit trail. */
    execute(call: TalosToolCall): Promise<{
        content: string
        ok: boolean
        /** Anything the model should LOOK at, handed over on a user turn. */
        images?: TalosMobileInputPart[]
        /** Vault bindings to keep on the final assistant message. */
        messageAttachments?: AppendChatAttachmentInput[]
        /**
         * ⛔ Vero quando l'attrezzo NON ha cambiato niente nel mondo.
         *
         * Dichiarato qui perché il ciclo lo usa: un preambolo che annuncia
         * un'azione che poi non è avvenuta si toglie. Prima non era in questo
         * contratto, e il valore moriva sul ponte del controller senza che il
         * tipo se ne accorgesse.
         */
        senzaEffetto?: boolean
    }>
    /**
     * ⛔ B2 — il piano, chiesto PRIMA che qualsiasi cosa parta.
     *
     * Riceve le chiamate del giro e risponde quali sono ammesse. Chi decide se
     * un piano serva davvero non è il loop: è chi implementa questo gancio, che
     * conosce rischio, reversibilità e la soglia. Qui dentro resta una regola
     * sola, ed è quella che conta — **nessuna chiamata parte prima che la
     * risposta sia arrivata**.
     *
     * `cancelled` non è un errore: è una persona che ha detto no dopo aver
     * letto. Il giro finisce, ogni chiamata riceve la sua riga, e il modello
     * risponde con quello che ha.
     */
    plan?(calls: readonly TalosToolCall[]): Promise<{
        /** Gli id delle chiamate che possono partire, nell'ordine del provider. */
        admitted: readonly string[]
        /** Vero se la persona ha rifiutato il piano invece di ridurlo. */
        cancelled: boolean
    }>
    /**
     * ⛔ Rimette i byte di un'immagine che il checkpoint NON ha salvato.
     *
     * MISURATO dallo screenshot dell'owner del 2026-08-07, sul suo telefono:
     * `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID:loop_too_large` dentro un
     * riquadro rosso, in una conversazione che generava immagini. Il
     * checkpoint copiava i turni **con il base64 dentro**, e due immagini
     * generate bastano a superare gli 8 MB.
     *
     * La cura non è alzare il tetto: è non metterci i byte. Le immagini sono
     * già nella Libreria e ogni parte porta il suo `attachmentId`, quindi il
     * checkpoint salva il riferimento e questo gancio rimette il contenuto
     * quando il turno riparte.
     *
     * Assente, o se risponde `null`, la parte viene **tolta** invece di essere
     * rimandata vuota: un'immagine senza byte è un allegato che il provider
     * rifiuta, ed è il modo peggiore di perdere un turno.
     */
    rehydrateImage?(attachmentId: string): Promise<{ base64: string, mediaType: string } | null>
    /**
     * ⛔ Il modello che risponde può GUARDARE un'immagine?
     *
     * MISURATO sul Pad il 2026-08-07, con `deepseek-v4-flash`: si chiede
     * «disegna un gatto», il tool disegna e salva, e poi il giro passa
     * l'immagine al modello «da guardare». Il modello non ha la vista, e il
     * turno moriva con un riquadro rosso — dopo aver fatto tutto il lavoro e
     * dopo che l'utente aveva dato il consenso.
     *
     * Il guardiano che rifiutava è **giusto** per un'immagine allegata da una
     * persona: hai appena allegato qualcosa che questo modello non può vedere,
     * ed è meglio dirtelo che farti pagare una risposta sul nulla. Ma qui non
     * ha allegato niente nessuno: l'ha prodotta il tool.
     *
     * Quindi non gliela si passa. L'immagine esiste lo stesso, è salvata in
     * Libreria e l'utente la vede; il modello riceve il testo del risultato e
     * risponde. Meglio un modello che non guarda che un turno che muore.
     *
     * Assente = si passa, come sempre: nessun chiamante regredisce.
     */
    modelSeesImages?(): boolean
    /** Fired when a round of calls starts, so the UI can show what is running. */
    onToolRound?(calls: TalosToolCall[]): void
    /**
     * Persist this state after tool effects/results exist and before the next
     * provider request. If persistence fails, provider egress must not occur.
     */
    onBeforeModelCheckpoint?(checkpoint: TalosAgentLoopCheckpointV1): void | Promise<void>
    maxRounds?: number
    maxCalls?: number
    /** How many of one round's calls may run at once. */
    maxParallel?: number
}

export interface TalosAgentLoopOutcome extends TalosAgentCompletion {
    /** Every call that actually ran, in order — the record the UI renders. */
    executed: Array<{ call: TalosToolCall; ok: boolean }>
    rounds: number
    /** True when a bound stopped the loop rather than the model finishing. */
    stoppedByLimit: boolean
    /** Durable visual/file results produced by successful tools. */
    messageAttachments: AppendChatAttachmentInput[]
    /** Present when the loop yielded instead of parking a Promise in memory. */
    suspension?: {
        checkpoint: TalosAgentLoopCheckpointV1
        requests: unknown[]
    }
}

export interface TalosAgentLoopCheckpointV1 {
    schema_version: 1
    stage: 'before_tools' | 'before_model'
    turns: ChatTurn[]
    /** The exact provider completion to resume; null once results are durable. */
    completion: TalosAgentCompletion | null
    /** Model prose already shown/persisted, in provider-round order. */
    spoken: string[]
    executed: Array<{ call: TalosToolCall; ok: boolean }>
    rounds: number
    stoppedByLimit: boolean
    messageAttachments: AppendChatAttachmentInput[]
}

/**
 * Run a round's calls together, capped, answering in the order they were asked.
 *
 * A worker pool rather than `Promise.all` in chunks: chunking waits for the
 * slowest member of each batch before starting the next, which throws away most
 * of the win when one page is slow and three are instant.
 */
async function runCallsTogether(
    calls: readonly TalosToolCall[],
    execute: TalosAgentLoopDeps['execute'],
    limit: number,
): Promise<Array<Awaited<ReturnType<TalosAgentLoopDeps['execute']>>>> {
    const outcomes = new Array<Awaited<ReturnType<TalosAgentLoopDeps['execute']>>>(calls.length)
    let next = 0
    async function worker(): Promise<void> {
        for (;;) {
            const index = next++
            const call = calls[index]
            if (!call) return
            try {
                outcomes[index] = await execute(call)
            } catch (cause) {
                // One tool that throws must not lose the round: the other
                // results were already paid for, in time and in tokens. The
                // model is told, and answers with what it has.
                const detail = cause instanceof Error && cause.message ? `: ${cause.message}` : '.'
                outcomes[index] = {
                    ok: false,
                    content: `The tool "${call.name}" could not be run${detail}`,
                }
            }
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(limit, calls.length) }, () => worker()),
    )
    return outcomes
}

interface MutableAgentLoopState {
    turns: ChatTurn[]
    completion: TalosAgentCompletion | null
    spoken: string[]
    executed: TalosAgentLoopOutcome['executed']
    rounds: number
    stoppedByLimit: boolean
    messageAttachments: AppendChatAttachmentInput[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isToolCall(value: unknown): value is TalosToolCall {
    return isRecord(value)
        && typeof value.id === 'string'
        && value.id.length > 0
        && typeof value.name === 'string'
        && value.name.length > 0
        && typeof value.arguments === 'string'
}

function isTurn(value: unknown): value is ChatTurn {
    if (
        !isRecord(value)
        || !['user', 'assistant', 'tool'].includes(typeof value.role === 'string' ? value.role : '')
        || typeof value.content !== 'string'
        || (value.parts !== undefined && !Array.isArray(value.parts))
        || (value.toolCalls !== undefined
            && (!Array.isArray(value.toolCalls) || !value.toolCalls.every(isToolCall)))
        || (value.toolCallId !== undefined && typeof value.toolCallId !== 'string')
        || (value.toolName !== undefined && typeof value.toolName !== 'string')
    ) return false
    if (value.role === 'tool') {
        return typeof value.toolCallId === 'string' && typeof value.toolName === 'string'
    }
    return true
}

function isCompletion(value: unknown): value is TalosAgentCompletion {
    return isRecord(value)
        && typeof value.text === 'string'
        && (value.finishReason === undefined
            || value.finishReason === null
            || typeof value.finishReason === 'string')
        && (value.reasoning === undefined || typeof value.reasoning === 'string')
        && (value.toolCalls === undefined
            || (Array.isArray(value.toolCalls) && value.toolCalls.every(isToolCall)))
}

function isAttachment(value: unknown): value is AppendChatAttachmentInput {
    return isRecord(value)
        && typeof value.id === 'string'
        && typeof value.vault_file_id === 'string'
        && typeof value.grant_id === 'string'
}

function assertCheckpoint(
    value: TalosAgentLoopCheckpointV1,
): asserts value is TalosAgentLoopCheckpointV1 {
    const record = value as unknown
    if (
        !isRecord(record)
        || record.schema_version !== 1
        || !['before_tools', 'before_model'].includes(
            typeof record.stage === 'string' ? record.stage : '',
        )
        || !Array.isArray(record.turns)
        || !record.turns.every(isTurn)
        || (record.completion !== null && !isCompletion(record.completion))
        || !Array.isArray(record.spoken)
        || !record.spoken.every((entry) => typeof entry === 'string')
        || !Array.isArray(record.executed)
        || !record.executed.every((entry) => (
            isRecord(entry) && isToolCall(entry.call) && typeof entry.ok === 'boolean'
        ))
        || !Number.isSafeInteger(record.rounds)
        || (record.rounds as number) < 0
        || typeof record.stoppedByLimit !== 'boolean'
        || !Array.isArray(record.messageAttachments)
        || !record.messageAttachments.every(isAttachment)
        || (record.stage === 'before_tools'
            && (!isCompletion(record.completion) || !record.completion.toolCalls?.length))
        || (record.stage === 'before_model' && record.completion !== null)
    ) {
        throw new Error('TALOS_AGENT_LOOP_CHECKPOINT_INVALID')
    }
}

function checkpointOf(
    state: MutableAgentLoopState,
    stage: TalosAgentLoopCheckpointV1['stage'],
): TalosAgentLoopCheckpointV1 {
    return {
        schema_version: 1,
        stage,
        turns: state.turns.map(alleggerisci),
        completion: stage === 'before_tools' ? state.completion : null,
        spoken: [...state.spoken],
        executed: state.executed.map((entry) => ({ ...entry })),
        rounds: state.rounds,
        stoppedByLimit: state.stoppedByLimit,
        messageAttachments: state.messageAttachments.map((entry) => ({ ...entry })),
    }
}

/**
 * Toglie i byte delle immagini da un turno, lasciando il riferimento.
 *
 * Il `base64: ''` invece del campo assente è voluto: la forma della parte non
 * cambia, quindi chi la legge senza sapere niente di questo meccanismo non
 * incontra una struttura diversa dal solito — trova un'immagine vuota, che è
 * esattamente ciò che è finché non viene ripresa.
 */
function alleggerisci(turno: ChatTurn): ChatTurn {
    if (!turno.parts?.length) return turno
    return {
        ...turno,
        parts: turno.parts.map((parte) => (
            parte.type === 'image' && parte.base64 && parte.attachmentId
                ? { ...parte, base64: '' }
                : parte
        )),
    }
}

/**
 * Rimette i byte prima di ripartire, e scarta ciò che non si riesce a rimettere.
 *
 * Una parte senza byte non si manda: il provider la rifiuterebbe e il turno
 * morirebbe per una ragione che nessuno riuscirebbe a spiegare.
 */
async function reidrata(
    turni: readonly ChatTurn[],
    rehydrate: NonNullable<TalosAgentLoopDeps['rehydrateImage']>,
): Promise<ChatTurn[]> {
    return Promise.all(turni.map(async (turno) => {
        if (!turno.parts?.length) return turno
        const parti = await Promise.all(turno.parts.map(async (parte): Promise<
            TalosMobileInputPart | null
        > => {
            if (parte.type !== 'image') return parte
            if (parte.base64 || !parte.attachmentId) return parte
            const ripreso = await rehydrate(parte.attachmentId).catch(() => null)
            if (!ripreso) return null
            const ripieno: TalosMobileImageInputPart = {
                ...parte,
                base64: ripreso.base64,
                mediaType: ripreso.mediaType as TalosMobileImageInputPart['mediaType'],
            }
            return ripieno
        }))
        return {
            ...turno,
            parts: parti.filter((parte): parte is TalosMobileInputPart => parte !== null),
        }
    }))
}

function outcomeOf(
    state: MutableAgentLoopState,
    completion: TalosAgentCompletion,
    suspension?: TalosAgentLoopOutcome['suspension'],
): TalosAgentLoopOutcome {
    return {
        ...completion,
        text: state.spoken.join('\n\n'),
        executed: state.executed,
        rounds: state.rounds,
        stoppedByLimit: state.stoppedByLimit,
        messageAttachments: state.messageAttachments,
        ...(suspension ? { suspension } : {}),
    }
}

/**
 * ⛔ LA RETE: la stessa identica chiamata non riparte dopo il proprio risultato.
 *
 * ## Cosa è successo davvero
 *
 * MISURATO sul Pad il 2026-08-08 con Qwen3-1.7B: a un solo «Accendi la torcia»,
 * e a un solo «sì», il tool è partito **cinque volte** — cinque accensioni nel
 * registro della fotocamera di sistema, con il PID di TALOS. Con Claude Sonnet 5
 * la stessa frase ne produce una. La causa sta nel motore locale (la grammatica
 * pigra non si carica, quindi niente vincola la FINE della chiamata), ma la
 * garanzia non può dipendere da quale modello si è scelto: qui era la torcia,
 * la stessa forma vale per un messaggio da mandare o una scrittura in Libreria.
 *
 * ## La regola, e perché ha questa forma esatta
 *
 * Vale **fra un giro e l'altro**, non dentro lo stesso giro. Due chiamate
 * identiche nello stesso giro sono una richiesta esplicita del modello — «fallo
 * due volte» — e vanno rispettate. Una chiamata identica DOPO aver già letto il
 * proprio risultato non è mai un'intenzione: è un ciclo.
 *
 * Il confronto è sul nome più gli argomenti resi in forma canonica, con le
 * chiavi ordinate: `{"on":true}` e `{ "on" : true }` sono la stessa cosa per
 * chiunque, e devono esserlo anche qui.
 */
function chiaveDiChiamata(call: TalosToolCall): string {
    const canonico = (valore: unknown): unknown => {
        if (Array.isArray(valore)) return valore.map(canonico)
        if (valore && typeof valore === 'object') {
            return Object.fromEntries(
                Object.entries(valore as Record<string, unknown>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([chiave, dentro]) => [chiave, canonico(dentro)]),
            )
        }
        return valore
    }
    try {
        /*
         * ⛔ Gli argomenti arrivano come STRINGA JSON dal provider. Confrontare
         * le stringhe cosi' come sono farebbe passare per diverse due chiamate
         * identiche scritte con una spaziatura diversa — e i modelli locali,
         * che rigenerano la chiamata da capo ogni volta, la spaziatura la
         * cambiano. Si analizza e si rende in forma canonica; se non e' JSON,
         * la stringa grezza e' comunque meglio di niente.
         */
        const grezzi: unknown = typeof call.arguments === 'string'
            ? JSON.parse(call.arguments)
            : call.arguments
        return `${call.name} ${JSON.stringify(canonico(grezzi))}`
    } catch {
        if (typeof call.arguments === 'string') {
            return `${call.name} ${call.arguments.trim()}`
        }
        // Argomenti non serializzabili: meglio lasciar passare che bloccare per
        // un motivo che non c'entra.
        return `${call.name} ${String(Math.random())}`
    }
}

async function pendingPreflights(
    calls: readonly TalosToolCall[],
    preflight: NonNullable<TalosAgentLoopDeps['preflight']>,
): Promise<unknown[]> {
    const resolutions = await Promise.all(calls.map((call) => preflight(call)))
    return resolutions.flatMap((resolution) => (
        resolution.status === 'authorization_required' ? [resolution.request] : []
    ))
}

async function persistBeforeModel(
    state: MutableAgentLoopState,
    deps: TalosAgentLoopDeps,
): Promise<void> {
    if (deps.onBeforeModelCheckpoint) {
        await deps.onBeforeModelCheckpoint(checkpointOf(state, 'before_model'))
    }
}

/**
 * ⛔⛔ L'ANCORAGGIO — e perché è nato da una regressione MIA.
 *
 * Togliere gli strumenti per un giro toglie il ciclo, e sul Pad il 2026-08-09
 * ha funzionato: la bolla vuota è sparita. Ma quello che è comparso al suo
 * posto era **inventato**. Qwen3-1.7B, «elenca le notifiche», ha risposto:
 *
 *     Notifica di connessione a rete
 *     Notifica di caricamento di dati
 *     Notifica di errori di sistema
 *     ...
 *
 * Dieci righe plausibili e **nessuna vera**: le notifiche vere erano WhatsApp,
 * Shizuku, la batteria e il meteo, e stavano nel risultato dello strumento
 * poche righe sopra. Senza schemi da compilare il modello ha scritto prosa —
 * ma ha scritto la prosa che si aspettava, non quella che aveva letto.
 *
 * ⇒ Avevo scambiato **vuoto** con **falso**, che è peggio: una bolla vuota
 * dice «non lo so», un elenco inventato dice «ecco». Chi legge il secondo
 * smette di controllare.
 *
 * Questo turno lo rimette con i piedi per terra: rispondi **da quello che c'è
 * qui sopra**, e se non c'è, dillo. ⛔ Non è una garanzia — un modello piccolo
 * può ignorarlo — ma è la differenza fra un modello a cui non abbiamo chiesto
 * di ancorarsi e uno a cui l'abbiamo chiesto. La garanzia vera non può stare
 * in un'istruzione, e infatti non ci sta: sta nel fatto che una risposta senza
 * fondamento resta un difetto aperto, non una cosa che abbiamo coperto.
 *
 * ⛔ Non entra in `state.turns`: è una spinta per QUESTA chiamata, non un pezzo
 * della conversazione. Persistendolo finirebbe nel checkpoint e nella cronologia,
 * dove non ha niente da fare.
 */
const ANCORAGGIO: ChatTurn = {
    role: 'user',
    content: 'Answer now, in prose, using ONLY the tool results above. Do not invent '
        + 'items, names, or values: if the results do not contain what the user asked '
        + 'for, say exactly that instead of filling the gap.',
}

async function continueTalosAgentLoop(
    state: MutableAgentLoopState,
    deps: TalosAgentLoopDeps,
    resumeRequestedRound: boolean,
): Promise<TalosAgentLoopOutcome> {
    const maxRounds = deps.maxRounds ?? TALOS_AGENT_MAX_ROUNDS
    const maxCalls = deps.maxCalls ?? TALOS_AGENT_MAX_CALLS
    const maxParallel = deps.maxParallel ?? TALOS_AGENT_MAX_PARALLEL
    const messageAttachmentIds = new Set(state.messageAttachments.map((entry) => entry.id))
    const say = (text: string) => { if (text) state.spoken.push(text) }

    for (;;) {
        const completion = state.completion
        if (!completion) throw new Error('TALOS_AGENT_LOOP_CHECKPOINT_INVALID')

        if (!completion.toolCalls?.length) {
            say(completion.text)
            return outcomeOf(state, completion)
        }

        if (!resumeRequestedRound && state.rounds >= maxRounds) {
            state.stoppedByLimit = true
            // SF-MAJOR: answer every pending call, then ask exactly once for a
            // final answer. Persist that provider boundary first so a process
            // death cannot rerun a tool.
            say(completion.text)
            state.turns = [
                ...state.turns,
                { role: 'assistant', content: completion.text, toolCalls: completion.toolCalls },
                ...completion.toolCalls.map((call) => ({
                    role: 'tool' as const,
                    content: `Not run: the limit of ${maxRounds} tool rounds for one message was reached. Answer with what you have.`,
                    toolCallId: call.id,
                    toolName: call.name,
                })),
            ]
            state.completion = null
            await persistBeforeModel(state, deps)
            // Stessa ragione del giro a vuoto: qui la risposta e' l'unica cosa
            // che resta da fare, e offrire gli schemi invita a rifare il giro
            // che il limite ha appena chiuso.
            const finalCompletion = await deps.complete(state.turns, { senzaStrumenti: true })
            say(finalCompletion.text)
            return outcomeOf(state, finalCompletion)
        }

        if (!resumeRequestedRound) {
            state.rounds += 1
            /*
             * ⛔ IL PREAMBOLO SI TIENE, ed è deliberato: la persona l'ha già
             * VISTO scorrere. Toglierlo lo farebbe sparire nel momento in cui
             * il messaggio durevole sostituisce lo stream — un difetto già
             * pagato, custodito dal test «keeps the preamble the user already
             * watched being streamed».
             *
             * ⛔⛔ E allora la balbuzie vista sul Pad il 2026-08-14 alle 00:02
             * con Claude Haiku 4.5 —
             *
             *     «Torcia accesa.»  /  «Torcia accesa.»
             *     «Torcia spenta.»  /  «La torcia è spenta.»
             *
             * — NON si cura qui: la cura sta nel prompt, perché il difetto è
             * che il modello ANNUNCIA UN ESITO prima di aver chiamato. Non è
             * solo una ripetizione: è una frase che dichiara fatto ciò che non
             * è ancora successo, cioè la stessa famiglia di R-30.
             */
            say(completion.text)
        }
        resumeRequestedRound = false
        const requested = completion.toolCalls

        // The budget is spent BEFORE anything runs. Deciding it as results
        // arrive would make which calls are refused depend on the network.
        const budget = Math.max(0, maxCalls - state.executed.length)
        const runnable = requested.slice(0, budget)
        if (runnable.length < requested.length) state.stoppedByLimit = true

        /*
         * ⛔ Le ripetizioni si tolgono QUI, prima della barriera: una chiamata
         * gia' fatta non deve nemmeno far comparire una seconda scheda di
         * consenso. Sul Pad se ne erano accumulate cinque per la stessa torcia.
         */
        const giaFatte = new Map<string, boolean>()
        for (const passato of state.executed) {
            giaFatte.set(chiaveDiChiamata(passato.call), passato.ok)
        }
        const ripetuta = (call: TalosToolCall): boolean =>
            giaFatte.has(chiaveDiChiamata(call))
        const nuove = runnable.filter((call) => !ripetuta(call))

        // Whole-round barrier: one unresolved sibling means NO sibling runs.
        // This is what makes a durable before-tools checkpoint replayable.
        const requests = deps.preflight
            ? await pendingPreflights(nuove, deps.preflight)
            : []
        if (requests.length) {
            state.completion = completion
            return outcomeOf(state, completion, {
                checkpoint: checkpointOf(state, 'before_tools'),
                requests,
            })
        }

        /*
         * ⛔ Il cancello del piano.
         *
         * Sta DOPO la barriera delle autorizzazioni e PRIMA dell'esecuzione,
         * che è l'unico punto in cui ha senso: prima si sa quali chiamate sono
         * eseguibili, poi si chiede il permesso su quell'elenco. Chiederlo
         * prima significherebbe mostrare un piano che contiene passi che il
         * permesso avrebbe tolto comunque.
         */
        const decisione = deps.plan
            ? await deps.plan(nuove)
            : { admitted: nuove.map((call) => call.id), cancelled: false }
        const ammesse = new Set(decisione.admitted)
        const eseguibili = decisione.cancelled
            ? []
            : nuove.filter((call) => ammesse.has(call.id))

        deps.onToolRound?.(eseguibili)
        const risultati = await runCallsTogether(eseguibili, deps.execute, maxParallel)
        /*
         * I risultati tornano nelle posizioni del giro INTERO, non in quelle
         * degli eseguibili: chi è stato tolto dal piano deve comunque ricevere
         * la sua riga, perché un id senza risposta produce una richiesta non
         * valida per i provider severi.
         */
        const outcomes = new Array<(typeof risultati)[number] | undefined>(runnable.length)
        let scorrimento = 0
        for (let indice = 0; indice < runnable.length; indice += 1) {
            const call = runnable[indice]!
            if (ripetuta(call)) {
                /*
                 * Non si finge un successo e non si finge un errore: si dice
                 * cosa e' gia' successo, e si dice cosa fare adesso. Un modello
                 * che riceve «fatto» senza istruzioni riprova; questo sa che il
                 * risultato ce l'ha gia' sopra.
                 */
                const andataBene = giaFatte.get(chiaveDiChiamata(call)) === true
                outcomes[indice] = {
                    ok: andataBene,
                    content: andataBene
                        ? 'Already done in this message, with exactly these arguments. It was NOT run again. Use the earlier result above and answer the user.'
                        : 'Already attempted in this message, with exactly these arguments, and it failed. It was NOT retried. Tell the user what went wrong instead of trying again.',
                }
            } else if (!decisione.cancelled && ammesse.has(call.id)) {
                outcomes[indice] = risultati[scorrimento]
                scorrimento += 1
            } else {
                outcomes[indice] = {
                    ok: false,
                    content: decisione.cancelled
                        ? 'Not run: the user did not approve the plan for this message. Answer with what you have, and do not try again.'
                        : 'Not run: the user removed this step from the plan. Answer with what you have, and do not try it again.',
                }
            }
        }
        const results: ChatTurn[] = requested.map((call, index) => {
            const outcome = outcomes[index]
            if (!outcome) {
                // Every refused call still receives a result: dropping an ID
                // produces an invalid next request for strict providers.
                return {
                    role: 'tool',
                    content: `Not run: the limit of ${maxCalls} tool calls for one message was reached. Answer with what you have.`,
                    toolCallId: call.id,
                    toolName: call.name,
                }
            }
            return {
                role: 'tool',
                content: outcome.content,
                toolCallId: call.id,
                toolName: call.name,
            }
        })

        /*
         * ⛔⛔⛔ UN PREAMBOLO CHE ANNUNCIA CIÒ CHE NON È SUCCESSO SI TOGLIE.
         *
         * ## Visto sul Pad il 2026-08-14
         *
         *     «Sveglia delle 07:00 annullata.»          ← detto PRIMA di chiamare
         *     «Ho mandato il comando al telefono…»      ← l'esito, onesto
         *
         * E l'orologio contava **quattro sveglie armate**. La prima riga era
         * falsa nel momento in cui è stata scritta.
         *
         * ## Perché QUI e non buttando sempre il preambolo
         *
         * Il preambolo si tiene, di regola: la persona l'ha già visto scorrere,
         * e toglierlo lo farebbe sparire sotto gli occhi — c'è un test che lo
         * custodisce, ed è giusto.
         *
         * Ma quel test parte da un preambolo **vero e utile** («Guardo nella tua
         * Libreria»). Quando l'attrezzo dichiara di **non aver avuto effetto**,
         * un annuncio di averlo fatto è una bugia **per costruzione**: non c'è
         * niente da custodire. Mostrare per sempre una frase falsa è peggio che
         * vederne sparire una vera.
         *
         * ⛔ Si toglie SOLO se ogni attrezzo di quel giro è senza effetto: se
         * anche uno solo ha fatto qualcosa, il preambolo può raccontarlo.
         */
        if (completion.text && outcomes.length > 0
            && outcomes.every((esito) => (esito as { senzaEffetto?: boolean }).senzaEffetto === true)
            && state.spoken[state.spoken.length - 1] === completion.text) {
            state.spoken.pop()
        }

        // Provider order, never completion order.
        const seen: TalosMobileInputPart[] = []
        runnable.forEach((call, index) => {
            const toolOutcome = outcomes[index]!
            state.executed.push({ call, ok: toolOutcome.ok })
            if (toolOutcome.images?.length) seen.push(...toolOutcome.images)
            for (const attachment of toolOutcome.messageAttachments ?? []) {
                if (messageAttachmentIds.has(attachment.id)) continue
                messageAttachmentIds.add(attachment.id)
                state.messageAttachments.push(attachment)
            }
        })

        state.turns = [
            ...state.turns,
            { role: 'assistant', content: completion.text, toolCalls: requested },
            ...results,
            /**
             * Anything a tool handed back to LOOK at, on a user turn. Results
             * come first and an empty visual turn is never emitted.
             */
            ...(seen.length && (deps.modelSeesImages?.() ?? true)
                ? [{
                    role: 'user' as const,
                    content: 'The images the tools returned, for you to look at.',
                    parts: seen,
                }]
                : []),
        ]
        state.completion = null
        await persistBeforeModel(state, deps)
        /*
         * ⭐⭐ IL GIRO A VUOTO: se non è arrivata NESSUNA chiamata nuova, il
         * modello sta girando su sé stesso e il prossimo turno si chiede senza
         * strumenti.
         *
         * `runnable` non vuoto e `nuove` vuoto vuol dire esattamente questo: ha
         * chiesto solo cose già fatte in questo messaggio. Ognuna ha ricevuto
         * «già fatto, usa il risultato che hai sopra» — e richiederle di nuovo
         * con le stesse carte in mano non ha ragione di andare diversamente.
         *
         * ⛔ Solo quando il giro è stato INTERAMENTE ripetizioni. Un giro con
         * anche una sola chiamata nuova è un modello che sta lavorando, e
         * togliergli gli strumenti gli spezzerebbe la catena a metà.
         */
        const giroAVuoto = runnable.length > 0 && nuove.length === 0
        state.completion = await deps.complete(
            giroAVuoto ? [...state.turns, ANCORAGGIO] : state.turns,
            giroAVuoto ? { senzaStrumenti: true } : undefined,
        )
    }
}

export async function runTalosAgentLoop(
    initialTurns: ChatTurn[],
    deps: TalosAgentLoopDeps,
): Promise<TalosAgentLoopOutcome> {
    const completion = await deps.complete(initialTurns)
    return continueTalosAgentLoop({
        turns: initialTurns,
        completion,
        spoken: [],
        executed: [],
        rounds: 0,
        stoppedByLimit: false,
        messageAttachments: [],
    }, deps, false)
}

export async function resumeTalosAgentLoop(
    checkpoint: TalosAgentLoopCheckpointV1,
    deps: TalosAgentLoopDeps,
): Promise<TalosAgentLoopOutcome> {
    assertCheckpoint(checkpoint)
    const turni = deps.rehydrateImage
        ? await reidrata(checkpoint.turns, deps.rehydrateImage)
        : checkpoint.turns.map((turno) => (turno.parts?.length
            // Senza il gancio si tolgono comunque le immagini svuotate: mandarle
            // vuote sarebbe peggio che non mandarle.
            ? { ...turno, parts: turno.parts.filter((parte) => parte.type !== 'image' || parte.base64) }
            : turno))
    const state: MutableAgentLoopState = {
        turns: [...turni],
        completion: checkpoint.completion,
        spoken: [...checkpoint.spoken],
        executed: checkpoint.executed.map((entry) => ({ ...entry })),
        rounds: checkpoint.rounds,
        stoppedByLimit: checkpoint.stoppedByLimit,
        messageAttachments: checkpoint.messageAttachments.map((entry) => ({ ...entry })),
    }
    if (checkpoint.stage === 'before_model') {
        state.completion = await deps.complete(state.turns)
    }
    return continueTalosAgentLoop(state, deps, checkpoint.stage === 'before_tools')
}
