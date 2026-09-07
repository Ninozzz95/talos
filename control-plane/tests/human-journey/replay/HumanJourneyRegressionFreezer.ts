import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
    FrozenHumanJourneyRegressionCorpusSchema,
    HumanJourneyRegressionCandidateSchema,
    HumanJourneyTrialResultSchema,
    HumanTurnSchema,
    type FrozenHumanJourneyRegression,
    type FrozenHumanJourneyRegressionCorpus,
    type FrozenRegressionObservation,
    type HumanJourneyRegressionCandidate,
    type HumanJourneyTrialResult,
    type HumanTurn,
} from '../contracts'

const REGRESSION_ID_PATTERN = /^HJREG-([0-9]{3,6})$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MIN_ORACLE_EVALUATIONS = 4
const MAX_ORACLE_EVALUATIONS = 512
const DEFAULT_ORACLE_EVALUATIONS = 128
const MIN_ORACLE_TIMEOUT_MS = 100
const MAX_ORACLE_TIMEOUT_MS = 120_000
const DEFAULT_ORACLE_TIMEOUT_MS = 15_000
const MAX_CORPUS_BYTES = 16 * 1024 * 1024

const FailureOracleOutcomeSchema = z.strictObject({
    reproduced: z.boolean(),
    failureClass: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).nullable(),
    observations: z.array(z.strictObject({
        turn_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
        checkpoint_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
        visible_state_sha256: z.string().regex(SHA256_PATTERN),
    })).max(64),
}).superRefine((value, context) => {
    if (value.reproduced !== (value.failureClass !== null)) {
        context.addIssue({ code: 'custom', message: 'A reproduced oracle result requires one failure class; a passing result requires null.' })
    }
})

export interface FailureOracleOutcome {
    reproduced: boolean
    failureClass: string | null
    observations: FrozenRegressionObservation[]
}

export interface FailureOracleContext {
    signal: AbortSignal
    evaluation: number
}

export type DeterministicFailureOracle = (
    turns: readonly HumanTurn[],
    context: FailureOracleContext,
) => Promise<FailureOracleOutcome>

export interface RegressionFreezeRequest {
    sourceTrial: HumanJourneyTrialResult
    corpus: FrozenHumanJourneyRegressionCorpus | unknown
    reservedIds?: readonly string[]
    expected: FrozenHumanJourneyRegression['expected']
    environmentSha256: string
    verification: FrozenHumanJourneyRegression['verification']
    createdAt: string
    oracle: DeterministicFailureOracle
    maxOracleEvaluations?: number
    oracleTimeoutMs?: number
    signal?: AbortSignal
}

interface Evaluator {
    evaluate(turns: readonly HumanTurn[], cache: boolean): Promise<FailureOracleOutcome>
    evaluations(): number
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [
            key,
            canonicalize((value as Record<string, unknown>)[key]),
        ]))
    }
    return value
}

function canonicalSha256(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === code
}

function assertIntegerInRange(value: number, minimum: number, maximum: number, label: string): number {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`)
    }
    return value
}

function assertObservationBindings(
    outcome: FailureOracleOutcome,
    turns: readonly HumanTurn[],
    label: string,
): FrozenRegressionObservation[] {
    if (outcome.observations.length !== turns.length) {
        throw new Error(`${label} must return exactly one observation binding for every candidate turn.`)
    }

    for (let index = 0; index < turns.length; index += 1) {
        const candidate = turns[index]!
        const observation = outcome.observations[index]!
        if (observation.turn_id !== candidate.turn_id || observation.checkpoint_id !== candidate.checkpoint_id) {
            throw new Error(`${label} observation ${index} does not match its ordered turn and checkpoint.`)
        }
    }

    return structuredClone(outcome.observations)
}

function regressionNumber(id: string): number {
    const match = REGRESSION_ID_PATTERN.exec(id)
    if (match === null) throw new Error(`Invalid Human Journey regression ID: ${id}`)
    return Number.parseInt(match[1]!, 10)
}

export function allocateHumanJourneyRegressionId(
    rawCorpus: FrozenHumanJourneyRegressionCorpus | unknown,
    reservedIds: readonly string[] = [],
): string {
    const corpus = FrozenHumanJourneyRegressionCorpusSchema.parse(rawCorpus)
    const identities = [...corpus.regressions.map((regression) => regression.id), ...reservedIds]
    const seen = new Set<string>()
    let maximum = 0

    for (const identity of identities) {
        const numeric = regressionNumber(identity)
        if (seen.has(identity)) throw new Error(`Duplicate Human Journey regression ID: ${identity}`)
        seen.add(identity)
        maximum = Math.max(maximum, numeric)
    }

    if (maximum >= 999_999) throw new Error('Human Journey regression ID space is exhausted.')
    return `HJREG-${String(maximum + 1).padStart(3, '0')}`
}

export async function loadHumanJourneyRegressionCorpus(path: string): Promise<FrozenHumanJourneyRegressionCorpus> {
    const fileInfo = await lstat(path)
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
        throw new Error('Human Journey regression corpus must be a regular non-symlink file.')
    }
    const fileStat = await stat(path)
    if (fileStat.size > MAX_CORPUS_BYTES) {
        throw new Error(`Human Journey regression corpus exceeds ${MAX_CORPUS_BYTES} bytes.`)
    }

    let decoded: unknown
    try {
        decoded = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
        throw new Error('Human Journey regression corpus is not valid JSON.', { cause: error })
    }
    return FrozenHumanJourneyRegressionCorpusSchema.parse(decoded)
}

function createEvaluator(
    oracle: DeterministicFailureOracle,
    maximumEvaluations: number,
    timeoutMs: number,
    callerSignal: AbortSignal | undefined,
): Evaluator {
    const cache = new Map<string, FailureOracleOutcome>()
    let evaluationCount = 0

    const evaluate = async (turns: readonly HumanTurn[], useCache: boolean): Promise<FailureOracleOutcome> => {
        if (callerSignal?.aborted === true) throw new Error('Human Journey regression freeze was cancelled.')
        const cacheKey = canonicalSha256(turns)
        const cached = useCache ? cache.get(cacheKey) : undefined
        if (cached !== undefined) return structuredClone(cached)
        if (evaluationCount >= maximumEvaluations) {
            throw new Error(`Human Journey regression oracle evaluation budget of ${maximumEvaluations} was exhausted.`)
        }

        evaluationCount += 1
        const evaluation = evaluationCount
        const controller = new AbortController()
        let timedOut = false
        let cancelled = false
        const onCallerAbort = () => {
            cancelled = true
            controller.abort(callerSignal?.reason)
        }
        callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
        const timer = setTimeout(() => {
            timedOut = true
            controller.abort(new Error(`Oracle evaluation ${evaluation} timed out.`))
        }, timeoutMs)

        const abortPromise = new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => {
                if (cancelled) reject(new Error('Human Journey regression freeze was cancelled.'))
                else if (timedOut) reject(new Error(`Human Journey regression oracle evaluation ${evaluation} timed out after ${timeoutMs} ms.`))
                else reject(new Error(`Human Journey regression oracle evaluation ${evaluation} was aborted.`))
            }, { once: true })
        })

        try {
            const rawOutcome = await Promise.race([
                oracle(structuredClone(turns), { signal: controller.signal, evaluation }),
                abortPromise,
            ])
            const outcome = FailureOracleOutcomeSchema.parse(rawOutcome)
            if (useCache) cache.set(cacheKey, structuredClone(outcome))
            return outcome
        } finally {
            clearTimeout(timer)
            callerSignal?.removeEventListener('abort', onCallerAbort)
        }
    }

    return {
        evaluate,
        evaluations: () => evaluationCount,
    }
}

async function minimizeFailure(
    sourceTurns: readonly HumanTurn[],
    failureClass: string,
    evaluator: Evaluator,
): Promise<HumanTurn[]> {
    let current: HumanTurn[] = structuredClone([...sourceTurns])
    let granularity = 2

    while (current.length >= 2) {
        const chunkSize = Math.ceil(current.length / granularity)
        let reduced = false

        for (let start = 0; start < current.length; start += chunkSize) {
            const complement = [...current.slice(0, start), ...current.slice(start + chunkSize)]
            if (complement.length === 0) continue
            const outcome = await evaluator.evaluate(complement, true)
            if (!outcome.reproduced || outcome.failureClass !== failureClass) continue
            assertObservationBindings(outcome, complement, 'Accepted ddmin oracle result')
            current = complement
            granularity = Math.max(2, granularity - 1)
            reduced = true
            break
        }

        if (reduced) continue
        if (granularity >= current.length) break
        granularity = Math.min(current.length, granularity * 2)
    }

    return current
}

function assertCandidateSourceHash(candidate: HumanJourneyRegressionCandidate): void {
    if (candidate.source_trial_sha256 !== canonicalSha256(candidate.source_trial)) {
        throw new Error('Human Journey regression candidate source trial hash does not match its preserved source trial.')
    }
}

export class HumanJourneyRegressionFreezer {
    async freeze(request: RegressionFreezeRequest): Promise<HumanJourneyRegressionCandidate> {
        if (typeof request.oracle !== 'function') throw new Error('Human Journey regression freeze requires a deterministic failure oracle.')
        const sourceTrial = HumanJourneyTrialResultSchema.parse(request.sourceTrial)
        if (sourceTrial.status === 'passed' || sourceTrial.failure === null) {
            throw new Error('Human Journey regression freeze requires a failed source trial.')
        }
        if (sourceTrial.turns.length === 0) throw new Error('Human Journey regression freeze requires at least one source turn.')
        if (!SHA256_PATTERN.test(request.environmentSha256)) throw new Error('Human Journey regression environment hash must be SHA-256.')

        const corpus = FrozenHumanJourneyRegressionCorpusSchema.parse(request.corpus)
        const maximumEvaluations = assertIntegerInRange(
            request.maxOracleEvaluations ?? DEFAULT_ORACLE_EVALUATIONS,
            MIN_ORACLE_EVALUATIONS,
            MAX_ORACLE_EVALUATIONS,
            'Human Journey regression oracle evaluation cap',
        )
        const timeoutMs = assertIntegerInRange(
            request.oracleTimeoutMs ?? DEFAULT_ORACLE_TIMEOUT_MS,
            MIN_ORACLE_TIMEOUT_MS,
            MAX_ORACLE_TIMEOUT_MS,
            'Human Journey regression oracle timeout',
        )
        const evaluator = createEvaluator(request.oracle, maximumEvaluations, timeoutMs, request.signal)
        const failureClass = sourceTrial.failure.code

        const baseline = await evaluator.evaluate(sourceTrial.turns, true)
        if (!baseline.reproduced || baseline.failureClass !== failureClass) {
            throw new Error(`Source trial did not deterministically reproduce failure class ${failureClass}.`)
        }
        assertObservationBindings(baseline, sourceTrial.turns, 'Source trial oracle result')

        const minimizedTurns = await minimizeFailure(sourceTrial.turns, failureClass, evaluator)
        const firstFinalReplay = await evaluator.evaluate(minimizedTurns, false)
        const secondFinalReplay = await evaluator.evaluate(minimizedTurns, false)
        if (
            !firstFinalReplay.reproduced
            || !secondFinalReplay.reproduced
            || firstFinalReplay.failureClass !== failureClass
            || secondFinalReplay.failureClass !== failureClass
        ) {
            throw new Error('Human Journey regression is flaky: the minimized failure class did not reproduce twice.')
        }
        const firstObservations = assertObservationBindings(firstFinalReplay, minimizedTurns, 'First final replay')
        const secondObservations = assertObservationBindings(secondFinalReplay, minimizedTurns, 'Second final replay')
        if (canonicalSha256(firstObservations) !== canonicalSha256(secondObservations)) {
            throw new Error('Human Journey regression is flaky: final visible observation hashes changed between replays.')
        }

        const frozenTurns = minimizedTurns.map((candidate) => HumanTurnSchema.parse({
            ...candidate,
            source: 'frozen_replay',
        }))
        const regression: FrozenHumanJourneyRegression = {
            contract: 'talos.human_journey.frozen_regression',
            schema_version: 1,
            id: allocateHumanJourneyRegressionId(corpus, request.reservedIds),
            scenario_id: sourceTrial.scenario_id,
            source_trial_id: sourceTrial.trial_id,
            failure_class: failureClass,
            turns: frozenTurns,
            observations: firstObservations,
            expected: structuredClone(request.expected),
            verification: structuredClone(request.verification),
            environment_sha256: request.environmentSha256,
            created_at: request.createdAt,
        }
        const candidate = HumanJourneyRegressionCandidateSchema.parse({
            contract: 'talos.human_journey.regression_candidate',
            schema_version: 1,
            status: 'unpromoted',
            source_trial: sourceTrial,
            source_trial_sha256: canonicalSha256(sourceTrial),
            regression,
            minimization: {
                algorithm: 'ddmin-v1',
                original_turn_count: sourceTrial.turns.length,
                minimized_turn_count: frozenTurns.length,
                oracle_evaluations: evaluator.evaluations(),
                max_oracle_evaluations: maximumEvaluations,
            },
            created_at: request.createdAt,
        })
        assertCandidateSourceHash(candidate)
        return candidate
    }

    async writeCandidate(rootDirectory: string, rawCandidate: HumanJourneyRegressionCandidate | unknown): Promise<string> {
        const candidate = HumanJourneyRegressionCandidateSchema.parse(rawCandidate)
        assertCandidateSourceHash(candidate)
        await mkdir(rootDirectory, { recursive: true })
        const rootInfo = await lstat(rootDirectory)
        if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
            throw new Error('Human Journey regression candidate root must be a regular non-symlink directory.')
        }
        const ownedRoot = await realpath(rootDirectory)
        const destination = join(ownedRoot, `${candidate.regression.id}.candidate.json`)
        const publicationLock = join(ownedRoot, `${candidate.regression.id}.publish.lock`)
        const temporary = join(ownedRoot, `.${candidate.regression.id}.${randomUUID()}.tmp-${process.pid}`)

        let lockHandle: Awaited<ReturnType<typeof open>> | undefined
        let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined
        let published = false
        try {
            try {
                lockHandle = await open(publicationLock, 'wx', 0o600)
            } catch (error) {
                if (isNodeError(error, 'EEXIST')) throw new Error(`Candidate publication already exists or is in progress for ${candidate.regression.id}.`)
                throw error
            }
            try {
                await lstat(destination)
                throw new Error(`Human Journey regression candidate already exists: ${candidate.regression.id}`)
            } catch (error) {
                if (!isNodeError(error, 'ENOENT')) throw error
            }

            temporaryHandle = await open(temporary, 'wx', 0o600)
            await temporaryHandle.writeFile(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8')
            await temporaryHandle.sync()
            await temporaryHandle.close()
            temporaryHandle = undefined
            await rename(temporary, destination)
            published = true
            return destination
        } finally {
            await temporaryHandle?.close().catch(() => undefined)
            await lockHandle?.close().catch(() => undefined)
            if (!published) await rm(temporary, { force: true }).catch(() => undefined)
            await rm(publicationLock, { force: true }).catch(() => undefined)
        }
    }
}
