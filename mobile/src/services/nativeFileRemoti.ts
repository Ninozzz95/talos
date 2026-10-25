/**
 * ⛔ R5.13 scambio di file, fetta F1: il plugin nativo `TalosRemotoFile` (`android/…/remoto/TalosRemotoFilePlugin.kt`), solo
 * nell'app Android. I byte dei file scambiati col PC stanno lì; alla pagina passa un pezzo base64url alla volta.
 * Fuori dall'app (anteprima nel browser, prove) è `null`: chi lo usa lo dice invece di offrire un'azione che non farebbe niente.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { NativoFileRemoti } from '@/lib/remoto/fileRemoti'

export interface TalosFileRemotiNativo extends NativoFileRemoti {
    /** «Apri»: rifiutato (`FILE_NOT_OPENABLE`) per i pacchetti e gli eseguibili. */
    apri(o: { percorsoLocale: string }): Promise<void>
    condividi(o: { percorsoLocale: string }): Promise<void>
    /** Per «Salva in…»: la copia che `TalosFileExport.saveFile` accetta. */
    perSalvare(o: { percorsoLocale: string, nome: string }): Promise<{ percorso: string, byte: number }>
    /** «Togli dal dispositivo»: solo la copia locale. */
    togli(o: { percorsoLocale: string }): Promise<void>
}

let istanza: TalosFileRemotiNativo | null | undefined

export function nativoFileRemoti(): TalosFileRemotiNativo | null {
    if (istanza !== undefined) return istanza
    istanza = Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('TalosRemotoFile')
        ? registerPlugin<TalosFileRemotiNativo>('TalosRemotoFile')
        : null
    return istanza
}
