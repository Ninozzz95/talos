import { describe, expect, it, vi } from 'vitest'
import { useTalosMobileDictation } from '@/composables/useTalosMobileDictation'
import type { TalosDictationEngine, TalosDictationEvents } from '@/services/dictation'

// F2-T5 — dictation composable: live partials compose onto the draft base,
// permission and availability are honest, stop/end always return to idle.
function engineStub(overrides: Partial<TalosDictationEngine> = {}): {
    engine: TalosDictationEngine
    events: () => TalosDictationEvents
} {
    let captured: TalosDictationEvents | null = null
    const engine: TalosDictationEngine = {
        supported: vi.fn(async () => true),
        requestPermission: vi.fn(async () => true),
        start: vi.fn(async (events: TalosDictationEvents) => { captured = events }),
        stop: vi.fn(async () => {}),
        ...overrides,
    }
    return { engine, events: () => captured! }
}

function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useTalosMobileDictation (F2-T5)', () => {
    it('reports unsupported honestly and refuses to start', async () => {
        const { engine } = engineStub({ supported: vi.fn(async () => false) })
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        expect(dictation.supported.value).toBe(false)
        await dictation.toggle()
        expect(engine.start).not.toHaveBeenCalled()
        expect(dictation.status.value).toBe('idle')
    })

    it('starts listening and composes partials onto the captured draft base', async () => {
        const { engine, events } = engineStub()
        const onTranscript = vi.fn()
        let base = 'Existing note'
        const dictation = useTalosMobileDictation({ base: () => base, onTranscript, engine })
        await flush()
        await dictation.toggle()
        // F5-#29: tap gives IMMEDIATE feedback; real listening is confirmed
        // by the engine (started signal or first partial), never assumed.
        expect(dictation.status.value).toBe('starting')
        base = 'MUTATED AFTER START' // base must be captured at start time
        events().onPartial('hello')
        expect(dictation.status.value).toBe('listening')
        events().onPartial('hello world')
        expect(onTranscript).toHaveBeenNthCalledWith(1, 'Existing note hello')
        expect(onTranscript).toHaveBeenNthCalledWith(2, 'Existing note hello world')
    })

    it('uses the bare partial when the draft base is empty', async () => {
        const { engine, events } = engineStub()
        const onTranscript = vi.fn()
        const dictation = useTalosMobileDictation({ base: () => '  ', onTranscript, engine })
        await flush()
        await dictation.toggle()
        events().onPartial('ciao')
        expect(onTranscript).toHaveBeenCalledWith('ciao')
    })

    it('toggle while listening stops the engine and returns to idle', async () => {
        const { engine } = engineStub()
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        await dictation.toggle()
        expect(engine.stop).toHaveBeenCalledOnce()
        expect(dictation.status.value).toBe('idle')
    })

    it('permission denied is an honest error and never starts the engine', async () => {
        const { engine } = engineStub({ requestPermission: vi.fn(async () => false) })
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        expect(engine.start).not.toHaveBeenCalled()
        expect(dictation.status.value).toBe('error')
        expect(dictation.error.value).toMatch(/microphone permission/i)
    })

    it('engine error while listening surfaces the message and stops', async () => {
        const { engine, events } = engineStub()
        const errorMessage = vi.fn((code: string) => ({
            recognitionFailed: 'Riconoscimento vocale non riuscito. Riprova.',
        })[code] ?? code)
        const dictation = useTalosMobileDictation({
            base: () => '',
            onTranscript: vi.fn(),
            engine,
            errorMessage,
        })
        await flush()
        await dictation.toggle()
        events().onError('recognitionFailed')
        expect(dictation.status.value).toBe('error')
        expect(dictation.error.value).toBe('Riconoscimento vocale non riuscito. Riprova.')
        expect(errorMessage).toHaveBeenCalledWith('recognitionFailed')
    })

    it('DICT-I18N-01 passes the selected language to each new session', async () => {
        const { engine } = engineStub()
        const dictation = useTalosMobileDictation({
            base: () => '',
            onTranscript: vi.fn(),
            engine,
            language: () => 'it-IT',
            autoLanguage: () => false,
        })
        await flush()

        await dictation.toggle()

        expect(engine.start).toHaveBeenCalledWith(
            expect.any(Object),
            // ⛔ La lingua NON viaggia piu' da sola: accanto va sempre se il
            // rilevamento e' acceso, o il nativo non saprebbe distinguere
            // «parlo italiano» da «decidilo tu ascoltando».
            { language: 'it-IT', autoLanguage: false, allowedLanguages: [] },
        )
    })

    it('natural end AFTER speech returns to idle silently', async () => {
        const { engine, events } = engineStub()
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        events().onPartial('qualcosa')
        events().onEnd()
        expect(dictation.status.value).toBe('idle')
        expect(dictation.error.value).toBeNull()
    })
})

// F5-#29 — owner device report: tap did NOTHING (no recording, no error).
// Plugin source truth: with partialResults the native call resolves BEFORE
// listening, and runtime recognizer errors are rejected on an already-released
// call (lost) while stopListening() emits no event. The composable therefore
// owns liveness: every tap path must end in a user-visible state.
describe('tap-path liveness (F5-#29)', () => {
    it('confirms listening on the engine started signal', async () => {
        const { engine, events } = engineStub()
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        expect(dictation.status.value).toBe('starting')
        events().onStart?.()
        expect(dictation.status.value).toBe('listening')
    })

    it('a start that never hears anything times out into a visible error', async () => {
        vi.useFakeTimers()
        try {
            const { engine } = engineStub()
            const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
            await vi.runOnlyPendingTimersAsync()
            await dictation.toggle()
            expect(dictation.status.value).toBe('starting')
            await vi.advanceTimersByTimeAsync(8100)
            expect(engine.stop).toHaveBeenCalled()
            expect(dictation.status.value).toBe('error')
            expect(dictation.error.value).toMatch(/did not hear|non risponde|speech/i)
        } finally {
            vi.useRealTimers()
        }
    })

    it('an end without ANY recognized speech reports it instead of going silent', async () => {
        const { engine, events } = engineStub()
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        events().onStart?.()
        events().onEnd()
        expect(dictation.status.value).toBe('error')
        expect(dictation.error.value).toMatch(/no speech|didn't hear|did not hear/i)
    })

    it('SF5-1 BLOCKER characterization: stop returns to idle even if the native stop() never settles', async () => {
        // Real plugin behavior (SpeechRecognition.java stop()): the call is
        // never resolved — the UI must not deadlock on it.
        const neverSettles = new Promise<void>(() => {})
        const { engine, events } = engineStub({ stop: vi.fn(() => neverSettles) })
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        events().onStart?.()
        expect(dictation.status.value).toBe('listening')
        await dictation.toggle()
        expect(dictation.status.value).toBe('idle')
    })

    it('SF5-2: recognizer death during listening surfaces after the inactivity window', async () => {
        vi.useFakeTimers()
        try {
            const { engine, events } = engineStub()
            const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
            await vi.runOnlyPendingTimersAsync()
            await dictation.toggle()
            events().onStart?.()
            events().onPartial('ciao')
            expect(dictation.status.value).toBe('listening')
            // No partial, no end, no error for the whole inactivity window —
            // the silent-death plugin behavior.
            await vi.advanceTimersByTimeAsync(15_100)
            expect(dictation.status.value).toBe('error')
            expect(dictation.error.value).toMatch(/stopped responding|interrotto|no longer/i)
        } finally {
            vi.useRealTimers()
        }
    })

    it('SF5-3: cancel() silently ends the session for send-time cleanup', async () => {
        const { engine, events } = engineStub()
        const onTranscript = vi.fn()
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript, engine })
        await flush()
        await dictation.toggle()
        events().onStart?.()
        dictation.cancel()
        expect(dictation.status.value).toBe('idle')
        expect(dictation.error.value).toBeNull()
        // Late partials from the dying session must NOT resurrect sent text.
        events().onPartial('testo fantasma')
        expect(onTranscript).not.toHaveBeenCalled()
    })

    /*
     * ⛔⛔⛔ CHI SMETTE RESTITUISCE IL MICROFONO, anche da fermo.
     *
     * MISURATO sul Pad il 2026-08-14, in logcat, con la barra aperta e ferma:
     *
     *     16:42:56.900  errore:NO_MATCH            ← lo stato diventa `error`
     *     16:42:57.267  barra: scaduta, smetto     ← e qui si chiama cancel()
     *     16:43:40.160  nessuno ha preso il microfono: me lo riprendo
     *
     * Quarantatré secondi fra «smetto» e il microfono che torna alla parola di
     * attivazione — e a restituirlo è stata la rete di sicurezza del servizio,
     * non noi. In mezzo «hey jarvis» era sordo con la barra a schermo: il
     * difetto che l'owner ha descritto parola per parola.
     *
     * Causa: `cancel()` usciva quando lo stato non era `listening`, e `error` è
     * ESATTAMENTE lo stato in cui la barra si trova dopo un silenzio. Il motore
     * era fermo davvero; il microfono no.
     *
     * ⛔ Questo test morde togliendo la chiamata dal ramo di uscita: senza,
     * `engine.stop` non viene chiamato e il microfono resta di nessuno.
     */
    it('⛔ cancel() restituisce il microfono ANCHE da stato `error`', async () => {
        const { engine, events } = engineStub()
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        events().onStart?.()
        // Il silenzio: è il caso più comune di tutti, non un caso limite.
        events().onError?.({ code: 'noSpeech' })
        expect(dictation.status.value).toBe('error')

        engine.stop.mockClear()
        dictation.cancel()
        expect(engine.stop).toHaveBeenCalled()
    })

    it('F5.2 waveform level: spikes on incoming speech, decays, zero when idle', async () => {
        vi.useFakeTimers()
        try {
            const { engine, events } = engineStub()
            const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
            await vi.runOnlyPendingTimersAsync()
            expect(dictation.level.value).toBe(0)
            await dictation.toggle()
            events().onStart?.()
            events().onPartial('ciao')
            const afterSpeech = dictation.level.value
            expect(afterSpeech).toBeGreaterThan(0.3)
            // Silence: the level decays but keeps a listening floor above zero.
            await vi.advanceTimersByTimeAsync(2000)
            expect(dictation.level.value).toBeLessThan(afterSpeech)
            expect(dictation.level.value).toBeGreaterThan(0)
            // Stop: the level returns to zero.
            await dictation.toggle()
            expect(dictation.level.value).toBe(0)
        } finally {
            vi.useRealTimers()
        }
    })

    it('tapping again while starting cancels cleanly to idle', async () => {
        const { engine } = engineStub()
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        expect(dictation.status.value).toBe('starting')
        await dictation.toggle()
        expect(engine.stop).toHaveBeenCalledOnce()
        expect(dictation.status.value).toBe('idle')
    })
})

// F4-#18 — inverted pattern: on NATIVE the mic is always visible; failures are
// reported honestly at tap instead of hiding the button (undiagnosable).
describe('native visibility inversion (F4-#18)', () => {
    it('is visible on native even when the availability probe says no', async () => {
        const { engine } = engineStub({ supported: vi.fn(async () => false) })
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine, native: true })
        await flush()
        expect(dictation.visible.value).toBe(true)
    })

    it('stays hidden on web when the API is genuinely absent', async () => {
        const { engine } = engineStub({ supported: vi.fn(async () => false) })
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine, native: false })
        await flush()
        expect(dictation.visible.value).toBe(false)
    })

    it('on native, tap ATTEMPTS the engine even if the probe failed — errors surface honestly', async () => {
        const { engine } = engineStub({
            supported: vi.fn(async () => false),
            start: vi.fn(async (events) => { events.onError('recognitionFailed') }),
        })
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine, native: true })
        await flush()
        await dictation.toggle()
        expect(engine.start).toHaveBeenCalled()
        expect(dictation.error.value).toMatch(/recognition|speech/i)
    })
})
