package ai.talos.agent.ponte

import android.content.Context
import android.database.ContentObserver
import android.net.ConnectivityManager
import android.net.Network
import android.os.Handler
import android.os.Looper
import android.provider.Settings

/**
 * ⭐⭐ QUANDO IL PONTE PUÒ ESSERE CADUTO — detto da un SEGNALE, non da un battito.
 *
 * ## Il difetto, col numero
 *
 * MISURATO sul Pad il 2026-08-09, in due viewport, dopo che il riaggancio
 * automatico era già a posto:
 *
 * ```
 *   guarire            128 ms
 *   accorgersene       7,7 - 9,1 s      ← tutto il costo era qui
 * ```
 *
 * La pagina rilegge lo stato ogni **6 s** quando il ponte è su. Quindi una
 * caduta resta invisibile fino a sei secondi anche se la riparazione è
 * immediata: si guariva in un decimo di secondo dopo aver aspettato nove.
 *
 * ## ⛔ Perché NON si accorcia il battito
 *
 * Perché il ritmo lento non è pigrizia, è la batteria: il commento su
 * `sorveglia()` porta i numeri (2 s = 6% di duty, 6 s = 2%). Triplicare la
 * frequenza per un evento raro sarebbe pagare sempre per accorgersi prima di
 * qualcosa che quasi mai succede.
 *
 * ## ⭐ La mossa: le CAUSE sono due, e tutte e due si annunciano
 *
 * Un ponte `adb` su Wi-Fi non cade a caso. Cade perché:
 *
 * 1. **il Debug wireless si spegne** — e il sistema scrive
 *    `Settings.Global.adb_wifi_enabled`, che è osservabile con un
 *    `ContentObserver`: zero polling, notifica nell'istante del cambio;
 * 2. **la rete cambia** — e `ConnectivityManager` lo dice con
 *    `registerDefaultNetworkCallback`, di nuovo senza chiedere niente a nessuno.
 *
 * ⇒ Invece di guardare più spesso, si ASPETTA DI ESSERE CHIAMATI. Costa meno
 * del battito che sostituisce e arriva prima.
 *
 * ## ⛔ Cosa NON fa: non dice se il ponte è su o giù
 *
 * Dice **«è successo qualcosa che può averlo fatto cadere: riguarda adesso»**.
 * La verità sullo stato la dà solo `adb devices`, e chi riceve la scossa fa una
 * lettura vera. Un segnale che pretendesse di conoscere lo stato sarebbe la
 * stessa bugia del pannello del compito #33.
 *
 * ⛔ E vale nei DUE VERSI: il Debug wireless che si RIACCENDE è una scossa
 * quanto quello che si spegne — è il momento in cui un ponte giù può tornare su
 * da solo, e aspettarlo sei secondi sarebbe metà del lavoro.
 */
class TalosScossaPonte(private val quando: (String) -> Unit) {

    private val mani = Handler(Looper.getMainLooper())
    private var osservatore: ContentObserver? = null
    private var reteCallback: ConnectivityManager.NetworkCallback? = null

    /** Se sta già in ascolto. Due ascolti non aggiungono un'informazione. */
    fun accesa(): Boolean = osservatore != null || reteCallback != null

    fun accendi(context: Context) {
        if (accesa()) return
        accendiDebugWireless(context)
        accendiRete(context)
    }

    /**
     * L'interruttore del Debug wireless, osservato direttamente.
     *
     * ⛔ `adb_wifi_enabled` è una chiave di `Settings.Global`: osservarla non
     * chiede permessi, e non c'è niente da interrogare a intervalli. È il
     * segnale più diretto che esista per questa caduta, perché **è** la caduta.
     */
    private fun accendiDebugWireless(context: Context) {
        val osso = object : ContentObserver(mani) {
            override fun onChange(selfChange: Boolean) {
                val acceso = runCatching {
                    Settings.Global.getInt(context.contentResolver, CHIAVE_ADB_WIFI, 0)
                }.getOrDefault(0) == 1
                quando(if (acceso) "debug-wireless-acceso" else "debug-wireless-spento")
            }
        }
        runCatching {
            context.contentResolver.registerContentObserver(
                Settings.Global.getUriFor(CHIAVE_ADB_WIFI),
                false,
                osso,
            )
            osservatore = osso
        }
    }

    /**
     * La rete predefinita che va e viene.
     *
     * ⛔ Solo la DEFAULT, e solo perdita/arrivo: un callback su ogni rete
     * disponibile scatterebbe di continuo su un telefono che tiene dati e Wi-Fi
     * insieme, e una scossa che arriva sempre non è un segnale.
     */
    private fun accendiRete(context: Context) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { quando("rete-arrivata") }
            override fun onLost(network: Network) { quando("rete-persa") }
        }
        runCatching {
            cm.registerDefaultNetworkCallback(cb)
            reteCallback = cb
        }
    }

    /** ⛔ Va chiamata: un osservatore che sopravvive a chi lo usa è una perdita. */
    fun spegni(context: Context) {
        osservatore?.let { runCatching { context.contentResolver.unregisterContentObserver(it) } }
        osservatore = null
        reteCallback?.let {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            runCatching { cm?.unregisterNetworkCallback(it) }
        }
        reteCallback = null
    }

    companion object {
        /**
         * ⛔ Scritta a mano perché `Settings.Global.ADB_WIFI_ENABLED` è
         * `@hide`: la costante esiste in AOSP ma non nell'SDK pubblico. Il
         * NOME della chiave però è API stabile — è quella che `adb pair` e le
         * Impostazioni usano, ed è la stessa che leggiamo dalla shell con
         * `settings get global adb_wifi_enabled`.
         */
        const val CHIAVE_ADB_WIFI = "adb_wifi_enabled"
    }
}
