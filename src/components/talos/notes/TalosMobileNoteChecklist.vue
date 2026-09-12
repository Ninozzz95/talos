<script setup lang="ts">
/**
 * Le spunte modificano la riga markdown tramite la schermata e lo store.
 * Lo stato mostrato è sempre quello salvato, anche nell'anteprima.
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
    saving?: boolean
}>(), { variant: 'preview', previewLimit: 4 })

const emit = defineEmits<{ toggle: [index: number] }>()

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
            <button
                type="button"
                role="checkbox"
                :aria-checked="item.done"
                :aria-label="item.text"
                :disabled="props.saving"
                class="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-[var(--talos-radius-control)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                @pointerdown.stop
                @click.stop="emit('toggle', item.index)"
            >
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
            </button>
            <!-- Barrato E smorzato: due segnali, perché il barrato da solo su
                 un titolo corto si legge male e il colore da solo non basta. -->
            <span
                class="self-center"
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
