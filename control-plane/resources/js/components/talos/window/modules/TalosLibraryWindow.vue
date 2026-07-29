<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Tabs from '../../../ui/Tabs.vue'
import TalosLibrary from '../../library/TalosLibrary.vue'
import TalosKnowledgeWindow from './TalosKnowledgeWindow.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

const props = defineProps<{ context: TalosWindowModuleContext }>()
const sourceSection = ref<'context' | 'documents'>('context')
const sourceTabs = [
    { id: 'context', label: 'Context Vault' },
    { id: 'documents', label: 'Documents' },
] as const
const sourceContext = computed<TalosWindowModuleContext>(() => ({
    ...props.context,
    activeSection: sourceSection.value,
}))

watch(
    [
        () => props.context.requestedWindowSection,
        () => props.context.requestedWindowSectionRevision,
    ],
    ([requestedSection]) => {
        if (requestedSection === 'sources') sourceSection.value = 'context'
    },
)
</script>

<template>
    <section
        v-if="context.activeSection === 'unified'"
        :id="`talos-window-section-panel-${context.id}-unified`"
        :aria-labelledby="`talos-window-section-tab-${context.id}-unified`"
        role="tabpanel"
        class="flex min-h-0 flex-1"
        :data-testid="`talos-window-section-${context.id}-unified`"
    >
        <TalosLibrary
            :authenticated="context.authenticated"
            :owner-key="context.settingsOwnerKey"
            :guide-id="`${context.id}.unified`"
            @attach-file="context.attachLibraryFile"
        />
    </section>
    <section
        v-else-if="context.activeSection === 'sources'"
        :id="`talos-window-section-panel-${context.id}-sources`"
        :aria-labelledby="`talos-window-section-tab-${context.id}-sources`"
        role="tabpanel"
        class="flex min-h-0 flex-1 flex-col"
        :data-testid="`talos-window-section-${context.id}-sources`"
    >
        <Tabs
            v-model="sourceSection"
            :items="sourceTabs"
            label="Library source sections"
            :tab-id-prefix="`talos-window-section-tab-${context.id}`"
            :panel-id-prefix="`talos-window-section-panel-${context.id}`"
            class="border-b border-[var(--talos-border)] px-3 pt-2"
        />
        <div class="min-h-0 flex-1 overflow-y-auto">
            <TalosKnowledgeWindow :context="sourceContext" />
        </div>
    </section>
</template>
