<script setup lang="ts">
import { computed } from 'vue'

/**
 * F5.2 (owner) — dictation waveform, competitor-style feedback: bars react to
 * the incoming-speech level (0..1) with per-bar phase so the strip feels
 * alive; a quiet breathing animation carries the idle-listening state.
 */
const props = withDefaults(defineProps<{
    level: number
    bars?: number
}>(), {
    bars: 9,
})

const PHASE = [0.9, 0.55, 1, 0.7, 0.85, 0.6, 1, 0.5, 0.8, 0.65, 0.95, 0.75]

const heights = computed(() => Array.from({ length: props.bars }, (_, index) => {
    const phase = PHASE[index % PHASE.length]
    const value = Math.max(0.08, Math.min(1, props.level * phase))
    return `${Math.round(6 + value * 22)}px`
}))
</script>

<template>
    <div
        class="talos-mic-waveform flex items-center justify-center gap-[3px]"
        data-testid="talos-mic-waveform"
        aria-hidden="true"
    >
        <span
            v-for="(height, index) in heights"
            :key="index"
            class="talos-mic-waveform-bar w-[3px] rounded-full bg-[var(--talos-accent,#c08b3c)]"
            :style="{ height, animationDelay: `${(index % 5) * 120}ms` }"
        />
    </div>
</template>

<style>
.talos-mic-waveform-bar {
    transition: height 110ms ease-out;
    animation: talosMicBreath 1.4s ease-in-out infinite;
}
@keyframes talosMicBreath {
    0%, 100% { opacity: 0.75; }
    50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
    .talos-mic-waveform-bar { animation: none; opacity: 0.9; }
}
</style>
