/**
 * N15 — c'è il flusso nativo (`TalosFlussoHttp`)? Sta da solo, fuori da `providers/`, perché lo chiede anche il registro dei
 * fornitori, che non deve tirarsi dietro nessun fornitore nel pacchetto d'avvio. Sul web e sulle build senza il plugin la
 * risposta è no, e tutto resta sulla strada di sempre.
 */
import { Capacitor } from '@capacitor/core'

export function talosFlussoNativoDisponibile(): boolean {
    try {
        return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TalosFlussoHttp')
    } catch {
        return false
    }
}
