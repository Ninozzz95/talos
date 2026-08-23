import { registerPlugin } from '@capacitor/core'
import { planTalosVoiceReading } from '@/lib/voice/personalVoiceRouter'
import type {
    TalosPersonalVoiceProfileSummary,
    TalosPersonalVoiceStatus,
    TalosSpeechEngine,
    TalosVoiceReadingSource,
} from '@/lib/voice/personalVoiceContracts'
import type { TalosSpeakOptions, TalosSpeechService } from '@/services/speech'

export interface TalosVoiceEnrollmentStageMetric {
    stage: string
    startedAtNs: number
    durationNs: number
    threadName: string
    inputFrames?: number
    outputSamples?: number
}

export interface TalosVoiceEnrollmentBuildResult {
    backend: 'pocket-v2'
    profileSchemaVersion: 2
    sourceSampleRate: number
    sourceSamples: number
    referenceSamples: number
    referenceDurationMs: number
    conditioningFrames: number
    conditioningDimension: number
    enrollmentDurationMs: number
    stages: TalosVoiceEnrollmentStageMetric[]
}

export interface TalosPocketModelEvidence {
    supported: boolean
    installed: boolean
    failure?: string
    backend?: 'pocket-v2'
    engineBuild?: string
    modelState?: 'ready' | 'missing' | 'corrupt' | 'unverified'
    verifiedFiles?: number
    cacheHit?: boolean
    verificationDurationMs?: number
}

export interface TalosPocketInstallStageMetric {
    stage: string
    startedAtNs: number
    durationNs: number
    threadName: string
    outcome: string
    inputFiles?: number
    outputFiles?: number
    detail?: string
}

export interface TalosPocketModelOperationResult extends TalosPocketModelEvidence {
    activated: boolean
    stages: TalosPocketInstallStageMetric[]
}

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
    status(): Promise<TalosPocketModelEvidence>
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
    activateModel(): Promise<TalosPocketModelOperationResult>
    recoverModelInstall(): Promise<TalosPocketModelOperationResult>
    profiles(): Promise<{ profiles: TalosPersonalVoiceProfileSummary[] }>
    renameProfile(options: { profileId: string, name: string }): Promise<void>
    deleteProfile(options: { profileId: string }): Promise<void>
    speak(options: {
        text: string
        profileId: string
        readingId: string
        utteranceId?: string
        rate: number
        pitch: number
        queue?: 'flush' | 'add'
        traceId?: string
        source?: TalosVoiceReadingSource
        locale?: string
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
    }): Promise<TalosVoiceEnrollmentBuildResult>
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
        const pocketEvidence = {
            ...(status.backend !== undefined ? { backend: status.backend } : {}),
            ...(status.engineBuild !== undefined ? { engineBuild: status.engineBuild } : {}),
            ...(status.modelState !== undefined ? { modelState: status.modelState } : {}),
            ...(status.verifiedFiles !== undefined ? { verifiedFiles: status.verifiedFiles } : {}),
            ...(status.cacheHit !== undefined ? { cacheHit: status.cacheHit } : {}),
            ...(status.verificationDurationMs !== undefined
                ? { verificationDurationMs: status.verificationDurationMs }
                : {}),
        }
        if (!status.installed) {
            return {
                supported: status.supported,
                installed: false,
                ready: false,
                active: false,
                failure: status.failure,
                ...pocketEvidence,
            }
        }
        const profiles = await talosPersonalVoiceProfiles()
        return {
            supported: status.supported,
            installed: true,
            ready: profiles.some((profile) => profile.compatible),
            active: false,
            failure: status.failure,
            ...pocketEvidence,
        }
    } catch {
        return { supported: false, installed: false, ready: false, active: false }
    }
}

/**
 * Il manifesto pinnato (Fase 5 Blocco 1), già nella forma che
 * `talosBeginModelTransfer` di `stores/modelTransfers.ts` capisce — un
 * un artifact Pocket, `files` con `bytes`/`sha256` invece di `size`.
 */
export async function talosVoiceModelInstallManifest(): ReturnType<TalosNeuralVoicePlugin['installManifest']> {
    return plugin.installManifest()
}

/**
 * L'attivazione atomica — chiamare solo dopo che l'artifact Pocket è finito
 * di scaricare. Il nativo ricontrolla dimensione e SHA-256 sia in staging
 * sia dopo la promozione prima di rimuovere cache e rollback.
 */
export async function talosActivateVoiceModel(): Promise<TalosPocketModelOperationResult> {
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
    utteranceId?: string
    rate: number
    pitch: number
    queue?: 'flush' | 'add'
    traceId?: string
    source?: TalosVoiceReadingSource
    locale?: string
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
}): Promise<TalosVoiceEnrollmentBuildResult> {
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
    options: {
        rate: number
        pitch: number
        onend?: () => void
        onerror?: (reason?: string) => void
        readingId?: string
        queue?: 'flush' | 'add'
        traceId?: string
        source?: TalosVoiceReadingSource
        locale?: string
    },
): Promise<boolean> {
    if (engine !== 'personal') return false
    const route = await planTalosVoiceReading(engine, personalProfileId, talosPersonalVoiceStatus)
    if (route.engine !== 'personal' || !route.profileId) return false
    /**
     * ⛔⛔⛔ 22/8, owner, riprodotto live: la preferenza salvata puntava a un
     * profilo che nel frattempo NON ESISTE PIÙ (rinominato/ricreato da
     * un'altra sessione - misurato: `plugin.profiles()` non conteneva più
     * quell'id, `status.ready` era comunque `true` perché UN ALTRO profilo
     * compatibile esisteva). Il router sopra controlla solo "esiste ALMENO
     * un profilo pronto da qualche parte", mai il profilo SPECIFICO scelto
     * - la stessa lacuna già chiusa lato UI in `selectedVoice` di
     * `TalosMobileVoiceSettings.vue`, qui ancora aperta.
     *
     * Prima di questa riga: `talosPersonalVoiceSpeechAdapter(...).speak()`
     * chiamava `onerror` per un rifiuto SINCRONO (`accepted:false,
     * reason:"profileNotFound"`) e questa funzione tornava comunque `true`
     * - "gestito", niente ripiego - lasciando SOLO il toast generico
     * "La lettura non è partita" su una lettura che aveva ancora un
     * ripiego onesto disponibile (`toggle()` in `useTalosSpeech.ts` salta
     * il sistema quando questa funzione torna `true`).
     *
     * ⇒ Confermato con ricerca web (pattern di resilienza standard - un
     * rifiuto "risorsa non trovata" è concettualmente un 404: non si
     * ritenta, si reindirizza subito a un percorso alternativo, mai dopo
     * che l'operazione è già a metà con effetti collaterali in corso): non
     * si passa più dall'adapter condiviso qui (quello resta corretto per
     * chi lo chiama sapendo di non avere un ripiego, come il pulsante
     * "Ascolta" di ogni profilo) - si chiama `talosSpeakWithPersonalVoice`
     * direttamente, si legge `accepted` PRIMA di decidere, e un rifiuto
     * immediato torna `false` - il chiamante ripiega DAVVERO sul sistema,
     * silenziosamente, come già promette la doc sopra ("false means the
     * caller must fall back"). Un fallimento che arriva DOPO
     * l'accettazione (a metà generazione) resta un errore mostrato: a
     * quel punto non c'è più un ripiego pulito da offrire.
     */
    const readingId = options.readingId ?? `personal-reading-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const utteranceId = `${readingId}-u-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await armPersonalVoiceListeners()
    if (options.onend || options.onerror) {
        // Arm before crossing the bridge: a very short native utterance may
        // complete before the accepted promise returns to JavaScript.
        pendingPersonalVoiceReadings.set(utteranceId, { onend: options.onend, onerror: options.onerror })
    }
    try {
        const result = await talosSpeakWithPersonalVoice({
            text,
            profileId: route.profileId,
            readingId,
            utteranceId,
            rate: options.rate,
            pitch: options.pitch,
            queue: options.queue,
            traceId: options.traceId,
            source: options.source,
            locale: options.locale,
        })
        if (!result.accepted) {
            pendingPersonalVoiceReadings.delete(utteranceId)
            return false
        }
    } catch {
        pendingPersonalVoiceReadings.delete(utteranceId)
        return false
    }
    return true
}
