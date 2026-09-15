package ai.talos.voice.research

import android.os.SystemClock
import java.io.File
import java.time.Instant

internal class TalosVoiceDiagnosticSession(
    val config: TalosVoiceDiagnosticConfig,
    private val acceptedPcmObserver: ((FloatArray, Int, Int) -> Unit)? = null,
) {
    private val startedAtElapsedRealtimeNs = SystemClock.elapsedRealtimeNanos()
    private val events = ArrayList<TalosVoiceDiagnosticEvent>()
    private var finishedFile: File? = null

    init {
        record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.ROUTE_ARMED,
                stage = "TalosNeuralVoice.beginDiagnostics",
            ),
        )
    }

    @Synchronized
    fun record(event: TalosVoiceDiagnosticEvent) {
        check(finishedFile == null) { "diagnostic session ${config.route.traceId} is already finished" }
        events += event.copy(sequence = events.size + 1)
    }

    @Synchronized
    fun eventCount(): Int = events.size

    /** Diagnostic-only copy of PCM after the real sink accepted the complete block. */
    @Synchronized
    fun observeAcceptedPcm(pcm: FloatArray, sampleRate: Int, channels: Int) {
        check(finishedFile == null) { "diagnostic session ${config.route.traceId} is already finished" }
        acceptedPcmObserver?.invoke(pcm.copyOf(), sampleRate, channels)
    }

    @Synchronized
    fun finish(outcome: TalosVoiceDiagnosticOutcome): File {
        finishedFile?.let { return it }
        require(outcome.eventCount == events.size) {
            "outcome eventCount ${outcome.eventCount} does not match recorded ${events.size}"
        }
        val artifact = TalosVoiceDiagnosticArtifact(
            schemaVersion = SCHEMA_VERSION,
            generatedAtUtc = Instant.now().toString(),
            startedAtElapsedRealtimeNs = startedAtElapsedRealtimeNs,
            finishedAtElapsedRealtimeNs = SystemClock.elapsedRealtimeNanos(),
            config = config,
            events = events.toList(),
            outcome = outcome,
        )
        return TalosVoiceDiagnosticArtifactWriter.writeAtomic(config.artifactFile, artifact).also {
            finishedFile = it
        }
    }

    @Synchronized
    fun artifactFileOrNull(): File? = finishedFile

    private companion object {
        const val SCHEMA_VERSION = 1
    }
}

/** Bounded FIFO of explicitly armed product requests; normal production carries zero recorder work. */
internal object TalosVoiceDiagnosticProbe {
    private val armed = ArrayDeque<TalosVoiceDiagnosticSession>()

    @Synchronized
    fun armNextProductionRun(session: TalosVoiceDiagnosticSession) {
        check(armed.size < MAX_ARMED_RUNS) { "too many voice diagnostic production probes are armed" }
        armed.addLast(session)
    }

    @Synchronized
    fun claimProductionRun(route: TalosVoiceDiagnosticRoute): TalosVoiceDiagnosticSession? {
        val candidate = armed.firstOrNull() ?: return null
        check(candidate.config.route == route) {
            "diagnostic route changed before production entry: expected=${candidate.config.route.traceId} actual=${route.traceId}"
        }
        armed.removeFirst()
        candidate.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.PRODUCTION_DOOR_ENTERED,
                stage = "TalosVoiceHost.get.speak",
            ),
        )
        return candidate
    }

    @Synchronized
    fun disarm(): TalosVoiceDiagnosticSession? = if (armed.isEmpty()) null else armed.removeFirst()

    private const val MAX_ARMED_RUNS = 32
}
