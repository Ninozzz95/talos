<script setup lang="ts">
import { computed, useId } from 'vue'
import { useTalosI18n } from '@/i18n'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — il punto in cui la conversazione è stata riassunta, fisso nella chat: due filetti, i
 * numeri, un solo «Annulla» (decisioni dell'owner: «Nella conversazione», come il Codice e il desktop; le parole del
 * desktop, `AVM-integrazione-r4` @ 3ecf7651d, app.js:46930-46935). Dopo l'annullamento resta la frase, senza azione.
 * ⛔ `role="group"`, non `separator`: i figli di un separatore sono presentazionali e «Annulla» sparirebbe dal lettore.
 */
const props = defineProps<{
    tokenPrima: number | null
    tokenDopo: number | null
    annullata: boolean
    /** L'annullamento è partito e non è ancora tornato: l'azione resta visibile ma spenta. */
    inAnnullamento?: boolean
}>()
const emit = defineEmits<{ annulla: [] }>()
const { t, locale } = useTalosI18n()
const idEtichetta = `talos-compaction-${useId()}`

// Stessa regola dei numeri del desktop: `Intl.NumberFormat` della lingua (in italiano «2526», «14.273»).
const formato = computed(() => new Intl.NumberFormat(locale.value === 'it' ? 'it-IT' : 'en-US'))
const etichetta = computed(() => {
    if (props.annullata) return t('chat.compaction.undoneRow')
    if (Number.isFinite(props.tokenPrima) && Number.isFinite(props.tokenDopo)) {
        return t('chat.compaction.summarizedRow', {
            before: formato.value.format(props.tokenPrima as number),
            after: formato.value.format(props.tokenDopo as number),
        })
    }
    return t('chat.compaction.summarized')
})
</script>

<template>
    <div
        role="group"
        :aria-labelledby="idEtichetta"
        data-testid="talos-compaction-row"
        :data-undone="annullata ? 'true' : undefined"
        class="talos-compaction-row text-xs leading-5"
    >
        <span :id="idEtichetta" class="talos-compaction-row__label">{{ etichetta }}</span>
        <button
            v-if="!annullata"
            type="button"
            data-testid="talos-compaction-undo"
            class="talos-compaction-row__undo talos-pressable"
            :disabled="inAnnullamento"
            @click="emit('annulla')"
        >
            {{ t('chat.compaction.undo') }}
        </button>
    </div>
</template>

<style scoped>
.talos-compaction-row {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: 0.625rem;
    margin-block: 1rem;
    color: var(--talos-muted);
    font-variant-numeric: tabular-nums;
}
.talos-compaction-row::before,
.talos-compaction-row::after {
    content: "";
    flex: 1 1 1rem;
    height: 1px;
    background: var(--talos-border);
}
.talos-compaction-row__label {
    min-width: 0;
    text-align: center;
    overflow-wrap: anywhere;
}
.talos-compaction-row__undo {
    flex: none;
    min-height: 44px;
    padding-inline: 0.375rem;
    border-radius: 0.375rem;
    color: var(--talos-accent);
    font-weight: 600;
}
.talos-compaction-row__undo:disabled {
    opacity: 0.5;
    cursor: default;
}
.talos-compaction-row__undo:focus-visible {
    outline: 2px solid var(--talos-accent);
    outline-offset: 2px;
}
</style>
