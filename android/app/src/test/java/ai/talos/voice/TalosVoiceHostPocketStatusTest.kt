package ai.talos.voice

import java.nio.file.Files
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosVoiceHostPocketStatusTest {
    @Test
    fun `POCKET-HOST-STATUS-01 cached and forced refresh stay on owner lane and expose measurement`() {
        val root = Files.createTempDirectory("talos-pocket-status").toFile()
        val calls = AtomicInteger(0)
        val host = TalosVoiceHost(
            modelRoot = root,
            pocketModelStatusProvider = {
                when (calls.incrementAndGet()) {
                    1 -> TalosPocketModelStatus.Missing("bundle.json")
                    else -> TalosPocketModelStatus.Ready(root, 8)
                }
            },
        )
        try {
            val first = host.pocketModelStatusBlocking()
            val cached = host.pocketModelStatusBlocking()
            val refreshed = host.pocketModelStatusBlocking(refresh = true)

            assertEquals(2, calls.get())
            assertFalse(first.cacheHit)
            assertTrue(cached.cacheHit)
            assertFalse(refreshed.cacheHit)
            assertTrue(first.status is TalosPocketModelStatus.Missing)
            assertTrue(refreshed.status is TalosPocketModelStatus.Ready)
            assertTrue(first.verificationStartedAtNs > 0L)
            assertTrue(first.verificationDurationNs >= 0L)
            assertEquals("talos-voice-owner", first.verificationThreadName)
            assertEquals(first.verificationStartedAtNs, cached.verificationStartedAtNs)
            assertEquals(first.verificationDurationNs, cached.verificationDurationNs)
        } finally {
            host.close()
            root.deleteRecursively()
        }
    }
}
