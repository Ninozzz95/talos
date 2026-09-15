/**
 * Cosa dire a chi vuole che TALOS tocchi il telefono, e cosa NON promettergli.
 *
 * ## Perché una funzione pura e non del testo dentro la schermata
 *
 * Perché qui ci sono decisioni, non parole: quale sia il **prossimo passo**,
 * quando una strada su questo dispositivo semplicemente non esiste, e quando
 * insistere sarebbe far cercare a qualcuno una configurazione che non troverà.
 * Quelle decisioni si provano senza un telefono; il testo che le veste no.
 *
 * ## La regola: UN passo, non un elenco
 *
 * Le porte sono quattro e si chiudono in fila — installata, avviata,
 * autorizzata, e il sistema che lascia fare. Mostrarle tutte insieme con una
 * spunta ciascuna sembra informativo ed è il modo più rapido di paralizzare:
 * chi legge non sa da dove cominciare, e comincia da nessuna parte.
 *
 * Quindi si mostra **la prima che è chiusa**, con l'unica azione che la apre.
 *
 * ## ⛔ E la cosa che non si promette
 *
 * MISURATO sul Pad dell'owner il 2026-08-08, e detto da Shizuku stesso: su
 * ColorOS il produttore **limita i permessi di adb**, e Shizuku non riesce
 * nemmeno ad autorizzare TALOS. Non è un difetto nostro da aggirare, ed è la
 * ragione per cui questa schermata ha uno stato che le guide di Shizuku non
 * hanno: «il tuo produttore lo impedisce, ed ecco l'interruttore».
 *
 * Senza quello stato, la persona riproverebbe all'infinito un pulsante che non
 * può funzionare, dando la colpa a noi.
 */

export type TalosShizukuState =
    | 'assente'
    | 'spento'
    | 'da_autorizzare'
    | 'negato'
    | 'pronto'

export interface TalosShizukuSnapshot {
    state: TalosShizukuState
    /** La versione del servizio, o -1 se non gira. */
    version: number
    /** 0 = root, 2000 = shell, -1 = non si sa. */
    uid: number
    outdated: boolean
    /** Vero solo con root: su questo ColorOS la shell non concede. */
    canGrantPermissions: boolean
}

/** Cosa succede toccando il pulsante principale, se ce n'è uno. */
export type TalosShizukuAction =
    /** Apre la finestra di sistema di Shizuku. */
    | 'request'
    /** Porta all'app Shizuku, perché il passo si fa lì. */
    | 'openShizuku'
    /** Porta alle opzioni sviluppatore: la voce da spegnere è lì. */
    | 'openDeveloperOptions'
    /** Niente da fare qui: si legge e basta. */
    | 'none'

export interface TalosShizukuGuidance {
    /** La chiave del titolo: dove siamo, in una riga. */
    titleKey: string
    /** La chiave della spiegazione: perché, e cosa cambia. */
    bodyKey: string
    /** L'etichetta del pulsante, o `null` se non c'è niente da premere. */
    actionKey: string | null
    action: TalosShizukuAction
    /**
     * Se questo stato è un **blocco del produttore** invece di un passo
     * mancante. Cambia il tono e il colore: un passo si fa, un blocco si
     * capisce — e chi non distingue i due riprova all'infinito.
     */
    manufacturerBlocked: boolean
    /** Vero solo quando tutto è a posto: la schermata può dirlo senza riserve. */
    ready: boolean
}

/**
 * Il segnale che il produttore sta bloccando, dedotto invece che indovinato.
 *
 * ⛔ La deduzione è questa, ed è l'unica onesta: il servizio **gira**
 * (`version >= 0`), quindi le prime due porte sono aperte, ma dopo aver chiesto
 * l'autorizzazione siamo ancora fermi a «da autorizzare». Su un sistema che non
 * interferisce, chiedere porta a `pronto` o a `negato` — mai indietro a se
 * stesso.
 *
 * `hasAsked` viene da chi chiama, perché è un fatto sulla sessione e non sul
 * dispositivo: prima di aver chiesto, «da autorizzare» è semplicemente il passo
 * successivo, e chiamarlo blocco sarebbe accusare il produttore di qualcosa che
 * non ha ancora fatto.
 */
export function talosShizukuGuidance(
    snapshot: TalosShizukuSnapshot,
    hasAsked: boolean,
): TalosShizukuGuidance {
    if (snapshot.state === 'pronto') {
        return {
            titleKey: 'privilege.readyTitle',
            bodyKey: snapshot.canGrantPermissions
                ? 'privilege.readyRootBody'
                : 'privilege.readyShellBody',
            actionKey: null,
            action: 'none',
            manufacturerBlocked: false,
            ready: true,
        }
    }

    if (snapshot.state === 'assente') {
        return {
            titleKey: 'privilege.missingTitle',
            bodyKey: 'privilege.missingBody',
            actionKey: 'privilege.missingAction',
            action: 'openShizuku',
            manufacturerBlocked: false,
            ready: false,
        }
    }

    if (snapshot.state === 'spento') {
        return {
            titleKey: 'privilege.stoppedTitle',
            bodyKey: 'privilege.stoppedBody',
            actionKey: 'privilege.stoppedAction',
            action: 'openShizuku',
            manufacturerBlocked: false,
            ready: false,
        }
    }

    if (snapshot.state === 'negato') {
        return {
            titleKey: 'privilege.deniedTitle',
            bodyKey: 'privilege.deniedBody',
            // ⛔ Nessun pulsante che richiede: dopo un rifiuto, insistere con
            // una finestra di sistema è il modo più rapido di far disinstallare
            // un'app. Si spiega dove si cambia idea, e si aspetta.
            actionKey: 'privilege.deniedAction',
            action: 'openShizuku',
            manufacturerBlocked: false,
            ready: false,
        }
    }

    // Resta `da_autorizzare`. Qui si decide fra «premi il pulsante» e «il tuo
    // produttore lo impedisce», ed è la distinzione che vale tutta la schermata.
    if (hasAsked) {
        return {
            titleKey: 'privilege.blockedTitle',
            bodyKey: 'privilege.blockedBody',
            actionKey: 'privilege.blockedAction',
            action: 'openDeveloperOptions',
            manufacturerBlocked: true,
            ready: false,
        }
    }

    return {
        titleKey: 'privilege.askTitle',
        bodyKey: 'privilege.askBody',
        actionKey: 'privilege.askAction',
        action: 'request',
        manufacturerBlocked: false,
        ready: false,
    }
}

/**
 * Cosa TALOS potrà fare davvero, una volta autorizzato.
 *
 * ⛔ Esiste perché «autorizzato» non vuol dire «tutto». Con l'identità della
 * shell si **fanno** cose finché Shizuku è vivo; i permessi che sopravvivono al
 * riavvio vogliono root o Dhizuku. Una schermata che dicesse solo «pronto»
 * prometterebbe la seconda cosa avendo ottenuto la prima.
 */
export function talosShizukuReach(snapshot: TalosShizukuSnapshot): {
    canAct: boolean
    survivesReboot: boolean
} {
    return {
        canAct: snapshot.state === 'pronto',
        // Solo root concede permessi che restano. Misurato: con uid 2000 su
        // ColorOS `pm grant` e `appops set` vengono rifiutati.
        survivesReboot: snapshot.state === 'pronto' && snapshot.canGrantPermissions,
    }
}
