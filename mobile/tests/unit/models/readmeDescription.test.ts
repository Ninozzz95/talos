import { describe, expect, it } from 'vitest'
import { talosReadmeSummary } from '@/lib/models/readmeSummary'

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
describe('scegliere una descrizione da un README', () => {
    it('una fila di badge NON è una descrizione, comunque sia scritta', () => {
        // Il caso vero visto sul telefono.
        expect(talosReadmeSummary('[![Qwen](https://img.shields.io/a.svg)](https://x) ![Qwen Chat](https://chat.qwen.ai)')).toBeNull()
        expect(talosReadmeSummary('![Qwen Chat](https://chat.qwen.ai)')).toBeNull()
    })

    it('una lista di link non lo è nemmeno', () => {
        // Il caso del primo giro.
        expect(talosReadmeSummary('- You can now also fine-tune the model locally with [Unsloth](https://github.com/unslothai/unsloth).\n- Read our [guide](https://x)')).toContain('fine-tune')
    })

    it('una frase vera passa, e arriva senza markup', () => {
        const grezzo = 'Modello da **9 miliardi** di parametri addestrato per il ragionamento passo per passo e per l\'uso di [strumenti](https://x).'
        const pulito = talosReadmeSummary(grezzo)
        expect(pulito).not.toBeNull()
        expect(pulito).toContain('9 miliardi')
        expect(pulito).toContain('strumenti')
        // Niente asterischi, niente indirizzi.
        expect(pulito).not.toContain('**')
        expect(pulito).not.toContain('http')
    })

    it('un titolo da solo non basta', () => {
        expect(talosReadmeSummary('# Qwen3.5-4B-GGUF')).toBeNull()
    })

    it('salta frontmatter e tronca deterministicamente senza spezzare il contratto', () => {
        const readme = `---\nlicense: apache-2.0\n---\n\n# Titolo\n\n${'Una descrizione leggibile del modello e del suo uso pratico. '.repeat(12)}`
        const summary = talosReadmeSummary(readme)
        expect(summary).not.toContain('license:')
        expect(summary?.length).toBeLessThanOrEqual(320)
    })
})
