/**
 * R-1: the canonical, process-safe state of a long TALOS operation.
 *
 * The persisted value is deliberately versioned and JSON-only. Android may
 * terminate the WebView at any point; each completed step must therefore be a
 * complete checkpoint rather than a live object or closure.
 */

export const TALOS_RUN_CONTRACT = 'talos.mobile.run.v1' as const

export type TalosRunJsonValue =
    | null
    | boolean
    | number
    | string
    | TalosRunJsonValue[]
    | { [key: string]: TalosRunJsonValue }

export type TalosRunKind = 'chat' | 'research' | 'document'

export type TalosRunStatus =
    | 'planning'
    | 'awaiting_approval'
    | 'running'
    | 'done'
    | 'cancelled'
    | 'failed'

export interface TalosRunStep {
    /** Contiguous and monotonic within the run. */
    index: number
    kind: string
    output: TalosRunJsonValue
    at: string
}

export interface TalosRunState {
    contract: typeof TALOS_RUN_CONTRACT
    id: string
    kind: TalosRunKind
    sessionId: string
    title: string
    status: TalosRunStatus
    steps: TalosRunStep[]
    spend: { tokens: number; searches: number; pages: number }
    startedAt: string
    updatedAt: string
    engine: 'device' | 'cloud'
    failure?: string
}

const RUN_KINDS = new Set<TalosRunKind>(['chat', 'research', 'document'])
const RUN_STATUSES = new Set<TalosRunStatus>([
    'planning',
    'awaiting_approval',
    'running',
    'done',
    'cancelled',
    'failed',
])
const RUN_ENGINES = new Set<TalosRunState['engine']>(['device', 'cloud'])
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const STATE_KEYS = new Set([
    'contract',
    'id',
    'kind',
    'sessionId',
    'title',
    'status',
    'steps',
    'spend',
    'startedAt',
    'updatedAt',
    'engine',
    'failure',
])
const STEP_KEYS = new Set(['index', 'kind', 'output', 'at'])
const SPEND_KEYS = new Set(['tokens', 'searches', 'pages'])

const STATUS_TRANSITIONS: Readonly<Record<TalosRunStatus, ReadonlySet<TalosRunStatus>>> = {
    planning: new Set(['planning', 'awaiting_approval', 'running', 'cancelled', 'failed']),
    awaiting_approval: new Set(['awaiting_approval', 'running', 'cancelled', 'failed']),
    running: new Set(['running', 'done', 'cancelled', 'failed']),
    failed: new Set(['failed', 'running', 'cancelled']),
    done: new Set(['done']),
    cancelled: new Set(['cancelled']),
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
    return Object.keys(value).every((key) => allowed.has(key))
}

function validId(value: unknown): value is string {
    return typeof value === 'string' && RUN_ID.test(value)
}

function validTitle(value: unknown): value is string {
    return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 255
}

function validIsoTimestamp(value: unknown): value is string {
    if (typeof value !== 'string' || value.length === 0) return false
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function validCounter(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is TalosRunJsonValue {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value !== 'object') return false
    if (seen.has(value)) return false
    seen.add(value)
    if (Array.isArray(value)) {
        const valid = value.every((entry) => isJsonValue(entry, seen))
        seen.delete(value)
        return valid
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
        seen.delete(value)
        return false
    }
    const valid = Object.values(value as Record<string, unknown>)
        .every((entry) => isJsonValue(entry, seen))
    seen.delete(value)
    return valid
}

function canonicalRunState(value: unknown): TalosRunState | null {
    if (!isRecord(value) || !exactKeys(value, STATE_KEYS)) return null
    if (value.contract !== TALOS_RUN_CONTRACT) return null
    if (!validId(value.id) || !validId(value.sessionId) || !validTitle(value.title)) return null
    if (!RUN_KINDS.has(value.kind as TalosRunKind)) return null
    if (!RUN_STATUSES.has(value.status as TalosRunStatus)) return null
    if (!RUN_ENGINES.has(value.engine as TalosRunState['engine'])) return null
    if (!validIsoTimestamp(value.startedAt) || !validIsoTimestamp(value.updatedAt)) return null
    if (value.updatedAt < value.startedAt) return null
    if (!Array.isArray(value.steps) || !isRecord(value.spend)) return null
    if (!exactKeys(value.spend, SPEND_KEYS)) return null
    if (!validCounter(value.spend.tokens)
        || !validCounter(value.spend.searches)
        || !validCounter(value.spend.pages)) return null
    if (value.failure !== undefined
        && (typeof value.failure !== 'string' || value.failure.length === 0 || value.failure.length > 2048)) return null
    if (value.status === 'failed' && typeof value.failure !== 'string') return null
    if (value.status !== 'failed' && value.failure !== undefined) return null

    const steps: TalosRunStep[] = []
    for (let index = 0; index < value.steps.length; index += 1) {
        const step = value.steps[index]
        if (!isRecord(step) || !exactKeys(step, STEP_KEYS)) return null
        if (step.index !== index
            || typeof step.kind !== 'string'
            || step.kind.trim() !== step.kind
            || step.kind.length === 0
            || step.kind.length > 128
            || !validIsoTimestamp(step.at)
            || !isJsonValue(step.output)) return null
        steps.push({
            index,
            kind: step.kind,
            output: structuredClone(step.output),
            at: step.at,
        })
    }

    return {
        contract: TALOS_RUN_CONTRACT,
        id: value.id,
        kind: value.kind as TalosRunKind,
        sessionId: value.sessionId,
        title: value.title,
        status: value.status as TalosRunStatus,
        steps,
        spend: {
            tokens: value.spend.tokens,
            searches: value.spend.searches,
            pages: value.spend.pages,
        },
        startedAt: value.startedAt,
        updatedAt: value.updatedAt,
        engine: value.engine as TalosRunState['engine'],
        ...(typeof value.failure === 'string' ? { failure: value.failure } : {}),
    }
}

export function createTalosRun(input: {
    id: string
    kind: TalosRunKind
    sessionId: string
    title: string
    now: string
}): TalosRunState {
    const candidate: TalosRunState = {
        contract: TALOS_RUN_CONTRACT,
        id: input.id,
        kind: input.kind,
        sessionId: input.sessionId,
        title: input.title.trim(),
        status: 'planning',
        steps: [],
        spend: { tokens: 0, searches: 0, pages: 0 },
        startedAt: input.now,
        updatedAt: input.now,
        engine: 'device',
    }
    if (!canonicalRunState(candidate)) throw new Error('TALOS_RUN_STATE_INVALID')
    return candidate
}

export function appendTalosRunStep(
    state: TalosRunState,
    step: Omit<TalosRunStep, 'index'>,
): TalosRunState {
    if (typeof step.kind !== 'string'
        || step.kind.trim() !== step.kind
        || step.kind.length === 0
        || step.kind.length > 128
        || !validIsoTimestamp(step.at)
        || !isJsonValue(step.output)) throw new Error('TALOS_RUN_STEP_INVALID')
    return {
        ...state,
        steps: [
            ...state.steps.map((entry) => ({ ...entry, output: structuredClone(entry.output) })),
            {
                ...step,
                output: structuredClone(step.output),
                index: state.steps.length,
            },
        ],
        updatedAt: step.at,
    }
}

export function addTalosRunSpend(
    state: TalosRunState,
    spend: Partial<TalosRunState['spend']>,
    now: string,
): TalosRunState {
    for (const value of Object.values(spend)) {
        if (value !== undefined && !validCounter(value)) throw new Error('TALOS_RUN_SPEND_INVALID')
    }
    if (!validIsoTimestamp(now)) throw new Error('TALOS_RUN_TIMESTAMP_INVALID')
    return {
        ...state,
        spend: {
            tokens: state.spend.tokens + (spend.tokens ?? 0),
            searches: state.spend.searches + (spend.searches ?? 0),
            pages: state.spend.pages + (spend.pages ?? 0),
        },
        updatedAt: now,
    }
}

export function setTalosRunStatus(
    state: TalosRunState,
    status: TalosRunStatus,
    now: string,
    failure?: string,
): TalosRunState {
    if (!STATUS_TRANSITIONS[state.status].has(status)) {
        throw new Error('TALOS_RUN_STATUS_TRANSITION_INVALID')
    }
    if (!validIsoTimestamp(now) || now < state.updatedAt) throw new Error('TALOS_RUN_TIMESTAMP_INVALID')
    if (status === 'failed' && (!failure || failure.length > 2048)) {
        throw new Error('TALOS_RUN_FAILURE_INVALID')
    }
    const { failure: _previousFailure, ...base } = state
    return {
        ...base,
        status,
        updatedAt: now,
        ...(status === 'failed' ? { failure } : {}),
    }
}

export function talosRunIsResumable(state: TalosRunState): boolean {
    return state.status === 'planning' || state.status === 'running' || state.status === 'failed'
}

export function talosRunResumeIndex(state: TalosRunState): number {
    return state.steps.length
}

export function parseTalosRunState(raw: unknown): TalosRunState | null {
    if (typeof raw !== 'string' || raw.length === 0) return null
    try {
        return canonicalRunState(JSON.parse(raw))
    } catch {
        return null
    }
}

export function serializeTalosRunState(state: TalosRunState): string {
    const canonical = canonicalRunState(state)
    if (!canonical) throw new Error('TALOS_RUN_STATE_INVALID')
    return JSON.stringify(canonical)
}

/**
 * Verify that a persisted checkpoint can safely replace its predecessor.
 *
 * Completed work and spend may only grow. This is the repository boundary that
 * prevents a resume from silently re-running or re-billing prior work.
 */
export function assertTalosRunCheckpoint(previous: TalosRunState, next: TalosRunState): void {
    const before = canonicalRunState(previous)
    const after = canonicalRunState(next)
    if (!before || !after) throw new Error('TALOS_RUN_STATE_INVALID')
    if (before.id !== after.id
        || before.kind !== after.kind
        || before.sessionId !== after.sessionId
        || before.title !== after.title
        || before.engine !== after.engine
        || before.startedAt !== after.startedAt) {
        throw new Error('TALOS_RUN_IDENTITY_CHANGED')
    }
    if (!STATUS_TRANSITIONS[before.status].has(after.status)) {
        throw new Error('TALOS_RUN_STATUS_TRANSITION_INVALID')
    }
    if (after.updatedAt < before.updatedAt) throw new Error('TALOS_RUN_TIMESTAMP_ROLLBACK')
    if (after.steps.length < before.steps.length) throw new Error('TALOS_RUN_CHECKPOINT_REWRITE')
    for (let index = 0; index < before.steps.length; index += 1) {
        if (JSON.stringify(before.steps[index]) !== JSON.stringify(after.steps[index])) {
            throw new Error('TALOS_RUN_CHECKPOINT_REWRITE')
        }
    }
    if (after.spend.tokens < before.spend.tokens
        || after.spend.searches < before.spend.searches
        || after.spend.pages < before.spend.pages) {
        throw new Error('TALOS_RUN_SPEND_ROLLBACK')
    }
}
