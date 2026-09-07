import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosSlimComposer.vue', import.meta.url), 'utf8')
const buttonSource = readFileSync(new URL('./TalosDictationButton.vue', import.meta.url), 'utf8')

describe('TalosSlimComposer dictation control', () => {
    it('places the mic after the prompt enhancer in source order', () => {
        const enhancerIndex = source.indexOf('data-testid="talos-composer-enhance"')
        const dictationIndex = source.indexOf('<TalosDictationButton')

        expect(enhancerIndex).toBeGreaterThan(-1)
        expect(dictationIndex).toBeGreaterThan(enhancerIndex)
    })

    it('renders a mic control, gated on dictationSupported, that emits toggleDictation', () => {
        expect(source).toContain("loader: () => import('./TalosDictationButton.vue')")
        expect(source).toContain('loadingComponent: TalosDictationButtonLoading')
        expect(source).toContain('errorComponent: TalosDictationButtonError')
        expect(source).toContain('delay: 0')
        expect(source).toMatch(/<TalosDictationButton[\s\S]*v-if="dictationSupported"/)
        expect(source).toContain('@toggle="emit(\'toggleDictation\')"')
        expect(buttonSource).toContain('data-testid="talos-composer-dictate"')
    })

    it('reflects requesting, recording, transcribing, and error states', () => {
        expect(buttonSource).toMatch(/status === 'requesting'/)
        expect(buttonSource).toMatch(/status === 'recording'/)
        expect(buttonSource).toMatch(/status === 'transcribing'/)
        expect(buttonSource).toMatch(/status === 'error'/)
        // shows a spinner while transcribing and a mic otherwise
        expect(buttonSource).toContain('<Mic')
    })

    it('loads the compact status UI on demand and forwards its separate actions', () => {
        expect(source).toContain("defineAsyncComponent(() => import('./TalosDictationStatus.vue'))")
        expect(source).toContain('<TalosDictationStatusPanel')
        expect(source).toContain('@finish="emit(\'finishDictation\')"')
        expect(source).toContain('@cancel="emit(\'cancelDictation\')"')
        expect(source).toContain('@retry="emit(\'retryDictation\')"')
        expect(source).toContain(':recording-started-at="dictationRecordingStartedAt"')
        expect(source).toContain(':resolved-mode="dictationResolvedMode"')
    })
})
