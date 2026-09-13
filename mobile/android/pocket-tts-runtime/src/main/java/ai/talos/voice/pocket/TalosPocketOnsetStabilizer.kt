package ai.talos.voice.pocket

import kotlin.math.abs

data class TalosPocketOnsetConfig(
    val sampleRate: Int,
    val thresholdRatio: Float = 0.02f,
    val minPrefixMs: Int = 150,
    val maxPrefixMs: Int = 1_000,
    val silenceGapMs: Int = 80,
    val leadingSilenceMs: Int = 50,
    val analysisWindowMs: Int = 10,
    val resumeSpeechMs: Int = 20,
    // ⛔ 12/09/2026, misurato sul Pad con la voce dell'owner (profilo Pocket da
    // microfono): dopo il prefisso sacrificale la voce taceva per PIU' di 2,5 s
    // (contorno: dalla finestra 45 in poi da -56 a -86 dBFS fino oltre i 3 s) e
    // a 3 s la ripresa non era ancora arrivata ⇒ ripiego a 0,83 s ⇒ ~2 s di
    // silenzio davanti a ogni segmento: 4 s prima della prima parola e una
    // pausa lunga a ogni virgola. La finestra arriva a 6 s: la ripresa si trova.
    val maxOnsetMs: Int = 6_000,
) {
    val minPrefixSamples: Int = durationSamples(minPrefixMs)
    val maxPrefixSamples: Int = durationSamples(maxPrefixMs)
    val silenceGapSamples: Int = durationSamples(silenceGapMs)
    val leadingSilenceSamples: Int = durationSamples(leadingSilenceMs)
    val analysisWindowSamples: Int = durationSamples(analysisWindowMs)
    val resumeSpeechSamples: Int = durationSamples(resumeSpeechMs)
    val maxOnsetSamples: Int = durationSamples(maxOnsetMs)

    init {
        require(sampleRate > 0) { "Pocket onset sample rate must be positive" }
        require(thresholdRatio.isFinite() && thresholdRatio > 0f && thresholdRatio < 1f) {
            "Pocket onset threshold ratio must be in (0, 1)"
        }
        require(minPrefixMs >= 0 && maxPrefixMs > minPrefixMs) { "Pocket onset prefix window is invalid" }
        require(silenceGapMs > 0 && leadingSilenceMs in 0..silenceGapMs) {
            "Pocket onset silence window is invalid"
        }
        require(analysisWindowMs > 0 && analysisWindowMs <= silenceGapMs) {
            "Pocket onset analysis window is invalid"
        }
        require(resumeSpeechMs > 0 && maxOnsetMs > maxPrefixMs) {
            "Pocket onset resume window is invalid"
        }
    }

    private fun durationSamples(milliseconds: Int): Int =
        ((sampleRate.toLong() * milliseconds + 999L) / 1_000L).toInt()
}

data class TalosPocketOnsetResult(
    val discardedSamples: Int,
    val leadingSilenceSamples: Int,
    val boundaryThreshold: Float,
    val boundarySource: String,
    val gapStartSamples: Int,
    val gapEndSamples: Int,
    val resumeStartSamples: Int,
    val analysisWindowSamples: Int,
)

data class TalosPocketOnsetCompletion(
    val pcmFloatMono: FloatArray,
    val result: TalosPocketOnsetResult,
)

/**
 * Streaming adaptation of the pinned Pocket TTS sacrificial-prefix remedy.
 * Audio is held until the first complete silence gap after the prefix; no
 * sacrificial sample can escape when the boundary is absent or cancellation
 * wins. Once released, subsequent decoder chunks pass through unchanged.
 */
class TalosPocketOnsetStabilizer(
    private val config: TalosPocketOnsetConfig,
) {
    private var buffered = FloatArray(0)
    private var result: TalosPocketOnsetResult? = null
    private var cancelled = false
    fun accept(pcmFloatMono: FloatArray): FloatArray {
        check(!cancelled) { "Pocket onset stabilizer is cancelled" }
        require(pcmFloatMono.all(Float::isFinite)) { "Pocket onset PCM contains non-finite samples" }
        if (pcmFloatMono.isEmpty()) return pcmFloatMono
        if (result != null) return pcmFloatMono

        val joined = FloatArray(buffered.size + pcmFloatMono.size)
        buffered.copyInto(joined)
        pcmFloatMono.copyInto(joined, buffered.size)
        buffered.fill(0f)
        buffered = joined

        val boundary = findMeasuredBoundary(requireCompleteSearchWindow = true) ?: run {
            // ⛔ 12/09/2026: qui si chiudeva a chiave («fail closed»): dopo 3 s di
            // audio senza una pausa di 80 ms nel primo secondo, la lettura INTERA
            // moriva con «Pocket onset boundary was not found». Misurato sul Pad
            // con una risposta italiana fluente di 145 caratteri: la persona
            // premeva «Leggi» e non sentiva niente, mentre l'anteprima (una frase
            // con una pausa dopo «Ecco») suonava. Una pausa non e' garantita da
            // nessuna frase: si ripiega sul taglio piu' silenzioso del prefisso.
            if (buffered.size > config.maxOnsetSamples) return release(fallbackBoundary(), BOUNDARY_SOURCE_FALLBACK).pcmFloatMono
            return FloatArray(0)
        }
        return release(boundary.first, boundary.second).pcmFloatMono
    }
    /**
     * La pausa misurata, prima al 2 % del picco (la regola pinned), poi — se il
     * rumore di fondo di una voce registrata al microfono sta sopra quella
     * soglia e nessuna finestra risulta «quieta» — al 5 % e al 10 %. Owner
     * 12/09 («troppa pausa fra la virgola e la parola dopo»): con la soglia
     * rigida il taglio finiva nel ripiego, che lasciava intera la pausa del
     * modello dopo il prefisso sacrificale; una soglia rilassata trova la
     * stessa pausa e la taglia come quella misurata, 50 ms prima della parola.
     */
    private fun findMeasuredBoundary(requireCompleteSearchWindow: Boolean): Pair<Boundary, String>? {
        findBoundary(requireCompleteSearchWindow, config.thresholdRatio)?.let { return it to BOUNDARY_SOURCE }
        for (ratio in RELAXED_THRESHOLD_RATIOS) {
            findBoundary(requireCompleteSearchWindow, ratio)?.let { return it to "${BOUNDARY_SOURCE_RELAXED}_${(ratio * 100).toInt()}PCT" }
        }
        return null
    }
    fun complete(): TalosPocketOnsetCompletion {
        check(!cancelled) { "Pocket onset stabilizer is cancelled" }
        result?.let { return TalosPocketOnsetCompletion(FloatArray(0), it) }
        val boundary = findMeasuredBoundary(requireCompleteSearchWindow = false)
        return if (boundary != null) release(boundary.first, boundary.second) else release(fallbackBoundary(), BOUNDARY_SOURCE_FALLBACK)
    }
    /**
     * Il ripiego quando nessuna pausa qualifica: la finestra di analisi con la
     * RMS piu' bassa dentro il prefisso [minPrefix, maxPrefix] — il punto piu'
     * vicino a un silenzio che l'audio offre. Il prefisso sacrificale prima del
     * taglio non esce; se l'audio e' piu' corto del prefisso minimo, esce tutto.
     */
    private fun fallbackBoundary(): Boundary {
        talosPocketSeamLog("onset fallback, prefix contour (dBFS/10ms): " + talosPocketSeamContour(buffered.copyOfRange(0, minOf(buffered.size, config.maxOnsetSamples)), config.sampleRate))
        val windowSamples = config.analysisWindowSamples
        val firstWindow = ceilDiv(config.minPrefixSamples, windowSamples)
        val lastWindow = minOf(buffered.size, config.maxPrefixSamples) / windowSamples
        var quietestWindow = -1
        var quietestEnergy = Double.MAX_VALUE
        for (window in firstWindow until lastWindow) {
            val start = window * windowSamples
            var sumSquares = 0.0
            for (index in start until start + windowSamples) {
                val value = buffered[index].toDouble()
                sumSquares += value * value
            }
            if (sumSquares < quietestEnergy) {
                quietestEnergy = sumSquares
                quietestWindow = window
            }
        }
        val cut = if (quietestWindow < 0) 0 else quietestWindow * windowSamples
        var peak = 0f
        for (index in 0 until minOf(buffered.size, config.maxPrefixSamples)) peak = maxOf(peak, abs(buffered[index]))
        // Dalla finestra piu' silenziosa si avanza finche' l'audio resta sotto il
        // 10 % del picco in RMS (-20 dB), fino alla fine del buffer meno la
        // finestra di ripresa: la pausa che segue il prefisso non resta
        // nell'uscita. Misurato 12/09: il silenzio dopo il prefisso oscilla fra
        // -56 e -86 dB (30 dB di escursione), quindi un criterio «entro il doppio
        // della finestra piu' quieta» si fermava dopo 10 ms. Un audio pieno non
        // scende sotto il 10 % e non avanza.
        val peakSquared = peak.toDouble() * peak
        val extensionLimit = buffered.size / windowSamples - ceilDiv(config.resumeSpeechSamples, windowSamples)
        var gapEndWindow = if (quietestWindow < 0) 0 else quietestWindow
        if (quietestWindow >= 0) {
            var window = quietestWindow
            while (window + 1 < extensionLimit) {
                val next = window + 1
                val start = next * windowSamples
                var sumSquares = 0.0
                for (index in start until start + windowSamples) {
                    val value = buffered[index].toDouble()
                    sumSquares += value * value
                }
                if (sumSquares / windowSamples > peakSquared * 0.01) break
                window = next
            }
            gapEndWindow = window + 1
        }
        val resume = if (quietestWindow < 0) cut else gapEndWindow * windowSamples
        return Boundary(gapStart = cut, gapEnd = resume, resumeStart = resume, threshold = peak * config.thresholdRatio)
    }
    private fun release(boundary: Boundary, source: String): TalosPocketOnsetCompletion {
        val outputStart = (boundary.resumeStart - config.leadingSilenceSamples)
            .coerceAtLeast(boundary.gapStart)
        val output = buffered.copyOfRange(outputStart, buffered.size)
        val measured = TalosPocketOnsetResult(
            discardedSamples = outputStart,
            leadingSilenceSamples = boundary.resumeStart - outputStart,
            boundaryThreshold = boundary.threshold,
            boundarySource = source,
            gapStartSamples = boundary.gapStart,
            gapEndSamples = boundary.gapEnd,
            resumeStartSamples = boundary.resumeStart,
            analysisWindowSamples = config.analysisWindowSamples,
        )
        result = measured
        clearBuffer()
        return TalosPocketOnsetCompletion(output, measured)
    }

    fun finish(): TalosPocketOnsetResult {
        check(!cancelled) { "Pocket onset stabilizer is cancelled" }
        return checkNotNull(result) { "Pocket onset boundary was not found" }
    }

    fun cancel() {
        cancelled = true
        clearBuffer()
    }

    internal fun bufferedSamples(): Int = buffered.size

    private fun findBoundary(requireCompleteSearchWindow: Boolean, thresholdRatio: Float): Boundary? {
        val windowSamples = config.analysisWindowSamples
        val completeWindows = buffered.size / windowSamples
        if (requireCompleteSearchWindow && buffered.size < config.maxPrefixSamples) return null
        val searchStartWindow = ceilDiv(config.minPrefixSamples, windowSamples)
        val searchEndWindow = minOf(completeWindows, config.maxPrefixSamples / windowSamples)
        val silenceWindows = ceilDiv(config.silenceGapSamples, windowSamples)
        val resumeWindows = ceilDiv(config.resumeSpeechSamples, windowSamples)
        if (searchEndWindow - searchStartWindow < silenceWindows || completeWindows < resumeWindows) return null
        var peak = 0f
        for (index in 0 until minOf(buffered.size, config.maxPrefixSamples)) {
            peak = maxOf(peak, abs(buffered[index]))
        }
        if (peak == 0f) return null
        val threshold = peak * thresholdRatio
        val thresholdSquared = threshold.toDouble() * threshold
        val quiet = BooleanArray(completeWindows) { window ->
            val start = window * windowSamples
            var sumSquares = 0.0
            for (index in start until start + windowSamples) {
                val value = buffered[index].toDouble()
                sumSquares += value * value
            }
            sumSquares / windowSamples < thresholdSquared
        }
        var longestGapStartWindow = -1
        var longestGapEndWindow = -1
        var cursor = searchStartWindow
        while (cursor < searchEndWindow) {
            if (!quiet[cursor]) {
                cursor += 1
                continue
            }
            val gapStart = cursor
            while (cursor < searchEndWindow && quiet[cursor]) cursor += 1
            if (cursor - gapStart > longestGapEndWindow - longestGapStartWindow) {
                longestGapStartWindow = gapStart
                longestGapEndWindow = cursor
            }
        }
        if (longestGapEndWindow - longestGapStartWindow < silenceWindows) return null
        for (resumeWindow in longestGapEndWindow..(completeWindows - resumeWindows)) {
            if ((resumeWindow until resumeWindow + resumeWindows).all { !quiet[it] }) {
                return Boundary(
                    gapStart = longestGapStartWindow * windowSamples,
                    gapEnd = longestGapEndWindow * windowSamples,
                    resumeStart = resumeWindow * windowSamples,
                    threshold = threshold,
                )
            }
        }
        return null
    }

    private fun ceilDiv(value: Int, divisor: Int): Int = (value + divisor - 1) / divisor

    private fun clearBuffer() {
        buffered.fill(0f)
        buffered = FloatArray(0)
    }

    private data class Boundary(
        val gapStart: Int,
        val gapEnd: Int,
        val resumeStart: Int,
        val threshold: Float,
    )

    companion object {
        /**
         * ⛔ 12/09/2026: era «Quattro. » (punto). Con la voce dell'owner il modello,
         * dopo un punto, tace per oltre 2,5 s prima della frase vera — misurato
         * col contorno di energia nel logcat («TalosPocketSeam»). Con la virgola
         * la pausa e' quella di una virgola: corta. Il prefisso resta sacrificale
         * (i primi ~150 ms di ogni generazione sono da buttare) e viene tagliato
         * come prima; cambia solo quanto silenzio il modello mette dopo.
         */
        const val SACRIFICIAL_PREFIX = "Quattro, "
        const val BOUNDARY_SOURCE = "MEASURED_ITALIAN_PREFIX_WINDOWED_RMS_LONGEST_GAP"
        /** Nessuna pausa qualificante nel prefisso: taglio alla finestra piu' silenziosa (12/09/2026). */
        const val BOUNDARY_SOURCE_FALLBACK = "FALLBACK_ITALIAN_PREFIX_QUIETEST_WINDOW_NO_GAP"
        /** Pausa misurata con una soglia sopra il 2 % pinned (rumore di fondo di una voce registrata al microfono). */
        const val BOUNDARY_SOURCE_RELAXED = "MEASURED_ITALIAN_PREFIX_WINDOWED_RMS_LONGEST_GAP_RELAXED"
        private val RELAXED_THRESHOLD_RATIOS = floatArrayOf(0.05f, 0.10f)
    }
}
