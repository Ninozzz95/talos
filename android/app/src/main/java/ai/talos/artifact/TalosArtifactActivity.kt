package ai.talos.artifact

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import ai.talos.R
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * ⛔⛔⛔ Owner 2026-08-27 — «creare artefatti HTML con schemi avanzati e
 * interagibili in chat, come fa ChatGPT (spirografi, simulazioni)».
 *
 * Ricerca commissionata (Codex) e VERIFICATA riga per riga contro il codice
 * vero prima di scrivere questo file — non presa per buona:
 * - `index.html` ha davvero `frame-src 'none'`, `script-src 'self'
 *   'wasm-unsafe-eval'`, zero inline — confermato leggendo il file.
 * - `CapacitorCookies.java`/`MessageHandler.java` chiamano davvero
 *   `addJavascriptInterface` su `bridge.getWebView()` — confermato leggendo
 *   il sorgente Java vero dentro `node_modules/@capacitor/android`. Questo è
 *   IL motivo per cui un iframe (con qualunque `sandbox`/CSP) dentro la
 *   WebView di `MainActivity` non basterebbe: l'iniezione è per istanza di
 *   WebView, non per origine — un'origine opaca vedrebbe comunque
 *   `androidBridge`/`CapacitorCookiesAndroidInterface`.
 * - Le API `WebViewCompat.setProfile(WebView, String)`,
 *   `ProfileStore.getOrCreateProfile(String)`,
 *   `WebViewFeature.MULTI_PROFILE`/`MULTI_PROCESS`,
 *   `WebViewAssetLoader.DEFAULT_DOMAIN` ("appassets.androidplatform.net")
 *   sono state lette con `javap` sulle classi VERE dentro
 *   `androidx.webkit:webkit:1.14.0` (la versione che questo progetto usa
 *   davvero, in `variables.gradle`) — non copiate da una pagina di
 *   documentazione che poteva riferirsi a un'altra versione.
 *
 * ⛔ IL LIMITE ONESTO, dichiarato e non nascosto: Android WebView non ha
 * iframe out-of-process — nessun isolamento multi-processo per sito come
 * Chrome desktop. Anche con un Profilo separato, questa WebView gira nello
 * stesso processo renderer di qualunque altra WebView dell'app (anche se
 * NON condivide dati/cookie/storage). Un bug di sandbox-escape del renderer
 * (raro ma reale — CVE-2026-3910, sfruttata attivamente, CVSS 8.8) avrebbe
 * più margine qui che su un browser desktop con site isolation. Questa
 * Activity è la difesa migliore ottenibile con un solo APK, non una
 * garanzia assoluta di zero fuga — per quella servirebbe un secondo
 * pacchetto senza permesso INTERNET (valutato, costo di distribuzione alto,
 * non fatto in v1).
 *
 * ⛔ FAIL-CLOSED, non un ripiego silenzioso: se il dispositivo non supporta
 * `MULTI_PROFILE`/`MULTI_PROCESS`, la modalità HTML libero NON parte. Niente
 * downgrade a una WebView meno isolata.
 */
class TalosArtifactActivity : AppCompatActivity() {

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val artifactId = intent?.getStringExtra(EXTRA_ARTIFACT_ID)
        val store = TalosArtifactStore(applicationContext)
        if (artifactId == null || !store.isValidId(artifactId)) {
            Log.w(TAG, "artifact id mancante o mal formato, activity chiusa")
            finish()
            return
        }

        if (!isolationAvailable()) {
            setContentView(unsupportedView())
            return
        }

        // ⛔ Il Profilo va creato/richiesto PRIMA di costruire la WebView che
        // lo userà — `ProfileStore` è il registro, `WebViewCompat.setProfile`
        // lega QUESTA istanza a quel registro. Ordine verificato via javap:
        // sono due chiamate distinte, non una singola API.
        ProfileStore.getInstance().getOrCreateProfile(ARTIFACT_PROFILE_NAME)

        val webView = WebView(this)
        this.webView = webView
        WebViewCompat.setProfile(webView, ARTIFACT_PROFILE_NAME)

        configureSettings(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(WebViewAssetLoader.DEFAULT_DOMAIN)
            // ⛔ Mai HTTP: la CSP che protegge l'artefatto viaggia in
            // un'intestazione di UNA risposta HTTPS vera — non c'è nessun
            // motivo di accettare anche http qui.
            .setHttpAllowed(false)
            .addPathHandler(ARTIFACT_PATH_PREFIX, TalosArtifactPathHandler(applicationContext, artifactId))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            /**
             * ⛔ Ogni navigazione che il DOCUMENTO stesso avvia — un click su
             * un link, un redirect JS — viene bloccata, mai passata a
             * `ACTION_VIEW`. L'unico URL che questa WebView carica è quello
             * scritto qui sotto, in `onCreate`, non uno scelto dal contenuto.
             */
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean = true
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback,
            ) {
                callback.invoke(origin, false, false)
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }

            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message,
            ): Boolean = false

            /**
             * ⛔ Solo diagnostica: una violazione della CSP (`connect-src`
             * bloccato, per esempio) arriva qui come messaggio di console,
             * non come eccezione JS — senza questo override non si vedrebbe
             * MAI, né in logcat né altrove, che la difesa ha davvero agito.
             */
            override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                Log.d(TAG, "artifact console: ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }
        }

        setContentView(webView)
        webView.loadUrl(
            "https://${WebViewAssetLoader.DEFAULT_DOMAIN}$ARTIFACT_PATH_PREFIX$artifactId"
        )
    }

    /**
     * ⛔ Le TRE cose che rendono questa WebView diversa da quella di
     * `MainActivity`, in un posto solo:
     * 1. Nessuna chiamata a `addJavascriptInterface` — mai, per nessun
     *    motivo — è la difesa decisiva (vedi il commento in testa al file).
     * 2. JavaScript acceso (serve alla funzione) ma storage/geolocalizzazione
     *    e accesso a file/content spenti: un documento presentazionale non
     *    ha bisogno di persistere niente sul dispositivo.
     * 3. `mixedContentMode` resta quello di default (bloccato): la CSP
     *    (`connect-src 'none'`) rende il punto discutibile, ma due difese
     *    indipendenti sono meglio di una sola.
     */
    private fun configureSettings(webView: WebView) {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = false
        // ⛔ `databaseEnabled` (WebSQL) non si imposta più: deprecata a
        // livello di piattaforma, WebView moderna non la implementa più —
        // impostarla sarebbe scrivere un difesa contro qualcosa che non
        // esiste già, non una difesa vera.
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setGeolocationEnabled(false)
        settings.setSupportMultipleWindows(false)
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.mediaPlaybackRequiresUserGesture = true
    }

    private fun isolationAvailable(): Boolean =
        WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
            && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROCESS)
            && WebViewCompat.isMultiProcessEnabled()

    /**
     * ⛔ Non è un file di layout XML: un pulsante "riprova" o un testo
     * elaborato costerebbe una vista dedicata per un caso che il piano
     * stesso qualifica come raro (Android moderno, `minSdk 26`, ha quasi
     * sempre `MULTI_PROCESS`). Una `TextView` centrata basta, e non finge
     * di essere più di quello che è: un rifiuto onesto, non un errore muto.
     */
    private fun unsupportedView(): TextView = TextView(this).apply {
        text = getString(R.string.talos_artifact_unsupported)
        gravity = android.view.Gravity.CENTER
        setPadding(48, 48, 48, 48)
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
    }

    override fun onDestroy() {
        webView?.let { view ->
            (view.parent as? ViewGroup)?.removeView(view)
            view.stopLoading()
            view.destroy()
        }
        webView = null
        super.onDestroy()
    }

    companion object {
        private const val TAG = "TalosArtifact"
        const val EXTRA_ARTIFACT_ID = "talos_artifact_id"
        private const val ARTIFACT_PROFILE_NAME = "talos-artifacts-v1"
        private const val ARTIFACT_PATH_PREFIX = "/talos-artifact/"
    }
}
