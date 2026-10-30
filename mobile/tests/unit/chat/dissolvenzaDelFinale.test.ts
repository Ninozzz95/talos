/**
 * DISS-01..02 — regressione trovata dal vivo il 28/10/2026 (vc337, Codice remoto): quando la risposta finisce, il messaggio finale
 * che prende il posto dello streaming GIÀ VISIBILE ripartiva da opacità 0 (misurato sul Pad ogni 30 ms: 0.00 → 0.52 → 0.81 → 1.00 in
 * ~230 ms), e tutta la risposta lampeggiava. Contratto dell'owner del 27/07 (`TalosMobileStreamingReply.vue`, «fading again once it
 * has arrived is the bug») e di `TalosMobileMessageContent.vue` («a block that has finished must never animate again»). La
 * dissolvenza dei messaggi Calm (12/09) vale solo per il corpo che sta arrivando.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/components/chat/talosCalmMessages.css'), 'utf8')
/** Le regole (selettore → dichiarazioni) del foglio, senza i blocchi @media/@keyframes. */
function regole(sorgente: string): Array<{ selettore: string, corpo: string }> {
    const piatte = sorgente.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gu, '')
    return [...piatte.matchAll(/([^{}@]+)\{([^{}]*)\}/gu)].map((m) => ({ selettore: m[1]!.trim(), corpo: m[2]! }))
}

describe('DISS la risposta finita non entra di nuovo in dissolvenza', () => {
    it('DISS-01 nessuna regola anima un `.assistant-text` che non sia il corpo in streaming', () => {
        const colpevoli = regole(css)
            .filter((r) => /animation\s*:\s*(?!none)/u.test(r.corpo))
            .flatMap((r) => r.selettore.split(','))
            .map((s) => s.trim())
            .filter((s) => s.includes('.assistant-text') && !s.includes('.talos-streaming-body'))
        expect(colpevoli).toEqual([])
    })

    it('DISS-02 il corpo in streaming entra ancora in dissolvenza (Calm, 12/09), e col movimento ridotto no', () => {
        expect(css).toMatch(/\.talos-calm-thread \.talos-streaming-body\.assistant-text \{[^}]*animation: talos-answer-fade/u)
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.talos-streaming-body\.assistant-text[^}]*animation: none/u)
    })
})
