import { registerPlugin } from '@capacitor/core'

/**
 * ⭐ La porta verso la rubrica del telefono.
 *
 * ⛔ `permesso` è SEMPRE nella risposta, anche quando `trovati` è vuoto.
 * «Non ho il permesso di guardare» e «ho guardato e non c'è» sono due fatti
 * diversi e portano a due frasi diverse per la persona — confonderli è il
 * difetto che il 2026-08-13 è stato trovato in quattro strati diversi in un
 * giorno solo.
 */
export interface TalosContatto {
    readonly nome: string
    readonly numeri: readonly string[]
}

export interface PonteRubrica {
    cerca(options: { nome: string }): Promise<{
        permesso: boolean
        trovati: TalosContatto[]
    }>
    chiediPermesso(): Promise<{ permesso: boolean }>
}

export const TalosRubricaBridge = registerPlugin<PonteRubrica>('TalosRubrica')

/** Perché una ricerca in rubrica non ha prodotto un destinatario. */
export type TalosEsitoRubrica =
    | { stato: 'uno', contatto: TalosContatto }
    | { stato: 'molti', trovati: readonly TalosContatto[] }
    | { stato: 'nessuno' }
    | { stato: 'permesso-mancante' }
    | { stato: 'ponte-chiuso' }

/**
 * Risolve un nome in UN destinatario, o dice esattamente perché non ci riesce.
 *
 * ⛔ Non sceglie per la persona quando i candidati sono più d'uno: due contatti
 * che si chiamano quasi uguale sono due persone vere, e mandare il messaggio a
 * quella sbagliata è irreversibile. `molti` è una risposta legittima, e la
 * scheda la trasforma in una domanda.
 */
export async function talosRisolviContatto(nome: string): Promise<TalosEsitoRubrica> {
    let esito: { permesso: boolean, trovati: TalosContatto[] }
    try {
        esito = await TalosRubricaBridge.cerca({ nome })
    }
    catch {
        return { stato: 'ponte-chiuso' }
    }
    /*
     * ⭐⭐ SI CHIEDE, non si manda in Impostazioni — 2026-08-13.
     *
     * MISURATO sul Pad: mancando il permesso, TALOS proponeva «vuoi che apra
     * le impostazioni?» e apriva la schermata SBAGLIATA
     * (`ManageExternalStorageActivity`, cioè l'archiviazione). Ma il dialogo
     * di sistema esiste, costa un tocco, e compare sopra quello che la persona
     * sta già facendo.
     *
     * ⇒ Mandare qualcuno a cercare un interruttore in Impostazioni quando puoi
     * fargli comparire la domanda è la strada lunga — la stessa differenza fra
     * pilotare lo schermo e usare un intent, che questo motore esiste per
     * chiudere.
     *
     * ⛔ UNA volta sola: se dice di no, la seconda `cerca` risponde ancora
     * `permesso: false` e si esce con `permesso-mancante`. Un permesso chiesto
     * due volte di fila è un permesso che viene negato.
     */
    if (!esito.permesso) {
        const concesso = await TalosRubricaBridge.chiediPermesso()
            .then((r) => r.permesso)
            .catch(() => false)
        if (!concesso) return { stato: 'permesso-mancante' }
        esito = await TalosRubricaBridge.cerca({ nome }).catch(() => esito)
    }
    if (!esito.permesso) return { stato: 'permesso-mancante' }
    const trovati = esito.trovati.filter((c) => c.numeri.length > 0)
    if (trovati.length === 0) return { stato: 'nessuno' }
    /*
     * ⛔ Un contatto solo NON basta a decidere: se ha tre numeri (casa, lavoro,
     * cellulare) la scelta è ancora aperta, e prenderne uno a caso manda il
     * messaggio a un recapito che quella persona magari non legge.
     */
    if (trovati.length === 1 && trovati[0].numeri.length === 1) {
        return { stato: 'uno', contatto: trovati[0] }
    }
    return { stato: 'molti', trovati }
}
