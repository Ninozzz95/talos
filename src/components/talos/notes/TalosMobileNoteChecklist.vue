<script setup lang="ts">
/**
 * Le spunte di una nota, come si vedono.
 *
 * ## ⛔ Perché NON si possono spuntare da qui
 *
 * Nel mockup le caselle sono bottoni: si tocca e la spunta cambia. Farlo qui
 * vorrebbe dire RISCRIVERE il contenuto della nota a ogni tocco — un
 * `updateNote` che rimonta il testo riga per riga — ed è una funzione a sé, con
 * le sue domande (cosa succede se due schermate scrivono insieme? la data di
 * modifica si muove?). La sezione 2 chiedeva tre cose, e questa non è nessuna
 * delle tre.
 *
 * Quindi la casella qui **non è un bottone**: è un segno. Un controllo che
 * sembra premibile e non fa niente è peggio di un testo onesto — la persona
 * tocca, non succede nulla, e conclude che l'app è rotta. Quando le spunte
 * diventeranno vive, questo componente diventa la loro casa e il markup cambia
 * in `role="checkbox"` senza che il resto si accorga di niente.
 *
 * ## Perché quattro, nell'anteprima
 *
 * Perché la scheda ANTICIPA e la pagina CONTIENE — la stessa regola già scritta
 * nella schermata per le due righe di testo. Sotto le quattro c'è il conto di
 * quante ne restano, che è l'informazione che serve per decidere se aprirla.
 */
import { computed } from 'vue'
import { Check } from '@lucide/vue'
import type { TalosNoteCheckItem } from '@/components/talos/notes/noteShape'

const props = withDefaults(defineProps<{
    items: readonly TalosNoteCheckItem[]
    variant?: 'preview' | 'full'
    /** «3 di 7 punti spuntati», già composta da chi ha l'i18n. */
    stateLabel: string
    /** «Altri 3 punti», già composta. Serve solo all'anteprima. */
    moreLabel?: string
    previewLimit?: number
}>(), { variant: 'preview', previewLimit: 4 })

const shown = computed(() => (
    props.variant === 'full' ? props.items : props.items.slice(0, props.previewLimit)
))
const hidden = computed(() => props.items.length - shown.value.length)
</script>

<template>
    <ul
        data-testid="talos-note-checklist"
        :aria-label="props.stateLabel"
        :class="[
            'flex min-w-0 flex-col text-left',
            props.variant === 'full'
                ? 'gap-[var(--talos-space-inline)] text-sm leading-[1.7]'
                : 'gap-[var(--talos-space-inline)] text-xsm leading-[1.6]',
        ]"
    >
        <li
            v-for="item in shown"
            :key="item.index"
            data-testid="talos-note-check-line"
            :data-checked="item.done"
            :class="[
                'flex items-start gap-[var(--talos-space-inline)]',
                props.variant === 'full' ? 'min-h-touch items-center py-[var(--talos-space-inline)]' : '',
            ]"
        >
            <!-- Il quadrato: pieno d'accento quando è fatto, contornato quando
                 no. Il segno di spunta DENTRO, non solo il colore. -->
            <span
                aria-hidden="true"
                :class="[
                    'grid shrink-0 place-items-center rounded-[5px] border-[1.5px]',
                    props.variant === 'full' ? 'size-5 mt-0' : 'size-4 mt-[0.15em]',
                    item.done
                        ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)]'
                        : 'border-[var(--talos-border-strong)] text-transparent',
                ]"
            >
                <Check v-if="item.done" :class="props.variant === 'full' ? 'size-4' : 'size-3'" aria-hidden="true" />
            </span>
            <!-- Barrato E smorzato: due segnali, perché il barrato da solo su
                 un titolo corto si legge male e il colore da solo non basta. -->
            <span
                :class="item.done
                    ? 'line-through decoration-[var(--talos-border-strong)] text-[var(--talos-muted)]'
                    : 'text-[var(--talos-text)]'"
            >{{ item.text }}</span>
        </li>
        <li
            v-if="hidden > 0 && props.moreLabel"
            data-testid="talos-note-check-more"
            class="text-2xs text-[var(--talos-muted)]"
        >{{ props.moreLabel }}</li>
    </ul>
</template>
