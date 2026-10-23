// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TalosStreamRequest } from '@/lib/chat/providers/streamShared'

/*
 * ⛔ Difetto 1 dell'owner (20/10/2026, foto dal Pad, piano ChatGPT): «Puoi crearmi un documento interattivo HTML…». Per 52 s a
 * schermo resta «Cerco come si fa…» (il giro di `tool_details`) mentre il modello sta GIÀ scrivendo il documento come argomenti
 * della chiamata. Il nome dell'attrezzo arriva nei primi pezzi del flusso (`response.output_item.added`, `delta.tool_calls[].
 * function.name`, `content_block_start` tool_use), gli argomenti dopo, a frammenti: l'adattatore li ignorava fino alla fine.
 * Qui: lo stream finto in cui il NOME arriva subito e gli argomenti dopo molti pezzi.
 * Ledger: `.claude/ragionamento/LEDGER-RIGHE-ATTREZZI-2026-10-20.md`. Hermes `cli_stream_mixin.py:646` fa lo stesso.
 */
const nativo = vi.hoisted(() => ({ copione: [] as string[], prima: [] as number[] }))
const registro = vi.hoisted(() => ({ providerAdapterFor: (() => null) as (provider: string) => unknown }))
vi.mock('@/lib/chat/providerRegistry', () => ({ providerAdapterFor: (provider: string) => registro.providerAdapterFor(provider) }))
vi.mock('@/lib/chat/flussoNativoDisponibile', () => ({ talosFlussoNativoDisponibile: () => true }))
vi.mock('@/lib/chat/providers/flussoNativo', () => ({
    talosFlussoNativo: async (request: TalosStreamRequest) => {
        for (const riga of nativo.copione) request.onText(riga)
    },
}))

const PEZZI = 300
const sse = (evento: Record<string, unknown>) => `event: ${String(evento.type)}\ndata: ${JSON.stringify(evento)}\n\n`

function copioneResponses(): string[] {
    const righe = [sse({ type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'artifact_create', arguments: '' } })]
    for (let i = 0; i < PEZZI; i += 1) {
        righe.push(sse({ type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'fc_1', delta: i === 0 ? '{"html":"' : '<p>caffè</p>' }))
    }
    const argomenti = `{"html":"${'<p>caffè</p>'.repeat(PEZZI - 1)}"}`
    righe.push(sse({ type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'artifact_create', arguments: argomenti } }))
    righe.push(sse({ type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 900 } } }))
    return righe
}

const INGRESSO = {
    model: { id: 'gpt-6.1-sol', provider: 'chatgpt', displayName: 'GPT', chatCompatibility: 'supported', inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [] },
    turns: [{ role: 'user', content: 'Puoi crearmi un documento interattivo HTML di come funziona un caffè in 3D?' }],
    system: 'Sei TALOS.',
    effort: 'off',
    thinking: false,
} as never

function streamResponse(chunks: string[]): Response {
    const encoder = new TextEncoder()
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            controller.close()
        },
    }), { status: 200 })
}

type Bozze = ReadonlyArray<{ name: string; caratteri: number }>

beforeEach(() => {
    nativo.copione = []
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('difetto 1: il nome dell’attrezzo appena il modello comincia la chiamata', () => {
    it('BZA-07 le bozze si annunciano SUBITO col nome e poi si diradano (≥250 ms), senza perdere la crescita', async () => {
        const { talosCreaBozzeAttrezzi } = await import('@/lib/chat/providers/bozzeAttrezzi')
        let ora = 1_000
        const viste: Bozze[] = []
        const bozze = talosCreaBozzeAttrezzi((elenco) => viste.push(elenco), { ora: () => ora })
        bozze.annota(0, 'artifact_create', 0)
        expect(viste).toEqual([[{ name: 'artifact_create', caratteri: 0 }]])
        for (let i = 0; i < 100; i += 1) bozze.annota(0, undefined, 10)
        expect(viste).toHaveLength(1)
        ora += 250
        bozze.annota(0, undefined, 10)
        expect(viste.at(-1)).toEqual([{ name: 'artifact_create', caratteri: 1_010 }])
        // un secondo attrezzo nel giro si annuncia subito, anche dentro la finestra
        bozze.annota(1, 'web_search', 0)
        expect(viste.at(-1)).toEqual([{ name: 'artifact_create', caratteri: 1_010 }, { name: 'web_search', caratteri: 0 }])
        // un pezzo senza nome di un attrezzo mai nominato non disegna niente
        const vuote: Bozze[] = []
        talosCreaBozzeAttrezzi((elenco) => vuote.push(elenco), { ora: () => ora }).annota(3, undefined, 50)
        expect(vuote).toEqual([])
    })

    it('BZA-01 piano ChatGPT (Responses, flusso nativo): il nome arriva PRIMA degli argomenti, poi la crescita', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        const { chatgptAdapter } = await import('@/lib/chat/providers/openAiCompatibleAdapter')
        nativo.copione = copioneResponses()
        const eventi: Array<{ tipo: 'bozze'; bozze: Bozze } | { tipo: 'testo' }> = []
        const esito = await chatgptAdapter.streamComplete!(INGRESSO, { apiKey: 'token-del-piano' } as never, {
            onChunk: () => eventi.push({ tipo: 'testo' }),
            onBozzeAttrezzi: (bozze: Bozze) => eventi.push({ tipo: 'bozze', bozze }),
        } as never)
        const bozze = eventi.filter((e): e is { tipo: 'bozze'; bozze: Bozze } => e.tipo === 'bozze')
        expect(bozze.length).toBeGreaterThan(0)
        expect(bozze[0]!.bozze).toEqual([{ name: 'artifact_create', caratteri: 0 }])
        // la chiamata vera resta quella intera di `output_item.done`
        expect(esito.toolCalls?.[0]?.name).toBe('artifact_create')
        expect(esito.toolCalls?.[0]?.id).toBe('call_1')
    })

    it('BZA-01b la crescita si vede: col tempo che passa le bozze contano i caratteri arrivati', async () => {
        const { chatgptAdapter } = await import('@/lib/chat/providers/openAiCompatibleAdapter')
        let ora = 0
        vi.spyOn(Date, 'now').mockImplementation(() => (ora += 10))
        nativo.copione = copioneResponses()
        const viste: Bozze[] = []
        await chatgptAdapter.streamComplete!(INGRESSO, { apiKey: 't' } as never, {
            onChunk: () => {},
            onBozzeAttrezzi: (bozze: Bozze) => viste.push(bozze),
        } as never)
        const caratteri = viste.map((b) => b[0]!.caratteri)
        expect(caratteri.length).toBeGreaterThan(2)
        expect(caratteri.at(-1)!).toBeGreaterThan(caratteri[1]!)
        expect(caratteri.at(-1)!).toBeGreaterThan(1_000)
        vi.restoreAllMocks()
    })

    it('BZA-02 chat/completions (DeepSeek): il nome dal primo `delta.tool_calls`, poi gli argomenti', async () => {
        const { deepSeekAdapter } = await import('@/lib/chat/providers/openAiCompatibleAdapter')
        const righe = [`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'document_create', arguments: '' } }] } }] })}\n\n`]
        for (let i = 0; i < PEZZI; i += 1) {
            righe.push(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: i === 0 ? '{"t":"' : 'abc' } }] } }] })}\n\n`)
        }
        righe.push(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"}' } }] }, finish_reason: 'tool_calls' }] })}\n\n`, 'data: [DONE]\n\n')
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse(righe)))
        const viste: Bozze[] = []
        const esito = await deepSeekAdapter.streamComplete!({ ...(INGRESSO as object), model: { ...(INGRESSO as { model: object }).model, provider: 'deepseek' } } as never, { apiKey: 'k' }, {
            onChunk: () => {},
            onBozzeAttrezzi: (bozze: Bozze) => viste.push(bozze),
        } as never)
        expect(viste[0]).toEqual([{ name: 'document_create', caratteri: 0 }])
        expect(esito.toolCalls?.[0]?.name).toBe('document_create')
    })

    it('BZA-03 Anthropic: `content_block_start` tool_use dà il nome, `input_json_delta` la crescita', async () => {
        const { anthropicAdapter } = await import('@/lib/chat/providers/anthropicAdapter')
        const righe = [
            sse({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
            sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Lo preparo.' } }),
            sse({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'artifact_create', input: {} } }),
        ]
        for (let i = 0; i < PEZZI; i += 1) {
            righe.push(sse({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: i === 0 ? '{"html":"' : 'x' } }))
        }
        righe.push(sse({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"}' } }), sse({ type: 'message_stop' }))
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse(righe)))
        const viste: Bozze[] = []
        const esito = await anthropicAdapter.streamComplete!({ ...(INGRESSO as object), model: { ...(INGRESSO as { model: object }).model, id: 'claude-opus-4-8', provider: 'anthropic' } } as never, { apiKey: 'k' }, {
            onChunk: () => {},
            onBozzeAttrezzi: (bozze: Bozze) => viste.push(bozze),
        } as never)
        expect(viste[0]).toEqual([{ name: 'artifact_create', caratteri: 0 }])
        expect(esito.toolCalls?.[0]?.name).toBe('artifact_create')
    })

    it('BZA-04 `buildChatCompletion` porta le bozze dall’adattatore a chi mostra, e le azzera quando una richiesta comincia', async () => {
        const { buildChatCompletion } = await import('@/lib/chat/chatCompletion')
        registro.providerAdapterFor = () => ({
            provider: 'chatgpt', requiresSecret: true, requiresEndpoint: false,
            complete: vi.fn(),
            streamComplete: async (_input: unknown, _credential: unknown, handlers: { onBozzeAttrezzi?: (b: Bozze) => void }) => {
                handlers.onBozzeAttrezzi?.([{ name: 'artifact_create', caratteri: 0 }])
                handlers.onBozzeAttrezzi?.([{ name: 'artifact_create', caratteri: 4_096 }])
                return { text: '', model: 'gpt-6.1-sol', toolCalls: [{ id: 'call_1', name: 'artifact_create', arguments: '{}' }] }
            },
        })
        const completion = buildChatCompletion(() => ({
            profile: { id: 'p', provider: 'chatgpt', model: 'gpt-6.1-sol', display_name: 'GPT' } as never,
            providerModel: (INGRESSO as { model: never }).model,
            apiKey: 'k', effort: 'off', thinking: false,
        }))
        const viste: Bozze[] = []
        await completion([{ role: 'user', content: 'ciao' }], { onChunk: () => {}, onBozzeAttrezzi: (b: Bozze) => viste.push(b) } as never)
        expect(viste).toEqual([[], [{ name: 'artifact_create', caratteri: 0 }], [{ name: 'artifact_create', caratteri: 4_096 }]])
    })
})
