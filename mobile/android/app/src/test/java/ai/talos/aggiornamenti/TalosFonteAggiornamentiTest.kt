package ai.talos.aggiornamenti

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Da dove si legge l'aggiornamento. In produzione GitHub, fisso. La fonte di PROVA esiste solo per la prova dal vivo sul Pad: la
 * accetta soltanto una copia affiancata (`ai.talos.dev`), e solo verso `http://127.0.0.1:<porta>` (dal PC con `adb reverse`), come
 * il desktop (`fonte-aggiornamenti.mjs:22-54`): un file di prova malformato FERMA l'aggiornatore, non lo rimanda a GitHub.
 */
class TalosFonteAggiornamentiTest {

    private val pem = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA" + "A".repeat(43) + "=\n-----END PUBLIC KEY-----"

    private fun prova(base: String) = """{"base":"$base","pubblica":${org.json.JSONObject.quote(pem)}}"""

    @Test
    fun `AGG-FON-01 senza file di prova la fonte e' GitHub, con la chiave dell'app`() {
        val fonte = TalosFonteAggiornamenti.scegli(copiaAffiancata = true, fileDiProva = null, pubblicaDellApp = "APP")
        assertEquals("https://api.github.com/repos/Ninozzz95/talos/releases?per_page=30", fonte?.elenco)
        assertEquals("https://github.com/Ninozzz95/talos/releases/download/v0.1.44/latest-android.yml",
            fonte?.file("v0.1.44", "latest-android.yml"))
        assertEquals("APP", fonte?.pubblica)
    }

    @Test
    fun `AGG-FON-02 la copia affiancata con un file di prova valido legge da 127_0_0_1`() {
        val fonte = TalosFonteAggiornamenti.scegli(true, prova("http://127.0.0.1:4391"), "APP")
        assertEquals("http://127.0.0.1:4391/releases", fonte?.elenco)
        assertEquals("http://127.0.0.1:4391/download/v0.1.44/TALOS-0.1.44.apk", fonte?.file("v0.1.44", "TALOS-0.1.44.apk"))
        assertEquals(pem, fonte?.pubblica)
    }

    @Test
    fun `AGG-FON-03 la app vera ignora il file di prova`() {
        val fonte = TalosFonteAggiornamenti.scegli(false, prova("http://127.0.0.1:4391"), "APP")
        assertEquals("https://api.github.com/repos/Ninozzz95/talos/releases?per_page=30", fonte?.elenco)
        assertEquals("APP", fonte?.pubblica)
    }

    @Test
    fun `AGG-FON-04 un file di prova malformato o verso un altro indirizzo ferma l'aggiornatore`() {
        assertNull(TalosFonteAggiornamenti.scegli(true, prova("http://192.168.1.5:4391"), "APP"))
        assertNull(TalosFonteAggiornamenti.scegli(true, prova("https://127.0.0.1:4391"), "APP"))
        assertNull(TalosFonteAggiornamenti.scegli(true, prova("http://127.0.0.1"), "APP"))
        assertNull(TalosFonteAggiornamenti.scegli(true, prova("http://127.0.0.1:4391/x"), "APP"))
        assertNull(TalosFonteAggiornamenti.scegli(true, "non json", "APP"))
        assertNull(TalosFonteAggiornamenti.scegli(true, """{"base":"http://127.0.0.1:4391"}""", "APP"))
    }
}
