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
    val synthesisSource: String,
    val tokenIds: IntArray,
    val framesAfterEos: Int,
) {
    override fun equals(other: Any?): Boolean = other is TalosPocketPlannedSentence &&
        index == other.index && source == other.source && synthesisSource == other.synthesisSource &&
        tokenIds.contentEquals(other.tokenIds) &&
        framesAfterEos == other.framesAfterEos

    override fun hashCode(): Int {
        var result = index
        result = 31 * result + source.hashCode()
        result = 31 * result + synthesisSource.hashCode()
        result = 31 * result + tokenIds.contentHashCode()
        result = 31 * result + framesAfterEos
        return result
    }
}

class TalosPocketTextPlanner(
    private val tokenizer: TalosPocketTokenizerContract,
    private val maxTokens: Int,
    private val padWithSpacesForShortInputs: Boolean = false,
    private val removeSemicolons: Boolean = false,
    private val recommendedFramesAfterEos: Int? = null,
    private val sacrificialPrefix: String? = null,
) {
    init {
        require(tokenizer.vocabSize == 4_000) { "Italian Pocket tokenizer vocab must be 4000" }
        require(maxTokens > 0) { "maxTokens must be positive" }
    }

    fun plan(source: String): List<TalosPocketPlannedSentence> {
        val prepared = preparePrompt(source, removeSemicolons, padWithSpacesForShortInputs)
        val tokens = tokenizer.encode(prepared.source)
        require(tokens.isNotEmpty()) { "Pocket tokenizer returned no tokens" }
        val prefixTokens = sacrificialPrefix?.let { prefix ->
            tokenizer.encode(preparePrompt(prefix, removeSemicolons = false).source).size
        } ?: 0
        val payloadTokenBudget = maxTokens - prefixTokens
        require(payloadTokenBudget > 0) { "Pocket sacrificial prefix consumes the tokenizer budget" }
        val sentenceBoundaries = punctuationTokens(".", "!", "?")
        val commaBoundaries = punctuationTokens(",", ";", ":")
        val sentenceSegments = splitAfterBoundaries(tokens, sentenceBoundaries)
        val refined = sentenceSegments.flatMap { segment ->
            if (segment.size <= payloadTokenBudget) listOf(segment)
            else splitAfterBoundaries(segment, commaBoundaries)
        }
        require(refined.all { it.size <= payloadTokenBudget }) {
            "a Pocket text segment exceeds the $payloadTokenBudget payload token budget without a semantic boundary"
        }

        val packed = mutableListOf<IntArray>()
        var current = IntArray(0)
        for (segment in refined) {
            if (current.isNotEmpty() && current.size + segment.size > payloadTokenBudget) {
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
            val synthesisPrompt = sacrificialPrefix
                ?.let { prefix -> preparePrompt(prefix + prompt.source, removeSemicolons, padWithSpacesForShortInputs) }
                ?: prompt
            TalosPocketPlannedSentence(
                index = index,
                source = prompt.source,
                synthesisSource = synthesisPrompt.source,
                tokenIds = tokenizer.encode(synthesisPrompt.source),
                framesAfterEos = recommendedFramesAfterEos ?: (prompt.framesAfterEosGuess + 2),
            )
        }.also { planned ->
            require(planned.all { it.tokenIds.size <= maxTokens }) {
                "Pocket decode/prepare round trip exceeded the token budget"
            }
        }
    }

    private fun punctuationTokens(vararg values: String): Set<Int> {
        val separatelyEncoded = values.map(tokenizer::encode)
        val sharedPrefix = separatelyEncoded
            .takeIf { encoded -> encoded.all { it.size > 1 } }
            ?.map { it.first() }
            ?.distinct()
            ?.singleOrNull()
        if (sharedPrefix == null) return separatelyEncoded.flatMap(IntArray::toList).toSet()

        // SentencePiece emits its standalone whitespace marker before every
        // punctuation probe (260 in the pinned Italian tokenizer). Upstream
        // deliberately drops that prefix; treating it as punctuation creates
        // false boundaries at ordinary word starts. Encoding the combined
        // probe also preserves multi-character pieces such as an ellipsis.
        val combined = tokenizer.encode(values.joinToString(""))
        require(combined.size > 1 && combined.first() == sharedPrefix) {
            "Pocket tokenizer punctuation prefix is inconsistent"
        }
        return combined.drop(1).toSet()
    }

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
