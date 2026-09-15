package ai.talos

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log

/**
 * ⭐⭐ LA SCHEDA IN TENDINA: la porta della barra che NON dipende dalla ROM.
 *
 * ## Perché esiste — owner 2026-08-11
 *
 * «Su ColorOS cinese non c'è un modo per mappare i gesti per l'assistente».
 * ⇒ Sul suo telefono la barra di TALOS, che pure funziona, **non ha nessuna
 * porta**: il ruolo di assistente è assegnato (lo assegna il ponte in casa), ma
 * il gesto che dovrebbe chiamarlo non esiste in quella ROM.
 *
 * Questa è la porta più economica che Android offra: **zero permessi**, nessun
 * servizio in sottofondo, nessun consumo. Scendi le notifiche, tocchi «TALOS»,
 * si apre la barra sopra l'app dov'eri.
 *
 * ⛔ E non è un ripiego per una ROM sola: il gesto dell'assistente cambia da
 * produttore a produttore ed è la cosa che un'app non può controllare. Una
 * funzione che si raggiunge da una porta sola è una funzione che qualcuno non
 * raggiungerà mai — la stessa regola che ci fa dare DUE porte a tutto.
 *
 * ## ⛔ `startActivityAndCollapse`, e perché non basta `startActivity`
 *
 * Una scheda della tendina è premuta mentre l'app è in sottofondo, e da
 * Android 10 avviare un'activity da lì è vietato. `startActivityAndCollapse` è
 * l'unica forma pensata per questo caso: chiude la tendina E fa partire
 * l'activity con l'esenzione del sistema. Da Android 14 vuole una
 * `PendingIntent` invece di un `Intent`, e la vecchia forma **lancia
 * un'eccezione** se chiamata su quelle versioni: servono entrambe.
 */
class TalosTendina : TileService() {

    /**
     * ⛔ La scheda si dichiara ATTIVA e basta: non ha uno stato acceso/spento.
     *
     * Una scheda che resta `STATE_INACTIVE` viene disegnata spenta, e chi la
     * guarda legge «TALOS è disattivato» — che è falso. Qui il tocco è
     * un'azione, non un interruttore, e l'aspetto deve dirlo.
     */
    override fun onStartListening() {
        super.onStartListening()
        qsTile?.apply {
            state = Tile.STATE_ACTIVE
            label = getString(R.string.app_name)
            updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        /*
         * ⭐⭐ ANCHE DA QUI si prova prima la porta dell'assistente.
         *
         * Owner 2026-08-11, sul telefono: la barra si apriva e l'occhio non
         * vedeva niente. La causa non era un permesso — era che `startActivity`
         * apre la finestra SALTANDO l'assistente, e solo l'assistente riceve la
         * struttura della schermata. La tendina aveva lo stesso difetto del
         * pallino, per la stessa ragione.
         *
         * ⛔ E NON serve un `startActivityAndCollapse` per chiudere la tendina.
         * L'avevo messo, temendo che il pannello restasse aperto sopra la barra;
         * MISURATO sul telefono, la tendina si chiude lo stesso e la barra
         * prende il fuoco (`mCurrentFocus=TalosBarraActivity`, verificato anche
         * a schermo con la spia dell'occhio a 244 nodi).
         *
         * ⛔⛔ E una precisazione che mi sono già dovuto correggere una volta:
         * nel log compare `checkBackgroundActivityPermission deny!` su
         * `TalosBarraActivity`. Avevo scritto che era colpa dell'intent vuoto di
         * quella riga — **falso**: la riga non c'è più e il rifiuto compare
         * identico. È il controllo della ROM sull'activity che la SESSIONE
         * dell'assistente lancia, e non impedisce niente: subito dopo arriva
         * `contesto ... nodi=448`. Un messaggio d'errore vero che riguarda
         * un'altra domanda — vedi `il-colore-dice-chi-ha-disegnato`.
         */
        if (ai.talos.agent.TalosAssistente.apriComeAssistente()) return
        val apri = intentDellaBarra()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val consegna = PendingIntent.getActivity(
                    this,
                    0,
                    apri,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
                startActivityAndCollapse(consegna)
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(apri)
            }
        } catch (errore: Exception) {
            // ⛔ Si registra e si tace: qui non c'è nessuna schermata nostra su
            // cui mostrare un errore — la tendina è del sistema. Un'eccezione
            // non gestita farebbe invece morire il processo della tendina, che
            // per chi guarda è il telefono che si blocca.
            Log.w(TAG, "$SEGNO la scheda non è riuscita ad aprire la barra", errore)
        }
    }

    /**
     * ⛔ `voce=1` — e prima qui c'era `voce=0`, con la sua brava ragione.
     *
     * Avevo scritto: «chi tocca una scheda col dito si aspetta di scrivere».
     * L'owner l'ha corretto l'11 agosto: «assicurati che l'assistente si apra
     * SEMPRE in modalità ascolto». Ha ragione, ed è la stessa ragione per cui
     * la barra è un assistente e non una casella di testo: chi lo apre lo apre
     * per PARLARGLI, e chi vuole scrivere ha il campo lì sotto — che ora non
     * fa nemmeno salire la tastiera da solo.
     */
    private fun intentDellaBarra(): Intent {
        val indirizzo = android.net.Uri.parse("talos://barra?voce=1&nodi=0&immagine=0")
        return Intent(Intent.ACTION_VIEW, indirizzo, this, TalosBarraActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(TalosBarraActivity.EXTRA_BARRA, true)
        }
    }

    private companion object {
        const val TAG = "TalosTendina"
        const val SEGNO = "⛺"
    }
}
