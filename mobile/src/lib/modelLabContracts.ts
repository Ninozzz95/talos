import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'

export interface TalosMobileManualModel {
    id: string
    provider: TalosMobileProviderId
    model: string
    display_name: string
    input_modalities: string[]
    output_modalities: string[]
    supported_parameters: string[]
}

export interface TalosMobileModelOverride {
    display_name?: string
    show_in_composer?: boolean
}

export interface TalosMobileProviderRuntimeOptions {
    timeout_seconds: number
}

export interface TalosMobileModelProbeRecord {
    profile_id: string
    provider: TalosMobileProviderId
    model: string
    ok: boolean
    checked_at: string
    latency_ms: number
    message: string
}

export interface TalosMobileModelLabPreferences {
    schema_version: 1
    manual_models: TalosMobileManualModel[]
    model_overrides: Record<string, TalosMobileModelOverride>
    provider_runtime: Partial<Record<TalosMobileProviderId, TalosMobileProviderRuntimeOptions>>
    probe_results: Record<string, TalosMobileModelProbeRecord>
}

export const TALOS_DEFAULT_MODEL_LAB_PREFERENCES: TalosMobileModelLabPreferences = Object.freeze({
    schema_version: 1,
    manual_models: Object.freeze([]) as unknown as TalosMobileManualModel[],
    model_overrides: Object.freeze({}),
    provider_runtime: Object.freeze({}),
    probe_results: Object.freeze({}),
})

const PROVIDERS = new Set<TalosMobileProviderId>([
    'anthropic',
    'deepseek',
    'gemini',
    'ollama',
    'openai',
    'openrouter',
])

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[] = [],
): boolean {
    const keys = Object.keys(value)
    const allowed = new Set([...required, ...optional])
    return required.every((key) => Object.hasOwn(value, key))
        && keys.every((key) => allowed.has(key))
}

function boundedString(value: unknown, maximum: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum
}

function providerId(value: unknown): value is TalosMobileProviderId {
    return typeof value === 'string' && PROVIDERS.has(value as TalosMobileProviderId)
}

function stringList(value: unknown, maximumItems: number, maximumLength: number): value is string[] {
    return Array.isArray(value)
        && value.length <= maximumItems
        && value.every((item) => boundedString(item, maximumLength))
        && new Set(value).size === value.length
}

function parseManualModel(value: unknown): TalosMobileManualModel | null {
    if (!isRecord(value) || !hasExactKeys(value, [
        'id',
        'provider',
        'model',
        'display_name',
        'input_modalities',
        'output_modalities',
        'supported_parameters',
    ])) return null
    if (
        !boundedString(value.id, 128)
        || !providerId(value.provider)
        || !boundedString(value.model, 512)
        || !boundedString(value.display_name, 255)
        || !stringList(value.input_modalities, 16, 64)
        || !stringList(value.output_modalities, 16, 64)
        || !stringList(value.supported_parameters, 64, 96)
    ) return null
    return {
        id: value.id,
        provider: value.provider,
        model: value.model,
        display_name: value.display_name,
        input_modalities: [...value.input_modalities],
        output_modalities: [...value.output_modalities],
        supported_parameters: [...value.supported_parameters],
    }
}

function parseOverrides(value: unknown): Record<string, TalosMobileModelOverride> | null {
    if (!isRecord(value) || Object.keys(value).length > 500) return null
    const result: Record<string, TalosMobileModelOverride> = {}
    for (const [profileId, candidate] of Object.entries(value)) {
        if (!boundedString(profileId, 512) || !isRecord(candidate)) return null
        if (!hasExactKeys(candidate, [], ['display_name', 'show_in_composer'])) return null
        if (Object.keys(candidate).length === 0) return null
        if (candidate.display_name !== undefined && !boundedString(candidate.display_name, 255)) return null
        if (candidate.show_in_composer !== undefined && typeof candidate.show_in_composer !== 'boolean') return null
        result[profileId] = {
            ...(candidate.display_name !== undefined ? { display_name: candidate.display_name } : {}),
            ...(candidate.show_in_composer !== undefined ? { show_in_composer: candidate.show_in_composer } : {}),
        }
    }
    return result
}

function parseProviderRuntime(
    value: unknown,
): Partial<Record<TalosMobileProviderId, TalosMobileProviderRuntimeOptions>> | null {
    if (!isRecord(value) || Object.keys(value).length > PROVIDERS.size) return null
    const result: Partial<Record<TalosMobileProviderId, TalosMobileProviderRuntimeOptions>> = {}
    for (const [provider, candidate] of Object.entries(value)) {
        if (!providerId(provider) || !isRecord(candidate) || !hasExactKeys(candidate, ['timeout_seconds'])) return null
        if (
            typeof candidate.timeout_seconds !== 'number'
            || !Number.isInteger(candidate.timeout_seconds)
            || candidate.timeout_seconds < 5
            || candidate.timeout_seconds > 300
        ) return null
        result[provider] = { timeout_seconds: candidate.timeout_seconds }
    }
    return result
}

function parseProbeResults(value: unknown): Record<string, TalosMobileModelProbeRecord> | null {
    if (!isRecord(value) || Object.keys(value).length > 500) return null
    const result: Record<string, TalosMobileModelProbeRecord> = {}
    for (const [profileId, candidate] of Object.entries(value)) {
        if (!boundedString(profileId, 512) || !isRecord(candidate) || !hasExactKeys(candidate, [
            'profile_id',
            'provider',
            'model',
            'ok',
            'checked_at',
            'latency_ms',
            'message',
        ])) return null
        if (
            candidate.profile_id !== profileId
            || !providerId(candidate.provider)
            || !boundedString(candidate.model, 512)
            || typeof candidate.ok !== 'boolean'
            || !boundedString(candidate.checked_at, 64)
            || !Number.isFinite(Date.parse(candidate.checked_at))
            || typeof candidate.latency_ms !== 'number'
            || !Number.isInteger(candidate.latency_ms)
            || candidate.latency_ms < 0
            || candidate.latency_ms > 300_000
            || !boundedString(candidate.message, 500)
        ) return null
        result[profileId] = {
            profile_id: profileId,
            provider: candidate.provider,
            model: candidate.model,
            ok: candidate.ok,
            checked_at: candidate.checked_at,
            latency_ms: candidate.latency_ms,
            message: candidate.message,
        }
    }
    return result
}

export function parseTalosMobileModelLabPreferences(value: unknown): TalosMobileModelLabPreferences {
    if (!isRecord(value) || !hasExactKeys(value, [
        'schema_version',
        'manual_models',
        'model_overrides',
        'provider_runtime',
        'probe_results',
    ]) || value.schema_version !== 1 || !Array.isArray(value.manual_models) || value.manual_models.length > 100) {
        return TALOS_DEFAULT_MODEL_LAB_PREFERENCES
    }

    const manualModels = value.manual_models.map(parseManualModel)
    const overrides = parseOverrides(value.model_overrides)
    const providerRuntime = parseProviderRuntime(value.provider_runtime)
    const probeResults = parseProbeResults(value.probe_results)
    if (
        manualModels.some((model) => model === null)
        || new Set(manualModels.map((model) => model!.id)).size !== manualModels.length
        || !overrides
        || !providerRuntime
        || !probeResults
    ) return TALOS_DEFAULT_MODEL_LAB_PREFERENCES

    return {
        schema_version: 1,
        manual_models: manualModels as TalosMobileManualModel[],
        model_overrides: overrides,
        provider_runtime: providerRuntime,
        probe_results: probeResults,
    }
}
