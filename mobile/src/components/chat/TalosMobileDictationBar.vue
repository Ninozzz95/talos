<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Check, Square, X } from '@lucide/vue'
import { talosCurva, talosMotionConsentito } from '@/composables/useTalosCalmMotion'
import TalosMicWaveform from '@/components/brand/TalosMicWaveform.vue'

/**
 * ⭐ LA BARRA DELLA DETTATURA — annulla, ferma, invia.
 *
 * ⛔ Le parole mentre le dici NON stanno più qui: owner 18/10/2026, dal telefono, «il testo vada fuori dal composer no dentro i
 * composer nella sezione gialla proprio fuori» ⇒ sono la riga sopra il compositore (`TalosMobileComposer.vue`, DET-FUORI).
 * `trascrizione` resta per dire se c'è qualcosa da inviare.
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

/* Owner 28/10/2026 («Approvo»): la dettatura è il compositore stesso; la barra ENTRA morbida, in dissolvenza, al posto del campo (stessa
   cornice, stessa altezza). Movimento ridotto o spento: compare e basta. */
const radice = ref<HTMLElement | null>(null)
onMounted(() => {
    const el = radice.value
    if (!el || typeof el.animate !== 'function' || !talosMotionConsentito(el, '--talos-motion-calm-composer')) return
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: talosCurva(el, '--talos-motion-calm-ease') })
})
</script>

<template>
        <div
            
            ref="radice"
            data-testid="talos-dictation-live"
            class="talos-dictation-live"
        >
            <!-- Le parole mentre le dici (owner 2026-08-10: niente dettatura al buio; 2026-08-14: la stessa riga dell'assistente)
                 stanno SOPRA il compositore dal 18/10/2026 (DET-FUORI). -->
            <div class="flex items-center gap-3">
            <!-- ✕ BUTTA VIA: rimette il campo com'era prima di parlare. Se si
                 limitasse a fermare sarebbe un doppione del ✓, cioe' un comando
                 che mente. -->
            <button
                type="button"
                data-testid="talos-dictation-discard"
                :aria-label="$t('chat.discardDictation')"
                class="talos-pressable flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
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
                class="talos-pressable flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
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
