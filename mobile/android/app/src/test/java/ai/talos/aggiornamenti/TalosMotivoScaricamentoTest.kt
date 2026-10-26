package ai.talos.aggiornamenti

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * ⛔ D-UPD-1 (26/10/2026): uno scaricamento abbandonato PER SEMPRE tornava «riprova» a JobScheduler, all'infinito e senza una
 * parola sullo schermo. I motivi definitivi diventano la fase FALLITA con `scaricamento:<motivo>` (il cassetto lo dice come
 * scaricamento); quelli passeggeri restano un nuovo tentativo.
 */
class TalosMotivoScaricamentoTest {

    @Test
    fun `UPD-MOT-01 la release tolta, i 403 che non passano e i rinvii rifiutati sono definitivi`() {
        assertEquals("scaricamento:gone", TalosMotivoScaricamento.definitivo("gone"))
        assertEquals("scaricamento:forbidden", TalosMotivoScaricamento.definitivo("forbidden"))
        assertEquals("scaricamento:rinvio-senza-indirizzo", TalosMotivoScaricamento.definitivo("rinvio-senza-indirizzo"))
        assertEquals("scaricamento:rinvio-non-sicuro", TalosMotivoScaricamento.definitivo("rinvio-non-sicuro"))
        assertEquals("scaricamento:troppi-rinvii", TalosMotivoScaricamento.definitivo("troppi-rinvii"))
    }

    @Test
    fun `UPD-MOT-02 rete, limiti, fermate e file cambiato si riprovano`() {
        for (passeggero in listOf("stopped", "io", "unreachable", "rate-limited", "file-changed", "qualcosa-di-nuovo")) {
            assertNull(passeggero, TalosMotivoScaricamento.definitivo(passeggero))
        }
        assertNull(TalosMotivoScaricamento.definitivo(null))
    }
}
