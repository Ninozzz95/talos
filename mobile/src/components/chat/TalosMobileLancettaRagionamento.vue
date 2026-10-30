<script setup lang="ts">
import { computed } from 'vue'

/**
 * ⭐ La lancetta del ragionamento nel chip del modello (owner 28/10/2026: le tacche del segnale non andavano, «qualcosa di più unico,
 * capibile e leggermente più grande»; fra tre proposte ha scelto «C», mockup su disco `.claude/mockup/indicatore-ragionamento-2026-10-28/`).
 * Un quadrante di 180°: l'arco si riempie e la lancetta sale col livello, da 0 (a sinistra, «spento») a 4 (a destra, l'ultimo livello
 * del modello). «Auto» è la lancetta tratteggiata, color accento, sul livello che parte davvero. Solo disegno: la parola la dice il chip.
 */
const props = defineProps<{ livello: number; auto?: boolean }>()

function punto(raggio: number): [number, number] {
    const angolo = Math.PI - (Math.max(0, Math.min(4, props.livello)) / 4) * Math.PI
    return [+(12 + raggio * Math.cos(angolo)).toFixed(2), +(15 - raggio * Math.sin(angolo)).toFixed(2)]
}
const arco = computed(() => { const [x, y] = punto(9); return `M3 15A9 9 0 0 1 ${x} ${y}` })
const punta = computed(() => punto(6.5))
</script>

<template>
    <svg width="26" height="22" viewBox="0 0 24 20" fill="none" stroke-linecap="round" aria-hidden="true">
        <path data-parte="traccia" d="M3 15A9 9 0 0 1 21 15" stroke="var(--talos-border-strong, var(--talos-border))" stroke-width="2.5" />
        <path v-if="livello > 0" data-parte="arco-pieno" :d="arco" stroke="var(--talos-accent)" stroke-width="2.5" />
        <line
            data-parte="lancetta" x1="12" y1="15" :x2="punta[0]" :y2="punta[1]"
            :stroke="auto ? 'var(--talos-accent)' : 'var(--talos-text)'" stroke-width="2" :stroke-dasharray="auto ? '2 2' : undefined"
        />
        <circle cx="12" cy="15" r="1.8" fill="var(--talos-text)" />
    </svg>
</template>
