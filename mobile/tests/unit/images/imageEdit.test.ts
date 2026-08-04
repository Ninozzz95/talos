import { describe, expect, it } from 'vitest'
import { planTalosImageRequest } from '@/lib/images/imageGateway'

/**
 * Owner 2026-08-04: «bisogna rendere disponibile il tool di generazione da
 * immagine utente a invio modello».
 *
 * La forma del blocco immagine è MISURATA contro l'API di Gemini, non
 * ricordata: `{ type: 'image', mime_type, data }`, i due campi PIATTI. Ci si è
 * arrivati facendo parlare l'API — un `type` inventato le fa elencare quelli
 * che accetta, e un blocco nudo risponde «Missing/unsupported mime_type in
 * image content», cioè nomina il campo che vuole.
 */
const SOURCE = { base64: 'AAAA', mediaType: 'image/png' }
const CONFIG = { apiKey: 'k', model: 'gemini-2.5-flash-image' }

describe('partire da un’immagine invece che da zero', () => {
    it('Gemini riceve mime_type e data PIATTI, dopo il testo', () => {
        const plan = planTalosImageRequest('gemini', { prompt: 'fallo blu', shape: 'square', source: SOURCE }, CONFIG)
        const input = plan.body.input as Array<Record<string, unknown>>

        // L'istruzione prima, la cosa su cui agire dopo.
        expect(input[0]).toMatchObject({ type: 'text', text: 'fallo blu' })
        expect(input[1]).toEqual({ type: 'image', mime_type: 'image/png', data: 'AAAA' })
        // NON annidato: `{type:'image', image:{...}}` è la forma che l'API
        // rifiuta con «Unknown parameter 'image'».
        expect(input[1]).not.toHaveProperty('image')
    })

    it('senza immagine il corpo resta identico a prima', () => {
        // Chi non allega niente non deve accorgersi che questa strada esiste.
        const plan = planTalosImageRequest('gemini', { prompt: 'un gatto', shape: 'square' }, CONFIG)
        expect(plan.body.input).toEqual([{ type: 'text', text: 'un gatto' }])
    })

    it('gli altri due provider lo DICONO invece di ignorare l’immagine', () => {
        /**
         * Una richiesta che scarta l'immagine in silenzio consegna una scena
         * nuova al posto di una modifica, e chi guarda non ha modo di capire
         * che è successo. OpenAI vuole multipart, OpenRouter una via sua:
         * finché non sono misurati, si rifiutano per nome.
         */
        for (const provider of ['openai', 'openrouter'] as const) {
            expect(() => planTalosImageRequest(provider, { prompt: 'x', shape: 'square', source: SOURCE }, CONFIG))
                .toThrow(new RegExp(`TALOS_IMAGE_EDIT_UNSUPPORTED_PROVIDER:${provider}`))
        }
    })

    it('gli altri due continuano a generare da testo senza intoppi', () => {
        for (const provider of ['openai', 'openrouter'] as const) {
            expect(() => planTalosImageRequest(provider, { prompt: 'x', shape: 'square' }, CONFIG)).not.toThrow()
        }
    })
})
