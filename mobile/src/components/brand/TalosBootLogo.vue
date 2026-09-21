<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// In-app animated brand intro — the mobile mirror of the desktop boot loader
// (partials/talos-loading-logo): the TALOS hex + DAG whose edges grow
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
    // Perf re-review 2026-07-25: this was a fixed 1900+420ms hold — 2.32s of a
    // full-screen overlay nobody could tap through. Removing ~285KB of
    // boot-blocking JS bought nothing while this timer dominated the perceived
    // cold start, and the native splash already covers the first frames.
    // Owner 2026-07-27: "un po' troppo veloce per i miei gusti". 900ms was a
    // performance reaction that overshot -- the jank he also reported was never
    // the duration, it was what the animation animated (see the keyframes).
    // With that fixed the mark can be given time to actually be seen.
    const hold = reducedMotion ? 450 : 1500
    fadeTimer = setTimeout(() => { leaving.value = true }, hold)
    doneTimer = setTimeout(() => emit('done'), hold + 500)
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
        :aria-label="$t('accessibility.loadingTalos')"
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
    background:
        radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--talos-accent, #f5a623) 12%, transparent), transparent 60%),
        var(--talos-background, #080b11);
    transition: opacity 0.4s ease;
}
.talos-boot[data-leaving='true'] {
    opacity: 0;
    pointer-events: none;
}
/* #14 seamless handoff: the Android 12 splash renders this same mark at
   ~125dp DEAD CENTER — the boot mark is pinned to the exact same spot and
   scale so the glyph does not move when the app takes over; the wordmark
   fades in below without displacing it. */
.talos-boot-svg {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 125px;
    height: 125px;
    transform: translate(-50%, -50%);
}
.hex {
    stroke: var(--talos-accent, #f5a623);
    stroke-opacity: 0.18;
}
.edge {
    stroke: var(--talos-accent, #f5a623);
    opacity: 0;
    transform: scaleY(0);
    transform-box: fill-box;
    transform-origin: center top;
    will-change: transform, opacity;
}
.node {
    stroke: var(--talos-accent, #f5a623);
    /* Lit by default and revealed by opacity. The old version was filled with
       the BACKGROUND colour and animated `fill` to the accent, which is a paint
       the compositor cannot do. The glow is set once here, so the layer is
       rasterised a single time and afterwards only faded. */
    fill: var(--talos-accent, #f5a623);
    filter: drop-shadow(0 0 9px color-mix(in srgb, var(--talos-accent, #f5a623) 70%, transparent));
    will-change: opacity;
}
/* Owner 2026-07-27: "la app si carica prima che la boot animation finisca."
   He was right, and the cause was arithmetic: this cascade was an INFINITE
   2.5s loop with delays out to 1s, so its first pass ended around 3.5s — while
   the overlay starts dissolving at 900ms. The mark was cut off a third of the
   way through, with the app showing through underneath.

   A boot sequence is not an idle loop: it has to END, and it has to end before
   the thing it is covering appears. One pass, compressed so the last node
   finishes at ~870ms — just inside the 900ms hold — and `forwards` so it rests
   lit rather than snapping back for the fade. The startup stays as fast as the
   perf review made it; only the animation stops pretending it has 3.5 seconds. */
/* Re-timed for the 1500ms hold the owner asked for: the last node finishes at
   ~1.28s, inside the hold, so the sequence still ENDS before the overlay
   dissolves — the defect that was fixed here on 2026-07-27 morning. */
.node-root { animation: talosBootIgnite 0.8s ease-in-out both; }
.edge-main { animation: talosBootFlow 0.8s ease-in-out 0.12s both; }
.node-mid { animation: talosBootIgnite 0.8s ease-in-out 0.24s both; }
.edge-branch { animation: talosBootFlow 0.8s ease-in-out 0.36s both; }
.node-out { animation: talosBootIgnite 0.8s ease-in-out 0.48s both; }
.talos-boot-word {
    position: absolute;
    top: calc(50% + 78px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.35em;
    padding-left: 0.35em;
    color: var(--talos-text, #edf2f7);
    animation: talosBootWordIn 0.6s ease-out 0.3s both;
}
@keyframes talosBootWordIn {
    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
/* Owner 2026-07-27: "le linee e i nodi devono persistere, non devono scomparire
   quando la linea è attraversata". They used to draw, then un-draw and fade —
   the mark assembled itself and then dismantled itself, so what you were left
   looking at was an empty screen. It builds and STAYS built; the overlay's own
   fade is what removes it. */
@keyframes talosBootFlow {
    0%, 10% { transform: scaleY(0); opacity: 0; }
    60%, 100% { transform: scaleY(1); opacity: 1; }
}
/**
 * Owner 2026-07-27: "l'animazione di boot lagga".
 *
 * This is why. It used to animate `fill`, `stroke-width` AND a `drop-shadow`
 * filter whose blur radius and `color-mix` colour both changed per keyframe --
 * three properties the compositor cannot touch, on five SVG elements at once.
 * Every frame re-computed path geometry and re-rendered a filter. On a phone
 * that is not a slow animation, it is a stalled one.
 *
 * Now only `opacity` moves, which the compositor owns. The glow is a static
 * filter on a layer whose opacity animates -- the filtered layer is rasterised
 * once and then just faded, instead of being rebuilt sixty times a second.
 */
@keyframes talosBootIgnite {
    0%, 10% { opacity: 0; }
    55%, 100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
    .edge, .node {
        animation: none !important;
        transform: scaleY(1);
        opacity: 1;
    }
}
</style>
