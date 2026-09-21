package ai.talos.voice


internal data class TalosVoiceProductionRequest(
    val text: String,
    val locale: String,
    val profile: TalosVoiceProfileV2,
    val maxFramesPerSentence: Int?,
    val seed: Long,
    val pocketStatus: TalosPocketModelStatus,
    val mossCompatible: Boolean,
)


internal data class TalosVoiceProductionOutcome(
    val route: TalosVoiceEngineRoute,
    val synthesis: TalosVoiceEngineResult,
)


internal fun interface TalosVoiceEngineResolver {
    fun resolve(route: TalosVoiceEngineRoute): TalosNeuralVoiceEngine
}


/**
 * The pure routing boundary used by the process-scoped [TalosVoiceHost].
 * It is deliberately unaware of Android, ORT, profile storage and audio
 * output: production supplies those owned adapters, while this class makes
 * the failover rules independently falsifiable.
 *
 * A Pocket failure may restart through MOSS only before any PCM reaches the
 * consumer. Restarting after the first callback would repeat already audible
 * words, which is worse than a visible failure and therefore fails closed.
 */
internal class TalosVoiceProductionCoordinator(
    private val engineResolver: TalosVoiceEngineResolver,
) {
    fun synthesize(
        request: TalosVoiceProductionRequest,
        cancellation: TalosVoiceEngineCancellation,
        callback: TalosVoiceEngineCallback,
        onRouteResolved: (TalosVoiceEngineRoute) -> Unit = {},
    ): TalosVoiceProductionOutcome {
        val initialRoute = TalosVoiceEngineRouter.select(
            profile = request.profile,
            requestedLocale = request.locale,
            pocketStatus = request.pocketStatus,
            mossCompatible = request.mossCompatible,
        )
        var route = initialRoute
        onRouteResolved(route)
        var engine = try {
            engineResolver.resolve(route)
        } catch (error: Throwable) {
            if (!canFallback(route, cancellation, pcmDelivered = false)) throw error
            route = fallbackRoute(request, error)
            onRouteResolved(route)
            resolveFallback(route, error)
        }
        check(engine.backend == route.backend) {
            "voice engine resolver returned ${engine.backend} for route ${route.backend}"
        }

        var pcmDelivered = false
        val observingCallback = object : TalosVoiceEngineCallback {
            override fun onStage(metric: TalosVoiceEngineStageMetric) = callback.onStage(metric)

            override fun onPcm(frame: TalosVoiceEngineFrame): Boolean {
                pcmDelivered = true
                return callback.onPcm(frame)
            }
        }
        val synthesis = try {
            engine.synthesize(request.toEngineRequest(route), cancellation, observingCallback)
        } catch (error: Throwable) {
            if (!canFallback(route, cancellation, pcmDelivered)) throw error
            route = fallbackRoute(request, error)
            onRouteResolved(route)
            engine = resolveFallback(route, error)
            check(engine.backend == route.backend) {
                "voice fallback resolver returned ${engine.backend} for route ${route.backend}"
            }
            engine.synthesize(request.toEngineRequest(route), cancellation, observingCallback)
        }
        check(synthesis.backend == route.backend) {
            "voice synthesis result backend ${synthesis.backend} differs from route ${route.backend}"
        }
        check(synthesis.profileId == request.profile.header.profileId) {
            "voice synthesis result changed the selected profile"
        }
        val expectedLocale = if (route.backend == TalosPocketConditioningPayload.BACKEND) request.locale else "und"
        check(synthesis.locale == expectedLocale) {
            "voice synthesis result reported locale ${synthesis.locale}; expected $expectedLocale for ${route.backend}"
        }
        return TalosVoiceProductionOutcome(route, synthesis)
    }

    private fun canFallback(
        route: TalosVoiceEngineRoute,
        cancellation: TalosVoiceEngineCancellation,
        pcmDelivered: Boolean,
    ): Boolean = route.backend == TalosPocketConditioningPayload.BACKEND &&
        !pcmDelivered &&
        !cancellation.isCancelled()

    private fun fallbackRoute(
        request: TalosVoiceProductionRequest,
        pocketFailure: Throwable,
    ): TalosVoiceEngineRoute {
        require(request.mossCompatible) { "Pocket failed and no compatible MOSS fallback is available" }
        val moss = request.profile.backendPayloads.filterIsInstance<TalosMossPromptPayload>().singleOrNull()
            ?: error("Pocket failed and the profile has no MOSS fallback payload")
        val failureType = pocketFailure.javaClass.simpleName.takeIf { it.isNotBlank() } ?: "Throwable"
        return TalosVoiceEngineRoute(
            backend = TalosMossPromptPayload.BACKEND,
            payload = moss,
            pocketModelRoot = null,
            fallbackReason = "pocketRuntimeFailure:$failureType",
        )
    }

    private fun resolveFallback(
        route: TalosVoiceEngineRoute,
        pocketFailure: Throwable,
    ): TalosNeuralVoiceEngine = try {
        engineResolver.resolve(route)
    } catch (fallbackFailure: Throwable) {
        fallbackFailure.addSuppressed(pocketFailure)
        throw fallbackFailure
    }

    private fun TalosVoiceProductionRequest.toEngineRequest(route: TalosVoiceEngineRoute) =
        TalosVoiceEngineRequest(
            text = text,
            locale = locale,
            profileId = profile.header.profileId,
            payload = route.payload,
            maxFramesPerSentence = maxFramesPerSentence,
            seed = seed,
        )
}
