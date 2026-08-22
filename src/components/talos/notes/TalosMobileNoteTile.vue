<script setup lang="ts">
import { ChevronRight, StickyNote } from '@lucide/vue'
import type { TalosLocalNote } from '@/repositories/chatRepository'

/**
 * Una nota come scheda, nella stessa grammatica della Libreria.
 *
 * Owner 2026-08-05: «le note sia in lista che in card, delle card come se
 * fossero dei post, quindi col titolo sopra e la descrizione sotto».
 *
 * ## Perché è un componente e non un `v-if` nella schermata
 *
 * È la stessa scelta già fatta per i collegamenti salvati: la riga e la scheda
 * mostrano le stesse cose con priorità diverse, e un solo modello fatto di
 * `v-if` sarebbe più difficile da leggere di due, non più facile. Quello che le
 * due condividono davvero — cosa apre, e come si formatta la data — sta fuori da
 * entrambe.
 *
 * ## Perché NON il quadrato, che era la prima idea
 *
 * Le schede della Libreria sono quadrate e sembrava coerente copiarle. Provato
 * sul tablet il 2026-08-06: sbagliato. Il quadrato lega l'altezza alla
 * larghezza, quindi su una griglia stretta la scheda diventa bassa e amputa il
 * testo — la descrizione finiva a metà parola e la data spariva.
 *
 * La differenza è nel contenuto: una scheda di file mostra una MINIATURA, che
 * scala; una nota mostra TESTO, che ha bisogno di righe. Quindi altezza minima e
 * non proporzione fissa: le schede della stessa riga si allineano comunque, ed è
 * quello che fa leggere una griglia come una griglia.
 *
 * La data sta in fondo con `mt-auto`, non subito sotto la descrizione: così
 * tutte le schede allineano la data allo stesso punto anche quando i titoli
 * hanno lunghezze diverse — che è la ragione per cui una griglia si legge come
 * una griglia e non come un elenco disordinato.
 */
defineProps<{
    note: TalosLocalNote
    /** Già formattata: la scheda non sa che ore sono, e non deve saperlo. */
    updatedLabel: string
    untrustedLabel: string
}>()

const emit = defineEmits<{ open: [] }>()
</script>

<template>
    <div
        :data-testid="`talos-note-tile-${note.id}`"
        data-talos-note-tile
        role="listitem"
        class="relative flex min-h-[11rem] flex-col overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]"
    >
        <button
            type="button"
            data-testid="talos-note-open"
            class="talos-pressable flex min-w-0 flex-1 flex-col items-start gap-2 p-3 text-left"
            :aria-label="note.title"
            @click="emit('open')"
        >
            <span class="flex w-full items-center gap-2">
                <StickyNote class="size-6 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <ChevronRight class="ml-auto size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
            </span>
            <!-- Il titolo SOPRA e la descrizione SOTTO, che è la richiesta
                 testuale. Il titolo tiene due righe perché un titolo tagliato a
                 una sola smette di distinguere due note che iniziano uguale. -->
            <span class="line-clamp-2 text-sm font-semibold text-[var(--talos-text)]">{{ note.title }}</span>
            <span class="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-[var(--talos-muted)]">{{ note.content }}</span>
            <span class="mt-auto flex w-full min-w-0 flex-col gap-1 text-2xs text-[var(--talos-muted)]">
                <span class="truncate">{{ updatedLabel }}</span>
                <!-- La stessa etichetta della riga: una nota è contesto
                     NON FIDATO, e la disciplina non cambia con la densità. -->
                <span class="w-fit rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide">{{ untrustedLabel }}</span>
            </span>
        </button>
    </div>
</template>
