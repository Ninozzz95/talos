package ai.talos.agent

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * N12 (13/10/2026) — ciò che del riconoscimento locale si prova senza la libreria nativa: quali file sono il modello e come
 * si configura sherpa-onnx per Parakeet. La decodifica vera si prova sul Pad (la libreria è per arm64).
 */
class TalosAsrLocalePluginTest {
    private fun cartellaCon(vararg nomi: String): File {
        val cartella = Files.createTempDirectory("talos-asr").toFile()
        for (nome in nomi) File(cartella, nome).writeText("x")
        return cartella
    }

    /** N12-NATIVO-02 — il modello c'è solo con tutti e quattro i file, e non vuoti: il primo che manca si dice per nome. */
    @Test
    fun ilModelloESoloConTuttiEQuattroIFile() {
        val nomi = TalosAsrLocalePlugin.FILE_DEL_MODELLO
        assertEquals(listOf("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"), nomi)
        assertNull(TalosAsrLocalePlugin.primoFileMancante(cartellaCon(*nomi.toTypedArray())))
        assertEquals("joiner.int8.onnx", TalosAsrLocalePlugin.primoFileMancante(cartellaCon("encoder.int8.onnx", "decoder.int8.onnx", "tokens.txt")))
        assertEquals("encoder.int8.onnx", TalosAsrLocalePlugin.primoFileMancante(File("/cartella/che/non/esiste")))
        val conUnVuoto = cartellaCon(*nomi.toTypedArray())
        File(conUnVuoto, "tokens.txt").writeText("")
        assertEquals("tokens.txt", TalosAsrLocalePlugin.primoFileMancante(conUnVuoto))
    }

    /** N12-NATIVO-03 — Parakeet è un trasduttore della famiglia NeMo: tipo, file e numero di fili (mai fuori da 1-8). */
    @Test
    fun laConfigurazioneEQuellaDiUnTrasduttoreNemo() {
        val cartella = cartellaCon(*TalosAsrLocalePlugin.FILE_DEL_MODELLO.toTypedArray())
        val c = TalosAsrLocalePlugin.configurazione(cartella).modelConfig
        assertEquals("nemo_transducer", c.modelType)
        assertEquals(File(cartella, "encoder.int8.onnx").absolutePath, c.transducer.encoder)
        assertEquals(File(cartella, "decoder.int8.onnx").absolutePath, c.transducer.decoder)
        assertEquals(File(cartella, "joiner.int8.onnx").absolutePath, c.transducer.joiner)
        assertEquals(File(cartella, "tokens.txt").absolutePath, c.tokens)
        assertEquals("cpu", c.provider)
        assertEquals(TalosAsrLocalePlugin.FILI_DI_SERIE, c.numThreads)
        assertEquals(8, TalosAsrLocalePlugin.configurazione(cartella, 64).modelConfig.numThreads)
        assertEquals(1, TalosAsrLocalePlugin.configurazione(cartella, 0).modelConfig.numThreads)
    }
    /** N12-NATIVO-04 — il parlato passa a Parakeet intero e in ordine: da interi a 16 bit a virgola mobile, mai oltre ciò che si è preso. */
    @Test
    fun ilParlatoPassaInteroEInOrdine() {
        val pezzi = listOf(shortArrayOf(0, 16384, -16384), shortArrayOf(32767, -32768))
        val tutto = TalosAsrLocalePlugin.inVirgolaMobile(pezzi, 5)
        assertEquals(5, tutto.size)
        assertEquals(0f, tutto[0], 0f)
        assertEquals(0.5f, tutto[1], 0f)
        assertEquals(-0.5f, tutto[2], 0f)
        assertEquals(32767 / 32768f, tutto[3], 0f)
        assertEquals(-1f, tutto[4], 0f)
        // il tetto: ciò che è oltre non entra
        assertEquals(2, TalosAsrLocalePlugin.inVirgolaMobile(pezzi, 2).size)
        assertEquals(1f, TalosAsrLocalePlugin.picco(tutto), 0f)
        assertEquals(0f, TalosAsrLocalePlugin.picco(FloatArray(100)), 0f)
    }
    /**
     * N12-NATIVO-05 — il tubo verso il riconoscitore di sistema: i byte arrivano in ordine e nel formato giusto (PCM a 16 bit,
     * il byte basso prima), e chi legge lento o sparisce NON ferma la cattura: il tubo si chiude e `scrivi` dice di no.
     */
    @Test
    fun ilTuboNonFermaMaiLaCattura() {
        assertEquals(listOf<Byte>(0x34, 0x12, -1, -1, 0, -128), TalosAsrLocalePlugin.inByte(shortArrayOf(0x1234, -1, -32768), 3).toList())
        assertEquals(2, TalosAsrLocalePlugin.inByte(shortArrayOf(1, 2, 3), 1).size)

        val arrivati = java.io.ByteArrayOutputStream()
        val buono = TalosAsrLocalePlugin.Tubo(arrivati)
        assertEquals(true, buono.scrivi(shortArrayOf(1, 2), 2))
        assertEquals(true, buono.scrivi(shortArrayOf(3), 1))
        Thread.sleep(150)
        assertEquals(listOf<Byte>(1, 0, 2, 0, 3, 0), arrivati.toByteArray().toList())
        buono.chiudi()
        assertEquals(false, buono.scrivi(shortArrayOf(4), 1))

        // chi legge si è bloccato: la coda si riempie, il tubo si chiude da solo, e nessuna `scrivi` resta appesa
        val fermo = java.util.concurrent.CountDownLatch(1)
        val bloccato = object : java.io.OutputStream() {
            override fun write(b: Int) { fermo.await() }
            override fun write(b: ByteArray) { fermo.await() }
        }
        val lento = TalosAsrLocalePlugin.Tubo(bloccato, 3)
        val prima = System.nanoTime()
        var rifiutata = false
        repeat(20) { if (!lento.scrivi(shortArrayOf(1), 1)) rifiutata = true }
        assertEquals(true, rifiutata)
        assertEquals(false, lento.aperto)
        assertEquals(true, (System.nanoTime() - prima) < 1_000_000_000L)
        fermo.countDown()
    }
    /** N12-NATIVO-06 — l'impronta di un file è il suo SHA-256 vero (vettori noti), anche oltre un pezzo di lettura. */
    @Test
    fun lImprontaDiUnFileEIlSuoSha256() {
        val cartella = cartellaCon()
        val vuoto = File(cartella, "vuoto").apply { writeBytes(ByteArray(0)) }
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", TalosAsrLocalePlugin.improntaDi(vuoto))
        val abc = File(cartella, "abc").apply { writeText("abc") }
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", TalosAsrLocalePlugin.improntaDi(abc))
        val grande = File(cartella, "grande").apply { writeBytes(ByteArray((1 shl 20) + 7) { 'a'.code.toByte() }) }
        val atteso = java.security.MessageDigest.getInstance("SHA-256").digest(grande.readBytes()).joinToString("") { "%02x".format(it) }
        assertEquals(atteso, TalosAsrLocalePlugin.improntaDi(grande))
    }
    /**
     * N12-BARRA-MIC: il microfono è uno solo. La cattura locale spegne l'orecchio anticipato e fa cedere la parola di
     * attivazione PRIMA di aprire `AudioRecord`, rinnova la cessione prima che scada, e la restituisce a ogni uscita.
     * Prova di struttura sul sorgente: `TalosParola` è un servizio Android, in JVM non gira.
     */
    @Test
    fun laCatturaCedeERestituisceIlMicrofonoAllaParolaDiAttivazione() {
        val sorgente = sequenceOf("src/main/java/ai/talos/agent/TalosAsrLocalePlugin.kt", "app/src/main/java/ai/talos/agent/TalosAsrLocalePlugin.kt")
            .map { File(it) }.first { it.isFile }.readText().replace("\r", "")
        val ascolta = sorgente.substringAfter("fun ascolta(call: PluginCall)").substringBefore("@PluginMethod")
        assertTrue(ascolta.indexOf("prendiIlMicrofono()") in 0 until ascolta.indexOf("AudioRecord("))
        val prendi = sorgente.substringAfter("private fun prendiIlMicrofono()").substringBefore("private fun rendiIlMicrofono()")
        assertTrue(prendi.indexOf("TalosOrecchioAnticipato.spegni()") in 0 until prendi.indexOf("TalosParola.cedi()"))
        for (uscita in listOf("fun trascrivi(call: PluginCall)", "fun annulla(call: PluginCall)", "override fun handleOnDestroy()")) {
            val corpo = sorgente.substringAfter(uscita).substringBefore("\n    }\n")
            assertTrue("$uscita non restituisce il microfono", corpo.contains("rendiIlMicrofono()"))
        }
        assertTrue(TalosAsrLocalePlugin.CESSIONE_RINNOVO_MS < 45_000L)
    }
    /** N12-TURNO: il livello che decide la fine del turno. Silenzio = 0; un'onda a metà corsa ≈ 0,5; mai sopra 1. */
    @Test
    fun ilLivelloDiUnBloccoStaFraZeroEUno() {
        assertEquals(0f, TalosAsrLocalePlugin.livello(ShortArray(1600), 1600), 0.0001f)
        assertEquals(0f, TalosAsrLocalePlugin.livello(ShortArray(0), 0), 0.0001f)
        val meta = ShortArray(1600) { if (it % 2 == 0) 16384 else (-16384).toShort() }
        assertEquals(0.5f, TalosAsrLocalePlugin.livello(meta, 1600), 0.001f)
        val piena = ShortArray(1600) { Short.MIN_VALUE }
        assertEquals(1f, TalosAsrLocalePlugin.livello(piena, 1600), 0.001f)
        // si contano solo i campioni letti
        val mista = ShortArray(1600) { if (it < 800) 16384 else 0 }
        assertEquals(0.5f, TalosAsrLocalePlugin.livello(mista, 800), 0.001f)
    }
    /**
     * N12-ANTICIPO, prova di struttura: la rilettura anticipata vale solo per la STESSA cattura, si butta a ogni cattura
     * nuova e a ogni annullamento, e `trascrivi` la usa solo se la pagina lo chiede.
     */
    @Test
    fun laRiletturaAnticipataValeSoloPerLaStessaCattura() {
        val sorgente = sequenceOf("src/main/java/ai/talos/agent/TalosAsrLocalePlugin.kt", "app/src/main/java/ai/talos/agent/TalosAsrLocalePlugin.kt")
            .map { File(it) }.first { it.isFile }.readText().replace("\r", "")
        assertTrue(sorgente.contains("anticipato.takeIf { usaAnticipo && it?.di === presa }"))
        val anticipa = sorgente.substringAfter("fun anticipa(call: PluginCall)").substringBefore("private fun decodifica")
        assertTrue(anticipa.contains("if (cattura !== presa) return@execute"))
        assertTrue(anticipa.contains("anticipato = Anticipato(presa, testo)"))
        val ascolta = sorgente.substringAfter("fun ascolta(call: PluginCall)").substringBefore("@PluginMethod")
        assertTrue(ascolta.contains("anticipato = null"))
        val annulla = sorgente.substringAfter("fun annulla(call: PluginCall)").substringBefore("\n    }\n")
        assertTrue(annulla.contains("anticipato = null"))
    }
}
