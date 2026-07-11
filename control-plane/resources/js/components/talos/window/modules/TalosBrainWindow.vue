<script setup lang="ts">
import { computed, onMounted } from 'vue'
import TalosMemoryManager from '../../memory/TalosMemoryManager.vue'
import TalosSkillAudit from '../../memory/TalosSkillAudit.vue'
import TalosSkillRegistry from '../../memory/TalosSkillRegistry.vue'
import { useTalosMemorySkills } from '../../../../composables/useTalosMemorySkills'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()

const {
    skills,
    skillPlanningContext,
    loadSkills,
    loadSkillPlanningContext,
} = useTalosMemorySkills()
const activeSkill = computed(() => skills.value[0] ?? null)

onMounted(() => {
    void Promise.allSettled([loadSkills(true), loadSkillPlanningContext()])
})
</script>

<template>
    <section v-show="context.activeSection === 'memory'" :id="`talos-window-section-panel-${context.id}-memory`" :aria-labelledby="`talos-window-section-tab-${context.id}-memory`" role="tabpanel" data-testid="talos-window-section-brain-memory">
        <TalosMemoryManager />
    </section>
    <section v-show="context.activeSection === 'skills'" :id="`talos-window-section-panel-${context.id}-skills`" :aria-labelledby="`talos-window-section-tab-${context.id}-skills`" role="tabpanel" data-testid="talos-window-section-brain-skills">
        <TalosSkillRegistry :skills="skills" :planning-context="skillPlanningContext" />
    </section>
    <section v-show="context.activeSection === 'skill_audit'" :id="`talos-window-section-panel-${context.id}-skill_audit`" :aria-labelledby="`talos-window-section-tab-${context.id}-skill_audit`" role="tabpanel" data-testid="talos-window-section-brain-skill-audit">
        <TalosSkillAudit
            :skill="activeSkill"
            :planning-enabled="activeSkill ? skillPlanningContext?.skills.some((skill) => skill.name === activeSkill.name) ?? false : false"
            :exclusion-reason="null"
        />
    </section>
</template>
