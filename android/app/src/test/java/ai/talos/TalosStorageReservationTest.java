package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Two downloads must never approve and claim the same allocatable bytes. */
public class TalosStorageReservationTest {

    @Test
    public void serializesTheWholeCheckAndAllocationCriticalSection() throws Exception {
        AtomicInteger inside = new AtomicInteger();
        AtomicInteger maximum = new AtomicInteger();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        CountDownLatch firstEntered = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondEntered = new CountDownLatch(1);

        Thread first = new Thread(() -> run(failure, () -> {
            int active = inside.incrementAndGet();
            maximum.accumulateAndGet(active, Math::max);
            firstEntered.countDown();
            await(releaseFirst);
            inside.decrementAndGet();
        }));
        Thread second = new Thread(() -> run(failure, () -> {
            int active = inside.incrementAndGet();
            maximum.accumulateAndGet(active, Math::max);
            secondEntered.countDown();
            inside.decrementAndGet();
        }));

        first.start();
        assertTrue(firstEntered.await(2, TimeUnit.SECONDS));
        second.start();
        assertFalse(secondEntered.await(100, TimeUnit.MILLISECONDS));
        releaseFirst.countDown();
        first.join(2_000L);
        second.join(2_000L);

        assertFalse(first.isAlive());
        assertFalse(second.isAlive());
        assertNull(failure.get());
        assertEquals(1, maximum.get());
    }

    private static void run(
            AtomicReference<Throwable> failure,
            TalosStorageReservation.ReservationWork work) {
        try {
            TalosStorageReservation.serialized(work);
        } catch (Throwable caught) {
            failure.compareAndSet(null, caught);
        }
    }

    private static void await(CountDownLatch latch) throws IOException {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) throw new IOException("timeout");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", interrupted);
        }
    }
}
