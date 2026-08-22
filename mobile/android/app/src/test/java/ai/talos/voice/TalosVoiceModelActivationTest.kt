package ai.talos.voice

import ai.talos.TalosModelStore
import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Fase 5, Blocco 3 — l'attivazione atomica, provata con un vero filesystem
 * (`TemporaryFolder`, come [TalosMossManifestTest]), non con percorsi finti:
 * `TalosModelStore` costruisce i percorsi di cache da sé, e un test che li
 * ricostruisse a mano proverebbe solo che concordano con se stesso.
 */
class TalosVoiceModelActivationTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var externalFilesDir: File
    private lateinit var store: TalosModelStore

    private val artifact = TalosVoiceModelManifest.Artifact(
        repo = "Org/Repo",
        revision = "rev1",
        targetDir = "Repo-Dir",
        files = listOf(
            TalosVoiceModelManifest.Artifact.File("a.onnx", 5, "h".repeat(64)),
            TalosVoiceModelManifest.Artifact.File("sub/b.json", 3, "i".repeat(64)),
        ),
    )

    @Before
    fun setUp() {
        externalFilesDir = tmp.newFolder("external")
        store = TalosModelStore(externalFilesDir)
    }

    /** Scrive i due file dell'[artifact] nella cache, come se il download fosse finito. */
    private fun placeFinishedInCache(bytesA: ByteArray = byteArrayOf(1, 2, 3, 4, 5), bytesB: ByteArray = byteArrayOf(6, 7, 8)) {
        for ((file, bytes) in artifact.files.zip(listOf(bytesA, bytesB))) {
            val slot = store.slot(artifact.repo, artifact.revision, file.path)
            slot.finished.parentFile?.mkdirs()
            slot.finished.writeBytes(bytes)
        }
    }

    // ---- stage() -------------------------------------------------------

    @Test
    fun `stages every cache file into the staging directory, byte for byte`() {
        placeFinishedInCache()
        val outcome = TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        assertTrue(outcome is TalosVoiceModelActivation.Outcome.Activated)
        val staging = (outcome as TalosVoiceModelActivation.Outcome.Activated).targetDir
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), File(staging, "a.onnx").readBytes())
        assertArrayEquals(byteArrayOf(6, 7, 8), File(staging, "sub/b.json").readBytes())
    }

    @Test
    fun `refuses to stage when a cache file is entirely missing`() {
        placeFinishedInCache()
        // Solo un file "arrivato": l'altro manca del tutto dalla cache.
        val slotB = store.slot(artifact.repo, artifact.revision, "sub/b.json")
        slotB.finished.delete()

        val outcome = TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        assertEquals(TalosVoiceModelActivation.Outcome.Incomplete("sub/b.json"), outcome)
    }

    /**
     * ⛔⛔ AL CONTRARIO, il caso che conta di più: un file TRONCATO (presente,
     * ma più corto del dichiarato) deve fermare la promozione come se
     * mancasse del tutto - non "quasi tutto" installato.
     */
    @Test
    fun `refuses to stage when a cache file is present but truncated`() {
        placeFinishedInCache(bytesA = byteArrayOf(1, 2)) // atteso 5 byte, ne scrive 2
        val outcome = TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        assertEquals(TalosVoiceModelActivation.Outcome.Incomplete("a.onnx"), outcome)
    }

    @Test
    fun `an incomplete stage leaves no partial staging directory behind`() {
        placeFinishedInCache(bytesA = byteArrayOf(1, 2))
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        val staging = File(File(externalFilesDir, "moss"), "Repo-Dir.staging")
        assertFalse("a failed stage must not leave a half-filled staging dir", staging.exists())
    }

    @Test
    fun `staging keeps the cache intact - it is still the source of truth until promote`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        val slotA = store.slot(artifact.repo, artifact.revision, "a.onnx")
        assertTrue("stage() must COPY, never move - the cache stays the witness", slotA.finished.isFile)
    }

    // ---- promote() -------------------------------------------------------

    @Test
    fun `promote with no prior version simply activates the staging`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        val outcome = TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")
        assertTrue(outcome is TalosVoiceModelActivation.Outcome.Activated)
        val active = File(File(externalFilesDir, "moss"), "Repo-Dir")
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), File(active, "a.onnx").readBytes())
        assertFalse("staging must be gone once promoted", File(active.parentFile, "Repo-Dir.staging").exists())
    }

    @Test
    fun `promote with an existing version moves the old one aside, never deletes it directly`() {
        val mossRoot = File(externalFilesDir, "moss")
        val active = File(mossRoot, "Repo-Dir").apply { mkdirs() }
        File(active, "old.onnx").writeBytes(byteArrayOf(9, 9))

        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")

        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), File(active, "a.onnx").readBytes())
        val previous = File(mossRoot, "Repo-Dir.previous")
        assertTrue("the old version must survive under .previous, not vanish", previous.isDirectory)
        assertArrayEquals(byteArrayOf(9, 9), File(previous, "old.onnx").readBytes())
    }

    @Test
    fun `promote without a staged directory fails loudly instead of activating nothing`() {
        val outcome = TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")
        assertEquals(TalosVoiceModelActivation.Outcome.Failed("no-staging"), outcome)
    }

    @Test
    fun `promoting a second version replaces the first, never merges the two`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")

        // Una seconda versione, diversa, arriva e viene promossa a sua volta.
        val artifact2 = artifact.copy(revision = "rev2", files = listOf(
            TalosVoiceModelManifest.Artifact.File("a.onnx", 1, "h".repeat(64)),
            artifact.files[1],
        ))
        val slotA2 = store.slot(artifact2.repo, artifact2.revision, "a.onnx")
        slotA2.finished.parentFile?.mkdirs()
        slotA2.finished.writeBytes(byteArrayOf(42))
        val slotB2 = store.slot(artifact2.repo, artifact2.revision, "sub/b.json")
        slotB2.finished.parentFile?.mkdirs()
        slotB2.finished.writeBytes(byteArrayOf(6, 7, 8))
        TalosVoiceModelActivation.stage(externalFilesDir, artifact2)
        val outcome = TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")

        assertTrue(outcome is TalosVoiceModelActivation.Outcome.Activated)
        val active = File(File(externalFilesDir, "moss"), "Repo-Dir")
        assertArrayEquals(byteArrayOf(42), File(active, "a.onnx").readBytes())
    }

    // ---- cleanupPrevious() ------------------------------------------------

    @Test
    fun `cleanupPrevious removes an orphaned previous directory`() {
        val previous = File(File(externalFilesDir, "moss"), "Repo-Dir.previous").apply { mkdirs() }
        File(previous, "x").writeText("x")
        assertTrue(TalosVoiceModelActivation.cleanupPrevious(externalFilesDir, "Repo-Dir"))
        assertFalse(previous.exists())
    }

    @Test
    fun `cleanupPrevious is a harmless no-op when there is nothing to clean`() {
        assertTrue(TalosVoiceModelActivation.cleanupPrevious(externalFilesDir, "Repo-Dir"))
    }

    // ---- recover() — la ripresa dopo un processo morto a metà -----------

    @Test
    fun `recover finishes an interrupted promotion left as only a staging directory`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        // Simula il processo morto FRA staging e promote: nessun promote() chiamato.
        val active = File(File(externalFilesDir, "moss"), "Repo-Dir")
        assertFalse("precondition: not yet active", active.exists())

        val outcome = TalosVoiceModelActivation.recover(externalFilesDir, "Repo-Dir")
        assertTrue(outcome is TalosVoiceModelActivation.Outcome.Activated)
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), File(active, "a.onnx").readBytes())
    }

    @Test
    fun `recover on an already-quiet installed state is a no-op that reports Activated`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")

        val outcome = TalosVoiceModelActivation.recover(externalFilesDir, "Repo-Dir")
        assertTrue(outcome is TalosVoiceModelActivation.Outcome.Activated)
    }

    @Test
    fun `recover with nothing installed at all reports Failed, not a false Activated`() {
        val outcome = TalosVoiceModelActivation.recover(externalFilesDir, "Repo-Dir")
        assertEquals(TalosVoiceModelActivation.Outcome.Failed("not-installed"), outcome)
    }

    @Test
    fun `recover also sweeps an orphaned previous left by a promotion that finished but never got cleaned`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")
        // Una promozione successiva lascia un .previous che il lease non ha mai ripulito.
        val mossRoot = File(externalFilesDir, "moss")
        val orphan = File(mossRoot, "Repo-Dir.previous").apply { mkdirs() }
        File(orphan, "leftover").writeText("x")

        TalosVoiceModelActivation.recover(externalFilesDir, "Repo-Dir")
        assertFalse("recover() must sweep an orphaned .previous, not just leave it forever", orphan.exists())
    }
}
