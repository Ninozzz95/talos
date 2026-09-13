package ai.talos.agent.ponte

import ai.talos.agent.TalosPonteAdb
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * ⭐⭐⭐ LA SENTINELLA: si accorge DA SÉ quando un annuncio `adb` compare sulla
 * rete, invece di cercarlo quando è troppo tardi.
 *
 * ## Il difetto, con le parole dell'owner
 *
 * 2026-08-09: «accoppiamento TROPPO LENTO … inoltre come fa Shizuku la notifica
 * deve scovare automaticamente quando l'utente clicca su accoppia con codice nel
 * Debug wireless».
 *
 * Sono due richieste, e hanno **una sola** risposta.
 *
 * ## Perché [TalosPonteAdb.scopri] costa sei secondi, e non per pigrizia
 *
 * Perché fa un **censimento**: parte quando serve, chiede alla rete «chi c'è?»,
 * e si trova in mano annunci vivi e morti mescolati. Misurato sul Pad:
 *
 * ```
 *   adb-abc12345-1yc9eU (2)  → 192.0.2.95:43053   morto
 *   adb-abc12345-1yc9eU      → 192.0.2.95:38737   morto
 *   adb-abc12345-1yc9eU (3)  → 192.0.2.95:33331   VIVO
 * ```
 *
 * Da una fotografia sola non si distingue il vivo dal morto: l'unica difesa era
 * **aspettare la finestra intera** e provarli tutti. Sei secondi pagati ogni
 * volta, per un'ambiguità che nasceva dal momento in cui si guardava.
 *
 * ## ⭐ La mossa: non fotografare, SORVEGLIARE
 *
 * Un annuncio che **arriva** mentre siamo già in ascolto è vivo **per
 * costruzione**: la cache l'avrebbe consegnato subito all'avvio dell'ascolto,
 * non trenta secondi dopo. Il tempo smette di essere una finestra da aspettare e
 * diventa l'informazione stessa.
 *
 * È la stessa strada di Shizuku (`AdbMdns` + `NsdManager`), cercata prima di
 * scrivere una riga.
 *
 * ## ⛔ Perché è una CLASSE e non più un oggetto solo
 *
 * Perché gli annunci sono **due**, e il secondo costava quanto il primo.
 *
 * MISURATO sul Pad il 2026-08-09, tre volte di fila: riagganciare il ponte
 * costava **9.131 ms** col censimento e **3.124 ms** passando l'indirizzo già
 * noto — cioè `_adb-tls-connect._tcp` pagava gli stessi sei secondi che
 * `_adb-tls-pairing._tcp` aveva già smesso di pagare. Lo stesso meccanismo,
 * scritto una volta, serve tutti e due: **6.007 ms tolti a ogni riaggancio**.
 *
 * ## ⛔ La coda delle risoluzioni resta, e serve ancora
 *
 * `resolveService` accetta **una risoluzione alla volta**: le altre tornano
 * `FAILURE_ALREADY_ACTIVE`. Un difetto già pagato una volta — le buttava via in
 * silenzio, e un ponte perfettamente vivo si comportava come assente. Qui la
 * coda c'è per la stessa ragione, ma **senza tetto**: la sentinella non ha una
 * finestra da consumare, quindi non c'è niente che possa «girare a vuoto».
 */
class TalosSentinellaMdns(
    private val annuncio: String,
    /**
     * Se un indirizzo visto prima resta buono quando la sentinella si riaccende.
     *
     * ⛔ MISURATO sul Pad il 2026-08-09, ed è il difetto che ha reso la seconda
     * caduta tre volte più cara della prima: **3.011 ms** contro **8.600 ms**.
     * La sentinella del collegamento si spegne quando il ponte è su e si
     * riaccende quando cade — e `accendi` azzerava l'indirizzo *un istante
     * prima* che servisse, mandando il riaggancio al censimento da sei secondi.
     *
     * ⇒ `false` per l'ACCOPPIAMENTO: `adbd` cambia porta a ogni apertura della
     * finestrella, e lì un indirizzo vecchio è peggio di nessun indirizzo,
     * perché quella strada non ha un censimento di riserva.
     *
     * ⇒ `true` per il COLLEGAMENTO: la porta regge finché il Debug wireless è
     * acceso, e se non regge il censimento c'è come ripiego. Veloce quando si
     * può, giusto sempre.
     */
    private val ricordaFraAccensioni: Boolean = false,
) {

    /** Cosa fare quando l'annuncio compare davvero. */
    fun interface Quando {
        fun trovato(indirizzo: String)
    }

    private val cercatoreVivo = AtomicReference<NsdManager.DiscoveryListener?>(null)
    private val ultimoIndirizzo = AtomicReference<String?>(null)

    /**
     * L'indirizzo visto per ultimo, o `null` se l'annuncio non è ancora
     * comparso.
     *
     * ⛔ Si tiene l'**ultimo** e non il primo: `adbd` si ri-registra a ogni
     * apertura, e chi arriva dopo ha sostituito chi c'era prima. Tenere il primo
     * vorrebbe dire preferire sistematicamente quello scaduto — che è il difetto
     * misurato sopra, al contrario.
     */
    fun indirizzoPronto(): String? = ultimoIndirizzo.get()

    /** Se sta già sorvegliando. Serve a non riaccenderla a ogni battito. */
    fun accesa(): Boolean = cercatoreVivo.get() != null

    /**
     * ⭐ Ricorda un indirizzo imparato ALTROVE, senza mDNS.
     *
     * ⛔ Perché esiste, e perché è meglio della sentinella stessa: quando il
     * ponte è collegato, `adb devices` stampa già `192.0.2.95:45853 device` —
     * l'indirizzo è lì, dentro un comando che il battito esegue comunque ogni
     * 2-6 secondi. Impararlo da lì costa **zero**: zero pacchetti multicast,
     * zero attesa, e il valore è fresco per definizione perché descrive una
     * connessione viva in questo istante.
     *
     * MISURATO sul Pad il 2026-08-09, ed è il difetto che questa via chiude: la
     * sentinella accesa nel momento della caduta veniva **interrogata
     * nell'istante stesso** in cui cominciava ad ascoltare, non aveva ancora
     * sentito niente, e il riaggancio ricadeva nel censimento da sei secondi —
     * 8.696 ms invece di 3.011.
     *
     * ⇒ L'ascolto mDNS resta per il caso in cui non ci si sia MAI collegati in
     * questo processo. Per tutti gli altri, l'indirizzo si sa già.
     */
    fun ricorda(indirizzo: String) {
        ultimoIndirizzo.set(indirizzo)
    }

    /**
     * Comincia a sorvegliare. Idempotente: chiamarla due volte non apre due
     * ascolti, perché due ascolti sullo stesso tipo raddoppiano il traffico
     * multicast senza aggiungere una sola informazione.
     */
    @JvmOverloads
    fun accendi(context: Context, quando: Quando = Quando { }): Boolean {
        if (cercatoreVivo.get() != null) return true
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return false
        if (!ricordaFraAccensioni) ultimoIndirizzo.set(null)

        val coda = ConcurrentLinkedQueue<NsdServiceInfo>()
        val occupato = AtomicBoolean(false)
        var risolutore: NsdManager.ResolveListener? = null

        fun prossimo() {
            if (!occupato.compareAndSet(false, true)) return
            val info = coda.poll()
            val ascoltatore = risolutore
            if (info == null || ascoltatore == null) { occupato.set(false); return }
            runCatching { @Suppress("DEPRECATION") nsd.resolveService(info, ascoltatore) }
                .onFailure { occupato.set(false); prossimo() }
        }

        risolutore = object : NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo?, codice: Int) {
                // Occupato non è un no: è un «più tardi». Torna in coda.
                if (codice == NsdManager.FAILURE_ALREADY_ACTIVE && info != null) coda.add(info)
                occupato.set(false)
                prossimo()
            }

            override fun onServiceResolved(info: NsdServiceInfo?) {
                val porta = info?.port
                val ospite = info?.host?.hostAddress
                // ⛔ Solo IPv4: `adb connect` con un IPv6 senza parentesi non sa
                // dove finisce l'indirizzo e dove comincia la porta.
                if (porta != null && ospite != null && !ospite.contains(':')) {
                    val indirizzo = "$ospite:$porta"
                    ultimoIndirizzo.set(indirizzo)
                    runCatching { quando.trovato(indirizzo) }
                }
                occupato.set(false)
                prossimo()
            }
        }

        val cercatore = object : NsdManager.DiscoveryListener {
            override fun onStartDiscoveryFailed(t: String?, codice: Int) { cercatoreVivo.set(null) }
            override fun onStopDiscoveryFailed(t: String?, codice: Int) = Unit
            override fun onDiscoveryStarted(t: String?) = Unit
            override fun onDiscoveryStopped(t: String?) = Unit
            /**
             * ⛔ Si NOTA e non si dimentica. L'annuncio che sparisce non rende
             * inutile l'indirizzo che avevamo: azzerarlo qui significherebbe
             * buttare via una strada ancora buona un istante prima di usarla.
             */
            override fun onServiceLost(info: NsdServiceInfo?) = Unit
            override fun onServiceFound(info: NsdServiceInfo?) {
                if (info == null) return
                coda.add(info)
                prossimo()
            }
        }

        return runCatching {
            nsd.discoverServices(annuncio, NsdManager.PROTOCOL_DNS_SD, cercatore)
            cercatoreVivo.set(cercatore)
            true
        }.getOrDefault(false)
    }

    /**
     * Smette. ⛔ Va chiamata sempre, riuscita o no: una scoperta mDNS lasciata
     * accesa manda pacchetti multicast finché il processo vive, e nessuno la
     * vedrebbe — è il tipo di costo che non si presenta come difetto.
     */
    fun spegni(context: Context) {
        val cercatore = cercatoreVivo.getAndSet(null) ?: return
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return
        runCatching { nsd.stopServiceDiscovery(cercatore) }
    }
}

/**
 * Le due sentinelle, una per annuncio.
 *
 * ⛔ Vivono quanto il processo perché l'indirizzo deve essere **già in mano** nel
 * momento in cui serve: una sentinella creata quando serve è, di nuovo, una
 * fotografia.
 */
object TalosSentinelle {
    /** `_adb-tls-pairing._tcp`: si accende con la notifica del codice. */
    val accoppiamento = TalosSentinellaMdns(TalosPonteAdb.ANNUNCIO_ACCOPPIAMENTO)

    /**
     * `_adb-tls-connect._tcp`: si accende quando il ponte è GIÙ e si spegne
     * quando è su.
     *
     * ⛔ Non sempre accesa: mentre il ponte regge non c'è niente da cercare, e
     * lasciare acceso un ascolto multicast per un evento che non arriva è
     * esattamente il costo invisibile di cui sopra.
     */
    val collegamento = TalosSentinellaMdns(
        TalosPonteAdb.ANNUNCIO_COLLEGAMENTO,
        ricordaFraAccensioni = true,
    )
}
