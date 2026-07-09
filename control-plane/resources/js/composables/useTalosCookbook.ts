import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosCookbookCommandPreview,
    TalosCookbookCreateModelPayload,
    TalosCookbookModel,
    TalosCookbookOverview,
    TalosCookbookPreviewRequest,
    TalosCookbookScanResponse,
} from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export function useTalosCookbook() {
    const overview = ref<TalosCookbookOverview | null>(null)
    const models = ref<TalosCookbookModel[]>([])
    const loading = ref(false)
    const actionMessage = ref<string | null>(null)
    const errorMessageRef = ref<string | null>(null)

    function clearMessages() {
        actionMessage.value = null
        errorMessageRef.value = null
    }

    async function loadOverview() {
        loading.value = true
        clearMessages()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookOverview>>('/api/talos/cookbook/overview')
            overview.value = response.data
            models.value = response.data.models
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not load the Cookbook overview.')
            return null
        } finally {
            loading.value = false
        }
    }

    async function scanHardware() {
        loading.value = true
        clearMessages()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookScanResponse>>('/api/talos/cookbook/hardware-scan', {
                method: 'POST',
                validationMessage: 'TALOS could not complete the hardware scan.',
            })
            overview.value = {
                profile: response.data.profile,
                runtimes: response.data.runtimes,
                models: overview.value?.models ?? models.value,
            }
            actionMessage.value = 'Hardware scan updated local evidence.'
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not complete the hardware scan.')
            return null
        } finally {
            loading.value = false
        }
    }

    async function loadModels() {
        loading.value = true
        clearMessages()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookModel[]>>('/api/talos/cookbook/models')
            models.value = response.data

            if (overview.value) {
                overview.value = {
                    ...overview.value,
                    models: response.data,
                }
            }

            actionMessage.value = 'Model catalog refreshed.'
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not load Cookbook models.')
            return []
        } finally {
            loading.value = false
        }
    }

    async function createModel(payload: TalosCookbookCreateModelPayload) {
        loading.value = true
        clearMessages()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookModel>>('/api/talos/cookbook/models', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not add this Cookbook model.',
            })
            models.value = [
                response.data,
                ...models.value.filter((model) => model.id !== response.data.id),
            ]

            if (overview.value) {
                overview.value = {
                    ...overview.value,
                    models: models.value,
                }
            }

            actionMessage.value = 'Cookbook model added.'
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not add this Cookbook model.')
            return null
        } finally {
            loading.value = false
        }
    }

    async function previewDownload(payload: TalosCookbookPreviewRequest) {
        loading.value = true
        clearMessages()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookCommandPreview>>('/api/talos/cookbook/download-preview', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not preview this download command.',
            })
            actionMessage.value = 'Command preview generated.'
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not preview this download command.')
            return null
        } finally {
            loading.value = false
        }
    }

    async function previewServe(payload: TalosCookbookPreviewRequest) {
        loading.value = true
        clearMessages()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookCommandPreview>>('/api/talos/cookbook/serve-preview', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not preview this serve command.',
            })
            actionMessage.value = 'Command preview generated.'
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not preview this serve command.')
            return null
        } finally {
            loading.value = false
        }
    }

    return {
        overview,
        models,
        loading,
        actionMessage,
        errorMessage: errorMessageRef,
        loadOverview,
        scanHardware,
        loadModels,
        createModel,
        previewDownload,
        previewServe,
    }
}
