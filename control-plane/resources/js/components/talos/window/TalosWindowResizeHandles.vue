<script setup lang="ts">
type ResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

defineProps<{
    title: string
    docked?: boolean
    fullscreen?: boolean
}>()

const emit = defineEmits<{
    resizeStart: [edge: ResizeEdge, event: PointerEvent]
}>()

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
</script>

<template>
    <template v-if="!docked && !fullscreen">
        <button
            v-for="handle in resizeEdges"
            :key="handle.edge"
            type="button"
            class="talos-window-resize-handle hidden lg:block"
            :class="`talos-window-resize-${handle.edge}`"
            :aria-label="`Resize ${title} window ${handle.label}`"
            @pointerdown.left.stop.prevent="emit('resizeStart', handle.edge, $event)"
        ></button>
    </template>
</template>
