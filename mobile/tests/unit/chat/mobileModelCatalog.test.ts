import { describe, expect, it } from 'vitest'
import {
    manualModelToProviderModel,
    talosMobileModelProfiles,
} from '@/lib/mobileModelCatalog'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import type { TalosMobileModelLabPreferences } from '@/lib/modelLabContracts'

const discovered: TalosMobileProviderModel[] = [
    {
        id: 'claude-live', provider: 'anthropic', displayName: 'Claude Live', chatCompatibility: 'supported',
        inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['thinking'],
    },
    {
        id: 'vendor/reasoning', provider: 'openrouter', displayName: 'Reasoning Live', chatCompatibility: 'supported',
        inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['reasoning'],
    },
    {
        id: 'vendor/image', provider: 'openrouter', displayName: 'Image only', chatCompatibility: 'unsupported',
        inputModalities: ['text'], outputModalities: ['image'], supportedParameters: [],
    },
]

describe('mobileModelCatalog', () => {
    it('creates one globally unique profile for every dynamically discovered model', () => {
        const profiles = talosMobileModelProfiles(discovered, () => true)
        expect(profiles.map((profile) => profile.id)).toEqual([
            'anthropic:claude-live',
            'openrouter:vendor/reasoning',
            'openrouter:vendor/image',
        ])
        expect(profiles[1]).toMatchObject({ model: 'vendor/reasoning', display_name: 'Reasoning Live' })
    })

    it('marks secret-backed profiles callable immediately after successful discovery', () => {
        const profiles = talosMobileModelProfiles(discovered, (provider) => provider === 'anthropic')
        const anthropic = profiles.find((profile) => profile.provider === 'anthropic')!
        expect(anthropic.has_secret).toBe(true)
        expect(anthropic.status).toBe('untested')
        expect(anthropic.show_in_composer).toBe(true)
    })

    it('derives effort only from provider-advertised reasoning support', () => {
        const profiles = talosMobileModelProfiles(discovered, () => true)
        expect(profiles.find((profile) => profile.provider === 'anthropic')?.effort_levels).toEqual(['low', 'medium', 'high'])
        expect(profiles.find((profile) => profile.model === 'vendor/reasoning')?.effort_levels).toEqual(['low', 'medium', 'high'])
        expect(profiles.find((profile) => profile.model === 'vendor/image')?.effort_levels).toEqual([])
    })

    it('preserves unsupported discovered models but marks them disabled', () => {
        const profiles = talosMobileModelProfiles(discovered, () => true)
        expect(profiles.find((profile) => profile.model === 'vendor/image')).toMatchObject({
            status: 'disabled',
            capabilities: expect.objectContaining({ chat_compatibility: 'unsupported' }),
        })
    })

    it('projects manual models, display and visibility overrides, and bounded probe evidence', () => {
        const preferences: TalosMobileModelLabPreferences = {
            schema_version: 1,
            manual_models: [{
                id: 'manual-openai-local',
                provider: 'openai',
                model: 'local-chat',
                display_name: 'Local Chat',
                input_modalities: ['text'],
                output_modalities: ['text'],
                supported_parameters: ['reasoning_effort'],
            }],
            model_overrides: {
                'anthropic:claude-live': { display_name: 'Claude Primary', show_in_composer: false },
            },
            provider_runtime: {},
            probe_results: {
                'openai:local-chat': {
                    profile_id: 'openai:local-chat',
                    provider: 'openai',
                    model: 'local-chat',
                    ok: true,
                    checked_at: '2026-07-22T12:00:00.000Z',
                    latency_ms: 81,
                    message: 'Completion probe passed.',
                },
            },
        }

        const profiles = talosMobileModelProfiles(discovered, () => true, preferences)

        expect(profiles.find((profile) => profile.id === 'anthropic:claude-live')).toMatchObject({
            display_name: 'Claude Primary',
            show_in_composer: false,
            capabilities: expect.objectContaining({ provenance: 'observed' }),
        })
        expect(profiles.find((profile) => profile.id === 'openai:local-chat')).toMatchObject({
            display_name: 'Local Chat',
            status: 'healthy',
            probe_ok: true,
            effort_levels: ['low', 'medium', 'high'],
            capabilities: expect.objectContaining({ provenance: 'declared' }),
        })
    })

    it('keeps observed metadata authoritative when a manual recovery entry names the same model', () => {
        const manual = {
            id: 'duplicate',
            provider: 'anthropic' as const,
            model: 'claude-live',
            display_name: 'Declared duplicate',
            input_modalities: [],
            output_modalities: ['text'],
            supported_parameters: [],
        }
        const preferences: TalosMobileModelLabPreferences = {
            schema_version: 1,
            manual_models: [manual],
            model_overrides: {},
            provider_runtime: {},
            probe_results: {},
        }

        expect(manualModelToProviderModel(manual)).toMatchObject({
            id: 'claude-live',
            provider: 'anthropic',
            capabilityProvenance: 'declared',
        })
        const profiles = talosMobileModelProfiles(discovered, () => true, preferences)
        expect(profiles.filter((profile) => profile.id === 'anthropic:claude-live')).toHaveLength(1)
        expect(profiles.find((profile) => profile.id === 'anthropic:claude-live')?.display_name).toBe('Claude Live')
        expect(profiles.find((profile) => profile.id === 'anthropic:claude-live')?.capabilities)
            .toEqual(expect.objectContaining({ provenance: 'observed' }))
    })
})
