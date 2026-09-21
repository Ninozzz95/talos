import { Capacitor } from '@capacitor/core'
import { talosLogDeviceIssue, talosWithTimeout } from '@/lib/talosDeviceLog'
import {
    loadPlugin,
    talosDettaturaDiario,
    webSpeechConstructor,
    type SpeechRecognitionPlugin,
} from '@/services/dictation'

/**
 * ⛔⛔ LA DIAGNOSTICA NON STA NEL GRAFO CHE OGNI AVVIO PAGA.
 *
 * ## Perché è un file suo
 *
 * Questo rapporto lo chiedono in due, e tutti e due si aprono di proposito: il
 * Doctor e il pannello dell'account. Stava dentro `dictation.ts` — che invece la
 * schermata iniziale carica per forza, perché lì c'è il microfono della chat —
 * e quindi ogni persona che apriva TALOS pagava, a ogni avvio, il codice di una
 * schermata di diagnosi che non stava guardando.
 *
 * MISURATO il 12 agosto: il grafo d'avvio era a **601.608 byte** contro un
 * tetto di 601.200. Spostare questo blocco lo riporta sotto senza alzare il
 * tetto — che è la regola: si toglie peso, non si sposta il traguardo.
 *
 * ⛔ E il tetto non è un capriccio: è il tempo che passa fra il tocco
 * sull'icona e la prima cosa che si vede.
 */

export interface TalosDictationDiagnostics {
    buildId: string
    native: boolean
    registered: boolean
    pluginLoaded: boolean
    methods: string[]
    permissionsRaw: string | null
    availableRaw: string | null
    available: boolean | null
    trace: string
    error: string | null
    /** Le ultime transizioni della dettatura, per spiegare un blocco. */
    diario: readonly string[]
}

function talosBuildId(): string {
    // Injected by vite.config.ts `define`; absent in dev/test.
    return typeof __TALOS_BUILD_ID__ !== 'undefined' ? __TALOS_BUILD_ID__ : 'dev'
}

const PLUGIN_METHODS = ['available', 'start', 'stop', 'checkPermissions', 'requestPermissions', 'getPluginVersion', 'addListener', 'removeAllListeners'] as const

export async function talosDictationDiagnostics(): Promise<TalosDictationDiagnostics> {
    const buildId = talosBuildId()
    const native = Capacitor.isNativePlatform()
    if (!native) {
        const webOk = webSpeechConstructor() !== null
        const trace = `build ${buildId} · web speech ${webOk ? 'present' : 'absent'}`
        return {
            buildId, native, registered: webOk, pluginLoaded: webOk, methods: webOk ? ['webSpeech'] : [],
            permissionsRaw: null, availableRaw: null, available: webOk, trace,
            error: webOk ? null : trace,
            diario: talosDettaturaDiario(),
        }
    }

    // F5.3 (owner: "debug più esplicativo") — every step probed SEPARATELY,
    // fenced, timed, and written to the Doctor ring, so a single report pins
    // the exact dying step without adb.
    const steps: string[] = [`build ${buildId}`]
    const failures: string[] = []
    const step = async <T>(name: string, run: () => Promise<T>, ms = 3000): Promise<T | null> => {
        const started = performance.now()
        try {
            const value = await talosWithTimeout(run(), ms, `TALOS_SPEECH_STEP_${name}`)
            steps.push(`${name}:ok(${Math.round(performance.now() - started)}ms)`)
            return value
        } catch (error) {
            const detail = String(error).slice(0, 120)
            const failure = `${name}:FAIL ${detail}`
            steps.push(failure)
            failures.push(failure)
            talosLogDeviceIssue(`TALOS_SPEECH_STEP_${name}`, detail)
            return null
        }
    }

    // Step 0 — is the plugin REGISTERED in the native runtime? Synchronous,
    // cannot hang; false means the native class failed to load and every
    // bridge call to it will die.
    let registered = false
    try {
        registered = Capacitor.isPluginAvailable('SpeechRecognition')
    } catch { registered = false }
    steps.push(`registered:${registered}`)
    if (!registered) {
        const failure = `build ${buildId} · plugin NOT registered in the native runtime`
        talosLogDeviceIssue('TALOS_SPEECH_STEP_registered', failure)
        const trace = steps.join(' · ')
        return {
            buildId, native, registered, pluginLoaded: false, methods: [],
            permissionsRaw: null, availableRaw: null, available: null,
            trace, error: failure,
            diario: talosDettaturaDiario(),
        }
    }

    // Step 1 — resolve the wrapper SYNCHRONOUSLY. It is a thenable Capacitor
    // proxy, so it must NEVER be awaited / wrapped in a promise (that is the
    // R-mic hang: `resolve:FAIL TIMEOUT`). A plain property read is safe and
    // does not touch the bridge; inventory the methods to PROVE it's the real
    // capgo plugin.
    let plugin: SpeechRecognitionPlugin | null = null
    try {
        plugin = loadPlugin()
        steps.push('resolve:ok(sync)')
    } catch (error) {
        const detail = String(error).slice(0, 120)
        const failure = `resolve:FAIL ${detail}`
        steps.push(failure)
        failures.push(failure)
        talosLogDeviceIssue('TALOS_SPEECH_STEP_resolve', detail)
    }
    if (!plugin) {
        const trace = steps.join(' · ')
        return {
            buildId, native, registered, pluginLoaded: false, methods: [],
            permissionsRaw: null, availableRaw: null, available: null,
            trace, error: failures.join(' · ') || trace,
            diario: talosDettaturaDiario(),
        }
    }
    const pluginObj = plugin as unknown as Record<string, unknown>
    const methods = PLUGIN_METHODS.filter((name) => typeof pluginObj[name] === 'function')
    steps.push(`methods:[${methods.join(',')}]`)

    const version = await step('version', () => plugin.getPluginVersion?.() ?? Promise.resolve({ version: 'n/a' }))
    if (version && typeof (version as { version?: string }).version === 'string') {
        steps.push(`v${(version as { version: string }).version}`)
    }

    const permissions = await step('checkPermissions', () => plugin.checkPermissions())
    const permissionsRaw = permissions ? JSON.stringify(permissions) : null
    if (permissionsRaw) steps.push(`perm:${permissionsRaw.slice(0, 80)}`)

    const availability = await step('available', () => plugin.available())
    const availableRaw = availability ? JSON.stringify(availability) : null
    if (availableRaw) steps.push(`avail:${availableRaw.slice(0, 60)}`)

    const report: TalosDictationDiagnostics = {
        buildId,
        native,
        registered,
        pluginLoaded: true,
        diario: talosDettaturaDiario(),
        methods,
        permissionsRaw,
        availableRaw,
        available: availability ? (availability as { available?: boolean }).available === true : null,
        trace: steps.join(' · '),
        error: failures.length > 0 ? failures.join(' · ') : null,
    }
    return report
}
