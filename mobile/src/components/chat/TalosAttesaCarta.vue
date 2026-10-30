<script setup lang="ts">
/**
 * ⭐ L'ATTESA DELLA CHAT, una per tutta l'app (owner 29/10 sera, mockup «Caricamenti vivi» v6 approvato: D1 «Quella della Chat
 * ovunque»; ledger `LEDGER-CARICAMENTI-VIVI-MOBILE-2026-10-29.md`). Una pagina che aspetta VUOTA (la Chat a freddo, la Libreria, le
 * sessioni del Codice, la ricerca dei Modelli, la voce personale) mostra il velo e la carta che la Chat ha dal 09/08 (owner: «uno
 * spinner al centro con una scritta caricamento chat»), con le stesse classi, copiate da `ChatScreen.vue`.
 *   · Passati 2 s, accanto al testo compaiono i secondi («· 2s», «· 1m 4s», D4), a un solo spazio (D5); prima il testo di sempre, fermo:
 *     niente lampi quando il caricamento è rapido.
 *   · I secondi li dà la riga in corso vera (`TalosRigaInCorso`, approvata il 28/10) con `segno="nessuno"`: la rotella grande è già il
 *     segno. La riga è `compatta`: sta in linea come il paragrafo di prima.
 *   · Un solo `role="status"`, quello della riga (ha già il suo nome coi secondi): il velo non lo ripete.
 *   · `inizio`: l'ora vera dell'evento, se chi aspetta la sa; senza, l'attesa comincia quando la carta compare (lo fa con `v-if`).
 *   · `inline` (owner 29/10 notte, «La carta della Chat, senza velo»): la stessa carta, ma al suo posto e senza il velo su tutto, dove
 *     sotto resta un comando che deve restare toccabile (la voce personale: «Annulla» e la frase sulla privacy).
 */
import { LoaderCircle } from '@lucide/vue'
import TalosRigaInCorso from '@/components/chat/TalosRigaInCorso.vue'
import { useTalosSogliaSecondi } from '@/composables/useTalosSogliaSecondi'

const props = withDefaults(defineProps<{
    testo: string
    /** L'ora dell'evento che ha aperto l'attesa (ms dall'epoca); `null` = da quando la carta compare. */
    inizio?: number | null
    testid?: string
    /** Senza il velo su tutta la pagina: la carta al suo posto, centrata (per i dialoghi con comandi da lasciare liberi). */
    inline?: boolean
}>(), { inizio: null, testid: undefined, inline: false })

// nei primi 2 s il testo di sempre, poi i secondi; la chiave fa rinascere la riga a soglia passata (vedi il composable)
const { inizio: inizioRiga, chiave } = useTalosSogliaSecondi({ inizio: () => props.inizio })
</script>

<template>
    <div
        :data-testid="testid"
        :class="inline
            ? 'flex items-center justify-center'
            : 'fixed inset-0 z-[80] flex items-center justify-center bg-[var(--talos-background)]/75 supports-backdrop-filter:backdrop-blur-sm'"
    >
        <div data-talos-attesa-carta class="flex flex-col items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-card)] px-7 py-6 shadow-xl">
            <LoaderCircle
                class="size-7 text-[var(--talos-accent)] animate-spin"
                aria-hidden="true"
            />
            <TalosRigaInCorso
                :key="chiave"
                compatta
                segno="nessuno"
                :testo="testo"
                :inizio="inizioRiga"
            />
        </div>
    </div>
</template>
