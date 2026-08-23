package ai.talos.voice

import ai.talos.voice.research.TalosVoiceB0CampaignConfig
import ai.talos.voice.research.TalosVoiceB0Probe
import ai.talos.voice.research.TalosVoiceB0Session
import ai.talos.voice.research.TalosVoiceRunMode
import ai.talos.voice.research.TalosVoiceTraceArtifactWriter
import android.content.Context
import android.os.Build
import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.MessageDigest
import kotlin.math.abs
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** B0's falsifiable gate: the normal singleton streaming door must produce the trace. */
@RunWith(AndroidJUnit4::class)
class TalosVoiceB0InstrumentedTest {

    @Test
    fun artifactReaderRejectsMalformedAndPartialPayloads() {
        val targetContext = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(targetContext.cacheDir, "talos-voice-b0-reader-${System.nanoTime()}").apply {
            mkdirs()
        }
        val artifactFile = File(directory, "voice-step-trace.raw.json")

        try {
            val config = TalosVoiceB0CampaignConfig(
                outputDirectory = directory,
                runId = "reader-validation",
                appCommit = "1".repeat(40),
                sourcePatchSha256 = "2".repeat(64),
                apkSha256 = "3".repeat(64),
                modelDecodeStepSha256 = "4".repeat(64),
                deviceFingerprint = "reader-validation/device",
                text = "Required field validation fixture.",
                voice = VOICE,
                seed = SEED,
                maxFrames = 1,
            )
            val validJson = JSONObject(
                TalosVoiceTraceArtifactWriter.writeAtomic(
                    artifactFile,
                    TalosVoiceB0Session(config).snapshot(),
                ).readText(Charsets.UTF_8),
            )
            val payloads = listOf(
                "malformed JSON" to "{\"schemaVersion\":1",
                "null required generatedAtUtc" to JSONObject(validJson.toString())
                    .put("generatedAtUtc", JSONObject.NULL)
                    .toString(),
            )

            for ((description, payload) in payloads) {
                artifactFile.writeText(payload, Charsets.UTF_8)
                val failure = runCatching { TalosVoiceTraceArtifactWriter.read(artifactFile) }.exceptionOrNull()
                assertNotNull("reader must reject $description", failure)
            }
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun productionSingletonWritesCompleteB0ArtifactThroughNormalStreamingDoor() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val targetContext = instrumentation.targetContext
        val session = TalosVoiceB0Session(campaignConfig(InstrumentationRegistry.getArguments(), targetContext))
        session.config.rawArtifactFile.delete()
        TalosVoiceHost.resetForTests()

        try {
            val host = TalosVoiceHost.get(targetContext)
            val warmup = host.speakStreamingBlocking("Ciao.", VOICE, 16, SEED)
            assertTrue("B0 warm-up must complete", !warmup.cancelled)
            assertTrue("an unarmed production call must not write B0", !session.config.rawArtifactFile.exists())

            TalosVoiceB0Probe.armNextProductionRun(session, TalosVoiceRunMode.T0)
            val t0Result = host.speakStreamingBlocking(LONG_TEXT_200_WORDS, VOICE, MAX_FRAMES, SEED)
            assertTrue("T0 must complete rather than analyze a partial run", !t0Result.cancelled)
            assertTrue("T0 playback must drain before its artifact is committed", t0Result.drainedWithinTimeout)

            assertTrue(
                "the normal production loop must write T0 itself",
                session.config.rawArtifactFile.isFile,
            )
            val productionArtifact = TalosVoiceTraceArtifactWriter.read(session.config.rawArtifactFile)
            assertEquals(listOf(TalosVoiceRunMode.T0), productionArtifact.runs.map { it.mode })

            TalosVoiceB0Probe.armNextProductionRun(session, TalosVoiceRunMode.T0_DIAGNOSTICS_OFF)
            val diagnosticsOffResult = host.speakStreamingBlocking(LONG_TEXT_200_WORDS, VOICE, MAX_FRAMES, SEED)
            assertTrue("T0 diagnostics-off must complete", !diagnosticsOffResult.cancelled)
            assertTrue("T0 diagnostics-off playback must drain", diagnosticsOffResult.drainedWithinTimeout)
            host.runB0ResearchModesBlocking(session)

            val artifact = TalosVoiceTraceArtifactWriter.read(session.config.rawArtifactFile)
            assertEquals(
                setOf(
                    TalosVoiceRunMode.T0,
                    TalosVoiceRunMode.T0_DIAGNOSTICS_OFF,
                    TalosVoiceRunMode.T1,
                    TalosVoiceRunMode.T2,
                    TalosVoiceRunMode.T3,
                ),
                artifact.runs.map { it.mode }.toSet(),
            )
            val steps = artifact.runs.flatMap { it.steps }
            assertTrue("B0 must contain per-frame traces", steps.isNotEmpty())
            assertTrue("partial or cancelled B0 runs are not evidence", artifact.runs.none { it.cancelled })
            val fixedSequence = artifact.runs.single { it.mode == TalosVoiceRunMode.T1 }
            assertTrue(
                "all five same-seed modes must preserve the identical frame sequence",
                artifact.runs.all {
                    it.generatedFrameCount == fixedSequence.generatedFrameCount &&
                        it.frameSha256 == fixedSequence.frameSha256
                },
            )
            assertTrue(
                "every TTS step must retain literal non-negative phase clocks and the exact residual",
                steps.all {
                    it.localSampleNs >= 0L &&
                        it.localOrtRunNs in 0L..it.localSampleNs &&
                        it.callbackNs >= 0L &&
                        it.globalInputPrepNs >= 0L &&
                        it.globalDecodeNs >= 0L &&
                        it.kvTransitionNs >= 0L &&
                        it.totalStepNs == it.localSampleNs + it.callbackNs + it.globalInputPrepNs +
                        it.globalDecodeNs + it.kvTransitionNs + it.residualNs &&
                        it.rollingRtf16.isFinite() && it.rollingRtf16 > 0.0 &&
                        it.javaHeapBytes > 0L && it.nativeHeapBytes >= 0L
                },
            )
            assertTrue(
                "the five named phases must reconcile with independently measured totalStepNs",
                steps.all { abs(it.residualNs) <= artifact.phaseAccountingToleranceNs },
            )

            val t1 = artifact.runs.single { it.mode == TalosVoiceRunMode.T1 }
            val t2 = artifact.runs.single { it.mode == TalosVoiceRunMode.T2 }
            assertEquals("T2 must replay every exact T1 frame", t1.generatedFrameCount, t2.generatedFrameCount)
            assertEquals("T2 frame bytes must be identical to T1", t1.frameSha256, t2.frameSha256)
            assertTrue("T1 is autoregressive-only", t1.codecBatches.isEmpty())
            assertTrue("T2 is replay-only and must contain no TTS steps", t2.steps.isEmpty())
            for (mode in listOf(TalosVoiceRunMode.T0, TalosVoiceRunMode.T0_DIAGNOSTICS_OFF, TalosVoiceRunMode.T2)) {
                val run = artifact.runs.single { it.mode == mode }
                assertEquals(
                    "$mode codec batches must cover every generated frame exactly once",
                    run.generatedFrameCount,
                    run.codecBatches.sumOf { it.frameCount },
                )
            }
            assertTrue(artifact.runs.single { it.mode == TalosVoiceRunMode.T0 }.diagnosticsEnabled)
            assertTrue(!artifact.runs.single { it.mode == TalosVoiceRunMode.T0_DIAGNOSTICS_OFF }.diagnosticsEnabled)

            val t3 = artifact.runs.single { it.mode == TalosVoiceRunMode.T3 }
            assertTrue("profiled timing must remain qualification-only", t3.qualificationOnly)
            val profiles = t3.ortProfiles
            assertNotNull("T3 must return all three TTS profiles", profiles)
            assertTrue(profiles!!.prefill.isFile)
            assertTrue(profiles.decodeStep.isFile)
            assertTrue(profiles.localFixedSampledFrame.isFile)
        } finally {
            TalosVoiceB0Probe.disarm()
            TalosVoiceHost.resetForTests()
        }
    }

    private fun campaignConfig(arguments: Bundle, context: Context): TalosVoiceB0CampaignConfig {
        assertEquals("the fixed B0 input must remain exactly 200 words", EXPECTED_WORD_COUNT, wordCount(LONG_TEXT_200_WORDS))
        val root = TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
        assertTrue("B0 requires the installed TALOS voice model: ${TalosVoiceModelManager.describeMissing(root)}", TalosVoiceModelManager.isPresent(root))
        val manifestPath = TalosMossManifest.resolveManifestPath(root)
        val manifestDir = manifestPath.parentFile ?: root
        val manifest = TalosMossManifest.fromJson(TalosMossManifest.readJson(manifestPath))
        val ttsMetaPath = TalosMossManifest.resolveManifestRelativePath(manifestDir, manifest.modelFiles.ttsMeta)
        val ttsMeta = TalosMossTtsMeta.fromJson(TalosMossManifest.readJson(ttsMetaPath))
        val decodeStep = File(ttsMetaPath.parentFile, ttsMeta.decodeStepFile)
        val output = File(context.getExternalFilesDir(null), "research/local-backend").apply { mkdirs() }

        return TalosVoiceB0CampaignConfig(
            outputDirectory = output,
            runId = requireArgument(arguments, "talosRunId"),
            appCommit = requireArgument(arguments, "talosAppCommit"),
            sourcePatchSha256 = arguments.getString("talosSourcePatchSha256")?.takeIf(String::isNotBlank),
            apkSha256 = requireArgument(arguments, "talosApkSha256"),
            modelDecodeStepSha256 = sha256(decodeStep),
            deviceFingerprint = Build.FINGERPRINT,
            text = LONG_TEXT_200_WORDS,
            voice = VOICE,
            seed = SEED,
            maxFrames = MAX_FRAMES,
        )
    }

    private fun requireArgument(arguments: Bundle, name: String): String =
        requireNotNull(arguments.getString(name)?.takeIf(String::isNotBlank)) {
            "missing required instrumentation argument: $name"
        }

    private fun wordCount(text: String): Int = text.trim().split(Regex("\\s+")).size

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private companion object {
        const val EXPECTED_WORD_COUNT = 200
        const val MAX_FRAMES = 375
        const val SEED = 777L
        const val VOICE = "Junhao"

        val LONG_TEXT_200_WORDS = """
            Questa lettura lunga misura il comportamento della voce neurale mentre racconta una giornata tranquilla nella città dopo la pioggia estiva.
            Le persone attraversano lentamente la piazza, osservano le vetrine illuminate e parlano dei programmi preparati per la sera insieme domani.
            Un autobus arriva puntuale, apre le porte, accoglie nuovi passeggeri e riparte seguendo il viale alberato verso nord senza fretta.
            Dalle finestre aperte escono profumi di pane, caffè e spezie, mescolati al rumore leggero delle biciclette sul selciato ancora bagnato.
            Nel parco vicino alcuni bambini inventano giochi complicati, mentre gli adulti leggono, conversano oppure ascoltano musica seduti sulle panchine verdi.
            Più tardi il cielo diventa chiaro e le nuvole si aprono, lasciando passare una luce morbida sopra i tetti antichi.
            Un negoziante sistema con cura i libri, controlla i prezzi e saluta ogni cliente con un sorriso sincero e paziente.
            Intanto una studentessa prende appunti, confronta due mappe e decide quale strada seguire per raggiungere la biblioteca prima della chiusura.
            Quando arriva la sera, le lampade si accendono gradualmente e il traffico rallenta, creando un ritmo più regolare e silenzioso.
            Questa storia continua senza interruzioni, con frasi abbastanza varie da verificare stabilità, ritmo, memoria, latenza e continuità durante tutta l'esecuzione.
        """.trimIndent().replace('\n', ' ')
    }
}
