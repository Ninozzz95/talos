package ai.talos.agent.ponte

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * ACCOPPIATO-K-01..03 (ASS-149, 29/10). Il motivo che la notifica d'accoppiamento mostra dipende da DOVE si è fermato il giro: un codice
 * rifiutato è colpa del codice, un collegamento mancato dopo un accoppiamento riuscito no (misurato sul Pad: adbd non annuncia la porta).
 */
class TalosAccoppiamentoEsitoRegolaTest {

    @Test
    fun `ACCOPPIATO-K-01 collegato vuol dire nessun motivo`() {
        assertNull(TalosAccoppiamentoEsitoRegola.motivo(accoppiato = true, collegato = true, motivo = "connect-refused"))
    }

    @Test
    fun `ACCOPPIATO-K-02 accoppiato ma non collegato non incolpa il codice, salvo la rete locale tolta`() {
        assertEquals("paired-not-connected", TalosAccoppiamentoEsitoRegola.motivo(accoppiato = true, collegato = false, motivo = "connect-refused"))
        assertEquals("paired-not-connected", TalosAccoppiamentoEsitoRegola.motivo(accoppiato = true, collegato = false, motivo = null))
        assertEquals("local-network-blocked", TalosAccoppiamentoEsitoRegola.motivo(accoppiato = true, collegato = false, motivo = "local-network-blocked"))
    }

    @Test
    fun `ACCOPPIATO-K-03 non accoppiato tiene il motivo di prima`() {
        assertEquals("bad-code", TalosAccoppiamentoEsitoRegola.motivo(accoppiato = false, collegato = false, motivo = "bad-code"))
        assertEquals("pair-refused", TalosAccoppiamentoEsitoRegola.motivo(accoppiato = false, collegato = false, motivo = null))
        assertEquals(TalosAccoppiamentoEsitoRegola.ACCOPPIATO_NON_COLLEGATO, "paired-not-connected")
    }
}
