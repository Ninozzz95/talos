package ai.talos.aggiornamenti

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Visto sul Pad il 22/10/2026 alle 22:17: installata a mano (adb) la 0.1.43, il cassetto è salito con «Aggiornata alla
 * 0.1.43-dev» e Android ha mostrato la notifica «TALOS aggiornata». `ACTION_MY_PACKAGE_REPLACED` arriva per OGNI sostituzione del
 * pacchetto — anche un APK scaricato a mano dal browser — non solo per quelle fatte da TALOS. Si annuncia solo ciò che TALOS ha
 * installato: la sessione era partita (fase IN_INSTALLAZIONE).
 */
class TalosRicevitorePacchettoSostituitoTest {

    @Test
    fun `AGG-SOST-01 si annuncia solo un'installazione partita da TALOS`() {
        assertTrue(TalosRicevitorePacchettoSostituito.daAnnunciare(TalosFaseAggiornamento.IN_INSTALLAZIONE))
        for (fase in TalosFaseAggiornamento.entries.filter { it != TalosFaseAggiornamento.IN_INSTALLAZIONE }) {
            assertFalse(fase.name, TalosRicevitorePacchettoSostituito.daAnnunciare(fase))
        }
    }
}
