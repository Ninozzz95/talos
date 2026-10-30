package ai.talos.aggiornamenti

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ B1/B2 (revisione 27/10/2026, stessa famiglia di D-0147-NAV-1): `JSObject.put(chiave, null)` di org.json TOGLIE la chiave, e
 * l'app copia un campo dello stato solo se la chiave c'è (`appUpdates.ts`, `chiave in arrivato`). Dopo «visto()» `appenaAggiornata`
 * spariva invece di arrivare `null`, e il segnale «aggiornata» restava acceso fino al riavvio. Lo stato si manda sempre INTERO: un
 * valore che manca è `null`, non una chiave assente.
 */
class TalosStatoPerJsTest {
    private val vuoti = TalosValoriStato(
        fase = "NESSUNA", installata = "0.1.47", versione = null, note = null, pagina = null, dimensione = null, scaricati = null,
        motivo = null, ultimoControllo = null, appenaAggiornata = null, allUscita = false, permessoConcesso = false,
        automatici = true, soloWifi = true, avvisami = true,
    )

    @Test
    fun `STATO-JS-01 ogni campo vuoto resta nella busta come null`() {
        val js = statoPerJs(vuoti)
        for (chiave in listOf("versione", "note", "pagina", "dimensione", "scaricati", "motivo", "ultimoControllo", "appenaAggiornata")) {
            assertTrue("manca $chiave", js.has(chiave))
            assertTrue("$chiave non è null", js.isNull(chiave))
        }
        assertTrue(js.toString().contains("\"appenaAggiornata\":null"))
    }

    @Test
    fun `STATO-JS-02 i valori pieni passano com'erano`() {
        val js = statoPerJs(vuoti.copy(
            fase = "PRONTA", versione = "0.1.48", note = JSONObject("""{"en":["A"],"it":["B"]}"""), pagina = "https://example.invalid/r",
            dimensione = 123L, scaricati = 45L, motivo = "rete", ultimoControllo = 1000L, appenaAggiornata = "0.1.47",
        ))
        assertEquals("PRONTA", js.getString("fase"))
        assertEquals("0.1.48", js.getString("versione"))
        assertEquals("B", js.getJSONObject("note").getJSONArray("it").getString(0))
        assertEquals(123L, js.getLong("dimensione"))
        assertEquals(45L, js.getLong("scaricati"))
        assertEquals("0.1.47", js.getString("appenaAggiornata"))
        assertEquals(true, js.getBoolean("automatici"))
    }
}
