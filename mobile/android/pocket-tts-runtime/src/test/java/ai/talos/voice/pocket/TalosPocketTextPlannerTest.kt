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
    fun `sacrificial prefix reserves tokenizer budget without changing the user sentence`() {
        val source = "uno due tre quattro cinque, sei sette otto nove dieci."
        val chunks = TalosPocketTextPlanner(
            tokenizer = tokenizer,
            maxTokens = 9,
            sacrificialPrefix = TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX,
        ).plan(source)

        assertTrue(chunks.size > 1)
        assertTrue(chunks.all { tokenizer.encode(it.synthesisSource).size <= 9 })
        assertTrue(chunks.all { it.synthesisSource.startsWith(TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX) })
        assertTrue(chunks.all { !it.source.startsWith(TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX) })
    }

    @Test
    fun `a single segment that cannot fit fails honestly instead of truncating words`() {
        val source = "uno due tre quattro cinque sei sette"
        val error = org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            TalosPocketTextPlanner(tokenizer, maxTokens = 3).plan(source)
        }
        assertTrue(error.message.orEmpty().contains("token", ignoreCase = true))
    }

    @Test
    fun `shared SentencePiece prefix is never mistaken for punctuation`() {
        val sentencePieceLike = object : TalosPocketTokenizerContract {
            override val vocabSize = 4_000
            override fun encode(source: String): IntArray {
                if (source.isNotEmpty() && source.all { it in ".!?,;:" }) {
                    return intArrayOf(260, 900 + source.length)
                }
                val ids = mutableListOf(260)
                source.trim().split(Regex("\\s+")).filter(String::isNotEmpty).forEach { word ->
                    ids += when (word.last()) {
                        '.' -> listOf(100 + word.length, 263)
                        ',' -> listOf(100 + word.length, 261)
                        else -> listOf(100 + word.length)
                    }
                }
                return ids.toIntArray()
            }

            override fun decode(ids: IntArray): String = if (ids.size == 1) "A." else "Due tre quattro cinque."
        }

        org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            TalosPocketTextPlanner(sentencePieceLike, maxTokens = 6)
                .plan("Uno due tre quattro cinque.")
        }
    }
}
