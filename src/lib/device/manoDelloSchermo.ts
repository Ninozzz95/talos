import { TalosSchermoBridge } from '@/lib/device/ponteSchermo'
import type { TalosAzione } from '@/lib/agent/passoDelloSchermo'

/**
 * ⭐ La MANO: le otto azioni del pilota, ognuna alla porta che sa eseguirla.
 *
 * ## ⛔ Perché sono tre porte e non una
 *
 * Il vocabolario del pilota è uno solo, ma sotto ci sono tre meccanismi
 * diversi, e fingere che siano uno li avrebbe fatti sbagliare tutti:
 *
 * | azione                    | chi la esegue                     | ha un indice? |
 * |---------------------------|-----------------------------------|---------------|
 * | tocca · scrivi · scorri   | l'occhio, **sul nodo**            | sì            |
 * | indietro · home           | il servizio, azione **globale**   | no            |
 * | apri_app                  | un intent, niente a che fare      | no            |
 * | attendi                   | nessuno: si aspetta e basta       | no            |
 *
 * Le prime prendono un indice; le altre no. Accettare un indice finto per
 * uniformare le firme è la scusa con cui un giorno passa un indice **sbagliato**
 * — e un tocco finito sull'elemento sbagliato non si annulla.
 */
export interface TalosManoSorgenti {
    /** Aprire un'app: la stessa strada di `device_open_app`, non una seconda. */
    apriApp(nomePacchetto: string): Promise<{ done: boolean, reason?: string }>
    /**
     * L'elenco vero delle app, «Nome<TAB>pacchetto» per riga.
     *
     * ⛔ MISURATO sul Pad il 2026-08-10, prima corsa vera del pilota: il modello
     * ha chiesto `apri_app` con **«Chrome»**, la porta voleva
     * `com.android.chrome`, e la risposta è stata «non installato» — su un
     * telefono dove Chrome c'è. La grammatica prometteva «il nome dell'app» e
     * sotto pretendeva un identificativo: la colpa non è del modello.
     *
     * ⇒ Il nome si RISOLVE con l'elenco che il PackageManager ci dà già con le
     * etichette, invece di far indovinare un id — la stessa lezione di
     * `device_list_apps`: `org.thunderdog.challegram` non dice «Telegram».
     */
    elencoApp(): Promise<string>
    /** L'attesa, iniettata: nei test non deve passare tempo vero. */
    aspetta(millisecondi: number): Promise<void>
}

/**
 * ⛔ Un tetto all'attesa. `attendi` esiste perché una schermata può caricare,
 * non perché il modello possa mettere in pausa il telefono di qualcuno: senza
 * limite, «aspetta» diventa il modo più silenzioso di non finire mai.
 */
export const TALOS_ATTESA_MASSIMA_MS = 5_000

export function creaManoDelloSchermo(sorgenti: TalosManoSorgenti) {
    return async (azione: TalosAzione): Promise<{ fatto: boolean, motivo?: string }> => {
        switch (azione.azione) {
            case 'tocca':
            case 'premiALungo':
            case 'scrivi':
            case 'imposta':
            case 'scorri': {
                if (azione.indice === undefined) return { fatto: false, motivo: 'indiceMancante' }
                const esito = await TalosSchermoBridge.agisci({
                    indice: azione.indice,
                    azione: azione.azione,
                    ...(azione.testo === undefined ? {} : { testo: azione.testo }),
                    /*
                     * ⛔⛔ QUI LA DIREZIONE SI PERDEVA — trovato il 2026-08-16.
                     *
                     * `talosIstruzioneDelPilota` la chiedeva al modello, il
                     * modello la produceva, e questa chiamata non la passava:
                     * il nativo scorreva **sempre in avanti**. «Scorri su» per
                     * tornare in cima a una lista la faceva scendere, e non se
                     * ne accorgeva nessuno perché l'azione RIUSCIVA — solo dal
                     * verso sbagliato.
                     */
                    ...(azione.direzione === undefined ? {} : { direzione: azione.direzione }),
                    ...(azione.valore === undefined ? {} : { valore: azione.valore }),
                })
                return { fatto: esito.fatto, ...(esito.motivo ? { motivo: esito.motivo } : {}) }
            }
            case 'indietro':
            case 'home':
            case 'recenti': {
                const esito = await TalosSchermoBridge.sistema({ azione: azione.azione })
                return { fatto: esito.fatto, ...(esito.motivo ? { motivo: esito.motivo } : {}) }
            }
            case 'apri_app': {
                if (!azione.testo) return { fatto: false, motivo: 'nomeAppMancante' }
                const pacchetto = azione.testo.includes('.')
                    ? azione.testo
                    : talosPacchettoPerNome(await sorgenti.elencoApp(), azione.testo)
                if (!pacchetto) return { fatto: false, motivo: `appNonTrovata: ${azione.testo}` }
                const esito = await sorgenti.apriApp(pacchetto)
                return { fatto: esito.done, ...(esito.reason ? { motivo: esito.reason } : {}) }
            }
            case 'attendi': {
                await sorgenti.aspetta(TALOS_ATTESA_MASSIMA_MS)
                return { fatto: true }
            }
            case 'fine':
                // Il ciclo la intercetta prima: se arriva qui è un difetto nostro,
                // e vale la pena che si veda invece di sembrare riuscita.
                return { fatto: false, motivo: 'fineNonVaEseguita' }
        }
    }
}

/**
 * Il pacchetto di un'app dal suo nome umano, o `null`.
 *
 * ⛔ L'ordine dei tentativi conta: prima l'uguaglianza esatta, poi l'inizio,
 * poi il contenuto. Senza, «Chrome» su un telefono che ha anche «Chrome Beta»
 * potrebbe aprire quella sbagliata — e aprire l'app sbagliata mentre si guida
 * uno schermo vuol dire toccare dentro un'app che nessuno ha chiesto.
 */
export function talosPacchettoPerNome(elenco: string, richiesta: string): string | null {
    const cercata = richiesta.trim().toLowerCase()
    if (!cercata) return null
    const righe = elenco.split(/\r?\n/)
        .map((riga) => riga.split(/\t/))
        .filter((pezzi): pezzi is [string, string] => pezzi.length >= 2 && !!pezzi[1]?.trim())
        .map(([nome, pacchetto]) => ({ nome: nome.trim().toLowerCase(), pacchetto: pacchetto.trim() }))
    return righe.find((r) => r.nome === cercata)?.pacchetto
        ?? righe.find((r) => r.nome.startsWith(cercata))?.pacchetto
        ?? righe.find((r) => r.nome.includes(cercata))?.pacchetto
        ?? null
}
