import { registerPlugin } from '@capacitor/core'
import type {
    TalosPersonalVoiceProfileSummary,
    TalosPersonalVoiceStatus,
} from '@/lib/voice/personalVoiceContracts'

/**
 * The bridge to `ai.talos.voice.TalosNeuralVoicePlugin` (Fase 4 block 2),
 * from JavaScript's side - as thin as `localEngine.ts` already is for the
 * LLM engine, for the same reason: nothing here decides whether a profile
 * is compatible, what counts as an acceptable enrollment phrase, or how
 * synthesis actually happens. Those already have one true answer, in
 * Kotlin (`TalosVoiceProfileCompatibility`, `TalosVoiceQuality`,
 * `TalosMossRuntime`), and a second opinion here would just be a second
 * answer to a question that already has one.
 */

interface TalosNeuralVoicePlugin {
    status(): Promise<{ supported: boolean, installed: boolean, failure?: string }>
    profiles(): Promise<{ profiles: TalosPersonalVoiceProfileSummary[] }>
    renameProfile(options: { profileId: string, name: string }): Promise<void>
    deleteProfile(options: { profileId: string }): Promise<void>
    speak(options: {
        text: string
        profileId: string
        readingId: string
        rate: number
        pitch: number
        queue?: 'flush' | 'add'
    }): Promise<{ accepted: boolean, reason?: string }>
    stop(): Promise<void>

    startEnrollmentSession(): Promise<void>
    stopEnrollmentCapture(): Promise<void>
    captureEnrollmentPhrase(options: { slotIndex: number, maxDurationMs?: number }): Promise<{
        accepted: boolean
        rejectionReasons: string[]
        durationMs: number
        peakAbs: number
        rmsDbfs: number
        clippedSampleRatio: number
        zeroFrameRatio: number
        clientSilencedObserved: boolean
    }>
    buildEnrollmentProfile(options: {
        displayName: string
        language: string
        style: string
        consentVersion: number
    }): Promise<{ frameCount: number, quantizerCount: number, enrollmentDurationMs: number }>
    previewEnrollmentProfile(options: { text: string, readingId: string }): Promise<{ accepted: boolean }>
    commitEnrollmentProfile(): Promise<{ profile: TalosPersonalVoiceProfileSummary }>
    discardEnrollmentSession(): Promise<void>

    addListener(
        eventName: 'talosNeuralVoiceDone' | 'talosNeuralVoiceError',
        listenerFunc: (event: { readingId: string, cancelled?: boolean, error?: string }) => void,
    ): Promise<{ remove(): Promise<void> }>
}

const plugin = registerPlugin<TalosNeuralVoicePlugin>('TalosNeuralVoice')

/**
 * Never throws - a device without the model files, or a debug build with
 * the plugin missing entirely, both read as "not supported", the same
 * honest-absence pattern `talosLocalEngineStatus` already uses for the LLM
 * engine. `active` is always `false` here on purpose: this function has no
 * settings-store access to know what the user actually selected - the
 * router (`personalVoiceRouter.ts`) is what turns this plus a stored
 * preference into a real decision.
 *
 * ⛔ `ready` is NOT just `installed`: blueprint §40's own contract says
 * "installed AND at least one compatible saved profile exists" - a device
 * with the model files but zero enrolled voices (or only incompatible
 * ones, `TalosVoiceProfileCompatibility` says so) is not ready to speak
 * personally, whatever `installed` says. A second bridge call
 * (`profiles()`) is the honest way to know that; there is no shortcut that
 * does not also risk lying about it.
 */
export async function talosPersonalVoiceStatus(): Promise<TalosPersonalVoiceStatus> {
    try {
        const status = await plugin.status()
        if (!status.installed) {
            return { supported: status.supported, installed: false, ready: false, active: false, failure: status.failure }
        }
        const profiles = await talosPersonalVoiceProfiles()
        return {
            supported: status.supported,
            installed: true,
            ready: profiles.some((profile) => profile.compatible),
            active: false,
            failure: status.failure,
        }
    } catch {
        return { supported: false, installed: false, ready: false, active: false }
    }
}

export async function talosPersonalVoiceProfiles(): Promise<TalosPersonalVoiceProfileSummary[]> {
    try {
        return (await plugin.profiles()).profiles
    } catch {
        return []
    }
}

export async function talosRenamePersonalVoiceProfile(profileId: string, name: string): Promise<void> {
    await plugin.renameProfile({ profileId, name })
}

export async function talosDeletePersonalVoiceProfile(profileId: string): Promise<void> {
    await plugin.deleteProfile({ profileId })
}

export async function talosSpeakWithPersonalVoice(options: {
    text: string
    profileId: string
    readingId: string
    rate: number
    pitch: number
    queue?: 'flush' | 'add'
}): Promise<{ accepted: boolean, reason?: string }> {
    return plugin.speak(options)
}

export async function talosStopPersonalVoice(): Promise<void> {
    await plugin.stop()
}

export async function talosOnPersonalVoiceDone(
    listener: (readingId: string) => void,
): Promise<{ remove(): Promise<void> }> {
    return plugin.addListener('talosNeuralVoiceDone', (event) => listener(event.readingId))
}

export async function talosOnPersonalVoiceError(
    listener: (readingId: string, error: string | undefined) => void,
): Promise<{ remove(): Promise<void> }> {
    return plugin.addListener('talosNeuralVoiceError', (event) => listener(event.readingId, event.error))
}

// --- Enrollment (Blocco 4 UI) --------------------------------------------

export async function talosStartVoiceEnrollment(): Promise<void> {
    await plugin.startEnrollmentSession()
}

export async function talosStopVoiceEnrollmentCapture(): Promise<void> {
    await plugin.stopEnrollmentCapture()
}

export interface TalosVoiceEnrollmentPhraseVerdict {
    accepted: boolean
    rejectionReasons: string[]
    durationMs: number
    peakAbs: number
    rmsDbfs: number
    clippedSampleRatio: number
    zeroFrameRatio: number
    clientSilencedObserved: boolean
}

export async function talosCaptureVoiceEnrollmentPhrase(
    slotIndex: number,
    maxDurationMs?: number,
): Promise<TalosVoiceEnrollmentPhraseVerdict> {
    return plugin.captureEnrollmentPhrase({ slotIndex, maxDurationMs })
}

export async function talosBuildVoiceEnrollmentProfile(options: {
    displayName: string
    language: string
    style: string
    consentVersion: number
}): Promise<{ frameCount: number, quantizerCount: number, enrollmentDurationMs: number }> {
    return plugin.buildEnrollmentProfile(options)
}

export async function talosPreviewVoiceEnrollmentProfile(text: string, readingId: string): Promise<{ accepted: boolean }> {
    return plugin.previewEnrollmentProfile({ text, readingId })
}

export async function talosCommitVoiceEnrollmentProfile(): Promise<TalosPersonalVoiceProfileSummary> {
    return (await plugin.commitEnrollmentProfile()).profile
}

export async function talosDiscardVoiceEnrollmentSession(): Promise<void> {
    await plugin.discardEnrollmentSession()
}
