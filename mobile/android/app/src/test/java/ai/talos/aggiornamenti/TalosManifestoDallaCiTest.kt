package ai.talos.aggiornamenti

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * L'altro capo di `scripts/aggiornamento/manifesto-android.test.mjs` (AGG-CI-04): il campione in `test/resources/aggiornamenti/`
 * è scritto dallo script della CI con una chiave di prova; qui lo leggono il lettore e il verificatore VERI dell'app. Se lo script
 * cambia forma, uno dei due test diventa rosso.
 */
class TalosManifestoDallaCiTest {

    private fun risorsa(nome: String) = javaClass.getResource("/aggiornamenti/$nome")!!.readBytes()

    @Test
    fun `AGG-CI-05 il manifesto scritto e firmato dalla CI si verifica e si legge nell'app`() {
        val manifesto = risorsa("latest-android.yml")
        val firma = String(risorsa("latest-android.yml.sig"), Charsets.US_ASCII)
        val pubblica = String(risorsa("pubblica-di-prova.pem"), Charsets.US_ASCII)
        assertTrue(TalosFirmaAggiornamento.verifica(manifesto, firma, pubblica))
        val letto = TalosLettoreManifesto.leggi(manifesto)
        assertEquals("0.1.44", letto.version)
        assertEquals("TALOS-0.1.44.apk", letto.path)
        assertEquals(40L, letto.size)
    }
}
