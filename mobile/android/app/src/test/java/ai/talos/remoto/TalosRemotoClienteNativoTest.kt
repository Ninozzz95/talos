package ai.talos.remoto

import ai.talos.remoto.TalosRemotoClienteNativo.Esito
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ R-M5a (21/10/2026): il lavoro della sveglia gira ad app uccisa, senza WebView: parla col PC in nativo. Stesse regole del cliente
 * TS (`clienteRemoto.ts`, r4 `servizio.mjs`): `{v:1, t:'req', n, op, args}` → `{t:'res', n, ok, data | code}`; `{t:'error', code, n?}`
 * con `n` è il rifiuto di QUELLA richiesta, senza è la fine del canale; un codice che non è un identificatore in maiuscole non passa.
 */
class TalosRemotoClienteNativoTest {
    @Test
    fun `CLN-01 la richiesta ha la forma del filo e un numero valido`() {
        val n = TalosRemotoClienteNativo.nuovoNumero()
        assertTrue(n, Regex("^[A-Za-z0-9_-]{8,64}$").matches(n))
        val r = JSONObject(TalosRemotoClienteNativo.richiestaJson(n, "sessions.list", JSONObject()))
        assertEquals(1, r.getInt("v")); assertEquals("req", r.getString("t")); assertEquals(n, r.getString("n"))
        assertEquals("sessions.list", r.getString("op")); assertEquals(0, r.getJSONObject("args").length())
    }

    @Test
    fun `CLN-02 la risposta giusta porta i dati - un rifiuto il suo codice stretto - le altre si ignorano`() {
        val ok = TalosRemotoClienteNativo.interpreta("""{"v":1,"t":"res","n":"abcdefgh","ok":true,"data":{"items":[]}}""", "abcdefgh")
        assertTrue(((ok as Esito.Dati).data as JSONObject).has("items"))
        assertEquals(Esito.Rifiuto("NOT_FOUND"), TalosRemotoClienteNativo.interpreta("""{"v":1,"t":"res","n":"abcdefgh","ok":false,"code":"NOT_FOUND"}""", "abcdefgh"))
        assertEquals(Esito.Rifiuto("OPERATION_FAILED"), TalosRemotoClienteNativo.interpreta("""{"v":1,"t":"res","n":"abcdefgh","ok":false,"code":"__proto__"}""", "abcdefgh"))
        assertNull(TalosRemotoClienteNativo.interpreta("""{"v":1,"t":"res","n":"altro123","ok":true,"data":1}""", "abcdefgh"))
        assertNull(TalosRemotoClienteNativo.interpreta("""{"v":2,"t":"res","n":"abcdefgh","ok":true}""", "abcdefgh"))
        assertNull(TalosRemotoClienteNativo.interpreta("""{"v":1,"t":"evt","sub":"x","data":{}}""", "abcdefgh"))
        assertNull(TalosRemotoClienteNativo.interpreta("non json", "abcdefgh"))
    }

    @Test
    fun `CLN-03 un errore col numero rifiuta la richiesta - senza numero chiude il canale`() {
        assertEquals(Esito.Rifiuto("RATE_LIMITED"), TalosRemotoClienteNativo.interpreta("""{"v":1,"t":"error","code":"RATE_LIMITED","n":"abcdefgh"}""", "abcdefgh"))
        assertEquals(Esito.Canale("REVOKED"), TalosRemotoClienteNativo.interpreta("""{"v":1,"t":"error","code":"REVOKED"}""", "abcdefgh"))
        assertEquals(Esito.Canale("BAD_MESSAGE"), TalosRemotoClienteNativo.interpreta("""{"v":1,"t":"error","code":"rotto"}""", "abcdefgh"))
    }
}
