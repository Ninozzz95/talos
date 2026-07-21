import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosModelCatalogFault, TalosModelProfile, TalosProviderModelCatalog } from '../lib/talosTypes'
import { talosProviderById } from '../lib/talosProviders'

type ApiEnvelope<T> = {
    data: T
}

export class TalosModelCatalogError extends Error {
    fault: TalosModelCatalogFault

    constructor(fault: TalosModelCatalogFault) {
        super(fault.message || 'TALOS could not load the provider model catalog.')
        this.name = 'TalosModelCatalogError'
        this.fault = fault
    }
}

export type DiscoverDraftModelCatalogPayload = {
    provider: TalosModelProfile['provider']
    base_url?: string | null
    secret?: string | null
}

function catalogFaultFromError(error: unknown, provider: string): TalosModelCatalogFault | null {
    const details = (error as { details?: unknown } | null)?.details
    const raw = details && typeof details === 'object' ? (details as { error?: unknown }).error : null

    if (!raw || typeof raw !== 'object' || typeof (raw as { code?: unknown }).code !== 'string') {
        return null
    }

    const fault = raw as Record<string, unknown>

    return {
        code: String(fault.code),
        message: typeof fault.message === 'string' && fault.message.trim()
            ? fault.message
            : 'TALOS could not load the provider model catalog.',
        retryable: fault.retryable === true,
        retry_after_seconds: typeof fault.retry_after_seconds === 'number' ? fault.retry_after_seconds : null,
        provider: typeof fault.provider === 'string' ? fault.provider : provider,
    }
}

const sharedModelProfiles = ref<TalosModelProfile[]>([])

export type CreateTalosModelProfilePayload = {
    provider: TalosModelProfile['provider']
    model?: string | null
    display_name?: string | null
    secret?: string | null
    base_url?: string | null
    timeout_seconds?: number | null
    capabilities?: Record<string, unknown> | null
    user_id?: number | null
}

export type UpdateTalosModelProfilePayload = Partial<Omit<CreateTalosModelProfilePayload, 'secret'>> & {
    secret?: string | null
}

export type TalosModelDraftProbeResult = {
    status: TalosModelProfile['status'] | string
    result: Record<string, unknown>
}

export function useTalosModelProfiles() {
    const modelProfiles = sharedModelProfiles
    const loadingModelProfiles = ref(false)
    const modelProfileError = ref<string | null>(null)

    const callableModelProfiles = computed(() => modelProfiles.value.filter((profile) => {
        const probeResult = profile.probe_result
        const probeSucceeded = probeResult?.ok === true

        return profile.status === 'healthy'
            && probeSucceeded
            && (!profileNeedsSecret(profile) || profile.has_secret)
    }))
    const usableModelProfiles = computed(() => callableModelProfiles.value)

    function profileNeedsSecret(profile: TalosModelProfile): boolean {
        return talosProviderById(profile.provider).requiresSecret
    }

    async function loadModelProfiles() {
        loadingModelProfiles.value = true
        modelProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelProfile[]>>('/api/talos/model-profiles')
            modelProfiles.value = response.data
            return response.data
        } catch (error) {
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not load model profiles.'
            throw error
        } finally {
            loadingModelProfiles.value = false
        }
    }

    function storeModelProfile(profile: TalosModelProfile) {
        modelProfiles.value = [
            profile,
            ...modelProfiles.value.filter((existing) => existing.id !== profile.id),
        ]

        return profile
    }

    async function createModelProfile(payload: CreateTalosModelProfilePayload) {
        modelProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelProfile>>('/api/talos/model-profiles', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not create this model profile.',
            })

            return storeModelProfile(response.data)
        } catch (error) {
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not create this model profile.'
            throw error
        }
    }

    async function createAndProbeModelProfile(payload: CreateTalosModelProfilePayload) {
        const created = await createModelProfile(payload)

        return probeModelProfile(created.id)
    }

    async function probeDraftModelProfile(payload: CreateTalosModelProfilePayload) {
        modelProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelDraftProbeResult>>('/api/talos/model-profiles/probe-draft', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not test this provider setup.',
            })

            return response.data
        } catch (error) {
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not test this provider setup.'
            throw error
        }
    }

    async function updateModelProfile(profileId: string, payload: UpdateTalosModelProfilePayload) {
        modelProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelProfile>>(`/api/talos/model-profiles/${profileId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not update this model profile.',
            })

            return storeModelProfile(response.data)
        } catch (error) {
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not update this model profile.'
            throw error
        }
    }

    async function setModelProfileComposerVisibility(profileId: string, showInComposer: boolean) {
        modelProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelProfile>>(`/api/talos/model-profiles/${profileId}`, {
                method: 'PATCH',
                body: JSON.stringify({ show_in_composer: showInComposer }),
                validationMessage: 'TALOS could not update composer visibility for this model profile.',
            })

            return storeModelProfile(response.data)
        } catch (error) {
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not update composer visibility.'
            throw error
        }
    }

    async function deleteModelProfile(profileId: string) {
        modelProfileError.value = null

        try {
            await talosFetch<void>(`/api/talos/model-profiles/${profileId}`, {
                method: 'DELETE',
            })

            modelProfiles.value = modelProfiles.value.filter((profile) => profile.id !== profileId)
        } catch (error) {
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not delete this model profile.'
            throw error
        }
    }

    async function updateAndProbeModelProfile(profileId: string, payload: UpdateTalosModelProfilePayload) {
        const updated = await updateModelProfile(profileId, payload)

        return probeModelProfile(updated.id)
    }

    async function discoverDraftModelCatalog(payload: DiscoverDraftModelCatalogPayload) {
        modelProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosProviderModelCatalog>>('/api/talos/model-profiles/discover-draft', {
                method: 'POST',
                body: JSON.stringify(payload),
                redirectOnAuthFailure: false,
                validationMessage: 'TALOS could not discover models for this provider.',
            })

            return response.data
        } catch (error) {
            const fault = catalogFaultFromError(error, payload.provider)
            if (fault) {
                throw new TalosModelCatalogError(fault)
            }
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not discover models for this provider.'
            throw error
        }
    }

    async function discoverModelCatalog(profileId: string) {
        modelProfileError.value = null
        const provider = findModelProfile(profileId)?.provider ?? 'openai'

        try {
            const response = await talosFetch<ApiEnvelope<TalosProviderModelCatalog>>(`/api/talos/model-profiles/${profileId}/models`, {
                method: 'GET',
                redirectOnAuthFailure: false,
            })

            return response.data
        } catch (error) {
            const fault = catalogFaultFromError(error, provider)
            if (fault) {
                throw new TalosModelCatalogError(fault)
            }
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not load this provider model catalog.'
            throw error
        }
    }

    async function probeModelProfile(profileId: string) {
        modelProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelProfile>>(`/api/talos/model-profiles/${profileId}/probe`, {
                method: 'POST',
            })

            return storeModelProfile(response.data)
        } catch (error) {
            modelProfileError.value = error instanceof Error ? error.message : 'TALOS could not probe this model profile.'
            throw error
        }
    }

    function findModelProfile(profileId: string | null | undefined) {
        if (!profileId) {
            return null
        }

        return modelProfiles.value.find((profile) => profile.id === profileId) ?? null
    }

    return {
        modelProfiles,
        usableModelProfiles,
        callableModelProfiles,
        loadingModelProfiles,
        modelProfileError,
        loadModelProfiles,
        createModelProfile,
        createAndProbeModelProfile,
        updateModelProfile,
        updateAndProbeModelProfile,
        setModelProfileComposerVisibility,
        deleteModelProfile,
        probeModelProfile,
        probeDraftModelProfile,
        discoverDraftModelCatalog,
        discoverModelCatalog,
        findModelProfile,
    }
}
