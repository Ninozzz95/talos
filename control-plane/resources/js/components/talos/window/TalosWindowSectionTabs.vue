<script setup lang="ts">
import Tabs from '../../ui/Tabs.vue'

defineProps<{
    windowId: string
    tabs: Array<{
        id: string
        label: string
        description?: string
    }>
    activeTab: string
}>()

const emit = defineEmits<{
    select: [tabId: string]
}>()
</script>

<template>
    <Tabs
        :model-value="activeTab"
        :items="tabs"
        :label="`${windowId} sections`"
        :tab-id-prefix="`talos-window-section-tab-${windowId}`"
        :panel-id-prefix="`talos-window-section-panel-${windowId}`"
        variant="window"
        :data-testid="`talos-window-section-tabs-${windowId}`"
        @update:model-value="emit('select', $event)"
    />
</template>
