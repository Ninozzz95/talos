package ai.talos.agent

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * ⭐⭐ IL CAMPO CHE GALLEGGIA SOPRA LE IMPOSTAZIONI.
 *
 * ## Il difetto che risolve, misurato sul Pad il 2026-08-08 alle 22:24
 *
 * Il giro dell'accoppiamento si spezzava all'ultimo passo. La persona apre
 * Impostazioni → Debug wireless → «Accoppia con codice», legge `722879`, passa a
 * TALOS per scriverlo — e **in quel momento la finestrella si chiude**. Con lei
 * muore il servizio `_adb-tls-pairing._tcp`, e TALOS diceva, correttamente, di
 * non sentire più l'annuncio.
 *
 * Il servizio di accoppiamento vive **quanto la finestrella di sistema**. Non è
 * un difetto nostro: è come Android l'ha fatto.
 *
 * ## ⭐ Perché una finestra flottante lo risolve davvero
 *
 * Perché non manda Impostazioni in secondo piano. La finestrella resta a
 * schermo, l'annuncio resta vivo, e la persona scrive le sei cifre senza uscire.
 *
 * ⛔ E la premessa era già provata, senza che me ne accorgessi: il **primo**
 * accoppiamento riuscito di stasera è avvenuto proprio così — `adb pair` lanciato
 * mentre la finestrella era ancora aperta. È fallito solo quando ho cambiato app.
 *
 * ## ⛔ I flag della finestra NON sono un dettaglio
 *
 * Cercando come lo fanno gli altri (documentazione Android sulla visibilità del
 * metodo di input) le tre strade si escludono a vicenda:
 *
 * - **nessun flag** → la finestra sta DIETRO la tastiera e **può ricevere testo**
 * - `FLAG_NOT_FOCUSABLE` → sta sopra la tastiera ma **non riceve testo**
 * - `FLAG_ALT_FOCUSABLE_IM` → riceve il fuoco ma **non si collega** alla tastiera
 *
 * Qui serve scrivere sei cifre, quindi: nessun flag. È l'unica combinazione in
 * cui il campo funziona, e va scritto perché «aggiungo NOT_FOCUSABLE così non
 * dà fastidio» è la modifica ovvia che romperebbe tutto in silenzio.
 */
object TalosPonteOverlay {

    private var vista: View? = null
    private val mano = Handler(Looper.getMainLooper())

    /** Se il sistema ci lascia disegnare sopra le altre app. */
    fun consentito(context: Context): Boolean = Settings.canDrawOverlays(context)

    /** Se la finestra è a schermo adesso. */
    fun aperta(): Boolean = vista != null

    /**
     * Mostra il campo. `esito` riceve `null` mentre lavora, poi il motivo o
     * `"ok"`.
     *
     * ⛔ Va chiamato dal thread principale: `WindowManager.addView` lo pretende.
     */
    @SuppressLint("SetTextI18n")
    fun mostra(
        context: Context,
        titolo: String,
        istruzione: String,
        etichettaPulsante: String,
        accoppia: (String, (Boolean, String) -> Unit) -> Unit,
        quandoFinisce: (Boolean, String) -> Unit,
    ): Boolean {
        if (!consentito(context)) return false
        chiudi(context)

        val gestore = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            ?: return false
        val densita = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * densita).toInt()

        val scatola = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(18))
            /*
             * ⛔ La larghezza si FISSA, non si lascia decidere al contenuto.
             *
             * Misurato sul Pad il 2026-08-08 alle 22:54: con WRAP_CONTENT la
             * scatola prendeva la misura del campo (220dp) e l'istruzione veniva
             * tagliata a meta' frase — «Non uscire da Impostazioni: la». Una
             * spiegazione troncata e' peggio di nessuna spiegazione: sembra un
             * guasto e non si capisce lo stesso cosa fare.
             */
            minimumWidth = dp(320)
            background = GradientDrawable().apply {
                cornerRadius = dp(18).toFloat()
                setColor(Color.parseColor("#FF16161A"))
                setStroke(dp(1), Color.parseColor("#FF3A3A42"))
            }
        }

        val intestazione = TextView(context).apply {
            text = titolo
            setTextColor(Color.parseColor("#FFF5F5F7"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val spiegazione = TextView(context).apply {
            text = istruzione
            maxLines = 6
            setTextColor(Color.parseColor("#FFA0A0AA"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setPadding(0, dp(6), 0, dp(12))
        }
        val campo = EditText(context).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = "000000"
            setHintTextColor(Color.parseColor("#FF55555E"))
            setTextColor(Color.parseColor("#FFF5F5F7"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            letterSpacing = 0.3f
            gravity = Gravity.CENTER
            filters = arrayOf(android.text.InputFilter.LengthFilter(6))
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                setColor(Color.parseColor("#FF202027"))
                setStroke(dp(1), Color.parseColor("#FF3A3A42"))
            }
        }
        val motivo = TextView(context).apply {
            setTextColor(Color.parseColor("#FFE0A458"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            visibility = View.GONE
            setPadding(0, dp(8), 0, 0)
        }
        val pulsante = Button(context).apply {
            text = etichettaPulsante
            isAllCaps = false
            setTextColor(Color.parseColor("#FF16161A"))
            background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                setColor(Color.parseColor("#FFD8A24A"))
            }
        }

        scatola.addView(intestazione)
        scatola.addView(spiegazione)
        scatola.addView(
            campo,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
        )
        scatola.addView(motivo)
        scatola.addView(
            pulsante,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)).apply {
                topMargin = dp(12)
            },
        )

        pulsante.setOnClickListener {
            val codice = campo.text?.toString()?.trim().orEmpty()
            if (!codice.matches(Regex("""^\d{6}$"""))) {
                motivo.text = "Sei cifre."
                motivo.visibility = View.VISIBLE
                return@setOnClickListener
            }
            pulsante.isEnabled = false
            motivo.visibility = View.GONE
            accoppia(codice) { riuscito, dettaglio ->
                mano.post {
                    if (riuscito) {
                        chiudi(context)
                        quandoFinisce(true, dettaglio)
                    } else {
                        pulsante.isEnabled = true
                        motivo.text = dettaglio
                        motivo.visibility = View.VISIBLE
                    }
                }
            }
        }

        val tipo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val parametri = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            tipo,
            /*
             * ⛔⛔ DUE COSE DIVERSE, e confonderle costa il giro intero.
             *
             * - NESSUN flag di FUOCO (`FLAG_NOT_FOCUSABLE`): senza fuoco il
             *   campo non riceverebbe una cifra. Vedi il commento in cima.
             * - `FLAG_NOT_TOUCH_MODAL`: **obbligatorio**, e me lo ero
             *   dimenticato. Una finestra è «touch modal» per impostazione
             *   predefinita: si prende TUTTI i tocchi dello schermo, anche
             *   quelli fuori dai propri bordi.
             *
             * Misurato sul Pad il 2026-08-08 alle 23:05: con la finestra a
             * schermo, quattro scorrimenti sulla lista delle Opzioni
             * sviluppatore non la muovevano di un pixel, e un tocco su
             * «Memoria» non apriva niente — `topResumedActivity` restava
             * `DevelopmentSettingsDashboardActivity`. Sembrava che Impostazioni
             * si fosse bloccata; in realtà i tocchi li stavamo mangiando noi.
             *
             * ⇒ Ed è esattamente ciò che serve qui: la persona deve poter
             * navigare fino a «Debug wireless → Accoppia con codice» MENTRE il
             * nostro campo la aspetta. Una finestra che si prende tutto le
             * impedirebbe di raggiungere il codice che le stiamo chiedendo.
             */
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            android.graphics.PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = dp(80)
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }

        return runCatching {
            gestore.addView(scatola, parametri)
            vista = scatola
            campo.requestFocus()
            // La tastiera non compare da sola in una finestra di sistema: si
            // chiede, altrimenti c'e' un campo che sembra rotto.
            mano.postDelayed({
                runCatching {
                    val ime = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
                    ime?.showSoftInput(campo, InputMethodManager.SHOW_IMPLICIT)
                }
            }, 220)
            true
        }.getOrElse { false }
    }

    /** Toglie la finestra. Idempotente: chiamarla due volte non è un errore. */
    fun chiudi(context: Context) {
        val corrente = vista ?: return
        vista = null
        runCatching {
            val gestore = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            gestore?.removeView(corrente)
        }
    }
}
