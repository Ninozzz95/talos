<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import TalosCookbook from '../../cookbook/TalosCookbook.vue'
import TalosModelCenter from '../../models/TalosModelCenter.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

// Lazy-loaded so the catalog grid stays out of the initial chunk (chunk budget).
const TalosModelCatalog = defineAsyncComponent(() => import('../../models/TalosModelCatalog.vue'))

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <section v-show="context.activeSection === 'cookbook'" :id="`talos-window-section-panel-${context.id}-cookbook`" :aria-labelledby="`talos-window-section-tab-${context.id}-cookbook`" role="tabpanel" data-testid="talos-window-section-model_lab-cookbook">
        <TalosCookbook />
    </section>
    <section v-show="context.activeSection === 'models'" :id="`talos-window-section-panel-${context.id}-models`" :aria-labelledby="`talos-window-section-tab-${context.id}-models`" role="tabpanel" data-testid="talos-window-section-model_lab-models">
        <TalosModelCenter />
    </section>
    <section v-show="context.activeSection === 'catalog'" :id="`talos-window-section-panel-${context.id}-catalog`" :aria-labelledby="`talos-window-section-tab-${context.id}-catalog`" role="tabpanel" data-testid="talos-window-section-model_lab-catalog">
        <TalosModelCatalog v-if="context.activeSection === 'catalog'" />
    </section>
</template>
