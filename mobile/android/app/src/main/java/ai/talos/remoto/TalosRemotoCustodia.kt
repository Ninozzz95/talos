package ai.talos.remoto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M2 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): ciò che il telefono ricorda di
 * ogni computer accoppiato. Un file per PC in `files/remoto/`, sigillato AES-256-GCM con una chiave dell'archivio sicuro di Android
 * non esportabile (stesso schema di `TalosChiaveDatiR4`), col nome del file nei dati aggiuntivi: un file spostato sotto un altro
 * nome non si apre.
 *
 * Dentro: la chiave segreta Ed25519 del telefono PER QUEL PC (il PC riconosce il telefono dal suo EndpointId, contratto §B.4 «una
 * chiave per processo»; una per PC = due PC non possono collegare le due identità), il relay scelto dal PC e il suo gettone (R5.9:
 * staccato dall'indirizzo come fa `trasporto-iroh.mjs` del PC, così non finisce nei registri del relay).
 * Il gettone d'accoppiamento del QR NON si ricorda: è monouso e muore all'accoppiamento.
 */
object TalosRemotoCustodia {
    const val ALIAS = "talos.remoto.v1"
    private const val MAGIA = "TRM1"
    private const val BYTE_NONCE = 12
    private const val BYTE_TAG = 16
    const val BYTE_CHIAVE = 32
    private const val KEYSTORE = "AndroidKeyStore"
    private const val TRASFORMAZIONE = "AES/GCM/NoPadding"

    class ComputerAccoppiato(
        val pcId: String,
        val nome: String?,
        val relay: String?,
        val gettoneRelay: String?,
        val chiaveTelefono: ByteArray,
        val accoppiatoAlle: Long,
        /** R-M5 (21/10/2026): la VAPID pubblica del PC (`pair.ok` `pc.vapid`), per registrare la sveglia; `null` nei ricordi di prima. */
        val vapid: String? = null,
    )

    /**
     * La VAPID come la vuole il connettore UnifiedPush (kdoc `UnifiedPush.register`): base64url senza riempimento di 87 caratteri,
     * cioè il punto P-256 non compresso di 65 byte che inizia con 0x04. Ogni altra forma ⇒ `null` (si accoppia lo stesso, senza sveglia).
     */
    fun vapidValida(testo: String?): String? {
        if (testo == null || testo.length != 87 || !Regex("^[A-Za-z0-9_-]+$").matches(testo)) return null
        val byte = try { java.util.Base64.getUrlDecoder().decode(testo) } catch (e: IllegalArgumentException) { return null }
        return if (byte.size == 65 && byte[0] == 0x04.toByte()) testo else null
    }

    /** Il nome del file: SHA-256 dell'id, i primi 16 byte in esadecimale. L'id del PC non compare in chiaro nella cartella. */
    fun nomeFile(pcId: String): String =
        MessageDigest.getInstance("SHA-256").digest(pcId.toByteArray(Charsets.UTF_8))
            .take(16).joinToString("") { "%02x".format(it) } + ".pc"

    fun inJson(pc: ComputerAccoppiato): String = JSONObject()
        .put("v", 1)
        .put("pcId", pc.pcId)
        .put("nome", pc.nome ?: JSONObject.NULL)
        .put("relay", pc.relay ?: JSONObject.NULL)
        .put("gettoneRelay", pc.gettoneRelay ?: JSONObject.NULL)
        .put("chiaveTelefono", java.util.Base64.getEncoder().encodeToString(pc.chiaveTelefono))
        .put("accoppiatoAlle", pc.accoppiatoAlle)
        .put("vapid", pc.vapid ?: JSONObject.NULL)
        .toString()

    /** `null` per ogni forma storta: mai un computer a metà (senza id, o con una chiave che non è di 32 byte). */
    fun daJson(testo: String): ComputerAccoppiato? = try {
        val o = JSONObject(testo)
        val pcId = o.optString("pcId", "")
        val chiave = java.util.Base64.getDecoder().decode(o.optString("chiaveTelefono", ""))
        if (o.optInt("v") != 1 || pcId.isEmpty() || chiave.size != BYTE_CHIAVE) null
        else ComputerAccoppiato(
            pcId,
            o.optString("nome").takeUnless { o.isNull("nome") },
            o.optString("relay").takeUnless { o.isNull("relay") },
            o.optString("gettoneRelay").takeUnless { o.isNull("gettoneRelay") },
            chiave,
            o.optLong("accoppiatoAlle"),
            vapidValida(o.optString("vapid").takeUnless { o.isNull("vapid") || !o.has("vapid") }),
        )
    } catch (e: Exception) {
        null
    }

    /**
     * Il relay del QR diviso in indirizzo e gettone (`?token=`), con la regola del PC (`configuraRelay`): `https`, oppure `http`
     * solo verso la propria macchina (le prove). `null` se non si può usare.
     */
    fun relayDiviso(url: String): Pair<String, String?>? {
        val u = try { URI(url) } catch (e: Exception) { return null }
        val host = u.host ?: return null
        val locale = host in setOf("127.0.0.1", "localhost", "[::1]", "::1")
        if (u.scheme != "https" && !(u.scheme == "http" && locale)) return null
        val parti = u.rawQuery?.split('&').orEmpty()
        val gettone = parti.firstOrNull { it.startsWith("token=") }?.removePrefix("token=")
            ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
        val resto = parti.filterNot { it.startsWith("token=") }.joinToString("&").ifEmpty { null }
        val senza = URI(u.scheme, u.rawAuthority, u.rawPath?.ifEmpty { "/" } ?: "/", null, null).toString() +
            (resto?.let { "?$it" } ?: "")
        return senza to gettone
    }

    fun sigilla(nonce: ByteArray, cifrato: ByteArray): ByteArray = MAGIA.toByteArray(Charsets.US_ASCII) + nonce + cifrato

    fun apriSigillo(byte: ByteArray): Pair<ByteArray, ByteArray>? {
        val magia = MAGIA.toByteArray(Charsets.US_ASCII)
        if (byte.size < magia.size + BYTE_NONCE + BYTE_TAG + 1) return null
        if (!byte.copyOfRange(0, magia.size).contentEquals(magia)) return null
        return byte.copyOfRange(magia.size, magia.size + BYTE_NONCE) to byte.copyOfRange(magia.size + BYTE_NONCE, byte.size)
    }

    // ——— Sul telefono: archivio sicuro e file. ———

    fun salva(cartella: File, pc: ComputerAccoppiato) {
        val cifra = Cipher.getInstance(TRASFORMAZIONE)
        cifra.init(Cipher.ENCRYPT_MODE, chiaveDellArchivio(crea = true))
        cifra.updateAAD(aad(nomeFile(pc.pcId)))
        val cifrato = cifra.doFinal(inJson(pc).toByteArray(Charsets.UTF_8))
        cartella.mkdirs()
        val file = File(cartella, nomeFile(pc.pcId))
        val provvisorio = File(cartella, file.name + ".tmp")
        provvisorio.outputStream().use { uscita -> uscita.write(sigilla(cifra.iv, cifrato)); uscita.fd.sync() }
        if (!provvisorio.renameTo(file)) { provvisorio.delete(); throw java.io.IOException("rename of the remote pairing failed") }
    }

    fun leggi(cartella: File, pcId: String): ComputerAccoppiato? {
        val file = File(cartella, nomeFile(pcId))
        if (!file.isFile) return null
        return apri(file, pcId)
    }

    /** I computer accoppiati. Un file che non si apre più (archivio sicuro azzerato) si salta: il PC va ricollegato. */
    fun elenco(cartella: File): List<ComputerAccoppiato> =
        cartella.listFiles { f -> f.isFile && f.name.endsWith(".pc") }.orEmpty().mapNotNull { apri(it, null) }

    fun dimentica(cartella: File, pcId: String): Boolean = File(cartella, nomeFile(pcId)).delete()

    /** Il sigillo è legato al NOME del file (l'impronta dell'id): un file copiato sotto un altro nome non si apre. */
    private fun aad(nomeFile: String) = "talos.remoto|v1|$nomeFile".toByteArray(Charsets.UTF_8)

    /** Apre un file e controlla che l'id dentro sia quello del suo nome (e, se dato, quello cercato). */
    private fun apri(file: File, pcId: String?): ComputerAccoppiato? = try {
        val (nonce, cifrato) = apriSigillo(file.readBytes()) ?: return null
        val chiave = chiaveDellArchivio(crea = false) ?: return null
        val cifra = Cipher.getInstance(TRASFORMAZIONE)
        cifra.init(Cipher.DECRYPT_MODE, chiave, GCMParameterSpec(BYTE_TAG * 8, nonce))
        cifra.updateAAD(aad(file.name))
        daJson(String(cifra.doFinal(cifrato), Charsets.UTF_8))
            ?.takeIf { nomeFile(it.pcId) == file.name && (pcId == null || it.pcId == pcId) }
    } catch (e: Exception) {
        null
    }

    private fun chiaveDellArchivio(crea: Boolean): SecretKey? {
        val archivio = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        if (!archivio.containsAlias(ALIAS)) {
            if (!crea) return null
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
                init(
                    KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .setRandomizedEncryptionRequired(true)
                        .build(),
                )
                generateKey()
            }
        }
        return (archivio.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey
    }
}
