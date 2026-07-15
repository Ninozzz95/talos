<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BrainCircuit } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import TalosSkillAudit from './TalosSkillAudit.vue'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'
import type { TalosSkill, TalosSkillPlanningContext } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    skills: TalosSkill[]
    planningContext: TalosSkillPlanningContext | null
    loading?: boolean
    error?: string | null
    requested?: boolean
}>(), {
    loading: false,
    error: null,
    requested: true,
})

const selectedSkillId = ref<string | null>(null)
const planningSkillNames = computed(() => new Set(props.planningContext?.skills.map((skill) => skill.name) ?? []))
const excludedReasonByName = computed(() => new Map((props.planningContext?.excluded_skills ?? []).map((skill) => [skill.name, skill.reason])))
const selectedSkill = computed(() => props.skills.find((skill) => skill.id === selectedSkillId.value) ?? props.skills[0] ?? null)
const skillsState = computed(() => resolveTalosCollectionState({
    itemCount: props.skills.length,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))
const selectedSkillExclusionReason = computed(() => {
    if (!selectedSkill.value) {
        return null
    }

    return excludedReasonByName.value.get(selectedSkill.value.name) ?? null
})

function selectSkill(skill: TalosSkill) {
    selectedSkillId.value = skill.id
}

watch(() => props.skills, (skills) => {
    if (selectedSkillId.value && skills.some((skill) => skill.id === selectedSkillId.value)) {
        return
    }

    selectedSkillId.value = skills[0]?.id ?? null
}, { immediate: true })
</script>

<template>
    <div class="space-y-4">
        <div class="flex items-center gap-2">
            <BrainCircuit class="h-4 w-4 text-[var(--talos-muted)]" />
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">Skill Registry</h3>
            <TalosGuideInfoButton guide-id="brain.skills" compact side="bottom" />
            <Badge tone="neutral">{{ skills.length }} skills</Badge>
            <Badge tone="success">{{ planningContext?.skills.length ?? 0 }} planning</Badge>
        </div>

        <div v-if="skillsState === 'loading'" role="status" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm leading-6 text-[var(--talos-muted)]">
            Loading skills
        </div>

        <div v-else-if="skillsState === 'ready'" class="grid gap-3">
            <button
                v-for="skill in skills"
                :key="skill.id"
                type="button"
                class="rounded-md border px-3 py-3 text-left transition"
                :class="selectedSkill?.id === skill.id
                    ? 'border-[var(--talos-accent)] bg-[var(--talos-active)]'
                    : 'border-[var(--talos-border)] bg-[var(--talos-panel-soft)] hover:border-[var(--talos-border-strong)]'"
                @click="selectSkill(skill)"
            >
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ skill.display_name }}</div>
                        <div class="mt-1 truncate font-mono text-xs text-[var(--talos-muted)]">{{ skill.name }}</div>
                    </div>
                    <Badge :tone="planningSkillNames.has(skill.name) ? 'success' : 'neutral'">
                        {{ planningSkillNames.has(skill.name) ? 'planning' : 'excluded' }}
                    </Badge>
                </div>
                <p class="mt-2 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ skill.content_preview }}</p>
            </button>
        </div>

        <div v-else-if="skillsState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm leading-6 text-[var(--talos-muted)]">
            No skills are registered in the control plane.
        </div>

        <TalosSkillAudit
            v-if="skillsState === 'ready'"
            :skill="selectedSkill"
            :planning-enabled="selectedSkill ? planningSkillNames.has(selectedSkill.name) : false"
            :exclusion-reason="selectedSkillExclusionReason"
        />
    </div>
</template>
