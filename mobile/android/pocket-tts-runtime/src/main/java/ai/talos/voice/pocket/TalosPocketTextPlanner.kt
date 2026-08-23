package ai.talos.voice.pocket


interface TalosPocketTokenizerContract {
    val vocabSize: Int
    fun encode(source: String): IntArray
    fun decode(ids: IntArray): String
}

data class TalosPocketPreparedPrompt(val source: String, val framesAfterEosGuess: Int)

data class TalosPocketPlannedSentence(
    val index: Int,
    val source: String,
    val tokenIds: IntArray,
    val framesAfterEos: Int,
) {
    override fun equals(other: Any?): Boolean = other is TalosPocketPlannedSentence &&
        index == other.index && source == other.source && tokenIds.contentEquals(other.tokenIds) &&
        framesAfterEos == other.framesAfterEos

    override fun hashCode(): Int = 31 * source.hashCode() + tokenIds.contentHashCode()
}

class TalosPocketTextPlanner(
    private val tokenizer: TalosPocketTokenizerContract,
    private val maxTokens: Int,
    private val padWithSpacesForShortInputs: Boolean = false,
    private val removeSemicolons: Boolean = false,
    private val recommendedFramesAfterEos: Int? = null,
) {
    init {
        require(tokenizer.vocabSize == 4_000) { "Italian Pocket tokenizer vocab must be 4000" }
        require(maxTokens > 0) { "maxTokens must be positive" }
    }

    fun plan(source: String): List<TalosPocketPlannedSentence> {
        val prepared = preparePrompt(source, removeSemicolons, padWithSpacesForShortInputs)
        val tokens = tokenizer.encode(prepared.source)
        require(tokens.isNotEmpty()) { "Pocket tokenizer returned no tokens" }
        val sentenceBoundaries = punctuationTokens(".", "!", "?")
        val commaBoundaries = punctuationTokens(",", ";", ":")
        val sentenceSegments = splitAfterBoundaries(tokens, sentenceBoundaries)
        val refined = sentenceSegments.flatMap { segment ->
            if (segment.size <= maxTokens) listOf(segment)
            else splitAfterBoundaries(segment, commaBoundaries)
        }
        require(refined.all { it.size <= maxTokens }) {
            "a Pocket text segment exceeds the $maxTokens token budget without a semantic boundary"
        }

        val packed = mutableListOf<IntArray>()
        var current = IntArray(0)
        for (segment in refined) {
            if (current.isNotEmpty() && current.size + segment.size > maxTokens) {
                packed += current
                current = segment
            } else {
                current += segment
            }
        }
        if (current.isNotEmpty()) packed += current
        return packed.mapIndexed { index, ids ->
            val decoded = tokenizer.decode(ids).trim()
            val prompt = preparePrompt(decoded, removeSemicolons, padWithSpacesForShortInputs)
            TalosPocketPlannedSentence(
                index = index,
                source = prompt.source,
                tokenIds = tokenizer.encode(prompt.source),
                framesAfterEos = recommendedFramesAfterEos ?: (prompt.framesAfterEosGuess + 2),
            )
        }.also { planned ->
            require(planned.all { it.tokenIds.size <= maxTokens }) {
                "Pocket decode/prepare round trip exceeded the token budget"
            }
        }
    }

    private fun punctuationTokens(vararg values: String): Set<Int> = values
        .flatMap { tokenizer.encode(it).toList() }
        .toSet()

    private fun splitAfterBoundaries(tokens: IntArray, boundaryTokens: Set<Int>): List<IntArray> {
        if (tokens.isEmpty()) return emptyList()
        val boundaries = mutableListOf(0)
        var previousWasBoundary = false
        for (index in tokens.indices) {
            if (tokens[index] in boundaryTokens) {
                previousWasBoundary = true
            } else if (previousWasBoundary) {
                boundaries += index
                previousWasBoundary = false
            }
        }
        boundaries += tokens.size
        return boundaries.zipWithNext { start, end -> tokens.copyOfRange(start, end) }
            .filter { it.isNotEmpty() }
    }

    companion object {
        fun preparePrompt(
            raw: String,
            removeSemicolons: Boolean,
            padWithSpacesForShortInputs: Boolean = false,
        ): TalosPocketPreparedPrompt {
            var source = raw.trim().replace(Regex("\\s+"), " ")
            require(source.isNotEmpty()) { "Pocket source must not be empty" }
            if (removeSemicolons) source = source.replace(';', ',')
            val words = source.split(' ').count { it.isNotBlank() }
            val framesAfterEosGuess = if (words <= 4) 3 else 1
            source = source.replaceFirstChar { character ->
                if (character.isLowerCase()) character.titlecase() else character.toString()
            }
            if (source.last().isLetterOrDigit()) source += "."
            if (padWithSpacesForShortInputs && words < 5) source = "        $source"
            return TalosPocketPreparedPrompt(source, framesAfterEosGuess)
        }
    }
}
