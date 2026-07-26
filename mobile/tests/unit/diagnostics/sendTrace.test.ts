import { describe, expect, it, vi } from 'vitest'
import { createTalosTraceRecorder } from '@/lib/diagnostics/sendTrace'

/**
 * Owner 2026-07-26: "aggiungi le strumentazioni di timing dietro il checkbox di
 * debug nella sezione Doctor … fa in modo che lo possa copiare bene e darti un
 * JSON o comunque tutti i dati con un click".
 *
 * Capture is kept apart from serialisation on purpose: what happened and when is
 * the same fact whatever an export format decides to call it, and the owner is
 * measuring a real device with a stopwatch in the other hand — the numbers have
 * to be right before they are pretty.
 */
function clockFrom(values: number[]): () => number {
    let index = 0
    return () => values[Math.min(index++, values.length - 1)]!
}

describe('recording where a send spends its time', () => {
    it('costs nothing at all while the switch is off', () => {
        const now = vi.fn(() => 0)
        const recorder = createTalosTraceRecorder({ enabled: () => false, now })

        const send = recorder.begin({ provider: 'deepseek', model: 'deepseek-chat' })
        send.round().firstChunk()
        send.finish('ok')

        // Not merely empty output: the clock is never even read. Debug must not
        // be paid for by people who left it off.
        expect(now).not.toHaveBeenCalled()
        expect(recorder.sends()).toEqual([])
    })

    it('times the whole send, each round, and the wait for the first token', () => {
        const recorder = createTalosTraceRecorder({
            enabled: () => true,
            now: clockFrom([1_000, 1_050, 1_400, 1_900, 2_600]),
        })

        const send = recorder.begin({ provider: 'gemini', model: 'gemini-live' })
        const round = send.round()          // 1_050
        round.firstChunk()                  // 1_400
        round.finish()                      // 1_900
        send.finish('ok')                   // 2_600

        const [trace] = recorder.sends()
        expect(trace!.provider).toBe('gemini')
        expect(trace!.model).toBe('gemini-live')
        expect(trace!.durationMs).toBe(1_600)
        expect(trace!.rounds[0]!.durationMs).toBe(850)
        // The number that actually explains "it feels slow".
        expect(trace!.rounds[0]!.timeToFirstChunkMs).toBe(350)
    })

    it('leaves the first-token wait UNKNOWN rather than guessing', () => {
        // A round that only calls tools never speaks. Reporting 0 there would
        // put a fictional best-case in the middle of a latency report.
        const recorder = createTalosTraceRecorder({
            enabled: () => true,
            now: clockFrom([0, 10, 200, 300]),
        })
        const send = recorder.begin({ provider: 'openai', model: 'gpt-5' })
        send.round().finish()
        send.finish('ok')

        expect(recorder.sends()[0]!.rounds[0]!.timeToFirstChunkMs).toBeNull()
    })

    it('times each tool call, and says which ones overlapped', () => {
        // The whole point of the speed work: if four calls run inside one round
        // and the round is barely longer than the slowest call, the concurrency
        // is working. If the round is the SUM of them, it is not.
        const recorder = createTalosTraceRecorder({
            enabled: () => true,
            now: clockFrom([0, 0, 0, 0, 900, 1_000, 1_100, 1_200]),
        })
        const send = recorder.begin({ provider: 'anthropic', model: 'claude' })
        const round = send.round()
        const first = round.tool('web_search')
        const second = round.tool('web_read')
        first.finish(true)
        second.finish(false)
        round.finish()
        send.finish('ok')

        const [trace] = recorder.sends()
        const tools = trace!.rounds[0]!.tools
        expect(tools.map((tool) => tool.name)).toEqual(['web_search', 'web_read'])
        expect(tools[0]!.ok).toBe(true)
        expect(tools[1]!.ok).toBe(false)
        expect(tools[0]!.durationMs).toBe(900)
        // Both were in flight at once: the second started before the first ended.
        expect(trace!.rounds[0]!.parallel).toBe(true)
    })

    it('calls a round sequential when nothing ever overlapped', () => {
        // The diagnosis the owner needs: his provider asking one tool per turn
        // means the concurrency has nothing to work with.
        const recorder = createTalosTraceRecorder({
            enabled: () => true,
            now: clockFrom([0, 0, 0, 100, 100, 200, 300]),
        })
        const send = recorder.begin({ provider: 'deepseek', model: 'deepseek-chat' })
        const round = send.round()
        const first = round.tool('web_search')
        first.finish(true)
        const second = round.tool('web_search')
        second.finish(true)
        round.finish()
        send.finish('ok')

        expect(recorder.sends()[0]!.rounds[0]!.parallel).toBe(false)
    })

    it('keeps a send that failed, and says so', () => {
        const recorder = createTalosTraceRecorder({ enabled: () => true, now: clockFrom([0, 500]) })
        recorder.begin({ provider: 'ollama', model: 'llama' }).finish('error')
        expect(recorder.sends()[0]!.outcome).toBe('error')
    })

    it('remembers only the recent past, so it cannot grow forever', () => {
        const recorder = createTalosTraceRecorder({
            enabled: () => true,
            now: () => 0,
            keep: 3,
        })
        for (let index = 0; index < 5; index += 1) {
            recorder.begin({ provider: 'openai', model: `m${index}` }).finish('ok')
        }
        // Newest first: a diagnostics screen shows the run you just did.
        expect(recorder.sends().map((trace) => trace.model)).toEqual(['m4', 'm3', 'm2'])
    })

    it('flags a send that spanned a device sleep, instead of reporting a lie', () => {
        // Research 2026-07-26: on Android `performance.now()` rides
        // CLOCK_MONOTONIC, which does NOT advance while the device is
        // suspended, and `Date.now()` breaks the other way when the system
        // clock is corrected. The owner leaves the app WHILE it generates, so
        // this is his case, not a corner one: 40 real seconds can be reported
        // as 3. Two clocks that disagree mean the sample cannot be trusted, and
        // saying so is worth more than a confident wrong number.
        const recorder = createTalosTraceRecorder({
            enabled: () => true,
            now: clockFrom([0, 3_000]),
            wallNow: clockFrom([1_000_000, 1_043_000]),
        })
        recorder.begin({ provider: 'openai', model: 'gpt-5' }).finish('ok')
        expect(recorder.sends()[0]!.clockSuspect).toBe(true)
    })

    it('does not cry wolf when the two clocks agree', () => {
        const recorder = createTalosTraceRecorder({
            enabled: () => true,
            now: clockFrom([0, 3_000]),
            wallNow: clockFrom([1_000_000, 1_003_040]),
        })
        recorder.begin({ provider: 'openai', model: 'gpt-5' }).finish('ok')
        expect(recorder.sends()[0]!.clockSuspect).toBe(false)
    })

    it('reports the WORK, with the wait at a permission sheet kept apart', () => {
        // SF-critic 2026-07-26: the stopwatch started before the consent gate,
        // so a tool doing 2ms of work behind a sheet the user took a minute
        // over was recorded as a one-minute tool — and the owner would have
        // gone hunting for a slow network.
        const recorder = createTalosTraceRecorder({
            enabled: () => true,
            now: clockFrom([0, 0, 0, 60_100, 60_200]),
        })
        const send = recorder.begin({ provider: 'openai', model: 'gpt-5' })
        const round = send.round()
        round.tool('document_create').finish(true, 60_000)
        send.finish('ok')

        const [tool] = recorder.sends()[0]!.rounds[0]!.tools
        expect(tool!.durationMs).toBe(100)
        expect(tool!.waitedForConsentMs).toBe(60_000)
    })

    it('keeps the CODE of a tool that failed, so the next run is not guesswork', () => {
        // Owner's R37 trace, 2026-07-26: `document_create` failed after sixty
        // seconds of the model writing the document, and the whole thing was
        // regenerated — forty per cent of the wall clock. The trace said
        // `ok: false` and nothing else, so why it failed was unknowable.
        //
        // The CODE only. A failure message can quote a file name or a snippet
        // of what the user asked for, and this payload gets pasted into a chat.
        const recorder = createTalosTraceRecorder({ enabled: () => true, now: () => 0 })
        const send = recorder.begin({ provider: 'deepseek', model: 'deepseek-v4-flash' })
        const round = send.round()
        round.tool('document_create').finish(false, 0, 'TALOS_DOCUMENT_VERIFY_FAILED')
        send.finish('ok')

        expect(recorder.sends()[0]!.rounds[0]!.tools[0]!.errorCode)
            .toBe('TALOS_DOCUMENT_VERIFY_FAILED')
    })

    it('records no code at all when the tool worked', () => {
        const recorder = createTalosTraceRecorder({ enabled: () => true, now: () => 0 })
        const send = recorder.begin({ provider: 'openai', model: 'gpt-5' })
        send.round().tool('web_search').finish(true)
        send.finish('ok')
        expect(recorder.sends()[0]!.rounds[0]!.tools[0]!.errorCode).toBeNull()
    })

    it('never records a prompt, a file name, or a key', () => {
        // A diagnostics export is the most natural way for a secret to leave an
        // app. This recorder is not given anything to leak: the surface takes a
        // tool NAME and nothing else.
        const recorder = createTalosTraceRecorder({ enabled: () => true, now: () => 0 })
        const send = recorder.begin({ provider: 'openai', model: 'gpt-5' })
        send.round().tool('web_search').finish(true)
        send.finish('ok')

        const serialised = JSON.stringify(recorder.sends())
        expect(serialised).not.toMatch(/sk-|tvly-|Bearer/)
        expect(Object.keys(recorder.sends()[0]!.rounds[0]!.tools[0]!).sort())
            .toEqual(['durationMs', 'errorCode', 'name', 'ok', 'startedAtMs', 'waitedForConsentMs'])
    })
})
