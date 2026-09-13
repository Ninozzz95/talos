<script setup lang="ts">
/**
 * In che stato è una memoria, come lo si legge a colpo d'occhio.
 *
 * Portato dal mockup «Talos Calm Finale», `pStatus` (`src/app.js:119`) e
 * `.p-state` (`section-personalities.css:84-89`): una pastiglia piccola con
 * un'icona e una parola, colorata per famiglia — verde quando la cosa è viva,
 * ambra quando è ferma, rosso quando chiede attenzione.
 *
 * ## ⛔ Perché il colore non è mai l'unico segnale
 *
 * Perché una pastiglia verde e una ambra sono la stessa pastiglia per chi non
 * distingue i due colori. Qui cambiano insieme **tre** cose: il colore, l'ICONA
 * (spunta / pausa / punto interrogativo) e la PAROLA. Ognuna delle tre da sola
 * basta a rispondere, ed è quello che rende il badge leggibile anche stampato
 * in bianco e nero o con i colori forzati dal sistema.
 *
 * ## Perché tre stati e non due
 *
 * `active` la porta nelle prossime conversazioni; `paused` è una decisione
 * dell'utente; `review` sono le righe che il MODELLO ha proposto e che nessuno
 * ha ancora guardato (`quarantined`/`rejected`). Chiamare «in pausa» anche la
 * terza vorrebbe dire attribuire all'utente una decisione che non ha preso —
 * vedi `memoryShape.ts`.
 */
import { computed } from 'vue'
import { Check, CircleHelp, Pause } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { talosMemoryStateLabelKey, type TalosMemoryState } from '@/components/talos/memory/memoryShape'

const props = withDefaults(defineProps<{
    state: TalosMemoryState
    testId?: string
}>(), { testId: undefined })

const { t } = useTalosI18n()

const icon = computed(() => ({
    active: Check,
    paused: Pause,
    review: CircleHelp,
}[props.state]))

const tono = computed(() => ({
    active: 'bg-[var(--talos-success-soft)] text-[var(--talos-success)]',
    paused: 'bg-[var(--talos-warning-soft)] text-[var(--talos-warning)]',
    review: 'bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]',
}[props.state]))

const label = computed(() => t(talosMemoryStateLabelKey(props.state)))
</script>

<template>
    <span
        :data-testid="props.testId"
        :data-memory-state="props.state"
        class="inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[var(--talos-radius-control)] px-[7px] py-[4px] text-2xs leading-[1.5]"
        :class="tono"
    >
        <component :is="icon" class="size-3 shrink-0" aria-hidden="true" />
        <span>{{ label }}</span>
    </span>
</template>
