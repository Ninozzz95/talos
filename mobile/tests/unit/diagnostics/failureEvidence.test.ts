import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { malformedProviderResponse, requireHttpSuccess } from '@/lib/chat/providerErrors'
import { talosDeviceIssues, __resetTalosDeviceLogForTests } from '@/lib/talosDeviceLog'
import { buildTalosDiagnosticsReport } from '@/lib/diagnostics/diagnosticsReport'

/**
 * The acceptance test for the instrument, written against the owner's own case.
 *
 * On 2026-07-30 his session showed "anthropic ha restituito una risposta chat
 * non valida" and his Doctor export showed `issues: []`. Both statements were
 * true and neither was usable: the reason had been discarded before it could
 * be recorded, so the report that exists to settle the question could not
 * answer it and a transcript had to be sent separately.
 *
 * Two things have to hold at once, and the second is what allows the first to
 * be on by default for everyone: the diagnosis must be there, and none of the
 * user's content may be.
 */
describe('a failed provider call leaves usable evidence and nothing else', () => {
    beforeEach(() => { __resetTalosDeviceLogForTests() })

    it('records what arrived and which rule it broke', () => {
        // A response shaped like Anthropic's, missing the text the schema wants.
        const received = {
            model: 'claude-opus-5',
            stop_reason: 'end_turn',
            content: [{ type: 'text' }],
        }
        const parsed = z.object({
            content: z.array(z.object({ type: z.string(), text: z.string() })),
        }).safeParse(received)

        malformedProviderResponse('anthropic', 'complete', {
            received,
            issues: parsed.success ? [] : parsed.error.issues,
        })

        const [entry] = talosDeviceIssues()
        expect(entry?.tag).toBe('TALOS_PROVIDER_MALFORMED')
        expect(entry?.detail).toContain('anthropic/complete')
        // What arrived.
        expect(entry?.detail).toContain('content:[1×{type:string}]')
        // Which rule it broke, and where.
        expect(entry?.detail).toContain('content.0.text')
    })

    /**
     * The adversarial half. A provider error body is a plausible place for the
     * prompt to be echoed back, and a request carries the key that signed it.
     */
    it('lets no content, key or prompt reach the report', () => {
        const hostile = {
            error: {
                message: 'Your prompt "the private thing Antonino typed" was rejected',
                request_id: 'req_01',
                api_key: 'sk-ant-api03-REAL-SECRET-VALUE',
            },
            echo: ['the whole conversation', 'and every document in it'],
        }

        expect(() => requireHttpSuccess({
            provider: 'anthropic',
            operation: 'complete',
            status: 400,
            data: hostile,
        })).toThrow()

        const report = JSON.stringify(buildTalosDiagnosticsReport({
            buildId: 'test',
            platform: 'android',
            rows: [],
            issues: talosDeviceIssues(),
            traces: [],
            diagnosticsEnabled: true,
        }))

        expect(report).not.toContain('private thing')
        expect(report).not.toContain('sk-ant-api03')
        expect(report).not.toContain('whole conversation')
        expect(report).not.toContain('every document')
        // But the fact of the failure, and enough to act on, is there.
        expect(report).toContain('TALOS_PROVIDER_HTTP')
        expect(report).toContain('status=400')
    })

    it('counts a provider failing in a loop instead of losing the history to it', () => {
        for (let attempt = 0; attempt < 30; attempt += 1) {
            malformedProviderResponse('gemini', 'complete', {
                received: { candidates: [] },
                note: 'no candidates',
            })
        }

        const issues = talosDeviceIssues()
        expect(issues).toHaveLength(1)
        expect(issues[0]?.count).toBe(30)
    })
})
