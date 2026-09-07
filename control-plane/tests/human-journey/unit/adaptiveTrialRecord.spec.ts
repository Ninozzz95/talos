import { expect, test } from '@playwright/test'
import { AdaptiveTrialRecordSchema } from '../support/adaptiveTrialRecord'

const timestamp = '2026-07-20T00:00:00.000Z'

function record(overrides: Record<string, unknown> = {}) {
    return {
        contract: 'talos.human_journey.adaptive_trial',
        schema_version: 1,
        run_id: 'hj_test_001',
        project: 'chromium',
        trial_id: 'hj9-chromium-novice_it-r1',
        scenario_id: 'BROWSER-NATURAL-001',
        persona_id: 'novice_it',
        trial_round: 1,
        seed: 42,
        status: 'failed',
        model_under_test: {
            provider_id: 'ollama',
            model: 'talos-hj-deterministic',
            endpoint_sha256: `sha256:${'a'.repeat(64)}`,
        },
        metrics: {
            turnCount: 1,
            promptTokens: 12,
            completionTokens: 4,
            providerTokens: 16,
            costUsd: 0,
            latencyMs: 25,
        },
        unrecorded_provider_turn_count: 1,
        turns: [],
        started_at: timestamp,
        finished_at: timestamp,
        duration_ms: 25,
        failure: { code: 'ARIA_CHARACTER_LIMIT', message: 'ARIA character limit exceeded: 4889 > 4000.' },
        ...overrides,
    }
}

test('failed adaptive record preserves the primary fault when one consumed provider response cannot become a human action', () => {
    const parsed = AdaptiveTrialRecordSchema.parse(record())

    expect(parsed.failure).toEqual({
        code: 'ARIA_CHARACTER_LIMIT',
        message: 'ARIA character limit exceeded: 4889 > 4000.',
    })
    expect(parsed.metrics.providerTokens).toBe(16)
    expect(parsed.unrecorded_provider_turn_count).toBe(1)
})

test('passing adaptive record requires exact provider-response and recorded-action parity', () => {
    expect(AdaptiveTrialRecordSchema.safeParse(record({
        status: 'passed',
        failure: null,
    })).success).toBe(false)
})

test('adaptive record rejects impossible or inconsistent provider-response accounting', () => {
    expect(AdaptiveTrialRecordSchema.safeParse(record({
        unrecorded_provider_turn_count: 0,
    })).success).toBe(false)
    expect(AdaptiveTrialRecordSchema.safeParse(record({
        metrics: {
            turnCount: 0,
            promptTokens: 12,
            completionTokens: 4,
            providerTokens: 16,
            costUsd: 0,
            latencyMs: 25,
        },
        unrecorded_provider_turn_count: 0,
        turns: [{
            contract: 'talos.human_journey.turn',
            schema_version: 1,
            turn_id: 'turn-001',
            checkpoint_id: 'browse-enabled',
            source: 'adaptive_simulator',
            created_at: timestamp,
            action: 'send_message',
            message: 'Riprova.',
        }],
    })).success).toBe(false)
})
