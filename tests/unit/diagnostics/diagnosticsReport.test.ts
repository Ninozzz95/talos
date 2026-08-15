import { describe, expect, it } from 'vitest'
import { buildTalosDiagnosticsReport } from '@/lib/diagnostics/diagnosticsReport'
import type { TalosSendTrace } from '@/lib/diagnostics/sendTrace'

/**
 * Owner 2026-07-26: "fa in modo che lo possa copiare bene e darti un JSON o
 * comunque tutti i dati con un click".
 *
 * The research (2026-07-26, logged) found there is no universal trace FILE
 * format — OTLP/JSON is the universal envelope, and `gen_ai.*` vs OpenInference
 * are two competing vocabularies every vendor adapts. It also found that
 * neither standard defines the two numbers that matter most here: time to first
 * token, and cost. So the field names borrow the standards' semantics
 * (provider / model / input+output token split kept apart) while staying a
 * shape a human can read in a chat message, which is where this one is going.
 */
const TRACE: TalosSendTrace = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    durationMs: 24_310,
    outcome: 'ok',
    rounds: [
        {
            startedAtMs: 0,
            durationMs: 8_200,
            timeToFirstChunkMs: 1_400,
            parallel: true,
            tools: [
                { name: 'web_search', startedAtMs: 1_500, durationMs: 900, ok: true },
                { name: 'web_read', startedAtMs: 1_520, durationMs: 3_100, ok: true },
            ],
        },
        {
            startedAtMs: 8_200,
            durationMs: 16_110,
            timeToFirstChunkMs: 900,
            parallel: false,
            tools: [{ name: 'document_create', startedAtMs: 9_000, durationMs: 5_000, ok: false }],
        },
    ],
}

const INPUT = {
    buildId: 'R36-abc',
    platform: 'android',
    rows: [
        { id: 'storage', label: 'Encrypted local storage', value: 'ready', ok: true },
        { id: 'speech', label: 'Speech recognizer', value: 'probe failed', ok: false },
    ],
    issues: [{ at: '2026-07-26T18:00:00.000Z', tag: 'TALOS_SPEECH_ERROR', detail: 'no recognizer' }],
    traces: [TRACE],
    diagnosticsEnabled: true,
}

describe('the one thing the owner copies and pastes back', () => {
    it('names its own shape, so a reader knows what they are holding', () => {
        const report = buildTalosDiagnosticsReport(INPUT)
        expect(report.schema).toBe('talos.diagnostics/1')
        expect(report.app).toEqual({ build: 'R36-abc', platform: 'android' })
    })

    it('leads with the answer, not with the data', () => {
        // A report that has to be read in full to learn "2 problems, the slowest
        // send took 24s, tools ran together" has buried its own conclusion.
        const report = buildTalosDiagnosticsReport(INPUT)
        expect(report.summary).toEqual({
            checksFailed: 1,
            checksPassed: 1,
            sendsRecorded: 1,
            slowestSendMs: 24_310,
            anyRoundRanToolsInParallel: true,
        })
    })

    it('keeps every timing, per round and per tool', () => {
        const report = buildTalosDiagnosticsReport(INPUT)
        const [send] = report.sends
        expect(send!.provider).toBe('deepseek')
        expect(send!.model).toBe('deepseek-chat')
        expect(send!.rounds[0]!.timeToFirstChunkMs).toBe(1_400)
        expect(send!.rounds[0]!.tools[1]).toEqual({
            name: 'web_read', startedAtMs: 1_520, durationMs: 3_100, ok: true,
        })
        expect(send!.rounds[1]!.parallel).toBe(false)
    })

    it('carries no message, no file name, and no key — because it is never given one', () => {
        const serialised = JSON.stringify(buildTalosDiagnosticsReport(INPUT))
        expect(serialised).not.toMatch(/sk-|tvly-|Bearer|Authorization/i)
    })

    it('scrubs a secret that reached the device log anyway', () => {
        // Structural, not trusting: the issue log takes free text from any call
        // site, and one future `String(error)` carrying an Authorization header
        // must not become a copy-pasteable key. A diagnostics export is the most
        // natural way for a secret to leave an app.
        const report = buildTalosDiagnosticsReport({
            ...INPUT,
            issues: [{
                at: '2026-07-26T18:00:00.000Z',
                tag: 'TALOS_HTTP',
                detail: 'failed with Authorization: Bearer sk-c4b228e688274d32bfee7bb122eda57a',
            }],
        })
        const detail = report.issues[0]!.detail
        expect(detail).not.toContain('sk-c4b228e688274d32bfee7bb122eda57a')
        expect(detail).toContain('[redacted]')
    })

    it('scrubs a Tavily-shaped key too, and a bare long token', () => {
        const report = buildTalosDiagnosticsReport({
            ...INPUT,
            issues: [{
                at: '2026-07-26T18:00:00.000Z',
                tag: 'TALOS_SEARCH',
                detail: 'key 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 rejected',
            }],
        })
        expect(report.issues[0]!.detail).not.toContain('tvly-dev-3kN7Kw')
        expect(report.issues[0]!.detail).toContain('[redacted]')
    })

    it('counts what it had to scrub, so a leak upstream is visible', () => {
        // Zero is the expected value. A non-zero count is not reassurance that
        // the net works — it is the signal that something put a secret into a
        // diagnostic string and needs fixing at the source.
        expect(buildTalosDiagnosticsReport(INPUT).redactions).toBe(0)
        const leaky = buildTalosDiagnosticsReport({
            ...INPUT,
            issues: [{ at: '2026-07-26T18:00:00.000Z', tag: 'T', detail: 'Bearer sk-abcdefgh12345678' }],
        })
        expect(leaky.redactions).toBeGreaterThan(0)
    })

    it('scrubs a Gemini URL, where the key rides in the query string', () => {
        const report = buildTalosDiagnosticsReport({
            ...INPUT,
            issues: [{
                at: '2026-07-26T18:00:00.000Z',
                tag: 'TALOS_HTTP',
                detail: 'GET https://generativelanguage.googleapis.com/v1/models?key=AIzaSyB1234567890abcdefghijklmnopqrstuv failed',
            }],
        })
        expect(report.issues[0]!.detail).not.toContain('AIzaSyB1234567890abcdefghijklmnopqrstuv')
    })

    it('says plainly when timings were never being recorded', () => {
        // Otherwise an empty `sends` reads as "it was fast", when it means
        // "nothing was measured".
        const report = buildTalosDiagnosticsReport({ ...INPUT, diagnosticsEnabled: false, traces: [] })
        expect(report.timingsRecorded).toBe(false)
        expect(report.sends).toEqual([])
    })
})
