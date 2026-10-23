package ai.talos.remoto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M2 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): la custodia di ciò che il
 * telefono ricorda di ogni computer accoppiato. La chiave segreta del telefono (una per PC, contratto §B.4: «una chiave per
 * processo», e il PC riconosce il telefono dal suo EndpointId) e il gettone del relay stanno sigillati AES-256-GCM con una chiave
 * dell'archivio sicuro di Android, come `TalosChiaveDatiR4`. Qui le parti pure; il sigillo vero si prova sul Pad.
 */
class TalosRemotoCustodiaTest {
    private val chiave = ByteArray(32) { it.toByte() }

    @Test
    fun `CUST-01 un file per computer, dal suo id, senza l'id in chiaro nel nome`() {
        val nome = TalosRemotoCustodia.nomeFile("pc-uno")
        assertEquals(nome, TalosRemotoCustodia.nomeFile("pc-uno"))
        assertNotEquals(nome, TalosRemotoCustodia.nomeFile("pc-due"))
        assertTrue(nome, Regex("^[0-9a-f]{32}\\.pc$").matches(nome))
    }

    @Test
    fun `CUST-02 il ricordo di un computer torna intero dal JSON, chiave compresa`() {
        val pc = TalosRemotoCustodia.ComputerAccoppiato("pc-uno", "Studio", "https://relay.example/", "segreto", chiave, 1_760_000_000_000)
        val letto = TalosRemotoCustodia.daJson(TalosRemotoCustodia.inJson(pc))!!
        assertEquals("pc-uno", letto.pcId)
        assertEquals("Studio", letto.nome)
        assertEquals("https://relay.example/", letto.relay)
        assertEquals("segreto", letto.gettoneRelay)
        assertArrayEquals(chiave, letto.chiaveTelefono)
        assertEquals(1_760_000_000_000, letto.accoppiatoAlle)
        val senzaRelay = TalosRemotoCustodia.ComputerAccoppiato("pc-due", null, null, null, chiave, 1)
        val due = TalosRemotoCustodia.daJson(TalosRemotoCustodia.inJson(senzaRelay))!!
        assertNull(due.nome); assertNull(due.relay); assertNull(due.gettoneRelay)
    }

    /**
     * R-M5 (21/10/2026): la sveglia si registra con la VAPID pubblica del PC (`pair.ok` `pc.vapid`), base64url di 87 caratteri =
     * 65 byte che iniziano con 0x04 (kdoc del connettore: altrimenti `VapidNotValidException`). Si ricorda col PC; i ricordi di prima
     * (senza) restano validi, e una VAPID storta non si ricorda.
     */
    @Test
    fun `CUST-06 la VAPID del PC si ricorda col PC - i ricordi di prima restano validi - una VAPID storta no`() {
        val punto = ByteArray(65).also { it[0] = 0x04; for (i in 1 until 65) it[i] = i.toByte() }
        val vapid = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(punto)
        assertEquals(87, vapid.length)
        val pc = TalosRemotoCustodia.ComputerAccoppiato("pc-uno", "Studio", null, null, chiave, 1, vapid)
        assertEquals(vapid, TalosRemotoCustodia.daJson(TalosRemotoCustodia.inJson(pc))!!.vapid)
        val vecchio = TalosRemotoCustodia.inJson(TalosRemotoCustodia.ComputerAccoppiato("pc", null, null, null, chiave, 1))
            .replace(",\"vapid\":null", "")
        assertNull(TalosRemotoCustodia.daJson(vecchio)!!.vapid)
        val corta = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(punto.copyOf(33))
        val senza04 = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(punto.copyOf().also { it[0] = 0x02 })
        for (storta in listOf(corta, senza04, "non base64!", "")) {
            assertNull(storta, TalosRemotoCustodia.vapidValida(storta))
        }
        assertEquals(vapid, TalosRemotoCustodia.vapidValida(vapid))
    }

    @Test
    fun `CUST-03 un ricordo storto non diventa un computer a metà`() {
        val buono = TalosRemotoCustodia.inJson(TalosRemotoCustodia.ComputerAccoppiato("pc", null, null, null, chiave, 1))
        assertNull(TalosRemotoCustodia.daJson(buono.replace("\"pcId\":\"pc\"", "\"pcId\":\"\"")))
        val corta = TalosRemotoCustodia.inJson(TalosRemotoCustodia.ComputerAccoppiato("pc", null, null, null, ByteArray(31), 1))
        assertNull(TalosRemotoCustodia.daJson(corta))
        assertNull(TalosRemotoCustodia.daJson("non json"))
    }

    @Test
    fun `CUST-04 il relay - il gettone si stacca dall'indirizzo, http solo verso la propria macchina, come il PC`() {
        assertEquals("https://relay.example/" to "abc", TalosRemotoCustodia.relayDiviso("https://relay.example/?token=abc"))
        assertEquals("https://relay.example/" to null, TalosRemotoCustodia.relayDiviso("https://relay.example/"))
        assertEquals("http://127.0.0.1:3340/" to null, TalosRemotoCustodia.relayDiviso("http://127.0.0.1:3340/"))
        assertNull(TalosRemotoCustodia.relayDiviso("http://relay.example/"))
        assertNull(TalosRemotoCustodia.relayDiviso("ftp://relay.example/"))
        assertNull(TalosRemotoCustodia.relayDiviso("non un indirizzo"))
    }

    @Test
    fun `CUST-05 il sigillo - magia, nonce, cifrato - ogni altra forma si rifiuta`() {
        val nonce = ByteArray(12) { 7 }
        val cifrato = ByteArray(40) { 9 }
        val (n, c) = TalosRemotoCustodia.apriSigillo(TalosRemotoCustodia.sigilla(nonce, cifrato))!!
        assertArrayEquals(nonce, n)
        assertArrayEquals(cifrato, c)
        val sigillo = TalosRemotoCustodia.sigilla(nonce, cifrato)
        sigillo[0] = 'X'.code.toByte()
        assertNull(TalosRemotoCustodia.apriSigillo(sigillo))
        // la magia giusta non basta: un cifrato più corto del tag non è un sigillo
        assertNull(TalosRemotoCustodia.apriSigillo(TalosRemotoCustodia.sigilla(nonce, ByteArray(15))))
    }
}
