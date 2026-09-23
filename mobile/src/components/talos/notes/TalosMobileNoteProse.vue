<script setup lang="ts">
/**
 * Una nota, letta come prosa invece che come un blocco di testo.
 *
 * ## Che cosa fa, e cosa NON fa
 *
 * Riconosce quattro forme — titolo interno, citazione, punto elenco,
 * paragrafo — e le disegna diverse. Non è un renderer Markdown: una nota è
 * contenuto NON ATTENDIBILE (`trust_level: 'untrusted'`), e un renderer vero
 * porterebbe con sé link, immagini e HTML, cioè tre modi perché una nota faccia
 * qualcosa invece di dire qualcosa. Qui il testo resta testo: l'unica cosa che
 * cambia è come è impaginato.
 *
 * Il riconoscimento sta in `noteShape.ts`, non qui, perché la stessa risposta
 * serve anche alla riga dell'elenco e al conteggio delle spunte.
 *
 * ## Le due densità
 *
 * `preview` è la scheda: caratteri piccoli, la citazione appena più grande del
 * resto perché è la cosa che si è voluta ricordare. `full` è la pagina: corpo
 * più largo, interlinea alta, e la citazione diventa l'elemento più grande
 * della pagina dopo il titolo. È lo stesso salto del mockup
 * (`.p-full-prose blockquote` a `--text-xl`).
 */
import type { TalosNoteBlock } from '@/components/talos/notes/noteShape'

const props = withDefaults(defineProps<{
    blocks: readonly TalosNoteBlock[]
    variant?: 'preview' | 'full'
}>(), { variant: 'preview' })
</script>

<template>
    <div
        data-testid="talos-note-prose"
        :class="[
            'min-w-0 [overflow-wrap:anywhere]',
            props.variant === 'full'
                ? 'text-base leading-[1.9] text-[var(--talos-text)]'
                : 'text-xsm leading-[1.75] text-[var(--talos-muted)]',
        ]"
    >
        <template v-for="(block, index) in props.blocks" :key="index">
            <!-- Un titolo interno: stesso corpo, colore del testo pieno e peso.
                 Non maiuscoletto e non un corpo più grande — dentro un appunto
                 è un'intestazione, non un secondo titolo della pagina. -->
            <p
                v-if="block.kind === 'heading'"
                class="font-semibold text-[var(--talos-text)]"
            >{{ block.text }}</p>
            <!-- La citazione, col filo d'accento a sinistra: è l'unico posto in
                 cui una nota alza la voce, e nel mockup è ciò che distingue un
                 «Pensiero» da un appunto qualunque. -->
            <blockquote
                v-else-if="block.kind === 'quote'"
                :class="[
                    'border-l-2 border-[var(--talos-accent-border)] pl-[var(--talos-space-control)] text-[var(--talos-text)]',
                    props.variant === 'full'
                        ? 'my-[var(--talos-space-section)] text-xl leading-[1.8]'
                        : 'my-[3px] text-md leading-[1.7]',
                ]"
            >{{ block.text }}</blockquote>
            <p
                v-else-if="block.kind === 'bullet'"
                class="relative pl-[var(--talos-space-control)] before:absolute before:left-0 before:content-['·']"
            >{{ block.text }}</p>
            <p v-else-if="block.kind === 'paragraph'" class="whitespace-pre-wrap">{{ block.text }}</p>
            <!-- Una riga vuota è uno STACCO, non un paragrafo vuoto: un `<p>`
                 vuoto avrebbe l'altezza di una riga di testo e chi legge con lo
                 screen reader sentirebbe un paragrafo che non c'è. -->
            <span v-else aria-hidden="true" class="block h-[0.6em]" />
        </template>
    </div>
</template>
