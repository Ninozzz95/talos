<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import type { Component } from 'vue'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover'

export type TalosAdvancedRailItem = {
    id: string
    label: string
    description: string
    icon: Component | unknown
}

const props = withDefaults(defineProps<{
    items: TalosAdvancedRailItem[]
    activeIds: string[]
    collapsed: boolean
    expanded: boolean
    id: string
    presentation?: 'inline' | 'popover'
    side?: 'top' | 'right' | 'bottom' | 'left'
    align?: 'start' | 'center' | 'end'
}>(), {
    presentation: 'inline',
    side: 'right',
    align: 'start',
})

const emit = defineEmits<{
    toggle: []
    open: [id: string, event?: PointerEvent]
}>()

const disclosureButton = ref<HTMLButtonElement | null>(null)
const hasActiveItem = computed(() => props.items.some((item) => props.activeIds.includes(item.id)))

function requestExpanded(value: boolean) {
    if (value !== props.expanded) emit('toggle')
}

function handleKeydown(event: KeyboardEvent) {
    if (props.presentation === 'inline' && event.key === 'Escape' && props.expanded && document.activeElement instanceof HTMLElement && document.activeElement.closest(`#${props.id}`)) {
        event.preventDefault()
        disclosureButton.value?.focus()
    }
}
function focusDisclosure() {
    disclosureButton.value?.focus()
}
defineExpose({ focusDisclosure })
onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
    <Popover v-if="presentation === 'popover'" :open="expanded" @update:open="requestExpanded">
        <PopoverTrigger as-child>
            <button
                type="button"
                ref="disclosureButton"
                class="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border text-[13px] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8 lg:min-w-8"
                :class="hasActiveItem ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]' : 'border-transparent text-[var(--talos-muted)]'"
                aria-label="Workbench"
                title="Workbench"
            >
                <ChevronDown class="h-4 w-4 shrink-0 transition" :class="expanded ? '' : '-rotate-90'" />
            </button>
        </PopoverTrigger>
        <PopoverContent
            :side="side"
            :align="align"
            :side-offset="8"
            :collision-padding="8"
            class="talos-advanced-rail-popover z-[80] max-h-[var(--reka-popover-content-available-height)] w-52 overflow-y-auto border-[var(--talos-border)] bg-[var(--talos-card)] p-1 text-[var(--talos-text)]"
        >
            <div v-for="item in props.items" :key="item.id" class="flex min-w-0 items-center gap-1">
                <button
                    type="button"
                    class="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md border px-2 py-1.5 text-left text-[13px] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
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
        </PopoverContent>
    </Popover>
    <div v-else class="relative">
        <div class="flex min-w-0 items-center" :class="collapsed ? 'justify-center gap-0' : 'gap-1'">
            <button
                type="button"
                ref="disclosureButton"
                class="flex min-w-0 flex-1 cursor-pointer items-center rounded-md border border-transparent text-left text-[13px] text-[var(--talos-muted)] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="collapsed ? 'justify-center px-0 py-2' : 'justify-between gap-2.5 px-2 py-1.5'"
                aria-label="Workbench"
                :aria-controls="props.id"
                :aria-expanded="expanded"
                title="Workbench"
                @click="emit('toggle')"
            >
                <span class="flex min-w-0 items-center gap-2.5">
                    <ChevronDown class="h-4 w-4 shrink-0 transition" :class="expanded ? '' : '-rotate-90'" />
                    <span v-if="!collapsed" class="truncate">Workbench</span>
                </span>
            </button>
        </div>
        <div
            v-if="expanded"
            :id="props.id"
            class="mt-1 space-y-0.5"
            :class="collapsed ? 'w-full' : ''"
        >
            <div v-for="item in props.items" :key="item.id" class="flex min-w-0 items-center gap-1">
                <button
                    type="button"
                    class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md border px-2 py-1.5 text-left text-[13px] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
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
    </div>
</template>
