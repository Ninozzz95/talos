package ai.talos.remoto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ D-0147-NAV-1, lato nativo (27/10/2026): `JSObject.put(chiave, null)` di org.json TOGLIE la chiave. Un PC accoppiato da un QR senza
 * `relay=` (modo n0) arrivava all'app senza `relay`, e la sezione Computer si svuotava (curato anche nell'app, `computerDalNativo`).
 * Il nativo dice la verità: un valore che manca è `null`, non una chiave assente. Lo stesso per il percorso del canale.
 */
class TalosRemotoPerJsTest {
    @Test
    fun `REM-JS-01 un PC senza nome ne relay tiene le due chiavi a null`() {
        val js = computerPerJs(pcId = "abc", nome = null, relay = null, accoppiatoAlle = 7L)
        assertTrue(js.has("nome") && js.isNull("nome"))
        assertTrue(js.has("relay") && js.isNull("relay"))
        assertEquals("abc", js.getString("pcId"))
        assertEquals(7L, js.getLong("accoppiatoAlle"))
        val pieno = computerPerJs(pcId = "abc", nome = "UFFICIO", relay = "https://relay.casa/", accoppiatoAlle = 7L)
        assertEquals("UFFICIO", pieno.getString("nome"))
        assertEquals("https://relay.casa/", pieno.getString("relay"))
    }

    @Test
    fun `REM-JS-02 un percorso che non si sa tiene tipo e rttMs a null`() {
        val ignoto = percorsoPerJs(null)
        assertTrue(ignoto.has("tipo") && ignoto.isNull("tipo"))
        assertTrue(ignoto.has("rttMs") && ignoto.isNull("rttMs"))
        val senzaRtt = percorsoPerJs("relay" to null)
        assertEquals("relay", senzaRtt.getString("tipo"))
        assertTrue(senzaRtt.has("rttMs") && senzaRtt.isNull("rttMs"))
        assertEquals(42L, percorsoPerJs("diretto" to 42L).getLong("rttMs"))
    }
}
