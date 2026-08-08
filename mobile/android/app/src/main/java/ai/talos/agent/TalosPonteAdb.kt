package ai.talos.agent

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.system.Os
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * ⭐⭐ IL PONTE IN CASA: TALOS si accoppia da solo col proprio telefono.
 *
 * ## Perché esiste
 *
 * Su OxygenOS 16 Shizuku non ci autorizzerà mai — misurato, e chiuso col
 * compito #36. Il motivo è preciso: Shizuku autorizza le app di terzi con un
 * `pm grant`, e questa ROM ha tolto alla shell il potere di concedere permessi.
 *
 * ⇒ Ma la shell **esegue benissimo** (Wi-Fi, Bluetooth, Non disturbare, tutto
 * provato). Ciò che manca non è il potere: è **qualcuno che ci dia una shell**.
 *
 * Il Debug wireless di Android ne dà una a chiunque sappia accoppiarsi. Da
 * Android 11 l'accoppiamento usa **SPAKE2 + mTLS**, e nessuna libreria Kotlin lo
 * implementa: `dadb` sa parlare con un demone già autorizzato, ma non sa
 * accoppiarsi. L'unico che sa farlo è `adb` stesso.
 *
 * ## Come si esegue un programma su Android
 *
 * Da Android 10 un'app non può eseguire un file della propria cartella dati. Può
 * eseguire solo ciò che sta in `nativeLibraryDir`, dove il sistema mette le
 * librerie native all'installazione. ⇒ `adb` viaggia nell'APK travestito da
 * libreria, col nome `libadb.so`.
 *
 * ⛔ E lo stesso travestimento crea l'unico trucco di questo file: `libz.so.1` e
 * `libzstd.so.1` **non finiscono in `.so`**, quindi Android non li estrarrebbe.
 * Li spediamo come `libz.so` e `libzstd.so`, e qui creiamo dei **collegamenti**
 * col nome vero. Si poteva anche riscrivere il binario — ma allora la sua
 * impronta non sarebbe più uguale a quella pubblicata da Termux, e la verifica
 * di provenienza (`jniLibs/PROVENIENZA.md`, compito #47) non varrebbe più
 * niente. Un collegamento costa meno di una promessa persa.
 *
 * ## ⛔⛔ COSA QUESTO PONTE FA SALTARE
 *
 * Con una shell vera in mano, la **lista bianca dei programmi** di
 * `TalosPrivilegePlugin` smette di essere una guardia: chi controlla gli
 * argomenti di `cmd` può fare molto più di ciò che quella lista lascia
 * intendere. Non è un difetto introdotto qui — è che questo ponte rende
 * finalmente vero il rischio che l'ADR #45 aveva già nominato.
 */
object TalosPonteAdb {

    /** Com'è andata, con dentro abbastanza per capire **perché**. */
    data class Esito(
        val ok: Boolean,
        val uscita: String = "",
        val errore: String = "",
        val codice: Int = -1,
        val motivo: String? = null,
    )

    /**
     * Dove `adb` tiene la sua chiave, e dove scrive i suoi registri.
     *
     * ⛔ Deve essere una cartella NOSTRA e scrivibile: `adb` genera al primo
     * avvio una coppia di chiavi RSA in `$HOME/.android/`, ed è quella chiave a
     * rendere l'accoppiamento **permanente**. Perderla significa rifare
     * l'accoppiamento a ogni avvio — cioè il contrario del punto di tutto questo.
     */
    private fun casa(context: Context): File =
        File(context.filesDir, "ponte-adb").apply { mkdirs() }

    private fun librerie(context: Context): String =
        context.applicationInfo.nativeLibraryDir

    /**
     * I collegamenti coi nomi veri, creati una volta e poi riusati.
     *
     * Si ricreano se mancano — una pulizia dei dati dell'app li porta via, e un
     * ponte che smette di funzionare dopo «cancella dati» senza dirlo sarebbe
     * peggio di un ponte che non c'è.
     */
    private fun collegamenti(context: Context): File {
        val cartella = File(casa(context), "lib").apply { mkdirs() }
        val lib = librerie(context)
        for ((vero, spedito) in NOMI_VERI) {
            val collegamento = File(cartella, vero)
            val bersaglio = File(lib, spedito).absolutePath

            /*
             * ⛔⛔ SI CONTROLLA DOVE PUNTA, non se c'è.
             *
             * ## Il difetto, visto sul Pad il 2026-08-08 alle 23:08
             *
             * Dopo un aggiornamento dell'app il ponte moriva con:
             *
             *     CANNOT LINK EXECUTABLE ".../libadb.so":
             *     library "libz.so.1" not found: needed by main executable
             *
             * Perché `nativeLibraryDir` **cambia nome a ogni installazione**:
             * `…/ai.talos.dev-0Y5YRZEd6IJ…` diventa `…-XNoQ4E1FJOrS…`. I
             * collegamenti restavano a puntare alla cartella vecchia, che non
             * esiste più.
             *
             * E la vecchia riga `if (collegamento.exists()) continue` non
             * bastava: `exists()` **segue** il collegamento, quindi su uno rotto
             * dice «no» — ma `Os.symlink` fallisce lo stesso con `EEXIST`,
             * perché il file del collegamento c'è eccome. Il `runCatching` si
             * mangiava l'errore e il ponte restava rotto in silenzio.
             *
             * ⇒ Colpisce **ogni aggiornamento dell'app**: non un caso di
             * laboratorio, la cosa più normale che possa capitare a una persona.
             */
            val giaGiusto = runCatching { Os.readlink(collegamento.absolutePath) == bersaglio }
                .getOrDefault(false)
            if (giaGiusto) continue

            // Si toglie SEMPRE prima di rifare: rotto, vecchio o copiato che sia.
            runCatching { collegamento.delete() }
            runCatching { Os.symlink(bersaglio, collegamento.absolutePath) }
                .onFailure {
                    // Se il collegamento non si può fare, si COPIA. Costa spazio
                    // ma il ponte resta in piedi, ed è l'unica cosa che conta.
                    runCatching { File(lib, spedito).copyTo(collegamento, overwrite = true) }
                }
        }
        return cartella
    }

    /** Se i pezzi ci sono davvero. Una risposta onesta prima di ogni promessa. */
    fun disponibile(context: Context): Boolean =
        File(librerie(context), "libadb.so").canExecute()

    /**
     * Esegue `adb` con gli argomenti dati, e aspetta.
     *
     * ⛔ Un ELENCO di parole, mai una riga da interpretare: gli argomenti
     * arrivano dal modello, e un testo con dentro un `;` diventerebbe un secondo
     * comando. `ProcessBuilder` prende già un array e non interpreta nulla.
     */
    fun esegui(context: Context, argomenti: List<String>, attesaMs: Long = 20_000): Esito {
        if (!disponibile(context)) return Esito(false, motivo = "bridge-not-packaged")

        val lib = librerie(context)
        val costruttore = ProcessBuilder(listOf(File(lib, "libadb.so").absolutePath) + argomenti)
        costruttore.environment().apply {
            /*
             * ⛔ `LD_LIBRARY_PATH` non è facoltativo: dentro `adb` sta scritto
             * che le sue librerie stanno in `/data/data/com.termux/files/usr/lib`
             * — una cartella che su questo telefono non esiste. Senza questa
             * riga il caricatore non trova niente e il processo muore prima di
             * arrivare a `main`, con un errore che non assomiglia a una causa.
             */
            put("LD_LIBRARY_PATH", "${collegamenti(context).absolutePath}:$lib")
            put("HOME", casa(context).absolutePath)
            put("TMPDIR", casa(context).absolutePath)
        }
        costruttore.redirectErrorStream(false)

        return runCatching {
            val processo = costruttore.start()
            val uscita = processo.inputStream.bufferedReader().use { it.readText() }
            val errore = processo.errorStream.bufferedReader().use { it.readText() }
            val finito = processo.waitFor(attesaMs, TimeUnit.MILLISECONDS)
            if (!finito) {
                processo.destroyForcibly()
                return Esito(false, uscita.trim(), errore.trim(), motivo = "bridge-timeout")
            }
            val codice = processo.exitValue()
            Esito(codice == 0, uscita.trim(), errore.trim(), codice)
        }.getOrElse {
            Esito(false, errore = it.message ?: it.javaClass.simpleName, motivo = "bridge-exec-failed")
        }
    }

    /**
     * L'accoppiamento: il codice a sei cifre che il telefono mostra una volta
     * sola.
     *
     * ## Perché servono DUE porte, e perché non è colpa nostra
     *
     * Il Debug wireless ne apre due: una per l'**accoppiamento**, che vive
     * quanto dura la finestrella e cambia ogni volta, e una per il
     * **collegamento**, che resta. La finestra ne mostra una, la schermata
     * dietro ne mostra l'altra, e chiunque le abbia usate le ha scambiate almeno
     * una volta. ⇒ Qui le chiediamo separate e dette per nome.
     */
    fun accoppia(context: Context, indirizzo: String, codice: String): Esito {
        if (!indirizzo.matches(INDIRIZZO)) return Esito(false, motivo = "bad-address")
        if (!codice.matches(SEI_CIFRE)) return Esito(false, motivo = "bad-code")
        // `adb pair` legge il codice da stdin oppure lo prende come argomento:
        // come argomento e' l'unica forma che non richiede di tenere aperta una
        // pipe interattiva, che qui non abbiamo.
        return esegui(context, listOf("pair", indirizzo, codice), attesaMs = 30_000)
    }

    /** Il collegamento vero e proprio, quello che poi dura. */
    fun collega(context: Context, indirizzo: String): Esito {
        if (!indirizzo.matches(INDIRIZZO)) return Esito(false, motivo = "bad-address")
        val esito = esegui(context, listOf("connect", indirizzo), attesaMs = 20_000)
        /*
         * ⛔ `adb connect` esce con 0 anche quando fallisce, e scrive
         * «failed to connect» sull'uscita normale. È lo stesso difetto di forma
         * di `cmd` e `settings` con le SecurityException: il codice di uscita
         * non dice la verità, e crederci significa dichiarare collegato un
         * telefono che non lo è.
         */
        val riuscito = esito.uscita.contains("connected to", ignoreCase = true)
            && !esito.uscita.contains("failed", ignoreCase = true)
        return esito.copy(ok = riuscito, motivo = if (riuscito) null else "connect-refused")
    }

    /**
     * Se il ponte è vivo ADESSO — non se lo era prima.
     *
     * Il Debug wireless si spegne al riavvio del telefono, e un valore ricordato
     * racconterebbe un mondo che non c'è più. È la stessa regola che vale per
     * Shizuku, per la stessa ragione.
     */
    fun collegato(context: Context): Boolean {
        val esito = esegui(context, listOf("devices"), attesaMs = 10_000)
        return esito.uscita.lines().drop(1).any { it.trim().endsWith("device") }
    }

    /**
     * ⭐ La shell. È il punto di tutto il file.
     *
     * ⛔ La lista bianca dei programmi si applica **anche qui**, e per una
     * ragione più forte che altrove: da questa parte del ponte non c'è nessun
     * server di Shizuku a fare da secondo giudice. Se non filtrassimo noi, non
     * filtrerebbe nessuno.
     */
    fun shell(context: Context, comando: List<String>, ammessi: Set<String>): Esito {
        if (comando.isEmpty()) return Esito(false, motivo = "no-command")
        if (comando[0] !in ammessi) return Esito(false, motivo = "program-not-allowed")

        val esito = esegui(context, listOf("shell") + comando, attesaMs = 30_000)
        if (!esito.ok && esito.errore.contains("no devices", ignoreCase = true)) {
            return esito.copy(motivo = "bridge-not-connected")
        }
        // Stessa trappola del percorso Shizuku: `cmd` e `settings` escono con 0
        // e stampano la SecurityException su stderr.
        val negato = esito.errore.contains("SecurityException")
        return if (negato) esito.copy(ok = false, motivo = "denied-by-system") else esito
    }

    /** Chiude il server, e con esso la porta locale che teneva aperta. */
    fun spegni(context: Context): Esito = esegui(context, listOf("kill-server"), attesaMs = 10_000)

    /**
     * ⭐⭐ LE PORTE SE LE TROVA DA SÉ. La persona digita solo il codice.
     *
     * ## Il problema, e perché tutti gli altri lo scaricano sull'utente
     *
     * Il Debug wireless apre **due** porte: una per l'accoppiamento, che vive
     * quanto la finestrella e cambia ogni volta, e una per il collegamento. La
     * finestra ne mostra una, la schermata dietro l'altra, e nessuna delle due
     * è indovinabile — sono assegnate a caso a ogni accensione.
     *
     * LADB e le app simili chiedono di trascriverle a mano. È il pezzo che fa
     * abbandonare la procedura: tre numeri copiati da due schermate diverse,
     * mentre una finestrella scade.
     *
     * ## ⛔ E il modo ovvio non funziona: misurato
     *
     * ```
     * adb mdns services  →  error: unknown host service 'mdns:services'
     * getprop | grep adb →  nessuna service.adb.tls.port
     * ```
     *
     * La build Termux di `adb` è compilata **senza** mDNS, e questa ROM non
     * pubblica la porta fra le proprietà di sistema.
     *
     * ## La cura: chiederlo ad Android, che lo sa
     *
     * Il telefono **annuncia da sé** `_adb-tls-pairing._tcp` (mentre la
     * finestrella è aperta) e `_adb-tls-connect._tcp`. `NsdManager` è dentro
     * Android dal 2012, non chiede permessi, e non aggiunge una riga di
     * dipendenze. ⇒ Le porte le troviamo noi, e alla persona resta da leggere
     * **un numero solo**: quello che la finestrella le sta già mostrando.
     */
    /**
     * ## ⛔ E perché torna un ELENCO e non un indirizzo
     *
     * Perché gli annunci **invecchiano**, e l'ho misurato prima di scrivere una
     * riga di schermata. Interrogando la rete il 2026-08-08:
     *
     * ```
     * _adb-tls-connect._tcp → adb-2ea6573c-1yc9eU        porta 38737
     *                       → adb-2ea6573c-1yc9eU (2)    ← il «(2)» dice tutto
     * ```
     *
     * Il porto vero era **43053**: quello annunciato dal nome senza suffisso era
     * un residuo di una sessione precedente ancora in cache, e collegarcisi dava
     * `Connection refused`. Il `(2)` compare proprio perché adbd si è
     * ri-registrato trovando il vecchio nome ancora occupato.
     *
     * ⇒ Prendere «il primo che risponde» avrebbe dato un ponte che fallisce a
     * caso, in un modo che alla persona sembra colpa sua. Si raccolgono tutti i
     * candidati e si prova finché uno apre.
     */
    fun scopri(context: Context, tipo: String, attesaMs: Long = 6_000): List<String> {
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return emptyList()
        val trovati = java.util.Collections.synchronizedSet(LinkedHashSet<String>())
        val calma = CountDownLatch(1)

        val risolutore = object : NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo?, codice: Int) = Unit
            override fun onServiceResolved(info: NsdServiceInfo?) {
                val porta = info?.port ?: return
                val ospite = info.host?.hostAddress ?: return
                // ⛔ Solo IPv4: `adb connect` con un IPv6 senza parentesi non sa
                // dove finisce l'indirizzo e dove comincia la porta.
                if (ospite.contains(':')) return
                trovati.add("$ospite:$porta")
            }
        }

        val cercatore = object : NsdManager.DiscoveryListener {
            override fun onStartDiscoveryFailed(t: String?, codice: Int) = calma.countDown()
            override fun onStopDiscoveryFailed(t: String?, codice: Int) = Unit
            override fun onDiscoveryStarted(t: String?) = Unit
            override fun onDiscoveryStopped(t: String?) = Unit
            override fun onServiceLost(info: NsdServiceInfo?) = Unit
            override fun onServiceFound(info: NsdServiceInfo?) {
                if (info != null) runCatching { @Suppress("DEPRECATION") nsd.resolveService(info, risolutore) }
            }
        }

        return runCatching {
            nsd.discoverServices(tipo, NsdManager.PROTOCOL_DNS_SD, cercatore)
            // Si aspetta la finestra intera: chi arriva per secondo e' spesso
            // quello vivo, e fermarsi al primo e' esattamente l'errore misurato.
            calma.await(attesaMs, TimeUnit.MILLISECONDS)
            runCatching { nsd.stopServiceDiscovery(cercatore) }
            // ⭐ In coda per ultimo l'annuncio piu' recente: adbd si ri-registra
            // in fondo, e quello vecchio resta davanti nella cache.
            trovati.toList().reversed()
        }.getOrElse { emptyList() }
    }

    /** Il servizio che il telefono annuncia mentre la finestrella è aperta. */
    const val ANNUNCIO_ACCOPPIAMENTO = "_adb-tls-pairing._tcp"

    /** Quello che resta, e serve per collegarsi. */
    const val ANNUNCIO_COLLEGAMENTO = "_adb-tls-connect._tcp"

    /** nome che il caricatore cerca → nome col quale l'abbiamo spedito. */
    private val NOMI_VERI = mapOf(
        "libz.so.1" to "libz.so",
        "libzstd.so.1" to "libzstd.so",
    )

    /**
     * ⛔ L'indirizzo si valida, e stretto: finisce in un `ProcessBuilder`, e
     * anche se lì non c'è una shell a interpretarlo, un argomento che il modello
     * può scegliere liberamente è la cosa che va guardata per prima.
     */
    private val INDIRIZZO = Regex("""^[0-9a-fA-F.:\[\]]{3,45}:\d{1,5}$""")
    private val SEI_CIFRE = Regex("""^\d{6}$""")
}
