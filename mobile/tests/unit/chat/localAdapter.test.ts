import { beforeEach, describe, expect, it, vi } from 'vitest'

const localEngine = vi.hoisted(() => {
    class TalosLocalEngineOpenError extends Error {
        readonly stage: string
        readonly nativeCode: string

        constructor(stage: string, nativeCode = 'TALOS_LLAMA_OPEN_FAILED') {
            super(nativeCode)
            this.stage = stage
            this.nativeCode = nativeCode
        }
    }
    class TalosLocalEngineGenerationError extends Error {
        readonly stage: string
        readonly nativeCode: string

        constructor(stage: string, nativeCode = 'TALOS_LLAMA_GENERATION_FAILED') {
            super(nativeCode)
            this.stage = stage
            this.nativeCode = nativeCode
        }
    }
    return {
        TalosLocalEngineGenerationError,
        TalosLocalEngineOpenError,
        talosLocalInstalledModels: vi.fn(),
        talosLocalEngineStatus: vi.fn(),
        talosLocalEngineOpen: vi.fn(),
        talosLocalEngineOpenWithFallback: vi.fn(),
        talosLocalEngineChatPlan: vi.fn(),
        talosLocalEngineChatPrompt: vi.fn(),
        talosLocalEngineGenerate: vi.fn(),
        talosLocalEngineCancel: vi.fn(),
        talosLocalEngineClose: vi.fn(),
    }
})
vi.mock('@/services/localEngine', () => localEngine)

const deviceCapacity = vi.hoisted(() => ({ talosMeasureDevice: vi.fn() }))
vi.mock('@/services/deviceCapacity', () => deviceCapacity)

const GIB = 1024 * 1024 * 1024

/** Llama-3.2-3B-Instruct-IQ4_XS, come lo dichiara il file. */
const LLAMA_3B_SHAPE = {
    layers: 28,
    kvHeads: 8,
    headDim: 128,
    trainedContext: 131072,
    weightBytes: Math.round(1.75 * GIB),
    kvBytesPerElement: 2,
}

/** Un telefono stretto: il caso in cui un tetto scritto a mano PROMETTE troppo. */
const SMALL_PHONE = {
    totalRamBytes: 4 * GIB,
    availableRamBytes: Math.round(0.9 * GIB),
    lowMemoryThresholdBytes: Math.round(0.35 * GIB),
    freeStorageBytes: 8 * GIB,
    memoryBandwidthBytesPerSecond: null,
    thermal: 'none' as const,
    abiSupported: true,
}

const { localAdapter } = await import('@/lib/chat/providers/localAdapter')

/**
 * The difference between "you have no models" and "I could not look".
 *
 * They were the same sentence for as long as the code below existed: the walk
 * over the models folder answered null for a folder it could not open, the
 * caller read null as an empty list, and the model picker said "no models
 * available". The advice those two situations need is opposite — one means
 * download something, the other means downloading will change nothing — and on
 * 2026-08-01 the wrong one sent a real debugging session in the wrong direction
 * for three rounds, on a tablet with a two-gigabyte model in the folder.
 */
describe('local provider catalogue', () => {
    beforeEach(() => {
        localEngine.talosLocalInstalledModels.mockReset()
    })

    it('reports an empty device as empty, not as broken', async () => {
        localEngine.talosLocalInstalledModels.mockResolvedValue({ models: [], unreadable: [] })

        const catalog = await localAdapter.listModels(
            { apiKey: null, endpoint: null },
            (() => { throw new Error('the local engine must not reach the network') }) as never,
        )

        expect(catalog.models).toEqual([])
    })

    it('refuses to call a folder it could not open an empty device', async () => {
        localEngine.talosLocalInstalledModels.mockResolvedValue({
            models: [],
            unreadable: [{
                path: '/storage/emulated/0/Android/data/ai.talos/files/models',
                reason: 'AccessDeniedException: /storage/emulated/0/Android/data/ai.talos/files/models',
            }],
        })

        // The path travels with the error: a folder nobody can name is a folder
        // nobody can fix. Asserted on the parameters rather than on rendered
        // text so it holds in both languages.
        await expect(localAdapter.listModels(
            { apiKey: null, endpoint: null },
            (() => { throw new Error('unreachable') }) as never,
        )).rejects.toMatchObject({
            uiMessageKey: 'models.localModelsUnreadable',
            uiMessageParameters: {
                path: '/storage/emulated/0/Android/data/ai.talos/files/models',
            },
        })
    })

    it('still offers the models it could read when only part of the walk failed', async () => {
        localEngine.talosLocalInstalledModels.mockResolvedValue({
            models: [{ path: '/models/a/qwen.gguf', name: 'qwen.gguf', bytes: 1 }],
            unreadable: [{ path: '/models/b', reason: 'AccessDeniedException: /models/b' }],
        })

        // One locked folder must not hide the model beside it. The user can run
        // what is runnable, and a refusal here would take that away to report a
        // problem with something they were not asking for.
        const catalog = await localAdapter.listModels(
            { apiKey: null, endpoint: null },
            (() => { throw new Error('unreachable') }) as never,
        )

        expect(catalog.models.map((model) => model.id)).toEqual(['/models/a/qwen.gguf'])
    })
})

describe('LOCAL-CONTEXT-PARITY-01 local chat open', () => {
    beforeEach(() => {
        localEngine.talosLocalEngineStatus.mockReset()
        localEngine.talosLocalEngineOpen.mockReset()
        localEngine.talosLocalEngineOpenWithFallback.mockReset()
        localEngine.talosLocalEngineChatPlan.mockReset()
        localEngine.talosLocalEngineChatPrompt.mockReset()
        localEngine.talosLocalEngineGenerate.mockReset()
        deviceCapacity.talosMeasureDevice.mockReset()
        // Il caso normale di questa suite: nessuna misura. Che è anche il caso
        // reale di una build senza motore nativo — e deve LASCIAR PROVARE, non
        // rifiutare.
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true,
            backends: 'CPU',
            loadedPath: null,
            shape: null,
        })
        localEngine.talosLocalEngineChatPrompt.mockResolvedValue('templated prompt')
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'templated prompt',
            promptTokens: 120,
            contextTokens: 4096,
        })
        localEngine.talosLocalEngineGenerate.mockResolvedValue({ text: 'Ciao', tokens: 1 })
    })

    function input(path = '/models/qwen.gguf') {
        return {
            model: {
                id: path,
                provider: 'local',
                displayName: 'Qwen',
                chatCompatibility: 'unknown',
                supportedParameters: [],
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            turns: [{ role: 'user', content: 'Rispondi con ciao.' }],
            effort: 'low',
            thinking: false,
        }
    }

    it('opens through the shared 4096 policy instead of the former private 16384', async () => {
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpenWithFallback).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            { contextTokens: 4096 },
        )
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
    })

    it('turns a final context failure into actionable localized provider metadata', async () => {
        localEngine.talosLocalEngineOpenWithFallback.mockRejectedValue(
            new localEngine.TalosLocalEngineOpenError('context'),
        )

        await expect(localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )).rejects.toMatchObject({
            provider: 'local',
            operation: 'complete',
            message: 'TALOS_LOCAL_MODEL_OPEN_CONTEXT',
            uiMessageKey: 'models.localModelOpenContext',
        })
    })

    it('C45-RED-18H reopens the same model exactly once at 8192 for the measured Qwen tool prompt', async () => {
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineOpen.mockResolvedValue({ contextTokens: 8192 })
        localEngine.talosLocalEngineChatPlan
            .mockResolvedValueOnce({
                prompt: 'qwen-4096',
                promptTokens: 5779,
                contextTokens: 4096,
            })
            .mockResolvedValueOnce({
                prompt: 'qwen-8192',
                promptTokens: 5779,
                contextTokens: 8192,
            })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledTimes(1)
        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            { contextTokens: 8192 },
        )
        expect(localEngine.talosLocalEngineChatPlan).toHaveBeenCalledTimes(2)
        expect(localEngine.talosLocalEngineGenerate).toHaveBeenCalledWith(
            'qwen-8192',
            expect.any(Function),
            { maxTokens: 1024, stopAtEndOfGeneration: true },
        )
    })

    /**
     * C45-RED-19D — il rifiuto adesso viene da una MISURA, non da un numero.
     *
     * Il telefono è stretto e il modello è grande: il tetto onesto sta sotto ciò
     * che la conversazione chiede, quindi si rifiuta senza troncare e senza
     * generare. È lo stesso esito di prima, ottenuto per la ragione giusta —
     * e su un dispositivo capiente lo stesso codice non rifiuta più (sotto).
     */
    it('C45-RED-19D refuses above the MEASURED ceiling, without truncating or generating', async () => {
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true,
            backends: 'CPU',
            loadedPath: null,
            shape: LLAMA_3B_SHAPE,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(SMALL_PHONE)
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'too-large',
            promptTokens: 8000,
            contextTokens: 4096,
        })

        await expect(localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )).rejects.toMatchObject({
            message: 'TALOS_LOCAL_PROMPT_TOO_LONG',
            uiMessageKey: 'models.localPromptTooLong',
        })
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
        expect(localEngine.talosLocalEngineGenerate).not.toHaveBeenCalled()
    })

    /**
     * Lo STESSO prompt, su un tablet capiente, non si rifiuta più.
     *
     * È il difetto dell'owner: `PROVIDER_CHAT_FAILED` su un dispositivo da 12 GB
     * per un contesto che reggeva senza fatica. Le due prove sono gemelle
     * apposta — cambia solo il dispositivo, e cambia l'esito. Con un tetto
     * scritto a mano non potrebbero esistere entrambe.
     */
    it('C45-RED-19D the same conversation is served on a device that can hold it', async () => {
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true,
            backends: 'CPU',
            loadedPath: null,
            shape: LLAMA_3B_SHAPE,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue({
            totalRamBytes: Math.round(11.2 * GIB),
            availableRamBytes: Math.round(4.47 * GIB),
            lowMemoryThresholdBytes: Math.round(0.5 * GIB),
            freeStorageBytes: 46 * GIB,
            memoryBandwidthBytesPerSecond: null,
            thermal: 'none',
            abiSupported: true,
        })
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineOpen.mockResolvedValue({ contextTokens: 16384 })
        localEngine.talosLocalEngineChatPlan
            .mockResolvedValueOnce({ prompt: 'big-4096', promptTokens: 8000, contextTokens: 4096 })
            .mockResolvedValueOnce({ prompt: 'big-16384', promptTokens: 8000, contextTokens: 16384 })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            { contextTokens: 16384 },
        )
        expect(localEngine.talosLocalEngineGenerate).toHaveBeenCalled()
    })

    /**
     * Quando non c'è misura, l'ultima parola resta al motore.
     *
     * Rifiutare qui vorrebbe dire decidere al posto del dispositivo su un numero
     * che non abbiamo — cioè rimettere il muro, solo più in basso.
     */
    it('C45-RED-19D asks the engine instead of refusing when nothing could be measured', async () => {
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineOpen.mockResolvedValue({ contextTokens: 16384 })
        localEngine.talosLocalEngineChatPlan
            .mockResolvedValueOnce({ prompt: 'p-4096', promptTokens: 8000, contextTokens: 4096 })
            .mockResolvedValueOnce({ prompt: 'p-16384', promptTokens: 8000, contextTokens: 16384 })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            { contextTokens: 16384 },
        )
    })
})

/**
 * C45-RED-19N — la cucitura: il modello locale riempie il cassetto
 * «Ragionamento» come fanno i provider di rete.
 *
 * La prova sta QUI e non solo accanto al separatore puro, perché il difetto era
 * nella cucitura: il separatore non esisteva e l'adattatore mandava tutto in
 * `onChunk`. È la stessa lezione dell'avviso di partenza dei download.
 */
describe('C45-RED-19N reasoning is routed while it streams', () => {
    // `input()` dell'altro blocco e' fuori portata: qui serve il minimo.
    const richiesta = () => ({
        model: {
            id: '/models/qwen.gguf', provider: 'local', displayName: 'Qwen',
            chatCompatibility: 'unknown', supportedParameters: [],
            inputModalities: ['text'], outputModalities: ['text'],
        },
        turns: [{ role: 'user', content: 'Rispondi con PRONTO.' }],
        effort: 'low',
        thinking: false,
    })

    it('non manda mai il marcatore nella bolla, e riempie il ragionamento', async () => {
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'p', promptTokens: 100, contextTokens: 4096,
        })
        // Il motore consegna a pezzi arbitrari, col tag spezzato in mezzo.
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                for (const pezzo of ['<thi', 'nk>rag', 'iono</th', 'ink>PRON', 'TO']) onDelta(pezzo)
                return { text: 'PRONTO', tokens: 2 }
            },
        )

        const testo: string[] = []
        const ragionamento: string[] = []
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true, backends: 'CPU', loadedPath: null, shape: null,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)
        await localAdapter.streamComplete(
            richiesta() as never,
            { apiKey: null, endpoint: null },
            {
                onChunk: (t: string) => testo.push(t),
                onReasoning: (t: string) => ragionamento.push(t),
            } as never,
        )

        expect(testo.join('')).toBe('PRONTO')
        expect(ragionamento.join('')).toBe('ragiono')
        // Nessun pezzo intermedio contiene il marcatore: è il punto di tutto.
        for (const pezzo of testo) expect(pezzo).not.toMatch(/<|>/)
    })
})
