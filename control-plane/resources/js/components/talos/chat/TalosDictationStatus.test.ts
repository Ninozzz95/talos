import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosDictationStatus.vue', import.meta.url), 'utf8')

describe('TalosDictationStatus', () => {
    it('keeps state transitions polite, the timer non-live, and reserves alert semantics for errors', () => {
        expect(source).toContain('data-testid="talos-dictation-status"')
        expect(source).toContain('data-testid="talos-dictation-announcement"')
        expect(source).toContain('aria-live="polite"')
        expect(source).toContain('role="alert"')
        expect(source).toContain('aria-hidden="true"')
        expect(source).not.toContain('aria-atomic="true"')
    })

    it('offers distinct finish, cancel, and retry targets', () => {
        expect(source).toContain('aria-label="Finish dictation"')
        expect(source).toContain('aria-label="Cancel dictation"')
        expect(source).toContain('aria-label="Retry dictation"')
        expect(source).toContain("emit('finish')")
        expect(source).toContain("emit('cancel')")
        expect(source).toContain("emit('retry')")
    })

    it('derives the elapsed timer from the real recording start timestamp', () => {
        expect(source).toContain("status === 'recording'")
        expect(source).toContain('Recording on this device')
        expect(source).toContain('recordingStartedAt')
        expect(source).toContain('Date.now()')
        expect(source).toContain('elapsedLabel')
    })

    it('names the effective local or cloud transcription destination', () => {
        expect(source).toContain('resolvedMode')
        expect(source).toContain('Transcribing locally')
        expect(source).toContain('Transcribing with cloud speech service')
    })
})
