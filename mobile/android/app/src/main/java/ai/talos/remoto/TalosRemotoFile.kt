package ai.talos.remoto

import java.io.File
import java.io.InputStream
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.util.Base64

/**
 * ⛔ R5.13 scambio di file, fetta F1 (ledger `LEDGER-SCAMBIO-FILE-R5-13-CODICE-DISPOSITIVO-2026-10-25.md`; mockup approvati
 * dall'owner il 25/10): i BYTE dei file scambiati col PC stanno in Kotlin. Alla pagina passa solo un pezzo alla volta in base64url,
 * mai il file intero (contratto, «Revision 1», Q1).
 *
 * Le forme sono quelle del PC, `harness-ui/src/remoto/file-dispositivi.mjs` di r4 `d3d36f1c6`:
 *  - pezzi di al più 512 KiB (`PEZZO_MASSIMO`), base64url senza riempimento;
 *  - sha256 in esadecimale minuscolo; tetto 25 MiB (`MAX_CHAT_FILE_BYTES`);
 *  - un pezzo che parte da `da ≠ ricevuti` si rifiuta col `ricevuti`; uno già scritto è idempotente (come `pezzo` del PC, tus 1.0);
 *  - il tipo sui primi byte, come `tipoDaiByte`; in più, qui, `eseguibile` (APK, DEX, ELF, script): un file così da questa app
 *    si SALVA soltanto, non si apre mai (contratto P2.3).
 * Qui niente Android: il plugin (`TalosRemotoFilePlugin.kt`) apre gli stream `content://` e chiede lo spazio a StatFs.
 */
object TalosRemotoFile {
    const val PEZZO_MASSIMO = 512 * 1024
    const val MASSIMO: Long = 25L * 1024 * 1024
    /** Lo spazio che resta libero dopo uno scarico: la cache non si riempie fino all'ultimo byte. */
    const val MARGINE: Long = 8L * 1024 * 1024
    private const val TESTA = 4096
    private val BASE64URL = Regex("^[A-Za-z0-9_-]+$")
    private val NOME_LOCALE = Regex("^[0-9a-f]{64}\\.(part|bin)$")

    class ErroreFile(
        val codice: String,
        messaggio: String,
        val ricevuti: Long? = null,
        val servono: Long? = null,
        val liberi: Long? = null,
    ) : IllegalStateException(messaggio)

    data class Misura(val dimensione: Long, val sha256: String)
    data class Tipo(val mime: String, val immagine: Boolean, val eseguibile: Boolean)

    private fun esa(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    /** Dimensione e sha256 di uno stream, letto una volta; oltre il tetto si ferma subito. */
    fun misura(apri: () -> InputStream): Misura {
        val h = MessageDigest.getInstance("SHA-256")
        var totale = 0L
        apri().use { ingresso ->
            val buf = ByteArray(1 shl 16)
            while (true) {
                val n = ingresso.read(buf)
                if (n < 0) break
                totale += n
                if (totale > MASSIMO) throw ErroreFile("FILE_TOO_LARGE", "A file can be at most $MASSIMO bytes.")
                h.update(buf, 0, n)
            }
        }
        return Misura(totale, esa(h.digest()))
    }

    /** Il pezzo da `da`, al più 512 KiB, in base64url. Vuoto alla fine dello stream. */
    fun pezzo(apri: () -> InputStream, da: Long, quanti: Int): String {
        if (da < 0 || quanti < 1) throw ErroreFile("BAD_MESSAGE", "A chunk needs a byte offset and a size.")
        val voluti = minOf(quanti, PEZZO_MASSIMO)
        apri().use { ingresso ->
            var saltati = 0L
            while (saltati < da) {
                val s = ingresso.skip(da - saltati)
                if (s <= 0) { if (ingresso.read() < 0) return ""; saltati += 1 } else saltati += s
            }
            val buf = ByteArray(voluti)
            var letti = 0
            while (letti < voluti) {
                val n = ingresso.read(buf, letti, voluti - letti)
                if (n < 0) break
                letti += n
            }
            return Base64.getUrlEncoder().withoutPadding().encodeToString(buf.copyOf(letti))
        }
    }

    /** Accoda un pezzo allo scarico: solo dal punto in cui il parziale è arrivato; un pezzo già scritto non si riscrive. */
    fun accoda(parziale: File, da: Long, dati: String): Long {
        if (!BASE64URL.matches(dati) || dati.length % 4 == 1) throw ErroreFile("BAD_MESSAGE", "A chunk must be base64url.")
        val byte = try { Base64.getUrlDecoder().decode(dati) } catch (e: IllegalArgumentException) {
            throw ErroreFile("BAD_MESSAGE", "A chunk must be base64url.")
        }
        if (byte.isEmpty() || byte.size > PEZZO_MASSIMO) throw ErroreFile("BAD_MESSAGE", "A chunk carries from 1 byte to 512 KiB.")
        val ricevuti = if (parziale.exists()) parziale.length() else 0L
        if (da + byte.size <= ricevuti) return ricevuti
        if (da != ricevuti) throw ErroreFile("OFFSET_MISMATCH", "This chunk starts at $da, the device has $ricevuti bytes.", ricevuti = ricevuti)
        if (ricevuti + byte.size > MASSIMO) throw ErroreFile("FILE_TOO_LARGE", "A file can be at most $MASSIMO bytes.")
        RandomAccessFile(parziale, "rw").use { f -> f.seek(ricevuti); f.write(byte) }
        return ricevuti + byte.size
    }

    /** Fine dello scarico: lo sha256 deve tornare (se il PC lo dà), poi il parziale diventa il file. Se non torna, nulla resta. */
    fun concludi(parziale: File, finale: File, sha256Atteso: String?) {
        if (sha256Atteso != null) {
            val letto = misura { parziale.inputStream() }.sha256
            if (!letto.equals(sha256Atteso, ignoreCase = true)) {
                parziale.delete()
                throw ErroreFile("CHECKSUM_MISMATCH", "The file arrived different from the original.")
            }
        }
        if (finale.exists()) finale.delete()
        if (!parziale.renameTo(finale)) throw ErroreFile("FILE_WRITE_FAILED", "The downloaded file cannot be kept.")
    }

    /** Il tipo dai primi byte, come `tipoDaiByte` del PC; `eseguibile` per APK, DEX, ELF e script. */
    fun tipo(testa: ByteArray): Tipo {
        val b = if (testa.size > TESTA) testa.copyOf(TESTA) else testa
        fun inizia(vararg firma: Int?) = b.size >= firma.size && firma.withIndex().all { (i, v) -> v == null || (b[i].toInt() and 0xff) == v }
        val testo = String(b, Charsets.ISO_8859_1)
        return when {
            inizia(0x89, 0x50, 0x4e, 0x47) -> Tipo("image/png", true, false)
            inizia(0xff, 0xd8, 0xff) -> Tipo("image/jpeg", true, false)
            inizia(0x47, 0x49, 0x46, 0x38) -> Tipo("image/gif", true, false)
            inizia(0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50) -> Tipo("image/webp", true, false)
            inizia(0x25, 0x50, 0x44, 0x46, 0x2d) -> Tipo("application/pdf", false, false)
            inizia(0x7f, 0x45, 0x4c, 0x46) -> Tipo("application/octet-stream", false, true)
            inizia(0x64, 0x65, 0x78, 0x0a) -> Tipo("application/octet-stream", false, true)
            inizia(0x50, 0x4b, 0x03, 0x04) -> {
                val pacchetto = testo.contains("AndroidManifest.xml") || testo.contains("classes.dex")
                if (pacchetto) Tipo("application/vnd.android.package-archive", false, true) else Tipo("application/zip", false, false)
            }
            inizia(0x23, 0x21) -> Tipo("text/plain", false, true)
            b.isNotEmpty() && !b.contains(0) && utf8(b) -> Tipo("text/plain", false, false)
            else -> Tipo("application/octet-stream", false, false)
        }
    }

    private fun utf8(b: ByteArray): Boolean {
        for (taglio in 0..minOf(3, b.size - 1)) {
            try {
                Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(b, 0, b.size - taglio))
                return true
            } catch (e: java.nio.charset.CharacterCodingException) { /* prossimo */ }
        }
        return false
    }

    /** Prima di scaricare: servono `servono` byte più il margine. Se mancano lo dice il dispositivo, senza chiedere al PC. */
    fun controllaSpazio(servono: Long, liberi: Long) {
        if (servono + MARGINE > liberi) throw ErroreFile("NO_SPACE", "Not enough space on the device.", servono = servono, liberi = liberi)
    }

    /** Il nome locale di un file del PC: sha256 di pc, sessione, file e versione. Una versione nuova è un file nuovo. */
    fun chiave(pcId: String, sessionId: String, fileId: String, versione: String): String =
        esa(MessageDigest.getInstance("SHA-256").digest(listOf(pcId, sessionId, fileId, versione).joinToString("\u0000").toByteArray()))

    /**
     * Revisione S4-4 (Desktop, 25/10): il nome della copia per «Salva in…», dentro `cache/talos-export`. Separatori e caratteri di
     * controllo diventano `_`; un nome vuoto o di soli punti («.», «..») diventa «file», perché «..» punterebbe alla cache intera.
     */
    fun nomeSicuro(nome: String): String {
        val pulito = nome.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().take(180)
        return if (pulito.isEmpty() || pulito.all { it == '.' }) "file" else pulito
    }

    /**
     * ⛔ D-F3-6 (dal Pad, 25/10): un numero intero arrivato da JS. `PluginCall.getLong` di Capacitor torna il valore solo se è già un
     * `Long`, ma il parsing JSON dà `Integer` ai numeri piccoli (ogni `da` di un file da 25 MiB): qui Integer, Long e Double interi.
     */
    fun intero(v: Any?): Long? = when (v) {
        is Int -> v.toLong()
        is Long -> v
        // B9-9: 2^63 come Double non è un Long (toLong dava Long.MAX_VALUE): il confine di sopra è stretto
        is Double -> if (v.isFinite() && v % 1.0 == 0.0 && v >= -9.223372036854775808E18 && v < 9.223372036854775808E18) v.toLong() else null
        else -> null
    }

    /** B9-9: la misura di un pezzo chiesto dalla pagina, da 1 byte a [PEZZO_MASSIMO]; fuori misura è null (si rifiuta, mai ridotta). */
    fun quanti(v: Any?): Int? = intero(v)?.takeIf { it in 1L..PEZZO_MASSIMO.toLong() }?.toInt()

    /** Un file dentro la cartella degli scambi, e solo lì: niente `..`, niente sottocartelle. */
    fun fileNellaCartella(cartella: File, nome: String): File {
        if (!NOME_LOCALE.matches(nome)) throw ErroreFile("BAD_MESSAGE", "Not a transfer file name.")
        val f = File(cartella, nome)
        if (f.canonicalFile.parentFile != cartella.canonicalFile) throw ErroreFile("BAD_MESSAGE", "Not a transfer file name.")
        return f
    }
}
