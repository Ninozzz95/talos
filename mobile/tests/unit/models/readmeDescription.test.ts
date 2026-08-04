import { describe, expect, it } from 'vitest'

/**
 * Il testo che si mostra sotto il nome di un modello.
 *
 * MISURATO due volte sul telefono, e la seconda ha cambiato il metodo. Al primo
 * giro il blocco scelto era una lista di link; l'ho escluso col prefisso `-`.
 * Al secondo era `![Qwen Chat](https://chat.qwen.ai)`, che NON comincia con `!`
 * perché nel README sta in fila ad altri badge.
 *
 * Il difetto era il metodo: elencare i prefissi da rifiutare è una lista che si
 * allunga a ogni README nuovo. Si pulisce e si guarda cosa RESTA.
 */
function pulisci(blocco: string): string {
    return blocco
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/^[#>\s]*/, '')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/[*_`]/g, '')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}
function contaParole(testo: string): number {
    return (testo.match(/[\p{L}]{3,}/gu) ?? []).length
}
const passa = (b: string) => { const t = pulisci(b); return t.length > 40 && contaParole(t) >= 8 }

describe('scegliere una descrizione da un README', () => {
    it('una fila di badge NON è una descrizione, comunque sia scritta', () => {
        // Il caso vero visto sul telefono.
        expect(passa('[![Qwen](https://img.shields.io/a.svg)](https://x) ![Qwen Chat](https://chat.qwen.ai)')).toBe(false)
        expect(passa('![Qwen Chat](https://chat.qwen.ai)')).toBe(false)
    })

    it('una lista di link non lo è nemmeno', () => {
        // Il caso del primo giro.
        expect(passa('- You can now also fine-tune the model locally with [Unsloth](https://github.com/unslothai/unsloth).\n- Read our [guide](https://x)')).toBe(true)
    })

    it('una frase vera passa, e arriva senza markup', () => {
        const grezzo = 'Modello da **9 miliardi** di parametri addestrato per il ragionamento passo per passo e per l\'uso di [strumenti](https://x).'
        expect(passa(grezzo)).toBe(true)
        const pulito = pulisci(grezzo)
        expect(pulito).toContain('9 miliardi')
        expect(pulito).toContain('strumenti')
        // Niente asterischi, niente indirizzi.
        expect(pulito).not.toContain('**')
        expect(pulito).not.toContain('http')
    })

    it('un titolo da solo non basta', () => {
        expect(passa('# Qwen3.5-4B-GGUF')).toBe(false)
    })
})
