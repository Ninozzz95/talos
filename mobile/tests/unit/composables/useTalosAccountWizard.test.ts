import { describe, expect, it } from 'vitest'
import { useTalosAccountWizard } from '@/composables/useTalosAccountWizard'

// N1 — pure step machine over the frozen step table. No persistence, no deps:
// navigation only. The shell wires persistence via the wizard-state gate.
describe('useTalosAccountWizard', () => {
    it('starts at welcome with no Back and is not the last step', () => {
        const w = useTalosAccountWizard()
        expect(w.current.value.id).toBe('welcome')
        expect(w.canBack.value).toBe(false)
        expect(w.isLast.value).toBe(false)
        expect(w.progress.value).toBe(0)
    })

    it('next() advances and clamps at done', () => {
        const w = useTalosAccountWizard()
        for (let i = 0; i < 10; i++) w.next()
        expect(w.current.value.id).toBe('done')
        expect(w.isLast.value).toBe(true)
        expect(w.progress.value).toBe(1)
    })

    it('back() retreats and clamps at welcome', () => {
        const w = useTalosAccountWizard(2)
        expect(w.current.value.id).toBe('personalize')
        w.back(); w.back(); w.back()
        expect(w.current.value.id).toBe('welcome')
        expect(w.canBack.value).toBe(false)
    })

    it('skip() advances only on skippable steps (welcome is not skippable)', () => {
        const w = useTalosAccountWizard()
        w.skip()
        expect(w.current.value.id).toBe('welcome') // welcome not skippable
        w.next() // → identity (skippable)
        w.skip()
        expect(w.current.value.id).toBe('personalize')
    })

})
