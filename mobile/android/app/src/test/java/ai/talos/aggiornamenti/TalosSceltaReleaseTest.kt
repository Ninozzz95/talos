package ai.talos.aggiornamenti

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Nel repository pubblico escono tre prodotti (mobile `vX.Y.Z`, desktop `desktop-vX.Y.Z`, CLI): il desktop sceglie la sua
 * dall'elenco delle release (`aggiornamenti.mjs:44-74`), il mobile fa lo stesso con le sue. Bozze e pre-release non contano.
 */
class TalosSceltaReleaseTest {

    private fun release(tag: String, bozza: Boolean = false, pre: Boolean = false) =
        """{"tag_name":"$tag","draft":$bozza,"prerelease":$pre,"body":"notes","html_url":"https://github.com/Ninozzz95/talos/releases/tag/$tag"}"""

    private fun elenco(vararg voci: String) = "[" + voci.joinToString(",") + "]"

    @Test
    fun `AGG-REL-01 vince la v piu' alta, non la prima dell'elenco`() {
        val scelta = TalosSceltaRelease.scegli(elenco(release("v0.1.43"), release("v0.1.44"), release("v0.1.9")))
        assertEquals("v0.1.44", scelta?.tag)
        assertEquals("0.1.44", scelta?.versione)
        assertEquals("https://github.com/Ninozzz95/talos/releases/tag/v0.1.44", scelta?.pagina)
    }

    @Test
    fun `AGG-REL-02 il desktop e la CLI non sono release del mobile`() {
        val scelta = TalosSceltaRelease.scegli(elenco(release("desktop-v0.2.0"), release("cli-v1.0.0"), release("v0.1.43")))
        assertEquals("v0.1.43", scelta?.tag)
    }

    @Test
    fun `AGG-REL-03 bozze e pre-release si saltano`() {
        val scelta = TalosSceltaRelease.scegli(elenco(release("v0.1.45", bozza = true), release("v0.1.44", pre = true), release("v0.1.43")))
        assertEquals("v0.1.43", scelta?.tag)
    }

    @Test
    fun `AGG-REL-05 la pagina si tiene solo se e' di GitHub`() {
        val scelta = TalosSceltaRelease.scegli("""[{"tag_name":"v0.1.44","draft":false,"prerelease":false,"html_url":"https://altro.example/x"}]""")
        assertEquals("", scelta?.pagina)
    }

    @Test
    fun `AGG-REL-04 elenco vuoto, senza mobile o illeggibile non sceglie niente`() {
        assertNull(TalosSceltaRelease.scegli("[]"))
        assertNull(TalosSceltaRelease.scegli(elenco(release("desktop-v0.2.0"))))
        assertNull(TalosSceltaRelease.scegli("<html>rate limit</html>"))
        assertNull(TalosSceltaRelease.scegli("""{"message":"API rate limit exceeded"}"""))
    }
}
