<script setup lang="ts">
/**
 * ⛔ K3 Stop come il desktop (ledger `LEDGER-K3-STOP-2026-10-16.md`; owner 16/10 «Come il desktop»). Lo Stop chiesto dalla persona
 * nella conversazione del Codice: la nota d'accento del desktop r4 (`creaNotaErrore` con la vestizione `fermato`) al posto della
 * carta rossa «Errore di esecuzione». Stessa forma — badge, titolo, cosa, perché, cosa puoi fare, il testo del server richiuso —
 * e tono diverso: è una notizia (`role="status"`), non un allarme.
 */
import { computed } from 'vue'
import { ChevronRight, CircleStop } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { VoceFermatoR4 } from '@/lib/harness/r4/fermatoChiave'
import { cartaFermatoR4 } from '@/lib/harness/r4/fermatoR4'

const props = defineProps<{ voce: VoceFermatoR4 }>()
const { locale } = useTalosI18n()
const carta = computed(() => cartaFermatoR4(props.voce.tecnico, locale.value))
</script>

<template>
    <section
        data-testid="talos-codice-r4-fermato"
        role="status"
        class="w-full min-w-0 max-w-[72ch] rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2.5 text-[var(--talos-text)]"
    >
        <p class="flex min-w-0 items-center gap-1.5 text-2xs leading-4">
            <CircleStop class="size-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <span data-parte="badge" class="shrink-0 text-[var(--talos-accent)]">{{ carta.badge }}</span>
            <span data-parte="titolo" class="min-w-0 truncate text-[var(--talos-muted)]">{{ carta.titolo }}</span>
        </p>
        <p data-parte="cosa" class="mt-1 text-sm font-medium leading-5">{{ carta.cosa }}</p>
        <p data-parte="perche" class="mt-1 text-sm leading-5 text-[var(--talos-muted)] [overflow-wrap:anywhere]">{{ carta.perche }}</p>
        <ul v-if="carta.rimedi.length" class="mt-1.5 space-y-0.5">
            <li v-for="rimedio in carta.rimedi" :key="rimedio" data-parte="rimedio" class="text-xs leading-5">{{ rimedio }}</li>
        </ul>
        <details v-if="carta.tecnico" class="talos-codice-r4-fermato__grezzo mt-1">
            <summary class="min-h-touch gap-1 text-xs text-[var(--talos-muted)]">
                <ChevronRight class="talos-codice-r4-fermato__freccia size-3.5 shrink-0" aria-hidden="true" />{{ carta.etichettaTecnico }}
            </summary>
            <pre data-parte="tecnico" class="whitespace-pre-wrap break-words pb-1 font-mono text-2xs leading-4 text-[var(--talos-muted)] [overflow-wrap:anywhere]">{{ carta.tecnico }}</pre>
        </details>
    </section>
</template>

<style scoped>
/* Il «Testo del server» richiuso, come le «Opzioni offerte» della carta delle domande: la freccetta dice che si apre, 44 px di tocco. */
.talos-codice-r4-fermato__grezzo > summary { display: flex; align-items: center; cursor: pointer; list-style: none; }
.talos-codice-r4-fermato__grezzo > summary::-webkit-details-marker { display: none; }
.talos-codice-r4-fermato__grezzo > summary:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: 1px; border-radius: 0.25rem; }
.talos-codice-r4-fermato__grezzo[open] .talos-codice-r4-fermato__freccia { transform: rotate(90deg); }
</style>
