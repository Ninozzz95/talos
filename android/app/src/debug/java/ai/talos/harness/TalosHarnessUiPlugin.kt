package ai.talos.harness

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * L'interruttore del Harness UI (Codex, 24/8) su mobile — e per adesso e'
 * SOLO l'interruttore, sullo stesso schema di [ai.talos.bolla.TalosBollaPlugin]
 * (vedi `MainActivity.registerPlugin` per nome).
 *
 * ## Perche' vive nel source set `debug` e non in `main`
 *
 * Owner 24/8: «mockup visibile solo nella apk di debug, in quello di release
 * lo nascondiamo». `BuildConfig.DEBUG` NON basta da solo (e' una
 * `static final boolean`, ma un `if` in `main` compilerebbe comunque il
 * ramo morto nel bytecode di rilascio, verificabile solo guardando il
 * `.class`) — la garanzia vera e' che questa CLASSE non esista affatto nella
 * release: Gradle compila `debug` (+ `main`) per un build di debug e SOLO
 * `main` (+ `release`) per un build di rilascio, quindi in release
 * `Class.forName("ai.talos.harness.TalosHarnessUiPlugin")` in
 * `MainActivity` (in `main`, che non puo' IMPORTARE una classe che in
 * release non compila) trova `ClassNotFoundException` per costruzione, non
 * per un controllo che si potrebbe scavalcare.
 *
 * ## Perche' non fa ancora niente
 *
 * Il mockup statico (17 superfici demo + Board) e' file locali serviti
 * dallo stesso WebView (`public/harness-ui/`), non ha bisogno di un
 * plugin per apparire — gli basta un link. Questo plugin esiste SOLO
 * perche' `Capacitor.isPluginAvailable('TalosHarnessUi')` e' l'unico modo
 * lato JS di sapere se questa e' una build di debug: la sua PRESENZA e' il
 * segnale, non un metodo che chiama.
 */
@CapacitorPlugin(name = "TalosHarnessUi")
class TalosHarnessUiPlugin : Plugin() {

    /** Conferma la disponibilita' — utile per un controllo esplicito invece che implicito, se mai servisse. */
    @PluginMethod
    fun ready(call: PluginCall) {
        call.resolve(JSObject().put("ok", true))
    }
}
