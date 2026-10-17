// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chatgptAdapter, openAiAdapter } from '@/lib/chat/providers/openAiCompatibleAdapter'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import { CAMPI_VIETATI_DAL_PIANO } from '@/lib/chatgpt/richiesta'
import { defineTalosTool, talosToolsForOpenAiResponses } from '@/lib/tools/registry'

/**
 * N15 fetta 5 (mobile, 13/10/2026) — il piano ChatGPT come FORNITORE della chat. Regole ufficiali
 * (developers.openai.com/siwc/token-sharing-open-source/: models-and-inference, preview-limitations, errors-and-recovery) e
 * indicazioni del desktop del 13/10: solo `GET /v1/models` e `POST /v1/responses`; `store:false` e `stream:true` sempre;
 * una lista di campi da omettere; attrezzi come funzioni PIATTE con `strict:false` esplicito; modelli solo con
 * `visibility == "list"`, nell'ordine del server; il limite d'uso è una pausa, mai un cambio di fornitore.
 */
const attrezzo = defineTalosTool({
    name: 'notes_create',
    title: 'Create a note',
    description: 'Create a note.',
    action: 'write',
    input: z.object({ title: z.string(), body: z.string().optional() }),
    async run() { return { ok: true, content: '' } },
})

function trasporto(...risposte: Array<{ status: number, data: unknown, headers?: Record<string, string> }>) {
    const request = vi.fn()
    risposte.forEach((r) => request.mockResolvedValueOnce(r))
    return { request, transport: { request } as TalosMobileHttpTransport }
}
const sse = (...eventi: Array<Record<string, unknown>>) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
const COMPLETA = { type: 'response.completed', response: { id: 'resp_1', object: 'response', status: 'completed', model: 'gpt-6-luna',
    output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ciao', annotations: [] }] }],
    usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } }
const modello = { id: 'gpt-6-luna', provider: 'chatgpt' as const, displayName: 'GPT-6 Luna', chatCompatibility: 'supported' as const,
    inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'] }
const richiesta = (extra = {}) => ({ model: modello, turns: [{ role: 'user' as const, content: 'ciao' }], system: 'Sei TALOS.', effort: 'high' as const,
    thinking: false, tools: [attrezzo], ...extra })

describe('N15 — il piano ChatGPT come fornitore della chat', () => {
    it('N15-FORN-01: l elenco dei modelli è quello dell account — solo «list», nell ordine del server, col nome da mostrare', async () => {
        const { request, transport } = trasporto({ status: 200, data: { models: [
            { slug: 'gpt-6-luna', display_name: 'GPT-6 Luna', visibility: 'list', context_window: 400_000,
                supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }], input_modalities: ['text', 'image'] },
            { slug: 'interno', display_name: 'Interno', visibility: 'hide' },
            { slug: 'gpt-6-sol', visibility: 'list' },
            { display_name: 'senza slug', visibility: 'list' },
        ] } })
        const catalogo = await chatgptAdapter.listModels({ apiKey: 'TOKEN-ACCESSO' }, transport)
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: 'https://api.openai.com/v1/models',
            headers: expect.objectContaining({ authorization: 'Bearer TOKEN-ACCESSO' }) }))
        expect(catalogo.provider).toBe('chatgpt')
        expect(catalogo.models.map((m) => m.id)).toEqual(['gpt-6-luna', 'gpt-6-sol'])
        expect(catalogo.models[0]).toMatchObject({ provider: 'chatgpt', displayName: 'GPT-6 Luna', chatCompatibility: 'supported',
            contextLength: 400_000, inputModalities: ['text', 'image'], reasoning: { mandatory: false, supportedEfforts: ['low', 'high'] } })
        expect(catalogo.models[1]!.displayName).toBe('gpt-6-sol')
    })

    it('N15-FORN-02: ciò che parte obbedisce al piano — /responses, mai salvato, sempre in flusso, nessun campo vietato, attrezzi piatti non rigidi', async () => {
        const { request, transport } = trasporto({ status: 200, data: sse({ type: 'response.created' }, COMPLETA) })
        const esito = await chatgptAdapter.complete(richiesta(), { apiKey: 'TOKEN-ACCESSO' }, transport)
        const inviata = request.mock.calls[0]![0] as { url: string, headers: Record<string, string>, data: Record<string, any> }
        expect(inviata.url).toBe('https://api.openai.com/v1/responses')
        expect(inviata.headers.authorization).toBe('Bearer TOKEN-ACCESSO')
        expect(inviata.data.store).toBe(false)
        expect(inviata.data.stream).toBe(true)
        expect(inviata.data.instructions).toBe('Sei TALOS.')
        expect(typeof inviata.data.prompt_cache_key).toBe('string')
        for (const campo of CAMPI_VIETATI_DAL_PIANO) expect(Object.hasOwn(inviata.data, campo), campo).toBe(false)
        expect(inviata.data.tools).toHaveLength(1)
        expect(inviata.data.tools[0]).toMatchObject({ type: 'function', name: 'notes_create', strict: false })
        expect(inviata.data.tools[0].namespace).toBeUndefined()
        // chi voleva una risposta intera la riceve, costruita dal flusso
        expect(esito.text).toBe('ciao')
    })

    it('N15-FORN-03: il limite d uso del piano si dice col suo nome e NON è «chiave sbagliata»; un flusso mozzo è un errore, non una risposta corta', async () => {
        const limite = trasporto({ status: 429, data: { error: { code: 'subscription_sharing_usage_limit_exceeded' } }, headers: { 'retry-after': '120' } })
        const errore = await chatgptAdapter.complete(richiesta({ tools: [] }), { apiKey: 'T' }, limite.transport).catch((e) => e)
        expect(errore).toBeInstanceOf(TalosMobileProviderError)
        expect(errore).toMatchObject({ provider: 'chatgpt', status: 429, message: 'CHATGPT_LIMITE_DEL_PIANO', uiMessageKey: 'models.chatgptErrors.CHATGPT_LIMITE_DEL_PIANO' })
        // quanto aspettare l'ha detto OpenAI (Retry-After: 120): chi sta sopra aspetta quello e rifà la stessa richiesta
        expect(errore.attesaMs).toBe(120_000)
        // un solo invio: il piano non si ritenta alla cieca, e mai su un altro fornitore
        expect(limite.request).toHaveBeenCalledTimes(1)

        const mozzo = trasporto({ status: 200, data: sse({ type: 'response.created' }, { type: 'response.output_text.delta', delta: 'cia' }) })
        const guasto = await chatgptAdapter.complete(richiesta({ tools: [] }), { apiKey: 'T' }, mozzo.transport).catch((e) => e)
        expect(guasto).toBeInstanceOf(TalosMobileProviderError)
        expect(guasto.message).not.toContain('cia')
    })

    /**
     * N15-FORN-07 (13/10/2026) — la chat vera va in FLUSSO: il limite d'uso deve avere lo stesso nome e la stessa attesa
     * anche lì, dove il rifiuto arriva come stato HTTP della risposta e non dal trasporto nativo.
     */
    it('N15-FORN-07: in flusso, un 429 del piano è il limite d uso col suo nome e con l attesa detta da OpenAI (Retry-After)', async () => {
        const rete = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ error: { code: 'subscription_sharing_usage_limit_exceeded' } }),
            { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '300' } },
        ))
        try {
            const errore = await chatgptAdapter.streamComplete!(richiesta({ tools: [] }), { apiKey: 'T' }, { onChunk: () => {} }).catch((e) => e)
            expect(errore).toBeInstanceOf(TalosMobileProviderError)
            expect(errore).toMatchObject({ provider: 'chatgpt', status: 429, message: 'CHATGPT_LIMITE_DEL_PIANO', attesaMs: 300_000 })
            expect(rete).toHaveBeenCalledTimes(1)
            const [indirizzo, opzioni] = rete.mock.calls[0]! as [string, RequestInit]
            expect(String(indirizzo)).toBe('https://api.openai.com/v1/responses')
            const corpo = JSON.parse(String(opzioni.body))
            expect(corpo.stream).toBe(true)
            expect(corpo.store).toBe(false)
        } finally { rete.mockRestore() }
    })

    it('N15-FORN-04 AL CONTRARIO: il fornitore OpenAI a chiave resta com era — non in flusso forzato, nessuna chiave di cache imposta dal piano', async () => {
        const { request, transport } = trasporto({ status: 200, data: COMPLETA.response })
        await openAiAdapter.complete({ ...richiesta(), model: { ...modello, provider: 'openai' as const, id: 'gpt-5.6' } }, { apiKey: 'sk-chiave' }, transport)
        const inviata = request.mock.calls[0]![0] as { url: string, data: Record<string, any> }
        expect(inviata.url).toBe('https://api.openai.com/v1/responses')
        expect(inviata.data.stream).toBe(false)
        expect(inviata.data.store).toBe(false)
    })

    it('N15-FORN-05 (trappola R-01 del desktop, 12/10): su Responses ogni attrezzo dichiara strict:false, anche per OpenAI a chiave', () => {
        // Senza `strict` dichiarato, su Responses ogni campo facoltativo diventa obbligatorio e il modello manda "".
        const attrezzi = talosToolsForOpenAiResponses([attrezzo as never]) as Array<Record<string, unknown>>
        expect(attrezzi[0]).toMatchObject({ type: 'function', name: 'notes_create', strict: false })
    })
})
