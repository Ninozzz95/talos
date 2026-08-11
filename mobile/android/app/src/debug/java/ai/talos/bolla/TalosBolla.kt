package ai.talos.bolla

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import kotlin.math.abs

/**
 * ⭐⭐ LA BOLLA: il pallino di TALOS sopra le altre app. SOLO IN SVILUPPO.
 *
 * ## Perché esiste
 *
 * Owner 2026-08-11: sul suo ColorOS cinese il gesto dell'assistente **non
 * esiste**, quindi la barra non aveva nessuna porta. La scheda in tendina
 * (`TalosTendina`, in `main`) è la porta di tutti; questa è la sua, e la vuole
 * solo per sé — «è solo una cosa che serve a me».
 *
 * ⛔ Vive nel source set `debug`. In release non viene compilata, e il permesso
 * `SYSTEM_ALERT_WINDOW` non viene nemmeno chiesto. Un interruttore a runtime si
 * può sbagliare; un file che non entra nell'APK no.
 *
 * ## ⛔ Perché un servizio di PRIMO PIANO per un pallino
 *
 * Una finestra flottante muore col servizio che l'ha aggiunta, e un servizio
 * normale Android lo ferma quando gli pare. Un pallino che sparisce da solo
 * dopo qualche minuto sarebbe peggio di non averlo: la porta ci sarebbe a
 * volte. La notifica che il primo piano obbliga a mostrare è il prezzo onesto —
 * e dice a chi guarda che qualcosa dell'app è vivo.
 *
 * ## ⛔ Cosa NON fa, e perché
 *
 * Non ascolta, non legge, non guarda: aggiunge una vista e aspetta un dito.
 * Quando arriverà «hey TALOS» (compito #92) sarà QUESTO servizio a crescere, e
 * il tipo di primo piano diventerà anche `microphone` — perché il microfono si
 * dichiara, non si prende di soppiatto.
 */
class TalosBolla : Service() {

    private var finestre: WindowManager? = null
    private var pallino: View? = null
    private var posa: WindowManager.LayoutParams? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        avviaInPrimoPiano()
        if (pallino == null) runCatching { attacca() }
            .onFailure { Log.w(TAG, "$SEGNO la bolla non si è attaccata", it) }
        /*
         * ⛔ `START_NOT_STICKY`: se il sistema ci uccide non ci resuscita da
         * solo. Una finestra flottante che ricompare da sola dopo che Android
         * ha deciso di chiudere l'app è esattamente il comportamento che fa
         * disinstallare le app — e qui la persona ha un interruttore.
         */
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stacca()
        super.onDestroy()
    }

    private fun avviaInPrimoPiano() {
        val gestore = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && gestore?.getNotificationChannel(CANALE) == null) {
            gestore?.createNotificationChannel(
                NotificationChannel(CANALE, "TALOS", NotificationManager.IMPORTANCE_MIN).apply {
                    // ⛔ Muta e senza bollino: è un promemoria che il pallino è
                    // acceso, non un avviso. Una notifica che suona per dire
                    // «esisto» è la cosa che insegna a silenziare un'app intera.
                    setShowBadge(false)
                    setSound(null, null)
                    enableVibration(false)
                },
            )
        }
        val avviso = Notification.Builder(this, CANALE)
            .setSmallIcon(ai.talos.R.drawable.ic_tendina_talos)
            .setContentTitle("TALOS")
            .setContentText("Il pallino è acceso: toccalo per aprire la barra.")
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(ID_AVVISO, avviso, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ID_AVVISO, avviso)
        }
    }

    private fun attacca() {
        val wm = getSystemService(WindowManager::class.java) ?: return
        val densita = resources.displayMetrics.density
        val lato = (LATO_DP * densita).toInt()

        val vista = ImageView(this).apply {
            setImageResource(ai.talos.R.drawable.ic_tendina_talos)
            val bordo = (PADDING_DP * densita).toInt()
            setPadding(bordo, bordo, bordo, bordo)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(FONDO)
                setStroke((2 * densita).toInt(), BRONZO)
            }
            elevation = 8 * densita
            contentDescription = "TALOS"
        }

        val p = WindowManager.LayoutParams(
            lato,
            lato,
            // ⛔ `TYPE_APPLICATION_OVERLAY` è l'UNICO tipo che un'app normale può
            // usare da Android 8: i vecchi `TYPE_PHONE`/`TYPE_SYSTEM_ALERT`
            // lanciano un'eccezione, non si degradano.
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            /*
             * ⛔ `NOT_FOCUSABLE`: senza, il pallino ruberebbe il fuoco all'app
             * sotto e ne chiuderebbe la tastiera a ogni tocco. `LAYOUT_NO_LIMITS`
             * lo lascia arrivare fino ai bordi veri dello schermo.
             */
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            android.graphics.PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = resources.displayMetrics.heightPixels / 2
        }

        vista.setOnTouchListener(ManoSullaBolla(wm, p, densita))
        wm.addView(vista, p)
        finestre = wm
        pallino = vista
        posa = p
    }

    private fun stacca() {
        val vista = pallino ?: return
        runCatching { finestre?.removeView(vista) }
        pallino = null
        posa = null
        finestre = null
    }

    /**
     * Il dito sulla bolla: trascina, si aggancia al bordo, o apre la barra.
     *
     * ⛔ La soglia distingue un TOCCO da un TRASCINAMENTO, e senza di lei ogni
     * tocco muoverebbe il pallino di due pixel e non aprirebbe niente: nessun
     * dito umano preme perfettamente fermo.
     */
    private inner class ManoSullaBolla(
        private val wm: WindowManager,
        private val p: WindowManager.LayoutParams,
        private val densita: Float,
    ) : View.OnTouchListener {
        private var partenzaX = 0
        private var partenzaY = 0
        private var ditoX = 0f
        private var ditoY = 0f
        private var mosso = false

        override fun onTouch(vista: View, evento: MotionEvent): Boolean {
            when (evento.action) {
                MotionEvent.ACTION_DOWN -> {
                    partenzaX = p.x
                    partenzaY = p.y
                    ditoX = evento.rawX
                    ditoY = evento.rawY
                    mosso = false
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = evento.rawX - ditoX
                    val dy = evento.rawY - ditoY
                    if (!mosso && abs(dx) < SOGLIA_DP * densita && abs(dy) < SOGLIA_DP * densita) return true
                    mosso = true
                    p.x = partenzaX + dx.toInt()
                    p.y = partenzaY + dy.toInt()
                    runCatching { wm.updateViewLayout(vista, p) }
                    return true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (!mosso) {
                        apriLaBarra()
                        return true
                    }
                    // ⛔ Si aggancia al bordo più vicino: un pallino lasciato in
                    // mezzo allo schermo copre quello che stai leggendo, che è
                    // il difetto di ogni bolla fatta male.
                    val larghezza = resources.displayMetrics.widthPixels
                    val lato = (LATO_DP * densita).toInt()
                    p.x = if (p.x + lato / 2 < larghezza / 2) 0 else larghezza - lato
                    runCatching { wm.updateViewLayout(vista, p) }
                    return true
                }
            }
            return false
        }
    }

    /**
     * ⛔ `voce=0` come la scheda in tendina: chi tocca col dito vuole scrivere.
     * Chi arriva dal gesto dell'assistente — o un giorno dalla parola magica —
     * ha già usato la voce, e lì la barra parte in ascolto.
     */
    private fun apriLaBarra() {
        val indirizzo = android.net.Uri.parse("talos://barra?voce=0&nodi=0&immagine=0")
        val apri = Intent(Intent.ACTION_VIEW, indirizzo, this, ai.talos.TalosBarraActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(ai.talos.TalosBarraActivity.EXTRA_BARRA, true)
        }
        runCatching { startActivity(apri) }
            .onFailure { Log.w(TAG, "$SEGNO la bolla non ha aperto la barra", it) }
    }

    companion object {
        const val TAG = "TalosBolla"
        const val SEGNO = "🫧"
        private const val CANALE = "talos-bolla"
        private const val ID_AVVISO = 4711
        private const val LATO_DP = 52f
        private const val PADDING_DP = 13f
        /** Sotto questo spostamento il dito ha TOCCATO, non trascinato. */
        private const val SOGLIA_DP = 6f
        private val BRONZO = Color.parseColor("#c08b3c")
        private val FONDO = Color.parseColor("#e6141414")

        fun accendi(contesto: Context) {
            contesto.startForegroundService(Intent(contesto, TalosBolla::class.java))
        }

        fun spegni(contesto: Context) {
            contesto.stopService(Intent(contesto, TalosBolla::class.java))
        }
    }
}
