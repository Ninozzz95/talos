package ai.talos.voice.pocket

import java.io.Closeable
import java.io.File


internal interface TalosPocketTokenizerNativeBridge {
    fun create(modelPath: String): Long
    fun encode(handle: Long, source: String): IntArray
    fun decode(handle: Long, ids: IntArray): String
    fun vocabSize(handle: Long): Int
    fun close(handle: Long)
}

private object TalosPocketTokenizerJni : TalosPocketTokenizerNativeBridge {
    init {
        System.loadLibrary("talos_pocket_sentencepiece")
    }

    external override fun create(modelPath: String): Long
    external override fun encode(handle: Long, source: String): IntArray
    external override fun decode(handle: Long, ids: IntArray): String
    external override fun vocabSize(handle: Long): Int
    external override fun close(handle: Long)
}

class TalosPocketTokenizer private constructor(
    modelFile: File,
    private val bridge: TalosPocketTokenizerNativeBridge,
) : TalosPocketTokenizerContract, Closeable {
    private val lock = Any()
    private var handle: Long = bridge.create(modelFile.absolutePath).also {
        require(it != 0L) { "SentencePiece returned an invalid handle" }
    }

    override val vocabSize: Int
        get() = synchronized(lock) { bridge.vocabSize(requireOpen()) }

    init {
        val actual = vocabSize
        if (actual != EXPECTED_VOCAB_SIZE) {
            close()
            throw IllegalArgumentException(
                "Italian Pocket tokenizer vocab must be $EXPECTED_VOCAB_SIZE, found $actual",
            )
        }
    }

    override fun encode(source: String): IntArray = synchronized(lock) {
        require(source.isNotEmpty()) { "SentencePiece source must not be empty" }
        bridge.encode(requireOpen(), source)
    }

    override fun decode(ids: IntArray): String = synchronized(lock) {
        require(ids.isNotEmpty()) { "SentencePiece ids must not be empty" }
        bridge.decode(requireOpen(), ids)
    }

    override fun close() = synchronized(lock) {
        val current = handle
        if (current != 0L) {
            handle = 0L
            bridge.close(current)
        }
    }

    private fun requireOpen(): Long = handle.also { check(it != 0L) { "SentencePiece tokenizer is closed" } }

    companion object {
        const val EXPECTED_VOCAB_SIZE = 4_000

        fun open(modelFile: File): TalosPocketTokenizer {
            require(modelFile.isFile) { "SentencePiece model is missing: ${modelFile.absolutePath}" }
            return TalosPocketTokenizer(modelFile.canonicalFile, TalosPocketTokenizerJni)
        }

        internal fun openForTest(
            modelFile: File,
            bridge: TalosPocketTokenizerNativeBridge,
        ): TalosPocketTokenizer = TalosPocketTokenizer(modelFile, bridge)
    }
}
