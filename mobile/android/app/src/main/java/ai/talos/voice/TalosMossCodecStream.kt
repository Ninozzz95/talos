package ai.talos.voice

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OnnxTensorLike
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.Closeable
import java.nio.FloatBuffer
import java.nio.IntBuffer

/**
 * Ports OpenMOSS's own `CodecStreamingDecodeSession`
 * (`ort_cpu_runtime.py`, upstream `main`, fetched and read directly - not
 * guessed from the ONNX graph names, which is exactly the kind of
 * approximation blueprint §9.1 warns against for the tokenizer and applies
 * here too) into Kotlin, verbatim in behavior:
 *
 *  - `decode_step` is a KV-cache transformer, same shape of idea as
 *    `TalosMossRuntime`'s TTS decode loop, but for the codec: it takes a
 *    small batch of audio-token frames plus the running attention state for
 *    every layer, and returns PCM plus the *next* state.
 *  - The reference's own maintainer pointed `app_onnx.py` at this class when
 *    asked how real ONNX streaming works (issue #53 - the runtime's default
 *    "streaming" mode is NOT truly incremental; this class is what actually
 *    is).
 *  - `cached_positions` resets to **-1**, not 0 - a detail no shape-only
 *    reading of the metadata would reveal, and getting it wrong would mean
 *    "position 0 already has a real cached entry" from frame one.
 *  - State is round-tripped by NAME every call, out of the `_out_`-suffixed
 *    outputs into the next call's inputs - not assumed to stay attached to
 *    the same tensor object session to session.
 *
 * §15.3 discipline: every state tensor is copied through `getFloatBuffer()`/
 * `getIntBuffer()` (confirmed present on this exact `onnxruntime-android
 * 1.29.0` jar via `javap`, not assumed from the API surface), never through
 * `.value`'s nested-array materialization - state includes 12 attention
 * caches at up to `[1,4,1600,64]` floats each on the pinned revision, and
 * that path is walked on every decode step, not once.
 */
internal class TalosMossCodecStream(
    private val env: OrtEnvironment,
    private val session: OrtSession,
    private val codecMeta: TalosMossCodecMeta,
) : Closeable {
    private var stateFeeds: MutableMap<String, OnnxTensor> = mutableMapOf()

    init {
        reset()
    }

    /** Back to a fresh utterance: no cached attention state, no valid positions yet. */
    fun reset() {
        closeState()
        val feeds = mutableMapOf<String, OnnxTensor>()
        for (spec in codecMeta.streamingTransformerOffsets) {
            feeds[spec.inputName] = zerosInt(spec.shape)
        }
        for (spec in codecMeta.streamingAttentionCaches) {
            feeds[spec.offsetInputName] = zerosInt(spec.offsetShape)
            feeds[spec.cachedKeysInputName] = zerosFloat(spec.cacheShape)
            feeds[spec.cachedValuesInputName] = zerosFloat(spec.cacheShape)
            feeds[spec.cachedPositionsInputName] = filledInt(spec.positionsShape, -1)
        }
        stateFeeds = feeds
    }

    /**
     * Decodes one batch of audio-token frames. Returns interleaved PCM
     * (`samples * channels` floats, channel-minor - `[l0,r0,l1,r1,...]` for
     * stereo, matching upstream's `np.stack(channels, axis=1)`) and how many
     * samples are valid, or null if there was nothing to decode or the codec
     * reported zero valid samples for this batch (its internal downsampling
     * window can do that on a short first batch).
     */
    fun runFrames(frameRows: List<IntArray>): TalosMossCodecFrames? {
        if (frameRows.isEmpty()) return null
        val numQuantizers = codecMeta.numQuantizers
        val frameCount = frameRows.size
        val audioCodesFlat = IntArray(frameCount * numQuantizers)
        var offset = 0
        for (row in frameRows) {
            for (q in 0 until numQuantizers) {
                audioCodesFlat[offset++] = if (q < row.size) row[q] else 0
            }
        }

        OnnxTensor.createTensor(env, IntBuffer.wrap(audioCodesFlat), longArrayOf(1, frameCount.toLong(), numQuantizers.toLong()))
            .use { codesTensor ->
                OnnxTensor.createTensor(env, IntBuffer.wrap(intArrayOf(frameCount)), longArrayOf(1)).use { lengthsTensor ->
                    val feeds = linkedMapOf<String, OnnxTensorLike>(
                        "audio_codes" to codesTensor,
                        "audio_code_lengths" to lengthsTensor,
                    )
                    feeds.putAll(stateFeeds)
                    session.run(feeds).use { outputs ->
                        val nextState = mutableMapOf<String, OnnxTensor>()
                        for (spec in codecMeta.streamingTransformerOffsets) {
                            nextState[spec.inputName] = copyInt(outputs.requiredTensor(spec.outputName))
                        }
                        for (spec in codecMeta.streamingAttentionCaches) {
                            nextState[spec.offsetInputName] = copyInt(outputs.requiredTensor(spec.offsetOutputName))
                            nextState[spec.cachedKeysInputName] = copyFloat(outputs.requiredTensor(spec.cachedKeysOutputName))
                            nextState[spec.cachedValuesInputName] = copyFloat(outputs.requiredTensor(spec.cachedValuesOutputName))
                            nextState[spec.cachedPositionsInputName] = copyInt(outputs.requiredTensor(spec.cachedPositionsOutputName))
                        }
                        val audioLength = outputs.requiredTensor("audio_lengths").scalarInt()
                        val result = if (audioLength > 0) {
                            interleaveChannels(outputs.requiredTensor("audio"), audioLength, codecMeta.channels)
                        } else {
                            null
                        }
                        closeState()
                        stateFeeds = nextState
                        return if (result == null) null else TalosMossCodecFrames(result, audioLength)
                    }
                }
            }
    }

    override fun close() = closeState()

    private fun closeState() {
        for (tensor in stateFeeds.values) tensor.close()
        stateFeeds = mutableMapOf()
    }

    /** `audio` is `(1, channels, samples)` - upstream slices `audio[0, channel, :audioLength]` per channel, then stacks channel-minor. */
    private fun interleaveChannels(audioTensor: OnnxTensor, audioLength: Int, channels: Int): FloatArray {
        val shape = audioTensor.info.shape
        require(shape.size == 3) { "expected rank-3 audio tensor (batch, channels, samples), got rank ${shape.size}" }
        val tensorChannels = shape[1].toInt()
        val tensorSamples = shape[2].toInt()
        val flat = FloatArray(tensorChannels * tensorSamples)
        audioTensor.floatBuffer.let { buf ->
            val duplicated = buf.duplicate()
            duplicated.rewind()
            duplicated.get(flat)
        }
        val usedChannels = minOf(channels, tensorChannels)
        val usedSamples = minOf(audioLength, tensorSamples)
        val interleaved = FloatArray(usedSamples * usedChannels)
        for (sample in 0 until usedSamples) {
            for (channel in 0 until usedChannels) {
                interleaved[sample * usedChannels + channel] = flat[channel * tensorSamples + sample]
            }
        }
        return interleaved
    }

    private fun zerosInt(shape: IntArray): OnnxTensor =
        OnnxTensor.createTensor(env, IntBuffer.wrap(IntArray(shape.fold(1) { a, b -> a * b })), shape.map { it.toLong() }.toLongArray())

    private fun zerosFloat(shape: IntArray): OnnxTensor =
        OnnxTensor.createTensor(env, FloatBuffer.wrap(FloatArray(shape.fold(1) { a, b -> a * b })), shape.map { it.toLong() }.toLongArray())

    private fun filledInt(shape: IntArray, value: Int): OnnxTensor {
        val data = IntArray(shape.fold(1) { a, b -> a * b }) { value }
        return OnnxTensor.createTensor(env, IntBuffer.wrap(data), shape.map { it.toLong() }.toLongArray())
    }

    private fun copyFloat(source: OnnxTensor): OnnxTensor {
        val src = source.floatBuffer.duplicate().also { it.rewind() }
        val copy = FloatBuffer.allocate(src.remaining())
        copy.put(src)
        copy.rewind()
        return OnnxTensor.createTensor(env, copy, source.info.shape)
    }

    private fun copyInt(source: OnnxTensor): OnnxTensor {
        val src = source.intBuffer.duplicate().also { it.rewind() }
        val copy = IntBuffer.allocate(src.remaining())
        copy.put(src)
        copy.rewind()
        return OnnxTensor.createTensor(env, copy, source.info.shape)
    }

    companion object {
        private fun OrtSession.Result.requiredTensor(name: String): OnnxTensor =
            (get(name).orElseThrow { IllegalStateException("Missing ONNX output: $name") }) as OnnxTensor

        private fun OnnxTensor.scalarInt(): Int = intBuffer.duplicate().let { it.rewind(); it.get(0) }
    }
}

internal data class TalosMossCodecFrames(val interleavedPcm: FloatArray, val samples: Int)
