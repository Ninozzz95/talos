package ai.talos.agent

import android.os.Build
import android.view.textclassifier.TextClassificationManager
import android.view.textclassifier.TextLanguage
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executors

/**
 * ⭐ LA LINGUA DI UN TESTO SCRITTO (owner 28/10/2026: «se parlo in persiano a Talos mi risponde in inglese, sia in voce che
 * scrivendolo»; lingua delle risposte, ledger `LEDGER-LINGUA-DELLE-RISPOSTE-MOBILE-2026-10-28.md`).
 *
 * Usa il riconoscitore di lingua di ANDROID (`TextClassifier.detectLanguage`, API 29+): è del sistema, gira sul dispositivo, non
 * aggiunge dipendenze né condizioni di terzi (i termini di ML Kit l'owner li ha accettati solo per lo scanner dei QR, build.gradle) e
 * funziona anche senza Play Services (PJZ110, ROM CN).
 *
 * ⛔ Il plugin non decide niente: dice la lingua più probabile e quanto ne è sicuro, oppure niente. La soglia e cosa farne stanno nel
 * JS (`services/linguaDelTesto.ts`), in un posto solo.
 */
@CapacitorPlugin(name = "TalosLingua")
class TalosLinguaPlugin : Plugin() {

    // il classificatore può bloccare (carica il suo modello): mai sul thread principale
    private val lavoro = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun identifica(call: PluginCall) {
        val testo = call.getString("testo")?.trim().orEmpty()
        if (testo.isEmpty() || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.resolve(JSObject().put("lingua", null))
            return
        }
        lavoro.execute {
            val esito = runCatching {
                val gestore = context.getSystemService(TextClassificationManager::class.java)
                val classificatore = gestore?.textClassifier ?: return@runCatching null
                val lingue = classificatore.detectLanguage(TextLanguage.Request.Builder(testo).build())
                if (lingue.localeHypothesisCount == 0) return@runCatching null
                val prima = lingue.getLocale(0)
                prima.toLanguageTag() to lingue.getConfidenceScore(prima).toDouble()
            }.getOrNull()
            if (esito == null) {
                call.resolve(JSObject().put("lingua", null))
            } else {
                call.resolve(JSObject().put("lingua", esito.first).put("confidenza", esito.second))
            }
        }
    }
}
