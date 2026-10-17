package ai.talos.terminal

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * K2-B, parte B2 (ledger `LEDGER-K2B-R4-NELL-APP-2026-10-14.md`; owner 14/10 «Archivio unico»): l'app estrae il pacchetto r4
 * da UN archivio ustar (`scripts/r4-mobile/archivio-r4.mjs`) con un lettore severo, controlla ogni file contro il manifesto e
 * solo allora lo mette al posto di quello di prima.
 */
class TalosR4ArchivioTest {
    private fun cartella(): File = Files.createTempDirectory("talos-r4-arc").toFile()

    /** Un'intestazione ustar come la scrive `archivio-r4.mjs`; `tipo` e `checksumGiusto` per le prove dei rifiuti. */
    private fun intestazione(nome: String, misura: Int, tipo: Char = '0', checksumGiusto: Boolean = true, prefisso: String = ""): ByteArray {
        val b = ByteArray(512)
        fun scrivi(testo: String, da: Int) = testo.toByteArray(Charsets.ISO_8859_1).copyInto(b, da)
        scrivi(nome, 0)
        scrivi("0000644\u0000", 100); scrivi("0000000\u0000", 108); scrivi("0000000\u0000", 116)
        scrivi(misura.toString(8).padStart(11, '0') + "\u0000", 124)
        scrivi("00000000000\u0000", 136)
        scrivi("        ", 148)
        b[156] = tipo.code.toByte()
        scrivi("ustar\u0000", 257); scrivi("00", 263)
        scrivi(prefisso, 345)
        val somma = b.sumOf { it.toInt() and 0xff } + if (checksumGiusto) 0 else 1
        scrivi(somma.toString(8).padStart(6, '0') + "\u0000 ", 148)
        return b
    }

    private fun archivio(vararg voci: Pair<String, ByteArray?>): ByteArray {
        val uscita = ByteArrayOutputStream()
        for ((nome, dati) in voci) {
            if (dati == null) { uscita.write(intestazione(nome, 0, '5')); continue }
            val diviso = if (nome.length > 100) nome.substringBeforeLast('/') to nome.substringAfterLast('/') else "" to nome
            uscita.write(intestazione(diviso.second, dati.size, prefisso = diviso.first))
            uscita.write(dati)
            if (dati.size % 512 != 0) uscita.write(ByteArray(512 - dati.size % 512))
        }
        uscita.write(ByteArray(1024))
        return uscita.toByteArray()
    }

    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

    private fun manifesto(vararg file: Pair<String, ByteArray>, conteggio: Int = file.size): ByteArray {
        val voci = file.joinToString(",") { (p, b) -> """{"percorso":"$p","sha256":"${sha(b)}","byte":${b.size}}""" }
        return """{"schema":"talos.mobile.kernel-r4-pacchetto.v1","commit":"${"a".repeat(40)}","conteggio":$conteggio,"file":[$voci]}"""
            .toByteArray()
    }

    private val lungo = "harness-ui/node_modules/@ai-sdk/openai/node_modules/@ai-sdk/provider/src/speech-translation-model/v4/" +
        "speech-translation-model-v4-stream-options.ts"

    @Test
    fun `ARCK-01 un archivio ustar si estrae, nomi lunghi compresi`() {
        val server = "export const server = 1\n".toByteArray()
        val grande = ByteArray(1300) { 'x'.code.toByte() }
        val dest = cartella()
        val n = TalosR4Archivio.estrai(
            ByteArrayInputStream(archivio("harness-ui/" to null, "harness-ui/server.mjs" to server, lungo to grande)), dest,
        )
        assertEquals(2, n)
        assertEquals("export const server = 1\n", File(dest, "harness-ui/server.mjs").readText())
        assertEquals(1300, File(dest, lungo).length())
    }

    @Test
    fun `ARCK-02 checksum sbagliato, collegamenti, pax e GNU sono rifiutati`() {
        val dest = cartella()
        val falso = ByteArrayOutputStream().apply { write(intestazione("a.txt", 0, checksumGiusto = false)); write(ByteArray(1024)) }
        assertTrue(runCatching { TalosR4Archivio.estrai(ByteArrayInputStream(falso.toByteArray()), dest) }.exceptionOrNull() is TalosR4Archivio.ArchivioNonValido)
        for (tipo in listOf('1', '2', 'x', 'g', 'L')) {
            val voce = ByteArrayOutputStream().apply { write(intestazione("a.txt", 0, tipo)); write(ByteArray(1024)) }
            val errore = runCatching { TalosR4Archivio.estrai(ByteArrayInputStream(voce.toByteArray()), cartella()) }.exceptionOrNull()
            assertTrue("tipo $tipo", errore is TalosR4Archivio.ArchivioNonValido)
        }
        // un archivio troncato non è un archivio finito
        val troncato = archivio("a.txt" to ByteArray(2000)).copyOf(512 + 1000)
        assertTrue(runCatching { TalosR4Archivio.estrai(ByteArrayInputStream(troncato), cartella()) }.exceptionOrNull() is TalosR4Archivio.ArchivioNonValido)
    }

    @Test
    fun `ARCK-03 solo percorsi relativi, dentro la cartella`() {
        for (buono in listOf("harness-ui/server.mjs", "docs/assistenza/README.md", "a", lungo)) {
            assertTrue(buono, TalosR4Archivio.percorsoSicuro(buono))
        }
        for (cattivo in listOf("", "/etc/passwd", "../fuori", "a/../../fuori", "a/./b", "a\\b", "a\u0000b", "a//b", ".")) {
            assertFalse(cattivo, TalosR4Archivio.percorsoSicuro(cattivo))
        }
        val dest = cartella()
        val errore = runCatching { TalosR4Archivio.estrai(ByteArrayInputStream(archivio("../fuori.txt" to ByteArray(1))), dest) }.exceptionOrNull()
        assertTrue(errore is TalosR4Archivio.ArchivioNonValido)
        assertFalse(File(dest.parentFile, "fuori.txt").exists())
    }

    @Test
    fun `ARCK-04 la verifica vuole ogni file del manifesto, con impronta e misura, e niente di piu'`() {
        val server = "export const server = 1\n".toByteArray()
        val dest = cartella()
        val m = manifesto("harness-ui/server.mjs" to server)
        TalosR4Archivio.estrai(ByteArrayInputStream(archivio("manifesto-pacchetto-r4.json" to m, "harness-ui/server.mjs" to server)), dest)
        assertEquals(1, TalosR4Archivio.verifica(dest))
        File(dest, "harness-ui/server.mjs").writeText("cambiato")
        assertTrue(runCatching { TalosR4Archivio.verifica(dest) }.exceptionOrNull() is TalosR4Archivio.ArchivioNonValido)
        File(dest, "harness-ui/server.mjs").writeBytes(server)
        File(dest, "intruso.js").writeText("x")
        assertTrue(runCatching { TalosR4Archivio.verifica(dest) }.exceptionOrNull() is TalosR4Archivio.ArchivioNonValido)
        File(dest, "intruso.js").delete()
        File(dest, "manifesto-pacchetto-r4.json").writeBytes(manifesto("harness-ui/server.mjs" to server, conteggio = 2))
        assertTrue(runCatching { TalosR4Archivio.verifica(dest) }.exceptionOrNull() is TalosR4Archivio.ArchivioNonValido)
    }

    @Test
    fun `ARCK-05 installa mette il pacchetto nuovo solo se e' verificato, altrimenti resta quello di prima`() {
        val radice = cartella()
        val v1 = "versione 1\n".toByteArray()
        val v2 = "versione 2\n".toByteArray()
        val primo = archivio("manifesto-pacchetto-r4.json" to manifesto("server.mjs" to v1), "server.mjs" to v1)
        TalosR4Archivio.installa(ByteArrayInputStream(primo), radice)
        val pacchetto = File(radice, TalosR4Archivio.CARTELLA_PACCHETTO)
        assertEquals("versione 1\n", File(pacchetto, "server.mjs").readText())
        // un archivio il cui manifesto non torna: errore, e il pacchetto di prima resta intatto
        val rotto = archivio("manifesto-pacchetto-r4.json" to manifesto("server.mjs" to v2), "server.mjs" to v1)
        assertTrue(runCatching { TalosR4Archivio.installa(ByteArrayInputStream(rotto), radice) }.isFailure)
        assertEquals("versione 1\n", File(pacchetto, "server.mjs").readText())
        assertEquals(setOf(TalosR4Archivio.CARTELLA_PACCHETTO), radice.list()!!.toSet())
        val secondo = archivio("manifesto-pacchetto-r4.json" to manifesto("server.mjs" to v2), "server.mjs" to v2)
        TalosR4Archivio.installa(ByteArrayInputStream(secondo), radice)
        assertEquals("versione 2\n", File(pacchetto, "server.mjs").readText())
        assertEquals(setOf(TalosR4Archivio.CARTELLA_PACCHETTO), radice.list()!!.toSet())
    }
}
