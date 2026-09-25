<script setup lang="ts">
/**
 * ⭐⭐ B3 (24/09) — la coda della chat APERTA, collegata allo store. Decisioni owner D-B3-01…04
 * (`.claude/b3/LEDGER-B3-2026-09-24.md`).
 *
 * Stava dentro `ChatScreen.vue`; è qui, caricato a richiesta, perché la schermata della chat sta nel pacchetto d'avvio
 * e B3 l'aveva portato oltre il tetto (`scripts/verify-initial-chunk.mjs`). La regola dell'owner del 14/08: «si sposta
 * ciò che non serve all'avvio in un pezzo caricato a richiesta» — la coda esiste solo quando qualcuno ha accodato.
 * La presentazione resta in `TalosMobileCodaDelGiro.vue`; qui solo il collegamento, tale e quale a prima.
 */
import { computed } from 'vue'
import TalosMobileCodaDelGiro from '@/components/chat/TalosMobileCodaDelGiro.vue'
import { useTalosI18n } from '@/i18n'
import { azioneVoce } from '@/lib/chat/codaDelGiro'
import { useChatController } from '@/stores/chatController'
import { useTalosMobileToasts } from '@/stores/toasts'

const emit = defineEmits<{
    /** La consegna parte adesso: la schermata torna in fondo alla conversazione, come per un invio. */
    rejoin: []
}>()

const controller = useChatController()
const chat = controller.chat
const { t } = useTalosI18n()
const toasts = useTalosMobileToasts()

const sessioneAperta = computed(() => chat.activeSession.value?.id ?? null)
const codaAperta = computed(() => (sessioneAperta.value ? chat.queueOf(sessioneAperta.value) : null))
/** Il giro vivo è di QUESTA chat: solo qui una voce può indirizzarlo (lo store rifiuta altrove, `steerQueued`). */
const giroVivoQui = computed(() => chat.state.sending
    && sessioneAperta.value !== null
    && chat.state.sendingSessionId === sessioneAperta.value)
const altraChatInCorso = computed(() => chat.state.sending
    && chat.state.sendingSessionId !== null
    && chat.state.sendingSessionId !== sessioneAperta.value)
const azioneDellaCoda = computed(() => azioneVoce({
    giroVivoQui: giroVivoQui.value,
    conAttrezzi: controller.turnUsesTools.value,
}))

/** Voce ancora in coda (non già partita fra il disegno e il tocco). */
function voceAncoraInCoda(sessionId: string, id: string): boolean {
    return chat.queueOf(sessionId).voci.some((voce) => voce.id === id)
}

function segnalaErrore(cause: unknown): void {
    toasts.push({ message: cause instanceof Error ? cause.message : String(cause), durationMs: 6000 })
}

/**
 * L'azione principale di una voce. «Invia ora» a giro fermo; a giro vivo qui «Indirizza ora» (punto sicuro fra gli
 * attrezzi) o «Ferma e riparti» (senza attrezzi). ⛔ Se l'indirizzo arriva a giro già finito lo store lo rifiuta: la voce
 * parte come invio normale, e lo si dice (ricerca T7).
 */
async function onCodaPrincipale(id: string): Promise<void> {
    const sessionId = sessioneAperta.value
    if (!sessionId) return
    const azione = azioneDellaCoda.value
    try {
        if (azione !== 'invia-ora') {
            const modo = azione === 'indirizza' ? 'punto-sicuro' : 'ferma-e-riparti'
            if (await chat.steerQueued(sessionId, id, modo)) return
            if (!voceAncoraInCoda(sessionId, id)) return
            if (chat.state.sending) {
                toasts.push({ message: t('chat.queueSendNowBusy'), durationMs: 5000 })
                return
            }
            toasts.push({ message: t('chat.queueSteerBecameSend'), durationMs: 5000 })
        } else if (chat.state.sending) {
            toasts.push({ message: t('chat.queueSendNowBusy'), durationMs: 5000 })
            return
        }
        // La consegna dura quanto la risposta: non si aspetta qui, come un invio normale.
        emit('rejoin')
        void chat.sendQueuedNow(sessionId, id).catch(segnalaErrore)
    } catch (cause) {
        segnalaErrore(cause)
    }
}

function onCodaTogli(id: string): void {
    const sessionId = sessioneAperta.value
    if (sessionId) void chat.removeQueued(sessionId, id).catch(segnalaErrore)
}

function onCodaRiprendi(): void {
    const sessionId = sessioneAperta.value
    if (sessionId) void chat.resumeQueue(sessionId).catch(segnalaErrore)
}

function salvaModificaInCoda(id: string, testo: string) {
    const sessionId = sessioneAperta.value
    if (!sessionId) return Promise.resolve({ ok: false as const, rifiuto: 'nessuna-chat' })
    return chat.editQueued(sessionId, id, testo)
}
</script>

<template>
    <TalosMobileCodaDelGiro
        v-if="codaAperta && codaAperta.voci.length > 0"
        :voci="codaAperta.voci"
        :in-pausa="codaAperta.inPausa"
        :azione="azioneDellaCoda"
        :altra-chat-in-corso="altraChatInCorso"
        :salva-modifica="salvaModificaInCoda"
        @principale="onCodaPrincipale"
        @togli="onCodaTogli"
        @riprendi="onCodaRiprendi"
    />
</template>
