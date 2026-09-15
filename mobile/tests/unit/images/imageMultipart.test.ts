// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendTalosImageMultipart } from '@/lib/images/imageMultipart'
import type { TalosImagePlan } from '@/lib/images/imageGateway'

/**
 * L'unica richiesta di TALOS che non parte in JSON.
 *
 * Qui non si guarda «se fetch è stato chiamato»: si legge il pacco che ne esce.
 * Un multipart può essere spedito e non contenere l'immagine, e quel guasto —
 * una modifica che torna come una scena nuova — è invisibile a chi conta le
 * chiamate.
 */
const PIANO: TalosImagePlan = {
    url: 'https://api.openai.com/v1/images/edits',
    headers: { Authorization: 'Bearer k' },
    body: {},
    multipart: {
        fields: { model: 'gpt-image-2', prompt: 'fallo blu', n: '1' },
        files: [{ field: 'image', base64: 'AAECAw==', mediaType: 'image/png', filename: 'sorgente.png' }],
    },
}

function intercetta(risposta: { status: number, testo: string }) {
    const visto: { corpo?: FormData, init?: RequestInit, url?: string } = {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        visto.url = url
        visto.init = init
        visto.corpo = init.body as FormData
        return { status: risposta.status, text: async () => risposta.testo } as unknown as Response
    }))
    return visto
}

afterEach(() => { vi.unstubAllGlobals() })

describe('spedire una modifica in multipart', () => {
    it('l’immagine viaggia come FILE, con i byte veri e il suo nome', async () => {
        const visto = intercetta({ status: 200, testo: '{"data":[]}' })
        await sendTalosImageMultipart(PIANO)

        const file = visto.corpo?.get('image') as File
        expect(file).toBeInstanceOf(Blob)
        expect(file.name).toBe('sorgente.png')
        expect(file.type).toBe('image/png')
        // «AAECAw==» sono i quattro byte 0,1,2,3: si contano, non si suppongono.
        const byte = new Uint8Array(await file.arrayBuffer())
        expect(Array.from(byte)).toEqual([0, 1, 2, 3])
    })

    it('ogni campo del piano arriva nel pacco', async () => {
        const visto = intercetta({ status: 200, testo: '{}' })
        await sendTalosImageMultipart(PIANO)
        expect(visto.corpo?.get('model')).toBe('gpt-image-2')
        expect(visto.corpo?.get('prompt')).toBe('fallo blu')
        expect(visto.corpo?.get('n')).toBe('1')
    })

    it('torna nella stessa forma del trasporto, così a valle non cambia niente', async () => {
        intercetta({ status: 200, testo: '{"data":[{"b64_json":"XYZ"}]}' })
        const esito = await sendTalosImageMultipart(PIANO)
        expect(esito).toEqual({ status: 200, data: { data: [{ b64_json: 'XYZ' }] } })
    })

    it('un errore che NON è JSON sopravvive invece di sparire', async () => {
        /**
         * Una pagina di cortesia di un gateway non è JSON. Un `response.json()`
         * che esplode cancellerebbe la sola cosa utile che il server ha detto,
         * e chi legge gli errori a valle resterebbe con un guasto senza motivo.
         */
        intercetta({ status: 502, testo: '<html>Bad Gateway</html>' })
        const esito = await sendTalosImageMultipart(PIANO)
        expect(esito.status).toBe(502)
        expect(esito.data).toContain('Bad Gateway')
    })

    it('fermarsi ha lo STESSO nome dell’altro ramo', async () => {
        // Due nomi per lo stesso gesto sono due comportamenti diversi davanti
        // alla stessa persona: un AbortError arriverebbe come un guasto di rete.
        vi.stubGlobal('fetch', vi.fn(async () => {
            const errore = new Error('The operation was aborted.')
            errore.name = 'AbortError'
            throw errore
        }))
        await expect(sendTalosImageMultipart(PIANO)).rejects.toThrow('TALOS_IMAGE_STOPPED')
    })

    it('un piano senza multipart non finisce spedito per sbaglio', async () => {
        const visto = intercetta({ status: 200, testo: '{}' })
        await expect(sendTalosImageMultipart({ ...PIANO, multipart: undefined }))
            .rejects.toThrow('TALOS_IMAGE_MULTIPART_MISSING')
        expect(visto.url).toBeUndefined()
    })
})

describe('la maschera nel pacco', () => {
    it('parte come SECONDO file, coi suoi byte', async () => {
        const visto = intercetta({ status: 200, testo: '{}' })
        await sendTalosImageMultipart({
            ...PIANO,
            multipart: {
                fields: PIANO.multipart!.fields,
                files: [
                    ...PIANO.multipart!.files,
                    { field: 'mask', base64: 'BAUGBw==', mediaType: 'image/png', filename: 'maschera.png' },
                ],
            },
        })
        const maschera = visto.corpo?.get('mask') as File
        expect(maschera).toBeInstanceOf(Blob)
        expect(maschera.name).toBe('maschera.png')
        // «BAUGBw==» sono i byte 4,5,6,7: si contano, non si suppongono.
        expect(Array.from(new Uint8Array(await maschera.arrayBuffer()))).toEqual([4, 5, 6, 7])
        // E l'immagine c'e' ancora: la maschera si AGGIUNGE, non sostituisce.
        expect(visto.corpo?.get('image')).toBeInstanceOf(Blob)
    })
})
