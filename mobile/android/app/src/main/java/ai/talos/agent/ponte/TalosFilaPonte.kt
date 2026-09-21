package ai.talos.agent.ponte

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * ⛔⛔⛔ LA FILA DEL PONTE: un thread solo, e NON quello dei plugin.
 *
 * ## Il difetto che ha pagato questo file
 *
 * Owner 2026-08-09: «Caricamento chat» durava **dieci secondi** a ogni avvio.
 * Dodici misure hanno escluso ogni sospetto ovvio — i dati (vuoto = pieno), la
 * derivazione della chiave (44 ms), l'apertura cifrata (8 ms), le risorse
 * (104 ms), il keystore (1 ms), SQLCipher (3 ms), il `load()` del TTS (2 ms), i
 * venti `registerPlugin` (187 ms in tutto). Tre cure sono state scritte e poi
 * **rimosse** perché la misura le bocciava.
 *
 * La firma vera non era lentezza: era una **coda**. Sette chiamate spedite fra
 * 302 ms e 8.708 ms arrivavano al nativo *tutte nello stesso millisecondo*,
 * 10.032 ms dopo la prima.
 *
 * Campionando la pila del thread colpevole è saltato fuori il nome, con le
 * righe: `TalosPrivilegePlugin.exec` → `shell` → `riaggancia` → `scopri` (mDNS,
 * ~6 s) → `collega`. Il ponte, sul thread di tutti.
 *
 * ## Perché un blocco lì ferma cose che non c'entrano niente
 *
 * Capacitor ha **un thread solo** per i metodi di **tutti** i plugin:
 *
 * ```
 *   Bridge.java:138   HandlerThread("CapacitorPlugins")
 *   Bridge.java:854   taskHandler.post(currentThreadTask)
 * ```
 *
 * Chi lo occupa ferma il database, la chat, la voce. E nessuno stava
 * aspettando il ponte: il guardiano delle capacità parte **senza essere
 * atteso** (`App.vue`). La chat non aspettava lui — aspettava il thread che lui
 * teneva.
 *
 * ⛔ `bridge.execute()` NON è la via d'uscita: posta sullo stesso thread
 * (`Bridge.java:906`).
 *
 * ## Le DUE promesse, che sono la ragione di questo file
 *
 * 1. **Fuori dai piedi.** Niente che passa di qui gira sul thread condiviso.
 * 2. **Uno per volta.** Le operazioni del ponte sono seriali per natura: un
 *    riaggancio non deve correre insieme a una shell, e due riagganci
 *    litigherebbero sulla stessa porta.
 *
 * Sono un oggetto con un nome, e non un campo privato dentro il plugin, per una
 * ragione precisa: **così si possono provare**. Un campo privato dentro una
 * classe che estende `Plugin` vuole tutto Android per essere toccato; questo si
 * prova con una JUnit da niente, ed è quello che fa `TalosFilaPonteTest`.
 */
object TalosFilaPonte {

    /** Il nome del thread. Pubblico perché la prova lo controlla per nome. */
    const val NOME = "talos-ponte"

    /**
     * ⛔ `daemon = true`: la fila non deve tenere in piedi il processo. Un
     * comando in corso mentre l'app muore è un comando che non interessa più a
     * nessuno, e un thread non-daemon lo farebbe finire lo stesso — tenendo
     * vivo il processo per qualcosa che nessuno leggerà.
     */
    private val fila: ExecutorService =
        Executors.newSingleThreadExecutor { corpo ->
            Thread(corpo, NOME).apply { isDaemon = true }
        }

    /** Mette in fila. Torna subito: chi chiama non aspetta. */
    fun esegui(opera: Runnable) = fila.execute(opera)
}
