package ai.talos.agent.ponte

import android.app.AppOpsManager
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * RETE-NEGATA-01..03 (ASS-148, owner 28/10: «Messaggio chiaro + pulsante»). Con la rete locale bloccata (Android 17, la persona ha tolto
 * «Rete locale»: appop `ignore`, misurato sul OnePlus 13), NsdManager tace e il ponte diceva «non sento l'annuncio». Ora il motivo dice la
 * causa vera. Nel dubbio («non so se è bloccata») si tiene il motivo di sempre: non si accusa la persona (OK del Desktop, 28/10).
 */
class TalosReteLocaleRegolaTest {

    @Test
    fun `RETE-NEGATA-01 senza annunci e con la rete locale bloccata il motivo e local-network-blocked`() {
        assertEquals("local-network-blocked", TalosReteLocaleRegola.motivoSenzaAnnunci("pairing-not-announced", bloccata = true))
        assertEquals("local-network-blocked", TalosReteLocaleRegola.motivoSenzaAnnunci("connect-not-announced", bloccata = true))
    }

    @Test
    fun `RETE-NEGATA-02 senza annunci e rete non bloccata il motivo resta quello di sempre`() {
        assertEquals("pairing-not-announced", TalosReteLocaleRegola.motivoSenzaAnnunci("pairing-not-announced", bloccata = false))
        assertEquals("connect-not-announced", TalosReteLocaleRegola.motivoSenzaAnnunci("connect-not-announced", bloccata = false))
    }

    @Test
    fun `RETE-NEGATA-03 il permesso da guardare e quello di Android 17, e il modo che vale consentito`() {
        assertEquals("android.permission.ACCESS_LOCAL_NETWORK", TalosReteLocaleRegola.PERMESSO)
        assertEquals(false, TalosReteLocaleRegola.bloccataDalModo(null))
        assertEquals(false, TalosReteLocaleRegola.bloccataDalModo(0)) // MODE_ALLOWED
        assertEquals(true, TalosReteLocaleRegola.bloccataDalModo(1)) // MODE_IGNORED
        assertEquals(true, TalosReteLocaleRegola.bloccataDalModo(2)) // MODE_ERRORED
        assertEquals(false, TalosReteLocaleRegola.bloccataDalModo(3)) // MODE_DEFAULT: decide il permesso, che c'è
        assertEquals(false, TalosReteLocaleRegola.bloccataDalModo(4)) // MODE_FOREGROUND: l'app in primo piano passa
    }

    @Test
    fun `RETE-NEGATA-04 i numeri scritti a mano sono le costanti vere di AppOpsManager`() {
        // Desktop 28/10: se Android le cambia lo vediamo. Sono `static final`: il compilatore le scrive nel bytecode, la JVM non tocca android.jar
        assertEquals(true, TalosReteLocaleRegola.bloccataDalModo(AppOpsManager.MODE_IGNORED))
        assertEquals(true, TalosReteLocaleRegola.bloccataDalModo(AppOpsManager.MODE_ERRORED))
        assertEquals(false, TalosReteLocaleRegola.bloccataDalModo(AppOpsManager.MODE_ALLOWED))
        assertEquals(false, TalosReteLocaleRegola.bloccataDalModo(AppOpsManager.MODE_DEFAULT))
        assertEquals(false, TalosReteLocaleRegola.bloccataDalModo(AppOpsManager.MODE_FOREGROUND))
    }
}
