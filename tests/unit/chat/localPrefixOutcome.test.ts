import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ LE QUATTRO USCITE MUTE, provate una per una fino alla misura.
 *
 * ## Il difetto
 *
 * `congelaSePossibile` aveva quattro `return` senza una parola — già congelato,
 * forma ignota, verdetto negativo, `catch` vuoto — più una quinta via muta: il
 * risultato di `talosThawPrefix` veniva scartato. Sul Pad, il 2026-09-10,
 * `LFM2.5-2.6B-Q4_0` usciva ogni volta dalla terza (`!shape`): **31 s** alla
 * prima parola e **0 token su 2.847** riusati, contro **3,1 s** e **2.933 su
 * 3.257** di gemma3 — e non esisteva **nessun posto** dove accorgersene.
 *
 * ## ⛔ Perché questi test non sono «il campo esiste»
 *
 * Ognuno accende UNA causa e pretende UN valore diverso dagli altri, e alla
 * fine PREF-11 confronta gli esiti fra loro: se una qualunque via tornasse muta
 * — o se tutte tornassero lo stesso codice «per non rompere la UI» — quel
 * confronto cade. In questo progetto un campo che esisteva ed era sempre
 * `false` è quasi diventato la prova che una cache funzionava: qui la prova è
 * il CONTRASTO, non la presenza.
 */

const localEngine = vi.hoisted(() => {
    class TalosLocalEngineOpenError extends Error {}
    class TalosLocalEngineGenerationError extends Error {}
    return {
        TalosLocalEngineGenerationError,
        TalosLocalEngineOpenError,
        talosLocalInstalledModels: vi.fn(),
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
        talosFreezePrefix: vi.fn(),
        talosThawPrefix: vi.fn(),
        talosEvictPrefixes: vi.fn(async () => ({ removed: 0, bytes: 0 })),
    }
})
vi.mock('@/services/localEngine', () => localEngine)

const deviceCapacity = vi.hoisted(() => ({ talosMeasureDevice: vi.fn() }))
vi.mock('@/services/deviceCapacity', () => deviceCapacity)

vi.mock('@capacitor/core', () => ({ Capacitor: { Plugins: {} } }))

const { localAdapter, talosScordaStatoPrefissi } = await import('@/lib/chat/providers/localAdapter')
const { talosRitiraMisuraLocale, talosScordaMisureLocali } = await import(
    '@/lib/chat/providers/localTrace'
)

/** Un tablet con spazio e memoria da vendere: il tetto del contesto non morde. */
const PAD_LARGO = {
    totalRamBytes: 16_000_000_000,
    availableRamBytes: 10_000_000_000,
    lowMemoryThresholdBytes: 500_000_000,
    freeStorageBytes: 500_000_000_000,
    memoryBandwidthBytesPerSecond: 50_000_000_000,
    thermal: 'none' as const,
    abiSupported: true,
}

/** Una forma da transformer normale: 28 × 8 × 128 × 2 × 2 = 114.688 B/token. */
const FORMA = {
    weightBytes: 1_800_000_000,
    layers: 28,
    kvHeads: 8,
    headDim: 128,
    trainedContext: 32_768,
    kvBytesPerElement: 2,
}

const MODELLO = '/models/qwen.gguf'

function richiesta(conSistema: boolean) {
    return {
        model: {
            id: MODELLO, provider: 'local', displayName: 'Qwen',
            chatCompatibility: 'unknown', supportedParameters: [],
            inputModalities: ['text'], outputModalities: ['text'],
        },
        // ⛔ Il sistema è la condizione perché un prefisso esista: senza, non
        // c'è niente di fisso da preparare, ed è una delle undici uscite.
        ...(conSistema ? { system: 'Sei TALOS, un assistente sul telefono.' } : {}),
        turns: [{ role: 'user', content: 'Rispondi con PRONTO.' }],
        effort: 'low',
        thinking: false,
    }
}

/** Prepara il motore finto per un turno. Torna niente: si guarda la misura. */
function motore(opzioni: {
    forma?: typeof FORMA | null
    promptTokens?: number
    rilettiTokens?: number
}): void {
    localEngine.talosLocalEngineStatus.mockResolvedValue({
        available: true,
        backends: 'CPU',
        loadedPath: null,
        shape: opzioni.forma === undefined ? FORMA : opzioni.forma,
        kvCacheType: 'f16',
        engineBuild: 'llama-b1234',
    })
    localEngine.talosLocalEngineChatPlan.mockResolvedValue({
        prompt: 'PROMPT',
        promptTokens: opzioni.promptTokens ?? 3104,
        // Largo apposta: un contesto stretto farebbe riaprire il modello, che è
        // un'altra storia e non quella che questi test raccontano.
        contextTokens: 32_768,
    })
    localEngine.talosThawPrefix.mockResolvedValue({
        tokens: opzioni.rilettiTokens ?? 0,
        ms: 4,
    })
}

async function unTurno(conSistema = true): Promise<string | undefined> {
    await localAdapter.streamComplete(
        richiesta(conSistema) as never,
        { apiKey: null, endpoint: null },
        { onChunk: () => {} } as never,
    )
    // ⛔ La scrittura parte con `void` DOPO la consegna: senza questa attesa il
    // turno successivo leggerebbe uno stato che non è ancora stato scritto, e
    // il test proverebbe l'ordine sbagliato.
    await new Promise((risolvi) => { setTimeout(risolvi, 0) })
    return talosRitiraMisuraLocale()?.prefixOutcome
}

describe('PREFISSO — perché l inizio della richiesta era pronto, o perché no', () => {
    beforeEach(() => {
        // ⛔ I conteggi si azzerano, le implementazioni no (`clear`, non
        // `reset`): senza, «quante volte hai scritto» sommerebbe i turni dei
        // test precedenti e la prova sul riprovare direbbe un numero inventato.
        vi.clearAllMocks()
        talosScordaMisureLocali()
        talosScordaStatoPrefissi()
        localEngine.talosLocalInstalledModels.mockResolvedValue({
            models: [{ path: MODELLO, bytes: 1_800_000_000, modifiedAt: 1_757_000_000_000 }],
        })
        localEngine.talosLocalEngineOpenWithFallback.mockResolvedValue({ contextTokens: 32_768 })
        localEngine.talosLocalEngineTemplateCapabilities.mockResolvedValue({
            supportsToolCalls: false, supportsSystemRole: true,
        })
        localEngine.talosLocalEngineTimings.mockResolvedValue(null)
        localEngine.talosFreezePrefix.mockResolvedValue({ bytes: 355_991_552, ms: 900 })
        localEngine.talosEvictPrefixes.mockResolvedValue({ removed: 0, bytes: 0 })
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                onDelta('PRONTO')
                return { text: 'PRONTO', tokens: 11 }
            },
        )
        deviceCapacity.talosMeasureDevice.mockResolvedValue(PAD_LARGO)
        motore({})
    })

    it('PREF-01 senza niente di fisso da preparare lo dice, invece di tacere', async () => {
        expect(await unTurno(false)).toBe('unavailable')
    })

    /**
     * ⛔ IL CASO BUONO SI DICE. Owner, esplicito: «già congelato è la
     * condizione BUONA: dillo, non tacerlo». E la prova che non è una parola
     * gratis: se il file c'è ed è stato riletto, NON si riscrive un gigabyte.
     */
    it('PREF-02 riletto davvero ⇒ lo dice, e non riscrive il file', async () => {
        motore({ rilettiTokens: 2933 })
        expect(await unTurno()).toBe('reused')
        expect(localEngine.talosFreezePrefix).not.toHaveBeenCalled()
    })

    /**
     * ⛔ È LA VIA CHE OGGI FERMA LFM2 — la terza delle quattro mute.
     * Misurato sul Pad il 2026-09-10: 31 s alla prima parola, 0 su 2.847.
     */
    it('PREF-03 forma del modello ignota ⇒ lo dice (è il muro di LFM2)', async () => {
        motore({ forma: null })
        expect(await unTurno()).toBe('unknown-shape')
        expect(localEngine.talosFreezePrefix).not.toHaveBeenCalled()
    })

    it('PREF-04 prefisso troppo corto ⇒ il motivo esce, non resta nel verdetto', async () => {
        motore({ promptTokens: 120 })
        expect(await unTurno()).toBe('too-short')
    })

    it('PREF-05 spazio insufficiente ⇒ il motivo esce, ed è un ALTRO motivo', async () => {
        // 3104 × 114.688 = 355.991.552 byte, più i 2 GB di margine: non ci sta.
        deviceCapacity.talosMeasureDevice.mockResolvedValue({
            ...PAD_LARGO, freeStorageBytes: 2_000_000_000,
        })
        expect(await unTurno()).toBe('no-space')
    })

    it('PREF-06 quando si può, lo dice E scrive — e la frase parla del turno DOPO', async () => {
        expect(await unTurno()).toBe('preparing')
        expect(localEngine.talosFreezePrefix).toHaveBeenCalledTimes(1)
    })

    /**
     * ⛔ Il file c'è, ma stavolta non è servito: è un'informazione, non un
     * pareggio con «non c'è». Distinguerli è tutto il punto — «CIECO non è
     * FALLITO».
     */
    it('PREF-07 scritto ieri e non riusato oggi ⇒ non lo confonde con «assente»', async () => {
        expect(await unTurno()).toBe('preparing')
        motore({})
        expect(await unTurno()).toBe('not-reused')
    })

    /**
     * ⛔ IL RITARDO, DICHIARATO. La scrittura avviene per costruzione dopo la
     * risposta, quindi il suo esito compare al messaggio successivo — e la
     * frase a schermo porta «la volta scorsa» dentro di sé.
     */
    it('PREF-08 il motore non ha scritto niente ⇒ il turno dopo lo dice, e si riprova', async () => {
        localEngine.talosFreezePrefix.mockResolvedValue({ bytes: 0, ms: 3 })
        expect(await unTurno()).toBe('preparing')
        motore({})
        expect(await unTurno()).toBe('engine-refused')
        // ⛔ Riprovare è il comportamento di prima e resta: un disco che si
        // libera deve poter guarire da solo. La differenza è che ora si vede.
        expect(localEngine.talosFreezePrefix).toHaveBeenCalledTimes(2)
    })

    /**
     * ⛔ IL `catch` VUOTO, che era il peggiore: rendeva un GUASTO
     * indistinguibile da una SCELTA. E resta vero che non fa cadere la
     * risposta — `unTurno()` sopra non solleva.
     */
    it('PREF-09 salvataggio esploso ⇒ è un esito, non un silenzio, e la risposta regge', async () => {
        localEngine.talosFreezePrefix.mockRejectedValue(new Error('disco staccato'))
        expect(await unTurno()).toBe('preparing')
        motore({})
        expect(await unTurno()).toBe('save-failed')
    })

    it('PREF-10 anche il CONTROLLO che fallisce è un esito', async () => {
        localEngine.talosLocalEngineGenerate.mockImplementation(
            async (_prompt: string, onDelta: (delta: string) => void) => {
                // Si rompe DOPO la generazione: prima serve ancora a misurare
                // il dispositivo per il tetto del contesto.
                deviceCapacity.talosMeasureDevice.mockRejectedValue(new Error('niente misura'))
                onDelta('PRONTO')
                return { text: 'PRONTO', tokens: 11 }
            },
        )
        expect(await unTurno()).toBe('check-failed')
    })

    /**
     * ⛔⛔ IL TEST CHE MORDE: SETTE cause, SETTE esiti diversi.
     *
     * Se una qualunque via tornasse muta — o se qualcuno «semplificasse» il
     * verdetto a un sì/no — l'insieme si restringe e questa riga diventa rossa.
     * È la stessa prova che ho fatto girare al contrario a mano prima di
     * consegnare: rimessa `return 'unavailable'` in cima a `decidiPrefisso`,
     * qui la dimensione scende da 7 a 1 e il test cade.
     */
    it('PREF-11 sette cause diverse danno sette esiti DIVERSI', async () => {
        const visti: string[] = []

        visti.push((await unTurno(false)) ?? 'MUTO')

        talosScordaStatoPrefissi()
        motore({ rilettiTokens: 2933 })
        visti.push((await unTurno()) ?? 'MUTO')

        talosScordaStatoPrefissi()
        motore({ forma: null })
        visti.push((await unTurno()) ?? 'MUTO')

        talosScordaStatoPrefissi()
        motore({ promptTokens: 120 })
        visti.push((await unTurno()) ?? 'MUTO')

        talosScordaStatoPrefissi()
        motore({})
        deviceCapacity.talosMeasureDevice.mockResolvedValue({
            ...PAD_LARGO, freeStorageBytes: 2_000_000_000,
        })
        visti.push((await unTurno()) ?? 'MUTO')

        talosScordaStatoPrefissi()
        deviceCapacity.talosMeasureDevice.mockResolvedValue(PAD_LARGO)
        motore({})
        visti.push((await unTurno()) ?? 'MUTO')
        // Secondo giro sullo stesso file: c'è, ma oggi non è servito.
        motore({})
        visti.push((await unTurno()) ?? 'MUTO')

        expect(visti).not.toContain('MUTO')
        expect(new Set(visti).size).toBe(7)
    })
})
