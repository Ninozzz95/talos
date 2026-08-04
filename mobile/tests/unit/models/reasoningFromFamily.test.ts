import { describe, expect, it } from 'vitest'
import { talosMobileModelProfiles } from '@/lib/mobileModelCatalog'

/**
 * Owner 2026-08-04: «ChatGPT da chiave OpenAI, non OpenRouter, non ha lo switch
 * dell'effort nella pillola del modello».
 *
 * Lo stesso modello per due strade offriva due comandi diversi, e chi usa TALOS
 * non ha modo di sapere che dipende da come ha inserito la chiave: vede solo un
 * comando che a volte c'è e a volte no.
 */
function modello(id: string, parametri: string[]) {
    return {
        id,
        provider: 'openai' as const,
        displayName: id,
        chatCompatibility: 'unknown' as const,
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportedParameters: parametri,
        capabilityProvenance: 'declared' as const,
    }
}

function efforts(id: string, parametri: string[]): readonly string[] {
    const [profilo] = talosMobileModelProfiles([modello(id, parametri)], () => true)
    return profilo?.effort_levels ?? []
}

describe('il ragionamento si offre anche quando il catalogo tace', () => {
    it('con chiave OpenAI diretta i livelli si deducono dalla FAMIGLIA', () => {
        // `GET /v1/models` di OpenAI non dichiara i parametri che accetta:
        // aspettarli vuol dire non offrire mai il comando.
        expect(efforts('gpt-5.6-terra', [])).toEqual(['low', 'medium', 'high'])
        expect(efforts('o3-mini', [])).toEqual(['low', 'medium', 'high'])
    })

    it('un modello senza ragionamento non ne riceve uno inventato', () => {
        // Un comando che non governa niente è peggio di uno assente.
        expect(efforts('gpt-4o-mini', [])).toEqual([])
    })

    it('se il provider ha PARLATO, la sua parola vince sulla deduzione', () => {
        /**
         * OpenRouter dichiara i parametri. Se ha elencato e non ha nominato il
         * ragionamento, è un no — non un silenzio: dedurre lì offrirebbe un
         * comando che il server rifiuterà.
         */
        expect(efforts('gpt-5.6-terra', ['temperature', 'top_p'])).toEqual([])
        expect(efforts('gpt-5.6-terra', ['reasoning_effort'])).toEqual(['low', 'medium', 'high'])
    })
})
