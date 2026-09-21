package ai.talos.voice.pocket

import org.json.JSONArray
import org.json.JSONObject


enum class TalosPocketDType(val wireName: String) {
    FLOAT32("float32"),
    FLOAT16("float16"),
    INT64("int64"),
    BOOL("bool");

    companion object {
        fun fromWire(value: String): TalosPocketDType = entries.firstOrNull { it.wireName == value }
            ?: throw IllegalArgumentException("unsupported Pocket dtype: $value")
    }
}

enum class TalosPocketFill(val wireName: String) {
    NAN("nan"),
    ZEROS("zeros"),
    ONES("ones"),
    EMPTY("empty");

    companion object {
        fun fromWire(value: String): TalosPocketFill = entries.firstOrNull { it.wireName == value }
            ?: throw IllegalArgumentException("unsupported Pocket fill: $value")
    }
}

sealed interface TalosPocketTensorData {
    val shape: LongArray

    data class Float32(override val shape: LongArray, val values: FloatArray) : TalosPocketTensorData
    data class Float16(override val shape: LongArray, val values: ShortArray) : TalosPocketTensorData
    data class Int64(override val shape: LongArray, val values: LongArray) : TalosPocketTensorData
    data class Bool(override val shape: LongArray, val values: BooleanArray) : TalosPocketTensorData
}

data class TalosPocketStateSpec(
    val index: Int,
    val inputName: String,
    val outputName: String,
    val dtype: TalosPocketDType,
    val shape: LongArray,
    val fill: TalosPocketFill,
) {
    fun initialValue(): TalosPocketTensorData {
        require(shape.all { it >= 0 }) { "$inputName has a negative dimension" }
        val elements = shape.fold(1L) { total, dimension -> Math.multiplyExact(total, dimension) }
        require(elements <= Int.MAX_VALUE) { "$inputName is too large" }
        val count = elements.toInt()
        return when (dtype) {
            TalosPocketDType.FLOAT32 -> TalosPocketTensorData.Float32(
                shape.copyOf(),
                FloatArray(count) { if (fill == TalosPocketFill.NAN) Float.NaN else if (fill == TalosPocketFill.ONES) 1f else 0f },
            )
            TalosPocketDType.FLOAT16 -> TalosPocketTensorData.Float16(
                shape.copyOf(),
                ShortArray(count) { if (fill == TalosPocketFill.ONES) 0x3c00.toShort() else 0 },
            )
            TalosPocketDType.INT64 -> TalosPocketTensorData.Int64(
                shape.copyOf(),
                LongArray(count) { if (fill == TalosPocketFill.ONES) 1L else 0L },
            )
            TalosPocketDType.BOOL -> TalosPocketTensorData.Bool(
                shape.copyOf(),
                BooleanArray(count) { fill == TalosPocketFill.ONES },
            )
        }
    }

    override fun equals(other: Any?): Boolean = other is TalosPocketStateSpec &&
        index == other.index && inputName == other.inputName && outputName == other.outputName &&
        dtype == other.dtype && shape.contentEquals(other.shape) && fill == other.fill

    override fun hashCode(): Int = 31 * (31 * index + inputName.hashCode()) + shape.contentHashCode()
}

data class TalosPocketBundle(
    val language: String,
    val sampleRate: Int,
    val frameRate: Double,
    val samplesPerFrame: Int,
    val latentDim: Int,
    val conditioningDim: Int,
    val maxTokenPerChunk: Int,
    val insertBosBeforeVoice: Boolean,
    val tokenizerFile: String,
    val bosBeforeVoiceFile: String,
    val padWithSpacesForShortInputs: Boolean,
    val removeSemicolons: Boolean,
    val modelRecommendedFramesAfterEos: Int?,
    val flowStates: List<TalosPocketStateSpec>,
    val mimiStates: List<TalosPocketStateSpec>,
) {
    val frameDurationMs: Double get() = samplesPerFrame * 1_000.0 / sampleRate

    internal fun requireSupportedStateLayout() {
        val expectedFlowStates = when (language) {
            "italian" -> 18
            "italian_24l" -> 72
            else -> throw IllegalArgumentException("unsupported Pocket Italian bundle: $language")
        }
        require(flowStates.size == expectedFlowStates) {
            "Pocket $language requires $expectedFlowStates flow states"
        }
        require(mimiStates.size == 56) { "Pocket Italian v2 requires 56 Mimi states" }
    }

    companion object {
        fun fromJson(json: JSONObject): TalosPocketBundle {
            require(json.getInt("schema_version") == 2) { "Pocket schema_version must be 2" }
            val language = json.getString("bundle_name")
            require(language == "italian" || language == "italian_24l") {
                "Pocket bundle_name must be italian or italian_24l"
            }
            val sampleRate = json.getInt("sample_rate")
            val frameRate = json.getDouble("frame_rate")
            val samplesPerFrame = json.getInt("samples_per_frame")
            val latentDim = json.getInt("latent_dim")
            val conditioningDim = json.getInt("conditioning_dim")
            require(sampleRate == 24_000 && frameRate == 12.5 && samplesPerFrame == 1_920) {
                "Pocket timing contract differs from Italian v2"
            }
            require(latentDim == 32 && conditioningDim == 1_024) {
                "Pocket dimensions differ from Italian v2"
            }
            val flow = json.getJSONArray("flow_lm_state_manifest").toStateSpecs("flow")
            val mimi = json.getJSONArray("mimi_state_manifest").toStateSpecs("mimi")
            return TalosPocketBundle(
                language = language,
                sampleRate = sampleRate,
                frameRate = frameRate,
                samplesPerFrame = samplesPerFrame,
                latentDim = latentDim,
                conditioningDim = conditioningDim,
                maxTokenPerChunk = json.optInt("max_token_per_chunk", 50),
                insertBosBeforeVoice = json.getBoolean("insert_bos_before_voice"),
                tokenizerFile = json.getString("tokenizer_file"),
                bosBeforeVoiceFile = json.getString("bos_before_voice_file"),
                padWithSpacesForShortInputs = json.optBoolean("pad_with_spaces_for_short_inputs", false),
                removeSemicolons = json.optBoolean("remove_semicolons", false),
                modelRecommendedFramesAfterEos = if (json.isNull("model_recommended_frames_after_eos")) null
                else json.optInt("model_recommended_frames_after_eos"),
                flowStates = flow,
                mimiStates = mimi,
            ).also {
                require(it.maxTokenPerChunk in 1..512) { "Pocket max_token_per_chunk is invalid" }
                require(it.insertBosBeforeVoice) { "Italian Pocket v2 requires BOS before the voice" }
            }
        }

        private fun JSONArray.toStateSpecs(label: String): List<TalosPocketStateSpec> {
            val values = (0 until length()).map { index ->
                val value = getJSONObject(index)
                TalosPocketStateSpec(
                    index = value.getInt("index"),
                    inputName = value.getString("input_name"),
                    outputName = value.getString("output_name"),
                    dtype = TalosPocketDType.fromWire(value.getString("dtype")),
                    shape = value.getJSONArray("shape").toLongArray(),
                    fill = TalosPocketFill.fromWire(value.getString("fill")),
                )
            }
            require(values.map { it.index } == values.indices.toList()) { "$label state indices are not contiguous" }
            require(values.map { it.inputName }.toSet().size == values.size) { "$label input state names are duplicated" }
            require(values.map { it.outputName }.toSet().size == values.size) { "$label output state names are duplicated" }
            return values
        }

        private fun JSONArray.toLongArray(): LongArray = LongArray(length()) { index -> getLong(index) }
    }
}
