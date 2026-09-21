import { describe, expect, it } from 'vitest'
import { redactTalosSecrets } from '@/lib/diagnostics/diagnosticsReport'

/**
 * SF-critic 2026-07-26, MAJOR: the header rule ended at `\S+`, which on the
 * canonical two-token header consumes the word "Bearer" and leaves the
 * credential in the payload — while the screen promised, in as many words,
 * that the report never carries a key.
 *
 * Each row here is one of the critic's proven escapes.
 */
const ESCAPES: ReadonlyArray<[string, string]> = [
    ['bearer token', 'HTTP 401 Authorization: Bearer abc123def456ghi789'],
    ['basic auth', 'Authorization: Basic dXNlcjpwYXNz+abc/def=='],
    ['jwt with dots', 'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefgh'],
    ['short query key', 'GET /v1/models?key=AIzaShort123&alt=sse failed'],
    ['base64 with slashes', 'token dXNlcjpwYXNzd29yZA+9/aBcDeFgHiJkLmNoPqRsT='],
]

describe('what must never survive into a pasted report', () => {
    for (const [name, input] of ESCAPES) {
        it(`scrubs: ${name}`, () => {
            const { text, hits } = redactTalosSecrets(input)
            expect(hits).toBeGreaterThan(0)
            // The credential itself, whatever shape it took, must be gone.
            const credential = input.split(/\s+/).pop()!.replace(/^.*=/, '')
            if (credential.length > 6) expect(text).not.toContain(credential)
        })
    }

    it('leaves ordinary diagnostics readable', () => {
        // A net that eats the message is not a net, it is a shredder: these are
        // the strings the log exists to carry.
        const plain = 'TALOS_SPEECH_ERROR timed out after 12000ms · recognizer unavailable'
        const { text, hits } = redactTalosSecrets(plain)
        expect(text).toBe(plain)
        expect(hits).toBe(0)
    })
})
