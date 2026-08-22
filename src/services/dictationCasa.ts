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
            /**
             * ⛔⛔ IL RESPIRO NON CANCELLA QUELLO CHE HAI DETTO.
             *
             * Con la sessione a segmenti il motore chiude un SEGMENTO a ogni
             * pausa e riparte da zero: le parziali che arrivano dopo NON
             * contengono piu' il pezzo di prima. Senza accumulare, ogni respiro
             * riscriverebbe la bozza dall'inizio — la dettatura lunga
             * diventerebbe l'ultima frase detta.
             */
            let finito = ''
            const insieme = (parziale: string): string =>
                (finito && parziale ? `${finito} ${parziale}` : finito || parziale)
            await TalosDictationBridge.removeAllListeners()
            await TalosDictationBridge.addListener('talosDictationPartial', ((d: { text?: string }) => {
                if (attiva && d.text) events.onPartial(insieme(d.text))
            }) as never)
            await TalosDictationBridge.addListener('talosDictationSegment', ((d: { text?: string }) => {
                if (!attiva || !d.text) return
                finito = insieme(d.text)
                events.onPartial(finito)
            }) as never)
            await TalosDictationBridge.addListener('talosDictationResult', ((d: { text?: string }) => {
                if (attiva && d.text) events.onPartial(insieme(d.text))
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
            // ⭐ Il VOLUME. Owner 2026-08-12: la waveform deve reagire al suono,
            // e questo e' l'unico posto dell'app dove il suono passa davvero.
            await TalosDictationBridge.addListener('talosDictationLevel', ((d: { db?: number }) => {
                if (attiva && typeof d.db === 'number') events.onLevel?.(d.db)
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
                        /**
                         * ⛔⛔ LA RIGA CHE MANCAVA, e per cui l'assistente non
                         * ascoltava nessuno.
                         *
                         * Owner 2026-08-11: «l'assistente parte, dice che
                         * ascolta, io parlo e non succede nulla». Misurato sul
                         * Pad in `logcat`, non dedotto:
                         *
                         *     onMicrophoneOpened          20:44:42.625
                         *     onMicrophoneCloseRequested  20:44:44.625  ← 2000 ms
                         *     NO_SPEECH_DETECTED          20:44:44.786
                         *
                         * Duemila millisecondi netti di finestra: il tempo di
                         * default del motore. `silenceMillis` esisteva nel
                         * plugin nativo, nel servizio e nel composable — e si
                         * fermava QUI, perché l'oggetto costruito per il ponte
                         * non lo copiava. Un valore che attraversa quattro
                         * strati e muore all'ultimo passo.
                         *
                         * ⛔ E ha avvelenato anche la diagnosi: chiedendo prima
                         * 1600 e poi 6000 ms ho misurato 2000 e 1750, e ne avevo
                         * concluso che Android ignorasse le chiavi. Non le
                         * ignorava: non le riceveva. Due misure diverse dello
                         * stesso identico caso sembrano una prova, e non lo
                         * sono — la differenza va provata DA DOVE PARTE, non
                         * solo dove arriva.
                         */
                        ...(options.silenceMillis ? { silenceMillis: options.silenceMillis } : {}),
                        ...(options.minimumMillis ? { minimumMillis: options.minimumMillis } : {}),
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

