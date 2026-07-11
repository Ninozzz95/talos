<script setup lang="ts">
import TalosCookbook from '../../cookbook/TalosCookbook.vue'
import TalosModelCenter from '../../models/TalosModelCenter.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <section v-show="context.activeSection === 'cookbook'" :id="`talos-window-section-panel-${context.id}-cookbook`" :aria-labelledby="`talos-window-section-tab-${context.id}-cookbook`" role="tabpanel" data-testid="talos-window-section-model_lab-cookbook">
        <TalosCookbook />
    </section>
    <section v-show="context.activeSection === 'models'" :id="`talos-window-section-panel-${context.id}-models`" :aria-labelledby="`talos-window-section-tab-${context.id}-models`" role="tabpanel" data-testid="talos-window-section-model_lab-models">
        <TalosModelCenter />
    </section>
</template>
