package ai.talos.agent

import android.os.SystemClock
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * ⭐⭐ IL FRENO: «mi hai toccato, mi fermo».
 *
 * ## Perché al livello grezzo e non con l'accessibilità
 *
 * MISURATO col dito dell'owner il 2026-08-10, nei DUE versi:
 *
 * | chi tocca                | righe da `touchpanel` (`/dev/input/event4`) |
 * |--------------------------|---------------------------------------------|
 * | **un dito vero**         | **1.369** (1.018 EV_ABS, 327 EV_SYN, 24 EV_KEY) |
 * | due `input tap` NOSTRI   | **1** (sola intestazione)                    |
 *
 * ⇒ I tocchi che iniettiamo noi passano dal framework e **non toccano mai il
 * pannello**: al livello grezzo un dito umano e un tocco nostro sono opposti.
 * È il discriminatore perfetto, e non costa niente a chi possiede il telefono.
 *
 * ⛔ La strada dell'accessibilità è CHIUSA e sta scritta in `TalosOcchio`:
 * `TYPE_TOUCH_INTERACTION_START` non arriva senza l'esplorazione al tocco, che
 * cambierebbe il modo in cui la persona usa il telefono.
 *
 * ⛔⛔ E la trappola della misura, che è costata quasi la strada giusta: il
 * primo conteggio dava `0` perché cercava `ABS_MT`/`BTN_TOUCH`, mentre
 * `getevent -lt` mette i codici in un'altra colonna. **Contare la stringa
 * sbagliata assomiglia in tutto all'assenza di dati.** Per questo qui si conta
 * il NOME DEL DISPOSITIVO, che è stabile, e non i nomi dei codici.
 */
object TalosDitoVero {

    /** Il pannello dice il suo nome in `getevent -p`: non si indovina un numero. */
    private const val NOME_PANNELLO = "touchpanel"

    @Volatile private var processo: Process? = null
    @Volatile private var ultimo: Long = 0

    /**
     * Comincia ad ascoltare il pannello. Serve la shell del ponte: un'app
     * normale non legge `/dev/input`.
     *
     * ⛔ Si passa il comando gia' pronto invece di costruirlo qui: chi possiede
     * il ponte e' `TalosPonteAdb`, e due posti che sanno come si esegue una
     * shell sono due posti che possono divergere.
     */
    fun ascolta(esegui: (String) -> Process?) {
        smetti()
        val p = esegui("getevent -l") ?: run {
            Log.i(TAG, "nessuna shell: il freno non e' armato")
            return
        }
        processo = p
        Thread({
            runCatching {
                BufferedReader(InputStreamReader(p.inputStream)).useLines { righe ->
                    var pannello: String? = null
                    for (riga in righe) {
                        // `add device N: /dev/input/eventX` seguito da `name: "..."`
                        if (riga.contains("name:") && riga.contains(NOME_PANNELLO)) {
                            pannello = ultimoDispositivo
                            continue
                        }
                        if (riga.startsWith("add device")) {
                            ultimoDispositivo = riga.substringAfter(": ").trim()
                            continue
                        }
                        if (pannello != null && riga.startsWith(pannello)) {
                            ultimo = SystemClock.uptimeMillis()
                        }
                    }
                }
            }
        }, "talos-dito").start()
    }

    fun smetti() {
        runCatching { processo?.destroy() }
        processo = null
    }

    /** Da quanti millisecondi una mano vera non tocca. `null` se non ha mai toccato. */
    fun dallUltimoDito(): Long? =
        if (ultimo == 0L) null else SystemClock.uptimeMillis() - ultimo

    /**
     * ⛔ La domanda che il ciclo fa PRIMA di ogni azione. Mezzo secondo e' la
     * finestra in cui un dito e un nostro tocco si sovrapporrebbero: dentro
     * quella, si cede il telefono e basta.
     */
    fun haToccato(entroMs: Long = 500): Boolean =
        (dallUltimoDito() ?: Long.MAX_VALUE) <= entroMs

    @Volatile private var ultimoDispositivo: String? = null
    private const val TAG = "TalosDito"
}
