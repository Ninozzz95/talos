<script setup lang="ts">
import { computed } from 'vue'
import { Dock, Maximize2, Minus, X } from '@lucide/vue'
import Button from '../../ui/Button.vue'

const props = defineProps<{
    id: string
    title: string
    description?: string
    active?: boolean
    docked?: boolean
}>()

const emit = defineEmits<{
    close: [id: string]
    minimize: [id: string]
    dock: [id: string]
    focus: [id: string]
    dragStart: [id: string, event: PointerEvent]
}>()

const windowClass = computed(() => {
    if (props.docked) {
        return 'talos-tool-window talos-tool-window-docked lg:w-[420px]'
    }

    return 'talos-tool-window w-full lg:max-w-[min(980px,calc(100vw-300px))]'
})
</script>

<template>
    <section
        :class="[
            windowClass,
            'min-h-0 overflow-hidden rounded-md border bg-[var(--talos-card)] shadow-[0_24px_90px_rgba(0,0,0,0.34)]',
            active ? 'border-[var(--talos-accent-border)]' : 'border-[var(--talos-border)]',
        ]"
        :aria-label="title"
        @mousedown="emit('focus', id)"
    >
        <header class="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-header)] px-3">
            <div
                class="min-w-0 flex-1 cursor-move select-none"
                :aria-label="`Drag ${title} window`"
                role="button"
                tabindex="0"
                @pointerdown.left="emit('dragStart', id, $event)"
            >
                <h2 class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ title }}</h2>
                <p v-if="description" class="truncate text-[11px] text-[var(--talos-muted)]">{{ description }}</p>
            </div>
            <div class="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" :aria-label="`Minimize ${title}`" @click.stop="emit('minimize', id)">
                    <Minus class="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" :aria-label="docked ? `Undock ${title}` : `Dock ${title}`" @click.stop="emit('dock', id)">
                    <Dock v-if="!docked" class="h-4 w-4" />
                    <Maximize2 v-else class="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" :aria-label="`Close ${title}`" @click.stop="emit('close', id)">
                    <X class="h-4 w-4" />
                </Button>
            </div>
        </header>
        <div class="max-h-[calc(100vh-18rem)] min-h-0 overflow-auto p-3">
            <slot />
        </div>
    </section>
</template>
