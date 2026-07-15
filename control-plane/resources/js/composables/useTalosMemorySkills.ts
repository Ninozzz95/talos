import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosMemory,
    TalosMemoryRetrievalContext,
    TalosSkill,
    TalosSkillPlanningContext,
} from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type CreateTalosMemoryPayload = {
    scope_type: string
    scope_id?: string | null
    kind: string
    title: string
    content: string
    status?: string
    source?: string | null
    metadata?: Record<string, unknown> | null
}

export function useTalosMemorySkills() {
    const memories = ref<TalosMemory[]>([])
    const memoryRetrievalContext = ref<TalosMemoryRetrievalContext | null>(null)
    const skills = ref<TalosSkill[]>([])
    const skillPlanningContext = ref<TalosSkillPlanningContext | null>(null)
    const pendingMemorySkillRequests = ref(0)
    const loadingMemorySkills = computed(() => pendingMemorySkillRequests.value > 0)
    const memorySkillError = ref<string | null>(null)

    const approvedSkillCount = computed(() => skillPlanningContext.value?.skills.length ?? 0)
    const retrievedMemoryCount = computed(() => memoryRetrievalContext.value?.memories.length ?? 0)

    async function trackMemorySkillRequest<T>(request: () => Promise<T>) {
        pendingMemorySkillRequests.value += 1
        try {
            return await request()
        } finally {
            pendingMemorySkillRequests.value = Math.max(0, pendingMemorySkillRequests.value - 1)
        }
    }

    async function loadMemories(includeInactive = true) {
        memorySkillError.value = null

        try {
            return await trackMemorySkillRequest(async () => {
                const response = await talosFetch<ApiEnvelope<TalosMemory[]>>(`/api/talos/memories${includeInactive ? '?include_inactive=1' : ''}`)
                memories.value = response.data
                return response.data
            })
        } catch (error) {
            memorySkillError.value = error instanceof Error ? error.message : 'TALOS could not load memories.'
            throw error
        }
    }

    async function createMemory(payload: CreateTalosMemoryPayload) {
        memorySkillError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosMemory>>('/api/talos/memories', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS could not create this memory.',
            })
            memories.value = [response.data, ...memories.value.filter((memory) => memory.id !== response.data.id)]
            return response.data
        } catch (error) {
            memorySkillError.value = error instanceof Error ? error.message : 'TALOS could not create this memory.'
            throw error
        }
    }

    async function updateMemoryStatus(memoryId: string, status: string) {
        const response = await talosFetch<ApiEnvelope<TalosMemory>>(`/api/talos/memories/${memoryId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
            validationMessage: 'TALOS could not update this memory.',
        })
        memories.value = memories.value.map((memory) => memory.id === memoryId ? response.data : memory)
        return response.data
    }

    async function loadMemoryRetrievalContext(scopeType = 'project', scopeId = 'avm') {
        memorySkillError.value = null

        try {
            return await trackMemorySkillRequest(async () => {
                const params = new URLSearchParams({ scope_type: scopeType })
                if (scopeId) {
                    params.set('scope_id', scopeId)
                }
                const response = await talosFetch<ApiEnvelope<TalosMemoryRetrievalContext>>(`/api/talos/memories/retrieval-context?${params}`)
                memoryRetrievalContext.value = response.data
                return response.data
            })
        } catch (error) {
            memorySkillError.value = error instanceof Error ? error.message : 'TALOS could not load memory retrieval context.'
            throw error
        }
    }

    async function loadSkills(includeDisabled = true) {
        memorySkillError.value = null

        try {
            return await trackMemorySkillRequest(async () => {
                const response = await talosFetch<ApiEnvelope<TalosSkill[]>>(`/api/talos/skills${includeDisabled ? '?include_disabled=1' : ''}`)
                skills.value = response.data
                return response.data
            })
        } catch (error) {
            memorySkillError.value = error instanceof Error ? error.message : 'TALOS could not load skills.'
            throw error
        }
    }

    async function loadSkillPlanningContext() {
        memorySkillError.value = null

        try {
            return await trackMemorySkillRequest(async () => {
                const response = await talosFetch<ApiEnvelope<TalosSkillPlanningContext>>('/api/talos/skills/planning-context')
                skillPlanningContext.value = response.data
                return response.data
            })
        } catch (error) {
            memorySkillError.value = error instanceof Error ? error.message : 'TALOS could not load skill planning context.'
            throw error
        }
    }

    async function refreshMemorySkills() {
        const [loadedMemories, loadedMemoryContext, loadedSkills, loadedSkillContext] = await Promise.all([
            loadMemories(true),
            loadMemoryRetrievalContext(),
            loadSkills(true),
            loadSkillPlanningContext(),
        ])

        return {
            memories: loadedMemories,
            memoryRetrievalContext: loadedMemoryContext,
            skills: loadedSkills,
            skillPlanningContext: loadedSkillContext,
        }
    }

    return {
        memories,
        memoryRetrievalContext,
        skills,
        skillPlanningContext,
        approvedSkillCount,
        retrievedMemoryCount,
        loadingMemorySkills,
        memorySkillError,
        loadMemories,
        createMemory,
        updateMemoryStatus,
        loadMemoryRetrievalContext,
        loadSkills,
        loadSkillPlanningContext,
        refreshMemorySkills,
    }
}
