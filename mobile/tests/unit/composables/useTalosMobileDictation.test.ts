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

/**
 * N12 (13/10/2026) — il motore locale dà il testo GIUSTO dopo lo stop (Parakeet rilegge tutto il parlato). Prima ogni evento
 * arrivato dopo lo stop veniva scartato, ed era giusto per il riconoscitore di sistema; per un motore che lo dichiara
 * (`attendeIlFinale`) quell'ultimo testo è la ragione per cui esiste.
 */
describe('useTalosMobileDictation — il testo finale dopo lo stop (N12)', () => {
    it('DETT-N12-01: con un motore che attende il finale, il testo arrivato DOPO lo stop sostituisce quello vivo', async () => {
        const { engine, events } = engineStub({ attendeIlFinale: true })
        const onTranscript = vi.fn()
        let campo = 'Nota:'
        const dictation = useTalosMobileDictation({ base: () => campo, onTranscript: (t) => { campo = t; onTranscript(t) }, engine })
        await flush()
        await dictation.toggle()
        events().onPartial('ciao a tutti come state')
        await dictation.toggle()                         // stop
        expect(dictation.status.value).toBe('idle')
        events().onPartial('Ciao a tutti, come state?')  // Parakeet, dopo lo stop
        expect(onTranscript).toHaveBeenLastCalledWith('Nota: Ciao a tutti, come state?')
        // uno solo: un secondo evento in ritardo non riscrive più niente
        events().onPartial('coda in ritardo')
        expect(onTranscript).toHaveBeenLastCalledWith('Nota: Ciao a tutti, come state?')
    })

    it('DETT-N12-02: se nel frattempo la persona ha toccato il testo, il finale NON lo sovrascrive', async () => {
        const { engine, events } = engineStub({ attendeIlFinale: true })
        const onTranscript = vi.fn()
        let campo = ''
        const dictation = useTalosMobileDictation({ base: () => campo, onTranscript: (t) => { campo = t; onTranscript(t) }, engine })
        await flush()
        await dictation.toggle()
        events().onPartial('ciao a tutti')
        await dictation.toggle()
        campo = 'ciao a tutti e grazie'                  // ha scritto a mano
        events().onPartial('Ciao a tutti.')
        expect(onTranscript).toHaveBeenCalledTimes(1)
        expect(campo).toBe('ciao a tutti e grazie')
    })

    it('DETT-N12-03 AL CONTRARIO: col riconoscitore di sistema un evento dopo lo stop resta inerte, come prima', async () => {
        const { engine, events } = engineStub()
        const onTranscript = vi.fn()
        let campo = ''
        const dictation = useTalosMobileDictation({ base: () => campo, onTranscript: (t) => { campo = t; onTranscript(t) }, engine })
        await flush()
        await dictation.toggle()
        events().onPartial('ciao')
        await dictation.toggle()
        events().onPartial('ciao in ritardo')
        expect(onTranscript).toHaveBeenCalledTimes(1)
    })

    it('DETT-N12-04: «invia» aspetta il finale (finisci), ma mai per sempre; «butta via» (cancel) non lo aspetta e non lo applica', async () => {
        let libera: () => void = () => {}
        const { engine, events } = engineStub({ attendeIlFinale: true, stop: vi.fn(() => new Promise<void>((ok) => { libera = ok })) })
        const onTranscript = vi.fn()
        let campo = ''
        const dictation = useTalosMobileDictation({ base: () => campo, onTranscript: (t) => { campo = t; onTranscript(t) }, engine })
        await flush()
        await dictation.toggle()
        events().onPartial('testo vivo')
        let finito = false
        const attesa = dictation.finisci().then(() => { finito = true })
        await flush()
        expect(finito).toBe(false)                       // sta aspettando Parakeet
        events().onPartial('Testo giusto.')
        libera()
        await attesa
        expect(campo).toBe('Testo giusto.')

        // butta via: nessuna attesa, e il finale che arriva dopo non scrive
        await dictation.toggle()
        events().onPartial('altro')
        dictation.cancel()
        events().onPartial('Altro, giusto.')
        expect(campo).toBe('Testo giusto. altro')

        // un motore che non finisce mai non blocca l'invio
        vi.useFakeTimers()
        try {
            const mai = engineStub({ attendeIlFinale: true, stop: vi.fn(() => new Promise<void>(() => {})) })
            const d2 = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine: mai.engine })
            await vi.advanceTimersByTimeAsync(1)
            await d2.toggle()
            mai.events().onPartial('x')
            let uscito = false
            void d2.finisci().then(() => { uscito = true })
            await vi.advanceTimersByTimeAsync(9000)
            expect(uscito).toBe(true)
        } finally { vi.useRealTimers() }
    })
    /**
     * ⛔ DETT-N12-05 — MISURATO sul Pad il 13/10/2026, dal compositore vero: col motore locale la cattura non finisce mai da
     * sola, quindi dopo 15 secondi senza parole nuove scattava il cane da guardia, che la trattava come un GUASTO
     * («Speech stopped responding») e buttava via anche il testo di Parakeet. Per un motore che attende il finale, il
     * silenzio lungo è la fine normale della dettatura: si chiude senza errore e il testo giusto arriva.
     */
    it('DETT-N12-05: col motore locale un silenzio lungo chiude la dettatura SENZA errore, e il testo giusto arriva lo stesso', async () => {
        vi.useFakeTimers()
        try {
            const { engine, events } = engineStub({ attendeIlFinale: true })
            let campo = ''
            const dictation = useTalosMobileDictation({ base: () => campo, onTranscript: (t) => { campo = t }, engine })
            await vi.advanceTimersByTimeAsync(1)
            await dictation.toggle()
            events().onPartial('ho finito di parlare')
            await vi.advanceTimersByTimeAsync(15_100)
            expect(engine.stop).toHaveBeenCalledTimes(1)
            expect(dictation.status.value).toBe('idle')
            expect(dictation.errorCode.value).toBeNull()
            events().onPartial('Ho finito di parlare.')
            expect(campo).toBe('Ho finito di parlare.')

            // AL CONTRARIO: col riconoscitore di sistema lo stesso silenzio resta il guasto di prima
            const s = engineStub()
            const d2 = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine: s.engine })
            await vi.advanceTimersByTimeAsync(1)
            await d2.toggle()
            s.events().onPartial('ciao')
            await vi.advanceTimersByTimeAsync(15_100)
            expect(d2.errorCode.value).toBe('stoppedResponding')
        } finally { vi.useRealTimers() }
    })
    /**
     * DETT-N12-06 — la barra dell'assistente (owner 13/10/2026: «anche nella barra»): chi vuole che il turno lo chiuda il
     * silenzio lo dice al motore (`endOnSilence`); chi non lo dice (chat, Codice) non lo chiede, e resta tutto com'era.
     */
    it('DETT-N12-06: «chiudeAlSilenzio» arriva al motore come endOnSilence; senza, non viene chiesto', async () => {
        const a = engineStub()
        const barra = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine: a.engine, chiudeAlSilenzio: () => true })
        await flush()
        await barra.toggle()
        expect(vi.mocked(a.engine.start).mock.calls[0][1]).toMatchObject({ endOnSilence: true })

        const b = engineStub()
        const chat = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine: b.engine })
        await flush()
        await chat.toggle()
        expect(vi.mocked(b.engine.start).mock.calls[0][1]?.endOnSilence).not.toBe(true)
    })
    /**
     * DETT-N12-07 — owner 13/10/2026: «Via l'attesa di sicurezza». Quando la fine del turno l'ha decisa un motore che
     * attende il finale (il locale: il testo giusto è già scritto), chi sta sopra deve poterlo sapere per mandare subito.
     * Col riconoscitore di sistema resta falso, e la barra tiene la sua attesa.
     */
    it('DETT-N12-07: «chiusaDalMotore» è vero solo quando la fine l ha decisa un motore che attende il finale, dopo parole sentite', async () => {
        const a = engineStub({ attendeIlFinale: true })
        const locale = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine: a.engine, chiudeAlSilenzio: () => true })
        await flush()
        expect(locale.chiusaDalMotore.value).toBe(false)
        await locale.toggle()
        a.events().onPartial('Che ore sono?')
        a.events().onEnd()
        expect(locale.status.value).toBe('idle')
        expect(locale.chiusaDalMotore.value).toBe(true)
        // una dettatura nuova riparte da falso
        await locale.toggle()
        expect(locale.chiusaDalMotore.value).toBe(false)

        const s = engineStub()
        const sistema = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine: s.engine })
        await flush()
        await sistema.toggle()
        s.events().onPartial('che ore sono')
        s.events().onEnd()
        expect(sistema.status.value).toBe('idle')
        expect(sistema.chiusaDalMotore.value).toBe(false)
    })
})
