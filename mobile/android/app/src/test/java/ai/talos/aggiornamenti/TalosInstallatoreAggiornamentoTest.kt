package ai.talos.aggiornamenti

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.Base64

/**
 * Prima di aprire la sessione d'installazione: l'APK scaricato è il NOSTRO pacchetto, firmato con il NOSTRO certificato, e più
 * nuovo. Android lo rifiuterebbe comunque (`STATUS_FAILURE_CONFLICT`/`INCOMPATIBLE`), ma con una frase che non dice niente:
 * qui si decide prima e si dice il perché (tavola 7 del mockup). Signal fa lo stesso col nome del pacchetto
 * (`ApkUpdateInstaller.kt:112`).
 *
 * L'impronta SHA-512 si calcola MENTRE i byte entrano nella sessione: un passaggio solo, e nessuna finestra fra «verificato» e
 * «installato» in cui il file possa cambiare (Signal rilegge il file prima di installare, `ApkUpdateInstaller.kt:84`).
 */
class TalosInstallatoreAggiornamentoTest {

    private val nostro = TalosPacchettoVisto("ai.talos.dev", 44, setOf("aa11"))
    private val installato = TalosPacchettoVisto("ai.talos.dev", 43, setOf("aa11"))

    @Test
    fun `AGG-INS-01 stesso pacchetto, stesso certificato, versione piu' alta si installa`() {
        assertEquals(TalosVerdettoApk.INSTALLABILE, TalosControlliApk.verdetto(nostro, installato))
    }

    @Test
    fun `AGG-INS-02 ogni differenza ha il suo motivo`() {
        assertEquals(TalosVerdettoApk.PACCHETTO_DIVERSO, TalosControlliApk.verdetto(nostro.copy(pacchetto = "ai.talos"), installato))
        assertEquals(TalosVerdettoApk.FIRMA_DIVERSA, TalosControlliApk.verdetto(nostro.copy(certificati = setOf("bb22")), installato))
        assertEquals(TalosVerdettoApk.NON_PIU_NUOVA, TalosControlliApk.verdetto(nostro.copy(versionCode = 43), installato))
        assertEquals(TalosVerdettoApk.NON_PIU_NUOVA, TalosControlliApk.verdetto(nostro.copy(versionCode = 12), installato))
        assertEquals(TalosVerdettoApk.ILLEGGIBILE, TalosControlliApk.verdetto(null, installato))
        assertEquals(TalosVerdettoApk.ILLEGGIBILE, TalosControlliApk.verdetto(nostro.copy(certificati = emptySet()), installato))
    }

    @Test
    fun `AGG-INS-03 la firma si confronta come insieme, non come primo elemento`() {
        // un APK firmato con la rotazione della chiave (v3) porta lo storico: basta che i due insiemi coincidano
        val due = setOf("aa11", "cc33")
        assertEquals(TalosVerdettoApk.INSTALLABILE,
            TalosControlliApk.verdetto(nostro.copy(certificati = due), installato.copy(certificati = setOf("cc33", "aa11"))))
        assertEquals(TalosVerdettoApk.FIRMA_DIVERSA,
            TalosControlliApk.verdetto(nostro.copy(certificati = due), installato))
    }

    @Test
    fun `AGG-INS-04 la copia restituisce lo sha512 dei byte copiati`() {
        val dati = ByteArray(300_000) { (it * 31).toByte() }
        val uscita = ByteArrayOutputStream()
        val impronta = TalosCopiaConImpronta.copia(ByteArrayInputStream(dati), uscita)
        assertTrue(dati.contentEquals(uscita.toByteArray()))
        assertTrue(MessageDigest.getInstance("SHA-512").digest(dati).contentEquals(impronta))
    }

    @Test
    fun `AGG-INS-05 l'impronta del manifesto si confronta a tempo costante e in base64`() {
        val impronta = MessageDigest.getInstance("SHA-512").digest("apk".toByteArray())
        val base64 = Base64.getEncoder().encodeToString(impronta)
        assertTrue(TalosCopiaConImpronta.coincide(impronta, base64))
        assertFalse(TalosCopiaConImpronta.coincide(impronta.copyOf().also { it[0] = (it[0] + 1).toByte() }, base64))
        assertFalse(TalosCopiaConImpronta.coincide(impronta, "non-base64!"))
    }
}
