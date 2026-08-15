package ai.talos.agent

import android.accessibilityservice.AccessibilityService
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
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
     * ⛔ 900 ms prima di tornare: quanto basta perché la persona veda la spunta
     * comparire nell'app. È l'unica prova che ha che il messaggio è partito, e
     * coprirla nello stesso istante gliela toglie.
     */
    private val RESPIRO_PRIMA_DEL_RIENTRO = 900L

    /**
     * ⛔ 250 ms prima di giudicare: il testo impiega qualche decina di
     * millisecondi a passare dalla bozza alla conversazione, e chiedere troppo
     * presto misura il mondo di prima dell'invio.
     */
    private val RESPIRO_PRIMA_DI_GIUDICARE = 250L


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
     * MISURATO sul Pad il 2026-08-13 su WhatsApp 2.26.30.97:
     * `com.whatsapp:id/send` esiste, e' `clickable="true" enabled="true"` e ha
     * `content-desc="Invia"` — cioe' il registro non stava indovinando.
     *
     * ## ⛔⛔ LE TRE GUARDIE, e perche' NESSUNA e' pignoleria
     *
     * 1. **L'app giusta** (`pacchetto`). Il ripiego per descrizione cerca
     *    «Invia»/«Send»: se l'intent non ha aperto niente, quelle parole
     *    esistono anche DENTRO TALOS, e si premerebbe un nostro pulsante
     *    credendo di aver spedito. Il `viewId` e' namespaced e da solo sarebbe
     *    salvo; il ripiego no.
     * 2. **Il testo giusto** (`testoAtteso`). WhatsApp CONSERVA la bozza: se la
     *    chat era gia' aperta con dentro un altro testo, il pulsante «invia»
     *    c'e' gia' — e si spedirebbe la bozza vecchia un istante prima che
     *    arrivi la nuova. Si pretende che un campo **modificabile** contenga
     *    esattamente il testo che stiamo per mandare, altrimenti non si tocca.
     * 3. **La prova dopo** (`sparito`). `performAction` che risponde `true`
     *    vuol dire «il click e' stato consegnato», non «il messaggio e'
     *    partito». MISURATO nei due versi: a campo pieno `id/send` c'e', a
     *    campo vuoto il conteggio e' **0**. ⇒ La sua scomparsa e' la prova che
     *    la bozza ha lasciato il campo, ed e' quella che si riporta.
     *
     * ## E la parte VELOCE: si aspetta l'EVENTO, non l'orologio
     *
     * Un `sleep(2000)` e' sempre o troppo o troppo poco. Qui si guarda il nodo
     * finche' compare, con passi brevi, e si esce **appena** c'e' — che su una
     * finestra gia' pronta vuol dire al primo giro, cioe' in millisecondi.
     *
     * ⛔ E gira su un THREAD SUO. Capacitor esegue tutti i plugin su un thread
     * solo (misurato: 10.400 ms di girello per questo motivo): aspettare qui
     * un'app che si apre bloccherebbe ogni altra chiamata al ponte, voce
     * compresa.
     */
    @PluginMethod
    fun premiPulsante(call: PluginCall) {
        Thread({ premiPulsanteOra(call) }, "talos-ultimo-centimetro").start()
    }

    private fun premiPulsanteOra(call: PluginCall) {
        val occhio = TalosOcchio.aperto()
        if (occhio == null) {
            /*
             * ⛔⛔ QUESTO RAMO USCIVA IN SILENZIO, e il silenzio e' costato una
             * diagnosi — 2026-08-13.
             *
             * Chiesta una chiamata WhatsApp: la chat si apriva, il pulsante non
             * veniva premuto, e in `logcat` NON C'ERA NIENTE. Ho cercato la
             * causa nel giro dei tool, nel registro e nel modello prima di
             * capire che il metodo era uscito alla prima riga.
             *
             * La causa vera: `am force-stop` uccide anche il servizio di
             * accessibilita' e Android non lo riaggancia — cioe' la ricetta di
             * misura che avevo appena adottato per un ALTRO difetto rompeva
             * questo. Ma non e' quello il punto: il punto e' che un ramo che
             * esce senza dire niente rende «non e' successo» e «non ho potuto»
             * indistinguibili in un log.
             *
             * ⇒ Ogni uscita di questo metodo lascia una riga. Le altre due
             * gia' la lasciavano; questa era l'unica muta, ed e' quella che
             * capita piu' spesso.
             */
            Log.i("TalosOcchio", "premiPulsante: occhio-chiuso, non premo niente")
            call.resolve(JSObject().put("fatto", false).put("motivo", "occhio-chiuso"))
            return
        }
        val viewId = call.getString("viewId").orEmpty()
        val descrizioni = call.getArray("descrizioni")?.toList<String>() ?: emptyList()
        val pacchetto = call.getString("pacchetto").orEmpty()
        val testoAtteso = call.getString("testoAtteso").orEmpty()
        // ⛔ Il tetto arriva da chi chiama: un'app fredda ci mette secondi, una
        // gia' aperta millisecondi, e un numero scritto qui sarebbe sbagliato
        // per una delle due. Gli estremi sono solo una rete di sicurezza.
        val attesa = (call.getInt("attesaMs") ?: 2_000).coerceIn(200, 20_000)

        val inizio = SystemClock.uptimeMillis()
        var trovato: AccessibilityNodeInfo? = null
        var via = ""
        var pacchettoVisto = ""
        var appGiusta = false
        var testoPronto = false
        while (SystemClock.uptimeMillis() - inizio < attesa && trovato == null) {
            val radice = occhio.rootInActiveWindow
            if (radice != null) {
                pacchettoVisto = radice.packageName?.toString().orEmpty()
                appGiusta = pacchetto.isEmpty() || pacchettoVisto == pacchetto
                testoPronto = testoAtteso.isEmpty() || bozzaContiene(radice, testoAtteso)
                if (appGiusta && testoPronto) {
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
            }
            if (trovato == null) Thread.sleep(60)
        }
        val ms = SystemClock.uptimeMillis() - inizio
        if (trovato == null) {
            /*
             * ⛔ TRE motivi e non uno: «non lo so» non e' «no», ed e' la
             * famiglia di difetti piu' frequente di questo progetto. Chi legge
             * deve poter distinguere «l'app non si e' aperta» da «il testo non
             * e' arrivato» da «il pulsante non c'e'»: sono tre mosse diverse.
             */
            val motivo = when {
                !appGiusta -> "app-non-in-primo-piano"
                !testoPronto -> "testo-non-arrivato"
                else -> "non-trovato"
            }
            // ⛔ Si logga la LUNGHEZZA del testo, mai il testo: e' il messaggio
            // di una persona, e logcat lo legge chiunque abbia il cavo.
            Log.i(
                "TalosOcchio",
                "premiPulsante: $motivo dopo $ms ms (viewId=$viewId pacchetto=$pacchetto " +
                    "visto=$pacchettoVisto attesi=${testoAtteso.length} car.)",
            )
            call.resolve(
                JSObject()
                    .put("fatto", false)
                    .put("motivo", motivo)
                    .put("pacchettoVisto", pacchettoVisto)
                    .put("millisecondi", ms),
            )
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
        val t1 = SystemClock.uptimeMillis()
        val sparito = if (fatto) attendiCheSparisca(occhio, viewId, testoAtteso, descrizioni) else false
        val verificaMs = SystemClock.uptimeMillis() - t1
        /*
         * ⭐⭐⭐ LA FINALIZZAZIONE DELL'OBIETTIVO — owner 2026-08-15: «"invio un
         * messaggio a un contatto" non significa che l'abbia inviato veramente».
         *
         * Il pulsante sparito era UNA prova. Adesso sono tre, e si contano:
         * campo svuotato, testo migrato in un nodo non modificabile, pulsante
         * sparito. Il perché per esteso in `TalosObiettivoFinito`.
         *
         * ⛔ Si guarda DOPO che il pulsante è sparito, non prima: la migrazione
         * del testo dalla bozza alla conversazione impiega qualche decina di
         * millisecondi, e chiedere troppo presto misura il mondo di prima.
         */
        Thread.sleep(RESPIRO_PRIMA_DI_GIUDICARE)
        val obiettivo = TalosObiettivoFinito.verifica(occhio.rootInActiveWindow, testoAtteso, sparito)

        Log.i(
            "TalosOcchio",
            "premiPulsante: click=$fatto via=$via in $ms ms (salite=$salite) " +
                "sparito=$sparito in $verificaMs ms | obiettivo=${obiettivo.verdetto} " +
                "(campo-vuoto=${obiettivo.campoSvuotato} migrato=${obiettivo.testoMigrato} " +
                "prove=${obiettivo.prove}/3)",
        )

        /*
         * ⭐⭐⭐ E ADESSO TALOS TORNA — owner 2026-08-15: «la barra assistente
         * non ricompare».
         *
         * ## Perché QUI e non altrove
         *
         * Questo è l'unico punto del codice in cui si sa che l'azione è
         * **finita e riuscita**: il pulsante è stato premuto e il testo è
         * sparito dal campo. Tornare prima coprirebbe l'app mentre sta ancora
         * lavorando; tornare senza `sparito` significherebbe tornare su un
         * fallimento fingendo un successo.
         *
         * ## ⛔ Perché funziona, adesso che prima non funzionava
         *
         * Su Android 15+ un'app che ha ceduto lo schermo non può rilanciarsi:
         * serve `SYSTEM_ALERT_WINDOW` più una finestra visibile. Era la ragione
         * del pallino, che l'owner ha fatto obliterare.
         *
         * MISURATO sul OnePlus 13, con WhatsApp davanti:
         *
         *     Warning: Activity not started, its current task has been brought
         *     to the front
         *
         * ⇒ **Non è un lancio, è un task riportato avanti.** Il nostro task
         * esiste già — la barra è viva dietro WhatsApp — e portarlo davanti non
         * è il background activity launch che Android vieta. È la differenza
         * fra nascere e tornare.
         *
         * ⛔ E ci arriva l'OCCHIO, non la WebView: un `AccessibilityService`
         * legato è un servizio di sistema, e ha il diritto di farlo anche
         * quando l'app in primo piano è un'altra.
         *
         * ⛔ Un respiro prima: la conferma dell'app (la spunta, il fumetto che
         * appare) è la prova che la persona vuole vedere. Coprirla nello stesso
         * millisecondo la deruberebbe di quella prova.
         */
        if (fatto && obiettivo.verdetto == TalosObiettivoFinito.Verdetto.PARTITO) {
            Thread({
                runCatching {
                    Thread.sleep(RESPIRO_PRIMA_DEL_RIENTRO)
                    val contesto = TalosOcchio.aperto()?.applicationContext
                    if (contesto == null) {
                        Log.w("TalosOcchio", "rientro: l'occhio non c'è più, la barra non torna")
                    } else {
                        val tornata = TalosAssistente.rientra(contesto)
                        Log.i("TalosOcchio", "rientro: barra richiamata=$tornata")
                    }
                }.onFailure { Log.w("TalosOcchio", "rientro non riuscito: ${it.javaClass.simpleName}") }
            }, "talos-rientro").start()
        }

        call.resolve(
            JSObject()
                .put("fatto", fatto)
                .put("via", via)
                .put("sparito", sparito)
                // ⛔ TRE stati, non due: «non confermato» è una risposta vera
                // che la persona può usare, mentre costringere fra «inviato» e
                // «fallito» obbliga a mentire una volta su due.
                .put("obiettivo", obiettivo.verdetto.name)
                .put("campoSvuotato", obiettivo.campoSvuotato)
                .put("testoMigrato", obiettivo.testoMigrato)
                .put("prove", obiettivo.prove)
                .put("pacchettoVisto", pacchettoVisto)
                .put("millisecondi", ms)
                .put("verificaMs", verificaMs),
        )
    }

    /**
     * La bozza contiene ESATTAMENTE quel testo, in un campo modificabile?
     *
     * ⛔ `equals` e non `contains`: con «contiene», un messaggio «ciao» darebbe
     * per buona una bozza vecchia «ciao come stai», e partirebbe quella.
     *
     * ⛔ E **modificabile**: senza questo filtro basterebbe che lo stesso testo
     * comparisse in un fumetto gia' inviato piu' su nella conversazione — cioe'
     * la seconda volta che mandi «ciao» la guardia non guarderebbe piu' niente.
     */
    private fun bozzaContiene(radice: AccessibilityNodeInfo, testo: String): Boolean {
        val atteso = testo.trim()
        val candidati = radice.findAccessibilityNodeInfosByText(atteso) ?: return false
        return candidati.any { n ->
            val modificabile = n.isEditable ||
                n.className?.toString()?.contains("EditText") == true
            modificabile && n.text?.toString()?.trim() == atteso
        }
    }

    /**
     * Dopo il click: il controllo d'invio sparisce quando la bozza e' partita.
     *
     * ⛔ Non e' una cortesia, e' LA prova. MISURATO sul Pad: con testo nel campo
     * `com.whatsapp:id/send` c'e', a campo vuoto il conteggio e' **0**.
     * Se non sparisce, il messaggio e' ancora li' — e dirlo e' l'unica risposta
     * onesta, perche' la persona crederebbe di averlo mandato.
     */
    private fun attendiCheSparisca(
        occhio: TalosOcchio,
        viewId: String,
        testoAtteso: String,
        descrizioni: List<String>,
    ): Boolean {
        val fine = SystemClock.uptimeMillis() + 2_500
        while (SystemClock.uptimeMillis() < fine) {
            Thread.sleep(80)
            val radice = occhio.rootInActiveWindow ?: continue
            val ancoraLi = when {
                viewId.isNotEmpty() ->
                    radice.findAccessibilityNodeInfosByViewId(viewId)?.isNotEmpty() == true
                testoAtteso.isNotEmpty() -> bozzaContiene(radice, testoAtteso)
                /*
                 * ⛔ AGGIUNTO il 2026-08-13, e la misura che l'ha imposto:
                 * i due pulsanti di chiamata di WhatsApp hanno
                 * `resource-id=""` — nessun `viewId` — e una chiamata non ha un
                 * testo. Con solo i primi due rami questo metodo tornava
                 * `false` dopo 93 ms senza aver guardato niente, e la risposta
                 * «non confermato» era vera per il motivo sbagliato.
                 *
                 * Con le descrizioni la prova torna a esistere: il pulsante che
                 * abbiamo premuto sparisce quando ha fatto effetto.
                 */
                descrizioni.isNotEmpty() -> descrizioni.any { d ->
                    radice.findAccessibilityNodeInfosByText(d)?.isNotEmpty() == true ||
                        cercaPerDescrizione(radice, d) != null
                }
                // Senza niente da guardare, fingere un `true` sarebbe la bugia
                // che questo metodo esiste per impedire.
                else -> return false
            }
            if (!ancoraLi) return true
        }
        return false
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

    /**
     * ⭐⭐⭐ LA CONFERMA DELL'APP — una regola sola, per TUTTE le app.
     *
     * ## Perche' non una tabella
     *
     * Owner, 2026-08-13: «dobbiamo fare in modo che sia piu' dinamico e
     * automatizzato possibile, non possiamo andare per ciascuna app esistente
     * possibile e immaginabile e prevedere in ogni caso per ogni funzionalita',
     * sarebbe da pazzi».
     *
     * Aveva ragione, e avevo appena scritto la tabella: `['Chiama', 'Call']`
     * per WhatsApp. Una riga per app, per funzione, per lingua.
     *
     * ## La misura che l'ha resa inutile
     *
     * MISURATO sul Pad la finestra «Avviare una chiamata vocale?»:
     *
     * ```
     * "Avviare una chiamata vocale?"  → android:id/message
     * "Annulla"                       → android:id/button2
     * "Chiama"                        → android:id/button1
     * ```
     *
     * Sono gli id del FRAMEWORK: `AlertDialog` li usa da sempre, valgono per
     * ogni app che usa un dialogo di sistema, e **non sono tradotti**. ⇒ Una
     * regola, non un elenco.
     *
     * ## ⛔ E perche' non e' un tocco alla cieca
     *
     * Premere `button1` senza guardare sarebbe pericoloso: in un'altra finestra
     * quel pulsante puo' dire «Elimina» o «Paga». Qui si PRETENDE che ci sia
     * anche `android:id/message` — cioe' che sia davvero un dialogo — e si
     * **legge la domanda** e la si riporta. Si conferma sapendo cosa.
     *
     * ⛔ E se l'app usa un dialogo suo, senza gli id del framework, qui non si
     * trova niente e **non si preme niente**: la degradazione giusta e' dirlo,
     * non indovinare quale pulsante somigli a un «sì».
     */
    @PluginMethod
    fun confermaDialogo(call: PluginCall) {
        Thread({ confermaDialogoOra(call) }, "talos-conferma").start()
    }

    private fun confermaDialogoOra(call: PluginCall) {
        val occhio = TalosOcchio.aperto()
        if (occhio == null) {
            Log.i("TalosOcchio", "confermaDialogo: occhio-chiuso")
            call.resolve(JSObject().put("fatto", false).put("motivo", "occhio-chiuso"))
            return
        }
        val pacchetto = call.getString("pacchetto").orEmpty()
        /*
         * ⛔⛔ SENZA SAPERE DI CHI E' IL DIALOGO NON SI CONFERMA NIENTE.
         *
         * `android:id/button1` e' il pulsante positivo di QUALUNQUE
         * `AlertDialog` del sistema — compreso quello dei permessi, dove dice
         * «Consenti». MISURATO oggi: chiedendo un percorso a piedi, in primo
         * piano e' comparso
         * `com.google.android.permissioncontroller/…GrantPermissionsActivity`.
         *
         * La difesa e' il confronto col pacchetto atteso, ed e' efficace solo
         * se un pacchetto atteso C'E'. Un `pacchetto` vuoto renderebbe la
         * regola «conferma il primo dialogo che vedi», che e' esattamente il
         * tocco alla cieca che questo metodo esiste per non fare.
         *
         * ⇒ Non e' un elenco di pacchetti da rifiutare — quello invecchierebbe
         * come una tabella. E' un invariante: si conferma solo dentro l'app in
         * cui si stava agendo.
         */
        if (pacchetto.isEmpty()) {
            Log.i("TalosOcchio", "confermaDialogo: rifiutato, non so di chi sia il dialogo")
            call.resolve(JSObject().put("fatto", false).put("motivo", "pacchetto-non-detto"))
            return
        }
        val attesa = (call.getInt("attesaMs") ?: 4_000).coerceIn(200, 20_000)
        val inizio = SystemClock.uptimeMillis()
        var positivo: AccessibilityNodeInfo? = null
        var domanda = ""
        var pacchettoVisto = ""
        while (SystemClock.uptimeMillis() - inizio < attesa && positivo == null) {
            val radice = occhio.rootInActiveWindow
            if (radice != null) {
                pacchettoVisto = radice.packageName?.toString().orEmpty()
                // ⛔ Uguaglianza secca: e' l'unica cosa che tiene fuori il
                // dialogo dei permessi, che vive in un altro pacchetto.
                if (pacchettoVisto == pacchetto) {
                    val testo = radice.findAccessibilityNodeInfosByViewId("android:id/message")
                        ?.firstOrNull()?.text?.toString()
                        ?: radice.findAccessibilityNodeInfosByViewId("android:id/alertTitle")
                            ?.firstOrNull()?.text?.toString()
                    // ⛔ Niente domanda, niente conferma: e' la prova che siamo
                    // davanti a un dialogo e non a una schermata qualsiasi che
                    // per caso ha un pulsante con quell'id.
                    if (!testo.isNullOrBlank()) {
                        domanda = testo
                        positivo = radice.findAccessibilityNodeInfosByViewId("android:id/button1")
                            ?.firstOrNull { it.isClickable && it.isEnabled }
                    }
                }
            }
            if (positivo == null) Thread.sleep(70)
        }
        val ms = SystemClock.uptimeMillis() - inizio
        if (positivo == null) {
            Log.i("TalosOcchio", "confermaDialogo: nessun dialogo dopo $ms ms (visto=$pacchettoVisto)")
            call.resolve(
                JSObject().put("fatto", false).put("motivo", "nessun-dialogo")
                    .put("pacchettoVisto", pacchettoVisto).put("millisecondi", ms),
            )
            return
        }
        TalosOcchio.segnaNostraAzione()
        val fatto = positivo.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        // La prova: il dialogo si chiude quando la conferma ha fatto effetto.
        var sparito = false
        val t1 = SystemClock.uptimeMillis()
        while (fatto && SystemClock.uptimeMillis() - t1 < 2_500) {
            Thread.sleep(80)
            val r = occhio.rootInActiveWindow ?: continue
            if (r.findAccessibilityNodeInfosByViewId("android:id/button1")?.isNotEmpty() != true) {
                sparito = true
                break
            }
        }
        Log.i("TalosOcchio", "confermaDialogo: click=$fatto sparito=$sparito in $ms ms")
        call.resolve(
            JSObject().put("fatto", fatto).put("sparito", sparito)
                .put("domanda", domanda).put("millisecondi", ms),
        )
    }

    /**
     * ⭐ CHI È DAVVERO IN PRIMO PIANO — la domanda che smaschera i falsi successi.
     *
     * MISURATO sul Pad il 2026-08-13: Spotify **dichiara** `ACTION_SEARCH`, il
     * sistema **accetta** l'intent, e poi l'app muore con
     * `Fatal signal 11 (SIGSEGV)` e `Force finishing activity`. Chi si fermasse
     * a «l'intent è stato accettato» direbbe alla persona «fatto» davanti a un
     * launcher vuoto.
     *
     * ⛔ Torna stringa vuota quando l'occhio è chiuso, e chi legge deve trattarla
     * come «non lo so» — non come «non c'è nessuno». Sono due cose diverse, ed è
     * la famiglia di difetti più frequente di questo progetto.
     */
    @PluginMethod
    fun chiEDavanti(call: PluginCall) {
        val occhio = TalosOcchio.aperto()
        call.resolve(
            JSObject()
                .put("pacchetto", occhio?.rootInActiveWindow?.packageName?.toString().orEmpty())
                .put("sipuoSapere", occhio != null),
        )
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
