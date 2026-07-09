<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useTalosProceduralCanvas } from '../../../composables/useTalosProceduralCanvas'
import type { TalosBackgroundEffect, TalosThemeMotionMode } from '../../../lib/talosThemes'

const props = defineProps<{
    effect: TalosBackgroundEffect
    motion: TalosThemeMotionMode
    motionDisabled: boolean
    simpleAnimation: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const canvasEnabled = computed(() => props.effect !== 'none')

const { performanceState } = useTalosProceduralCanvas(
    canvas,
    toRef(props, 'effect'),
    toRef(props, 'motion'),
    toRef(props, 'motionDisabled'),
    toRef(props, 'simpleAnimation'),
)
</script>

<template>
    <div
        data-testid="talos-background-effect"
        class="talos-background-procedural pointer-events-none absolute inset-0 overflow-hidden opacity-80"
        :class="[`talos-effect-${effect}`, { 'talos-motion-disabled': motionDisabled }]"
        :data-effect="effect"
        :data-motion-disabled="motionDisabled ? 'true' : 'false'"
        :data-performance-mode="performanceState.mode"
        :data-performance-fps-cap="String(performanceState.fpsCap)"
        :data-performance-dpr-cap="String(performanceState.dprCap)"
        :data-performance-raf-active="performanceState.rafActive ? 'true' : 'false'"
        :data-performance-frame-count="String(performanceState.frameCount)"
        :data-performance-resize-count="String(performanceState.resizeCount)"
        :data-performance-visibility-paused="performanceState.visibilityPaused ? 'true' : 'false'"
        :data-simple-animation="performanceState.simpleAnimation ? 'true' : 'false'"
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
