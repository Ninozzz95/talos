package ai.talos

import ai.talos.agent.ponte.TalosAdbAccoppiamento
import ai.talos.agent.ponte.TalosAdbChiave
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.SecureRandom

/**
 * ⭐⭐⭐ L'ACCOPPIAMENTO CONTRO IL SERVIZIO VERO — la prova che chiude SPAKE2.
 *
 * ## Perché deve girare QUI e non nel banco normale
 *
 * `SSLSockets.exportKeyingMaterial` è API **Android**: sul PC non esiste. E i
 * 64 byte che esporta sono metà della password di SPAKE2, quindi senza di essa
 * l'accoppiamento non si può nemmeno tentare.
 *
 * ⇒ Questa prova gira **dentro il telefono**, che è anche l'unico posto dove
 * significa qualcosa.
 *
 * ## Cosa dimostra, se passa
 *
 * Tutto quello che finora era provato solo contro sé stesso:
 * l'aritmetica Ed25519, i due punti fissi, lo scalare non ridotto, il ×8 sul
 * privato, l'ordine dei nomi nella trascrizione, i due zeri finali presi da
 * `sizeof`, l'etichetta dell'esportazione, HKDF, AES-GCM coi due contatori.
 *
 * Un solo byte fuori posto in uno qualunque di questi e il risultato è
 * `CODICE_SBAGLIATO` su un codice giusto. Non c'è modo di passare per caso.
 *
 * ## Come si lancia
 *
 * Aprire sul telefono Impostazioni → Opzioni sviluppatore → Debug wireless →
 * «Accoppia dispositivo con codice di accoppiamento», e leggere le sei cifre e
 * la porta. Poi:
 *
 * ```
 * gradlew :app:connectedDebugAndroidTest -PtalosSideBySide \
 *     -Pandroid.testInstrumentationRunnerArguments.accoppiamento=192.0.2.95:41234:123456
 * ```
 */
class TalosAccoppiamentoVeroTest {

    @Test
    fun ci_accoppiamo_col_telefono_vero() {
        val argomento = InstrumentationRegistry.getArguments().getString("accoppiamento")
        assumeTrue("serve -P...accoppiamento=IP:PORTA:CODICE", argomento != null)

        val pezzi = argomento!!.split(":")
        assertEquals("formato IP:PORTA:CODICE", 3, pezzi.size)

        val coppia = KeyPairGenerator.getInstance("RSA").apply {
            initialize(TalosAdbChiave.BIT, SecureRandom())
        }.generateKeyPair()

        val esito = TalosAdbAccoppiamento.accoppia(
            indirizzo = pezzi[0],
            porta = pezzi[1].toInt(),
            codice = pezzi[2],
            coppia = coppia,
            nome = "TALOS",
            adesso = System.currentTimeMillis(),
        )

        println("=== ACCOPPIAMENTO ===")
        println("esito:     ${esito.esito}")
        println("dettaglio: ${esito.dettaglio}")

        assertEquals(
            "l'accoppiamento doveva riuscire, dettaglio=${esito.dettaglio}",
            TalosAdbAccoppiamento.Esito.FATTO,
            esito.esito,
        )
    }
}
