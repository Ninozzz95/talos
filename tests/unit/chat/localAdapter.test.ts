import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

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
        talosLocalEnginePlanPrompt: vi.fn(),
        talosLocalEngineTemplateCapabilities: vi.fn(),
        /*
         * Non una spia: il valore VERO, perche' l'aritmetica del tetto ci si
         * appoggia e una spia che risponde `undefined` non farebbe fallire il
         * conto — lo farebbe rispondere un numero sbagliato in silenzio.
         * I due valori sono fissati da `tests/unit/models/kvCacheType.test.ts`,
         * dove `q8_0` vale 34/32 e non 1: un blocco q8_0 porta con se' la sua
         * scala.
         */
        talosKvBytesPerElement: (type: string | null | undefined) =>
            (type === 'q8_0' ? 34 / 32 : 2),
        talosLocalEngineChatPrompt: vi.fn(),
        talosLocalEngineGenerate: vi.fn(),
        talosLocalEngineCancel: vi.fn(),
        talosLocalEngineClose: vi.fn(),
        // B1: chiamata dopo ogni generazione riuscita per tracciare i tempi
        // nativi. `null` e' l'esito onesto gia' definito dalla funzione vera
        // quando non c'e' niente da riportare - non un valore inventato per
        // il test.
        talosLocalEngineTimings: vi.fn(async () => null),
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

const { localAdapter, prefissoResoDiProiettato } = await import('@/lib/chat/providers/localAdapter')
const { talosProjectLocalToolConversation } = await import('@/lib/chat/localToolPromptProtocol')

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


/**
 * ⛔ Il contesto aperto si controlla per PROPRIETÀ, non per numero esatto.
 *
 * Questi test pretendevano `8192`, che era la politica di allocazione
 * travestita da aspettativa: cambiandola per una ragione misurata — allocare
 * il doppio costa ~10% della generazione, perché ogni token rilegge la cache —
 * cadevano cinque test senza che niente fosse rotto.
 *
 * Ciò che devono proteggere è un'altra cosa, e resta: si apre **una volta
 * sola**, con un contesto che **regge** il fabbisogno e **non spreca**.
 */
function contestoAperto(finto: { mock: { calls: unknown[][] } }): number {
    const chiamate = finto.mock.calls
    const opzioni = chiamate[chiamate.length - 1]?.[1] as { contextTokens?: number } | undefined
    return opzioni?.contextTokens ?? 0
}

function reggeSenzaSprecare(ottenuto: number, promptTokens: number, completion = 1024): void {
    const necessario = promptTokens + completion + 1
    expect(ottenuto, 'il contesto deve REGGERE il fabbisogno').toBeGreaterThanOrEqual(necessario)
    expect(ottenuto, 'e non deve sprecare: il doppio costa il 10% della generazione')
        .toBeLessThan(necessario * 1.5)
}

describe('LOCAL-CONTEXT-PARITY-01 local chat open', () => {
    beforeEach(() => {
        localEngine.talosLocalEngineStatus.mockReset()
        localEngine.talosLocalEngineOpen.mockReset()
        localEngine.talosLocalEngineOpenWithFallback.mockReset()
        localEngine.talosLocalEngineChatPlan.mockReset()
        localEngine.talosLocalEnginePlanPrompt.mockReset()
        localEngine.talosLocalEngineTemplateCapabilities.mockReset()
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue({
            supportsTools: true,
            supportsToolCalls: true,
            supportsSystemRole: true,
        })
        // Il lato nativo che NON sa contare prima di aprire: è la build più
        // vecchia, ed è il caso che deve continuare a funzionare com'era.
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue(null)
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
            { contextTokens: 4096, kvCacheType: 'f16' },
        )
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
    })

    /**
     * ⛔ La cache leggera va CHIESTA — e per due giorni nessuno l'ha fatto.
     *
     * Il motore sa crearla dall'8C, collaudo e ripiego in `f16` compresi, e il
     * predefinito nativo è `f16`. Visto sul Pad il 2026-08-07: una conversazione
     * da 8470 token girava con `kvCacheType: "f16"`, cioè 1,72 GB di cache dove
     * ne bastavano 0,91.
     *
     * ⭐ Ma la misura successiva ha cambiato la conclusione: **la leggera costa
     * il 40% del prefill** — 72,2 contro 43,6 token/s a parità di contesto e di
     * prompt, stesso modello e stessa sessione. Quindi non si chiede sempre: si
     * chiede la pesante finché ci sta, ed è quello che queste due prove fissano.
     */
    it('con margine chiede la cache PESANTE, che è la veloce', async () => {
        deviceCapacity.talosMeasureDevice.mockResolvedValue({
            totalRamBytes: 12 * GIB,
            availableRamBytes: 6 * GIB,
            lowMemoryThresholdBytes: Math.round(0.35 * GIB),
            freeStorageBytes: 8 * GIB,
            memoryBandwidthBytesPerSecond: null,
            thermal: 'none' as const,
            abiSupported: true,
        })
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue({
            promptTokens: 5779,
            shape: LLAMA_3B_SHAPE,
        })
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 8192 })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'qwen-8192',
            promptTokens: 5779,
            contextTokens: 8192,
        })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpenWithFallback).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            expect.objectContaining({ kvCacheType: 'f16' }),
        )
    })

    /**
     * ⭐ E la leggera solo quando è l'unico modo di avere la conversazione.
     *
     * I numeri sono la differenza fra le due cache su questo modello e questo
     * dispositivo, calcolati e non scelti: con 3,4 GiB liberi il tetto è **6144**
     * token in `f16` e **11776** in `q8_0`. Il fabbisogno è 6804. Cioè con la
     * cache veloce il messaggio verrebbe rifiutato, con la lenta passa — ed è
     * esattamente il caso in cui il 40% di prefill in più è il prezzo giusto.
     */
    it('e la leggera solo quando è l\'unico modo di avere la conversazione', async () => {
        deviceCapacity.talosMeasureDevice.mockResolvedValue({
            totalRamBytes: 12 * GIB,
            availableRamBytes: Math.round(3.4 * GIB),
            lowMemoryThresholdBytes: Math.round(0.35 * GIB),
            freeStorageBytes: 8 * GIB,
            memoryBandwidthBytesPerSecond: null,
            thermal: 'none' as const,
            abiSupported: true,
        })
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue({
            promptTokens: 5779,
            shape: LLAMA_3B_SHAPE,
        })
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 8192 })
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true,
            backends: 'CPU',
            loadedPath: null,
            shape: LLAMA_3B_SHAPE,
            kvCacheType: 'q8_0',
        })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'qwen-8192',
            promptTokens: 5779,
            contextTokens: 8192,
        })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpenWithFallback).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            expect.objectContaining({ kvCacheType: 'q8_0' }),
        )
        reggeSenzaSprecare(contestoAperto(localEngine.talosLocalEngineOpenWithFallback as never), 5779)
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

    /**
     * ⭐⭐ IL CERCHIO SPEZZATO: si conta prima, si apre una volta sola.
     *
     * Il test sopra (`C45-RED-18H`) descrive il mondo di prima: apri a 4096,
     * scopri che servono 6804 token, riapri a 8192. Due aperture per un
     * messaggio — MISURATE sul Pad il 2026-08-07 a **2938 ms** la prima su un
     * modello da 1,8 GB, e molte di più su uno grande.
     *
     * Adesso il fabbisogno si conosce prima di caricare i pesi: `vocab_only`
     * carica il solo vocabolario, applica il template e conta, in **~200 ms**.
     * Stesso prompt, stessa aritmetica, **una** apertura.
     */
    it('con il piano anticipato apre UNA volta, già a 8192, per lo stesso prompt da 6804', async () => {
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue({
            promptTokens: 5779,
            shape: LLAMA_3B_SHAPE,
        })
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 8192 })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'qwen-8192',
            promptTokens: 5779,
            contextTokens: 8192,
        })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpenWithFallback).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            expect.objectContaining({ kvCacheType: 'f16' }),
        )
        reggeSenzaSprecare(contestoAperto(localEngine.talosLocalEngineOpenWithFallback as never), 5779)
        // ⛔ La riga che vale il lavoro: la seconda apertura non c'è più.
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
    })

    /**
     * ⛔ Il SEGNO del tetto, prima di aprire.
     *
     * `talosMaxContextFor` sottrae i pesi dalla memoria libera, perché nasce per
     * la domanda «se caricassi questo modello, quanto contesto mi resterebbe?».
     * Dopo l'apertura i pesi vanno RIMESSI — `availableRamBytes` li ha già
     * scontati — ed è la correzione che il Doctor e la chat documentano
     * entrambi. Prima dell'apertura no: il modello non è in memoria, e rimetterli
     * regalerebbe un tetto che il dispositivo non può onorare.
     *
     * I numeri di questa prova sono la differenza fra i due segni, calcolata su
     * un dispositivo con 3,5 GiB liberi e un 3B da 1,75 GiB: **7168** col segno
     * giusto, **23552** con quello sbagliato. Il fabbisogno è 6804, quindi col
     * segno sbagliato si aprirebbe a 8192 — cioè oltre ciò che la memoria regge.
     */
    it('prima di aprire NON rimette i pesi nella memoria libera', async () => {
        deviceCapacity.talosMeasureDevice.mockResolvedValue({
            totalRamBytes: 12 * GIB,
            availableRamBytes: Math.round(3.5 * GIB),
            lowMemoryThresholdBytes: Math.round(0.35 * GIB),
            freeStorageBytes: 8 * GIB,
            memoryBandwidthBytesPerSecond: null,
            thermal: 'none' as const,
            abiSupported: true,
        })
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue({
            promptTokens: 5779,
            shape: LLAMA_3B_SHAPE,
        })
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 7168 })
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true,
            backends: 'CPU',
            loadedPath: null,
            shape: LLAMA_3B_SHAPE,
        })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'qwen-7168',
            promptTokens: 5779,
            contextTokens: 7168,
        })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpenWithFallback).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            expect.objectContaining({ kvCacheType: 'f16' }),
        )
        reggeSenzaSprecare(contestoAperto(localEngine.talosLocalEngineOpenWithFallback as never), 5779)
    })

    /**
     * Il lato nativo più vecchio — caso reale con le installazioni affiancate —
     * non sa contare prima di aprire. Deve tornare al comportamento di prima,
     * non rifiutare: una funzione che serve a RISPARMIARE un lavoro non deve
     * poter impedire quel lavoro.
     */
    it('senza piano anticipato riparte dal predefinito, come prima', async () => {
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue(null)
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })

        await localAdapter.complete(
            input() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        expect(localEngine.talosLocalEngineOpenWithFallback).toHaveBeenCalledWith(
            '/models/qwen.gguf',
            { contextTokens: 4096, kvCacheType: 'f16' },
        )
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
            expect.objectContaining({ kvCacheType: 'f16' }),
        )
        reggeSenzaSprecare(contestoAperto(localEngine.talosLocalEngineOpen as never), 5779)
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
            expect.objectContaining({ kvCacheType: 'f16' }),
        )
        reggeSenzaSprecare(contestoAperto(localEngine.talosLocalEngineOpen as never), 8000)
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
            expect.objectContaining({ kvCacheType: 'f16' }),
        )
        reggeSenzaSprecare(contestoAperto(localEngine.talosLocalEngineOpen as never), 8000)
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

/** La stessa richiesta usata dagli altri gruppi, qui a portata di questo. */
function richiestaLocale() {
    return {
        model: {
            id: '/models/qwen.gguf', provider: 'local', displayName: 'Qwen',
            chatCompatibility: 'unknown', supportedParameters: [],
            inputModalities: ['text'], outputModalities: ['text'],
        },
        turns: [{ role: 'user', content: 'Rispondi con PRONTO.' }],
        effort: 'low',
        thinking: false,
    }
}

/**
 * Fermarsi vuol dire fermare il NATIVO, non smettere di ascoltarlo.
 *
 * Owner 2026-08-06: «il pulsante stop non funziona bene nei modelli locali,
 * anzi non funziona proprio».
 *
 * Il difetto era che `talosLocalEngineCancel` **non era chiamata da nessuno**,
 * in tutto il progetto: la catena esisteva intera — flag atomico nel C++,
 * metodo nel plugin Java, funzione in TypeScript — e finiva nel vuoto. La chat
 * smetteva di mostrare le parole e il telefono continuava a macinare token con
 * la CPU al massimo finché il modello non finiva da solo.
 */
describe("lo Stop ferma il motore, non solo l'ascolto", () => {
    it('chiama il cancel nativo quando il segnale scatta a metà generazione', async () => {
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ ok: true } as never)
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'p', promptTokens: 10, contextTokens: 4096,
        })
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true, backends: 'CPU', loadedPath: null, shape: null,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)
        localEngine.talosLocalEngineCancel.mockClear()

        const controller = new AbortController()
        // Il motore parla, e a metà l'utente preme Stop.
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                onDelta('sto rispon')
                controller.abort()
                await Promise.resolve()
                return { text: 'sto rispon', tokens: 2 }
            },
        )

        await localAdapter.streamComplete(
            richiestaLocale() as never,
            { apiKey: null, endpoint: null },
            { onChunk: () => {}, signal: controller.signal } as never,
        )

        expect(localEngine.talosLocalEngineCancel).toHaveBeenCalledTimes(1)
    })

    /**
     * E non lo chiama quando nessuno ha premuto niente: un annullamento
     * spontaneo a fine risposta fermerebbe la generazione SUCCESSIVA, che è un
     * difetto molto più difficile da capire di quello che stiamo curando.
     */
    it('non chiama il cancel se lo Stop non è stato premuto', async () => {
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ ok: true } as never)
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'p', promptTokens: 10, contextTokens: 4096,
        })
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true, backends: 'CPU', loadedPath: null, shape: null,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)
        localEngine.talosLocalEngineCancel.mockClear()
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_p: string, onDelta: (d: string) => void) => {
                onDelta('tutto bene')
                return { text: 'tutto bene', tokens: 2 }
            },
        )

        const controller = new AbortController()
        await localAdapter.streamComplete(
            richiestaLocale() as never,
            { apiKey: null, endpoint: null },
            { onChunk: () => {}, signal: controller.signal } as never,
        )
        // E nemmeno DOPO: l'ascoltatore va staccato, o il prossimo Stop di
        // un'altra risposta fermerebbe anche questa.
        controller.abort()
        expect(localEngine.talosLocalEngineCancel).not.toHaveBeenCalled()
    })
})


/**
 * ⛔⛔ IL PROTOCOLLO DEGLI STRUMENTI NON ARRIVA MAI ALLO SCHERMO.
 *
 * RIPRODOTTO sul Pad l'11 agosto con `unsloth/Qwen3-1.7B-GGUF` Q4_K_M: a una
 * domanda di aritmetica in italiano, dove nessuno strumento serviva, la
 * risposta in chat era il CATALOGO degli strumenti — le nostre descrizioni,
 * alla lettera, dentro il formato del modello.
 *
 * ⛔ Questi casi stanno sull'ADATTATORE e non solo sulla regola pura: una
 * prova sulla funzione non dice niente su chi la chiama, ed è la lezione che
 * in questa sessione ho già pagato due volte.
 */
describe('⛔ F3 — il catalogo non finisce in chat', () => {
    /** Lo stesso ingresso minimo degli altri casi: qui conta solo l'USCITA. */
    const ingresso = () => ({
        model: {
            id: '/models/qwen.gguf', provider: 'local', displayName: 'Qwen',
            chatCompatibility: 'unknown', supportedParameters: [],
            inputModalities: ['text'], outputModalities: ['text'],
        },
        turns: [{ role: 'user', content: 'Quanto fa 6 + 6?' }],
        effort: 'low',
        thinking: false,
    })

    it('⭐ il testo del modello esce ripulito, sia risposta sia ragionamento', async () => {
        localEngine.talosLocalEngineGenerate.mockResolvedValue({
            text: '<tools> <tool_details> <tool_name>library_list</tool_name> '
                + '<tool_description>List every local Library file.</tool_description> '
                + '<tool_input>{}</tool_input> </tool_details> </tools>\nC = 2 kg.',
            reasoning: 'Vediamo. <tool_call>{"name":"x"}</tool_call> Poi rispondo.',
            tokens: 42,
        })

        const esito = await localAdapter.complete(
            ingresso() as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        ) as { text: string, reasoning?: string }

        // ⛔ È questa la riga che morde: tolto il filtro dall'adattatore, qui
        // torna dentro tutto il catalogo.
        expect(esito.text).toBe('C = 2 kg.')
        expect(esito.text).not.toContain('tool_name')
        expect(esito.reasoning ?? '').not.toContain('tool_call')
        // E la prosa vera che stava attorno non si perde.
        expect(esito.reasoning ?? '').toContain('Poi rispondo.')
    })
})

/**
 * LOCAL-PARITY-TOOL-RESULT-02 — un locale deve ricevere il risultato nella
 * stessa forma canonica dei provider API. llama.cpp sa già renderizzare
 * `assistant.tool_calls` e `role: tool`; questo test protegge il ponte che
 * prima li cancellava.
 */
describe('LOCAL-PARITY-TOOL-RESULT-02 round-trip del risultato locale', () => {
    it('porta tool_calls, tool_call_id e nome fino a entrambi i planner nativi', async () => {
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true, backends: 'CPU', loadedPath: null, shape: null,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue(null)
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'p', promptTokens: 100, contextTokens: 4096,
        })
        localEngine.talosLocalEngineGenerate.mockResolvedValue({
            text: 'Il valore è TALOS_NONCE_417.', tokens: 8,
        })

        const turns = [
            { role: 'user', content: 'Trova il valore.' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [{
                    id: 'call_17', name: 'talos_diagnostic_echo',
                    arguments: '{"value":"TALOS_NONCE_417"}',
                }],
            },
            {
                role: 'tool',
                content: 'TALOS_NONCE_417',
                toolCallId: 'call_17',
                toolName: 'talos_diagnostic_echo',
            },
        ]

        await localAdapter.complete(
            {
                ...richiestaLocale(),
                turns,
            } as never,
            { apiKey: null, endpoint: null },
            (() => { throw new Error('local must not use transport') }) as never,
        )

        const planned = localEngine.talosLocalEnginePlanPrompt.mock.calls.at(-1)?.[1]
        const rendered = localEngine.talosLocalEngineChatPlan.mock.calls.at(-1)?.[0]
        for (const value of [planned, rendered]) {
            expect(value).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    role: 'assistant',
                    tool_calls: [expect.objectContaining({ id: 'call_17' })],
                }),
                expect.objectContaining({
                    role: 'tool',
                    name: 'talos_diagnostic_echo',
                    tool_call_id: 'call_17',
                    content: 'TALOS_NONCE_417',
                }),
            ]))
        }
    })

    it('LOCAL-PARITY-TEMPLATE-TRANSPORT-06 usa prompt-json-v1 per Gemma senza passare role tool al Jinja', async () => {
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue({
            supportsTools: false,
            supportsToolCalls: false,
            supportsSystemRole: true,
        })
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true, backends: 'CPU', loadedPath: null, shape: null,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue(null)
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'gemma-prompt', promptTokens: 100, contextTokens: 4096,
        })
        localEngine.talosLocalEngineGenerate.mockResolvedValue({ text: 'TALOS_NONCE_417', tokens: 4 })

        const diagnosticTool = {
            name: 'talos_diagnostic_echo',
            title: 'Diagnostic echo',
            description: 'Return one diagnostic value.',
            action: 'read' as const,
            input: z.object({ value: z.string() }),
            run: async () => ({ content: '' }),
        }
        const turns = [
            { role: 'user', content: 'Trova il valore.' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [{
                    id: 'call_17', name: 'talos_diagnostic_echo',
                    arguments: '{"value":"TALOS_NONCE_417"}',
                }],
            },
            {
                role: 'tool',
                content: 'TALOS_NONCE_417',
                toolCallId: 'call_17',
                toolName: 'talos_diagnostic_echo',
            },
        ]

        await localAdapter.complete({
            ...richiestaLocale(),
            model: {
                ...richiestaLocale().model,
                id: '/models/gemma.gguf',
                displayName: 'Gemma',
            },
            turns,
            tools: [diagnosticTool],
        } as never, { apiKey: null, endpoint: null }, (() => {
            throw new Error('local must not use transport')
        }) as never)

        const planned = localEngine.talosLocalEnginePlanPrompt.mock.calls.at(-1)
        const rendered = localEngine.talosLocalEngineChatPlan.mock.calls.at(-1)
        for (const candidate of [planned?.[1], rendered?.[0]]) {
            const projected = candidate as Array<{ role: string, content?: string }> | undefined
            expect(projected?.map((turn) => turn.role)).toEqual(['system', 'user', 'assistant', 'user'])
            expect(projected?.some((turn) => turn.role === 'tool')).toBe(false)
            expect(projected?.[0]?.content).toContain('TALOS prompt-json-v1 tool protocol')
            expect(projected?.at(-1)?.content).toContain('TALOS_NONCE_417')
        }
        expect(planned?.[2]).toBeUndefined()
        expect(rendered?.[1]).toBeUndefined()
    })

    /**
     * ⛔⛔ LINGUA-DOPO-IL-TOOL-01 — il filo, non la foglia.
     *
     * MISURATO sul Pad il 2026-08-19, `gemma-3-4b-it-Q4_K_M`:
     *
     *   «Ciao, come stai?»                 → «Ciao! Sto bene…»           ITALIANO ✓
     *   «Dimmi le coordinate del telefono» → «The phone's coordinates…»  INGLESE  ✗
     *
     * La riga sulla lingua c'è già, ma sta nel prompto di sistema — cioè PRIMA
     * di tutto — mentre l'inglese del tool è l'ultima cosa che il modello legge.
     * Il promemoria va anche dove guarda per ultimo.
     *
     * `linguaDopoIlTool.test.ts` prova la busta. Questo prova che il locale ci
     * ARRIVA: dall'interfaccia, attraverso il contratto del provider e
     * l'adattatore, fino ai turni che il motore riceve davvero. Senza questo,
     * la busta saprebbe fare una cosa che nessuno le chiede.
     */
    it('LINGUA-DOPO-IL-TOOL-01 porta il locale fino ai turni che il motore riceve', async () => {
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue({
            supportsTools: false,
            supportsToolCalls: false,
            supportsSystemRole: true,
        })
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true, backends: 'CPU', loadedPath: null, shape: null,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue(null)
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'gemma-prompt', promptTokens: 100, contextTokens: 4096,
        })
        localEngine.talosLocalEngineGenerate.mockResolvedValue({ text: 'Sono a Roma.', tokens: 4 })

        const posizione = {
            name: 'device_location',
            title: 'Device location',
            description: 'Return the device coordinates.',
            action: 'read' as const,
            input: z.object({}),
            run: async () => ({ content: '' }),
        }
        const turns = [
            { role: 'user', content: 'Dimmi le coordinate del telefono' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [{ id: 'call_9', name: 'device_location', arguments: '{}' }],
            },
            {
                role: 'tool',
                content: 'Latitude 41.899925, longitude 12.478631 (accurate to about 18 m).',
                toolCallId: 'call_9',
                toolName: 'device_location',
            },
        ]

        async function bustaCon(locale: string | null): Promise<string> {
            localEngine.talosLocalEngineChatPlan.mockClear()
            await localAdapter.complete({
                ...richiestaLocale(),
                model: { ...richiestaLocale().model, id: '/models/gemma.gguf', displayName: 'Gemma' },
                turns,
                tools: [posizione],
                locale,
            } as never, { apiKey: null, endpoint: null }, (() => {
                throw new Error('local must not use transport')
            }) as never)
            const inviati = localEngine.talosLocalEngineChatPlan.mock.calls.at(-1)?.[0] as
                Array<{ role: string, content?: string }> | undefined
            return inviati?.at(-1)?.content ?? ''
        }

        const conLingua = await bustaCon('it')
        expect(conLingua).toContain('Italian')
        // ⛔ DOPO i dati: se finisse prima, l'inglese del tool sarebbe di nuovo
        // l'ultima cosa letta e non avremmo spostato niente.
        expect(conLingua.indexOf('Italian')).toBeGreaterThan(conLingua.indexOf('41.899925'))

        // E al contrario: senza locale la busta resta quella di prima.
        const senzaLingua = await bustaCon(null)
        expect(senzaLingua).toContain('41.899925')
        expect(senzaLingua).not.toContain('Italian')
    })

    it('LOCAL-PARITY-SYSTEM-ROLE-07 non invia system a Gemma e conserva i bit nella cache', async () => {
        localEngine.talosLocalEngineTemplateCapabilities.mockClear()
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue({
            supportsTools: false,
            supportsToolCalls: false,
            supportsSystemRole: false,
        })
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true, backends: 'CPU', loadedPath: null, shape: null,
        })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue(null)
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'gemma-systemless', promptTokens: 100, contextTokens: 4096,
        })
        localEngine.talosLocalEngineGenerate.mockResolvedValue({ text: 'Pronto', tokens: 2 })

        const model = {
            ...richiestaLocale().model,
            id: '/models/gemma-systemless.gguf',
            displayName: 'Gemma systemless',
        }
        const input = {
            ...richiestaLocale(),
            model,
            system: 'TALOS_SYSTEM_SENTINEL',
            tools: [{
                name: 'talos_diagnostic_echo', title: 'Diagnostic echo',
                description: 'Return one diagnostic value.', action: 'read' as const,
                input: z.object({ value: z.string() }), run: async () => ({ content: '' }),
            }],
        }

        await localAdapter.complete(input as never, { apiKey: null, endpoint: null }, (() => {
            throw new Error('local must not use transport')
        }) as never)

        const first = (localEngine.talosLocalEngineChatPlan.mock.calls.at(-1)?.[0]) as Array<{ role: string, content?: string }> | undefined
        expect(first?.map((turn) => turn.role)).toEqual(['user'])
        expect(first?.[0]?.content).toContain('TALOS_SYSTEM_SENTINEL')
        expect(first?.[0]?.content).toContain('TALOS prompt-json-v1 tool protocol')

        // The cache must keep the measured `supportsSystemRole` bit with the
        // strategy. A second read that says otherwise cannot change the wire
        // shape for the same exact installed file during this app build.
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue({
            supportsTools: true,
            supportsToolCalls: true,
            supportsSystemRole: true,
        })
        await localAdapter.complete(input as never, { apiKey: null, endpoint: null }, (() => {
            throw new Error('local must not use transport')
        }) as never)

        const second = (localEngine.talosLocalEngineChatPlan.mock.calls.at(-1)?.[0]) as Array<{ role: string }> | undefined
        expect(second?.map((turn) => turn.role)).toEqual(['user'])
        expect(localEngine.talosLocalEngineTemplateCapabilities).toHaveBeenCalledTimes(1)
    })
})

/**
 * P1-3 — il prefisso AOT per `prompt-json-v1`, dove prima non si congelava
 * mai niente (la guardia tornava sempre `null` per questo trasporto).
 *
 * ⛔⛔ CR-09 è l'invariante che questi test provano, non solo la funzione:
 * il testo che si congela deve essere ESATTAMENTE quello che la generazione
 * vera manda al motore, mai una seconda versione ricostruita a parte. Un
 * bug qui non darebbe un errore — darebbe una risposta sbagliata dopo il
 * thaw, il modo peggiore di fallire (vedi `prefixCache.ts`).
 */
describe('P1-3 prefissoResoDiProiettato — il prefisso AOT per prompt-json-v1', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const CAPABILITIES_PROMPT_JSON = {
        supportsTools: false,
        supportsToolCalls: false,
        supportsSystemRole: true,
    }

    const TOOLS = [{
        name: 'talos_diagnostic_echo',
        description: 'Return one diagnostic value.',
        parameters: { type: 'object', properties: { value: { type: 'string' } } },
    }]

    it('produce un prefisso non nullo — prima di questo blocco era SEMPRE null per questo trasporto', async () => {
        const SYSTEM_NON_NULLO = 'Sei TALOS. [test: non-nullo]'
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'testo-reso-dal-motore', promptTokens: 900, contextTokens: 4096,
        })

        const testo = await prefissoResoDiProiettato(
            'prompt-json-v1', CAPABILITIES_PROMPT_JSON, SYSTEM_NON_NULLO, TOOLS, 'it', true,
        )

        expect(testo).toBe('testo-reso-dal-motore')
        expect(localEngine.talosLocalEngineChatPlan).toHaveBeenCalledTimes(1)
    })

    it('⛔⛔ CR-09 — MAI passa i tool al motore: sono già dentro il testo proiettato', async () => {
        const SYSTEM_CR09 = 'Sei TALOS. [test: CR-09]'
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'x', promptTokens: 1, contextTokens: 4096,
        })

        await prefissoResoDiProiettato(
            'prompt-json-v1', CAPABILITIES_PROMPT_JSON, SYSTEM_CR09, TOOLS, 'it', true,
        )

        // Se la memoizzazione avesse trovato un altro test invece di
        // chiamare il motore, questa asserzione lo direbbe chiaramente —
        // invece di lasciar passare il test sotto per il motivo sbagliato.
        expect(localEngine.talosLocalEngineChatPlan).toHaveBeenCalledTimes(1)
        const chiamata = localEngine.talosLocalEngineChatPlan.mock.calls.at(-1)
        // Il secondo argomento di talosLocalEngineChatPlan è `tools`: se
        // qualcuno lo passasse di nuovo qui, il motore applicherebbe il
        // catalogo una seconda volta al template Jinja, sopra un testo che
        // già lo contiene come JSON — un prompt diverso da quello vero,
        // sotto la stessa identità di cache.
        expect(chiamata?.[1]).toBeUndefined()
    })

    /**
     * ⛔⛔⛔ VERIFICATO SUL PAD, 23/8 — questo test è nato ROTTO in un modo
     * grave: un turno di sistema da solo passato al motore vero produceva
     * SOLO `<start_of_turn>model` (4 token, il contenuto SPARITO), perché
     * Gemma non ha un ruolo system separato (ai.google.dev/gemma/docs/
     * core/prompt-structure). Il mock di questo test — che concatenava
     * `turns[0]?.content` — non poteva vederlo: era fedele a un'idea SBAGLIATA
     * di cosa il motore fa con un turno solitario, non al motore vero.
     *
     * ⇒ La cura (un turno utente SEGNAPOSTO dopo il sistema) rende il test
     * "bit-per-bit" concettualmente sbagliato: il testo congelato ora include
     * anche il rendering del segnaposto, quindi non può più essere uguale al
     * SOLO turno di sistema. L'invariante vero, quello che conta per CR-09,
     * è che i due testi condividano un prefisso comune LUNGO (system +
     * catalogo), divergendo solo in coda — dove il segnaposto finisce e un
     * messaggio vero comincia.
     */
    it('⭐ condivide un lungo prefisso comune col rendering della generazione VERA (diverge solo dove il messaggio vero comincia)', async () => {
        // Mock realistico: concatena i turni come farebbe un vero renderer di
        // template, non solo il primo — un mock che ignora il secondo turno
        // è esattamente il tipo di simulazione che ha nascosto il bug vero.
        localEngine.talosLocalEngineChatPlan.mockImplementation(async (turns: Array<{ content?: string }>) => ({
            prompt: turns.map((t) => t.content ?? '').join('|TURN|'),
            promptTokens: 1,
            contextTokens: 4096,
        }))

        const SYSTEM_PREFISSO_COMUNE = 'Sei TALOS. [test: prefisso-comune]'

        const testoCongelato = await prefissoResoDiProiettato(
            'prompt-json-v1', CAPABILITIES_PROMPT_JSON, SYSTEM_PREFISSO_COMUNE, TOOLS, 'it', true,
        )
        expect(testoCongelato).toBeTruthy()

        // La generazione vera (localAdapter.ts riga ~912) proietta l'INTERA
        // conversazione — qui simulata con lo STESSO system/tools/locale ma
        // un messaggio utente VERO, diverso dal segnaposto.
        const projectionConversazioneVera = talosProjectLocalToolConversation({
            transport: 'prompt-json-v1',
            capabilities: CAPABILITIES_PROMPT_JSON,
            turns: [
                { role: 'system', content: SYSTEM_PREFISSO_COMUNE },
                { role: 'user', content: 'Un messaggio vero, diverso dal segnaposto.' },
            ],
            tools: TOOLS,
            locale: 'it',
        })
        const renderConversazioneVera = projectionConversazioneVera.turns
            .map((t) => t.content ?? '').join('|TURN|')

        let prefissoComune = 0
        while (
            prefissoComune < testoCongelato!.length
            && prefissoComune < renderConversazioneVera.length
            && testoCongelato![prefissoComune] === renderConversazioneVera[prefissoComune]
        ) prefissoComune += 1

        // Il prefisso comune deve coprire l'intero system + catalogo tool
        // (centinaia di caratteri), non fermarsi a pochi caratteri come
        // farebbe se il segnaposto non funzionasse.
        expect(prefissoComune).toBeGreaterThan(300)
        // E deve fermarsi PRIMA della fine di entrambi i testi: sono
        // volutamente diversi in coda, non identici.
        expect(prefissoComune).toBeLessThan(testoCongelato!.length)
        expect(prefissoComune).toBeLessThan(renderConversazioneVera.length)
    })

    it('⛔⛔ AL CONTRARIO — un segnaposto VUOTO farebbe ricomparire il bug (provato sul motore vero)', async () => {
        // `projectPromptJson` scarta un turno utente con `content` falsy
        // (`if (turn.content) …`): un segnaposto vuoto sparirebbe prima di
        // raggiungere il motore, e si tornerebbe al turno-di-sistema-solo
        // che produce `<start_of_turn>model` senza contenuto.
        const projectionConSegnaposteVuoto = talosProjectLocalToolConversation({
            transport: 'prompt-json-v1',
            capabilities: CAPABILITIES_PROMPT_JSON,
            turns: [
                { role: 'system', content: 'Sei TALOS. [test: segnaposto-vuoto]' },
                { role: 'user', content: '' },
            ],
            tools: TOOLS,
            locale: 'it',
        })
        expect(projectionConSegnaposteVuoto.turns).toHaveLength(1)
        expect(projectionConSegnaposteVuoto.turns[0]?.role).toBe('system')
    })

    it('nessun system → null, come il percorso nativo esistente', async () => {
        const testo = await prefissoResoDiProiettato(
            'prompt-json-v1', CAPABILITIES_PROMPT_JSON, undefined, TOOLS, 'it', true,
        )
        expect(testo).toBeNull()
        expect(localEngine.talosLocalEngineChatPlan).not.toHaveBeenCalled()
    })

    it('memoizza: due chiamate identiche interrogano il motore una volta sola', async () => {
        const SYSTEM_MEMO = 'Sei TALOS. [test: memoizza]'
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'memo', promptTokens: 1, contextTokens: 4096,
        })

        await prefissoResoDiProiettato('prompt-json-v1', CAPABILITIES_PROMPT_JSON, SYSTEM_MEMO, TOOLS, 'it', true)
        await prefissoResoDiProiettato('prompt-json-v1', CAPABILITIES_PROMPT_JSON, SYSTEM_MEMO, TOOLS, 'it', true)

        expect(localEngine.talosLocalEngineChatPlan).toHaveBeenCalledTimes(1)
    })

    it('AL CONTRARIO — cambiare i tool cambia la chiave: non è la stessa cache', async () => {
        const SYSTEM_AL_CONTRARIO = 'Sei TALOS. [test: al-contrario]'
        localEngine.talosLocalEngineChatPlan
            .mockResolvedValueOnce({ prompt: 'con-un-tool', promptTokens: 1, contextTokens: 4096 })
            .mockResolvedValueOnce({ prompt: 'con-due-tool', promptTokens: 1, contextTokens: 4096 })

        const primo = await prefissoResoDiProiettato(
            'prompt-json-v1', CAPABILITIES_PROMPT_JSON, SYSTEM_AL_CONTRARIO, TOOLS, 'it', true,
        )
        const secondo = await prefissoResoDiProiettato(
            'prompt-json-v1', CAPABILITIES_PROMPT_JSON, SYSTEM_AL_CONTRARIO, [...TOOLS, TOOLS[0]!], 'it', true,
        )

        expect(primo).not.toBe(secondo)
        expect(localEngine.talosLocalEngineChatPlan).toHaveBeenCalledTimes(2)
    })
})
