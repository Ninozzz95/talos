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
            case 'scrivi':
            case 'scorri': {
                if (azione.indice === undefined) return { fatto: false, motivo: 'indiceMancante' }
                const esito = await TalosSchermoBridge.agisci({
                    indice: azione.indice,
                    azione: azione.azione,
                    ...(azione.testo === undefined ? {} : { testo: azione.testo }),
                })
                return { fatto: esito.fatto, ...(esito.motivo ? { motivo: esito.motivo } : {}) }
            }
            case 'indietro':
            case 'home': {
                const esito = await TalosSchermoBridge.sistema({ azione: azione.azione })
                return { fatto: esito.fatto, ...(esito.motivo ? { motivo: esito.motivo } : {}) }
            }
            case 'apri_app': {
                if (!azione.testo) return { fatto: false, motivo: 'nomeAppMancante' }
                const esito = await sorgenti.apriApp(azione.testo)
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
