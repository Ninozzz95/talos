package ai.talos.voice.pocket

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosPocketBundleTest {
    private fun bundle(
        flowStates: String = VALID_STATES,
        bundleName: String = "italian",
    ): JSONObject = JSONObject(
        """
        {
          "schema_version": 2,
          "bundle_name": "$bundleName",
          "sample_rate": 24000,
          "frame_rate": 12.5,
          "samples_per_frame": 1920,
          "latent_dim": 32,
          "conditioning_dim": 1024,
          "max_token_per_chunk": 50,
          "insert_bos_before_voice": true,
          "tokenizer_file": "tokenizer.model",
          "bos_before_voice_file": "bos_before_voice.npy",
          "flow_lm_state_manifest": [$flowStates],
          "mimi_state_manifest": [$VALID_STATES]
        }
        """.trimIndent(),
    )

    @Test
    fun `bundle v2 parses timing dimensions and exact state order`() {
        val parsed = TalosPocketBundle.fromJson(bundle())
        assertEquals("italian", parsed.language)
        assertEquals(24_000, parsed.sampleRate)
        assertEquals(1_920, parsed.samplesPerFrame)
        assertEquals(80.0, parsed.frameDurationMs, 0.0)
        assertEquals(listOf("state_0", "state_1", "state_2"), parsed.flowStates.map { it.inputName })
        assertTrue(parsed.insertBosBeforeVoice)
    }

    @Test
    fun `state initialization honors nan empty int64 and bool instead of zeroing blindly`() {
        val parsed = TalosPocketBundle.fromJson(bundle())
        val values = parsed.flowStates.map { it.initialValue() }
        val cache = values[0] as TalosPocketTensorData.Float32
        assertEquals(4, cache.values.size)
        assertTrue(cache.values.all { it.isNaN() })
        val empty = values[1] as TalosPocketTensorData.Float32
        assertTrue(empty.values.isEmpty())
        val step = values[2] as TalosPocketTensorData.Int64
        assertEquals(listOf(0L), step.values.toList())

        val boolean = TalosPocketStateSpec(
            index = 0,
            inputName = "state_0",
            outputName = "out_state_0",
            dtype = TalosPocketDType.BOOL,
            shape = longArrayOf(2),
            fill = TalosPocketFill.ONES,
        ).initialValue() as TalosPocketTensorData.Bool
        assertEquals(listOf(true, true), boolean.values.toList())
    }

    @Test
    fun `non-contiguous index duplicate names and unknown fill fail closed`() {
        val wrongIndex = VALID_STATES.replace("\"index\": 2", "\"index\": 3")
        assertThrows(IllegalArgumentException::class.java) { TalosPocketBundle.fromJson(bundle(wrongIndex)) }

        val duplicate = VALID_STATES.replace("\"state_2\"", "\"state_1\"")
        assertThrows(IllegalArgumentException::class.java) { TalosPocketBundle.fromJson(bundle(duplicate)) }

        val unknownFill = VALID_STATES.replace("\"zeros\"", "\"random\"")
        assertThrows(IllegalArgumentException::class.java) { TalosPocketBundle.fromJson(bundle(unknownFill)) }
    }

    @Test
    fun `accepts the official Italian 24 layer state layout and rejects mismatched counts`() {
        val italian = TalosPocketBundle.fromJson(bundle())
        val italian24 = TalosPocketBundle.fromJson(bundle(bundleName = "italian_24l"))

        italian.withStateCounts(flow = 18, mimi = 56).requireSupportedStateLayout()
        italian24.withStateCounts(flow = 72, mimi = 56).requireSupportedStateLayout()
        assertThrows(IllegalArgumentException::class.java) {
            italian.withStateCounts(flow = 72, mimi = 56).requireSupportedStateLayout()
        }
        assertThrows(IllegalArgumentException::class.java) {
            italian24.withStateCounts(flow = 18, mimi = 56).requireSupportedStateLayout()
        }
        assertThrows(IllegalArgumentException::class.java) {
            italian24.withStateCounts(flow = 72, mimi = 55).requireSupportedStateLayout()
        }
    }

    private fun TalosPocketBundle.withStateCounts(flow: Int, mimi: Int): TalosPocketBundle = copy(
        flowStates = List(flow) { index ->
            flowStates.first().copy(
                index = index,
                inputName = "state_$index",
                outputName = "out_state_$index",
            )
        },
        mimiStates = List(mimi) { index ->
            mimiStates.first().copy(
                index = index,
                inputName = "state_$index",
                outputName = "out_state_$index",
            )
        },
    )

    private companion object {
        const val VALID_STATES = """
          {"index": 0, "input_name": "state_0", "output_name": "out_state_0", "dtype": "float32", "shape": [2, 2], "fill": "nan"},
          {"index": 1, "input_name": "state_1", "output_name": "out_state_1", "dtype": "float32", "shape": [0], "fill": "empty"},
          {"index": 2, "input_name": "state_2", "output_name": "out_state_2", "dtype": "int64", "shape": [1], "fill": "zeros"}
        """
    }
}
