package ai.talos.agent

import android.accessibilityservice.AccessibilityService
import android.os.SystemClock
import android.util.Log
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

    /**
     * Arma il freno: da adesso qualunque ingresso fisico ferma l'agente.
     *
     * ⛔ Il comando lo avvia chi possiede il ponte — qui si azzera soltanto il
     * riferimento. Due posti che sanno come si esegue una shell sono due posti
     * che possono divergere.
     *
     * ⭐ I FRENI SONO DUE, e si armano tutti e due qui.
     *
     * Quello **grezzo** legge `/dev/input` e sente ogni tocco, compreso il dito
     * appoggiato dove non c'è niente — ma vuole l'identità della shell, cioè il
     * ponte acceso. Quello **degli eventi** vive nell'occhio, non chiede niente
     * a nessuno, e sente ogni tocco che fa qualcosa. Il secondo esiste perché il
     * primo non c'è su un telefono appena installato, e senza freno il pilota
     * si rifiutava di partire: la funzione era di fatto spenta per chiunque.
     */
    @PluginMethod
    fun armaIlFreno(call: PluginCall) {
        TalosDitoVero.azzera()
        TalosOcchio.armaIlFrenoDegliEventi()
        call.resolve(
            JSObject()
                .put("armato", TalosDitoVero.armato() || TalosOcchio.aperto() != null)
                .put("comando", JSArray.from(TalosDitoVero.COMANDO.toTypedArray()))
                .put("percorso", TalosDitoVero.PERCORSO),
        )
    }

    /*
     * ⛔⛔ IL PID STA NELLA RISPOSTA PERCHE' E' LA DOMANDA VERA — 2026-08-13.
     *
     * MISURATO stamattina sul Pad: `dumpsys accessibility` diceva
     * `Bound services:{... label=TALOS — controllo del telefono ...}` e
     * `TalosOcchio: occhio aperto` era in `logcat` alle 09:03:18 — cioe'
     * `onServiceConnected()` ERA passato e aveva riempito `vivo`. Nello stesso
     * momento questa chiamata rispondeva `aperto=false`, e TALOS diceva alla
     * persona «serve il permesso di lettura dello schermo».
     *
     * Una static vuota mentre il servizio e' vivo lascia due spiegazioni, e da
     * qui non si distinguono: o `vivo` e' stato azzerato, o **stiamo guardando
     * la static di un ALTRO PROCESSO** — cioe' il servizio di accessibilita' e
     * la WebView non condividono la memoria che credevamo condivisa.
     *
     * Il pid le separa in una riga: se il pid qui e quello della riga
     * `occhio aperto` coincidono, il problema e' il ciclo di vita; se
     * differiscono, e' l'architettura, e nessuna cura al ciclo di vita puo'
     * funzionare.
     */
    /**
     * ⭐⭐⭐ L'ULTIMO CENTIMETRO: preme UN pulsante, e lo trova senza indovinare.
     *
     * ## Il problema, con i numeri di chi lo fa da anni
     *
     * Dalla ricerca 2026 sugli strumenti di automazione: cercare il pulsante
     * per etichetta o posizione si rompe a ogni aggiornamento dell'app —
     * MacroDroid, che fa solo quello, **fallisce sul 31% dei form dinamici**.
     *
     * ⇒ Qui si cerca per `viewId` (`com.whatsapp:id/send`): il nome della
     * risorsa non e' tradotto e non si sposta col layout. Le descrizioni sono
     * il ripiego, e se falliscono entrambe **non si tocca niente**: un tocco
     * alla cieca dentro una conversazione manda la cosa sbagliata a una
     * persona vera.
     *
     * ## E la parte VELOCE: si aspetta l'EVENTO, non l'orologio
     *
     * Un `sleep(2000)` e' sempre o troppo o troppo poco. Qui si guarda il nodo
     * finche' compare, con passi brevi, e si esce **appena** c'e' — che su una
     * finestra gia' pronta vuol dire al primo giro, cioe' in millisecondi.
     */
    @PluginMethod
    fun premiPulsante(call: PluginCall) {
        val occhio = TalosOcchio.aperto()
        if (occhio == null) {
            call.resolve(JSObject().put("fatto", false).put("motivo", "occhio-chiuso"))
            return
        }
        val viewId = call.getString("viewId").orEmpty()
        val descrizioni = call.getArray("descrizioni")?.toList<String>() ?: emptyList()
        val inizio = SystemClock.uptimeMillis()
        var trovato: AccessibilityNodeInfo? = null
        var via = ""
        // ⛔ Un tetto c'e', ed e' basso: se dopo due secondi il pulsante non
        // esiste, non esiste — e insistere significherebbe premere qualcosa
        // che nel frattempo e' cambiato.
        while (SystemClock.uptimeMillis() - inizio < 2_000 && trovato == null) {
            val radice = occhio.rootInActiveWindow
            if (radice != null) {
                if (viewId.isNotEmpty()) {
                    trovato = radice.findAccessibilityNodeInfosByViewId(viewId)
                        ?.firstOrNull { it.isClickable || it.isEnabled }
                    if (trovato != null) via = "viewId"
                }
                if (trovato == null) {
                    for (d in descrizioni) {
                        trovato = radice.findAccessibilityNodeInfosByText(d)
                            ?.firstOrNull { it.isClickable }
                            ?: cercaPerDescrizione(radice, d)
                        if (trovato != null) { via = "descrizione:$d"; break }
                    }
                }
            }
            if (trovato == null) Thread.sleep(60)
        }
        val ms = SystemClock.uptimeMillis() - inizio
        if (trovato == null) {
            Log.i("TalosOcchio", "premiPulsante: NON trovato dopo $ms ms (viewId=$viewId)")
            call.resolve(JSObject().put("fatto", false).put("motivo", "non-trovato").put("millisecondi", ms))
            return
        }
        // ⛔ Il nodo trovato puo' non essere lui il cliccabile: su molte app il
        // testo sta dentro un contenitore che riceve il tocco. Si sale finche'
        // qualcuno accetta il click, invece di fallire su un dettaglio di
        // struttura che cambia da un'app all'altra.
        var bersaglio: AccessibilityNodeInfo? = trovato
        var salite = 0
        while (bersaglio != null && !bersaglio.isClickable && salite < 4) {
            bersaglio = bersaglio.parent
            salite++
        }
        TalosOcchio.segnaNostraAzione()
        val fatto = bersaglio?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
        Log.i("TalosOcchio", "premiPulsante: $fatto via=$via in $ms ms (salite=$salite)")
        call.resolve(
            JSObject().put("fatto", fatto).put("via", via).put("millisecondi", ms),
        )
    }

    /** Cerca per `contentDescription`, che `findAccessibilityNodeInfosByText` non guarda. */
    private fun cercaPerDescrizione(radice: AccessibilityNodeInfo, testo: String): AccessibilityNodeInfo? {
        val pila = ArrayDeque<AccessibilityNodeInfo>()
        pila.addLast(radice)
        while (pila.isNotEmpty()) {
            val n = pila.removeLast()
            val d = n.contentDescription?.toString()
            if (d != null && d.equals(testo, ignoreCase = true) && n.isClickable) return n
            for (i in 0 until n.childCount) n.getChild(i)?.let { pila.addLast(it) }
        }
        return null
    }

    @PluginMethod
    fun disponibile(call: PluginCall) {
        val vivo = TalosOcchio.aperto() != null
        Log.i("TalosOcchio", "disponibile: aperto=$vivo pid=${android.os.Process.myPid()}")
        call.resolve(JSObject().put("aperto", vivo))
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
                // nel frattempo una mano VERA ha toccato lo schermo. Misurato nei
                // due versi il 2026-08-10 — un dito produce 1.369 righe dal
                // pannello, due nostri tocchi iniettati ne producono zero.
                // ⛔ Il freno viaggia con lo sguardo, e dice anche se e' ARMATO:
                // «nessuno ha toccato» e «non lo so» sono due cose diverse, e
                // confonderle su un agente che tocca un telefono altrui e' il
                // difetto peggiore che ci sia.
                // ⛔ Due freni, un solo verdetto: basta che UNO dei due abbia
                // sentito. E `frenoTipo` dice quale è in servizio, perché i due
                // non sentono le stesse cose — vedi `TalosOcchio`.
                .put("frenoArmato", TalosDitoVero.armato() || occhio != null)
                .put("frenoTipo", if (TalosDitoVero.armato()) "grezzo" else "eventi")
                .put(
                    "manoSulloSchermo",
                    TalosDitoVero.haToccato() || TalosOcchio.manoVistaDagliEventi(),
                )
                .put("byteDiTocchi", TalosDitoVero.cresciutoDi()),
        )
    }

    /**
     * Indietro e Home: i due gesti che NON hanno un elemento a schermo.
     *
     * ⛔ Stanno qui e non dentro `agisci` perché non prendono un indice: sono
     * azioni di sistema, non di un nodo. Infilarle in `agisci` vorrebbe dire
     * accettare un indice finto — e un indice finto è la scusa con cui un
     * giorno passa un indice sbagliato.
     */
    @PluginMethod
    fun sistema(call: PluginCall) {
        val occhio = TalosOcchio.aperto()
        if (occhio == null) {
            call.reject("TALOS_OCCHIO_CHIUSO", "TALOS_OCCHIO_CHIUSO")
            return
        }
        val quale = when (call.getString("azione")) {
            "indietro" -> AccessibilityService.GLOBAL_ACTION_BACK
            "home" -> AccessibilityService.GLOBAL_ACTION_HOME
            else -> {
                call.resolve(JSObject().put("fatto", false).put("motivo", "azioneSconosciuta"))
                return
            }
        }
        // ⛔ Lo sguardo si invalida come dopo ogni azione: Indietro cambia
        // schermata, e gli indici di prima non descrivono piu' niente.
        occhio.dimenticaSguardo()
        // ⛔ E si marca l'azione NOSTRA, se no Indietro e Home fanno scattare il
        // freno degli eventi: sono azioni a tutti gli effetti, e producono gli
        // stessi eventi di una mano.
        TalosOcchio.segnaNostraAzione()
        call.resolve(JSObject().put("fatto", occhio.performGlobalAction(quale)))
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
