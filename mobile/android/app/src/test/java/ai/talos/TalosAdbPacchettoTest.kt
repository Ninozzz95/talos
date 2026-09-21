package ai.talos

import ai.talos.agent.ponte.TalosAdbPacchetto
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * ⭐ I pacchetti dell'accoppiamento — e la trappola che nasce dall'avere DUE
 * protocolli con lo stesso nome.
 */
class TalosAdbPacchettoTest {

    /** Una presa che consegna un byte alla volta, come fa una rete vera. */
    private class AGocce(dati: ByteArray) : InputStream() {
        private val dentro = ByteArrayInputStream(dati)
        override fun read(): Int = dentro.read()
        override fun read(b: ByteArray, off: Int, len: Int): Int =
            if (len == 0) 0 else dentro.read(b, off, 1)
    }

    /**
     * ⛔ LA TRAPPOLA. Qui la lunghezza è **big**-endian, mentre nell'altro
     * protocollo — quello della connessione, nello stesso progetto, con lo
     * stesso nome «adb» — è little-endian. Scriverla per abitudine nel verso
     * sbagliato produce un carico di dimensione assurda e una connessione che
     * muore senza spiegazioni.
     */
    @Test
    fun `la lunghezza e BIG-endian, al contrario dell altro protocollo`() {
        val testa = TalosAdbPacchetto.intestazione(TalosAdbPacchetto.SPAKE2, 258)

        assertEquals(6, testa.size)
        assertEquals(1, testa[0].toInt())
        assertEquals(0, testa[1].toInt())
        // 258 = 0x00000102 -> big-endian: 00 00 01 02
        assertArrayEquals(byteArrayOf(0, 0, 1, 2), testa.copyOfRange(2, 6))
    }

    @Test
    fun `un intestazione nostra si rilegge identica`() {
        val letta = TalosAdbPacchetto
            .leggiIntestazione(TalosAdbPacchetto.intestazione(TalosAdbPacchetto.PEER_INFO, 8192))
            .getOrThrow()

        assertEquals(1, letta.versione)
        assertEquals(TalosAdbPacchetto.PEER_INFO, letta.tipo)
        assertEquals(8192, letta.carico)
    }

    @Test
    fun `una versione che non conosciamo e rifiutata`() {
        val testa = TalosAdbPacchetto.intestazione(TalosAdbPacchetto.SPAKE2, 32)
        testa[0] = 9
        assertEquals(
            TalosAdbPacchetto.Rifiuto.VERSIONE,
            (TalosAdbPacchetto.leggiIntestazione(testa).exceptionOrNull() as TalosAdbPacchetto.Rotto).motivo,
        )
    }

    @Test
    fun `un tipo che non esiste e rifiutato`() {
        val testa = TalosAdbPacchetto.intestazione(7, 32)
        assertEquals(
            TalosAdbPacchetto.Rifiuto.TIPO,
            (TalosAdbPacchetto.leggiIntestazione(testa).exceptionOrNull() as TalosAdbPacchetto.Rotto).motivo,
        )
    }

    /**
     * ⛔ Carico zero rifiutato, come in AOSP: un pacchetto senza contenuto non
     * significa niente qui, e accettarlo vorrebbe dire proseguire su un dialogo
     * che non sta più andando da nessuna parte.
     */
    @Test
    fun `un carico vuoto o spropositato e rifiutato`() {
        for (misura in listOf(0, -1, TalosAdbPacchetto.MAX_CARICO + 1)) {
            val testa = TalosAdbPacchetto.intestazione(TalosAdbPacchetto.SPAKE2, misura)
            assertEquals(
                "misura $misura",
                TalosAdbPacchetto.Rifiuto.CARICO,
                (TalosAdbPacchetto.leggiIntestazione(testa).exceptionOrNull() as TalosAdbPacchetto.Rotto).motivo,
            )
        }
    }

    /** Andata e ritorno su una presa che consegna un byte alla volta. */
    @Test
    fun `un pacchetto si legge intero anche da una presa a gocce`() {
        val fuori = ByteArrayOutputStream()
        val carico = ByteArray(300) { (it * 5).toByte() }
        TalosAdbPacchetto.spedisci(fuori, TalosAdbPacchetto.SPAKE2, carico)

        val (letta, riletto) = TalosAdbPacchetto.ricevi(AGocce(fuori.toByteArray()))
        assertEquals(TalosAdbPacchetto.SPAKE2, letta.tipo)
        assertArrayEquals(carico, riletto)
    }

    /**
     * ⛔ La struttura `PeerInfo` è FISSA a 8192 byte e imbottita di zeri.
     * Spedirne una più corta, con solo i byte utili, verrebbe naturale — e
     * l'altro capo la leggerebbe come una struttura troncata.
     */
    @Test
    fun `il PeerInfo e sempre lungo 8192, imbottito di zeri`() {
        val chiave = "AAAA base64 della chiave talos@pad".toByteArray()
        val info = TalosAdbPacchetto.peerInfo(chiave)

        assertEquals(8192, info.size)
        assertEquals(0, info[0].toInt())
        assertArrayEquals(chiave, info.copyOfRange(1, 1 + chiave.size))
        assertTrue(info.copyOfRange(1 + chiave.size, 8192).all { it == 0.toByte() })
    }

    /** Le due misure di AOSP, per numero. */
    @Test
    fun `le misure sono quelle di AOSP`() {
        assertEquals(8192, TalosAdbPacchetto.MAX_PEER_INFO)
        assertEquals(16384, TalosAdbPacchetto.MAX_CARICO)
        assertEquals(6, TalosAdbPacchetto.INTESTAZIONE)
    }
}
