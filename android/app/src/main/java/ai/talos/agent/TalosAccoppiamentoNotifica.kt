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
     * Le parole con cui questa notifica sa parlare, tutte prese in una volta.
     *
     * ⛔ Si conservano perché gli altri due momenti — «sto lavorando» e «non è
     * andata» — arrivano da un thread di sfondo, quando il JavaScript non è più
     * nel giro e non può passarle. Chiederle di nuovo vorrebbe dire o inventarle
     * in Kotlin (e allora questa sarebbe l'unica superficie di TALOS che non
     * parla la lingua scelta), o non dire niente — che è il difetto qui sotto.
     */
    private class Parole(
        val titolo: String,
        val etichettaCampo: String,
        val alLavoro: String,
        val fallita: String,
        val pronta: String,
    )

    private var parole: Parole? = null

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
        alLavoro: String,
        fallita: String,
        pronta: String,
        quandoArriva: Ascoltatore,
    ): Boolean {
        parole = Parole(titolo, etichettaCampo, alLavoro, fallita, pronta)
        return posa(context, titolo, testo, etichettaCampo, false, quandoArriva)
    }

    /**
     * ⭐⭐⭐ «L'HO VISTA» — la notifica si accorge da sé che la finestrella di
     * sistema si è aperta, e lo dice nell'istante in cui succede.
     *
     * Owner 2026-08-09: «come fa Shizuku, la notifica deve scovare
     * automaticamente quando l'utente clicca su accoppia con codice nel Debug
     * wireless».
     *
     * ⛔ Non è cosmetica. Prima la persona vedeva sempre lo stesso testo —
     * «scrivi le sei cifre» — sia mentre cercava la voce nel menu, sia dopo
     * averla aperta. Due situazioni diverse, un solo messaggio: nessun modo di
     * sapere se TALOS stesse guardando o no, e nessun modo di accorgersi di aver
     * aperto la finestrella sbagliata.
     *
     * Adesso il testo cambia **quando** cambia il mondo, ed è anche la prova che
     * la sentinella funziona: se non compare, non stiamo vedendo l'annuncio.
     */
    fun pronta(context: Context) {
        val p = parole ?: return
        posa(context, p.titolo, p.pronta, p.etichettaCampo, false, null)
    }

    /**
     * ⭐ «Ci sto lavorando» — e non è cortesia, è l'unica cosa vera da dire.
     *
     * ⛔ Il difetto che ha pagato questa funzione, owner 2026-08-09 con la foto:
     * «la notifica si blocca in spinning». Scritto il codice, la notifica restava
     * **identica**, e sotto partiva un lavoro che può durare **fino a 36
     * secondi** — scoperta dell'annuncio fino a 6 s, poi l'accoppiamento con un
     * tetto di 30 s. Trentasei secondi in cui la persona guarda esattamente la
     * stessa schermata di prima e non ha modo di sapere se ha premuto davvero.
     *
     * Il campo sparisce mentre si lavora, di proposito: un campo che accetta un
     * secondo codice mentre il primo è ancora in volo produce due accoppiamenti
     * accavallati sulla stessa porta.
     */
    fun lavora(context: Context, testo: String? = null) {
        val p = parole ?: return
        posa(context, p.titolo, testo ?: p.alLavoro, null, true, null)
    }

    /**
     * ⛔ «Non è andata» — la metà del contratto che mancava del tutto.
     *
     * Prima, se l'accoppiamento falliva, **non succedeva niente**: nessun testo
     * nuovo, nessun motivo, la notifica ferma lì. Solo la riuscita la chiudeva.
     * ⇒ Un fallimento silenzioso è indistinguibile da un lavoro ancora in corso,
     * e quello che si vede è esattamente ciò che l'owner ha fotografato.
     *
     * Il campo torna: il codice scade e la porta cambia, quindi la cosa utile
     * dopo un no è **poterne scrivere un altro** senza rifare tutto il giro.
     */
    fun riprova(context: Context, motivo: String? = null) {
        val p = parole ?: return
        val testo = if (motivo.isNullOrBlank()) p.fallita else "${p.fallita} ($motivo)"
        posa(context, p.titolo, testo, p.etichettaCampo, false, null)
    }

    /**
     * L'unico posto che disegna la notifica, nei tre momenti che ha.
     *
     * `etichettaCampo == null` vuol dire senza campo; `inCorso` mette la barra
     * indeterminata. `quandoArriva == null` significa «sto solo ridisegnando»:
     * l'ascoltatore e il ricevitore restano quelli di prima, e riregistrarli
     * lascerebbe in giro un ricevitore mai tolto a ogni cambio di stato.
     */
    private fun posa(
        context: Context,
        titolo: String,
        testo: String,
        etichettaCampo: String?,
        inCorso: Boolean,
        quandoArriva: Ascoltatore?,
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
        if (quandoArriva != null) {
            ascoltatore = quandoArriva
            registraRicevitore(context)
        }

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

        val costruttore = Notification.Builder(context, CANALE)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(titolo)
            .setContentText(testo)
            .setStyle(Notification.BigTextStyle().bigText(testo))
            // ⛔ Non si scarta: vedi il commento in cima. Chi la perde con uno
            // scorrimento resta in Impostazioni senza piu' dove scrivere.
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)

        if (etichettaCampo != null) {
            costruttore.addAction(
                Notification.Action.Builder(null, etichettaCampo, inSospeso)
                    .addRemoteInput(
                        android.app.RemoteInput.Builder(CHIAVE_CODICE)
                            .setLabel(etichettaCampo)
                            // ⛔ Sei cifre: la tastiera numerica risparmia alla
                            // persona il passaggio piu' sbagliato di tutta la
                            // procedura, che e' cercare i numeri mentre un
                            // codice scade.
                            .setAllowFreeFormInput(true)
                            .build(),
                    )
                    .build(),
            )
        }
        // La barra indeterminata: non sappiamo quanto manca — la scoperta
        // dell'annuncio dipende dalla rete — e una percentuale inventata sarebbe
        // una bugia piu' precisa, non un'informazione migliore.
        if (inCorso) costruttore.setProgress(0, 0, true)

        manager.notify(ID_NOTIFICA, costruttore.build())
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
        parole = null
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
