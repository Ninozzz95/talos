import { describe, expect, it } from 'vitest'
import {
    TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
    parseTalosMobileModelLabPreferences,
} from '@/lib/modelLabContracts'

const valid = {
    schema_version: 1,
    manual_models: [{
        id: 'manual-1',
        provider: 'openai',
        model: 'local/reasoner',
        display_name: 'Local Reasoner',
        input_modalities: ['text'],
        output_modalities: ['text'],
        supported_parameters: ['reasoning_effort', 'tools'],
    }],
    model_overrides: {
        'openai:gpt-live': { display_name: 'Primary GPT', show_in_composer: false },
    },
    provider_runtime: {
        openai: { timeout_seconds: 45 },
        ollama: { timeout_seconds: 120 },
    },
    probe_results: {
        'openai:gpt-live': {
            profile_id: 'openai:gpt-live',
            provider: 'openai',
            model: 'gpt-live',
            ok: true,
            checked_at: '2026-07-22T12:30:00.000Z',
            latency_ms: 412,
            message: 'Completion probe passed.',
        },
    },
}

describe('modelLabContracts', () => {
    it('accepts the exact versioned model-lab preference contract', () => {
        expect(parseTalosMobileModelLabPreferences(valid)).toEqual(valid)
    })

    it.each([
        null,
        [],
        { ...valid, schema_version: 2 },
        { ...valid, rogue: true },
        { ...valid, api_key: 'must-never-persist' },
        { ...valid, manual_models: [{ ...valid.manual_models[0], secret: 'leak' }] },
        { ...valid, provider_runtime: { openai: { timeout_seconds: 4 } } },
        { ...valid, provider_runtime: { openai: { timeout_seconds: 301 } } },
        { ...valid, probe_results: { x: { ...valid.probe_results['openai:gpt-live'], checked_at: 'not-a-date' } } },
        { ...valid, model_overrides: { x: { show_in_composer: 'yes' } } },
    ])('fails malformed or secret-shaped input closed', (candidate) => {
        expect(parseTalosMobileModelLabPreferences(candidate))
            .toEqual(TALOS_DEFAULT_MODEL_LAB_PREFERENCES)
    })

    it('enforces bounded collections and strings', () => {
        expect(parseTalosMobileModelLabPreferences({
            ...valid,
            manual_models: Array.from({ length: 101 }, (_, index) => ({
                ...valid.manual_models[0],
                id: `manual-${index}`,
            })),
        })).toEqual(TALOS_DEFAULT_MODEL_LAB_PREFERENCES)

        expect(parseTalosMobileModelLabPreferences({
            ...valid,
            manual_models: [{ ...valid.manual_models[0], display_name: 'x'.repeat(256) }],
        })).toEqual(TALOS_DEFAULT_MODEL_LAB_PREFERENCES)

        expect(parseTalosMobileModelLabPreferences({
            ...valid,
            probe_results: {
                x: { ...valid.probe_results['openai:gpt-live'], message: 'x'.repeat(501) },
            },
        })).toEqual(TALOS_DEFAULT_MODEL_LAB_PREFERENCES)
    })
})
