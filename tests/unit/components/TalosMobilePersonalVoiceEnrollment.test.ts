// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosVoiceEnrollmentPhraseVerdict } from '@/services/personalVoice'
import TalosMicWaveform from '@/components/brand/TalosMicWaveform.vue'

const bridge = vi.hoisted(() => ({
    startVoiceEnrollment: vi.fn(),
    stopVoiceEnrollmentCapture: vi.fn(async () => {}),
    captureVoiceEnrollmentPhrase: vi.fn(),
    playCapturedPhrase: vi.fn(async () => {}),
    buildVoiceEnrollmentProfile: vi.fn(),
    previewVoiceEnrollmentProfile: vi.fn(async () => ({ accepted: true })),
    commitVoiceEnrollmentProfile: vi.fn(),
    discardVoiceEnrollmentSession: vi.fn(async () => {}),
    onDone: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
    onError: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
    onLevel: vi.fn(),
    startPeek: vi.fn(async () => {}),
    stopPeek: vi.fn(async () => {}),
}))

vi.mock('@/services/personalVoice', () => ({
    talosStartVoiceEnrollment: bridge.startVoiceEnrollment,
    talosStopVoiceEnrollmentCapture: bridge.stopVoiceEnrollmentCapture,
    talosCaptureVoiceEnrollmentPhrase: bridge.captureVoiceEnrollmentPhrase,
    talosPlayCapturedEnrollmentPhrase: bridge.playCapturedPhrase,
    talosBuildVoiceEnrollmentProfile: bridge.buildVoiceEnrollmentProfile,
    talosPreviewVoiceEnrollmentProfile: bridge.previewVoiceEnrollmentProfile,
    talosCommitVoiceEnrollmentProfile: bridge.commitVoiceEnrollmentProfile,
    talosDiscardVoiceEnrollmentSession: bridge.discardVoiceEnrollmentSession,
    talosOnPersonalVoiceDone: bridge.onDone,
    talosOnPersonalVoiceError: bridge.onError,
    talosOnVoiceEnrollmentLevel: bridge.onLevel,
    talosStartMicLevelPeek: bridge.startPeek,
    talosStopMicLevelPeek: bridge.stopPeek,
}))

const { default: TalosMobilePersonalVoiceEnrollment } = await import(
    '@/components/talos/settings/voice/TalosMobilePersonalVoiceEnrollment.vue'
)

function acceptedVerdict(): TalosVoiceEnrollmentPhraseVerdict {
    return {
        accepted: true,
        rejectionReasons: [],
        durationMs: 2000,
        peakAbs: 0.4,
        rmsDbfs: -20,
        clippedSampleRatio: 0,
        zeroFrameRatio: 0.05,
        clientSilencedObserved: false,
    }
}

/**
 * ⛔ A real capture takes real seconds - `talosCaptureVoiceEnrollmentPhrase`
 * only resolves once the person releases the button (or the max duration
 * elapses). An instantly-resolving mock collapses that window: a first
 * draft of this file used `mockResolvedValue(...)` directly, and the
 * `pointerdown` trigger alone let the WHOLE async chain finish before
 * `pointerup` ever fired - the record button had already flipped to
 * retry/continue by the time the "release" step ran, and every multi-step
 * test failed on a `.get()` that could no longer find it. Not a component
 * bug: a mock lying about timing. A deferred promise, resolved only after
 * both pointer events have already fired, is what makes the press-then-
 * release sequence mean something in this test.
 */
function deferredCapture() {
    let resolve!: (value: ReturnType<typeof acceptedVerdict>) => void
    const promise = new Promise<ReturnType<typeof acceptedVerdict>>((r) => { resolve = r })
    bridge.captureVoiceEnrollmentPhrase.mockReturnValueOnce(promise)
    return { resolve }
}

async function recordOnePhrase(wrapper: ReturnType<typeof mount>, verdict = acceptedVerdict()) {
    const deferred = deferredCapture()
    await wrapper.get('[data-testid="talos-personal-voice-record"]').trigger('pointerdown')
    await wrapper.get('[data-testid="talos-personal-voice-record"]').trigger('pointerup')
    deferred.resolve(verdict)
    await flushPromises()
}

describe('TalosMobilePersonalVoiceEnrollment', () => {
    beforeEach(() => {
        for (const fn of Object.values(bridge)) fn.mockReset()
        bridge.startVoiceEnrollment.mockResolvedValue({ resumedSlotIndexes: [] })
        bridge.stopVoiceEnrollmentCapture.mockResolvedValue(undefined)
        bridge.discardVoiceEnrollmentSession.mockResolvedValue(undefined)
        bridge.previewVoiceEnrollmentProfile.mockResolvedValue({ accepted: true })
        bridge.playCapturedPhrase.mockResolvedValue(undefined)
        bridge.onDone.mockResolvedValue({ remove: vi.fn(async () => {}) })
        bridge.onError.mockResolvedValue({ remove: vi.fn(async () => {}) })
        bridge.onLevel.mockResolvedValue({ remove: vi.fn(async () => {}) })
    })

    /**
     * ⭐⭐⭐ Owner 22/8, dopo il crash reale sul Pad durante l'encode
     * (pressione di memoria di sistema, misurata): «i dati della
     * registrazione dovrebbero essere memorizzati... se un crash succede si
     * può riprendere da dove si lascia». Il nativo dice quali indici sono
     * già cifrati su disco - il wizard salta dritto lì, non li fa rifare.
     */
    it('PVOICE-UI-09 resumes past already-accepted phrases instead of restarting the wizard', async () => {
        bridge.startVoiceEnrollment.mockResolvedValue({ resumedSlotIndexes: [0, 1, 2] })
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()

        // Niente consenso, niente controllo microfono da rifare - si è già dentro il wizard, sulla 4a frase (indice 3).
        expect(wrapper.find('[data-testid="talos-personal-voice-consent-continue"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-personal-voice-phrase"]').text()).toContain('Almost done, hang on')
    })

    it('PVOICE-UI-10 resuming with all 12 phrases already accepted skips straight to review', async () => {
        bridge.startVoiceEnrollment.mockResolvedValue({ resumedSlotIndexes: Array.from({ length: 12 }, (_, i) => i) })
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()

        expect(wrapper.text()).toContain('12 phrases recorded')
    })

    /**
     * ⭐⭐⭐ Owner 22/8, live sul Pad: «la waveform si deve vedere anche
     * nella prima schermata». Il peek si accende SOLO su 'check' e si
     * spegne appena se ne esce - mai acceso sul wizard (lì il livello
     * arriva dalla cattura vera), mai lasciato acceso oltre quella finestra.
     */
    it('PVOICE-UI-11 the mic-level peek starts entering check and stops leaving it, never during the wizard', async () => {
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        expect(bridge.startPeek).not.toHaveBeenCalled()

        await wrapper.get('[data-testid="talos-personal-voice-consent-identity"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-storage"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-mic"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-continue"]').trigger('click')
        expect(bridge.startPeek).toHaveBeenCalledTimes(1)
        expect(bridge.stopPeek).not.toHaveBeenCalled()

        await wrapper.get('[data-testid="talos-personal-voice-check-continue"]').trigger('click')
        expect(bridge.stopPeek).toHaveBeenCalledTimes(1)
        expect(bridge.startPeek).toHaveBeenCalledTimes(1)
    })

    it('PVOICE-UI-01 starts a session on mount and discards it when cancelled', async () => {
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        expect(bridge.startVoiceEnrollment).toHaveBeenCalledTimes(1)

        await wrapper.get('[data-testid="talos-personal-voice-cancel"]').trigger('click')
        await flushPromises()
        expect(bridge.discardVoiceEnrollmentSession).toHaveBeenCalledTimes(1)
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('PVOICE-UI-02 continue on consent is disabled until all three boxes are checked', async () => {
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        // ⛔ 22/8: si riprende `wrapper.get(...)` FRESCO a ogni controllo,
        // mai un riferimento catturato una volta sola - misurato con un test
        // di debug usa-e-getta: lo stub `teleport: true` di Vue Test Utils
        // richiama `slots.default({})` a ogni resa (vedi i suoi stessi
        // commit-link, github.com/vuejs/test-utils#1888), e il nodo <button>
        // di un giro precedente non è più quello vivo dopo un `setValue` -
        // stesso stile già in uso in `TalosLauncherIconDialog.test.ts`.
        const readDisabled = () => (
            (wrapper.get('[data-testid="talos-personal-voice-consent-continue"]').element as HTMLButtonElement).disabled
        )
        expect(readDisabled()).toBe(true)

        await wrapper.get('[data-testid="talos-personal-voice-consent-identity"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-storage"]').setValue(true)
        expect(readDisabled()).toBe(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-mic"]').setValue(true)
        expect(readDisabled()).toBe(false)
    })

    async function advanceToWizard(wrapper: ReturnType<typeof mount>) {
        await wrapper.get('[data-testid="talos-personal-voice-consent-identity"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-storage"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-mic"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-continue"]').trigger('click')
        await wrapper.get('[data-testid="talos-personal-voice-check-continue"]').trigger('click')
    }

    it('PVOICE-UI-03 recording a phrase shows the real verdict, and only an accepted one lets the wizard advance', async () => {
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        await advanceToWizard(wrapper)

        await recordOnePhrase(wrapper, {
            accepted: false,
            rejectionReasons: ['grossClipping(0.2)'],
            durationMs: 2000, peakAbs: 0.99, rmsDbfs: -1, clippedSampleRatio: 0.2, zeroFrameRatio: 0, clientSilencedObserved: false,
        })
        expect(bridge.captureVoiceEnrollmentPhrase).toHaveBeenCalledWith(0, expect.any(Number))
        // A rejected capture offers retry, not continue.
        expect(wrapper.find('[data-testid="talos-personal-voice-next"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-personal-voice-retry"]').exists()).toBe(true)

        await wrapper.get('[data-testid="talos-personal-voice-retry"]').trigger('click')
        await recordOnePhrase(wrapper)
        expect(wrapper.find('[data-testid="talos-personal-voice-next"]').exists()).toBe(true)
    })

    /**
     * ⭐⭐⭐ Owner 22/8, live sul Pad durante la prova vera: "voglio un
     * pulsante che riproduca la registrazione appena fatta". Il pulsante
     * esiste SOLO dopo un verdetto accettato (una frase rifiutata non ha
     * nulla di accettabile da riascoltare - `enrollmentSlots` lato nativo
     * non l'avrebbe nemmeno tenuta), e passa lo slotIndex della frase
     * corrente, non un id indovinato.
     */
    it('PVOICE-UI-06 an accepted verdict offers a playback button for that exact slot, a rejected one does not', async () => {
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        await advanceToWizard(wrapper)

        await recordOnePhrase(wrapper, {
            accepted: false,
            rejectionReasons: ['nearZeroSignal(peak=0.0001)'],
            durationMs: 2000, peakAbs: 0.0001, rmsDbfs: -80, clippedSampleRatio: 0, zeroFrameRatio: 0.95, clientSilencedObserved: false,
        })
        expect(wrapper.find('[data-testid="talos-personal-voice-playback"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-personal-voice-retry"]').trigger('click')
        await recordOnePhrase(wrapper)
        const playback = wrapper.get('[data-testid="talos-personal-voice-playback"]')
        expect((playback.element as HTMLButtonElement).disabled).toBe(false)

        await playback.trigger('click')
        await flushPromises()
        expect(bridge.playCapturedPhrase).toHaveBeenCalledWith(0)
    })

    /**
     * ⭐⭐⭐ Owner 22/8, live sul Pad: «la waveform è assente nel Wizard, ne
     * abbiamo già una nel progetto». `TalosMicWaveform` è quel componente
     * reale (non un doppio finto) - qui si prova che riceve DAVVERO il
     * livello che il nativo emette durante una cattura, il canale aperto in
     * `onMounted`, non un valore statico disegnato a schermo.
     */
    it('PVOICE-UI-08 the real TalosMicWaveform receives live level updates from the native capture', async () => {
        let emitLevel: ((level: number) => void) | null = null
        bridge.onLevel.mockImplementationOnce(async (listener: (level: number) => void) => {
            emitLevel = listener
            return { remove: vi.fn(async () => {}) }
        })

        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        await advanceToWizard(wrapper)

        // ⛔ 22/8: stesso motivo di PVOICE-UI-02 - una query fresca a ogni
        // controllo, mai un `VueWrapper` catturato una volta sola, con lo
        // stub `teleport: true` in mezzo.
        const readLevel = () => wrapper.getComponent(TalosMicWaveform).props('level')
        expect(readLevel()).toBe(0)

        expect(emitLevel).not.toBeNull()
        emitLevel?.(0.73)
        await flushPromises()
        expect(readLevel()).toBe(0.73)

        // A resta a riposo quando la cattura finisce, non congelata sull'ultimo blocco.
        await recordOnePhrase(wrapper)
        expect(readLevel()).toBe(0)
    })

    /** ⛔ AL CONTRARIO: un playback che fallisce lato nativo deve dirlo, non tacere come se fosse andato bene. */
    it('PVOICE-UI-07 a failed playback shows the honest error text, not silence', async () => {
        bridge.playCapturedPhrase.mockRejectedValueOnce(new Error('AudioTrack write failed'))
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        await advanceToWizard(wrapper)
        await recordOnePhrase(wrapper)

        await wrapper.get('[data-testid="talos-personal-voice-playback"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toContain('Could not play it back')
    })

    it('PVOICE-UI-04 after all 12 phrases, encoding calls buildEnrollmentProfile with the typed name', async () => {
        bridge.buildVoiceEnrollmentProfile.mockResolvedValue({ frameCount: 40, quantizerCount: 16, enrollmentDurationMs: 24000 })
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        await advanceToWizard(wrapper)

        for (let i = 0; i < 12; i++) {
            await recordOnePhrase(wrapper)
            await wrapper.get('[data-testid="talos-personal-voice-next"]').trigger('click')
        }
        expect(wrapper.find('[data-testid="talos-personal-voice-name"]').exists()).toBe(true)

        await wrapper.get('[data-testid="talos-personal-voice-name"]').setValue('Antonino')
        await wrapper.get('[data-testid="talos-personal-voice-encode"]').trigger('click')
        await flushPromises()
        expect(bridge.buildVoiceEnrollmentProfile).toHaveBeenCalledWith(
            expect.objectContaining({ displayName: 'Antonino', style: 'neutral', consentVersion: 1 }),
        )
        expect(wrapper.find('[data-testid="talos-personal-voice-play-preview"]').exists()).toBe(true)
    })

    it('PVOICE-UI-05 saving commits the profile and closes, emitting the saved summary', async () => {
        const summary = {
            id: 'a1b2c3d4-e5f6-4789-a012-3456789abcde', name: 'Antonino', language: 'it', style: 'neutral',
            engineBuild: 'x'.repeat(64), compatible: true, createdAtEpochMs: 0, enrollmentDurationMs: 24000,
        }
        bridge.commitVoiceEnrollmentProfile.mockResolvedValue(summary)
        bridge.buildVoiceEnrollmentProfile.mockResolvedValue({ frameCount: 40, quantizerCount: 16, enrollmentDurationMs: 24000 })
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, {
            props: { existingProfileCount: 0 },
            // ⛔ 22/8: il dialog ora esce con `<Teleport to="body">` (un
            // pannello impostazioni tablet con `transform` lo intrappolava -
            // vedi il commento nel componente). Stesso stub già in uso per
            // lo stesso identico motivo in `TalosLauncherIconDialog.test.ts`:
            // senza, `wrapper.get`/`find` cercano dentro il nodo radice del
            // wrapper, e il contenuto teleportato non è più lì.
            global: { stubs: { teleport: true } },
        })
        await flushPromises()
        await advanceToWizard(wrapper)
        for (let i = 0; i < 12; i++) {
            await recordOnePhrase(wrapper)
            await wrapper.get('[data-testid="talos-personal-voice-next"]').trigger('click')
        }
        await wrapper.get('[data-testid="talos-personal-voice-name"]').setValue('Antonino')
        await wrapper.get('[data-testid="talos-personal-voice-encode"]').trigger('click')
        await flushPromises()

        await wrapper.get('[data-testid="talos-personal-voice-save"]').trigger('click')
        await flushPromises()
        expect(bridge.commitVoiceEnrollmentProfile).toHaveBeenCalledTimes(1)
        expect(wrapper.emitted('committed')?.[0]).toEqual([summary])
        expect(wrapper.emitted('close')).toBeTruthy()
    })
})
