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

    it('OpenRouter lo DICE invece di ignorare l’immagine', () => {
        /**
         * Una richiesta che scarta l'immagine in silenzio consegna una scena
         * nuova al posto di una modifica, e chi guarda non ha modo di capire
         * che è successo. OpenRouter ha una via sua, non ancora misurata: si
         * rifiuta per nome finché non lo è.
         */
        expect(() => planTalosImageRequest('openrouter', { prompt: 'x', shape: 'square', source: SOURCE }, CONFIG))
            .toThrow(/TALOS_IMAGE_EDIT_UNSUPPORTED_PROVIDER:openrouter/)
    })

    it('tutti continuano a generare da testo senza intoppi', () => {
        for (const provider of ['openai', 'openrouter'] as const) {
            expect(() => planTalosImageRequest(provider, { prompt: 'x', shape: 'square' }, CONFIG)).not.toThrow()
        }
    })
})

describe('OpenAI: modificare è un ALTRO indirizzo, non un altro campo', () => {
    const openai = (model: string, source?: typeof SOURCE) => planTalosImageRequest(
        'openai',
        { prompt: 'fallo blu', shape: 'portrait', ...(source ? { source } : {}) },
        { apiKey: 'k', model },
    )

    it('una modifica va su /images/edits, una generazione su /images/generations', () => {
        // Due indirizzi diversi: mandare una modifica a «generations» ridisegna
        // la scena da capo, che è esattamente il difetto da togliere.
        expect(openai('gpt-image-2', SOURCE).url).toBe('https://api.openai.com/v1/images/edits')
        expect(openai('gpt-image-2').url).toBe('https://api.openai.com/v1/images/generations')
    })

    it('la modifica parte in multipart, con l’immagine come FILE', () => {
        const plan = openai('gpt-image-2', SOURCE)
        expect(plan.multipart?.fields).toMatchObject({
            model: 'gpt-image-2',
            prompt: 'fallo blu',
            size: '1024x1536',
            n: '1',
        })
        expect(plan.multipart?.files[0]).toMatchObject({
            field: 'image',
            base64: 'AAAA',
            mediaType: 'image/png',
        })
    })

    it('il nome del file porta l’estensione del suo tipo', () => {
        // Un server che trova «sorgente» senza estensione può rifiutarsi di
        // indovinare che immagine sia.
        const jpg = openai('gpt-image-2', { base64: 'AAAA', mediaType: 'image/jpeg' })
        expect(jpg.multipart?.files[0]!.filename).toBe('sorgente.jpg')
        expect(openai('gpt-image-2', SOURCE).multipart?.files[0]!.filename).toBe('sorgente.png')
    })

    it('NESSUN Content-Type scritto a mano: lo decide FormData', () => {
        /**
         * Un `multipart/form-data` porta nel proprio Content-Type il confine
         * fra le parti, che FormData genera. Scriverlo qui vorrebbe dire
         * mandare un confine che non corrisponde a niente, e il server non
         * troverebbe più i pezzi.
         */
        const headers = openai('gpt-image-2', SOURCE).headers
        expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type')
        expect(headers.Authorization).toBe('Bearer k')
    })

    it('la fedeltà dei volti si chiede SOLO al modello che la prevede', () => {
        /**
         * `input_fidelity` tiene i tratti del viso quando la modifica non
         * doveva toccarli. Vale su gpt-image-1; su gpt-image-2 non è
         * applicabile e mandarlo fa fallire la chiamata. Il modello lo pesca il
         * catalogo, non noi: quindi si chiede dove è previsto, e ogni modello
         * sconosciuto non lo riceve.
         */
        expect(openai('gpt-image-1', SOURCE).multipart?.fields.input_fidelity).toBe('high')
        expect(openai('gpt-image-2', SOURCE).multipart?.fields).not.toHaveProperty('input_fidelity')
        expect(openai('gpt-image-9-mai-visto', SOURCE).multipart?.fields).not.toHaveProperty('input_fidelity')
    })

    it('una generazione NON porta un multipart, e resta JSON', () => {
        // Chi non allega niente non deve accorgersi che questa strada esiste.
        const plan = openai('gpt-image-2')
        expect(plan.multipart).toBeUndefined()
        expect(plan.headers['Content-Type']).toBe('application/json')
    })
})

describe('la maschera: DOVE modificare', () => {
    it('viaggia come SECONDO file nello stesso pacco, non come campo di testo', () => {
        /**
         * Owner 2026-08-04, «questo lo dobbiamo risolvere», citando la diagnosi
         * che il modello aveva fatto del nostro tool: «image-to-image su tutta
         * la scena, non un compositing mascherato per-ROI». Senza maschera
         * «cambia lo sfondo» ridisegna anche il soggetto.
         */
        const plan = planTalosImageRequest('openai', {
            prompt: 'sfondo blu',
            shape: 'square',
            source: SOURCE,
            mask: { base64: 'BBBB', mediaType: 'image/png' },
        }, { apiKey: 'k', model: 'gpt-image-2' })

        expect(plan.multipart?.files).toHaveLength(2)
        expect(plan.multipart?.files[1]).toMatchObject({
            field: 'mask', base64: 'BBBB', filename: 'maschera.png',
        })
        // L'ordine conta per chi legge: prima cosa si modifica, poi dove.
        expect(plan.multipart?.files[0]!.field).toBe('image')
    })

    it('senza maschera il pacco porta UN file solo', () => {
        // Chi non ne passa una non deve accorgersi che questa strada esiste.
        const plan = planTalosImageRequest('openai', { prompt: 'x', shape: 'square', source: SOURCE },
            { apiKey: 'k', model: 'gpt-image-2' })
        expect(plan.multipart?.files).toHaveLength(1)
    })
})
