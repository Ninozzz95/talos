<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RefreshCw } from '@lucide/vue'
import Button from '../../../ui/Button.vue'
import TalosMemoryManager from '../../memory/TalosMemoryManager.vue'
import TalosSkillAudit from '../../memory/TalosSkillAudit.vue'
import TalosSkillRegistry from '../../memory/TalosSkillRegistry.vue'
import { useTalosMemorySkills } from '../../../../composables/useTalosMemorySkills'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()

const {
    skills,
    skillPlanningContext,
    loadingMemorySkills,
    memorySkillError,
    loadSkills,
    loadSkillPlanningContext,
} = useTalosMemorySkills()
const activeSkill = computed(() => skills.value[0] ?? null)

async function refreshSkills() {
    await Promise.all([loadSkills(true), loadSkillPlanningContext()])
}

function requestSkillRefresh() {
    void refreshSkills().catch(() => undefined)
}

onMounted(requestSkillRefresh)
</script>

<template>
    <section v-show="context.activeSection === 'memory'" :id="`talos-window-section-panel-${context.id}-memory`" :aria-labelledby="`talos-window-section-tab-${context.id}-memory`" role="tabpanel" data-testid="talos-window-section-brain-memory">
        <TalosMemoryManager />
    </section>
    <section v-show="context.activeSection === 'skills'" :id="`talos-window-section-panel-${context.id}-skills`" :aria-labelledby="`talos-window-section-tab-${context.id}-skills`" role="tabpanel" data-testid="talos-window-section-brain-skills">
        <div v-if="loadingMemorySkills" class="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--talos-muted)]" role="status" aria-live="polite">
            <RefreshCw class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
            Loading skills
        </div>
        <div v-else-if="memorySkillError" class="grid min-h-40 content-center justify-items-start gap-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-4" role="alert">
            <p class="text-sm leading-6 text-[var(--talos-text)]">{{ memorySkillError }}</p>
            <Button size="sm" variant="secondary" @click="requestSkillRefresh"><RefreshCw class="h-4 w-4" />Retry skills</Button>
        </div>
        <TalosSkillRegistry v-else :skills="skills" :planning-context="skillPlanningContext" />
    </section>
    <section v-show="context.activeSection === 'skill_audit'" :id="`talos-window-section-panel-${context.id}-skill_audit`" :aria-labelledby="`talos-window-section-tab-${context.id}-skill_audit`" role="tabpanel" data-testid="talos-window-section-brain-skill-audit">
        <div v-if="loadingMemorySkills" class="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--talos-muted)]" role="status" aria-live="polite">
            <RefreshCw class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
            Loading skill audit
        </div>
        <div v-else-if="memorySkillError" class="grid min-h-40 content-center justify-items-start gap-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-4" role="alert">
            <p class="text-sm leading-6 text-[var(--talos-text)]">{{ memorySkillError }}</p>
            <Button size="sm" variant="secondary" @click="requestSkillRefresh"><RefreshCw class="h-4 w-4" />Retry skill audit</Button>
        </div>
        <TalosSkillAudit
            v-else
            :skill="activeSkill"
            :planning-enabled="activeSkill ? skillPlanningContext?.skills.some((skill) => skill.name === activeSkill.name) ?? false : false"
            :exclusion-reason="null"
        />
    </section>
</template>
