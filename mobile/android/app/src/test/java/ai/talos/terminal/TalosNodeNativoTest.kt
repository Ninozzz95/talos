package ai.talos.terminal

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * K2-A (owner 14/10/2026, «Una copia sola»; ledger `LEDGER-K2A-NODE-AUTOSUFFICIENTE-2026-10-14.md`): Node e le sue 9 librerie
 * stanno solo fra le librerie native, anche per la strada del ponte. Qui ciò che non ha bisogno di Android.
 */
class TalosNodeNativoTest {
    private fun cartella(): File = Files.createTempDirectory("talos-node-nativo").toFile()

    /**
     * ⛔ COD-NODE-03: al ponte vanno Node (col nome remoto `node`) e le 9 librerie col loro nome, tutti nella STESSA cartella
     * remota: `$ORIGIN` le cerca accanto al binario. Le altre librerie native dell'APK (adb, llama, NPU…) non ci vanno.
     */
    @Test
    fun `COD-NODE-03 al ponte vanno Node e le sue 9 librerie, accanto, e nient'altro`() {
        val native = cartella()
        (TalosNodeNativo.LIBRERIE + TalosNodeNativo.BINARIO + listOf("libadb.so", "libllama.so", "libz.so"))
            .forEach { File(native, it).writeText(it) }
        val coppie = TalosNodeNativo.fileDaSpingere(native, "/data/local/tmp/talos")
        assertEquals(10, coppie.size)
        assertTrue(coppie.contains(File(native, "libtalosnode.so") to "/data/local/tmp/talos/node"))
        for (nome in TalosNodeNativo.LIBRERIE) assertTrue(nome, coppie.contains(File(native, nome) to "/data/local/tmp/talos/$nome"))
        assertFalse(coppie.any { it.first.name in setOf("libadb.so", "libllama.so", "libz.so") })
    }

    @Test
    fun `COD-NODE-03 se manca un file fra le librerie native e' un errore che lo nomina`() {
        val native = cartella()
        (TalosNodeNativo.LIBRERIE.drop(1) + TalosNodeNativo.BINARIO).forEach { File(native, it).writeText(it) }
        val errore = runCatching { TalosNodeNativo.fileDaSpingere(native, "/data/local/tmp/talos") }.exceptionOrNull()
        assertTrue(errore?.message.orEmpty().contains(TalosNodeNativo.LIBRERIE.first()))
    }

    /**
     * ⛔ COD-NODE-04: chi aggiorna l'app ha ancora in `files/talos-node-staging` il runtime di prima (~92 MB: Node e le 9
     * librerie coi nomi vecchi). Si toglie, e solo quello: `talos-exec.js` e ogni altro file restano.
     */
    @Test
    fun `COD-NODE-04 la pulizia toglie solo il runtime vecchio`() {
        val staging = cartella()
        val vecchi = TalosNodeNativo.RUNTIME_VECCHIO
        (vecchi + listOf("talos-exec.js", "altro.txt")).forEach { File(staging, it).writeText(it) }
        File(staging, "libz.so.1.tmp").writeText("copia a metà")
        val tolti = TalosNodeNativo.pulisciRuntimeVecchio(staging)
        assertEquals(vecchi.size + 1, tolti)
        assertEquals(setOf("talos-exec.js", "altro.txt"), staging.list()!!.toSet())
        assertEquals(10, vecchi.size)
        assertTrue("talos-node-bin" in vecchi && "libicudata.so.78" in vecchi)
        assertEquals(0, TalosNodeNativo.pulisciRuntimeVecchio(File(staging, "non-esiste")))
    }
}
