/**
 * R-1a — the state of a long operation, written down.
 *
 * This is the least interesting-looking part of Deep Research and the one that
 * cannot be added afterwards, because it does three separate jobs with one
 * property:
 *
 *  1. **Surviving the process.** Android kills a backgrounded app; a run whose
 *     state lives only in memory dies with it. The owner hit this on a plain
 *     chat send: switching apps mid-answer produced "network error".
 *  2. **Not paying twice.** Tokens already spent are spent. A run that restarts
 *     from the beginning bills the user for work that was already done.
 *  3. **The cloud seam.** A run whose steps communicate through serialisable
 *     values, not shared variables, is a run that can execute somewhere else.
 *     That is the predisposition the owner asked for when the app is
 *     distributed — and it costs nothing here, while retrofitting it later
 *     would mean rewriting the planner, the verifier and the dossier.
 *
 * So: no closures in the state, no class instances, nothing that cannot survive
 * `JSON.stringify`. That constraint is the feature.
 */

export type TalosRunKind = 'chat' | 'research' | 'document'

export type TalosRunStatus =
    | 'planning'
    | 'awaiting_approval'
    | 'running'
    | 'done'
    | 'cancelled'
    | 'failed'

/** One completed unit of work. Append-only: a step is never edited in place. */
export interface TalosRunStep {
    /** Monotonic within the run, so a resume knows exactly where it stopped. */
    index: number
    kind: string
    /** Everything needed to skip this step on resume — never a live object. */
    output: unknown
    at: string
}

export interface TalosRunState {
    id: string
    kind: TalosRunKind
    sessionId: string
    title: string
    status: TalosRunStatus
    steps: TalosRunStep[]
    /** What has been spent so far, so a resume does not double-count it. */
    spend: { tokens: number; searches: number; pages: number }
    startedAt: string
    updatedAt: string
    /** Where it ran. `device` today; `cloud` is the seam, not a promise. */
    engine: 'device' | 'cloud'
    /** Present only when `status` is `failed`, and never a raw stack. */
    failure?: string
}

export function createTalosRun(input: {
    id: string
    kind: TalosRunKind
    sessionId: string
    title: string
    now: string
}): TalosRunState {
    return {
        id: input.id,
        kind: input.kind,
        sessionId: input.sessionId,
        title: input.title,
        status: 'planning',
        steps: [],
        spend: { tokens: 0, searches: 0, pages: 0 },
        startedAt: input.now,
        updatedAt: input.now,
        engine: 'device',
    }
}

/**
 * Append a completed step. Returns a NEW state rather than mutating: a run that
 * is being written to disk while something else edits it in place is how a
 * resume reads half a step.
 */
export function appendTalosRunStep(
    state: TalosRunState,
    step: Omit<TalosRunStep, 'index'>,
): TalosRunState {
    return {
        ...state,
        steps: [...state.steps, { ...step, index: state.steps.length }],
        updatedAt: step.at,
    }
}

export function addTalosRunSpend(
    state: TalosRunState,
    spend: Partial<TalosRunState['spend']>,
    now: string,
): TalosRunState {
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
    return {
        ...state,
        status,
        updatedAt: now,
        // A failure message is kept only while the run IS failed, so a run that
        // recovers does not carry an explanation of something that no longer
        // happened.
        ...(status === 'failed' && failure ? { failure } : {}),
        ...(status !== 'failed' ? { failure: undefined } : {}),
    }
}

/**
 * A run that was interrupted rather than finished.
 *
 * `planning` and `running` are both resumable: the process died, the work did
 * not. `awaiting_approval` is NOT — it is waiting for a person, and resuming it
 * automatically would run a plan nobody approved.
 */
export function talosRunIsResumable(state: TalosRunState): boolean {
    return state.status === 'planning' || state.status === 'running'
}

/** Where a resume picks up: the first index that has no step. */
export function talosRunResumeIndex(state: TalosRunState): number {
    return state.steps.length
}

/**
 * Read a run back from storage.
 *
 * Anything malformed reads as `null` rather than throwing: this runs at boot,
 * and a corrupt record must not be able to stop the app from starting. Losing
 * one run's progress is survivable; losing the app is not.
 */
export function parseTalosRunState(raw: unknown): TalosRunState | null {
    if (typeof raw !== 'string' || raw === '') return null
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return null
    }
    if (!value || typeof value !== 'object') return null
    const record = value as Partial<TalosRunState>
    if (typeof record.id !== 'string' || typeof record.sessionId !== 'string') return null
    if (!Array.isArray(record.steps)) return null
    const statuses: TalosRunStatus[] = ['planning', 'awaiting_approval', 'running', 'done', 'cancelled', 'failed']
    if (!statuses.includes(record.status as TalosRunStatus)) return null
    return {
        id: record.id,
        kind: (['chat', 'research', 'document'] as TalosRunKind[]).includes(record.kind as TalosRunKind)
            ? record.kind as TalosRunKind
            : 'chat',
        sessionId: record.sessionId,
        title: typeof record.title === 'string' ? record.title : '',
        status: record.status as TalosRunStatus,
        steps: record.steps.filter((step): step is TalosRunStep =>
            Boolean(step) && typeof step === 'object' && typeof (step as TalosRunStep).index === 'number'),
        spend: {
            tokens: Number(record.spend?.tokens) || 0,
            searches: Number(record.spend?.searches) || 0,
            pages: Number(record.spend?.pages) || 0,
        },
        startedAt: typeof record.startedAt === 'string' ? record.startedAt : '',
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
        engine: record.engine === 'cloud' ? 'cloud' : 'device',
        ...(typeof record.failure === 'string' ? { failure: record.failure } : {}),
    }
}
