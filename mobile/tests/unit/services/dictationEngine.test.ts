import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ native: true }))
const plugin = vi.hoisted(() => ({
    available: vi.fn(async () => ({ available: true })),
    checkPermissions: vi.fn(async () => ({ speechRecognition: 'granted' })),
    requestPermissions: vi.fn(async () => ({ speechRecognition: 'granted' })),
    start: vi.fn(async () => ({ matches: [] })),
    stop: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
    removeAllListeners: vi.fn(async () => {}),
    getPluginVersion: vi.fn(async () => ({ version: '8.1.7' })),
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => platform.native,
        // ⛔ Questi casi coprono la RETE (il plugin di terzi): il riconoscitore
        // di casa si dichiara assente di proposito, o non si proverebbe mai
        // piu' la strada su cui si scende quando il nostro non c'e'.
        isPluginAvailable: (nome: string) => nome !== 'TalosDictation',
    },
    registerPlugin: () => ({}),
}))
vi.mock('@capgo/capacitor-speech-recognition', () => ({ SpeechRecognition: plugin }))

import { talosDictationEngine, type TalosDictationEvents } from '@/services/dictation'

const events: TalosDictationEvents = {
    onPartial: vi.fn(),
    onEnd: vi.fn(),
    onError: vi.fn(),
}

beforeEach(() => {
    platform.native = true
    plugin.start.mockClear()
    plugin.addListener.mockClear()
    vi.unstubAllGlobals()
})

describe('dictation engine language adapter', () => {
    it('DICT-ADAPTER-01 passes an explicit locale to the pinned native plugin', async () => {
        const engine = talosDictationEngine()

        await engine.start(events, { language: 'it-IT' })

        expect(plugin.start).toHaveBeenCalledWith(expect.objectContaining({
            partialResults: true,
            popup: false,
            language: 'it-IT',
        }))
    })

    it('DICT-ADAPTER-02 applies an explicit locale to the web recognizer', async () => {
        platform.native = false
        const instances: Array<{ lang: string }> = []
        class Recognition {
            lang = ''
            continuous = false
            interimResults = false
            onresult = null
            onerror = null
            onend = null
            constructor() { instances.push(this) }
            start() {}
            stop() {}
        }
        vi.stubGlobal('SpeechRecognition', Recognition)

        await talosDictationEngine().start(events, { language: 'it-IT' })
        await talosDictationEngine().start(events)

        expect(instances[0]?.lang).toBe('it-IT')
        expect(instances[1]?.lang).toBe(navigator.language || 'en-US')
    })
})

/**
 * ⛔ DICT-N12-01 — regressione trovata il 13/10/2026 rileggendo la barra dell'assistente. Il motore locale (Parakeet) era
 * messo davanti al riconoscitore di sistema per CHIUNQUE chiamasse `talosDictationEngine()`: anche la barra, che usa lo
 * stesso composable e chiude il turno quando il riconoscitore di sistema finisce da solo. Col motore locale la cattura non
 * finisce da sola, quindi con il modello installato la barra restava in ascolto fino al cane da guardia. Il motore locale è
 * una scelta ESPLICITA di chi sa aspettare il testo finale (chat e Codice); chi non la fa ha il motore di sempre.
 */
describe('il motore locale è una scelta esplicita (N12)', () => {
    it('DICT-N12-01: senza chiederlo il motore è quello di sistema, com era; chiedendolo ci si mette davanti il locale', () => {
        const diSempre = talosDictationEngine()
        expect('attendeIlFinale' in diSempre).toBe(false)
        const colLocale = talosDictationEngine({ locale: true })
        expect('attendeIlFinale' in colLocale).toBe(true)
        // finché non parte una dettatura col modello pronto, anche quello resta un motore che non attende niente
        expect(colLocale.attendeIlFinale).toBe(false)
    })
})
