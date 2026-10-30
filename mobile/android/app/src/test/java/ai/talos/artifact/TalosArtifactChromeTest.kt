package ai.talos.artifact

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * TESTATA-01..05 (UI-108, owner 28/10: «non c'è un header, una testata»; mockup https://claude.ai/artifact/S3mAxFoTAkEAAjPdAJhyg6, scelte
 * dell'owner del 29/10: sfondo del visual BIANCO come oggi, filo da 1 px sotto la testata). La parte pura della testata nativa del
 * visual: colori validati, icone di sistema chiare o scure, titolo ripulito.
 */
class TalosArtifactChromeTest {

    @Test
    fun `TESTATA-01 solo esadecimali a sei cifre sono colori validi`() {
        assertTrue(TalosArtifactChrome.coloreValido("#1b1c20"))
        assertTrue(TalosArtifactChrome.coloreValido("#F3F4F5"))
        for (c in listOf(null, "", "1b1c20", "#1b1c2", "#1b1c2000", "red", "#gggggg", "rgba(0,0,0,0)")) {
            assertFalse(c.toString(), TalosArtifactChrome.coloreValido(c))
        }
    }

    @Test
    fun `TESTATA-02 i colori del tema passano, quelli storti diventano i colori di serie, mai trasparenti`() {
        val scuro = TalosArtifactChrome.colori("dark", mapOf("header" to "#1b1c20", "text" to "nonsense"))
        assertEquals(0xFF1B1C20.toInt(), scuro.header)
        assertEquals(TalosArtifactChrome.CALM_SCURO.text, scuro.text)
        val chiaro = TalosArtifactChrome.colori("light", emptyMap())
        assertEquals(TalosArtifactChrome.CALM_CHIARO, chiaro)
        assertEquals(0xFF, chiaro.background ushr 24)
    }

    @Test
    fun `TESTATA-06 mai colori mescolati - testata storta e testo valido danno la tavolozza di serie, e il titolo si legge sempre`() {
        // il difetto fotografato sul Pad il 29/10: testata di serie scura + testo del tema chiaro ⇒ titolo invisibile
        val misto = TalosArtifactChrome.colori("dark", mapOf("header" to "color-mix(in srgb, #fff 90%, #000)", "text" to "#111827"))
        assertEquals(TalosArtifactChrome.CALM_SCURO, misto)
        // lo schema lo decide la testata vera, non l'etichetta: una testata chiara col nome «dark» resta chiara e col testo scuro
        val chiara = TalosArtifactChrome.colori("dark", mapOf("header" to "#f3f4f5", "text" to "#111827"))
        assertEquals(0xFFF3F4F5.toInt(), chiara.header)
        assertEquals(0xFF111827.toInt(), chiara.text)
        // testo e testata troppo simili (sotto 4,5:1) ⇒ la tavolozza di serie che va con quella testata
        val illeggibile = TalosArtifactChrome.colori("light", mapOf("header" to "#1b1c20", "text" to "#2c2f36"))
        assertEquals(TalosArtifactChrome.CALM_SCURO, illeggibile)
        for (c in listOf(misto, chiara, illeggibile)) {
            assertTrue(TalosArtifactChrome.contrasto(c.text, c.header) >= 4.5)
        }
    }

    @Test
    fun `TESTATA-03 le icone di sistema sono scure solo su una testata chiara`() {
        assertTrue(TalosArtifactChrome.iconeScure(TalosArtifactChrome.CALM_CHIARO.header))
        assertFalse(TalosArtifactChrome.iconeScure(TalosArtifactChrome.CALM_SCURO.header))
    }

    @Test
    fun `TESTATA-04 il titolo perde controlli, bidi e larghezza zero, e gli spazi si stringono`() {
        assertEquals("Mutuo e rate", TalosArtifactChrome.titoloPulito("  Mutuo‮ e​\n\trate\u0007 ﻿"))
        assertEquals("", TalosArtifactChrome.titoloPulito(null))
        assertEquals("", TalosArtifactChrome.titoloPulito("​⁦⁩"))
    }

    @Test
    fun `TESTATA-05 un titolo lunghissimo si tronca con l ellissi`() {
        val lungo = "a".repeat(300)
        val pulito = TalosArtifactChrome.titoloPulito(lungo)
        assertEquals(TalosArtifactChrome.TITOLO_MASSIMO, pulito.length)
        assertTrue(pulito.endsWith("…"))
    }
}
