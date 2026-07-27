import { describe, expect, it } from 'vitest'
import { TALOS_SETUP_STEPS, talosSetupProgress } from '@/lib/onboarding/setupProgress'

/**
 * Owner 2026-07-27 chose "setup essenziale, 2 passi" over the six-slide
 * carousel, after the research: NN/g finds deck-of-cards tutorials "make the
 * interface appear more complicated than it actually is" and that onboarding is
 * only justified when the app genuinely needs something to start. TALOS needs
 * exactly two things, so the flow is exactly two steps.
 *
 * Nothing new is persisted to remember where the user was. A step is done when
 * the thing it asks for EXISTS, so resuming can never disagree with reality —
 * a stored cursor can, and would be the kind of state that goes stale silently.
 */
describe('what first-run setup still needs', () => {
    it('asks for both things on a fresh install', () => {
        const progress = talosSetupProgress({ pinSet: false, modelReady: false })
        expect(progress.steps.map((step) => step.done)).toEqual([false, false])
        expect(progress.startIndex).toBe(0)
        expect(progress.complete).toBe(false)
    })

    it('names the two steps after what the person controls', () => {
        // Not "Security" and "Provider configuration" — a PIN and a model are
        // the things they recognise and can point at.
        expect(TALOS_SETUP_STEPS.map((step) => step.label)).toEqual(['PIN', 'Model'])
    })

    it('opens on the model step when a PIN is already set', () => {
        // The app was killed between the two steps, or the PIN was set earlier
        // from Settings. Asking for it twice would be the app not looking.
        const progress = talosSetupProgress({ pinSet: true, modelReady: false })
        expect(progress.steps[0]!.done).toBe(true)
        expect(progress.startIndex).toBe(1)
        expect(progress.complete).toBe(false)
    })

    it('is finished when both exist, and says so', () => {
        const progress = talosSetupProgress({ pinSet: true, modelReady: true })
        expect(progress.complete).toBe(true)
        expect(progress.startIndex).toBe(1)
    })

    it('still opens on the PIN when only a model is configured', () => {
        // Sequential order, per the wizard research: the second step is not a
        // reason to skip past the first one silently.
        const progress = talosSetupProgress({ pinSet: false, modelReady: true })
        expect(progress.startIndex).toBe(0)
        expect(progress.steps[1]!.done).toBe(true)
        expect(progress.complete).toBe(false)
    })
})
