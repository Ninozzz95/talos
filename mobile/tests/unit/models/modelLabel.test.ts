import { describe, expect, it } from 'vitest'
import { talosShortModelLabel } from '@/lib/models/modelLabel'

/**
 * Owner 2026-08-06, provando sul dispositivo: «usando un modello locale spunta
 * tutto il percorso del modello e non solo il nome, stampando una riga enorme
 * sotto la risposta».
 *
 * La riga sotto una risposta dice CON COSA è stata scritta. Per i provider di
 * rete è un nome corto; per un modello locale l'identificativo è il percorso
 * del file, e quaranta caratteri di cartelle sotto tre parole di risposta non
 * sono un'attribuzione: sono rumore che copre la risposta.
 */
describe('il nome corto di un modello', () => {
    it('da un percorso locale tiene solo il nome del file', () => {
        expect(talosShortModelLabel(
            '/storage/emulated/0/Android/data/ai.talos/files/models/Solaren/qwen3-moe-6x0.6b-3.6b-writing-on-fire-uncensored-q8_0.gguf',
        )).toBe('qwen3-moe-6x0.6b-3.6b-writing-on-fire-uncensored-q8_0')
    })

    it('toglie le estensioni che non dicono niente', () => {
        expect(talosShortModelLabel('/models/Qwen3-1.7B-Q8_0.gguf')).toBe('Qwen3-1.7B-Q8_0')
        expect(talosShortModelLabel('/m/model.BIN')).toBe('model')
        expect(talosShortModelLabel('/m/pesi.safetensors')).toBe('pesi')
    })

    /**
     * Il caso che una regola ingenua sbaglierebbe. «Contiene una barra dunque è
     * un percorso» accorcerebbe `openai/gpt-4o` a `gpt-4o`, togliendo l'unica
     * cosa che distingue due modelli omonimi di provider diversi.
     */
    it('NON accorcia un identificativo di rete che contiene una barra', () => {
        expect(talosShortModelLabel('openai/gpt-4o')).toBe('openai/gpt-4o')
        expect(talosShortModelLabel('anthropic/claude-opus-5')).toBe('anthropic/claude-opus-5')
        expect(talosShortModelLabel('deepseek-v4-flash')).toBe('deepseek-v4-flash')
    })

    it('riconosce un percorso di Windows e un URI di file', () => {
        expect(talosShortModelLabel('C:\\\\modelli\\\\qwen.gguf')).toBe('qwen')
        expect(talosShortModelLabel('file:///data/models/llama.gguf')).toBe('llama')
    })

    /**
     * Illeggibile è meglio di assente, quando si sta attribuendo una risposta:
     * una riga vuota non dice «non lo so», dice «nessuno l'ha scritta».
     */
    it('non restituisce mai il vuoto per un identificativo che c\'è', () => {
        expect(talosShortModelLabel('/models/.gguf')).toBe('/models/.gguf')
        expect(talosShortModelLabel('/')).toBe('/')
        expect(talosShortModelLabel('   ')).toBe('')
    })
})
