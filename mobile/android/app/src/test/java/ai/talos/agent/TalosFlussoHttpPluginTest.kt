package ai.talos.agent

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * N15 (13/10/2026) — il flusso nativo scavalca il CORS portando un token: ciò che si prova qui è che sia chiuso per
 * difetto. La lettura del flusso vero si prova sul Pad, contro il servizio vero.
 */
class TalosFlussoHttpPluginTest {
    @Test
    fun soloHttpsVersoUnHostAmmessoScrittoPerIntero() {
        assertTrue(TalosFlussoHttpPlugin.ammesso("https://api.openai.com/v1/responses"))
        assertTrue(TalosFlussoHttpPlugin.ammesso("https://API.OPENAI.COM:443/v1/responses"))

        // niente testo in chiaro
        assertFalse(TalosFlussoHttpPlugin.ammesso("http://api.openai.com/v1/responses"))
        // nessun altro host, nemmeno uno che gli somiglia
        assertFalse(TalosFlussoHttpPlugin.ammesso("https://api.openai.com.evil.example/v1/responses"))
        assertFalse(TalosFlussoHttpPlugin.ammesso("https://evil.example/api.openai.com"))
        assertFalse(TalosFlussoHttpPlugin.ammesso("https://sub.api.openai.com/v1/responses"))
        assertFalse(TalosFlussoHttpPlugin.ammesso("https://chatgpt.com/backend-api/codex/responses"))
        // niente credenziali nell'indirizzo (il trucco «host@altro-host»), niente porte strane, niente rete di casa
        assertFalse(TalosFlussoHttpPlugin.ammesso("https://api.openai.com@evil.example/v1/responses"))
        assertFalse(TalosFlussoHttpPlugin.ammesso("https://api.openai.com:8443/v1/responses"))
        assertFalse(TalosFlussoHttpPlugin.ammesso("https://127.0.0.1/v1/responses"))
        assertFalse(TalosFlussoHttpPlugin.ammesso("non è un indirizzo"))
        assertFalse(TalosFlussoHttpPlugin.ammesso(""))
    }

    /** Prova di struttura sul sorgente: i redirect non si seguono, il plugin è registrato, e niente del traffico va nel registro. */
    @Test
    fun nienteRedirectNienteRegistroEPluginRegistrato() {
        fun leggi(vararg percorsi: String) = percorsi.map { File(it) }.first { it.isFile }.readText()
        val sorgente = leggi(
            "src/main/java/ai/talos/agent/TalosFlussoHttpPlugin.kt",
            "app/src/main/java/ai/talos/agent/TalosFlussoHttpPlugin.kt",
        )
        assertTrue(sorgente.contains(".followRedirects(false)"))
        assertTrue(sorgente.contains(".followSslRedirects(false)"))
        assertFalse(sorgente.contains("Log."))
        val apri = sorgente.substringAfter("fun apri(call: PluginCall)").substringBefore("@PluginMethod")
        assertTrue(apri.indexOf("if (!ammesso(url))") in 0 until apri.indexOf("newCall"))
        val attivita = leggi("src/main/java/ai/talos/MainActivity.java", "app/src/main/java/ai/talos/MainActivity.java")
        assertTrue(attivita.contains("registerPlugin(ai.talos.agent.TalosFlussoHttpPlugin.class);"))
    }
}
