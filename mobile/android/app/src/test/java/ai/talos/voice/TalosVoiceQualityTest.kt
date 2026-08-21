package ai.talos.voice

import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure math, no device needed - unlike [TalosVoiceRecorder], which only
 * means something on a real microphone. Each rejection reason in blueprint
 * §12.2 gets its own case, proven both ways: the bad signal that should
 * trigger it, and a clean signal that should not.
 */
class TalosVoiceQualityTest {

    private fun sineWave(seconds: Double, hz: Double, amplitude: Double, sampleRate: Int = 48000): ShortArray {
        val n = (sampleRate * seconds).toInt()
        return ShortArray(n) { i -> (amplitude * sin(2.0 * Math.PI * hz * i / sampleRate) * 32767).toInt().toShort() }
    }

    private fun capture(
        samples: ShortArray,
        sampleRate: Int = 48000,
        clientSilencedObserved: Boolean = false,
        droppedReadCount: Int = 0,
        cancelled: Boolean = false,
    ) = TalosVoiceCaptureResult(samples, sampleRate, clientSilencedObserved, droppedReadCount, cancelled)

    @Test
    fun cleanTwoSecondSpeechLikeSignalIsAccepted() {
        // A steady tone is not real speech, but it is a clean, non-silent,
        // non-clipped, DC-free signal - exactly the shape the hard-reject
        // gates should let through untouched.
        val verdict = TalosVoiceQuality.evaluate(capture(sineWave(2.0, 220.0, 0.3)))
        assertTrue("expected acceptance, got reasons: ${verdict.rejectionReasons}", verdict.accepted)
        assertTrue(verdict.rejectionReasons.isEmpty())
        assertEquals(2000L, verdict.metrics.durationMs)
        assertTrue(verdict.metrics.peakAbs > 0.2)
        assertTrue(verdict.metrics.clippedSampleRatio == 0.0)
    }

    @Test
    fun clientSilencedObservedRejectsEvenAnOtherwiseCleanCapture() {
        val verdict = TalosVoiceQuality.evaluate(capture(sineWave(2.0, 220.0, 0.3), clientSilencedObserved = true))
        assertFalse(verdict.accepted)
        assertTrue(verdict.rejectionReasons.any { it.startsWith("clientSilencedObserved") })
    }

    @Test
    fun emptyCaptureIsRejected() {
        val verdict = TalosVoiceQuality.evaluate(capture(ShortArray(0)))
        assertFalse(verdict.accepted)
        assertTrue(verdict.rejectionReasons.any { it.startsWith("emptyCapture") })
    }

    @Test
    fun tooShortCaptureIsRejected() {
        val verdict = TalosVoiceQuality.evaluate(capture(sineWave(0.1, 220.0, 0.3)))
        assertFalse(verdict.accepted)
        assertTrue(verdict.rejectionReasons.any { it.startsWith("durationBelowMinimum") })
    }

    @Test
    fun nearSilenceIsRejected() {
        val silence = ShortArray((48000 * 2.0).toInt()) // all zero
        val verdict = TalosVoiceQuality.evaluate(capture(silence))
        assertFalse(verdict.accepted)
        assertTrue(verdict.rejectionReasons.any { it.startsWith("nearZeroSignal") })
        assertTrue(verdict.rejectionReasons.any { it.startsWith("excessiveSilence") })
        assertEquals(1.0, verdict.metrics.zeroFrameRatio, 0.0)
    }

    @Test
    fun grossClippingIsRejected() {
        // A square-ish wave at full scale - almost every sample sits at the clip threshold.
        val n = (48000 * 2.0).toInt()
        val clipped = ShortArray(n) { i -> if ((i / 50) % 2 == 0) 32767 else -32768 }
        val verdict = TalosVoiceQuality.evaluate(capture(clipped))
        assertFalse(verdict.accepted)
        assertTrue("expected grossClipping, got: ${verdict.rejectionReasons}", verdict.rejectionReasons.any { it.startsWith("grossClipping") })
        assertTrue(verdict.metrics.clippedSampleRatio > 0.9)
    }

    @Test
    fun severeDcOffsetIsRejected() {
        // A tone riding on a huge DC bias - clip near +1.0 mean rather than 0.
        val n = (48000 * 2.0).toInt()
        val biased = ShortArray(n) { i -> ((0.6 + 0.1 * sin(2.0 * Math.PI * 220.0 * i / 48000)) * 32767).toInt().toShort() }
        val verdict = TalosVoiceQuality.evaluate(capture(biased))
        assertFalse(verdict.accepted)
        assertTrue("expected severeDcOffset, got: ${verdict.rejectionReasons}", verdict.rejectionReasons.any { it.startsWith("severeDcOffset") })
        assertTrue(verdict.metrics.dcOffset > 0.3)
    }

    @Test
    fun corruptedFrameCountIsRejectedWhenReadsDroppedAndNothingCaptured() {
        val verdict = TalosVoiceQuality.evaluate(capture(ShortArray(0), droppedReadCount = 5))
        assertFalse(verdict.accepted)
        assertTrue(verdict.rejectionReasons.any { it.startsWith("corruptedFrameCount") })
    }

    /**
     * The contrary case for the whole gate: dropped reads alone, WITH real
     * captured audio, must not by themselves reject a sample - only the
     * empty-capture combination should. A gate that rejected on
     * `droppedReadCount > 0` regardless of content would throw away good
     * recordings over a single transient read hiccup.
     */
    @Test
    fun droppedReadsAloneDoNotRejectARealCapture() {
        val verdict = TalosVoiceQuality.evaluate(capture(sineWave(2.0, 220.0, 0.3), droppedReadCount = 3))
        assertTrue("dropped reads with real audio captured must not reject on that alone: ${verdict.rejectionReasons}", verdict.accepted)
    }

    @Test
    fun speechRatioAndNoiseFloorAreReportedNotGated() {
        // Half tone, half silence - speechRatio should land near 0.5, and
        // this must NOT be a hard rejection by itself (blueprint §12.2:
        // SNR/noise thresholds need device calibration, not an invented
        // universal cutoff shipped here).
        val n = 48000 * 2
        val half = ShortArray(n) { i -> if (i < n / 2) (0.3 * sin(2.0 * Math.PI * 220.0 * i / 48000) * 32767).toInt().toShort() else 0 }
        val verdict = TalosVoiceQuality.evaluate(capture(half))
        assertTrue(verdict.metrics.speechRatio in 0.3..0.7)
        // zeroFrameRatio ~0.5 stays under the 0.90 hard-reject ceiling.
        assertTrue(verdict.accepted)
    }
}
