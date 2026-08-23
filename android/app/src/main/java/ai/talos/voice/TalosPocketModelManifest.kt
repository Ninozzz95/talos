package ai.talos.voice

import org.json.JSONArray
import org.json.JSONObject


internal data class TalosPocketModelManifest(
    val schemaVersion: Int,
    val engine: String,
    val language: String,
    val installRoot: String,
    val repository: String,
    val revision: String,
    val weightsLicense: String,
    val licenseUrl: String?,
    val onnxRuntimeVersion: String,
    val sentencePieceVersion: String,
    val sampleRate: Int,
    val frameRate: Double,
    val samplesPerFrame: Int,
    val latentDim: Int,
    val conditioningDim: Int,
    val maxTokenPerChunk: Int,
    val flowStateCount: Int,
    val mimiStateCount: Int,
    val insertBosBeforeVoice: Boolean,
    val files: List<ModelFile>,
) {
    data class ModelFile(val path: String, val size: Long, val sha256: String)

    fun requirePinnedBundle(): TalosPocketModelManifest {
        require(schemaVersion == 1) { "Pocket schemaVersion is not pinned" }
        require(engine == ENGINE) { "Pocket engine is not pinned" }
        require(language == LANGUAGE) { "Pocket language is not pinned" }
        require(installRoot == INSTALL_ROOT) { "Pocket installRoot is not pinned" }
        require(repository == REPOSITORY) { "Pocket repository is not pinned" }
        require(revision == REVISION) { "Pocket revision is not pinned" }
        require(weightsLicense == "CC-BY-4.0") { "Pocket weights license is not pinned" }
        require(onnxRuntimeVersion == "1.29.0") { "Pocket ORT version is not pinned" }
        require(sentencePieceVersion == "0.2.2") { "Pocket SentencePiece version is not pinned" }
        require(sampleRate == 24_000 && frameRate == 12.5 && samplesPerFrame == 1_920) {
            "Pocket timing contract is not pinned"
        }
        require(latentDim == 32 && conditioningDim == 1_024 && maxTokenPerChunk == 50) {
            "Pocket tensor contract is not pinned"
        }
        require(flowStateCount == 18 && mimiStateCount == 56 && insertBosBeforeVoice) {
            "Pocket state contract is not pinned"
        }
        require(files.associateBy { it.path } == PINNED_FILES) { "Pocket file set is not pinned" }
        return this
    }

    /**
     * Adapts the pinned upstream bundle to TALOS' existing generic transfer
     * contract. The downloader must request the repository's real
     * `onnx/italian/<file>` paths, while activation deliberately flattens those
     * files into the self-contained runtime root `pocket/italian`.
     */
    fun toVoiceModelManifest(): TalosVoiceModelManifest = TalosVoiceModelManifest(
        schemaVersion = schemaVersion,
        engineBuild = "$engine@$revision",
        installRoot = installRoot,
        artifacts = listOf(
            TalosVoiceModelManifest.Artifact(
                repo = repository,
                revision = revision,
                targetDir = language,
                files = files.map { file ->
                    TalosVoiceModelManifest.Artifact.File(
                        path = "onnx/$language/${file.path}",
                        size = file.size,
                        sha256 = file.sha256,
                        targetPath = file.path,
                    )
                },
            ),
        ),
    )

    companion object {
        const val ENGINE = "pocket-v2"
        const val LANGUAGE = "italian"
        const val INSTALL_ROOT = "pocket"
        const val REPOSITORY = "KevinAHM/pocket-tts-onnx"
        const val REVISION = "58a6d00cf13d239b6748cb0769f35c580a8f606c"
        private val SHA256 = Regex("^[0-9a-f]{64}$")

        private val PINNED_FILES = listOf(
            ModelFile("bos_before_voice.npy", 4_224, "212357ca66b450e7dc2ae6cb11f1efd08b49c59e25196a6979c37962fef6cd82"),
            ModelFile("bundle.json", 24_365, "c779c25fd836c9b85a3fc570474774777176757bd6bec0b5bffbbe599644a9f9"),
            ModelFile("flow_lm_flow_int8.onnx", 9_962_530, "21b2bec2f9ae4323fc545a0c7ffb274bdfa925a699fd304ed03aba53e4ca9129"),
            ModelFile("flow_lm_main_int8.onnx", 76_341_079, "f43ce4d823471095a7bd6d9dcfcceb46145ea96b0f2b85b7d668f15816965055"),
            ModelFile("mimi_decoder_int8.onnx", 22_684_077, "f120bc5cddca9514c511f128786f5d9e6e6893b067faae5e30f5b2bd5643aa03"),
            ModelFile("mimi_encoder.onnx", 39_768_446, "8936e1f95baedb898941fc7a259d7ab8c031aeaf6d3746ecac3cf7b280a9adda"),
            ModelFile("text_conditioner.onnx", 16_388_344, "692369f5ac340006fa44252155da77fe6c8a60a859848297777e0caea534068e"),
            ModelFile("tokenizer.model", 60_078, "6583b974a11b90e14d8a4c8e9c43f06c3861b9ede6e5023a4c27ab5a3a7d4c39"),
        ).associateBy { it.path }

        fun fromJson(json: JSONObject): TalosPocketModelManifest {
            val source = json.getJSONObject("source")
            val runtime = json.getJSONObject("runtime")
            val bundle = json.getJSONObject("bundle")
            val files = json.getJSONArray("files").toModelFiles()
            require(files.isNotEmpty()) { "Pocket files must not be empty" }
            require(files.map { it.path }.toSet().size == files.size) { "Pocket file path is duplicated" }
            return TalosPocketModelManifest(
                schemaVersion = json.getInt("schemaVersion"),
                engine = json.getString("engine"),
                language = json.getString("language"),
                installRoot = json.getString("installRoot"),
                repository = source.getString("repository"),
                revision = source.getString("revision"),
                weightsLicense = source.getString("weightsLicense"),
                licenseUrl = source.optString("licenseUrl").takeIf { it.isNotBlank() },
                onnxRuntimeVersion = runtime.getString("onnxRuntime"),
                sentencePieceVersion = runtime.getString("sentencePiece"),
                sampleRate = bundle.getInt("sampleRate"),
                frameRate = bundle.getDouble("frameRate"),
                samplesPerFrame = bundle.getInt("samplesPerFrame"),
                latentDim = bundle.getInt("latentDim"),
                conditioningDim = bundle.getInt("conditioningDim"),
                maxTokenPerChunk = bundle.optInt("maxTokenPerChunk", 50),
                flowStateCount = bundle.getInt("flowStateCount"),
                mimiStateCount = bundle.getInt("mimiStateCount"),
                insertBosBeforeVoice = bundle.getBoolean("insertBosBeforeVoice"),
                files = files,
            )
        }

        private fun JSONArray.toModelFiles(): List<ModelFile> = (0 until length()).map { index ->
            val file = getJSONObject(index)
            val path = file.getString("path").replace('\\', '/')
            require(path.isSafeRelativePath()) { "unsafe Pocket file path: $path" }
            val size = file.getLong("size")
            require(size > 0L) { "invalid Pocket file size: $path" }
            val sha256 = file.getString("sha256")
            require(SHA256.matches(sha256)) { "invalid Pocket file sha256: $path" }
            ModelFile(path, size, sha256)
        }

        private fun String.isSafeRelativePath(): Boolean {
            if (startsWith('/') || startsWith('\\') || Regex("^[A-Za-z]:").containsMatchIn(this)) return false
            val segments = split('/')
            return segments.isNotEmpty() && segments.none { it.isBlank() || it == "." || it == ".." }
        }
    }
}
