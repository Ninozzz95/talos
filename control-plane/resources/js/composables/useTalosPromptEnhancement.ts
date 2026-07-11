import { ref } from 'vue'
import { talosFetch } from '../lib/api'

type ApiEnvelope<T> = {
    data: T
}

export type TalosPromptEnhancementPayload = {
    prompt: string
    model_profile_id?: string | null
    session_id?: string | null
    api_key?: never
    secret?: never
    encrypted_secret?: never
}

export type TalosPromptEnhancementResult = {
    model_profile_id: string
    provider: string
    model: string
    enhancement_mode: 'model'
    original_prompt: string
    enhanced_prompt: string
    summary: string
    applied_principles: string[]
}

export function useTalosPromptEnhancement() {
    const loading = ref(false)
    const error = ref<string | null>(null)
    const result = ref<TalosPromptEnhancementResult | null>(null)

    async function enhancePrompt(payload: TalosPromptEnhancementPayload) {
        loading.value = true
        error.value = null
        result.value = null

        const requestPayload: TalosPromptEnhancementPayload = {
            prompt: payload.prompt,
        }

        if (payload.model_profile_id) {
            requestPayload.model_profile_id = payload.model_profile_id
        }

        if (payload.session_id) {
            requestPayload.session_id = payload.session_id
        }

        try {
            const response = await talosFetch<ApiEnvelope<TalosPromptEnhancementResult>>('/api/talos/prompts/enhance', {
                method: 'POST',
                body: JSON.stringify(requestPayload),
                validationMessage: 'TALOS could not enhance this prompt.',
            })

            result.value = response.data
            return response.data
        } catch (caught) {
            error.value = caught instanceof Error ? caught.message : 'TALOS could not enhance this prompt.'
            throw caught
        } finally {
            loading.value = false
        }
    }

    function clearPromptEnhancement() {
        loading.value = false
        error.value = null
        result.value = null
    }

    return {
        loading,
        error,
        result,
        enhancePrompt,
        clearPromptEnhancement,
    }
}
