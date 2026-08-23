package ai.talos.voice.pocket

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosPocketTextPlannerTest {
    private val tokenizer = object : TalosPocketTokenizerContract {
        override val vocabSize: Int = 4_000

        override fun encode(source: String): IntArray = source
            .replace(".", " . ")
            .replace("!", " ! ")
            .replace("?", " ? ")
            .replace(",", " , ")
            .trim()
            .split(Regex("\\s+"))
            .filter { it.isNotEmpty() }
            .map { token ->
                when (token) {
                    "." -> 1
                    "!" -> 2
                    "?" -> 3
                    "," -> 4
                    else -> 100 + token.lowercase().hashCode().mod(3_800)
                }
            }
            .toIntArray()

        override fun decode(ids: IntArray): String = ids.joinToString(" ") { id ->
            when (id) {
                1 -> "."
                2 -> "!"
                3 -> "?"
                4 -> ","
                else -> "w$id"
            }
        }
    }

    @Test
    fun `prompt preparation is deterministic and preserves Italian apostrophes`() {
        assertEquals(
            "L'amica è già qui.",
            TalosPocketTextPlanner.preparePrompt("  l'amica  è già qui  ", removeSemicolons = false).source,
        )
        assertEquals(
            "Prova, ancora.",
            TalosPocketTextPlanner.preparePrompt("prova; ancora", removeSemicolons = true).source,
        )
    }

    @Test
    fun `every planned chunk remains under the tokenizer budget`() {
        val source = "uno due tre quattro cinque, sei sette otto nove dieci. undici dodici tredici quattordici."
        val chunks = TalosPocketTextPlanner(tokenizer, maxTokens = 6).plan(source)
        assertTrue(chunks.size > 1)
        assertTrue(chunks.all { tokenizer.encode(it.source).size <= 6 })
        assertEquals(chunks.indices.toList(), chunks.map { it.index })
    }

    @Test
    fun `a single segment that cannot fit fails honestly instead of truncating words`() {
        val source = "uno due tre quattro cinque sei sette"
        val error = org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            TalosPocketTextPlanner(tokenizer, maxTokens = 3).plan(source)
        }
        assertTrue(error.message.orEmpty().contains("token", ignoreCase = true))
    }
}
