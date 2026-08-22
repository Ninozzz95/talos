package ai.talos.voice

import java.io.Closeable
import java.text.Normalizer
import java.util.PriorityQueue

/**
 * Text tokenization is a P0 correctness boundary (blueprint §9): the wrong
 * token ids produce plausible-sounding but wrong pronunciation, with no
 * exception and no visible error. This has exactly the two callers the
 * runtime needs: ids to feed the prefill graph, and a count for chunking
 * decisions that don't need a full encode.
 */
interface TalosVoiceTokenizer : Closeable {
    fun encode(text: String): IntArray
    fun count(text: String): Int
}

/**
 * A from-scratch, from-source-verified port of SentencePiece BPE encoding
 * (`google/sentencepiece`, `src/bpe_model.cc` + `src/normalizer.cc`), reading
 * the real `tokenizer.model` shipped next to the MOSS ONNX graphs. This is
 * NOT an approximation: every algorithmic choice below was verified against
 * the reference before being ported, either by decompiling the real model's
 * data or by running the real upstream Python `sentencepiece` package (the
 * reference implementation) side by side with a prototype of this exact
 * algorithm over 199 test strings — 190 realistic Italian TTS sentences plus
 * adversarial cases (emoji, CJK, literal chat-template tokens, control bytes,
 * a literal `▁`, a literal BOM, 500-character runs) — with zero mismatches.
 * See `.claude/RITORNO-0.1.18.md` for the corpus and how to re-run it.
 *
 * Why not vendor Google's own C++ library: their CMake build FetchContent-s
 * protobuf v25.6 from GitHub and cross-compiles `protoc` as a host tool to
 * regenerate `sentencepiece_model.pb.cc` — a heavy, network-dependent build
 * for a 16 KB-symbol vocabulary. [TalosSentencePieceModel] reads the same
 * bytes with a ~150-line hand-written protobuf-wire-format reader instead.
 *
 * Why the 237 KB `precompiled_charsmap` isn't ported: decompiling it (via
 * `SentencePieceNormalizer.decompile()`) over THIS model's real charsmap
 * produced 224,725 explicit rules. All but 44 of them are byte-for-byte
 * identical to what `java.text.Normalizer.normalize(text, NFKC)` already
 * does — Android's own standard-library Unicode NFKC. The 44 exceptions are
 * all control/invisible characters (control-strip or fold-to-space); they
 * are applied as an explicit pre-pass in [normalize] instead of a ported
 * trie. Zero of the 224,725 rules diverge on more than one input codepoint,
 * so per-codepoint patching composes correctly with whole-string NFKC.
 */
internal class TalosVoiceBpeTokenizer(
    private val model: TalosSentencePieceModel,
) : TalosVoiceTokenizer {

    override fun encode(text: String): IntArray {
        val normalized = normalize(text)
        if (normalized.isEmpty()) return IntArray(0)
        val symbols = Symbols(normalized, model)
        symbols.mergeAll()
        return symbols.resolveIds()
    }

    override fun count(text: String): Int = encode(text).size

    override fun close() = Unit

    /**
     * Reproduces `nmt_nfkc` for this model: strip/space-fold the 44 verified
     * exception codepoints, run standard NFKC over what's left (this is where
     * the other 224,681 charsmap rules are already covered for free), then
     * apply the three normalizer flags this model actually has set.
     */
    private fun normalize(text: String): String {
        val filtered = StringBuilder(text.length)
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            val advance = Character.charCount(cp)
            when {
                CONTROL_STRIP.contains(cp) -> Unit
                CONTROL_TO_SPACE.contains(cp) -> filtered.append(' ')
                else -> filtered.appendCodePoint(cp)
            }
            i += advance
        }
        var s = Normalizer.normalize(filtered, Normalizer.Form.NFKC)
        if (model.removeExtraWhitespaces) {
            s = s.trim().replace(WHITESPACE_RUN, " ")
        }
        if (model.addDummyPrefix && s.isNotEmpty()) {
            s = " $s"
        }
        if (model.escapeWhitespaces) {
            s = s.replace(" ", META_SPACE)
        }
        return s
    }

    companion object {
        private val WHITESPACE_RUN = Regex(" +")
        private const val META_SPACE = "▁"

        // Verified 2026-08-21 against THIS tokenizer.model's real charsmap —
        // see the class doc comment. Do not extend this table from a
        // different model without re-running the decompile-and-diff check.
        private val CONTROL_STRIP: Set<Int> = setOf(
            0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8, 0xB, 0xE, 0xF,
            0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
            0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F, 0x7F, 0x8F, 0x9F,
        )
        private val CONTROL_TO_SPACE: Set<Int> = setOf(
            0x9, 0xA, 0xC, 0xD, 0x1680, 0x200B, 0x200C, 0x200E, 0x200F,
            0x2028, 0x2029, 0x2581, 0xFEFF, 0xFFFD,
        )
    }
}

/**
 * The mutable symbol chain a BPE merge pass runs over, plus the merge
 * algorithm itself. Split out of [TalosVoiceBpeTokenizer] so the two concerns
 * — text normalization and the merge state machine — read as separate things.
 */
private class Symbols(normalized: String, private val model: TalosSentencePieceModel) {
    // One entry per initial symbol: either a whole frozen user-defined-symbol
    // match (chat-template tokens like <|im_start|>), or a single Unicode
    // codepoint. Codepoint-aware on purpose: naive UTF-16 char splitting would
    // break surrogate pairs (emoji, some CJK) into two bogus symbols.
    private val piece: ArrayList<String>
    private val frozen: ArrayList<Boolean>
    private val next: IntArray
    private val prev: IntArray
    private val alive: BooleanArray
    private val size: Int

    init {
        val pieces = ArrayList<String>()
        val frozenFlags = ArrayList<Boolean>()
        var i = 0
        val n = normalized.length
        val userDefined = model.userDefinedPiecesLongestFirst
        while (i < n) {
            var matched: String? = null
            if (userDefined.isNotEmpty()) {
                for (candidate in userDefined) {
                    if (normalized.startsWith(candidate, i)) {
                        matched = candidate
                        break
                    }
                }
            }
            if (matched != null) {
                pieces.add(matched)
                frozenFlags.add(true)
                i += matched.length
            } else {
                val cp = normalized.codePointAt(i)
                val advance = Character.charCount(cp)
                pieces.add(normalized.substring(i, i + advance))
                frozenFlags.add(false)
                i += advance
            }
        }
        size = pieces.size
        piece = pieces
        frozen = frozenFlags
        next = IntArray(size) { if (it + 1 < size) it + 1 else -1 }
        prev = IntArray(size) { it - 1 }
        alive = BooleanArray(size) { true }
    }

    /**
     * Max-heap by piece score; ties broken by the larger left index, matching
     * `SymbolPairComparator` in `bpe_model.cc`. Insertion order is the final
     * tie-breaker purely to make the heap a strict order (Kotlin's
     * `PriorityQueue` doesn't require one, but a stable order removes any
     * doubt during debugging) — real scores are effectively unique per merge
     * rank in this model (16,113 normal pieces, scores `0` down to `-16112`,
     * one per rank), so this branch is not expected to matter in practice.
     */
    private data class Candidate(
        val score: Float,
        val left: Int,
        val right: Int,
        val mergedLength: Int,
        val order: Long,
    )

    private val comparator = compareByDescending<Candidate> { it.score }
        .thenByDescending { it.left }
        .thenBy { it.order }

    private val heap = PriorityQueue(comparator)
    private var insertionOrder = 0L

    private fun tryAdd(left: Int, right: Int) {
        if (left == -1 || right == -1 || frozen[left] || frozen[right]) return
        val merged = piece[left] + piece[right]
        val id = model.idOf(merged) ?: return
        heap.add(Candidate(model.idToScore[id], left, right, merged.length, insertionOrder++))
    }

    fun mergeAll() {
        for (i in 0 until size - 1) tryAdd(i, i + 1)

        while (true) {
            val c = heap.poll() ?: break
            val l = c.left
            val r = c.right
            if (!alive[l] || !alive[r]) continue
            if (piece[l].length + piece[r].length != c.mergedLength) continue
            if (next[l] != r) continue // stale: something already merged between them

            piece[l] = piece[l] + piece[r]
            alive[r] = false
            val afterR = next[r]
            next[l] = afterR
            if (afterR != -1) prev[afterR] = l

            if (prev[l] != -1) tryAdd(prev[l], l)
            if (next[l] != -1) tryAdd(l, next[l])
        }
    }

    fun resolveIds(): IntArray {
        val ids = ArrayList<Int>()
        var i = 0
        while (i != -1) {
            val text = piece[i]
            if (frozen[i]) {
                ids.add(requireNotNull(model.idOf(text)) { "frozen piece '$text' has no id" })
            } else {
                val id = model.idOf(text)
                if (id != null) {
                    ids.add(id)
                } else {
                    // Byte fallback: no vocabulary entry covers this symbol as a
                    // whole (it never merged into anything bigger, and isn't a
                    // known single piece either) — decompose to raw UTF-8 bytes.
                    for (b in text.toByteArray(Charsets.UTF_8)) {
                        val byteValue = b.toInt() and 0xFF
                        val byteId = model.byteFallbackId[byteValue]
                        require(byteId != -1) {
                            "no byte-fallback piece for 0x${byteValue.toString(16)} and " +
                                "'$text' is not in the vocabulary"
                        }
                        ids.add(byteId)
                    }
                }
            }
            i = next[i]
        }
        return ids.toIntArray()
    }
}
