import { describe, expect, it, vi } from 'vitest'
import { createTalosImageTools } from '@/lib/images/imageTools'

/**
 * Owner 2026-08-04, dalla diagnostica del dispositivo.
 *
 * `gpt-5.6-terra` ha chiamato `generate_image` CINQUE volte di fila, ognuna
 * fallita in ~20ms con `TALOS_IMAGE_SOURCE_NOT_FOUND`, e poi si è arreso
 * dicendo alla persona «errore tecnico del riferimento immagine». Claude, nella
 * stessa situazione, aveva prima cercato il nome esatto con `library_list` e
 * `library_read` — e aveva funzionato.
 *
 * La differenza non era il modello: era che il nostro errore diceva «non c'è»
 * senza dire COSA c'è. Un errore che non offre l'alternativa costringe a
 * indovinare, e indovinare cinque volte costa cinque round veri.
 */
function tools(disponibili: string[]) {
    return createTalosImageTools({
        provider: () => 'openai',
        findImage: vi.fn(async () => null),
        availableImages: () => disponibili,
        generate: vi.fn(),
        save: vi.fn(),
    } as never)
}

async function chiama(disponibili: string[]) {
    const suite = tools(disponibili)
    const tool = suite.find((t) => t.name === 'generate_image')!
    return tool.run(
        { prompt: 'fallo blu', from_image: 'quella foto' } as never,
        { signal: undefined } as never,
    ) as Promise<{ ok: boolean, code?: string, content: string }>
}

describe('quando l’immagine di partenza non si trova', () => {
    it('l’errore NOMINA le immagini che ci sono', async () => {
        const esito = await chiama(['tavolata.jpg', 'gatto.png'])
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_IMAGE_SOURCE_NOT_FOUND')
        // I nomi esatti, così il tentativo dopo è quello buono.
        expect(esito.content).toContain('tavolata.jpg')
        expect(esito.content).toContain('gatto.png')
    })

    it('senza nessuna immagine lo dice, invece di far cercare a vuoto', async () => {
        // Riprovare non può funzionare: il messaggio deve chiudere quella
        // strada e aprirne un'altra, non lasciare la persona a indovinare.
        const esito = await chiama([])
        expect(esito.content).toContain('no images')
        expect(esito.content).toContain('Leave from_image out')
    })
})
