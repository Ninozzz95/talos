package ai.talos.remoto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.File
import java.security.MessageDigest
import java.util.Base64

/**
 * ⛔ R5.13 scambio di file, fetta F1 (ledger `LEDGER-SCAMBIO-FILE-R5-13-CODICE-DISPOSITIVO-2026-10-25.md`): i byte stanno in Kotlin.
 * Il PC (`harness-ui/src/remoto/file-dispositivi.mjs` di r4 `d3d36f1c6`) vuole pezzi base64url di al più 512 KiB, uno sha256 in
 * esadecimale minuscolo, un tetto di 25 MiB; e decide il tipo sui byte (`tipoDaiByte`). Qui la stessa cosa dal lato del dispositivo.
 */
class TalosRemotoFileTest {
    @get:Rule val cartella = TemporaryFolder()

    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
    private fun byte(n: Int) = ByteArray(n) { (it * 31 + 7).toByte() }
    private fun b64url(b: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(b)

    @Test
    fun `FR-01 misura e sha256 di uno stream, in esadecimale minuscolo come il PC`() {
        val dati = byte(1_300_000)
        val m = TalosRemotoFile.misura { ByteArrayInputStream(dati) }
        assertEquals(dati.size.toLong(), m.dimensione)
        assertEquals(sha(dati), m.sha256)
    }

    @Test
    fun `FR-02 oltre 25 MiB si ferma con FILE_TOO_LARGE senza leggere tutto`() {
        var letti = 0L
        val infinito = object : java.io.InputStream() {
            override fun read(): Int { letti++; return 1 }
            override fun read(b: ByteArray, off: Int, len: Int): Int { letti += len; java.util.Arrays.fill(b, off, off + len, 1); return len }
        }
        val e = assertThrows(TalosRemotoFile.ErroreFile::class.java) { TalosRemotoFile.misura { infinito } }
        assertEquals("FILE_TOO_LARGE", e.codice)
        assertTrue(letti <= TalosRemotoFile.MASSIMO + 2 * 65_536)
    }

    @Test
    fun `FR-03 un pezzo da qualunque scostamento, base64url senza riempimento, mai oltre 512 KiB`() {
        val dati = byte(1_300_000)
        val p = TalosRemotoFile.pezzo({ ByteArrayInputStream(dati) }, da = 600_000, quanti = 1_000_000)
        val atteso = dati.copyOfRange(600_000, 600_000 + TalosRemotoFile.PEZZO_MASSIMO)
        assertArrayEquals(atteso, Base64.getUrlDecoder().decode(p))
        assertFalse(p.contains('=') || p.contains('+') || p.contains('/'))
        assertEquals("", TalosRemotoFile.pezzo({ ByteArrayInputStream(dati) }, da = dati.size.toLong(), quanti = 10))
    }

    @Test
    fun `FR-04 lo scarico accoda solo dal punto giusto ed e idempotente come il PC`() {
        val dati = byte(700_000)
        val parziale = File(cartella.root, "x.part")
        assertEquals(400_000L, TalosRemotoFile.accoda(parziale, 0, b64url(dati.copyOfRange(0, 400_000))))
        assertEquals(400_000L, parziale.length())
        // ripetuto: niente si riscrive
        TalosRemotoFile.accoda(parziale, 0, b64url(dati.copyOfRange(0, 400_000)))
        assertEquals(400_000L, parziale.length())
        val e = assertThrows(TalosRemotoFile.ErroreFile::class.java) { TalosRemotoFile.accoda(parziale, 500_000, b64url(byte(10))) }
        assertEquals("OFFSET_MISMATCH", e.codice)
        assertEquals(400_000L, e.ricevuti)
        TalosRemotoFile.accoda(parziale, 400_000, b64url(dati.copyOfRange(400_000, dati.size)))
        assertArrayEquals(dati, parziale.readBytes())
    }

    @Test
    fun `FR-05 uno sha256 diverso butta il parziale e non lascia nessun file`() {
        val parziale = File(cartella.root, "y.part").apply { writeBytes(byte(1000)) }
        val finale = File(cartella.root, "y.bin")
        val e = assertThrows(TalosRemotoFile.ErroreFile::class.java) { TalosRemotoFile.concludi(parziale, finale, "0".repeat(64)) }
        assertEquals("CHECKSUM_MISMATCH", e.codice)
        assertFalse(parziale.exists())
        assertFalse(finale.exists())
        val buono = File(cartella.root, "z.part").apply { writeBytes(byte(1000)) }
        val fatto = File(cartella.root, "z.bin")
        TalosRemotoFile.concludi(buono, fatto, sha(byte(1000)))
        assertTrue(fatto.exists() && !buono.exists())
    }

    @Test
    fun `FR-06 il tipo dai byte come tipoDaiByte del PC, e gli eseguibili riconosciuti dai byte`() {
        assertEquals("image/png", TalosRemotoFile.tipo(byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0, 0)).mime)
        assertEquals("application/pdf", TalosRemotoFile.tipo("%PDF-1.7".toByteArray()).mime)
        assertEquals("text/plain", TalosRemotoFile.tipo("ciao è".toByteArray()).mime)
        val apk = byteArrayOf(0x50, 0x4b, 0x03, 0x04) + "....AndroidManifest.xml....classes.dex".toByteArray()
        assertTrue(TalosRemotoFile.tipo(apk).eseguibile)
        assertTrue(TalosRemotoFile.tipo(byteArrayOf(0x7f, 0x45, 0x4c, 0x46, 2, 1)).eseguibile) // ELF
        assertTrue(TalosRemotoFile.tipo("dex\n035\u0000".toByteArray()).eseguibile)
        assertTrue(TalosRemotoFile.tipo("#!/bin/sh\necho ciao\n".toByteArray()).eseguibile)
        assertFalse(TalosRemotoFile.tipo(byteArrayOf(0x50, 0x4b, 0x03, 0x04) + "word/document.xml".toByteArray()).eseguibile)
        assertFalse(TalosRemotoFile.tipo("%PDF-1.7".toByteArray()).eseguibile)
    }

    @Test
    fun `FR-07 lo spazio libero si controlla prima, col margine`() {
        val e = assertThrows(TalosRemotoFile.ErroreFile::class.java) { TalosRemotoFile.controllaSpazio(servono = 2_400_000, liberi = 1_100_000) }
        assertEquals("NO_SPACE", e.codice)
        assertEquals(2_400_000L, e.servono)
        assertEquals(1_100_000L, e.liberi)
        TalosRemotoFile.controllaSpazio(servono = 1_000, liberi = 100_000_000)
    }

    @Test
    fun `FR-08 il nome locale e una chiave esadecimale e il file resta nella sua cartella`() {
        val chiave = TalosRemotoFile.chiave("pc1", "sessione", "fileId", "versione")
        assertTrue(Regex("^[0-9a-f]{64}$").matches(chiave))
        val f = TalosRemotoFile.fileNellaCartella(cartella.root, "$chiave.part")
        assertEquals(cartella.root.canonicalFile, f.canonicalFile.parentFile)
        for (storto in listOf("../fuori.part", "a/b.part", "", "..")) {
            assertThrows(TalosRemotoFile.ErroreFile::class.java) { TalosRemotoFile.fileNellaCartella(cartella.root, storto) }
        }
        assertEquals(chiave, TalosRemotoFile.chiave("pc1", "sessione", "fileId", "versione"))
        assertFalse(chiave == TalosRemotoFile.chiave("pc1", "sessione", "fileId", "versione2"))
    }

    @Test
    fun `FR-10 revisione S4-4 - il nome per Salva in non esce dalla cartella - soli punti diventano file`() {
        for (storto in listOf(".", "..", "...", "", "   ", " .. ")) assertEquals(storto, "file", TalosRemotoFile.nomeSicuro(storto))
        assertEquals("a_b_c.pdf", TalosRemotoFile.nomeSicuro("a/b\\c.pdf"))
        assertEquals("report.pdf", TalosRemotoFile.nomeSicuro("report.pdf"))
        assertEquals(180, TalosRemotoFile.nomeSicuro("x".repeat(400)).length)
        val export = cartella.newFolder("talos-export")
        for (n in listOf("..", ".", "../x", "a/../../b")) {
            assertEquals(export.canonicalFile, File(export, TalosRemotoFile.nomeSicuro(n)).canonicalFile.parentFile)
        }
    }

    @Test
    fun `FR-09 un pezzo base64url storto si rifiuta senza scrivere`() {
        val parziale = File(cartella.root, "w.part")
        for (storto in listOf("a+b/", "@@", "")) {
            val e = assertThrows(TalosRemotoFile.ErroreFile::class.java) { TalosRemotoFile.accoda(parziale, 0, storto) }
            assertEquals("BAD_MESSAGE", e.codice)
        }
        assertFalse(parziale.exists() && parziale.length() > 0)
    }

    /**
     * ⛔ D-F3-6 (dal Pad, 25/10, vc199 sul 4177): `PluginCall.getLong` di Capacitor torna il valore SOLO se è già un `Long`. Un numero
     * piccolo da JS arriva come `Integer` dopo il parsing JSON: `getLong("da")` dava null ⇒ -1 ⇒ `pezzo` rifiutava ogni pezzo. Al PC
     * arrivava `begin` e nessun pezzo (trasferimenti con `.part` di 0 byte). `intero` legge Integer, Long e Double interi.
     */
    @Test
    fun `FR-11 un numero intero da JS si legge come Integer Long o Double intero, il resto no`() {
        assertEquals(0L, TalosRemotoFile.intero(0))
        assertEquals(524_288L, TalosRemotoFile.intero(524_288))
        assertEquals(26_214_400L, TalosRemotoFile.intero(26_214_400L))
        assertEquals(3L, TalosRemotoFile.intero(3.0))
        assertEquals(null, TalosRemotoFile.intero(1.5))
        assertEquals(null, TalosRemotoFile.intero(Double.NaN))
        assertEquals(null, TalosRemotoFile.intero("3"))
        assertEquals(null, TalosRemotoFile.intero(null))
    }

    @Test
    fun `FR-12 il plugin non legge mai i numeri con getLong o getInt di Capacitor`() {
        val sorgente = sequenceOf("src/main/java/ai/talos/remoto/TalosRemotoFilePlugin.kt", "app/src/main/java/ai/talos/remoto/TalosRemotoFilePlugin.kt")
            .map { File(it) }.first { it.isFile }.readText()
        assertFalse("getLong torna null per un Integer da JS", sorgente.contains("call.getLong("))
        assertFalse("getInt torna null per un Long o un Double da JS", sorgente.contains("call.getInt("))
    }

    /** ⛔ B9-9 (revisione del blocco 9): un Double da 2^63 in su non è un intero lungo (dava Long.MAX_VALUE); fuori misura è null. */
    @Test
    fun `FR-13 un numero fuori dai Long non diventa il massimo`() {
        assertEquals(null, TalosRemotoFile.intero(9.223372036854775807E18))
        assertEquals(null, TalosRemotoFile.intero(1e19))
        assertEquals(null, TalosRemotoFile.intero(-1e19))
        assertEquals(1L shl 52, TalosRemotoFile.intero((1L shl 52).toDouble()))
    }

    /** ⛔ B9-9: un pezzo chiesto fuori misura si rifiuta, non si riduce in silenzio. */
    @Test
    fun `FR-14 la misura di un pezzo va da 1 byte a 512 KiB, il resto si rifiuta`() {
        assertEquals(1, TalosRemotoFile.quanti(1))
        assertEquals(TalosRemotoFile.PEZZO_MASSIMO, TalosRemotoFile.quanti(TalosRemotoFile.PEZZO_MASSIMO))
        assertEquals(null, TalosRemotoFile.quanti(0))
        assertEquals(null, TalosRemotoFile.quanti(TalosRemotoFile.PEZZO_MASSIMO + 1))
        assertEquals(null, TalosRemotoFile.quanti(-5))
        assertEquals(null, TalosRemotoFile.quanti("7"))
        val sorgente = sequenceOf("src/main/java/ai/talos/remoto/TalosRemotoFilePlugin.kt", "app/src/main/java/ai/talos/remoto/TalosRemotoFilePlugin.kt")
            .map { File(it) }.first { it.isFile }.readText()
        assertFalse("la misura non si riduce in silenzio", sorgente.contains("coerceIn("))
    }
}
