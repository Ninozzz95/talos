<script setup lang="ts">
/**
 * ⭐ LA RIGA IN CORSO, una per tutta l'app (owner 27/10/2026: «ogni riga in corso deve essere animata e con un counter di secondi,
 * mi raccomando nulla deve fare sembrare la ui bloccata»; bozzetto approvato il 28/10, `.claude/mockup/righe-in-corso-approvato-…`).
 * Segno animato · frase · [dettaglio] · secondi dall'ora dell'evento (`useTalosTrascorso`).
 *   · Tre segni, gli stessi che l'app ha già: il puntino che pulsa (`talos-typing-pulse`) per il lavoro; la linea del marchio
 *     (`TalosLineLoader`) per le attese di qualcun altro (il computer, il modello, la linea); il cerchio che gira per «apro…».
 *   · Col movimento ridotto il segno pulsa piano invece di fermarsi (CALMO di style.css, `7eef7d69c`), i secondi continuano.
 *   · Senza un'ora d'evento la riga c'è, i secondi no.
 *   · `nessuno` (owner 28/10, R4): dove un segno animato c'è già accanto (l'orb dell'attesa della prima parola), la riga porta solo
 *     frase e secondi — regola del 13/09 «solo l'orb con l'anello», niente secondo segno.
 * Owner 29/10 sera (mockup «Caricamenti vivi» v6 approvato, ledger `LEDGER-CARICAMENTI-VIVI-MOBILE-2026-10-29.md`):
 *   · D1 «la rotella della Chat ovunque»: il cerchio che gira è ARANCIONE, come la rotella della Chat;
 *   · D5 un solo spazio prima di «· Ns»: lo spazio della riga (0,5rem) più il puntino sembravano due spazi; i dati tornano indietro di
 *     0,25rem;
 *   · `compatta`: la riga in linea (nella carta d'attesa, nei fogli), senza l'altezza minima di 2rem.
 * ⛔ Lo stile sta in classi Tailwind già usate dall'app, non in uno `<style>`: con la carta d'attesa della Chat la riga entra nel pezzo
 * d'avvio, e il CSS d'avvio ha 212 byte di margine (239.788 su 240.000). I nomi `talos-riga-in-corso*` restano come agganci.
 */
import { computed } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import TalosLineLoader from '@/components/brand/TalosLineLoader.vue'
import { talosTrascorsoEtichetta, useTalosTrascorso } from '@/composables/useTalosTrascorso'

const props = withDefaults(defineProps<{
    testo: string
    /** L'ora dell'evento che ha aperto lo stato (ms dall'epoca); `null` = non la si sa. */
    inizio: number | null
    segno?: 'puntino' | 'linea' | 'giro' | 'nessuno'
    /** Un dato vero in più (es. «64%», «tentativo 2»). */
    dettaglio?: string
    tono?: 'normale' | 'avviso'
    /** In linea, senza l'altezza minima della riga (la carta d'attesa, i fogli). */
    compatta?: boolean
}>(), { segno: 'puntino', dettaglio: '', tono: 'normale', compatta: false })

const secondi = useTalosTrascorso(() => props.inizio)
const durata = computed(() => (secondi.value === null ? '' : talosTrascorsoEtichetta(secondi.value)))
const nome = computed(() => [props.testo, props.dettaglio, durata.value].filter(Boolean).join(', '))
</script>

<template>
    <div
        class="talos-riga-in-corso flex min-w-0 items-center gap-2 text-sm"
        :class="[
            `is-${tono}`,
            tono === 'avviso' ? 'text-[var(--talos-warning)]' : 'text-[var(--talos-muted)]',
            { 'min-h-8': !compatta },
        ]"
        role="status"
        :aria-label="nome"
        data-testid="talos-riga-in-corso"
    >
        <span v-if="segno !== 'nessuno'" class="talos-riga-in-corso__segno inline-flex min-w-4 shrink-0 items-center justify-center" aria-hidden="true">
            <TalosLineLoader v-if="segno === 'linea'" :width="36" />
            <LoaderCircle
                v-else-if="segno === 'giro'"
                data-testid="talos-riga-in-corso-giro"
                class="talos-riga-in-corso__giro size-4 text-[var(--talos-accent)] animate-spin"
            />
            <span v-else class="talos-typing-pulse" />
        </span>
        <span class="talos-riga-in-corso__testo min-w-0 truncate" aria-hidden="true">{{ testo }}</span>
        <span v-if="dettaglio" class="talos-riga-in-corso__dato -ml-1 shrink-0 tabular-nums" aria-hidden="true">· {{ dettaglio }}</span>
        <span v-if="durata" class="talos-riga-in-corso__dato -ml-1 shrink-0 tabular-nums" data-testid="talos-riga-in-corso-durata" aria-hidden="true">· {{ durata }}</span>
    </div>
</template>
