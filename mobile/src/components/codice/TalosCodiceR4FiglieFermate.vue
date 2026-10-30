<script setup lang="ts">
/**
 * «Ferma tutto» (owner 29/10/2026): la riga della chat dopo uno Stop che ha fermato anche gli agenti, dall'evento DUREVOLE
 * `talos.figlie-fermate { quante, ids, da }` (contratto §1 e §5): la disegnano uguale telefono e PC, anche alla rigiocata.
 * PEZZO VERO: va in `src/components/codice/TalosCodiceR4FiglieFermate.vue`, ramo nuovo di `TalosCodiceR4RigaDiSistema.vue:51-59`, accanto a `:56`
 * (come `TalosCodiceR4Fermato`), voce in `metadata[TALOS_METADATA_FIGLIE_FERMATE]` scritta da `eventiR4.ts` nel ramo `CUSTOM` (`:621`).
 * ⛔ Nessun pezzo nuovo: è la nota dello Stop che c'è già, `TalosCodiceR4Fermato.vue:20-31` (stesso riquadro, stesso segno ⏹ d'accento,
 * stesse righe «cosa» e «perché», `role="status"`: è una notizia, non un allarme). Senza la riga del distintivo: la nota «Hai fermato il
 * giro» le sta subito sopra e il distintivo lo porta già lei.
 */
import { computed } from 'vue'
import { CircleStop } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { testoFermaTuttoR4, type VoceFiglieFermateR4 } from '@/lib/harness/r4/fermaTuttoR4'

const props = defineProps<{ voce: VoceFiglieFermateR4 }>()
const { locale } = useTalosI18n()
// «anche» solo quando lavorava anche la chat: `chatFerma` (Desktop 29/10 sera) o il modello → «Fermati N agenti»
const cosa = computed(() => testoFermaTuttoR4(props.voce.chatFerma || props.voce.da === 'modello' ? 'riga.fermateSenzaGiro' : 'riga.fermate', locale.value, props.voce.quante))
const perche = computed(() => testoFermaTuttoR4('riga.inCoda', locale.value))
const dalModello = computed(() => (props.voce.da === 'modello' ? testoFermaTuttoR4('riga.dalModello', locale.value) : ''))
</script>

<template>
    <section
        data-testid="talos-codice-r4-figlie-fermate"
        :data-da="voce.da"
        role="status"
        class="w-full min-w-0 max-w-[72ch] rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2.5 text-[var(--talos-text)]"
    >
        <p data-parte="cosa" class="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-5">
            <CircleStop class="size-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <span class="min-w-0">{{ cosa }}</span>
        </p>
        <p v-if="dalModello" data-parte="da" class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ dalModello }}</p>
        <p data-parte="perche" class="mt-1 text-sm leading-5 text-[var(--talos-muted)] [overflow-wrap:anywhere]">{{ perche }}</p>
    </section>
</template>
