/**
 * ⛔ K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`; owner 15/10 «Stessi componenti della chat»): da dove la coda in
 * streaming (`TalosMobileStreamingReply`) prende il giro che sta arrivando.
 *
 * Di serie è la chat, con la logica di sempre. Il Codice su r4 fornisce la sua con `provide(TALOS_SORGENTE_STREAMING, …)`: la stessa
 * coda, gli stessi pezzi, un altro giro.
 */
import { computed, type ComputedRef, type InjectionKey } from 'vue'
import type { TalosAttrezzoDelGiro, TalosConfineDelGiro } from '@/lib/chat/sequenzaDelTurno'
import type { TalosBozzaAttrezzo } from '@/lib/chat/providerContracts'

export interface TalosSorgenteStreaming {
    /** Vero mentre il giro di QUESTA conversazione sta arrivando. */
    sending: ComputedRef<boolean>
    /** Il testo intero del giro (anche la parte prima dell'ultimo confine). */
    testo: ComputedRef<string>
    /** Il ragionamento intero del giro. */
    ragionamento: ComputedRef<string>
    confini: ComputedRef<readonly TalosConfineDelGiro[]>
    attivi: ComputedRef<readonly TalosAttrezzoDelGiro[]>
    /**
     * ⛔ Owner 20/10/2026: gli attrezzi che il modello sta ancora scrivendo (nome e crescita), prima che il giro parta.
     * OPZIONALE: una sorgente che non li conosce (il Codice su r4) resta valida e mostra quello che mostrava.
     */
    bozze?: ComputedRef<readonly TalosBozzaAttrezzo[]>
}

export const TALOS_SORGENTE_STREAMING: InjectionKey<TalosSorgenteStreaming> = Symbol('talos-sorgente-streaming')

interface ControllerDellaChat {
    chat: {
        state: {
            sending: boolean
            streamingText: string | null
            streamingReasoning: string | null
            streamingConfini: readonly TalosConfineDelGiro[] | null
            streamingBozze?: readonly TalosBozzaAttrezzo[] | null
            streamingSessionId: string | null
        }
        activeSession: { value: { id: string } | null | undefined }
    }
    toolActivity: { value: readonly TalosAttrezzoDelGiro[] }
}

/** La sorgente della chat: la logica che la coda aveva dentro, identica. */
export function talosSorgenteStreamingDellaChat(controller: ControllerDellaChat): TalosSorgenteStreaming {
    const state = controller.chat.state
    return {
        /*
         * Owner 2026-07-26: leaving a chat generating and opening a new one made a message appear there by itself — the other
         * chat's reply, rendered by a global field. Only while the in-flight reply belongs to the conversation on screen.
         */
        sending: computed(() => state.sending
            && state.streamingSessionId !== null
            && state.streamingSessionId === controller.chat.activeSession.value?.id),
        testo: computed(() => state.streamingText ?? ''),
        ragionamento: computed(() => state.streamingReasoning ?? ''),
        confini: computed(() => state.streamingConfini ?? []),
        attivi: computed(() => controller.toolActivity.value),
        bozze: computed(() => state.streamingBozze ?? []),
    }
}
