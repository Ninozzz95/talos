<script setup lang="ts">
import { computed } from 'vue'
import { Dock, Maximize2, Minimize2, Minus, RotateCcw, X } from '@lucide/vue'
import Button from '../../ui/Button.vue'

const props = defineProps<{
    id: string
    title: string
    description?: string
    active?: boolean
    docked?: boolean
    width?: number
    height?: number
    interacting?: boolean
    fullscreen?: boolean
}>()

const emit = defineEmits<{
    close: [id: string]
    minimize: [id: string]
    dock: [id: string]
    fullscreen: [id: string]
    focus: [id: string]
    dragStart: [id: string, event: PointerEvent]
    resizeStart: [id: string, edge: ResizeEdge, event: PointerEvent]
    resetSize: [id: string]
}>()

type ResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

const resizeEdges: Array<{ edge: ResizeEdge; label: string }> = [
    { edge: 'top', label: 'top' },
    { edge: 'right', label: 'right' },
    { edge: 'bottom', label: 'bottom' },
    { edge: 'left', label: 'left' },
    { edge: 'top-right', label: 'top right' },
    { edge: 'bottom-right', label: 'bottom right' },
    { edge: 'bottom-left', label: 'bottom left' },
    { edge: 'top-left', label: 'top left' },
]

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
            'relative flex max-h-[calc(100dvh-18rem)] min-h-0 flex-col overflow-hidden rounded-md border bg-[var(--talos-card)] shadow-[0_24px_90px_rgba(0,0,0,0.34)] lg:max-h-[calc(100vh-7rem)]',
            active ? 'border-[var(--talos-accent-border)]' : 'border-[var(--talos-border)]',
            interacting ? 'talos-tool-window-interacting' : '',
            fullscreen ? 'talos-tool-window-fullscreen' : '',
        ]"
        :aria-label="title"
        :data-window-id="id"
        :data-window-active="active ? 'true' : 'false'"
        :data-window-fullscreen="fullscreen ? 'true' : 'false'"
        :data-window-width="width ? String(Math.round(width)) : undefined"
        :data-window-height="height ? String(Math.round(height)) : undefined"
        @mousedown="emit('focus', id)"
    >
        <header class="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-header)] px-3">
            <div
                class="min-w-0 flex-1 select-none"
                :class="fullscreen ? 'cursor-default' : 'cursor-move'"
                :aria-label="`Drag ${title} window`"
                role="button"
                tabindex="0"
                @pointerdown.left="!fullscreen && emit('dragStart', id, $event)"
            >
                <h2 class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ title }}</h2>
                <p v-if="description" class="truncate text-[11px] text-[var(--talos-muted)]">{{ description }}</p>
            </div>
            <div class="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" :aria-label="`Minimize ${title}`" @click.stop="emit('minimize', id)">
                    <Minus class="h-4 w-4" />
                </Button>
                <Button v-if="!docked && !fullscreen" type="button" variant="ghost" size="icon" :aria-label="`Reset ${title} size`" @click.stop="emit('resetSize', id)">
                    <RotateCcw class="h-4 w-4" />
                </Button>
                <Button v-if="!docked" type="button" variant="ghost" size="icon" :aria-label="fullscreen ? `Exit fullscreen ${title}` : `Fullscreen ${title}`" @click.stop="emit('fullscreen', id)">
                    <Minimize2 v-if="fullscreen" class="h-4 w-4" />
                    <Maximize2 v-else class="h-4 w-4" />
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
        <div class="talos-tool-window-body min-h-0 flex-1 overflow-auto overscroll-contain p-3 pb-36">
            <slot />
        </div>
        <template v-if="!docked && !fullscreen">
            <button
                v-for="handle in resizeEdges"
                :key="handle.edge"
                type="button"
                class="talos-window-resize-handle"
                :class="`talos-window-resize-${handle.edge}`"
                :aria-label="`Resize ${title} window ${handle.label}`"
                @pointerdown.left.stop.prevent="emit('resizeStart', id, handle.edge, $event)"
            ></button>
        </template>
    </section>
</template>
