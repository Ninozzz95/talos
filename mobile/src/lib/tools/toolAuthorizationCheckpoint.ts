import type { TalosChatSendIdentity } from '@/lib/chat/sendSnapshot'
import {
    canonicalizeTalosToolAuthorizationInput,
    digestTalosToolAuthorizationInput,
    parseTalosToolAuthorizationGrants,
    type TalosToolAuthorizationDecision,
    type TalosToolAuthorizationGrantsV1,
    type TalosToolAuthorizationRequestV1,
} from '@/lib/tools/toolAuthorizations'
import { isTalosAuthorizableToolName } from '@/lib/tools/toolControls'
import type { TalosToolAction } from '@/lib/tools/permissionTypes'
import {
    cloneJsonObject,
    type TalosChatRepository,
    type TalosLocalToolActivity,
} from '@/repositories/chatRepository'

const CONTRACT = 'talos.tool.authorization-checkpoint/1'
const SHA256 = /^[0-9a-f]{64}$/
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const MAX_RUNTIME_JSON = 1_000_000
const MAX_LOOP_JSON = 8_000_000

export type TalosToolAuthorizationCheckpointPhase =
    | 'before_tools'
    | 'running_tools'
    | 'before_model'

export interface TalosToolAuthorizationCheckpointV1 {
    readonly schema_version: 1
    readonly id: string
    readonly session_id: string
    readonly send_identity: Readonly<TalosChatSendIdentity>
    /** Controller-owned, secret-free accepted-send runtime snapshot. */
    readonly runtime: Readonly<Record<string, unknown>>
    /** Provider-neutral agent-loop checkpoint, parsed again by the loop. */
    readonly loop: Readonly<Record<string, unknown>>
    readonly phase: TalosToolAuthorizationCheckpointPhase
    readonly requests: readonly TalosToolAuthorizationRequestV1[]
    readonly created_at: string
    readonly updated_at: string
}

export interface TalosToolAuthorizationPendingView {
    readonly request_id: string
    readonly checkpoint_id: string
    readonly session_id: string
    readonly session_title: string
    readonly model_profile_id: string | null
    // ⛔ 2026-08-27: era `TalosAgentToolId` con un cast a valle e un commento
    // che diceva "parseRequest ha già scartato i nomi fuori catalogo" — vero
    // fino a Fase 8, falso da quando `parseRequest` accetta anche
    // `dynamic:*`. Il tipo ora dice quello che il runtime porta davvero.
    readonly tool: string
    readonly actions: readonly TalosToolAction[]
    readonly input: unknown
    readonly allow_persistent: boolean
    readonly created_at: string
}

export interface TalosToolAuthorizationRecoveryToolView {
    readonly tool: string
    readonly actions: readonly TalosToolAction[]
}

export interface TalosToolAuthorizationRecoveryView {
    readonly checkpoint_id: string
    readonly session_id: string
    readonly session_title: string
    readonly model_profile_id: string | null
    readonly tools: readonly TalosToolAuthorizationRecoveryToolView[]
    readonly created_at: string
    readonly updated_at: string
    /**
     * ⛔⭐ Perché questa richiesta è stata SCARTATA, quando lo è stata.
     *
     * Assente per una ripresa normale (il turno era a metà, si può riprendere).
     * Valorizzato quando il checkpoint non è stato adottato: allora non c'è
     * niente da riprendere, e la persona ha diritto di sapere che una
     * richiesta di permesso è caduta — e con quale codice.
     */
    readonly error?: string
}

function objectOf(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function boundedId(value: unknown): value is string {
    return typeof value === 'string' && ID.test(value)
}

/**
 * ⛔⭐ L'id del profilo modello NON è un identificativo «pulito», e pretenderlo
 * ha rotto i tool su OGNI modello OpenRouter.
 *
 * ## Il difetto, riprodotto sul Pad il 2026-08-07
 *
 * `ID` è `/^[A-Za-z0-9][A-Za-z0-9._:-]{0,256}$/`: niente barra. Ma un id
 * OpenRouter È `openai/gpt-5.6-luna`, e un modello locale è un percorso che
 * comincia con `/`. Quindi `parseIdentity` rifiutava, il checkpoint non si
 * creava, e ogni richiesta di autorizzazione a un tool moriva con
 * `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID` — cioè **nessun modello
 * OpenRouter poteva usare uno strumento che richiede il consenso**.
 *
 * L'owner l'ha visto due volte in due giorni, e le due volte con OpenRouter.
 * MISURATO: `openai/gpt-5.6-luna` → `false`, `gpt-5.6-luna` → `true`.
 *
 * ## Perché la regola giusta è questa e non «aggiungiamo la barra»
 *
 * Perché non sappiamo quali caratteri useranno i cataloghi di domani, e ogni
 * carattere dimenticato è un altro provider che smette di funzionare in modo
 * illeggibile. Questo id lo produciamo noi e lo confrontiamo **solo per
 * uguaglianza**: non è un percorso, non è una chiave, non finisce in una query.
 * Le uniche proprietà che servono davvero sono che sia limitato e che non
 * contenga caratteri di controllo — quelli sì, perché finisce in JSON e nei
 * registri diagnostici.
 */
const MODEL_PROFILE_ID = /^[^\p{C}]{1,256}$/u

function boundedModelProfileId(value: unknown): value is string {
    return typeof value === 'string' && MODEL_PROFILE_ID.test(value)
}

function timestamp(value: unknown): value is string {
    return typeof value === 'string'
        && value.length <= 64
        && Number.isFinite(Date.parse(value))
}

/**
 * ⭐ PERCHÉ un checkpoint è stato rifiutato — non solo CHE è stato rifiutato.
 *
 * ## Il difetto che questo esiste per chiudere
 *
 * `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID` è **una sola stringa per una
 * quindicina di cause diverse**: un campo mancante, un digest che non torna, un
 * `call_id` ripetuto, un runtime troppo grande, un loop troppo grande, un tool
 * che il catalogo non conosce. L'owner l'ha visto due volte in due giorni — la
 * seconda con GPT-5.6 Luna via OpenRouter, il 2026-08-07 — e da quel codice non
 * si poteva dire nemmeno da che parte cominciare a guardare.
 *
 * Una diagnosi che vale per quindici malattie non è una diagnosi. Il motivo
 * resta un codice corto e chiuso — finisce nel Doctor e negli appunti di
 * supporto, quindi non può contenere testo di conversazione.
 */
export type TalosCheckpointRejection =
    | 'not_object' | 'schema_version' | 'id' | 'session_id' | 'timestamps' | 'phase'
    | 'requests_not_array' | 'identity' | 'runtime_shape' | 'runtime_too_large'
    | 'loop_shape' | 'loop_too_large' | 'request_invalid' | 'no_requests'
    | 'duplicate_request_id' | 'duplicate_call_id' | 'request_mismatch'
    | 'session_mismatch'

function cloneBoundedObject(
    value: unknown,
    maxLength: number,
): Record<string, unknown> | 'shape' | 'too_large' {
    const record = objectOf(value)
    if (!record) return 'shape'
    try {
        const encoded = JSON.stringify(record)
        if (encoded.length > maxLength) return 'too_large'
        return cloneJsonObject(record)
    } catch {
        return 'shape'
    }
}

function parseIdentity(value: unknown): Readonly<TalosChatSendIdentity> | null {
    const record = objectOf(value)
    if (
        !record
        || !boundedId(record.sendId)
        || !boundedId(record.sessionId)
        || typeof record.sessionTitle !== 'string'
        || record.sessionTitle.length > 255
        || (record.surface !== 'chat' && record.surface !== 'browse')
        || !(record.modelProfileId === null || boundedModelProfileId(record.modelProfileId))
        || !timestamp(record.acceptedAt)
    ) {
        return null
    }
    return Object.freeze({
        sendId: record.sendId,
        sessionId: record.sessionId,
        sessionTitle: record.sessionTitle,
        surface: record.surface,
        modelProfileId: record.modelProfileId,
        acceptedAt: record.acceptedAt,
    })
}

function parseActions(value: unknown): TalosToolAction[] | null {
    if (!Array.isArray(value) || value.length === 0) return null
    const actions: TalosToolAction[] = []
    for (const action of value) {
        if (action !== 'read' && action !== 'write' && action !== 'outbound') return null
        if (!actions.includes(action)) actions.push(action)
    }
    return actions
}

function parseRequest(value: unknown): TalosToolAuthorizationRequestV1 | null {
    const record = objectOf(value)
    if (!record) return null
    const actions = parseActions(record.actions)
    const decision = record.decision
    if (
        record.schema_version !== 1
        || !boundedId(record.id)
        || !boundedId(record.checkpoint_id)
        || !boundedId(record.session_id)
        || !boundedId(record.send_id)
        || !(record.model_profile_id === null || boundedModelProfileId(record.model_profile_id))
        || !boundedId(record.call_id)
        || typeof record.tool !== 'string'
        || !actions
        || typeof record.allow_persistent !== 'boolean'
        || !SHA256.test(typeof record.input_digest === 'string' ? record.input_digest : '')
        || !['pending', 'allow_once', 'allow_turn', 'always_allow', 'deny'].includes(
            typeof decision === 'string' ? decision : '',
        )
        || !timestamp(record.created_at)
        || !(record.decided_at === null || timestamp(record.decided_at))
        || (decision === 'pending' && record.decided_at !== null)
        || (decision !== 'pending' && record.decided_at === null)
        || (decision === 'always_allow' && record.allow_persistent !== true)
    ) {
        return null
    }
    /*
     * ⛔⛔⛔ Owner 2026-08-27, Fase 8 — trovato SUL DISPOSITIVO, non a
     * tavolino: ogni richiesta di autorizzazione per un tool FORGIATO
     * falliva qui, con `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID`
     * (motivo `request_invalid`) — anche per un tool a sola lettura, anche
     * dopo aver già corretto `toolset.ts` e `chatController.ts`.
     *
     * La forma PRECEDENTE riusava `parseTalosToolAuthorizationGrants` (una
     * funzione pensata per costruire l'INSIEME PERSISTENTE dei consensi
     * "sempre", non per validare la struttura di UNA richiesta) come un
     * modo indiretto di controllare "`record.tool` è un id riconosciuto".
     * Quella funzione scarta ogni chiave che non sia un `TalosAgentToolId`
     * statico (`toolAuthorizations.ts:167`) — un nome `dynamic:*` veniva
     * silenziosamente rimosso dall'oggetto `grants`, `Object.keys(...)[0]`
     * diventava `undefined`, e l'INTERA richiesta tornava `null`: non un
     * rifiuto per "non abilitato", un rifiuto per "non esiste", anche per
     * un tool installato, abilitato e appena chiamato dal modello.
     *
     * Il controllo vero che serve — "questo nome è un id di tool
     * riconosciuto, statico O forgiato" — ora è diretto ed esplicito,
     * senza il giro indiretto. Gli altri controlli che quel giro faceva
     * (forma del grant, timestamp, azioni) sono già garantiti sopra da
     * `parseActions(record.actions)` e `timestamp(record.created_at)`:
     * l'UNICA cosa persa rimuovendo l'indiretto era il riconoscimento del
     * nome, ora qui.
     *
     * ⛔ 2026-08-27, stesso giorno: il controllo combinato è ora
     * `isTalosAuthorizableToolName` (in `toolControls.ts`) — la STESSA
     * guardia che `applyTalosToolAuthorizationGrant`/
     * `revokeTalosToolAuthorizationGrant` usano, così "questo nome è
     * autorizzabile" ha UNA sola definizione, non due che devono restare
     * d'accordo a mano.
     */
    if (!isTalosAuthorizableToolName(record.tool)) return null
    const tool = record.tool
    try {
        // Validates I-JSON now; hydrate additionally verifies the digest.
        canonicalizeTalosToolAuthorizationInput(record.input)
    } catch {
        return null
    }
    return Object.freeze({
        schema_version: 1,
        id: record.id,
        checkpoint_id: record.checkpoint_id,
        session_id: record.session_id,
        send_id: record.send_id,
        model_profile_id: record.model_profile_id,
        call_id: record.call_id,
        tool,
        actions: Object.freeze(actions),
        input: record.input,
        input_digest: record.input_digest as string,
        allow_persistent: record.allow_persistent,
        decision: decision as TalosToolAuthorizationDecision,
        created_at: record.created_at,
        decided_at: record.decided_at,
    })
}

export function parseTalosToolAuthorizationCheckpoint(
    value: unknown,
    sink?: { reason: TalosCheckpointRejection | null },
): TalosToolAuthorizationCheckpointV1 | null {
    const rifiuta = (reason: TalosCheckpointRejection): null => {
        if (sink) sink.reason = reason
        return null
    }
    const record = objectOf(value)
    if (!record) return rifiuta('not_object')
    if (record.schema_version !== 1) return rifiuta('schema_version')
    if (!boundedId(record.id)) return rifiuta('id')
    if (!boundedId(record.session_id)) return rifiuta('session_id')
    if (!timestamp(record.created_at) || !timestamp(record.updated_at)) return rifiuta('timestamps')
    if (!['before_tools', 'running_tools', 'before_model'].includes(
        typeof record.phase === 'string' ? record.phase : '',
    )) return rifiuta('phase')
    if (!Array.isArray(record.requests)) return rifiuta('requests_not_array')

    const identity = parseIdentity(record.send_identity)
    if (!identity) return rifiuta('identity')
    const runtime = cloneBoundedObject(record.runtime, MAX_RUNTIME_JSON)
    if (runtime === 'shape') return rifiuta('runtime_shape')
    if (runtime === 'too_large') return rifiuta('runtime_too_large')
    const loop = cloneBoundedObject(record.loop, MAX_LOOP_JSON)
    if (loop === 'shape') return rifiuta('loop_shape')
    if (loop === 'too_large') return rifiuta('loop_too_large')
    const requests = record.requests.map(parseRequest)
    if (requests.some((request) => request === null)) return rifiuta('request_invalid')

    const parsedRequests = requests as TalosToolAuthorizationRequestV1[]
    if (record.phase === 'before_tools' && parsedRequests.length === 0) return rifiuta('no_requests')
    const requestIds = new Set<string>()
    const callIds = new Set<string>()
    for (const request of parsedRequests) {
        if (requestIds.has(request.id)) return rifiuta('duplicate_request_id')
        /*
         * ⛔ Due chiamate con lo stesso `call_id` nello stesso giro.
         * Sospettato numero uno quando il modello ne emette diverse insieme e
         * l'adattatore del provider non le distingue: qui diventa un motivo
         * leggibile invece di un rifiuto muto.
         */
        if (callIds.has(request.call_id)) return rifiuta('duplicate_call_id')
        if (
            request.checkpoint_id !== record.id
            || request.session_id !== record.session_id
            || request.send_id !== identity.sendId
            || request.model_profile_id !== identity.modelProfileId
        ) {
            return rifiuta('request_mismatch')
        }
        requestIds.add(request.id)
        callIds.add(request.call_id)
    }
    if (identity.sessionId !== record.session_id) return rifiuta('session_mismatch')
    if (sink) sink.reason = null

    return Object.freeze({
        schema_version: 1,
        id: record.id,
        session_id: record.session_id,
        send_identity: identity,
        runtime: Object.freeze(runtime),
        loop: Object.freeze(loop),
        phase: record.phase as TalosToolAuthorizationCheckpointPhase,
        requests: Object.freeze(parsedRequests),
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

function payloadOf(checkpoint: TalosToolAuthorizationCheckpointV1): Record<string, unknown> {
    return {
        contract: CONTRACT,
        checkpoint: checkpoint as unknown,
    }
}

function checkpointFromActivity(
    activity: TalosLocalToolActivity,
): TalosToolAuthorizationCheckpointV1 | null {
    if (
        activity.operation !== 'tool.authorization'
        || activity.payload.contract !== CONTRACT
    ) {
        return null
    }
    const checkpoint = parseTalosToolAuthorizationCheckpoint(activity.payload.checkpoint)
    if (
        !checkpoint
        || checkpoint.id !== activity.id
        || checkpoint.session_id !== activity.session_id
    ) {
        return null
    }
    return checkpoint
}

async function hasValidDigests(
    checkpoint: TalosToolAuthorizationCheckpointV1,
): Promise<boolean> {
    for (const request of checkpoint.requests) {
        try {
            if (await digestTalosToolAuthorizationInput(request.input) !== request.input_digest) {
                return false
            }
        } catch {
            return false
        }
    }
    return true
}

export interface TalosToolAuthorizationCoordinator {
    hydrate(): Promise<void>
    suspend(checkpoint: TalosToolAuthorizationCheckpointV1): Promise<void>
    pending(): TalosToolAuthorizationPendingView[]
    recoveries(): TalosToolAuthorizationRecoveryView[]
    decide(
        requestId: string,
        decision: Exclude<TalosToolAuthorizationDecision, 'pending'>,
    ): Promise<boolean>
    markRunningTools(checkpointId: string): Promise<TalosToolAuthorizationCheckpointV1>
    saveBeforeModel(
        checkpointId: string,
        loop: Readonly<Record<string, unknown>>,
        runtime?: Readonly<Record<string, unknown>>,
    ): Promise<TalosToolAuthorizationCheckpointV1>
    complete(checkpointId: string): Promise<void>
    cancel(checkpointId: string): Promise<void>
    retryRecovery(checkpointId: string): Promise<boolean>
}

export function createTalosToolAuthorizationCoordinator(deps: {
    repository: TalosChatRepository
    now?: () => string
    authorizations(): TalosToolAuthorizationGrantsV1
    grant(tool: string, actions: readonly TalosToolAction[]): Promise<void>
    onReady(checkpoint: TalosToolAuthorizationCheckpointV1): Promise<void> | void
    /**
     * ⭐⭐⭐ 6.4 — ASSENTE: comportamento invariato, nessuna chiamata. Presente
     * (in produzione: `contaDecisioneReale` di `toolAuthorizationFriction.ts`):
     * chiamata SENZA `await` dopo ogni decisione vera andata a buon fine, col
     * suo errore inghiottito qui — un contatore diagnostico non deve MAI
     * rallentare né poter far fallire una decisione di autorizzazione reale.
     */
    registraDecisioneReale?: (
        tool: string,
        decisione: Exclude<TalosToolAuthorizationDecision, 'pending'>,
        quando: string,
    ) => Promise<void>
}): TalosToolAuthorizationCoordinator {
    const now = deps.now ?? (() => new Date().toISOString())
    const open = new Map<string, {
        activity: TalosLocalToolActivity
        checkpoint: TalosToolAuthorizationCheckpointV1
    }>()
    /**
     * ⛔⭐⭐ I checkpoint SCARTATI — visti tre volte in una notte come «una
     * richiesta in attesa» a cui non si poteva rispondere.
     *
     * ## Il difetto
     *
     * `hydrateOne` mette in quarantena un record che non si parsifica o i cui
     * digest non tornano, e — giustamente — lo toglie da `open`: un checkpoint
     * che il consumatore non ha adottato non deve sembrare vivo. Ma `open` era
     * l'UNICO posto da cui l'app guardava: fuori di lì, `pending()` è vuoto e
     * `recoveries()` pure. Il record spariva dall'intera app **mentre la chat
     * continuava a dire «una richiesta è in attesa»**: nessuna scheda, nessun
     * pulsante «Controlla azioni», nessun modo di rispondere né di annullare.
     *
     * ⇒ Un permesso che nessuno può concedere E nessuno può negare. La persona
     * resta col dubbio di cosa TALOS stia aspettando di fare al suo telefono.
     *
     * ## Perché una mappa a parte e non `open`
     *
     * Perché la separazione era GIUSTA. Uno scartato non si riprende — il
     * digest non tornerà a tornare — e rimetterlo in `open` lo farebbe rientrare
     * in `pending()`, dove una decisione lo cercherebbe per eseguirlo. Qui vive
     * solo per essere **mostrato e chiuso**: `recoveries()` lo espone col suo
     * codice, `cancel()` lo toglie di mezzo.
     */
    const scartati = new Map<string, {
        activity: TalosLocalToolActivity
        view: TalosToolAuthorizationRecoveryView
    }>()
    let mutationTail: Promise<void> = Promise.resolve()

    function scartato(
        activity: TalosLocalToolActivity,
        checkpoint: TalosToolAuthorizationCheckpointV1 | null,
        error: string,
    ): void {
        // ⛔ Senza checkpoint l'identità viene dal record: è meno ricca, ma è
        // vera. Inventare un titolo di sessione qui sarebbe la stessa bugia che
        // stiamo togliendo dalla chat.
        scartati.set(checkpoint?.id ?? activity.id, {
            activity,
            view: {
                checkpoint_id: checkpoint?.id ?? activity.id,
                session_id: checkpoint?.session_id ?? activity.session_id,
                session_title: checkpoint?.send_identity.sessionTitle ?? '',
                model_profile_id: checkpoint?.send_identity.modelProfileId ?? null,
                tools: (checkpoint?.requests ?? []).map((request) => ({
                    tool: request.tool,
                    actions: [...request.actions],
                })),
                created_at: checkpoint?.created_at ?? activity.created_at,
                updated_at: checkpoint?.updated_at ?? activity.updated_at,
                error,
            },
        })
    }

    async function markInvalid(activity: TalosLocalToolActivity, error: string): Promise<void> {
        await deps.repository.updateToolActivity(activity.id, {
            status: 'recovery_required',
            evidence: {
                ...activity.evidence,
                contract: CONTRACT,
                error,
            },
        })
    }

    function unresolved(checkpoint: TalosToolAuthorizationCheckpointV1) {
        return checkpoint.requests.filter((request) => request.decision === 'pending')
    }

    /**
     * I-05. Hydrate ONE record, absorbing its own failure.
     *
     * Whatever goes wrong — an unparseable payload, a digest that no longer
     * matches, a consumer that refuses the serialised runtime — the record is
     * parked as `recovery_required` and the next one is still processed. It is
     * removed from `open` too: a checkpoint the consumer could not adopt must
     * not look live to the rest of the session.
     *
     * The reason is bounded to a short code. The thrown message can come from
     * anywhere, and this evidence is read back into the Doctor.
     */
    async function hydrateOne(activity: TalosLocalToolActivity): Promise<void> {
        let adopted: string | null = null
        // ⛔ Tenuto FUORI dal try: nel `catch` serve per dire QUALE richiesta è
        // caduta, e ri-parsificarlo lì significherebbe poter lanciare dentro il
        // gestore dell'errore — cioè perdere anche la quarantena.
        let letto: TalosToolAuthorizationCheckpointV1 | null = null
        try {
            const checkpoint = checkpointFromActivity(activity)
            letto = checkpoint
            if (!checkpoint || !(await hasValidDigests(checkpoint))) {
                await markInvalid(activity, 'TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
                scartato(activity, checkpoint, 'TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
                return
            }
            open.set(checkpoint.id, { activity, checkpoint })
            adopted = checkpoint.id
            // An uncertain side effect is never automatically repeated.
            if (
                checkpoint.phase === 'running_tools'
                || activity.status === 'recovery_required'
            ) {
                return
            }
            await announceReady(checkpoint)
        } catch (error) {
            if (adopted !== null) open.delete(adopted)
            const reason = error instanceof Error && /^[A-Z0-9_]{4,64}$/.test(error.message)
                ? error.message
                : 'TALOS_TOOL_AUTHORIZATION_HYDRATE_FAILED'
            scartato(activity, letto, reason)
            try {
                await markInvalid(activity, reason)
            } catch {
                // Even the quarantine write can fail. The app still starts:
                // that is the whole point, and the record stays pending for the
                // next launch rather than blocking this one.
            }
        }
    }

    async function announceReady(checkpoint: TalosToolAuthorizationCheckpointV1): Promise<void> {
        if (
            checkpoint.phase === 'before_model'
            || (checkpoint.phase === 'before_tools' && unresolved(checkpoint).length === 0)
        ) {
            await deps.onReady(checkpoint)
        }
    }

    async function persistCheckpoint(
        activity: TalosLocalToolActivity,
        checkpoint: TalosToolAuthorizationCheckpointV1,
        status = activity.status,
    ): Promise<void> {
        await deps.repository.updateToolActivity(activity.id, {
            status,
            payload: payloadOf(checkpoint),
            evidence: {
                ...activity.evidence,
                contract: CONTRACT,
                phase: checkpoint.phase,
            },
        })
        open.set(checkpoint.id, {
            activity: {
                ...activity,
                status,
                payload: payloadOf(checkpoint),
                evidence: {
                    ...activity.evidence,
                    contract: CONTRACT,
                    phase: checkpoint.phase,
                },
                updated_at: checkpoint.updated_at,
            },
            checkpoint,
        })
    }

    const api: TalosToolAuthorizationCoordinator = {
        async hydrate() {
            open.clear()
            scartati.clear()
            const sessions = await deps.repository.listSessions()
            const activities = (await Promise.all(sessions.map(
                (session) => deps.repository.listSessionToolActivities(session.id),
            )))
                .flat()
                .filter((activity) =>
                    activity.operation === 'tool.authorization'
                    && (activity.status === 'pending' || activity.status === 'recovery_required'))
                .sort((left, right) =>
                    left.created_at.localeCompare(right.created_at)
                    || left.id.localeCompare(right.id))

            for (const activity of activities) {
                // I-05: one record must cost that record and nothing else.
                //
                // A checkpoint that fails to PARSE was already quarantined here,
                // but `announceReady()` was not guarded — and the consumer
                // behind it throws: the controller validates the serialised
                // runtime and raises TALOS_TOOL_AUTHORIZATION_RUNTIME_INVALID
                // when a field is absent. That throw escaped this loop, escaped
                // hydrate(), and `performInit()` awaits hydrate() — so a single
                // bad record stopped the entire app from starting and took every
                // valid checkpoint after it down with it.
                //
                // The trigger is upgrading, not corruption: the validator
                // requires fields that earlier builds never wrote, so a
                // checkpoint left pending across an update poisons the first
                // launch of the new build.
                await hydrateOne(activity)
            }
        },
        async suspend(value) {
            const checkpoint = parseTalosToolAuthorizationCheckpoint(value)
            if (
                !checkpoint
                || checkpoint.phase !== 'before_tools'
                || unresolved(checkpoint).length === 0
                || !(await hasValidDigests(checkpoint))
            ) {
                throw new Error('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
            }
            const activity = await deps.repository.appendToolActivity({
                id: checkpoint.id,
                session_id: checkpoint.session_id,
                message_id: null,
                operation: 'tool.authorization',
                status: 'pending',
                payload: payloadOf(checkpoint),
                evidence: {
                    contract: CONTRACT,
                    phase: checkpoint.phase,
                },
                created_at: checkpoint.created_at,
            })
            open.set(checkpoint.id, { activity, checkpoint })
        },
        pending() {
            return [...open.values()]
                .sort((left, right) =>
                    left.checkpoint.created_at.localeCompare(right.checkpoint.created_at)
                    || left.checkpoint.id.localeCompare(right.checkpoint.id))
                .flatMap(({ checkpoint }) => unresolved(checkpoint).map((request) => ({
                    request_id: request.id,
                    checkpoint_id: checkpoint.id,
                    session_id: checkpoint.session_id,
                    session_title: checkpoint.send_identity.sessionTitle,
                    model_profile_id: checkpoint.send_identity.modelProfileId,
                    // parseRequest has already rejected tools outside the
                    // settings-controlled catalog; retain that narrow UI type.
                    tool: request.tool,
                    actions: [...request.actions],
                    input: request.input,
                    allow_persistent: request.allow_persistent,
                    created_at: request.created_at,
                })))
        },
        recoveries() {
            const riprendibili: TalosToolAuthorizationRecoveryView[] = [...open.values()]
                .filter(({ checkpoint }) => checkpoint.phase === 'running_tools')
                .map(({ checkpoint }) => ({
                    checkpoint_id: checkpoint.id,
                    session_id: checkpoint.session_id,
                    session_title: checkpoint.send_identity.sessionTitle,
                    model_profile_id: checkpoint.send_identity.modelProfileId,
                    tools: checkpoint.requests.map((request) => ({
                        // Checkpoint parsing has already rejected catalog-unknown tools.
                        tool: request.tool,
                        actions: [...request.actions],
                    })),
                    created_at: checkpoint.created_at,
                    updated_at: checkpoint.updated_at,
                }))
            // Gli scartati stanno nella STESSA lista: sono l'unica strada che
            // la persona ha per accorgersene e per chiuderli.
            return [...riprendibili, ...[...scartati.values()].map(({ view }) => view)]
                .sort((left, right) =>
                    left.created_at.localeCompare(right.created_at)
                    || left.checkpoint_id.localeCompare(right.checkpoint_id))
        },
        async decide(requestId, decision) {
            let result = false
            const operation = mutationTail.then(async () => {
                const owner = [...open.values()].find(({ checkpoint }) =>
                    checkpoint.requests.some((request) =>
                        request.id === requestId && request.decision === 'pending'))
                if (!owner) return
                const target = owner.checkpoint.requests.find(
                    (request) => request.id === requestId,
                )!
                /**
                 * Which other pending requests this decision also answers.
                 *
                 * Owner 2026-08-02, on the device: "ho premuto consenti sempre
                 * ma il pop-up non si è levato immediatamente, ho dovuto
                 * insistere". This is why. "Always allow" recorded the grant and
                 * then settled ONE request — the one on screen — while its
                 * siblings for the same tool stayed pending, so the sheet came
                 * straight back and asked a question that had just been answered.
                 *
                 * Only siblings the grant actually covers: a request needing an
                 * action the grant does not carry is a different question and
                 * still has to be asked.
                 */
                let alsoAnswered: (request: typeof target) => boolean = (request) => request.id === requestId
                if (decision === 'always_allow') {
                    if (!target.allow_persistent) return
                    if (!isTalosAuthorizableToolName(target.tool)) {
                        throw new Error('TALOS_TOOL_AUTHORIZATION_TOOL_INVALID')
                    }
                    await deps.grant(target.tool, target.actions)
                    const grant = parseTalosToolAuthorizationGrants(
                        deps.authorizations(),
                    ).grants[target.tool]
                    if (!grant || !target.actions.every((action) => grant.actions.includes(action))) {
                        throw new Error('TALOS_TOOL_AUTHORIZATION_GRANT_NOT_PERSISTED')
                    }
                    alsoAnswered = (request) => request.id === requestId || (
                        request.decision === 'pending'
                        && request.tool === target.tool
                        && request.allow_persistent
                        && request.actions.every((action) => grant.actions.includes(action))
                    )
                }
                const decidedAt = now()
                const checkpoint = parseTalosToolAuthorizationCheckpoint({
                    ...owner.checkpoint,
                    requests: owner.checkpoint.requests.map((request) =>
                        alsoAnswered(request)
                            ? { ...request, decision, decided_at: decidedAt }
                            : request),
                    updated_at: decidedAt,
                })
                if (!checkpoint) throw new Error('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
                await persistCheckpoint(owner.activity, checkpoint)
                result = true
                // ⭐⭐⭐ 6.4 — vedi la doc su `deps.registraDecisioneReale` sopra:
                // mai un `await`, mai un errore che risale a questa decisione.
                void deps.registraDecisioneReale?.(target.tool, decision, decidedAt)
                    .catch(() => { /* diagnostica: non deve mai rompere una decisione vera */ })
                await announceReady(checkpoint)
            })
            mutationTail = operation.then(() => undefined, () => undefined)
            await operation
            return result
        },
        async markRunningTools(checkpointId) {
            const owner = open.get(checkpointId)
            if (!owner) throw new Error('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_NOT_FOUND')
            if (unresolved(owner.checkpoint).length > 0) {
                throw new Error('TALOS_TOOL_AUTHORIZATION_DECISION_PENDING')
            }
            const checkpoint = parseTalosToolAuthorizationCheckpoint({
                ...owner.checkpoint,
                phase: 'running_tools',
                updated_at: now(),
            })
            if (!checkpoint) throw new Error('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
            await persistCheckpoint(owner.activity, checkpoint, 'recovery_required')
            return checkpoint
        },
        async saveBeforeModel(checkpointId, loop, runtime) {
            const owner = open.get(checkpointId)
            if (!owner) throw new Error('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_NOT_FOUND')
            const checkpoint = parseTalosToolAuthorizationCheckpoint({
                ...owner.checkpoint,
                phase: 'before_model',
                loop,
                runtime: runtime ?? owner.checkpoint.runtime,
                updated_at: now(),
            })
            if (!checkpoint) throw new Error('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
            await persistCheckpoint(owner.activity, checkpoint, 'pending')
            return checkpoint
        },
        async complete(checkpointId) {
            const owner = open.get(checkpointId)
            if (!owner) return
            await deps.repository.updateToolActivity(owner.activity.id, {
                status: 'succeeded',
                evidence: {
                    ...owner.activity.evidence,
                    contract: CONTRACT,
                    phase: owner.checkpoint.phase,
                    completed_at: now(),
                },
            })
            open.delete(checkpointId)
        },
        async cancel(checkpointId) {
            // ⛔ Uno scartato si annulla come gli altri: è già in quarantena nel
            // database, ma finché resta in memoria la scheda torna a ogni
            // sguardo. «Annulla» deve levarla di mezzo davvero.
            const caduto = scartati.get(checkpointId)
            if (caduto) {
                scartati.delete(checkpointId)
                await deps.repository.updateToolActivity(caduto.activity.id, {
                    status: 'cancelled',
                    evidence: {
                        ...caduto.activity.evidence,
                        contract: CONTRACT,
                        error: caduto.view.error,
                        cancelled_at: now(),
                    },
                })
                return
            }
            const owner = open.get(checkpointId)
            if (!owner) return
            await deps.repository.updateToolActivity(owner.activity.id, {
                status: 'cancelled',
                evidence: {
                    ...owner.activity.evidence,
                    contract: CONTRACT,
                    phase: owner.checkpoint.phase,
                    cancelled_at: now(),
                },
            })
            open.delete(checkpointId)
        },
        async retryRecovery(checkpointId) {
            const owner = open.get(checkpointId)
            if (!owner || owner.checkpoint.phase !== 'running_tools') return false
            await deps.onReady(owner.checkpoint)
            return true
        },
    }
    return api
}
