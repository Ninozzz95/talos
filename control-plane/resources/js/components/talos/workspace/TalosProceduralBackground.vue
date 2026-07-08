<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useTalosProceduralCanvas } from '../../../composables/useTalosProceduralCanvas'
import type { TalosBackgroundEffect, TalosThemeMotionMode } from '../../../lib/talosThemes'

const props = defineProps<{
    effect: TalosBackgroundEffect
    motion: TalosThemeMotionMode
    reducedMotion: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const canvasEnabled = computed(() => props.effect !== 'none' && props.motion !== 'off' && !props.reducedMotion)

useTalosProceduralCanvas(
    canvas,
    toRef(props, 'effect'),
    toRef(props, 'motion'),
    toRef(props, 'reducedMotion'),
)
</script>

<template>
    <div
        data-testid="talos-background-effect"
        class="talos-background-procedural pointer-events-none absolute inset-0 overflow-hidden opacity-80"
        :class="`talos-effect-${effect}`"
        :data-effect="effect"
        aria-hidden="true"
    >
        <canvas
            v-if="canvasEnabled"
            ref="canvas"
            data-testid="talos-procedural-canvas"
            class="talos-procedural-canvas absolute inset-0 h-full w-full"
        ></canvas>
        <div class="talos-theme-background-scrim absolute inset-0"></div>
        <div class="talos-dag-grid absolute inset-0"></div>
        <div class="talos-effect-layer talos-effect-layer-a"></div>
        <div class="talos-effect-layer talos-effect-layer-b"></div>
        <div class="talos-trace-stream talos-trace-stream-a"></div>
        <div class="talos-trace-stream talos-trace-stream-b"></div>
        <div class="talos-trace-stream talos-trace-stream-c"></div>
        <div class="talos-dag-line talos-dag-line-a"></div>
        <div class="talos-dag-line talos-dag-line-b"></div>
        <div class="talos-dag-node talos-dag-node-a"></div>
        <div class="talos-dag-node talos-dag-node-b"></div>
        <div class="talos-dag-node talos-dag-node-c"></div>
    </div>
</template>
