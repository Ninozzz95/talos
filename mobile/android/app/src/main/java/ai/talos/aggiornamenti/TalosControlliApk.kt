package ai.talos.aggiornamenti

import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.Base64

/** Ciò che serve sapere di un pacchetto: nome, versionCode, impronte SHA-256 dei certificati di firma (esadecimali). */
data class TalosPacchettoVisto(val pacchetto: String, val versionCode: Long, val certificati: Set<String>)

enum class TalosVerdettoApk { INSTALLABILE, ILLEGGIBILE, PACCHETTO_DIVERSO, FIRMA_DIVERSA, NON_PIU_NUOVA }

/**
 * La decisione prima della sessione, pura (il lato Android legge i due pacchetti con `PackageManager` e passa qui). Android
 * rifiuterebbe comunque un certificato diverso o un versionCode minore, ma con una frase che non spiega niente.
 */
object TalosControlliApk {

    fun verdetto(scaricato: TalosPacchettoVisto?, installato: TalosPacchettoVisto): TalosVerdettoApk = when {
        scaricato == null || scaricato.certificati.isEmpty() -> TalosVerdettoApk.ILLEGGIBILE
        scaricato.pacchetto != installato.pacchetto -> TalosVerdettoApk.PACCHETTO_DIVERSO
        scaricato.certificati != installato.certificati -> TalosVerdettoApk.FIRMA_DIVERSA
        scaricato.versionCode <= installato.versionCode -> TalosVerdettoApk.NON_PIU_NUOVA
        else -> TalosVerdettoApk.INSTALLABILE
    }
}

/** La copia dell'APK nella sessione d'installazione, con lo SHA-512 calcolato sugli stessi byte che entrano. */
object TalosCopiaConImpronta {

    fun copia(da: InputStream, a: OutputStream): ByteArray {
        val digest = MessageDigest.getInstance("SHA-512")
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val letti = da.read(buffer)
            if (letti < 0) break
            digest.update(buffer, 0, letti)
            a.write(buffer, 0, letti)
        }
        return digest.digest()
    }

    fun coincide(impronta: ByteArray, attesaBase64: String): Boolean = try {
        MessageDigest.isEqual(impronta, Base64.getDecoder().decode(attesaBase64))
    } catch (ignorata: IllegalArgumentException) {
        false
    }
}
