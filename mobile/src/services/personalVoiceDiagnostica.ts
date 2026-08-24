import { Capacitor } from '@capacitor/core'
import { talosWithTimeout } from '@/lib/talosDeviceLog'
import { talosPersonalVoiceDiario, talosPersonalVoiceProfiles, talosPersonalVoiceStatus } from '@/services/personalVoice'

/**
 * Owner 24/8, terza segnalazione dello stesso difetto: voce codificata,
 * anteprima e chat mute. Il Doctor incollato non aveva UNA riga sulla
 * sintesi — `speech` è solo il riconoscimento — quindi non c'era modo di
 * distinguere "modello non pronto" da "richiesta accettata e mai finita"
 * da "nessun profilo compatibile" senza il Pad. Stesso schema di
 * `talosDictationDiagnostics` (`services/dictationDiagnostica.ts`): ogni
 * passo sondato SEPARATAMENTE e col suo tempo, mai un solo booleano.
 */
export interface TalosPersonalVoiceDiagnostics {
    registered: boolean
    supported: boolean
    installed: boolean
    ready: boolean
    backend: string | null
    engineBuild: string | null
    modelState: string | null
    failure: string | null
    profileCount: number
    compatibleProfileCount: number
    /** Le ultime transizioni (richiesta accettata/rifiutata, done, errore) — vuoto se la voce non è mai stata usata in questa sessione dell'app. */
    diario: readonly string[]
    trace: string
    error: string | null
}

export async function talosPersonalVoiceDiagnostics(): Promise<TalosPersonalVoiceDiagnostics> {
    const steps: string[] = []
    let registered = false
    try {
        registered = Capacitor.isPluginAvailable('TalosNeuralVoice')
    } catch { registered = false }
    steps.push(`registered:${registered}`)

    if (!registered) {
        const failure = 'plugin TalosNeuralVoice NOT registered in the native runtime'
        return {
            registered, supported: false, installed: false, ready: false,
            backend: null, engineBuild: null, modelState: null, failure,
            profileCount: 0, compatibleProfileCount: 0,
            diario: talosPersonalVoiceDiario(), trace: steps.join(' · '), error: failure,
        }
    }

    const status = await talosWithTimeout(talosPersonalVoiceStatus(), 5000, 'TALOS_DOCTOR_VOICE_STATUS')
        .catch(() => null)
    steps.push(status
        ? `status:ok supported:${status.supported} installed:${status.installed} ready:${status.ready}${status.modelState ? ` modelState:${status.modelState}` : ''}`
        : 'status:FAIL')

    const profiles = await talosWithTimeout(talosPersonalVoiceProfiles(), 5000, 'TALOS_DOCTOR_VOICE_PROFILES')
        .catch(() => [])
    const compatibleProfileCount = profiles.filter((profile) => profile.compatible).length
    steps.push(`profiles:${profiles.length} compatible:${compatibleProfileCount}`)

    const diario = talosPersonalVoiceDiario()
    steps.push(`diario:${diario.length}`)

    return {
        registered,
        supported: status?.supported ?? false,
        installed: status?.installed ?? false,
        ready: status?.ready ?? false,
        backend: status?.backend ?? null,
        engineBuild: status?.engineBuild ?? null,
        modelState: status?.modelState ?? null,
        failure: status?.failure ?? (status ? null : 'status probe failed'),
        profileCount: profiles.length,
        compatibleProfileCount,
        diario,
        trace: steps.join(' · '),
        error: status ? null : 'status probe failed',
    }
}
