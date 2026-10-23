package ai.talos.aggiornamenti

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

/**
 * Le novità del cassetto (owner 22/10: «drawer … con le novità»). Il corpo della release su GitHub è in inglese; TALOS dice ogni
 * parola nelle due lingue. Quindi la CI pubblica `note-android.json` (inglese E italiano), firmato con la stessa chiave del
 * manifesto. Le note non bloccano mai l'aggiornamento: se mancano o non si verificano, il cassetto mostra solo il collegamento
 * alla pagina della release, come il desktop («Novità», `aggiornamenti.js:184`).
 */
class TalosNoteAggiornamentoTest {

    private val coppia = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
    private val altra = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
    private val pem = "-----BEGIN PUBLIC KEY-----\n" + Base64.getEncoder().encodeToString(coppia.public.encoded) + "\n-----END PUBLIC KEY-----"

    private fun firma(byte: ByteArray, chi: java.security.PrivateKey = coppia.private) = Signature.getInstance("Ed25519").run {
        initSign(chi); update(byte); Base64.getEncoder().encodeToString(sign())
    }

    private fun note(versione: String = "0.1.44", en: String = """["Faster local engine."]""", it: String = """["Motore locale più veloce."]""") =
        """{"version":"$versione","en":$en,"it":$it}""".toByteArray(Charsets.UTF_8)

    @Test
    fun `AGG-NOTE-01 note firmate della stessa versione - si tengono le due lingue`() {
        val byte = note()
        val tenute = JSONObject(TalosNoteAggiornamento.verificate("0.1.44", byte, firma(byte), pem)!!)
        assertEquals("Faster local engine.", tenute.getJSONArray("en").getString(0))
        assertEquals("Motore locale più veloce.", tenute.getJSONArray("it").getString(0))
    }

    @Test
    fun `AGG-NOTE-02 firma d'altri o di altri byte - niente note`() {
        val byte = note()
        assertNull(TalosNoteAggiornamento.verificate("0.1.44", byte, firma(byte, altra.private), pem))
        assertNull(TalosNoteAggiornamento.verificate("0.1.44", byte, firma(note(versione = "0.1.45")), pem))
    }

    @Test
    fun `AGG-NOTE-03 versione diversa o una lingua mancante - niente note`() {
        val altraVersione = note(versione = "0.1.43")
        assertNull(TalosNoteAggiornamento.verificate("0.1.44", altraVersione, firma(altraVersione), pem))
        val senzaItaliano = """{"version":"0.1.44","en":["A"]}""".toByteArray()
        assertNull(TalosNoteAggiornamento.verificate("0.1.44", senzaItaliano, firma(senzaItaliano), pem))
    }

    @Test
    fun `AGG-NOTE-04 forma - da 1 a 8 voci per lingua, ognuna corta e senza a-capo, nessun campo in piu'`() {
        fun prova(byte: ByteArray) = TalosNoteAggiornamento.verificate("0.1.44", byte, firma(byte), pem)
        assertNull(prova(note(en = "[]", it = "[]")))
        assertNull(prova(note(en = "[" + (1..9).joinToString(",") { "\"a$it\"" } + "]")))
        assertNull(prova(note(en = "[\"" + "x".repeat(241) + "\"]")))
        assertNull(prova(note(en = "[\"riga\\naltra\"]")))
        assertNull(prova(note(en = "[\"  \"]")))
        assertNull(prova(note(en = "[3]")))
        assertNull(prova("""{"version":"0.1.44","en":["A"],"it":["B"],"html":"<b>"}""".toByteArray()))
        assertNull(prova("non json".toByteArray()))
    }
}
