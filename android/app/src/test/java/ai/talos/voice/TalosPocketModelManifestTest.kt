package ai.talos.voice

import java.io.File
import java.security.MessageDigest
import java.nio.file.Files
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test


class TalosPocketModelManifestTest {
    private fun realManifest(): TalosPocketModelManifest {
        val source = File("src/main/assets/voice/pocket-model-manifest.json")
        assertTrue("Pocket manifest not found at ${source.absolutePath}", source.isFile)
        return TalosPocketModelManifest.fromJson(JSONObject(source.readText())).requirePinnedBundle()
    }

    @Test
    fun `real manifest freezes the public Italian v2 bundle and all eight runtime files`() {
        val manifest = realManifest()
        assertEquals(1, manifest.schemaVersion)
        assertEquals("pocket-v2", manifest.engine)
        assertEquals("italian", manifest.language)
        assertEquals("pocket", manifest.installRoot)
        assertEquals("KevinAHM/pocket-tts-onnx", manifest.repository)
        assertEquals("58a6d00cf13d239b6748cb0769f35c580a8f606c", manifest.revision)
        assertEquals(8, manifest.files.size)
        assertEquals(165_233_143L, manifest.files.sumOf { it.size })
        assertEquals("CC-BY-4.0", manifest.weightsLicense)
    }

    @Test
    fun `POCKET-INSTALL-01 real manifest becomes one pinned downloader artifact without leaking remote directories into active root`() {
        val source = realManifest()
        val plan = source.toVoiceModelManifest()
        val artifact = plan.artifacts.single()

        assertEquals("pocket-v2@${source.revision}", plan.engineBuild)
        assertEquals("pocket", plan.installRoot)
        assertEquals("italian", artifact.targetDir)
        assertEquals(source.files.map { "onnx/italian/${it.path}" }, artifact.files.map { it.path })
        assertEquals(source.files.map { it.path }, artifact.files.map { it.targetPath })
        assertEquals(165_233_143L, plan.toTransferRequests().single().totalBytes)
    }

    @Test
    fun `real manifest records the exact runtime and semantic bundle contract`() {
        val manifest = realManifest()
        assertEquals("1.29.0", manifest.onnxRuntimeVersion)
        assertEquals("0.2.2", manifest.sentencePieceVersion)
        assertEquals(24_000, manifest.sampleRate)
        assertEquals(1_920, manifest.samplesPerFrame)
        assertEquals(32, manifest.latentDim)
        assertEquals(18, manifest.flowStateCount)
        assertEquals(56, manifest.mimiStateCount)
        assertTrue(manifest.insertBosBeforeVoice)
    }

    @Test
    fun `unsafe duplicate or malformed file contracts fail before touching storage`() {
        val base = JSONObject(
            """
            {
              "schemaVersion": 1,
              "engine": "pocket-v2",
              "language": "italian",
              "installRoot": "pocket",
              "source": {
                "repository": "KevinAHM/pocket-tts-onnx",
                "revision": "58a6d00cf13d239b6748cb0769f35c580a8f606c",
                "weightsLicense": "CC-BY-4.0"
              },
              "runtime": {"onnxRuntime": "1.29.0", "sentencePiece": "0.2.2"},
              "bundle": {
                "sampleRate": 24000,
                "samplesPerFrame": 1920,
                "latentDim": 32,
                "flowStateCount": 18,
                "mimiStateCount": 56,
                "insertBosBeforeVoice": true
              },
              "files": [
                {"path":"bundle.json","size":2,"sha256":"${"a".repeat(64)}"}
              ]
            }
            """.trimIndent(),
        )
        for (badPath in listOf("../bundle.json", "/bundle.json", "bundle.json/../x")) {
            val broken = JSONObject(base.toString())
            broken.getJSONArray("files").getJSONObject(0).put("path", badPath)
            assertThrows(IllegalArgumentException::class.java) {
                TalosPocketModelManifest.fromJson(broken)
            }
        }

        val duplicate = JSONObject(base.toString())
        duplicate.getJSONArray("files").put(JSONObject(duplicate.getJSONArray("files").getJSONObject(0).toString()))
        assertThrows(IllegalArgumentException::class.java) {
            TalosPocketModelManifest.fromJson(duplicate)
        }
    }

    @Test
    fun `model manager rejects one-byte mutation and names the corrupt file`() {
        val root = Files.createTempDirectory("talos-pocket-model-").toFile()
        try {
            val bytes = "model-a".toByteArray()
            val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            val manifest = TalosPocketModelManifest.fromJson(
                JSONObject(
                    """
                    {
                      "schemaVersion":1,
                      "engine":"pocket-v2",
                      "language":"italian",
                      "installRoot":"pocket",
                      "source":{"repository":"KevinAHM/pocket-tts-onnx","revision":"58a6d00cf13d239b6748cb0769f35c580a8f606c","weightsLicense":"CC-BY-4.0"},
                      "runtime":{"onnxRuntime":"1.29.0","sentencePiece":"0.2.2"},
                      "bundle":{"sampleRate":24000,"frameRate":12.5,"samplesPerFrame":1920,"latentDim":32,"conditioningDim":1024,"maxTokenPerChunk":50,"flowStateCount":18,"mimiStateCount":56,"insertBosBeforeVoice":true},
                      "files":[{"path":"model.onnx","size":${bytes.size},"sha256":"$hash"}]
                    }
                    """.trimIndent(),
                ),
            )
            File(root, "model.onnx").writeBytes(bytes)
            assertTrue(TalosPocketModelManager.validate(root, manifest) is TalosPocketModelStatus.Ready)

            File(root, "model.onnx").writeBytes("model-b".toByteArray())
            val status = TalosPocketModelManager.validate(root, manifest)
            assertTrue(status is TalosPocketModelStatus.Corrupt)
            assertEquals("model.onnx", (status as TalosPocketModelStatus.Corrupt).path)
            assertEquals("sha256", status.reason)
        } finally {
            root.deleteRecursively()
        }
    }
}
