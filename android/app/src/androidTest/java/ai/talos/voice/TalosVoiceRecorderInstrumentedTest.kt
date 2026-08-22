package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * `AudioRecord` only means something on a real microphone - there is no
 * host-JVM audio input to fake it against, and there is no scripted speech
 * to feed it either. What this proves without needing a human to talk on
 * cue: the capture mechanism itself works (real samples come back, at a
 * verified sample rate - blueprint §11.7 says verify at runtime, never
 * assume the request was honored), and the invariant §5 zero-tolerance gate
 * holds - cancellation and every exit path still return the wake-word
 * microphone, proven by the recorder staying usable for a second capture
 * right after.
 */
@RunWith(AndroidJUnit4::class)
class TalosVoiceRecorderInstrumentedTest {

    private fun recorder(): TalosVoiceRecorder {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceRecorder(context)
    }

    @Test
    fun capturesRealSamplesAtAVerifiedSampleRate() {
        val result = recorder().capture(maxDurationMs = 1500)
        assertFalse("capture must not report clientSilencedObserved on a normal capture", result.clientSilencedObserved)
        assertFalse(result.cancelled)
        assertTrue("expected real captured samples from the live microphone, got ${result.pcm16Mono.size}", result.pcm16Mono.isNotEmpty())
        assertTrue(
            "sample rate must be verified at runtime, not assumed - got ${result.sampleRate}",
            result.sampleRate == TalosVoiceRecorder.TARGET_SAMPLE_RATE || result.sampleRate > 0,
        )
        // Duration should land close to what was requested - not exact (start/stop overhead), but not wildly short either.
        val actualDurationMs = result.pcm16Mono.size.toLong() * 1000 / result.sampleRate
        assertTrue("captured duration ($actualDurationMs ms) should be a real fraction of the 1500ms request", actualDurationMs in 500..2500)
    }

    /**
     * The contrary case, and the one that actually matters for invariant §5:
     * a cancelled capture must stop promptly AND still leave the recorder
     * (and the wake-word microphone underneath it) usable for the next
     * request - not just report `cancelled=true` once and then be broken.
     */
    @Test
    fun cancellingStopsPromptlyAndLeavesTheMicrophoneUsableAfterward() {
        val instance = recorder()
        val startedAt = System.currentTimeMillis()
        val cancelledResult = instance.capture(maxDurationMs = 10_000, isCancelled = { true })
        val elapsedMs = System.currentTimeMillis() - startedAt

        assertTrue("cancel must be observed on the very first poll, not wait out the full duration", cancelledResult.cancelled)
        assertTrue("a cancelled capture must return well before its 10s bound (took ${elapsedMs}ms)", elapsedMs < 3000)

        // The real proof: the microphone was actually returned - a normal
        // capture right after must work exactly like the first test above.
        val afterCancel = instance.capture(maxDurationMs = 1000)
        assertFalse(afterCancel.cancelled)
        assertTrue("microphone must still be usable after a cancelled capture", afterCancel.pcm16Mono.isNotEmpty())
    }

    @Test
    fun droppedReadCountIsZeroOnANormalCapture() {
        val result = recorder().capture(maxDurationMs = 1000)
        assertEquals("no dropped reads expected on a normal, uncontended capture", 0, result.droppedReadCount)
    }
}
