import { registerPlugin } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'
import type { TalosDeviceToolSources } from '@/lib/tools/deviceTools'

/**
 * Il ponte fra i nove tool del telefono e i due plugin nativi.
 *
 * ## ⛔ Perché fuori da Android non finge
 *
 * In un browser — lo sviluppo, i test, un domani il desktop — non c'è nessun
 * telefono da toccare. La tentazione è restituire `done: true` per «non dare
 * fastidio»: sarebbe la bugia peggiore del catalogo, perché il modello direbbe
 * alla persona «fatto» di cose che non sono successe, e la persona imparerebbe
 * a non fidarsi di **tutti** i tool, non solo di questi.
 *
 * Qui la risposta è `done: false` con un motivo che il modello sa usare. La
 * stessa disciplina del Pad senza motore di vibrazione: MISURATO il 2026-08-08,
 * la chiamata non fallisce, semplicemente non succede niente — e va detto.
 *
 * ## Perché i nomi non coincidono tutti
 *
 * `openSettingsScreen` sul lato Kotlin, `openSettings` sul lato tool: il nome
 * nativo dice cosa fa Android, il nome del tool dice cosa chiede il modello.
 * L'adattamento sta qui e in un posto solo.
 */

interface PonteDispositivo {
    vibrate(options: { milliseconds: number }): Promise<{ done: boolean, reason?: string, appliedMs: number }>
    torch(options: { on: boolean }): Promise<{ done: boolean, reason?: string }>
    volume(options: { stream: string, percent?: number }): Promise<{ done: boolean, reason?: string, percent: number }>
    alarm(options: { hour?: number, minute?: number, seconds?: number, label?: string }): Promise<{ done: boolean, reason?: string }>
    openApp(options: { package: string }): Promise<{ done: boolean, reason?: string }>
    /**
     * Le app avviabili, `Etichetta<TAB>pacchetto` per riga.
     *
     * ⛔ Sta QUI e non nel privilegiato per una ragione misurata: passa dal
     * `PackageManager` dell'app con le `<queries>` già dichiarate, quindi non
     * vuole nessuna shell e funziona su un telefono dove il ponte non c'è.
     */
    listApps(): Promise<{ done: boolean, reason?: string, output?: string, count?: number }>
    openSettingsScreen(options: { action: string, forThisApp: boolean }): Promise<{ done: boolean, reason?: string }>
    compose(options: { kind: string, value: string, text?: string }): Promise<{ done: boolean, reason?: string }>
    status(): Promise<Record<string, unknown>>
    wallpaper(options: { imageBase64: string, where: string }): Promise<{ done: boolean, reason?: string, appliedTo: string }>
    keepAwake(options: { on: boolean }): Promise<{ done: boolean, reason?: string, on: boolean }>
    /**
     * ⭐ Media: `playing` è la parte che conta.
     *
     * Non è un `done` travestito — è lo stato **riletto dopo** l'invio del tasto.
     * Un tasto media senza sessione attiva va nel vuoto senza fallire, quindi
     * chi chiama deve poter dire «l'ho chiesto, e adesso non suona» invece di
     * «fatto». Vedi il commento nel plugin nativo.
     */
    media(options: { action: string }): Promise<{ done: boolean, reason?: string, playing: boolean, action?: string }>
}

interface PonteVoce {
    speak(options: { text: string }): Promise<{ spoken: boolean, reason?: string }>
    stop(): Promise<void>
    status(): Promise<{ available: boolean, speaking: boolean, silenced: boolean }>
}

export const TalosDeviceBridge = registerPlugin<PonteDispositivo>('TalosDevice')
export const TalosSpeechBridge = registerPlugin<PonteVoce>('TalosSpeech')

/** Il motivo unico per «qui non c'è un telefono», scritto una volta sola. */
const FUORI_DA_ANDROID = 'not-on-this-platform'

function nonQui<T extends object>(extra: T) {
    return { done: false, reason: FUORI_DA_ANDROID, ...extra }
}

/**
 * ⛔ Restituisce `null` quando non siamo su Android, e non un oggetto che dice
 * sempre di no: il toolset salta l'intero gruppo, così il modello non riceve
 * nemmeno gli schemi di nove tool che non potrebbero funzionare. Un tool
 * offerto e sempre fallimentare costa token a ogni turno e insegna al modello
 * ad ignorare una capacità che altrove funziona.
 */
/**
 * ⛔ `Omit` di `findImage`/`availableImages`, e non e' pigrizia di tipi: questo
 * file conosce il TELEFONO, non la Libreria. La risoluzione di un'immagine dal
 * nome vive nel controller, dove vive gia' per la modifica delle immagini, e da
 * li' viene aggiunta. Dichiararla qui vorrebbe dire o duplicarla o farsi passare
 * mezzo controller — e la duplicazione e' esattamente cio' che questa firma
 * impedisce.
 */
export type TalosDeviceHardwareSources =
    Omit<TalosDeviceToolSources, 'findImage' | 'availableImages'>

export function createTalosDeviceSources(): TalosDeviceHardwareSources | null {
    if (!Capacitor.isNativePlatform()) return null

    return {
        async vibrate(milliseconds) {
            try {
                return await TalosDeviceBridge.vibrate({ milliseconds })
            }
            catch {
                return nonQui({ appliedMs: 0 })
            }
        },
        async torch(on) {
            try {
                return await TalosDeviceBridge.torch({ on })
            }
            catch {
                return nonQui({})
            }
        },
        async volume(stream, percent) {
            try {
                return await TalosDeviceBridge.volume({ stream, percent })
            }
            catch {
                return nonQui({ percent: 0 })
            }
        },
        async alarm(input) {
            try {
                return await TalosDeviceBridge.alarm(input)
            }
            catch {
                return nonQui({})
            }
        },
        async openApp(packageName) {
            try {
                return await TalosDeviceBridge.openApp({ package: packageName })
            }
            catch {
                return nonQui({})
            }
        },
        async openSettings(action, forThisApp) {
            try {
                return await TalosDeviceBridge.openSettingsScreen({ action, forThisApp })
            }
            catch {
                return nonQui({})
            }
        },
        async compose(kind, value, text) {
            try {
                return await TalosDeviceBridge.compose({ kind, value, text })
            }
            catch {
                return nonQui({})
            }
        },
        async status() {
            try {
                return await TalosDeviceBridge.status()
            }
            catch {
                return { available: false, reason: FUORI_DA_ANDROID }
            }
        },
        async wallpaper(imageBase64, where) {
            try {
                return await TalosDeviceBridge.wallpaper({ imageBase64, where })
            }
            catch {
                return nonQui({ appliedTo: where })
            }
        },
        async keepAwake(on) {
            try {
                return await TalosDeviceBridge.keepAwake({ on })
            }
            catch {
                return nonQui({ on })
            }
        },
        async media(action) {
            try {
                return await TalosDeviceBridge.media({ action })
            }
            catch {
                // ⛔ Fuori dal telefono non suona niente, e dirlo `playing: false`
                // e' vero: non e' un ripiego, e' la risposta giusta.
                return nonQui({ playing: false })
            }
        },
        async speak(text) {
            try {
                return await TalosSpeechBridge.speak({ text })
            }
            catch {
                return { spoken: false, reason: 'unavailable' }
            }
        },
    }
}
