package ai.talos

import ai.talos.agent.ponte.TalosAdbCertificato
import ai.talos.agent.ponte.TalosAdbChiave
import ai.talos.agent.ponte.TalosDer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Date

/**
 * ⭐⭐ Il certificato del ponte, provato ridandolo da leggere all'analizzatore
 * X.509 di sistema — lo STESSO che userà l'altro capo.
 *
 * ⛔ Non si guardano i byte: si guarda se `CertificateFactory` li accetta e ne
 * rilegge i campi. È l'unico controllo che significhi qualcosa, perché quello è
 * il giudice vero.
 */
class TalosAdbCertificatoTest {

    companion object {
        private lateinit var coppia: KeyPair
        private const val DA = 1_754_000_000_000L
        private const val A = 2_069_360_000_000L

        @BeforeClass
        @JvmStatic
        fun generaUnaVolta() {
            coppia = KeyPairGenerator.getInstance("RSA").apply {
                initialize(TalosAdbChiave.BIT, SecureRandom())
            }.generateKeyPair()
        }
    }

    private fun certificato(nome: String = "TALOS", seriale: Long = 1): X509Certificate =
        TalosAdbCertificato.crea(coppia, nome, DA, A, BigInteger.valueOf(seriale))

    /**
     * ⭐ LA PROVA CHE CONTA: i byte che produciamo li rilegge l'analizzatore di
     * sistema, e ne ritrova i campi. Se DER fosse sbagliato in un punto solo,
     * qui esploderebbe.
     */
    @Test
    fun `l analizzatore X509 di sistema lo accetta e ne rilegge i campi`() {
        val c = certificato(nome = "TALOS ponte")

        assertEquals("CN=TALOS ponte", c.subjectX500Principal.name)
        assertEquals("CN=TALOS ponte", c.issuerX500Principal.name)
        assertEquals(3, c.version)
        assertEquals(BigInteger.ONE, c.serialNumber)
        assertEquals(Date(DA), c.notBefore)
        assertEquals(Date(A), c.notAfter)
    }

    /** Ed è davvero NOSTRO: la firma si verifica con la nostra chiave pubblica. */
    @Test
    fun `la firma si verifica con la nostra chiave`() {
        val c = certificato()
        c.verify(coppia.public)
        assertArrayEquals(coppia.public.encoded, c.publicKey.encoded)
        assertEquals("SHA256withRSA", c.sigAlgName)
    }

    /**
     * ⛔ Non è un'autorità: `basicConstraints` critico con `CA = false`.
     * Ometterlo lascia ambiguo se il ponte possa firmare altri certificati, e
     * alcune implementazioni TLS si rifiutano di indovinare.
     */
    @Test
    fun `dichiara di NON essere un autorita, e lo dice come critico`() {
        val c = certificato()
        assertEquals(-1, c.basicConstraints)
        assertTrue(c.criticalExtensionOIDs.contains("2.5.29.19"))
        assertTrue(c.criticalExtensionOIDs.contains("2.5.29.15"))
    }

    /** `keyUsage` dice a cosa serve la chiave: firma digitale, e nient'altro. */
    @Test
    fun `l uso della chiave e la firma digitale`() {
        val uso = certificato().keyUsage
        assertTrue(uso[0])
        for (i in 1 until uso.size) assertFalse("bit $i non doveva essere acceso", uso[i])
    }

    /** Un seriale negativo è il difetto che si vede solo su certi dispositivi. */
    @Test
    fun `un seriale non positivo viene RIFIUTATO qui, non dall altro capo`() {
        for (cattivo in listOf(0L, -1L)) {
            val errore = runCatching { certificato(seriale = cattivo) }.exceptionOrNull()
            assertTrue("seriale $cattivo doveva essere rifiutato", errore is IllegalArgumentException)
        }
    }

    /** Una validità che va all'indietro non deve nemmeno essere costruita. */
    @Test
    fun `una validita alla rovescia viene rifiutata`() {
        val errore = runCatching {
            TalosAdbCertificato.crea(coppia, "TALOS", A, DA, BigInteger.ONE)
        }.exceptionOrNull()
        assertTrue(errore is IllegalArgumentException)
    }

    /** Rifatto e ricodificato torna identico: nessun pezzo dipende dal caso. */
    @Test
    fun `due certificati con gli stessi ingredienti hanno gli stessi byte`() {
        assertArrayEquals(certificato().encoded, certificato().encoded)
    }

    /**
     * ⛔ LA LUNGHEZZA LUNGA. Fino a 127 basta un byte; da 128 in su bisogna dire
     * PRIMA quanti byte servono, col bit alto acceso. Un certificato RSA sta
     * sempre oltre quella soglia: chi implementa solo il caso corto produce byte
     * plausibili che nessun analizzatore accetta.
     */
    @Test
    fun `la lunghezza corta e quella lunga sono due forme diverse`() {
        assertArrayEquals(byteArrayOf(0), TalosDer.lunghezza(0))
        assertArrayEquals(byteArrayOf(127), TalosDer.lunghezza(127))
        assertArrayEquals(byteArrayOf(0x81.toByte(), 0x80.toByte()), TalosDer.lunghezza(128))
        assertArrayEquals(byteArrayOf(0x82.toByte(), 0x01, 0x2A), TalosDer.lunghezza(298))
        assertArrayEquals(
            byteArrayOf(0x83.toByte(), 0x01, 0x00, 0x00),
            TalosDer.lunghezza(65536),
        )
        // E il nostro certificato ci finisce dentro davvero.
        assertTrue(certificato().encoded.size > 127)
    }

    /** Gli OID: le prime due cifre in un byte solo, poi base 128. */
    @Test
    fun `gli OID si codificano come vuole DER`() {
        // 1.2.840.113549.1.1.11 = sha256WithRSAEncryption
        assertArrayEquals(
            byteArrayOf(0x06, 0x09, 0x2A, 0x86.toByte(), 0x48, 0x86.toByte(), 0xF7.toByte(), 0x0D, 0x01, 0x01, 0x0B),
            TalosDer.oid("1.2.840.113549.1.1.11"),
        )
        // 2.5.4.3 = commonName: 40*2 + 5 = 85 = 0x55
        assertArrayEquals(byteArrayOf(0x06, 0x03, 0x55, 0x04, 0x03), TalosDer.oid("2.5.4.3"))
    }

    /**
     * ⛔ Lo zero davanti a una stringa di bit dice quanti bit dell'ultimo byte
     * non contano. Dimenticarlo sposta tutto il contenuto di un byte, e la firma
     * dentro non verrebbe mai verificata.
     */
    @Test
    fun `una stringa di bit porta davanti il conto dei bit inutilizzati`() {
        assertArrayEquals(
            byteArrayOf(0x03, 0x03, 0x00, 0xAB.toByte(), 0xCD.toByte()),
            TalosDer.stringaBit(byteArrayOf(0xAB.toByte(), 0xCD.toByte())),
        )
    }

    /** Un intero col bit alto acceso prende uno zero davanti, o diventa negativo. */
    @Test
    fun `un intero col bit alto acceso non diventa negativo`() {
        val grande = TalosDer.intero(BigInteger.valueOf(200))
        assertArrayEquals(byteArrayOf(0x02, 0x02, 0x00, 0xC8.toByte()), grande)
        assertArrayEquals(byteArrayOf(0x02, 0x01, 0x7F), TalosDer.intero(127))
    }

    /** E il certificato si trasporta: codificato e riletto resta lo stesso. */
    @Test
    fun `codificato e riletto e lo stesso certificato`() {
        val c = certificato(nome = "TALOS andata e ritorno")
        val riletto = CertificateFactory.getInstance("X.509")
            .generateCertificate(c.encoded.inputStream()) as X509Certificate

        assertEquals(c.subjectX500Principal, riletto.subjectX500Principal)
        assertArrayEquals(c.encoded, riletto.encoded)
        riletto.verify(coppia.public)
    }
}
