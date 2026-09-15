package ai.talos.terminal

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔⛔⛔ IL DIFETTO CHE QUESTO FILE TIENE FERMO — 10/9.
 *
 * Sul Pad dell'owner, build di rilascio, primo avvio, nel logcat:
 *
 *     I adbd: adbd service requested 'shell,v2,raw:LD_LIBRARY_PATH=…
 *             OPENROUTER_API_KEY=sk-or-… node …'
 *
 * A ogni avvio. Chiave ruotata. La causa non era un nostro `Log.*`: era
 * che il segreto viaggiava come token della RIGA DI COMANDO, e `adbd`
 * registra ogni comando che gli viene chiesto di eseguire (AOSP
 * `daemon/shell_service.cpp` → `__android_log_security_bswrite(
 * SEC_TAG_ADB_SHELL_CMD, …)`, verificato alla fonte il 2026-09-10).
 *
 * ⛔⛔ QUESTO FILE NON PROVA CHE IL SEGRETO ARRIVI A DESTINAZIONE — quello
 * lo provava anche il codice rotto di ieri. Prova che **non è più negli
 * argomenti**, e che il rilevatore che lo dice MORDE DAVVERO: ogni prova
 * negativa è accompagnata dalla forma insicura del 28/8, ricostruita qui
 * apposta, contro cui lo stesso rilevatore deve accendersi.
 */
class TalosPonteSegretiTest {

    private val PREFISSO_LD = "LD_LIBRARY_PATH=/data/local/tmp/talos"
    private val BINARIO = "/data/local/tmp/talos/node"
    private val SCRIPT = "/data/local/tmp/talos/talos-exec.js"
    private val BASE64 = "ZXhpdCAw" // "exit 0"

    /**
     * Una chiave dalla FORMA vera, non un `x`: deve essere riconoscibile.
     *
     * ⛔ Il VALORE pero' dichiara di essere finto. Il cancello dei dati
     * personali del rilascio cerca le forme delle chiavi: un fixture
     * indistinguibile da una vera o ferma una pubblicazione per niente, o
     * insegna che quell'allarme si ignora.
     */
    private val CHIAVE = "sk-or-v1-FINTA0000non0e0una0chiave0000mai0esistita"

    /**
     * IL RILEVATORE. Torna gli argomenti che tradiscono un segreto —
     * vuoto significa "nessuno". Una funzione sola per le due direzioni,
     * così la prova positiva e quella negativa non possono divergere.
     */
    private fun argomentiCheTradiscono(argomenti: List<String>, segreti: Collection<String>): List<String> =
        argomenti.filter { arg -> segreti.any { it.isNotEmpty() && arg.contains(it) } }

    /**
     * ⛔ LA FORMA INSICURA, com'era scritta fino al 9/9: ogni variabile
     * del chiamante diventava un token `VAR=valore` prima del binario.
     */
    private fun formaInsicuraDelVentotto(ambiente: Map<String, String>): List<String> =
        listOf(PREFISSO_LD) + ambiente.map { "${it.key}=${it.value}" } + listOf(BINARIO, SCRIPT, BASE64)

    @Test
    fun `il rilevatore MORDE sulla forma insicura del 28-8`() {
        val insicuro = formaInsicuraDelVentotto(mapOf("OPENROUTER_API_KEY" to CHIAVE))

        val traditori = argomentiCheTradiscono(insicuro, listOf(CHIAVE))

        assertEquals(listOf("OPENROUTER_API_KEY=$CHIAVE"), traditori)
    }

    @Test
    fun `nessun argomento porta il segreto, e il segreto sta nell'ingresso`() {
        val consegna = TalosPonteSegreti.consegna(
            listOf(PREFISSO_LD), BINARIO, SCRIPT, BASE64,
            mapOf("OPENROUTER_API_KEY" to CHIAVE),
        )

        assertEquals(emptyList<String>(), argomentiCheTradiscono(consegna.argomenti, listOf(CHIAVE)))
        assertNotNull(consegna.ingresso)
        val letto = JSONObject(String(consegna.ingresso!!, Charsets.UTF_8))
        assertEquals(CHIAVE, letto.getString("OPENROUTER_API_KEY"))
    }

    @Test
    fun `tutte e sei le credenziali del ponte restano fuori dagli argomenti`() {
        // I nomi veri di `terminalePonte.ts`, non un campione inventato.
        val ambiente = mapOf(
            "OPENROUTER_API_KEY" to "sk-or-v1-aaa",
            "OPENAI_API_KEY" to "sk-proj-bbb",
            "DEEPSEEK_API_KEY" to "sk-ccc",
            "ANTHROPIC_API_KEY" to "sk-ant-ddd",
            "GEMINI_API_KEY" to "AIza-eee",
            "OLLAMA_ENDPOINT" to "http://192.0.2.20:11434",
        )

        val consegna = TalosPonteSegreti.consegna(listOf(PREFISSO_LD), BINARIO, SCRIPT, BASE64, ambiente)

        // Prima la prova che il rilevatore vede: la forma di ieri li perdeva tutti e sei.
        val perdutiIeri = argomentiCheTradiscono(formaInsicuraDelVentotto(ambiente), ambiente.values)
        assertTrue("la forma del 28/8 perde tutte e sei: $perdutiIeri", perdutiIeri.size == 6)
        // Poi quella che conta.
        assertEquals(emptyList<String>(), argomentiCheTradiscono(consegna.argomenti, ambiente.values))
    }

    @Test
    fun `gli argomenti restano quelli attesi, col flag in coda`() {
        val consegna = TalosPonteSegreti.consegna(
            listOf(PREFISSO_LD, "TALOS_HARNESS_UI_PORT=4174"), BINARIO, SCRIPT, BASE64,
            mapOf("OPENROUTER_API_KEY" to CHIAVE),
        )

        assertEquals(
            listOf(
                PREFISSO_LD, "TALOS_HARNESS_UI_PORT=4174", BINARIO, SCRIPT, BASE64,
                TalosPonteSegreti.FLAG_AMBIENTE_STDIN,
            ),
            consegna.argomenti,
        )
        // ⛔ L'allowlist di `TalosPonteAdb.shell` guarda SOLO `comando[0]`:
        // se il primo token smettesse di essere il prefisso ammesso, ogni
        // esecuzione verrebbe respinta con `program-not-allowed`.
        assertEquals(PREFISSO_LD, consegna.argomenti.first())
    }

    @Test
    fun `AL CONTRARIO — senza ambiente non c'è né flag né ingresso`() {
        val consegna = TalosPonteSegreti.consegna(listOf(PREFISSO_LD), BINARIO, SCRIPT, BASE64, emptyMap())

        assertEquals(listOf(PREFISSO_LD, BINARIO, SCRIPT, BASE64), consegna.argomenti)
        assertNull(consegna.ingresso)
        assertFalse(consegna.argomenti.contains(TalosPonteSegreti.FLAG_AMBIENTE_STDIN))
    }

    /**
     * ⛔ Il flag e i byte sono UNA cosa sola: `talos-exec.js` che riceve il
     * flag legge stdin FINO A EOF, e se nessuno gli scrive resta appeso
     * fino al timeout del ponte. L'invariante si prova, non si spera.
     */
    @Test
    fun `il flag c'è se e solo se ci sono byte da leggere`() {
        val casi = listOf(
            emptyMap<String, String>(),
            mapOf("A_KEY" to "1"),
            mapOf("A_KEY" to "1", "B_KEY" to "2"),
        )
        for (ambiente in casi) {
            val consegna = TalosPonteSegreti.consegna(listOf(PREFISSO_LD), BINARIO, SCRIPT, BASE64, ambiente)
            val ciSonoByte = consegna.ingresso != null
            val cIlFlag = consegna.argomenti.contains(TalosPonteSegreti.FLAG_AMBIENTE_STDIN)
            assertTrue("ambiente=$ambiente byte=$ciSonoByte flag=$cIlFlag", ciSonoByte == cIlFlag)
        }
    }

    @Test
    fun `un nome non valido è rifiutato, e il messaggio NON contiene il valore`() {
        val eccezione = try {
            TalosPonteSegreti.consegna(
                listOf(PREFISSO_LD), BINARIO, SCRIPT, BASE64,
                mapOf("chiave; rm -rf /" to CHIAVE),
            )
            null
        }
        catch (e: IllegalArgumentException) {
            e
        }

        assertNotNull(eccezione)
        assertEquals("chiave; rm -rf /", eccezione!!.message)
        // ⛔ Quel messaggio risale il ponte fino all'interfaccia: se citasse
        // il valore, avremmo spostato la fuga invece di chiuderla.
        assertFalse(eccezione.message!!.contains(CHIAVE))
    }

    @Test
    fun `la stessa grammatica POSIX di sempre, né più larga né più stretta`() {
        assertTrue(TalosPonteSegreti.nomeValido("OPENROUTER_API_KEY"))
        assertTrue(TalosPonteSegreti.nomeValido("_A1"))
        assertFalse(TalosPonteSegreti.nomeValido("1A"))
        assertFalse(TalosPonteSegreti.nomeValido("openrouter_api_key"))
        assertFalse(TalosPonteSegreti.nomeValido("A B"))
        assertFalse(TalosPonteSegreti.nomeValido(""))
        assertFalse(TalosPonteSegreti.nomeValido("A\nB"))
    }

    /**
     * ⛔ Il VALORE non è ristretto — è un segreto, può contenere qualunque
     * carattere. Prima del 10/9 uno spazio bastava a spezzarlo in due
     * (limite dichiarato nel commento del 28/8): un canale che serializza
     * in JSON non ha più quel limite, e va provato che non l'abbia.
     */
    @Test
    fun `un valore con spazi, virgolette e a capo sopravvive intatto`() {
        val cattivo = "va lore \"con\" \\barre\\ e\nun a capo\ttab"

        val consegna = TalosPonteSegreti.consegna(
            listOf(PREFISSO_LD), BINARIO, SCRIPT, BASE64, mapOf("STRANO_KEY" to cattivo),
        )

        val letto = JSONObject(String(consegna.ingresso!!, Charsets.UTF_8))
        assertEquals(cattivo, letto.getString("STRANO_KEY"))
    }

    @Test
    fun `cancella() azzera i byte del segreto`() {
        val consegna = TalosPonteSegreti.consegna(
            listOf(PREFISSO_LD), BINARIO, SCRIPT, BASE64, mapOf("OPENROUTER_API_KEY" to CHIAVE),
        )
        val byte = consegna.ingresso!!
        assertTrue(String(byte, Charsets.UTF_8).contains(CHIAVE))

        consegna.cancella()

        assertTrue(byte.all { it.toInt() == 0 })
    }

    /**
     * ⛔ La versione del protocollo è il solo motivo per cui un telefono
     * fermo alla v1 non riceve in silenzio un ambiente che non sa leggere.
     * Cambiarla a caso rompe l'aggiornamento: il valore deve restare
     * ALLINEATO a quello dichiarato da `talos-exec.js`, e a tenerli
     * insieme è `tests/unit/security/segretiFuoriDallaRigaDiComando.test.ts`.
     */
    @Test
    fun `i nomi del protocollo sono quelli che talos-exec conosce`() {
        assertEquals("talos-exec/2", TalosPonteSegreti.VERSIONE_TALOS_EXEC)
        assertEquals("--ambiente-da-stdin", TalosPonteSegreti.FLAG_AMBIENTE_STDIN)
        assertEquals("--versione", TalosPonteSegreti.FLAG_VERSIONE)
    }
}
