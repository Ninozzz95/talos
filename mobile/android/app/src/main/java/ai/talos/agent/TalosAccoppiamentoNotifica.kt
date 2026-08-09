package ai.talos.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.text.InputType
import androidx.core.app.RemoteInput

/**
 * ⭐⭐ IL CODICE DI ACCOPPIAMENTO SI SCRIVE IN UNA NOTIFICA, non in una finestra.
 *
 * ## Perché la finestra flottante è stata buttata
 *
 * Owner, 2026-08-09: «appena entro in dev settings la finestra flottante viene
 * coperta». È vero e non è aggirabile: da Android 15 la pagina delle opzioni
 * sviluppatore dichiara il proprio contenuto **protetto dalla condivisione
 * schermo**, e su OxygenOS quella protezione porta con sé le finestre di
 * sistema disegnate sopra. Una `SYSTEM_ALERT_WINDOW` che sta esattamente lì
 * sopra è la prima cosa che sparisce.
 *
 * ⇒ Il posto giusto non è **sopra** Impostazioni: è la **tendina**, che la
 * disegna SystemUI e che si apre sopra qualunque schermata, comprese quelle
 * protette.
 *
 * ## È la stessa strada di Shizuku, e non per imitazione
 *
 * `AdbPairingService` di Shizuku mette una `RemoteInput` in una notifica per
 * farsi dettare il codice. Ricercato prima di scrivere una riga
 * (github.com/RikkaApps/Shizuku): canale a **IMPORTANCE_HIGH**, senza suono,
 * chiave del campo `paring_code`, e il `PendingIntent` con **FLAG_MUTABLE** —
 * senza quel flag Android non può scrivere la risposta dentro l'intent e il
 * campo non consegna niente.
 *
 * ⛔ E lo stesso lavoro dice anche il LIMITE, che va detto prima di prometterlo:
 * su alcune ROM il campo della notifica **non si apre** mentre le opzioni
 * sviluppatore sono in primo piano (Shizuku #868, proprio su OnePlus/OxygenOS;
 * #2114 su HorizonOS). Se capita anche qui, la nuova strada non è migliore di
 * quella vecchia — ma nasce con il ripiego già pronto: il campo nella schermata
 * di TALOS, che non dipende da nessuna finestra di sistema.
 *
 * ## ⛔ Perché una notifica ONGOING e non un avviso qualsiasi
 *
 * Perché l'accoppiamento ha una finestra di vita: la porta cambia a ogni
 * apertura e il codice scade. Una notifica che si può scartare per sbaglio
 * lascerebbe la persona in Impostazioni senza più il posto dove scrivere, e
 * senza modo di capire che è colpa di uno scorrimento.
 */
object TalosAccoppiamentoNotifica {

    private const val CANALE = "talos_accoppiamento"
    private const val ID_NOTIFICA = 4127
    private const val CHIAVE_CODICE = "codice"
    const val AZIONE_RISPOSTA = "ai.talos.AZIONE_CODICE_ACCOPPIAMENTO"

    /** Chi vuole sapere che è arrivato un codice. */
    fun interface Ascoltatore {
        fun codice(codice: String)
    }

    private var ascoltatore: Ascoltatore? = null
    private var ricevitore: BroadcastReceiver? = null

    /**
     * Mette la notifica col campo, e resta in ascolto della risposta.
     *
     * Le parole arrivano da JavaScript: è lì che vivono i dizionari, e una
     * notifica scritta in italiano dentro il Kotlin sarebbe l'unica superficie
     * di TALOS che non parla la lingua scelta dalla persona.
     */
    fun mostra(
        context: Context,
        titolo: String,
        testo: String,
        etichettaCampo: String,
        quandoArriva: Ascoltatore,
    ): Boolean = runCatching {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return false
        /*
         * ⛔⛔ SI CHIEDE PRIMA SE LE NOTIFICHE SONO ACCESE, e non lo si scopre
         * dall'assenza.
         *
         * MISURATO sul Pad il 2026-08-09: `POST_NOTIFICATIONS granted=false`,
         * `notify()` chiamata regolarmente, nessuna eccezione, e la notifica
         * **non compare da nessuna parte**. La prima versione di questa
         * funzione rispondeva `shown: true` — cioe' la stessa forma di bugia
         * che stiamo cacciando da stanotte: un'API che torna `void` e non fa
         * niente.
         *
         * Rispondere `false` qui e' cio' che permette alla schermata di
         * chiedere il permesso o di ripiegare, invece di mandare la persona
         * dentro Impostazioni a cercare un campo che non esiste.
         */
        if (!manager.areNotificationsEnabled()) return false
        creaCanale(manager, titolo)
        ascoltatore = quandoArriva
        registraRicevitore(context)

        val remoto = RemoteInput.Builder(CHIAVE_CODICE)
            .setLabel(etichettaCampo)
            // ⛔ Sei cifre: la tastiera numerica risparmia alla persona il
            // passaggio piu' sbagliato di tutta la procedura, che e' cercare i
            // numeri mentre un codice scade.
            .setAllowFreeFormInput(true)
            .build()

        val intento = Intent(AZIONE_RISPOSTA).setPackage(context.packageName)
        /*
         * ⛔ FLAG_MUTABLE, e non e' una svista di sicurezza: senza, Android non
         * puo' scrivere la risposta dentro l'intent e il campo consegna un
         * `null`. E' lo stesso flag che usa Shizuku, per la stessa ragione.
         * L'intent e' chiuso al nostro pacchetto con `setPackage`.
         */
        val bandiere = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val inSospeso = PendingIntent.getBroadcast(context, ID_NOTIFICA, intento, bandiere)

        val azione = Notification.Action.Builder(null, etichettaCampo, inSospeso)
            .addRemoteInput(
                android.app.RemoteInput.Builder(CHIAVE_CODICE)
                    .setLabel(etichettaCampo)
                    .setAllowFreeFormInput(true)
                    .build(),
            )
            .build()

        val notifica = Notification.Builder(context, CANALE)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(titolo)
            .setContentText(testo)
            .setStyle(Notification.BigTextStyle().bigText(testo))
            // ⛔ Non si scarta: vedi il commento in cima. Chi la perde con uno
            // scorrimento resta in Impostazioni senza piu' dove scrivere.
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .addAction(azione)
            .build()

        manager.notify(ID_NOTIFICA, notifica)
        // `remoto` serve solo a tenere in vita il riferimento androidx per chi
        // legge: la notifica usa la versione di piattaforma.
        remoto.label
        true
    }.getOrDefault(false)

    /** Toglie la notifica e smette di ascoltare. */
    fun chiudi(context: Context) {
        runCatching {
            context.getSystemService(NotificationManager::class.java)?.cancel(ID_NOTIFICA)
        }
        ricevitore?.let { runCatching { context.applicationContext.unregisterReceiver(it) } }
        ricevitore = null
        ascoltatore = null
    }

    private fun creaCanale(manager: NotificationManager, titolo: String) {
        if (manager.getNotificationChannel(CANALE) != null) return
        /*
         * IMPORTANCE_HIGH come Shizuku: serve perche' la notifica compaia in
         * testa e il campo sia raggiungibile con una tirata sola. Senza suono,
         * pero': la persona ce l'ha in mano, non ha bisogno che le si urli.
         */
        val canale = NotificationChannel(CANALE, titolo, NotificationManager.IMPORTANCE_HIGH)
        canale.setSound(null, null)
        canale.enableVibration(false)
        canale.setShowBadge(false)
        manager.createNotificationChannel(canale)
    }

    private fun registraRicevitore(context: Context) {
        if (ricevitore != null) return
        val nuovo = object : BroadcastReceiver() {
            override fun onReceive(contesto: Context?, intento: Intent?) {
                if (intento == null) return
                val risposta = RemoteInput.getResultsFromIntent(intento)
                    ?.getCharSequence(CHIAVE_CODICE)
                    ?.toString()
                    ?.trim()
                    .orEmpty()
                if (risposta.isEmpty()) return
                ascoltatore?.codice(risposta)
            }
        }
        val filtro = IntentFilter(AZIONE_RISPOSTA)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // ⛔ NOT_EXPORTED: la risposta arriva da SystemUI per conto nostro,
            // e nessun'altra app deve poter fingere un codice.
            context.applicationContext.registerReceiver(nuovo, filtro, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.applicationContext.registerReceiver(nuovo, filtro)
        }
        ricevitore = nuovo
    }

    /** Il tipo di tastiera che vorremmo; Android lo onora quando può. */
    @Suppress("unused")
    const val TASTIERA_NUMERICA = InputType.TYPE_CLASS_NUMBER
}
