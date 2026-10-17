<script setup lang="ts">
/**
 * ⛔ K3-C1 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`). Owner 15/10/2026: l'header del Codice torna com'era
 * («← · titolo ⌄ · ⌘ · ▤ · •••»), sistemato per il telefono: «Tre in vista + Altro», con Riprendi, Compatta e Doctor nel menu.
 * La striscia «Fermato» no («ha poco senso»): Interrompi e Accoda stanno nel compositore.
 *
 * A fette, senza comandi finti: K3-C1 ←, il titolo e «•••» con Riprendi e Compatta; K3-C2 il ⌄ sul titolo (dettagli e albero)
 * e gli hook del progetto. ⌘ (comandi), ▤ (pannello) e Doctor arrivano con il loro comportamento.
 *
 * Owner 15/10 sera: compatto SOLO sul telefono verticale (sotto 640 px); dal tablet in su come il Codice di oggi, tutto in vista.
 *
 * Il foglio delle azioni è lo stesso di «Azioni messaggio» (`TalosMobileComposerSheet`): dialogo modale, fuoco intrappolato,
 * chiusura col gesto e col pulsante.
 */
import { ref } from 'vue'
import { ArrowLeft, ChevronDown, Command, Download, MoreHorizontal, PanelRight, Play, Share2, Shrink, Stethoscope, Zap } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import './codiceR4.css'

defineProps<{
    titolo: string
    /** Vero mentre un giro lavora: riprendere o compattare adesso non ha senso. */
    occupato: boolean
    /** K3-C3b-1: il pannello ▤ è aperto (foglio sul telefono, colonna sul tablet). */
    pannelloAperto?: boolean
    /** K3-C Esporta e Condividi: c'è una sessione su r4 da esportare (prima del primo messaggio no). */
    conSessione?: boolean
}>()
const emit = defineEmits<{ indietro: [], riprendi: [], compatta: [], dettagli: [], hook: [], comandi: [], doctor: [], pannello: [], esporta: [], condividi: [] }>()

const azioniAperte = ref(false)
function scegli(azione: 'riprendi' | 'compatta' | 'hook' | 'doctor' | 'esporta' | 'condividi'): void {
    azioniAperte.value = false
    if (azione === 'riprendi') emit('riprendi')
    else if (azione === 'compatta') emit('compatta')
    else if (azione === 'doctor') emit('doctor')
    else if (azione === 'esporta') emit('esporta')
    else if (azione === 'condividi') emit('condividi')
    else emit('hook')
}
</script>

<template>
    <header
        data-testid="talos-codice-r4-header"
        class="flex items-center gap-1 px-2 pt-[env(safe-area-inset-top)]"
    >
        <button
            type="button"
            data-testid="talos-codice-r4-indietro"
            class="talos-pressable inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--talos-text)]"
            :aria-label="$t('harness.r4Back')"
            @click="emit('indietro')"
        >
            <ArrowLeft class="size-5" aria-hidden="true" />
        </button>
        <!-- K3-C2: il titolo apre «Albero della sessione» (⌄), come `sessionTitleButton` del Codice di oggi. -->
        <button
            type="button"
            data-testid="talos-codice-r4-dettagli"
            class="talos-pressable flex min-h-touch min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left text-[var(--talos-text)]"
            aria-haspopup="dialog"
            :aria-label="`${$t('harness.r4Details')}: ${titolo}`"
            @click="emit('dettagli')"
        >
            <h1 data-testid="talos-codice-r4-titolo" class="talos-title min-w-0 truncate text-sm font-semibold">{{ titolo }}</h1>
            <ChevronDown class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
        </button>
        <!-- K3-TERM T4 (owner 16/10): col Codice largo «Chat · Terminale» stanno qui, come nel Codice vecchio. -->
        <slot name="viste" />
        <!-- Da 640 px: «•••» in vista apre lo stesso foglio «Altro» (K3-C2b: Doctor e hook; K3-C Esporta e Condividi, 17/10), prima di ▷ e ⊞. -->
        <button
            type="button"
            data-testid="talos-codice-r4-altro-in-vista"
            class="talos-pressable hidden min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--talos-text)] sm:inline-flex"
            aria-haspopup="dialog"
            :aria-expanded="azioniAperte"
            :aria-label="$t('harness.r4More')"
            :title="$t('harness.r4More')"
            @click="azioniAperte = true"
        >
            <MoreHorizontal class="size-5" aria-hidden="true" />
        </button>
        <!--
            ⛔ Owner 15/10 sera: «compatto solo nella versione telefonino portrait; nel tablet … rimane com'è». Da 640 px in su
            (tablet, telefono orizzontale) le azioni stanno in vista come nel Codice di oggi; sotto, nel menu «•••».
        -->
        <button
            type="button"
            data-testid="talos-codice-r4-riprendi-in-vista"
            class="talos-pressable hidden min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--talos-text)] disabled:opacity-50 sm:inline-flex"
            :aria-label="$t('harness.r4Resume')"
            :title="$t('harness.r4Resume')"
            :disabled="occupato"
            @click="emit('riprendi')"
        >
            <Play class="size-5" aria-hidden="true" />
        </button>
        <button
            type="button"
            data-testid="talos-codice-r4-compatta-in-vista"
            class="talos-pressable hidden min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--talos-text)] disabled:opacity-50 sm:inline-flex"
            :aria-label="$t('harness.r4Compact')"
            :title="$t('harness.r4Compact')"
            :disabled="occupato"
            @click="emit('compatta')"
        >
            <Shrink class="size-5" aria-hidden="true" />
        </button>
        <!-- K3-C3a: ⌘ in vista su tutte le larghezze (owner 15/10: «Tre in vista + Altro» sul telefono), dopo ▷ e ⊞ come oggi. -->
        <button
            type="button"
            data-testid="talos-codice-r4-comandi"
            class="talos-pressable inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--talos-text)]"
            aria-haspopup="dialog"
            :aria-label="$t('harness.r4Commands')"
            :title="$t('harness.r4Commands')"
            @click="emit('comandi')"
        >
            <Command class="size-5" aria-hidden="true" />
        </button>
        <!-- K3-C3b-1 (owner 15/10): ▤ in vista su tutte le larghezze, dopo ⌘ (telefono «← · titolo ⌄ · ⌘ · ▤ · •••»). -->
        <button
            type="button"
            data-testid="talos-codice-r4-pannello"
            class="talos-pressable inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--talos-text)]"
            :aria-expanded="pannelloAperto === true"
            :aria-label="$t('harness.r4Panel')"
            :title="$t('harness.r4Panel')"
            @click="emit('pannello')"
        >
            <PanelRight class="size-5" aria-hidden="true" />
        </button>
        <button
            type="button"
            data-testid="talos-codice-r4-altro"
            class="talos-pressable inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--talos-text)] sm:hidden"
            aria-haspopup="dialog"
            :aria-expanded="azioniAperte"
            :aria-label="$t('harness.r4More')"
            :title="$t('harness.r4More')"
            @click="azioniAperte = true"
        >
            <MoreHorizontal class="size-5" aria-hidden="true" />
        </button>
        <TalosMobileComposerSheet
            v-if="azioniAperte"
            :title="$t('harness.r4More')"
            testid="talos-codice-r4-azioni"
            @close="azioniAperte = false"
        >
            <ul class="talos-codice-r4-elenco" role="list">
                <!-- Riprendi e Compatta solo sul telefono: da 640 px sono in vista (▷ ⊞) -->
                <li class="sm:hidden">
                    <button
                        type="button"
                        data-testid="talos-codice-r4-riprendi"
                        class="talos-codice-r4-azione"
                        :disabled="occupato"
                        @click="scegli('riprendi')"
                    >
                        <Play class="talos-codice-r4-azione-icona" aria-hidden="true" />
                        <span>{{ $t('harness.r4Resume') }}</span>
                    </button>
                </li>
                <li class="sm:hidden">
                    <button
                        type="button"
                        data-testid="talos-codice-r4-compatta"
                        class="talos-codice-r4-azione"
                        :disabled="occupato"
                        @click="scegli('compatta')"
                    >
                        <Shrink class="talos-codice-r4-azione-icona" aria-hidden="true" />
                        <span>{{ $t('harness.r4Compact') }}</span>
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        data-testid="talos-codice-r4-doctor"
                        class="talos-codice-r4-azione"
                        @click="scegli('doctor')"
                    >
                        <Stethoscope class="talos-codice-r4-azione-icona" aria-hidden="true" />
                        <span>{{ $t('harness.r4Doctor') }}</span>
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        data-testid="talos-codice-r4-hook"
                        class="talos-codice-r4-azione"
                        @click="scegli('hook')"
                    >
                        <Zap class="talos-codice-r4-azione-icona" aria-hidden="true" />
                        <span>{{ $t('harness.r4Hooks') }}</span>
                    </button>
                </li>
                <!-- K3-C Esporta e Condividi (owner 17/10): leggono soltanto, quindi anche mentre il giro lavora; serve una sessione -->
                <li>
                    <button
                        type="button"
                        data-testid="talos-codice-r4-esporta"
                        class="talos-codice-r4-azione"
                        :disabled="!conSessione"
                        @click="scegli('esporta')"
                    >
                        <Download class="talos-codice-r4-azione-icona" aria-hidden="true" />
                        <span>{{ $t('harness.r4CmdExport') }}</span>
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        data-testid="talos-codice-r4-condividi"
                        class="talos-codice-r4-azione"
                        :disabled="!conSessione"
                        @click="scegli('condividi')"
                    >
                        <Share2 class="talos-codice-r4-azione-icona" aria-hidden="true" />
                        <span class="talos-codice-r4-azione-testo">
                            <span>{{ $t('harness.r4CmdShare') }}</span>
                            <small>{{ $t('harness.r4CmdShareHint') }}</small>
                        </span>
                    </button>
                </li>
            </ul>
        </TalosMobileComposerSheet>
    </header>
</template>
