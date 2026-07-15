<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { BookMarked, RefreshCw, Save } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import TalosSkillRegistry from './TalosSkillRegistry.vue'
import { useTalosMemorySkills } from '../../../composables/useTalosMemorySkills'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'
import type { TalosMemory } from '../../../lib/talosTypes'

const {
    memories,
    memoryRetrievalContext,
    skills,
    skillPlanningContext,
    retrievedMemoryCount,
    loadingMemorySkills,
    memorySkillError,
    createMemory,
    updateMemoryStatus,
    refreshMemorySkills,
} = useTalosMemorySkills()

const form = reactive({
    title: '',
    content: '',
    kind: 'project_fact',
    scope_type: 'project',
    scope_id: 'avm',
})
const actionMessage = ref<string | null>(null)
const savingMemory = ref(false)
const disablingMemoryId = ref<string | null>(null)
const memorySkillsRequested = ref(false)
const memoryDisclosureState = computed(() => resolveTalosCollectionState({
    itemCount: memoryRetrievalContext.value?.memories.length ?? 0,
    loading: loadingMemorySkills.value,
    error: memorySkillError.value,
    requested: memorySkillsRequested.value,
}))

async function refresh() {
    memorySkillsRequested.value = true
    actionMessage.value = null
    await refreshMemorySkills()
}

async function submitMemory() {
    if (!form.title.trim() || !form.content.trim() || savingMemory.value) {
        return
    }

    savingMemory.value = true
    actionMessage.value = null

    try {
        await createMemory({
            scope_type: form.scope_type,
            scope_id: form.scope_id.trim() || null,
            kind: form.kind,
            title: form.title.trim(),
            content: form.content.trim(),
            status: 'active',
            metadata: { created_from: 'talos_dashboard' },
        })
        form.title = ''
        form.content = ''
        actionMessage.value = 'Memory saved as untrusted context.'
        await refreshMemorySkills()
    } finally {
        savingMemory.value = false
    }
}

async function disableMemory(memory: TalosMemory) {
    disablingMemoryId.value = memory.id
    actionMessage.value = null

    try {
        await updateMemoryStatus(memory.id, 'disabled')
        actionMessage.value = 'Memory disabled for future retrieval.'
        await refreshMemorySkills()
    } finally {
        disablingMemoryId.value = null
    }
}

onMounted(() => {
    refresh().catch(() => {})
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2">
                        <BookMarked class="h-4 w-4 text-[var(--talos-muted)]" />
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Memory & Skills</h3>
                        <TalosGuideInfoButton guide-id="brain.memory" compact side="bottom" />
                    </div>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Inspectable memories and skills. Used memory is disclosed and treated as untrusted context.
                    </p>
                </div>
                <Button size="icon" variant="ghost" :disabled="loadingMemorySkills" title="Refresh memory and skills" @click="refresh">
                    <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loadingMemorySkills }" />
                </Button>
            </div>
            <div v-if="memorySkillsRequested && (!memorySkillError || memories.length || skills.length)" class="mt-3 flex flex-wrap gap-2">
                <Badge tone="neutral">{{ memories.length }} memories</Badge>
                <Badge tone="warning">{{ retrievedMemoryCount }} used memory</Badge>
                <Badge tone="success">{{ skillPlanningContext?.skills.length ?? 0 }} approved skills</Badge>
            </div>
        </div>

        <div class="space-y-5 p-4">
            <div v-if="memorySkillError" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm leading-6 text-[var(--talos-text)]">
                {{ memorySkillError }}
            </div>
            <div v-if="actionMessage" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] p-3 text-sm leading-6 text-[var(--talos-text)]">
                {{ actionMessage }}
            </div>

            <div v-if="memoryDisclosureState === 'loading'" role="status" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm text-[var(--talos-muted)]">
                <RefreshCw class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading memory disclosure
            </div>

            <div v-if="memoryDisclosureState === 'ready' || memoryDisclosureState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
                <div class="text-sm font-semibold text-[var(--talos-text)]">Add memory</div>
                <div class="mt-3 grid gap-2">
                    <input v-model="form.title" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none" placeholder="Memory title" aria-label="Memory title">
                    <textarea v-model="form.content" class="min-h-20 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)] outline-none" placeholder="Memory content" aria-label="Memory content" />
                    <div class="grid gap-2 md:grid-cols-3">
                        <select v-model="form.kind" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)]">
                            <option value="preference">preference</option>
                            <option value="project_fact">project_fact</option>
                            <option value="procedure">procedure</option>
                            <option value="policy_note">policy_note</option>
                        </select>
                        <select v-model="form.scope_type" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)]">
                            <option value="global">global</option>
                            <option value="project">project</option>
                            <option value="session">session</option>
                        </select>
                        <input v-model="form.scope_id" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none" placeholder="scope id" aria-label="Memory scope id">
                    </div>
                    <Button size="sm" :disabled="!form.title.trim() || !form.content.trim() || savingMemory" @click="submitMemory">
                        <Save class="h-4 w-4" />
                        {{ savingMemory ? 'Saving' : 'Save memory' }}
                    </Button>
                </div>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <div class="text-sm font-semibold text-[var(--talos-text)]">Used memory disclosure</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">{{ memoryRetrievalContext?.instruction ?? 'No retrieval context loaded.' }}</div>
                    </div>
                    <Badge tone="warning">{{ memoryRetrievalContext?.trust_level ?? 'untrusted' }}</Badge>
                </div>
                <div class="mt-3 space-y-2">
                    <div v-for="memory in memoryRetrievalContext?.memories ?? []" :key="memory.id" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ memory.title }}</div>
                                <div class="mt-1 text-xs text-[var(--talos-muted)]">{{ memory.kind }} · {{ memory.scope_type }}{{ memory.scope_id ? `:${memory.scope_id}` : '' }}</div>
                            </div>
                            <Button size="sm" variant="ghost" :disabled="disablingMemoryId === memory.id" @click="disableMemory(memory)">Disable</Button>
                        </div>
                        <p class="mt-2 line-clamp-3 text-xs leading-5 text-[var(--talos-muted)]">{{ memory.content_preview }}</p>
                    </div>
                    <div v-if="memoryDisclosureState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-sm leading-6 text-[var(--talos-muted)]">
                        No active memories are retrieved for the current project scope.
                    </div>
                </div>
            </div>

            <TalosSkillRegistry
                :skills="skills"
                :planning-context="skillPlanningContext"
                :loading="loadingMemorySkills"
                :error="memorySkillError"
                :requested="memorySkillsRequested"
            />
        </div>
    </Surface>
</template>
