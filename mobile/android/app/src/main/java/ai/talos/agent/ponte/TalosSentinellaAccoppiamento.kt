package ai.talos.agent.ponte

import ai.talos.agent.TalosPonteAdb
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * ⭐⭐⭐ LA SENTINELLA: si accorge DA SÉ quando la persona apre «Accoppia con
 * codice», invece di cercare quando è troppo tardi.
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
 * Perché fa un **censimento**: parte quando il codice è già stato scritto,
 * chiede alla rete «chi c'è?», e si trova in mano annunci vivi e morti
 * mescolati. Misurato sul Pad:
 *
 * ```
 *   adb-2ea6573c-1yc9eU (2)  → 192.168.1.95:43053   morto
 *   adb-2ea6573c-1yc9eU      → 192.168.1.95:38737   morto
 *   adb-2ea6573c-1yc9eU (3)  → 192.168.1.95:33331   VIVO
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
 * non trenta secondi dopo, mentre la persona tocca «Accoppia dispositivo con
 * codice». Il tempo smette di essere una finestra da aspettare e diventa
 * l'informazione stessa.
 *
 * ⇒ Tre cose insieme, con un meccanismo solo:
 *
 * 1. l'attesa di sei secondi **sparisce** — l'indirizzo è già in mano quando il
 *    codice arriva;
 * 2. la notifica può dire «trovato, scrivi le sei cifre» **nell'istante** in cui
 *    la finestrella si apre, che è la cosa che l'owner ha chiesto;
 * 3. l'ambiguità vivo/morto si risolve da sé, invece di essere aggirata.
 *
 * È la stessa strada di Shizuku (`AdbMdns` + `NsdManager` su
 * `_adb-tls-pairing._tcp`), cercata prima di scrivere una riga.
 *
 * ## ⛔ La coda delle risoluzioni resta, e serve ancora
 *
 * `resolveService` accetta **una risoluzione alla volta**: le altre tornano
 * `FAILURE_ALREADY_ACTIVE`. Un difetto già pagato una volta — le buttava via in
 * silenzio, e un ponte perfettamente vivo si comportava come assente. Qui la
 * coda c'è per la stessa ragione, ma **senza tetto**: la sentinella non ha una
 * finestra da consumare, quindi non c'è niente che possa «girare a vuoto».
 */
object TalosSentinellaAccoppiamento {

    /** Cosa fare quando la finestrella di sistema si apre davvero. */
    fun interface Quando {
        fun trovato(indirizzo: String)
    }

    private val cercatoreVivo = AtomicReference<NsdManager.DiscoveryListener?>(null)
    private val ultimoIndirizzo = AtomicReference<String?>(null)

    /**
     * L'indirizzo visto per ultimo, o `null` se la finestrella non si è ancora
     * aperta.
     *
     * ⛔ Si tiene l'**ultimo** e non il primo: `adbd` si ri-registra a ogni
     * apertura della finestrella, e chi arriva dopo ha sostituito chi c'era
     * prima. Tenere il primo vorrebbe dire preferire sistematicamente quello
     * scaduto — che è il difetto misurato sopra, al contrario.
     */
    fun indirizzoPronto(): String? = ultimoIndirizzo.get()

    /**
     * Comincia a sorvegliare. Idempotente: chiamarla due volte non apre due
     * ascolti, perché due ascolti sullo stesso tipo raddoppiano il traffico
     * multicast senza aggiungere una sola informazione.
     */
    fun accendi(context: Context, quando: Quando): Boolean {
        if (cercatoreVivo.get() != null) return true
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return false
        ultimoIndirizzo.set(null)

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
             * ⛔ Si NOTA e non si dimentica. La finestrella che si chiude toglie
             * l'annuncio, ma il codice che la persona ha in mano resta valido
             * per il tempo che il sistema gli dà: azzerare qui l'indirizzo
             * significherebbe buttare via una strada ancora buona un istante
             * prima di usarla.
             */
            override fun onServiceLost(info: NsdServiceInfo?) = Unit
            override fun onServiceFound(info: NsdServiceInfo?) {
                if (info == null) return
                coda.add(info)
                prossimo()
            }
        }

        return runCatching {
            nsd.discoverServices(
                TalosPonteAdb.ANNUNCIO_ACCOPPIAMENTO,
                NsdManager.PROTOCOL_DNS_SD,
                cercatore,
            )
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
