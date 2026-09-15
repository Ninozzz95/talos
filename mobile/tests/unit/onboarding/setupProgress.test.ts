import { describe, expect, it } from 'vitest'
import { TALOS_SETUP_STEPS, talosSetupProgress } from '@/lib/onboarding/setupProgress'

/**
 * Owner 2026-07-27 chose "setup essenziale, 2 passi" over the six-slide
 * carousel, after the research: NN/g finds deck-of-cards tutorials "make the
 * interface appear more complicated than it actually is" and that onboarding is
 * only justified when the app genuinely needs something to start. Workspace
 * identity now belongs to the same flow as PIN and model.
 *
 * Nothing new is persisted to remember where the user was. A step is done when
 * the thing it asks for EXISTS, so resuming can never disagree with reality —
 * a stored cursor can, and would be the kind of state that goes stale silently.
 */
describe('what first-run setup still needs', () => {
    it('asks for everything on a fresh install', () => {
        const progress = talosSetupProgress({
            identitySet: false, pinSet: false, modelReady: false,
            autonomyChosen: false, backgroundReady: false,
        })
        expect(progress.steps.map((step) => step.done)).toEqual([false, false, false, false, false])
        expect(progress.startIndex).toBe(0)
        expect(progress.complete).toBe(false)
    })

    it('names the five steps after what the person controls', () => {
        // Not "Security" and "Provider configuration" — a PIN and a model are
        // the things they recognise and can point at.
        //
        // Il quarto e arrivato il 2026-08-03, ed e ultimo di proposito: la
        // ricerca sui permessi dice di chiedere quando la persona ha capito a
        // che serve, non all'avvio. A quel punto ha gia dato nome, PIN e
        // modello, quindi «le ricerche lunghe muoiono senza questa» vuol dire
        // qualcosa. Senza l'esenzione una Deep Research muore tre volte su tre
        // appena si blocca lo schermo — misurato sul OnePlus 13.
        expect(TALOS_SETUP_STEPS.map((step) => step.label))
            .toEqual(['Name', 'PIN', 'Model', 'Autonomy', 'Background'])
    })

    it('opens on the model step when a PIN is already set', () => {
        // The app was killed between the two steps, or the PIN was set earlier
        // from Settings. Asking for it twice would be the app not looking.
        const progress = talosSetupProgress({
            identitySet: true, pinSet: true, modelReady: false,
            autonomyChosen: false, backgroundReady: false,
        })
        expect(progress.steps[1]!.done).toBe(true)
        expect(progress.startIndex).toBe(2)
        expect(progress.complete).toBe(false)
    })

    it('is finished only when the phone will let the work finish too', () => {
        const withoutBackground = talosSetupProgress({
            identitySet: true, pinSet: true, modelReady: true,
            autonomyChosen: false, backgroundReady: false,
        })
        // Chi ha gia l'app installata sta esattamente qui, ed e il motivo per
        // cui la versione dell'intro e stata alzata: `startIndex` lo porta
        // sulla pagina nuova e su nessun'altra.
        expect(withoutBackground.complete).toBe(false)
        expect(withoutBackground.startIndex).toBe(3)

        const done = talosSetupProgress({
            identitySet: true, pinSet: true, modelReady: true,
            autonomyChosen: true, backgroundReady: true,
        })
        expect(done.complete).toBe(true)
        expect(done.startIndex).toBe(4)
    })

    it('still opens on the PIN when only a model is configured', () => {
        // Sequential order, per the wizard research: the second step is not a
        // reason to skip past the first one silently.
        const progress = talosSetupProgress({
            identitySet: false, pinSet: false, modelReady: true,
            autonomyChosen: false, backgroundReady: false,
        })
        expect(progress.startIndex).toBe(0)
        expect(progress.steps[2]!.done).toBe(true)
        expect(progress.complete).toBe(false)
    })
})
