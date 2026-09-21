package ai.talos.voice

import ai.talos.TalosThermal
import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketFrame
import ai.talos.voice.pocket.TalosPocketOrtRuntime
import ai.talos.voice.pocket.TalosPocketStageMetric
import ai.talos.voice.research.TalosVoiceB0Probe
import ai.talos.voice.research.TalosVoiceB0Session
import ai.talos.voice.research.TalosVoiceDiagnosticAnswers
import ai.talos.voice.research.TalosVoiceDiagnosticEvent
import ai.talos.voice.research.TalosVoiceDiagnosticEventKind
import ai.talos.voice.research.TalosVoiceDiagnosticOutcome
import ai.talos.voice.research.TalosVoiceDiagnosticProbe
import ai.talos.voice.research.TalosVoiceDiagnosticRoute
import ai.talos.voice.research.TalosVoiceDiagnosticSession
import ai.talos.voice.research.TalosVoiceOrtProfiling
import ai.talos.voice.research.TalosVoicePhase
import ai.talos.voice.research.TalosVoiceProductionTrace
import ai.talos.voice.research.TalosVoiceRunTrace
import ai.talos.voice.research.TalosVoiceRunMode
import ai.talos.voice.research.TalosVoiceTraceArtifact
import ai.talos.voice.research.TalosVoiceTraceRecorder
import android.content.Context
import android.os.SystemClock
import android.util.Log
import java.io.Closeable
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONObject

/**
 * The single owner of TALOS's mutable neural voice state (blueprint §14).
 * Model session creation, tokenizer loading, prefill/decode, and runtime
 * close all happen on one dedicated thread — never on a caller's thread,
 * never concurrently with each other. `AudioTrack` writing (Phase 2) may get
 * its own writer thread, but ownership and completion still route through
 * here.
 *
 * Invariant §6: both the tokenizer and the runtime are opened lazily, on
 * first use, on the owner lane — not in this constructor. Nothing neural
 * loads just because a [TalosVoiceHost] exists.
 */
internal class TalosVoiceHost(
    private val modelRoot: File,
    // ⭐⭐⭐ Owner 22/8, «stutter molto pesanti» confermato dal vivo: la
    // serie temporale in driveStreamingSynthesis() misura `leadSeconds`
    // fisso a 0.000 per QUASI OGNI batch su un testo lungo, con un
    // hardwareUnderrun quasi a ogni singolo giro - un deficit SOSTENUTO,
    // non jitter (§16 doc sotto). ⛔ `TalosMossRuntime.open()` passa questo
    // stesso valore a `setIntraOpNumThreads` (TalosMossRuntime.kt): il
    // "batch=8 → 0 underrun" storico è stato misurato SOLO con
    // `cpuThreads = 4` - ogni test strumentato in questo repo che apre un
    // `TalosVoiceHost` lo passa esplicitamente, e `TalosNeuralVoicePlugin`
    // usa lo stesso 4 per l'arruolamento. La produzione (TalosVoiceHost.get)
    // non lo passava mai: girava a 2, la metà del parallelismo intra-op
    // realmente validato. Il Pad 3 ha 8 core (adb cpuinfo) - 4 lascia
    // margine reale per thread audio/UI/decodifica, non li satura.
    private val cpuThreads: Int = 4,
    // ⛔ Solo per la diagnosi termica (§16 sotto) - nullo nei test
    // strumentati esistenti, che non lo passano: `TalosThermal.read(null)`
    // torna `UNKNOWN` invece di inventare uno stato, esattamente il
    // contratto che quella classe già dichiara.
    private val appContext: Context? = null,
    private val pocketModelStatusProvider: (() -> TalosPocketModelStatus)? = null,
    private val pocketRuntimeFactory: (File, Int) -> TalosPocketHostRuntimeContract = { root, threads ->
        TalosPocketOrtRuntimeAdapter(TalosPocketOrtRuntime.open(root, threads))
    },
    private val pcmPlayerFactory: (Int, Int) -> TalosPcmPlayer = { sampleRate, channels ->
        TalosPcmPlayer(sampleRate, channels)
    },
) : Closeable {
    private val owner = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "talos-voice-owner").apply { priority = Thread.NORM_PRIORITY }
    }
    private val playbackCompletion = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "talos-voice-playback-completion").apply { priority = Thread.NORM_PRIORITY }
    }

    private val generationCounter = AtomicLong(0)
    private val queueGate = TalosVoiceQueueGate(generationCounter)

    // Owner-lane only past this point - never read or written from any other thread -
    // EXCEPT player, which cancel() below reads from the calling thread on purpose.
    private var runtime: TalosMossRuntime? = null
    private var tokenizer: TalosVoiceTokenizer? = null
    private var pocketRuntime: TalosPocketHostRuntimeContract? = null
    private var pocketRuntimeRoot: File? = null
    private var pocketModelStatusSnapshot: TalosPocketModelStatusSnapshot? = null
    private var mossCodecFingerprint: String? = null
    @Volatile private var player: TalosPcmPlayer? = null
    private var playerSampleRate: Int? = null
    private var playerChannels: Int? = null
    @Volatile private var activeDiagnosticSession: TalosVoiceDiagnosticSession? = null

    /**
     * Starts a synthesis on the owner lane and returns immediately with the
     * generation id that now owns "active". `onComplete` runs on the owner
     * lane too, after the generation either finishes or is cancelled -
     * [TalosMossSynthesisResult.cancelled] tells the two apart. A stale
     * generation invalidated by a later [submitSpeak] or [cancel] call still
     * runs onComplete; it does not get silently dropped.
     */
    fun submitSpeak(
        text: String,
        voice: String,
        outputFile: File,
        maxFrames: Int? = null,
        seed: Long? = null,
        onComplete: (Result<TalosMossSynthesisResult>) -> Unit = {},
    ): Long {
        val ticket = queueGate.submit(TalosVoiceQueueMode.FLUSH)
        val id = ticket.id
        owner.execute {
            val result = runCatching { runSpeak(id, text, voice, outputFile, maxFrames, seed) }
            onComplete(result)
        }
        return id
    }

    /** Convenience for tests and for any caller that has nothing else to do while it waits. */
    fun speakBlocking(
        text: String,
        voice: String,
        outputFile: File,
        maxFrames: Int? = null,
        seed: Long? = null,
    ): TalosMossSynthesisResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosMossSynthesisResult>? = null
        submitSpeak(text, voice, outputFile, maxFrames, seed) { result ->
            outcome = result
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Fase 2's real path: text in, spoken audio out through [TalosPcmPlayer]
     * as it becomes available - §16.1's loop end to end. `onComplete`
     * carries [TalosVoiceStreamResult.cancelled] and
     * [TalosVoiceStreamResult.ttfaMs] (submit-to-first-`write()`, not
     * confirmed-audible - see the field doc).
     */
    fun submitSpeakStreaming(
        text: String,
        voice: String,
        maxFrames: Int? = null,
        seed: Long? = null,
        diagnosticRoute: TalosVoiceDiagnosticRoute? = null,
        onComplete: (Result<TalosVoiceStreamResult>) -> Unit = {},
    ): Long {
        val ticket = queueGate.submit(TalosVoiceQueueMode.FLUSH)
        val id = ticket.id
        owner.execute {
            val result = runCatching { runSpeakStreaming(id, text, voice, maxFrames, seed, diagnosticRoute) }
            onComplete(result)
        }
        return id
    }

    /** Convenience for tests: blocks until the utterance has both finished generating and finished playing. */
    fun speakStreamingBlocking(
        text: String,
        voice: String,
        maxFrames: Int? = null,
        seed: Long? = null,
        diagnosticRoute: TalosVoiceDiagnosticRoute? = null,
    ): TalosVoiceStreamResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosVoiceStreamResult>? = null
        submitSpeakStreaming(text, voice, maxFrames, seed, diagnosticRoute) { result ->
            outcome = result
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Fase 4's door for the plugin: same streaming path as
     * [submitSpeakStreaming], with an enrolled personal profile's
     * `promptAudioCodes` (§15.1's `generateAudioTokensWithReference`)
     * standing in for a builtin voice name. The caller (the plugin) owns
     * loading the profile from disk - this class stays unaware of
     * [TalosVoiceProfileStore]/`Context`, same separation of concerns
     * [TalosMossRuntime.generateAudioTokensWithReference] already keeps one
     * level down: audio codes in, no knowledge of where they came from.
     */
    fun submitSpeakStreamingWithReference(
        text: String,
        promptAudioCodes: List<IntArray>,
        maxFrames: Int? = null,
        seed: Long? = null,
        diagnosticRoute: TalosVoiceDiagnosticRoute? = null,
        queueMode: TalosVoiceQueueMode = TalosVoiceQueueMode.FLUSH,
        onComplete: (Result<TalosVoiceStreamResult>) -> Unit = {},
    ): Long {
        val ticket = queueGate.submit(queueMode)
        val id = ticket.id
        owner.execute {
            val result = if (queueMode == TalosVoiceQueueMode.ADD && !queueGate.claim(ticket)) {
                Result.success(cancelledBeforeStart())
            } else {
                runCatching {
                    runSpeakStreamingWithReference(id, text, promptAudioCodes, maxFrames, seed, diagnosticRoute)
                }
            }
            onComplete(result)
        }
        return id
    }

    /** Convenience for tests, same shape as [speakStreamingBlocking]. */
    fun speakStreamingWithReferenceBlocking(
        text: String,
        promptAudioCodes: List<IntArray>,
        maxFrames: Int? = null,
        seed: Long? = null,
        diagnosticRoute: TalosVoiceDiagnosticRoute? = null,
    ): TalosVoiceStreamResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosVoiceStreamResult>? = null
        submitSpeakStreamingWithReference(text, promptAudioCodes, maxFrames, seed, diagnosticRoute) { result ->
            outcome = result
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Builds a new Pocket V2 conditioning profile on the same owner lane as
     * every production ORT session. A build is a FLUSH operation: it cannot
     * overlap synthesis, and a later speak/build/cancel invalidates it at
     * the next measured phase or Pocket graph boundary.
     */
    fun submitBuildPocketEnrollmentProfile(
        acceptedPhrases: List<TalosVoiceCaptureResult>,
        displayName: String,
        language: String,
        style: String,
        consentVersion: Int,
        onComplete: (Result<TalosVoiceEnrollmentBuildResult>) -> Unit = {},
    ): Long {
        val ticket = queueGate.submit(TalosVoiceQueueMode.FLUSH)
        val id = ticket.id
        owner.execute {
            val result = runCatching {
                runBuildPocketEnrollmentProfile(
                    id = id,
                    acceptedPhrases = acceptedPhrases,
                    displayName = displayName,
                    language = language,
                    style = style,
                    consentVersion = consentVersion,
                )
            }
            onComplete(result)
        }
        return id
    }

    internal fun buildPocketEnrollmentProfileBlocking(
        acceptedPhrases: List<TalosVoiceCaptureResult>,
        displayName: String,
        language: String,
        style: String,
        consentVersion: Int,
    ): TalosVoiceEnrollmentBuildResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosVoiceEnrollmentBuildResult>? = null
        submitBuildPocketEnrollmentProfile(
            acceptedPhrases = acceptedPhrases,
            displayName = displayName,
            language = language,
            style = style,
            consentVersion = consentVersion,
        ) { result ->
            outcome = result
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Production personal-voice door for a V2 profile. Unlike the legacy
     * reference-only method, this immutable request carries the selected
     * profile and locale all the way to the backend router. Pocket remains
     * primary only when its pinned bundle verifies; MOSS is an explicit,
     * observable pre-audio fallback.
     */
    fun submitSpeakStreamingWithProfile(
        text: String,
        locale: String,
        profile: TalosVoiceProfileV2,
        maxFrames: Int? = null,
        seed: Long? = null,
        diagnosticRoute: TalosVoiceDiagnosticRoute? = null,
        queueMode: TalosVoiceQueueMode = TalosVoiceQueueMode.FLUSH,
        onComplete: (Result<TalosVoiceStreamResult>) -> Unit = {},
    ): Long {
        val ticket = queueGate.submit(queueMode)
        val id = ticket.id
        owner.execute {
            var completionEnqueued = false
            val result = if (queueMode == TalosVoiceQueueMode.ADD && !queueGate.claim(ticket)) {
                Result.success(cancelledBeforeStart())
            } else {
                runCatching {
                    runSpeakStreamingWithProfile(
                        id = id,
                        text = text,
                        locale = locale,
                        profile = profile,
                        maxFrames = maxFrames,
                        seed = seed,
                        diagnosticRoute = diagnosticRoute,
                        playbackEpoch = ticket.playbackEpoch,
                        onPlaybackPending = { pending ->
                            enqueuePlaybackCompletion(pending, onComplete)
                            completionEnqueued = true
                        },
                    )
                }
            }
            if (!completionEnqueued) onComplete(result)
        }
        return id
    }

    internal fun speakStreamingWithProfileBlocking(
        text: String,
        locale: String,
        profile: TalosVoiceProfileV2,
        maxFrames: Int? = null,
        seed: Long? = null,
        diagnosticRoute: TalosVoiceDiagnosticRoute? = null,
    ): TalosVoiceStreamResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosVoiceStreamResult>? = null
        submitSpeakStreamingWithProfile(text, locale, profile, maxFrames, seed, diagnosticRoute) { result ->
            outcome = result
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Sole production door for a profile loaded from encrypted storage.
     * Current profiles take the ordinary V2 route. Legacy profiles are
     * converted on this same owner lane and remain V1 until the requested
     * utterance has completed through Pocket without fallback.
     */
    fun submitSpeakStreamingWithStoredProfile(
        text: String,
        locale: String,
        storedProfile: TalosStoredVoiceProfile,
        migrationCommitter: TalosVoiceProfileMigrationCommitter,
        maxFrames: Int? = null,
        seed: Long? = null,
        diagnosticRoute: TalosVoiceDiagnosticRoute? = null,
        queueMode: TalosVoiceQueueMode = TalosVoiceQueueMode.FLUSH,
        onComplete: (Result<TalosVoiceStreamResult>) -> Unit = {},
    ): Long {
        val ticket = queueGate.submit(queueMode)
        val id = ticket.id
        owner.execute {
            var completionEnqueued = false
            val result = if (queueMode == TalosVoiceQueueMode.ADD && !queueGate.claim(ticket)) {
                Result.success(cancelledBeforeStart())
            } else {
                runCatching {
                    when (storedProfile) {
                        is TalosStoredVoiceProfile.Current -> runSpeakStreamingWithProfile(
                            id = id,
                            text = text,
                            locale = locale,
                            profile = storedProfile.profile,
                            maxFrames = maxFrames,
                            seed = seed,
                            diagnosticRoute = diagnosticRoute,
                            playbackEpoch = ticket.playbackEpoch,
                            onPlaybackPending = { pending ->
                                enqueuePlaybackCompletion(pending, onComplete)
                                completionEnqueued = true
                            },
                        )
                        is TalosStoredVoiceProfile.Legacy -> runSpeakStreamingWithLegacyProfile(
                            id = id,
                            text = text,
                            locale = locale,
                            legacy = storedProfile.profile,
                            migrationCommitter = migrationCommitter,
                            maxFrames = maxFrames,
                            seed = seed,
                            diagnosticRoute = diagnosticRoute,
                        )
                    }
                }
            }
            if (!completionEnqueued) onComplete(result)
        }
        return id
    }

    internal fun speakStreamingWithStoredProfileBlocking(
        text: String,
        locale: String,
        storedProfile: TalosStoredVoiceProfile,
        migrationCommitter: TalosVoiceProfileMigrationCommitter,
        maxFrames: Int? = null,
        seed: Long? = null,
        diagnosticRoute: TalosVoiceDiagnosticRoute? = null,
    ): TalosVoiceStreamResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosVoiceStreamResult>? = null
        submitSpeakStreamingWithStoredProfile(
            text = text,
            locale = locale,
            storedProfile = storedProfile,
            migrationCommitter = migrationCommitter,
            maxFrames = maxFrames,
            seed = seed,
            diagnosticRoute = diagnosticRoute,
        ) { result ->
            outcome = result
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Invalidates the cached Pocket verification and closes its sessions on
     * the owner lane. Calls submitted after this one observe the refreshed
     * files in FIFO order; no caller thread ever closes ORT under a run.
     */
    fun refreshPocketModel() {
        owner.execute {
            closePocketEngineState()
            pocketModelStatusSnapshot = null
        }
    }

    /**
     * Hash-verifies Pocket on the same owner lane that opens and closes its
     * ORT sessions. A cached answer carries the original measurement rather
     * than pretending that a lookup was another disk verification.
     */
    fun pocketModelStatusBlocking(refresh: Boolean = false): TalosPocketModelStatusSnapshot {
        val completed = CountDownLatch(1)
        var outcome: Result<TalosPocketModelStatusSnapshot>? = null
        owner.execute {
            outcome = runCatching { currentPocketModelStatusSnapshot(refresh) }
            completed.countDown()
        }
        completed.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Invalidates whatever generation is active AND silences whatever is
     * playing right now (§23.2 `flush`) - a cancel that only stopped future
     * TTS frames but let already-decoded audio keep playing out would not be
     * a cancel a person could feel.
     *
     * ⛔ `player.flush()` is called from THIS thread, not queued onto the
     * owner lane: the owner lane is exactly where a long-running generation
     * is busy blocking on ONNX/`AudioTrack.write()` calls, so a queued flush
     * would sit behind the whole utterance instead of interrupting it -
     * §23.4's "cancel p95 < 150ms" is not reachable if cancel has to wait
     * its turn. `AudioTrack`'s control calls (`pause`/`flush`/`play`) are
     * documented-safe to call from a different thread than the one blocked
     * in `write()`; `player` is `@Volatile` so this thread sees the current
     * instance. Everything that actually touches ORT state - the generation
     * itself - still only ever unwinds on the owner lane, via the
     * invalidated queue-gate generation id, exactly as §14 requires.
     *
     * ⛔ Measured on the OnePlus Pad 3, warm (host already spoke once):
     * cancel-to-result **60 ms**, comfortably under §23.4's 150 ms p95 -
     * `isCancelled()` at the top of every autoregressive frame is enough,
     * no extra pre-write check needed. ⛔ The FIRST call on a fresh host is
     * a different number entirely: cold `TalosMossRuntime.open()` (five ONNX
     * sessions off storage) took 6-7 s on this device, and a cancel issued
     * during that window can only take effect once loading finishes - there
     * is no loop to interrupt yet. That is cold-model-load cost wearing the
     * wrong label, not a cancellation defect; §23.4's number, like the TTFA
     * gate's "a caldo", is a warm-generation measurement.
     */
    fun cancel(): Long {
        val invalidated = queueGate.cancel()
        activeDiagnosticSession?.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.CANCEL_REQUESTED,
                stage = "TalosVoiceHost.cancel",
                cancellationGeneration = invalidated,
            ),
        )
        player?.flush()
        return invalidated
    }

    /**
     * Research-only B0 modes. T0 is intentionally absent: both T0 variants
     * must enter through [get] plus the ordinary streaming call.
     */
    internal fun runB0ResearchModesBlocking(session: TalosVoiceB0Session): TalosVoiceTraceArtifact {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosVoiceTraceArtifact>? = null
        owner.execute {
            outcome = runCatching { runB0ResearchModes(session) }
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    private fun runB0ResearchModes(session: TalosVoiceB0Session): TalosVoiceTraceArtifact {
        val existingModes = session.snapshot().runs.map { it.mode }.toSet()
        require(TalosVoiceRunMode.T0 in existingModes && TalosVoiceRunMode.T0_DIAGNOSTICS_OFF in existingModes) {
            "T0 and T0_DIAGNOSTICS_OFF must be written by the production loop before research modes"
        }
        val config = session.config
        val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
        val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
        val textTokenIds = activeTokenizer.encode(config.text)
        require(textTokenIds.isNotEmpty()) { "tokenizer produced no ids for B0 text" }

        player?.close()
        player = null
        playerSampleRate = null
        playerChannels = null

        val t1Recorder = TalosVoiceTraceRecorder(generationCounter.incrementAndGet(), TalosVoiceRunMode.T1)
        val (t1Frames, t1Cancelled) = activeRuntime.generateAudioTokens(
            textTokenIds = textTokenIds,
            voice = config.voice,
            maxFrames = config.maxFrames,
            seed = config.seed,
            isCancelled = { false },
            onFrame = {},
            trace = t1Recorder,
        )
        session.recordCompletedRun(
            t1Recorder.finish(
                finishedAtElapsedRealtimeNs = SystemClock.elapsedRealtimeNanos(),
                generatedFrames = t1Frames,
                cancelled = t1Cancelled,
                diagnosticsEnabled = false,
                qualificationOnly = false,
            ),
        )

        session.recordCompletedRun(runB0CodecReplay(activeRuntime, t1Frames))

        activeRuntime.close()
        runtime = null

        val profiledRuntime = TalosMossRuntime.open(
            modelRoot = modelRoot,
            cpuThreads = cpuThreads,
            profiling = TalosVoiceOrtProfiling(config.outputDirectory, config.runId),
        )
        try {
            val t3Recorder = TalosVoiceTraceRecorder(generationCounter.incrementAndGet(), TalosVoiceRunMode.T3)
            val (t3Frames, t3Cancelled) = profiledRuntime.generateAudioTokens(
                textTokenIds = textTokenIds,
                voice = config.voice,
                maxFrames = config.maxFrames,
                seed = config.seed,
                isCancelled = { false },
                onFrame = {},
                trace = t3Recorder,
            )
            val generationFinishedAtNs = SystemClock.elapsedRealtimeNanos()
            val profiles = requireNotNull(profiledRuntime.finishTtsProfiling()) {
                "T3 runtime did not return TTS profiles"
            }
            session.recordCompletedRun(
                t3Recorder.finish(
                    finishedAtElapsedRealtimeNs = generationFinishedAtNs,
                    generatedFrames = t3Frames,
                    cancelled = t3Cancelled,
                    diagnosticsEnabled = false,
                    qualificationOnly = true,
                    ortProfiles = profiles,
                ),
            )
        } finally {
            profiledRuntime.close()
        }
        return session.snapshot()
    }

    private fun runB0CodecReplay(
        activeRuntime: TalosMossRuntime,
        frames: List<IntArray>,
    ): TalosVoiceRunTrace {
        val recorder = TalosVoiceTraceRecorder(generationCounter.incrementAndGet(), TalosVoiceRunMode.T2)
        val codecStream = activeRuntime.openCodecStream()
        val replayPlayer = TalosPcmPlayer(activeRuntime.sampleRate, activeRuntime.channels)
        var frameOffset = 0
        var batchIndex = 0
        val underrunBaseline = replayPlayer.underrunCount()
        recorder.checkpointUnderruns(
            phase = TalosVoicePhase.UNKNOWN,
            observedAtNs = SystemClock.elapsedRealtimeNanos(),
            frameIndex = null,
            batchIndex = null,
            counter = 0,
            bufferLeadFrames = 0,
        )
        try {
            while (frameOffset < frames.size) {
                val take = minOf(if (frameOffset == 0) 1 else 8, frames.size - frameOffset)
                val batch = frames.subList(frameOffset, frameOffset + take)
                val leadBefore = replayPlayer.framesWritten() - replayPlayer.playbackHeadFrames()
                val underrunsBefore = replayPlayer.underrunCount() - underrunBaseline
                recorder.checkpointUnderruns(
                    phase = TalosVoicePhase.UNKNOWN,
                    observedAtNs = SystemClock.elapsedRealtimeNanos(),
                    frameIndex = frameOffset,
                    batchIndex = batchIndex,
                    counter = underrunsBefore,
                    bufferLeadFrames = leadBefore,
                )

                val decodeStartedAtNs = SystemClock.elapsedRealtimeNanos()
                val decoded = requireNotNull(codecStream.runFrames(batch)) {
                    "T2 codec returned no PCM for batch $batchIndex"
                }
                val decodeNs = SystemClock.elapsedRealtimeNanos() - decodeStartedAtNs
                recorder.checkpointUnderruns(
                    phase = TalosVoicePhase.CODEC_DECODE,
                    observedAtNs = SystemClock.elapsedRealtimeNanos(),
                    frameIndex = frameOffset,
                    batchIndex = batchIndex,
                    counter = replayPlayer.underrunCount() - underrunBaseline,
                    bufferLeadFrames = replayPlayer.framesWritten() - replayPlayer.playbackHeadFrames(),
                )

                val writeStartedAtNs = SystemClock.elapsedRealtimeNanos()
                check(replayPlayer.write(decoded.interleavedPcm)) { "T2 AudioTrack write failed at batch $batchIndex" }
                val writeNs = SystemClock.elapsedRealtimeNanos() - writeStartedAtNs
                val leadAfter = replayPlayer.framesWritten() - replayPlayer.playbackHeadFrames()
                val underrunsAfter = replayPlayer.underrunCount() - underrunBaseline
                recorder.checkpointUnderruns(
                    phase = TalosVoicePhase.AUDIO_WRITE,
                    observedAtNs = SystemClock.elapsedRealtimeNanos(),
                    frameIndex = frameOffset,
                    batchIndex = batchIndex,
                    counter = underrunsAfter,
                    bufferLeadFrames = leadAfter,
                )
                recorder.recordCodecBatch(
                    batchIndex = batchIndex,
                    firstFrameIndex = frameOffset,
                    frameCount = take,
                    codecDecodeNs = decodeNs,
                    audioWriteNs = writeNs,
                    bufferLeadFramesBefore = leadBefore,
                    bufferLeadFramesAfter = leadAfter,
                    underrunCountBefore = underrunsBefore,
                    underrunCountAfter = underrunsAfter,
                )
                frameOffset += take
                batchIndex += 1
            }

            check(replayPlayer.awaitDrain(timeoutMs = DRAIN_TIMEOUT_MS)) { "T2 AudioTrack did not drain" }
            recorder.checkpointUnderruns(
                phase = TalosVoicePhase.AUDIO_DRAIN,
                observedAtNs = SystemClock.elapsedRealtimeNanos(),
                frameIndex = frames.lastIndex.takeIf { it >= 0 },
                batchIndex = (batchIndex - 1).takeIf { it >= 0 },
                counter = replayPlayer.underrunCount() - underrunBaseline,
                bufferLeadFrames = replayPlayer.framesWritten() - replayPlayer.playbackHeadFrames(),
            )
            return recorder.finish(
                finishedAtElapsedRealtimeNs = SystemClock.elapsedRealtimeNanos(),
                generatedFrames = frames,
                cancelled = false,
                diagnosticsEnabled = false,
                qualificationOnly = false,
            )
        } finally {
            replayPlayer.close()
            codecStream.close()
        }
    }

    private fun runSpeak(id: Long, text: String, voice: String, outputFile: File, maxFrames: Int?, seed: Long?): TalosMossSynthesisResult {
        val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
        val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
        val textTokenIds = activeTokenizer.encode(text)
        require(textTokenIds.isNotEmpty()) { "tokenizer produced no ids for non-empty text: \"$text\"" }
        return activeRuntime.synthesizePcm16ToFile(
            textTokenIds = textTokenIds,
            outputFile = outputFile,
            voice = voice,
            maxFrames = maxFrames ?: DEFAULT_MAX_FRAMES,
            seed = resolveTalosVoiceProductionSeed(seed),
            isCancelled = { !queueGate.isActive(id) },
        )
    }

    private fun runSpeakStreaming(
        id: Long,
        text: String,
        voice: String,
        maxFrames: Int?,
        seed: Long?,
        diagnosticRoute: TalosVoiceDiagnosticRoute?,
    ): TalosVoiceStreamResult {
        val productionTrace = TalosVoiceB0Probe.claimProductionRun(id)
        val diagnosticSession = diagnosticRoute?.let(TalosVoiceDiagnosticProbe::claimProductionRun)
        activeDiagnosticSession = diagnosticSession
        try {
            val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
            val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
            val activePlayer = ensurePlayer(activeRuntime.sampleRate, activeRuntime.channels)
            val tokenizeStarted = SystemClock.elapsedRealtimeNanos()
            val textTokenIds = activeTokenizer.encode(text)
            diagnosticSession?.record(
                TalosVoiceDiagnosticEvent(
                    kind = TalosVoiceDiagnosticEventKind.TOKENIZE,
                    stage = "TalosVoiceTokenizer.encode",
                    durationNs = SystemClock.elapsedRealtimeNanos() - tokenizeStarted,
                ),
            )
            require(textTokenIds.isNotEmpty()) { "tokenizer produced no ids for non-empty text" }

            return driveStreamingSynthesis(
                id,
                activeRuntime,
                activePlayer,
                productionTrace,
                diagnosticSession,
                diagnosticProfileApplied = false,
            ) { onFrame ->
                activeRuntime.generateAudioTokens(
                    textTokenIds = textTokenIds,
                    voice = voice,
                    maxFrames = maxFrames ?: DEFAULT_MAX_FRAMES,
                    seed = resolveTalosVoiceProductionSeed(seed),
                    isCancelled = { !queueGate.isActive(id) },
                    onFrame = onFrame,
                    trace = productionTrace?.recorder,
                )
            }
        } catch (error: Throwable) {
            finishFailedDiagnostic(diagnosticSession, error)
            throw error
        } finally {
            if (activeDiagnosticSession === diagnosticSession) activeDiagnosticSession = null
        }
    }

    /** Same as [runSpeakStreaming], an enrolled profile's reference codes instead of a builtin voice name - see [submitSpeakStreamingWithReference]. */
    private fun runSpeakStreamingWithReference(
        id: Long,
        text: String,
        promptAudioCodes: List<IntArray>,
        maxFrames: Int?,
        seed: Long?,
        diagnosticRoute: TalosVoiceDiagnosticRoute?,
    ): TalosVoiceStreamResult {
        val productionTrace = TalosVoiceB0Probe.claimProductionRun(id)
        val diagnosticSession = diagnosticRoute?.let(TalosVoiceDiagnosticProbe::claimProductionRun)
        activeDiagnosticSession = diagnosticSession
        try {
            val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
            val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
            val activePlayer = ensurePlayer(activeRuntime.sampleRate, activeRuntime.channels)
            val tokenizeStarted = SystemClock.elapsedRealtimeNanos()
            val textTokenIds = activeTokenizer.encode(text)
            diagnosticSession?.record(
                TalosVoiceDiagnosticEvent(
                    kind = TalosVoiceDiagnosticEventKind.TOKENIZE,
                    stage = "TalosVoiceTokenizer.encode",
                    durationNs = SystemClock.elapsedRealtimeNanos() - tokenizeStarted,
                ),
            )
            require(textTokenIds.isNotEmpty()) { "tokenizer produced no ids for non-empty text" }

            return driveStreamingSynthesis(
                id,
                activeRuntime,
                activePlayer,
                productionTrace,
                diagnosticSession,
                diagnosticProfileApplied = true,
            ) { onFrame ->
                activeRuntime.generateAudioTokensWithReference(
                    textTokenIds = textTokenIds,
                    promptAudioCodes = promptAudioCodes,
                    maxFrames = maxFrames ?: DEFAULT_MAX_FRAMES,
                    seed = resolveTalosVoiceProductionSeed(seed),
                    isCancelled = { !queueGate.isActive(id) },
                    onFrame = onFrame,
                    trace = productionTrace?.recorder,
                )
            }
        } catch (error: Throwable) {
            finishFailedDiagnostic(diagnosticSession, error)
            throw error
        } finally {
            if (activeDiagnosticSession === diagnosticSession) activeDiagnosticSession = null
        }
    }

    private fun runBuildPocketEnrollmentProfile(
        id: Long,
        acceptedPhrases: List<TalosVoiceCaptureResult>,
        displayName: String,
        language: String,
        style: String,
        consentVersion: Int,
    ): TalosVoiceEnrollmentBuildResult {
        require(isItalianLocale(language)) { "Pocket enrollment requires an Italian locale, got $language" }
        val lifecycleMetrics = mutableListOf<TalosVoiceEnrollmentStageMetric>()

        fun ensureActive() {
            if (!queueGate.isActive(id)) throw TalosVoiceEnrollmentCancelledException()
        }

        ensureActive()
        val statusWasCached = pocketModelStatusSnapshot != null
        val pocketStatus = measuredEnrollmentStage(
            stage = if (statusWasCached) "pocket_model_status_cache" else "pocket_model_verify",
            metrics = lifecycleMetrics,
        ) {
            currentPocketModelStatus()
        }
        val ready = pocketStatus as? TalosPocketModelStatus.Ready
            ?: error("Pocket enrollment unavailable: $pocketStatus")
        check(ready.verifiedFiles > 0) { "Pocket enrollment requires a hash-verified bundle" }
        ensureActive()

        if (runtime != null || tokenizer != null) {
            measuredEnrollmentStage("moss_state_close", lifecycleMetrics) {
                closeMossEngineState()
            }
        }
        ensureActive()

        val root = ready.root.canonicalFile
        if (pocketRuntimeRoot != root && pocketRuntime != null) {
            measuredEnrollmentStage("pocket_runtime_close", lifecycleMetrics) {
                closePocketEngineState()
            }
        }
        pocketRuntimeRoot = root
        val activeRuntime = pocketRuntime?.let { existing ->
            measuredEnrollmentStage("pocket_runtime_reuse", lifecycleMetrics) { existing }
        } ?: measuredEnrollmentStage("pocket_runtime_open", lifecycleMetrics) {
            pocketRuntimeFactory(root, cpuThreads).also { pocketRuntime = it }
        }
        ensureActive()

        val built = TalosPocketEnrollmentProfileBuilder(
            encoder = TalosPocketEnrollmentReferenceEncoder { pcmFloatMono, sampleRate, onStage ->
                ensureActive()
                val conditioning = activeRuntime.encodeReference(
                    pcmFloatMono = pcmFloatMono,
                    sampleRate = sampleRate,
                    callback = object : TalosPocketCallback {
                        override fun onStage(metric: TalosPocketStageMetric) {
                            ensureActive()
                            onStage(metric.toEnrollmentStageMetric())
                            ensureActive()
                        }

                        override fun onPcm(frame: TalosPocketFrame): Boolean = false
                    },
                )
                ensureActive()
                TalosPocketConditioningPayload(
                    repository = TalosPocketConditioningPayload.REPOSITORY,
                    revision = TalosPocketConditioningPayload.REVISION,
                    sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE,
                    shape = conditioning.shape,
                    values = conditioning.valuesCopy(),
                )
            },
        ).build(
            acceptedPhrases = acceptedPhrases,
            displayName = displayName,
            language = language,
            style = style,
            consentVersion = consentVersion,
            cancellation = TalosVoiceEnrollmentCancellation { !queueGate.isActive(id) },
        )
        ensureActive()
        return built.copy(
            stageMetrics = (lifecycleMetrics + built.stageMetrics)
                .sortedBy(TalosVoiceEnrollmentStageMetric::startedAtNs),
        )
    }

    private fun runSpeakStreamingWithLegacyProfile(
        id: Long,
        text: String,
        locale: String,
        legacy: TalosVoiceProfileV1,
        migrationCommitter: TalosVoiceProfileMigrationCommitter,
        maxFrames: Int?,
        seed: Long?,
        diagnosticRoute: TalosVoiceDiagnosticRoute?,
    ): TalosVoiceStreamResult {
        val diagnosticSession = diagnosticRoute?.let(TalosVoiceDiagnosticProbe::claimProductionRun)
        activeDiagnosticSession = diagnosticSession
        var previewResult: TalosVoiceStreamResult? = null

        fun finish(result: TalosVoiceStreamResult): TalosVoiceStreamResult {
            finishSuccessfulDiagnostic(
                session = diagnosticSession,
                result = result,
                generatedFrameCount = result.generatedFrames,
                profileApplied = true,
                resolvedEngine = result.resolvedEngine ?: "unresolved",
                resolvedLocale = result.resolvedLocale ?: "und",
                fallbackReason = result.fallbackReason,
            )
            return result
        }

        try {
            val routingProfile = legacyRoutingProfile(legacy)
            check(isMossCompatible(routingProfile)) {
                "legacy voice profile is incompatible with the active MOSS codec"
            }
            val pocketStatus = currentPocketModelStatus()
            val unavailableReason = legacyMigrationUnavailableReason(locale, legacy, pocketStatus)
            if (unavailableReason != null) {
                val fallback = runSpeakStreamingWithProfile(
                    id = id,
                    text = text,
                    locale = locale,
                    profile = routingProfile,
                    maxFrames = maxFrames,
                    seed = seed,
                    diagnosticRoute = diagnosticRoute,
                    diagnosticSessionOverride = diagnosticSession,
                    finishDiagnosticWhenComplete = false,
                    manageDiagnosticLifecycle = false,
                ).copy(
                    fallbackReason = unavailableReason,
                    resolvedProfileSchemaVersion = 1,
                    profileMigrationCommitted = false,
                )
                return finish(fallback)
            }

            val ready = pocketStatus as TalosPocketModelStatus.Ready
            val migrator = TalosVoiceProfileMigrator(
                decoder = TalosLegacyReferenceDecoder { promptAudioCodes ->
                    closePocketEngineState()
                    val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also {
                        runtime = it
                    }
                    activeRuntime.decodeReferenceAudio(promptAudioCodes)
                },
                encoder = TalosPocketReferenceEncoder { pcmFloatMono, sampleRate ->
                    closeMossEngineState()
                    val root = ready.root.canonicalFile
                    if (pocketRuntimeRoot != root) closePocketEngineState()
                    pocketRuntimeRoot = root
                    val activeRuntime = pocketRuntime ?: pocketRuntimeFactory(root, cpuThreads).also {
                        pocketRuntime = it
                    }
                    val conditioning = activeRuntime.encodeReference(
                        pcmFloatMono = pcmFloatMono,
                        sampleRate = sampleRate,
                        callback = object : TalosPocketCallback {
                            override fun onStage(metric: TalosPocketStageMetric) {
                                diagnosticSession?.record(metric.toMigrationDiagnosticEvent())
                            }

                            override fun onPcm(frame: TalosPocketFrame): Boolean = false
                        },
                    )
                    TalosPocketConditioningPayload(
                        repository = TalosPocketConditioningPayload.REPOSITORY,
                        revision = TalosPocketConditioningPayload.REVISION,
                        sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE,
                        shape = conditioning.shape,
                        values = conditioning.valuesCopy(),
                    )
                },
            )
            migrator.migrate(
                legacy = legacy,
                requestedLocale = locale,
                cancellation = TalosVoiceProfileMigrationCancellation { !queueGate.isActive(id) },
                preview = { candidate ->
                    val observed = runSpeakStreamingWithProfile(
                        id = id,
                        text = text,
                        locale = locale,
                        profile = candidate,
                        maxFrames = maxFrames,
                        seed = seed,
                        diagnosticRoute = diagnosticRoute,
                        diagnosticSessionOverride = diagnosticSession,
                        finishDiagnosticWhenComplete = false,
                        manageDiagnosticLifecycle = false,
                    )
                    previewResult = observed
                    TalosVoiceProfilePreview(
                        cancelled = observed.cancelled,
                        resolvedEngine = observed.resolvedEngine,
                        resolvedLocale = observed.resolvedLocale,
                        resolvedProfileId = observed.resolvedProfileId,
                        fallbackReason = observed.fallbackReason,
                    )
                },
                commit = migrationCommitter,
                onMetric = { metric ->
                    diagnosticSession?.record(
                        TalosVoiceDiagnosticEvent(
                            kind = TalosVoiceDiagnosticEventKind.ENGINE_STAGE,
                            stage = metric.stage,
                            durationNs = metric.durationNs,
                        ),
                    )
                },
            )
            val migrated = requireNotNull(previewResult) {
                "voice profile migration committed without a production preview"
            }.copy(
                resolvedProfileSchemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                profileMigrationCommitted = true,
            )
            return finish(migrated)
        } catch (cancelled: TalosVoiceProfileMigrationCancelledException) {
            val result = (previewResult ?: cancelledBeforeStart().copy(
                resolvedProfileId = legacy.header.profileId,
            )).copy(
                cancelled = true,
                resolvedProfileSchemaVersion = 1,
                profileMigrationCommitted = false,
            )
            return finish(result)
        } catch (error: Throwable) {
            val explicitFallback = previewResult?.takeIf { result ->
                result.resolvedEngine == TalosMossPromptPayload.BACKEND && result.fallbackReason != null
            }
            if (explicitFallback != null) {
                return finish(
                    explicitFallback.copy(
                        resolvedProfileSchemaVersion = 1,
                        profileMigrationCommitted = false,
                    ),
                )
            }
            player?.flush()
            runCatching { closePocketEngineState() }.onFailure(error::addSuppressed)
            runCatching { closeMossEngineState() }.onFailure(error::addSuppressed)
            finishFailedDiagnostic(
                session = diagnosticSession,
                error = error,
                resolvedEngine = previewResult?.resolvedEngine ?: "unresolved",
                resolvedLocale = previewResult?.resolvedLocale ?: "und",
                resolvedProfileId = legacy.header.profileId,
                fallbackReason = previewResult?.fallbackReason,
                resolvedProfileSchemaVersion = 1,
                profileMigrationCommitted = false,
            )
            throw error
        } finally {
            if (activeDiagnosticSession === diagnosticSession) activeDiagnosticSession = null
        }
    }

    private fun runSpeakStreamingWithProfile(
        id: Long,
        text: String,
        locale: String,
        profile: TalosVoiceProfileV2,
        maxFrames: Int?,
        seed: Long?,
        diagnosticRoute: TalosVoiceDiagnosticRoute?,
        diagnosticSessionOverride: TalosVoiceDiagnosticSession? = null,
        finishDiagnosticWhenComplete: Boolean = true,
        manageDiagnosticLifecycle: Boolean = true,
        playbackEpoch: Long? = null,
        onPlaybackPending: ((TalosVoicePendingPlayback) -> Unit)? = null,
    ): TalosVoiceStreamResult {
        val diagnosticSession = diagnosticSessionOverride
            ?: diagnosticRoute?.let(TalosVoiceDiagnosticProbe::claimProductionRun)
        if (manageDiagnosticLifecycle) activeDiagnosticSession = diagnosticSession
        val startedAtNanos = System.nanoTime()
        val resolvedSeed = resolveTalosVoiceProductionSeed(seed)
        diagnosticSession?.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.SAMPLING_CONFIG,
                stage = "sampling.seed",
                samplingSeed = resolvedSeed,
            ),
        )
        var resolvedRoute: TalosVoiceEngineRoute? = null
        var runPlayer: TalosPcmPlayer? = null
        var underrunBaseline = 0
        var ttfaMs: Long? = null
        var writeFailures = 0
        try {
            val coordinator = TalosVoiceProductionCoordinator(TalosVoiceEngineResolver(::resolveEngine))
            val outcome = coordinator.synthesize(
                request = TalosVoiceProductionRequest(
                    text = text,
                    locale = locale,
                    profile = profile,
                    maxFramesPerSentence = maxFrames,
                    seed = resolvedSeed,
                    pocketStatus = currentPocketModelStatus(),
                    mossCompatible = isMossCompatible(profile),
                ),
                cancellation = TalosVoiceEngineCancellation { !queueGate.isActive(id) },
                callback = object : TalosVoiceEngineCallback {
                    override fun onStage(metric: TalosVoiceEngineStageMetric) {
                        diagnosticSession?.record(metric.toDiagnosticEvent())
                    }

                    override fun onPcm(frame: TalosVoiceEngineFrame): Boolean {
                        if (!queueGate.isActive(id)) return false
                        val activePlayer = ensurePlayer(frame.sampleRate, frame.channels)
                        if (runPlayer !== activePlayer) {
                            runPlayer = activePlayer
                            underrunBaseline = activePlayer.underrunCount()
                        }
                        if (!activePlayer.prepareForWrite { !queueGate.isActive(id) }) return false
                        val requestedFrames = frame.pcmFloat.size / frame.channels
                        val writtenBefore = activePlayer.framesWritten()
                        val underrunsBefore = activePlayer.underrunCount() - underrunBaseline
                        val writeStartedAtNs = SystemClock.elapsedRealtimeNanos()
                        val levelProfile = if (frame.backend == TalosPocketConditioningPayload.BACKEND) {
                            TalosPcmLevelProfile.POCKET_SPEECH
                        } else {
                            TalosPcmLevelProfile.PASSTHROUGH
                        }
                        val accepted = activePlayer.write(
                            interleavedPcm = frame.pcmFloat,
                            levelProfile = levelProfile,
                            onAcceptedOutput = diagnosticSession?.let { session ->
                                { acceptedPcm ->
                                    session.observeAcceptedPcm(
                                        pcm = acceptedPcm,
                                        sampleRate = frame.sampleRate,
                                        channels = frame.channels,
                                    )
                                }
                            },
                            isCancelled = { !queueGate.isActive(id) },
                        )
                        val writeDurationNs = SystemClock.elapsedRealtimeNanos() - writeStartedAtNs
                        val writtenFrames = (activePlayer.framesWritten() - writtenBefore).coerceAtLeast(0L)
                        val levelStats = activePlayer.lastWriteLevelStats()
                        if (writtenFrames > 0L && ttfaMs == null) {
                            ttfaMs = (System.nanoTime() - startedAtNanos) / 1_000_000
                        }
                        if (!accepted && queueGate.isActive(id)) writeFailures += 1
                        val underrunsAfter = activePlayer.underrunCount() - underrunBaseline
                        val leadFrames = activePlayer.framesWritten() - activePlayer.playbackHeadFrames()
                        diagnosticSession?.record(
                            TalosVoiceDiagnosticEvent(
                                kind = TalosVoiceDiagnosticEventKind.AUDIO_WRITE,
                                stage = "AudioTrack.write",
                                durationNs = writeDurationNs,
                                sentenceIndex = frame.sentenceIndex,
                                frameIndex = frame.firstFrameIndex,
                                requestedFrames = requestedFrames,
                                writtenFrames = writtenFrames.coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
                                queueDepthFrames = leadFrames,
                                queueCapacityFrames = activePlayer.bufferCapacityFrames().toLong(),
                                startThresholdFrames = activePlayer.startThresholdFrames().toLong(),
                                playbackHeadFrames = activePlayer.playbackHeadFrames(),
                                underrunCount = underrunsAfter,
                                levelGainDb = levelStats?.gainDb,
                                limiterCeilingDbfs = levelStats?.limiterCeilingDbfs,
                                inputPeakAbs = levelStats?.inputPeakAbs,
                                outputPeakAbs = levelStats?.outputPeakAbs,
                                limitedSampleFrames = levelStats?.limitedSampleFrames,
                                limiterGainReductionDb = levelStats?.limiterGainReductionDb,
                            ),
                        )
                        if (underrunsAfter > underrunsBefore) {
                            diagnosticSession?.record(
                                TalosVoiceDiagnosticEvent(
                                    kind = TalosVoiceDiagnosticEventKind.UNDERRUN_OBSERVED,
                                    stage = "AudioTrack.getUnderrunCount",
                                    sentenceIndex = frame.sentenceIndex,
                                    frameIndex = frame.firstFrameIndex,
                                    queueDepthFrames = leadFrames,
                                    playbackHeadFrames = activePlayer.playbackHeadFrames(),
                                    underrunCount = underrunsAfter,
                                ),
                            )
                        }
                        return accepted && queueGate.isActive(id)
                    }
                },
                onRouteResolved = { route ->
                    resolvedRoute = route
                    diagnosticSession?.record(
                        TalosVoiceDiagnosticEvent(
                            kind = TalosVoiceDiagnosticEventKind.ROUTE_RESOLVED,
                            stage = if (route.fallbackReason == null) {
                                "route.${route.backend.replace('-', '_')}"
                            } else {
                                "route.moss_fallback"
                            },
                        ),
                    )
                },
            )
            val activePlayer = runPlayer
            if (outcome.route.fallbackReason?.startsWith("pocketRuntimeFailure:") == true) {
                pocketRuntime?.close()
                pocketRuntime = null
                pocketRuntimeRoot = null
            }
            val cancelled = outcome.synthesis.terminal == TalosVoiceEngineTerminal.CANCELLED ||
                !queueGate.isActive(id)
            val route = outcome.route
            val initialResult = TalosVoiceStreamResult(
                cancelled = cancelled,
                ttfaMs = ttfaMs,
                underruns = writeFailures,
                hardwareUnderruns = activePlayer?.underrunCount()?.minus(underrunBaseline) ?: 0,
                drainedWithinTimeout = false,
                elapsedMs = (System.nanoTime() - startedAtNanos) / 1_000_000,
                resolvedEngine = route.backend,
                resolvedLocale = outcome.synthesis.locale,
                resolvedProfileId = profile.header.profileId,
                fallbackReason = route.fallbackReason,
                generatedFrames = outcome.synthesis.generatedFrames,
                onsetDiscardedSamples = outcome.synthesis.onsetDiscardedSamples,
                resolvedProfileSchemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                profileMigrationCommitted = false,
            )
            if (!cancelled && activePlayer != null && onPlaybackPending != null) {
                val boundaryFrames = activePlayer.framesWritten()
                onPlaybackPending(
                    TalosVoicePendingPlayback(
                        player = activePlayer,
                        playbackBoundaryFrames = boundaryFrames,
                        submissionId = id,
                        playbackEpoch = requireNotNull(playbackEpoch) {
                            "deferred playback requires the submission epoch"
                        },
                        underrunBaseline = underrunBaseline,
                        startedAtNanos = startedAtNanos,
                        diagnosticSession = diagnosticSession,
                        result = initialResult,
                        generatedFrameCount = outcome.synthesis.generatedFrames,
                        profileApplied = true,
                        resolvedEngine = route.backend,
                        resolvedLocale = outcome.synthesis.locale,
                        fallbackReason = route.fallbackReason,
                    ),
                )
                return initialResult
            }
            diagnosticSession?.record(
                TalosVoiceDiagnosticEvent(
                    kind = TalosVoiceDiagnosticEventKind.DRAIN_BEGIN,
                    stage = "TalosPcmPlayer.awaitDrain",
                    queueDepthFrames = activePlayer?.let { it.framesWritten() - it.playbackHeadFrames() } ?: 0L,
                    queueCapacityFrames = activePlayer?.bufferCapacityFrames()?.toLong(),
                    startThresholdFrames = activePlayer?.startThresholdFrames()?.toLong(),
                    playbackHeadFrames = activePlayer?.playbackHeadFrames() ?: 0L,
                    underrunCount = activePlayer?.underrunCount()?.minus(underrunBaseline) ?: 0,
                ),
            )
            val drainStartedNs = SystemClock.elapsedRealtimeNanos()
            val drained = if (!cancelled && activePlayer != null) {
                activePlayer.awaitDrain(timeoutMs = DRAIN_TIMEOUT_MS)
            } else {
                true
            }
            diagnosticSession?.record(
                TalosVoiceDiagnosticEvent(
                    kind = TalosVoiceDiagnosticEventKind.DRAIN_END,
                    stage = "TalosPcmPlayer.awaitDrain",
                    durationNs = SystemClock.elapsedRealtimeNanos() - drainStartedNs,
                    queueDepthFrames = activePlayer?.let { it.framesWritten() - it.playbackHeadFrames() } ?: 0L,
                    queueCapacityFrames = activePlayer?.bufferCapacityFrames()?.toLong(),
                    startThresholdFrames = activePlayer?.startThresholdFrames()?.toLong(),
                    playbackHeadFrames = activePlayer?.playbackHeadFrames() ?: 0L,
                    underrunCount = activePlayer?.underrunCount()?.minus(underrunBaseline) ?: 0,
                ),
            )
            if (cancelled) {
                diagnosticSession?.record(
                    TalosVoiceDiagnosticEvent(
                        kind = TalosVoiceDiagnosticEventKind.CANCEL_ACKNOWLEDGED,
                        stage = "TalosVoiceHost.profileGenerationBoundary",
                        cancellationGeneration = queueGate.activeId(),
                    ),
                )
            }
            val result = initialResult.copy(
                hardwareUnderruns = activePlayer?.underrunCount()?.minus(underrunBaseline) ?: 0,
                drainedWithinTimeout = drained,
                elapsedMs = (System.nanoTime() - startedAtNanos) / 1_000_000,
            )
            if (finishDiagnosticWhenComplete) {
                finishSuccessfulDiagnostic(
                    session = diagnosticSession,
                    result = result,
                    generatedFrameCount = outcome.synthesis.generatedFrames,
                    profileApplied = true,
                    resolvedEngine = route.backend,
                    resolvedLocale = outcome.synthesis.locale,
                    fallbackReason = route.fallbackReason,
                )
            }
            return result
        } catch (error: Throwable) {
            player?.flush()
            if (
                resolvedRoute?.backend == TalosPocketConditioningPayload.BACKEND ||
                resolvedRoute?.fallbackReason?.startsWith("pocketRuntimeFailure:") == true
            ) {
                runCatching { pocketRuntime?.close() }.onFailure(error::addSuppressed)
                pocketRuntime = null
                pocketRuntimeRoot = null
            }
            if (finishDiagnosticWhenComplete) {
                finishFailedDiagnostic(
                    session = diagnosticSession,
                    error = error,
                    resolvedEngine = resolvedRoute?.backend ?: "unresolved",
                    resolvedLocale = if (resolvedRoute?.backend == TalosPocketConditioningPayload.BACKEND) locale else "und",
                    resolvedProfileId = profile.header.profileId,
                    fallbackReason = resolvedRoute?.fallbackReason,
                    resolvedProfileSchemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                    profileMigrationCommitted = false,
                )
            }
            throw error
        } finally {
            if (manageDiagnosticLifecycle && activeDiagnosticSession === diagnosticSession) {
                activeDiagnosticSession = null
            }
        }
    }

    /**
     * §16.1's loop, factored out of [runSpeakStreaming] so
     * [runSpeakStreamingWithReference] runs through the exact same decode/
     * backpressure/underrun-accounting code - not a second copy that could
     * quietly drift from the measured-safe one. `generate` is the one thing
     * that legitimately differs between a builtin voice and a personal
     * profile: which `TalosMossRuntime` generation method gets called, and
     * with what reference. Everything after "a frame arrived" is identical:
     * every generated TTS frame is queued, then handed to
     * [TalosMossCodecStream] in the batch size §16.2's backpressure policy
     * currently allows, and the decoded PCM is written to [TalosPcmPlayer]
     * immediately. Batch size jumps from 1 (first chunk only, for TTFA) to a
     * measured-safe floor of 8 for everything after ([resolveFrameBudget] -
     * see its doc for why, and for why this is not upstream's 1→2→4→8).
     *
     * ⭐⭐⭐ Owner 22/8, «stutter molto pesanti» confermato dal vivo e
     * misurato: la generazione autoregressiva da sola non sta al passo del
     * tempo reale su questo dispositivo (RTF sostenuto ~1,5 su una lettura
     * lunga, non jitter - `decodeMs`/`cpuThreads` esclusi come causa, vedi i
     * commenti dentro `decodePending`). Un buffer o un batch più grandi non
     * curano un deficit SOSTENUTO: rimandano il primo underrun, non lo
     * evitano - la serie temporale misurata mostra `leadSeconds` fisso a
     * 0,000 dal primo batch in poi.
     *
     * ⛔ PROVATO E RESO INDIETRO, stessa sera: spezzare per frase (una
     * generazione indipendente a testo, sperando che la frase N+1 generasse
     * mentre la N suonava) è stato MISURATO peggiore, non migliore - 74
     * hardwareUnderruns invece di 37, 87s invece di 60s sullo stesso testo,
     * e il dispositivo è arrivato a `thermal=light` a metà lettura (mai
     * prima, nella stessa misura senza spezzare). Il prefill in più per
     * ogni frase è un costo reale che si somma a un pipeline già senza
     * margine, e il tempo totale più lungo produce più calore, che rallenta
     * ancora - un ciclo che si aggrava da solo. L'owner l'ha sentito dal
     * vivo: «meno stutter all'inizio, molti di più verso la metà». Non si
     * cura un deficit di RTF sostenuto spostando dove cade il costo fisso -
     * serve una generazione più veloce in sé, che è il piano già aperto e
     * sospeso ("Motore locale MAX PERFORMANCE", owner 22/8).
     */
    private fun driveStreamingSynthesis(
        id: Long,
        activeRuntime: TalosMossRuntime,
        activePlayer: TalosPcmPlayer,
        productionTrace: TalosVoiceProductionTrace? = null,
        diagnosticSession: TalosVoiceDiagnosticSession? = null,
        diagnosticProfileApplied: Boolean = false,
        generate: (onFrame: (IntArray) -> Unit) -> Pair<List<IntArray>, Boolean>,
    ): TalosVoiceStreamResult {
        val codecStream = activeRuntime.openCodecStream()
        val startedAtNanos = System.nanoTime()
        val underrunCountBefore = activePlayer.underrunCount()
        var ttfaMs: Long? = null
        var underruns = 0
        val pending = ArrayList<IntArray>()
        var batchIndex = 0
        var nextCodecFrameIndex = 0
        val traceRecorder = productionTrace?.recorder

        traceRecorder?.checkpointUnderruns(
            phase = TalosVoicePhase.UNKNOWN,
            observedAtNs = SystemClock.elapsedRealtimeNanos(),
            frameIndex = null,
            batchIndex = null,
            counter = 0,
            bufferLeadFrames = activePlayer.framesWritten() - activePlayer.playbackHeadFrames(),
        )

        fun decodePending(force: Boolean) {
            if (pending.isEmpty()) return
            val bufferedFrames = activePlayer.framesWritten() - activePlayer.playbackHeadFrames()
            val leadSeconds = if (ttfaMs == null) 0.0 else bufferedFrames.toDouble() / activeRuntime.sampleRate
            val budget = resolveFrameBudget(leadSeconds, hasEmittedAudio = ttfaMs != null)
            if (!force && pending.size < budget) return
            val take = if (force) pending.size else minOf(pending.size, budget)
            val batch = ArrayList(pending.subList(0, take))
            repeat(take) { pending.removeAt(0) }
            val firstFrameIndex = nextCodecFrameIndex
            nextCodecFrameIndex += take
            val currentBatchIndex = batchIndex++
            val leadFramesBefore = activePlayer.framesWritten() - activePlayer.playbackHeadFrames()
            val relativeUnderrunsBefore = activePlayer.underrunCount() - underrunCountBefore
            traceRecorder?.checkpointUnderruns(
                phase = TalosVoicePhase.UNKNOWN,
                observedAtNs = SystemClock.elapsedRealtimeNanos(),
                frameIndex = firstFrameIndex,
                batchIndex = currentBatchIndex,
                counter = relativeUnderrunsBefore,
                bufferLeadFrames = leadFramesBefore,
            )

            // ⭐⭐⭐ Owner 22/8: separa il costo della decodifica del codec da
            // quello della generazione autoregressiva - `cpuThreads` 2→4 non
            // ha spostato di un underrun la lettura lunga (37→36 su 60 s),
            // quindi non è lì il collo. Il gap fra un `decodePending()` e il
            // successivo include ANCHE il tempo di generare gli 8 frame
            // successivi (il callback `onFrame` chiama questa funzione da
            // dentro `generate`), un costo sequenziale che questo timer da
            // solo non isola - ma un `decodeNanos` piccolo qui esclude il
            // codec come sospetto, lasciando solo la generazione.
            val decodeStartNanos = SystemClock.elapsedRealtimeNanos()
            val decoded = codecStream.runFrames(batch) ?: return
            val decodeNanos = SystemClock.elapsedRealtimeNanos() - decodeStartNanos
            val decodeMs = decodeNanos / 1_000_000
            diagnosticSession?.record(
                TalosVoiceDiagnosticEvent(
                    kind = TalosVoiceDiagnosticEventKind.CODEC_DECODE,
                    stage = "TalosMossCodecStream.runFrames",
                    durationNs = decodeNanos,
                    frameIndex = firstFrameIndex,
                    queueDepthFrames = leadFramesBefore,
                ),
            )
            traceRecorder?.checkpointUnderruns(
                phase = TalosVoicePhase.CODEC_DECODE,
                observedAtNs = SystemClock.elapsedRealtimeNanos(),
                frameIndex = firstFrameIndex,
                batchIndex = currentBatchIndex,
                counter = activePlayer.underrunCount() - underrunCountBefore,
                bufferLeadFrames = activePlayer.framesWritten() - activePlayer.playbackHeadFrames(),
            )
            if (ttfaMs == null) {
                ttfaMs = (System.nanoTime() - startedAtNanos) / 1_000_000
            }
            val writeStartNanos = SystemClock.elapsedRealtimeNanos()
            val writtenFramesBefore = activePlayer.framesWritten()
            val requestedPcmFrames = decoded.interleavedPcm.size / activeRuntime.channels
            if (!activePlayer.write(decoded.interleavedPcm)) {
                underruns++
            }
            val writeNanos = SystemClock.elapsedRealtimeNanos() - writeStartNanos
            val writeMs = writeNanos / 1_000_000
            val writtenPcmFrames = (activePlayer.framesWritten() - writtenFramesBefore).coerceAtLeast(0L)
            val leadFramesAfter = activePlayer.framesWritten() - activePlayer.playbackHeadFrames()
            val relativeUnderrunsAfter = activePlayer.underrunCount() - underrunCountBefore
            diagnosticSession?.record(
                TalosVoiceDiagnosticEvent(
                    kind = TalosVoiceDiagnosticEventKind.AUDIO_WRITE,
                    stage = "AudioTrack.write",
                    durationNs = writeNanos,
                    frameIndex = firstFrameIndex,
                    requestedFrames = requestedPcmFrames,
                    writtenFrames = writtenPcmFrames.coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
                    queueDepthFrames = leadFramesAfter,
                    queueCapacityFrames = activePlayer.bufferCapacityFrames().toLong(),
                    startThresholdFrames = activePlayer.startThresholdFrames().toLong(),
                    playbackHeadFrames = activePlayer.playbackHeadFrames(),
                    underrunCount = relativeUnderrunsAfter,
                ),
            )
            if (relativeUnderrunsAfter > relativeUnderrunsBefore) {
                diagnosticSession?.record(
                    TalosVoiceDiagnosticEvent(
                        kind = TalosVoiceDiagnosticEventKind.UNDERRUN_OBSERVED,
                        stage = "AudioTrack.getUnderrunCount",
                        frameIndex = firstFrameIndex,
                        queueDepthFrames = leadFramesAfter,
                        playbackHeadFrames = activePlayer.playbackHeadFrames(),
                        underrunCount = relativeUnderrunsAfter,
                    ),
                )
            }
            traceRecorder?.checkpointUnderruns(
                phase = TalosVoicePhase.AUDIO_WRITE,
                observedAtNs = SystemClock.elapsedRealtimeNanos(),
                frameIndex = firstFrameIndex,
                batchIndex = currentBatchIndex,
                counter = relativeUnderrunsAfter,
                bufferLeadFrames = leadFramesAfter,
            )
            traceRecorder?.recordCodecBatch(
                batchIndex = currentBatchIndex,
                firstFrameIndex = firstFrameIndex,
                frameCount = take,
                codecDecodeNs = decodeNanos,
                audioWriteNs = writeNanos,
                bufferLeadFramesBefore = leadFramesBefore,
                bufferLeadFramesAfter = leadFramesAfter,
                underrunCountBefore = relativeUnderrunsBefore,
                underrunCountAfter = relativeUnderrunsAfter,
            )
            // ⭐⭐⭐ Owner 22/8, seconda escalation: «stutter molto pesanti»,
            // confermato dal vivo su un testo lungo. Il riassunto finale
            // (sotto) dice QUANTI underrun ci sono stati ma non QUANDO -
            // senza una serie temporale non si distingue un deficit
            // strutturale (presente dal primo frame) da un collasso termico
            // (peggiora solo verso la fine di una lettura lunga, mentre il
            // SoC scalda). `TalosThermal.read` è lo stesso vocabolario già
            // letto da TalosBenchmarkHarness/TalosBackendChoice - leggerlo
            // qui non ne crea un secondo.
            val hardwareUnderrunsSoFar = activePlayer.underrunCount() - underrunCountBefore
            if (productionTrace?.diagnosticsEnabled != false) {
                Log.i(
                    "TalosVoiceHost",
                    "decodePending(): elapsedMs=${(System.nanoTime() - startedAtNanos) / 1_000_000} " +
                        "batch=$take leadSeconds=${"%.3f".format(leadSeconds)} decodeMs=$decodeMs writeMs=$writeMs " +
                        "hardwareUnderrunsSoFar=$hardwareUnderrunsSoFar thermal=${TalosThermal.read(appContext)}",
                )
            }
        }

        val cancelled: Boolean
        var generatedFrames: List<IntArray> = emptyList()
        try {
            val (frames, wasCancelled) = generate { frame ->
                pending.add(frame)
                decodePending(force = false)
            }
            generatedFrames = frames
            decodePending(force = true)
            cancelled = wasCancelled || !queueGate.isActive(id)
        } finally {
            codecStream.close()
        }

        diagnosticSession?.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.DRAIN_BEGIN,
                stage = "TalosPcmPlayer.awaitDrain",
                queueDepthFrames = activePlayer.framesWritten() - activePlayer.playbackHeadFrames(),
                queueCapacityFrames = activePlayer.bufferCapacityFrames().toLong(),
                startThresholdFrames = activePlayer.startThresholdFrames().toLong(),
                playbackHeadFrames = activePlayer.playbackHeadFrames(),
                underrunCount = activePlayer.underrunCount() - underrunCountBefore,
            ),
        )
        val drainStartedNs = SystemClock.elapsedRealtimeNanos()
        val drained = if (!cancelled) activePlayer.awaitDrain(timeoutMs = DRAIN_TIMEOUT_MS) else true
        diagnosticSession?.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.DRAIN_END,
                stage = "TalosPcmPlayer.awaitDrain",
                durationNs = SystemClock.elapsedRealtimeNanos() - drainStartedNs,
                queueDepthFrames = activePlayer.framesWritten() - activePlayer.playbackHeadFrames(),
                queueCapacityFrames = activePlayer.bufferCapacityFrames().toLong(),
                startThresholdFrames = activePlayer.startThresholdFrames().toLong(),
                playbackHeadFrames = activePlayer.playbackHeadFrames(),
                underrunCount = activePlayer.underrunCount() - underrunCountBefore,
            ),
        )
        if (cancelled) {
            diagnosticSession?.record(
                TalosVoiceDiagnosticEvent(
                    kind = TalosVoiceDiagnosticEventKind.CANCEL_ACKNOWLEDGED,
                    stage = "TalosVoiceHost.generationBoundary",
                    cancellationGeneration = queueGate.activeId(),
                ),
            )
        }
        traceRecorder?.checkpointUnderruns(
            phase = TalosVoicePhase.AUDIO_DRAIN,
            observedAtNs = SystemClock.elapsedRealtimeNanos(),
            frameIndex = nextCodecFrameIndex.takeIf { it > 0 }?.minus(1),
            batchIndex = batchIndex.takeIf { it > 0 }?.minus(1),
            counter = activePlayer.underrunCount() - underrunCountBefore,
            bufferLeadFrames = activePlayer.framesWritten() - activePlayer.playbackHeadFrames(),
        )
        productionTrace?.let { trace ->
            trace.session.recordCompletedRun(
                trace.recorder.finish(
                    finishedAtElapsedRealtimeNs = SystemClock.elapsedRealtimeNanos(),
                    generatedFrames = generatedFrames,
                    cancelled = cancelled,
                    diagnosticsEnabled = trace.diagnosticsEnabled,
                    qualificationOnly = false,
                ),
            )
        }
        val hardwareUnderruns = activePlayer.underrunCount() - underrunCountBefore
        // ⭐⭐⭐ Owner 22/8: «molto stuttering, molto delay» - questi numeri
        // esistevano già (calcolati per ogni lettura, §16 dello stesso file)
        // ma non finivano MAI in un posto leggibile: la riga JS che li
        // riceve (`talosOnPersonalVoiceDone`) scarta tutto tranne
        // `readingId`. Log permanente, non una sonda usa-e-getta - la
        // stessa disciplina di `TalosMossRuntime`: `hardwareUnderruns` è il
        // conteggio VERO dell'HAL (mai un'inferenza dal tempismo),
        // `ttfaMs` è il tempo dalla richiesta al primo `AudioTrack.write()`.
        if (productionTrace?.diagnosticsEnabled != false) {
            Log.i(
                "TalosVoiceHost",
                "driveStreamingSynthesis(): ttfaMs=$ttfaMs underruns=$underruns hardwareUnderruns=$hardwareUnderruns " +
                    "drainedWithinTimeout=$drained cancelled=$cancelled elapsedMs=${(System.nanoTime() - startedAtNanos) / 1_000_000}",
            )
        }
        val result = TalosVoiceStreamResult(
            cancelled = cancelled,
            ttfaMs = ttfaMs,
            underruns = underruns,
            hardwareUnderruns = hardwareUnderruns,
            drainedWithinTimeout = drained,
            elapsedMs = (System.nanoTime() - startedAtNanos) / 1_000_000,
            generatedFrames = generatedFrames.size,
        )
        finishSuccessfulDiagnostic(
            session = diagnosticSession,
            result = result,
            generatedFrameCount = generatedFrames.size,
            profileApplied = diagnosticProfileApplied,
        )
        return result
    }

    /**
     * Completes callbacks in utterance order without owning ORT. The owner
     * lane can therefore prepare a later ADD while this lane observes the
     * exact physical frame boundary of the previous utterance.
     */
    private fun enqueuePlaybackCompletion(
        pending: TalosVoicePendingPlayback,
        onComplete: (Result<TalosVoiceStreamResult>) -> Unit,
    ) {
        playbackCompletion.execute {
            val completion = runCatching {
                val waitStartedNs = SystemClock.elapsedRealtimeNanos()
                val cancellation = { !queueGate.isPlaybackEpochActive(pending.playbackEpoch) }
                val epochActiveAtArm = queueGate.isPlaybackEpochActive(pending.playbackEpoch)
                val terminalBoundary = if (epochActiveAtArm) {
                    queueGate.runIfPlaybackTerminal(pending.submissionId, pending.playbackEpoch) {
                        pending.player.sealTerminalBoundary(pending.playbackBoundaryFrames)
                    }
                } else null
                val headFramesAtArm = terminalBoundary?.headFramesAtSeal ?: pending.player.playbackHeadFrames()
                val completionSource = terminalBoundary?.let { TalosPcmTerminalBoundary.COMPLETION_SOURCE }
                    ?: PLAYBACK_HEAD_COMPLETION_SOURCE
                pending.diagnosticSession?.record(
                    TalosVoiceDiagnosticEvent(
                        kind = TalosVoiceDiagnosticEventKind.PLAYBACK_BOUNDARY_ARMED,
                        stage = if (terminalBoundary == null) {
                            "TalosPcmPlayer.awaitPlaybackBoundary.queued"
                        } else {
                            "TalosPcmPlayer.sealTerminalBoundary"
                        },
                        queueDepthFrames = (pending.playbackBoundaryFrames - headFramesAtArm).coerceAtLeast(0L),
                        queueCapacityFrames = terminalBoundary?.bufferCapacityFrames?.toLong()
                            ?: pending.player.bufferCapacityFrames().toLong(),
                        startThresholdFrames = terminalBoundary?.startThresholdFrames?.toLong()
                            ?: pending.player.startThresholdFrames().toLong(),
                        playbackHeadFrames = headFramesAtArm,
                        playbackBoundaryFrames = pending.playbackBoundaryFrames,
                        playbackCompletionSource = completionSource,
                        terminalDrainRemainingFrames = terminalBoundary?.remainingFramesAtSeal,
                        terminalDrainExpectedNs = terminalBoundary?.expectedDrainNs,
                        underrunCount = pending.player.underrunCount() - pending.underrunBaseline,
                    ),
                )
                terminalBoundary?.let { sealed ->
                    pending.diagnosticSession?.record(
                        TalosVoiceDiagnosticEvent(
                            kind = TalosVoiceDiagnosticEventKind.TERMINAL_DRAIN_ARMED,
                            stage = "AudioTrack.stop.stream_drain",
                            queueDepthFrames = sealed.remainingFramesAtSeal,
                            queueCapacityFrames = sealed.bufferCapacityFrames.toLong(),
                            startThresholdFrames = sealed.startThresholdFrames.toLong(),
                            playbackHeadFrames = sealed.headFramesAtSeal,
                            playbackBoundaryFrames = sealed.boundaryFrames,
                            playbackCompletionSource = TalosPcmTerminalBoundary.COMPLETION_SOURCE,
                            terminalDrainRemainingFrames = sealed.remainingFramesAtSeal,
                            terminalDrainExpectedNs = sealed.expectedDrainNs,
                            underrunCount = pending.player.underrunCount() - pending.underrunBaseline,
                        ),
                    )
                }
                val terminalResult = terminalBoundary?.awaitDrain(
                    timeoutMs = DRAIN_TIMEOUT_MS,
                    isCancelled = cancellation,
                )
                val reached = terminalResult?.reached ?: pending.player.awaitPlaybackBoundary(
                    targetFrames = pending.playbackBoundaryFrames,
                    timeoutMs = DRAIN_TIMEOUT_MS,
                    isCancelled = cancellation,
                )
                val waitDurationNs = SystemClock.elapsedRealtimeNanos() - waitStartedNs
                val epochActive = queueGate.isPlaybackEpochActive(pending.playbackEpoch)
                val cancelled = pending.result.cancelled || !epochActive
                val headFrames = terminalBoundary?.headFramesAtSeal ?: pending.player.playbackHeadFrames()
                val framesWritten = terminalBoundary?.boundaryFrames ?: pending.player.framesWritten()
                val hardwareUnderruns = (
                    (terminalResult?.underrunCount ?: pending.player.underrunCount()) - pending.underrunBaseline
                ).coerceAtLeast(0)
                if (hardwareUnderruns > pending.result.hardwareUnderruns) {
                    pending.diagnosticSession?.record(
                        TalosVoiceDiagnosticEvent(
                            kind = TalosVoiceDiagnosticEventKind.UNDERRUN_OBSERVED,
                            stage = if (terminalBoundary == null) {
                                "AudioTrack.getUnderrunCount.playback_boundary"
                            } else {
                                "AudioTrack.getUnderrunCount.terminal_drain"
                            },
                            queueDepthFrames = (framesWritten - headFrames).coerceAtLeast(0L),
                            playbackHeadFrames = headFrames,
                            playbackBoundaryFrames = pending.playbackBoundaryFrames,
                            playbackCompletionSource = completionSource,
                            terminalDrainRemainingFrames = terminalBoundary?.remainingFramesAtSeal,
                            terminalDrainExpectedNs = terminalBoundary?.expectedDrainNs,
                            underrunCount = hardwareUnderruns,
                        ),
                    )
                }
                when {
                    reached -> pending.diagnosticSession?.record(
                        TalosVoiceDiagnosticEvent(
                            kind = TalosVoiceDiagnosticEventKind.PLAYBACK_BOUNDARY_REACHED,
                            stage = if (terminalBoundary == null) {
                                "TalosPcmPlayer.awaitPlaybackBoundary"
                            } else {
                                "TalosPcmTerminalBoundary.awaitDrain"
                            },
                            durationNs = waitDurationNs,
                            queueDepthFrames = (framesWritten - headFrames).coerceAtLeast(0L),
                            queueCapacityFrames = terminalBoundary?.bufferCapacityFrames?.toLong()
                                ?: pending.player.bufferCapacityFrames().toLong(),
                            startThresholdFrames = terminalBoundary?.startThresholdFrames?.toLong()
                                ?: pending.player.startThresholdFrames().toLong(),
                            playbackHeadFrames = headFrames,
                            playbackBoundaryFrames = pending.playbackBoundaryFrames,
                            playbackCompletionSource = completionSource,
                            terminalDrainRemainingFrames = terminalBoundary?.remainingFramesAtSeal,
                            terminalDrainExpectedNs = terminalBoundary?.expectedDrainNs,
                            underrunCount = hardwareUnderruns,
                        ),
                    )
                    cancelled -> pending.diagnosticSession?.record(
                        TalosVoiceDiagnosticEvent(
                            kind = TalosVoiceDiagnosticEventKind.CANCEL_ACKNOWLEDGED,
                            stage = "TalosPcmPlayer.awaitPlaybackBoundary.cancelled",
                            durationNs = waitDurationNs,
                            playbackHeadFrames = headFrames,
                            playbackBoundaryFrames = pending.playbackBoundaryFrames,
                            playbackCompletionSource = completionSource,
                            terminalDrainRemainingFrames = terminalBoundary?.remainingFramesAtSeal,
                            terminalDrainExpectedNs = terminalBoundary?.expectedDrainNs,
                            underrunCount = hardwareUnderruns,
                            cancellationGeneration = queueGate.activeId(),
                        ),
                    )
                    else -> pending.diagnosticSession?.record(
                        TalosVoiceDiagnosticEvent(
                            kind = TalosVoiceDiagnosticEventKind.DRAIN_END,
                            stage = "TalosPcmPlayer.awaitPlaybackBoundary.timeout",
                            durationNs = waitDurationNs,
                            queueDepthFrames = (framesWritten - headFrames).coerceAtLeast(0L),
                            queueCapacityFrames = pending.player.bufferCapacityFrames().toLong(),
                            startThresholdFrames = pending.player.startThresholdFrames().toLong(),
                            playbackHeadFrames = headFrames,
                            playbackBoundaryFrames = pending.playbackBoundaryFrames,
                            playbackCompletionSource = completionSource,
                            terminalDrainRemainingFrames = terminalBoundary?.remainingFramesAtSeal,
                            terminalDrainExpectedNs = terminalBoundary?.expectedDrainNs,
                            underrunCount = hardwareUnderruns,
                        ),
                    )
                }
                val result = pending.result.copy(
                    cancelled = cancelled,
                    hardwareUnderruns = hardwareUnderruns,
                    drainedWithinTimeout = reached,
                    elapsedMs = (System.nanoTime() - pending.startedAtNanos) / 1_000_000,
                )
                finishSuccessfulDiagnostic(
                    session = pending.diagnosticSession,
                    result = result,
                    generatedFrameCount = pending.generatedFrameCount,
                    profileApplied = pending.profileApplied,
                    resolvedEngine = pending.resolvedEngine,
                    resolvedLocale = pending.resolvedLocale,
                    fallbackReason = pending.fallbackReason,
                )
                result
            }
            onComplete(completion)
        }
    }

    private fun finishSuccessfulDiagnostic(
        session: TalosVoiceDiagnosticSession?,
        result: TalosVoiceStreamResult,
        generatedFrameCount: Int,
        profileApplied: Boolean,
        resolvedEngine: String = TalosMossPromptPayload.BACKEND,
        resolvedLocale: String = "und",
        fallbackReason: String? = null,
    ) {
        if (session == null || session.artifactFileOrNull() != null) return
        session.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.COMPLETED,
                stage = "TalosVoiceHost.complete",
                underrunCount = result.hardwareUnderruns,
            ),
        )
        val audioDurationMs = generatedFrameCount.toLong() * 80L
        val requestedProfileId = session.config.route.requestedProfileId
        val actualProfileId = result.resolvedProfileId ?: requestedProfileId.takeIf { profileApplied }
        session.finish(
            TalosVoiceDiagnosticOutcome(
                termination = if (result.cancelled) "CANCELLED" else "DONE",
                resolvedEngine = resolvedEngine,
                resolvedLocale = resolvedLocale,
                resolvedProfileId = actualProfileId,
                fallbackReason = fallbackReason,
                eventCount = session.eventCount(),
                resolvedProfileSchemaVersion = result.resolvedProfileSchemaVersion,
                profileMigrationCommitted = result.profileMigrationCommitted,
                answers = TalosVoiceDiagnosticAnswers(
                    dominantGraph = "UNKNOWN_NOT_B0_CAMPAIGN",
                    decodeCacheSlope = "UNKNOWN_NOT_B0_CAMPAIGN",
                    outsideOrt = "UNKNOWN_NOT_B0_CAMPAIGN",
                    arOnlyRtf = "UNKNOWN_NOT_B0_CAMPAIGN",
                    underrunCause = "UNKNOWN_ANDROID_CUMULATIVE_COUNTER",
                    selectedVoiceUsed = profileApplied && requestedProfileId != null && actualProfileId == requestedProfileId,
                    selectedLocaleUsed = resolvedLocale == session.config.route.requestedLocale,
                    italianSemanticsPreserved = null,
                    cancelTailMs = null,
                    longReadRealtime = audioDurationMs.takeIf { it > 0L }?.let { result.elapsedMs <= it },
                ),
            ),
        )
    }

    private fun finishFailedDiagnostic(
        session: TalosVoiceDiagnosticSession?,
        error: Throwable,
        resolvedEngine: String = TalosMossPromptPayload.BACKEND,
        resolvedLocale: String = "und",
        resolvedProfileId: String? = null,
        fallbackReason: String? = null,
        resolvedProfileSchemaVersion: Int? = null,
        profileMigrationCommitted: Boolean? = null,
    ) {
        if (session == null || session.artifactFileOrNull() != null) return
        session.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.FAILED,
                stage = "TalosVoiceHost.failure.${error.javaClass.simpleName.take(48)}",
            ),
        )
        session.finish(
            TalosVoiceDiagnosticOutcome(
                termination = "FAILED",
                resolvedEngine = resolvedEngine,
                resolvedLocale = resolvedLocale,
                resolvedProfileId = resolvedProfileId,
                fallbackReason = fallbackReason,
                eventCount = session.eventCount(),
                resolvedProfileSchemaVersion = resolvedProfileSchemaVersion,
                profileMigrationCommitted = profileMigrationCommitted,
                answers = TalosVoiceDiagnosticAnswers(
                    dominantGraph = "UNKNOWN_RUN_FAILED",
                    decodeCacheSlope = "UNKNOWN_RUN_FAILED",
                    outsideOrt = "UNKNOWN_RUN_FAILED",
                    arOnlyRtf = "UNKNOWN_RUN_FAILED",
                    underrunCause = "UNKNOWN_RUN_FAILED",
                    selectedVoiceUsed = false,
                    selectedLocaleUsed = false,
                    italianSemanticsPreserved = null,
                    cancelTailMs = null,
                    longReadRealtime = false,
                ),
            ),
        )
    }

    private fun cancelledBeforeStart(): TalosVoiceStreamResult = TalosVoiceStreamResult(
        cancelled = true,
        ttfaMs = null,
        underruns = 0,
        hardwareUnderruns = 0,
        drainedWithinTimeout = true,
        elapsedMs = 0L,
    )

    private fun legacyRoutingProfile(legacy: TalosVoiceProfileV1): TalosVoiceProfileV2 {
        val source = legacy.header
        check(source.schemaVersion == 1) { "legacy voice profile schema is not V1" }
        check(source.backend == TalosMossPromptPayload.BACKEND) { "legacy voice profile backend is unsupported" }
        check(source.frameCount == legacy.promptAudioCodes.size) { "legacy voice profile frame count differs" }
        val moss = TalosMossPromptPayload(
            codecFingerprint = source.codecFingerprint,
            promptSchemaFingerprint = source.promptSchemaFingerprint,
            frameRateMilliHz = source.frameRateMilliHz,
            quantizerCount = source.quantizerCount,
            codebookSize = source.codebookSize,
            promptAudioCodes = legacy.promptAudioCodes,
        )
        return TalosVoiceProfileV2(
            header = TalosVoiceProfileHeaderV2(
                schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                profileId = source.profileId,
                displayName = source.displayName,
                language = source.language,
                style = source.style,
                preferredBackend = TalosMossPromptPayload.BACKEND,
                createdAtEpochMs = source.createdAtEpochMs,
                enrollmentDurationMs = source.enrollmentDurationMs,
                consentVersion = source.consentVersion,
                migratedFromSchemaVersion = source.schemaVersion,
            ),
            qualityMetrics = legacy.qualityMetrics,
            backendPayloads = listOf(moss),
        )
    }

    private fun legacyMigrationUnavailableReason(
        locale: String,
        legacy: TalosVoiceProfileV1,
        pocketStatus: TalosPocketModelStatus,
    ): String? = when {
        !isItalianLocale(locale) -> "pocketLocaleUnsupported:$locale"
        !isItalianLocale(legacy.header.language) ->
            "pocketProfileLanguageUnsupported:${legacy.header.language}"
        pocketStatus is TalosPocketModelStatus.Missing -> "pocketModelMissing:${pocketStatus.path}"
        pocketStatus is TalosPocketModelStatus.Corrupt ->
            "pocketModelCorrupt:${pocketStatus.path}:${pocketStatus.reason}"
        pocketStatus is TalosPocketModelStatus.Ready && pocketStatus.verifiedFiles <= 0 -> "pocketModelUnverified"
        else -> null
    }

    private fun isItalianLocale(locale: String): Boolean =
        locale.substringBefore('-').equals("it", ignoreCase = true)

    private fun closeMossEngineState() {
        var failure: Throwable? = null
        runCatching { runtime?.close() }.onFailure { failure = it }
        runtime = null
        runCatching { tokenizer?.close() }.onFailure { closeFailure ->
            failure?.addSuppressed(closeFailure) ?: run { failure = closeFailure }
        }
        tokenizer = null
        failure?.let { throw it }
    }

    private fun closePocketEngineState() {
        val active = pocketRuntime
        pocketRuntime = null
        pocketRuntimeRoot = null
        active?.close()
    }

    private fun currentPocketModelStatus(): TalosPocketModelStatus =
        currentPocketModelStatusSnapshot().status

    private fun currentPocketModelStatusSnapshot(refresh: Boolean = false): TalosPocketModelStatusSnapshot {
        if (!refresh) pocketModelStatusSnapshot?.let { return it.copy(cacheHit = true) }
        val startedAtNs = System.nanoTime()
        val verificationThreadName = Thread.currentThread().name
        val status = try {
            pocketModelStatusProvider?.invoke()
                ?: TalosPocketModelStatus.Missing("pocket-model-status-provider")
        } catch (error: Throwable) {
            TalosPocketModelStatus.Corrupt(
                path = "pocket-model-status-provider",
                reason = error.javaClass.simpleName.takeIf { it.isNotBlank() } ?: "Throwable",
            )
        }
        val snapshot = TalosPocketModelStatusSnapshot(
            status = status,
            cacheHit = false,
            verificationStartedAtNs = startedAtNs,
            verificationDurationNs = (System.nanoTime() - startedAtNs).coerceAtLeast(0L),
            verificationThreadName = verificationThreadName,
        )
        pocketModelStatusSnapshot = snapshot
        if (status !is TalosPocketModelStatus.Ready || status.verifiedFiles <= 0) {
            closePocketEngineState()
        }
        return snapshot
    }

    private fun isMossCompatible(profile: TalosVoiceProfileV2): Boolean {
        val payload = profile.backendPayloads.filterIsInstance<TalosMossPromptPayload>().singleOrNull()
            ?: return false
        val activeCodecFingerprint = runCatching {
            mossCodecFingerprint ?: TalosVoiceProfileCompatibility.codecFingerprint(modelRoot).also {
                mossCodecFingerprint = it
            }
        }.getOrNull() ?: return false
        return payload.codecFingerprint == activeCodecFingerprint &&
            payload.promptSchemaFingerprint == TalosVoiceProfileCompatibility.promptSchemaFingerprint()
    }

    private fun resolveEngine(route: TalosVoiceEngineRoute): TalosNeuralVoiceEngine = when (route.backend) {
        TalosPocketConditioningPayload.BACKEND -> {
            closeMossEngineState()
            val root = requireNotNull(route.pocketModelRoot).canonicalFile
            if (pocketRuntimeRoot != root) {
                closePocketEngineState()
                pocketRuntimeRoot = root
            }
            val activeRuntime = pocketRuntime ?: pocketRuntimeFactory(root, cpuThreads).also { pocketRuntime = it }
            TalosPocketVoiceEngine(activeRuntime)
        }
        TalosMossPromptPayload.BACKEND -> {
            closePocketEngineState()
            val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
            val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
            TalosMossVoiceEngine(TalosMossRuntimeAdapter(activeRuntime), activeTokenizer)
        }
        else -> error("unsupported voice engine route ${route.backend}")
    }

    private fun ensurePlayer(sampleRate: Int, channels: Int): TalosPcmPlayer {
        val current = player
        if (
            current != null && !current.isDead &&
            playerSampleRate == sampleRate && playerChannels == channels
        ) {
            return current
        }
        current?.close()
        val created = pcmPlayerFactory(sampleRate, channels)
        player = created
        playerSampleRate = sampleRate
        playerChannels = channels
        return created
    }

    private fun TalosVoiceEngineStageMetric.toDiagnosticEvent(): TalosVoiceDiagnosticEvent =
        TalosVoiceDiagnosticEvent(
            kind = when (stage) {
                "tokenize_and_plan", "moss_tokenize" -> TalosVoiceDiagnosticEventKind.TOKENIZE
                "text_conditioner" -> TalosVoiceDiagnosticEventKind.TEXT_CONDITIONER
                "flow_main_voice_prefill", "flow_main_text_prefill", "flow_main_ar" ->
                    TalosVoiceDiagnosticEventKind.FLOW_MAIN
                "flow_step" -> TalosVoiceDiagnosticEventKind.FLOW_STEP
                "mimi_decoder", "moss_codec_decode" -> TalosVoiceDiagnosticEventKind.CODEC_DECODE
                "onset_stabilized" -> TalosVoiceDiagnosticEventKind.ONSET_STABILIZED
                else -> TalosVoiceDiagnosticEventKind.ENGINE_STAGE
            },
            stage = stage,
            durationNs = durationNs,
            sentenceIndex = sentenceIndex,
            frameIndex = frameIndex,
            requestedFrames = inputFrames,
            onsetDiscardedSamples = onsetDiscardedSamples,
            onsetLeadingSilenceSamples = onsetLeadingSilenceSamples,
            onsetGapStartSamples = onsetGapStartSamples,
            onsetGapEndSamples = onsetGapEndSamples,
            onsetResumeStartSamples = onsetResumeStartSamples,
            onsetAnalysisWindowSamples = onsetAnalysisWindowSamples,
            onsetBoundaryThreshold = onsetBoundaryThreshold?.toDouble(),
            onsetBoundarySource = onsetBoundarySource,
        )

    private inline fun <T> measuredEnrollmentStage(
        stage: String,
        metrics: MutableList<TalosVoiceEnrollmentStageMetric>,
        block: () -> T,
    ): T {
        val startedAtNs = System.nanoTime()
        return try {
            block()
        } finally {
            metrics += TalosVoiceEnrollmentStageMetric(
                stage = stage,
                startedAtNs = startedAtNs,
                durationNs = System.nanoTime() - startedAtNs,
                threadName = Thread.currentThread().name,
            )
        }
    }

    private fun TalosPocketStageMetric.toEnrollmentStageMetric(): TalosVoiceEnrollmentStageMetric =
        TalosVoiceEnrollmentStageMetric(
            stage = stage,
            startedAtNs = startedAtNs,
            durationNs = durationNs,
            threadName = threadName,
            inputFrames = inputFrames,
            outputSamples = outputSamples,
        )

    private fun TalosPocketStageMetric.toMigrationDiagnosticEvent(): TalosVoiceDiagnosticEvent =
        TalosVoiceDiagnosticEvent(
            kind = TalosVoiceDiagnosticEventKind.ENGINE_STAGE,
            stage = stage,
            durationNs = durationNs,
            sentenceIndex = sentenceIndex,
            frameIndex = frameIndex,
            requestedFrames = inputFrames,
        )

    private fun openTokenizer(): TalosVoiceTokenizer {
        val manifestPath = TalosMossManifest.resolveManifestPath(modelRoot)
        val manifestDir = manifestPath.parentFile ?: modelRoot
        val tokenizerModelFile = File(manifestDir, "tokenizer.model")
        require(tokenizerModelFile.isFile) { "Missing tokenizer.model: ${tokenizerModelFile.absolutePath}" }
        return TalosVoiceBpeTokenizer(TalosSentencePieceModel.parse(tokenizerModelFile.readBytes()))
    }

    /** Blocks until the owner lane has actually closed model state - deterministic teardown for tests. */
    override fun close() {
        queueGate.cancel()
        player?.flush()
        val closed = CountDownLatch(1)
        owner.execute {
            runtime?.close()
            pocketRuntime?.close()
            tokenizer?.close()
            player?.close()
            runtime = null
            pocketRuntime = null
            pocketRuntimeRoot = null
            pocketModelStatusSnapshot = null
            tokenizer = null
            player = null
            playerSampleRate = null
            playerChannels = null
            closed.countDown()
        }
        closed.await(30, TimeUnit.SECONDS)
        owner.shutdown()
        playbackCompletion.shutdown()
        playbackCompletion.awaitTermination(30, TimeUnit.SECONDS)
    }

    companion object {
        private const val DEFAULT_MAX_FRAMES = 375
        private const val DRAIN_TIMEOUT_MS = 10_000L
        private const val PLAYBACK_HEAD_COMPLETION_SOURCE = "PLAYBACK_HEAD"
        private const val POCKET_MANIFEST_ASSET = "voice/pocket-model-manifest.json"

        @Volatile private var instance: TalosVoiceHost? = null

        /**
         * Blueprint §41's `TalosVoiceHost.get(context.applicationContext)` -
         * one host per process, not one per [android.app.Activity] or per
         * Capacitor `Plugin` instance. Matters concretely: a WebView reload
         * destroys and recreates the plugin, but §41's own skeleton warns
         * against treating that as a reason to close model sessions
         * ("Client/UI destruction is not equivalent to destroying the
         * process-scoped voice runtime") - a second [TalosVoiceHost] on the
         * same [modelRoot] would mean two owner threads racing to open the
         * same ONNX sessions, which §14's whole design exists to rule out.
         */
        fun get(context: Context): TalosVoiceHost {
            instance?.let { return it }
            synchronized(this) {
                instance?.let { return it }
                val applicationContext = context.applicationContext
                val externalFilesDir = requireNotNull(applicationContext.getExternalFilesDir(null)) {
                    "external files directory is unavailable for voice models"
                }
                val modelRoot = TalosVoiceModelManager.modelRoot(externalFilesDir)
                val pocketRoot = TalosPocketModelManager.modelRoot(externalFilesDir)
                val created = TalosVoiceHost(
                    modelRoot = modelRoot,
                    appContext = applicationContext,
                    pocketModelStatusProvider = {
                        val manifestJson = applicationContext.assets.open(POCKET_MANIFEST_ASSET)
                            .bufferedReader()
                            .use { it.readText() }
                        val manifest = TalosPocketModelManifest.fromJson(JSONObject(manifestJson)).requirePinnedBundle()
                        TalosPocketModelManager.validate(pocketRoot, manifest)
                    },
                )
                instance = created
                return created
            }
        }

        /** Test-only: lets an instrumented test start from a clean singleton instead of leaking state across test classes. */
        internal fun resetForTests() {
            synchronized(this) {
                instance?.close()
                instance = null
            }
        }
    }
}

/**
 * §16.2's adaptive backpressure. NOT upstream `ort_cpu_runtime.py`'s
 * `_resolve_stream_decode_frame_budget` thresholds (1/2/4/8 at 0.20/0.55/
 * 1.10s lead) - those were measured on a different platform, and a real
 * measurement here showed they do not hold on the OnePlus Pad 3.
 *
 * ⛔⛔ **`decode_step` at batch=1 measures RTF 0.939 on its own** - the codec
 * decode ALONE, with no TTS generation cost added on top yet, already
 * spends 94% of the real-time budget for the audio it produces
 * (`TalosMossCodecStreamBatchSizeDiagnosticTest`: 127 frames, batch=1,
 * elapsedMs=9538 for audioMs=10160). TTS generation for those same frames
 * runs at RTF ~0.53-0.69 on its own (measured in Fase 1). Serialized, as
 * this pipeline runs them, that is a combined RTF over 1.5 at batch=1 -
 * not jitter, a SUSTAINED deficit. A bigger `TalosPcmPlayer` buffer only
 * delays the first underrun it cannot prevent: measured 103 real
 * `AudioTrack.getUnderrunCount()` events at the original buffer, 91 at 4x
 * the buffer - barely moved, because the buffer was never the bottleneck.
 * Upstream's own thresholds assume batch=1 is cheap enough to be a safe
 * starting point and bigger batches are a pure efficiency optimization;
 * that assumption does not hold on this hardware for this model.
 *
 * The fix measured to actually leave headroom: batch=1 ONLY for the very
 * first chunk (keeps TTFA low - measured 353-355ms, still under the 500ms
 * target), then straight to a floor of 8 for everything after, growing to
 * 16 once lead is generous. At batch=8 codec-alone RTF measures 0.204;
 * combined with ~0.6 for TTS generation, combined RTF is comfortably under
 * 1.0 with real margin for write()/scheduling overhead, unlike batch=1's
 * 1.5+. `leadSeconds` is real here (buffered-minus-played frames off
 * [TalosPcmPlayer]), not upstream's wall-clock proxy.
 */
private fun resolveFrameBudget(leadSeconds: Double, hasEmittedAudio: Boolean): Int = when {
    !hasEmittedAudio -> 1
    else -> 8
}

internal const val TALOS_VOICE_PRODUCTION_SEED = 42L

/**
 * Product speech must be reproducible: the ARM64 quality sweep measured 42
 * as the best primary-corpus seed. Explicit seeds remain a research/test
 * control and are never rewritten.
 */
internal fun resolveTalosVoiceProductionSeed(explicitSeed: Long?): Long =
    explicitSeed ?: TALOS_VOICE_PRODUCTION_SEED

internal data class TalosVoicePendingPlayback(
    val player: TalosPcmPlayer,
    val playbackBoundaryFrames: Long,
    val submissionId: Long,
    val playbackEpoch: Long,
    val underrunBaseline: Int,
    val startedAtNanos: Long,
    val diagnosticSession: TalosVoiceDiagnosticSession?,
    val result: TalosVoiceStreamResult,
    val generatedFrameCount: Int,
    val profileApplied: Boolean,
    val resolvedEngine: String,
    val resolvedLocale: String,
    val fallbackReason: String?,
)

internal data class TalosVoiceStreamResult(
    val cancelled: Boolean,
    /** Submit-to-first-`AudioTrack.write()` time. Not confirmed-audible TTFA - the device quirk documented on [TalosPcmPlayer.write] means playback-head confirmation needs more than one write to be reliable on some hardware. */
    val ttfaMs: Long?,
    /** Times a player write failed and needed the §17.4 recreate path - not necessarily audible glitches, but never expected to be nonzero either. */
    val underruns: Int,
    /** `AudioTrack.getUnderrunCount()` delta for this utterance - the HAL's own count of real buffer underruns, i.e. the authoritative signal for an audible glitch. Nonzero here means the device actually ran the output buffer dry, not an inference from timing. */
    val hardwareUnderruns: Int,
    val drainedWithinTimeout: Boolean,
    val elapsedMs: Long,
    val resolvedEngine: String? = null,
    val resolvedLocale: String? = null,
    val resolvedProfileId: String? = null,
    val fallbackReason: String? = null,
    val generatedFrames: Int = 0,
    val onsetDiscardedSamples: Int = 0,
    val resolvedProfileSchemaVersion: Int? = null,
    val profileMigrationCommitted: Boolean = false,
)
