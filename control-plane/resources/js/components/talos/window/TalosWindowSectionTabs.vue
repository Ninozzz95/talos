<script setup lang="ts">
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
    <div
        class="mb-3 flex w-full flex-row items-center gap-1 overflow-x-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-1"
        role="tablist"
        :aria-label="`${windowId} sections`"
        :data-testid="`talos-window-section-tabs-${windowId}`"
    >
        <button
            v-for="tab in tabs"
            :id="`talos-window-section-tab-${windowId}-${tab.id}`"
            :key="tab.id"
            type="button"
            role="tab"
            class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs font-medium transition hover:border-[var(--talos-accent-border)] hover:bg-[var(--talos-active)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :class="activeTab === tab.id ? 'border-[var(--talos-accent-border)] bg-[var(--talos-panel)] text-[var(--talos-text)] shadow-sm' : 'border-transparent text-[var(--talos-muted)]'"
            :aria-selected="activeTab === tab.id ? 'true' : 'false'"
            :aria-controls="`talos-window-section-panel-${windowId}-${tab.id}`"
            :title="tab.description ?? tab.label"
            @click="emit('select', tab.id)"
        >
            {{ tab.label }}
        </button>
    </div>
</template>
