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
    fun `install root and target path are explicit while cache lookup keeps the remote source path`() {
        val pocketArtifact = TalosVoiceModelManifest.Artifact(
            repo = "Org/Pocket",
            revision = "rev-pocket",
            targetDir = "italian",
            files = listOf(
                TalosVoiceModelManifest.Artifact.File(
                    path = "onnx/italian/model.onnx",
                    size = 3,
                    sha256 = "a".repeat(64),
                    targetPath = "model.onnx",
                ),
            ),
        )
        val slot = store.slot("Org/Pocket", "rev-pocket", "onnx/italian/model.onnx")
        slot.finished.parentFile?.mkdirs()
        slot.finished.writeBytes(byteArrayOf(7, 8, 9))

        val outcome = TalosVoiceModelActivation.stage(externalFilesDir, "pocket", pocketArtifact)

        assertTrue(outcome is TalosVoiceModelActivation.Outcome.Activated)
        val staging = (outcome as TalosVoiceModelActivation.Outcome.Activated).targetDir
        assertEquals(File(externalFilesDir, "pocket/italian.staging").canonicalFile, staging.canonicalFile)
        assertArrayEquals(byteArrayOf(7, 8, 9), File(staging, "model.onnx").readBytes())
        assertFalse(File(staging, "onnx/italian/model.onnx").exists())
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

        val outcome = TalosVoiceModelActivation.recover(externalFilesDir, artifact)
        assertTrue(outcome is TalosVoiceModelActivation.Outcome.Activated)
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), File(active, "a.onnx").readBytes())
    }

    @Test
    fun `recover on an already-quiet installed state is a no-op that reports Activated`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")

        val outcome = TalosVoiceModelActivation.recover(externalFilesDir, artifact)
        assertTrue(outcome is TalosVoiceModelActivation.Outcome.Activated)
    }

    @Test
    fun `recover with nothing installed at all reports Failed, not a false Activated`() {
        val outcome = TalosVoiceModelActivation.recover(externalFilesDir, artifact)
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

        TalosVoiceModelActivation.recover(externalFilesDir, artifact)
        assertFalse("recover() must sweep an orphaned .previous, not just leave it forever", orphan.exists())
    }

    // ---- cleanupSourceCache() — trovato 22/8: gli ONNX comparivano nel
    // picker dei modelli LLM del composer, perché stage() COPIA (mai
    // sposta) e nessuno ripuliva la cache generica dopo. ------------------

    @Test
    fun `cleanupSourceCache removes every cache file of the artifact, once promotion is certain`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")
        val slotA = store.slot(artifact.repo, artifact.revision, "a.onnx")
        val slotB = store.slot(artifact.repo, artifact.revision, "sub/b.json")
        assertTrue("precondition: stage() copies, the cache still has both files", slotA.finished.isFile && slotB.finished.isFile)

        TalosVoiceModelActivation.cleanupSourceCache(externalFilesDir, artifact)

        assertFalse("the voice engine's cache copy must be gone once it is safely active in moss/", slotA.finished.exists())
        assertFalse(slotB.finished.exists())
        // La cartella dell'artivo attivo non deve muoversi: la pulizia tocca SOLO la cache generica.
        val active = File(File(externalFilesDir, "moss"), "Repo-Dir")
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), File(active, "a.onnx").readBytes())
    }

    @Test
    fun `cleanupSourceCache prunes the now-empty repo-revision directories, but never touches models-root itself`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")
        val modelsRoot = File(externalFilesDir, "models")
        assertTrue("precondition: the cache tree exists before cleanup", modelsRoot.isDirectory)

        TalosVoiceModelActivation.cleanupSourceCache(externalFilesDir, artifact)

        val repoDir = File(modelsRoot, "Org/Repo")
        assertFalse("an empty repo/revision directory tree left behind is exactly the leftover this cure exists to remove", repoDir.exists())
        assertTrue("models/ itself is the root shared with real GGUFs - it must survive even empty", modelsRoot.isDirectory)
    }

    @Test
    fun `cleanupSourceCache never touches a sibling repo's real GGUF sharing the same models root`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")
        // Un GGUF vero, di un tutto altro repository, nella stessa cache generica.
        val llmSlot = store.slot("ggml-org/Other-Model", "revX", "model.gguf")
        llmSlot.finished.parentFile?.mkdirs()
        llmSlot.finished.writeBytes(byteArrayOf(1))

        TalosVoiceModelActivation.cleanupSourceCache(externalFilesDir, artifact)

        assertTrue("cleaning the voice artifact's cache must never remove an unrelated model", llmSlot.finished.isFile)
    }

    @Test
    fun `cleanupSourceCache is idempotent - calling it twice is a harmless no-op the second time`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")
        TalosVoiceModelActivation.cleanupSourceCache(externalFilesDir, artifact)
        // La seconda chiamata non deve lanciare, ne' su un file gia' assente ne' su cartelle gia' sparite.
        TalosVoiceModelActivation.cleanupSourceCache(externalFilesDir, artifact)
        assertFalse(store.slot(artifact.repo, artifact.revision, "a.onnx").finished.exists())
    }

    @Test
    fun `recover also sweeps the generic cache when it finishes an interrupted promotion`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        // Processo morto fra staging e promote, come nell'altro test di questa forma.
        val slotA = store.slot(artifact.repo, artifact.revision, "a.onnx")
        assertTrue("precondition: cache still holds the file before recover", slotA.finished.isFile)

        TalosVoiceModelActivation.recover(externalFilesDir, artifact)

        assertFalse("recover() completing a promotion must also free the cache it copied from", slotA.finished.exists())
    }

    /**
     * ⛔⛔ Il caso che conta di più per chi ha GIA' installato il motore
     * voce PRIMA di questa cura: `recover()` gira a ogni avvio anche
     * quando non c'è niente da promuovere (il ramo "quieto"), ed è
     * l'UNICA occasione per ripulire una cache vecchia lasciata da una
     * build precedente - nessun altro percorso la tocca mai più.
     */
    @Test
    fun `recover sweeps a stale generic cache left by an activation that predates this cure, even when already quiet`() {
        placeFinishedInCache()
        TalosVoiceModelActivation.stage(externalFilesDir, artifact)
        TalosVoiceModelActivation.promote(externalFilesDir, "Repo-Dir")
        // Simula una build vecchia: attivo già promosso, cache generica MAI ripulita.
        val slotA = store.slot(artifact.repo, artifact.revision, "a.onnx")
        assertTrue("precondition: this mirrors an install made before the cure existed", slotA.finished.isFile)

        TalosVoiceModelActivation.recover(externalFilesDir, artifact)

        assertFalse("a device with a pre-cure install must self-heal at the next launch, not stay leaking forever", slotA.finished.exists())
    }
}
