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

    it('RAG-OBB-03 takes effort levels and the mandate from the OpenRouter reasoning object', () => {
        const profiles = talosMobileModelProfiles([
            {
                id: 'z-ai/glm-5.3-flash', provider: 'openrouter', displayName: 'GLM 5.3 Flash', chatCompatibility: 'supported',
                inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['reasoning', 'tools'],
                reasoning: { mandatory: true, supportedEfforts: ['max', 'high', 'low'] },
            },
            {
                id: 'openai/gpt-5.5', provider: 'openrouter', displayName: 'GPT-5.5', chatCompatibility: 'supported',
                inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['reasoning'],
                reasoning: { mandatory: false, supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'] },
            },
        ], () => true)
        expect(profiles[0]).toMatchObject({ effort_levels: ['max', 'high', 'low'], reasoning_mandatory: true, supports_thinking: true })
        expect(profiles[1]).toMatchObject({ effort_levels: ['xhigh', 'high', 'medium', 'low'], reasoning_mandatory: false })
        expect(talosMobileModelProfiles(discovered, () => true)[1]).toMatchObject({
            effort_levels: ['low', 'medium', 'high'], reasoning_mandatory: false,
        })
    })

    /*
     * RAG-EST (24/09/2026, owner «nasconderlo dove non conta»): «Ragionamento esteso» (`input.thinking`) lo leggono solo
     * gli adattatori Anthropic, Gemini, Ollama e locale; OpenRouter, OpenAI, DeepSeek e i compatibili lo ignorano, e lì
     * governa solo la barra dell'impegno. L'etichetta «Ragiona» del catalogo (`supports_thinking`) resta com'è.
     */
    it('RAG-EST-01 l’interruttore «Ragionamento esteso» solo dove il fornitore lo legge', () => {
        const profili = talosMobileModelProfiles([
            ...discovered,
            {
                id: 'deepseek-reasoner', provider: 'deepseek', displayName: 'DeepSeek Reasoner', chatCompatibility: 'supported',
                inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['reasoning_effort'],
            },
            {
                id: 'qwen3', provider: 'ollama', displayName: 'Qwen 3', chatCompatibility: 'supported',
                inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['think'],
            },
        ], () => true)
        const per = (id: string) => profili.find((profilo) => profilo.id === id)!
        expect(per('anthropic:claude-live')).toMatchObject({ supports_thinking: true, thinking_toggle: true })
        expect(per('ollama:qwen3')).toMatchObject({ supports_thinking: true, thinking_toggle: true })
        expect(per('openrouter:vendor/reasoning')).toMatchObject({ supports_thinking: true, thinking_toggle: false })
        expect(per('deepseek:deepseek-reasoner')).toMatchObject({ supports_thinking: true, thinking_toggle: false })
        expect(per('openrouter:vendor/image')).toMatchObject({ thinking_toggle: false })
    })
})
