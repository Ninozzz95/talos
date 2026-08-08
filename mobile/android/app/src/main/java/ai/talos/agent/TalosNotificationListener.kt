package ai.talos.agent

import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
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
        return attive.take(limite).map { sbn -> descrivi(sbn) }
    }

    private fun descrivi(sbn: StatusBarNotification): Map<String, Any?> {
        val extras: Bundle? = sbn.notification?.extras
        return mapOf(
            "key" to sbn.key,
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
        val azioni = sbn.notification?.actions ?: return null
        return azioni.firstOrNull { azione ->
            azione.remoteInputs?.any { it.resultKey.isNotEmpty() } == true
        }
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
    fun rispondi(chiave: String, testo: String): String? {
        val attive = runCatching { activeNotifications }.getOrNull()
            ?: return "listener-not-connected"
        val sbn = stessaConversazione(attive, chiave) ?: return "notification-gone"
        val azione = azioneDiRisposta(sbn) ?: return "no-reply-field"
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

    /** Toglie una notifica dalla tendina. Solo quelle che il sistema permette. */
    fun scarta(chiave: String): String? {
        val attive = runCatching { activeNotifications }.getOrNull()
            ?: return "listener-not-connected"
        val sbn = attive.firstOrNull { it.key == chiave } ?: return "notification-gone"
        // ⛔ Una notifica non scartabile è quella di un servizio in primo piano:
        // toglierla vorrebbe dire nascondere che qualcosa sta girando.
        if (!sbn.isClearable) return "not-clearable"
        return runCatching {
            cancelNotification(chiave)
            null
        }.getOrElse { "dismiss-failed" }
    }

    /** Il punto d'ingresso per il ponte: l'istanza viva, o niente. */
    object Ponte {
        fun servizio(): TalosNotificationListener? = if (vivo) istanza else null
    }
}
