package ai.talos.agent

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ Stessa famiglia di B1-B3 (27/10/2026, Desktop): `JSObject.put(chiave, null)` di org.json TOGLIE la chiave. Senza una voce scelta o
 * con il motore che non risponde, `current` e `engine` sparivano dalla risposta di `voices()` invece di arrivare `null`.
 */
class TalosVociPerJsTest {
    @Test
    fun `VOCI-JS-01 voce e motore che non si sanno restano nella busta come null`() {
        val js = vociPerJs(JSONArray(), current = null, engine = null)
        assertTrue(js.getBoolean("available"))
        assertEquals(0, js.getJSONArray("voices").length())
        assertTrue(js.has("current") && js.isNull("current"))
        assertTrue(js.has("engine") && js.isNull("engine"))
    }

    @Test
    fun `VOCI-JS-02 voce e motore noti passano com'erano`() {
        val js = vociPerJs(JSONArray().put("x"), current = "it-IT-language", engine = "com.google.android.tts")
        assertEquals("it-IT-language", js.getString("current"))
        assertEquals("com.google.android.tts", js.getString("engine"))
        assertEquals(1, js.getJSONArray("voices").length())
    }
}
