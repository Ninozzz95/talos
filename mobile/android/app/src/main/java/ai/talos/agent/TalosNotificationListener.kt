package ai.talos.agent

import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput

/**
 * ⭐ LE NOTIFICHE: leggerle, e rispondere davvero.
 *
 * ## Perché è la capacità che pesa di più
 *
 * È **metà di ciò che fa Gemini**, e non passa da Shizuku: si accende dalla
 * pagina di sistema, come una qualunque impostazione. Su questo telefono, dove
 * il ponte privilegiato non si accenderà mai (la ROM non lascia che Shizuku ci
 * autorizzi), è la capacità grande che rimane raggiungibile.
 *
 * ## ⛔ Ciò che TALOS NON potrà mai leggere, e va detto
 *
 * Da Android 15 le notifiche **sensibili** — i codici a due fattori, gli OTP —
 * vengono oscurate a chi non ha `RECEIVE_SENSITIVE_NOTIFICATIONS`, un permesso
 * di piattaforma che a un'app come la nostra non sarà dato.
 *
 * Non è un limite da aggirare: è una promessa da fare. «TALOS legge le tue
 * notifiche e non può leggere i tuoi codici» è una frase che nessun concorrente
 * mette per iscritto, e noi la mettiamo — nella descrizione dello strumento, che
 * è il posto dove la legge anche il modello.
 *
 * ## Il servizio NON tiene una copia
 *
 * `getActiveNotifications()` chiede al sistema quelle vive nel momento in cui
 * qualcuno lo chiede. Tenere uno storico vorrebbe dire costruire un archivio di
 * tutto ciò che passa sul telefono di una persona — e poi doverlo proteggere,
 * cifrare, sfoltire, e spiegare. Ciò che non esiste non si perde.
 */
class TalosNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        vivo = true
    }

    override fun onListenerDisconnected() {
        vivo = false
        // Scollegati: le azioni catturate non valgono piu' niente, e tenerle
        // sarebbe custodire riferimenti a conversazioni che non guardiamo piu'.
        maniglie.svuota()
        super.onListenerDisconnected()
    }

    /**
     * ⛔ Non facciamo niente all'arrivo di una notifica, ed è voluto.
     *
     * Un servizio che reagisce a ogni notifica sveglia l'app decine di volte al
     * minuto e consuma batteria per un lavoro che nessuno ha chiesto. TALOS
     * guarda **quando glielo si chiede**, non di continuo.
     */
    override fun onNotificationPosted(sbn: StatusBarNotification?) = Unit

    companion object {
        /**
         * Se il sistema ci ha collegati.
         *
         * ⛔ Non è la stessa cosa di «il permesso c'è»: il permesso può esserci
         * e il servizio non essere ancora collegato, e in quel caso una lettura
         * tornerebbe vuota. Distinguere le due cose evita di dire «non hai
         * notifiche» quando la verità è «non sono ancora collegato».
         */
        @Volatile
        var vivo: Boolean = false
            private set

        /** L'istanza viva, quando c'è. Il sistema ne tiene una sola. */
        @Volatile
        private var istanza: TalosNotificationListener? = null

        /**
         * Le maniglie date al modello, con l'azione catturata alla lettura.
         *
         * ⛔ Volatile e limitato: NON e' un archivio di cio' che passa sul
         * telefono. Si svuota quando il sistema ci scollega e quando supera il
         * tetto — tenere di piu' vorrebbe dire custodire i `PendingIntent` di
         * conversazioni che nessuno riaprira'.
         *
         * ⛔⛔ La risoluzione maniglia → chiave vera vive TUTTA in
         * `TalosManiglieNotifiche`, e non qui, per il motivo scritto in quel
         * file: scritta due volte, una delle due sbagliava e diceva di aver
         * fatto.
         */
        private val maniglie = TalosManiglieNotifiche<Notification.Action>()
    }

    override fun onCreate() {
        super.onCreate()
        istanza = this
    }

    override fun onDestroy() {
        if (istanza === this) istanza = null
        super.onDestroy()
    }

    /**
     * Ciò che è a schermo adesso, in una forma che un modello può leggere.
     *
     * ⛔ Il testo si prende dagli `extras` standard e non dal `RemoteViews`: un
     * layout personalizzato non si sa leggere, e inventarne il contenuto sarebbe
     * peggio che dire «questa non la so leggere».
     */
    fun elenca(limite: Int): List<Map<String, Any?>> {
        val attive = runCatching { activeNotifications }.getOrNull() ?: return emptyList()
        val scelte = attive.take(limite)

        /*
         * ⭐⭐ L'AZIONE SI CATTURA ADESSO, e si usa dopo. E' la correzione che
         * fa sparire la gara.
         *
         * ## Il difetto, provato quattro volte di fila sul Pad il 2026-08-08
         *
         * Chiesto di rispondere a una conversazione WhatsApp viva, la risposta
         * falliva SEMPRE. TALOS l'aveva diagnosticato da solo: «la notifica e'
         * stata sostituita proprio nell'istante tra la lettura e l'invio». Ogni
         * messaggio nuovo ne crea una e butta la precedente, e cercarla di nuovo
         * al momento dell'invio significa cercare qualcosa che non c'e' piu'.
         *
         * ## La cura, che non era riprovare piu' in fretta
         *
         * Owner, dopo il quarto tentativo: «quando fallisci piu' volte, ricerca
         * web documentazione, best practices — REGOLA D'ORO». Cercando si
         * scopre che chi fa questo da anni non cerca affatto la notifica al
         * momento della risposta: cattura l'azione QUANDO LA LEGGE.
         *
         * Il `PendingIntent` appartiene all'app che ha creato la notifica, non
         * alla notifica: resta valido anche quando quella viene rimpiazzata. Con
         * l'azione gia' in mano la finestra temporale non si stringe —
         * SPARISCE, perche' non c'e' piu' niente da ritrovare.
         *
         * ## ⛔ Ed e' anche la semantica giusta
         *
         * E' esattamente cio' che fa una persona che tocca «Rispondi» su una
         * notifica di dieci minuti fa: l'app instrada verso la CONVERSAZIONE,
         * non verso quel singolo messaggio.
         *
         * Il magazzino e' limitato e volatile: solo le ultime letture, e si
         * svuota quando il sistema ci scollega. Non e' un archivio di cio' che
         * passa sul telefono — quello non lo teniamo, per scelta.
         */
        return scelte.map { sbn ->
            descrivi(sbn, maniglie.registra(sbn.key, azioneDiRisposta(sbn)))
        }
    }

    /**
     * ⛔⛔ AL MODELLO SI DA' UNA MANIGLIA CORTA, MAI LA CHIAVE DI ANDROID.
     *
     * ## Il difetto, visto nella scheda di consenso il 2026-08-08
     *
     * La chiave vera di una notifica WhatsApp e':
     *
     *     0|com.whatsapp|1|XqA328IiWblASGe+saGx8BixiMVGByTEJR9F64Rtwwo=|10329
     *
     * Il modello, dovendola riportare, ne ha passato solo il pezzo di mezzo. Il
     * nostro codice non l'ha riconosciuta e ha risposto «la notifica non c'e'
     * piu'» — che oltre a fallire era pure FALSO: la notifica c'era, era la
     * chiave a non essere stata abbinata.
     *
     * ## Perche' la cura non e' tollerare la chiave storpiata
     *
     * Si potrebbe accettare una corrispondenza parziale. Ma su un'azione che
     * manda un messaggio a una persona vera, «somiglia abbastanza» e' il
     * criterio sbagliato: due conversazioni con chiavi simili diventerebbero
     * intercambiabili.
     *
     * La cura e' non mettere mai il modello nella condizione di sbagliare:
     * riceve `n1`, `n2`, `n3` — corte, non ambigue, impossibili da troncare per
     * sbaglio — e la chiave vera resta da questa parte del ponte.
     *
     * E' lo stesso principio del debito #19 sugli identificativi opachi: cio'
     * che il modello maneggia dev'essere fatto per essere maneggiato da lui.
     */
    private fun descrivi(sbn: StatusBarNotification, maniglia: String): Map<String, Any?> {
        val extras: Bundle? = sbn.notification?.extras
        return mapOf(
            "key" to maniglia,
            "package" to sbn.packageName,
            "postedAt" to sbn.postTime,
            "title" to extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            "text" to extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            "clearable" to sbn.isClearable,
            // ⭐ Il campo che decide se si può rispondere: senza, il modello
            // proporrebbe una risposta che non ha dove andare.
            "canReply" to (azioneDiRisposta(sbn) != null),
        )
    }

    /**
     * L'azione con dentro un campo di testo, se c'è.
     *
     * È così che funziona la risposta rapida: l'app che ha creato la notifica
     * allega un `RemoteInput` a una delle sue azioni. Chi risponde non parla con
     * l'app: riempie quel campo e fa scattare l'intento che l'app stessa ha
     * preparato. ⛔ Quindi non stiamo pilotando l'app di nessuno — stiamo usando
     * la porta che l'app ha lasciato aperta apposta.
     */
    private fun azioneDiRisposta(sbn: StatusBarNotification): Notification.Action? {
        val notifica = sbn.notification ?: return null

        val diretta = notifica.actions?.firstOrNull { azione ->
            azione.remoteInputs?.any { it.resultKey.isNotEmpty() } == true
        }
        if (diretta != null) return diretta

        /*
         * ⭐ In ricaduta: le azioni per l'OROLOGIO.
         *
         * Trovato leggendo chi scrive app di notifiche da anni (Polidea, «How
         * to respond to any messaging notification on Android»): parecchie app
         * di messaggistica mettono la risposta rapida SOLO fra le azioni
         * «wearable», perche' nasce come funzione per l'orologio. Guardare solo
         * `notification.actions` significa dichiarare «non si puo' rispondere»
         * a notifiche a cui un orologio risponde benissimo.
         */
        return runCatching {
            val compat = NotificationCompat.WearableExtender(notifica).actions
                .firstOrNull { azione ->
                    azione.remoteInputs?.any { it.resultKey.isNotEmpty() } == true
                } ?: return@runCatching null

            val costruttore = Notification.Action.Builder(
                null as android.graphics.drawable.Icon?,
                compat.title,
                compat.actionIntent,
            )
            for (campo in compat.remoteInputs.orEmpty()) {
                costruttore.addRemoteInput(
                    android.app.RemoteInput.Builder(campo.resultKey)
                        .setLabel(campo.label)
                        .build(),
                )
            }
            costruttore.build()
        }.getOrNull()
    }

    /**
     * ⛔ LA CONVERSAZIONE, non la notifica — e la differenza è tutto.
     *
     * ## Il difetto, diagnosticato da TALOS stesso il 2026-08-08
     *
     * Chiesto di rispondere su WhatsApp, il tentativo falliva ogni volta.
     * TALOS l'ha capito da solo e l'ha detto meglio di come l'avrei scritto io:
     *
     * > «La notifica è stata sostituita di nuovo proprio nell'istante tra la
     * > lettura e l'invio. Non è un errore mio: è una finestra temporale — se
     * > lei scrive più messaggi di fila più velocemente di quanto io possa
     * > rispondere, la notifica "vecchia" a cui punto scompare sempre.»
     *
     * Una chiave di notifica è un bersaglio in movimento: ogni messaggio nuovo
     * ne crea una e butta la precedente. Puntare alla chiave esatta vuol dire
     * non riuscire mai a rispondere proprio nelle conversazioni vive — cioè le
     * uniche in cui rispondere serve.
     *
     * ## ⛔ Ma NON si ripiega su «una qualsiasi di quell'app»
     *
     * Sarebbe la cura peggiore della malattia: manderebbe il messaggio a una
     * conversazione sbagliata, e un messaggio alla persona sbagliata non si
     * ritira. Si ricade sulla notifica che ha la stessa IDENTITÀ di
     * conversazione — stesso pacchetto, stesso `tag` e stesso `id`, che sono i
     * campi con cui l'app distingue una chat dall'altra.
     *
     * E se ne trovasse più d'una, non sceglie: fallisce. Nel dubbio su A CHI
     * si sta scrivendo, non si scrive.
     */
    private fun stessaConversazione(
        attive: Array<StatusBarNotification>,
        chiave: String,
    ): StatusBarNotification? {
        val esatta = attive.firstOrNull { it.key == chiave }
        if (esatta != null) return esatta

        /*
         * La chiave ha forma `utente|pacchetto|id|tag|uid`. Pacchetto, id e tag
         * insieme identificano la conversazione; ciò che cambia fra un
         * messaggio e l'altro è l'istanza, non la chat.
         */
        val pezzi = chiave.split('|')
        if (pezzi.size < 5) return null
        val pacchetto = pezzi[1]
        val id = pezzi[2]
        val tag = pezzi[3]

        val candidate = attive.filter { sbn ->
            val suoi = sbn.key.split('|')
            suoi.size >= 5 && suoi[1] == pacchetto && suoi[2] == id && suoi[3] == tag
        }
        // ⛔ Zero o più d'una: non si indovina.
        return candidate.singleOrNull()
    }

    /** Risponde a una notifica. Torna `null` se è andata, o il motivo se no. */
    fun rispondi(maniglia: String, testo: String): String? {
        val attive = runCatching { activeNotifications }.getOrNull()
            ?: return "listener-not-connected"
        /*
         * ⭐ La maniglia data alla lettura, che porta con se' l'azione gia'
         * catturata: e' quella che non invecchia.
         */
        val voce = maniglie.voce(maniglia)
        val chiaveVera = maniglie.chiaveVera(maniglia)

        val azione = voce?.azione
            // Ricaduta per chi risponde senza aver elencato: si cerca ancora,
            // ma e' il percorso fragile ed e' solo una cortesia.
            ?: stessaConversazione(attive, chiaveVera)?.let { azioneDiRisposta(it) }
            ?: return if (voce == null && stessaConversazione(attive, chiaveVera) == null) {
                "notification-gone"
            } else {
                "no-reply-field"
            }
        val campi = azione.remoteInputs ?: return "no-reply-field"

        return runCatching {
            /*
             * ⛔ Il testo va messo sotto la CHIAVE che l'app si aspetta, e ogni
             * app sceglie la sua. Prenderne una a caso, o inventarne una,
             * produce una risposta vuota: l'intento parte, l'app non trova
             * niente nel campo, e la persona vede il messaggio inviato senza
             * contenuto. È il difetto peggiore possibile qui.
             */
            val valori = Bundle()
            for (campo in campi) valori.putCharSequence(campo.resultKey, testo)

            val intento = Intent()
            RemoteInput.addResultsToIntent(
                campi.map { androidx.core.app.RemoteInput.Builder(it.resultKey).build() }.toTypedArray(),
                intento,
                valori,
            )
            azione.actionIntent.send(this, 0, intento)
            null
        }.getOrElse { errore ->
            if (errore is PendingIntent.CanceledException) "reply-target-gone" else "reply-failed"
        }
    }

    /**
     * Toglie una notifica dalla tendina. Solo quelle che il sistema permette.
     *
     * ⛔⛔ IL PARAMETRO SI CHIAMA `maniglia`, E NON È PEDANTERIA.
     *
     * Riprodotto sul Pad il 2026-08-09 alle 00:03: qui c'era
     * `cancelNotification(chiave)` con dentro la maniglia `n7`, mentre la chiave
     * vera era già stata risolta due righe sopra e poi non usata. Il sistema, a
     * cui arriva una chiave che non conosce, **non fa niente e non fallisce** —
     * `cancelNotification` torna `void`. TALOS ha detto «Fatto ✅ Rimossa la
     * notifica» mentre `cmd notification list` la mostrava ancora lì.
     *
     * Col parametro chiamato `maniglia`, scrivere `cancelNotification(maniglia)`
     * si legge sbagliato prima ancora di essere eseguito. È l'unica difesa che
     * funziona contro una svista, perché una svista non la ferma un commento.
     */
    fun scarta(maniglia: String): String? {
        val attive = runCatching { activeNotifications }.getOrNull()
            ?: return "listener-not-connected"
        val vera = maniglie.chiaveVera(maniglia)
        val sbn = attive.firstOrNull { it.key == vera } ?: return "notification-gone"
        // ⛔ Una notifica non scartabile è quella di un servizio in primo piano:
        // toglierla vorrebbe dire nascondere che qualcosa sta girando.
        if (!sbn.isClearable) return "not-clearable"
        return runCatching {
            cancelNotification(vera)
            null
        }.getOrElse { "dismiss-failed" }
    }

    /** Il punto d'ingresso per il ponte: l'istanza viva, o niente. */
    object Ponte {
        fun servizio(): TalosNotificationListener? = if (vivo) istanza else null
    }
}
