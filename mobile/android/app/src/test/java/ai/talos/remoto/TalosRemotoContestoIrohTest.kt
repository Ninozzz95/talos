package ai.talos.remoto

import android.content.Context
import android.content.ContextWrapper
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ⛔ F (24/10/2026): dal vivo, a ogni canale remoto, `libiroh_ffi.so` stampava `android context was not initialized` (ndk-context) e
 * ogni tanto un collegamento aspettava il tetto di ~30 s. iroh-ffi v1.1.0 chiede `IrohAndroid.installAndroidContext` all'avvio, ma
 * la classe che lo chiama sta solo nell'AAR `iroh-android`, che non usiamo: nessuno la chiamava. Qui si prova che ora la chiama il
 * plugin quando si carica, col contesto dell'APPLICAZIONE, e che una `.so` che non si carica non fa cadere l'app.
 */
class TalosRemotoContestoIrohTest {
    /** Un contesto finto: niente bridge né Android, solo l'`applicationContext` che si vuole vedere arrivare a iroh. */
    private class ContestoFinto(private val app: Context?) : ContextWrapper(null) {
        override fun getApplicationContext(): Context? = app
    }

    private val nativaVera = TalosRemotoContestoIroh.nativa
    private val avvisoVero = TalosRemotoContestoIroh.avviso
    private val avvisi = mutableListOf<Throwable>()

    @After
    fun ripristina() {
        TalosRemotoContestoIroh.nativa = nativaVera
        TalosRemotoContestoIroh.avviso = avvisoVero
    }

    private fun pluginCon(contesto: Context): TalosRemotoPlugin {
        TalosRemotoContestoIroh.avviso = { avvisi += it }
        return TalosRemotoPlugin().also { it.contestoPerIroh = { contesto } }
    }

    @Test
    fun `IRA-01 load passa a iroh il contesto dell'applicazione, non quello del plugin`() {
        val app = ContestoFinto(null)
        val ricevuti = mutableListOf<Context>()
        val plugin = pluginCon(ContestoFinto(app))
        TalosRemotoContestoIroh.nativa = { ricevuti += it }
        plugin.load()
        assertEquals(1, ricevuti.size)
        assertSame(app, ricevuti[0])
        assertTrue(avvisi.isEmpty())
    }

    @Test
    fun `IRA-02 una so che non si collega non fa cadere l'app - resta un avviso`() {
        val plugin = pluginCon(ContestoFinto(ContestoFinto(null)))
        TalosRemotoContestoIroh.nativa = { throw UnsatisfiedLinkError("dlopen failed: libiroh_ffi.so") }
        plugin.load()
        assertEquals(1, avvisi.size)
        assertTrue(avvisi[0] is UnsatisfiedLinkError)
    }

    @Test
    fun `IRA-03 la catena vera senza la so (JVM) - errore d'inizializzazione preso e avvisato`() {
        // Qui la `nativa` è quella vera: `IrohAndroid` fa `System.loadLibrary("iroh_ffi")`, che sulla JVM delle prove non c'è
        // (o c'è senza il simbolo Android): ExceptionInInitializerError / UnsatisfiedLinkError, mai fuori da `load()`.
        val plugin = pluginCon(ContestoFinto(ContestoFinto(null)))
        plugin.load()
        plugin.load()
        assertEquals(2, avvisi.size)
        assertTrue(avvisi.all { it is LinkageError || it is ExceptionInInitializerError })
    }

    @Test
    fun `IRA-04 anche il lavoro della sveglia (app uccisa, niente plugin) installa il contesto prima di aprire`() {
        // Ad app uccisa il processo parte per il JobScheduler: niente bridge, quindi niente `load()`. L'Endpoint lo apre
        // `TalosSvegliaLavoro.esegui`, e la chiamata deve stare PRIMA di `apriVerso`.
        val lavoro = File("src/main/java/ai/talos/remoto/TalosSvegliaLavoro.kt").readText()
        val prepara = lavoro.indexOf("TalosRemotoContestoIroh.prepara(context)")
        val apre = lavoro.indexOf("TalosRemotoTrasporto.apriVerso(")
        assertTrue("manca la chiamata nel lavoro della sveglia", prepara >= 0)
        assertTrue("la chiamata deve precedere l'apertura", prepara < apre)
    }

    @Test
    fun `IRA-05 R8 tiene IrohAndroid e il suo metodo nativo per nome`() {
        // Il simbolo JNI è `Java_computer_iroh_IrohAndroid_installAndroidContext`: rinominati da R8, classe o metodo non trovano
        // più la `.so` (lezione 0.1.44, JNA/R8) — e lo si vedrebbe solo in una build minificata.
        val regole = File("proguard-rules.pro").readLines().map { it.trim() }.filterNot { it.startsWith("#") }.joinToString("\n")
        assertTrue(
            "manca la regola esplicita per computer.iroh.IrohAndroid",
            Regex("""-keep class computer\.iroh\.IrohAndroid \{[^}]*native <methods>;[^}]*\}""").containsMatchIn(regole),
        )
    }

    @Test
    fun `IRA-06 la classe Kotlin ha il pacchetto e il nome del simbolo JNI della so`() {
        val sorgente = File("src/main/java/computer/iroh/IrohAndroid.kt").readText()
        assertTrue(sorgente.contains("package computer.iroh"))
        assertTrue(sorgente.contains("object IrohAndroid"))
        assertTrue(sorgente.contains("System.loadLibrary(\"iroh_ffi\")"))
        assertTrue(Regex("""@JvmStatic\s+external fun installAndroidContext\(context: Context\)""").containsMatchIn(sorgente))
    }
}
