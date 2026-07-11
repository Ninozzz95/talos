<script setup lang="ts">
import { Dock, Maximize2, Minimize2, Minus, RotateCcw, X } from '@lucide/vue'
import Button from '../../ui/Button.vue'

const props = defineProps<{
    id: string
    title: string
    description?: string
    docked?: boolean
    fullscreen?: boolean
}>()

const emit = defineEmits<{
    minimize: [id: string]
    reset: [id: string]
    maximize: [id: string]
    restore: [id: string]
    dock: [id: string]
    close: [id: string]
    dragStart: [id: string, event: PointerEvent]
    snap: [id: string, side: 'left' | 'right']
    cancelInteraction: [id: string]
}>()

function toggleFullscreen() {
    emit(props.fullscreen ? 'restore' : 'maximize', props.id)
}

function handleTitleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
        event.preventDefault()
        toggleFullscreen()
        return
    }

    if (event.ctrlKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        emit('snap', props.id, event.key === 'ArrowLeft' ? 'left' : 'right')
        return
    }

    if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        emit('cancelInteraction', props.id)
    }
}
</script>

<template>
    <header class="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-header)] px-3">
        <div
            class="min-w-0 flex-1 select-none"
            :class="fullscreen ? 'cursor-default' : 'cursor-move'"
            :aria-label="`Drag ${title} window`"
            role="button"
            tabindex="0"
            @pointerdown.left="!fullscreen && emit('dragStart', id, $event)"
            @dblclick="toggleFullscreen"
            @keydown="handleTitleKeydown"
        >
            <h2 class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ title }}</h2>
            <p v-if="description" class="truncate text-[11px] text-[var(--talos-muted)]">{{ description }}</p>
        </div>
        <div class="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" :aria-label="`Minimize ${title}`" @pointerdown.stop @click.stop="emit('minimize', id)">
                <Minus class="h-4 w-4" />
            </Button>
            <Button v-if="!docked && !fullscreen" type="button" variant="ghost" size="icon" :aria-label="`Reset ${title} size`" @pointerdown.stop @click.stop="emit('reset', id)">
                <RotateCcw class="h-4 w-4" />
            </Button>
            <Button v-if="!docked" type="button" variant="ghost" size="icon" :aria-label="fullscreen ? `Exit fullscreen ${title}` : `Fullscreen ${title}`" @pointerdown.stop @click.stop="toggleFullscreen">
                <Minimize2 v-if="fullscreen" class="h-4 w-4" />
                <Maximize2 v-else class="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" :aria-label="docked ? `Undock ${title}` : `Dock ${title}`" @pointerdown.stop @click.stop="emit('dock', id)">
                <Dock v-if="!docked" class="h-4 w-4" />
                <Maximize2 v-else class="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" :aria-label="`Close ${title}`" @pointerdown.stop @click.stop="emit('close', id)">
                <X class="h-4 w-4" />
            </Button>
        </div>
    </header>
</template>
