import { Preferences } from '@capacitor/preferences'
import {
    talosMarkTuningFailure,
    talosProfileFor,
    talosStoreProfile,
    type TalosTuningKey,
    type TalosTuningProfile,
} from '@/lib/models/tuningProfile'

/**
 * Dove vive il profilo dei thread misurato.
 *
 * ## Perché nelle Preferences e non nel database
 *
 * Perché non è un segreto e non è un dato dell'utente: sono quattro numeri su
 * come far girare un file. Metterlo nel database cifrato vorrebbe dire che dopo
 * un riavvio, prima dello sblocco, il motore non sa con quanti thread partire —
 * e ripiegherebbe sul punto di partenza derivato ogni volta, cioè il profilo
 * non servirebbe mai nel momento in cui serve.
 *
 * ⛔ E per la stessa ragione **non ci finisce dentro nient'altro**: qui vanno
 * numeri di esecuzione, mai un percorso che riveli quali modelli si hanno... e
 * invece il percorso c'è, perché è ciò che identifica il file. È un compromesso
 * dichiarato: `Preferences` vive nella sandbox dell'app, leggibile solo da chi
 * ha già accesso al dispositivo sbloccato, e la stessa informazione — quali
 * modelli ci sono — si legge comunque elencando la cartella.
 */
const CHIAVE = 'talos.engine.tuning.v1'

async function leggiTutti(): Promise<TalosTuningProfile[]> {
    try {
        const { value } = await Preferences.get({ key: CHIAVE })
        if (!value) return []
        const parsed: unknown = JSON.parse(value)
        return Array.isArray(parsed) ? parsed as TalosTuningProfile[] : []
    } catch {
        // Un magazzino illeggibile è vuoto: si rimisura, che è lento una volta
        // sola. Propagare l'errore impedirebbe di aprire un modello.
        return []
    }
}

async function scriviTutti(profiles: readonly TalosTuningProfile[]): Promise<void> {
    try {
        await Preferences.set({ key: CHIAVE, value: JSON.stringify(profiles) })
    } catch {
        // Non poter ricordare è un peccato, non un guasto: la prossima apertura
        // rimisura.
    }
}

/** Il profilo per questa situazione, o `null` se non ce n'è uno che ne parli. */
export async function talosStoredTuning(key: TalosTuningKey): Promise<TalosTuningProfile | null> {
    return talosProfileFor(await leggiTutti(), key)
}

export async function talosRememberTuning(profile: TalosTuningProfile): Promise<void> {
    await scriviTutti(talosStoreProfile(await leggiTutti(), profile))
}

/**
 * Il motore è caduto con questo profilo.
 *
 * ⛔ Da chiamare quando l'apertura fallisce **dopo** che un profilo è stato
 * applicato — non a ogni errore di generazione. Una configurazione che fa morire
 * il processo non va riprovata all'infinito perché era la più veloce; ma un
 * modello che non entra in memoria non è colpa dei thread.
 */
export async function talosNoteTuningFailure(key: TalosTuningKey): Promise<void> {
    await scriviTutti(talosMarkTuningFailure(await leggiTutti(), key))
}
