import { talosLocalEngineLazy } from '@/services/localEngineLazy'
import { talosAskNpuTerms } from '@/stores/npuTermsPrompt'

/**
 * ⛔ PKLA Qualcomm 2.1 b (owner, 01/10/2026) — prima della prova dei motori,
 * le condizioni NPU: UNA volta, a chi ha l'NPU nell'app, non l'ha accettata e
 * non ha già detto «Non ora». La prova aspetta la risposta: accettata, il
 * nativo carica il modulo e la prova misura anche l'NPU; «Non ora», la prova
 * gira senza, e la proposta non torna (si ritrova in Modelli).
 *
 * Non solleva mai: una domanda che non si può fare non deve fermare la scelta
 * del modello.
 */
export async function talosNpuTermsBeforeProbe(): Promise<void> {
    try {
        const { talosNpuState, talosDeclineNpuTermsPrompt } = await talosLocalEngineLazy()
        const stato = await talosNpuState()
        if (!stato.installed || stato.accepted || stato.promptDeclined) return
        const esito = await talosAskNpuTerms()
        if (esito === 'later') await talosDeclineNpuTermsPrompt()
    } catch {
        // La prova parte comunque, senza NPU.
    }
}
