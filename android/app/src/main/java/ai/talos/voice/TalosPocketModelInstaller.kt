package ai.talos.voice

import java.io.File


internal data class TalosPocketInstallStageMetric(
    val stage: String,
    val startedAtNs: Long,
    val durationNs: Long,
    val threadName: String,
    val inputFiles: Int?,
    val outputFiles: Int?,
    val outcome: String,
    val detail: String?,
)


internal data class TalosPocketInstallResult(
    val status: TalosPocketModelStatus,
    val activated: Boolean,
    val stageMetrics: List<TalosPocketInstallStageMetric>,
)


/**
 * Installs the exact pinned Pocket bundle through TALOS' generic transfer
 * cache, while keeping validation and activation on one observable lane.
 */
internal class TalosPocketModelInstaller(
    private val externalFilesDir: File,
    private val manifest: TalosPocketModelManifest,
    private val monotonicNanos: () -> Long = System::nanoTime,
    private val currentThreadName: () -> String = { Thread.currentThread().name },
) {
    private val plan = manifest.toVoiceModelManifest()
    private val artifact = plan.artifacts.single()

    fun installPlan(): TalosVoiceModelManifest = plan

    fun status(): TalosPocketModelStatus = TalosPocketModelManager.validate(activeRoot(), manifest)

    fun activateFromCache(): TalosPocketInstallResult {
        val metrics = mutableListOf<TalosPocketInstallStageMetric>()
        val staged = measured(metrics, "cache_stage", inputFiles = artifact.files.size) {
            TalosVoiceModelActivation.stage(externalFilesDir, plan.installRoot, artifact)
        }
        when (staged) {
            is TalosVoiceModelActivation.Outcome.Incomplete -> return result(
                TalosPocketModelStatus.Missing(staged.missingPath),
                activated = false,
                metrics,
            )
            is TalosVoiceModelActivation.Outcome.Failed -> return result(
                TalosPocketModelStatus.Corrupt(artifact.targetDir, "stage:${staged.reason}"),
                activated = false,
                metrics,
            )
            is TalosVoiceModelActivation.Outcome.Activated -> Unit
        }

        val stagingStatus = measured(metrics, "staging_verify", inputFiles = manifest.files.size) {
            TalosPocketModelManager.validate(stagingRoot(), manifest)
        }
        if (!stagingStatus.isVerifiedReady()) return result(stagingStatus, activated = false, metrics)

        return promoteVerifiedStaging(metrics)
    }

    fun recover(): TalosPocketInstallResult {
        val metrics = mutableListOf<TalosPocketInstallStageMetric>()
        if (stagingRoot().isDirectory) {
            val stagingStatus = measured(metrics, "staging_verify", inputFiles = manifest.files.size) {
                TalosPocketModelManager.validate(stagingRoot(), manifest)
            }
            if (!stagingStatus.isVerifiedReady()) return result(stagingStatus, activated = false, metrics)
            return promoteVerifiedStaging(metrics)
        }

        val activeStatus = measured(metrics, "active_verify", inputFiles = manifest.files.size) {
            TalosPocketModelManager.validate(activeRoot(), manifest)
        }
        if (!activeStatus.isVerifiedReady()) return result(activeStatus, activated = false, metrics)
        finishCleanup(metrics)
        return result(activeStatus, activated = false, metrics)
    }

    private fun promoteVerifiedStaging(
        metrics: MutableList<TalosPocketInstallStageMetric>,
    ): TalosPocketInstallResult {
        val promoted = measured(metrics, "atomic_promote", inputFiles = manifest.files.size) {
            TalosVoiceModelActivation.promote(externalFilesDir, plan.installRoot, artifact.targetDir)
        }
        if (promoted !is TalosVoiceModelActivation.Outcome.Activated) {
            val reason = (promoted as? TalosVoiceModelActivation.Outcome.Failed)?.reason ?: "not-activated"
            return result(
                TalosPocketModelStatus.Corrupt(artifact.targetDir, "promote:$reason"),
                activated = false,
                metrics,
            )
        }

        val activeStatus = measured(metrics, "active_verify", inputFiles = manifest.files.size) {
            TalosPocketModelManager.validate(activeRoot(), manifest)
        }
        if (!activeStatus.isVerifiedReady()) {
            measured(metrics, "rollback_restore", inputFiles = 1) {
                TalosVoiceModelActivation.restorePrevious(externalFilesDir, plan.installRoot, artifact.targetDir)
            }
            return result(activeStatus, activated = false, metrics)
        }
        finishCleanup(metrics)
        return result(activeStatus, activated = true, metrics)
    }

    private fun finishCleanup(metrics: MutableList<TalosPocketInstallStageMetric>) {
        measured(metrics, "previous_cleanup", inputFiles = 1) {
            TalosVoiceModelActivation.cleanupPrevious(externalFilesDir, plan.installRoot, artifact.targetDir)
        }
        measured(metrics, "source_cache_cleanup", inputFiles = artifact.files.size) {
            TalosVoiceModelActivation.cleanupSourceCache(externalFilesDir, artifact)
        }
    }

    private fun activeRoot(): File =
        TalosVoiceModelActivation.activeDirectory(externalFilesDir, plan.installRoot, artifact.targetDir)

    private fun stagingRoot(): File =
        TalosVoiceModelActivation.stagingDirectory(externalFilesDir, plan.installRoot, artifact.targetDir)

    private fun result(
        status: TalosPocketModelStatus,
        activated: Boolean,
        metrics: List<TalosPocketInstallStageMetric>,
    ) = TalosPocketInstallResult(status, activated, metrics.toList())

    private fun TalosPocketModelStatus.isVerifiedReady(): Boolean =
        this is TalosPocketModelStatus.Ready && verifiedFiles > 0

    private fun <T> measured(
        metrics: MutableList<TalosPocketInstallStageMetric>,
        stage: String,
        inputFiles: Int? = null,
        operation: () -> T,
    ): T {
        val startedAtNs = monotonicNanos()
        val threadName = currentThreadName()
        try {
            val value = operation()
            val finishedAtNs = monotonicNanos()
            metrics += TalosPocketInstallStageMetric(
                stage = stage,
                startedAtNs = startedAtNs,
                durationNs = (finishedAtNs - startedAtNs).coerceAtLeast(0L),
                threadName = threadName,
                inputFiles = inputFiles,
                outputFiles = outputFiles(value),
                outcome = outcome(value),
                detail = detail(value),
            )
            return value
        } catch (error: Throwable) {
            val finishedAtNs = monotonicNanos()
            metrics += TalosPocketInstallStageMetric(
                stage = stage,
                startedAtNs = startedAtNs,
                durationNs = (finishedAtNs - startedAtNs).coerceAtLeast(0L),
                threadName = threadName,
                inputFiles = inputFiles,
                outputFiles = null,
                outcome = "exception",
                detail = error.javaClass.simpleName,
            )
            throw error
        }
    }

    private fun outputFiles(value: Any?): Int? = when (value) {
        is TalosPocketModelStatus.Ready -> value.verifiedFiles
        is TalosVoiceModelActivation.Outcome.Activated -> artifact.files.size
        is Boolean -> if (value) 0 else null
        else -> null
    }

    private fun outcome(value: Any?): String = when (value) {
        is TalosPocketModelStatus.Ready -> if (value.verifiedFiles > 0) "ready" else "unverified"
        is TalosPocketModelStatus.Missing -> "missing"
        is TalosPocketModelStatus.Corrupt -> "corrupt"
        is TalosVoiceModelActivation.Outcome.Activated -> "activated"
        is TalosVoiceModelActivation.Outcome.Incomplete -> "incomplete"
        is TalosVoiceModelActivation.Outcome.Failed -> "failed"
        is Boolean -> if (value) "completed" else "failed"
        else -> "completed"
    }

    private fun detail(value: Any?): String? = when (value) {
        is TalosPocketModelStatus.Missing -> value.path
        is TalosPocketModelStatus.Corrupt -> "${value.path}:${value.reason}"
        is TalosVoiceModelActivation.Outcome.Incomplete -> value.missingPath
        is TalosVoiceModelActivation.Outcome.Failed -> value.reason
        else -> null
    }
}
