import { Preferences } from '@capacitor/preferences'
import {
    TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE,
    type TalosLocalBackendPreference,
    parseTalosLocalBackendPreference,
} from '@/lib/models/localBackendChoice'

/**
 * Dove vive la scelta «CPU · GPU · Hexagon» fra un avvio e l'altro — **la sola
 * metà che LEGGE**.
 *
 * ## Perché solo la lettura
 *
 * Il selettore a schermo e la scrittura sono una fase a parte, con il suo
 * proprio sì. Ma il percorso di apertura deve poter **rispettare** una scelta
 * dal primo giorno: se il lettore arrivasse insieme alla schermata, fra le due
 * fasi la direttiva dell'owner resterebbe di nuovo scritta e non percorsa — che
 * è esattamente il difetto che questo lavoro esiste per chiudere.
 *
 * ⇒ Qui c'è il lettore, con la chiave e la forma già fissate; la fase
 * dell'interfaccia aggiunge la scrittura sulla **stessa costante**, non su una
 * seconda stringa scritta a mano.
 *
 * ## Perché nelle Preferences e non nel database cifrato
 *
 * Stessa ragione — e stesso posto — del profilo dei thread
 * (`services/tuningProfileStore.ts`): non è un segreto e non è un dato della
 * persona, è una riga su dove far girare un calcolo. Nel database cifrato
 * sarebbe illeggibile prima dello sblocco, cioè proprio quando il modello si
 * apre per riscaldarsi, e la scelta non varrebbe mai nel momento in cui serve.
 */
export const TALOS_LOCAL_BACKEND_PREFERENCE_KEY = 'talos.engine.backend.v1'

/**
 * La preferenza salvata, o il predefinito (`auto`) se non ce n'è una.
 *
 * ⛔ Non solleva mai: un magazzino illeggibile, un JSON storto o una piattaforma
 * senza Preferences valgono «nessuna scelta», non «apertura fallita». La
 * validazione della forma è di `parseTalosLocalBackendPreference`, che riporta
 * al predefinito qualunque cosa non sia esattamente quella attesa — mai una
 * modalità a metà.
 */
/**
 * ⭐⭐⭐ LA META' CHE MANCAVA — scritta il 2026-09-10.
 *
 * ## Perche' non c'era, e perche' adesso c'e'
 *
 * Il cappello di questo file diceva: *«la sola meta' che LEGGE… il selettore a
 * schermo e la scrittura sono una fase a parte, con il suo proprio si'»*. Quel
 * si' e' arrivato — owner, 10/09: il foglio del backend *«si fa dentro D-KV,
 * adesso»*.
 *
 * ⛔ E fino a questa riga il ramo manuale di `talosDecideLocalBackend` era
 * **codice morto**: `preference.mode === 'manual'` non poteva essere vero,
 * perche' nessuno scriveva mai. L'ordine dell'owner — *«LA SCELTA RESTA
 * ALL'UTENTE»* — non era «non ancora fatto»: era **strutturalmente
 * impossibile**.
 *
 * ## Sulla STESSA costante, non su una seconda stringa
 *
 * `TALOS_LOCAL_BACKEND_PREFERENCE_KEY` e' la chiave che il lettore gia' usa.
 * Scrivere su una stringa battuta a mano qui vorrebbe dire due chiavi che si
 * assomigliano e un giorno divergono, e nessuno che se ne accorga finche' la
 * scelta smette di valere.
 *
 * ⛔ Non solleva mai: una preferenza che non si riesce a salvare non deve
 * impedire di continuare a usare l'app. Torna `false` quando non ha scritto,
 * cosi' chi chiama puo' dirlo invece di far finta.
 */
export async function talosSetLocalBackendPreference(
    preference: TalosLocalBackendPreference,
): Promise<boolean> {
    try {
        await Preferences.set({
            key: TALOS_LOCAL_BACKEND_PREFERENCE_KEY,
            value: JSON.stringify(preference),
        })
        return true
    } catch {
        return false
    }
}

export async function talosStoredLocalBackendPreference(): Promise<TalosLocalBackendPreference> {
    try {
        const { value } = await Preferences.get({ key: TALOS_LOCAL_BACKEND_PREFERENCE_KEY })
        if (!value) return TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE
        return parseTalosLocalBackendPreference(JSON.parse(value) as unknown)
    } catch {
        return TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE
    }
}
