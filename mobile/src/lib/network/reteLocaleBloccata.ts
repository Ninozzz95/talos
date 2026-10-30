import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * ASS-148 (parte Ollama): se la persona ha tolto «Rete locale» a TALOS (Android 17). Lo dice il nativo
 * (`TalosPrivilegePlugin.localNetwork` → `TalosReteLocale.bloccata`, appop letto, non il permesso: sotto targetSdk 37 il permesso dice
 * sempre «concesso»). Fuori da Android, o se il nativo non risponde, vale «non bloccata»: nel dubbio non si accusa la persona.
 */
type PonteRete = { localNetwork(): Promise<{ blocked?: boolean }>, open(o: { target: string }): Promise<{ opened: boolean }> }
let ponte: PonteRete | null = null

export async function talosReteLocaleBloccata(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    try {
        ponte ??= registerPlugin<PonteRete>('TalosPrivilege')
        return (await ponte.localNetwork()).blocked === true
    } catch {
        return false
    }
}

/** Il pulsante «Apri i permessi» della scheda d'errore: la pagina dei permessi di TALOS, dove sta «Rete locale». */
export async function talosApriPermessiApp(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    try {
        ponte ??= registerPlugin<PonteRete>('TalosPrivilege')
        return (await ponte.open({ target: 'app-permissions' })).opened === true
    } catch {
        return false
    }
}
