<script setup lang="ts">
import TalosEmailTriage from '../../email/TalosEmailTriage.vue'
import TalosTasks from '../../productivity/TalosTasks.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <section v-show="context.activeSection === 'tasks'" :id="`talos-window-section-panel-${context.id}-tasks`" :aria-labelledby="`talos-window-section-tab-${context.id}-tasks`" role="tabpanel" data-testid="talos-window-section-tasks-tasks">
        <TalosTasks />
    </section>
    <section v-show="context.activeSection === 'email'" :id="`talos-window-section-panel-${context.id}-email`" :aria-labelledby="`talos-window-section-tab-${context.id}-email`" role="tabpanel" data-testid="talos-window-section-tasks-email">
        <section data-testid="talos-productivity-section-email-triage" tabindex="-1" class="outline-none"><TalosEmailTriage /></section>
    </section>
</template>
