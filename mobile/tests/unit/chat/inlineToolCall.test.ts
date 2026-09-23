import { describe, expect, it } from 'vitest'
import { talosParseInlineToolCall } from '@/lib/chat/inlineToolCall'

// D-F1-2 (12/09): la chiamata scritta nel testo dal modello si legge, nelle due forme vere.
describe('talosParseInlineToolCall', () => {
    it('legge la forma JSON dei template Qwen', () => {
        expect(talosParseInlineToolCall(' {"name": "device_torch", "arguments": {"on": true}} '))
            .toEqual({ name: 'device_torch', arguments: '{"on":true}' })
    })

    it('legge la forma XML di GLM (nome, arg_key/arg_value), con i valori JSON quando lo sono', () => {
        const blocco = 'library_search\n<arg_key>query</arg_key>\n<arg_value>e-ink 2026</arg_value>\n<arg_key>limit</arg_key>\n<arg_value>3</arg_value>\n'
        expect(talosParseInlineToolCall(blocco))
            .toEqual({ name: 'library_search', arguments: JSON.stringify({ query: 'e-ink 2026', limit: 3 }) })
    })

    it('un nome solo, senza argomenti, è una chiamata senza argomenti', () => {
        expect(talosParseInlineToolCall('device_status')).toEqual({ name: 'device_status', arguments: '{}' })
    })

    it('al contrario: testo qualunque, JSON senza nome o blocco GLM troncato → null', () => {
        expect(talosParseInlineToolCall('ecco la risposta, con una <virgola>')).toBeNull()
        expect(talosParseInlineToolCall('{"arguments":{"a":1}}')).toBeNull()
        expect(talosParseInlineToolCall('library_search\n<arg_key>query</arg_key>\n<arg_value>e-ink')).toBeNull()
        expect(talosParseInlineToolCall('')).toBeNull()
    })
})
