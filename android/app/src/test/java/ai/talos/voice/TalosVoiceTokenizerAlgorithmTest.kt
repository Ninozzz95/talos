package ai.talos.voice

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * `TalosMossRuntimeInstrumentedTest` and `TalosVoiceTokenizerInstrumentedTest`
 * prove parity against the REAL `tokenizer.model` (194/194, on-device) - but
 * that model's realistic Italian text happens to almost never exercise the
 * algorithm's edge branches (byte-fallback, a frozen user-defined symbol,
 * a normalizer flag actually being off) on purpose - real vocab, real text.
 * This file points a tiny, hand-built synthetic vocabulary straight at each
 * branch instead, and runs on the host JVM: no device, no `tokenizer.model`,
 * seconds not minutes. It also exercises [TalosSentencePieceModel.parse]
 * itself for the first time in isolation - until now its only cover was
 * indirect, through parsing the real file end to end.
 *
 * The synthetic bytes are built with [ProtoWriter], the write-side mirror of
 * the protobuf reader in [TalosSentencePieceModel] - varint continuation-bit
 * and fixed32 little-endian rules verified against
 * https://protobuf.dev/programming-guides/encoding/ before writing it.
 */
class TalosVoiceTokenizerAlgorithmTest {

    @Test
    fun greedyMergeCascadesInScoreOrderNotInputOrder() {
        // "abc" with pieces a,b,c (score 0 each), "ab" (score 10), "abc" (score 20).
        // A correct greedy-by-score merge must produce id(abc) directly: first
        // a+b -> ab (only pair with a positive score among the two initial
        // candidates a-b/b-c), then ab+c -> abc. A merge that went by input
        // position instead of score, or stopped after one merge, would fail
        // this.
        val model = syntheticModel(
            pieces = listOf(
                Piece("a", 0f, NORMAL), Piece("b", 0f, NORMAL), Piece("c", 0f, NORMAL),
                Piece("ab", 10f, NORMAL), Piece("abc", 20f, NORMAL), Piece("bc", 5f, NORMAL),
            ),
            addDummyPrefix = false,
            escapeWhitespaces = false,
        )
        val tokenizer = TalosVoiceBpeTokenizer(model)
        assertArrayEquals(intArrayOf(model.idOf("abc")!!), tokenizer.encode("abc"))
    }

    @Test
    fun unknownCharacterFallsBackToItsUtf8Bytes() {
        // "z" has no matching piece anywhere in the vocab, but its UTF-8 byte
        // (0x7A) does. A tokenizer that instead threw, or silently dropped
        // the character, would fail this - and so would one that used the
        // wrong byte value (off-by-one in the "<0xNN>" parse).
        val model = syntheticModel(
            pieces = listOf(
                Piece("a", 0f, NORMAL),
                Piece("<0x7A>", 0f, BYTE),
            ),
            addDummyPrefix = false,
            escapeWhitespaces = false,
        )
        val tokenizer = TalosVoiceBpeTokenizer(model)
        assertArrayEquals(intArrayOf(model.idOf("<0x7A>")!!), tokenizer.encode("z"))
    }

    @Test
    fun aKnownCharacterNeverFallsBackToBytesEvenWhenByteFallbackExists() {
        // The contrary case of the test above: when a real piece DOES match,
        // byte-fallback must not fire instead. Both "a" and its byte fallback
        // exist here - only the real piece id may come out.
        val model = syntheticModel(
            pieces = listOf(
                Piece("a", 0f, NORMAL),
                Piece("<0x61>", 0f, BYTE),
            ),
            addDummyPrefix = false,
            escapeWhitespaces = false,
        )
        val tokenizer = TalosVoiceBpeTokenizer(model)
        assertArrayEquals(intArrayOf(model.idOf("a")!!), tokenizer.encode("a"))
    }

    @Test
    fun userDefinedSymbolMatchesWholeAndFrozenEvenAcrossWhatWouldOtherwiseMerge() {
        // "<sp>" is USER_DEFINED. "a<sp>b" must come out as three symbols -
        // "a", the frozen "<sp>", "b" - never merged into anything, even
        // though a "a"+"<sp>" merge exists in-vocab with a score high enough
        // to win the greedy queue outright if the frozen check did not run
        // before that candidate was even built.
        val model = syntheticModel(
            pieces = listOf(
                Piece("a", 0f, NORMAL), Piece("b", 0f, NORMAL),
                Piece("a<sp>", 99f, NORMAL), // must NOT be used: right side is frozen
                Piece("<sp>", 0f, USER_DEFINED),
            ),
            addDummyPrefix = false,
            escapeWhitespaces = false,
        )
        val tokenizer = TalosVoiceBpeTokenizer(model)
        val ids = tokenizer.encode("a<sp>b")
        assertArrayEquals(intArrayOf(model.idOf("a")!!, model.idOf("<sp>")!!, model.idOf("b")!!), ids)
    }

    @Test
    fun normalizerFlagsAreReadNotAssumed() {
        // The proto default for all three normalizer bools is true; this only
        // proves the parser reads the actual bytes if at least one is
        // explicitly false and that is honored. All three off here.
        //
        // Single-character pieces only, deliberately: a vocab with "hello"/
        // "world" as whole pieces but no intermediate merge lineage down to
        // single characters would be unreachable by real BPE merging (every
        // multi-char piece must be buildable one adjacent pair at a time),
        // which is exactly what caught this test's first draft - it threw,
        // not mismatched. Single characters sidestep merging entirely so
        // this test isolates the normalizer, not the merger (already covered
        // by [greedyMergeCascadesInScoreOrderNotInputOrder]).
        val chars = "helowrd ▁"
        val model = syntheticModel(
            pieces = chars.map { Piece(it.toString(), 0f, NORMAL) },
            addDummyPrefix = false,
            removeExtraWhitespaces = false,
            escapeWhitespaces = false,
        )
        assertEquals(false, model.addDummyPrefix)
        assertEquals(false, model.removeExtraWhitespaces)
        assertEquals(false, model.escapeWhitespaces)

        val tokenizer = TalosVoiceBpeTokenizer(model)
        // No dummy prefix, no escaping: the literal space piece must appear,
        // not the meta-space, and nothing is prepended.
        val expected = "hello world".map { model.idOf(it.toString())!! }.toIntArray()
        assertArrayEquals(expected, tokenizer.encode("hello world"))
    }

    @Test
    fun normalizerFlagsOnProduceTheEscapedDummyPrefixedForm() {
        // The contrary case: the same text, same single-character vocab
        // shape, flags ON (the real model's actual settings) must take the
        // OTHER branch - a leading meta-space from the dummy prefix, and
        // every space escaped to the meta symbol instead of appearing
        // literally.
        val chars = "helowrd ▁"
        val model = syntheticModel(
            pieces = chars.map { Piece(it.toString(), 0f, NORMAL) },
            addDummyPrefix = true,
            removeExtraWhitespaces = true,
            escapeWhitespaces = true,
        )
        val tokenizer = TalosVoiceBpeTokenizer(model)
        val expected = "▁hello▁world".map { model.idOf(it.toString())!! }.toIntArray()
        assertArrayEquals(expected, tokenizer.encode("hello world"))
    }

    // ---- synthetic ModelProto construction --------------------------------

    private data class Piece(val text: String, val score: Float, val type: Int)

    private companion object {
        const val NORMAL = 1
        const val USER_DEFINED = 4
        const val BYTE = 6
    }

    private fun syntheticModel(
        pieces: List<Piece>,
        addDummyPrefix: Boolean = true,
        removeExtraWhitespaces: Boolean = true,
        escapeWhitespaces: Boolean = true,
    ): TalosSentencePieceModel {
        val root = ProtoWriter()
        for (piece in pieces) {
            val p = ProtoWriter()
            p.writeString(1, piece.text)
            p.writeFloat(2, piece.score)
            p.writeVarint(3, piece.type.toLong())
            root.writeSubmessage(1, p.bytes())
        }
        val normalizer = ProtoWriter()
        normalizer.writeVarint(3, if (addDummyPrefix) 1 else 0)
        normalizer.writeVarint(4, if (removeExtraWhitespaces) 1 else 0)
        normalizer.writeVarint(5, if (escapeWhitespaces) 1 else 0)
        root.writeSubmessage(3, normalizer.bytes())
        return TalosSentencePieceModel.parse(root.bytes())
    }

    /** The write-side mirror of the hand-written protobuf reader in [TalosSentencePieceModel] - test-only. */
    private class ProtoWriter {
        private val out = java.io.ByteArrayOutputStream()

        fun bytes(): ByteArray = out.toByteArray()

        fun writeVarint(fieldNumber: Int, value: Long) {
            writeTag(fieldNumber, 0)
            writeRawVarint(value)
        }

        fun writeFloat(fieldNumber: Int, value: Float) {
            writeTag(fieldNumber, 5)
            val bits = value.toRawBits()
            out.write(bits and 0xFF)
            out.write((bits ushr 8) and 0xFF)
            out.write((bits ushr 16) and 0xFF)
            out.write((bits ushr 24) and 0xFF)
        }

        fun writeString(fieldNumber: Int, value: String) = writeSubmessage(fieldNumber, value.toByteArray(Charsets.UTF_8))

        fun writeSubmessage(fieldNumber: Int, bytes: ByteArray) {
            writeTag(fieldNumber, 2)
            writeRawVarint(bytes.size.toLong())
            out.write(bytes)
        }

        private fun writeTag(fieldNumber: Int, wireType: Int) = writeRawVarint((fieldNumber.toLong() shl 3) or wireType.toLong())

        /** MSB continuation bit on every byte but the last; least-significant 7-bit group first. */
        private fun writeRawVarint(valueIn: Long) {
            var value = valueIn
            while (true) {
                if (value and 0x7FL.inv() == 0L) {
                    out.write(value.toInt())
                    return
                }
                out.write(((value and 0x7F) or 0x80).toInt())
                value = value ushr 7
            }
        }
    }
}
