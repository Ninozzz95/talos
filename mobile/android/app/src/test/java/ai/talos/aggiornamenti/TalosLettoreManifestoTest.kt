package ai.talos.aggiornamenti

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Il manifesto dell'aggiornamento: la forma `latest.yml` di electron-builder, la stessa del desktop (owner 22/10, decisione 6),
 * letta da un lettore RIGOROSO come `firma-aggiornamenti.mjs:31-56` del desktop. Un campo doppio, sconosciuto o malformato è
 * un rifiuto: il manifesto lo scriviamo noi in CI, e qualunque cosa diversa da come lo scriviamo non è nostra.
 * Ledger: `.claude/ragionamento/LEDGER-AGGIORNAMENTO-AUTOMATICO-MOBILE-2026-10-22.md`.
 */
class TalosLettoreManifestoTest {

    private val impronta = "A".repeat(86) + "=="

    private fun manifesto(
        version: String = "0.1.44",
        url: String = "TALOS-0.1.44.apk",
        path: String = "TALOS-0.1.44.apk",
        sha: String = impronta,
        shaFile: String = impronta,
        extra: String = "",
    ) = """
        |version: $version
        |files:
        |  - url: $url
        |    sha512: $shaFile
        |    size: 192749764
        |path: $path
        |sha512: $sha
        |releaseDate: '2026-10-23T10:00:00.000Z'
        |$extra""".trimMargin().toByteArray(Charsets.UTF_8)

    private fun rifiutato(byte: ByteArray): String {
        try {
            TalosLettoreManifesto.leggi(byte)
        } catch (rifiuto: TalosManifestoRifiutato) {
            return rifiuto.motivo
        }
        fail("il manifesto doveva essere rifiutato")
        error("irraggiungibile")
    }

    @Test
    fun `AGG-MAN-01 il manifesto scritto dalla CI si legge per intero`() {
        val letto = TalosLettoreManifesto.leggi(manifesto())
        assertEquals("0.1.44", letto.version)
        assertEquals("TALOS-0.1.44.apk", letto.path)
        assertEquals(impronta, letto.sha512)
        assertEquals(192749764L, letto.size)
        assertEquals("2026-10-23T10:00:00.000Z", letto.releaseDate)
    }

    @Test
    fun `AGG-MAN-02 un campo doppio si rifiuta`() {
        assertEquals("campo-doppio", rifiutato(manifesto(extra = "version: 9.9.9")))
    }

    @Test
    fun `AGG-MAN-03 un campo che non scriviamo si rifiuta`() {
        assertEquals("campo-sconosciuto", rifiutato(manifesto(extra = "stagingPercentage: 10")))
    }

    @Test
    fun `AGG-MAN-04 il nome del file e' un nome semplice, mai un percorso`() {
        assertEquals("nome-del-file", rifiutato(manifesto(path = "../TALOS.apk", url = "../TALOS.apk")))
        assertEquals("nome-del-file", rifiutato(manifesto(path = "a/TALOS.apk", url = "a/TALOS.apk")))
        assertEquals("nome-del-file", rifiutato(manifesto(path = "TALOS-0.1.44.exe", url = "TALOS-0.1.44.exe")))
    }

    @Test
    fun `AGG-MAN-05 l'impronta e' sha512 in base64 di 88 caratteri`() {
        assertEquals("impronta", rifiutato(manifesto(sha = "abc", shaFile = "abc")))
        assertEquals("impronta", rifiutato(manifesto(sha = "!".repeat(88), shaFile = "!".repeat(88))))
    }

    @Test
    fun `AGG-MAN-06 il primo file e il campo di primo livello dicono la stessa cosa`() {
        assertEquals("file-diverso", rifiutato(manifesto(url = "TALOS-0.1.43.apk")))
        assertEquals("file-diverso", rifiutato(manifesto(shaFile = "B".repeat(86) + "==")))
    }

    @Test
    fun `AGG-MAN-07 la versione e' x punto y punto z`() {
        assertEquals("versione", rifiutato(manifesto(version = "0.1.44-beta")))
        assertEquals("versione", rifiutato(manifesto(version = "v0.1.44")))
    }

    @Test
    fun `AGG-MAN-08 BOM e righe CRLF non cambiano la lettura, un file vuoto o troppo grande si rifiuta`() {
        val crlf = ("\uFEFF" + String(manifesto(), Charsets.UTF_8).replace("\n", "\r\n")).toByteArray(Charsets.UTF_8)
        assertEquals("0.1.44", TalosLettoreManifesto.leggi(crlf).version)
        assertEquals("vuoto", rifiutato(ByteArray(0)))
        assertEquals("troppo-grande", rifiutato(ByteArray(64 * 1024 + 1) { 'a'.code.toByte() }))
    }

    @Test
    fun `AGG-MAN-09 la data e la dimensione possono mancare, il resto no`() {
        val minimo = """
            |version: 0.1.44
            |files:
            |  - url: TALOS-0.1.44.apk
            |    sha512: $impronta
            |path: TALOS-0.1.44.apk
            |sha512: $impronta
            |""".trimMargin().toByteArray(Charsets.UTF_8)
        val letto = TalosLettoreManifesto.leggi(minimo)
        assertNull(letto.size)
        assertNull(letto.releaseDate)
        val senzaPath = String(minimo, Charsets.UTF_8).replace("path: TALOS-0.1.44.apk\n", "")
        assertTrue(rifiutato(senzaPath.toByteArray(Charsets.UTF_8)) == "campo-mancante")
    }
}
