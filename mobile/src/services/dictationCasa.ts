import { Capacitor, registerPlugin } from '@capacitor/core'
import { talosLogDeviceIssue, talosWithTimeout } from '@/lib/talosDeviceLog'
import {
    talosDettaturaAnnota,
    talosEsitoDettatura,
    type TalosDictationEngine,
} from '@/services/dictation'

/**
 * ⭐⭐ IL RICONOSCITORE DI CASA.
 *
 * MISURATO nel sorgente di `@capgo/capacitor-speech-recognition`: dieci
 * `putExtra`, e nessuno di rilevamento o cambio lingua. Passa `EXTRA_LANGUAGE`,
 * una e una sola ⇒ la lingua dinamica non è una configurazione che ci
 * mancava, è una chiave che da lì non esiste. Il nostro plugin le mette tutte.
 *
 * ⛔ Il plugin di terzi RESTA come rete: se il nostro non risponde (una ROM che
 * non registra il servizio, un dispositivo senza riconoscimento) si scende di
 * un gradino invece di lasciare il microfono morto.
 */
const TalosDictationBridge = registerPlugin<{
    available(): Promise<{ available: boolean; onDevice: boolean; canDetectLanguage: boolean }>
    languages(): Promise<{ languages: string[]; preferred: string; system: string }>
    start(options: Record<string, unknown>): Promise<{ started: boolean }>
    stop(): Promise<void>
    cancel(): Promise<void>
    checkPermissions(): Promise<Record<string, string>>
    requestPermissions(): Promise<Record<string, string>>
    addListener(event: string, fn: (data: never) => void): Promise<{ remove(): Promise<void> }>
    removeAllListeners(): Promise<void>
}>('TalosDictation')

/** Le lingue che il DISPOSITIVO dichiara — non un elenco scritto da noi. */
export async function talosLingueDichiarate(): Promise<{
    languages: string[]
    preferred: string
    system: string
}> {
    // Fuori dal dispositivo non c'e' nessun servizio vocale che dichiari
    // qualcosa: si risponde con la lingua del browser, che e' l'unico fatto
    // vero disponibile.
    if (!Capacitor.isNativePlatform()) {
        const suo = typeof navigator === 'undefined' ? 'en-US' : navigator.language
        return { languages: [], preferred: suo, system: suo }
    }
    try {
        return await talosWithTimeout(
            TalosDictationBridge.languages(),
            3000,
            'TALOS_DICTATION_LANGUAGES',
        )
    } catch (error) {
        talosLogDeviceIssue('TALOS_DICTATION_LANGUAGES', String(error))
        return { languages: [], preferred: '', system: '' }
    }
}

export function creaMotoreDiCasa(): TalosDictationEngine {
    let attiva = false
    return {
        async supported() {
            try {
                const esito = await talosWithTimeout(
                    TalosDictationBridge.available(),
                    3000,
                    'TALOS_DICTATION_AVAILABLE',
                )
                return esito.available !== false
            } catch (error) {
                talosLogDeviceIssue('TALOS_DICTATION_AVAILABLE', String(error))
                return false
            }
        },
        async requestPermission() {
            try {
                const stato = await talosWithTimeout(
                    TalosDictationBridge.requestPermissions(),
                    30000,
                    'TALOS_DICTATION_PERMISSION',
                )
                return stato.microfono === 'granted'
            } catch (error) {
                talosLogDeviceIssue('TALOS_DICTATION_PERMISSION', String(error))
                return false
            }
        },
        async start(events, options = {}) {
            talosDettaturaAnnota('avvio:casa')
            attiva = true
            await TalosDictationBridge.removeAllListeners()
            await TalosDictationBridge.addListener('talosDictationPartial', ((d: { text?: string }) => {
                if (attiva && d.text) events.onPartial(d.text)
            }) as never)
            await TalosDictationBridge.addListener('talosDictationResult', ((d: { text?: string }) => {
                if (attiva && d.text) events.onPartial(d.text)
            }) as never)
            await TalosDictationBridge.addListener('talosDictationState', ((d: { state?: string }) => {
                talosDettaturaAnnota(`stato:${d.state ?? '?'}${attiva ? '' : ' (sessione gia chiusa)'}`)
                if (!attiva) return
                if (d.state === 'ready' || d.state === 'listening') events.onStart?.()
                if (d.state === 'stopped') {
                    attiva = false
                    events.onEnd()
                }
            }) as never)
            await TalosDictationBridge.addListener('talosDictationError', ((d: { code?: string }) => {
                talosDettaturaAnnota(`errore:${d.code ?? '?'}${attiva ? '' : ' (sessione gia chiusa)'}`)
                if (!attiva) return
                attiva = false
                events.onError(talosEsitoDettatura(String(d.code ?? '')))
            }) as never)
            // ⭐ La lingua che il motore ha SENTITO: serve a rispondere e a
            // leggere nella stessa lingua in cui ci hanno parlato.
            await TalosDictationBridge.addListener('talosDictationLanguage', ((d: { language?: string }) => {
                if (attiva && d.language) events.onLanguage?.(d.language)
            }) as never)

            try {
                await talosWithTimeout(
                    TalosDictationBridge.start({
                        partialResults: true,
                        autoLanguage: options.autoLanguage !== false,
                        ...(options.language ? { language: options.language } : {}),
                        ...(options.allowedLanguages?.length
                            ? { allowedLanguages: [...options.allowedLanguages] }
                            : {}),
                    }),
                    10000,
                    'TALOS_DICTATION_START',
                )
            } catch (error) {
                if (!attiva) return
                attiva = false
                await TalosDictationBridge.removeAllListeners().catch(() => undefined)
                talosLogDeviceIssue('TALOS_DICTATION_START', String(error))
                events.onError(talosEsitoDettatura(String(error)))
            }
        },
        async stop() {
            attiva = false
            await TalosDictationBridge.stop().catch(() => undefined)
            await TalosDictationBridge.removeAllListeners().catch(() => undefined)
        },
    }
}

