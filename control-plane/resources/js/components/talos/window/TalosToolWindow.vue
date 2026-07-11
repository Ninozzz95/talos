<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import TalosWindowResizeHandles from './TalosWindowResizeHandles.vue'
import TalosWindowTitleBar from './TalosWindowTitleBar.vue'

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
    snap: [id: string, side: 'left' | 'right']
    cancelInteraction: [id: string]
}>()
const windowRoot = ref<HTMLElement | null>(null)

type ResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

function forwardDragStart(windowId: string, event: PointerEvent) {
    emit('dragStart', windowId, event)
}

function forwardResizeStart(edge: ResizeEdge, event: PointerEvent) {
    emit('resizeStart', props.id, edge, event)
}

function forwardSnap(windowId: string, side: 'left' | 'right') {
    emit('snap', windowId, side)
}

const windowClass = computed(() => {
    if (props.docked) {
        return 'talos-tool-window talos-tool-window-docked lg:max-h-full lg:w-[420px]'
    }

    if (props.fullscreen) {
        return 'talos-tool-window w-full lg:max-h-none'
    }

    return 'talos-tool-window w-full lg:max-h-none lg:max-w-[min(980px,calc(100vw-300px))]'
})

onMounted(() => {
    void nextTick(() => {
        if (props.active) windowRoot.value?.focus({ preventScroll: true })
    })
})
</script>

<template>
    <section
        ref="windowRoot"
        :class="[
            windowClass,
            'relative flex max-h-[calc(100dvh-var(--talos-composer-height,168px)-9rem)] min-h-0 flex-col overflow-hidden rounded-md border bg-[var(--talos-window-bg)] shadow-[0_24px_90px_rgba(0,0,0,0.34)]',
            active ? 'border-[var(--talos-accent-border)]' : 'border-[var(--talos-border)]',
            interacting ? 'talos-tool-window-interacting' : '',
            fullscreen ? 'talos-tool-window-fullscreen' : '',
        ]"
        :aria-label="title"
        tabindex="-1"
        :data-window-id="id"
        :data-window-active="active ? 'true' : 'false'"
        :data-window-fullscreen="fullscreen ? 'true' : 'false'"
        :data-window-width="width ? String(Math.round(width)) : undefined"
        :data-window-height="height ? String(Math.round(height)) : undefined"
        @mousedown="emit('focus', id)"
    >
        <TalosWindowTitleBar
            :id="id"
            :title="title"
            :description="description"
            :docked="docked"
            :fullscreen="fullscreen"
            @minimize="emit('minimize', $event)"
            @reset="emit('resetSize', $event)"
            @maximize="emit('fullscreen', $event)"
            @restore="emit('fullscreen', $event)"
            @dock="emit('dock', $event)"
            @close="emit('close', $event)"
            @drag-start="forwardDragStart"
            @snap="forwardSnap"
            @cancel-interaction="emit('cancelInteraction', $event)"
        />
        <div class="talos-tool-window-body min-h-0 flex-1 overflow-auto overscroll-contain p-3 pb-36">
            <slot />
        </div>
        <TalosWindowResizeHandles
            :title="title"
            :docked="docked"
            :fullscreen="fullscreen"
            @resize-start="forwardResizeStart"
        />
    </section>
</template>
