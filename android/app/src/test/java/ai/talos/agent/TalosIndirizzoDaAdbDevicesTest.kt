package ai.talos.agent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * L'indirizzo del prossimo riaggancio si legge da `adb devices`.
 *
 * ⛔ PERCHÉ QUESTA RIGA HA UN TEST: è quella che decide se il riaggancio costa
 * tre secondi o nove. MISURATO sul Pad il 2026-08-09 — col censimento mDNS
 * 9.131 ms, con l'indirizzo già noto 3.124 ms — e l'indirizzo noto arriva da
 * qui, gratis, da un comando che il battito esegue comunque.
 *
 * ⛔ Il caso che morde è il seriale USB: senza il controllo sulla porta finirebbe
 * dentro `adb connect` come se fosse un indirizzo, fallirebbe ogni volta, e il
 * fallimento direbbe «connect-refused» invece di «non è un indirizzo». Un
 * difetto che si presenta come un altro difetto.
 *
 * ⛔ È in Kotlin e non in Java come il suo vicino: `internal` viene rinominato
 * nel bytecode e da Java non si vede.
 */
class TalosIndirizzoDaAdbDevicesTest {

    @Test
    fun `legge indirizzo e porta dalla riga vera`() {
        // La riga esatta stampata dal Pad, tabulazione compresa.
        assertEquals("192.0.2.95:45853", TalosPonteAdb.indirizzoDi("192.0.2.95:45853\tdevice"))
    }

    @Test
    fun `accetta anche gli spazi al posto della tabulazione`() {
        assertEquals("10.0.0.7:5555", TalosPonteAdb.indirizzoDi("10.0.0.7:5555   device"))
    }

    @Test
    fun `un seriale USB non e' un indirizzo`() {
        assertNull(TalosPonteAdb.indirizzoDi("abc12345\tdevice"))
    }

    @Test
    fun `una porta che non e' un numero non passa`() {
        assertNull(TalosPonteAdb.indirizzoDi("192.0.2.95:porta\tdevice"))
    }

    @Test
    fun `una porta fuori dai limiti non passa`() {
        assertNull(TalosPonteAdb.indirizzoDi("192.0.2.95:70000\tdevice"))
        assertNull(TalosPonteAdb.indirizzoDi("192.0.2.95:0\tdevice"))
    }

    @Test
    fun `un indirizzo IPv6 non passa`() {
        // Due volte i due punti: `adb connect` non saprebbe dove finisce
        // l'indirizzo e dove comincia la porta. È la stessa regola già scritta
        // dentro la scoperta mDNS.
        assertNull(TalosPonteAdb.indirizzoDi("fe80::1:5555\tdevice"))
    }

    @Test
    fun `una riga vuota non inventa niente`() {
        assertNull(TalosPonteAdb.indirizzoDi(""))
        assertNull(TalosPonteAdb.indirizzoDi("   "))
    }
}
