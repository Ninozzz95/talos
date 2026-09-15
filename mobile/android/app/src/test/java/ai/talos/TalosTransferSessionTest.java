package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.RandomAccessFile;
import java.nio.file.Files;

/**
 * The two pure pieces of the resolve step, both of which fail silently when
 * they are wrong.
 *
 * A path encoded badly does not raise anything — it produces a 404 for exactly
 * the repositories whose filenames have a space or a subfolder, which is a
 * failure that looks like "that model is broken" and never like a bug here.
 *
 * A misread expiry produces the opposite: an address believed dead while it is
 * alive, re-resolved over and over, into the Hub's rate limiter.
 */
public class TalosTransferSessionTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    @Test
    public void leavesAnOrdinaryFileNameAlone() {
        assertEquals("Qwen3-4B-Q4_K_M.gguf",
                TalosTransferSession.encodePath("Qwen3-4B-Q4_K_M.gguf"));
    }

    /** Repositories publish weights in subfolders; the slashes are structure. */
    @Test
    public void keepsTheFoldersAndEncodesTheNames() {
        assertEquals("Q4_K_M/model-00001-of-00002.gguf",
                TalosTransferSession.encodePath("Q4_K_M/model-00001-of-00002.gguf"));
    }

    /**
     * A space becomes %20, never `+`. In a query string they mean the same
     * thing; in a path `+` is a plus sign, and the Hub answers 404 for a file
     * that is plainly there.
     */
    @Test
    public void encodesASpaceAsAPathWould() {
        assertEquals("my%20model.gguf", TalosTransferSession.encodePath("my model.gguf"));
    }

    @Test
    public void encodesNonAsciiNames() {
        assertEquals("caf%C3%A9/mod%C3%A8le.gguf",
                TalosTransferSession.encodePath("café/modèle.gguf"));
    }

    @Test
    public void readsTheExpiryOffASignedAddress() {
        assertEquals(1753900000L, TalosTransferSession.numberInQuery(
                "https://cdn.example/xet/abc?Expires=1753900000&Signature=zzz&Key-Pair-Id=K1", "Expires"));
    }

    @Test
    public void saysNothingWhenTheAddressCarriesNoExpiry() {
        assertEquals(-1L, TalosTransferSession.numberInQuery("https://cdn.example/xet/abc", "Expires"));
        assertEquals(-1L, TalosTransferSession.numberInQuery("https://cdn.example/x?Expires=", "Expires"));
        assertEquals(-1L, TalosTransferSession.numberInQuery("https://cdn.example/x?Expires=soon", "Expires"));
    }

    /**
     * A parameter that merely ENDS with the name we want is a different
     * parameter. Matching it would read somebody else's number as the deadline
     * and re-resolve on a schedule nothing agreed to.
     */
    @Test
    public void doesNotMatchAParameterThatMerelyEndsWithTheName() {
        assertEquals(-1L, TalosTransferSession.numberInQuery(
                "https://cdn.example/x?NotExpires=1753900000", "Expires"));
        assertEquals(1753900000L, TalosTransferSession.numberInQuery(
                "https://cdn.example/x?NotExpires=1&Expires=1753900000", "Expires"));
    }

    @Test
    public void aUserPausePersistsPausedAndNeverRequestsSchedulerRetry() {
        TalosTransferSession.Completion completion = TalosTransferSession.completionFor(
                "stopped", TalosTransferSession.StopCause.USER_PAUSE);

        assertEquals(TalosTransferJournal.Phase.PAUSED, completion.phase);
        assertFalse(completion.retry);
        assertFalse(completion.clear);
    }

    @Test
    public void aSystemStopKeepsTheRequestQueuedAndRequestsRetry() {
        TalosTransferSession.Completion completion = TalosTransferSession.completionFor(
                "stopped", TalosTransferSession.StopCause.SYSTEM_STOP);

        assertEquals(TalosTransferJournal.Phase.QUEUED, completion.phase);
        assertTrue(completion.retry);
        assertFalse(completion.clear);
    }

    @Test
    public void aForegroundHostSystemStopWaitsForTheNextSafeDispatch() {
        TalosTransferSession.Completion completion = TalosTransferSession.completionForHost(
                "stopped",
                TalosTransferSession.StopCause.SYSTEM_STOP,
                TalosTransferPlan.Runner.FOREGROUND_SERVICE);

        assertEquals(TalosTransferJournal.Phase.WAITING, completion.phase);
        assertTrue(completion.retry);
        assertFalse(completion.clear);
    }

    @Test
    public void cancelIsDistinctAndClearsItsJournal() {
        TalosTransferSession.Completion completion = TalosTransferSession.completionFor(
                "stopped", TalosTransferSession.StopCause.USER_CANCEL);

        assertFalse(completion.retry);
        assertTrue(completion.clear);
    }

    @Test
    public void theTypedStopCauseSurvivesUntilTheWorkerReadsIt() {
        TalosTransferSession.Request request = new TalosTransferSession.Request(
                "owner/model", "main", new String[] { "model.gguf" },
                new long[] { 10L }, new String[] { null }, "Model");
        String id = TalosTransferSession.begin(request);

        TalosTransferSession.requestStop(id, TalosTransferSession.StopCause.USER_PAUSE);

        assertEquals(TalosTransferSession.StopCause.USER_PAUSE,
                TalosTransferSession.stopCause(id));
        TalosTransferSession.end(id);
    }

    @Test
    public void stopCauseAndProgressBelongOnlyToTheirTransferId() {
        TalosTransferSession.Request first = new TalosTransferSession.Request(
                "owner/first", "main", new String[] { "first.gguf" },
                new long[] { 10L }, new String[] { null }, "First");
        TalosTransferSession.Request second = new TalosTransferSession.Request(
                "owner/second", "main", new String[] { "second.gguf" },
                new long[] { 20L }, new String[] { null }, "Second");
        String firstId = TalosTransferSession.begin(first);
        String secondId = TalosTransferSession.begin(second);

        TalosTransferSession.requestStop(firstId, TalosTransferSession.StopCause.USER_CANCEL);

        assertEquals(TalosTransferSession.StopCause.USER_CANCEL,
                TalosTransferSession.stopCause(firstId));
        assertEquals(TalosTransferSession.StopCause.NONE,
                TalosTransferSession.stopCause(secondId));
        assertTrue(TalosTransferSession.stopRequested(firstId));
        assertFalse(TalosTransferSession.stopRequested(secondId));
        assertEquals(10L, TalosTransferSession.totalBytes(firstId));
        assertEquals(20L, TalosTransferSession.totalBytes(secondId));
        TalosTransferSession.end(firstId);
        TalosTransferSession.end(secondId);
    }

    @Test
    public void reconstructsProgressFromCompletedFilesAndCheckpointSidecars() throws Exception {
        TalosTransferSession.Request request = new TalosTransferSession.Request(
                "owner/model", "pinned",
                new String[] { "done.gguf", "partial.gguf" },
                new long[] { 3L, 20L }, new String[] { null, null }, "Model");
        TalosModelStore store = new TalosModelStore(folder.getRoot());

        TalosModelStore.Slot done = store.slot(request.repo, request.revision, request.paths[0]);
        done.finished.getParentFile().mkdirs();
        Files.write(done.finished.toPath(), new byte[] { 1, 2, 3 });

        TalosModelStore.Slot partial = store.slot(request.repo, request.revision, request.paths[1]);
        partial.partial.getParentFile().mkdirs();
        try (RandomAccessFile file = new RandomAccessFile(partial.partial, "rw")) {
            file.setLength(20L);
        }
        TalosResumableSha256 digest = new TalosResumableSha256();
        byte[] checkpointed = new byte[] { 4, 5, 6, 7, 8 };
        digest.update(checkpointed, 0, checkpointed.length);
        partial.checkpoint(20L, 5L, digest.exportState());

        assertEquals(8L, TalosTransferSession.progressFromDisk(folder.getRoot(), request));
    }

    @Test
    public void cancelDeletesOnlySlotsNamedByTheRequestAndCannotEscapeTheModelRoot() throws Exception {
        TalosTransferSession.Request request = new TalosTransferSession.Request(
                "owner/model", "pinned",
                new String[] { "temporary.gguf", "../outside.gguf" },
                new long[] { 4L, 7L }, new String[] { null, null }, "Temporary");
        TalosModelStore store = new TalosModelStore(folder.getRoot());
        TalosModelStore.Slot owned = store.slot(
                request.repo, request.revision, request.paths[0]);
        owned.finished.getParentFile().mkdirs();
        Files.write(owned.finished.toPath(), new byte[] { 1, 2, 3, 4 });
        Files.write(owned.partial.toPath(), new byte[] { 1 });
        Files.write(owned.sidecar.toPath(), new byte[] { 1 });
        java.io.File outside = new java.io.File(folder.getRoot(), "outside.gguf");
        Files.write(outside.toPath(), new byte[] { 9 });

        TalosTransferSession.discardRequest(folder.getRoot(), request);

        assertFalse(owned.finished.exists());
        assertFalse(owned.partial.exists());
        assertFalse(owned.sidecar.exists());
        assertTrue(outside.isFile());
    }
}
