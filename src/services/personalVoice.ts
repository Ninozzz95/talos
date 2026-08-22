import { registerPlugin } from '@capacitor/core'
import { planTalosVoiceReading } from '@/lib/voice/personalVoiceRouter'
import type {
    TalosPersonalVoiceProfileSummary,
    TalosPersonalVoiceStatus,
    TalosSpeechEngine,
} from '@/lib/voice/personalVoiceContracts'
import type { TalosSpeakOptions, TalosSpeechService } from '@/services/speech'

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
    // ⭐⭐⭐ Fase 5, Blocco 3b — installazione durevole del modello.
    installManifest(): Promise<{
        engineBuild: string
        artifacts: Array<{
            repo: string
            revision: string
            modelName: string
            targetDir: string
            files: Array<{ path: string, bytes: number, sha256: string }>
        }>
    }>
    activateModel(): Promise<{ activated: boolean, supported: boolean }>
    recoverModelInstall(): Promise<{ supported: boolean }>
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

    startEnrollmentSession(): Promise<{ resumedSlotIndexes: number[] }>
    stopEnrollmentCapture(): Promise<void>
    startMicLevelPeek(): Promise<void>
    stopMicLevelPeek(): Promise<void>
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
    playCapturedPhrase(options: { slotIndex: number }): Promise<void>
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
    addListener(
        eventName: 'talosVoiceEnrollmentLevel',
        listenerFunc: (event: { level: number }) => void,
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

/**
 * Il manifesto pinnato (Fase 5 Blocco 1), già nella forma che
 * `talosBeginModelTransfer` di `stores/modelTransfers.ts` capisce — un
 * oggetto per artifact, `files` con `bytes`/`sha256` invece di `size`.
 */
export async function talosVoiceModelInstallManifest(): ReturnType<TalosNeuralVoicePlugin['installManifest']> {
    return plugin.installManifest()
}

/**
 * L'attivazione atomica — chiamare solo dopo che ENTRAMBI gli artifact del
 * manifesto sono finiti di scaricare (mai uno prima dell'altro: vedi la
 * nota su `activateModel` lato Kotlin). Chi chiama in anticipo riceve un
 * rifiuto chiaro (`not-downloaded:...`), non un'attivazione a metà.
 */
export async function talosActivateVoiceModel(): Promise<{ activated: boolean, supported: boolean }> {
    return plugin.activateModel()
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

/**
 * Owner 22/8: "riprendere da dove si lascia" dopo un crash - ogni indice qui
 * dentro è una frase già accettata e cifrata su disco
 * (`TalosVoiceEnrollmentSessionStore`), non una da far ri-registrare. Vuoto
 * la prima volta che qualcuno arruola una voce, o dopo un commit/annullamento
 * riuscito (la sessione si cancella allora, non prima).
 */
export async function talosStartVoiceEnrollment(): Promise<{ resumedSlotIndexes: number[] }> {
    return plugin.startEnrollmentSession()
}

export async function talosStopVoiceEnrollmentCapture(): Promise<void> {
    await plugin.stopEnrollmentCapture()
}

/**
 * Owner 22/8: la waveform anche sulla schermata «trova un posto silenzioso»
 * - nessuna frase catturata qui, solo il livello vero
 * (`TalosVoiceRecorder.peekLevel`). Idempotente lato nativo: chiamarlo due
 * volte di fila non apre un secondo microfono.
 */
export async function talosStartMicLevelPeek(): Promise<void> {
    await plugin.startMicLevelPeek()
}

export async function talosStopMicLevelPeek(): Promise<void> {
    await plugin.stopMicLevelPeek()
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

/**
 * Owner 22/8, live sul Pad: «la waveform è assente nel Wizard, ne abbiamo
 * già una nel progetto» (`TalosMicWaveform.vue`). Il livello arriva davvero
 * dal ciclo di lettura di `TalosVoiceRecorder` - un evento per blocco PCM
 * letto durante una cattura in corso, non un numero simulato lato TS. Attivo
 * SOLO durante `talosCaptureVoiceEnrollmentPhrase` - nessun evento fuori da
 * una cattura, per costruzione lato nativo.
 */
export async function talosOnVoiceEnrollmentLevel(
    listener: (level: number) => void,
): Promise<{ remove(): Promise<void> }> {
    return plugin.addListener('talosVoiceEnrollmentLevel', (event) => listener(event.level))
}

export async function talosCaptureVoiceEnrollmentPhrase(
    slotIndex: number,
    maxDurationMs?: number,
): Promise<TalosVoiceEnrollmentPhraseVerdict> {
    return plugin.captureEnrollmentPhrase({ slotIndex, maxDurationMs })
}

/**
 * Owner 22/8, live sul Pad: riascoltare la frase appena registrata, prima
 * ancora della codifica finale — il PCM grezzo accettato dello slot, non una
 * sintesi. `slotIndex` deve essere uno che `talosCaptureVoiceEnrollmentPhrase`
 * ha già accettato in QUESTA sessione (`enrollmentSlots` lato nativo si
 * svuota a `talosStartVoiceEnrollment`); rifiuta onestamente altrimenti.
 */
export async function talosPlayCapturedEnrollmentPhrase(slotIndex: number): Promise<void> {
    await plugin.playCapturedPhrase({ slotIndex })
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

// --- Reading adapter (Fase 4 block 5) ------------------------------------

/**
 * Every reading pending a native completion event, keyed by the readingId
 * that request went out under. One shared registry, not one per adapter
 * instance: `talosOnPersonalVoiceDone`/`Error` are armed once, the first
 * time any reading needs them - registering a fresh native listener per
 * `speak()` call would leak one every time `useTalosSpeech.ts` builds a new
 * adapter for a reading (§37.1's "stale completion events" class of bug,
 * the one `useTalosSpeech.ts`'s own `speakingId` guard already exists to
 * rule out on the system side).
 */
const pendingPersonalVoiceReadings = new Map<string, { onend?: () => void, onerror?: (reason?: string) => void }>()
let personalVoiceListenersArmed: Promise<void> | null = null

function armPersonalVoiceListeners(): Promise<void> {
    if (!personalVoiceListenersArmed) {
        personalVoiceListenersArmed = Promise.all([
            talosOnPersonalVoiceDone((readingId) => {
                pendingPersonalVoiceReadings.get(readingId)?.onend?.()
                pendingPersonalVoiceReadings.delete(readingId)
            }),
            talosOnPersonalVoiceError((readingId, error) => {
                pendingPersonalVoiceReadings.get(readingId)?.onerror?.(error)
                pendingPersonalVoiceReadings.delete(readingId)
            }),
        ]).then(() => undefined)
    }
    return personalVoiceListenersArmed
}

/**
 * Shaped exactly like `TalosSpeechService` (`services/speech.ts`) so
 * `useTalosSpeech.ts` can hold either behind the same variable and call
 * `.speak()`/`.stop()` without knowing which engine it got - the router
 * (`personalVoiceRouter.ts`) is what decided that, once, before this
 * function was ever called.
 *
 * ⛔ `queue: 'add'` is accepted for contract parity but not yet honored:
 * `TalosVoiceHost.submitSpeakStreamingWithReference` invalidates whatever
 * generation is active the moment a new one starts (§14's single mutable
 * generation, not a FIFO) - there is no "play after the current one
 * finishes" mode on the native side today. A caller that truly needs
 * sentence-by-sentence queuing (`useTalosSpeech.ts`'s `seguiIlTesto`) must
 * not route through this adapter yet; `toggle`'s single-utterance read is
 * the door this closes today, documented, not silently pretended away.
 */
export function talosPersonalVoiceSpeechAdapter(profileId: string): TalosSpeechService {
    return {
        supported: () => true,
        voices: () => [],
        async speak(text: string, options: TalosSpeakOptions = {}): Promise<void> {
            await armPersonalVoiceListeners()
            const readingId = `personal-${Date.now()}-${Math.random().toString(36).slice(2)}`
            if (options.onend || options.onerror) {
                pendingPersonalVoiceReadings.set(readingId, { onend: options.onend, onerror: options.onerror })
            }
            const result = await talosSpeakWithPersonalVoice({
                text,
                profileId,
                readingId,
                rate: options.rate ?? 1,
                pitch: options.pitch ?? 1,
                queue: options.queue,
            })
            if (!result.accepted) {
                pendingPersonalVoiceReadings.delete(readingId)
                options.onerror?.(result.reason)
            }
        },
        stop(): void {
            void talosStopPersonalVoice()
        },
    }
}

/**
 * The whole routing decision AND the personal-voice call, in one place -
 * moved here (rather than living inline in `useTalosSpeech.ts`) purely to
 * keep that composable's own bundled size out of the chat screen's eager
 * initial-load chunk: `useTalosSpeech.ts` sits in the chunk-size gate's
 * budget, this module does not (`talosSpeakWithPersonalVoice`'s door is
 * already reached only through a dynamic `import()`). Behavior is
 * identical either way - blueprint §37.1's Router rules stay in
 * `personalVoiceRouter.ts`, called from here, not reimplemented.
 *
 * Returns `true` when the personal engine took the reading (the caller
 * speaks nothing else); `false` means the caller must fall back to the
 * system voice - `engine !== 'personal'`, no profile chosen, or the
 * personal engine reported unready, all read the same way to a caller
 * that only needs to know "did this happen or not".
 */
export async function talosSpeakForReading(
    engine: TalosSpeechEngine,
    personalProfileId: string | null,
    text: string,
    options: { rate: number, pitch: number, onend?: () => void, onerror?: (reason?: string) => void },
): Promise<boolean> {
    if (engine !== 'personal') return false
    const route = await planTalosVoiceReading(engine, personalProfileId, talosPersonalVoiceStatus)
    if (route.engine !== 'personal' || !route.profileId) return false
    await talosPersonalVoiceSpeechAdapter(route.profileId).speak(text, options)
    return true
}
