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

/**
 * ⛔ Si aspetta l'ESITO, non venti millisecondi.
 *
 * Qui c'era `setTimeout(r, 20)`. Sotto carico — la suite intera, tutti i worker
 * insieme — venti millisecondi a volte non bastano perché il componente legga i
 * blocchi del PNG, e il test falliva **a caso**: passava da solo, cadeva in
 * mezzo agli altri. Il 2026-08-07 e' successo, e la seconda esecuzione era
 * verde: una suite che a volte mente e' peggio di un test che manca, perche'
 * insegna a rilanciare invece di guardare.
 *
 * Stessa lezione del telecomando sul dispositivo, lo stesso giorno: un'attesa a
 * tempo misura la macchina su cui gira, non la cosa che deve provare.
 */
async function monta(bytes: Uint8Array) {
    previewBytes.mockResolvedValue(bytes)
    const { mount } = await import('@vue/test-utils')
    const C = (await import('@/components/chat/TalosMobileMessageImage.vue')).default
    const wrapper = mount(C, { props: { fileId: 'f1', name: 'foto.png' } })
    // L'immagine e' la cosa che compare per ULTIMA: quando c'e' lei, la lettura
    // dei blocchi e' finita e la targhetta ha gia' deciso se esistere.
    const scade = Date.now() + 2_000
    while (Date.now() < scade) {
        await wrapper.vm.$nextTick()
        if (wrapper.find('[data-testid="talos-message-image"]').exists()) break
        await new Promise((r) => setTimeout(r, 5))
    }
    await wrapper.vm.$nextTick()
    return wrapper
}

describe('l’immagine dice cosa è, leggendolo da sé', () => {
    it('la targhetta dice che l’ha fatta una MACCHINA, senza nominare chi', async () => {
        /**
         * Owner 2026-08-04, con schermata: «in un'immagine generata da Opus 5
         * mi dice OpenAI».
         *
         * Non era un errore — il modello della chat scrive, quello delle
         * immagini disegna, e Anthropic non genera immagini — ma «IA · OpenAI»
         * finiva a due centimetri da «TALOS · Claude Opus 5», e due etichette
         * corte e vicine che nominano cose diverse si leggono come una
         * contraddizione.
         *
         * Quindi la targhetta fa UNA cosa sola.
         */
        const wrapper = await monta(pngCon('caBX', MANIFESTO))
        const targhetta = wrapper.find('[data-testid="talos-image-provenance"]')
        expect(targhetta.exists()).toBe(true)
        expect(targhetta.text().trim()).toBe('AI')
        expect(targhetta.text()).not.toContain('OpenAI')
    })

    it('il NOME di chi l’ha fatta si vede aprendo l’immagine', async () => {
        // L'informazione non si perde: si sposta dove c'e' spazio e nessuna
        // etichetta accanto con cui confondersi.
        const wrapper = await monta(pngCon('caBX', MANIFESTO))
        expect(document.body.textContent).not.toContain('OpenAI')

        await wrapper.get('[data-testid="talos-message-image"]').trigger('click')
        await wrapper.vm.$nextTick()
        const dettaglio = document.querySelector('[data-testid="talos-image-provenance-detail"]')
        expect(dettaglio?.textContent).toContain('OpenAI')
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
