package ai.talos.voice.pocket

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test


class TalosPocketTokenizerTest {
    private class FakeBridge : TalosPocketTokenizerNativeBridge {
        var closes = 0
        override fun create(modelPath: String): Long = if (File(modelPath).name == "tokenizer.model") 7 else 0
        override fun encode(handle: Long, source: String): IntArray = intArrayOf(handle.toInt(), source.length)
        override fun decode(handle: Long, ids: IntArray): String = "$handle:${ids.joinToString(",")}" 
        override fun vocabSize(handle: Long): Int = if (handle == 7L) 4_000 else 0
        override fun close(handle: Long) { if (handle == 7L) closes++ }
    }

    @Test
    fun `tokenizer owns one native handle and exposes the exact 4000 entry vocabulary`() {
        val bridge = FakeBridge()
        val tokenizer = TalosPocketTokenizer.openForTest(File("tokenizer.model"), bridge)
        assertEquals(4_000, tokenizer.vocabSize)
        assertEquals(listOf(7, 5), tokenizer.encode("ciao!").toList())
        assertEquals("7:1,2", tokenizer.decode(intArrayOf(1, 2)))
        tokenizer.close()
        tokenizer.close()
        assertEquals(1, bridge.closes)
    }

    @Test
    fun `use after close fails before crossing JNI`() {
        val tokenizer = TalosPocketTokenizer.openForTest(File("tokenizer.model"), FakeBridge())
        tokenizer.close()
        assertThrows(IllegalStateException::class.java) { tokenizer.encode("ciao") }
        assertThrows(IllegalStateException::class.java) { tokenizer.decode(intArrayOf(1)) }
    }

    @Test
    fun `a wrong vocabulary is rejected at open and its handle is closed`() {
        val bridge = object : TalosPocketTokenizerNativeBridge {
            var closes = 0
            override fun create(modelPath: String) = 9L
            override fun encode(handle: Long, source: String) = intArrayOf()
            override fun decode(handle: Long, ids: IntArray) = ""
            override fun vocabSize(handle: Long) = 3_999
            override fun close(handle: Long) { closes++ }
        }
        assertThrows(IllegalArgumentException::class.java) {
            TalosPocketTokenizer.openForTest(File("tokenizer.model"), bridge)
        }
        assertEquals(1, bridge.closes)
    }
}
