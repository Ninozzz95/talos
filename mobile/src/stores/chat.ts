import { computed, reactive, readonly, ref, type Ref } from 'vue'
import { talosEphemeralSessionId, talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'
import type { TalosTranslate } from '@/i18n/contracts'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import type {
    TalosMobileMessageRole,
    TalosMobileMessageState,
    TalosMobileMessageView,
    TalosMobileBrowserActivityView,
} from '@/components/chat/mobileChatTypes'
import { parseTalosMobileBrowserEvidenceEnvelope } from '@/lib/browser/browserContracts'
import { stripLibrarySaveMarkers } from '@/lib/chat/librarySave'
import { talosMessageReasoning } from '@/lib/chat/messageReasoning'
import { TALOS_METADATA_SCHERMO } from '@/lib/tools/tracciaAzione'
import { talosCreateReasoningGate } from '@/lib/chat/reasoningGate'
import type { TalosMobileInputPart } from '@/lib/chat/attachmentContracts'
import {
    createTalosChatSendIdentity,
    type TalosChatSendIdentity,
    type TalosChatSendPreparation,
    type TalosChatSendPreparationContext,
} from '@/lib/chat/sendSnapshot'
import {
    applyTalosSessionLibraryContextPolicyPatch,
    parseTalosSessionLibraryContextPolicy,
    type TalosLibraryTurnOverride,
    type TalosSessionLibraryContextPolicyPatch,
    type TalosSessionLibraryContextPolicyV1,
} from '@/lib/chat/libraryPolicy'
import type { TalosToolDefinition } from '@/lib/tools/registry'
import { newTalosMobileId } from '@/lib/mobileIds'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import type {
    TalosChatRepository,
    AppendChatAttachmentInput,
    TalosChatAttachmentBinding,
    TalosLocalChatMessage,
    TalosLocalChatSession,
    TalosLocalToolActivity,
    TalosLocalChatSurface,
    CreateToolActivityInput,
} from '@/repositories/chatRepository'

/**
 * Owner 2026-07-25 (defect #4): opening a chat loaded EVERY message, so the
 * conversations you use most became the slowest to open. The newest page is
 * loaded first and older ones arrive as you scroll up — the shape WhatsApp and
 * ChatGPT both use. 40 covers most conversations in one read.
 */
export const TALOS_MESSAGE_PAGE_SIZE = 40
const CHAT_SESSION_NOT_FOUND = 'TALOS_CHAT_SESSION_NOT_FOUND'
const NEW_CHAT_TITLE = 'New chat'

/**
 * ⭐⭐ IL TITOLO NON SCRITTO — e perché è una stringa VUOTA, non una parola.
 *
 * ## Il difetto, visto sul Pad il 2026-08-13
 *
 * Ventiquattro chat nell'elenco, **tutte** chiamate «Nuova chat», distinguibili
 * solo dall'ora relativa. Eppure `titleFromPrompt` esisteva ed era giusta.
 *
 * La rinomina automatica era guardata da `active.title === NEW_CHAT_TITLE`,
 * cioè contro la costante **inglese**, mentre il controller creava la sessione
 * col titolo **tradotto** (`translate('chat.newChat')` → «Nuova chat»). In
 * italiano `'Nuova chat' === 'New chat'` è falso: la rinomina non partiva mai.
 * In inglese funzionava **per coincidenza**.
 *
 * ⇒ *Nel database va un FATTO, sullo schermo vanno le PAROLE.* Un titolo
 * tradotto scritto in una colonna non è più traducibile: resta nella lingua di
 * quel giorno anche se la persona cambia lingua, e qualunque confronto contro
 * una costante è destinato a mentire in tutte le lingue tranne una.
 *
 * ## ⛔ Perché NON è la stringa vuota
 *
 * Il primo tentativo salvava `''` — «non ancora intitolata» in ogni lingua. Il
 * database lo ha rifiutato: `normalizeChatTitle` solleva
 * `TALOS_CHAT_TITLE_REQUIRED`, perché una chat senza nome non deve esistere.
 * Il segnaposto quindi è **una parola sola, sempre la stessa**, mai tradotta:
 * un gettone stabile che la guardia riconosce in ogni lingua e che chi disegna
 * traduce al momento di mostrarlo.
 */
export const TALOS_TITOLO_DA_SCRIVERE = NEW_CHAT_TITLE

/**
 * Vero se il titolo è ancora quello che nessuno ha scelto.
 *
 * ⛔ Lo usano DUE lati e devono restare d'accordo: la guardia che rinomina alla
 * prima domanda, e ogni schermata che disegna un titolo — che al posto del
 * gettone mette `t('chat.newChat')`. Se i due si separassero tornerebbe esatto
 * il difetto di oggi, solo dall'altra parte.
 */
export function talosDaIntitolare(title: string): boolean {
    return title.trim() === '' || title === NEW_CHAT_TITLE
}

/**
 * Defect #5: the trace is model output like any other — it can rehearse the
 * library-save syntax, and it can be enormous. Markers are stripped and the
 * text is capped, with the truncation stated rather than hidden.
 */
const REASONING_MAX_CHARS = 64_000

function capturedReasoning(text: string, translate: TalosTranslate): string {
    const clean = stripLibrarySaveMarkers(text)
    return clean.length <= REASONING_MAX_CHARS
        ? clean
        : `${clean.slice(0, REASONING_MAX_CHARS)}\n${translate('chat.reasoningTruncated', {
            count: REASONING_MAX_CHARS,
        })}`
}

/** Debt A1: a provider-agnostic tool call (hub-and-spoke IR — each adapter
 *  translates this to its own wire shape). */
export interface TalosToolCall {
    id: string
    name: string
    /** JSON-encoded arguments, exactly as the provider emitted them. */
    arguments: string
}

export interface ChatTurn {
    /** 'tool' carries a tool RESULT back to the model (the DB already had it). */
    role: 'user' | 'assistant' | 'tool'
    content: string
    parts?: TalosMobileInputPart[]
    /** Set on an assistant turn that requested tools. */
    toolCalls?: TalosToolCall[]
    /** Set on a tool turn: which call this result answers. */
    toolCallId?: string
    /**
     * Set on a tool turn: WHICH TOOL produced it. The OpenAI and Anthropic
     * families match a result to its call by id, so this looks redundant — but
     * Gemini matches by `functionResponse.name` and Ollama by `tool_name`, and
     * neither carries a call id at all. Without the name those two cannot be
     * handed a result, which is exactly why they shipped unwired.
     */
    toolName?: string
    /**
     * ⭐⭐ Blocchi del fornitore da rimandare indietro VERBATIM al giro dopo.
     *
     * Oggi: `server_tool_use` e `tool_search_tool_result` della ricerca attrezzi
     * di Anthropic. La documentazione li vuole «unmodified», quindi qui non si
     * normalizza, non si valida e non si riscrive niente — si conserva.
     *
     * ⛔ `unknown[]` di proposito. Un'interfaccia sarebbe una dichiarazione di
     * aver capito una forma che non e' nostra, e il giorno che il fornitore la
     * cambia saremmo noi a romperla riscrivendola.
     *
     * ⛔ Sta sul TURNO e non solo nel risultato di una chiamata: una chat
     * riaperta domani deve poterli rimandare, se no spedisce una conversazione
     * monca — la stessa famiglia della chiamata orfana che avvelena una chat
     * per sempre.
     */
    providerBlocks?: readonly unknown[]
}

// F2-T4 streaming: the completion may stream partial text through handlers.
// Contract: chunks are LIVE-render only; the durable assistant write happens
// exactly once (final text, or the partial marked interrupted).
export interface TalosStreamHandlers {
    onChunk: (text: string) => void
    /**
     * Owner 2026-07-25 (defect #5): the model's reasoning arrives on its own
     * channel. It is rendered collapsed and persisted with the message — it was
     * being discarded, which threw away the one signal that explains an answer.
     */
    onReasoning?: (text: string) => void
    /**
     * Fired when the transport abandons a streamed attempt and re-asks over the
     * buffered path: the trace collected so far belongs to an answer nobody
     * will ever see.
     */
    onReasoningReset?: () => void
    signal?: AbortSignal
}

/**
 * Owner 2026-07-26: one search result/page the answer rests on. Kept per ANSWER so the chat
 * can show a "Sources" chip under that reply — a chip listing everything the
 * conversation ever read would not be a citation.
 */
export interface TalosMobileWebSource {
    url: string
    title: string
    site: string | null
    publishedAt: string | null
}

/** Debt A1: the result, not a bare string — `finishReason` is what an agent loop
 *  dispatches on, and it used to be produced by every adapter and then discarded. */
export interface ChatCompletionResult {
    text: string
    /** Controller-owned durable assistant evidence; never provider output. */
    metadata?: Readonly<Record<string, unknown>>
    finishReason?: string | null
    /**
     * Token accounting exactly as the provider reported it.
     *
     * Every adapter already produced this and nothing consumed it. The Doctor
     * reads it now to show what prompt caching actually did — otherwise
     * "caching is on" is a claim the owner would have to take on faith.
     * Optional and untouched by anything that ignores it.
     */
    usage?: Record<string, number> | null
    toolCalls?: TalosToolCall[]
    /**
     * ⭐⭐ Blocchi che il fornitore pretende indietro immutati — il QUINTO ponte.
     *
     * Dichiararlo qui non è ripetizione: `TalosMobileCompletionResult` (il
     * contratto dell'adattatore) e questo tipo sono due cose diverse, e senza
     * questa riga il valore sarebbe arrivato fin qui per morire in silenzio.
     *
     * ⛔ È esattamente il difetto che questo progetto ha già pagato — un valore
     * che non arrivava al quinto strato — e stavolta l'ha trovato il typecheck,
     * perché il campo è DICHIARATO invece di viaggiare dentro uno spread.
     */
    providerBlocks?: readonly unknown[]
    /** Defect #5: kept beside the answer, never mixed into it. */
    reasoning?: string
    /**
     * Owner 2026-07-26: the search results/pages this answer rests on, so the chat can show a
     * "Sources" chip under it. Per ANSWER, never per chat — a chip listing
     * everything the conversation ever read is not a citation.
     */
    sources?: readonly TalosMobileWebSource[]
    /** Tool-produced Vault bindings persisted on the final assistant row. */
    attachments?: readonly AppendChatAttachmentInput[]
}

export interface ChatCompletionInvocation<Runtime> {
    readonly identity: Readonly<TalosChatSendIdentity>
    readonly runtime: Runtime
    /** Durable assistant-only resume; never inferred from the selected chat. */
    readonly continuation?: Readonly<{
        checkpoint_id: string
        checkpoint: Readonly<Record<string, unknown>>
    }>
}

export interface TalosChatContinuationInput<Runtime> {
    readonly identity: Readonly<TalosChatSendIdentity>
    readonly runtime: Runtime
    readonly checkpoint_id: string
    readonly checkpoint: Readonly<Record<string, unknown>>
}

export type ChatCompletion<Runtime = undefined> = (
    turns: ChatTurn[],
    stream?: TalosStreamHandlers,
    /** Tools this turn may call; omitted by callers that have no suite. */
    tools?: readonly TalosToolDefinition<never>[],
    invocation?: ChatCompletionInvocation<Runtime>,
) => Promise<ChatCompletionResult>
export type ChatPersistenceStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ChatState {
    sending: boolean
    streamingText: string | null
    /**
     * WHICH conversation the in-flight reply belongs to.
     *
     * Owner 2026-07-26: he left a chat generating, opened a new one, and a
     * message appeared there on its own. It was not a new message — it was the
     * OTHER chat's reply, because the streaming text is one global field and
     * `selectSession` replaces the message list without touching it. The
     * durable write always went to the right session; only the live rendering
     * was homeless.
     */
    streamingSessionId: string | null
    /**
     * WHICH chat is generating, not merely that something is.
     *
     * `sending` alone is one flag for the whole app, so every composer read
     * it and every composer showed a Stop button for somebody else's answer
     * (owner 2026-08-03). `streamingSessionId` could not stand in: it is set
     * only once the reply belongs to a conversation, leaving a window where
     * the app knows it is busy and not on whose behalf.
     */
    sendingSessionId: string | null
    /** Defect #5: the reasoning of the reply being streamed right now. */
    streamingReasoning: string | null
    /** Defect #4: false once the oldest message of the session is on screen. */
    hasOlderMessages: boolean
    loadingOlderMessages: boolean
    lastError: string | null
    persistenceStatus: ChatPersistenceStatus
    persistenceError: string | null
}

export interface ChatStoreOptions<Runtime = undefined> {
    repository: TalosChatRepository
    translate: TalosTranslate
    makeId?: () => string
    now?: () => string
    resolveMessageParts?: (messageId: string) => Promise<TalosMobileInputPart[]>
    /**
     * Synchronous boundary: copies controller-owned state after session capture
     * and before any retrieval await.
     */
    captureSendRuntime?: (
        identity: Readonly<TalosChatSendIdentity>,
        turnPolicy: TalosLibraryTurnOverride | null,
    ) => Runtime
    prepareSend?: (
        context: TalosChatSendPreparationContext<Runtime>,
    ) => Promise<TalosChatSendPreparation<Runtime>>
}

declare const TALOS_CHAT_STORE_RUNTIME: unique symbol

export interface ChatStore<Runtime = undefined> {
    /** @internal Type-only link between a store and its completion runtime. */
    readonly [TALOS_CHAT_STORE_RUNTIME]?: Runtime
    stopStreaming(): void
    readonly messages: readonly TalosMobileMessageView[]
    readonly sessionBrowserActivities: readonly TalosMobileBrowserActivityView[]
    readonly sessions: readonly TalosLocalChatSession[]
    /**
     * The history the user is shown: chats with something in them.
     *
     * A view over `sessions`, never a replacement for it — everything that has
     * to find a chat (boot restoration, the replacement after a delete, the
     * controller's owner lookups) reads the complete list, and only the
     * surfaces that DISPLAY a history read this one.
     */
    readonly history: readonly TalosLocalChatSession[]
    readonly activeSession: Readonly<Ref<TalosLocalChatSession | null>>
    readonly state: Readonly<ChatState>
    initialize(): Promise<void>
    retryPersistence(): Promise<void>
    createSession(
        title?: string,
        modelProfileId?: string | null,
        options?: { ephemeral?: boolean },
    ): Promise<TalosLocalChatSession>
    selectSession(sessionId: string): Promise<void>
    /** Defect #4: prepend the page above the oldest message; returns how many. */
    loadOlderMessages(): Promise<number>
    renameSession(sessionId: string, title: string): Promise<TalosLocalChatSession>
    deleteSession(sessionId: string): Promise<void>
    setSessionArchived(sessionId: string, archived: boolean): Promise<void>
    setSessionLibraryContextPolicy(
        sessionId: string,
        patch: TalosSessionLibraryContextPolicyPatch,
        expectedRevision: number,
    ): Promise<TalosSessionLibraryContextPolicyV1>
    setSessionOrder(orderedIds: string[]): Promise<void>
    exportSnapshot(sessionId?: string): Promise<{
        session: TalosLocalChatSession
        messages: TalosLocalChatMessage[]
        activities: TalosLocalToolActivity[]
        attachments: Array<TalosChatAttachmentBinding & { sha256: string | null }>
    }>
    loadComposerDraft(scopeId?: string | null): Promise<string>
    saveComposerDraft(draft: string, scopeId?: string | null): Promise<void>
    setActiveModelProfile(modelProfileId: string | null): Promise<void>
    setSurface(surface: TalosLocalChatSurface): Promise<void>
    recordBrowserActivity(
        sessionId: string,
        input: Omit<CreateToolActivityInput, 'session_id' | 'message_id'>,
    ): Promise<void>
    send(
        text: string,
        modelProfileId?: string | null,
        metadata?: Record<string, unknown>,
        attachments?: readonly AppendChatAttachmentInput[],
        // Fired the moment the user message is COMMITTED (persisted), before the
        // assistant stream — so the composer (text + attachments) can clear
        // immediately instead of lingering for the whole generation.
        onPersisted?: () => void,
        turnPolicy?: TalosLibraryTurnOverride | null,
    ): Promise<boolean>
    /**
     * Resume durable assistant work on its captured owner. The continuation is
     * queued behind an active send and never invents another user message.
     */
    continueFromCheckpoint(input: TalosChatContinuationInput<Runtime>): Promise<boolean>
}

function toBrowserActivityView(activity: TalosLocalToolActivity): TalosMobileBrowserActivityView | null {
    if (!['session_start', 'navigate', 'snapshot', 'screenshot', 'read', 'click', 'scroll', 'upload', 'wait', 'tabs']
        .includes(activity.operation)) return null
    try {
        return {
            id: activity.id,
            operation: activity.operation,
            status: activity.status,
            occurred_at: activity.created_at,
            evidence: parseTalosMobileBrowserEvidenceEnvelope(activity.evidence),
            failure_code: null,
        }
    } catch {
        return {
            id: activity.id,
            operation: activity.operation,
            status: activity.status,
            occurred_at: activity.created_at,
            evidence: null,
            failure_code: 'TALOS_BROWSER_EVIDENCE_INVALID',
        }
    }
}

function errorMessage(error: unknown, translate: TalosTranslate): string {
    return error instanceof Error && error.message
        ? error.message
        : translate('chat.localStorageFailed')
}

function titleFromPrompt(prompt: string): string {
    return prompt.replace(/\s+/g, ' ').trim().slice(0, 255) || NEW_CHAT_TITLE
}

function toMessageView(
    message: TalosLocalChatMessage,
    attachments: TalosChatAttachmentBinding[] = [],
    toolActivities: TalosLocalToolActivity[] = [],
): TalosMobileMessageView {
    // Debt A1: tool turns are persistable AND readable now (they were collapsed
    // to 'system', which made a tool loop impossible to render).
    const role: TalosMobileMessageRole = message.role
    const view: TalosMobileMessageView = {
        id: message.id,
        ordinal: message.ordinal,
        role,
        content: message.content,
        created_at: message.created_at,
        state: message.state as TalosMobileMessageState,
        model_profile_id: message.model_profile_id,
        run_id: message.run_id,
        metadata: message.metadata,
        // A completed chat row consumes a typed view value, not a second
        // ad-hoc read from the metadata bag. The export uses the same extractor.
        reasoning: message.role === 'assistant'
            ? talosMessageReasoning(message.metadata)
            : null,
    }
    if (attachments.length > 0) {
        view.attachments = attachments.map((attachment) => ({
            id: attachment.id,
            vault_file_id: attachment.vault_file_id,
            grant_id: attachment.grant_id,
            display_name: attachment.display_name,
            media_type: attachment.media_type,
            size_bytes: attachment.size_bytes,
            permissions: [...attachment.permissions],
            grant_status: attachment.grant_status,
        }))
    }
    const browserActivities = toolActivities.flatMap((activity): TalosMobileBrowserActivityView[] => {
        const view = toBrowserActivityView(activity)
        return view ? [view] : []
    })
    if (browserActivities.length > 0) view.browserActivities = browserActivities
    return view
}

function modelIdentity(modelProfileId: string | null): { provider: string | null; model: string | null } {
    if (!modelProfileId) return { provider: null, model: null }
    const separator = modelProfileId.indexOf(':')
    if (separator < 1 || separator === modelProfileId.length - 1) {
        return { provider: null, model: modelProfileId }
    }
    return {
        provider: modelProfileId.slice(0, separator),
        model: modelProfileId.slice(separator + 1),
    }
}

function providerFault(
    error: unknown,
    modelProfileId: string | null,
    translate: TalosTranslate,
): Record<string, unknown> {
    const identity = modelIdentity(modelProfileId)
    if (error instanceof TalosMobileProviderError) {
        const status = error.status ?? null
        const retryable = status === null
            ? null
            : status === 408 || status === 429 || status >= 500
        return {
            layer: 'provider',
            code: status ? `PROVIDER_HTTP_${status}` : 'PROVIDER_CHAT_FAILED',
            message: talosTranslatableErrorMessage(error, translate) ?? error.message,
            next_action: status === 401 || status === 403
                ? translate('chat.updateProviderCredential')
                : translate('chat.checkProviderHealth'),
            retryable,
            status,
            provider: error.provider || identity.provider,
            model: identity.model,
        }
    }
    /**
     * ⛔ L'autorizzazione agli strumenti scaduta NON è un problema di rete.
     *
     * MISURATO dallo screenshot dell'owner del 2026-08-06:
     * `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID` compariva con «controlla il
     * modello selezionato e la connessione, poi riprova» — un consiglio che non
     * c'entra niente e che manda a cercare il guasto dove non c'è.
     *
     * Il checkpoint vale per UN invio con UN modello: se nel frattempo si è
     * cambiato modello o riaperta la chat, l'autorizzazione data prima non copre
     * più ciò che sta per succedere — ed è giusto che non copra, perché un
     * permesso concesso a un modello non è un permesso concesso a un altro.
     *
     * Quindi la cosa da fare è **rimandare il messaggio**, non controllare il
     * Wi-Fi. Un rifiuto che manda dalla parte sbagliata costa più del rifiuto.
     */
    /*
     * ⛔ Un codice interno NON si mostra a una persona. Mai.
     *
     * Owner 2026-08-07, dal suo telefono, testuale: «un avviso del genere
     * farebbe chiudere l'applicazione dal 99% degli utenti. L'utente non
     * riproverebbe neanche. Inaccettabile.»
     *
     * Aveva sotto gli occhi
     * `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID:loop_too_large` dentro un
     * riquadro rosso — cioè il nome che ci siamo dati fra noi per dire dove il
     * controllo è caduto, sbattuto in faccia a chi voleva solo un'immagine di
     * un gatto. Ed è colpa NOSTRA, non sua: non ha sbagliato niente.
     *
     * Peggio: il consiglio sotto diceva «rimanda il messaggio», che è giusto
     * per una causa sola di quella famiglia e sbagliato per questa. Rimandare
     * un giro troppo grande lo fa sbattere contro lo stesso muro.
     *
     * Quindi da qui: la famiglia intera diventa una frase umana, e il consiglio
     * cambia a seconda del PERCHÉ — che il codice conosce già, perché stamattina
     * l'abbiamo insegnato a dirlo.
     */
    const messaggioGrezzo = error instanceof Error ? error.message : String(error)
    /*
     * ⛔ Un errore del DATABASE non e' una frase per una persona.
     *
     * MISURATO sul Pad il 2026-08-07: `Run: UNIQUE constraint failed:
     * talos_chat_attachments.id (code 1555)` dentro un riquadro rosso, in una
     * chat in cui l'immagine era stata generata e salvata benissimo.
     *
     * Chi legge non ha modo di farci niente, e nemmeno di capire che il lavoro
     * era riuscito. Il codice resta nella traccia diagnostica, dove serve; qui
     * si dice cosa e' successo in una lingua umana.
     */
    const guastoDelDeposito = /SQLITE|constraint failed|\(code \d+\)|database is locked/i
        .test(messaggioGrezzo)
    const checkpointRotto = messaggioGrezzo.includes('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
    const troppoGrande = checkpointRotto && /too_large/.test(messaggioGrezzo)
    return {
        layer: 'system',
        code: 'CHAT_EXECUTION_FAILED',
        message: checkpointRotto
            ? translate(troppoGrande
                ? 'chat.authorizationTooBig'
                : 'chat.authorizationLapsed')
            : guastoDelDeposito
                ? translate('chat.storageHiccup')
                : talosTranslatableErrorMessage(error, translate)
                    ?? errorMessage(error, translate),
        next_action: translate(troppoGrande
            ? 'chat.startFreshAfterTooBig'
            : checkpointRotto
                ? 'chat.resendAfterAuthorizationLapsed'
                : guastoDelDeposito
                    ? 'chat.storageHiccupNext'
                    : 'chat.checkModelConnection'),
        retryable: null,
        status: null,
        provider: identity.provider,
        model: identity.model,
    }
}

export function createChatStore<Runtime = undefined>(
    complete: ChatCompletion<Runtime>,
    options: ChatStoreOptions<Runtime>,
): ChatStore<Runtime> {
    const repository = options.repository
    const translate = options.translate
    const makeId = options.makeId ?? newTalosMobileId
    const now = options.now ?? (() => new Date().toISOString())
    const messages = reactive<TalosMobileMessageView[]>([])
    const sessionBrowserActivities = reactive<TalosMobileBrowserActivityView[]>([])
    const sessions = reactive<TalosLocalChatSession[]>([])
    const activeSession = ref<TalosLocalChatSession | null>(null)
    let activeStreamAbort: AbortController | null = null
    const state = reactive<ChatState>({
        sending: false,
        streamingText: null,
        streamingSessionId: null,
        sendingSessionId: null,
        streamingReasoning: null,
        hasOlderMessages: false,
        loadingOlderMessages: false,
        lastError: null,
        persistenceStatus: 'idle',
        persistenceError: null,
    })
    let initialization: Promise<void> | null = null
    let navigationRevision = 0
    const sessionMutationTails = new Map<string, Promise<void>>()
    const desiredModelProfileBySession = new Map<string, string | null>()
    const continuationQueue: Array<{
        input: TalosChatContinuationInput<Runtime>
        resolve(value: boolean): void
    }> = []
    let drainingContinuations = false

    async function loadMessageView(message: TalosLocalChatMessage): Promise<TalosMobileMessageView> {
        const [attachments, toolActivities] = await Promise.all([
            repository.listMessageAttachments(message.id),
            repository.listMessageToolActivities(message.id),
        ])
        return toMessageView(message, attachments, toolActivities)
    }

    /**
     * Defect #4: a full page means there is probably more above it. Asking the
     * database for a count on every open would cost the scan the paging exists
     * to avoid — a full page is the cheap, honest signal, and the first
     * `loadOlderMessages` corrects it if it was wrong.
     */
    function markPageLoaded(rows: readonly unknown[]): void {
        state.hasOlderMessages = rows.length >= TALOS_MESSAGE_PAGE_SIZE
    }

    function markPersistenceFailure(error: unknown): void {
        const detail = errorMessage(error, translate)
        state.persistenceStatus = 'error'
        state.persistenceError = translate('chat.localStorageUnavailableDetail', { detail })
        state.lastError = state.persistenceError
    }

    async function readSnapshot(): Promise<{
        sessions: TalosLocalChatSession[]
        active: TalosLocalChatSession | null
        messages: TalosMobileMessageView[]
        sessionBrowserActivities: TalosMobileBrowserActivityView[]
    }> {
        const available = await repository.listSessions()
        let activeId = await repository.getActiveSessionId()
        if (!available.some((session) => session.id === activeId)) {
            activeId = available[0]?.id ?? null
            if (activeId) await repository.selectSession(activeId)
        }
        const active = available.find((session) => session.id === activeId) ?? null
        const restoredRows = active
            ? await repository.listMessages(active.id, { limit: TALOS_MESSAGE_PAGE_SIZE })
            : []
        markPageLoaded(restoredRows)
        const restored = await Promise.all(restoredRows.map(loadMessageView))
        const browserActivities = active
            ? (await repository.listSessionToolActivities(active.id))
                .filter((activity) => activity.message_id === null)
                .flatMap((activity) => {
                    const view = toBrowserActivityView(activity)
                    return view ? [view] : []
                })
            : []
        return { sessions: available, active, messages: restored, sessionBrowserActivities: browserActivities }
    }

    function applySnapshot(snapshot: Awaited<ReturnType<typeof readSnapshot>>): void {
        sessions.splice(0, sessions.length, ...snapshot.sessions)
        activeSession.value = snapshot.active
        messages.splice(0, messages.length, ...snapshot.messages)
        sessionBrowserActivities.splice(0, sessionBrowserActivities.length, ...snapshot.sessionBrowserActivities)
    }

    async function performInitialize(force: boolean): Promise<void> {
        if (!force && state.persistenceStatus === 'ready') return
        state.persistenceStatus = 'loading'
        state.persistenceError = null
        try {
            await repository.initialize()
            applySnapshot(await readSnapshot())
            state.persistenceStatus = 'ready'
            state.persistenceError = null
            state.lastError = null
        } catch (error) {
            markPersistenceFailure(error)
        }
    }

    async function initialize(): Promise<void> {
        if (!initialization) {
            initialization = performInitialize(false).finally(() => { initialization = null })
        }
        await initialization
    }

    async function retryPersistence(): Promise<void> {
        if (!initialization) {
            initialization = performInitialize(true).finally(() => { initialization = null })
        }
        await initialization
    }

    function requirePersistence(): void {
        if (state.persistenceStatus !== 'ready') {
            throw new Error(state.persistenceError ?? translate('chat.localStorageNotReady'))
        }
    }

    /**
     * SQLite writes for one session are ordered by invocation, so a slow older
     * model write cannot land after a newer user selection.
     */
    function enqueueSessionMutation<T>(
        sessionId: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous = sessionMutationTails.get(sessionId) ?? Promise.resolve()
        const current = previous.catch(() => undefined).then(operation)
        let tail!: Promise<void>
        tail = current.then(() => undefined, () => undefined).finally(() => {
            if (sessionMutationTails.get(sessionId) === tail) {
                sessionMutationTails.delete(sessionId)
            }
        })
        sessionMutationTails.set(sessionId, tail)
        return current
    }

    async function refreshSessionList(): Promise<void> {
        const available = await repository.listSessions()
        sessions.splice(0, sessions.length, ...available)
        const active = activeSession.value
        /**
         * Owner 2026-07-31, and the reason a temporary chat behaved like a
         * ghost.
         *
         * This list comes from the DURABLE side by design — a temporary chat
         * must not appear in the history — so it can never contain the session
         * the user is actually in. The old line then concluded there was no
         * active session at all, and did it after EVERY message: the chat you
         * were typing into stopped being the chat you were in.
         *
         * A temporary session is kept because absence from this list is its
         * defining property, not evidence that it is gone.
         */
        if (active && talosIsEphemeralSessionId(active.id)) return
        activeSession.value = available.find((session) => session.id === active?.id) ?? null
    }

    /**
     * The history: the chats that have something in them.
     *
     * Owner 2026-07-31, approved. `sessions` remains everything there is —
     * boot restoration, delete nomination and the controller's owner lookups
     * all need the complete set — and this is the view the user is shown. The
     * two used to be the same object, which is why six chats he had opened and
     * not used were sitting in his list.
     */
    const history = computed(
        () => sessions.filter((session) => session.has_messages !== false),
    )

    /**
     * Replace a listed session, KEEPING what the replacement was never told.
     *
     * Found by an adversarial review, 2026-07-31. Only `listSessions` reports
     * `has_messages`; every other repository method hands back a session object
     * without it. Writing one of those straight into the list erased the flag,
     * and `undefined` reads as "show it" — so an untouched chat popped into the
     * history the moment its per-chat Library setting changed, from the menu or
     * from the model's own policy tool.
     *
     * The filter deliberately still fails toward SHOWING: between a blank chat
     * that lingers and a real conversation that vanishes, only one of those is
     * survivable. This function is what stops the blank one lingering, and it
     * exists so the next write-back cannot reintroduce the same hole by simply
     * assigning.
     */
    function replaceListedSession(sessionId: string, next: TalosLocalChatSession): void {
        const index = sessions.findIndex((session) => session.id === sessionId)
        if (index < 0) return
        const known = sessions[index]!.has_messages
        sessions[index] = next.has_messages === undefined && known !== undefined
            ? { ...next, has_messages: known }
            : next
    }

    // R2-9: appendMessage bumps ONLY the session's updated_at in the DB —
    // mirror that locally instead of a full-table round-trip on EVERY user
    // and assistant append (it was two listSessions per exchange).
    function bumpSessionRecency(sessionId: string, updatedAt: string): void {
        const index = sessions.findIndex((session) => session.id === sessionId)
        if (index < 0) return
        // The first message is also the moment this chat ENTERS the history.
        const updated = { ...sessions[index], updated_at: updatedAt, has_messages: true }
        sessions.splice(index, 1)
        // listSessions orders by updated_at DESC — the freshest bump leads.
        sessions.unshift(updated)
        if (activeSession.value?.id === sessionId) activeSession.value = updated
    }

    /** Defect #4: a fresh thread has nothing above it. */
    function resetPaging(): void {
        state.hasOlderMessages = false
        state.loadingOlderMessages = false
    }

    /**
     * F-14: `ephemeral` marks the new chat temporary, and the mark lives in the
     * id it is given — so the router keeps every write for it in memory without
     * anything here having to remember that it did.
     *
     * Note what happens below WITHOUT extra code: the refreshed session list
     * comes from the durable side only, so a temporary chat is not found in it
     * and `created` is used instead. It becomes the chat you are in, and appears
     * in no history. That is exactly the behaviour asked for, and it falls out
     * of the routing rather than being arranged.
     */
    async function createSession(
        title = TALOS_TITOLO_DA_SCRIVERE,
        modelProfileId: string | null = null,
        options: { ephemeral?: boolean } = {},
    ): Promise<TalosLocalChatSession> {
        const revision = ++navigationRevision
        resetPaging()
        requirePersistence()
        try {
            const created = await repository.createSession({
                id: options.ephemeral ? talosEphemeralSessionId(makeId()) : makeId(),
                title,
                active_model_profile_id: modelProfileId,
                created_at: now(),
            })
            await refreshSessionList()
            if (revision !== navigationRevision) return created
            activeSession.value = sessions.find((session) => session.id === created.id) ?? created
            messages.splice(0, messages.length)
            sessionBrowserActivities.splice(0, sessionBrowserActivities.length)
            state.lastError = null
            return activeSession.value
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    /**
     * Defect #4: prepend the page ABOVE the oldest message on screen. Returns
     * how many arrived so the list can restore the scroll anchor — prepending
     * without that makes the view jump, which is worse than the slow open it
     * replaced.
     */
    async function loadOlderMessages(): Promise<number> {
        const session = activeSession.value
        const oldest = messages[0]
        if (!session || !oldest || state.loadingOlderMessages || !state.hasOlderMessages) return 0
        state.loadingOlderMessages = true
        try {
            const rows = await repository.listMessages(session.id, {
                limit: TALOS_MESSAGE_PAGE_SIZE,
                before: { ordinal: oldest.ordinal ?? 0, id: oldest.id },
            })
            if (rows.length === 0) {
                state.hasOlderMessages = false
                return 0
            }
            const older = await Promise.all(rows.map(loadMessageView))
            // SF-MAJOR: `session` and `oldest` were captured BEFORE two awaits.
            // Tapping another chat while SQLite answered used to splice one
            // conversation's history into the top of another — and the model
            // then received it as context. Re-check before touching the array.
            if (activeSession.value?.id !== session.id || messages[0]?.id !== oldest.id) return 0
            state.hasOlderMessages = rows.length >= TALOS_MESSAGE_PAGE_SIZE
            messages.splice(0, 0, ...older)
            return older.length
        } catch (error) {
            markPersistenceFailure(error)
            return 0
        } finally {
            state.loadingOlderMessages = false
        }
    }

    async function selectSession(sessionId: string): Promise<void> {
        const revision = ++navigationRevision
        requirePersistence()
        try {
            await repository.selectSession(sessionId)
            const restoredRows = await repository.listMessages(sessionId, { limit: TALOS_MESSAGE_PAGE_SIZE })
            markPageLoaded(restoredRows)
            const restored = await Promise.all(restoredRows.map(async (message) => loadMessageView(message)))
            const browserActivities = (await repository.listSessionToolActivities(sessionId))
                .filter((activity) => activity.message_id === null)
                .flatMap((activity) => {
                    const view = toBrowserActivityView(activity)
                    return view ? [view] : []
                })
            await refreshSessionList()
            const selected = sessions.find((session) => session.id === sessionId)
            if (!selected) throw new Error(CHAT_SESSION_NOT_FOUND)
            if (revision !== navigationRevision) return
            activeSession.value = selected
            messages.splice(0, messages.length, ...restored)
            sessionBrowserActivities.splice(0, sessionBrowserActivities.length, ...browserActivities)
            state.lastError = null
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function renameSession(sessionId: string, title: string): Promise<TalosLocalChatSession> {
        requirePersistence()
        try {
            const renamed = await repository.renameSession(sessionId, title)
            await refreshSessionList()
            if (activeSession.value?.id === sessionId) activeSession.value = renamed
            return renamed
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function deleteSession(sessionId: string): Promise<void> {
        const revision = ++navigationRevision
        requirePersistence()
        /**
         * Owner 2026-07-31, on video: he pressed «Modalità incognito», the
         * incognito chat rendered for one frame, and the app threw him back
         * into the conversation he had open before.
         *
         * This was it, and it is not about incognito. Deleting a session makes
         * the durable side nominate a replacement whenever the row IT holds as
         * active is the one that went. While you are in a temporary chat it
         * still holds the PREVIOUS one — a temporary chat is never written
         * there — so cleaning up the blank chat the switch replaced nominated
         * some other conversation, and the line below obeyed, dragging its
         * messages onto the screen with it.
         *
         * Deleting a chat you are not in is not navigation. The nomination is
         * only followed when the chat on screen is the one being deleted,
         * because that is the only case where staying is impossible.
         */
        const staying = activeSession.value
        const screenSurvives = staying !== null && staying.id !== sessionId
        try {
            const nextId = await repository.deleteSession(sessionId)
            if (screenSurvives) {
                const remaining = await repository.listSessions()
                if (revision !== navigationRevision) return
                sessions.splice(0, sessions.length, ...remaining)
                state.lastError = null
                return
            }
            const available = await repository.listSessions()
            /**
             * Where the delete LANDS you. Two defects, both found by an
             * adversarial review 2026-07-31, and one line answers both.
             *
             * The repository nominates the most recently updated survivor,
             * which was the right answer while every chat was visible. Now that
             * a chat enters the history only when it has something in it, the
             * nominee can be a chat no list can show: the header names a
             * conversation that appears nowhere and cannot be selected, deleted
             * or archived. So a nominee the history cannot show is passed over.
             *
             * And deleting the incognito chat you are IN nominates through the
             * memory side while this lookup reads the durable list, so the
             * answer was always "nowhere" — an empty screen. A nomination that
             * resolves to nothing now falls through to the same rule.
             *
             * `available` is ordered most-recent-first, so the fallbacks pick
             * the freshest, and the last one exists so that a device where
             * every chat is blank still lands somewhere rather than nowhere.
             */
            const nominated = available.find((session) => session.id === nextId) ?? null
            const next = nominated?.has_messages !== false
                ? nominated ?? available.find((session) => session.has_messages !== false)
                    ?? available[0] ?? null
                : available.find((session) => session.has_messages !== false) ?? nominated
            const nextRows = next
                ? await repository.listMessages(next.id, { limit: TALOS_MESSAGE_PAGE_SIZE })
                : []
            markPageLoaded(nextRows)
            const restored = await Promise.all(nextRows.map(loadMessageView))
            const browserActivities = next
                ? (await repository.listSessionToolActivities(next.id))
                    .filter((activity) => activity.message_id === null)
                    .flatMap((activity) => {
                        const view = toBrowserActivityView(activity)
                        return view ? [view] : []
                    })
                : []
            if (revision !== navigationRevision) return
            sessions.splice(0, sessions.length, ...available)
            activeSession.value = next
            messages.splice(0, messages.length, ...restored)
            sessionBrowserActivities.splice(0, sessionBrowserActivities.length, ...browserActivities)
            state.lastError = null
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    function composerDraftScope(scopeId?: string | null): string {
        return scopeId ?? activeSession.value?.id ?? 'new'
    }

    async function loadComposerDraft(scopeId?: string | null): Promise<string> {
        requirePersistence()
        return repository.loadComposerDraft(composerDraftScope(scopeId))
    }

    async function saveComposerDraft(draft: string, scopeId?: string | null): Promise<void> {
        requirePersistence()
        await repository.saveComposerDraft(composerDraftScope(scopeId), draft)
    }

    async function setActiveModelProfile(modelProfileId: string | null): Promise<void> {
        requirePersistence()
        const active = activeSession.value
        if (!active) return
        const currentDesired = desiredModelProfileBySession.has(active.id)
            ? desiredModelProfileBySession.get(active.id)
            : active.active_model_profile_id
        if (currentDesired === modelProfileId) return
        desiredModelProfileBySession.set(active.id, modelProfileId)
        try {
            await enqueueSessionMutation(active.id, () => repository.updateSession(active.id, {
                active_model_profile_id: modelProfileId,
            }))
            if (desiredModelProfileBySession.get(active.id) === modelProfileId) {
                await refreshSessionList()
            }
        } catch (error) {
            if (desiredModelProfileBySession.get(active.id) === modelProfileId) {
                desiredModelProfileBySession.delete(active.id)
            }
            markPersistenceFailure(error)
            throw error
        }
    }

    // F4-#16 — raw snapshot for the local export builders: session, ordered
    // messages, session tool activities, and attachment bindings enriched
    // with the vault sha256 (name+hash provenance, never storage paths).
    async function exportSnapshot(sessionId?: string) {
        requirePersistence()
        const targetId = sessionId ?? activeSession.value?.id
        if (!targetId) throw new Error(CHAT_SESSION_NOT_FOUND)
        const session = sessions.find((candidate) => candidate.id === targetId)
        if (!session) throw new Error(CHAT_SESSION_NOT_FOUND)
        const exportMessages = await repository.listMessages(targetId)
        const activities = await repository.listSessionToolActivities(targetId)
        const attachments = []
        for (const message of exportMessages) {
            for (const binding of await repository.listMessageAttachments(message.id)) {
                const vaultFile = await repository.getVaultFile(binding.vault_file_id).catch(() => null)
                attachments.push({ ...binding, sha256: vaultFile?.sha256 ?? null })
            }
        }
        return { session, messages: exportMessages, activities, attachments }
    }

    // F4-#23 — archive flag and manual order live in session metadata: they
    // survive restart, stay local-first, and need no schema migration.
    async function setSessionArchived(sessionId: string, archived: boolean): Promise<void> {
        requirePersistence()
        const current = sessions.find((session) => session.id === sessionId)
        if (!current) throw new Error(CHAT_SESSION_NOT_FOUND)
        try {
            const updated = await repository.updateSessionMetadata(sessionId, {
                ...current.metadata, archived,
            })
            if (activeSession.value?.id === sessionId) activeSession.value = updated
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function setSessionLibraryContextPolicy(
        sessionId: string,
        patch: TalosSessionLibraryContextPolicyPatch,
        expectedRevision: number,
    ): Promise<TalosSessionLibraryContextPolicyV1> {
        requirePersistence()
        return enqueueSessionMutation(sessionId, async () => {
            const current = sessions.find((session) => session.id === sessionId)
            if (!current) throw new Error(CHAT_SESSION_NOT_FOUND)
            const stored = parseTalosSessionLibraryContextPolicy(
                current.metadata.library_context_policy,
            )
            const candidate = applyTalosSessionLibraryContextPolicyPatch(
                stored ?? {
                    schema_version: 1,
                    revision: 0,
                    enabled: null,
                    mode: null,
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: null,
                },
                patch,
                expectedRevision,
                now(),
            )
            try {
                const updated = await repository.updateSessionMetadata(sessionId, {
                    ...current.metadata,
                    library_context_policy: candidate,
                })
                replaceListedSession(sessionId, updated)
                if (activeSession.value?.id === sessionId) activeSession.value = updated
                return candidate
            } catch (error) {
                markPersistenceFailure(error)
                throw error
            }
        })
    }

    async function setSessionOrder(orderedIds: string[]): Promise<void> {
        requirePersistence()
        try {
            for (const [index, sessionId] of orderedIds.entries()) {
                const current = sessions.find((session) => session.id === sessionId)
                if (!current) continue
                const updated = await repository.updateSessionMetadata(sessionId, {
                    ...current.metadata, sort_index: index,
                })
                if (activeSession.value?.id === sessionId) activeSession.value = updated
            }
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function setSurface(surface: TalosLocalChatSurface): Promise<void> {
        requirePersistence()
        let active = activeSession.value
        if (!active) active = await createSession(TALOS_TITOLO_DA_SCRIVERE)
        if (active.surface === surface) return
        try {
            const updated = await repository.updateSession(active.id, { surface })
            activeSession.value = updated
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function recordBrowserActivity(
        sessionId: string,
        input: Omit<CreateToolActivityInput, 'session_id' | 'message_id'>,
    ): Promise<void> {
        requirePersistence()
        try {
            const activity = await repository.appendToolActivity({
                ...input,
                session_id: sessionId,
                message_id: null,
            })
            const view = toBrowserActivityView(activity)
            if (view && activeSession.value?.id === sessionId) sessionBrowserActivities.push(view)
            await refreshSessionList()
        } catch (error) {
            markPersistenceFailure(error)
            throw error
        }
    }

    async function ensureActiveSession(prompt: string, modelProfileId: string | null): Promise<TalosLocalChatSession> {
        let active = activeSession.value
        if (!active) return createSession(titleFromPrompt(prompt), modelProfileId)

        const targetSessionId = active.id
        const projectionRevision = navigationRevision
        const update: { title?: string; active_model_profile_id?: string | null } = {}
        if (active.active_model_profile_id !== modelProfileId) update.active_model_profile_id = modelProfileId
        if (messages.length === 0 && talosDaIntitolare(active.title)) update.title = titleFromPrompt(prompt)
        if (Object.keys(update).length > 0) {
            if ('active_model_profile_id' in update) {
                desiredModelProfileBySession.set(targetSessionId, modelProfileId)
            }
            active = await enqueueSessionMutation(
                targetSessionId,
                () => repository.updateSession(targetSessionId, update),
            )
            const isLatestModel = !('active_model_profile_id' in update)
                || desiredModelProfileBySession.get(targetSessionId) === modelProfileId
            if (isLatestModel) {
                if (
                    projectionRevision === navigationRevision
                    && activeSession.value?.id === targetSessionId
                ) {
                    activeSession.value = active
                }
                await refreshSessionList()
            }
        }
        return active
    }

    async function appendDurable(
        sessionId: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        messageState: TalosMobileMessageState,
        modelProfileId: string | null,
        metadata: Record<string, unknown> = {},
        attachments: readonly AppendChatAttachmentInput[] = [],
    ): Promise<void> {
        const persisted = await repository.appendMessage({
            id: makeId(),
            session_id: sessionId,
            role,
            content,
            state: messageState,
            model_profile_id: modelProfileId,
            metadata,
            attachments,
            created_at: now(),
        })
        const view = await loadMessageView(persisted)
        if (activeSession.value?.id === sessionId) messages.push(view)
        bumpSessionRecency(sessionId, persisted.created_at)
    }

    async function runContinuation(
        input: TalosChatContinuationInput<Runtime>,
    ): Promise<boolean> {
        state.sending = true
        // The chat you are on owns it until the journal says otherwise.
        state.sendingSessionId = activeSession.value?.id ?? null
        state.lastError = null
        const abort = new AbortController()
        activeStreamAbort = abort
        let streamed = ''
        let reasoned = ''
        try {
            /**
             * The chat you are IN counts, even when no history lists it.
             *
             * Found by an adversarial review 2026-07-31 as an unverified lead,
             * and it was real. Incognito deliberately keeps the create and web
             * tools — drawing a picture reveals nothing about you — and both are
             * `write`/`outbound`, so the permission gate can ask, and an answer
             * produces a checkpoint that has to be resumed here.
             *
             * This resolved the owner from the DURABLE list, where a temporary
             * chat is never present: that absence is the feature, not evidence
             * it is gone — the same confusion that produced three defects this
             * week. So the approval failed with "session not found",
             * `complete()` was never called, and the user saw a tap on "allow"
             * do nothing at all.
             *
             * The active session is checked first, which is also the only place
             * a temporary chat can be found: it exists exactly while you are in
             * it.
             */
            const active = activeSession.value
            const owner = active?.id === input.identity.sessionId
                ? active
                : (await repository.listSessions()).find(
                    (session) => session.id === input.identity.sessionId,
                )
            if (!owner) {
                state.lastError = CHAT_SESSION_NOT_FOUND
                return false
            }

            // Crash reconciliation: the final assistant row is the receipt.
            // If it exists, no provider or tool call may happen again.
            const existing = await repository.listMessages(owner.id)
            if (existing.some((message) =>
                message.role === 'assistant'
                && message.metadata?.tool_authorization_checkpoint_id === input.checkpoint_id)) {
                return true
            }

            state.streamingSessionId = owner.id
            state.sendingSessionId = owner.id
            // Il ragionamento arriva a token e non deve diventare DOM a token:
            // vedi `reasoningGate`. Uno per invio, così non sopravvive a niente.
            const ritmoRagionamento = talosCreateReasoningGate()
            const handlers: TalosStreamHandlers = {
                onChunk: (text) => {
                    streamed += text
                    // Il primo carattere della risposta dice che il ragionamento
                    // è finito: quello che era trattenuto esce adesso, intero.
                    if (ritmoRagionamento.release()) state.streamingReasoning = reasoned
                    state.streamingText = streamed.includes('[TALOS_SAVE_LIBRARY')
                        ? stripLibrarySaveMarkers(streamed)
                        : streamed
                },
                onReasoning: (text) => {
                    reasoned += text
                    if (ritmoRagionamento.accept()) state.streamingReasoning = reasoned
                },
                onReasoningReset: () => {
                    reasoned = ''
                    ritmoRagionamento.reset()
                    state.streamingReasoning = null
                },
                signal: abort.signal,
            }
            const invocation: ChatCompletionInvocation<Runtime> = Object.freeze({
                identity: input.identity,
                runtime: input.runtime,
                continuation: Object.freeze({
                    checkpoint_id: input.checkpoint_id,
                    checkpoint: input.checkpoint,
                }),
            })
            const reply = await complete([], handlers, undefined, invocation)
            const rawThinking = reply.reasoning ?? (reasoned || undefined)
            const thinking = rawThinking ? capturedReasoning(rawThinking, translate) : undefined
            const assistantMetadata = {
                ...(reply.metadata ?? {}),
                tool_authorization_checkpoint_id: input.checkpoint_id,
                ...(reply.toolCalls?.length
                    ? { tool_calls: reply.toolCalls, finish_reason: reply.finishReason ?? null }
                    : {}),
                // ⛔ Salvati, o la cura dura un messaggio solo: il perché sta
                // accanto al lettore, in `storiaConLeChiamate`.
                ...(reply.providerBlocks?.length
                    ? { provider_blocks: reply.providerBlocks }
                    : {}),
                ...(thinking ? { reasoning: thinking } : {}),
                ...(reply.sources?.length ? { sources: reply.sources } : {}),
            }
            await appendDurable(
                owner.id,
                'assistant',
                reply.text,
                'persisted',
                input.identity.modelProfileId,
                assistantMetadata,
                reply.attachments,
            )
            return true
        } catch (error) {
            const aborted = error instanceof Error && error.name === 'AbortError'
            if (streamed || reasoned) {
                try {
                    await appendDurable(
                        input.identity.sessionId,
                        'assistant',
                        stripLibrarySaveMarkers(streamed),
                        'persisted',
                        input.identity.modelProfileId,
                        {
                            interrupted: true,
                            ...(reasoned
                                ? { reasoning: capturedReasoning(reasoned, translate) }
                                : {}),
                        },
                    )
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
            if (!aborted) {
                state.lastError = errorMessage(error, translate)
                try {
                    await appendDurable(
                        input.identity.sessionId,
                        'system',
                        state.lastError,
                        'failed',
                        input.identity.modelProfileId,
                        { chat_error: providerFault(error, input.identity.modelProfileId, translate) },
                    )
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
            return false
        } finally {
            state.streamingText = null
            state.streamingSessionId = null
            state.sendingSessionId = null
            state.streamingReasoning = null
            if (activeStreamAbort === abort) activeStreamAbort = null
            state.sending = false
        }
    }

    async function drainContinuationQueue(): Promise<void> {
        if (drainingContinuations || state.sending) return
        drainingContinuations = true
        try {
            while (continuationQueue.length > 0 && !state.sending) {
                const queued = continuationQueue.shift()!
                queued.resolve(await runContinuation(queued.input))
            }
        } finally {
            drainingContinuations = false
            if (continuationQueue.length > 0 && !state.sending) {
                void drainContinuationQueue()
            }
        }
    }

    function continueFromCheckpoint(
        input: TalosChatContinuationInput<Runtime>,
    ): Promise<boolean> {
        if (
            !input.checkpoint_id
            || !input.identity.sessionId
            || !input.identity.sendId
            || input.checkpoint === null
            || typeof input.checkpoint !== 'object'
            || Array.isArray(input.checkpoint)
        ) {
            return Promise.resolve(false)
        }
        return new Promise<boolean>((resolve) => {
            continuationQueue.push({ input, resolve })
            void drainContinuationQueue()
        })
    }

    async function send(
        text: string,
        modelProfileId: string | null = null,
        metadata: Record<string, unknown> = {},
        attachments: readonly AppendChatAttachmentInput[] = [],
        onPersisted?: () => void,
        turnPolicy: TalosLibraryTurnOverride | null = null,
    ): Promise<boolean> {
        const trimmed = text.trim()
        if ((!trimmed && attachments.length === 0) || state.sending) return false
        if (state.persistenceStatus !== 'ready') {
            state.lastError = state.persistenceError ?? translate('chat.localStorageNotReady')
            return false
        }

        state.sending = true
        state.sendingSessionId = activeSession.value?.id ?? null
        state.lastError = null
        const acceptedAt = new Date().toISOString()
        const abort = new AbortController()
        activeStreamAbort = abort
        const finishSend = (): void => {
            state.streamingText = null
            state.streamingSessionId = null
            state.sendingSessionId = null
            state.streamingReasoning = null
            activeStreamAbort = null
            state.sending = false
            void drainContinuationQueue()
        }
        let session: TalosLocalChatSession
        let invocation: ChatCompletionInvocation<Runtime>
        try {
            session = await ensureActiveSession(trimmed || 'Shared files', modelProfileId)
        } catch (error) {
            markPersistenceFailure(error)
            finishSend()
            return false
        }

        /*
         * ⛔⛔ IL CONTESTO DELLO SCHERMO SI SFILA QUI, prima di tutto.
         *
         * Owner 2026-08-11, con lo screenshot: nella chat compariva l'intero
         * prompt del contesto — «Qui sotto c'è il testo che compare adesso sullo
         * schermo…» più tutti i nomi delle icone — come se l'avesse scritto lui.
         *
         * Da qui in poi il contesto NON è più nei metadati: non passa da
         * `prepareSend`, non finisce in `appendDurable`, non tocca il disco.
         * Rientra in gioco una volta sola, sull'ultimo turno della richiesta.
         */
        const schermoDiQuestoTurno = typeof metadata[TALOS_METADATA_SCHERMO] === 'string'
            ? String(metadata[TALOS_METADATA_SCHERMO]).trim()
            : ''
        const metadatiPuliti = { ...metadata }
        delete metadatiPuliti[TALOS_METADATA_SCHERMO]
        let preparedMetadata = { ...metadatiPuliti }
        try {
            const identity = createTalosChatSendIdentity({
                sendId: newTalosMobileId(),
                sessionId: session.id,
                sessionTitle: session.title,
                surface: session.surface,
                modelProfileId,
                acceptedAt,
            })
            let runtime = options.captureSendRuntime
                ? options.captureSendRuntime(identity, turnPolicy)
                : undefined as Runtime
            if (options.prepareSend) {
                const prepared = await options.prepareSend({
                    identity,
                    text: trimmed,
                    metadata: Object.freeze({ ...metadatiPuliti }),
                    attachments: Object.freeze([...attachments]),
                    signal: abort.signal,
                    runtime,
                })
                runtime = prepared.runtime
                preparedMetadata = {
                    ...preparedMetadata,
                    ...(prepared.metadata ?? {}),
                }
            }
            if (abort.signal.aborted) {
                finishSend()
                return false
            }
            invocation = Object.freeze({ identity, runtime })
        } catch (error) {
            state.lastError = errorMessage(error, translate)
            finishSend()
            return false
        }

        try {
            await appendDurable(
                session.id,
                'user',
                trimmed,
                'persisted',
                modelProfileId,
                preparedMetadata,
                attachments,
            )
        } catch (error) {
            markPersistenceFailure(error)
            finishSend()
            return false
        }

        // From here the live reply BELONGS to this conversation. Switching chats
        // must not carry it across, and the previous behaviour did exactly that.
        state.streamingSessionId = session.id
        state.sendingSessionId = session.id

        // The user turn is committed — let the composer clear NOW (text +
        // attachments) instead of lingering for the whole assistant stream.
        onPersisted?.()

        let turns: ChatTurn[]
        try {
            // Defect #4 follow-up (found while re-reviewing the six changes
            // together): the view is PAGED now, so building turns from it would
            // have silently truncated the model's memory to the last page on
            // any long conversation — the answer would get worse the longer you
            // had talked. The model's history is read in full, from the store.
            const history = await repository.listMessages(session.id)
            const withAttachments = new Set(await repository.listSessionAttachmentMessageIds(session.id))
            /*
             * ⛔ PIGRO, e non per eleganza: MISURATO in tre forme. Statico
             * costava 709 byte al grafo d'avvio (601.960 → 602.669, rosso); col
             * solo `import()` ne restavano 294 (602.294, ancora rosso); portando
             * dentro il modulo anche il giro che era qui, l'avvio **scende**.
             *
             * Qui siamo già dentro un `await` che precede il primo byte verso il
             * provider, e il giro dell'agente carica `toolset` e `agentLoop`
             * allo stesso modo: il chunk arriva prima che serva.
             */
            const { talosTurniDallaStoria } = await import('@/lib/chat/storiaConLeChiamate')
            turns = await talosTurniDallaStoria({
                messaggi: history,
                conAllegati: withAttachments,
                pezziDelMessaggio: options.resolveMessageParts,
            })
            /*
             * ⭐⭐ E QUI lo schermo rientra: sull'ULTIMO turno dell'utente, solo
             * per questa richiesta.
             *
             * ⛔ Non prima: i turni si ricostruiscono dalla storia su disco, e
             * sul disco il contesto non c'è — per scelta. Se lo scrivessimo là,
             * il modello se lo ritroverebbe in ogni risposta futura, riferito a
             * uno schermo che nel frattempo è cambiato.
             */
            if (schermoDiQuestoTurno) {
                for (let i = turns.length - 1; i >= 0; i -= 1) {
                    if (turns[i].role !== 'user') continue
                    turns[i] = { ...turns[i], content: `${schermoDiQuestoTurno}\n\n${turns[i].content}` }
                    break
                }
            }
        } catch (error) {
            state.lastError = errorMessage(error, translate)
            try {
                await appendDurable(session.id, 'system', state.lastError, 'failed', modelProfileId, {
                    chat_error: providerFault(error, modelProfileId, translate),
                })
            } catch (persistenceError) {
                markPersistenceFailure(persistenceError)
            }
            finishSend()
            return true
        }

        let streamed = ''
        let reasoned = ''
        const ritmoRagionamento = talosCreateReasoningGate()
        try {
            const handlers: TalosStreamHandlers = {
                onChunk: (text) => {
                    streamed += text
                    // Il ragionamento trattenuto esce col primo carattere della
                    // risposta — vedi `reasoningGate`.
                    if (ritmoRagionamento.release()) state.streamingReasoning = reasoned
                    // Security review: never render raw save-markers mid-stream.
                    // Round 3: stripping the WHOLE buffer on every chunk was O(n²)
                    // (measured 8.3s for a marker-heavy reply). Only pay for it once
                    // a marker character has actually appeared.
                    state.streamingText = streamed.includes('[TALOS_SAVE_LIBRARY')
                        ? stripLibrarySaveMarkers(streamed)
                        : streamed
                },
                onReasoning: (text) => {
                    reasoned += text
                    if (ritmoRagionamento.accept()) state.streamingReasoning = reasoned
                },
                onReasoningReset: () => {
                    reasoned = ''
                    ritmoRagionamento.reset()
                    state.streamingReasoning = null
                },
                signal: abort.signal,
            }
            const reply = options.captureSendRuntime || options.prepareSend
                ? await complete(turns, handlers, undefined, invocation)
                : await complete(turns, handlers)
            // Debt A1: the loop dispatches on finishReason. No tool is registered
            // yet, so 'tool_calls' cannot occur — but the turn is persisted with its
            // calls so the round-trip is durable the moment tools land, instead of
            // the send path being rewritten again.
            const rawThinking = reply.reasoning ?? (reasoned || undefined)
            const thinking = rawThinking ? capturedReasoning(rawThinking, translate) : undefined
            const assistantMetadata = {
                ...(reply.metadata ?? {}),
                ...(reply.toolCalls?.length
                    ? { tool_calls: reply.toolCalls, finish_reason: reply.finishReason ?? null }
                    : {}),
                // ⛔ Salvati, o la cura dura un messaggio solo: il perché sta
                // accanto al lettore, in `storiaConLeChiamate`.
                ...(reply.providerBlocks?.length
                    ? { provider_blocks: reply.providerBlocks }
                    : {}),
                // Defect #5: persisted, so it survives the session and reaches
                // the export — a reasoning trace you cannot revisit is a demo.
                ...(thinking ? { reasoning: thinking } : {}),
                // Persisted with the message: a citation that disappears on
                // reload is not a citation.
                ...(reply.sources?.length ? { sources: reply.sources } : {}),
            }
            await appendDurable(
                session.id,
                'assistant',
                reply.text,
                'persisted',
                modelProfileId,
                Object.keys(assistantMetadata).length ? assistantMetadata : undefined,
                reply.attachments,
            )
        } catch (error) {
            const aborted = error instanceof Error && error.name === 'AbortError'
            // A streamed partial is preserved honestly, never re-fetched or dropped.
            if (streamed || reasoned) {
                try {
                    // Sanitize at the PERSISTENCE boundary: an interrupted reply used
                    // to store raw markers, which then fed back as in-context examples.
                    await appendDurable(session.id, 'assistant', stripLibrarySaveMarkers(streamed), 'persisted', modelProfileId,
                        reasoned
                            // Stop after 30s of thinking and before the first
                            // token used to discard everything — exactly the
                            // case where the trace is the only artifact left.
                            ? { interrupted: true, reasoning: stripLibrarySaveMarkers(reasoned) }
                            : { interrupted: true })
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
            if (!aborted) {
                const providerError = talosTranslatableErrorMessage(error, translate)
                    ?? errorMessage(error, translate)
                state.lastError = providerError
                try {
                    await appendDurable(session.id, 'system', providerError, 'failed', modelProfileId, {
                        chat_error: providerFault(error, modelProfileId, translate),
                    })
                } catch (persistenceError) {
                    markPersistenceFailure(persistenceError)
                }
            }
        } finally {
            finishSend()
        }
        return true
    }

    function stopStreaming(): void {
        activeStreamAbort?.abort()
    }

    return {
        stopStreaming,
        messages: readonly(messages),
        sessionBrowserActivities: readonly(sessionBrowserActivities),
        sessions: readonly(sessions),
        // A getter, so callers read it exactly like `sessions` and the
        // computed is still tracked wherever it is read.
        get history() { return history.value },
        activeSession: readonly(activeSession),
        state: readonly(state),
        initialize,
        retryPersistence,
        createSession,
        selectSession,
        loadOlderMessages,
        renameSession,
        deleteSession,
        setSessionArchived,
        setSessionLibraryContextPolicy,
        setSessionOrder,
        exportSnapshot,
        loadComposerDraft,
        saveComposerDraft,
        setActiveModelProfile,
        setSurface,
        recordBrowserActivity,
        send,
        continueFromCheckpoint,
    }
}
