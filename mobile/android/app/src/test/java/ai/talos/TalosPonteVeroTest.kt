package ai.talos

import ai.talos.agent.ponte.TalosAdbCanale
import ai.talos.agent.ponte.TalosAdbChiave
import ai.talos.agent.ponte.TalosAdbStretta
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.net.InetSocketAddress
import java.net.Socket
import java.security.KeyPairGenerator
import java.security.SecureRandom

/**
 * ⭐⭐⭐ LA PROVA CONTRO `adbd` VERO — l'unica che significhi qualcosa.
 *
 * ## Perché serve, detto senza sconti
 *
 * Tutto il resto del ponte in casa è provato contro sé stesso. Le prove di
 * andata e ritorno dimostrano la coerenza interna: due lati che eseguono lo
 * stesso codice si cancellano gli errori a vicenda. Un'intestazione sbagliata
 * in modo simmetrico, uno scalare ridotto quando non doveva, un ordine di campi
 * invertito ovunque — tutto questo passa verde.
 *
 * ⇒ La compatibilità la dice **solo l'altro capo**, e l'altro capo è `adbd`.
 *
 * ## Perché non è nel cancello
 *
 * Perché vuole una rete e un telefono col Debug wireless acceso: in una prova
 * automatica sarebbe un fallimento intermittente che non dice niente a nessuno.
 * Si salta da sola se non le si dà un bersaglio.
 *
 * ## Come si lancia
 *
 * ```
 * gradlew :app:testDebugUnitTest --tests ai.talos.TalosPonteVeroTest \
 *     -Dtalos.adbd=192.0.2.95:33331
 * ```
 *
 * L'indirizzo si legge in Impostazioni → Opzioni sviluppatore → Debug wireless.
 */
class TalosPonteVeroTest {

    @Test
    fun `il nostro CNXN arriva a adbd, e adbd risponde`() {
        val bersaglio: String? = System.getProperty("talos.adbd")
        assumeTrue("serve -Dtalos.adbd=IP:PORTA", bersaglio != null)

        val pezzi = bersaglio!!.split(":")
        val presa = Socket()
        presa.connect(InetSocketAddress(pezzi[0], pezzi[1].toInt()), 5_000)
        // ⛔ Il timeout della presa e' PIU' CORTO della scadenza del canale: cosi'
        // una lettura che non arriva sblocca il ciclo e lascia decidere
        // all'orologio nostro, invece di restare appesa nel sistema operativo.
        presa.soTimeout = 1_000

        try {
            val canale = TalosAdbCanale(presa.getInputStream(), presa.getOutputStream())
            val coppia = KeyPairGenerator.getInstance("RSA").apply {
                initialize(TalosAdbChiave.BIT, SecureRandom())
            }.generateKeyPair()

            val esito = TalosAdbStretta(canale, "talos@prova", coppia).apri(attesaMs = 8_000)

            println("=== RISPOSTA DI adbd VERO ===")
            println("esito:         ${esito.esito}")
            println("carico max:    ${esito.caricoMassimo}")
            println("banner:        ${esito.banner}")
        } finally {
            runCatching { presa.close() }
        }
    }
}
