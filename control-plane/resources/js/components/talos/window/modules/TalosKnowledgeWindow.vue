<script setup lang="ts">
import TalosContextVault from '../../context/TalosContextVault.vue'
import TalosDocuments from '../../documents/TalosDocuments.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <section
        v-show="context.activeSection === 'context'"
        :id="`talos-window-section-panel-${context.id}-context`"
        :aria-labelledby="`talos-window-section-tab-${context.id}-context`"
        role="tabpanel"
        :data-testid="`talos-window-section-${context.id}-context`"
    >
        <TalosContextVault
            @context-set-created="context.contextSetCreated"
            @benchmark-scenario-selected="context.benchmarkScenarioSelected"
        />
    </section>
    <section
        v-show="context.activeSection === 'documents'"
        :id="`talos-window-section-panel-${context.id}-documents`"
        :aria-labelledby="`talos-window-section-tab-${context.id}-documents`"
        role="tabpanel"
        :data-testid="`talos-window-section-${context.id}-documents`"
    >
        <TalosDocuments />
    </section>
</template>
