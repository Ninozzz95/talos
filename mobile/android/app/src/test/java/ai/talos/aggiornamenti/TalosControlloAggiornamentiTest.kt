package ai.talos.aggiornamenti

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.util.Base64

/**
 * L'ordine del controllo, come il desktop (`aggiornamenti.mjs:76-88`): manifesto e firma verificati PRIMA di scaricare l'APK,
 * poi la versione firmata confrontata col tag e con quella installata. La rete è fuori: qui si decide sui byte già letti.
 */
class TalosControlloAggiornamentiTest {

    private val coppia = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
    private val pem = "-----BEGIN PUBLIC KEY-----\n" + Base64.getEncoder().encodeToString(coppia.public.encoded) + "\n-----END PUBLIC KEY-----"
    private val impronta = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-512").digest("apk".toByteArray()))

    private fun manifesto(versione: String) = """
        |version: $versione
        |files:
        |  - url: TALOS-$versione.apk
        |    sha512: $impronta
        |    size: 1000
        |path: TALOS-$versione.apk
        |sha512: $impronta
        |""".trimMargin().toByteArray(Charsets.UTF_8)

    private fun firma(byte: ByteArray) = Signature.getInstance("Ed25519").run {
        initSign(coppia.private); update(byte); Base64.getEncoder().encodeToString(sign())
    }

    private val scelta = TalosReleaseScelta("v0.1.44", "0.1.44", "https://github.com/Ninozzz95/talos/releases/tag/v0.1.44")

    @Test
    fun `AGG-CTL-01 manifesto firmato, versione del tag, piu' nuova dell'installata - trovata`() {
        val m = manifesto("0.1.44")
        val esito = TalosControlloAggiornamenti.decidi(scelta, m, firma(m), pem, "0.1.43", rifiutato = null)
        assertTrue(esito is TalosEsitoControllo.Trovata)
        val trovata = (esito as TalosEsitoControllo.Trovata).trovata
        assertEquals("0.1.44", trovata.versione)
        assertEquals("TALOS-0.1.44.apk", trovata.path)
        assertEquals("https://github.com/Ninozzz95/talos/releases/tag/v0.1.44", trovata.pagina)
        assertEquals("", trovata.note)
        assertEquals(1000L, trovata.size)
    }

    @Test
    fun `AGG-CTL-02 firma sbagliata - rifiutato, con l'impronta del manifesto da non riprovare`() {
        val m = manifesto("0.1.44")
        val esito = TalosControlloAggiornamenti.decidi(scelta, m, firma(manifesto("0.1.45")), pem, "0.1.43", null)
        assertTrue(esito is TalosEsitoControllo.Rifiutato)
        assertEquals("firma", (esito as TalosEsitoControllo.Rifiutato).motivo)
        assertEquals(TalosControlloAggiornamenti.improntaDi(m), esito.impronta)
    }

    @Test
    fun `AGG-CTL-03 il manifesto firmato dice un'altra versione del tag - rifiutato`() {
        val m = manifesto("0.1.42")
        val esito = TalosControlloAggiornamenti.decidi(scelta, m, firma(m), pem, "0.1.41", null)
        assertEquals("versione-del-tag", (esito as TalosEsitoControllo.Rifiutato).motivo)
    }

    @Test
    fun `AGG-CTL-04 versione uguale o piu' vecchia - gia' aggiornata, anche se firmata (CVE-2026-95625)`() {
        val m = manifesto("0.1.44")
        assertTrue(TalosControlloAggiornamenti.decidi(scelta, m, firma(m), pem, "0.1.44", null) is TalosEsitoControllo.Aggiornata)
        assertTrue(TalosControlloAggiornamenti.decidi(scelta, m, firma(m), pem, "0.1.50", null) is TalosEsitoControllo.Aggiornata)
    }

    @Test
    fun `AGG-CTL-05 un manifesto gia' rifiutato non si riprova finche' non cambia`() {
        val m = manifesto("0.1.44")
        val esito = TalosControlloAggiornamenti.decidi(scelta, m, firma(manifesto("0.1.45")), pem, "0.1.43",
            rifiutato = TalosControlloAggiornamenti.improntaDi(m))
        assertTrue(esito is TalosEsitoControllo.GiaRifiutato)
    }

    @Test
    fun `AGG-CTL-06 manifesto firmato ma malformato - rifiutato col motivo del lettore`() {
        val m = "version: 0.1.44\n".toByteArray()
        val esito = TalosControlloAggiornamenti.decidi(scelta, m, firma(m), pem, "0.1.43", null)
        assertEquals("manifesto-campo-mancante", (esito as TalosEsitoControllo.Rifiutato).motivo)
        // senza dimensione lo scaricamento non può prenotare lo spazio né riprendere
        val senza = String(manifesto("0.1.44"), Charsets.UTF_8).replace("    size: 1000\n", "").toByteArray()
        val senzaDimensione = TalosControlloAggiornamenti.decidi(scelta, senza, firma(senza), pem, "0.1.43", null)
        assertEquals("manifesto-dimensione", (senzaDimensione as TalosEsitoControllo.Rifiutato).motivo)
    }
}
