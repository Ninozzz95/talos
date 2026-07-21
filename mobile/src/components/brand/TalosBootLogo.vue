<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// In-app animated brand intro — the mobile mirror of the desktop boot loader
// (partials/talos-loading-logo): the TALOS hex + DAG whose edges stroke-draw
// (flowData) and whose nodes ignite (igniteNode) on a 2.5s loop, accent-driven,
// with a prefers-reduced-motion guard. Plays as the first web paint over the static
// native splash, then fades to the chat. Self-dismisses via `done`.
const emit = defineEmits<{ done: [] }>()
const leaving = ref(false)

const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let fadeTimer: ReturnType<typeof setTimeout> | undefined
let doneTimer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
    const hold = reducedMotion ? 450 : 1900
    fadeTimer = setTimeout(() => { leaving.value = true }, hold)
    doneTimer = setTimeout(() => emit('done'), hold + 420)
})

onBeforeUnmount(() => {
    if (fadeTimer) clearTimeout(fadeTimer)
    if (doneTimer) clearTimeout(doneTimer)
})
</script>

<template>
    <div
        class="talos-boot"
        :data-leaving="leaving"
        data-testid="talos-boot-logo"
        role="status"
        aria-label="Loading TALOS"
    >
        <svg class="talos-boot-svg" viewBox="0 0 500 500" aria-hidden="true">
            <g fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path
                    class="hex"
                    stroke-width="12"
                    d="M 218 123.5 L 121.9 179 A 21 21 0 0 0 111.5 197 L 111.5 333 A 21 21 0 0 0 121.9 351 L 239.6 419 A 21 21 0 0 0 260.4 419 L 378.1 351 A 21 21 0 0 0 388.5 333 L 388.5 197 A 21 21 0 0 0 378.1 179 L 282 123.5"
                />
                <path class="edge edge-main" stroke-width="9" d="M 250 140 L 250 195" />
                <path class="edge edge-branch" stroke-width="9" d="M 250 255 L 250 315" />
                <g transform="translate(250, 225) rotate(45)"><path class="edge edge-branch" stroke-width="9" d="M 0 32 L 0 95" /></g>
                <g transform="translate(250, 225) rotate(-45)"><path class="edge edge-branch" stroke-width="9" d="M 0 32 L 0 95" /></g>
                <circle class="node node-root" stroke-width="9" cx="250" cy="105" r="22" />
                <circle class="node node-mid" stroke-width="9" cx="250" cy="225" r="18" />
                <circle class="node node-out" stroke-width="9" cx="250" cy="338" r="14" />
                <g transform="translate(250, 225) rotate(45)"><circle class="node node-out" stroke-width="9" cx="0" cy="118" r="14" /></g>
                <g transform="translate(250, 225) rotate(-45)"><circle class="node node-out" stroke-width="9" cx="0" cy="118" r="14" /></g>
            </g>
        </svg>
        <span class="talos-boot-word talos-orbitron-brand">TALOS</span>
    </div>
</template>

<style scoped>
.talos-boot {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    background:
        radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--talos-accent, #f5a623) 12%, transparent), transparent 60%),
        var(--talos-background, #080b11);
    transition: opacity 0.4s ease;
}
.talos-boot[data-leaving='true'] {
    opacity: 0;
    pointer-events: none;
}
.talos-boot-svg {
    width: 128px;
    height: 128px;
}
.hex {
    stroke: var(--talos-accent, #f5a623);
    stroke-opacity: 0.18;
}
.edge {
    stroke: var(--talos-accent, #f5a623);
    stroke-dasharray: 90;
    stroke-dashoffset: 90;
    opacity: 0;
}
.node {
    stroke: var(--talos-accent, #f5a623);
    fill: var(--talos-background, #0a0c10);
}
.node-root { animation: talosBootIgnite 2.5s ease-in-out infinite; }
.edge-main { animation: talosBootFlow 2.5s ease-in-out infinite; animation-delay: 0.2s; }
.node-mid { animation: talosBootIgnite 2.5s ease-in-out infinite; animation-delay: 0.5s; }
.edge-branch { animation: talosBootFlow 2.5s ease-in-out infinite; animation-delay: 0.7s; }
.node-out { animation: talosBootIgnite 2.5s ease-in-out infinite; animation-delay: 1s; }
.talos-boot-word {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.35em;
    padding-left: 0.35em;
    color: var(--talos-text, #edf2f7);
}
@keyframes talosBootFlow {
    0%, 15% { stroke-dashoffset: 90; opacity: 0; }
    35%, 65% { stroke-dashoffset: 0; opacity: 1; }
    85%, 100% { stroke-dashoffset: -90; opacity: 0; }
}
@keyframes talosBootIgnite {
    0%, 15% { fill: var(--talos-background, #0a0c10); stroke-width: 9; filter: drop-shadow(0 0 0 transparent); }
    35%, 65% { fill: var(--talos-accent, #f5a623); stroke-width: 0; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--talos-accent, #f5a623) 75%, transparent)); }
    85%, 100% { fill: var(--talos-background, #0a0c10); stroke-width: 9; filter: drop-shadow(0 0 0 transparent); }
}
@media (prefers-reduced-motion: reduce) {
    .edge, .node {
        animation: none !important;
        stroke-dashoffset: 0;
        opacity: 1;
    }
}
</style>
