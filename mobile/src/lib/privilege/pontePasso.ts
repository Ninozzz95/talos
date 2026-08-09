/**
 * Quale passo mostrare per il ponte in casa, e uno solo.
 *
 * ## Perché non un elenco di spunte
 *
 * Perché è la stessa lezione della pagina di Shizuku: una catena di porte che
 * si chiudono per conto loro, e l'unica cosa utile è **quale è chiusa adesso**.
 * Un elenco con quattro stati sembra informativo ed è il modo più rapido di
 * paralizzare chi legge.
 *
 * ## ⛔ E perché il collegamento si PROVA prima di chiedere il codice
 *
 * Perché l'accoppiamento **dura**: la chiave RSA sta in `files/ponte-adb/.android`
 * e sopravvive ai riavvii dell'app e agli aggiornamenti. Ciò che non dura è il
 * collegamento — il Debug wireless si spegne al riavvio del telefono.
 *
 * ⇒ Chiedere il codice a chi è già accoppiato sarebbe mandarlo a cercare una
 * finestrella che non gli serve. Si prova prima a ricollegarsi in silenzio, e
 * il codice si chiede **solo** se quello fallisce.
 */

export interface TalosPonteStato {
    /** Se i binari sono nell'APK. Falso sulla build web, e va detto com'è. */
    packaged: boolean
    /** Se in QUESTO istante c'è un dispositivo collegato. Non si ricorda. */
    connected: boolean
    /** Se un tentativo silenzioso di ricollegarsi è già stato fatto e fallito. */
    reconnectFailed: boolean
    /** Se il sistema ci lascia disegnare sopra le altre app. */
}

export type TalosPontePasso = 'unavailable' | 'reconnect' | 'pair' | 'ready'

export interface TalosPonteGuida {
    passo: TalosPontePasso
    titleKey: string
    bodyKey: string
    /** La chiave del pulsante, quando c'è qualcosa da premere. */
    actionKey: string | null
    /** Se va mostrato il campo del codice a sei cifre. */
    wantsCode: boolean
    ready: boolean
    /**
     * ⭐ La strada CONSIGLIATA per accoppiarsi, quando ce n'è una.
     *
     * ⛔ Non è un ornamento: senza la finestra flottante il giro **non si
     * chiude**. Misurato il 2026-08-08 alle 22:24 — la finestrella «Accoppia con
     * codice» muore quando esci da Impostazioni, e con lei l'annuncio del
     * servizio. Il campo qui nella pagina resta come ripiego per chi il permesso
     * non lo vuole dare, ma va detto che è la strada in salita.
     */
    floatKey: string | null
    /** Se il permesso manca, il pulsante porta alla pagina di sistema. */
    floatNeedsPermission: boolean
}

export function talosPonteGuida(stato: TalosPonteStato): TalosPonteGuida {
    if (!stato.packaged) {
        return {
            passo: 'unavailable',
            titleKey: 'ponte.unavailableTitle',
            bodyKey: 'ponte.unavailableBody',
            actionKey: null,
            wantsCode: false,
            ready: false,
            floatKey: null,
            floatNeedsPermission: false,
        }
    }
    if (stato.connected) {
        return {
            passo: 'ready',
            titleKey: 'ponte.readyTitle',
            bodyKey: 'ponte.readyBody',
            actionKey: null,
            wantsCode: false,
            ready: true,
            floatKey: null,
            floatNeedsPermission: false,
        }
    }
    if (!stato.reconnectFailed) {
        return {
            passo: 'reconnect',
            titleKey: 'ponte.reconnectTitle',
            bodyKey: 'ponte.reconnectBody',
            actionKey: 'ponte.reconnectAction',
            wantsCode: false,
            ready: false,
            floatKey: null,
            floatNeedsPermission: false,
        }
    }
    return {
        passo: 'pair',
        titleKey: 'ponte.pairTitle',
        bodyKey: 'ponte.pairBody',
        actionKey: 'ponte.pairAction',
        wantsCode: true,
        ready: false,
        // ⛔ Un passo solo: la finestra flottante non esiste piu'. Owner
        // 2026-08-09, dopo che la notifica e' stata vista funzionare sopra le
        // opzioni sviluppatore: «se la notifica funziona, la finestra
        // flottante se ne deve andare definitivamente».
        floatKey: 'ponte.floatAction',
        floatNeedsPermission: false,
    }
}

/** Quello che serve per decidere se riagganciarsi da soli, e nient'altro. */
export interface TalosPonteRiaggancio {
    /** Se i binari sono nell'APK. Senza, non c'è niente da tentare. */
    packaged: boolean
    /** Se in QUESTO istante c'è un dispositivo collegato. */
    connected: boolean
    /** Se un tentativo automatico è già stato speso per QUESTA caduta. */
    giaTentato: boolean
    /** Se un'operazione sul ponte è già in volo (anche premuta a mano). */
    inCorso: boolean
}

export interface TalosPonteRiaggancioEsito {
    /** Se tentare `bridgeConnect` adesso, senza che nessuno prema niente. */
    tenta: boolean
    /** Il nuovo valore di `giaTentato`, da riportare nello stato di chi chiama. */
    speso: boolean
}

/**
 * ⭐ Se TALOS deve riagganciarsi DA SOLO, adesso — e quando ne riacquista il
 * diritto.
 *
 * ## ⛔ Perché esiste: la pagina prometteva una cosa che non faceva
 *
 * MISURATO sul Pad il 2026-08-09. La schermata dice, testuale: «Se ti sei già
 * accoppiato una volta, TALOS si ricollega da solo: non serve un altro codice».
 * Staccato il ponte con `bridgeStop`, uscito e rientrato nella pagina:
 * **undici** letture di stato in ventitré secondi e **zero** tentativi di
 * ricollegarsi. Restava staccato finché non premevo io.
 *
 * E il tocco che mancava costava **1.169 ms** dal dito alla scritta «TALOS è
 * collegato al tuo telefono» — cioè la cosa era a un secondo di distanza, e la
 * si faceva aspettare per sempre.
 *
 * ⇒ Un passo che il programma sa fare, e che sa anche QUANDO fare, non si
 * chiede a chi guarda: si fa. Il pulsante resta per quando il tentativo
 * automatico fallisce.
 *
 * ## ⛔ Un tentativo per caduta, non un tentativo al secondo
 *
 * La sentinella rilegge lo stato ogni due secondi quando il ponte è giù. Senza
 * `giaTentato` questo diventerebbe un `adb connect` ogni due secondi per
 * sempre: batteria, rete, e un registro pieno di fallimenti identici.
 *
 * ## ⛔ E il RIARMO sta QUI dentro, non in chi chiama
 *
 * Perché è la metà che si dimentica. La sentinella era già stata scritta una
 * volta guardando **solo** l'arrivo del ponte e non la sua caduta, e il difetto
 * si è visto solo sul dispositivo. Un diritto che si spende e non si riarma
 * fa esattamente lo stesso danno al contrario: dopo la prima caduta TALOS non
 * ci riproverebbe **mai più** per tutta la vita della pagina.
 *
 * ⇒ Il ponte collegato azzera il debito: la caduta successiva ha il suo
 * tentativo. Così la regola intera è una funzione sola, e si prova nei due
 * versi senza montare una schermata.
 */
export function talosPonteRiaggancioAutomatico(stato: TalosPonteRiaggancio): TalosPonteRiaggancioEsito {
    // ⭐ IL RIARMO. Collegato ⇒ nessun debito verso la prossima caduta.
    if (stato.connected) return { tenta: false, speso: false }
    if (!stato.packaged) return { tenta: false, speso: stato.giaTentato }
    if (stato.giaTentato) return { tenta: false, speso: true }
    if (stato.inCorso) return { tenta: false, speso: false }
    return { tenta: true, speso: true }
}

/**
 * Il codice è di sei cifre, e basta questo a saperlo.
 *
 * ⛔ Si valida QUI e non solo di là: un pulsante che si può premere con un
 * codice a cinque cifre manda la persona ad aspettare un fallimento che si
 * sapeva già. E la finestrella intanto scade.
 */
export function talosCodiceValido(codice: string): boolean {
    return /^\d{6}$/.test(codice.trim())
}

/**
 * I motivi del ponte, scritti come **istruzioni** e non come diagnosi.
 *
 * È la stessa regola dei motivi di Shizuku: chi legge «annuncio non trovato»
 * riprova, chi legge «la rete blocca gli annunci, scrivi tu l'indirizzo» fa la
 * cosa utile.
 */
export function talosPonteMotivo(reason: string | undefined): string {
    switch (reason) {
        case 'pairing-not-announced': return 'ponte.reasonPairingNotAnnounced'
        case 'connect-not-announced': return 'ponte.reasonConnectNotAnnounced'
        case 'bad-code': return 'ponte.reasonBadCode'
        case 'connect-refused': return 'ponte.reasonConnectRefused'
        case 'bridge-not-packaged': return 'ponte.unavailableBody'
        case 'bridge-timeout': return 'ponte.reasonTimeout'
        case 'notification-not-shown': return 'ponte.reasonNotificationNotShown'
        default: return 'ponte.reasonGeneric'
    }
}
