/**
 * N15 — il limite d'uso del piano ChatGPT è una PAUSA, non un guasto e mai un cambio di fornitore.
 *
 * Come il desktop (r4 `harness-ui/src/runtime-owner-adapter.mjs:1270-1281`) e come deciso dall'owner il 13/10/2026 per il
 * telefono («come il desktop, con notifica»): il giro resta vivo, aspetta e rifà la STESSA richiesta. Quanto aspettare lo
 * dice OpenAI (`Retry-After`, già letto in `attesaMs` da chi ha costruito l'errore) oppure, se tace, sono 30 minuti. Oltre
 * 24 ore non si aspetta: il giro si ferma col suo errore. «Ferma l'attesa» è lo Stop di sempre: il segnale annulla l'attesa.
 *
 * ⛔ Solo il limite d'uso passa di qui. Ogni altro errore esce com'è, subito.
 */
import { ATTESA_LIMITE_DEL_PIANO_MS } from '@/lib/chatgpt/richiesta'

/** Quante volte si aspetta e si riprova prima di arrendersi (mockup approvato: «tentativo 1 di 9»). */
export const TENTATIVI_LIMITE_DEL_PIANO = 9
export const CODICE_LIMITE_DEL_PIANO = 'CHATGPT_LIMITE_DEL_PIANO'

export interface TalosAttesaDelPiano { riprendeAlle: number, tentativo: number, totale: number }

export function eIlLimiteDelPiano(guasto: unknown): boolean {
    const g = guasto as { message?: unknown, uiMessageKey?: unknown } | null
    return g?.message === CODICE_LIMITE_DEL_PIANO || g?.uiMessageKey === `models.chatgptErrors.${CODICE_LIMITE_DEL_PIANO}`
}

/** Dorme fino a un'ora dell'orologio, a piccoli passi: in secondo piano i timer lunghi di una WebView arrivano tardi o mai. */
export function dormiFinoA(quando: number, signal: AbortSignal | undefined, clock: () => number = Date.now, passoMs = 15_000): Promise<void> {
    return new Promise<void>((fatto, rifiuta) => {
        const annullato = () => Object.assign(new Error('The wait was stopped.'), { name: 'AbortError' })
        if (signal?.aborted) { rifiuta(annullato()); return }
        let sveglia: ReturnType<typeof setTimeout> | undefined
        const fine = () => { clearTimeout(sveglia); signal?.removeEventListener('abort', fermato) }
        const fermato = () => { fine(); rifiuta(annullato()) }
        const guarda = () => {
            const resta = quando - clock()
            if (resta <= 0) { fine(); fatto(); return }
            sveglia = setTimeout(guarda, Math.min(resta, passoMs))
        }
        signal?.addEventListener('abort', fermato, { once: true })
        guarda()
    })
}

export async function conAttesaDelLimiteDelPiano<T>(lavoro: () => Promise<T>, opzioni: {
    signal?: AbortSignal
    clock?: () => number
    dormi?: (quando: number, signal: AbortSignal | undefined) => Promise<void>
    /** Chi mostra la carta: l'attesa che comincia, o `null` quando finisce (ripresa, fermata o resa). */
    onAttesa?: (attesa: TalosAttesaDelPiano | null) => void
} = {}): Promise<T> {
    const clock = opzioni.clock ?? Date.now
    const dormi = opzioni.dormi ?? ((quando, signal) => dormiFinoA(quando, signal, clock))
    for (let tentativo = 1; ; tentativo += 1) {
        try { return await lavoro() } catch (guasto) {
            if (!eIlLimiteDelPiano(guasto) || tentativo > TENTATIVI_LIMITE_DEL_PIANO) throw guasto
            const dichiarata = (guasto as { attesaMs?: unknown }).attesaMs
            // `null` = OpenAI ha detto «fra più di 24 ore»: non si tiene vivo un giro così a lungo.
            if (dichiarata === null) throw guasto
            const attesa = typeof dichiarata === 'number' && Number.isFinite(dichiarata) && dichiarata > 0 ? dichiarata : ATTESA_LIMITE_DEL_PIANO_MS
            const riprendeAlle = clock() + attesa
            opzioni.onAttesa?.({ riprendeAlle, tentativo, totale: TENTATIVI_LIMITE_DEL_PIANO })
            try { await dormi(riprendeAlle, opzioni.signal) } finally { opzioni.onAttesa?.(null) }
        }
    }
}
