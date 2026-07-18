import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosModelProfile } from '../lib/talosTypes'
import { talosProviderById } from '../lib/talosProviders'

type ApiEnvelope<T> = {
    data: T
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
        deleteModelProfile,
        probeModelProfile,
        probeDraftModelProfile,
        findModelProfile,
    }
}
