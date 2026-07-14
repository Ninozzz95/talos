<script setup lang="ts">
import { computed } from 'vue'
import type { TalosWindowTileTarget } from '../../../lib/talosWindowTilePolicy'

type ResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

const props = defineProps<{
    title: string
    docked?: boolean
    fullscreen?: boolean
    tileTarget?: TalosWindowTileTarget
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

const visibleResizeEdges = computed(() => {
    if (props.docked || props.fullscreen) return []
    if (props.tileTarget === 'left-half') return resizeEdges.filter(({ edge }) => edge === 'right')
    if (props.tileTarget === 'right-half') return resizeEdges.filter(({ edge }) => edge === 'left')
    if (props.tileTarget && props.tileTarget !== 'none') return []
    return resizeEdges
})
</script>

<template>
    <button
        v-for="handle in visibleResizeEdges"
        :key="handle.edge"
        type="button"
        class="talos-window-resize-handle hidden lg:block"
        :class="`talos-window-resize-${handle.edge}`"
        :aria-label="`Resize ${title} window ${handle.label}`"
    ></button>
</template>
