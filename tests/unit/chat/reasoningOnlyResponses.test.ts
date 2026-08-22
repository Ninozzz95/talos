import { describe, expect, it, vi } from 'vitest'
import { openRouterAdapter } from '@/lib/chat/providers/openAiCompatibleAdapter'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'

/**
 * Il difetto che l'owner ha trovato in treno, 2026-08-02.
 *
 * Deep Research con GPT 5.6 Terra su OpenRouter: `b1:search` fatto, `synthesis`
 * **failed**, `TALOS_PROVIDER_RESPONSE_MALFORMED`. La risposta del provider non
 * era malformata affatto: era arrivata con `content` vuoto e il testo nel canale
 * del ragionamento.
 *
 * L'asimmetria è dentro lo stesso file: `streamComplete()` legge
 * `reasoning_content` e `reasoning` dal delta; `complete()` no. Deep Research usa
 * `complete()`. È una lezione insegnata a metà del codice.
 *
 * Non è un caso di nicchia: è documentato su più integrazioni nel 2026 che i
 * modelli OpenRouter che restituiscono `reasoning_details` si vedono il
 * contenuto scartato in silenzio, e che la fase di ragionamento può consumare
 * l'intero budget di token lasciando zero per la risposta.
 */

const MODEL: TalosMobileProviderModel = {
    id: 'openai/gpt-5.6-terra',
    provider: 'openrouter',
    displayName: 'GPT 5.6 Terra',
    chatCompatibility: 'supported',
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: [],
}

function transportReturning(message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return {
        request: vi.fn().mockResolvedValue({
            status: 200,
            data: { model: 'openai/gpt-5.6-terra', choices: [{ finish_reason: 'stop', message, ...extra }] },
        }),
    }
}

function ask(transport: { request: ReturnType<typeof vi.fn> }) {
    return openRouterAdapter.complete(
        { model: MODEL, turns: [{ role: 'user', content: 'sintetizza' }], effort: 'off', thinking: false },
        { apiKey: 'k', endpoint: null },
        transport,
    )
}

describe('una risposta che arriva solo come ragionamento', () => {
    it('legge `reasoning` quando il contenuto è vuoto, come già fa lo streaming', async () => {
        const result = await ask(transportReturning({ content: '', reasoning: 'SINTESI: la risposta è 42.' }))

        expect(result.text).toBe('SINTESI: la risposta è 42.')
    })

    it('legge anche `reasoning_content`, che è il nome che usano altri', async () => {
        const result = await ask(transportReturning({ content: null, reasoning_content: 'SINTESI: idem.' }))

        expect(result.text).toBe('SINTESI: idem.')
    })

    it('legge `reasoning_details`, il campo che fa sparire il contenuto in silenzio', async () => {
        const result = await ask(transportReturning({
            content: null,
            reasoning_details: [
                { type: 'reasoning.text', text: 'primo pezzo. ' },
                { type: 'reasoning.text', text: 'secondo pezzo.' },
            ],
        }))

        expect(result.text).toBe('primo pezzo. secondo pezzo.')
    })

    /**
     * L'altra causa, che è diversa e va detta diversamente: il modello NON ha
     * risposto. Ha speso tutto il budget a ragionare — misurato su gpt-5-nano,
     * dove un tetto basso di token viene consumato dal ragionamento e il
     * contenuto visibile resta vuoto.
     *
     * Qui non c'è niente da recuperare. Ma «risposta malformata» è la parola
     * sbagliata: la risposta è arrivata ed era regolare, semplicemente vuota.
     */
    it('distingue «ha finito il budget ragionando» da «risposta malformata»', async () => {
        const transport = transportReturning({ content: '' }, { finish_reason: 'length' })

        await expect(ask(transport)).rejects.toMatchObject({
            message: 'TALOS_PROVIDER_RESPONSE_EMPTY',
        })
    })

    it('il contenuto vero batte sempre il ragionamento', async () => {
        // Un modello che manda entrambi non deve farci preferire i suoi appunti
        // alla sua risposta.
        const result = await ask(transportReturning({ content: 'la risposta', reasoning: 'gli appunti' }))

        expect(result.text).toBe('la risposta')
    })
})
