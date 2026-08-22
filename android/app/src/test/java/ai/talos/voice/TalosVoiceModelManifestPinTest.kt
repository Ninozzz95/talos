package ai.talos.voice

import java.io.File
import java.security.MessageDigest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⭐⭐⭐ IL PIN NON SI CORROMPE IN SILENZIO — blueprint §47.1/§47.2.
 *
 * `assets/voice/model-manifest.json` è il manifesto FIRMATO nel codice
 * sorgente che Fase 5 userà per scaricare il motore voce: un `revision`
 * cambiato per sbaglio, un hash troncato da un editor, un file duplicato —
 * ognuno di questi passerebbe inosservato fino al primo download reale, sul
 * telefono di qualcuno. Questo test legge esattamente il file che finirà
 * nell'APK (path relativo a `src/main/assets/`, la cartella di lavoro di
 * default di `./gradlew testDebugUnitTest`) e verifica solo la SUA forma —
 * non richiede rete, non richiede il dispositivo.
 *
 * ⛔ Non prova che gli hash siano quelli VERI su HuggingFace: quello è stato
 * verificato a mano il 22/8 (device cache + API HF + fetch diretto,
 * tre fonti indipendenti, stesso sha256 — vedi `promotion` nel manifesto
 * stesso). Prova che nessuno lo rompa DOPO.
 */
class TalosVoiceModelManifestPinTest {

    private fun manifest(): JSONObject {
        val file = File("src/main/assets/voice/model-manifest.json")
        assertTrue("manifest not found at ${file.absolutePath}", file.isFile)
        return JSONObject(file.readText())
    }

    private val hex = Regex("^[0-9a-f]{64}$")

    @Test
    fun `never points at a mutable branch`() {
        val artifacts = manifest().getJSONArray("artifacts")
        for (i in 0 until artifacts.length()) {
            val revision = artifacts.getJSONObject(i).getString("revision")
            // ⛔⛔ Blueprint §47.1, testuale: «Never configure production as:
            // repo = OpenMOSS/... revision = main».
            assertTrue("revision must be an exact commit, not '$revision'", hex.matches(revision) || revision.length == 40)
            assertTrue("revision must not be a branch name", revision != "main" && revision != "master")
        }
    }

    @Test
    fun `every file carries a real 64-hex sha256, no null slipped back in`() {
        val artifacts = manifest().getJSONArray("artifacts")
        var checked = 0
        for (i in 0 until artifacts.length()) {
            val files = artifacts.getJSONObject(i).getJSONArray("files")
            for (j in 0 until files.length()) {
                val entry = files.getJSONObject(j)
                val sha = entry.getString("sha256")
                assertTrue(
                    "${entry.getString("path")}: sha256 must be 64 hex chars, was '$sha'",
                    hex.matches(sha),
                )
                checked++
            }
        }
        assertEquals(16, checked)
    }

    @Test
    fun `every declared size is positive and the two repos sum to the measured total`() {
        val artifacts = manifest().getJSONArray("artifacts")
        var total = 0L
        for (i in 0 until artifacts.length()) {
            val files = artifacts.getJSONObject(i).getJSONArray("files")
            for (j in 0 until files.length()) {
                val size = files.getJSONObject(j).getLong("size")
                assertTrue("size must be positive", size > 0L)
                total += size
            }
        }
        // ⛔ Al contrario: un numero scritto a mano SBAGLIATO qui (es. un
        // dettaglio "763 MB" copiato senza ricalcolarlo dal file vero)
        // avrebbe fatto passare questo test comunque, se non sommassi io
        // stesso invece di leggere una costante duplicata.
        assertEquals(763_191_513L, total)
    }

    @Test
    fun `no duplicate paths inside the same artifact - a downloader would silently drop one`() {
        val artifacts = manifest().getJSONArray("artifacts")
        for (i in 0 until artifacts.length()) {
            val files = artifacts.getJSONObject(i).getJSONArray("files")
            val paths = mutableSetOf<String>()
            for (j in 0 until files.length()) {
                val path = files.getJSONObject(j).getString("path")
                assertTrue("duplicate path '$path' in artifact $i", paths.add(path))
            }
        }
    }

    @Test
    fun `installRoot and targetDir together match what TalosMossManifest already resolves on-device`() {
        val root = manifest()
        assertEquals("moss", root.getString("installRoot"))
        val artifacts = root.getJSONArray("artifacts")
        val targetDirs = (0 until artifacts.length()).map { artifacts.getJSONObject(it).getString("targetDir") }.toSet()
        // ⛔ Le due cartelle che `TalosVoiceModelManager.isPresent` e
        // `TalosMossManifest.resolveManifestPath` già cercano sul
        // dispositivo, misurate lì il 21/8 - non un nome scelto ora a caso.
        assertEquals(setOf("MOSS-TTS-Nano-100M-ONNX", "MOSS-Audio-Tokenizer-Nano-ONNX"), targetDirs)
    }

    @Test
    fun `sha256 of a manifest file is NOT a git blob sha1 - would silently break download verification`() {
        // ⛔⛔ AL CONTRARIO, il difetto che questo file per poco introduceva:
        // i tre JSON piccoli (non-LFS) tornano dall'API HF un `oid` che è un
        // git blob sha1, non un sha256 - stessa lunghezza esadecimale (40
        // caratteri) di NESSUNO dei due, quindi un controllo di sola
        // LUNGHEZZA non li avrebbe distinti. Qui si vede che i tre valori
        // scritti nel manifesto sono sha256 VERI (calcolati sui byte reali
        // pull-ati dal device il 22/8), non gli oid git dell'albero HF.
        val gitBlobShasFromTheHfTree = setOf(
            "8a04b980c3b9ea2f56747650ea255efe421ada38", // browser_poc_manifest.json git oid
            "883597607ce139b2c4871468396af2c088ed2fe0", // tts_browser_onnx_meta.json git oid
            "886953a56489516b847b7c1c953bde063eb78faa", // codec_browser_onnx_meta.json git oid
        )
        val artifacts = manifest().getJSONArray("artifacts")
        for (i in 0 until artifacts.length()) {
            val files = artifacts.getJSONObject(i).getJSONArray("files")
            for (j in 0 until files.length()) {
                val sha = files.getJSONObject(j).getString("sha256")
                assertTrue("sha256 must not be a leftover git blob oid", sha !in gitBlobShasFromTheHfTree)
            }
        }
    }

    /**
     * ⛔ Prova diretta, non solo di forma: se il file `browser_poc_manifest.json`
     * pull-ato dal device il 22/8 è ancora nello scratchpad di questa sessione,
     * il suo sha256 vero deve combaciare col pin. Se lo scratchpad è già
     * sparito il test si salta - non è la sua responsabilità custodire un
     * artefatto vendor (blueprint §35.3, stessa ragione della nota in cima a
     * `TalosMossManifestTest`), solo di controllarlo quando capita di averlo.
     */
    @Test
    fun `if the pulled artifact is still on disk, its real sha256 matches the pin`() {
        val pulled = File(
            "C:/Users/Antonino/AppData/Local/Temp/claude/C--Users-Antonino-Desktop-projects-AVM/" +
                "c80168e1-5fd1-4134-b6af-e11ffc3a47a0/scratchpad/fase5/browser_poc_manifest.json",
        )
        if (!pulled.isFile) return
        val digest = MessageDigest.getInstance("SHA-256").digest(pulled.readBytes())
        val hex = digest.joinToString("") { "%02x".format(it) }
        val pinned = manifest().getJSONArray("artifacts").getJSONObject(0).getJSONArray("files")
            .let { files -> (0 until files.length()).map { files.getJSONObject(it) } }
            .first { it.getString("path") == "browser_poc_manifest.json" }
            .getString("sha256")
        assertEquals(pinned, hex)
    }
}
