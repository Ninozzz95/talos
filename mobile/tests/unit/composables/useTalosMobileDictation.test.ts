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
        expect(dictation.status.value).toBe('listening')
        base = 'MUTATED AFTER START' // base must be captured at start time
        events().onPartial('hello')
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
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        events().onError('Speech service unavailable.')
        expect(dictation.status.value).toBe('error')
        expect(dictation.error.value).toBe('Speech service unavailable.')
    })

    it('natural end (native timeout) returns to idle silently', async () => {
        const { engine, events } = engineStub()
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine })
        await flush()
        await dictation.toggle()
        events().onEnd()
        expect(dictation.status.value).toBe('idle')
        expect(dictation.error.value).toBeNull()
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
            start: vi.fn(async (events) => { events.onError('Plugin not registered.') }),
        })
        const dictation = useTalosMobileDictation({ base: () => '', onTranscript: vi.fn(), engine, native: true })
        await flush()
        await dictation.toggle()
        expect(engine.start).toHaveBeenCalled()
        expect(dictation.error.value).toBe('Plugin not registered.')
    })
})
