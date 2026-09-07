import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
    DirectorCheckpointSchema,
    DirectorDecisionSchema,
    FrozenHumanJourneyRegressionCorpusSchema,
    FrozenHumanJourneyRegressionSchema,
    HumanJourneyEvidenceManifestSchema,
    HumanJourneyScenarioSchema,
    HumanJourneyTrialResultSchema,
    HumanObservationSchema,
    HumanTurnSchema,
    Tau2ConformanceFixtureSchema,
    Tau2CreateTrialRequestSchema,
    Tau2CreateTrialResponseSchema,
    Tau2NextTurnRequestSchema,
    Tau2TurnResponseSchema,
} from '../contracts'
import type {
    HumanActorMode,
    HumanJourneyScenario,
    HumanObservation,
    HumanTurn,
} from '../contracts'

const digest = 'a'.repeat(64)
const timestamp = '2026-07-19T00:00:00.000Z'

function validTurn(source: HumanActorMode = 'seeded_persona'): HumanTurn {
    return {
        contract: 'talos.human_journey.turn',
        schema_version: 1,
        turn_id: 'turn-001',
        checkpoint_id: 'checkpoint-001',
        source,
        created_at: timestamp,
        action: 'send_message',
        message: 'Apri example.com e dimmi cosa vedi.',
    }
}

function validScenario(id = 'BROWSER-NATURAL-001'): HumanJourneyScenario {
    return {
        contract: 'talos.human_journey.scenario',
        schema_version: 1,
        id,
        title: 'Natural browser journey',
        goal: 'Use visible TALOS controls to inspect a controlled web page.',
        user_facts: ['The user knows only the target URL.'],
        persona: {
            id: 'hurried_typo_it',
            language: 'it-IT',
            traits: ['hurried', 'typo_prone'],
        },
        initial_state: {
            route: '/chat',
            authenticated: true,
            browse_enabled: false,
            conversation: [],
            fixture_ids: ['sample-text'],
        },
        allowed_actions: [
            'send_message',
            'click_visible_control',
            'attach_fixture',
            'reload_page',
            'wait_for_visible_state',
            'end_trial',
        ],
        checkpoints: [{
            id: 'checkpoint-001',
            description: 'Browser mode is enabled from visible UI.',
            required_visible_outcomes: ['Browse is visibly active.'],
            acceptable_alternatives: [],
            timeout_ms: 15_000,
        }],
        forbidden_outcomes: [{
            id: 'no-fabricated-evidence',
            description: 'No screenshot claim without an owned artifact.',
        }],
        budgets: {
            max_turns: 16,
            max_tool_calls: 12,
            max_duration_ms: 180_000,
            max_provider_tokens: 12_000,
            max_cost_usd: 2,
        },
        perturbations: [],
        graders: [{
            id: 'conversation-continuity',
            kind: 'conversation_continuity',
            expected_outcome: 'Context survives natural follow-up turns.',
            required: true,
        }],
        semantic_rubric: null,
        cleanup: {
            strategy: 'isolated_run',
            preserve_failure_evidence: true,
            max_retention_days: 7,
        },
    }
}

function validObservation(): HumanObservation {
    return {
        contract: 'talos.human_journey.observation',
        schema_version: 1,
        trial_id: 'trial-001',
        scenario_id: 'BROWSER-NATURAL-001',
        checkpoint_id: 'checkpoint-001',
        route: '/chat',
        transcript: [{ role: 'user', content: 'Apri example.com.', occurred_at: timestamp }],
        visible_regions: [{ role: 'main', name: 'Chat', text: 'Apri example.com.' }],
        available_actions: [
            { kind: 'send_message', label: 'Send message' },
            { kind: 'end_trial', label: 'End trial' },
        ],
        available_fixtures: [{ id: 'sample-text', name: 'sample.txt', media_type: 'text/plain', bytes: 64 }],
        prior_actions: [],
        remaining_budget: {
            turns: 15,
            tool_calls: 12,
            duration_ms: 170_000,
            provider_tokens: 11_000,
            cost_usd: 1.8,
        },
        captured_at: timestamp,
        visible_state_sha256: digest,
    }
}

test('infers the exact canonical contract discriminator', () => {
    const parsed = HumanJourneyScenarioSchema.parse(validScenario())
    const exactContract: 'talos.human_journey.scenario' = parsed.contract

    expect(exactContract).toBe('talos.human_journey.scenario')
})

test('parses the canonical scenario and rejects list shape, unknown version, keys and missing budgets', () => {
    expect(HumanJourneyScenarioSchema.parse(validScenario()).id).toBe('BROWSER-NATURAL-001')
    expect(HumanJourneyScenarioSchema.safeParse([validScenario()]).success).toBe(false)
    expect(HumanJourneyScenarioSchema.safeParse({ ...validScenario(), schema_version: 2 }).success).toBe(false)
    expect(HumanJourneyScenarioSchema.safeParse({ ...validScenario(), hidden_selector: '#send' }).success).toBe(false)
    const missingBudgets = validScenario()
    delete (missingBudgets as Record<string, unknown>).budgets
    expect(HumanJourneyScenarioSchema.safeParse(missingBudgets).success).toBe(false)

    const missingCheckpoint = validScenario()
    missingCheckpoint.perturbations = [{
        id: 'reload-missing-checkpoint',
        kind: 'reload',
        at_checkpoint: 'checkpoint-does-not-exist',
        recovery_expectation: 'The run recovers.',
    }]
    expect(HumanJourneyScenarioSchema.safeParse(missingCheckpoint).success).toBe(false)
})

test('bounds observations and rejects selectors or hidden grader state at every strict boundary', () => {
    expect(HumanObservationSchema.parse(validObservation()).visible_state_sha256).toBe(digest)
    expect(HumanObservationSchema.safeParse({ ...validObservation(), selectors: ['#send'] }).success).toBe(false)
    expect(HumanObservationSchema.safeParse({ ...validObservation(), grader_state: { expected: 'browser_navigate' } }).success).toBe(false)

    const nestedSelector = validObservation()
    nestedSelector.visible_regions[0] = { ...nestedSelector.visible_regions[0], selector: '#chat' } as never
    expect(HumanObservationSchema.safeParse(nestedSelector).success).toBe(false)

    const oversized = validObservation()
    oversized.visible_regions = Array.from({ length: 129 }, (_, index) => ({ role: 'region', name: `Region ${index}`, text: 'Visible' }))
    expect(HumanObservationSchema.safeParse(oversized).success).toBe(false)
})

test('allows multiple distinct visible controls without exposing implementation selectors', () => {
    const observation = validObservation()
    observation.available_actions = [
        { kind: 'click_visible_control', label: 'Enable Browse', control: { role: 'button', name: 'Browse', exact: true } },
        { kind: 'click_visible_control', label: 'Open settings', control: { role: 'button', name: 'Settings', exact: true } },
    ]

    expect(HumanObservationSchema.safeParse(observation).success).toBe(true)
})

test('rejects unavailable fixture references in visible attach actions', () => {
    const observation = validObservation()
    observation.available_actions = [{
        kind: 'attach_fixture',
        label: 'Attach a missing fixture',
        fixture_ids: ['missing-fixture'],
    }]

    expect(HumanObservationSchema.safeParse(observation).success).toBe(false)

    observation.available_actions = [{
        kind: 'attach_fixture',
        label: 'Attach a duplicate fixture',
        fixture_ids: ['sample-text', 'sample-text'],
    }]
    expect(HumanObservationSchema.safeParse(observation).success).toBe(false)
})

test('accepts every visible HumanTurn action and rejects branch-specific payload drift', () => {
    const common = {
        contract: 'talos.human_journey.turn',
        schema_version: 1,
        turn_id: 'turn-002',
        checkpoint_id: 'checkpoint-001',
        source: 'seeded_persona',
        created_at: timestamp,
    }
    const turns = [
        { ...common, action: 'send_message', message: 'Riprova.' },
        { ...common, action: 'click_visible_control', control: { role: 'button', name: 'Browse', exact: true } },
        { ...common, action: 'attach_fixture', fixture_id: 'sample-text' },
        { ...common, action: 'reload_page' },
        { ...common, action: 'wait_for_visible_state', description: 'Wait for the assistant reply.', timeout_ms: 10_000 },
        { ...common, action: 'yield_to_simulator', reason: 'Continue adaptively.' },
        { ...common, action: 'request_director_override', reason: 'Need a novel human phrasing.' },
        { ...common, action: 'end_trial', outcome: 'goal_reached', reason: 'The visible goal is complete.' },
    ]

    for (const turn of turns) expect(HumanTurnSchema.safeParse(turn).success).toBe(true)
    expect(HumanTurnSchema.safeParse({ ...turns[3], message: 'not allowed' }).success).toBe(false)
})

test('forces any agent-assisted trial to remain discovery-only and non-promotional', () => {
    const assistedTurn = validTurn('agent_override')
    const base = {
        contract: 'talos.human_journey.trial_result',
        schema_version: 1,
        trial_id: 'trial-001',
        scenario_id: 'BROWSER-NATURAL-001',
        seed: 7,
        actor_mode: 'agent_override',
        classification: 'discovery_assisted',
        status: 'passed',
        promotion_eligible: false,
        started_at: timestamp,
        finished_at: '2026-07-19T00:00:01.000Z',
        duration_ms: 1_000,
        turns: [assistedTurn],
        grader_results: [{
            grader_id: 'conversation-continuity',
            kind: 'conversation_continuity',
            passed: true,
            reason: 'Visible context was preserved.',
            evidence_refs: ['message-001'],
        }],
        metrics: { turn_count: 1, tool_call_count: 0, provider_tokens: 100, latency_ms: 900, cost_usd: 0.01 },
        failure: null,
        evidence_manifest_path: 'trials/trial-001/evidence.json',
    }

    expect(HumanJourneyTrialResultSchema.safeParse(base).success).toBe(true)
    expect(HumanJourneyTrialResultSchema.safeParse({ ...base, promotion_eligible: true }).success).toBe(false)
    expect(HumanJourneyTrialResultSchema.safeParse({ ...base, classification: 'deterministic_autonomous' }).success).toBe(false)

    const autonomous = {
        ...base,
        actor_mode: 'seeded_persona',
        classification: 'deterministic_autonomous',
        promotion_eligible: true,
        turns: [validTurn('seeded_persona')],
    }
    expect(HumanJourneyTrialResultSchema.safeParse(autonomous).success).toBe(true)
    expect(HumanJourneyTrialResultSchema.safeParse({ ...autonomous, actor_mode: 'adaptive_simulator' }).success).toBe(false)
    expect(HumanJourneyTrialResultSchema.safeParse({
        ...autonomous,
        turns: [validTurn('adaptive_simulator')],
    }).success).toBe(false)
    expect(HumanJourneyTrialResultSchema.safeParse({
        ...autonomous,
        turns: [],
        metrics: { ...autonomous.metrics, turn_count: 0 },
    }).success).toBe(false)
    expect(HumanJourneyTrialResultSchema.safeParse({
        ...autonomous,
        evidence_manifest_path: null,
    }).success).toBe(false)
    expect(HumanJourneyTrialResultSchema.safeParse({
        ...base,
        turns: [validTurn('seeded_persona')],
    }).success).toBe(false)
    expect(HumanJourneyTrialResultSchema.safeParse({
        ...autonomous,
        metrics: { ...autonomous.metrics, turn_count: 2 },
    }).success).toBe(false)
})

test('accepts only owned relative evidence paths with bounded SHA-256 artifacts', () => {
    const manifest = {
        contract: 'talos.human_journey.evidence_manifest',
        schema_version: 1,
        trial_id: 'trial-001',
        scenario_id: 'BROWSER-NATURAL-001',
        root: 'trials/trial-001',
        artifacts: [{
            id: 'trace-001',
            kind: 'playwright_trace',
            relative_path: 'trace/trace.zip',
            media_type: 'application/zip',
            bytes: 1_024,
            sha256: digest,
            retained: true,
        }],
        redaction: { applied: true, secret_canary_absent: true, notes: [] },
        created_at: timestamp,
    }

    expect(HumanJourneyEvidenceManifestSchema.safeParse(manifest).success).toBe(true)
    expect(HumanJourneyEvidenceManifestSchema.safeParse({ ...manifest, root: 'C:/private' }).success).toBe(false)
    expect(HumanJourneyEvidenceManifestSchema.safeParse({ ...manifest, artifacts: [{ ...manifest.artifacts[0], relative_path: '../secret' }] }).success).toBe(false)
    expect(HumanJourneyEvidenceManifestSchema.safeParse({ ...manifest, artifacts: [{ ...manifest.artifacts[0], relative_path: 'trace/./trace.zip' }] }).success).toBe(false)
    expect(HumanJourneyEvidenceManifestSchema.safeParse({ ...manifest, artifacts: [{ ...manifest.artifacts[0], relative_path: 'trace/trace\u0000.zip' }] }).success).toBe(false)
})

test('validates director provenance and rejects hidden decision fields', () => {
    const checkpoint = {
        contract: 'talos.human_journey.director_checkpoint',
        schema_version: 1,
        request_id: 'request-001',
        trial_id: 'trial-001',
        scenario_id: 'BROWSER-NATURAL-001',
        checkpoint_id: 'checkpoint-001',
        observation: validObservation(),
        allowed_actions: ['send_message', 'end_trial'],
        remaining_budget: validObservation().remaining_budget,
        observation_sha256: digest,
        created_at: timestamp,
        expires_at: '2026-07-19T00:01:00.000Z',
    }
    const decision = {
        contract: 'talos.human_journey.director_decision',
        schema_version: 1,
        decision_id: 'decision-001',
        request_id: 'request-001',
        observation_sha256: digest,
        director: { provider: 'openai', model: 'gpt-test', configuration_sha256: digest },
        category: 'rephrase',
        turn: validTurn('agent_override'),
        request_sha256: digest,
        created_at: timestamp,
    }

    expect(DirectorCheckpointSchema.safeParse(checkpoint).success).toBe(true)
    expect(DirectorCheckpointSchema.safeParse({ ...checkpoint, trial_id: 'trial-other' }).success).toBe(false)
    expect(DirectorCheckpointSchema.safeParse({ ...checkpoint, scenario_id: 'BROWSER-CHAOS-001' }).success).toBe(false)
    expect(DirectorCheckpointSchema.safeParse({ ...checkpoint, checkpoint_id: 'checkpoint-other' }).success).toBe(false)
    expect(DirectorCheckpointSchema.safeParse({ ...checkpoint, allowed_actions: ['attach_fixture'] }).success).toBe(false)
    expect(DirectorCheckpointSchema.safeParse({
        ...checkpoint,
        remaining_budget: { ...checkpoint.remaining_budget, turns: checkpoint.remaining_budget.turns - 1 },
    }).success).toBe(false)
    expect(DirectorDecisionSchema.safeParse(decision).success).toBe(true)
    expect(DirectorDecisionSchema.safeParse({ ...decision, chain_of_thought: 'hidden' }).success).toBe(false)
    expect(DirectorDecisionSchema.safeParse({ ...decision, turn: validTurn('seeded_persona') }).success).toBe(false)
})

test('rejects duplicate regression IDs in the frozen corpus', () => {
    const regression = {
        contract: 'talos.human_journey.frozen_regression',
        schema_version: 1,
        id: 'HJREG-001',
        scenario_id: 'BROWSER-NATURAL-001',
        source_trial_id: 'trial-001',
        failure_class: 'browser_evidence_missing',
        turns: [validTurn('frozen_replay')],
        observations: [{
            turn_id: 'turn-001',
            checkpoint_id: 'checkpoint-001',
            visible_state_sha256: digest,
        }],
        expected: {
            required_status: 'passed',
            required_grader_ids: ['owned-screenshot-artifact'],
            forbidden_error_codes: ['TALOS_BROWSER_COMMAND_MALFORMED'],
        },
        verification: {
            red_command: './talos verify human-browser --replay=HJREG-001',
            green_command: './talos verify human-browser --replay=HJREG-001',
            affected_command: '../.tools/bin/npm.cmd run test:human-journey',
            dynamic_rerun_command: './talos verify human-browser --scenario=BROWSER-NATURAL-001 --trials=3',
        },
        environment_sha256: digest,
        created_at: timestamp,
    }

    expect(FrozenHumanJourneyRegressionSchema.safeParse(regression).success).toBe(true)
    expect(FrozenHumanJourneyRegressionCorpusSchema.safeParse({
        contract: 'talos.human_journey.regression_corpus',
        schema_version: 1,
        regressions: [regression, structuredClone(regression)],
    }).success).toBe(false)
})

test('TypeScript accepts and rejects the canonical tau2 cross-language fixtures', async () => {
    const fixturePath = fileURLToPath(new URL('../../fixtures/human-journey/tau2-contract-v1.json', import.meta.url))
    const fixture = Tau2ConformanceFixtureSchema.parse(JSON.parse(await readFile(fixturePath, 'utf8')))
    const parsers = {
        create_trial: Tau2CreateTrialRequestSchema,
        trial_created: Tau2CreateTrialResponseSchema,
        next_turn: Tau2NextTurnRequestSchema,
        turn_response: Tau2TurnResponseSchema,
    } as const

    expect(Tau2CreateTrialRequestSchema.safeParse(fixture.valid.create_trial).success).toBe(true)
    expect(Tau2CreateTrialResponseSchema.safeParse(fixture.valid.trial_created).success).toBe(true)
    expect(Tau2NextTurnRequestSchema.safeParse(fixture.valid.next_turn).success).toBe(true)
    expect(Tau2TurnResponseSchema.safeParse(fixture.valid.message_response).success).toBe(true)
    expect(Tau2TurnResponseSchema.safeParse(fixture.valid.terminal_response).success).toBe(true)

    for (const invalid of fixture.invalid) {
        expect(parsers[invalid.parser].safeParse(invalid.value).success, invalid.name).toBe(false)
    }
})
