package ai.talos.voice

import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/**
 * The MOSS-TTS-Nano artifact manifests, shared by every session
 * [TalosMossRuntime] opens. Ported out of the Phase 0 research engine
 * (`ai.talos.voice.research.TalosMossDemoEngine`, commit `1efd233e`), where
 * these were private nested classes proven against ORT 1.29 on-device; this
 * file is that same parsing made shared and unit-testable
 * ([TalosMossManifestTest]), not a redesign.
 *
 * Three JSON files, all manually pushed to the same ad-hoc
 * `externalFilesDir/moss/…` layout Phase 0 already reads from — no
 * downloader here (blueprint Phase 5, out of scope for the 0.1.18):
 *  - `browser_poc_manifest.json` — [TalosMossManifest] itself: prompt
 *    template token ids, TTS config, built-in reference voice codes.
 *  - `tts_browser_onnx_meta.json` — [TalosMossTtsMeta]: which `.onnx` file is
 *    which graph, and the decode step's KV cache input/output names.
 *  - `codec_browser_onnx_meta.json` — [TalosMossCodecMeta]: which `.onnx`
 *    file decodes audio codes, and the codec's sample rate.
 */
internal data class TalosMossManifest(
    val modelFiles: ModelFiles,
    val ttsConfig: TtsConfig,
    val promptTemplates: PromptTemplates,
    val generationDefaults: GenerationDefaults,
    val builtinVoices: List<BuiltinVoice>,
) {
    data class ModelFiles(val ttsMeta: String, val codecMeta: String)

    data class TtsConfig(
        val nVq: Int,
        val audioPadTokenId: Int,
        val audioStartTokenId: Int,
        val audioEndTokenId: Int,
        val audioUserSlotTokenId: Int,
        val audioAssistantSlotTokenId: Int,
        val audioCodebookSizes: IntArray,
    )

    data class PromptTemplates(
        val userPromptPrefixTokenIds: IntArray,
        val userPromptAfterReferenceTokenIds: IntArray,
        val assistantPromptPrefixTokenIds: IntArray,
    )

    data class GenerationDefaults(val maxNewFrames: Int = 375)

    data class BuiltinVoice(val voice: String, val promptAudioCodes: List<IntArray>)

    companion object {
        fun fromJson(json: JSONObject): TalosMossManifest {
            return TalosMossManifest(
                modelFiles = ModelFiles(
                    ttsMeta = json.getJSONObject("model_files").getString("tts_meta"),
                    codecMeta = json.getJSONObject("model_files").getString("codec_meta"),
                ),
                ttsConfig = json.getJSONObject("tts_config").let { cfg ->
                    TtsConfig(
                        nVq = cfg.getInt("n_vq"),
                        audioPadTokenId = cfg.getInt("audio_pad_token_id"),
                        audioStartTokenId = cfg.getInt("audio_start_token_id"),
                        audioEndTokenId = cfg.getInt("audio_end_token_id"),
                        audioUserSlotTokenId = cfg.optInt("audio_user_slot_token_id", 8),
                        audioAssistantSlotTokenId = cfg.getInt("audio_assistant_slot_token_id"),
                        audioCodebookSizes = cfg.getJSONArray("audio_codebook_sizes").toIntArrayCompat(),
                    )
                },
                promptTemplates = json.getJSONObject("prompt_templates").let { pt ->
                    PromptTemplates(
                        userPromptPrefixTokenIds = pt.getJSONArray("user_prompt_prefix_token_ids").toIntArrayCompat(),
                        userPromptAfterReferenceTokenIds =
                            pt.getJSONArray("user_prompt_after_reference_token_ids").toIntArrayCompat(),
                        assistantPromptPrefixTokenIds =
                            pt.getJSONArray("assistant_prompt_prefix_token_ids").toIntArrayCompat(),
                    )
                },
                generationDefaults = GenerationDefaults(
                    maxNewFrames = json.optJSONObject("generation_defaults")?.optInt("max_new_frames", 375) ?: 375,
                ),
                builtinVoices = json.optJSONArray("builtin_voices")?.let { voices ->
                    List(voices.length()) { index ->
                        val voice = voices.getJSONObject(index)
                        BuiltinVoice(
                            voice = voice.optString("voice", ""),
                            promptAudioCodes = voice.optJSONArray("prompt_audio_codes")?.let { outer ->
                                List(outer.length()) { rowIndex ->
                                    outer.getJSONArray(rowIndex).toIntArrayCompat()
                                }
                            } ?: emptyList(),
                        )
                    }
                } ?: emptyList(),
            )
        }

        /**
         * `browser_poc_manifest.json` lives directly under the model root, or
         * under one of the two directory names the same HuggingFace repo has
         * been published under (Phase 0 hit both while pinning revisions).
         */
        fun resolveManifestPath(modelRoot: File): File {
            val candidates = listOf(
                File(modelRoot, "browser_poc_manifest.json"),
                File(modelRoot, "MOSS-TTS-Nano-100M-ONNX/browser_poc_manifest.json"),
                File(modelRoot, "MOSS-TTS-Nano-ONNX-CPU/browser_poc_manifest.json"),
            )
            return candidates.firstOrNull { it.isFile }
                ?: error("browser_poc_manifest.json not found. Tried: ${candidates.joinToString { it.absolutePath }}")
        }

        /** Same alias fallback Phase 0 needed: the two repo names differ by an ONNX-CPU/100M suffix. */
        fun resolveManifestRelativePath(manifestDir: File, relativePath: String): File {
            val direct = File(manifestDir, relativePath).canonicalFile
            if (direct.exists()) return direct
            val alias = relativePath
                .replace("MOSS-TTS-Nano-ONNX-CPU", "MOSS-TTS-Nano-100M-ONNX")
                .replace("MOSS-Audio-Tokenizer-Nano-ONNX-CPU", "MOSS-Audio-Tokenizer-Nano-ONNX")
            return File(manifestDir, alias).canonicalFile
        }

        fun readJson(file: File): JSONObject {
            require(file.isFile) { "Missing JSON file: ${file.absolutePath}" }
            return JSONObject(file.readText(Charsets.UTF_8))
        }

        private fun JSONArray.toIntArrayCompat(): IntArray = IntArray(length()) { getInt(it) }
    }
}

/** `tts_browser_onnx_meta.json`: which file is which ONNX graph, and the decode step's KV cache port names. */
internal data class TalosMossTtsMeta(
    val prefillFile: String,
    val decodeStepFile: String,
    val localFixedSampledFrameFile: String,
    val decodeInputNames: List<String>,
    val decodeOutputNames: List<String>,
) {
    companion object {
        fun fromJson(json: JSONObject): TalosMossTtsMeta {
            val files = json.getJSONObject("files")
            val onnx = json.getJSONObject("onnx")
            return TalosMossTtsMeta(
                prefillFile = files.getString("prefill"),
                decodeStepFile = files.getString("decode_step"),
                localFixedSampledFrameFile = files.getString("local_fixed_sampled_frame"),
                decodeInputNames = onnx.getJSONArray("decode_input_names").toStringListCompat(),
                decodeOutputNames = onnx.getJSONArray("decode_output_names").toStringListCompat(),
            )
        }

        private fun JSONArray.toStringListCompat(): List<String> = List(length()) { getString(it) }
    }
}

/**
 * `codec_browser_onnx_meta.json`: which files decode audio codes into PCM
 * (`decode_full`, the whole-utterance graph Fase 1 uses; `decode_step`, the
 * incremental one Fase 2 uses), and the `streaming_decode` state shapes
 * `TalosMossCodecStream` needs to drive `decode_step` - read from the file,
 * not hardcoded: the real metadata already lists every attention layer's
 * exact tensor names, shapes and dtypes (12 layers on the pinned MOSS-Audio-
 * Tokenizer-Nano revision, but nothing here assumes that count).
 */
internal data class TalosMossCodecMeta(
    val decodeFullFile: String,
    val decodeStepFile: String,
    /** Enrollment only (blueprint §15.1: "codecEncodeSession — enrollment only") - turns a captured reference waveform into `prompt_audio_codes`. */
    val encodeFile: String,
    val sampleRate: Int,
    val channels: Int,
    val numQuantizers: Int,
    val streamingTransformerOffsets: List<StreamingOffsetSpec>,
    val streamingAttentionCaches: List<StreamingAttentionSpec>,
) {
    /** One of the codec's own scalar position counters - not per-layer, shared across a handful of decoder blocks. */
    data class StreamingOffsetSpec(val inputName: String, val outputName: String, val shape: IntArray)

    /** One attention layer's KV cache: offset (how many positions are valid), keys, values, and their positions. */
    data class StreamingAttentionSpec(
        val offsetInputName: String,
        val offsetOutputName: String,
        val offsetShape: IntArray,
        val cachedKeysInputName: String,
        val cachedKeysOutputName: String,
        val cachedValuesInputName: String,
        val cachedValuesOutputName: String,
        val cachedPositionsInputName: String,
        val cachedPositionsOutputName: String,
        val cacheShape: IntArray,
        val positionsShape: IntArray,
    )

    companion object {
        fun fromJson(json: JSONObject): TalosMossCodecMeta {
            val files = json.getJSONObject("files")
            val codecConfig = json.getJSONObject("codec_config")
            val streaming = json.optJSONObject("streaming_decode")
            return TalosMossCodecMeta(
                decodeFullFile = files.getString("decode_full"),
                decodeStepFile = files.getString("decode_step"),
                encodeFile = files.getString("encode"),
                sampleRate = codecConfig.getInt("sample_rate"),
                channels = codecConfig.getInt("channels"),
                numQuantizers = codecConfig.getInt("num_quantizers"),
                streamingTransformerOffsets = streaming?.optJSONArray("transformer_offsets")?.let { array ->
                    List(array.length()) { index -> offsetSpecFromJson(array.getJSONObject(index)) }
                } ?: emptyList(),
                streamingAttentionCaches = streaming?.optJSONArray("attention_caches")?.let { array ->
                    List(array.length()) { index -> attentionSpecFromJson(array.getJSONObject(index)) }
                } ?: emptyList(),
            )
        }

        private fun offsetSpecFromJson(json: JSONObject) = StreamingOffsetSpec(
            inputName = json.getString("input_name"),
            outputName = json.getString("output_name"),
            shape = json.getJSONArray("shape").toIntArrayCompat(),
        )

        private fun attentionSpecFromJson(json: JSONObject) = StreamingAttentionSpec(
            offsetInputName = json.getString("offset_input_name"),
            offsetOutputName = json.getString("offset_output_name"),
            offsetShape = json.getJSONArray("offset_shape").toIntArrayCompat(),
            cachedKeysInputName = json.getString("cached_keys_input_name"),
            cachedKeysOutputName = json.getString("cached_keys_output_name"),
            cachedValuesInputName = json.getString("cached_values_input_name"),
            cachedValuesOutputName = json.getString("cached_values_output_name"),
            cachedPositionsInputName = json.getString("cached_positions_input_name"),
            cachedPositionsOutputName = json.getString("cached_positions_output_name"),
            cacheShape = json.getJSONArray("cache_shape").toIntArrayCompat(),
            positionsShape = json.getJSONArray("positions_shape").toIntArrayCompat(),
        )

        private fun JSONArray.toIntArrayCompat(): IntArray = IntArray(length()) { getInt(it) }
    }
}
