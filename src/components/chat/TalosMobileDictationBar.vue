<script setup lang="ts">
import { Check, Square, X } from '@lucide/vue'
import TalosMicWaveform from '@/components/brand/TalosMicWaveform.vue'
import TalosSciaParole from '@/components/brand/TalosSciaParole.vue'

/**
 * ⭐ LA BARRA DELLA DETTATURA — annulla, ferma, invia, e le parole mentre le dici.
 *
 * ⛔ Vive in un componente suo, caricato quando serve, per una misura: dentro al
 * compositore portava il grafo d'avvio a 601.684 byte su un tetto di 600.000
 * (compito #51). Questa barra esiste solo MENTRE si detta — chi scrive a
 * tastiera non deve pagarla.
 */
const props = defineProps<{
    avvio: boolean
    livello: number
    trascrizione: string
    bozza: string
}>()
const emit = defineEmits<{ annulla: []; ferma: []; invia: [] }>()
</script>

<template>
        <div
            
            data-testid="talos-dictation-live"
            class="talos-dictation-live flex flex-col gap-2 rounded-2xl border border-[var(--talos-accent,var(--primary))]/30 bg-[color-mix(in_srgb,var(--talos-accent,#c08b3c)_10%,transparent)] px-2 py-2"
        >
            <!-- ⛔⛔ LE PAROLE MENTRE LE DICI — owner 2026-08-10, con lo
                 screenshot di Claude a riferimento.
                 Il difetto era invisibile e grave: le parziali ARRIVAVANO gia' e
                 finivano nella bozza, ma la bozza durante la dettatura e'
                 NASCOSTA (questa barra prende il posto del campo). Si parlava
                 al buio, con la sola onda a dire «ti sento» — e l'onda reagisce
                 al rumore, non alle parole. Adesso il testo si vede mentre si
                 forma, ed e' anche l'unico modo di accorgersi subito se il
                 riconoscitore sta capendo un'altra cosa. -->
            <!--
                ⛔ 2026-08-14: qui c'era un `<p>` che andava A CAPO e si
                scorreva in verticale, mentre l'assistente mostrava le stesse
                parole su UNA riga che scorre. Owner: «non ha senso usare
                componenti diversi». Adesso è lo stesso componente per tutte e
                due le superfici — e a capo la barra cresceva verso l'alto,
                spingendo i comandi che la persona sta guardando.
            -->
            <TalosSciaParole
                :testo="props.trascrizione"
                data-testid="talos-dictation-transcript"
            />
            <div class="flex items-center gap-3">
            <!-- ✕ BUTTA VIA: rimette il campo com'era prima di parlare. Se si
                 limitasse a fermare sarebbe un doppione del ✓, cioe' un comando
                 che mente. -->
            <button
                type="button"
                data-testid="talos-dictation-discard"
                :aria-label="$t('chat.discardDictation')"
                class="talos-pressable flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--talos-panel,var(--card))] text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                @click="emit('annulla')"
            >
                <X class="size-4" aria-hidden="true" />
            </button>
            <TalosMicWaveform :level="props.avvio ? 0.12 : props.livello" :bars="24" class="min-w-0 flex-1" />
            <!-- Il nome dello stato resta, ma per chi non vede: l'onda lo dice
                 gia' a chi guarda, e la barra non deve diventare una frase. -->
            <span class="sr-only" role="status">
                {{ props.avvio ? $t('chat.starting') : $t('chat.listening') }}
            </span>
            <!-- ⏹ FERMA: chiude la dettatura e lascia il testo nel campo, per
                 rileggerlo o correggerlo. ⛔ Icona di STOP e non piu' una
                 spunta: la spunta adesso e' un altro comando, e due disegni
                 uguali per due azioni diverse insegnano a premere quella
                 sbagliata. -->
            <button
                type="button"
                data-testid="talos-dictation-keep"
                :aria-label="$t('chat.stopDictation')"
                class="talos-pressable flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--talos-panel,var(--card))] text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                @click="emit('ferma')"
            >
                <Square class="size-3" fill="currentColor" aria-hidden="true" />
            </button>
            <!-- ➤ INVIA: owner 2026-08-10, «un pulsante annulla e un pulsante
                 send accanto al pulsante stop». Chiude la dettatura E manda,
                 senza il passaggio in mezzo — che era il gesto che mancava a chi
                 detta con le mani occupate.
                 ⛔ Spento finche' non c'e' niente da mandare: un invio che manda
                 il vuoto e' peggio di un invio assente. -->
            <button
                type="button"
                data-testid="talos-dictation-send"
                :aria-label="$t('chat.sendMessage')"
                :disabled="!props.trascrizione.trim() && !props.bozza.trim()"
                class="talos-pressable flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:opacity-40"
                @click="emit('invia')"
            >
                <Check class="size-4" aria-hidden="true" />
            </button>
            </div>
        </div>
</template>
