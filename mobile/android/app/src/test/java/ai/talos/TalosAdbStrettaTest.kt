package ai.talos

import ai.talos.agent.ponte.TalosAdbCanale
import ai.talos.agent.ponte.TalosAdbChiave
import ai.talos.agent.ponte.TalosAdbMessaggio
import ai.talos.agent.ponte.TalosAdbStretta
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.SecureRandom

/**
 * ⭐⭐ La stretta di mano, provata contro un `adbd` FINTO che parla il protocollo
 * vero.
 *
 * ⛔ Il finto non è una comodità: è l'unico modo di provare l'**ordine** delle
 * risposte, che è la regola più facile da sbagliare e la più cara — mandare la
 * chiave pubblica per prima significa il cartello «consentire il debug?» sullo
 * schermo della persona a OGNI collegamento, anche quando non serviva.
 */
class TalosAdbStrettaTest {

    companion object {
        private lateinit var coppia: KeyPair

        @BeforeClass
        @JvmStatic
        fun generaUnaVolta() {
            coppia = KeyPairGenerator.getInstance("RSA").apply {
                initialize(TalosAdbChiave.BIT, SecureRandom())
            }.generateKeyPair()
        }
    }

    /**
     * Un `adbd` finto: gira su un suo filo, legge quello che gli mandiamo e
     * risponde secondo un copione. Registra tutto quello che ha ricevuto.
     */
    private class AdbdFinto(private val copione: (TalosAdbCanale.Messaggio, TalosAdbCanale) -> Boolean) {
        val ricevuti = mutableListOf<TalosAdbCanale.Messaggio>()
        private val versoIlFinto = PipedOutputStream()
        private val versoDiNoi = PipedOutputStream()
        private val entrataDelFinto = PipedInputStream(versoIlFinto, 1 shl 16)
        private val entrataNostra = PipedInputStream(versoDiNoi, 1 shl 16)
        private val filo: Thread

        init {
            val suo = TalosAdbCanale(entrataDelFinto, versoDiNoi)
            filo = Thread {
                runCatching {
                    while (true) {
                        val m = suo.ricevi(5_000)
                        ricevuti += m
                        if (!copione(m, suo)) break
                    }
                }
                runCatching { versoDiNoi.close() }
            }.apply { isDaemon = true; start() }
        }

        fun nostroCanale() = TalosAdbCanale(entrataNostra, versoIlFinto)

        fun attendi() = filo.join(5_000)
    }

    private fun stretta(finto: AdbdFinto) =
        TalosAdbStretta(finto.nostroCanale(), "talos@prova", coppia)

    /** Il telefono ci conosce già: nessuna sfida, nessun cartello, si va. */
    @Test
    fun `un telefono che ci conosce risponde CNXN e siamo dentro`() {
        val finto = AdbdFinto { m, suo ->
            if (m.comando == TalosAdbMessaggio.CNXN) {
                suo.spedisci(
                    TalosAdbMessaggio.CNXN, TalosAdbMessaggio.VERSIONE, 256 * 1024,
                    "device::ro.product.name=pad".toByteArray(),
                )
            }
            false
        }

        val esito = stretta(finto).apri(attesaMs = 5_000)
        assertEquals(TalosAdbStretta.Esito.COLLEGATO, esito.esito)
        assertEquals(256 * 1024, esito.caricoMassimo)
        assertTrue(esito.banner.contains("ro.product.name=pad"))
    }

    /**
     * ⛔ LA REGOLA. Alla sfida si risponde PRIMA con la firma. Se il telefono ci
     * conosce, quella basta e **la persona non vede niente**.
     */
    @Test
    fun `alla sfida si risponde con la FIRMA, non con la chiave`() {
        val finto = AdbdFinto { m, suo ->
            when (m.comando) {
                TalosAdbMessaggio.CNXN -> {
                    suo.spedisci(TalosAdbMessaggio.AUTH, 1, 0, ByteArray(20) { it.toByte() })
                    true
                }
                else -> {
                    suo.spedisci(TalosAdbMessaggio.CNXN, TalosAdbMessaggio.VERSIONE, 1024, ByteArray(0))
                    false
                }
            }
        }

        val esito = stretta(finto).apri(5_000)
        finto.attendi()

        assertEquals(TalosAdbStretta.Esito.COLLEGATO, esito.esito)
        val risposta = finto.ricevuti[1]
        assertEquals(TalosAdbMessaggio.AUTH, risposta.comando)
        // 2 = FIRMA. Se qui ci fosse 3, sarebbe la chiave pubblica: il cartello.
        assertEquals(2, risposta.arg0)
        assertEquals(256, risposta.carico.size)
        // Ed è la firma VERA di QUEL gettone.
        assertTrue(
            TalosAdbChiave.firmaValida(
                TalosAdbChiave.pubblicaDi(coppia),
                ByteArray(20) { it.toByte() },
                risposta.carico,
            ),
        )
    }

    /**
     * Solo se la firma non basta si offre la chiave — ed è quello il momento in
     * cui il cartello compare sullo schermo.
     */
    @Test
    fun `se la firma non basta, ALLORA la chiave pubblica`() {
        val finto = AdbdFinto { m, suo ->
            when {
                m.comando == TalosAdbMessaggio.CNXN -> {
                    suo.spedisci(TalosAdbMessaggio.AUTH, 1, 0, ByteArray(20))
                    true
                }
                m.arg0 == 2 -> {
                    // «Non ti conosco»: la sfida si ripete.
                    suo.spedisci(TalosAdbMessaggio.AUTH, 1, 0, ByteArray(20))
                    true
                }
                else -> false
            }
        }

        val esito = stretta(finto).apri(5_000)
        finto.attendi()

        assertEquals(TalosAdbStretta.Esito.CARTELLO_MOSTRATO, esito.esito)
        val chiave = finto.ricevuti.last()
        assertEquals(3, chiave.arg0)
        // Il nome che la persona leggerà nel cartello è il nostro.
        assertTrue(String(chiave.carico, Charsets.UTF_8).contains("talos@prova"))
        assertEquals(0.toByte(), chiave.carico.last())
    }

    /**
     * ⛔ E la chiave si manda UNA volta sola. Insistere sarebbe una pioggia di
     * cartelli sul telefono di qualcuno.
     */
    @Test
    fun `la chiave pubblica si offre una volta sola, anche se il telefono insiste`() {
        val finto = AdbdFinto { m, suo ->
            if (m.comando == TalosAdbMessaggio.CNXN || m.comando == TalosAdbMessaggio.AUTH) {
                suo.spedisci(TalosAdbMessaggio.AUTH, 1, 0, ByteArray(20))
                true
            } else {
                false
            }
        }

        val esito = stretta(finto).apri(5_000)
        assertEquals(TalosAdbStretta.Esito.CARTELLO_MOSTRATO, esito.esito)
        assertEquals(1, finto.ricevuti.count { it.comando == TalosAdbMessaggio.AUTH && it.arg0 == 3 })
    }

    /** Il Debug wireless si annuncia con `STLS`, e va riconosciuto come tale. */
    @Test
    fun `un telefono in Debug wireless chiede TLS`() {
        val finto = AdbdFinto { _, suo ->
            suo.spedisci(TalosAdbMessaggio.STLS, 0x01000000, 0, ByteArray(0))
            false
        }

        assertEquals(TalosAdbStretta.Esito.SERVE_TLS, stretta(finto).apri(5_000).esito)
    }

    /** Il nostro `CNXN` dichiara solo caratteristiche che sappiamo davvero reggere. */
    @Test
    fun `il nostro CNXN dichiara le caratteristiche vere`() {
        val finto = AdbdFinto { _, _ -> false }
        stretta(finto).apri(1_000)
        finto.attendi()

        val nostro = finto.ricevuti.first()
        assertEquals(TalosAdbMessaggio.CNXN, nostro.comando)
        assertEquals(TalosAdbMessaggio.VERSIONE, nostro.arg0)
        val detto = String(nostro.carico, Charsets.UTF_8)
        assertTrue(detto.startsWith("host::"))
        assertTrue(detto.contains("shell_v2"))
    }

    /** Un capo che chiude prima di qualunque offerta è un rifiuto, non un'attesa. */
    @Test
    fun `chi chiude subito e un RIFIUTO, non un cartello in attesa`() {
        val finto = AdbdFinto { _, _ -> false }
        assertEquals(TalosAdbStretta.Esito.RIFIUTATO, stretta(finto).apri(1_000).esito)
    }

    /** Spedire non deve mai lasciare mezzo messaggio sul filo. */
    @Test
    fun `il CNXN parte come messaggio intero`() {
        val fuori = ByteArrayOutputStream()
        TalosAdbCanale(PipedInputStream(), fuori)
            .spedisci(TalosAdbMessaggio.CNXN, TalosAdbMessaggio.VERSIONE, 1024, "host::".toByteArray())
        assertEquals(TalosAdbMessaggio.INTESTAZIONE + 6, fuori.toByteArray().size)
    }
}
