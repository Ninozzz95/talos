import { describe, expect, it } from 'vitest'
import { buildAnthropicRequest } from '@/lib/chat/anthropicClient'
import { compatibleCompletionData } from '@/lib/chat/providers/openAiCompatibleAdapter'

/**
 * ⛔⛔⛔ UNA CONVERSAZIONE AVVELENATA NON GUARISCE DA SOLA — e questa è la cura.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-14
 *
 * Una richiesta è fallita **dopo** che il modello aveva emesso `tool_use` e
 * **prima** che salvassimo il risultato. Da quel momento quella chat ha
 * risposto `PROVIDER_CHAT_FAILED` a **ogni** messaggio successivo: Anthropic
 * esige che ogni `tool_use` sia risposto da un `tool_result`, e lì non c'era.
 *
 * ⇒ Non serve un esperimento per arrivarci: basta un errore del provider, un
 * invio annullato o l'app chiusa nel mezzo. E più si scrive, più si ripete —
 * è il difetto K-1, «le sessioni avvelenate non guariscono».
 */
function corpo(turns: unknown[]): Array<{ role: string; content: unknown }> {
    const richiesta = buildAnthropicRequest('k', {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 100,
        turns,
    } as never) as { body: { messages: Array<{ role: string; content: unknown }> } }
    return richiesta.body.messages
}

function blocchi(messaggio: { content: unknown }): Array<Record<string, unknown>> {
    return Array.isArray(messaggio.content) ? messaggio.content as Array<Record<string, unknown>> : []
}

describe('chiamate orfane nella storia', () => {
    it('⛔⛔ un tool_use senza risultato RICEVE una risposta, invece di uscire nudo', () => {
        const messaggi = corpo([
            { role: 'user', content: 'accendi la torcia' },
            {
                role: 'assistant',
                content: 'Accendo.',
                toolCalls: [{ id: 'toolu_1', name: 'device_torch', arguments: '{}' }],
            },
            { role: 'user', content: 'riaccendila' },
        ])

        const chiamate = messaggi.flatMap(blocchi).filter((b) => b.type === 'tool_use')
        const risposte = messaggi.flatMap(blocchi).filter((b) => b.type === 'tool_result')

        expect(chiamate).toHaveLength(1)
        expect(risposte.map((r) => r.tool_use_id)).toEqual(['toolu_1'])
    })

    /*
     * ⛔ Si CONSERVA la domanda e si dice la verità sul suo esito. Cancellare il
     * `tool_use` toglierebbe dalla storia il fatto che il modello ha chiesto
     * qualcosa — e quel fatto è vero, è successo, ed è la ragione per cui la
     * risposta dopo ha senso.
     */
    it('⛔ la chiamata NON viene cancellata, e la risposta dice che non è stata eseguita', () => {
        const messaggi = corpo([
            { role: 'user', content: 'x' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_9', name: 'device_torch', arguments: '{}' }] },
            { role: 'user', content: 'y' },
        ])

        expect(messaggi.flatMap(blocchi).some((b) => b.type === 'tool_use' && b.id === 'toolu_9')).toBe(true)
        expect(messaggi.flatMap(blocchi).find((b) => b.type === 'tool_result')?.content)
            .toContain('Not run')
    })

    /*
     * ⛔ IL VERSO CONTRARIO: una chiamata che la sua risposta CE L'HA non deve
     * riceverne una seconda. Senza questo, una cura scritta al contrario —
     * rispondere sempre — passerebbe i due test qui sopra e romperebbe ogni
     * conversazione sana.
     */
    it('⛔ una chiamata GIÀ risposta non ne riceve una seconda', () => {
        const messaggi = corpo([
            { role: 'user', content: 'accendi la torcia' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_1', name: 'device_torch', arguments: '{}' }] },
            { role: 'tool', content: 'done', toolCallId: 'toolu_1' },
            { role: 'assistant', content: 'Fatto.' },
        ])

        const risposte = messaggi.flatMap(blocchi).filter((b) => b.type === 'tool_result')
        expect(risposte).toHaveLength(1)
        expect(risposte[0]?.content).toBe('done')
    })

    /*
     * ⛔ Due chiamate nello stesso giro, una sola risposta: si completa quella
     * che manca e si lascia stare quella che c'è. È il caso che una guardia
     * scritta «tutto o niente» sbaglierebbe.
     */
    it('⛔ con due chiamate e una sola risposta, si completa SOLO la mancante', () => {
        const messaggi = corpo([
            { role: 'user', content: 'x' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [
                    { id: 'toolu_1', name: 'device_torch', arguments: '{}' },
                    { id: 'toolu_2', name: 'device_volume', arguments: '{}' },
                ],
            },
            { role: 'tool', content: 'acceso', toolCallId: 'toolu_1' },
            { role: 'user', content: 'e poi?' },
        ])

        const risposte = messaggi.flatMap(blocchi).filter((b) => b.type === 'tool_result')
        expect(risposte.map((r) => r.tool_use_id).sort()).toEqual(['toolu_1', 'toolu_2'])
        expect(risposte.find((r) => r.tool_use_id === 'toolu_1')?.content).toBe('acceso')
        expect(risposte.find((r) => r.tool_use_id === 'toolu_2')?.content).toContain('Not run')
    })
})

/**
 * ⛔⛔⛔ LA SECONDA METÀ: un turno assistant VUOTO avvelena allo stesso modo.
 *
 * Curate le orfane, la chat rotta ha risposto (08:09) — ma appena si chiedeva
 * un'azione tornava `PROVIDER_CHAT_FAILED`. Un turno assistant senza testo esce
 * come `content: ""`, e Anthropic rifiuta i messaggi vuoti. **Ogni invio
 * fallito ne lascia uno**: l'errore genera l'errore dopo.
 */
describe('turni assistant vuoti', () => {
    it('⛔⛔ un turno assistant VUOTO non viene spedito', () => {
        const messaggi = corpo([
            { role: 'user', content: 'ciao' },
            { role: 'assistant', content: '' },
            { role: 'user', content: 'ancora' },
        ])

        expect(messaggi.filter((m) => m.role === 'assistant')).toHaveLength(0)
        expect(messaggi.map((m) => m.content)).toEqual(['ciao', 'ancora'])
    })

    /*
     * ⛔ IL VERSO CONTRARIO, e qui è la parte delicata: «vuoto» vuol dire senza
     * NIENTE, non senza testo. Un turno che porta una chiamata o un'immagine ha
     * il suo contenuto nei blocchi, e buttarlo cancellerebbe l'azione.
     */
    it('⛔ un turno senza testo ma CON una chiamata resta', () => {
        const messaggi = corpo([
            { role: 'user', content: 'accendi' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_1', name: 'device_torch', arguments: '{}' }] },
            { role: 'tool', content: 'ok', toolCallId: 'toolu_1' },
        ])

        expect(messaggi.filter((m) => m.role === 'assistant')).toHaveLength(1)
        expect(blocchi(messaggi.find((m) => m.role === 'assistant')!).some((b) => b.type === 'tool_use')).toBe(true)
    })

    it('⛔ un turno con testo VERO resta, ovviamente', () => {
        const messaggi = corpo([
            { role: 'user', content: 'ciao' },
            { role: 'assistant', content: 'Eccomi.' },
            { role: 'user', content: 'bene' },
        ])

        expect(messaggi.filter((m) => m.role === 'assistant')).toHaveLength(1)
    })
})

/**
 * ⛔⛔ LA SECONDA COLONNA: OpenAI ha lo STESSO vincolo, e quindi lo stesso buco.
 *
 * *«An assistant message with 'tool_calls' must be followed by tool messages
 * responding to each tool_call_id»*. Curato il lato Anthropic perché lì il
 * danno era misurato, questo lo si è curato **prima** che costasse una
 * conversazione — ma con gli stessi test, perché il difetto è lo stesso.
 */
function messaggiOpenAi(turns: unknown[]): Array<Record<string, unknown>> {
    const corpo = compatibleCompletionData(
        { provider: 'openrouter', baseUrl: 'https://x', metadata: 'openrouter' } as never,
        {
            model: { id: 'gpt-x', provider: 'openrouter', supportedParameters: ['tools'] },
            turns,
            effort: 'off',
            thinking: false,
        } as never,
        false,
    )
    return corpo.messages as Array<Record<string, unknown>>
}

describe('chiamate orfane — dialetto OpenAI', () => {
    it('⛔⛔ un tool_calls senza risposta NE RICEVE una', () => {
        const messaggi = messaggiOpenAi([
            { role: 'user', content: 'accendi la torcia' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'device_torch', arguments: '{}' }] },
            { role: 'user', content: 'riaccendila' },
        ])

        const risposte = messaggi.filter((m) => m.role === 'tool')
        expect(risposte.map((r) => r.tool_call_id)).toEqual(['c1'])
        expect(String(risposte[0]?.content)).toContain('Not run')
    })

    /** ⛔ Il verso contrario: una risposta che c'è non viene raddoppiata. */
    it('⛔ una chiamata GIÀ risposta non ne riceve una seconda', () => {
        const messaggi = messaggiOpenAi([
            { role: 'user', content: 'x' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'device_torch', arguments: '{}' }] },
            { role: 'tool', content: 'acceso', toolCallId: 'c1' },
        ])

        const risposte = messaggi.filter((m) => m.role === 'tool')
        expect(risposte).toHaveLength(1)
        expect(risposte[0]?.content).toBe('acceso')
    })

    it('⛔ con due chiamate e una sola risposta, si completa SOLO la mancante', () => {
        const messaggi = messaggiOpenAi([
            { role: 'user', content: 'x' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [
                    { id: 'c1', name: 'device_torch', arguments: '{}' },
                    { id: 'c2', name: 'device_volume', arguments: '{}' },
                ],
            },
            { role: 'tool', content: 'acceso', toolCallId: 'c1' },
            { role: 'user', content: 'e poi?' },
        ])

        const risposte = messaggi.filter((m) => m.role === 'tool')
        expect(risposte.map((r) => r.tool_call_id).sort()).toEqual(['c1', 'c2'])
        expect(risposte.find((r) => r.tool_call_id === 'c2')?.content).toContain('Not run')
    })
})
