import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosModelRoutingLane, TalosModelRoutingProfile } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type CreateTalosModelRoutingProfilePayload = {
    name: string
    task_type?: TalosModelRoutingProfile['task_type']
    status?: TalosModelRoutingProfile['status']
    lanes: Array<Pick<TalosModelRoutingLane, 'model_profile_id' | 'role' | 'weight'>>
    metadata?: Record<string, unknown> | null
}

export type UpdateTalosModelRoutingProfilePayload = Partial<CreateTalosModelRoutingProfilePayload>

export function useTalosModelRoutingProfiles() {
    const modelRoutingProfiles = ref<TalosModelRoutingProfile[]>([])
    const loadingModelRoutingProfiles = ref(false)
    const modelRoutingProfileError = ref<string | null>(null)

    const usableModelRoutingProfiles = computed(() => modelRoutingProfiles.value.filter((profile) => {
        return profile.status === 'enabled' && profile.lanes.length > 0
    }))

    async function loadModelRoutingProfiles() {
        loadingModelRoutingProfiles.value = true
        modelRoutingProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelRoutingProfile[]>>('/api/talos/model-routing-profiles')
            modelRoutingProfiles.value = response.data
            return response.data
        } catch (error) {
            modelRoutingProfileError.value = error instanceof Error ? error.message : 'TALOS could not load model routing profiles.'
            throw error
        } finally {
            loadingModelRoutingProfiles.value = false
        }
    }

    function storeModelRoutingProfile(profile: TalosModelRoutingProfile) {
        modelRoutingProfiles.value = [
            profile,
            ...modelRoutingProfiles.value.filter((existing) => existing.id !== profile.id),
        ]

        return profile
    }

    async function createModelRoutingProfile(payload: CreateTalosModelRoutingProfilePayload) {
        modelRoutingProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelRoutingProfile>>('/api/talos/model-routing-profiles', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not create this model routing profile.',
            })

            return storeModelRoutingProfile(response.data)
        } catch (error) {
            modelRoutingProfileError.value = error instanceof Error ? error.message : 'TALOS could not create this model routing profile.'
            throw error
        }
    }

    async function updateModelRoutingProfile(profileId: string, payload: UpdateTalosModelRoutingProfilePayload) {
        modelRoutingProfileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelRoutingProfile>>(`/api/talos/model-routing-profiles/${profileId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not update this model routing profile.',
            })

            return storeModelRoutingProfile(response.data)
        } catch (error) {
            modelRoutingProfileError.value = error instanceof Error ? error.message : 'TALOS could not update this model routing profile.'
            throw error
        }
    }

    async function deleteModelRoutingProfile(profileId: string) {
        modelRoutingProfileError.value = null

        try {
            await talosFetch<void>(`/api/talos/model-routing-profiles/${profileId}`, {
                method: 'DELETE',
            })

            modelRoutingProfiles.value = modelRoutingProfiles.value.filter((profile) => profile.id !== profileId)
        } catch (error) {
            modelRoutingProfileError.value = error instanceof Error ? error.message : 'TALOS could not delete this model routing profile.'
            throw error
        }
    }

    function findModelRoutingProfile(profileId: string | null | undefined) {
        if (!profileId) {
            return null
        }

        return modelRoutingProfiles.value.find((profile) => profile.id === profileId) ?? null
    }

    return {
        modelRoutingProfiles,
        usableModelRoutingProfiles,
        loadingModelRoutingProfiles,
        modelRoutingProfileError,
        loadModelRoutingProfiles,
        createModelRoutingProfile,
        updateModelRoutingProfile,
        deleteModelRoutingProfile,
        findModelRoutingProfile,
    }
}
