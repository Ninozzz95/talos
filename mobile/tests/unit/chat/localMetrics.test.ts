import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ FASE 2 — la riga «351 ms alla prima parola · 9,7 token/sec» sotto le
 * risposte del motore locale, provata dove nasce: la misura, la coda e il
 * legame col messaggio.
 *
 * ⛔ Metà di questi test è il VERSO CONTRARIO, e non è un di più: la riga
 * deve sparire quando i numeri non ci sono, e non deve MAI comparire su un
 * fornitore a chiave. Un test che prova solo il caso buono lo passerebbe
 * anche una riga che si mostra sempre.
 */

const localEngine = vi.hoisted(() => {
    class TalosLocalEngineOpenError extends Error {}
    class TalosLocalEngineGenerationError extends Error {}
    return {
        TalosLocalEngineGenerationError,
        TalosLocalEngineOpenError,
        talosLocalInstalledModels: vi.fn(async () => []),
        talosLocalEngineStatus: vi.fn(),
        talosLocalEngineOpen: vi.fn(),
        talosLocalEngineOpenWithFallback: vi.fn(),
        talosLocalEngineChatPlan: vi.fn(),
        talosLocalEnginePlanPrompt: vi.fn(async () => null),
        talosLocalEngineTemplateCapabilities: vi.fn(),
        talosKvBytesPerElement: () => 2,
        talosLocalEngineChatPrompt: vi.fn(),
        talosLocalEngineGenerate: vi.fn(),
        talosLocalEngineCancel: vi.fn(),
        talosLocalEngineClose: vi.fn(),
        talosLocalEngineTimings: vi.fn(async () => null),
        talosFreezePrefix: vi.fn(async () => null),
        talosThawPrefix: vi.fn(async () => null),
        talosEvictPrefixes: vi.fn(async () => null),
    }
})
vi.mock('@/services/localEngine', () => localEngine)

const deviceCapacity = vi.hoisted(() => ({ talosMeasureDevice: vi.fn(async () => null) }))
vi.mock('@/services/deviceCapacity', () => deviceCapacity)

// Il ponte della tracciatura non esiste in Node: `talosTracciaFuori` è già
// difensivo, ma zittirlo tiene le righe del test leggibili.
vi.mock('@capacitor/core', () => ({ Capacitor: { Plugins: {} } }))

const { localAdapter } = await import('@/lib/chat/providers/localAdapter')
const {
    talosRegistraMisuraLocale,
    talosRitiraMisuraLocale,
    talosScordaMisureLocali,
} = await import('@/lib/chat/providers/localTrace')
const {
    talosAggiornaMisureDeiMessaggi,
    talosMisureDelMessaggio,
    talosScordaLegameMisure,
} = await import('@/components/chat/useTalosLocalMetrics')

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

function misuraFinta(finishedAt: number) {
    return {
        traceId: 't1',
        finishedAt,
        firstVisibleMs: 351,
        tokensPerSecond: 9.7,
        msPerToken: 103,
        producedTokens: 42,
        promptTokens: 120,
        prefillMs: 300,
        engineFirstTokenMs: 351,
        reusedTokens: 0,
        partialTrimRefused: false,
        prefixOutcome: 'reused',
    }
}

describe('FASE-2 — il cronometro dell adattatore locale', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-09-10T10:00:00.000Z'))
        talosScordaMisureLocali()
        localEngine.talosLocalEngineStatus.mockResolvedValue({
            available: true, backends: 'CPU', loadedPath: null, shape: null,
        })
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 4096 })
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue({
            supportsToolCalls: false, supportsSystemRole: true,
        })
        localEngine.talosLocalEngineChatPlan.mockResolvedValue({
            prompt: 'p', promptTokens: 120, contextTokens: 4096,
        })
        localEngine.talosLocalEngineTimings.mockResolvedValue(null)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('MISURA-01 col cronometro nativo: token al secondo sulla SOLA generazione, e ms per token che ne è il reciproco', async () => {
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                vi.advanceTimersByTime(350)
                onDelta('PRONTO')
                vi.advanceTimersByTime(1000)
                return { text: 'PRONTO', tokens: 11 }
            },
        )
        localEngine.talosLocalEngineTimings.mockResolvedValue({
            tokenizeMs: 5, prefixMs: 0, prefillMs: 300, firstTokenMs: 350, totalMs: 1350,
            promptTokens: 120, reusedTokens: 0, newTokens: 120, producedTokens: 11,
            reusedContext: false,
        })

        await localAdapter.streamComplete(
            richiestaLocale() as never,
            { apiKey: null, endpoint: null },
            { onChunk: () => {} } as never,
        )

        const misura = talosRitiraMisuraLocale()
        expect(misura).not.toBeNull()
        expect(misura?.firstVisibleMs).toBe(350)
        // (11 - 1) token nella finestra 1350 - 350 = 1000 ms ⇒ 10 token/s.
        // ⛔ Dieci token in un secondo, non undici: il primo era già uscito
        // quando la finestra è cominciata.
        expect(misura?.tokensPerSecond).toBeCloseTo(10, 6)
        expect(misura?.msPerToken).toBeCloseTo(100, 6)
        expect(misura?.prefillMs).toBe(300)
        expect(misura?.promptTokens).toBe(120)
        expect(misura?.engineFirstTokenMs).toBe(350)
    })

    it('MISURA-02 AL CONTRARIO: senza i tempi nativi si misura dal lato adattatore invece di inventarli', async () => {
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                vi.advanceTimersByTime(200)
                onDelta('PRONTO')
                vi.advanceTimersByTime(1000)
                return { text: 'PRONTO', tokens: 6 }
            },
        )
        localEngine.talosLocalEngineTimings.mockResolvedValue(null)

        await localAdapter.streamComplete(
            richiestaLocale() as never,
            { apiKey: null, endpoint: null },
            { onChunk: () => {} } as never,
        )

        const misura = talosRitiraMisuraLocale()
        expect(misura?.firstVisibleMs).toBe(200)
        expect(misura?.tokensPerSecond).toBeCloseTo(5, 6)
        // Ciò che il motore non ha mandato resta MANCANTE, non zero.
        expect(misura?.prefillMs).toBeNull()
        expect(misura?.promptTokens).toBeNull()
        expect(misura?.engineFirstTokenMs).toBeNull()
    })

    /**
     * ⛔ Il riuso della cache KV, dal cronometro nativo fino alla coda.
     *
     * Owner sul Pad il 2026-09-10: 1º messaggio 32,0 s alla prima parola, 2º
     * messaggio 38,9 s col modello GIÀ CALDO. Quei 6,9 s in più sono prefill
     * che si rifà, e l'unico modo di saperlo senza logcat (in rilascio il JNI
     * non ne scrive) è che questi due campi arrivino fino allo schermo.
     */
    it('MISURA-04 il riuso della cache arriva dal motore alla coda, riuso e rifiuto insieme', async () => {
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                vi.advanceTimersByTime(350)
                onDelta('PRONTO')
                vi.advanceTimersByTime(1000)
                return { text: 'PRONTO', tokens: 11 }
            },
        )
        localEngine.talosLocalEngineTimings.mockResolvedValue({
            tokenizeMs: 5, prefixMs: 12, prefillMs: 300, firstTokenMs: 350, totalMs: 1350,
            promptTokens: 3104, reusedTokens: 2847, newTokens: 257, producedTokens: 11,
            reusedContext: true, partialTrimRefused: true,
        })

        await localAdapter.streamComplete(
            richiestaLocale() as never,
            { apiKey: null, endpoint: null },
            { onChunk: () => {} } as never,
        )

        const misura = talosRitiraMisuraLocale()
        expect(misura?.reusedTokens).toBe(2847)
        expect(misura?.promptTokens).toBe(3104)
        expect(misura?.partialTrimRefused).toBe(true)
    })

    it('MISURA-05 AL CONTRARIO: un ponte nativo che non manda il riuso lascia null, non 0 e non «non rifiutato»', async () => {
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                vi.advanceTimersByTime(350)
                onDelta('PRONTO')
                vi.advanceTimersByTime(1000)
                return { text: 'PRONTO', tokens: 11 }
            },
        )
        // Il cronometro c'è, ma è quello di un APK più vecchio: nessun campo
        // sul riuso. ⛔ «Non me l'ha detto» non è «non è successo».
        localEngine.talosLocalEngineTimings.mockResolvedValue({
            tokenizeMs: 5, prefixMs: 0, prefillMs: 300, firstTokenMs: 350, totalMs: 1350,
            producedTokens: 11,
        })

        await localAdapter.streamComplete(
            richiestaLocale() as never,
            { apiKey: null, endpoint: null },
            { onChunk: () => {} } as never,
        )

        const misura = talosRitiraMisuraLocale()
        expect(misura?.reusedTokens).toBeNull()
        expect(misura?.promptTokens).toBeNull()
        expect(misura?.partialTrimRefused).toBeNull()
        expect(misura?.partialTrimRefused).not.toBe(false)
    })

    it('MISURA-06 lo ZERO MISURATO passa intatto: il primo turno riusa niente, ed è un dato', async () => {
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                vi.advanceTimersByTime(350)
                onDelta('PRONTO')
                vi.advanceTimersByTime(1000)
                return { text: 'PRONTO', tokens: 11 }
            },
        )
        localEngine.talosLocalEngineTimings.mockResolvedValue({
            tokenizeMs: 5, prefixMs: 0, prefillMs: 300, firstTokenMs: 350, totalMs: 1350,
            promptTokens: 3104, reusedTokens: 0, newTokens: 3104, producedTokens: 11,
            reusedContext: false, partialTrimRefused: false,
        })

        await localAdapter.streamComplete(
            richiestaLocale() as never,
            { apiKey: null, endpoint: null },
            { onChunk: () => {} } as never,
        )

        const misura = talosRitiraMisuraLocale()
        // ⛔ `0`, non `null`: la differenza fra «non ha riusato niente» e «non
        // lo so» è tutta la diagnosi.
        expect(misura?.reusedTokens).toBe(0)
        expect(misura?.partialTrimRefused).toBe(false)
    })

    it('MISURA-03 AL CONTRARIO: da UN solo token non esce nessuna velocità - null, mai zero', async () => {
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                vi.advanceTimersByTime(120)
                onDelta('Sì')
                return { text: 'Sì', tokens: 1 }
            },
        )
        localEngine.talosLocalEngineTimings.mockResolvedValue({
            tokenizeMs: 1, prefixMs: 0, prefillMs: 90, firstTokenMs: 120, totalMs: 120,
            promptTokens: 30, reusedTokens: 0, newTokens: 30, producedTokens: 1,
            reusedContext: false,
        })

        await localAdapter.streamComplete(
            richiestaLocale() as never,
            { apiKey: null, endpoint: null },
            { onChunk: () => {} } as never,
        )

        const misura = talosRitiraMisuraLocale()
        expect(misura?.firstVisibleMs).toBe(120)
        expect(misura?.tokensPerSecond).toBeNull()
        expect(misura?.msPerToken).toBeNull()
    })
})

describe('FASE-2 — la coda delle misure', () => {
    beforeEach(() => { talosScordaMisureLocali() })

    it('CODA-01 ritira l ULTIMA: in un turno con strumenti è quella che ha prodotto il testo che si legge', () => {
        talosRegistraMisuraLocale({ ...misuraFinta(Date.now()), traceId: 'chiamata' })
        talosRegistraMisuraLocale({ ...misuraFinta(Date.now()), traceId: 'risposta' })
        expect(talosRitiraMisuraLocale()?.traceId).toBe('risposta')
    })

    it('CODA-02 ritirare SVUOTA: la risposta dopo non eredita i numeri di quella prima', () => {
        talosRegistraMisuraLocale(misuraFinta(Date.now()))
        expect(talosRitiraMisuraLocale()).not.toBeNull()
        expect(talosRitiraMisuraLocale()).toBeNull()
    })

    it('CODA-03 AL CONTRARIO: una misura vecchia di dieci minuti è orfana e si butta', () => {
        const adesso = Date.now()
        talosRegistraMisuraLocale(misuraFinta(adesso - 10 * 60 * 1000))
        expect(talosRitiraMisuraLocale(adesso)).toBeNull()
    })
})

describe('FASE-2 — il legame fra una misura e il messaggio comparso', () => {
    beforeEach(() => {
        talosScordaMisureLocali()
        talosScordaLegameMisure()
    })

    const utente = { id: 'u1', role: 'user' }
    const risposta = { id: 'a1', role: 'assistant' }

    it('LEGAME-01 la risposta locale che compare si prende le misure appena registrate', () => {
        talosAggiornaMisureDeiMessaggi([])
        talosAggiornaMisureDeiMessaggi([utente])
        talosRegistraMisuraLocale(misuraFinta(Date.now()))
        talosAggiornaMisureDeiMessaggi([utente, risposta])
        expect(talosMisureDelMessaggio('a1')?.tokensPerSecond).toBe(9.7)
    })

    it('LEGAME-02 AL CONTRARIO: un fornitore a CHIAVE non registra niente, e la risposta resta senza riga', () => {
        talosAggiornaMisureDeiMessaggi([])
        talosAggiornaMisureDeiMessaggi([utente])
        // Nessuna registrazione: solo l'adattatore locale misura.
        talosAggiornaMisureDeiMessaggi([utente, risposta])
        expect(talosMisureDelMessaggio('a1')).toBeNull()
    })

    it('LEGAME-03 AL CONTRARIO: una misura rimasta indietro NON finisce sulla risposta successiva', () => {
        talosAggiornaMisureDeiMessaggi([])
        talosRegistraMisuraLocale(misuraFinta(Date.now()))
        talosAggiornaMisureDeiMessaggi([utente, risposta])
        expect(talosMisureDelMessaggio('a1')).not.toBeNull()
        const dopo = [utente, risposta, { id: 'u2', role: 'user' }, { id: 'a2', role: 'assistant' }]
        talosAggiornaMisureDeiMessaggi(dopo)
        expect(talosMisureDelMessaggio('a2')).toBeNull()
    })

    it('LEGAME-04 AL CONTRARIO: aprire una chat già piena non regala le misure all ultimo messaggio di ieri', () => {
        talosRegistraMisuraLocale(misuraFinta(Date.now()))
        // Primo sguardo su una conversazione con storia: si osserva e basta.
        talosAggiornaMisureDeiMessaggi([utente, risposta])
        expect(talosMisureDelMessaggio('a1')).toBeNull()
    })

    it('LEGAME-05 un messaggio dell UTENTE non consuma niente: la misura resta per la risposta', () => {
        talosAggiornaMisureDeiMessaggi([])
        talosRegistraMisuraLocale(misuraFinta(Date.now()))
        talosAggiornaMisureDeiMessaggi([utente])
        talosAggiornaMisureDeiMessaggi([utente, risposta])
        expect(talosMisureDelMessaggio('a1')).not.toBeNull()
    })
})
