package ai.talos.terminal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * ⛔⛔ 70-A (30/09/2026, contratto desktop 70) — il segreto del server del Codice lo crea il server (owner, 30/09 sera)
 * in `state/server-token`; l'app lo legge col ponte adb (`cat`). Queste prove fissano cosa si accetta da quella lettura:
 * solo 64 caratteri esadecimali minuscoli (`server-secret.mjs`, `segretoValido`), con al più gli spazi finali che la
 * shell può aggiungere. Tutto il resto (file assente, messaggio d'errore di `cat`, testo troncato) è «nessun segreto».
 */
class TalosSegretoServerTest {
    private val buono = "0123456789abcdef".repeat(4)

    @Test
    fun `SEC70-KT-01 accetta 64 esadecimali minuscoli`() {
        assertEquals(buono, TalosSegretoServer.valido(buono))
    }

    @Test
    fun `SEC70-KT-02 toglie gli spazi e l'a capo finali della shell`() {
        assertEquals(buono, TalosSegretoServer.valido("$buono\n"))
        assertEquals(buono, TalosSegretoServer.valido("$buono\r\n"))
    }

    @Test
    fun `SEC70-KT-03 rifiuta file assente, testo troncato, maiuscole e caratteri estranei`() {
        assertNull(TalosSegretoServer.valido(""))
        assertNull(TalosSegretoServer.valido("cat: /data/local/tmp/talos/state/server-token: No such file or directory"))
        assertNull(TalosSegretoServer.valido(buono.dropLast(1)))
        assertNull(TalosSegretoServer.valido(buono.uppercase()))
        assertNull(TalosSegretoServer.valido("g".repeat(64)))
        assertNull(TalosSegretoServer.valido(" $buono"))
        assertNull(TalosSegretoServer.valido("$buono$buono"))
    }
}
