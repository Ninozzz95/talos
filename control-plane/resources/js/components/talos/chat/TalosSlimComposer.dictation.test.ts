import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosSlimComposer.vue', import.meta.url), 'utf8')

describe('TalosSlimComposer dictation control', () => {
    it('renders a mic control, gated on dictationSupported, that emits toggleDictation', () => {
        expect(source).toContain('data-testid="talos-composer-dictate"')
        expect(source).toMatch(/v-if="dictationSupported"/)
        expect(source).toContain("emit('toggleDictation')")
    })

    it('reflects the recording and transcribing states', () => {
        expect(source).toMatch(/dictationStatus === 'recording'/)
        expect(source).toMatch(/dictationStatus === 'transcribing'/)
        // shows a spinner while transcribing and a mic otherwise
        expect(source).toContain('<Mic')
    })
})
