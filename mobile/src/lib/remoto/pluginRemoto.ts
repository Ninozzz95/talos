/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO: il plugin nativo `TalosRemoto` (`android/…/remoto/TalosRemotoPlugin.kt`), solo nell'app Android.
 * Fuori (anteprima nel browser, prove) è `null`, e la sezione «Computer» lo dice invece di offrire azioni che non farebbero niente.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginComputer } from './computerRemoti'

let istanza: PluginComputer | null | undefined

export function pluginRemoto(): PluginComputer | null {
    if (istanza !== undefined) return istanza
    istanza = Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('TalosRemoto')
        ? registerPlugin<PluginComputer>('TalosRemoto')
        : null
    return istanza
}
