package ai.talos.agent

import ai.talos.parola.TalosParola
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A0-1 e A0-3 (ledger `LEDGER-A0-ASSISTENTE-2026-10-21.md`).
 *
 * A0-1: dopo un riavvio «hey TALOS» restava sordo finché la persona non apriva TALOS, perché la parola si riaccendeva solo da
 * MainActivity. Il sistema accende da solo il servizio dell'assistente (`onReady`), e il servizio microfono avviato da chi fornisce
 * il VoiceInteractionService è un'eccezione documentata all'avvio dal fondo: Home Assistant riaccende l'ascolto proprio lì
 * (`AssistVoiceInteractionService.kt:78-112`) e ignora un `onReady` che arriva dopo lo spegnimento.
 *
 * A0-3: il riconoscitore finto puntava all'XML dell'ASSISTENTE e, senza `selectableAsDefault="false"` (AOSP 6d9979b6710e, di serie
 * vero), su un telefono senza riconoscitore predefinito il sistema poteva sceglierlo da solo: la dettatura di tutte le app sarebbe
 * finita in un servizio che non riconosce niente.
 */
class TalosAssistenteRisveglioTest {
    private fun leggi(percorso: String): String = File(percorso).readText()

    /** A0-1-1 — si riaccende solo se la persona l'aveva voluta, il microfono è concesso e non è già viva. */
    @Test
    fun siRiaccendeSoloSeVolutaConcessaESpenta() {
        assertTrue(TalosParola.deveRiprendere(voluta = true, permesso = true, accesa = false))
        assertFalse(TalosParola.deveRiprendere(voluta = false, permesso = true, accesa = false))
        assertFalse(TalosParola.deveRiprendere(voluta = true, permesso = false, accesa = false))
        assertFalse(TalosParola.deveRiprendere(voluta = true, permesso = true, accesa = true))
    }

    /** A0-1-2 — `riprendiSeVoluta` usa la decisione pura, non una copia inline. */
    @Test
    fun riprendiSeVolutaUsaLaDecisionePura() {
        val parola = leggi("src/main/java/ai/talos/parola/TalosParola.kt")
        val corpo = parola.substringAfter("fun riprendiSeVoluta(contesto: Context)").substringBefore("fun accesa()")
        assertTrue(corpo.contains("deveRiprendere("))
    }

    /** A0-1-3 — `onReady` riaccende la parola, ma non dopo lo spegnimento (il chiavistello di HA). */
    @Test
    fun onReadyRiaccendeLaParolaMaNonDopoLoSpegnimento() {
        val servizio = leggi("src/main/java/ai/talos/agent/TalosAssistente.kt")
        val pronto = servizio.substringAfter("override fun onReady()").substringBefore("override fun onShutdown()")
        // dal sistema passa per il freno (revisione avversaria, punto 3), non direttamente
        assertTrue(pronto.contains("TalosParola.riprendiDalSistema(this)"))
        assertFalse(pronto.contains("riprendiSeVoluta"))
        val guardia = pronto.indexOf("if (spento)")
        assertTrue("manca la guardia dello spegnimento", guardia >= 0)
        assertTrue(guardia < pronto.indexOf("TalosParola.riprendiDalSistema(this)"))
        // il chiavistello si chiude in tutti e due i punti in cui il servizio muore, come HA
        val spegni = servizio.substringAfter("override fun onShutdown()").substringBefore("override fun onDestroy()")
        assertTrue(spegni.contains("spento = true"))
        val distruggi = servizio.substringAfter("override fun onDestroy()").substringBefore("companion object")
        assertTrue(distruggi.contains("spento = true"))
    }

    /**
     * A0-1-4 — il freno: se il servizio della parola muore all'avvio, il sistema rilega l'assistente, `onReady` la riaccende e muore
     * di nuovo. Al massimo tre riprese dal sistema in dieci minuti; le vecchie non contano, e nemmeno quelle «dal futuro» (orologio
     * spostato indietro), che altrimenti terrebbero il freno tirato per sempre.
     */
    @Test
    fun ilFrenoFermaLaQuartaRipresaInDieciMinuti() {
        val ora = 100_000_000L
        val minuto = 60_000L
        assertFalse(TalosParola.frenoDellaRipresa(emptyList(), ora))
        assertFalse(TalosParola.frenoDellaRipresa(listOf(ora - minuto, ora - 2 * minuto), ora))
        assertTrue(TalosParola.frenoDellaRipresa(listOf(ora - minuto, ora - 2 * minuto, ora - 9 * minuto), ora))
        assertFalse(TalosParola.frenoDellaRipresa(listOf(ora - minuto, ora - 2 * minuto, ora - 10 * minuto), ora))
        assertFalse(TalosParola.frenoDellaRipresa(listOf(ora - minuto, ora - 2 * minuto, ora + minuto), ora))
    }

    /** A0-1-5 — un avvio in primo piano rifiutato ferma il servizio invece di far cadere il processo (e far ripartire il giro). */
    @Test
    fun lAvvioInPrimoPianoRifiutatoNonFaCadereIlProcesso() {
        val parola = leggi("src/main/java/ai/talos/parola/TalosParola.kt")
        val avvio = parola.substringAfter("override fun onStartCommand(").substringBefore("lavoratore = thread(")
        assertTrue(Regex("""try \{\s*avviaInPrimoPiano\(\)\s*\} catch \(rifiutato: RuntimeException\) \{""").containsMatchIn(avvio))
        assertTrue(avvio.substringAfter("catch (rifiutato: RuntimeException)").substringBefore("}").contains("stopSelf()"))
    }

    /** A0-3-1 — il riconoscitore finto ha un XML suo, che lo toglie dalla scelta automatica del predefinito. */
    @Test
    fun ilRiconoscitoreFintoNonESelezionabileComePredefinito() {
        val xml = leggi("src/main/res/xml/talos_riconoscimento.xml")
        assertTrue(xml.contains("<recognition-service"))
        assertTrue(xml.contains("android:selectableAsDefault=\"false\""))
        val manifest = leggi("src/main/AndroidManifest.xml")
        val servizio = manifest.substringAfter("android:name=\"ai.talos.agent.TalosAssistenteRiconoscimento\"").substringBefore("</service>")
        assertTrue(servizio.contains("android:resource=\"@xml/talos_riconoscimento\""))
        assertFalse(servizio.contains("@xml/talos_assistente"))
        // l'assistente resta col suo XML: una volta sola, sul servizio dell'assistente
        assertEquals(1, Regex("@xml/talos_assistente").findAll(manifest).count())
    }
}
