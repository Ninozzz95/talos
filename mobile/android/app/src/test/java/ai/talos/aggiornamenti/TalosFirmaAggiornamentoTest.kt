package ai.talos.aggiornamenti

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

/**
 * La firma Ed25519 del manifesto (owner 22/10: chiave SEPARATA dal desktop). La chiave di prova nasce qui, col JDK; la verifica è
 * Tink (`subtle.Ed25519Verify`, la stessa libreria che l'app spedisce): due implementazioni diverse devono essere d'accordo.
 * Come il desktop (`firma-aggiornamenti.mjs:66-76`) la verifica non lancia mai: risponde vero o falso.
 */
class TalosFirmaAggiornamentoTest {

    private val coppia = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
    private val altra = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()

    private fun pem(spki: ByteArray) =
        "-----BEGIN PUBLIC KEY-----\n" + Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(spki) + "\n-----END PUBLIC KEY-----\n"

    private fun firma(byte: ByteArray, privata: java.security.PrivateKey = coppia.private): String {
        val s = Signature.getInstance("Ed25519")
        s.initSign(privata)
        s.update(byte)
        return Base64.getEncoder().encodeToString(s.sign())
    }

    private val manifesto = "version: 0.1.44\n".toByteArray(Charsets.UTF_8)

    @Test
    fun `AGG-FIR-01 la firma della nostra chiave si accetta`() {
        assertTrue(TalosFirmaAggiornamento.verifica(manifesto, firma(manifesto), pem(coppia.public.encoded)))
        // la firma su file ha un a-capo finale: si tollera, come chi la scrive con echo
        assertTrue(TalosFirmaAggiornamento.verifica(manifesto, firma(manifesto) + "\n", pem(coppia.public.encoded)))
    }

    @Test
    fun `AGG-FIR-02 un byte cambiato nel manifesto si rifiuta`() {
        val firmata = firma(manifesto)
        val cambiato = manifesto.copyOf().also { it[it.size - 2] = '5'.code.toByte() }
        assertFalse(TalosFirmaAggiornamento.verifica(cambiato, firmata, pem(coppia.public.encoded)))
    }

    @Test
    fun `AGG-FIR-03 la firma di un'altra chiave si rifiuta (il desktop non firma il mobile)`() {
        assertFalse(TalosFirmaAggiornamento.verifica(manifesto, firma(manifesto, altra.private), pem(coppia.public.encoded)))
    }

    @Test
    fun `AGG-FIR-04 base64 rotto o firma della lunghezza sbagliata danno falso, senza eccezioni`() {
        val chiave = pem(coppia.public.encoded)
        assertFalse(TalosFirmaAggiornamento.verifica(manifesto, "%%%non-base64%%%", chiave))
        assertFalse(TalosFirmaAggiornamento.verifica(manifesto, Base64.getEncoder().encodeToString(ByteArray(10)), chiave))
        assertFalse(TalosFirmaAggiornamento.verifica(manifesto, "", chiave))
    }

    @Test
    fun `AGG-FIR-05 una chiave pubblica rotta o di un'altra curva da' falso, senza eccezioni`() {
        val firmata = firma(manifesto)
        assertFalse(TalosFirmaAggiornamento.verifica(manifesto, firmata, "non è un PEM"))
        assertFalse(TalosFirmaAggiornamento.verifica(manifesto, firmata, pem(ByteArray(44))))
        val ec = KeyPairGenerator.getInstance("EC").generateKeyPair()
        assertFalse(TalosFirmaAggiornamento.verifica(manifesto, firmata, pem(ec.public.encoded)))
    }
}
