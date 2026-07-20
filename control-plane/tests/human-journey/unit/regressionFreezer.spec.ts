import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FrozenReplayActor } from '../actors/FrozenReplayActor'
import {
    FrozenHumanJourneyRegressionSchema,
    HumanJourneyRegressionCandidateSchema,
    HumanJourneyScenarioSchema,
    HumanJourneyTrialResultSchema,
    HumanObservationSchema,
    type FrozenHumanJourneyRegression,
    type HumanJourneyScenario,
    type HumanJourneyTrialResult,
    type HumanObservation,
    type HumanTurn,
} from '../contracts'
import {
    HumanJourneyRegressionFreezer,
    allocateHumanJourneyRegressionId,
    loadHumanJourneyRegressionCorpus,
    type DeterministicFailureOracle,
    type RegressionFreezeRequest,
} from '../replay/HumanJourneyRegressionFreezer'

const timestamp = '2026-07-20T12:00:00.000Z'
const failureClass = 'TALOS_BROWSER_EVIDENCE_COMMIT_FAILED'
const environmentSha256 = 'e'.repeat(64)
const permanentCorpusPath = join(process.cwd(), 'tests', 'fixtures', 'human-journey', 'historical-regressions.json')

let temporaryRoot = ''

test.beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'talos-hj-freezer-'))
})

test.afterEach(async () => {
    if (temporaryRoot !== '') await rm(temporaryRoot, { recursive: true, force: true })
})

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

function digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function turn(index: number, message = `Visible human action ${index}`): HumanTurn {
    return {
        contract: 'talos.human_journey.turn',
        schema_version: 1,
        turn_id: `turn-${String(index).padStart(3, '0')}`,
        checkpoint_id: 'checkpoint-001',
        source: 'agent_override',
        created_at: new Date(Date.parse(timestamp) + index * 1_000).toISOString(),
        action: 'send_message',
        message,
    }
}

function sourceTrial(turns: HumanTurn[] = [
    turn(1, 'Apri la pagina che ti ho inviato.'),
    turn(2, 'Chiudi il banner cookie visibile.'),
    turn(3, 'Ora apri il link Chi siamo.'),
    turn(4, 'Cattura una prova visibile dopo il click.'),
    turn(5, 'Riprova mantenendo il contesto precedente.'),
]): HumanJourneyTrialResult {
    return HumanJourneyTrialResultSchema.parse({
        contract: 'talos.human_journey.trial_result',
        schema_version: 1,
        trial_id: 'trial-assisted-001',
        scenario_id: 'BROWSER-NATURAL-001',
        seed: 42,
        actor_mode: 'agent_override',
        classification: 'discovery_assisted',
        status: 'failed',
        promotion_eligible: false,
        started_at: timestamp,
        finished_at: '2026-07-20T12:01:00.000Z',
        duration_ms: 60_000,
        turns,
        grader_results: [{
            grader_id: 'owned-screenshot-artifact',
            kind: 'owned_screenshot_artifact',
            passed: false,
            reason: 'Post-action evidence was not committed.',
            evidence_refs: [],
        }],
        metrics: {
            turn_count: turns.length,
            tool_call_count: 2,
            provider_tokens: 500,
            latency_ms: 60_000,
            cost_usd: 0,
        },
        failure: {
            code: failureClass,
            category: 'worker',
            message: 'The browser action completed but post-action evidence was not committed.',
            replay_command: './talos verify human-browser --replay=HJREG-011',
        },
        evidence_manifest_path: 'reports/trial-assisted-001/evidence.json',
    })
}

function scenario(): HumanJourneyScenario {
    return HumanJourneyScenarioSchema.parse({
        contract: 'talos.human_journey.scenario',
        schema_version: 1,
        id: 'BROWSER-NATURAL-001',
        title: 'Frozen browser regression',
        goal: 'Replay only the reviewed visible human actions.',
        user_facts: ['The user can see only the TALOS chat and Browser evidence.'],
        persona: { id: 'novice_it', language: 'it-IT', traits: ['novice'] },
        initial_state: {
            route: '/chat',
            authenticated: true,
            browse_enabled: true,
            conversation: [],
            fixture_ids: [],
        },
        allowed_actions: ['send_message', 'end_trial'],
        checkpoints: [{
            id: 'checkpoint-001',
            description: 'The frozen visible state is ready.',
            required_visible_outcomes: ['The expected chat state is visible.'],
            acceptable_alternatives: [],
            timeout_ms: 15_000,
        }],
        forbidden_outcomes: [{ id: 'no-drift', description: 'Replay cannot accept visible-state drift.' }],
        budgets: {
            max_turns: 16,
            max_tool_calls: 12,
            max_duration_ms: 180_000,
            max_provider_tokens: 12_000,
            max_cost_usd: 2,
        },
        perturbations: [],
        graders: [{
            id: 'owned-screenshot-artifact',
            kind: 'owned_screenshot_artifact',
            expected_outcome: 'Owned evidence is committed after the action.',
            required: true,
        }],
        semantic_rubric: null,
        cleanup: { strategy: 'isolated_run', preserve_failure_evidence: true, max_retention_days: 7 },
    })
}

function stateHash(turnId: string): string {
    return createHash('sha256').update(`visible:${turnId}`).digest('hex')
}

function oracleOutcome(turns: readonly HumanTurn[], reproduced: boolean, reportedFailureClass = failureClass) {
    return {
        reproduced,
        failureClass: reproduced ? reportedFailureClass : null,
        observations: turns.map((candidate) => ({
            turn_id: candidate.turn_id,
            checkpoint_id: candidate.checkpoint_id,
            visible_state_sha256: stateHash(candidate.turn_id),
        })),
    }
}

function requiredTurnOracle(requiredTurnIds: readonly string[]): DeterministicFailureOracle {
    return async (turns) => oracleOutcome(
        turns,
        requiredTurnIds.every((required) => turns.some((candidate) => candidate.turn_id === required)),
    )
}

function verification() {
    return {
        red_command: './talos verify human-browser --replay=HJREG-011',
        green_command: './talos verify human-browser --replay=HJREG-011',
        affected_command: '../.tools/bin/npm.cmd run test:human-journey',
        dynamic_rerun_command: './talos verify human-browser --lane=deterministic --scenario=BROWSER-NATURAL-001 --seed=43 --trials=3',
    }
}

function freezeRequest(overrides: Partial<RegressionFreezeRequest> = {}): RegressionFreezeRequest {
    return {
        sourceTrial: sourceTrial(),
        corpus: {
            contract: 'talos.human_journey.regression_corpus',
            schema_version: 1,
            regressions: [],
        },
        reservedIds: Array.from({ length: 10 }, (_, index) => `HJREG-${String(index + 1).padStart(3, '0')}`),
        expected: {
            required_status: 'passed',
            required_grader_ids: ['owned-screenshot-artifact'],
            forbidden_error_codes: ['TALOS_BROWSER_COMMAND_MALFORMED'],
        },
        environmentSha256,
        verification: verification(),
        createdAt: timestamp,
        oracle: requiredTurnOracle(['turn-002', 'turn-004']),
        ...overrides,
    }
}

function observationFor(regression: FrozenHumanJourneyRegression, index: number): HumanObservation {
    const binding = regression.observations[index]!
    return HumanObservationSchema.parse({
        contract: 'talos.human_journey.observation',
        schema_version: 1,
        trial_id: 'trial-replay-001',
        scenario_id: regression.scenario_id,
        checkpoint_id: binding.checkpoint_id,
        route: '/chat',
        transcript: [{ role: 'user', content: 'Visible replay state.', occurred_at: timestamp }],
        visible_regions: [{ role: 'main', name: 'TALOS chat', text: 'Visible replay state.' }],
        available_actions: [{ kind: 'send_message', label: 'Send message' }],
        available_fixtures: [],
        prior_actions: [],
        remaining_budget: { turns: 10, tool_calls: 10, duration_ms: 100_000, provider_tokens: 8_000, cost_usd: 1 },
        captured_at: timestamp,
        visible_state_sha256: binding.visible_state_sha256,
    })
}

test('allocates a stable ID after corpus and reservations and rejects ambiguous ID sets', async () => {
    const corpus = await loadHumanJourneyRegressionCorpus(permanentCorpusPath)
    const reservations = Array.from({ length: 10 }, (_, index) => `HJREG-${String(index + 1).padStart(3, '0')}`)

    expect(allocateHumanJourneyRegressionId(corpus, reservations)).toBe('HJREG-011')
    expect(allocateHumanJourneyRegressionId(corpus, reservations)).toBe('HJREG-011')
    expect(() => allocateHumanJourneyRegressionId(corpus, ['HJREG-001', 'HJREG-001'])).toThrow(/duplicate/i)
    expect(() => allocateHumanJourneyRegressionId(corpus, ['INVALID-001'])).toThrow(/invalid/i)
    expect(() => allocateHumanJourneyRegressionId(corpus, ['HJREG-999999'])).toThrow(/exhausted/i)
})

test('preserves the complete source trial and minimizes only irrelevant turns with the same failure class', async () => {
    const original = sourceTrial()
    const originalJson = JSON.stringify(original)
    const freezer = new HumanJourneyRegressionFreezer()
    const candidate = await freezer.freeze(freezeRequest({ sourceTrial: original }))

    expect(JSON.stringify(candidate.source_trial)).toBe(originalJson)
    expect(candidate.source_trial_sha256).toBe(digest(original))
    expect(candidate.regression.id).toBe('HJREG-011')
    expect(candidate.regression.failure_class).toBe(failureClass)
    expect(candidate.regression.turns.map((item) => item.turn_id)).toEqual(['turn-002', 'turn-004'])
    expect(candidate.regression.turns.every((item) => item.source === 'frozen_replay')).toBe(true)
    expect(candidate.regression.observations.map((item) => item.turn_id)).toEqual(['turn-002', 'turn-004'])
    expect(candidate.minimization.algorithm).toBe('ddmin-v1')
    expect(candidate.minimization.original_turn_count).toBe(5)
    expect(candidate.minimization.minimized_turn_count).toBe(2)
    expect(candidate.minimization.oracle_evaluations).toBeLessThanOrEqual(candidate.minimization.max_oracle_evaluations)
    expect(HumanJourneyRegressionCandidateSchema.safeParse(candidate).success).toBe(true)
})

test('does not accept a smaller stream that changes the failure class', async () => {
    const threeTurns = [turn(1), turn(2), turn(3)]
    const oracle: DeterministicFailureOracle = async (turns) => {
        if (turns.length === threeTurns.length) return oracleOutcome(turns, true)
        return oracleOutcome(turns, true, 'TALOS_DIFFERENT_FAILURE')
    }

    const candidate = await new HumanJourneyRegressionFreezer().freeze(freezeRequest({
        sourceTrial: sourceTrial(threeTurns),
        oracle,
    }))

    expect(candidate.regression.turns).toHaveLength(3)
    expect(candidate.regression.failure_class).toBe(failureClass)
})

test('rejects flaky final replay when visible observation hashes change', async () => {
    let invocation = 0
    const oneTurn = [turn(1)]
    const oracle: DeterministicFailureOracle = async (turns) => {
        invocation += 1
        const outcome = oracleOutcome(turns, true)
        if (invocation === 3) outcome.observations[0]!.visible_state_sha256 = 'f'.repeat(64)
        return outcome
    }

    await expect(new HumanJourneyRegressionFreezer().freeze(freezeRequest({
        sourceTrial: sourceTrial(oneTurn),
        oracle,
    }))).rejects.toThrow(/flaky/i)
})

test('fails closed on evaluation budget, timeout and caller cancellation', async () => {
    await expect(new HumanJourneyRegressionFreezer().freeze(freezeRequest({
        maxOracleEvaluations: 4,
        oracle: async (turns) => oracleOutcome(turns, true),
    }))).rejects.toThrow(/evaluation budget/i)

    await expect(new HumanJourneyRegressionFreezer().freeze(freezeRequest({
        sourceTrial: sourceTrial([turn(1)]),
        oracleTimeoutMs: 100,
        oracle: async () => await new Promise(() => undefined),
    }))).rejects.toThrow(/timed out/i)

    const controller = new AbortController()
    controller.abort(new Error('caller stopped'))
    let calls = 0
    await expect(new HumanJourneyRegressionFreezer().freeze(freezeRequest({
        signal: controller.signal,
        oracle: async (turns) => {
            calls += 1
            return oracleOutcome(turns, true)
        },
    }))).rejects.toThrow(/cancelled/i)
    expect(calls).toBe(0)
})

test('replays exact frozen turns and rejects visible-state drift before cursor advancement', async () => {
    const candidate = await new HumanJourneyRegressionFreezer().freeze(freezeRequest())
    const actor = new FrozenReplayActor(candidate.regression)
    const actorScenario = scenario()
    const firstObservation = observationFor(candidate.regression, 0)

    await expect(actor.nextTurn({
        scenario: actorScenario,
        observation: { ...firstObservation, visible_state_sha256: '0'.repeat(64) },
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
    })).rejects.toThrow(/visible state/i)

    const first = await actor.nextTurn({
        scenario: actorScenario,
        observation: firstObservation,
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
    })
    expect(first).toEqual(candidate.regression.turns[0])

    const secondObservation = observationFor(candidate.regression, 1)
    const second = await actor.nextTurn({
        scenario: actorScenario,
        observation: secondObservation,
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
    })
    expect(second).toEqual(candidate.regression.turns[1])

    await expect(actor.nextTurn({
        scenario: actorScenario,
        observation: secondObservation,
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
    })).rejects.toThrow(/exhausted/i)
})

test('rejects scenario, checkpoint and cancellation drift without simulator, director or network hooks', async () => {
    const candidate = await new HumanJourneyRegressionFreezer().freeze(freezeRequest())
    const actorScenario = scenario()
    const validObservation = observationFor(candidate.regression, 0)

    const wrongScenario = structuredClone(actorScenario)
    wrongScenario.id = 'BROWSER-CHAOS-001'
    await expect(new FrozenReplayActor(candidate.regression).nextTurn({
        scenario: wrongScenario,
        observation: { ...validObservation, scenario_id: wrongScenario.id },
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
    })).rejects.toThrow(/scenario/i)

    await expect(new FrozenReplayActor(candidate.regression).nextTurn({
        scenario: actorScenario,
        observation: { ...validObservation, checkpoint_id: 'checkpoint-other' },
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
    })).rejects.toThrow(/checkpoint/i)

    const missingCheckpointScenario = structuredClone(actorScenario)
    missingCheckpointScenario.checkpoints[0]!.id = 'checkpoint-other'
    await expect(new FrozenReplayActor(candidate.regression).nextTurn({
        scenario: missingCheckpointScenario,
        observation: validObservation,
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
    })).rejects.toThrow(/declared checkpoint/i)

    const disallowedActionScenario = structuredClone(actorScenario)
    disallowedActionScenario.allowed_actions = ['end_trial']
    await expect(new FrozenReplayActor(candidate.regression).nextTurn({
        scenario: disallowedActionScenario,
        observation: validObservation,
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
    })).rejects.toThrow(/allowed action/i)

    const controller = new AbortController()
    controller.abort()
    await expect(new FrozenReplayActor(candidate.regression).nextTurn({
        scenario: actorScenario,
        observation: validObservation,
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
        signal: controller.signal,
    })).rejects.toThrow(/cancelled/i)

    const actorKeys = Object.keys(new FrozenReplayActor(candidate.regression))
    expect(actorKeys.some((key) => /simulator|director|provider|network|client/i.test(key))).toBe(false)
})

test('records strict RED, GREEN, affected and dynamic rerun commands', async () => {
    const candidate = await new HumanJourneyRegressionFreezer().freeze(freezeRequest())

    expect(candidate.regression.verification).toEqual(verification())
    expect(FrozenHumanJourneyRegressionSchema.safeParse({
        ...candidate.regression,
        verification: { ...candidate.regression.verification, red_command: '' },
    }).success).toBe(false)
    expect(FrozenHumanJourneyRegressionSchema.safeParse({
        ...candidate.regression,
        verification: { ...candidate.regression.verification, hidden_command: 'private' },
    }).success).toBe(false)
})

test('strictly loads the permanent corpus and never mutates it during freezing', async () => {
    const before = await readFile(permanentCorpusPath, 'utf8')
    const corpus = await loadHumanJourneyRegressionCorpus(permanentCorpusPath)
    expect(corpus.regressions).toEqual([])

    const malformedPath = join(temporaryRoot, 'malformed.json')
    await writeFile(malformedPath, JSON.stringify({ ...corpus, unknown: true }), 'utf8')
    await expect(loadHumanJourneyRegressionCorpus(malformedPath)).rejects.toThrow()

    await new HumanJourneyRegressionFreezer().freeze(freezeRequest({ corpus }))
    expect(await readFile(permanentCorpusPath, 'utf8')).toBe(before)
})

test('writes one complete candidate atomically and rejects destination collision or malformed data', async () => {
    const candidate = await new HumanJourneyRegressionFreezer().freeze(freezeRequest())
    const candidateRoot = join(temporaryRoot, 'candidates')
    const freezer = new HumanJourneyRegressionFreezer()
    const destination = await freezer.writeCandidate(candidateRoot, candidate)

    const parsed = HumanJourneyRegressionCandidateSchema.parse(JSON.parse(await readFile(destination, 'utf8')))
    expect(parsed.source_trial).toEqual(candidate.source_trial)
    expect((await readdir(candidateRoot)).filter((entry) => entry.includes('.tmp-'))).toEqual([])
    await expect(freezer.writeCandidate(candidateRoot, candidate)).rejects.toThrow(/exists/i)
    await expect(freezer.writeCandidate(candidateRoot, { ...candidate, source_trial_sha256: '0'.repeat(64) })).rejects.toThrow(/hash/i)
})
