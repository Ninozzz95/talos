package ai.talos.terminal

import java.io.DataInputStream
import java.io.EOFException
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest
import org.json.JSONObject

/**
 * K2-B, parte B2 (ledger `LEDGER-K2B-R4-NELL-APP-2026-10-14.md`; owner 14/10 «Archivio unico»): il pacchetto del server r4
 * arriva nell'APK come UN archivio ustar puro (`scripts/r4-mobile/archivio-r4.mjs`). Qui si estrae con un lettore severo: solo
 * file regolari e cartelle, checksum di ogni intestazione, nessun percorso fuori dalla cartella. Poi si controlla ogni file contro
 * il manifesto del pacchetto, e solo allora il pacchetto nuovo prende il posto di quello di prima. Un'estrazione interrotta o
 * un file che non torna lasciano il pacchetto di prima com'era: mai un server a metà.
 */
object TalosR4Archivio {
    const val CARTELLA_PACCHETTO = "pacchetto"
    private const val CARTELLA_NUOVA = ".nuovo"
    private const val CARTELLA_VECCHIA = ".vecchio"
    const val MANIFESTO = "manifesto-pacchetto-r4.json"
    private const val SCHEMA = "talos.mobile.kernel-r4-pacchetto.v1"
    private const val BLOCCO = 512

    class ArchivioNonValido(messaggio: String) : IOException(messaggio)

    enum class Tipo { FILE, CARTELLA }
    data class Voce(val nome: String, val tipo: Tipo, val misura: Long)

    /** Un percorso relativo dentro la cartella: niente assoluti, `..`, `.`, `\`, NUL o pezzi vuoti. */
    fun percorsoSicuro(nome: String): Boolean {
        if (nome.isEmpty() || nome.startsWith("/") || '\\' in nome || '\u0000' in nome) return false
        return nome.split('/').none { it.isEmpty() || it == "." || it == ".." }
    }

    private fun campo(blocco: ByteArray, da: Int, lunghezza: Int): String {
        var fine = da
        while (fine < da + lunghezza && blocco[fine] != 0.toByte()) fine++
        return String(blocco, da, fine - da, Charsets.ISO_8859_1)
    }

    /** L'intestazione di un blocco; `null` per un blocco tutto vuoto (la fine). Ogni altra cosa che non torna è un errore. */
    fun leggiIntestazione(blocco: ByteArray): Voce? {
        require(blocco.size == BLOCCO)
        if (blocco.all { it == 0.toByte() }) return null
        if (campo(blocco, 257, 6) != "ustar" || campo(blocco, 263, 2) != "00") throw ArchivioNonValido("not a ustar header")
        val dichiarato = campo(blocco, 148, 8).trim().toIntOrNull(8) ?: throw ArchivioNonValido("unreadable header checksum")
        val calcolato = blocco.indices.sumOf { i -> if (i in 148 until 156) 32 else blocco[i].toInt() and 0xff }
        if (dichiarato != calcolato) throw ArchivioNonValido("header checksum does not match")
        val tipo = when (blocco[156].toInt().toChar()) {
            '0', '\u0000' -> Tipo.FILE
            '5' -> Tipo.CARTELLA
            else -> throw ArchivioNonValido("entry type '${blocco[156].toInt().toChar()}' is not allowed: only files and folders")
        }
        val prefisso = campo(blocco, 345, 155)
        val nome = if (prefisso.isEmpty()) campo(blocco, 0, 100) else "$prefisso/${campo(blocco, 0, 100)}"
        val misura = campo(blocco, 124, 12).trim().ifEmpty { "0" }.toLongOrNull(8) ?: throw ArchivioNonValido("unreadable size")
        if (!percorsoSicuro(nome.trimEnd('/'))) throw ArchivioNonValido("unsafe path in the archive")
        if (tipo == Tipo.CARTELLA && misura != 0L) throw ArchivioNonValido("a folder with content")
        return Voce(nome.trimEnd('/'), tipo, misura)
    }

    /** Estrae in `destinazione` (che deve esistere o si crea). Torna quanti file ha scritto. */
    fun estrai(ingresso: InputStream, destinazione: File): Int {
        val radice = destinazione.apply { mkdirs() }.canonicalFile
        val dati = DataInputStream(ingresso)
        val blocco = ByteArray(BLOCCO)
        val buffer = ByteArray(64 * 1024)
        var file = 0
        try {
            while (true) {
                dati.readFully(blocco)
                val voce = leggiIntestazione(blocco) ?: break
                val bersaglio = File(radice, voce.nome).canonicalFile
                if (!bersaglio.path.startsWith(radice.path + File.separator)) throw ArchivioNonValido("path outside the folder")
                if (voce.tipo == Tipo.CARTELLA) { bersaglio.mkdirs(); continue }
                bersaglio.parentFile?.mkdirs()
                bersaglio.outputStream().use { uscita ->
                    var resto = voce.misura
                    while (resto > 0) {
                        val n = dati.read(buffer, 0, minOf(buffer.size.toLong(), resto).toInt())
                        if (n < 0) throw EOFException()
                        uscita.write(buffer, 0, n)
                        resto -= n
                    }
                }
                val riempimento = ((BLOCCO - voce.misura % BLOCCO) % BLOCCO).toInt()
                if (riempimento > 0) dati.readFully(ByteArray(riempimento))
                file++
            }
        } catch (_: EOFException) {
            throw ArchivioNonValido("the archive ends before its end marker")
        }
        return file
    }

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { ingresso ->
            val buffer = ByteArray(64 * 1024)
            while (true) { val n = ingresso.read(buffer); if (n < 0) break; md.update(buffer, 0, n) }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    /** Ogni file del manifesto c'è, con impronta e misura, il conteggio torna, e non c'è nient'altro. Torna il numero di file. */
    fun verifica(cartella: File): Int {
        val radice = cartella.canonicalFile
        val manifesto = runCatching { JSONObject(File(radice, MANIFESTO).readText()) }.getOrNull()
            ?: throw ArchivioNonValido("package manifest missing or unreadable")
        if (manifesto.optString("schema") != SCHEMA) throw ArchivioNonValido("package manifest has another schema")
        val voci = manifesto.optJSONArray("file") ?: throw ArchivioNonValido("package manifest without files")
        if (manifesto.optInt("conteggio", -1) != voci.length()) throw ArchivioNonValido("package manifest count does not match")
        val attesi = HashSet<String>()
        for (i in 0 until voci.length()) {
            val voce = voci.getJSONObject(i)
            val percorso = voce.getString("percorso")
            if (!percorsoSicuro(percorso)) throw ArchivioNonValido("unsafe path in the manifest")
            val file = File(radice, percorso)
            if (!file.isFile || file.length() != voce.getLong("byte") || sha256(file) != voce.getString("sha256")) {
                throw ArchivioNonValido("a package file does not match the manifest")
            }
            attesi += percorso
        }
        val presenti = radice.walkTopDown().filter { it.isFile }
            .map { it.relativeTo(radice).invariantSeparatorsPath }.filter { it != MANIFESTO }.toSet()
        if (presenti != attesi) throw ArchivioNonValido("the package has files the manifest does not name")
        return attesi.size
    }

    /** Estrae in una cartella provvisoria, verifica, e solo allora scambia col pacchetto di prima. */
    fun installa(ingresso: InputStream, radice: File) {
        radice.mkdirs()
        val nuovo = File(radice, CARTELLA_NUOVA)
        val vecchio = File(radice, CARTELLA_VECCHIA)
        val pacchetto = File(radice, CARTELLA_PACCHETTO)
        nuovo.deleteRecursively()
        vecchio.deleteRecursively()
        try {
            estrai(ingresso, nuovo)
            verifica(nuovo)
        } catch (guasto: Throwable) {
            nuovo.deleteRecursively()
            throw guasto
        }
        if (pacchetto.exists() && !pacchetto.renameTo(vecchio)) {
            nuovo.deleteRecursively()
            throw IOException("could not move the previous package aside")
        }
        if (!nuovo.renameTo(pacchetto)) {
            vecchio.renameTo(pacchetto)
            nuovo.deleteRecursively()
            throw IOException("could not put the new package in place")
        }
        vecchio.deleteRecursively()
    }
}
