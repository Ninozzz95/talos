import type { TalosChatSendIdentity } from '@/lib/chat/sendSnapshot'
import {
    canonicalizeTalosToolAuthorizationInput,
    digestTalosToolAuthorizationInput,
    parseTalosToolAuthorizationGrants,
    type TalosToolAuthorizationDecision,
    type TalosToolAuthorizationGrantsV1,
    type TalosToolAuthorizationRequestV1,
} from '@/lib/tools/toolAuthorizations'
import { isTalosAgentToolId, type TalosAgentToolId } from '@/lib/tools/toolControls'
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
    readonly tool: TalosAgentToolId
    readonly actions: readonly TalosToolAction[]
    readonly input: unknown
    readonly allow_persistent: boolean
    readonly created_at: string
}

export interface TalosToolAuthorizationRecoveryToolView {
    readonly tool: TalosAgentToolId
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
}

function objectOf(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function boundedId(value: unknown): value is string {
    return typeof value === 'string' && ID.test(value)
}

function timestamp(value: unknown): value is string {
    return typeof value === 'string'
        && value.length <= 64
        && Number.isFinite(Date.parse(value))
}

function cloneBoundedObject(
    value: unknown,
    maxLength: number,
): Record<string, unknown> | null {
    const record = objectOf(value)
    if (!record) return null
    try {
        const encoded = JSON.stringify(record)
        if (encoded.length > maxLength) return null
        return cloneJsonObject(record)
    } catch {
        return null
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
        || !(record.modelProfileId === null || boundedId(record.modelProfileId))
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
        || !(record.model_profile_id === null || boundedId(record.model_profile_id))
        || !boundedId(record.call_id)
        || typeof record.tool !== 'string'
        || !actions
        || typeof record.allow_persistent !== 'boolean'
        || !SHA256.test(typeof record.input_digest === 'string' ? record.input_digest : '')
        || !['pending', 'allow_once', 'always_allow', 'deny'].includes(
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
    const grants = parseTalosToolAuthorizationGrants({
        schema_version: 1,
        revision: 0,
        grants: {
            [record.tool]: {
                schema_version: 1,
                tool: record.tool,
                actions,
                scope: 'device',
                granted_at: record.created_at,
            },
        },
    })
    const tool = Object.keys(grants.grants)[0] as TalosAgentToolId | undefined
    if (!tool || tool !== record.tool) return null
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
): TalosToolAuthorizationCheckpointV1 | null {
    const record = objectOf(value)
    if (
        !record
        || record.schema_version !== 1
        || !boundedId(record.id)
        || !boundedId(record.session_id)
        || !timestamp(record.created_at)
        || !timestamp(record.updated_at)
        || !['before_tools', 'running_tools', 'before_model'].includes(
            typeof record.phase === 'string' ? record.phase : '',
        )
        || !Array.isArray(record.requests)
    ) {
        return null
    }
    const identity = parseIdentity(record.send_identity)
    const runtime = cloneBoundedObject(record.runtime, MAX_RUNTIME_JSON)
    const loop = cloneBoundedObject(record.loop, MAX_LOOP_JSON)
    const requests = record.requests.map(parseRequest)
    if (!identity || !runtime || !loop || requests.some((request) => request === null)) {
        return null
    }
    const parsedRequests = requests as TalosToolAuthorizationRequestV1[]
    if (record.phase === 'before_tools' && parsedRequests.length === 0) return null
    const requestIds = new Set<string>()
    const callIds = new Set<string>()
    for (const request of parsedRequests) {
        if (
            requestIds.has(request.id)
            || callIds.has(request.call_id)
            || request.checkpoint_id !== record.id
            || request.session_id !== record.session_id
            || request.send_id !== identity.sendId
            || request.model_profile_id !== identity.modelProfileId
        ) {
            return null
        }
        requestIds.add(request.id)
        callIds.add(request.call_id)
    }
    if (identity.sessionId !== record.session_id) return null

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
    grant(tool: TalosAgentToolId, actions: readonly TalosToolAction[]): Promise<void>
    onReady(checkpoint: TalosToolAuthorizationCheckpointV1): Promise<void> | void
}): TalosToolAuthorizationCoordinator {
    const now = deps.now ?? (() => new Date().toISOString())
    const open = new Map<string, {
        activity: TalosLocalToolActivity
        checkpoint: TalosToolAuthorizationCheckpointV1
    }>()
    let mutationTail: Promise<void> = Promise.resolve()

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
                const checkpoint = checkpointFromActivity(activity)
                if (!checkpoint || !(await hasValidDigests(checkpoint))) {
                    await markInvalid(activity, 'TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
                    continue
                }
                open.set(checkpoint.id, { activity, checkpoint })
                // An uncertain side effect is never automatically repeated.
                if (
                    checkpoint.phase === 'running_tools'
                    || activity.status === 'recovery_required'
                ) {
                    continue
                }
                await announceReady(checkpoint)
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
                    tool: request.tool as TalosAgentToolId,
                    actions: [...request.actions],
                    input: request.input,
                    allow_persistent: request.allow_persistent,
                    created_at: request.created_at,
                })))
        },
        recoveries() {
            return [...open.values()]
                .filter(({ checkpoint }) => checkpoint.phase === 'running_tools')
                .sort((left, right) =>
                    left.checkpoint.created_at.localeCompare(right.checkpoint.created_at)
                    || left.checkpoint.id.localeCompare(right.checkpoint.id))
                .map(({ checkpoint }) => ({
                    checkpoint_id: checkpoint.id,
                    session_id: checkpoint.session_id,
                    session_title: checkpoint.send_identity.sessionTitle,
                    model_profile_id: checkpoint.send_identity.modelProfileId,
                    tools: checkpoint.requests.map((request) => ({
                        // Checkpoint parsing has already rejected catalog-unknown tools.
                        tool: request.tool as TalosAgentToolId,
                        actions: [...request.actions],
                    })),
                    created_at: checkpoint.created_at,
                    updated_at: checkpoint.updated_at,
                }))
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
                if (decision === 'always_allow') {
                    if (!target.allow_persistent) return
                    if (!isTalosAgentToolId(target.tool)) {
                        throw new Error('TALOS_TOOL_AUTHORIZATION_TOOL_INVALID')
                    }
                    await deps.grant(target.tool, target.actions)
                    const grant = parseTalosToolAuthorizationGrants(
                        deps.authorizations(),
                    ).grants[target.tool]
                    if (!grant || !target.actions.every((action) => grant.actions.includes(action))) {
                        throw new Error('TALOS_TOOL_AUTHORIZATION_GRANT_NOT_PERSISTED')
                    }
                }
                const decidedAt = now()
                const checkpoint = parseTalosToolAuthorizationCheckpoint({
                    ...owner.checkpoint,
                    requests: owner.checkpoint.requests.map((request) =>
                        request.id === requestId
                            ? { ...request, decision, decided_at: decidedAt }
                            : request),
                    updated_at: decidedAt,
                })
                if (!checkpoint) throw new Error('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
                await persistCheckpoint(owner.activity, checkpoint)
                result = true
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
