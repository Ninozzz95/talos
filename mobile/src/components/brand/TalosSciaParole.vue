<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

/**
 * ⭐⭐⭐ LA SCIA — le parole mentre le sente, su UNA riga che scorre.
 *
 * ## Perché è un componente e non due pezzi di CSS
 *
 * Owner 2026-08-14, prima: «stampare le parole mano mano che vengono sentite…
 * sopra la barra, animata in scorrimento orizzontale». Poi, guardando la chat:
 * «ha… un testo che non va sopra e con la stessa animazione, allinearlo alla
 * versione assistente, **non ha senso usare componenti diversi**».
 *
 * Aveva ragione. Le due superfici mostravano le stesse parole in due modi:
 * l'assistente su una riga che scorre, la chat in un blocco che va a capo e si
 * scorre in verticale. Due disegni per lo stesso dato sono due decisioni che un
 * giorno divergono — ed erano già divergenti il giorno in cui sono nate.
 *
 * ## ⛔ Perché SCORRE e non va a capo
 *
 * A capo, la scia cresce verso l'alto a ogni frase e **spinge l'oggetto che la
 * persona sta guardando** — la pillola, o la barra dei comandi. Su una riga
 * sola non si muove niente, e l'ultima parola resta sempre in vista, che è
 * l'unica che conta mentre parli.
 *
 * ## ⛔ Perché lo scorrimento lo fa il DOM
 *
 * Le parziali del riconoscitore si RISCRIVONO: «prova» diventa «prova prova» e
 * a volte cambia da capo. Un'animazione a durata fissa andrebbe fuori sincrono
 * alla seconda frase, e una scia che mente su cosa è stato appena detto è
 * peggio di nessuna scia. Qui la coda si aggancia al testo vero, a ogni
 * cambiamento.
 */
const props = defineProps<{
    /** Le parole sentite finora. Vuoto ⇒ non si disegna niente. */
    testo: string
}>()

const contenitore = ref<HTMLElement | null>(null)

watch(() => props.testo, () => {
    void nextTick(() => {
        const elemento = contenitore.value
        if (!elemento) return
        elemento.scrollLeft = elemento.scrollWidth
    })
})
</script>

<template>
    <div
        v-if="props.testo"
        ref="contenitore"
        class="talos-scia"
        data-testid="talos-scia-parole"
        aria-live="polite"
    >
        <!--
            ⛔ `inline-block` sul testo: la larghezza dev'essere quella delle
            PAROLE, se no `scrollWidth` è quella del contenitore e la coda non
            si aggancia mai all'ultima parola.
        -->
        <span class="talos-scia-testo">{{ props.testo }}</span>
    </div>
</template>

<style scoped>
.talos-scia {
    inline-size: 100%;
    overflow-x: hidden;
    /* Una riga SOLA: vedi il commento in testa. */
    white-space: nowrap;
    /* Nessuna barra di scorrimento: si trascina da sola, non si tocca. */
    scrollbar-width: none;
    /*
     * ⭐ Sfuma a sinistra invece di tagliare netto: quello che esce di scena si
     * dissolve, e l'occhio resta sull'ultima parola invece che sul bordo.
     */
    mask-image: linear-gradient(to right, transparent, black 12%, black 100%);
    font-family: var(--talos-font-ui);
    /* ⛔ Dalla SCALA del testo, non da un `rem` assoluto: chi l'ha alzata deve
       poter leggere anche questa riga — è quella che dice se TALOS lo capisce. */
    font-size: calc(0.95rem * var(--talos-ui-scale, 1));
    line-height: 1.4;
    color: color-mix(in oklab, var(--foreground) 78%, transparent);
    text-align: start;
}
.talos-scia::-webkit-scrollbar { display: none; }
.talos-scia-testo {
    display: inline-block;
    padding-inline-start: 12px;
}
</style>
