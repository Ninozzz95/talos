package ai.talos.agent.ponte

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PROPRI-01..04 (ASS-149 D1, difetto di sicurezza trovato dalla ricerca del 29/10; OK del Desktop). La scoperta mDNS del ponte accettava
 * l'annuncio di QUALUNQUE dispositivo della rete: un altro telefono col Debug wireless acceso poteva diventare la meta del riaggancio.
 * Shizuku accetta solo gli annunci il cui indirizzo è di una delle interfacce del dispositivo stesso (`AdbMdns.kt:59-72`, b844bc4).
 */
class TalosIndirizziPropriTest {

    private val propri = setOf("192.168.1.95", "fe80::1c2b:3cff:fe4d:5e6f", "10.0.0.7", "127.0.0.1")

    @Test
    fun `PROPRI-01 fra un annuncio proprio e uno estraneo vince solo il proprio`() {
        val risolti = listOf("192.168.1.43" to 41234, "192.168.1.95" to 37755)
        assertEquals(listOf("192.168.1.95:37755"), TalosIndirizziPropri.soloPropri(risolti, propri))
    }

    @Test
    fun `PROPRI-02 col solo annuncio estraneo nessun indirizzo, non il primo che arriva`() {
        assertEquals(emptyList<String>(), TalosIndirizziPropri.soloPropri(listOf("192.168.1.43" to 41234), propri))
    }

    @Test
    fun `PROPRI-03 contano tutte le interfacce, anche la seconda rete e l IPv6 col suo ambito`() {
        assertTrue(TalosIndirizziPropri.eProprio("10.0.0.7", propri))
        assertTrue(TalosIndirizziPropri.eProprio("fe80::1c2b:3cff:fe4d:5e6f%wlan0", propri))
        assertTrue(TalosIndirizziPropri.eProprio("FE80::1C2B:3CFF:FE4D:5E6F", propri))
        assertFalse(TalosIndirizziPropri.eProprio("192.168.1.9", propri))
    }

    @Test
    fun `PROPRI-04 senza indirizzi propri noti non si accetta niente, cioe si chiude`() {
        assertEquals(emptyList<String>(), TalosIndirizziPropri.soloPropri(listOf("192.168.1.95" to 37755), emptySet()))
    }
}
