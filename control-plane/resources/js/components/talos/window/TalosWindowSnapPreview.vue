<script setup lang="ts">
import { computed } from 'vue'
import type { TalosWindowTileBounds, TalosWindowTileTarget } from '../../../lib/talosWindowTilePolicy'

const props = defineProps<{
    target: TalosWindowTileTarget
    bounds: TalosWindowTileBounds | null
}>()

const previewStyle = computed(() => props.bounds ? {
    '--talos-snap-preview-x': `${props.bounds.x}px`,
    '--talos-snap-preview-y': `${props.bounds.y}px`,
    '--talos-snap-preview-width': `${props.bounds.width}px`,
    '--talos-snap-preview-height': `${props.bounds.height}px`,
} : undefined)
</script>

<template>
    <div
        v-if="target !== 'none' && bounds"
        data-testid="talos-window-snap-preview"
        class="talos-window-snap-preview pointer-events-none absolute"
        :data-snap-target="target"
        :style="previewStyle"
        aria-hidden="true"
    ></div>
</template>
