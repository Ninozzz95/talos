/**
 * ⭐ A3-84 seconda parte (owner 25/09/2026) — lo stato condiviso di «nuova risposta»: il registro delle chat viste
 * (sul telefono, nelle Preferenze) e la chat che stai guardando adesso. La logica è pura in `lib/chat/chatNovita.ts`.
 *
 * Chi guarda una chat lo dice (`talosGuardaChat`, dalla schermata della chat): finché la guardi non è «nuova», e
 * ogni risposta che arriva sotto i tuoi occhi la segna vista. L'elenco e la barra laterale chiedono `talosChatNuova`.
 *
 * ⛔ Le Preferenze si caricano a richiesta: questo modulo sta vicino al pacchetto d'avvio e il tetto
 * (`scripts/verify-initial-chunk.mjs`) vuole peso vero solo dove serve.
 */
import { readonly, ref } from 'vue'
import {
    talosLeggiRegistroViste,
    talosNuovaRisposta,
    talosPotaRegistro,
    talosSegnaVista,
    type TalosArchivioViste,
    type TalosRegistroViste,
} from '@/lib/chat/chatNovita'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'

const CHIAVE = 'talos.chat.viste.v1'

const registro = ref<TalosRegistroViste | null>(null)
const guardata = ref<string | null>(null)
let caricamento: Promise<void> | null = null
let archivioScelto: TalosArchivioViste | null = null

async function archivio(): Promise<TalosArchivioViste> {
    if (archivioScelto) return archivioScelto
    const { Preferences } = await import('@capacitor/preferences')
    archivioScelto = {
        leggi: async () => (await Preferences.get({ key: CHIAVE })).value ?? null,
        scrivi: async (valore) => { await Preferences.set({ key: CHIAVE, value: valore }) },
    }
    return archivioScelto
}

export const talosRegistroNovita = readonly(registro)
export const talosChatGuardata = readonly(guardata)

export function talosCaricaNovita(): Promise<void> {
    caricamento ??= (async () => {
        registro.value = await talosLeggiRegistroViste(await archivio(), new Date())
    })()
    return caricamento
}

/** La chat è «nuova» per chi la mostra in un elenco. Finché il registro non è caricato, niente novità inventate. */
export function talosChatNuova(sessione: TalosLocalChatSession): boolean {
    return registro.value !== null && talosNuovaRisposta(sessione, registro.value, guardata.value)
}

/**
 * La segna vista adesso e la scrive sul telefono. `vive` (le chat che esistono) pota le cancellate. Un archivio che
 * non scrive non ferma niente: al peggio la chat torna «nuova» al prossimo avvio.
 */
export async function talosSegnaChatVista(id: string, vive?: ReadonlySet<string>): Promise<void> {
    await talosCaricaNovita()
    let prossimo = talosSegnaVista(registro.value!, id, new Date())
    if (vive) prossimo = talosPotaRegistro(prossimo, vive)
    registro.value = prossimo
    await (await archivio()).scrivi(JSON.stringify(prossimo)).catch(() => undefined)
}

/** Chi apre una chat lo dice (e la segna vista); `null` quando smette di guardarla. */
export function talosGuardaChat(id: string | null, vive?: ReadonlySet<string>): Promise<void> {
    guardata.value = id
    return id ? talosSegnaChatVista(id, vive) : Promise.resolve()
}

/** Solo per le prove: un archivio finto e lo stato da capo. */
export function __talosNovitaPerLeProve(finto: TalosArchivioViste | null): void {
    archivioScelto = finto
    registro.value = null
    guardata.value = null
    caricamento = null
}
