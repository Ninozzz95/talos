<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useTalosI18n } from '@/i18n'
import { percheRipiegoR4, testoEsitoCompattazioneR4 } from '@/lib/harness/r4/compattazioneR4'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — il punto in cui la conversazione è stata riassunta, fisso nella chat: due filetti, i
 * numeri, un solo «Annulla» (decisioni dell'owner: «Nella conversazione», come il Codice e il desktop; le parole del
 * desktop, `AVM-integrazione-r4` @ 3ecf7651d, app.js:46930-46935). Dopo l'annullamento resta la frase, senza azione.
 * ⛔ `role="group"`, non `separator`: i figli di un separatore sono presentazionali e «Annulla» sparirebbe dal lettore.
 *
 * ⭐ D-MO-12 (ledger `LEDGER-RIGA-VIVA-CODICE-2026-10-21.md`): nel Codice su r4 la stessa riga dice anche quando il riassunto l'ha
 * fatto TALOS senza il modello («Compattata senza il modello (saltato) · 31,2k → 9,9k», B1 del desktop) e quando non è riuscito
 * («Conversazione non riassunta · <motivo>»). Il perché del ripiego, che sul desktop sta nel suggerimento, qui si apre col tocco
 * sulla frase e si chiude col tocco dopo (decisione dell'owner 21/10). La chat non passa le prop nuove e resta com'era.
 */
// ⛔ `withDefaults`: una prop booleana assente Vue la fa `false`, e la chat (che non passa `annullabile`) perdeva «Annulla»
const props = withDefaults(defineProps<{
    tokenPrima: number | null
    tokenDopo: number | null
    annullata: boolean
    /** L'annullamento è partito e non è ancora tornato: l'azione resta visibile ma spenta. */
    inAnnullamento?: boolean
    /** Il riassunto l'ha fatto TALOS senza il modello (contratto §3) e perché (`tempo`, `saltato`, …). */
    ripiego?: boolean
    ragione?: string | null
    /** `false` per la compattazione a mano, che non ha un record da annullare. */
    annullabile?: boolean
    stato?: 'riassunta' | 'non-riuscita'
    motivo?: string | null
    dettaglio?: string | null
}>(), { annullabile: true, ripiego: false, inAnnullamento: false })
const emit = defineEmits<{ annulla: [] }>()
const { t, locale } = useTalosI18n()
const idEtichetta = `talos-compaction-${useId()}`
const idPerche = `talos-compaction-why-${useId()}`
const perAperto = ref(false)
const traduci = (chiave: string, valori?: Record<string, string | number>) => t(chiave, valori)
// Stessa regola dei numeri del desktop: `Intl.NumberFormat` della lingua (in italiano «2526», «14.273»).
const formato = computed(() => new Intl.NumberFormat(locale.value === 'it' ? 'it-IT' : 'en-US'))
const nonRiuscita = computed(() => props.stato === 'non-riuscita')
const conPerche = computed(() => !props.annullata && !nonRiuscita.value && props.ripiego === true)
const etichetta = computed(() => {
    if (props.annullata) return t('chat.compaction.undoneRow')
    const esito = testoEsitoCompattazioneR4({
        stato: nonRiuscita.value ? 'non-riuscita' : 'riassunta',
        tokenPrima: props.tokenPrima, tokenDopo: props.tokenDopo, ripiego: props.ripiego, ragione: props.ragione,
        motivo: props.motivo, dettaglio: props.dettaglio,
    }, traduci, locale.value)
    if (esito) return esito
    if (Number.isFinite(props.tokenPrima) && Number.isFinite(props.tokenDopo)) {
        return t('chat.compaction.summarizedRow', {
            before: formato.value.format(props.tokenPrima as number),
            after: formato.value.format(props.tokenDopo as number),
        })
    }
    return t('chat.compaction.summarized')
})
const perche = computed(() => percheRipiegoR4(props.ragione, traduci))
const conAnnulla = computed(() => !props.annullata && !nonRiuscita.value && props.annullabile !== false)
</script>

<template>
    <div class="talos-compaction-wrap">
        <div
            role="group"
            :aria-labelledby="idEtichetta"
            data-testid="talos-compaction-row"
            :data-undone="annullata ? 'true' : undefined"
            :data-fallback="conPerche ? 'true' : undefined"
            :data-failed="nonRiuscita ? 'true' : undefined"
            class="talos-compaction-row text-xs leading-5"
        >
            <button
                v-if="conPerche"
                :id="idEtichetta"
                type="button"
                data-testid="talos-compaction-why-toggle"
                class="talos-compaction-row__label talos-compaction-row__label--toggle talos-pressable"
                :aria-expanded="perAperto ? 'true' : 'false'"
                :aria-controls="perAperto ? idPerche : undefined"
                @click="perAperto = !perAperto"
            >{{ etichetta }}</button>
            <span v-else :id="idEtichetta" class="talos-compaction-row__label">{{ etichetta }}</span>
            <button
                v-if="conAnnulla"
                type="button"
                data-testid="talos-compaction-undo"
                class="talos-compaction-row__undo talos-pressable"
                :disabled="inAnnullamento"
                @click="emit('annulla')"
            >
                {{ t('chat.compaction.undo') }}
            </button>
        </div>
        <p v-if="conPerche && perAperto" :id="idPerche" data-testid="talos-compaction-why" class="talos-compaction-why text-xs leading-5">
            {{ perche }}
        </p>
    </div>
</template>

<style scoped>
.talos-compaction-wrap {
    width: 100%;
    min-width: 0;
    margin-block: 1rem;
}
.talos-compaction-row {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: 0.625rem;
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
/* La frase del ripiego è anche il pulsante del perché: 44 px di bersaglio, sottolineata a puntini come un termine che si spiega. */
.talos-compaction-row__label--toggle {
    min-height: 44px;
    padding-inline: 0.25rem;
    border-radius: 0.375rem;
    color: inherit;
    text-decoration: underline dotted;
    text-underline-offset: 3px;
}
.talos-compaction-row__label--toggle:focus-visible {
    outline: 2px solid var(--talos-accent);
    outline-offset: 2px;
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
.talos-compaction-why {
    max-width: 36rem;
    margin: 0.25rem auto 0;
    color: var(--talos-muted);
    text-align: center;
}
</style>
