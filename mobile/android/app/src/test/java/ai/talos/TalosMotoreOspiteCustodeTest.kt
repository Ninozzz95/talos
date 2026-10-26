package ai.talos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * ⛔ D-0146-1 (Pad, 26/10/2026, candidata 0.1.46 minificata e 0.1.45 pubblicata): il socket in ascolto del motore ospite moriva al
 * primo GC (R8 aveva tolto il campo che teneva vivo il `LocalSocket` legato), `accept` dava EBADF, il ciclo usciva per sempre e
 * `avvia` ridava lo stesso motore morto: ogni giro del Codice col modello locale finiva in «nessun modello aperto» fino al
 * riavvio dell'app. Qui, sul PC: il ciclo che muore lo dice, e il custode rifà il motore (chiudendo PRIMA quello vecchio).
 */
class TalosMotoreOspiteCustodeTest {

    private class Finto(val n: Int) {
        var vivo = true
        var fermato = 0
    }

    @Test
    fun `OSP-CUST-01 lo stesso motore finche e vivo, uno nuovo quando e morto, e il vecchio si ferma prima`() {
        var creati = 0
        val ordine = mutableListOf<String>()
        val custode = TalosMotoreOspite.Custode(
            { creati += 1; ordine += "crea $creati"; Finto(creati) },
            { it.vivo },
            { ordine += "ferma ${it.n}"; it.fermato += 1 },
        )
        val primo = custode.ottieni()
        assertSame(primo, custode.ottieni())
        assertEquals(1, creati)
        primo.vivo = false
        val secondo = custode.ottieni()
        assertNotSame(primo, secondo)
        assertEquals(1, primo.fermato)
        assertEquals(listOf("crea 1", "ferma 1", "crea 2"), ordine)
    }

    @Test
    fun `OSP-CUST-02 se rifarlo non riesce, il guasto risale e il morto non torna mai`() {
        var tentativi = 0
        val custode = TalosMotoreOspite.Custode(
            { tentativi += 1; if (tentativi == 2) throw IOException("bind non riuscito"); Finto(tentativi) },
            { it.vivo },
            { it.fermato += 1 },
        )
        val primo = custode.ottieni()
        primo.vivo = false
        val guasto = runCatching { custode.ottieni() }.exceptionOrNull()
        assertTrue(guasto is IOException)
        assertEquals(1, primo.fermato)
        // al tentativo dopo si rifà davvero, mai il morto di prima
        val terzo = custode.ottieni()
        assertEquals(3, terzo.n)
    }

    @Test
    fun `OSP-CUST-03 il ciclo serve ogni connessione e, quando accept si rompe, lo dice una volta sola e si ferma`() {
        val coda = ArrayDeque(listOf("a", "b"))
        val serviti = mutableListOf<String>()
        val morti = mutableListOf<String?>()
        TalosMotoreOspite.cicloDiAccettazione(
            { coda.removeFirstOrNull() ?: throw IOException("getsockopt failed: EBADF") },
            { serviti += it },
            { morti += it.message },
        )
        assertEquals(listOf("a", "b"), serviti)
        assertEquals(listOf("getsockopt failed: EBADF"), morti)
    }

    @get:Rule
    val cartella = TemporaryFolder()

    /** Un motore finto che, come quello vero, lega il SUO file di socket e lo cancella quando si ferma. */
    private class ConFile(val file: File) {
        var vivo = true
    }

    /*
     * Revisione del Desktop su D-0146-1: il thread di `accept` vede EBADF e chiama `ferma()` (vivo=false, chiude, cancella il file);
     * nello stesso istante `avvia()` vede vivo=false e rifà il motore, che lega un socket NUOVO. Se il file avesse lo stesso nome
     * (`motore.sock`), la cancellazione in ritardo del thread di `accept` toglierebbe il file del motore NUOVO: in ascolto, ma
     * irraggiungibile, e niente EBADF da dire. Qui l'intreccio esatto, coi nomi e la spazzata VERI di `TalosMotoreOspite`.
     */
    @Test
    fun `OSP-CUST-04 la cancellazione in ritardo del motore morto non tocca mai il socket del motore nuovo`() {
        val dir = cartella.newFolder("locale-ospite")
        var n = 0
        val custode = TalosMotoreOspite.Custode(
            {
                n += 1
                TalosMotoreOspite.spazzaSocketVecchi(dir)
                val f = TalosMotoreOspite.fileDelSocket(dir, "%016x".format(n))
                assertTrue(f.createNewFile())
                ConFile(f)
            },
            { it.vivo },
            { it.file.delete() },
        )
        val morto = custode.ottieni()
        // il thread di accept: vivo=false subito, la cancellazione del suo file arriva DOPO che avvia() ha rifatto il motore
        morto.vivo = false
        val nuovo = custode.ottieni()
        morto.file.delete()
        assertNotEquals(morto.file, nuovo.file)
        assertTrue("il socket del motore nuovo è sparito: ${nuovo.file}", nuovo.file.exists())
        assertTrue(nuovo.file.name, nuovo.file.name.matches(Regex("""motore-[0-9a-f]+\.sock""")))
    }

    @Test
    fun `OSP-CUST-05 la spazzata toglie i socket lasciati, anche il vecchio motore-sock, e nient altro`() {
        val dir = cartella.newFolder("locale-ospite")
        val vecchi = listOf("motore.sock", "motore-0a1b.sock").map { File(dir, it).apply { createNewFile() } }
        val altro = File(dir, "appunti.txt").apply { createNewFile() }
        TalosMotoreOspite.spazzaSocketVecchi(dir)
        vecchi.forEach { assertFalse("${it.name} doveva sparire", it.exists()) }
        assertTrue(altro.exists())
    }

    @Test
    fun `OSP-CUST-06 fermarsi e una volta sola anche se ci arrivano due thread insieme`() {
        val volta = TalosMotoreOspite.UnaVolta()
        val via = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(8)
        val prime = (1..8).map { pool.submit<Boolean> { via.await(); volta.prima() } }
        via.countDown()
        assertEquals(1, prime.count { it.get(5, TimeUnit.SECONDS) })
        pool.shutdownNow()
        assertFalse(volta.prima())
    }
}
