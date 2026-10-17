// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TALOS_MODELLO_PARAKEET, fileDelModelloVerificato, modelloParakeetCompleto } from '@/lib/voice/modelloParakeet'

/**
 * N12 (mobile, 13/10/2026) — il modello del riconoscimento vocale locale: Parakeet TDT 0.6B v3 int8 nel formato di
 * sherpa-onnx, scaricato al primo uso (decisione dell'owner del 12/10). I fatti sono fissati alla fonte, misurati il
 * 13/10/2026 dall'API di Hugging Face: revisione, nomi, grandezze e impronte. ⛔ Un file con un'impronta diversa non è il
 * modello: non si usa, nemmeno se ha il nome e la grandezza giusti.
 */
describe('N12 — il modello Parakeet fissato alla fonte', () => {
    it('N12-MODELLO-01: quattro file da una revisione FISSA, con grandezza e impronta; in tutto circa 670 MB', () => {
        const m = TALOS_MODELLO_PARAKEET
        expect(m.revisione).toMatch(/^[0-9a-f]{40}$/u)
        expect(m.file.map((f) => f.nome)).toEqual(['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'])
        for (const f of m.file) {
            expect(f.sha256).toMatch(/^[0-9a-f]{64}$/u)
            expect(f.byte).toBeGreaterThan(0)
            // l'indirizzo punta alla revisione fissata, mai a «main»: un file cambiato alla fonte non entra da solo
            expect(f.indirizzo).toBe(`https://huggingface.co/${m.deposito}/resolve/${m.revisione}/${f.nome}`)
        }
        const totale = m.file.reduce((s, f) => s + f.byte, 0)
        expect(totale).toBe(m.byteTotali)
        expect(Math.round(totale / 1e6)).toBe(670)
        expect(m.licenza).toBe('CC-BY-4.0')
    })

    it('N12-MODELLO-02: un file è buono solo con grandezza E impronta giuste; il modello è completo solo con tutti e quattro', () => {
        const [encoder] = TALOS_MODELLO_PARAKEET.file
        expect(fileDelModelloVerificato(encoder!, { byte: encoder!.byte, sha256: encoder!.sha256 })).toBe(true)
        expect(fileDelModelloVerificato(encoder!, { byte: encoder!.byte, sha256: encoder!.sha256.toUpperCase() })).toBe(true)
        // stessa grandezza, impronta diversa: NON è il modello
        expect(fileDelModelloVerificato(encoder!, { byte: encoder!.byte, sha256: 'a'.repeat(64) })).toBe(false)
        expect(fileDelModelloVerificato(encoder!, { byte: encoder!.byte - 1, sha256: encoder!.sha256 })).toBe(false)
        expect(fileDelModelloVerificato(encoder!, { byte: encoder!.byte, sha256: null })).toBe(false)

        const tutti = Object.fromEntries(TALOS_MODELLO_PARAKEET.file.map((f) => [f.nome, { byte: f.byte, sha256: f.sha256 }]))
        expect(modelloParakeetCompleto(tutti)).toBe(true)
        const { 'tokens.txt': _senza, ...tre } = tutti
        expect(modelloParakeetCompleto(tre)).toBe(false)
        expect(modelloParakeetCompleto({ ...tutti, 'joiner.int8.onnx': { byte: 1, sha256: 'b'.repeat(64) } })).toBe(false)
    })
})
