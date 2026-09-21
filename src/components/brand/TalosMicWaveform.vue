<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * ⭐⭐⭐ L'ONDA DELLA VOCE — la STORIA del volume, non un livello solo.
 *
 * ## Il difetto, e perché due componenti erano un difetto
 *
 * Owner 2026-08-14: «la versione chat ha la wave vecchia che non reagisce al
 * suono… non ha senso usare componenti diversi».
 *
 * Aveva ragione due volte. Questo componente prendeva **un numero** — il
 * livello di adesso — e lo spalmava su 18 barre con una sagoma fissa e più alta
 * al centro: tutte le barre salivano e scendevano **insieme**, come un
 * indicatore di volume travestito da onda. Sopra ci girava un respiro CSS che
 * si muoveva anche in silenzio, e quello era il difetto peggiore: **si muoveva
 * quando non stava sentendo niente**.
 *
 * L'assistente nel frattempo aveva la cosa giusta — 28 campioni presi ogni
 * 80 ms che scorrono verso sinistra — ma scritta dentro `TalosBarraRoot`, e
 * quindi la chat non poteva ereditarla. Due superfici sulla stessa funzione che
 * divergono in silenzio è il difetto che questa casa ha già pagato con i tempi
 * della dettatura e con le schede dell'assistente.
 *
 * ⇒ La storia vive QUI dentro. Chi chiama passa solo il livello, e le due
 * superfici non possono più divergere.
 *
 * ## Perché la storia e non il livello
 *
 * Sono i **2,2 secondi** appena passati, a 80 ms l'uno: il tempo in cui una
 * persona dice una frase corta. Una barra che sale e scende tutta insieme dice
 * «c'è del suono»; una traccia che scorre dice «ti sto seguendo mentre parli»,
 * ed è l'unica cosa che chi parla vuole sapere.
 */
const props = withDefaults(defineProps<{
    level: number
    bars?: number
}>(), {
    bars: 28,
})

/** 80 ms × 28 = 2,2 s di storia. Vedi il commento in testa. */
const PASSO_MS = 80

const storia = ref<number[]>(new Array(props.bars).fill(0))
let campionatore: ReturnType<typeof setInterval> | null = null

function campiona(): void {
    // ⛔ Un array NUOVO a ogni giro: Vue non si accorge di uno `shift` in posto.
    storia.value = [
        ...storia.value.slice(1),
        Math.max(0, Math.min(1, Number.isFinite(props.level) ? props.level : 0)),
    ]
}

onMounted(() => {
    /*
     * ⛔ Si campiona da quando il componente esiste, non da quando il livello
     * cambia. Nella barra la versione precedente aveva bisogno di
     * `immediate: true` sul guardiano perché senza «l'onda è piatta
     * nell'assistente»: lì il guardiano poteva non scattare mai. Qui il ciclo
     * di vita del componente È l'evento, e quel modo di sbagliare non esiste.
     */
    campionatore = setInterval(campiona, PASSO_MS)
})

onBeforeUnmount(() => {
    if (campionatore !== null) { clearInterval(campionatore); campionatore = null }
})

watch(() => props.bars, (quante) => { storia.value = new Array(quante).fill(0) })

const altezze = computed(() => storia.value.map((valore) => {
    // 3 px di riga viva anche a zero: una traccia che sparisce del tutto
    // sembra un componente rotto, non un silenzio.
    return `${Math.round(3 + Math.max(0, Math.min(1, valore)) * 18)}px`
}))
</script>

<template>
    <div
        class="talos-mic-waveform flex h-6 items-center justify-between gap-[2px]"
        data-testid="talos-mic-waveform"
        aria-hidden="true"
    >
        <span
            v-for="(altezza, indice) in altezze"
            :key="indice"
            class="talos-mic-waveform-bar w-[3px] flex-1 rounded-full bg-[var(--talos-accent,#c08b3c)]"
            :style="{ height: altezza }"
        />
    </div>
</template>

<style>
.talos-mic-waveform-bar {
    max-width: 4px;
    /*
     * ⛔ La transizione è più corta del passo di campionamento (80 ms): se
     * fosse più lunga, ogni barra starebbe ancora andando verso il valore
     * vecchio quando arriva il nuovo, e la traccia sarebbe una poltiglia
     * invece del profilo della voce.
     */
    transition: height 70ms linear;
}
/*
 * ⛔ NESSUN respiro CSS. Qui c'era `talosMicBreath`, un'animazione infinita
 * che pulsava anche in silenzio: diceva «ti sento» quando non c'era niente da
 * sentire. Adesso l'unica cosa che si muove è il suono vero.
 */
@media (prefers-reduced-motion: reduce) {
    .talos-mic-waveform-bar { transition: none; }
}
</style>
