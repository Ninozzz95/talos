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
 * ## ⛔⛔⛔ 3/9 — spostata da `debug` a `main`: Codice ora spedisce in release
 *
 * Owner 24/8: «mockup visibile solo nella apk di debug, in quello di release
 * lo nascondiamo» — quella decisione è durata undici giorni. Owner 3/9,
 * dopo aver scaricato la v0.1.24 pubblicata (che applicava ANCORA la
 * regola del 24/8, con un guard nuovo di zecca che la rinforzava) e non
 * aver trovato Codice da nessuna parte: «CODICE DEVE ESSERE PRESENTE
 * NELLA APP DI PRODUZIONE», ripetuto cinque volte. Questa classe vive ora
 * in `main`: Gradle la compila in OGNI variante, debug e release incluse.
 *
 * `Capacitor.isPluginAvailable('TalosHarnessUi')` (lato JS,
 * `mobile/src/services/harnessUi.ts`) resta il segnale che il resto
 * dell'app legge — ma ora è vero SEMPRE, non solo in debug. Il guard di
 * router (`mobile/src/router/index.ts`, commit `5373a625`) e il calcolo
 * della barra tablet (`App.vue`) restano al loro posto: non fanno più
 * niente di visibile quando il plugin è sempre presente, ma restano una
 * rete di sicurezza onesta se mai, per un motivo diverso, il plugin non
 * si caricasse a runtime (un install parziale, per esempio) — coerente
 * con [[se-non-verifichi-esatto-fermati-e-dillo]]: un guard che controlla
 * una condizione vera non è un guard sbagliato, controllava la condizione
 * giusta applicata alla decisione sbagliata.
 *
 * ⛔ R8 ora vede questa classe in build di RILASCIO (minify+shrink ON) —
 * cosa che non succedeva mai finché viveva solo in `debug` (dove R8 non
 * gira). `Class.forName("ai.talos.harness.TalosHarnessUiPlugin")` in
 * `MainActivity` è una ricerca per STRINGA: R8 non la traccia come
 * riferimento automaticamente come farebbe con `X.class`. Tenuta esplicita
 * in `proguard-rules.pro` — senza, R8 potrebbe rinominarla e la ricerca
 * fallirebbe A RUNTIME con `ClassNotFoundException`, non in compilazione.
 *
 * ## Perche' non fa ancora niente da sola
 *
 * Il mockup statico (17 superfici demo + Board) e' file locali serviti
 * dallo stesso WebView (`public/harness-ui/`), non ha bisogno di un
 * plugin per apparire — gli basta un link. Questo plugin esiste SOLO
 * perche' `Capacitor.isPluginAvailable('TalosHarnessUi')` e' l'unico modo
 * lato JS di sapere se il ponte nativo è disponibile: la sua PRESENZA e' il
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
