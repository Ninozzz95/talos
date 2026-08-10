package ai.talos.agent

import android.os.SystemClock
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * ⭐ La porta fra il pilota (JavaScript) e l'occhio (il servizio).
 *
 * Due metodi soli, e non è povertà: `guarda` e `agisci` sono l'intero
 * vocabolario di un agente che tocca uno schermo. Tutto il resto — quale
 * elemento, con che testo — sta nei dati.
 *
 * ⛔ `guarda` porta con sé il TEMPO che ci ha messo. Non è telemetria per
 * curiosità: è il numero che ha deciso l'architettura (2.216 ms con
 * `uiautomator dump` contro 2-26 ms qui), e se un giorno risalisse lo si deve
 * vedere subito, non scoprire da una lentezza inspiegata.
 */
@CapacitorPlugin(name = "TalosSchermo")
class TalosSchermoPlugin : Plugin() {

    @PluginMethod
    fun disponibile(call: PluginCall) {
        call.resolve(JSObject().put("aperto", TalosOcchio.aperto() != null))
    }

    @PluginMethod
    fun guarda(call: PluginCall) {
        val occhio = TalosOcchio.aperto()
        if (occhio == null) {
            call.reject("TALOS_OCCHIO_CHIUSO", "TALOS_OCCHIO_CHIUSO")
            return
        }
        val t0 = SystemClock.uptimeMillis()
        val elenco = occhio.interattivi()
        val righe = JSArray()
        for (e in elenco) {
            righe.put(
                JSObject()
                    .put("indice", e.indice)
                    .put("tipo", e.tipo)
                    .put("etichetta", e.etichetta)
                    .also { if (e.attivo != null) it.put("attivo", e.attivo) },
            )
        }
        call.resolve(
            JSObject()
                .put("elementi", righe)
                .put("millisecondi", SystemClock.uptimeMillis() - t0)
                // ⛔ Il freno viaggia con lo sguardo: chi decide deve sapere se
                // nel frattempo una mano vera ha toccato lo schermo.
                .also { o -> TalosOcchio.dallUltimoDito()?.let { o.put("dallUltimoDito", it) } },
        )
    }

    @PluginMethod
    fun agisci(call: PluginCall) {
        val occhio = TalosOcchio.aperto()
        if (occhio == null) {
            call.reject("TALOS_OCCHIO_CHIUSO", "TALOS_OCCHIO_CHIUSO")
            return
        }
        val indice = call.getInt("indice")
        val azione = call.getString("azione")
        if (indice == null || azione == null) {
            call.reject("TALOS_AZIONE_INCOMPLETA", "TALOS_AZIONE_INCOMPLETA")
            return
        }
        val t0 = SystemClock.uptimeMillis()
        val motivo = occhio.esegui(indice, azione, call.getString("testo"))
        val esito = JSObject()
            .put("fatto", motivo == null)
            .put("millisecondi", SystemClock.uptimeMillis() - t0)
        if (motivo != null) esito.put("motivo", motivo)
        call.resolve(esito)
    }
}
