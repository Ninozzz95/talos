// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * L'etichetta «IA · OpenAI» sull'immagine, letta dal FILE.
 *
 * Il manifesto è vero: 29.030 byte firmati da OpenAI, presi dal dispositivo il
 * 2026-08-04. Un manifesto finto proverebbe che il componente legge ciò che il
 * test scrive.
 */
// Percorso dalla radice del progetto: sotto jsdom `import.meta.url` è un
// indirizzo http, e `readFileSync` vuole un file.
const MANIFESTO = Uint8Array.from(
    Buffer.from(readFileSync('tests/fixtures/c2pa-manifest.b64', 'ascii'), 'base64'),
)

function pngCon(tipo: string, contenuto: Uint8Array): Uint8Array {
    const chunk = (nome: string, dati: Uint8Array): number[] => [
        (dati.length >>> 24) & 0xff, (dati.length >>> 16) & 0xff,
        (dati.length >>> 8) & 0xff, dati.length & 0xff,
        ...[...nome].map((c) => c.charCodeAt(0)),
        ...dati, 0, 0, 0, 0,
    ]
    return Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...chunk('IHDR', new Uint8Array(13)),
        ...chunk(tipo, contenuto),
        ...chunk('IEND', new Uint8Array(0)),
    ])
}

const previewBytes = vi.fn()
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ attachments: { previewBytes } }),
}))

beforeEach(() => {
    previewBytes.mockReset()
    if (typeof URL.createObjectURL !== 'function') {
        URL.createObjectURL = () => 'blob:finto'
        URL.revokeObjectURL = () => {}
    }
})

async function monta(bytes: Uint8Array) {
    previewBytes.mockResolvedValue(bytes)
    const { mount } = await import('@vue/test-utils')
    const C = (await import('@/components/chat/TalosMobileMessageImage.vue')).default
    const wrapper = mount(C, { props: { fileId: 'f1', name: 'foto.png' } })
    await new Promise((r) => setTimeout(r, 20))
    await wrapper.vm.$nextTick()
    return wrapper
}

describe('l’immagine dice cosa è, leggendolo da sé', () => {
    it('un’immagine con credenziali C2PA porta l’etichetta col NOME di chi l’ha fatta', async () => {
        const wrapper = await monta(pngCon('caBX', MANIFESTO))
        const targhetta = wrapper.find('[data-testid="talos-image-provenance"]')
        expect(targhetta.exists()).toBe(true)
        // Non «IA» e basta: chi guarda deve sapere CHI, e viene dal manifesto.
        expect(targhetta.text()).toContain('OpenAI')
    })

    it('una foto scattata col telefono resta MUTA, non «forse»', async () => {
        /**
         * È il caso più comune e il più facile da sbagliare: mettere
         * l'etichetta su tutto significa dire a una persona che la sua foto è
         * stata fatta da una macchina.
         */
        const wrapper = await monta(pngCon('tEXt', new Uint8Array(40)))
        expect(wrapper.find('[data-testid="talos-image-provenance"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-message-image"]').exists()).toBe(true)
    })

    it('i byte si chiedono UNA volta sola, non due', async () => {
        // Da quei byte nascono sia l'immagine sia la sua dichiarazione:
        // rileggere il file per ogni foto che scorre costerebbe il doppio.
        await monta(pngCon('caBX', MANIFESTO))
        expect(previewBytes).toHaveBeenCalledTimes(1)
    })
})
