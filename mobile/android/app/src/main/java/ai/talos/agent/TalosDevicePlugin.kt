package ai.talos.agent

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * ⭐ Il PRIMO tool che tocca davvero il telefono — e non chiede niente a nessuno.
 *
 * ## Perché comincia dalla vibrazione
 *
 * Owner 2026-08-08, elencando cosa vuole: «modificare i permessi del telefono,
 * vibrazioni, collegare a reti WiFi». Di quelle tre, due passano da Shizuku — e
 * su ColorOS Shizuku non riesce nemmeno ad autorizzarci, MISURATO. La terza no:
 * `VIBRATE` è un permesso normale, si dichiara nel manifest e funziona.
 *
 * ⇒ È la prima cosa della lista che TALOS può fare **oggi**, su ogni telefono,
 * senza cancelli che aprono solo altri. Un pezzo piccolo che funziona vale più
 * di tre grossi che aspettano.
 *
 * ## Perché non è «solo una vibrazione»
 *
 * Perché è il primo attraversamento completo: il modello chiede, il catalogo dei
 * permessi decide, la scheda di consenso mostra una frase invece di un nome sul
 * filo, l'esecutore verifica la postcondizione, e l'audit registra. Tutta la
 * macchina di A e B, provata su qualcosa che si **sente** in mano.
 *
 * Il prossimo tool privilegiato entrerà nella stessa fessura, e a quel punto
 * sarà una fessura già battuta.
 *
 * ## ⛔ Il limite dichiarato invece che scoperto
 *
 * Un telefono può non avere il vibratore, e uno in silenzioso può ignorare la
 * richiesta. Non sono guasti: sono esiti, e vanno detti. Un tool che risponde
 * «fatto» quando non è successo niente insegna a non fidarsi di tutti gli altri.
 */
@CapacitorPlugin(name = "TalosDevice")
class TalosDevicePlugin : Plugin() {

    /** Il tetto: oltre, non è un segnale ma un fastidio. */
    private val MAX_MS = 2_000L

    private fun vibratore(): Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    /**
     * Vibra, e dice cosa è successo davvero.
     *
     * ⛔ `hasVibrator` PRIMA di provare: su un tablet senza motore la chiamata
     * non fallisce, semplicemente non fa niente — e rispondere «fatto» sarebbe
     * la bugia più facile da raccontare e la più difficile da scoprire.
     */
    @PluginMethod
    fun vibrate(call: PluginCall) {
        val chiesti = (call.getInt("milliseconds") ?: 200).toLong()
        // Si tronca invece di rifiutare: chi chiede dieci secondi vuole «un
        // segnale forte», non un errore, e il tetto lo dice nella risposta.
        val durata = chiesti.coerceIn(1L, MAX_MS)

        val v = vibratore()
        val result = JSObject()
        result.put("requestedMs", chiesti)
        result.put("appliedMs", durata)

        if (v == null || !v.hasVibrator()) {
            result.put("vibrated", false)
            result.put("reason", "no-vibrator")
            call.resolve(result)
            return
        }

        val esito = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(durata, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(durata)
            }
        }
        result.put("vibrated", esito.isSuccess)
        if (esito.isFailure) result.put("reason", "refused")
        call.resolve(result)
    }
}
