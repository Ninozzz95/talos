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
        // D13 (01/10/2026): l'apertura per la chat interrompe la prova dei motori.
        talosCancelAutomaticProbe: vi.fn(async () => undefined),
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
        /*
         * ⛔ I due fatti che dicono DOVE può girare il modello. Il caso
         * normale di questa suite è quello di un telefono senza acceleratore
         * e senza misure — cioè «non chiedere niente», il comportamento di
         * sempre — e le prove che seguono lo cambiano una alla volta.
         */
        talosLocalEngineBackendFacts: vi.fn(async () => ({
            backendDevice: null,
            gpuLayersEffective: 0,
            offloadDevices: null,
            threadPoolSplit: null,
        })),
        talosLocalPerformanceProfiles: vi.fn(async () => [] as unknown[]),
        /*
         * ⛔ Il formato dei pesi entra nella decisione del backend dall'11/09:
         * `Q4_0` e' il caso in cui l'NPU ha senso, e queste prove riguardano
         * l'NPU e la GPU. Su `Q4_K_M` l'NPU misurava 55,7 t/s contro 206 della
         * GPU, ed e' coperto da `localBackendPlan.test.ts`.
         */
        talosLocalModelQuantisation: vi.fn(async () => 'Q4_0' as string | null),
        // B1: chiamata dopo ogni generazione riuscita per tracciare i tempi
        // nativi. `null` e' l'esito onesto gia' definito dalla funzione vera
        // quando non c'e' niente da riportare - non un valore inventato per
        // il test.
        talosLocalEngineTimings: vi.fn(async () => null),
    }
})
vi.mock('@/services/localEngine', () => localEngine)

// Le righe che vanno in logcat (`local:<id> <evento>`): qui si raccolgono per leggerle.
const traccia = vi.hoisted(() => ({ righe: [] as string[] }))
vi.mock('@/lib/device/traccia', () => ({ talosTracciaFuori: (riga: string) => { traccia.righe.push(riga) } }))

const deviceCapacity = vi.hoisted(() => ({ talosMeasureDevice: vi.fn() }))
vi.mock('@/services/deviceCapacity', () => deviceCapacity)

/** La preferenza «CPU · GPU · Hexagon» vive nelle Preferences: qui, in memoria. */
const prefs = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
        set: async ({ key, value }: { key: string, value: string }) => { prefs.set(key, value) },
        remove: async ({ key }: { key: string }) => { prefs.delete(key) },
    },
}))

const GIB = 1024 * 1024 * 1024

/** LFM2.5-2.6B come lo dichiara il file: un ibrido, la cache solo sugli strati d'attenzione. */
const LFM_SHAPE = {
    layers: 6,
    kvHeads: 8,
    headDim: 64,
    trainedContext: 128000,
    weightBytes: Math.round(1.5 * GIB),
    kvBytesPerElement: 2,
}

/** Il Pad: 11,2 GB, a caldo. */
const PAD = {
    totalRamBytes: Math.round(11.2 * GIB),
    availableRamBytes: Math.round(5 * GIB),
    lowMemoryThresholdBytes: Math.round(0.4 * GIB),
    freeStorageBytes: 80 * GIB,
    memoryBandwidthBytesPerSecond: null,
    thermal: 'none' as const,
    abiSupported: true,
}

/** Un telefono stretto con un modello che non ci sta a 16k nemmeno con la cache leggera. */
const STRETTO = { ...PAD, totalRamBytes: 4 * GIB, availableRamBytes: Math.round(0.3 * GIB), lowMemoryThresholdBytes: Math.round(0.2 * GIB) }
const LLAMA_8B_SHAPE = { layers: 32, kvHeads: 8, headDim: 128, trainedContext: 131072, weightBytes: Math.round(4.6 * GIB), kvBytesPerElement: 2 }

const PERCORSO = '/data/user/0/ai.talos.dev/files/models/LFM2.5-2.6B-QAD-Q4_0.gguf'
const CON_ATTREZZI = { supportsTools: true, supportsToolCalls: true, supportsSystemRole: true, grammarForTools: true, thinkingCanBeDisabled: true }

const { talosApriPerIlCodice, talosScordaRiaperture } = await import('@/lib/chat/providers/localAdapter')

/**
 * ⛔ CODICE COL MOTORE LOCALE — l'apertura per il Codice (owner 18/10/2026, «Sì, minimo 16k»; ledger
 * `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): lo stesso calcolo della chat (`localContextCeiling` sulla forma del modello e la
 * memoria del telefono), con i numeri del Codice: 32k ridotto al tetto, gradini 32k → 16k, minimo 16k, `f16` poi `q8_0`.
 */
describe('il modello locale aperto per il Codice', () => {
    beforeEach(() => {
        for (const f of [localEngine.talosLocalEngineStatus, localEngine.talosLocalEngineOpen, localEngine.talosLocalEnginePlanPrompt, localEngine.talosLocalEngineTemplateCapabilities, deviceCapacity.talosMeasureDevice]) f.mockReset()
        localEngine.talosLocalEngineStatus.mockResolvedValue({ available: true, backends: 'CPU', loadedPath: null, shape: null, kvCacheType: null, contextTokens: null })
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue(CON_ATTREZZI)
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue({ promptTokens: 12, shape: LFM_SHAPE })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(PAD)
        localEngine.talosLocalEngineOpen.mockImplementation(async (_p: string, o: { contextTokens: number, kvCacheType: string }) => {
            localEngine.talosLocalEngineStatus.mockResolvedValue({ available: true, backends: 'CPU', loadedPath: PERCORSO, shape: null, kvCacheType: o.kvCacheType, contextTokens: o.contextTokens })
            return { contextTokens: o.contextTokens }
        })
    })

    it('LCOD-01 sul Pad si apre a 32k con la cache f16, e si dice la finestra vera', async () => {
        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'aperto', nCtx: 32768 })
        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledTimes(1)
        expect(localEngine.talosLocalEngineOpen.mock.calls[0][1]).toMatchObject({ contextTokens: 32768, kvCacheType: 'f16' })
    })

    it('LCOD-02 apertura fallita a 32k per il contesto: si riprova a 24k', async () => {
        const apri = localEngine.talosLocalEngineOpen.getMockImplementation()!
        localEngine.talosLocalEngineOpen.mockImplementationOnce(async () => { throw new localEngine.TalosLocalEngineOpenError('context') })
        localEngine.talosLocalEngineOpen.mockImplementation(apri)
        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'aperto', nCtx: 24576 })
        expect(localEngine.talosLocalEngineOpen.mock.calls.map((c) => c[1].contextTokens)).toEqual([32768, 24576])
    })

    it('LCOD-03 la stima dice che il modello non arriva a 24k: si prova lo stesso, al minimo con la cache leggera, e se si apre si usa', async () => {
        deviceCapacity.talosMeasureDevice.mockResolvedValue(STRETTO)
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue({ promptTokens: 12, shape: LLAMA_8B_SHAPE })
        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'aperto', nCtx: 24576 })
        expect(localEngine.talosLocalEngineOpen.mock.calls.map((c) => [c[1].contextTokens, c[1].kvCacheType])).toEqual([[24576, 'q8_0']])
    })

    it('LCOD-03b il motore rifiuta il contesto anche al minimo: il modello non regge il Codice, e si dice quanto stimava', async () => {
        deviceCapacity.talosMeasureDevice.mockResolvedValue(STRETTO)
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue({ promptTokens: 12, shape: LLAMA_8B_SHAPE })
        localEngine.talosLocalEngineOpen.mockImplementation(async () => { throw new localEngine.TalosLocalEngineOpenError('context') })
        const esito = await talosApriPerIlCodice(PERCORSO)
        expect(esito.esito).toBe('troppo-piccolo')
        expect((esito as { massimo: number }).massimo).toBeLessThan(24576)
    })

    it('LCOD-04 un template che non sa chiamare attrezzi: non si apre, e si dice perché', async () => {
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue({ ...CON_ATTREZZI, supportsTools: false, supportsToolCalls: false })
        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'senza-attrezzi' })
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
    })

    it('LCOD-05 già aperto dalla chat con almeno 24k: si usa com’è, senza riaprire', async () => {
        localEngine.talosLocalEngineStatus.mockResolvedValue({ available: true, backends: 'CPU', loadedPath: PERCORSO, shape: null, kvCacheType: 'f16', contextTokens: 26624 })
        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'aperto', nCtx: 26624 })
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
    })

    it('LCOD-06 già aperto dalla chat a 4k: si riapre con la finestra del Codice', async () => {
        localEngine.talosLocalEngineStatus.mockResolvedValue({ available: true, backends: 'CPU', loadedPath: PERCORSO, shape: null, kvCacheType: 'f16', contextTokens: 4096 })
        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'aperto', nCtx: 32768 })
    })

    it('LCOD-07 un guasto che non è il contesto non si ritenta e arriva con la frase della chat', async () => {
        localEngine.talosLocalEngineOpen.mockImplementation(async () => { throw new localEngine.TalosLocalEngineOpenError('model-load') })
        await expect(talosApriPerIlCodice(PERCORSO)).rejects.toMatchObject({ provider: 'local' })
        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledTimes(1)
    })

    it('LCOD-08 senza motore nell’app: guasto, nessuna apertura', async () => {
        localEngine.talosLocalEngineStatus.mockResolvedValue({ available: false, backends: '', loadedPath: null, shape: null, kvCacheType: null, contextTokens: null })
        await expect(talosApriPerIlCodice(PERCORSO)).rejects.toThrow('TALOS_LOCAL_ENGINE_UNAVAILABLE')
    })
})

/*
 * ⛔⛔ Legge dell'owner «il Codice è identico alla chat» (22/10/2026): la stessa cura della chat (`pianoPerRiaprire`).
 *
 * Scenario del Pad: LFM2.5-2.6B Q4_0 già aperto a 26.624 sulla CPU (riscaldamento o chat), profili misurati CPU (scrittura
 * 26,94, lettura 103,4) e hexagon/HTP0 (25,90, 1298,9). Il Codice lo usava com'era: «già aperto con almeno il minimo».
 * Con il prompt di r4 — almeno 5.732 token al primo passo (misurato sul Pad il 19/10) — la lettura sulla CPU costa ~55 s,
 * sull'NPU ~4,4 s.
 */
describe('il Codice trova il modello aperto sul motore sbagliato', () => {
    const SULLA_CPU = { backendDevice: null, gpuLayersEffective: 0, offloadDevices: 2, threadPoolSplit: null }
    const SULL_NPU = { backendDevice: 'HTP0', gpuLayersEffective: -1, offloadDevices: 2, threadPoolSplit: null }
    const PROFILI_DEL_PAD = [
        {
            backendRegistry: 'CPU', backendDevice: null, outcome: 'CORRECT' as const,
            ttftMs: 5_002, decodeTokPerSec: 26.94, prefillTokPerSec: 103.4, openMs: null,
            qualificationLevel: 'Q1' as const, measuredAtMs: 1_761_100_000_000,
        },
        {
            backendRegistry: 'hexagon', backendDevice: 'HTP0', outcome: 'CORRECT' as const,
            ttftMs: 501, decodeTokPerSec: 25.90, prefillTokPerSec: 1298.9, openMs: null,
            qualificationLevel: 'Q1' as const, measuredAtMs: 1_761_100_000_000,
        },
    ]
    const APERTO_SULLA_CPU = { available: true, backends: 'CPU,OpenCL,HTP', loadedPath: PERCORSO, shape: null, kvCacheType: 'f16', contextTokens: 26624 }

    beforeEach(() => {
        talosScordaRiaperture()
        for (const f of [localEngine.talosLocalEngineStatus, localEngine.talosLocalEngineOpen, localEngine.talosLocalEnginePlanPrompt, localEngine.talosLocalEngineTemplateCapabilities, deviceCapacity.talosMeasureDevice]) f.mockReset()
        localEngine.talosCancelAutomaticProbe.mockClear()
        localEngine.talosLocalEngineStatus.mockResolvedValue(APERTO_SULLA_CPU)
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue(CON_ATTREZZI)
        localEngine.talosLocalEnginePlanPrompt.mockResolvedValue({ promptTokens: 12, shape: LFM_SHAPE })
        deviceCapacity.talosMeasureDevice.mockResolvedValue(PAD)
        localEngine.talosLocalPerformanceProfiles.mockResolvedValue(PROFILI_DEL_PAD)
        localEngine.talosLocalEngineBackendFacts.mockResolvedValue(SULLA_CPU)
        // Dopo l'apertura il motore resta descritto com'era: è il caso peggiore per la guardia «una riapertura sola».
        localEngine.talosLocalEngineOpen.mockImplementation(async (_p: string, o: { contextTokens: number }) => ({ contextTokens: o.contextTokens }))
    })

    it('LCOD-09 si riapre sull’NPU misurata più veloce, interrompendo prima la prova', async () => {
        traccia.righe.length = 0
        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toMatchObject({ esito: 'aperto' })

        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledTimes(1)
        expect(localEngine.talosLocalEngineOpen.mock.calls[0][1]).toMatchObject({ gpuLayers: -1, backend: 'HTP' })
        // La riga che dal vivo dice perché si è riaperto, e la forma del lavoro con cui si è deciso.
        expect(traccia.righe.some((r) => /^local:codice-\S+ backend_reopen from=cpu to=hexagon reason=fastest$/.test(r))).toBe(true)
        expect(traccia.righe.some((r) => /backend_work prompt=5732 out=256 quant=Q4_0/.test(r))).toBe(true)
        const interrompi = localEngine.talosCancelAutomaticProbe.mock.invocationCallOrder[0]
        const apri = localEngine.talosLocalEngineOpen.mock.invocationCallOrder[0]
        expect(interrompi!).toBeLessThan(apri!)
    })

    it('LCOD-10 AL CONTRARIO — già sull’NPU con almeno il minimo: si usa com’è', async () => {
        localEngine.talosLocalEngineBackendFacts.mockResolvedValue(SULL_NPU)

        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'aperto', nCtx: 26624 })
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
    })

    it('LCOD-11 AL CONTRARIO — la stessa riapertura non si ripete a ogni giro', async () => {
        await talosApriPerIlCodice(PERCORSO)
        await talosApriPerIlCodice(PERCORSO)

        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledTimes(1)
    })

    it('LCOD-12 AL CONTRARIO — senza misure (solo il suggerimento del formato) non si riapre', async () => {
        localEngine.talosLocalPerformanceProfiles.mockResolvedValue([])

        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'aperto', nCtx: 26624 })
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
    })

    // Revisione avversaria 22/10, rilievo 2: le misure girano sul filo unico delle qualificazioni (`qualificationWorker`).
    it('LCOD-13 misure che non arrivano entro il tetto del riscaldamento: si usa il modello aperto così com’è', async () => {
        localEngine.talosLocalPerformanceProfiles.mockReturnValue(new Promise(() => undefined))

        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toEqual({ esito: 'aperto', nCtx: 26624 })
        expect(localEngine.talosLocalEngineOpen).not.toHaveBeenCalled()
    }, 4_000)

    it('LCOD-14 con il modello già aperto la prova si interrompe PRIMA di chiedere le misure', async () => {
        localEngine.talosLocalPerformanceProfiles.mockClear()
        await talosApriPerIlCodice(PERCORSO)

        const interrompi = localEngine.talosCancelAutomaticProbe.mock.invocationCallOrder[0]
        const misure = localEngine.talosLocalPerformanceProfiles.mock.invocationCallOrder[0]
        expect(interrompi!).toBeLessThan(misure!)
    })

    // Rilievo 4: il ponte chiude il modello aperto PRIMA di provare il nuovo; una riapertura fallita lasciava il Codice senza.
    it('LCOD-15 la riapertura sull’NPU fallisce: si torna sul motore di prima (la CPU) con la stessa finestra', async () => {
        const apri = localEngine.talosLocalEngineOpen.getMockImplementation()!
        localEngine.talosLocalEngineOpen.mockImplementationOnce(async () => { throw new localEngine.TalosLocalEngineOpenError('model-load') })
        localEngine.talosLocalEngineOpen.mockImplementation(apri)

        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toMatchObject({ esito: 'aperto' })

        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledTimes(2)
        const [prima, ritorno] = localEngine.talosLocalEngineOpen.mock.calls.map((c) => c[1])
        expect(prima).toMatchObject({ gpuLayers: -1, backend: 'HTP' })
        expect(ritorno).toMatchObject({ gpuLayers: 0, contextTokens: prima.contextTokens, kvCacheType: prima.kvCacheType })
        expect(ritorno).not.toHaveProperty('backend')
    })

    it('LCOD-17 l’NPU non regge nessuna finestra del Codice: si torna sul motore di prima, che la reggeva', async () => {
        localEngine.talosLocalEngineOpen.mockImplementation(async (_p: string, o: { contextTokens: number, backend?: string }) => {
            if (o.backend === 'HTP') throw new localEngine.TalosLocalEngineOpenError('context')
            return { contextTokens: o.contextTokens }
        })

        await expect(talosApriPerIlCodice(PERCORSO)).resolves.toMatchObject({ esito: 'aperto' })

        expect(localEngine.talosLocalEngineOpen.mock.calls.at(-1)![1]).toMatchObject({ gpuLayers: 0 })
    })

    it('LCOD-16 AL CONTRARIO — fallisce anche il ritorno: arriva il guasto della riapertura, con la frase della chat', async () => {
        localEngine.talosLocalEngineOpen.mockImplementation(async () => { throw new localEngine.TalosLocalEngineOpenError('model-load') })

        await expect(talosApriPerIlCodice(PERCORSO)).rejects.toMatchObject({ provider: 'local' })
        expect(localEngine.talosLocalEngineOpen).toHaveBeenCalledTimes(2)
    })
})
