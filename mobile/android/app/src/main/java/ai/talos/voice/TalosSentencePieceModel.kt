package ai.talos.voice

/**
 * Reads exactly the fields TALOS needs out of a SentencePiece `tokenizer.model`
 * file — nothing else.
 *
 * `tokenizer.model` is a serialized `ModelProto` (see
 * `google/sentencepiece/src/sentencepiece_model.proto`, field numbers verified
 * against that source on 2026-08-21). Linking Google's own C++ library would
 * pull in a full protobuf build (their CMake FetchContent-s protobuf v25.6 from
 * GitHub, then cross-compiles `protoc` as a host tool) for a payload this small
 * — 16,384 pieces, three booleans. Wire-format protobuf is a tag + varint/
 * length-delimited/fixed32 stream; the schema is small, frozen upstream for
 * years, and only three top-level fields matter here, so this reads it by
 * hand instead of vendoring a build system for it.
 *
 * Fields NOT read: `trainer_spec` (field 2) — we do not need `byte_fallback`
 * as a flag, because whether byte-fallback is usable is decided by whether
 * `<0xXX>` pieces actually exist in the vocabulary, which this class already
 * has to scan; and `normalizer_spec.precompiled_charsmap` (field 2 of that
 * submessage) — see [TalosVoiceBpeTokenizer] for why the 237 KB compiled
 * charmap is replaced by `java.text.Normalizer` plus a 44-codepoint patch
 * table, not ported.
 */
internal class TalosSentencePieceModel private constructor(
    val pieceToId: Map<String, Int>,
    val idToScore: FloatArray,
    /** `byteFallbackId[b]` is the piece id for raw byte `b` (0..255), or -1 if the model has no byte-fallback pieces. */
    val byteFallbackId: IntArray,
    /** Literal control/chat-template strings (e.g. `<|im_start|>`) matched whole before falling back to codepoint splitting. Longest first, for max-munch matching. */
    val userDefinedPiecesLongestFirst: List<String>,
    val addDummyPrefix: Boolean,
    val removeExtraWhitespaces: Boolean,
    val escapeWhitespaces: Boolean,
) {
    fun idOf(piece: String): Int? = pieceToId[piece]

    companion object {
        // ModelProto field numbers (top level).
        private const val FIELD_PIECES = 1
        private const val FIELD_NORMALIZER_SPEC = 3

        // ModelProto.SentencePiece field numbers.
        private const val FIELD_PIECE_TEXT = 1
        private const val FIELD_PIECE_SCORE = 2
        private const val FIELD_PIECE_TYPE = 3
        private const val PIECE_TYPE_USER_DEFINED = 4
        private const val PIECE_TYPE_BYTE = 6

        // NormalizerSpec field numbers.
        private const val FIELD_NORM_ADD_DUMMY_PREFIX = 3
        private const val FIELD_NORM_REMOVE_EXTRA_WHITESPACES = 4
        private const val FIELD_NORM_ESCAPE_WHITESPACES = 5

        fun parse(bytes: ByteArray): TalosSentencePieceModel {
            val pieceToId = LinkedHashMap<String, Int>()
            val scores = ArrayList<Float>()
            val userDefined = ArrayList<String>()
            val byteId = IntArray(256) { -1 }

            // Defaults match sentencepiece_model.proto: all three default to true
            // when normalizer_spec is absent or a flag isn't explicitly set.
            var addDummyPrefix = true
            var removeExtraWhitespaces = true
            var escapeWhitespaces = true

            val root = ProtoReader(bytes)
            while (root.hasNext()) {
                val (fieldNumber, wireType) = root.readTag()
                when (fieldNumber) {
                    FIELD_PIECES -> {
                        val piece = ProtoReader(root.readLengthDelimited())
                        var text: String? = null
                        var score = 0f
                        var type = 1 // NORMAL, the proto default
                        while (piece.hasNext()) {
                            val (pf, pw) = piece.readTag()
                            when (pf) {
                                FIELD_PIECE_TEXT -> text = String(piece.readLengthDelimited(), Charsets.UTF_8)
                                FIELD_PIECE_SCORE -> score = Float.fromBits(piece.readFixed32())
                                FIELD_PIECE_TYPE -> type = piece.readVarint().toInt()
                                else -> piece.skip(pw)
                            }
                        }
                        val id = scores.size
                        if (text != null) {
                            pieceToId[text] = id
                            scores.add(score)
                            if (type == PIECE_TYPE_USER_DEFINED) {
                                userDefined.add(text)
                            } else if (type == PIECE_TYPE_BYTE) {
                                // Piece text is "<0xAB>" — the two hex digits are the byte value.
                                val hex = text.removePrefix("<0x").removeSuffix(">")
                                val value = hex.toIntOrNull(16)
                                if (value != null && value in 0..255) {
                                    byteId[value] = id
                                }
                            }
                        } else {
                            // A piece with no text is not something this model should ever
                            // produce, but score IDs must stay aligned with pieceToId's ids
                            // (id == index) even if we skip it — so still reserve the slot.
                            scores.add(score)
                        }
                    }
                    FIELD_NORMALIZER_SPEC -> {
                        val spec = ProtoReader(root.readLengthDelimited())
                        while (spec.hasNext()) {
                            val (sf, sw) = spec.readTag()
                            when (sf) {
                                FIELD_NORM_ADD_DUMMY_PREFIX -> addDummyPrefix = spec.readVarint() != 0L
                                FIELD_NORM_REMOVE_EXTRA_WHITESPACES -> removeExtraWhitespaces = spec.readVarint() != 0L
                                FIELD_NORM_ESCAPE_WHITESPACES -> escapeWhitespaces = spec.readVarint() != 0L
                                else -> spec.skip(sw)
                            }
                        }
                    }
                    else -> root.skip(wireType)
                }
            }

            require(pieceToId.isNotEmpty()) { "tokenizer.model parsed to an empty vocabulary" }

            userDefined.sortByDescending { it.length }
            return TalosSentencePieceModel(
                pieceToId = pieceToId,
                idToScore = scores.toFloatArray(),
                byteFallbackId = byteId,
                userDefinedPiecesLongestFirst = userDefined,
                addDummyPrefix = addDummyPrefix,
                removeExtraWhitespaces = removeExtraWhitespaces,
                escapeWhitespaces = escapeWhitespaces,
            )
        }
    }
}

/**
 * A forward-only reader over one protobuf message's bytes: varints,
 * length-delimited blocks (strings/bytes/submessages), and fixed32 (used
 * here only for `float`). No fixed64/group support — sentencepiece_model.proto
 * uses none, and [skip] would need to grow if that ever changed.
 */
private class ProtoReader(private val data: ByteArray) {
    private var pos = 0

    fun hasNext(): Boolean = pos < data.size

    /** Returns (fieldNumber, wireType) decoded from the next tag varint. */
    fun readTag(): Pair<Int, Int> {
        val tag = readVarint()
        return Pair((tag ushr 3).toInt(), (tag and 0x7).toInt())
    }

    fun readVarint(): Long {
        var result = 0L
        var shift = 0
        while (true) {
            require(pos < data.size) { "truncated varint" }
            val b = data[pos].toInt() and 0xFF
            pos++
            result = result or ((b.toLong() and 0x7F) shl shift)
            if (b and 0x80 == 0) return result
            shift += 7
            require(shift < 64) { "varint too long" }
        }
    }

    fun readFixed32(): Int {
        require(pos + 4 <= data.size) { "truncated fixed32" }
        val v = (data[pos].toInt() and 0xFF) or
            ((data[pos + 1].toInt() and 0xFF) shl 8) or
            ((data[pos + 2].toInt() and 0xFF) shl 16) or
            ((data[pos + 3].toInt() and 0xFF) shl 24)
        pos += 4
        return v
    }

    fun readLengthDelimited(): ByteArray {
        val len = readVarint().toInt()
        require(len >= 0 && pos + len <= data.size) { "truncated length-delimited field (len=$len)" }
        val out = data.copyOfRange(pos, pos + len)
        pos += len
        return out
    }

    /** Advances past a field's value without interpreting it, per its wire type. */
    fun skip(wireType: Int) {
        when (wireType) {
            0 -> readVarint()
            1 -> {
                require(pos + 8 <= data.size) { "truncated fixed64" }
                pos += 8
            }
            2 -> readLengthDelimited()
            5 -> readFixed32()
            else -> error("unsupported protobuf wire type $wireType")
        }
    }
}
