import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    open: vi.fn(),
    chatPrompt: vi.fn(),
    templateCapabilities: vi.fn(),
    generate: vi.fn(),
    addListener: vi.fn(),
    qualifyBackend: vi.fn(),
    available: vi.fn(),
    performanceSignals: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
}))

const {
    TalosLocalEngineGenerationError,
    TalosLocalEngineOpenError,
    talosLocalEngineChatPlan,
    talosLocalEngineTemplateCapabilities,
    talosLocalEngineGenerate,
    talosLocalEngineOpen,
    talosLocalEngineOpenWithFallback,
    talosLocalPerformanceSignals,
    talosQualifyLocalBackend,
    talosWarmLocalModel,
} = await import('@/services/localEngine')

function nativeFailure(stage: string, code = 'TALOS_LLAMA_OPEN_FAILED'): Error {
    return Object.assign(new Error(code), { code, data: { stage } })
}

describe('LOCAL-OPEN-FALLBACK-02 bounded native open fallback', () => {
    beforeEach(() => {
        bridge.open.mockReset()
        bridge.chatPrompt.mockReset()
        bridge.templateCapabilities.mockReset()
        bridge.generate.mockReset()
        bridge.addListener.mockReset()
        bridge.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) })
        bridge.qualifyBackend.mockReset()
    })

    it('retries a context allocation failure exactly once at 2048', async () => {
        bridge.open
            .mockRejectedValueOnce(nativeFailure('context'))
            .mockResolvedValueOnce({ contextTokens: 2048 })

        await expect(talosLocalEngineOpenWithFallback('/models/qwen.gguf', {
            contextTokens: 4096,
        })).resolves.toEqual({ contextTokens: 2048 })

        expect(bridge.open.mock.calls.map(([options]) => options.contextTokens)).toEqual([4096, 2048])
    })

    it.each(['path', 'model-load', 'sampler', 'unknown'] as const)(
        'does not retry a %s failure',
        async (stage) => {
            bridge.open.mockRejectedValueOnce(nativeFailure(stage))

            await expect(talosLocalEngineOpenWithFallback('/models/qwen.gguf', {
                contextTokens: 4096,
            })).rejects.toMatchObject({ stage })
            expect(bridge.open).toHaveBeenCalledTimes(1)
        },
    )

    it('normalizes legacy missing-file rejection into the stable path stage', async () => {
        bridge.open.mockRejectedValueOnce(Object.assign(
            new Error('TALOS_LLAMA_MODEL_MISSING'),
            { code: 'TALOS_LLAMA_MODEL_MISSING' },
        ))

        const failure = await talosLocalEngineOpen('/models/gone.gguf').catch((error) => error)
        expect(failure).toBeInstanceOf(TalosLocalEngineOpenError)
        expect(failure).toMatchObject({
            stage: 'path',
            nativeCode: 'TALOS_LLAMA_MODEL_MISSING',
        })
    })

    it('C45-RED-18H carries native prompt and context counts without estimating them', async () => {
        bridge.chatPrompt.mockResolvedValue({
            prompt: '<qwen prompt>',
            promptTokens: 5779,
            contextTokens: 4096,
        })

        await expect(talosLocalEngineChatPlan([{ role: 'user', content: 'Ciao' }]))
            .resolves.toEqual({
                prompt: '<qwen prompt>',
                promptTokens: 5779,
                contextTokens: 4096,
            })
    })

    it('LOCAL-PARITY-TEMPLATE-CAPS-07 decodes only the explicit upstream template capability bits', async () => {
        bridge.templateCapabilities.mockResolvedValue({
            capabilities: JSON.stringify({
                supportsTools: true,
                supportsToolCalls: true,
                supportsSystemRole: false,
            }),
        })

        await expect(talosLocalEngineTemplateCapabilities('/models/qwen.gguf')).resolves.toEqual({
            supportsTools: true,
            supportsToolCalls: true,
            supportsSystemRole: false,
        })
        expect(bridge.templateCapabilities).toHaveBeenCalledWith({ path: '/models/qwen.gguf' })
    })

    it('LOCAL-PARITY-TEMPLATE-CAPS-07 rejects malformed or partial bridge values', async () => {
        bridge.templateCapabilities.mockResolvedValue({
            capabilities: JSON.stringify({ supportsTools: true }),
        })

        await expect(talosLocalEngineTemplateCapabilities('/models/gemma.gguf')).resolves.toBeNull()
    })

    it('C45-RED-18I normalizes a native context rejection instead of leaking it from the worker', async () => {
        bridge.generate.mockRejectedValue(Object.assign(
            new Error('TALOS_LLAMA_CONTEXT_REQUIRED'),
            {
                code: 'TALOS_LLAMA_CONTEXT_REQUIRED',
                data: {
                    stage: 'context-required',
                    promptTokens: 5779,
                    contextTokens: 4096,
                    requiredContextTokens: 6804,
                },
            },
        ))

        const failure = await talosLocalEngineGenerate('prompt', () => undefined, { maxTokens: 1024 })
            .catch((error) => error)
        expect(failure).toBeInstanceOf(TalosLocalEngineGenerationError)
        expect(failure).toMatchObject({
            stage: 'context-required',
            nativeCode: 'TALOS_LLAMA_CONTEXT_REQUIRED',
            promptTokens: 5779,
            contextTokens: 4096,
            requiredContextTokens: 6804,
        })
    })
})

describe('talosQualifyLocalBackend', () => {
    beforeEach(() => {
        bridge.qualifyBackend.mockReset()
    })

    it('passes the path through and normalizes a real result', async () => {
        bridge.qualifyBackend.mockResolvedValue({
            ran: true,
            probedCpu: true,
            cpuInconclusive: false,
            probedGpu: false,
            gpuInconclusive: false,
            decisionBackend: 'cpu',
            decisionReason: 'unproven',
        })

        await expect(talosQualifyLocalBackend('/models/qwen.gguf')).resolves.toEqual({
            ran: true,
            reason: null,
            probedCpu: true,
            cpuInconclusive: false,
            probedGpu: false,
            gpuInconclusive: false,
            decisionBackend: 'cpu',
            decisionReason: 'unproven',
        })
        expect(bridge.qualifyBackend).toHaveBeenCalledWith({ path: '/models/qwen.gguf' })
    })

    it('carries the reason through when the probe did not run', async () => {
        bridge.qualifyBackend.mockResolvedValue({ ran: false, reason: 'already-proven' })

        await expect(talosQualifyLocalBackend('/models/qwen.gguf')).resolves.toEqual({
            ran: false,
            reason: 'already-proven',
            probedCpu: false,
            cpuInconclusive: false,
            probedGpu: false,
            gpuInconclusive: false,
            decisionBackend: null,
            decisionReason: null,
        })
    })

    /**
     * ⛔ Il verso contrario: nessun ponte nativo (build web, o un native più
     * vecchio senza questo metodo) deve tornare "non ha girato", MAI
     * un'eccezione — questa chiamata è pensata per girare in background senza
     * bloccare niente, e un rigetto qui romperebbe proprio quella promessa.
     */
    it('never throws — a missing bridge resolves to the unavailable shape', async () => {
        bridge.qualifyBackend.mockRejectedValue(new Error('TALOS_LLAMA_UNAVAILABLE'))

        await expect(talosQualifyLocalBackend('/models/qwen.gguf')).resolves.toEqual({
            ran: false,
            reason: null,
            probedCpu: false,
            cpuInconclusive: false,
            probedGpu: false,
            gpuInconclusive: false,
            decisionBackend: null,
            decisionReason: null,
        })
    })
})

/**
 * P3-1 — apertura anticipata. Solo l'ESECUZIONE: la decisione ambientale
 * (termico, memoria) è in `localWarmTrigger.ts`, testata lì da sola.
 */
describe('talosWarmLocalModel — l\'apertura anticipata, silenziosa', () => {
    beforeEach(() => {
        bridge.open.mockReset()
        bridge.available.mockReset()
    })

    it('non riapre se il modello è già quello caricato', async () => {
        bridge.available.mockResolvedValue({ available: true, backends: 'CPU', loadedPath: '/m.gguf' })

        await talosWarmLocalModel('/m.gguf')

        expect(bridge.open).not.toHaveBeenCalled()
    })

    it('apre se non è ancora caricato QUESTO path', async () => {
        bridge.available.mockResolvedValue({ available: true, backends: 'CPU', loadedPath: null })
        bridge.open.mockResolvedValue({ contextTokens: 4096 })

        await talosWarmLocalModel('/m.gguf')

        expect(bridge.open).toHaveBeenCalledTimes(1)
        expect(bridge.open.mock.calls[0]![0]).toMatchObject({ path: '/m.gguf' })
    })

    /** ⛔ Nessun motore disponibile non è un errore da propagare: è "niente da scaldare". */
    it('non tenta nulla se il motore non è disponibile su questa build', async () => {
        bridge.available.mockResolvedValue({ available: false, backends: '', loadedPath: null })

        await talosWarmLocalModel('/m.gguf')

        expect(bridge.open).not.toHaveBeenCalled()
    })

    /**
     * AL CONTRARIO — un'ottimizzazione silenziosa che lancia romperebbe la
     * chat vera: il primo messaggio, quando arriva, deve poter riaprire nel
     * percorso normale come se il warm non fosse mai partito.
     */
    it('AL CONTRARIO — un fallimento nativo non esce mai da qui', async () => {
        bridge.available.mockRejectedValue(new Error('TALOS_LLAMA_UNAVAILABLE'))

        await expect(talosWarmLocalModel('/m.gguf')).resolves.toBeUndefined()
    })

    /**
     * ⛔⛔ La guardia di concorrenza — mai due `open()` native in volo
     * insieme dal warm-loader: TalosLlamaEngine ha un solo thread attore
     * (P0-3), e due aperture in parallelo sono esattamente quella corsa.
     */
    it('⛔ due trigger ravvicinati non aprono in parallelo: il secondo aspetta il primo', async () => {
        let sbloccaPrimo!: () => void
        const primoBloccato = new Promise<void>((resolve) => { sbloccaPrimo = resolve })
        let aperturaInCorso = 0
        let massimoParallele = 0

        bridge.available.mockResolvedValue({ available: true, backends: 'CPU', loadedPath: null })
        bridge.open.mockImplementation(async () => {
            aperturaInCorso += 1
            massimoParallele = Math.max(massimoParallele, aperturaInCorso)
            if (bridge.open.mock.calls.length === 1) await primoBloccato
            aperturaInCorso -= 1
            return { contextTokens: 4096 }
        })

        const primo = talosWarmLocalModel('/a.gguf')
        const secondo = talosWarmLocalModel('/b.gguf')
        // Il primo resta bloccato finché non lo sblocco esplicitamente: se il
        // secondo potesse partire comunque, `massimoParallele` salirebbe a 2
        // prima che questo await risolva qualcosa.
        await Promise.resolve()
        sbloccaPrimo()
        await Promise.all([primo, secondo])

        expect(massimoParallele).toBe(1)
        expect(bridge.open).toHaveBeenCalledTimes(2)
    })
})

describe('talosLocalPerformanceSignals — P2-3, passa attraverso senza toccare', () => {
    it('restituisce esattamente quello che il ponte nativo risponde', async () => {
        bridge.performanceSignals.mockResolvedValue({
            cpuHeadroom: 42, gpuHeadroom: null, thermalHeadroom: 80, thermalForecast: 75,
            thermalStatus: 'light', sampledAtElapsedMs: 123456,
        })

        const segnali = await talosLocalPerformanceSignals()

        expect(segnali).toEqual({
            cpuHeadroom: 42, gpuHeadroom: null, thermalHeadroom: 80, thermalForecast: 75,
            thermalStatus: 'light', sampledAtElapsedMs: 123456,
        })
    })

    it('⛔ AL CONTRARIO — tutti i campi null (device sotto la soglia API) non vengono riscritti a un altro valore', async () => {
        bridge.performanceSignals.mockResolvedValue({
            cpuHeadroom: null, gpuHeadroom: null, thermalHeadroom: null, thermalForecast: null,
            thermalStatus: null, sampledAtElapsedMs: 1,
        })

        const segnali = await talosLocalPerformanceSignals()

        expect(segnali.cpuHeadroom).toBeNull()
        expect(segnali.gpuHeadroom).toBeNull()
        expect(segnali.thermalHeadroom).toBeNull()
        expect(segnali.thermalForecast).toBeNull()
        expect(segnali.thermalStatus).toBeNull()
    })
})
