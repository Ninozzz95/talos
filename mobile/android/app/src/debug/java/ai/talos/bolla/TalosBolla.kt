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
        if (intent?.getBooleanExtra(EXTRA_SONDA, false) == true) {
            eseguiLaSonda(
                intent.getLongExtra(EXTRA_ATTESA, 6_000L),
                intent.getBooleanExtra(EXTRA_VELO, false),
            )
            return START_NOT_STICKY
        }
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
                setColor(coloreDelTema("ic_talos_bg", FONDO_DI_SCORTA))
                setStroke((2 * densita).toInt(), coloreDelTema("ic_talos_accent", ACCENTO_DI_SCORTA))
            }
            imageTintList = android.content.res.ColorStateList.valueOf(
                coloreDelTema("ic_talos_accent", ACCENTO_DI_SCORTA),
            )
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
     * ⛔ `voce=1` come tutte le altre porte. Owner 2026-08-11: «assicurati che
     * l'assistente si apra SEMPRE in modalità ascolto». Chi tocca il pallino
     * vuole parlargli; chi vuole scrivere ha il campo lì, e la tastiera non
     * sale più da sola.
     */
    private fun apriLaBarra() {
        /*
         * ⭐⭐ PRIMA SI PROVA LA PORTA DELL'ASSISTENTE, che consegna lo schermo.
         *
         * Owner 2026-08-11: «sul telefono TALOS non vede lo schermo, sul tablet
         * sì». Stessa app, stessi permessi, stessi valori in `settings`: la
         * differenza era la porta. Il gesto passa dall'assistente e il sistema
         * consegna `AssistStructure`; `startActivity` apre la stessa finestra
         * saltando l'assistente, e lì non arriva niente a nessuno.
         *
         * ⛔ E se il sistema dice di no — perché l'assistente è un altro — si
         * apre lo stesso, come prima: meglio una barra senza occhio che nessuna
         * barra. La spia dirà che non vede la schermata, e sarà vero.
         */
        if (ai.talos.agent.TalosAssistente.apriComeAssistente()) return
        val indirizzo = android.net.Uri.parse("talos://barra?voce=1&nodi=0&immagine=0")
        val apri = Intent(Intent.ACTION_VIEW, indirizzo, this, ai.talos.TalosBarraActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(ai.talos.TalosBarraActivity.EXTRA_BARRA, true)
        }
        runCatching { startActivity(apri) }
            .onFailure { Log.w(TAG, "$SEGNO la bolla non ha aperto la barra", it) }
    }

    /**
     * ⭐⭐ IL COLORE VIENE DAL MOTORE DEI TEMI, non da questo file.
     *
     * Owner 2026-08-11: «mi raccomando aggancia tutto al motore dei temi». La
     * prima versione della bolla aveva `#c08b3c` scritto dentro: il bronzo del
     * tema *calm*. Sarebbe stato giusto per un tema su quattordici, e sbagliato
     * per gli altri tredici — cioè una seconda verità sul colore di TALOS, che
     * il giorno che il tema cambia resta indietro senza dirlo a nessuno.
     *
     * ## Come lo sa, senza inventarsi niente
     *
     * Il tema attivo il nativo lo conosce già: è l'alias del lanciatore acceso,
     * e `TalosAppIconPlugin.activePreset()` lo legge. I colori dei quattordici
     * temi li genera `tools/android-assets/gen_theme_icons.py` dalla stessa
     * tabella che disegna le icone — una sorgente sola, per il web e per qui.
     *
     * ⛔ E se il tema non si sapesse, si ripiega su *calm* (quello di partenza)
     * invece di lasciare un pallino invisibile: un ripiego dichiarato è meglio
     * di un colore mancante, e questa riga dice quale.
     */
    private fun coloreDelTema(prefisso: String, scorta: Int): Int {
        val tema = runCatching { ai.talos.TalosAppIconPlugin.activePreset(this) }.getOrNull() ?: "calm"
        val id = resources.getIdentifier("${prefisso}_$tema", "color", packageName)
        if (id == 0) return scorta
        return runCatching { resources.getColor(id, theme) }.getOrDefault(scorta)
    }

    /**
     * ⛔ La sonda dell'apertura dal SOTTOFONDO. Vedi `probeApriDaSfondo`.
     *
     * Il velo è una finestra flottante VISIBILE, larga quanto lo schermo e alta
     * poco: quello che «hey TALOS» mostrerebbe davvero per dire «ti ascolto».
     * Se l'apertura riesce solo con lui, quel velo diventa parte del disegno.
     */
    private fun eseguiLaSonda(attesa: Long, conVelo: Boolean) {
        android.os.Handler(mainLooper).postDelayed({
            var velo: View? = null
            Log.i(
                TAG,
                "$SEGNO sonda: canDrawOverlays=${android.provider.Settings.canDrawOverlays(this)}" +
                    " pallinoAttaccato=${pallino != null}",
            )
            if (conVelo) {
                velo = runCatching { attaccaIlVelo() }
                    .onFailure { Log.w(TAG, "$SEGNO sonda: il velo è stato RIFIUTATO", it) }
                    .getOrNull()
                Log.i(TAG, "$SEGNO sonda: velo attaccato=${velo != null}")
            }
            Log.i(TAG, "$SEGNO sonda: provo ad aprire la barra, conVelo=$conVelo")
            apriLaBarra()
            android.os.Handler(mainLooper).postDelayed({
                velo?.let { v -> runCatching { getSystemService(WindowManager::class.java)?.removeView(v) } }
            }, 4_000)
        }, attesa)
    }

    private fun attaccaIlVelo(): View {
        val wm = getSystemService(WindowManager::class.java)!!
        val densita = resources.displayMetrics.density
        val vista = ImageView(this).apply {
            setImageResource(ai.talos.R.drawable.ic_tendina_talos)
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                setColor(coloreDelTema("ic_talos_bg", FONDO_DI_SCORTA))
                cornerRadius = 24 * densita
            }
            setPadding((16 * densita).toInt(), (16 * densita).toInt(), (16 * densita).toInt(), (16 * densita).toInt())
        }
        val p = WindowManager.LayoutParams(
            (220 * densita).toInt(),
            (72 * densita).toInt(),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            android.graphics.PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = (120 * densita).toInt()
        }
        wm.addView(vista, p)
        return vista
    }

    companion object {
        const val TAG = "TalosBolla"
        const val SEGNO = "🫧"
        private const val EXTRA_SONDA = "sonda"
        private const val EXTRA_ATTESA = "attesa"
        private const val EXTRA_VELO = "velo"

        fun sonda(contesto: Context, attesa: Long, conVelo: Boolean) {
            contesto.startForegroundService(
                Intent(contesto, TalosBolla::class.java)
                    .putExtra(EXTRA_SONDA, true)
                    .putExtra(EXTRA_ATTESA, attesa)
                    .putExtra(EXTRA_VELO, conVelo),
            )
        }

        private const val CANALE = "talos-bolla"
        private const val ID_AVVISO = 4711
        private const val LATO_DP = 52f
        private const val PADDING_DP = 13f
        /** Sotto questo spostamento il dito ha TOCCATO, non trascinato. */
        private const val SOGLIA_DP = 6f
        /*
         * ⛔ RIPIEGHI, non colori di TALOS: si usano solo se il tema attivo non
         * si riesce a leggere. Sono quelli di *calm*, il tema di partenza —
         * vedi `coloreDelTema`.
         */
        private val ACCENTO_DI_SCORTA = Color.parseColor("#c08b3c")
        private val FONDO_DI_SCORTA = Color.parseColor("#1e1f22")

        fun accendi(contesto: Context) {
            contesto.startForegroundService(Intent(contesto, TalosBolla::class.java))
        }

        fun spegni(contesto: Context) {
            contesto.stopService(Intent(contesto, TalosBolla::class.java))
        }
    }
}
