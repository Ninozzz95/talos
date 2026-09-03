package ai.talos.artifact

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.nio.charset.StandardCharsets
import java.util.UUID

/**
 * ⛔⛔⛔ Owner 2026-08-27 — la METÀ SCRITTURA del Blocco 2. `create` mette
 * l'HTML in `TalosArtifactStore` e torna solo un UUID — mai l'HTML stesso
 * indietro al modello, mai un `Intent` col contenuto. `open` legge quello
 * stesso id e lancia `TalosArtifactActivity`, che è `exported="false"`: solo
 * QUESTO plugin — cioè solo il processo dell'app stessa — può accenderla.
 *
 * ⛔ Nessun bridge Capacitor viene mai passato a `TalosArtifactActivity`: il
 * plugin lancia l'Activity con un `Intent` esplicito e un UUID, non con un
 * riferimento alla WebView o al ponte. Sono due mondi che si toccano in un
 * punto solo — l'id — mai di più.
 */
@CapacitorPlugin(name = "TalosArtifact")
class TalosArtifactPlugin : Plugin() {

    private val store: TalosArtifactStore
        get() = TalosArtifactStore(context)

    @PluginMethod
    fun create(call: PluginCall) {
        val title = call.getString("title")
        val html = call.getString("html")
        if (title.isNullOrBlank() || html == null) {
            call.reject("TALOS_ARTIFACT_INPUT_INVALID", "TALOS_ARTIFACT_INPUT_INVALID")
            return
        }
        val id = UUID.randomUUID().toString()
        try {
            store.write(id, html.toByteArray(StandardCharsets.UTF_8))
        } catch (error: IllegalArgumentException) {
            val message = error.message ?: "TALOS_ARTIFACT_WRITE_FAILED"
            call.reject(message, message)
            return
        }
        val payload = JSObject()
        payload.put("id", id)
        call.resolve(payload)
    }

    /**
     * ⛔ Verifica che l'artefatto esista PRIMA di lanciare l'Activity: un id
     * scaduto/cancellato deve fallire qui, con un motivo leggibile — non
     * aprire una schermata che mostra un vuoto senza spiegare perché
     * (`TalosArtifactPathHandler` risponderebbe 404, ma quello è un
     * dettaglio HTTP interno, non un esito per la persona).
     */
    @PluginMethod
    fun open(call: PluginCall) {
        val id = call.getString("id")
        if (id == null || !store.isValidId(id) || store.read(id) == null) {
            call.reject("TALOS_ARTIFACT_NOT_FOUND", "TALOS_ARTIFACT_NOT_FOUND")
            return
        }
        val intent = Intent(context, TalosArtifactActivity::class.java)
        intent.putExtra(TalosArtifactActivity.EXTRA_ARTIFACT_ID, id)
        activity.startActivity(intent)
        val payload = JSObject()
        payload.put("opened", true)
        call.resolve(payload)
    }

    /**
     * ⛔⛔⛔ Owner 2026-08-27 — «salvare l'artefatto nella Libreria,
     * esportarlo come file HTML». Legge SOLO l'HTML: il titolo non è mai
     * stato scritto qui (`create` lo usa solo per la scheda di consenso,
     * mai persistito) — il lato JS lo ha già, `s.titolo` sulla scheda, e lo
     * passa lui a `attachments.saveGeneratedBinary`. Duplicarlo qui
     * sarebbe una seconda fonte di verità per la stessa parola.
     *
     * ⛔ `artifact_create` impone già un documento autosufficiente (niente
     * risorse esterne, tutto inline) — verificato via ricerca web prima di
     * scrivere questa funzione: un HTML del genere è già perfettamente
     * portabile come file `.html` a sé stante, senza nessun impacchettamento.
     *
     * ⛔ Sola lettura di un file che l'app ha già scritto — nessun nuovo
     * rischio: la persona ha già visto l'artefatto (l'ha aperto o gli è
     * stato mostrato in chat) prima di poter chiedere di salvarlo.
     */
    @PluginMethod
    fun read(call: PluginCall) {
        val id = call.getString("id")
        val html = if (id == null) null else store.read(id)
        if (html == null) {
            call.reject("TALOS_ARTIFACT_NOT_FOUND", "TALOS_ARTIFACT_NOT_FOUND")
            return
        }
        val payload = JSObject()
        payload.put("html", String(html, StandardCharsets.UTF_8))
        call.resolve(payload)
    }
}
