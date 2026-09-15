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

/**
 * Le famiglie che il ragionamento ce l'hanno, quando il catalogo tace.
 *
 * MISURATO 2026-08-04 dall'owner: «ChatGPT da chiave OpenAI, non OpenRouter, non
 * ha lo switch dell'effort nella pillola del modello». Lo stesso modello, due
 * strade, due comandi diversi — e chi usa TALOS non ha modo di sapere che
 * dipende da come ha inserito la chiave: vede solo un comando che a volte c'e' e
 * a volte no.
 *
 * La causa: `GET /v1/models` di OpenAI **non dichiara** i parametri che accetta.
 * OpenRouter si', ed e' per questo che di la' funzionava. E' la stessa lezione
 * gia' pagata su `/v1/responses`: l'API di OpenAI dice meno di quanto sa, e
 * quello che non dice va dedotto o misurato, non aspettato.
 *
 * Si deduce dalla FAMIGLIA, non dal nome intero: `gpt-5.6-terra` e
 * `gpt-5.6-luna` sono lo stesso motore con due tarature, e un elenco di nomi
 * completi invecchierebbe al primo modello nuovo — che in un'app distribuita
 * vuol dire invecchiare nell'APK di chi l'ha gia' installata.
 */
const REASONING_FAMILIES = [/^gpt-5/i, /^o[1-4](?:[-.]|$)/i]

function supportsReasoning(model: TalosMobileProviderModel): boolean {
    if (model.supportedParameters.some((parameter) => REASONING_PARAMETERS.has(parameter))) {
        return true
    }
    /*
     * La deduzione vale SOLO dove il catalogo tace.
     *
     * Un provider che dichiara i suoi parametri sa cosa accetta meglio di noi:
     * se ha parlato e non ha nominato il ragionamento, e' un no, non un
     * silenzio. Dedurre anche li' vorrebbe dire offrire un comando che il
     * server rifiutera' — e un comando che non governa niente e' peggio di uno
     * assente.
     */
    if (model.supportedParameters.length > 0) return false
    return REASONING_FAMILIES.some((famiglia) => famiglia.test(model.id))
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
