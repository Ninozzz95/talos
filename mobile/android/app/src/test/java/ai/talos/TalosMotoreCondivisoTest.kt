package ai.talos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): la chat e il Codice usano LO STESSO motore
 * aperto e lo stesso «un giro alla volta» (llama.cpp non regge due decode sullo stesso contesto; il plugin rifiuta con
 * `TALOS_LLAMA_BUSY`). Il motore e il guardiano stanno in `TalosMotoreCondiviso`, e il plugin usa gli stessi oggetti.
 */
class TalosMotoreCondivisoTest {
    @Test
    fun `CONDIVISO-01 si prende il motore solo se c'e ed e libero, e lo si lascia`() {
        val motore = AtomicReference<String>(null)
        val occupato = AtomicBoolean(false)
        assertEquals(TalosMotoreCondiviso.Esito.NESSUN_MODELLO, TalosMotoreCondiviso.prendi(motore::get, occupato))
        assertFalse(occupato.get())
        motore.set("modello")
        assertEquals(TalosMotoreCondiviso.Esito.PRESO, TalosMotoreCondiviso.prendi(motore::get, occupato))
        assertTrue(occupato.get())
        // la chat (o un secondo giro del Codice) arriva mentre si genera: occupato, e il guardiano resta di chi l'ha preso
        assertEquals(TalosMotoreCondiviso.Esito.OCCUPATO, TalosMotoreCondiviso.prendi(motore::get, occupato))
        assertTrue(occupato.get())
        occupato.set(false)
        // il modello chiuso fra il controllo e la presa: c'è al primo sguardo, non più al secondo ⇒ niente guardiano acceso
        val letture = ArrayDeque(listOf("modello", null))
        assertEquals(TalosMotoreCondiviso.Esito.NESSUN_MODELLO, TalosMotoreCondiviso.prendi({ letture.removeFirst() }, occupato))
        assertFalse(occupato.get())
        // senza modello fin dall'inizio
        motore.set(null)
        assertEquals(TalosMotoreCondiviso.Esito.NESSUN_MODELLO, TalosMotoreCondiviso.prendi(motore::get, occupato))
        assertFalse(occupato.get())
    }

    @Test
    fun `CONDIVISO-02 il plugin della chat usa il motore e il guardiano condivisi`() {
        val plugin = File("src/main/java/ai/talos/TalosLlamaPlugin.java").readText()
        assertTrue(plugin.contains("private final AtomicReference<TalosLlamaEngine> openEngine = TalosMotoreCondiviso.MOTORE;"))
        assertTrue(plugin.contains("private final AtomicBoolean generating = TalosMotoreCondiviso.OCCUPATO;"))
        // ⛔ e lo stesso ATTORE: il motore si usa solo dal thread che l'ha aperto (`TalosLlamaEngine.soloAttore`), quindi il
        // Codice affida i suoi giri allo stesso esecutore a thread singolo della chat
        assertTrue(plugin.contains("private final ExecutorService worker = TalosMotoreCondiviso.ATTORE;"))
    }

    @Test
    fun `CONDIVISO-03 distruggere il plugin chiude il modello ma NON spegne l'attore condiviso`() {
        // ⛔ Prima ogni plugin aveva il suo esecutore e `handleOnDestroy` lo spegneva. Con l'attore condiviso, spegnerlo lascerebbe
        // la prossima Activity (e il Codice) con un esecutore che rifiuta tutto: la chiusura si aspetta, l'attore resta vivo.
        val plugin = File("src/main/java/ai/talos/TalosLlamaPlugin.java").readText()
        val distruzione = plugin.substringAfter("protected void handleOnDestroy() {").substringBefore("\n    }\n")
        assertFalse(distruzione.contains("worker.shutdown"))
        assertTrue(distruzione.contains("worker.submit(this::closeOpenModel)"))
        assertTrue(distruzione.contains("CHIUSURA_MAX_MS"))
    }

    @Test
    fun `CONDIVISO-04 sull'attore si lavora dall'attore, e dall'attore stesso si esegue subito senza bloccarsi`() {
        val dove = TalosMotoreCondiviso.sullAttore(java.util.concurrent.Callable { Thread.currentThread() })
        assertTrue(dove === TalosMotoreCondiviso.threadAttore())
        // dall'attore: niente secondo compito in coda dietro a se stesso (sarebbe un blocco per sempre)
        val dentro = TalosMotoreCondiviso.ATTORE.submit(java.util.concurrent.Callable {
            TalosMotoreCondiviso.sullAttore(java.util.concurrent.Callable { "fatto" })
        }).get(5, java.util.concurrent.TimeUnit.SECONDS)
        assertEquals("fatto", dentro)
    }

    @Test
    fun `CONDIVISO-05 anche il percorso del modello aperto e condiviso col Codice`() {
        val plugin = File("src/main/java/ai/talos/TalosLlamaPlugin.java").readText()
        assertTrue(Regex("""AtomicReference<String> openPath = TalosMotoreCondiviso\.PERCORSO;""").containsMatchIn(plugin))
    }
}
