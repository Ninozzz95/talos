package ai.talos.aggiornamenti

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Quale versione è più nuova. Lezione della CVE-2026-95625 (Tauri, 23/09/2026): una versione firmata ma VECCHIA non deve passare
 * per un aggiornamento. Android rifiuta già un `versionCode` minore; questo controllo dice «aggiornata» prima di scaricare 193 MB.
 */
class TalosVersioneAggiornamentoTest {

    @Test
    fun `AGG-VER-01 numeri confrontati come numeri, non come testo`() {
        assertTrue(TalosVersioneAggiornamento.piuNuova("0.1.44", "0.1.43"))
        assertTrue(TalosVersioneAggiornamento.piuNuova("0.1.100", "0.1.99"))
        assertTrue(TalosVersioneAggiornamento.piuNuova("1.0.0", "0.99.99"))
    }

    @Test
    fun `AGG-VER-02 uguale o piu' vecchia non e' un aggiornamento`() {
        assertFalse(TalosVersioneAggiornamento.piuNuova("0.1.43", "0.1.43"))
        assertFalse(TalosVersioneAggiornamento.piuNuova("0.1.42", "0.1.43"))
    }

    @Test
    fun `AGG-VER-03 il suffisso -dev della copia affiancata non conta`() {
        assertTrue(TalosVersioneAggiornamento.piuNuova("0.1.44", "0.1.43-dev"))
        assertFalse(TalosVersioneAggiornamento.piuNuova("0.1.43", "0.1.43-dev"))
    }

    @Test
    fun `AGG-VER-04 una versione illeggibile non e' mai piu' nuova, e la build senza tag 0_0_0 lo e' sempre meno`() {
        assertFalse(TalosVersioneAggiornamento.piuNuova("boh", "0.1.43"))
        assertFalse(TalosVersioneAggiornamento.piuNuova("0.1.44", "boh"))
        assertTrue(TalosVersioneAggiornamento.piuNuova("0.1.44", "0.0.0-dev"))
    }

    @Test
    fun `AGG-VER-05 dal tag alla versione`() {
        assertEquals("0.1.44", TalosVersioneAggiornamento.dalTag("v0.1.44"))
        assertNull(TalosVersioneAggiornamento.dalTag("desktop-v0.1.44"))
        assertNull(TalosVersioneAggiornamento.dalTag("v0.1.44-rc1"))
        assertNull(TalosVersioneAggiornamento.dalTag("0.1.44"))
    }
}
