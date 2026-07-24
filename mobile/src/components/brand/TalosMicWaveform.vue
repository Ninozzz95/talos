<script setup lang="ts">
import { computed } from 'vue'

/**
 * F5.2 (owner) — dictation waveform, competitor-style feedback (Claude/ChatGPT).
 * Bars fill the available width and react to the incoming-speech level (0..1)
 * with a symmetric centre-weighted envelope so the strip reads as a live voice
 * signal; a quiet breathing animation carries the idle-listening state.
 */
const props = withDefaults(defineProps<{
    level: number
    bars?: number
}>(), {
    bars: 18,
})

// Per-bar static weight = centre-weighted envelope (bars near the middle swing
// higher, like a real voice meter) × a deterministic phase. It depends ONLY on
// the bar index, so it is computed once per `bars` value — the per-tick hot path
// (level changes ~8×/sec while listening) then just multiplies + rounds, never
// re-evaluating Math.sin. Deterministic, no random.
const weights = computed(() => {
    const n = props.bars
    return Array.from({ length: n }, (_, index) => {
        const centre = 1 - Math.abs((index - (n - 1) / 2) / ((n - 1) / 2)) // 0..1, 1 in the middle
        const envelope = 0.35 + 0.65 * centre
        const phase = 0.55 + 0.45 * Math.abs(Math.sin((index + 1) * 1.7))
        return envelope * phase
    })
})
const heights = computed(() => {
    const level = Math.max(0, Math.min(1, props.level))
    return weights.value.map((weight) => {
        const value = Math.max(0.06, Math.min(1, level * weight))
        return `${Math.round(3 + value * 18)}px`
    })
})
</script>

<template>
    <div
        class="talos-mic-waveform flex h-6 items-center justify-between gap-[2px]"
        data-testid="talos-mic-waveform"
        aria-hidden="true"
    >
        <span
            v-for="(height, index) in heights"
            :key="index"
            class="talos-mic-waveform-bar w-[3px] flex-1 rounded-full bg-[var(--talos-accent,#c08b3c)]"
            :style="{ height, animationDelay: `${(index % 6) * 90}ms` }"
        />
    </div>
</template>

<style>
.talos-mic-waveform-bar {
    max-width: 4px;
    transition: height 120ms cubic-bezier(0.22, 1, 0.36, 1);
    animation: talosMicBreath 1.5s ease-in-out infinite;
}
@keyframes talosMicBreath {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
    .talos-mic-waveform-bar { animation: none; opacity: 0.9; transition: none; }
}
</style>
