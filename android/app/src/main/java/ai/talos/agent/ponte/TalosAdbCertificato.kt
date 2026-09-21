package ai.talos.agent.ponte

import java.math.BigInteger
import java.security.KeyPair
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.TimeZone

/**
 * ⭐⭐ IL CERTIFICATO — quello che TALOS presenta quando il Debug wireless
 * chiede TLS.
 *
 * ## Perché serve, in una riga
 *
 * Sul percorso vecchio l'identità del ponte è una **firma** su un gettone. Sul
 * Debug wireless `adbd` risponde `STLS` e da lì in poi si parla in TLS: la
 * stessa chiave, ma vestita da certificato X.509, perché è l'unica identità che
 * una stretta di mano TLS sa leggere.
 *
 * È autofirmato, e va bene così: la fiducia non nasce da un'autorità: nasce
 * dall'**accoppiamento**, cioè dalle sei cifre che la persona ha letto sullo
 * schermo del proprio telefono. Un certificato firmato da chiunque altro non
 * aggiungerebbe niente a quella prova.
 *
 * ## ⛔ Perché costruirlo a mano invece di usare una libreria
 *
 * Le due alternative erano peggiori, e per motivi diversi: BouncyCastle pesa
 * megabyte per una funzione sola — ed è il tipo di dipendenza che stiamo
 * togliendo — mentre `sun.security.x509` su Android è API nascosta, cioè
 * funziona finché Google non la chiude, e allora il ponte si rompe senza che
 * noi abbiamo toccato niente.
 *
 * ## Come si prova che è VERO, senza un telefono
 *
 * Non «guardando i byte»: **ridandolo da leggere a `CertificateFactory`**, cioè
 * allo stesso analizzatore X.509 che userà l'altro capo. Se quello lo accetta e
 * ne rilegge i campi, i byte sono giusti — e se la firma si verifica con la
 * nostra chiave pubblica, il certificato è davvero nostro.
 */
internal object TalosAdbCertificato {

    /** `sha256WithRSAEncryption`. */
    private const val OID_SHA256_RSA = "1.2.840.113549.1.1.11"

    /** `commonName`. */
    private const val OID_CN = "2.5.4.3"

    /** `basicConstraints` e `keyUsage`: le due estensioni che non si omettono. */
    private const val OID_VINCOLI = "2.5.29.19"
    private const val OID_USO_CHIAVE = "2.5.29.15"

    /**
     * Costruisce il certificato.
     *
     * @param nomeComune quello che comparirà come identità del ponte.
     * @param daMs primo istante di validità, in millisecondi dall'epoca.
     * @param aMs ultimo istante di validità.
     * @param seriale il numero di serie. ⛔ Deve essere **positivo**: un seriale
     *   negativo è rifiutato da alcuni analizzatori e accettato da altri, cioè
     *   il difetto peggiore — quello che si vede solo su certi dispositivi.
     */
    fun crea(
        coppia: KeyPair,
        nomeComune: String,
        daMs: Long,
        aMs: Long,
        seriale: BigInteger,
    ): X509Certificate {
        require(seriale.signum() > 0) { "il numero di serie deve essere positivo" }
        require(aMs > daMs) { "la validita' deve andare avanti nel tempo" }

        val algoritmo = TalosDer.sequenza(TalosDer.oid(OID_SHA256_RSA), TalosDer.nullo())
        val nome = TalosDer.sequenza(
            TalosDer.insieme(
                TalosDer.sequenza(TalosDer.oid(OID_CN), TalosDer.utf8(nomeComune)),
            ),
        )

        val daFirmare = TalosDer.sequenza(
            // Versione 3, che è il numero 2: le versioni X.509 contano da zero.
            TalosDer.contesto(0, TalosDer.intero(2)),
            TalosDer.intero(seriale),
            algoritmo,
            nome,
            TalosDer.sequenza(TalosDer.oraGenerale(istante(daMs)), TalosDer.oraGenerale(istante(aMs))),
            // Autofirmato: chi lo emette e chi lo porta sono lo stesso.
            nome,
            // ⭐ `getEncoded()` di una chiave pubblica È già un
            // SubjectPublicKeyInfo in DER: si incastra tale e quale.
            coppia.public.encoded,
            TalosDer.contesto(3, TalosDer.sequenza(estensioni())),
        )

        val firma = Signature.getInstance("SHA256withRSA").run {
            initSign(coppia.private)
            update(daFirmare)
            sign()
        }

        val completo = TalosDer.sequenza(daFirmare, algoritmo, TalosDer.stringaBit(firma))
        return CertificateFactory.getInstance("X.509")
            .generateCertificate(completo.inputStream()) as X509Certificate
    }

    /**
     * Le due estensioni che non si omettono.
     *
     * - `basicConstraints` critico con `CA = false`: dichiara che questo
     *   certificato **non può firmarne altri**. Ometterlo lascia ambiguo se il
     *   ponte sia un'autorità, e alcune implementazioni TLS si rifiutano di
     *   indovinare.
     * - `keyUsage` critico con `digitalSignature`: dice a cosa serve la chiave.
     */
    private fun estensioni(): ByteArray = TalosDer.unisci(
        TalosDer.sequenza(
            TalosDer.oid(OID_VINCOLI),
            TalosDer.booleano(true),
            TalosDer.ottetti(TalosDer.sequenza()),
        ),
        TalosDer.sequenza(
            TalosDer.oid(OID_USO_CHIAVE),
            TalosDer.booleano(true),
            // 0x80 = digitalSignature; il 7 iniziale dice quanti bit dell'ultimo
            // byte non contano.
            TalosDer.ottetti(
                TalosDer.blocco(TalosDer.STRINGA_BIT, byteArrayOf(7, 0x80.toByte())),
            ),
        ),
    )

    /** `AAAAMMGGhhmmssZ`, sempre in UTC: un fuso locale qui sposta la validità. */
    private fun istante(ms: Long): String {
        val formato = java.text.SimpleDateFormat("yyyyMMddHHmmss'Z'", java.util.Locale.US)
        formato.timeZone = TimeZone.getTimeZone("UTC")
        return formato.format(java.util.Date(ms))
    }
}
