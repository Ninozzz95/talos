package ai.talos;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.List;

/** The app admits two workers; durable work beyond them remains FIFO waiting. */
public class TalosTransferDispatcherTest {

    private static final class MemoryStorage implements TalosTransferJournal.Storage {
        String body;
        @Override public String read() { return body; }
        @Override public void write(String next) { body = next; }
        @Override public void clear() { body = null; }
    }

    @Test
    public void selectsOnlyTwoWaitingRecordsAndPromotesTheOldestNext() {
        TalosTransferJournal journal = new TalosTransferJournal(new MemoryStorage());
        TalosTransferJournal.Snapshot first = journal.begin(
                request("owner/first", "first.gguf"),
                TalosTransferPlan.Runner.DEFERRED_JOB, true);
        TalosTransferJournal.Snapshot second = journal.begin(
                request("owner/second", "second.gguf"),
                TalosTransferPlan.Runner.DEFERRED_JOB, true);
        TalosTransferJournal.Snapshot third = journal.begin(
                request("owner/third", "third.gguf"),
                TalosTransferPlan.Runner.DEFERRED_JOB, true);

        List<TalosTransferJournal.Snapshot> firstSelection =
                TalosTransferDispatcher.select(journal.list());
        assertEquals(2, firstSelection.size());
        assertEquals(first.id, firstSelection.get(0).id);
        assertEquals(second.id, firstSelection.get(1).id);

        journal.transition(first.id, TalosTransferJournal.Phase.QUEUED, null);
        journal.transition(second.id, TalosTransferJournal.Phase.RUNNING, null);
        assertEquals(2, TalosTransferDispatcher.occupied(journal.list()));
        assertEquals(0, TalosTransferDispatcher.availableSlots(journal.list()));
        assertEquals(0, TalosTransferDispatcher.select(journal.list()).size());

        journal.transition(first.id, TalosTransferJournal.Phase.PAUSED, null);
        List<TalosTransferJournal.Snapshot> next =
                TalosTransferDispatcher.select(journal.list());
        assertEquals(1, next.size());
        assertEquals(third.id, next.get(0).id);
    }

    @Test
    public void recoversOnlyWorkThatStillHasAnAndroidHostAsQueued() {
        assertEquals(TalosTransferJournal.Phase.WAITING,
                TalosTransferDispatcher.recoveredPhase(
                        TalosTransferPlan.Runner.FOREGROUND_SERVICE, false));
        assertEquals(TalosTransferJournal.Phase.QUEUED,
                TalosTransferDispatcher.recoveredPhase(
                        TalosTransferPlan.Runner.USER_INITIATED_JOB, true));
        assertEquals(TalosTransferJournal.Phase.WAITING,
                TalosTransferDispatcher.recoveredPhase(
                        TalosTransferPlan.Runner.DEFERRED_JOB, false));
    }

    private static TalosTransferSession.Request request(String repo, String path) {
        return new TalosTransferSession.Request(
                repo, "pinned", new String[] { path }, new long[] { 100L },
                new String[] { null }, path);
    }
}
