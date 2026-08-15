/**
 * «È cambiato cosa c'è sul disco» — detto una volta, sentito da chi serve.
 *
 * ## Il difetto che lo fa nascere
 *
 * Owner 2026-08-05: «bisogna caricare **immediatamente** i modelli locali nel
 * composer appena vengono scaricati e installati, **senza premere il pulsante
 * refresh**».
 *
 * Il percorso era completo tranne l'ultimo passo: il download finiva, la
 * notifica di sistema lo diceva, il toast dentro l'app lo diceva — e poi il
 * modello **non c'era** nel posto in cui serviva. Restava un gesto da fare, e
 * chi non sapeva che esisteva quel pulsante concludeva che il download non
 * avesse funzionato. Un elenco che non si aggiorna da solo è un elenco che
 * mente finché qualcuno non lo interroga.
 *
 * ## Perché un segnale e non una chiamata diretta
 *
 * Chi scopre il cambiamento (lo store dei trasferimenti, la schermata dei
 * modelli locali) e chi deve reagire (il controller della chat, che possiede i
 * cataloghi dei fornitori) stanno su due lati opposti dell'app. Farli parlare
 * per importazione diretta significherebbe **tirare l'uno dentro il grafo
 * iniziale dell'altro**, ed è già successo: importare lo store dei trasferimenti
 * dentro `App.vue` per gli avvisi ha sfondato il tetto d'avvio di 1.379 byte.
 *
 * Questo modulo **non importa niente**. Nemmeno Vue. È il solo modo di stare in
 * mezzo a due mondi senza far pesare l'uno sull'altro.
 *
 * ## Cosa NON è
 *
 * Non è un bus di eventi generico e non deve diventarlo. Porta una notizia sola,
 * senza dati: «rileggi il disco». Un segnale che trasportasse *quale* modello è
 * cambiato inviterebbe chi ascolta a fidarsi di quella descrizione invece di
 * andare a guardare — e il disco è l'unica fonte che non può essere in ritardo
 * (Android libera spazio da solo, l'utente cancella file dalle impostazioni di
 * sistema).
 */

/**
 * Perché il disco è cambiato. Non serve a decidere *se* rileggere — si rilegge
 * sempre — ma a rendere leggibile una traccia quando qualcosa non torna.
 */
export type TalosLocalCatalogueChange =
    /** Un trasferimento è arrivato in fondo: c'è un modello in più. */
    | 'transfer-finished'
    /** Un file è stato scelto dal dispositivo e importato. */
    | 'imported'
    /** Un modello è stato cancellato: c'è un modello in meno. */
    | 'deleted'

type Listener = (reason: TalosLocalCatalogueChange) => void

const listeners = new Set<Listener>()

/**
 * Si iscrive, e restituisce come disiscriversi.
 *
 * Il ritorno non è una cortesia: senza, un controller ricostruito a ogni prova
 * lascerebbe dietro di sé il precedente, e il secondo annuncio ricadrebbe su
 * uno store già smontato — cioè un difetto che si vede solo nella suite, e come
 * un guasto altrui.
 */
export function talosOnLocalCatalogueChange(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

/**
 * Annuncia che il disco è cambiato.
 *
 * Ogni ascoltatore è isolato: se uno solleva, gli altri devono essere avvisati
 * lo stesso. Un elenco aggiornato a metà sarebbe peggio di uno fermo, perché
 * non ci sarebbe niente addosso che lo dica.
 */
export function talosAnnounceLocalCatalogueChange(reason: TalosLocalCatalogueChange): void {
    for (const listener of [...listeners]) {
        try {
            listener(reason)
        } catch {
            // Chi ascolta possiede il proprio stato di errore. Qui interessa
            // solo che il silenzio di uno non diventi il silenzio di tutti.
        }
    }
}

/** Solo per le prove: riporta il registro a zero fra un caso e l'altro. */
export function talosResetLocalCatalogueListeners(): void {
    listeners.clear()
}
