<script setup lang="ts">
/**
 * La capienza, come nel mockup approvato dall'owner il 2026-08-04.
 *
 * Un componente solo per DUE liste — il catalogo curato e i risultati sfogliati
 * dal Hub. Disegnarla due volte vorrebbe dire vederla divergere: due barre
 * sulla stessa schermata che dicono «al limite» con due gialli diversi
 * insegnano a non fidarsi di nessuna delle due.
 *
 * ## Il segno, che e' la ragione per cui esiste
 *
 * La riga verticale e' la memoria libera di QUESTO telefono. Quando un modello
 * la supera, la barra la **oltrepassa visibilmente** invece di fermarsi al
 * bordo: un limite superato che si vede non ha bisogno di essere letto, ed e'
 * la differenza fra «5,4 GB» — un numero da interpretare — e «guarda, esce».
 *
 * ## I colori
 *
 * `--talos-success` / `--talos-warning` / `--talos-danger`, che il theme engine
 * inverte fra chiaro e scuro perche' sono colori di primo piano. Niente esadecimali
 * scritti a mano: un colore fisso qui sarebbe illeggibile su meta' dei temi.
 */
const props = defineProps<{
    tone: 'ok' | 'tight' | 'over' | 'unknown'
    /** Quanto occupa del disponibile. Oltre 1 significa che sfora. */
    ratio: number | null
    /** La parola dentro l'etichetta: «Ci sta», «Al limite», «Non ci sta». */
    label: string
    /** La dimensione, quando e' una stima letta dal nome. */
    size?: string | null
    /** Vero quando il numero e' stimato e non misurato: si dice, non si nasconde. */
    estimated?: boolean
}>()

/*
 * Il token per tono, in un posto solo.
 *
 * Una mappa invece di tre `:class` sparsi: cosi' il colore di «al limite» si
 * cambia in una riga, e non si scopre dopo che uno dei due gauge era rimasto
 * indietro.
 */
const COLORE = {
    ok: 'var(--talos-success)',
    tight: 'var(--talos-warning)',
    over: 'var(--talos-danger)',
    unknown: 'var(--talos-muted)',
} as const

/**
 * Dove sta il segno della memoria libera.
 *
 * Finche' il modello ci sta, il segno e' in fondo: la barra riempie la sua
 * parte e il limite e' il bordo. Quando sfora, il segno si sposta DENTRO —
 * nel punto in cui il disponibile finisce — e il pieno lo supera. E' l'unico
 * modo perche' «quanto sfora» si veda, invece di leggersi.
 */
const segno = () => (
    props.ratio === null || props.ratio <= 1 ? 100 : (1 / props.ratio) * 100
)
</script>

<template>
    <span
        data-testid="talos-model-fit"
        :data-fit-tone="tone"
        :data-fit-estimated="estimated ? 'true' : 'false'"
        class="flex items-center gap-[var(--talos-space-inline)]"
    >
        <!-- `overflow-visible`: il segno sporge di un pixel sopra e sotto la
             barra, ed e' proprio quel bordo che lo rende leggibile. Tagliarlo
             lo faceva sparire dentro il pieno. -->
        <span
            v-if="ratio !== null"
            data-testid="talos-model-fit-track"
            class="relative h-[calc(var(--talos-space-inline)/2)] min-w-[calc(var(--talos-touch-target)*1.5)] flex-1 rounded-full bg-[var(--talos-active)]"
        >
            <i
                class="absolute inset-y-0 left-0 block rounded-full opacity-90"
                :style="{ width: `${Math.min(100, ratio * 100)}%`, background: COLORE[tone] }"
            ></i>
            <!-- Il segno della memoria libera. Quando il modello sfora si sposta
                 dentro, e il pieno lo supera: è ciò che rende «quanto sfora»
                 una cosa che si vede invece che si legge. -->
            <!-- Il segno si vede: 2px pieni, non un capello all'70%.
                 MISURATO guardando la schermata sul telefono: a un pixel
                 traslucido, 16 GB e 7,8 GB disegnavano la stessa barra, e
                 «quanto sfora» tornava a essere una cosa da leggere. -->
            <b
                v-if="ratio > 1"
                data-testid="talos-model-fit-mark"
                class="absolute -inset-y-[calc(var(--talos-space-inline)/2)] w-[calc(var(--talos-space-inline)/4)] rounded-full bg-[var(--talos-text)]"
                :style="{ left: `${segno()}%` }"
            ></b>
        </span>
        <span
            class="shrink-0 font-mono text-3xs font-semibold tabular-nums"
            :style="{ color: COLORE[tone] }"
        >
            <template v-if="size">{{ estimated ? '~' : '' }}{{ size }} · </template>{{ label }}
        </span>
    </span>
</template>
