<script setup lang="ts">
import { Check } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'

/**
 * Il foglio «Opzioni» di una stazione — fase 6, owner 14/09/2026.
 *
 * Memoria, Note, Ricerca e Attività ordinavano con un `<select>` nativo: disegnato
 * da Android col suo radio turchese, fuori dalla palette, mentre la Libreria dal
 * 14/09 ha il suo foglio dal basso. Qui la stessa forma, UNA volta per quattro
 * stazioni: stesso foglio (`TalosMobileComposerSheet`), stessa voce a riquadro
 * (`TalosThemedFilter`, un radiogroup vero), criteri propri di ciascuna.
 *
 * Una seconda sezione facoltativa, «Mostra», porta i filtri che non stanno fra le
 * schede — in Ricerca annullate, fallite e senza rapporto (owner: quattro schede e
 * il resto nel foglio). Material 3: oltre poche scelte le schede non bastano più
 * (https://m3.material.io/components/chips/guidelines, letto il 2026-09-14).
 *
 * Il foglio resta aperto dopo una scelta, come nella Libreria: si chiude col suo ✕,
 * col gesto Indietro o toccando fuori.
 */
interface TalosStationOption { readonly value: string; readonly label: string; readonly count?: number }

const props = withDefaults(defineProps<{
    title: string
    testIdPrefix: string
    sortLabel: string
    sortOptions: readonly TalosStationOption[]
    sort: string
    showLabel?: string
    showOptions?: readonly TalosStationOption[]
    show?: string | null
}>(), { showLabel: '', showOptions: () => [], show: null })

const emit = defineEmits<{
    'update:sort': [value: string]
    'update:show': [value: string]
    close: []
}>()

/** La stessa voce a riquadro del foglio del contesto in chat e della Libreria. */
function optionClass(selected: boolean): string {
    const base = 'talos-pressable flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm'
    return selected
        ? `${base} border-[var(--talos-accent)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]`
        : `${base} border-[var(--talos-border)] text-[var(--talos-muted)]`
}

function withTestIds(options: readonly TalosStationOption[], kind: 'sort' | 'show') {
    return options.map((option) => ({ ...option, testId: `${props.testIdPrefix}-${kind}-${option.value}` }))
}
</script>

<template>
    <TalosMobileComposerSheet
        :title="title"
        :testid="`${testIdPrefix}-options-sheet`"
        @close="emit('close')"
    >
        <section>
            <h3 class="text-sm font-medium text-[var(--talos-text)]">{{ sortLabel }}</h3>
            <TalosThemedFilter
                group-class="mt-2 grid gap-2"
                :model-value="sort"
                :options="withTestIds(sortOptions, 'sort')"
                :group-label="sortLabel"
                :option-class="optionClass"
                @update:model-value="(value: string) => emit('update:sort', value)"
            >
                <template #option="{ option, selected }">
                    <span class="min-w-0 flex-1">{{ option.label }}</span>
                    <Check v-if="selected" class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                </template>
            </TalosThemedFilter>
        </section>

        <section v-if="showOptions.length > 0" class="border-t border-[var(--talos-border)] pb-2 pt-3">
            <h3 class="text-sm font-medium text-[var(--talos-text)]">{{ showLabel }}</h3>
            <TalosThemedFilter
                group-class="mt-2 grid gap-2"
                :model-value="show ?? ''"
                :options="withTestIds(showOptions, 'show')"
                :group-label="showLabel"
                :option-class="optionClass"
                @update:model-value="(value: string) => emit('update:show', value)"
            >
                <template #option="{ option, selected }">
                    <span class="min-w-0 flex-1">{{ option.label }}</span>
                    <small class="text-2xs tabular-nums text-[var(--talos-muted)]">{{ (option as TalosStationOption).count }}</small>
                    <Check v-if="selected" class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                </template>
            </TalosThemedFilter>
        </section>
    </TalosMobileComposerSheet>
</template>
