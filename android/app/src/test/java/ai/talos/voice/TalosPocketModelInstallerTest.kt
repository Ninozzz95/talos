package ai.talos.voice

import ai.talos.TalosModelStore
import java.io.File
import java.security.MessageDigest
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder


class TalosPocketModelInstallerTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var externalFilesDir: File
    private lateinit var expectedBytes: ByteArray
    private lateinit var manifest: TalosPocketModelManifest
    private lateinit var installer: TalosPocketModelInstaller

    @Before
    fun setUp() {
        externalFilesDir = tmp.newFolder("external")
        expectedBytes = "pocket-model-a".toByteArray()
        manifest = manifestFor(expectedBytes)
        installer = TalosPocketModelInstaller(externalFilesDir, manifest)
    }

    @After
    fun tearDown() {
        externalFilesDir.deleteRecursively()
    }

    @Test
    fun `POCKET-INSTALL-01 maps remote Italian source paths to the flat active bundle`() {
        val plan = installer.installPlan()
        val artifact = plan.artifacts.single()
        val file = artifact.files.single()

        assertEquals("pocket-v2@revision-1", plan.engineBuild)
        assertEquals("pocket", plan.installRoot)
        assertEquals("italian", artifact.targetDir)
        assertEquals("onnx/italian/model.onnx", file.path)
        assertEquals("model.onnx", file.targetPath)
        assertEquals(listOf("onnx/italian/model.onnx"), plan.toTransferRequests().single().paths.toList())
    }

    @Test
    fun `POCKET-INSTALL-04 activation verifies staging and active before cache cleanup and reports every stage`() {
        placeCache(expectedBytes)

        val result = installer.activateFromCache()

        assertTrue(result.activated)
        assertTrue(result.status is TalosPocketModelStatus.Ready)
        assertArrayEquals(expectedBytes, File(activeRoot(), "model.onnx").readBytes())
        assertFalse(cacheFile().exists())
        assertEquals(
            listOf(
                "cache_stage",
                "staging_verify",
                "atomic_promote",
                "active_verify",
                "previous_cleanup",
                "source_cache_cleanup",
            ),
            result.stageMetrics.map(TalosPocketInstallStageMetric::stage),
        )
        assertTrue(result.stageMetrics.all { it.startedAtNs > 0L && it.durationNs >= 0L })
        assertTrue(result.stageMetrics.all { it.threadName == Thread.currentThread().name })
    }

    @Test
    fun `POCKET-INSTALL-02 one byte cache mutation never replaces the previous active directory`() {
        val old = "previous-active".toByteArray()
        activeRoot().mkdirs()
        File(activeRoot(), "model.onnx").writeBytes(old)
        val mutated = expectedBytes.copyOf().also { it[it.lastIndex] = (it.last() + 1).toByte() }
        placeCache(mutated)

        val result = installer.activateFromCache()

        assertFalse(result.activated)
        assertTrue(result.status is TalosPocketModelStatus.Corrupt)
        assertEquals("sha256", (result.status as TalosPocketModelStatus.Corrupt).reason)
        assertArrayEquals(old, File(activeRoot(), "model.onnx").readBytes())
        assertTrue(cacheFile().isFile)
        assertEquals(listOf("cache_stage", "staging_verify"), result.stageMetrics.map { it.stage })
    }

    @Test
    fun `POCKET-INSTALL-03 recovery never promotes an unverified staging directory`() {
        val staging = File(externalFilesDir, "pocket/italian.staging").apply { mkdirs() }
        File(staging, "model.onnx").writeBytes(ByteArray(expectedBytes.size) { 7 })

        val result = installer.recover()

        assertFalse(result.activated)
        assertTrue(result.status is TalosPocketModelStatus.Corrupt)
        assertFalse(activeRoot().exists())
        assertTrue(staging.isDirectory)
        assertEquals(listOf("staging_verify"), result.stageMetrics.map { it.stage })
    }

    private fun placeCache(bytes: ByteArray) {
        val file = cacheFile()
        file.parentFile?.mkdirs()
        file.writeBytes(bytes)
    }

    private fun cacheFile(): File {
        val artifact = installer.installPlan().artifacts.single()
        val contract = artifact.files.single()
        return TalosModelStore(externalFilesDir).slot(artifact.repo, artifact.revision, contract.path).finished
    }

    private fun activeRoot(): File = File(externalFilesDir, "pocket/italian")

    private fun manifestFor(bytes: ByteArray) = TalosPocketModelManifest(
        schemaVersion = 1,
        engine = "pocket-v2",
        language = "italian",
        installRoot = "pocket",
        repository = "Org/Pocket",
        revision = "revision-1",
        weightsLicense = "CC-BY-4.0",
        licenseUrl = null,
        onnxRuntimeVersion = "1.29.0",
        sentencePieceVersion = "0.2.2",
        sampleRate = 24_000,
        frameRate = 12.5,
        samplesPerFrame = 1_920,
        latentDim = 32,
        conditioningDim = 1_024,
        maxTokenPerChunk = 50,
        flowStateCount = 18,
        mimiStateCount = 56,
        insertBosBeforeVoice = true,
        files = listOf(
            TalosPocketModelManifest.ModelFile(
                path = "model.onnx",
                size = bytes.size.toLong(),
                sha256 = sha256(bytes),
            ),
        ),
    )

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
