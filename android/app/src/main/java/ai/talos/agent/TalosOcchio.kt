package ai.talos.agent

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * ⭐⭐ L'OCCHIO: quello che TALOS vede, e la mano con cui tocca.
 *
 * Nasce dalla sonda del 2026-08-10, che ha chiuso tre dubbi in un colpo e
 * adesso diventa la funzione. I numeri che l'hanno decisa, misurati sul Pad:
 *
 * | come si guarda            | costo      |
 * |---------------------------|------------|
 * | `uiautomator dump`        | 2.216 ms   |
 * | questo, in-process        | **2-26 ms** |
 *
 * ⇒ ~100 volte. Con `dump` la percezione era il 71% del giro; adesso è nulla, e
 * il collo di bottiglia è il modello.
 *
 * ## ⛔ Si agisce sul NODO, non sul pixel
 *
 * I benchmark convertono l'indice in coordinate e iniettano un tocco: resta
 * un'ultima traduzione che sbaglia sugli elementi parzialmente coperti. Qui
 * `ACTION_CLICK` va **sul nodo**. Nessuna coordinata, in nessun punto.
 *
 * E per scrivere: `input text 'perché'` muore con
 * `NullPointerException: Attempt to get length of null array` — misurato.
 * `ACTION_SET_TEXT` scrive l'italiano vero in 2-6 ms, verificato leggendo il
 * campo dopo (`text="perché è così, però"`).
 *
 * ## ⛔ Gli indici sono di QUESTO sguardo, non eterni
 *
 * Ogni `interattivi()` rinumera e conserva i nodi visti. Un indice di uno
 * sguardo vecchio non si esegue: lo schermo intanto è cambiato, e toccare il
 * numero 4 di ieri è il modo esatto di comprare qualcosa per sbaglio.
 */
class TalosOcchio : AccessibilityService() {

    /** Cosa il pilota può toccare, con l'indice che gli abbiamo dato. */
    data class Elemento(
        val indice: Int,
        val tipo: String,
        val etichetta: String,
        val attivo: Boolean?,
        val nodo: AccessibilityNodeInfo,
        /**
         * ⭐⭐ Che posto occupa fra i fratelli, e se sta in una lista.
         *
         * Servono a risolvere gli ordinali — «il primo contatto» — **nel
         * codice**, non nella testa del modello. Attraversano il ponte e si
         * fermano al risolutore: in `talosOsservazione()` non entrano, quindi
         * costano **zero token**. Il conto sta in `pesoDelloSguardo.test.ts`.
         */
        val posizione: Int,
        val inLista: Boolean,
        /**
         * ⛔ Solo per i cursori, e senza questo `imposta` resta inutilizzabile.
         *
         * «Alza il volume» non si esegue se non si sa dov'è adesso, e nemmeno
         * «mettilo a metà» se non si sa qual è il massimo. Un cursore senza la
         * sua scala è un elemento che il modello può solo guardare.
         */
        val scala: Triple<Float, Float, Float>? = null,
        /**
         * ⛔ Serve a NUMERARE come si vede, e non attraversa il ponte.
         *
         * Il riquadro non va al modello — costerebbe quattro numeri per
         * elemento senza dirgli niente che non veda già dall'ordine. Serve
         * qui, per ordinare prima di assegnare gli indici.
         */
        val riquadro: android.graphics.Rect = android.graphics.Rect(),
    )

    override fun onServiceConnected() {
        vivo = this
        /*
         * ⛔ Si registra QUI e non nel costruttore: prima dell'aggancio il
         * controller non esiste, e chiedere il pulsante a un servizio non
         * ancora connesso lancia. Vale la stessa regola di `vivo`.
         */
        Log.i(TAG, "occhio aperto")
    }

    override fun onDestroy() {
        if (vivo === this) vivo = null
        Log.i(TAG, "occhio chiuso: onDestroy")
        super.onDestroy()
    }

    /**
     * ⛔⛔ QUI L'OCCHIO SI ACCECAVA DA SOLO — 2026-08-13.
     *
     * Questa riga c'era, e azzerava `vivo`:
     *
     * ```kotlin
     * override fun onInterrupt() { if (vivo === this) vivo = null }
     * ```
     *
     * `onInterrupt()` NON e' la fine del servizio. Android lo chiama per dire
     * «smetti ORA il riscontro che stai dando» — e' il fratello di «zitto», non
     * di «sei morto». Il servizio resta agganciato, resta capace di leggere lo
     * schermo e di toccare i nodi: cambia soltanto che deve interrompere quello
     * che sta comunicando.
     *
     * ⛔ E il danno era PERMANENTE, perche' `onServiceConnected()` non viene
     * richiamato: dopo il primo `onInterrupt` della vita del servizio, TALOS si
     * dichiarava cieco per sempre, fino a spegnere e riaccendere il permesso a
     * mano.
     *
     * ## Come si e' visto, e perche' non si era visto prima
     *
     * MISURATO stamattina sul Pad dell'owner, dal suo stesso tentativo delle
     * 08:32: `dumpsys accessibility` diceva
     * `Bound services:{...label=TALOS — controllo del telefono, capabilities=1}`
     * — agganciato — e nello stesso momento TALOS rispondeva in chat «serve il
     * permesso di lettura dello schermo, che al momento e' **disattivato**», e
     * ripiegava su `device_open_app`.
     *
     * ⇒ Due domande diverse che sembravano una: *il sistema mi ha agganciato?*
     * (si') e *io mi ricordo di essere agganciato?* (no). Il pilota non si
     * fermava a meta' strada: non partiva affatto, e il tempo che ho speso a
     * cercare il punto in cui si fermava cercava una cosa che non e' successa.
     *
     * Adesso `vivo` lo azzera solo `onDestroy()`, che e' la fine vera. Qui
     * resta la traccia, perche' sapere QUANTO SPESSO il sistema ci interrompe
     * e' un dato che non abbiamo mai avuto.
     */
    override fun onInterrupt() {
        Log.i(TAG, "interruzione richiesta dal sistema: l'occhio RESTA aperto")
    }

    /**
     * ⭐⭐ IL FRENO CHE NON CHIEDE LA SHELL: la mano si sente dagli EVENTI.
     *
     * Il freno grezzo (`TalosDitoVero`) legge `/dev/input`, e `/dev/input` vuole
     * l'identità della shell. Su un telefono senza il ponte acceso quel freno non
     * si arma, e il pilota **si rifiutava di partire**: la funzione esisteva solo
     * per chi aveva già fatto un giro nelle impostazioni di sviluppo. Qui c'è il
     * freno che funziona ovunque, perché si appoggia al servizio che il pilota
     * richiede comunque per esistere.
     *
     * ⇒ **Se TALOS può vedere lo schermo, TALOS può sentire la tua mano.**
     *
     * ## Le misure che l'hanno deciso (Pad, 11 agosto)
     *
     * | cosa succede                     | cosa arriva qui              |
     * |----------------------------------|------------------------------|
     * | nessuno tocca, 8 secondi         | **0 eventi** — silenzio vero |
     * | un dito su un elemento           | `TYPE_VIEW_CLICKED`          |
     * | un dito che scorre               | 6 × `TYPE_VIEW_SCROLLED`     |
     * | un dito **sul vuoto**            | **0 eventi** ⛔ vedi sotto   |
     * | un tocco di TALOS                | `TYPE_VIEW_CLICKED` a +5-27 ms |
     *
     * ⛔⛔ PRIMA misura fallita, e va detta: il filtro del servizio dichiarava
     * `typeWindowStateChanged|typeWindowContentChanged|typeTouchInteractionStart`
     * — `typeViewClicked` **non c'era**. Il 2026-08-10 ne avevo concluso «gli
     * eventi non arrivano»: non arrivavano perché non li avevamo chiesti. Il
     * servizio non era sordo, era **tappato**.
     *
     * ## ⛔ Il nostro tocco e quello della persona sono IDENTICI per tipo
     *
     * `performAction(ACTION_CLICK)` produce lo stesso `TYPE_VIEW_CLICKED` di un
     * dito: misurato. Quindi non si distingue dal **cosa**, si distingue dal
     * **quando** — e il quando lo sappiamo perché l'azione la facciamo noi.
     * Dopo ogni nostra azione si è sordi per [SORDITA_MS]; fuori da quella
     * finestra, un evento di interazione è una mano.
     *
     * I 400 ms sono ~15 volte il ritardo peggiore misurato (27 ms su quattro
     * tocchi: 9, 27, 5, 13) e restano un'inezia rispetto ai **secondi** che
     * passano fra un passo e l'altro, che è il tempo in cui una mano arriva
     * davvero. Il rischio residuo è simmetrico e va nominato: un tocco della
     * persona nei 400 ms dopo il nostro non ferma la corsa. Ne bastano due, e
     * chi vuole riprendersi il telefono non tocca una volta sola.
     *
     * ## ⛔ IL LIMITE, misurato e non nascosto
     *
     * Un dito appoggiato dove non c'è niente di interattivo non produce nessun
     * evento — provato anche tenendolo premuto un secondo. Questo freno sente
     * ogni tocco che **fa qualcosa**; il freno grezzo sente ogni tocco e basta.
     * Per questo i due convivono e `frenoTipo` dice quale è in servizio: un
     * freno che promette più di quel che sente è peggio di nessun freno.
     */
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val tipo = event?.eventType ?: return
        if (tipo and INTERAZIONI == 0) return
        val ritardo = SystemClock.uptimeMillis() - nostraAzioneAl
        if (ritardo <= SORDITA_MS) return
        /*
         * ⛔⛔ QUANTO E' TARDI L'EVENTO CHE CI FERMA — 2026-08-13.
         *
         * MISURATO sul Pad: il pilota ha detto «Ok, apro WhatsApp», poi
         * «Digito "Io Tu"», e si e' fermato con `mano-sullo-schermo` a
         * `passi=2` — mentre NESSUNO stava toccando il tablet. Non erano
         * tocchi fantasma: erano le CONSEGUENZE della nostra stessa azione.
         * `ACTION_SET_TEXT` fa reagire WhatsApp (la ricerca si apre, la lista
         * si filtra) e quegli eventi arrivano DOPO i 400 ms di sordita'.
         *
         * ⛔ Il numero giusto non si indovina: alzare `SORDITA_MS` a caso
         * renderebbe il freno sordo anche alla mano vera, che e' il difetto
         * opposto e molto peggiore. Questa riga fa dire alla macchina di
         * quanto sfora, cosi' la soglia si sceglie sulla misura — ed e' la
         * stessa disciplina che oggi ha chiuso quattro difetti su quattro.
         */
        Log.i(TAG, "freno: evento a +$ritardo ms dalla nostra azione (sordita=$SORDITA_MS)")
        manoVista = true
    }

    /**
     * Lo sguardo: gli elementi con cui si può interagire, numerati.
     *
     * ⛔ Si scartano gli invisibili e quelli senza riquadro — `validate_ui_element`
     * di AndroidWorld fa lo stesso, e per lo stesso motivo: sono nell'albero ma
     * non a schermo, e toccarli non fa niente o fa qualcosa altrove.
     */
    fun interattivi(): List<Elemento> {
        val t0 = SystemClock.uptimeMillis()
        val radice = rootInActiveWindow ?: return emptyList()
        val fuori = mutableListOf<Elemento>()
        // Si porta dietro la posizione fra i fratelli e se si è già dentro un
        // contenitore che scorre: risalire i genitori dopo costerebbe un giro
        // per nodo, e questi due dati si sanno già mentre si scende.
        data class Passo(val nodo: AccessibilityNodeInfo, val posizione: Int, val inLista: Boolean)
        val pila = ArrayDeque<Passo>()
        pila.addLast(Passo(radice, -1, false))
        while (pila.isNotEmpty()) {
            val (n, posizione, inLista) = pila.removeLast()
            val listaQui = inLista || n.isScrollable || sembraUnaLista(n)
            for (i in 0 until n.childCount) n.getChild(i)?.let { pila.addLast(Passo(it, i, listaQui)) }
            if (!n.isVisibleToUser) continue
            val riquadro = android.graphics.Rect().also { n.getBoundsInScreen(it) }
            if (riquadro.width() <= 0 || riquadro.height() <= 0) continue
            val tipo = when {
                n.isEditable -> "campo"
                n.isCheckable -> "interruttore"
                /*
                 * ⛔⛔ SENZA QUESTA RIGA `imposta` ERA CODICE MORTO — 2026-08-16.
                 *
                 * MISURATO sulla schermata dei suoni del Pad: un `AbsSeekBar`
                 * dichiara `clickable=false`, `checkable=false`,
                 * `scrollable=false`, `focusable=false` e non è un `EditText`.
                 * ⇒ Cadeva nell'`else` e spariva. Il modello non ha mai visto
                 * un cursore in vita sua, quindi non poteva chiedere `imposta`
                 * nemmeno volendo.
                 *
                 * ⛔ Il riconoscimento è `rangeInfo != null`, non «la classe si
                 * chiama SeekBar»: un elenco di nomi di classe invecchia a ogni
                 * aggiornamento di sistema, e i cursori personalizzati non ci
                 * sarebbero mai stati dentro. `rangeInfo` è ciò che il widget
                 * DICHIARA di essere, ed è la stessa cosa che poi legge
                 * `ACTION_SET_PROGRESS`.
                 *
                 * E lo trova il DISPOSITIVO, non il test: nell'albero
                 * l'attributo non compare nemmeno, e per unit test il cursore
                 * sarebbe rimasto invisibile fino al primo «alza il volume».
                 */
                n.rangeInfo != null -> "cursore"
                n.isScrollable -> "scorri"
                n.isClickable || n.isLongClickable -> "tocca"
                else -> continue
            }
            val propria = (n.text ?: n.contentDescription ?: "").toString().trim()
            /*
             * ⛔ Il recupero NON si fa sui contenitori che scorrono: uno
             * scorrimento non ha bisogno di un nome per essere fatto, e
             * battezzarli sarebbe testo pagato per niente. Misurati: 4 dei 54
             * muti sulle tre schermate di prova.
             */
            val etichetta = if (propria.isNotEmpty() || tipo == "scorri") {
                propria
            } else {
                nomeDalSottoalbero(n)
            }
            fuori.add(
                Elemento(
                    // ⛔ Provvisorio: l'indice VERO si assegna dopo l'ordinamento.
                    indice = fuori.size,
                    tipo = tipo,
                    etichetta = etichetta,
                    attivo = if (n.isCheckable) n.isChecked else null,
                    nodo = n,
                    posizione = posizione,
                    inLista = inLista,
                    scala = n.rangeInfo?.let { Triple(it.min, it.max, it.current) },
                    riquadro = riquadro,
                ),
            )
        }
        /*
         * ⭐⭐⭐ SI NUMERA COME SI VEDE — e il numero che lo impone è brutale.
         *
         * MISURATO il 2026-08-16 su tre schermate vere: quanti indici erano già
         * in ordine visivo?
         *
         *     Impostazioni ...  0 su 19
         *     Applicazioni ...  1 su 18
         *     Play Store .....  2 su 32
         *
         * ⇒ Praticamente ZERO. La visita dell'albero è in profondità, e
         * l'ordine di scoperta non ha niente a che fare con quello di schermo.
         * Su `Applicazioni`, «il primo» per indice era «Accessibilità di
         * Android» mentre il primo che si vede in cima era «Indietro».
         *
         * ## Perché è più grosso degli ordinali
         *
         * Il modello vede un elenco numerato e ci ragiona sopra come farebbe
         * una persona: «il terzo», «quello sotto», «il primo contatto». Con una
         * numerazione arbitraria quel ragionamento è **sempre sbagliato**, e non
         * fallisce mai in modo visibile: tocca semplicemente un'altra cosa.
         *
         * GUI-Owl dichiara gli ordinali un problema aperto. Una parte di quel
         * problema è questa, e costa **zero token**: stessa lista, altro ordine.
         *
         * ⛔ Lo spareggio finale è l'ordine di scoperta, non niente: due
         * elementi sovrapposti devono numerarsi sempre allo stesso modo, se no
         * la lista balla fra due sguardi sulla stessa schermata ferma.
         */
        val ordinati = fuori
            .sortedWith(
                compareBy({ it.riquadro.top }, { it.riquadro.left }, { it.indice }),
            )
            .mapIndexed { i, e -> e.copy(indice = i) }
        fuori.clear()
        fuori.addAll(ordinati)
        sguardo = fuori
        sguardoAl = SystemClock.uptimeMillis()
        /*
         * ⛔ LA SONDA DEL RECUPERO — perché l'88% è misurato su TRE schermate.
         *
         * Il test `pesoDelloSguardo.test.ts` conta su fixture congelate: dice
         * che il metodo funziona su quelle. Questa riga lo fa dire al telefono
         * su OGNI schermata vera che passa, e con il costo in millisecondi
         * accanto — perché uno sguardo costava 2-26 ms e il recupero è lavoro
         * in più che nessun test in laboratorio può misurare.
         *
         * Se un giorno l'88% cade su un'app che non abbiamo mai provato, si
         * vede qui invece di vedersi da TALOS che preme il pulsante sbagliato.
         */
        val muti = fuori.count { it.tipo == "tocca" && it.etichetta.isEmpty() }
        val recuperati = fuori.count {
            it.tipo == "tocca" && it.etichetta.isNotEmpty() &&
                (it.nodo.text ?: it.nodo.contentDescription ?: "").toString().isBlank()
        }
        Log.i(
            TAG,
            "sguardo: ${fuori.size} elementi, recuperati dal sottoalbero $recuperati, " +
                "ancora ciechi $muti, ${SystemClock.uptimeMillis() - t0} ms",
        )
        return fuori
    }

    /** `RecyclerView`, `ListView`, `GridView`, `ViewPager`: liste che non si dichiarano scorribili. */
    private fun sembraUnaLista(n: AccessibilityNodeInfo): Boolean {
        val classe = n.className?.toString() ?: return false
        return classe.endsWith("RecyclerView") ||
            classe.endsWith("ListView") ||
            classe.endsWith("GridView") ||
            classe.endsWith("ViewPager") ||
            classe.endsWith("ViewPager2")
    }

    /**
     * ⭐⭐⭐ IL NOME STA NEI FIGLI — e questa riga vale il 88% dei pulsanti muti.
     *
     * ## Perché chiedere al contenitore è la domanda sbagliata
     *
     * In Android il nodo cliccabile è quasi sempre un contenitore nudo:
     *
     * ```xml
     * <node clickable="true"  resource-id=""            class="LinearLayout" text="">
     *   <node clickable="false" resource-id="…:id/title" text="Wi-Fi">
     * ```
     *
     * Chiedere l'etichetta al padre è come chiedere il titolo alla copertina
     * invece che al frontespizio. ⛔ La prima misura fatta così diede **4%**, e
     * concludeva che questa strada non esisteva: era una risposta esatta a una
     * domanda sbagliata.
     *
     * ## ⛔ La misura, e il fatto che NON È UNA COSTANTE
     *
     * Due misure, lo stesso giorno, e dicono numeri diversi:
     *
     * ```
     * tre schermate congelate (OnePlus, AOSP, Play Store)   44/50 = 88%
     * il Play Store DAL VIVO, col carosello aperto          22/29 = 76%
     * ```
     *
     * ⇒ Il tasso **dipende da quanto è grafica la schermata**, e sta fra il
     * 75% e il 95%. ⛔ Chi lo cita come «il 95%» sta citando un campione, non
     * una proprietà: la prima misura di tutte diede **4%** perché chiedeva al
     * contenitore, e un numero preciso ottenuto dalla domanda sbagliata è il
     * modo più efficace di progettare la cosa costosa al posto di quella
     * gratis.
     *
     * Quelli che restano sono i casi da **screenshot ritagliato**, e il giro
     * col modello visivo si paga **solo lì**.
     *
     * ## Perché in ampiezza, e perché il tetto è largo
     *
     * MISURATO sulla schermata viva, sui 21 recuperati:
     *
     * ```
     * nodi da guardare prima di trovarlo   mediana 2, max 6
     * profondità del figlio che ha il nome mediana 1, max 3
     * oltre il tetto di 40 nodi            ZERO
     * ```
     *
     * ⇒ Il nome è davvero a un passo, e [MAX_NODI_SOTTOALBERO] non ha mai
     * morso: esiste per l'albero patologico, non per il caso normale. E lo
     * sguardo intero è costato **35 ms** su 34 elementi.
     */
    private fun nomeDalSottoalbero(n: AccessibilityNodeInfo): String {
        val coda = ArrayDeque<AccessibilityNodeInfo>()
        for (i in 0 until n.childCount) n.getChild(i)?.let { coda.addLast(it) }
        var visti = 0
        while (coda.isNotEmpty() && visti < MAX_NODI_SOTTOALBERO) {
            val f = coda.removeFirst()
            visti += 1
            val t = (f.text ?: f.contentDescription ?: "").toString().trim()
            if (t.isNotEmpty()) return t
            for (i in 0 until f.childCount) f.getChild(i)?.let { coda.addLast(it) }
        }
        return ""
    }

    /**
     * Esegue sul nodo. Torna `null` se è andata, o il motivo se no.
     *
     * ⛔ Il motivo è una stringa parlante e non un booleano: «false» costringe
     * chi sta sopra a indovinare, e su un agente che tocca un telefono altrui
     * indovinare è il difetto.
     */
    fun esegui(
        indice: Int,
        azione: String,
        testo: String?,
        direzione: String? = null,
        valore: Double? = null,
    ): String? {
        val elenco = sguardo
        if (elenco.isEmpty()) return "nessunoSguardo"
        val atteso = elenco.getOrNull(indice) ?: return "indiceFuoriElenco"
        /*
         * ⛔⛔ SCADUTO NON VUOL DIRE PERDUTO: si RIGUARDA e si confronta.
         *
         * MISURATO sul Pad il 2026-08-10, prima corsa vera del pilota: ogni
         * passo costa una chiamata al modello — SECONDI — e mezzo secondo di
         * vita dello sguardo era finito da un pezzo quando l'azione arrivava.
         * Esito: `sguardoVecchio` a ogni singolo passo, il tetto del tempo che
         * scatta dopo due passi, e un pilota che non arriva mai da nessuna
         * parte. Il tetto ha funzionato; la funzione no.
         *
         * ⛔ E la cura NON è allungare la vita dello sguardo: sarebbe toccare
         * su una schermata che non c'è più, cioè il difetto che quei 500 ms
         * esistono per impedire. Si riguarda, e si tocca solo se all'indice
         * c'è ANCORA la stessa cosa — stesso tipo e stessa etichetta. Se lo
         * schermo è cambiato si risponde `schermoCambiato`, e chi guida
         * riguarda: costa 16 ms e non compra niente per sbaglio.
         */
        val e = if (SystemClock.uptimeMillis() - sguardoAl > VITA_SGUARDO_MS) {
            val adesso = interattivi().getOrNull(indice) ?: return "schermoCambiato"
            if (adesso.tipo != atteso.tipo || adesso.etichetta != atteso.etichetta) {
                return "schermoCambiato"
            }
            adesso
        }
        else {
            atteso
        }
        // ⛔ Si marca PRIMA di toccare: fra la marcatura e l'evento passano
        // 5-27 ms, e marcare dopo lascerebbe fuori proprio l'evento nostro.
        segnaNostraAzione()
        val fatto = when (azione) {
            "tocca" -> e.nodo.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            /*
             * ⛔ Il menu contestuale non si apre in nessun altro modo, e senza
             * di lui mezzo Android è irraggiungibile: rinominare, eliminare,
             * «seleziona tutto», la scelta lunga su un messaggio. Si verifica
             * come il tocco — chi guida riguarda, e se non è cambiato niente
             * l'azione non ha funzionato.
             */
            "premiALungo" -> e.nodo.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK)
            "scrivi" -> {
                if (testo == null) return "testoMancante"
                e.nodo.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                e.nodo.performAction(
                    AccessibilityNodeInfo.ACTION_SET_TEXT,
                    Bundle().apply {
                        putCharSequence(
                            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                            testo,
                        )
                    },
                )
            }
            /*
             * ⛔⛔ QUI LA DIREZIONE VENIVA BUTTATA VIA — trovato il 2026-08-16.
             *
             * `talosIstruzioneDelPilota` chiede al modello
             * `"direzione":"su|giu|sinistra|destra"`, il ponte non la mandava e
             * questa riga non la leggeva: si scorreva **sempre in avanti**.
             * Un modello che diceva «scorri su» per tornare in cima a una lista
             * la faceva scendere, e nessuno se ne accorgeva perché l'azione
             * riusciva — solo dalla parte sbagliata.
             *
             * ⇒ Un parametro che il modello produce e nessuno legge è peggio di
             * un parametro assente: l'assente lo vedi, questo no.
             */
            "scorri" -> e.nodo.performAction(versoDelloScorrimento(direzione))
            /*
             * ⭐⭐ I CURSORI SI IMPOSTANO, NON SI TRASCINANO.
             *
             * GUI-Owl e i benchmark muovono un cursore con uno `swipe`: un
             * gesto a coordinate, impreciso e che nessuno sa verificare — hai
             * chiesto 40 e non sai a quanto sei arrivato.
             *
             * `ACTION_SET_PROGRESS` è un'azione **sul nodo**, come tutte le
             * altre qui: rispetta l'invariante del file, e soprattutto si
             * verifica rileggendo `rangeInfo` subito dopo. È l'unica azione di
             * questo elenco che porta la propria prova con sé.
             */
            "imposta" -> {
                if (valore == null) return "valoreMancante"
                val scala = e.nodo.rangeInfo ?: return "nonEUnCursore"
                val dentro = valore.toFloat().coerceIn(scala.min, scala.max)
                /*
                 * ⛔⛔ QUI IL BOOLEANO MENTIVA — misurato sul Pad il 2026-08-16.
                 *
                 * Sulla schermata dei suoni, `performAction` ha restituito
                 * **true** e il cursore è rimasto a 1200 su 1600. `fatto: true`
                 * con niente di fatto: la forma peggiore di difetto che ci sia
                 * su un agente, perché non fallisce.
                 *
                 * ⇒ Qui non si crede al booleano: si RILEGGE. È la stessa
                 * disciplina di `verify()` sui tool, ed è ciò che avevo
                 * scritto nella documentazione prima di implementarlo — il
                 * dispositivo mi ha preso in castagna, e va bene così.
                 *
                 * ⛔ `refresh()` prima di leggere: senza, `rangeInfo` è la
                 * copia catturata allo sguardo e direbbe sempre il valore
                 * vecchio, cioè «non si è mosso» anche quando si è mosso.
                 */
                val chiesto = e.nodo.performAction(
                    // ⛔ Non è una costante intera come CLICK: sta in
                    // `AccessibilityAction` e si passa il suo `.id`.
                    AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id,
                    Bundle().apply {
                        putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE, dentro)
                    },
                )
                if (!chiesto) return "rifiutata"
                val adesso = if (e.nodo.refresh()) e.nodo.rangeInfo?.current else null
                Log.i(
                    TAG,
                    "imposta: chiesto $dentro (scala ${scala.min}..${scala.max}), " +
                        "prima ${scala.current}, adesso $adesso, " +
                        "azioniDichiarate=${e.nodo.actionList.map { it.id }}",
                )
                // Non si riesce a rileggere: si dice «non lo so», non «fatto».
                if (adesso == null) return "impostaNonVerificabile"
                // ⛔ Tolleranza di un passo: molti cursori quantizzano, e
                // pretendere l'uguaglianza esatta chiamerebbe fallimento un
                // successo. Ma 1200 che resta 1200 quando ho chiesto 800 non
                // ci passa, ed è il caso misurato.
                val tolleranza = (scala.max - scala.min) / 20f
                if (kotlin.math.abs(adesso - dentro) <= tolleranza) {
                    true
                } else {
                    /*
                     * ⛔ E i tre esiti si dicono DIVERSI, perché sono diversi.
                     *
                     * Il primo tentativo diceva `impostaNonHaMosso` anche
                     * quando il cursore si era spostato da 1200 a 800 senza
                     * arrivare: una bugia opposta a quella che stavo curando.
                     * «Non ha mosso» e «si è mosso ma non fin lì» portano chi
                     * guida a due decisioni diverse.
                     */
                    val arrivo = aPassi(e.nodo, dentro, tolleranza)
                        ?: return "impostaNonHaMosso"
                    if (kotlin.math.abs(arrivo - dentro) > tolleranza) {
                        return "impostaArrivataA:${kotlin.math.round(arrivo)}"
                    }
                    true
                }
            }
            else -> return "azioneSconosciuta"
        }
        // ⛔ Lo sguardo si INVALIDA subito: dopo un'azione lo schermo cambia, e
        // un indice di prima non vale piu' niente. Chi vuole agire ancora deve
        // riguardare — che e' anche la verifica dell'effetto.
        sguardo = emptyList()
        return if (fatto) null else "rifiutata"
    }

    /** Dopo un'azione di sistema lo schermo cambia: gli indici non valgono piu'. */
    fun dimenticaSguardo() {
        sguardo = emptyList()
    }

    /**
     * ⛔ «Su» vuol dire «fammi vedere quello che sta SOPRA», non «muovi il
     * contenuto verso l'alto».
     *
     * Le due letture sono opposte e portano allo stesso gesto fatto al
     * contrario. Quella scelta qui è come parla una persona — «scorri su» per
     * tornare in cima — ed è la stessa che `talosIstruzioneDelPilota` scrive al
     * modello, con le parole, per non lasciargliela indovinare.
     *
     * ⛔ Senza direzione si va avanti: è il comportamento che c'era prima, e
     * un modello che non la manda non deve trovarsi un'azione rifiutata.
     */
    /**
     * ⭐⭐ IL RIPIEGO A PASSI, quando il cursore ACCETTA e non si muove.
     *
     * ## Il fatto che lo impone, misurato sul Pad il 2026-08-16
     *
     * Sulla schermata dei suoni, il cursore del volume:
     *
     * ```
     * azioniDichiarate = [4, 8, 64, 4096, 8192, 16908342, 16908349]
     *                                            ↑
     *                              16908349 = ACTION_SET_PROGRESS
     * ```
     *
     * Lo **dichiara**, `performAction` risponde **true**, e il valore resta
     * dov'era. Il widget accetta l'azione e la ignora.
     *
     * ⇒ Ma nella stessa lista ci sono `4096` e `8192` — avanti e indietro — e
     * su un cursore quelli lo spostano di un passo alla volta. Quindi la strada
     * c'è: non è precisa in un colpo, e si arriva lo stesso.
     *
     * ## Perché è comunque onesto
     *
     * Ogni passo si **rilegge**. Il ciclo si ferma quando è arrivato, quando ha
     * superato il bersaglio, o quando un passo **non ha mosso niente** — che
     * vuol dire che nemmeno questa strada esiste. Non c'è nessun caso in cui
     * questa funzione dica di essere arrivata senza esserci.
     *
     * ⛔ Il tetto ai passi non è prudenza: senza, un cursore che non si muove
     * mai fa girare l'agente per sempre dentro un'azione sola.
     *
     * @return `true` se è arrivato, `null` se non c'è riuscito.
     */
    private fun aPassi(
        nodo: AccessibilityNodeInfo,
        bersaglio: Float,
        tolleranza: Float,
    ): Float? {
        val partenza = nodo.rangeInfo?.current ?: return null
        var precedente = partenza
        for (passo in 1..MAX_PASSI_CURSORE) {
            val avanti = precedente < bersaglio
            val mossa = if (avanti) {
                AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            } else {
                AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            }
            if (!nodo.performAction(mossa)) return null
            /*
             * ⛔⛔ SI LEGGE DOPO CHE SI È FERMATO — misurato il 2026-08-16.
             *
             * Senza questa pausa il ciclo leggeva **900 due volte di fila** e
             * concludeva «il passo non muove niente», mentre il widget stava
             * ancora scendendo: la prova esterna, un attimo dopo, trovava 800.
             * `refresh()` prende lo stato dal processo dell'app, e chiederlo
             * subito dopo l'azione risponde col valore vecchio.
             *
             * ⇒ È lo stesso inciampo del tocco che parte prima che lo
             * scorrimento si fermi. Trenta millisecondi per passo restano
             * invisibili accanto ai secondi di un giro d'agente.
             */
            Thread.sleep(PAUSA_PRIMA_DI_RILEGGERE_MS)
            if (!nodo.refresh()) return null
            val ora = nodo.rangeInfo?.current ?: return null
            if (kotlin.math.abs(ora - bersaglio) <= tolleranza) {
                Log.i(TAG, "imposta: arrivato a $ora in $passo passi")
                return ora
            }
            // Superato il bersaglio: il passo del widget è più grosso della
            // tolleranza, e insistere lo farebbe oscillare avanti e indietro.
            if (avanti != (ora < bersaglio)) {
                Log.i(TAG, "imposta: passo troppo grosso, fermo a $ora (chiesto $bersaglio)")
                return ora
            }
            // Un passo che non muove niente: questa strada non esiste.
            if (ora == precedente) {
                Log.i(TAG, "imposta: il passo non muove piu', fermo a $ora (partito da $partenza)")
                return if (ora == partenza) null else ora
            }
            precedente = ora
        }
        Log.i(TAG, "imposta: finiti i $MAX_PASSI_CURSORE passi, fermo a $precedente")
        return if (precedente == partenza) null else precedente
    }

    private fun versoDelloScorrimento(direzione: String?): Int = when (direzione) {
        "su", "sinistra" -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        else -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
    }

    companion object {
        private const val TAG = "TalosOcchio"

        /**
         * ⛔ Mezzo secondo. Uno sguardo piu' vecchio di cosi' descrive uno
         * schermo che probabilmente non c'e' piu': meglio riguardare (costa
         * 16 ms) che toccare al buio.
         */
        private const val VITA_SGUARDO_MS = 500L

        /**
         * ⛔ Quanti nodi si guardano al massimo cercando il nome di un muto.
         *
         * Il nome utile sta a uno o due passi — la ricerca è in ampiezza
         * proprio per trovarlo lì. Questo tetto esiste perché una schermata
         * con un sottoalbero enorme e tutto muto non possa trasformare uno
         * sguardo da 2-26 ms in qualcosa che si sente.
         */
        private const val MAX_NODI_SOTTOALBERO = 40

        /**
         * ⛔ Quanti passi al massimo per portare un cursore dove è stato chiesto.
         *
         * Un cursore di sistema si muove in 15-20 tacche; quaranta è il doppio
         * abbondante e resta invisibile (un passo costa ~5 ms). Serve perché un
         * cursore che accetta i comandi senza muoversi non deve poter far
         * girare l'agente per sempre dentro una sola azione.
         */
        private const val MAX_PASSI_CURSORE = 40

        /**
         * ⛔ Quanto si aspetta prima di rileggere un cursore appena mosso.
         *
         * MISURATO: senza pausa, `refresh()` risponde col valore VECCHIO e il
         * ciclo conclude «non si muove più» mentre il widget sta ancora
         * scendendo. Trenta millisecondi sono invisibili accanto ai secondi di
         * un giro d'agente, e bastano.
         */
        private const val PAUSA_PRIMA_DI_RILEGGERE_MS = 30L

        /**
         * ⛔ Quanto si resta sordi dopo una NOSTRA azione.
         *
         * MISURATO su quattro tocchi (Pad, 11 agosto): l'evento del nostro
         * tocco arriva dopo 9, 27, 5, 13 ms. Quattrocento è quindici volte il
         * peggiore — largo abbastanza da non sentirsi da soli anche quando il
         * telefono è occupato, e stretto abbastanza da essere invisibile fra
         * due passi che costano secondi.
         */
        private const val SORDITA_MS = 400L

        /**
         * Solo gli eventi che vuol dire «qualcuno ha INTERAGITO».
         *
         * ⛔ Fuori restano `TYPE_WINDOW_CONTENT_CHANGED` e
         * `TYPE_WINDOW_STATE_CHANGED`: sono conseguenze, non tocchi, e arrivano
         * a raffica anche quando TALOS apre un'app da solo. Un freno che li
         * ascoltasse si fermerebbe da sé al primo passo.
         */
        private val INTERAZIONI = AccessibilityEvent.TYPE_VIEW_CLICKED or
            AccessibilityEvent.TYPE_VIEW_LONG_CLICKED or
            AccessibilityEvent.TYPE_VIEW_SCROLLED or
            AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED

        @Volatile private var vivo: TalosOcchio? = null
        @Volatile private var sguardo: List<Elemento> = emptyList()
        @Volatile private var sguardoAl: Long = 0
        @Volatile private var nostraAzioneAl: Long = 0
        @Volatile private var manoVista: Boolean = false

        fun aperto(): TalosOcchio? = vivo

        /**
         * ⭐⭐⭐ LO SCREENSHOT — quello di SISTEMA, non uno silenzioso.
         *
         * ## ⛔ Due API, e la scelta non è tecnica
         *
         * Android ne offre due a un servizio di accessibilità, e fanno cose
         * diverse:
         *
         * | | cosa fa |
         * |---|---|
         * | `takeScreenshot()` (API 30) | cattura **in silenzio** e consegna il bitmap a noi: nessun suono, nessun segnale, **niente salvato** |
         * | `GLOBAL_ACTION_TAKE_SCREENSHOT` (API 28) | fa lo screenshot **di sistema**: l'animazione, l'anteprima, e il file **in galleria** |
         *
         * ⇒ Si usa il secondo, per due ragioni che vanno nella stessa
         * direzione. La prima è d'uso: «fai uno screenshot» vuol dire *voglio
         * quell'immagine*, e con la prima API finirebbe dentro TALOS invece che
         * dove la persona la cerca. La seconda pesa di più: **una cattura
         * silenziosa dello schermo è esattamente ciò che un assistente non deve
         * saper fare di nascosto**. Qui lo scatto lo si vede e lo si sente,
         * come se l'avesse fatto la persona coi tasti.
         *
         * ⛔ Rende `false` se l'occhio non è agganciato: senza il servizio di
         * accessibilità questa strada non esiste, e va detto invece di tacere.
         */
        fun scattaSchermata(): Boolean {
            val servizio = vivo ?: return false
            return runCatching {
                servizio.performGlobalAction(GLOBAL_ACTION_TAKE_SCREENSHOT)
            }.getOrDefault(false)
        }

        /**
         * Da adesso in poi, un'interazione è una mano.
         *
         * ⛔ Si azzera all'ARMAMENTO e non a ogni sguardo: un tocco arrivato
         * mentre il modello pensava deve sopravvivere fino al controllo, se no
         * il freno sente solo le mani abbastanza fortunate da toccare nel
         * millisecondo giusto.
         */
        fun armaIlFrenoDegliEventi() {
            manoVista = false
            nostraAzioneAl = SystemClock.uptimeMillis()
        }

        /** Marca l'istante di una nostra azione: da qui parte la sordità. */
        fun segnaNostraAzione() {
            nostraAzioneAl = SystemClock.uptimeMillis()
        }

        /** Una mano ha interagito da quando il freno è stato armato? */
        fun manoVistaDagliEventi(): Boolean = manoVista
    }
}
