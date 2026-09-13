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
    /** Il profilo che la preferenza salvata indica — `null` se non ne e' stato scelto nessuno, o se lo store non era leggibile. */
    selectedProfileId: string | null
    /**
     * Lo stato del profilo SCELTO, che `compatibleProfileCount` non dice:
     * `'nessuno'` (preferenza vuota), `'assente'` (l'id salvato non esiste
     * piu' fra i profili), `'incompatibile'` (esiste ma il router nativo lo
     * rifiuta), `'pronto'`. `null` quando non si e' potuto stabilire.
     *
     * ⛔ E' la quarta domanda che questo modulo esiste per separare, ed era
     * l'unica ancora senza risposta: «un profilo pronto c'e'» e «QUELLO
     * scelto e' pronto» sono fatti diversi, e il secondo e' quello che
     * decide se la chat parlera'.
     */
    selectedProfileState: 'nessuno' | 'assente' | 'incompatibile' | 'pronto' | null
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
            selectedProfileId: null, selectedProfileState: null,
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

    /**
     * ⛔ Lo store si legge in modo pigro e difensivo: questa sonda gira
     * anche in contesti dove Pinia potrebbe non essere attiva, e una sonda
     * che ESPLODE non e' una diagnosi. Non-leggibile si dichiara `null`,
     * che e' diverso da «nessun profilo scelto».
     */
    let selectedProfileId: string | null = null
    let storeLetto = false
    try {
        const { useSettingsStore } = await import('@/stores/settings')
        selectedProfileId = useSettingsStore().state.voice.personal_profile_id
        storeLetto = true
    } catch {
        selectedProfileId = null
        storeLetto = false
    }
    const selectedProfileState = !storeLetto
        ? null
        : selectedProfileId === null
            ? 'nessuno' as const
            : profiles.some((profile) => profile.id === selectedProfileId && profile.compatible)
                ? 'pronto' as const
                : profiles.some((profile) => profile.id === selectedProfileId)
                    ? 'incompatibile' as const
                    : 'assente' as const
    steps.push(`selezionato:${selectedProfileState ?? 'ignoto'}`)

    const diario = talosPersonalVoiceDiario()
    steps.push(`diario:${diario.length}`)

    /**
     * ⛔ Il modello puo' essere perfetto e la voce restare muta lo stesso:
     * quando il nativo non lamenta niente ma il profilo SCELTO non e'
     * utilizzabile, e' quello il guasto, e va detto nella riga che il
     * Doctor mostra SEMPRE — non solo in `trace`, che si vede unicamente
     * con «Mostra dettagli tecnici» acceso.
     */
    const selectedFailure = status?.failure
        ? null
        : selectedProfileState === 'incompatibile'
            ? `il profilo vocale scelto non e' compatibile col codec installato adesso (id ${selectedProfileId})`
            : selectedProfileState === 'assente'
                ? `il profilo vocale scelto non esiste piu' (id ${selectedProfileId})`
                : null

    return {
        registered,
        supported: status?.supported ?? false,
        installed: status?.installed ?? false,
        ready: status?.ready ?? false,
        backend: status?.backend ?? null,
        engineBuild: status?.engineBuild ?? null,
        modelState: status?.modelState ?? null,
        failure: status?.failure ?? selectedFailure ?? (status ? null : 'status probe failed'),
        profileCount: profiles.length,
        compatibleProfileCount,
        selectedProfileId,
        selectedProfileState,
        diario,
        trace: steps.join(' · '),
        error: status ? null : 'status probe failed',
    }
}
