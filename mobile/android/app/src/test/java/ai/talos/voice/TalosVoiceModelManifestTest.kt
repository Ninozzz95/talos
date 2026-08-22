package ai.talos.voice

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Fase 5, Blocco 2 — dal `.json` ai [ai.talos.TalosTransferSession.Request]
 * che il motore di trasferimento già sa eseguire. Due manifesti: uno
 * sintetico piccolo (la forma, gli errori), e il vero
 * `assets/voice/model-manifest.json` pinnato nel Blocco 1 (la fedeltà —
 * stessa disciplina di [TalosVoiceModelManifestPinTest]: leggere il file
 * VERO che finirà nell'APK, non uno stand-in).
 */
class TalosVoiceModelManifestTest {

    private fun sample(artifacts: String = SAMPLE_ARTIFACTS): JSONObject = JSONObject(
        """
        {
          "schemaVersion": 1,
          "engineBuild": "moss-nano-test",
          "installRoot": "moss",
          "artifacts": [$artifacts]
        }
        """.trimIndent(),
    )

    @Test
    fun `parses a two-file artifact into its fields, in order`() {
        val manifest = TalosVoiceModelManifest.fromJson(sample())
        assertEquals(1, manifest.artifacts.size)
        val artifact = manifest.artifacts[0]
        assertEquals("Org/Repo-A", artifact.repo)
        assertEquals("deadbeef", artifact.revision)
        assertEquals("Repo-A-Dir", artifact.targetDir)
        assertEquals(listOf("a.onnx", "b.json"), artifact.files.map { it.path })
        assertEquals(listOf(10L, 20L), artifact.files.map { it.size })
        assertEquals(listOf("h".repeat(64), "i".repeat(64)), artifact.files.map { it.sha256 })
    }

    @Test
    fun `one Request per artifact, never one merged Request across two repos`() {
        val manifest = TalosVoiceModelManifest.fromJson(
            sample(SAMPLE_ARTIFACTS + "," + SAMPLE_ARTIFACTS.replace("Repo-A", "Repo-B")),
        )
        val requests = manifest.toTransferRequests()
        assertEquals(2, requests.size)
        assertEquals("Org/Repo-A", requests[0].repo)
        assertEquals("Org/Repo-B", requests[1].repo)
        // ⛔ AL CONTRARIO: se qualcuno "ottimizzasse" unendo i due artifact in
        // un Request solo, `Request.repo` è UNA stringa - il secondo repo
        // sparirebbe in silenzio, non un errore rumoroso. Questo lo blocca.
        assertTrue(requests.none { it.repo.contains(",") })
    }

    @Test
    fun `Request carries paths, sizes and hashes aligned by index - the contract Request itself relies on`() {
        val manifest = TalosVoiceModelManifest.fromJson(sample())
        val request = manifest.toTransferRequests().single()
        assertEquals(listOf("a.onnx", "b.json"), request.paths.toList())
        assertEquals(listOf(10L, 20L), request.sizes.toList())
        assertEquals(listOf("h".repeat(64), "i".repeat(64)), request.hashes.toList())
        assertEquals(30L, request.totalBytes)
    }

    @Test
    fun `modelName threads engineBuild and targetDir - two voice downloads never collide with a chat GGUF`() {
        val manifest = TalosVoiceModelManifest.fromJson(sample())
        assertEquals("moss-nano-test/Repo-A-Dir", manifest.toTransferRequests().single().modelName)
    }

    @Test(expected = org.json.JSONException::class)
    fun `a missing required field fails loudly, not with a silently-zeroed request`() {
        val broken = JSONObject(
            """{"schemaVersion": 1, "engineBuild": "x", "installRoot": "moss", "artifacts": [{"repo": "a/b"}]}""",
        )
        TalosVoiceModelManifest.fromJson(broken)
    }

    // ---- Fedeltà sul manifesto VERO, pinnato nel Blocco 1 -------------------

    private fun realManifest(): TalosVoiceModelManifest {
        val file = File("src/main/assets/voice/model-manifest.json")
        assertTrue("manifest not found at ${file.absolutePath}", file.isFile)
        return TalosVoiceModelManifest.fromJson(JSONObject(file.readText()))
    }

    @Test
    fun `the real pinned manifest parses into exactly two artifacts, TTS then tokenizer`() {
        val manifest = realManifest()
        assertEquals(2, manifest.artifacts.size)
        assertEquals("OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX", manifest.artifacts[0].repo)
        assertEquals("OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX", manifest.artifacts[1].repo)
        assertEquals("moss", manifest.installRoot)
    }

    @Test
    fun `the real pinned manifest produces two Requests whose total matches the byte sum proved in Blocco 1`() {
        val requests = realManifest().toTransferRequests()
        assertEquals(2, requests.size)
        val total = requests.sumOf { it.totalBytes }
        // ⛔ Lo stesso numero di `TalosVoiceModelManifestPinTest`, ricalcolato
        // qui da un percorso di codice DIVERSO (il parser + Request, non
        // una somma diretta sul JSON) — se i due calcoli divergessero, uno
        // dei due avrebbe un difetto che l'altro da solo non avrebbe mai
        // fatto vedere.
        assertEquals(763_191_513L, total)
    }

    private companion object {
        // ⛔ NON `const val`: Kotlin richiede una costante di compilazione per
        // `const`, e questa stringa interpola `"h".repeat(64)` a runtime.
        val SAMPLE_ARTIFACTS = """
            {
              "repo": "Org/Repo-A",
              "revision": "deadbeef",
              "targetDir": "Repo-A-Dir",
              "files": [
                {"path": "a.onnx", "size": 10, "sha256": "${"h".repeat(64)}"},
                {"path": "b.json", "size": 20, "sha256": "${"i".repeat(64)}"}
              ]
            }
        """
    }
}
