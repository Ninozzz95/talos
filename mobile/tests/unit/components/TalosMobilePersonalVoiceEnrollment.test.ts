// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosVoiceEnrollmentPhraseVerdict } from '@/services/personalVoice'

const bridge = vi.hoisted(() => ({
    startVoiceEnrollment: vi.fn(async () => {}),
    stopVoiceEnrollmentCapture: vi.fn(async () => {}),
    captureVoiceEnrollmentPhrase: vi.fn(),
    buildVoiceEnrollmentProfile: vi.fn(),
    previewVoiceEnrollmentProfile: vi.fn(async () => ({ accepted: true })),
    commitVoiceEnrollmentProfile: vi.fn(),
    discardVoiceEnrollmentSession: vi.fn(async () => {}),
    onDone: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
    onError: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
}))

vi.mock('@/services/personalVoice', () => ({
    talosStartVoiceEnrollment: bridge.startVoiceEnrollment,
    talosStopVoiceEnrollmentCapture: bridge.stopVoiceEnrollmentCapture,
    talosCaptureVoiceEnrollmentPhrase: bridge.captureVoiceEnrollmentPhrase,
    talosBuildVoiceEnrollmentProfile: bridge.buildVoiceEnrollmentProfile,
    talosPreviewVoiceEnrollmentProfile: bridge.previewVoiceEnrollmentProfile,
    talosCommitVoiceEnrollmentProfile: bridge.commitVoiceEnrollmentProfile,
    talosDiscardVoiceEnrollmentSession: bridge.discardVoiceEnrollmentSession,
    talosOnPersonalVoiceDone: bridge.onDone,
    talosOnPersonalVoiceError: bridge.onError,
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
        bridge.startVoiceEnrollment.mockResolvedValue(undefined)
        bridge.stopVoiceEnrollmentCapture.mockResolvedValue(undefined)
        bridge.discardVoiceEnrollmentSession.mockResolvedValue(undefined)
        bridge.previewVoiceEnrollmentProfile.mockResolvedValue({ accepted: true })
        bridge.onDone.mockResolvedValue({ remove: vi.fn(async () => {}) })
        bridge.onError.mockResolvedValue({ remove: vi.fn(async () => {}) })
    })

    it('PVOICE-UI-01 starts a session on mount and discards it when cancelled', async () => {
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, { props: { existingProfileCount: 0 } })
        await flushPromises()
        expect(bridge.startVoiceEnrollment).toHaveBeenCalledTimes(1)

        await wrapper.get('[data-testid="talos-personal-voice-cancel"]').trigger('click')
        await flushPromises()
        expect(bridge.discardVoiceEnrollmentSession).toHaveBeenCalledTimes(1)
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('PVOICE-UI-02 continue on consent is disabled until all three boxes are checked', async () => {
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, { props: { existingProfileCount: 0 } })
        await flushPromises()
        const button = wrapper.get('[data-testid="talos-personal-voice-consent-continue"]')
        expect((button.element as HTMLButtonElement).disabled).toBe(true)

        await wrapper.get('[data-testid="talos-personal-voice-consent-identity"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-storage"]').setValue(true)
        expect((button.element as HTMLButtonElement).disabled).toBe(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-mic"]').setValue(true)
        expect((button.element as HTMLButtonElement).disabled).toBe(false)
    })

    async function advanceToWizard(wrapper: ReturnType<typeof mount>) {
        await wrapper.get('[data-testid="talos-personal-voice-consent-identity"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-storage"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-mic"]').setValue(true)
        await wrapper.get('[data-testid="talos-personal-voice-consent-continue"]').trigger('click')
        await wrapper.get('[data-testid="talos-personal-voice-check-continue"]').trigger('click')
    }

    it('PVOICE-UI-03 recording a phrase shows the real verdict, and only an accepted one lets the wizard advance', async () => {
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, { props: { existingProfileCount: 0 } })
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

    it('PVOICE-UI-04 after all 12 phrases, encoding calls buildEnrollmentProfile with the typed name', async () => {
        bridge.buildVoiceEnrollmentProfile.mockResolvedValue({ frameCount: 40, quantizerCount: 16, enrollmentDurationMs: 24000 })
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, { props: { existingProfileCount: 0 } })
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
        const wrapper = mount(TalosMobilePersonalVoiceEnrollment, { props: { existingProfileCount: 0 } })
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
