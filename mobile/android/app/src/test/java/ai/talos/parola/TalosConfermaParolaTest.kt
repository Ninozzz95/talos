package ai.talos.parola

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A0-4 (ledger `LEDGER-A0-ASSISTENTE-2026-10-21.md`): «hey TALOS» scattava su UN punteggio sopra soglia. Hermes conferma su più
 * fotogrammi (`wake-word.md:172-202`, `confirmation_frames` 3) e Home Assistant fa la media su una finestra (`WakeWordListener.kt`):
 * un picco isolato — una parola simile, un rumore — non apre la barra.
 */
class TalosConfermaParolaTest {

    @Test
    fun `A0-4-1 un picco isolato sopra soglia non scatta`() {
        val c = TalosConfermaParola(fotogrammi = 3, soglia = 0.5f)
        assertFalse(c.ascolta(0.9f))
        assertFalse(c.ascolta(0.1f))
        assertFalse(c.ascolta(0.2f))
    }

    @Test
    fun `A0-4-2 tre fotogrammi di fila sopra soglia scattano, al terzo`() {
        val c = TalosConfermaParola(fotogrammi = 3, soglia = 0.5f)
        assertFalse(c.ascolta(0.6f))
        assertFalse(c.ascolta(0.7f))
        assertTrue(c.ascolta(0.55f))
    }

    @Test
    fun `A0-4-3 un buco in mezzo azzera la serie`() {
        val c = TalosConfermaParola(fotogrammi = 3, soglia = 0.5f)
        c.ascolta(0.8f)
        c.ascolta(0.8f)
        assertFalse(c.ascolta(0.3f))
        assertFalse(c.ascolta(0.8f))
        assertFalse(c.ascolta(0.8f))
        assertTrue(c.ascolta(0.8f))
    }

    @Test
    fun `A0-4-4 dopo lo scatto si riparte da zero`() {
        val c = TalosConfermaParola(fotogrammi = 3, soglia = 0.5f)
        repeat(2) { c.ascolta(0.9f) }
        assertTrue(c.ascolta(0.9f))
        assertFalse(c.ascolta(0.9f))
        assertFalse(c.ascolta(0.9f))
        assertTrue(c.ascolta(0.9f))
    }

    @Test
    fun `A0-4-5 la soglia e inclusa e i fotogrammi di serie sono tre`() {
        val c = TalosConfermaParola(soglia = 0.5f)
        assertEquals(3, c.fotogrammi)
        assertFalse(c.ascolta(0.5f))
        assertFalse(c.ascolta(0.5f))
        assertTrue(c.ascolta(0.5f))
    }

    @Test
    fun `A0-4-6 il servizio scatta solo sulla conferma e la azzera quando cede il microfono`() {
        val servizio = java.io.File("src/main/java/ai/talos/parola/TalosParola.kt").readText()
        assertTrue(servizio.contains("if (conferma.ascolta(punteggio)) {"))
        assertFalse(servizio.contains("if (punteggio >= SOGLIA)"))
        // una serie a metà prima di cedere il microfono non deve finire, al ritorno, con un fotogramma solo
        val ceduto = servizio.substringAfter("if (!eraCeduto) {").substringBefore("eraCeduto = true")
        assertTrue(ceduto.contains("conferma.azzera()"))
    }
}
