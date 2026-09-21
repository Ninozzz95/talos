/**
 * Il centro notifiche: un evento, tre superfici, una regola sola.
 *
 * ## Cosa ha chiesto l'owner
 *
 * 2026-08-06: «creando un **centro di notifiche nativo Android E interno
 * all'app tramite toast**. Ogni funzione, tool, download, installazione ecc.
 * deve avere notifica **toast E Android**.»
 *
 * ## Cosa dice la ricerca, e perché cambia la forma
 *
 * Un centro notifiche ha **due metà**: il *registro*, la parte che resta e che
 * si rivisita, e il *toast*, la parte viva che compare mentre la cosa succede e
 * poi se ne va. «Il toast dice ADESSO, il registro dice DOPO.»
 *
 * E dice anche l'avvertimento che conta: **i toast vanno tenuti rari abbastanza
 * da significare qualcosa**, mostrati uno per volta, accodati o raggruppati
 * invece che impilati in un muro.
 *
 * Le due cose sembrano in contraddizione con «ogni azione la sua notifica». Non
 * lo sono, se si smette di trattare le tre superfici come la stessa cosa:
 *
 *     ogni evento  →  SEMPRE una voce nel registro
 *                  →  un toast se merita di interrompere ADESSO
 *                  →  una notifica Android se serve saperlo DA FUORI
 *
 * Così nessuna azione resta senza traccia — che è la richiesta — e nessuno viene
 * sommerso di toast — che è ciò che le renderebbe inutili tutte.
 *
 * ## Perché questo file non tocca niente
 *
 * È puro: nessuno store, nessun ponte nativo, nessun toast spinto da qui.
 * Decide soltanto, dati un evento e il contesto, **dove** va. Così la regola si
 * prova senza un telefono, ed è una sola — invece di essere riscritta in ogni
 * punto che notifica qualcosa, che è esattamente come oggi metà delle azioni
 * sono finite senza avviso.
 */

/**
 * Il canale, che su Android è una cosa vera e non un'etichetta.
 *
 * Sono canali separati perché Android li fa gestire **uno per uno**: chi vuole
 * i download silenziosi e le attività sonore deve poterlo dire senza spegnere
 * tutto. Un canale unico «TALOS» toglie quella scelta e il primo rimedio che
 * resta è disattivare l'app.
 *
 * Android 16 raggruppa da solo le notifiche della stessa app, quindi i canali
 * contano più di prima: sono l'unica leva rimasta a chi guarda.
 */
export type TalosNotificationChannel =
    /** Scaricamenti e installazioni: progresso, fine, guasto. */
    | 'transfers'
    /** Una risposta arrivata mentre l'app non era davanti. */
    | 'chat'
    /** Lavori lunghi: ricerca, generazione, attività pianificate. */
    | 'jobs'
    /** Qualcosa che aspetta una decisione: un permesso, una conferma. */
    | 'attention'

/** Quanto conta, e quindi che cosa può permettersi di interrompere. */
export type TalosNotificationWeight =
    /** Va registrato e basta: il registro lo mostra, nessuno viene interrotto. */
    | 'log'
    /**
     * Da sapere solo se sei FUORI. Mai un toast.
     *
     * Il caso che l'ha resa necessaria è la risposta di una chat: se sei
     * davanti, la stai già leggendo — un toast che ti dice «è arrivata una
     * risposta» mentre la risposta ti scorre sotto gli occhi è rumore puro. Se
     * invece hai chiuso l'app, è l'unica cosa che ti fa sapere che è finita.
     *
     * Le tre categorie che c'erano non coprivano questo: `log` non esce mai
     * dall'app, `notable` fa un toast anche quando disturba. È un buco che ha
     * trovato il caso reale, non un ripensamento.
     */
    | 'away'
    /** Vale un toast mentre si guarda, e una notifica se si è fuori. */
    | 'notable'
    /** Chiede una decisione: si vede comunque, dentro e fuori. */
    | 'demanding'

export interface TalosNotificationEvent {
    /**
     * Identifica la COSA, non l'istante.
     *
     * Due aggiornamenti dello stesso download condividono la chiave, ed è ciò
     * che permette di sostituire la riga invece di aggiungerne una: senza,
     * scaricare un modello lascerebbe cento voci nel registro.
     */
    key: string
    channel: TalosNotificationChannel
    weight: TalosNotificationWeight
    title: string
    /** Una riga, e dice l'ESITO. «Impostazioni salvate», non un paragrafo. */
    body?: string
    /**
     * A quale superficie appartiene questo evento: `chat:42`, `job:8f2a`,
     * `transfer:qwen`, `settings:providers`.
     *
     * Senza, la regola può sapere soltanto «l'app è davanti», e con quel solo
     * dato **non è possibile** non interrompere chi sta già guardando la cosa di
     * cui l'evento parla. Assente = evento che non appartiene a nessuna
     * superficie, e allora vale la regola generale.
     */
    surface?: string
    at: number
}

export interface TalosNotificationEntry extends TalosNotificationEvent {
    /** Quante volte questa stessa cosa si è ripetuta: il registro le collassa. */
    repeats: number
    read: boolean
}

/** Dove va un evento. Tre risposte indipendenti, non una in tre copie. */
export interface TalosNotificationRouting {
    /** Sempre vero: è la promessa che nessuna azione resta senza traccia. */
    feed: true
    toast: boolean
    android: boolean
}

/** Quel che si sa del momento in cui l'evento capita. */
/**
 * Quanto l'utente sta davvero guardando, che sono TRE stati e non due.
 *
 * `visible` è il caso che «app in primo piano sì/no» non sa dire: la finestra
 * si vede ma non ha l'attenzione — schermo diviso, pannello di sistema aperto,
 * app sotto il blocco schermo. Ai fini della notifica Android va trattato come
 * assenza, perché nessuno sta leggendo.
 */
export type TalosAttention = 'hidden' | 'visible' | 'attended'

export interface TalosNotificationContext {
    /** Falso quando l'app è in background o lo schermo è spento. */
    appVisible: boolean
    /**
     * Lo stato di attenzione, quando chi osserva il ciclo di vita sa dirlo.
     * Assente ⇒ si deduce da `appVisible`, che è il comportamento di prima.
     */
    attention?: TalosAttention
    /** La schermata che si sta guardando, se ce n'è una. */
    surface?: string | null
}

/**
 * Dove mandare questo evento, adesso.
 *
 * ## Le tre decisioni, e il perché di ognuna
 *
 * **Registro: sempre.** È la richiesta dell'owner presa alla lettera, ed è anche
 * l'unica delle tre che non costa niente a chi guarda: una voce in un elenco che
 * si apre quando si vuole non interrompe nessuno.
 *
 * **Toast: solo se l'app è davanti**, e solo se l'evento merita di interrompere.
 * Un toast su un'app in background lo vedrebbe nessuno, e un toast per ogni
 * riga di registro trasformerebbe lo schermo in un muro — la ricerca è esplicita
 * su questo, e un toast che non significa niente rende insignificanti anche
 * quelli che contano.
 *
 * **Android: solo se serve saperlo DA FUORI**, cioè quando l'app non è davanti —
 * oppure quando qualcosa aspetta una decisione, che va vista comunque. Postare
 * una notifica di sistema per una cosa appena successa sotto gli occhi di chi
 * guarda è il difetto che fa disattivare le notifiche di un'app.
 *
 * Nessuna delle tre è dedotta dalle altre: un evento può finire su una, due o
 * tutte e tre, e sono i tre casi veri.
 */
export function talosRouteNotification(
    event: TalosNotificationEvent,
    context: TalosNotificationContext,
): TalosNotificationRouting {
    // `away` non interrompe MAI chi sta guardando: la sua ragione d'essere è
    // esattamente il caso in cui chi guarda vedrebbe la cosa da sé.
    const puoInterrompere = event.weight === 'notable' || event.weight === 'demanding'
    const escePerForza = event.weight === 'demanding'
    const esceSeSeiFuori = puoInterrompere || event.weight === 'away'

    const attenzione: TalosAttention = context.attention
        ?? (context.appVisible ? 'attended' : 'hidden')
    /*
     * ⛔ La regola dell'owner, 2026-08-06: «sono su una funzione → NON devo
     * ricevere notifiche per quella funzione».
     *
     * Il caso che l'ha fatta nascere: scrivendo in una chat compariva la
     * notifica della risposta *di quella stessa chat*. Annunciare una cosa che
     * qualcuno ha davanti agli occhi è il modo più rapido di insegnargli a
     * ignorare anche gli avvisi che contano.
     *
     * Serve l'uguaglianza ESATTA — `chat:42` contro `chat:42` — e non «siamo
     * entrambi nelle chat»: due conversazioni diverse sono due cose diverse, e
     * la risposta arrivata nell'altra non la si sta vedendo.
     */
    const staGuardandoProprioQuesto = attenzione === 'attended'
        && typeof event.surface === 'string'
        && event.surface !== ''
        && event.surface === context.surface

    /*
     * Visibile ma non atteso vale come assenza per la notifica di sistema: la
     * finestra si vede e nessuno la sta leggendo, quindi l'unico modo di
     * raggiungere quella persona è uscire dall'app.
     */
    const fuoriDaiGiochi = attenzione !== 'attended'

    return {
        // Il registro non cambia MAI. Cambia chi viene interrotto, non cosa
        // viene ricordato: è la sola parte di questa regola che non ha eccezioni.
        feed: true,
        toast: attenzione === 'attended' && puoInterrompere && !staGuardandoProprioQuesto,
        android: staGuardandoProprioQuesto
            ? false
            : escePerForza || (fuoriDaiGiochi && esceSeSeiFuori),
    }
}

/** Quante voci il registro tiene prima di dimenticare le più vecchie. */
export const TALOS_NOTIFICATION_FEED_LIMIT = 200

/**
 * La voce nuova in cima, oppure quella che c'era già aggiornata.
 *
 * ## Perché collassare invece di accodare
 *
 * Perché la stessa cosa che si ripete non sono notizie diverse. Un download che
 * riferisce il progresso, una ricerca che avanza, un'attività che riprova:
 * accodandole il registro diventa illeggibile proprio quando c'è qualcosa da
 * leggere, e la voce che conta finisce fuori schermo.
 *
 * La voce aggiornata **risale in cima e torna non letta**, perché è cambiata:
 * lasciarla dov'era vorrebbe dire nasconderla sotto cose più vecchie e meno
 * importanti.
 *
 * Puro e senza stato: prende l'elenco e ne restituisce uno nuovo. È ciò che
 * rende questa regola provabile senza far succedere niente.
 */
export function talosAppendNotification(
    feed: readonly TalosNotificationEntry[],
    event: TalosNotificationEvent,
    limit: number = TALOS_NOTIFICATION_FEED_LIMIT,
): TalosNotificationEntry[] {
    const esistente = feed.find((voce) => voce.key === event.key)
    const aggiornata: TalosNotificationEntry = {
        ...event,
        repeats: (esistente?.repeats ?? 0) + 1,
        read: false,
    }
    const resto = feed.filter((voce) => voce.key !== event.key)
    return [aggiornata, ...resto].slice(0, Math.max(1, limit))
}

/** Quante voci chiedono ancora attenzione: è il numero sul campanello. */
export function talosUnreadCount(feed: readonly TalosNotificationEntry[]): number {
    return feed.reduce((totale, voce) => (voce.read ? totale : totale + 1), 0)
}

/**
 * Segna letto.
 *
 * Senza chiave segna tutto: è il gesto «ho visto», che deve esistere o il
 * numero sul campanello diventa un debito che non si estingue mai.
 */
export function talosMarkNotificationsRead(
    feed: readonly TalosNotificationEntry[],
    key?: string,
): TalosNotificationEntry[] {
    return feed.map((voce) => (
        key === undefined || voce.key === key ? { ...voce, read: true } : voce
    ))
}
