package ai.talos.terminal

import ai.talos.TalosRunService
import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * ⛔ F4 — «Notifica solo mentre lavora» (owner 13/10/2026; ledger `LEDGER-CODICE-SENZA-PONTE-2026-10-13.md` §14-15).
 *
 * Con il Codice in casa Node è figlio dell'app e sta nel suo cgroup: se l'app va in cache Android la congela e il giro si
 * ferma. Il servizio in primo piano `TalosRunService` la tiene viva. MISURATO sul Pad il 14/10: in secondo piano la WebView
 * è congelata anche col servizio acceso, quindi la fine del giro non la può vedere il JavaScript. La vede questo oggetto,
 * che vive nel processo dell'app: chiede lo stato al server in casa ogni [GIRO_MS] e rilascia il servizio quando la
 * sessione ha finito, è stata interrotta, o il server non risponde per [ASSENZE] volte di fila (una notifica che sopravvive
 * al lavoro è peggio di nessuna).
 *
 * Il JavaScript chiama [segui] a `RunStarted` e [lascia] a `RunFinished`/`RunError` (via veloce con l'app davanti).
 */
object TalosCodiceCustode {
    private const val TAG = "TalosCodiceCustode"
    const val GIRO_MS = 5_000L
    const val ASSENZE = 3
    private const val ATTESA_MS = 2_500

    /** `GET /api/v1/sessions` → sessione → sta lavorando (né conclusa né interrotta); `null` se la risposta non è buona. */
    fun statiDaRisposta(corpo: String): Map<String, Boolean>? {
        return try {
            val json = JSONObject(corpo)
            if (!json.optBoolean("ok", false)) return null
            val voci = json.optJSONObject("data")?.optJSONArray("items") ?: return null
            val stati = LinkedHashMap<String, Boolean>()
            for (i in 0 until voci.length()) {
                val voce = voci.optJSONObject(i) ?: continue
                val id = voce.optString("sessionId", "")
                if (id.isEmpty()) continue
                stati[id] = !voce.optBoolean("conclusa", false) && !voce.optBoolean("interrotta", false)
            }
            stati
        } catch (_: Exception) {
            null
        }
    }

    /** Le sessioni seguite e le risposte mancate di fila: la parte che si prova senza Android. */
    class Registro {
        private val assenze = LinkedHashMap<String, Int>()

        /** Solo una sessione che il server dice al lavoro: i giri vecchi che il flusso ripete all'apertura non accendono niente. */
        fun daSeguire(id: String, stati: Map<String, Boolean>?): Boolean = stati?.get(id) == true

        fun aggiungi(id: String) {
            assenze[id] = 0
        }

        fun togli(id: String): Boolean = assenze.remove(id) != null

        fun vuoto(): Boolean = assenze.isEmpty()

        /** Un giro di controllo: torna le sessioni da rilasciare. `stati == null` = server non raggiungibile. */
        fun passo(stati: Map<String, Boolean>?): List<String> {
            val finite = mutableListOf<String>()
            for (id in assenze.keys.toList()) {
                when (stati?.get(id)) {
                    true -> assenze[id] = 0
                    false -> finite += id
                    null -> {
                        val volte = (assenze[id] ?: 0) + 1
                        if (volte >= ASSENZE) finite += id else assenze[id] = volte
                    }
                }
            }
            finite.forEach { assenze.remove(it) }
            return finite
        }
    }

    private val registro = Registro()
    private var filo: ScheduledExecutorService? = null

    private fun titolare(id: String) = "codice:$id"

    /** Fa rete: mai sul filo principale (i metodi dei plugin Capacitor non ci girano). Torna `true` se il giro ora è custodito. */
    fun segui(context: Context, id: String, titolo: String, testo: String): Boolean {
        val app = context.applicationContext
        val stati = statoServer(app)
        synchronized(this) {
            if (!registro.daSeguire(id, stati)) return false
            if (!TalosRunService.acquisisci(app, titolare(id), titolo, testo)) return false
            registro.aggiungi(id)
            if (filo == null) {
                filo = Executors.newSingleThreadScheduledExecutor { compito ->
                    Thread(compito, "talos-custode-codice").apply { isDaemon = true }
                }.also { it.scheduleWithFixedDelay({ controlla(app) }, GIRO_MS, GIRO_MS, TimeUnit.MILLISECONDS) }
            }
            return true
        }
    }

    fun lascia(context: Context, id: String) {
        synchronized(this) {
            if (registro.togli(id)) TalosRunService.rilascia(context.applicationContext, titolare(id))
            fermaSeVuoto()
        }
    }

    private fun controlla(app: Context) {
        val stati = statoServer(app)
        synchronized(this) {
            for (id in registro.passo(stati)) TalosRunService.rilascia(app, titolare(id))
            fermaSeVuoto()
        }
    }

    private fun fermaSeVuoto() {
        if (!registro.vuoto()) return
        filo?.shutdown()
        filo = null
    }

    /** Lo stato delle sessioni dal server in casa, col suo segreto (mai nel registro); `null` se non è in casa o non risponde. */
    private fun statoServer(context: Context): Map<String, Boolean>? {
        val segreto = TalosCodiceInCasa.segretoSeInCasa(context)?.segreto ?: return null
        return try {
            val connessione = URL("http://127.0.0.1:${TalosCodiceInCasa.PORTA}/api/v1/sessions").openConnection() as HttpURLConnection
            try {
                connessione.connectTimeout = ATTESA_MS
                connessione.readTimeout = ATTESA_MS
                connessione.setRequestProperty("Accept", "application/json")
                connessione.setRequestProperty("Authorization", "Bearer $segreto")
                if (connessione.responseCode != 200) null
                else statiDaRisposta(connessione.inputStream.bufferedReader().use { it.readText() })
            } finally {
                connessione.disconnect()
            }
        } catch (guasto: Exception) {
            Log.w(TAG, "stato del server non letto: ${guasto.javaClass.simpleName}")
            null
        }
    }
}
