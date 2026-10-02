import { ref } from 'vue'

/**
 * ⛔ PKLA Qualcomm 2.1 b (owner, 01/10/2026) — il foglio delle condizioni NPU
 * proposto UNA volta, alla scelta di un modello locale. Questo stato è tutto
 * ciò che `App.vue` deve sapere per mostrarlo: è minuscolo apposta, perché sta
 * nel pacchetto d'avvio. La logica vive in `lib/models/npuTermsPrompt.ts`.
 */
export const talosNpuTermsPromptOpen = ref(false)

let risolvi: ((esito: 'accepted' | 'later') => void) | null = null

/** Apre il foglio e aspetta la risposta della persona. */
export function talosAskNpuTerms(): Promise<'accepted' | 'later'> {
    // Una domanda alla volta: se ce n'è già una aperta, la nuova aspetta la stessa risposta.
    const precedente = risolvi
    return new Promise((resolve) => {
        risolvi = (esito) => {
            precedente?.(esito)
            resolve(esito)
        }
        talosNpuTermsPromptOpen.value = true
    })
}

/** La risposta del foglio (o la chiusura, che vale «Non ora»). */
export function talosAnswerNpuTerms(esito: 'accepted' | 'later'): void {
    talosNpuTermsPromptOpen.value = false
    const r = risolvi
    risolvi = null
    r?.(esito)
}
