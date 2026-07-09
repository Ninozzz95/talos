import { ref } from 'vue'
import { talosFetch } from '../lib/api'

type ApiEnvelope<T> = {
    data: T
}

export type TalosWorkspaceSettings = {
    id: string
    default_model_profile_id?: string | null
    default_context_set_id?: string | null
    preferences: Record<string, unknown>
    created_at?: string | null
    updated_at?: string | null
}

export type UpdateTalosSettingsPayload = {
    default_model_profile_id?: string | null
    default_context_set_id?: string | null
    preferences?: Record<string, unknown>
}

function isSecretPreferenceKey(key: string) {
    const normalized = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
    const segments = normalized.split(/[^a-z0-9]+/).filter(Boolean)

    return normalized.includes('api_key')
        || normalized.includes('secret')
        || normalized.includes('password')
        || segments.includes('key')
        || segments.includes('credential')
        || segments.includes('credentials')
        || segments.includes('authorization')
        || segments.includes('bearer')
        || segments.includes('oauth')
        || normalized.endsWith('token')
        || normalized.endsWith('_token')
        || normalized.endsWith('-token')
}

function sanitizePreferences(preferences: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(preferences).flatMap(([key, value]) => {
        if (isSecretPreferenceKey(key)) {
            return []
        }

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return [[key, sanitizePreferences(value as Record<string, unknown>)]]
        }

        return [[key, value]]
    }))
}

export function useTalosSettings() {
    const settings = ref<TalosWorkspaceSettings | null>(null)
    const loadingSettings = ref(false)
    const savingSettings = ref(false)
    const settingsError = ref<string | null>(null)
    const settingsSavedMessage = ref('')

    async function loadSettings() {
        loadingSettings.value = true
        settingsError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosWorkspaceSettings>>('/api/talos/settings')
            settings.value = response.data
            return response.data
        } catch (error) {
            settingsError.value = error instanceof Error ? error.message : 'TALOS could not load workspace settings.'
            throw error
        } finally {
            loadingSettings.value = false
        }
    }

    async function updateSettings(payload: UpdateTalosSettingsPayload, message = 'Settings saved through /api/talos/settings.') {
        savingSettings.value = true
        settingsError.value = null
        settingsSavedMessage.value = ''

        const body: UpdateTalosSettingsPayload = {
            ...payload,
            preferences: payload.preferences ? sanitizePreferences(payload.preferences) : undefined,
        }

        try {
            const response = await talosFetch<ApiEnvelope<TalosWorkspaceSettings>>('/api/talos/settings', {
                method: 'PATCH',
                body: JSON.stringify(body),
                validationMessage: 'TALOS rejected these workspace settings.',
            })

            settings.value = response.data
            settingsSavedMessage.value = message
            window.setTimeout(() => {
                if (settingsSavedMessage.value === message) {
                    settingsSavedMessage.value = ''
                }
            }, 15000)
            return response.data
        } catch (error) {
            settingsError.value = error instanceof Error ? error.message : 'TALOS could not save workspace settings.'
            throw error
        } finally {
            savingSettings.value = false
        }
    }

    return {
        settings,
        loadingSettings,
        savingSettings,
        settingsError,
        settingsSavedMessage,
        loadSettings,
        updateSettings,
    }
}
