/**
 * ⛔⭐⭐ Lo STOP deve chiudere anche le attese, non solo la generazione.
 *
 * ## Il difetto che questo esiste per chiudere
 *
 * Il foglio del PIANO si apriva mettendo `planRequest` a un valore, e quel
 * valore tornava a `null` da un solo posto: `answerPlan`, cioè i tre pulsanti
 * del foglio. Chi premeva **Stop** mentre il piano era aperto non passava di
 * lì. Restavano due cose appese:
 *
 * 1. la promessa che l'invio stava aspettando — nessuno la risolveva più;
 * 2. `planRequest` non nullo, per sempre.
 *
 * La seconda è quella che si vedeva. Il foglio del piano stava in una catena di
 * `v-else-if` davanti alla scheda di consenso e al pulsante «Controlla azioni»:
 * con `planRequest` bloccato, **ogni richiesta di permesso successiva non aveva
 * più dove mostrarsi**. La chat continuava a dire «una richiesta è in attesa» —
 * e diceva il vero, l'id era vivo — mentre a schermo non c'era niente da
 * toccare. Visto tre volte in una notte, su entrambi i motori.
 *
 * ## Perché una funzione e non sei righe sul posto
 *
 * Perché il pezzo delicato non è l'`addEventListener`: è **la condizione**. Lo
 * stesso segnale può arrivare a piano già risposto, e in quel momento potrebbe
 * essercene aperto un altro, di un altro invio. Chiudere «il piano» senza
 * chiedersi quale chiude quello sbagliato — un difetto peggiore di quello che
 * si stava riparando, e invisibile finché non capita.
 *
 * Qui la condizione è un parametro, quindi si può provare che morde.
 *
 * @param segnale   Il segnale dell'invio in corso, se c'è.
 * @param riguarda  Vero se l'attesa aperta ADESSO è ancora quella nostra.
 * @param chiudi    Come si chiude: di norma la stessa risposta di un rifiuto.
 * @returns La funzione che stacca l'ascolto, da chiamare quando l'attesa finisce.
 */
export function talosChiudiSuStop(
    segnale: AbortSignal | null | undefined,
    riguarda: () => boolean,
    chiudi: () => void,
): () => void {
    if (!segnale) return () => {}
    const suStop = (): void => {
        if (riguarda()) chiudi()
    }
    segnale.addEventListener('abort', suStop, { once: true })
    return () => segnale.removeEventListener('abort', suStop)
}
