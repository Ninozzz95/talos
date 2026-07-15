import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosCookbookCommandPreview,
    TalosCookbookCreateModelPayload,
    TalosCookbookDependencyCatalog,
    TalosCookbookDependencyPolicy,
    TalosCookbookDependencyPreview,
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
    const dependencyCatalog = ref<TalosCookbookDependencyCatalog | null>(null)
    const dependencyPreview = ref<TalosCookbookDependencyPreview | null>(null)
    const dependencyPolicy = ref<TalosCookbookDependencyPolicy | null>(null)
    const pendingRequests = ref(0)
    const loading = computed(() => pendingRequests.value > 0)
    const actionMessage = ref<string | null>(null)
    const errorMessageRef = ref<string | null>(null)

    function clearMessages() {
        actionMessage.value = null
        errorMessageRef.value = null
    }

    function beginRequest() {
        pendingRequests.value += 1
        clearMessages()
    }

    function finishRequest() {
        pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    }

    async function loadOverview() {
        beginRequest()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookOverview>>('/api/talos/cookbook/overview')
            overview.value = response.data
            models.value = response.data.models
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not load the Cookbook overview.')
            return null
        } finally {
            finishRequest()
        }
    }

    async function scanHardware() {
        beginRequest()

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
            finishRequest()
        }
    }

    async function loadModels() {
        beginRequest()

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
            finishRequest()
        }
    }

    async function createModel(payload: TalosCookbookCreateModelPayload) {
        beginRequest()

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
            finishRequest()
        }
    }

    async function previewDownload(payload: TalosCookbookPreviewRequest) {
        beginRequest()

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
            finishRequest()
        }
    }

    async function previewServe(payload: TalosCookbookPreviewRequest) {
        beginRequest()

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
            finishRequest()
        }
    }

    async function loadDependencies() {
        beginRequest()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookDependencyCatalog>>('/api/talos/cookbook/dependencies')
            dependencyCatalog.value = response.data
            dependencyPolicy.value = response.data.policy
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not load Cookbook dependency catalog.')
            return null
        } finally {
            finishRequest()
        }
    }

    async function previewDependencyPlan(payload: TalosCookbookPreviewRequest) {
        beginRequest()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookDependencyPreview>>('/api/talos/cookbook/dependencies/preview', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not preview this dependency plan.',
            })
            dependencyPreview.value = response.data
            actionMessage.value = 'Dependency plan preview generated.'
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not preview this dependency plan.')
            return null
        } finally {
            finishRequest()
        }
    }

    async function loadCookbookPolicy() {
        beginRequest()

        try {
            const response = await talosFetch<ApiEnvelope<TalosCookbookDependencyPolicy>>('/api/talos/cookbook/policy')
            dependencyPolicy.value = response.data
            return response.data
        } catch (error) {
            errorMessageRef.value = errorMessage(error, 'TALOS could not load Cookbook policy.')
            return null
        } finally {
            finishRequest()
        }
    }

    return {
        overview,
        models,
        dependencyCatalog,
        dependencyPreview,
        dependencyPolicy,
        loading,
        actionMessage,
        errorMessage: errorMessageRef,
        loadOverview,
        scanHardware,
        loadModels,
        createModel,
        previewDownload,
        previewServe,
        loadDependencies,
        previewDependencyPlan,
        loadCookbookPolicy,
    }
}
