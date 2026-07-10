<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import type { Component } from 'vue'

export type TalosAdvancedRailItem = {
    id: string
    label: string
    description: string
    icon: Component | unknown
}

const props = defineProps<{
    items: TalosAdvancedRailItem[]
    activeIds: string[]
    collapsed: boolean
    expanded: boolean
    id: string
}>()

const emit = defineEmits<{
    toggle: []
    open: [id: string, event?: PointerEvent]
}>()

const disclosureButton = ref<HTMLButtonElement | null>(null)
function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.expanded && document.activeElement instanceof HTMLElement && document.activeElement.closest(`#${props.id}`)) {
        event.preventDefault()
        disclosureButton.value?.focus()
    }
}
onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
    <div class="relative">
        <button
            type="button"
            ref="disclosureButton"
            class="flex w-full cursor-pointer items-center rounded-md border border-transparent text-left text-[13px] text-[var(--talos-muted)] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :class="collapsed ? 'justify-center px-0 py-2' : 'justify-between gap-2.5 px-2 py-1.5'"
            aria-label="Advanced"
            :aria-controls="props.id"
            :aria-expanded="expanded"
            title="Advanced"
            @click="emit('toggle')"
        >
            <span class="flex min-w-0 items-center gap-2.5">
                <ChevronDown class="h-4 w-4 shrink-0 transition" :class="expanded ? '' : '-rotate-90'" />
                <span v-if="!collapsed" class="truncate">Advanced</span>
            </span>
        </button>
        <div
            v-if="expanded"
            :id="props.id"
            class="mt-1 space-y-0.5"
            :class="collapsed ? 'absolute left-full top-0 z-50 ml-2 w-48 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-xl' : ''"
        >
            <button
                v-for="item in props.items"
                :key="item.id"
                type="button"
                class="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md border px-2 py-1.5 text-left text-[13px] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="activeIds.includes(item.id) ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]' : 'border-transparent text-[var(--talos-muted)]'"
                :aria-label="item.label"
                :aria-pressed="activeIds.includes(item.id)"
                :title="item.description"
                @click="emit('open', item.id, $event)"
            >
                <component :is="item.icon" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                <span class="min-w-0 truncate">{{ item.label }}</span>
            </button>
        </div>
    </div>
</template>
