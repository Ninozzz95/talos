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
    // I profili misurati da `qualifyBackend`: è da qui che esce il predefinito
    // «il più veloce» quando la persona non ha ancora scelto.
    localPerformanceProfiles: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
    Capacitor: { isNativePlatform: () => true },
}))

/**
 * La preferenza «dove far girare il modello» vive nelle Preferences, non sul
 * ponte nativo — ed è esattamente questa la ragione per cui il riscaldamento
 * può saltare la domanda cara quando la persona ha già scelto: la sua scelta
 * non passa dal thread che il sondaggio occupa.
 */
const preferences = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: vi.fn(async () => ({ value: preferences.value })),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
    },
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
    talosRunProbe,
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
            /*
             * ⛔ Il ponte non l'ha mandato, e vale FALSE — non «non lo so», non
             * assente. `grammarForTools` decide se le chiamate di questo modello
             * possono essere TENUTE da una grammatica: promuovere l'incertezza a
             * «si'» sarebbe la bugia comoda, ed e' quella che l'11/09 ha lasciato
             * uscire `"names": "['library_list', …]"` dove lo schema vuole un
             * array.
             */
            grammarForTools: false,
            /*
             * ⛔ Stessa regola per il quinto bit: un ponte che non dichiara
             * `thinkingCanBeDisabled` non sta promettendo un interruttore. Su
             * `LFM2.5` quell'interruttore vale 7,6 secondi per messaggio, e
             * offrirlo dove non c'e' e' peggio che non offrirlo.
             */
            thinkingCanBeDisabled: false,
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
            probedNpu: false,
            npuInconclusive: false,
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
            probedNpu: false,
            npuInconclusive: false,
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
            probedNpu: false,
            npuInconclusive: false,
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
            probedNpu: false,
            npuInconclusive: false,
            decisionBackend: null,
            decisionReason: null,
        })
    })
})

/**
 * ⛔⛔⛔ 2026-09-10 — LA DIAGNOSI DEI 32 SECONDI, provata invece che dedotta.
 *
 * Il riscaldamento c'era da agosto ed era agganciato alla scelta del modello,
 * eppure il 10/09 il modello risultava FREDDO due minuti dopo essere stato
 * scelto: 32,0 s alla prima parola. La causa non era il cancello termico e non
 * era un percorso morto — era che il riscaldamento, PRIMA di aprire, chiedeva
 * al ponte i profili misurati di quel modello, e dall'altra parte quella
 * domanda (`TalosLlamaPlugin.localPerformanceProfiles`) fa uno sha256 dell'INTERO
 * GGUF su `qualificationWorker`, che è un `newSingleThreadExecutor()` — lo
 * stesso su cui gira il sondaggio GPU. Alla prima scelta di un modello locale
 * le due cose partono insieme, e il riscaldamento resta in coda dietro due
 * aperture piene e due generazioni vere.
 *
 * Questi test tengono ferme le due metà della cura. Senza di loro tornerebbe.
 */
describe('⛔ il riscaldamento non aspetta una misura che non può cambiare la decisione', () => {
    beforeEach(() => {
        bridge.open.mockReset()
        bridge.available.mockReset()
        bridge.localPerformanceProfiles.mockReset()
        bridge.available.mockResolvedValue({
            available: true, backends: 'CPU,OpenCL', loadedPath: null, offloadDevices: 1,
        })
        bridge.open.mockResolvedValue({ contextTokens: 4096 })
        preferences.value = null
    })

    it('con una scelta MANUALE della persona non chiede affatto i profili', async () => {
        // `talosDecideLocalBackend` esce alla prima riga con una scelta manuale
        // valida: i profili non li guarda MAI. Leggere 1,6 GB dal disco per un
        // elenco che nessuno leggerà è puro ritardo.
        preferences.value = JSON.stringify({ mode: 'manual', manual: 'cpu' })

        const esito = await talosWarmLocalModel('/m.gguf')

        expect(bridge.localPerformanceProfiles).not.toHaveBeenCalled()
        expect(bridge.open).toHaveBeenCalledTimes(1)
        expect(esito).toMatchObject({ opened: true, withoutMeasuredProfiles: false })
    })

    it('AL CONTRARIO — senza una scelta manuale i profili si chiedono, perché lì decidono', async () => {
        bridge.localPerformanceProfiles.mockResolvedValue({ profiles: [] })

        await talosWarmLocalModel('/m.gguf')

        expect(bridge.localPerformanceProfiles).toHaveBeenCalledWith({ path: '/m.gguf' })
    })

    it('⛔ se i profili non arrivano, APRE LO STESSO e lo dichiara invece di restare in coda', async () => {
        vi.useFakeTimers()
        try {
            // Il ponte non risponde: è la coda dietro il sondaggio, riprodotta.
            bridge.localPerformanceProfiles.mockImplementation(() => new Promise(() => {}))

            const corsa = talosWarmLocalModel('/m.gguf')
            await vi.advanceTimersByTimeAsync(2_000)
            const esito = await corsa

            expect(bridge.open).toHaveBeenCalledTimes(1)
            // ⛔ `withoutMeasuredProfiles` è la differenza fra «CPU perché l'ha
            // vinta» e «CPU perché non ho aspettato»: si dichiara, non si perde.
            expect(esito).toMatchObject({ opened: true, withoutMeasuredProfiles: true })
        } finally {
            vi.useRealTimers()
        }
    })

    it('AL CONTRARIO — se i profili arrivano in tempo, il piano NON è dichiarato senza misure', async () => {
        bridge.localPerformanceProfiles.mockResolvedValue({ profiles: [] })

        const esito = await talosWarmLocalModel('/m.gguf')

        expect(esito).toMatchObject({ opened: true, withoutMeasuredProfiles: false })
    })
})

/**
 * ⛔⛔ L'ORDINE FRA I DUE LAVORI NATIVI — la seconda metà della stessa cura.
 *
 * Riscaldamento e sondaggio GPU finiscono sullo stesso thread nativo. Chi
 * arriva secondo aspetta il primo per intero, quindi l'ordine non è
 * indifferente: davanti va il tempo che una PERSONA sta guardando adesso.
 */
describe('⛔ il sondaggio GPU si mette IN FILA dietro il riscaldamento, mai davanti', () => {
    beforeEach(() => {
        bridge.open.mockReset()
        bridge.available.mockReset()
        bridge.localPerformanceProfiles.mockReset()
        bridge.qualifyBackend.mockReset()
        bridge.localPerformanceProfiles.mockResolvedValue({ profiles: [] })
        bridge.available.mockResolvedValue({ available: true, backends: 'CPU', loadedPath: null })
        preferences.value = null
    })

    it('non interroga il ponte finché l’apertura in volo non è finita', async () => {
        let sbloccaApertura!: () => void
        const aperturaBloccata = new Promise<void>((resolve) => { sbloccaApertura = resolve })
        bridge.open.mockImplementation(async () => {
            await aperturaBloccata
            return { contextTokens: 4096 }
        })
        bridge.qualifyBackend.mockResolvedValue({
            ran: true, reason: null, probedCpu: true, cpuInconclusive: false,
            probedGpu: false, gpuInconclusive: false,
            decisionBackend: 'cpu', decisionReason: 'unproven',
        })

        const riscaldamento = talosWarmLocalModel('/m.gguf')
        const sondaggio = talosRunProbe('/m.gguf')
        // Tutti i microtask che possono girare, girano: se il sondaggio non
        // aspettasse, `qualifyBackend` sarebbe già stato chiamato qui.
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(bridge.qualifyBackend).not.toHaveBeenCalled()

        sbloccaApertura()
        await Promise.all([riscaldamento, sondaggio])
        expect(bridge.qualifyBackend).toHaveBeenCalledTimes(1)
    })

    it('AL CONTRARIO — senza nessun riscaldamento in volo il sondaggio parte subito', async () => {
        bridge.qualifyBackend.mockResolvedValue({
            ran: true, reason: null, probedCpu: true, cpuInconclusive: false,
            probedGpu: false, gpuInconclusive: false,
            decisionBackend: 'cpu', decisionReason: 'unproven',
        })

        await talosRunProbe('/m.gguf')

        expect(bridge.qualifyBackend).toHaveBeenCalledTimes(1)
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
        bridge.localPerformanceProfiles.mockReset()
        // Il caso normale: nessuna misura, quindi nessuna richiesta di
        // backend — l'apertura resta identica a quella di sempre.
        bridge.localPerformanceProfiles.mockResolvedValue({ profiles: [] })
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

        // ⛔ Non solleva — e dal 10/09 lo DICE invece di tacere: `void` era
        // indistinguibile da «è andata bene», ed è il motivo per cui nessuno
        // ha mai potuto sapere perché il modello risultasse freddo.
        // ⛔ `engine-absent` e non `failed`: un ponte che rifiuta lo stato è
        // già tradotto in «su questa build non c'è motore» da
        // `talosLocalEngineStatus`, e a schermo le due cose dicono la stessa
        // frase. La distinzione resta qui, dove serve a chi ripara.
        await expect(talosWarmLocalModel('/m.gguf'))
            .resolves.toEqual({ opened: false, why: 'engine-absent' })
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

    /**
     * ⛔⛔ IL RISCALDAMENTO DECIDE DOVE, altrimenti decide per tutti.
     *
     * Questa apertura arriva PRIMA del primo messaggio, e `ensureLoaded`
     * nell'adattatore torna subito se il modello chiesto è già quello aperto.
     * ⇒ Un riscaldamento che apre sulla CPU inchioda alla CPU l'intera
     * conversazione, e l'aggancio nell'adattatore resterebbe vero e mai
     * percorso: la forma esatta del difetto che questo lavoro chiude.
     */
    it('MORDE — il riscaldamento NOMINA il backend che la misura ha scelto', async () => {
        bridge.available.mockResolvedValue({
            available: true, backends: 'CPU,OpenCL', loadedPath: null,
        })
        bridge.localPerformanceProfiles.mockResolvedValue({
            profiles: [
                {
                    backendRegistry: 'CPU', backendDevice: null, outcome: 'CORRECT',
                    ttftMs: 3_000, decodeTokPerSec: 9,
                    qualificationLevel: 'Q1', measuredAtMs: 1_757_500_000_000,
                },
                {
                    backendRegistry: 'OpenCL', backendDevice: 'Adreno', outcome: 'CORRECT',
                    ttftMs: 1_200, decodeTokPerSec: 24,
                    qualificationLevel: 'Q1', measuredAtMs: 1_757_500_000_000,
                },
            ],
        })
        bridge.open.mockResolvedValue({ contextTokens: 4096 })

        await talosWarmLocalModel('/m.gguf')

        expect(bridge.open.mock.calls[0]![0]).toMatchObject({
            path: '/m.gguf', gpuLayers: -1, backend: 'OpenCL',
        })
    })

    /**
     * ⛔ AL CONTRARIO — senza misure non si chiede niente: né un bersaglio né
     * `gpuLayers: 0`, che sarebbe un default silenzioso e spegnerebbe
     * l'arbitro nativo che legge l'evidenza del sondaggio.
     */
    it('AL CONTRARIO — senza misure il riscaldamento non chiede DOVE', async () => {
        bridge.available.mockResolvedValue({
            available: true, backends: 'CPU,OpenCL', loadedPath: null,
        })
        bridge.open.mockResolvedValue({ contextTokens: 4096 })

        await talosWarmLocalModel('/m.gguf')

        const opzioni = bridge.open.mock.calls[0]![0] as Record<string, unknown>
        expect(opzioni).not.toHaveProperty('gpuLayers')
        expect(opzioni).not.toHaveProperty('backend')
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
