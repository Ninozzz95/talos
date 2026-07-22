import type {
    TalosMobileModelProfileView,
    TalosMobileProviderId,
} from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import {
    TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
    type TalosMobileManualModel,
    type TalosMobileModelLabPreferences,
} from '@/lib/modelLabContracts'

const REASONING_PARAMETERS = new Set(['reasoning', 'reasoning_effort', 'thinking', 'think'])
const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high'])

function supportsReasoning(model: TalosMobileProviderModel): boolean {
    return model.supportedParameters.some((parameter) => REASONING_PARAMETERS.has(parameter))
}

export function manualModelToProviderModel(model: TalosMobileManualModel): TalosMobileProviderModel {
    return {
        id: model.model,
        provider: model.provider,
        displayName: model.display_name,
        chatCompatibility: 'unknown',
        inputModalities: [...model.input_modalities],
        outputModalities: [...model.output_modalities],
        supportedParameters: [...model.supported_parameters],
        capabilityProvenance: 'declared',
    }
}

export function talosMobileModelProfiles(
    models: readonly TalosMobileProviderModel[],
    hasSecret: (provider: TalosMobileProviderId) => boolean,
    preferences: TalosMobileModelLabPreferences = TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
): TalosMobileModelProfileView[] {
    const merged: TalosMobileProviderModel[] = models.map((model) => ({
        ...model,
        capabilityProvenance: model.capabilityProvenance ?? 'observed',
    }))
    const observed = new Set(merged.map((model) => `${model.provider}:${model.id}`))
    for (const manual of preferences.manual_models) {
        const profileId = `${manual.provider}:${manual.model}`
        if (observed.has(profileId)) continue
        observed.add(profileId)
        merged.push(manualModelToProviderModel(manual))
    }

    return merged.map((model) => {
        const reasoning = supportsReasoning(model)
        const unsupported = model.chatCompatibility === 'unsupported'
        const profileId = `${model.provider}:${model.id}`
        const override = preferences.model_overrides[profileId]
        const probe = preferences.probe_results[profileId]
        const matchingProbe = probe?.provider === model.provider && probe.model === model.id ? probe : null
        return {
            id: profileId,
            provider: model.provider,
            model: model.id,
            display_name: override?.display_name ?? model.displayName,
            status: unsupported
                ? 'disabled'
                : matchingProbe
                    ? (matchingProbe.ok ? 'healthy' : 'failed')
                    : 'untested',
            has_secret: hasSecret(model.provider),
            effort_levels: reasoning ? [...EFFORT_LEVELS] : [],
            supports_thinking: reasoning,
            show_in_composer: override?.show_in_composer ?? !unsupported,
            capabilities: {
                provenance: model.capabilityProvenance ?? 'observed',
                chat_compatibility: model.chatCompatibility,
                context_length: model.contextLength ?? null,
                max_output_tokens: model.maxOutputTokens ?? null,
                input_modalities: [...model.inputModalities],
                output_modalities: [...model.outputModalities],
                supported_parameters: [...model.supportedParameters],
            },
            probe_ok: matchingProbe?.ok ?? null,
        }
    })
}
