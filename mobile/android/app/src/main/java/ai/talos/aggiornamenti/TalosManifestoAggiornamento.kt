package ai.talos.aggiornamenti

/**
 * Il manifesto dell'aggiornamento del mobile: `latest-android.yml`, nella forma `latest.yml` di electron-builder che usa anche il
 * desktop (owner 22/10/2026, decisione 6). La CI lo scrive sempre così:
 *
 * ```
 * version: 0.1.44
 * files:
 *   - url: TALOS-0.1.44.apk
 *     sha512: <base64, 88 caratteri>
 *     size: 192749764
 * path: TALOS-0.1.44.apk
 * sha512: <lo stesso>
 * releaseDate: '2026-10-23T10:00:00.000Z'
 * ```
 */
data class TalosManifestoAggiornamento(
    val version: String,
    val path: String,
    val sha512: String,
    val size: Long?,
    val releaseDate: String?,
)

/** Il motivo è una parola fissa (va nei registri e nei test), mai il testo del manifesto. */
class TalosManifestoRifiutato(val motivo: String) : Exception(motivo)

/**
 * Un lettore RIGOROSO, non una libreria YAML: legge solo la forma qui sopra, come il desktop (`firma-aggiornamenti.mjs:31-56`).
 * Il manifesto lo scriviamo noi e la sua firma è già stata verificata quando arriva qui; tutto ciò che non ha quella forma è un
 * rifiuto, mai un'interpretazione.
 */
object TalosLettoreManifesto {

    const val MASSIMO_BYTE = 64 * 1024

    private val CHIAVE_IN_CIMA = Regex("""^([A-Za-z0-9]+):(?: (.*))?$""")
    private val PRIMA_DEL_FILE = Regex("""^ {2}- ([A-Za-z0-9]+): (.*)$""")
    private val DENTRO_IL_FILE = Regex("""^ {4}([A-Za-z0-9]+): (.*)$""")
    private val NOME_APK = Regex("""^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.apk$""")
    private val SHA512_BASE64 = Regex("""^[A-Za-z0-9+/]{86}==$""")
    private val CIFRE = Regex("""^\d{1,12}$""")

    private val IN_CIMA = setOf("version", "files", "path", "sha512", "releaseDate")
    private val NEL_FILE = setOf("url", "sha512", "size")

    fun leggi(byte: ByteArray): TalosManifestoAggiornamento {
        if (byte.isEmpty()) throw TalosManifestoRifiutato("vuoto")
        if (byte.size > MASSIMO_BYTE) throw TalosManifestoRifiutato("troppo-grande")
        val testo = String(byte, Charsets.UTF_8).removePrefix("﻿").replace("\r\n", "\n")

        val cima = mutableMapOf<String, String>()
        val file = mutableMapOf<String, String>()
        var fileVisti = 0
        var dentroFiles = false

        for (riga in testo.split('\n')) {
            if (riga.isBlank()) continue
            val inCima = CHIAVE_IN_CIMA.matchEntire(riga)
            if (inCima != null) {
                val chiave = inCima.groupValues[1]
                if (chiave !in IN_CIMA) throw TalosManifestoRifiutato("campo-sconosciuto")
                if (chiave in cima) throw TalosManifestoRifiutato("campo-doppio")
                val valore = inCima.groupValues[2]
                dentroFiles = chiave == "files"
                if (dentroFiles != valore.isEmpty()) throw TalosManifestoRifiutato("forma")
                cima[chiave] = valore
                continue
            }
            if (!dentroFiles) throw TalosManifestoRifiutato("forma")
            val primo = PRIMA_DEL_FILE.matchEntire(riga)
            val coppia = primo ?: DENTRO_IL_FILE.matchEntire(riga) ?: throw TalosManifestoRifiutato("forma")
            if (primo != null) fileVisti += 1
            // solo il primo file conta, come il desktop; un secondo file non è nella forma che scriviamo
            if (fileVisti != 1) throw TalosManifestoRifiutato("forma")
            val chiave = coppia.groupValues[1]
            if (chiave !in NEL_FILE) throw TalosManifestoRifiutato("campo-sconosciuto")
            if (chiave in file) throw TalosManifestoRifiutato("campo-doppio")
            file[chiave] = coppia.groupValues[2]
        }

        val version = cima["version"] ?: throw TalosManifestoRifiutato("campo-mancante")
        val path = cima["path"] ?: throw TalosManifestoRifiutato("campo-mancante")
        val sha512 = cima["sha512"] ?: throw TalosManifestoRifiutato("campo-mancante")
        if ("files" !in cima || fileVisti != 1) throw TalosManifestoRifiutato("campo-mancante")
        val url = file["url"] ?: throw TalosManifestoRifiutato("campo-mancante")
        val shaFile = file["sha512"] ?: throw TalosManifestoRifiutato("campo-mancante")

        if (!TalosVersioneAggiornamento.valida(version)) throw TalosManifestoRifiutato("versione")
        if (!NOME_APK.matches(path) || !NOME_APK.matches(url)) throw TalosManifestoRifiutato("nome-del-file")
        if (!SHA512_BASE64.matches(sha512) || !SHA512_BASE64.matches(shaFile)) throw TalosManifestoRifiutato("impronta")
        if (url != path || shaFile != sha512) throw TalosManifestoRifiutato("file-diverso")
        val size = file["size"]?.let {
            if (!CIFRE.matches(it)) throw TalosManifestoRifiutato("dimensione")
            it.toLong()
        }
        val releaseDate = cima["releaseDate"]?.let { senzaApici(it) }
        return TalosManifestoAggiornamento(version, path, sha512, size, releaseDate)
    }

    private fun senzaApici(valore: String): String {
        val v = valore.trim()
        return if (v.length >= 2 && (v.first() == '\'' && v.last() == '\'' || v.first() == '"' && v.last() == '"')) {
            v.substring(1, v.length - 1)
        } else v
    }
}
