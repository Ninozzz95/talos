package ai.talos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * N15-ACC-07 (lato nativo) — MISURATO sul Pad il 13/10/2026: con 180 s fissi l'ascolto si chiudeva durante l'accesso col
 * piano ChatGPT e OpenAI rimandava il browser a «Connessione negata». Chi apre può chiedere il suo tempo; senza richiesta
 * resta quello corto di sempre (OpenRouter non cambia), e c'è un tetto: una porta non resta aperta senza limite.
 */
class TalosOAuthLoopbackTempoTest {
    @Test
    fun senzaRichiestaValeIlTempoCortoDiSempre() {
        assertEquals(180_000, TalosOAuthLoopbackPlugin.listenTimeoutMs(null))
    }

    @Test
    fun ilTempoChiestoVale_dentroIlPavimentoEIlTetto() {
        assertEquals(600_000, TalosOAuthLoopbackPlugin.listenTimeoutMs(600_000))
        assertEquals(30_000, TalosOAuthLoopbackPlugin.listenTimeoutMs(5))
        assertEquals(30_000, TalosOAuthLoopbackPlugin.listenTimeoutMs(-1))
        assertEquals(900_000, TalosOAuthLoopbackPlugin.listenTimeoutMs(Int.MAX_VALUE))
    }

    /**
     * LOOPBACK-PAGINA-01 — VISTA sul Pad il 13/10/2026: bianca dentro un'app scura, e «Fatto» prima di ogni verifica.
     * Segue il tema del telefono, parla nelle due lingue, non promette un esito e non porta script.
     */
    @Test
    fun laPaginaDiRitornoSegueIlTemaEDiceLaCosaVera() {
        val pagina = TalosOAuthLoopbackPlugin.closingPageHtml()
        assertTrue(pagina.contains("color-scheme"))
        assertTrue(pagina.contains("prefers-color-scheme:light"))
        assertTrue(pagina.contains("Torna a TALOS per completare"))
        assertTrue(pagina.contains("Return to TALOS to finish signing in"))
        assertFalse(pagina.contains("Fatto"))
        assertFalse(pagina.contains("<script"))
        assertFalse(pagina.contains("http"))
    }
}
