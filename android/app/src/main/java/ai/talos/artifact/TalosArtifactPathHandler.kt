package ai.talos.artifact

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/**
 * ⛔⛔⛔ Owner 2026-08-27 — la CSP di QUESTO documento, non quella di TALOS.
 *
 * Verificato con la ricerca commissionata + CSP3/MDN: un `<iframe srcdoc>`
 * EREDITA la CSP del genitore — un `<meta http-equiv=CSP>` dentro l'HTML non
 * verrebbe nemmeno letto. La direttiva `sandbox` di CSP invece esiste SOLO
 * come intestazione HTTP — è ignorata in un `<meta>` — e per questo la
 * consegna passa da `WebViewAssetLoader.PathHandler`, che può impostare
 * intestazioni HTTP VERE (`WebResourceResponse.setResponseHeaders`, API 21).
 *
 * `sandbox allow-scripts` (senza `allow-same-origin`) forza il documento in
 * un'origine opaca — fallisce ogni controllo di same-origin, niente
 * `document.cookie`/`localStorage` — anche PRIMA che la CSP venga letta.
 * `connect-src 'none'` è la difesa che conta di più: anche se lo script del
 * modello è ostile, non ha nessuna via di rete per far uscire un dato che ha
 * incorporato nel proprio HTML (l'unica cosa che potrebbe esfiltrare, dato
 * che l'origine opaca gli nega comunque l'accesso al resto dell'app).
 *
 * ⛔ Non è collegato al bridge Capacitor per costruzione: questo handler non
 * ha mai un riferimento a `Bridge`/`WebView` di MainActivity, e la WebView
 * che lo carica (`TalosArtifactActivity`) non chiama mai
 * `addJavascriptInterface` — l'iniezione è per-istanza-WebView, non per
 * origine, quindi la sola CSP non sarebbe bastata (confermato leggendo
 * `CapacitorCookies.java`/`MessageHandler.java` veri: iniettano su
 * `bridge.getWebView()`, e Android inietta in OGNI frame di
 * quell'istanza — un iframe sandboxato dentro la WebView principale
 * vedrebbe comunque quegli oggetti).
 */
internal class TalosArtifactPathHandler(
    context: Context,
    private val artifactId: String,
) : WebViewAssetLoader.PathHandler {

    private val store = TalosArtifactStore(context)

    override fun handle(path: String): WebResourceResponse {
        val html = store.read(artifactId)
            ?: return response(404, "Not Found", ByteArray(0))
        return response(200, "OK", html)
    }

    private fun response(status: Int, reason: String, body: ByteArray): WebResourceResponse {
        val response = WebResourceResponse(
            "text/html",
            "utf-8",
            status,
            reason,
            mapOf(
                "Content-Security-Policy" to CSP,
                // ⛔ Mai la cache del disco: un artefatto è generato per QUESTA
                // conversazione, e una versione vecchia servita dalla cache
                // sarebbe un contenuto diverso da quello che il modello ha
                // scritto davvero.
                "Cache-Control" to "no-store",
            ),
            ByteArrayInputStream(body),
        )
        return response
    }

    companion object {
        /**
         * ⛔ Ogni direttiva ha un motivo, non è un elenco copiato:
         * - `script-src 'unsafe-inline'`/`style-src 'unsafe-inline'`: l'HTML è
         *   scritto dal modello in un solo documento, senza un host esterno da
         *   cui servire file .js/.css separati — è la stessa scelta di
         *   Claude/ChatGPT per contenuto generato al volo.
         * - `connect-src 'none'`, `frame-src 'none'`, `object-src 'none'`,
         *   `worker-src 'none'`: nessuna via di rete o di esecuzione annidata.
         * - `img-src`/`media-src` `data: blob:`: il modello può incorporare
         *   immagini come `data:`, mai caricarle da un host remoto.
         * - `font-src 'none'`: niente Google Fonts qui — a differenza dei miei
         *   Artifact, TALOS parte dalla policy più severa possibile per il
         *   primo rilascio; si allenta SOLO se una richiesta reale lo motiva.
         * - `base-uri 'none'`, `form-action 'none'`: stesso principio già in
         *   `index.html` — un `<base>`/`<form>` iniettato non deve avere
         *   effetto.
         */
        const val CSP = "sandbox allow-scripts; default-src 'none'; " +
            "script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
            "img-src data: blob:; media-src data: blob:; " +
            "connect-src 'none'; font-src 'none'; object-src 'none'; " +
            "frame-src 'none'; worker-src 'none'; " +
            "base-uri 'none'; form-action 'none'"
    }
}
