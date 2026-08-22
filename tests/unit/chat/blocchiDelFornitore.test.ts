import { describe, expect, it } from 'vitest'
import { buildAnthropicRequest } from '@/lib/chat/anthropicClient'
import {
    TALOS_BLOCCHI_DA_CONSERVARE,
    talosBlocchiDaConservare,
} from '@/lib/chat/providers/anthropicAdapter'

/**
 * ⭐⭐⭐ I BLOCCHI CHE ANTHROPIC PRETENDE INDIETRO IMMUTATI.
 *
 * La ricerca degli attrezzi lato server produce `server_tool_use` e
 * `tool_search_tool_result`, e la documentazione — voce «continuing the
 * conversation» — li vuole rimandati **unmodified**. Non farlo e' il difetto
 * per cui l'apertura a gradi e' spenta: al primo giro la torcia si accende, al
 * secondo il provider risponde `PROVIDER_CHAT_FAILED`.
 *
 * Tenerla spenta costa ~4.094 token per messaggio — misurato in
 * `quantoCostaAnthropic.test.ts`.
 *
 * ⛔ Qui l'atteso si RICALCOLA a mano. Un test che rifa' il giro con le stesse
 * funzioni prova che il codice e' d'accordo con se stesso, non che spedisce la
 * forma che l'API accetta.
 */
describe('quali blocchi si conservano', () => {
    it('tiene i due che il fornitore pretende, e NIENTE altro', () => {
        const risposta = [
            { type: 'text', text: 'ciao' },
            { type: 'server_tool_use', id: 'srv_1', name: 'tool_search_tool_bm25', input: { q: 'torcia' } },
            { type: 'tool_search_tool_result', tool_use_id: 'srv_1', content: [{ type: 'tool_reference', name: 'torch' }] },
            { type: 'tool_use', id: 'tu_1', name: 'torch', input: { on: true } },
        ]
        const tenuti = talosBlocchiDaConservare(risposta)
        expect(tenuti.map((b) => (b as { type: string }).type))
            .toEqual(['server_tool_use', 'tool_search_tool_result'])
    })

    it('⛔ AL CONTRARIO: NON tiene i blocchi thinking, e non e un dettaglio', () => {
        /*
         * Un `thinking` firmato rimandato indietro senza la sua firma e' un 400
         * documentato — proprio quello che ha gia' fatto fallire il secondo giro
         * di ogni conversazione con gli strumenti. Se questo test cadesse,
         * avremmo curato un difetto rimettendone in piedi un altro.
         */
        const tenuti = talosBlocchiDaConservare([
            { type: 'thinking', thinking: 'ragiono…', signature: 'abc' },
            { type: 'redacted_thinking', data: 'xyz' },
            { type: 'server_tool_use', id: 's', name: 'n', input: {} },
        ])
        expect(tenuti).toHaveLength(1)
        expect((tenuti[0] as { type: string }).type).toBe('server_tool_use')
    })

    it('⛔ e un tipo NUOVO inventato domani non passa da solo', () => {
        // L'elenco e' chiuso apposta: invecchia in modo visibile, mentre un
        // elenco aperto («tutto cio' che non riconosco») sbaglia in silenzio.
        expect(talosBlocchiDaConservare([{ type: 'qualcosa_di_nuovo', x: 1 }])).toEqual([])
        expect(TALOS_BLOCCHI_DA_CONSERVARE).toHaveLength(2)
    })

    it('regge su risposte malformate senza lanciare', () => {
        for (const brutta of [null, undefined, 'testo', 42, {}, [null], [{ nessun: 'tipo' }]]) {
            expect(() => talosBlocchiDaConservare(brutta)).not.toThrow()
            expect(talosBlocchiDaConservare(brutta)).toEqual([])
        }
    })
})

describe('come tornano nella conversazione', () => {
    const cercaServer = { type: 'server_tool_use', id: 'srv_1', name: 'tool_search_tool_bm25', input: { q: 'torcia' } }
    const esitoCerca = { type: 'tool_search_tool_result', tool_use_id: 'srv_1', content: [] }

    function richiestaCon(turno: Record<string, unknown>) {
        return buildAnthropicRequest('chiave', {
            model: 'claude-haiku-4-5',
            turns: [
                { role: 'user', content: 'accendi la torcia' },
                turno as never,
                { role: 'tool', content: '{"ok":true}', toolCallId: 'tu_1' },
            ],
            effort: 'off',
            thinking: false,
        })
    }

    it('li rimette PRIMA del testo e della chiamata — l ordine e la storia', () => {
        const richiesta = richiestaCon({
            role: 'assistant',
            content: 'accendo',
            providerBlocks: [cercaServer, esitoCerca],
            toolCalls: [{ id: 'tu_1', name: 'torch', arguments: '{"on":true}' }],
        })
        const assistente = (richiesta.body as { messages: Array<{ role: string, content: unknown }> })
            .messages.find((m) => m.role === 'assistant')
        /*
         * ⛔ L'atteso e' scritto a mano, nell'ordine che la sequenza racconta:
         * il modello CERCA, poi parla, poi chiama. Rimettere i blocchi dopo il
         * testo racconterebbe che risponde e poi cerca.
         */
        expect((assistente?.content as Array<{ type: string }>).map((b) => b.type))
            .toEqual(['server_tool_use', 'tool_search_tool_result', 'text', 'tool_use'])
    })

    it('li rimette IMMUTATI: stessa identita, nessun campo aggiunto', () => {
        const richiesta = richiestaCon({
            role: 'assistant',
            content: '',
            providerBlocks: [cercaServer],
        })
        const assistente = (richiesta.body as { messages: Array<{ role: string, content: unknown }> })
            .messages.find((m) => m.role === 'assistant')
        const primo = (assistente?.content as unknown[])[0]
        // ⛔ `toBe`, non `toEqual`: «unmodified» vuol dire che non l'abbiamo
        // nemmeno ricopiato. Una copia uguale oggi e' una copia che domani
        // qualcuno «normalizza».
        expect(primo).toBe(cercaServer)
    })

    it('funziona anche SENZA chiamate: la ricerca puo stare da sola', () => {
        const richiesta = richiestaCon({
            role: 'assistant',
            content: 'ecco',
            providerBlocks: [cercaServer, esitoCerca],
        })
        const assistente = (richiesta.body as { messages: Array<{ role: string, content: unknown }> })
            .messages.find((m) => m.role === 'assistant')
        expect((assistente?.content as Array<{ type: string }>).map((b) => b.type))
            .toEqual(['server_tool_use', 'tool_search_tool_result', 'text'])
    })

    it('⛔ AL CONTRARIO: senza blocchi, il turno esce come e sempre uscito', () => {
        /*
         * La meta' che protegge dal danno collaterale. Il ramo nuovo si accende
         * su `providerBlocks?.length`, e se sbagliasse condizione cambierebbe la
         * forma di OGNI conversazione — comprese quelle che non hanno mai visto
         * una ricerca lato server.
         */
        const richiesta = richiestaCon({
            role: 'assistant',
            content: 'accendo',
            toolCalls: [{ id: 'tu_1', name: 'torch', arguments: '{"on":true}' }],
        })
        const assistente = (richiesta.body as { messages: Array<{ role: string, content: unknown }> })
            .messages.find((m) => m.role === 'assistant')
        expect((assistente?.content as Array<{ type: string }>).map((b) => b.type))
            .toEqual(['text', 'tool_use'])
    })

    it('⛔ e un assistente di solo TESTO resta una stringa, non diventa un elenco', () => {
        // Anthropic accetta entrambe le forme, ma cambiarla senza motivo
        // sposterebbe il prefisso di ogni conversazione e ucciderebbe la cache.
        const richiesta = richiestaCon({ role: 'assistant', content: 'solo parole' })
        const assistente = (richiesta.body as { messages: Array<{ role: string, content: unknown }> })
            .messages.find((m) => m.role === 'assistant')
        expect(typeof assistente?.content).toBe('string')
    })
})
