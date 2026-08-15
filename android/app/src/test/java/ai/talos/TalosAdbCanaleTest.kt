package ai.talos

import ai.talos.agent.ponte.TalosAdbCanale
import ai.talos.agent.ponte.TalosAdbMessaggio
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.InterruptedIOException

/**
 * ⭐⭐ Il canale: le due regole che, dimenticate, danno un ponte che si pianta o
 * che legge rumore come comandi.
 */
class TalosAdbCanaleTest {

    /** Una presa che consegna **un byte alla volta**, come fa una rete vera. */
    private class AGocce(dati: ByteArray) : InputStream() {
        private val dentro = ByteArrayInputStream(dati)
        override fun read(): Int = dentro.read()
        override fun read(b: ByteArray, off: Int, len: Int): Int =
            if (len == 0) 0 else dentro.read(b, off, 1)
    }

    private fun filo(vararg messaggi: Triple<Int, Int, ByteArray>): ByteArray {
        val fuori = ByteArrayOutputStream()
        for ((comando, arg0, carico) in messaggi) {
            fuori.write(TalosAdbMessaggio.intestazione(comando, arg0, 0, carico))
            fuori.write(carico)
        }
        return fuori.toByteArray()
    }

    /**
     * ⛔ LA REGOLA NUMERO UNO. `InputStream.read(buffer)` può tornare con MENO
     * byte di quelli chiesti, e su una presa di rete succede sempre. Chi usa
     * quello che torna legge mezza intestazione, crede che il messaggio dopo
     * cominci a metà, e da lì in poi interpreta rumore come comandi.
     *
     * Questa presa consegna **un byte per volta**: se il canale non leggesse in
     * ciclo, non arriverebbe nemmeno in fondo alla prima intestazione.
     */
    @Test
    fun `legge un messaggio intero anche da una presa che da un byte alla volta`() {
        val carico = ByteArray(200) { (it * 3).toByte() }
        val canale = TalosAdbCanale(
            AGocce(filo(Triple(TalosAdbMessaggio.WRTE, 42, carico))),
            ByteArrayOutputStream(),
        )

        val messaggio = canale.ricevi(attesaMs = 1_000)
        assertEquals(TalosAdbMessaggio.WRTE, messaggio.comando)
        assertEquals(42, messaggio.arg0)
        assertArrayEquals(carico, messaggio.carico)
    }

    @Test
    fun `messaggi di fila si leggono uno dopo l altro, senza scivolare`() {
        val primo = "uno".toByteArray()
        val secondo = ByteArray(0)
        val terzo = "tre".toByteArray()
        val canale = TalosAdbCanale(
            AGocce(
                filo(
                    Triple(TalosAdbMessaggio.WRTE, 1, primo),
                    Triple(TalosAdbMessaggio.OKAY, 2, secondo),
                    Triple(TalosAdbMessaggio.WRTE, 3, terzo),
                ),
            ),
            ByteArrayOutputStream(),
        )

        assertArrayEquals(primo, canale.ricevi(1_000).carico)
        val vuoto = canale.ricevi(1_000)
        assertEquals(TalosAdbMessaggio.OKAY, vuoto.comando)
        assertEquals(0, vuoto.carico.size)
        assertArrayEquals(terzo, canale.ricevi(1_000).carico)
    }

    /**
     * ⛔ LA REGOLA NUMERO DUE, ed è quella che ha prodotto il girello infinito
     * dell'accoppiamento: **nessuna lettura senza orologio**.
     *
     * Qui l'altro capo non manda niente e non chiude. Il vecchio ponte sarebbe
     * rimasto lì per sempre; questo torna con `SCADUTO`.
     */
    @Test
    fun `un capo muto NON blocca per sempre - scade`() {
        val muta = object : InputStream() {
            override fun read(): Int = throw InterruptedIOException()
            override fun read(b: ByteArray, off: Int, len: Int): Int =
                throw InterruptedIOException()
        }
        var adesso = 0L
        val canale = TalosAdbCanale(muta, ByteArrayOutputStream(), orologio = { adesso += 5_000_000; adesso })

        val rotto = runCatching { canale.ricevi(attesaMs = 20) }.exceptionOrNull()
        assertTrue(rotto is TalosAdbCanale.Rotto)
        assertEquals(TalosAdbCanale.Guasto.SCADUTO, (rotto as TalosAdbCanale.Rotto).guasto)
    }

    /**
     * ⛔ E la scadenza vale per TUTTO il messaggio, non per ogni lettura: chi
     * manda un byte ogni tanto, per sempre, terrebbe il ponte in ostaggio
     * rinnovando il timeout a ogni byte.
     */
    @Test
    fun `chi manda a rilento non rinnova il tempo a ogni byte`() {
        var adesso = 0L
        val canale = TalosAdbCanale(
            AGocce(filo(Triple(TalosAdbMessaggio.WRTE, 1, ByteArray(500)))),
            ByteArrayOutputStream(),
            // Ogni lettura «costa» 2 ms: 24 byte di intestazione bastano a
            // sfondare una scadenza di 20 ms.
            orologio = { adesso += 2_000_000; adesso },
        )

        val rotto = runCatching { canale.ricevi(attesaMs = 20) }.exceptionOrNull()
        assertEquals(
            TalosAdbCanale.Guasto.SCADUTO,
            (rotto as TalosAdbCanale.Rotto).guasto,
        )
    }

    /** Fine del flusso è un esito DIVERSO dallo scadere: porta a un rimedio diverso. */
    @Test
    fun `l altro capo che chiude si chiama CHIUSO, non scaduto`() {
        val canale = TalosAdbCanale(ByteArrayInputStream(ByteArray(10)), ByteArrayOutputStream())

        val rotto = runCatching { canale.ricevi(1_000) }.exceptionOrNull()
        assertEquals(TalosAdbCanale.Guasto.CHIUSO, (rotto as TalosAdbCanale.Rotto).guasto)
    }

    /** Un carico che non torna con la sua somma non deve passare per buono. */
    @Test
    fun `un carico corrotto in transito viene RIFIUTATO`() {
        val carico = ByteArray(40) { it.toByte() }
        val bytes = filo(Triple(TalosAdbMessaggio.WRTE, 1, carico))
        bytes[TalosAdbMessaggio.INTESTAZIONE + 3] = 0x7F

        val canale = TalosAdbCanale(ByteArrayInputStream(bytes), ByteArrayOutputStream())
        val rotto = runCatching { canale.ricevi(1_000) }.exceptionOrNull()
        assertEquals(
            TalosAdbCanale.Guasto.CARICO_CORROTTO,
            (rotto as TalosAdbCanale.Rotto).guasto,
        )
    }

    /**
     * ⛔ Il tetto sul carico si applica a quello DICHIARATO, prima di allocare.
     * Il numero arriva dall'altro capo del filo.
     */
    @Test
    fun `un carico dichiarato oltre il tetto e rifiutato prima di allocarlo`() {
        val canale = TalosAdbCanale(
            ByteArrayInputStream(filo(Triple(TalosAdbMessaggio.WRTE, 1, ByteArray(64)))),
            ByteArrayOutputStream(),
            caricoMassimo = 32,
        )

        val rotto = runCatching { canale.ricevi(1_000) }.exceptionOrNull()
        assertEquals(
            TalosAdbCanale.Guasto.INTESTAZIONE,
            (rotto as TalosAdbCanale.Rotto).guasto,
        )
    }

    /**
     * ⛔ Un'intestazione ferma in un buffer di uscita assomiglia in tutto a un
     * telefono che non risponde: `adbd` reagisce solo a messaggi interi.
     */
    @Test
    fun `spedire scrive intestazione e carico, e SVUOTA`() {
        var svuotato = 0
        val fuori = object : ByteArrayOutputStream() {
            override fun flush() { svuotato++ }
        }
        val canale = TalosAdbCanale(ByteArrayInputStream(ByteArray(0)), fuori)

        val carico = "shell:id".toByteArray()
        canale.spedisci(TalosAdbMessaggio.OPEN, 1, 0, carico)

        val scritto = fuori.toByteArray()
        assertEquals(TalosAdbMessaggio.INTESTAZIONE + carico.size, scritto.size)
        assertArrayEquals(
            carico,
            scritto.copyOfRange(TalosAdbMessaggio.INTESTAZIONE, scritto.size),
        )
        assertTrue(svuotato > 0)
    }

    /** Andata e ritorno: quello che spediamo è esattamente quello che si rilegge. */
    @Test
    fun `quel che si spedisce si rilegge identico`() {
        val fuori = ByteArrayOutputStream()
        TalosAdbCanale(ByteArrayInputStream(ByteArray(0)), fuori)
            .spedisci(TalosAdbMessaggio.CNXN, TalosAdbMessaggio.VERSIONE, 256 * 1024, "host::".toByteArray())

        val riletto = TalosAdbCanale(AGocce(fuori.toByteArray()), ByteArrayOutputStream())
            .ricevi(1_000)
        assertEquals(TalosAdbMessaggio.CNXN, riletto.comando)
        assertEquals(TalosAdbMessaggio.VERSIONE, riletto.arg0)
        assertEquals(256 * 1024, riletto.arg1)
        assertArrayEquals("host::".toByteArray(), riletto.carico)
    }
}
