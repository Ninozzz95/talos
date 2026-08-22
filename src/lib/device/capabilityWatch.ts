/**
 * ⛔ Accorgersi quando una capacità SI SPEGNE, e dirlo prima che serva.
 *
 * ## Da dove nasce
 *
 * Owner 2026-08-07: «ogni volta che i permessi si spengono per colpa dell'OS
 * dobbiamo segnalarlo in maniera efficace».
 *
 * E non è un caso limite, è la normalità. Shizuku vive come shell (uid 2000) e
 * **muore a ogni riavvio del telefono**: chi ieri poteva accendere il Wi-Fi
 * dalla chat, stamattina non può più, e nessuno gliel'ha detto. ColorOS revoca
 * per conto suo; Android 11+ azzera i permessi delle app che non usi da mesi
 * (`getUnusedAppRestrictionsStatus`). Tre cause diverse, un solo effetto: una
 * cosa che funzionava non funziona più.
 *
 * ## Perché non basta una schermata di stato
 *
 * La pagina «Controllo del telefono» dice benissimo com'è messo TALOS — a chi
 * la apre. Ma nessuno apre una pagina di stato per sapere se qualcosa si è
 * rotto: la si apre **dopo** che si è rotto, e a quel punto la persona ha già
 * chiesto una cosa e ha già ricevuto un no che sembrava un difetto dell'app.
 *
 * ⛔ Il momento giusto è quando lo stato CAMBIA, non quando qualcuno guarda.
 *
 * ## La regola, e le sue tre metà
 *
 * 1. Si parla **solo di ciò che si è spento**: una capacità che non c'è mai
 *    stata non è una notizia, è la normalità di quel telefono. Dirla sarebbe
 *    rumore, e il rumore si impara a ignorare — compreso quello vero.
 * 2. Si parla **una volta sola per spegnimento**: la stessa chiave sostituisce
 *    la riga invece di aggiungerne una. Dieci avvisi identici sono un avviso
 *    che nessuno legge.
 * 3. Se una capacità **torna**, la si dimentica: così il prossimo spegnimento è
 *    di nuovo una notizia. Senza questo, il guardiano parlerebbe una volta e
 *    poi tacerebbe per sempre.
 */

/** Cosa TALOS può fare, adesso, capacità per capacità. */
export type TalosCapabilityState = Readonly<Record<string, boolean>>

export interface TalosCapabilityLoss {
    /** L'identificativo della capacità: `device_wifi`, `notifications`… */
    readonly id: string
    /**
     * ⛔ Perché si è spenta, quando lo sappiamo.
     *
     * `reboot` è il caso di gran lunga più comune e ha una cura in un tocco;
     * `revoked` vuole un viaggio nelle impostazioni. Confonderli manda la
     * persona a fare la cosa sbagliata — la stessa lezione del ripiego che non
     * distingueva Shizuku spento da Shizuku che rifiuta.
     */
    readonly cause: 'bridge-down' | 'revoked' | 'unknown'
}

export interface TalosCapabilityWatchResult {
    /** Ciò che è appena caduto, e va detto. */
    readonly lost: readonly TalosCapabilityLoss[]
    /** Ciò che è tornato: non si annuncia, ma si smette di ricordarlo. */
    readonly regained: readonly string[]
    /** Lo stato da conservare per il confronto successivo. */
    readonly next: TalosCapabilityState
}

/**
 * Confronta com'era con com'è.
 *
 * ⛔ Funzione pura: niente orologio, niente archivio, niente dispositivo. Lo
 * stato entra ed esce dai parametri, così questa regola si può provare per
 * intero senza un telefono — ed è la regola, non il telefono, la parte che
 * sbaglia.
 */
export function talosCapabilityWatch(
    prima: TalosCapabilityState,
    adesso: TalosCapabilityState,
    causa: (id: string) => TalosCapabilityLoss['cause'] = () => 'unknown',
): TalosCapabilityWatchResult {
    const lost: TalosCapabilityLoss[] = []
    const regained: string[] = []

    for (const [id, cePrima] of Object.entries(prima)) {
        const ceAdesso = adesso[id]
        // ⛔ Una capacità sparita dalla fotografia nuova NON è una perdita: è
        // una capacità che questa versione dell'app non conosce più. Dirla
        // manderebbe la persona a cercare un interruttore che non esiste.
        if (ceAdesso === undefined) continue
        if (cePrima && !ceAdesso) lost.push({ id, cause: causa(id) })
        if (!cePrima && ceAdesso) regained.push(id)
    }

    return { lost, regained, next: adesso }
}

/**
 * Con che peso si dice, e su quale canale.
 *
 * ⛔ Non un errore generico. Il centro notifiche ha quattro pesi e servono
 * proprio a questo: un ponte caduto si sistema in un tocco quando la persona
 * torna sull'app (`notable`), mentre un permesso revocato dal sistema è una
 * decisione che qualcuno ha preso al posto suo e va saputa anche da fuori
 * (`demanding`). Dare a entrambi lo stesso peso vuol dire non averli distinti.
 */
export function talosCapabilityLossWeight(
    loss: TalosCapabilityLoss,
): 'log' | 'away' | 'notable' | 'demanding' {
    return loss.cause === 'revoked' ? 'demanding' : 'notable'
}

/**
 * La chiave dell'avviso: **una per capacità**, mai una per evento.
 *
 * Riavvio il telefono tre volte in un pomeriggio e il registro deve avere una
 * riga sola, aggiornata — non tre righe che dicono la stessa cosa.
 */
export function talosCapabilityLossKey(loss: TalosCapabilityLoss): string {
    return `capability-lost:${loss.id}`
}
