package ai.talos.voice

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Pure JSON parsing, no ONNX and no device needed — this runs on the host
 * JVM (`./gradlew :app:testDebugUnitTest`), unlike the runtime it feeds,
 * which can only be proven on a real device. A synthetic manifest is used
 * here on purpose, not the real 503 KB `browser_poc_manifest.json` pulled
 * from the device: it is small enough to read at a glance, and keeps a
 * vendor artifact out of git history (blueprint §35.3), matching how
 * [TalosMossManifest] itself never bundles or downloads model data. Fidelity
 * against the real, on-device manifest is proven separately, by
 * `TalosMossRuntimeInstrumentedTest` reading the actual file.
 */
class TalosMossManifestTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun sampleManifestJson(): JSONObject = JSONObject(
        """
        {
          "model_files": {"tts_meta": "tts_browser_onnx_meta.json", "codec_meta": "../codec/codec_browser_onnx_meta.json"},
          "tts_config": {
            "n_vq": 4,
            "audio_pad_token_id": 1000,
            "audio_start_token_id": 1001,
            "audio_end_token_id": 1002,
            "audio_user_slot_token_id": 8,
            "audio_assistant_slot_token_id": 1003,
            "audio_codebook_sizes": [1024, 1024, 1024, 1024]
          },
          "prompt_templates": {
            "user_prompt_prefix_token_ids": [1, 2, 3],
            "user_prompt_after_reference_token_ids": [4, 5],
            "assistant_prompt_prefix_token_ids": [6]
          },
          "generation_defaults": {"max_new_frames": 200},
          "builtin_voices": [
            {"voice": "Junhao", "prompt_audio_codes": [[10, 11, 12, 13], [20, 21, 22, 23]]},
            {"voice": "Empty", "prompt_audio_codes": []}
          ]
        }
        """.trimIndent(),
    )

    @Test
    fun parsesEveryFieldFromTheRealManifestShape() {
        val manifest = TalosMossManifest.fromJson(sampleManifestJson())

        assertEquals("tts_browser_onnx_meta.json", manifest.modelFiles.ttsMeta)
        assertEquals("../codec/codec_browser_onnx_meta.json", manifest.modelFiles.codecMeta)
        assertEquals(4, manifest.ttsConfig.nVq)
        assertEquals(1000, manifest.ttsConfig.audioPadTokenId)
        assertEquals(8, manifest.ttsConfig.audioUserSlotTokenId)
        assertEquals(listOf(1024, 1024, 1024, 1024), manifest.ttsConfig.audioCodebookSizes.toList())
        assertEquals(listOf(1, 2, 3), manifest.promptTemplates.userPromptPrefixTokenIds.toList())
        assertEquals(200, manifest.generationDefaults.maxNewFrames)
        assertEquals(2, manifest.builtinVoices.size)
        assertEquals("Junhao", manifest.builtinVoices[0].voice)
        assertEquals(listOf(10, 11, 12, 13), manifest.builtinVoices[0].promptAudioCodes[0].toList())
        assertTrue(manifest.builtinVoices[1].promptAudioCodes.isEmpty())
    }

    @Test
    fun defaultsAudioUserSlotAndGenerationDefaultsWhenAbsent() {
        // The contrary case: fields with a documented default must actually
        // fall back, not just happen to be present in every real file we've
        // seen so far.
        val json = JSONObject(
            """
            {
              "model_files": {"tts_meta": "a.json", "codec_meta": "b.json"},
              "tts_config": {
                "n_vq": 1, "audio_pad_token_id": 0, "audio_start_token_id": 1,
                "audio_end_token_id": 2, "audio_assistant_slot_token_id": 3,
                "audio_codebook_sizes": [1024]
              },
              "prompt_templates": {
                "user_prompt_prefix_token_ids": [], "user_prompt_after_reference_token_ids": [],
                "assistant_prompt_prefix_token_ids": []
              }
            }
            """.trimIndent(),
        )
        val manifest = TalosMossManifest.fromJson(json)
        assertEquals(8, manifest.ttsConfig.audioUserSlotTokenId)
        assertEquals(375, manifest.generationDefaults.maxNewFrames)
        assertTrue(manifest.builtinVoices.isEmpty())
    }

    @Test
    fun ttsMetaAndCodecMetaParseTheRealFileShapes() {
        val ttsMeta = TalosMossTtsMeta.fromJson(
            JSONObject(
                """
                {
                  "files": {"prefill": "moss_tts_prefill.onnx", "decode_step": "moss_tts_decode_step.onnx",
                            "local_fixed_sampled_frame": "moss_tts_local_fixed_sampled_frame.onnx"},
                  "onnx": {"decode_input_names": ["input_ids", "past_valid_lengths", "past_kv_0"],
                           "decode_output_names": ["global_hidden", "present_kv_0"]}
                }
                """.trimIndent(),
            ),
        )
        assertEquals("moss_tts_prefill.onnx", ttsMeta.prefillFile)
        assertEquals(listOf("past_kv_0"), ttsMeta.decodeInputNames.drop(2))

        val codecMeta = TalosMossCodecMeta.fromJson(
            JSONObject(
                """
                {
                  "files": {"decode_full": "moss_audio_tokenizer_decode_full.onnx", "decode_step": "moss_audio_tokenizer_decode_step.onnx", "encode": "moss_audio_tokenizer_encode.onnx"},
                  "codec_config": {"sample_rate": 48000, "channels": 2, "num_quantizers": 16},
                  "streaming_decode": {
                    "transformer_offsets": [
                      {"index": 0, "input_name": "transformer_offset_0", "output_name": "transformer_offset_out_0", "shape": [1]}
                    ],
                    "attention_caches": [
                      {"index": 0, "context": 500, "num_heads": 4, "head_dim": 64,
                       "offset_input_name": "attn_offset_0", "offset_output_name": "attn_offset_out_0",
                       "cached_keys_input_name": "attn_cached_keys_0", "cached_keys_output_name": "attn_cached_keys_out_0",
                       "cached_values_input_name": "attn_cached_values_0", "cached_values_output_name": "attn_cached_values_out_0",
                       "cached_positions_input_name": "attn_cached_positions_0", "cached_positions_output_name": "attn_cached_positions_out_0",
                       "offset_shape": [1], "cache_shape": [1, 4, 500, 64], "positions_shape": [1, 500]}
                    ]
                  }
                }
                """.trimIndent(),
            ),
        )
        assertEquals("moss_audio_tokenizer_decode_full.onnx", codecMeta.decodeFullFile)
        assertEquals("moss_audio_tokenizer_decode_step.onnx", codecMeta.decodeStepFile)
        assertEquals("moss_audio_tokenizer_encode.onnx", codecMeta.encodeFile)
        assertEquals(48000, codecMeta.sampleRate)
        assertEquals(2, codecMeta.channels)
        assertEquals(16, codecMeta.numQuantizers)
        assertEquals(1, codecMeta.streamingTransformerOffsets.size)
        assertEquals("transformer_offset_0", codecMeta.streamingTransformerOffsets[0].inputName)
        assertEquals(1, codecMeta.streamingAttentionCaches.size)
        val attn = codecMeta.streamingAttentionCaches[0]
        assertEquals("attn_cached_keys_0", attn.cachedKeysInputName)
        assertEquals(listOf(1, 4, 500, 64), attn.cacheShape.toList())
        assertEquals(listOf(1, 500), attn.positionsShape.toList())
    }

    @Test
    fun codecMetaWithoutStreamingDecodeParsesToEmptyLists() {
        // The contrary case: a manifest with no streaming_decode section (or
        // an older format) must not throw - just carry no streaming spec.
        val codecMeta = TalosMossCodecMeta.fromJson(
            JSONObject(
                """{"files": {"decode_full": "a.onnx", "decode_step": "b.onnx", "encode": "c.onnx"}, "codec_config": {"sample_rate": 48000, "channels": 1, "num_quantizers": 8}}""",
            ),
        )
        assertTrue(codecMeta.streamingTransformerOffsets.isEmpty())
        assertTrue(codecMeta.streamingAttentionCaches.isEmpty())
    }

    @Test
    fun resolveManifestPathTriesEveryKnownRepoLayout() {
        val root = tmp.newFolder("model-root")
        val nested = File(root, "MOSS-TTS-Nano-100M-ONNX").apply { mkdirs() }
        val manifestFile = File(nested, "browser_poc_manifest.json").apply { writeText("{}") }

        val resolved = TalosMossManifest.resolveManifestPath(root)
        assertEquals(manifestFile.canonicalFile, resolved.canonicalFile)
    }

    @Test
    fun resolveManifestPathFailsByNameWhenNothingIsPushed() {
        val emptyRoot = tmp.newFolder("empty-root")
        assertThrows(IllegalStateException::class.java) {
            TalosMossManifest.resolveManifestPath(emptyRoot)
        }
    }

    @Test
    fun resolveManifestRelativePathFallsBackToTheAliasedRepoName() {
        val manifestDir = tmp.newFolder("manifest-dir")
        // Only the "100M" name exists on disk; the manifest references the
        // "ONNX-CPU" name, as some pushed manifests do.
        File(manifestDir, "MOSS-TTS-Nano-100M-ONNX").mkdirs()
        val aliasedTarget = File(manifestDir, "MOSS-TTS-Nano-100M-ONNX/tts_browser_onnx_meta.json")
        aliasedTarget.writeText("{}")

        val resolved = TalosMossManifest.resolveManifestRelativePath(
            manifestDir,
            "MOSS-TTS-Nano-ONNX-CPU/tts_browser_onnx_meta.json",
        )
        assertEquals(aliasedTarget.canonicalFile, resolved.canonicalFile)
    }
}
