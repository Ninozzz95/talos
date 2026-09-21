package ai.talos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Durable request ownership: no WebView memory and no credential on disk. */
public class TalosTransferJournalTest {

    private static final class MemoryStorage implements TalosTransferJournal.Storage {
        String body;
        boolean cleared;

        @Override public String read() { return body; }
        @Override public void write(String next) { body = next; cleared = false; }
        @Override public void clear() { body = null; cleared = true; }
    }

    private static TalosTransferSession.Request request() {
        return new TalosTransferSession.Request(
                "unsloth/Qwen3-4B-GGUF",
                "0123456789abcdef",
                new String[] { "Q4/model-00001-of-00002.gguf", "Q4/model-00002-of-00002.gguf" },
                new long[] { 1_000L, 2_000L },
                new String[] { "a".repeat(64), null },
                "Qwen3 4B Q4");
    }

    private static TalosTransferSession.Request secondRequest() {
        return new TalosTransferSession.Request(
                "LiquidAI/LFM2-350M-GGUF",
                "8fdc9d526b7ed346b19257551b05816c7912ecc2",
                new String[] { "LFM2-350M-Q4_K_M.gguf" },
                new long[] { 229_309_376L },
                new String[] { "a4d000c7064bd3b2e42c6845836286a899a4e79cf1791da1a6797b58d575957d" },
                "LFM2 350M Q4_K_M");
    }

    @Test
    public void roundTripsAWholeRequestAndStateWithoutAnyToken() {
        MemoryStorage storage = new MemoryStorage();
        TalosTransferJournal journal = new TalosTransferJournal(storage);

        TalosTransferJournal.Snapshot begun = journal.begin(
                request(), TalosTransferPlan.Runner.USER_INITIATED_JOB, true);
        journal.transition(begun.id, TalosTransferJournal.Phase.PAUSED, null);
        TalosTransferJournal.Snapshot restored = new TalosTransferJournal(storage).read();

        assertEquals(2, TalosTransferJournal.SCHEMA_VERSION);
        assertEquals(TalosTransferJournal.SCHEMA_VERSION, restored.schemaVersion);
        assertEquals(begun.id, restored.id);
        assertTrue(restored.jobId > 0);
        assertTrue(restored.createdAtMs > 0);
        assertEquals(TalosTransferJournal.Phase.PAUSED, restored.phase);
        assertEquals("unsloth/Qwen3-4B-GGUF", restored.repo);
        assertEquals("0123456789abcdef", restored.revision);
        assertArrayEquals(request().paths, restored.paths);
        assertArrayEquals(request().sizes, restored.sizes);
        assertArrayEquals(request().hashes, restored.hashes);
        assertEquals(3_000L, restored.totalBytes);
        assertEquals(TalosTransferPlan.Runner.USER_INITIATED_JOB, restored.runner);
        assertTrue(restored.networkBound);
        assertFalse(storage.body.toLowerCase().contains("token"));
        assertFalse(storage.body.toLowerCase().contains("bearer"));
    }

    @Test
    public void roundTripsTwoIndependentRecordsWithDistinctJobIds() {
        MemoryStorage storage = new MemoryStorage();
        TalosTransferJournal journal = new TalosTransferJournal(storage);

        TalosTransferJournal.Snapshot first = journal.begin(
                request(), TalosTransferPlan.Runner.USER_INITIATED_JOB, true);
        TalosTransferJournal.Snapshot second = journal.begin(
                secondRequest(), TalosTransferPlan.Runner.USER_INITIATED_JOB, true);
        journal.transition(first.id, TalosTransferJournal.Phase.RUNNING, null);
        journal.transition(second.id, TalosTransferJournal.Phase.PAUSED, null);

        List<TalosTransferJournal.Snapshot> restored =
                new TalosTransferJournal(storage).list();
        assertEquals(2, restored.size());
        assertEquals(first.id, restored.get(0).id);
        assertEquals(TalosTransferJournal.Phase.RUNNING, restored.get(0).phase);
        assertEquals(second.id, restored.get(1).id);
        assertEquals(TalosTransferJournal.Phase.PAUSED, restored.get(1).phase);
        assertNotEquals(restored.get(0).jobId, restored.get(1).jobId);
        assertEquals(second.id,
                journal.readByJobId(second.jobId).id);
    }

    @Test
    public void rejectsTheSameCanonicalRequestTwice() {
        TalosTransferJournal journal = new TalosTransferJournal(new MemoryStorage());
        journal.begin(request(), TalosTransferPlan.Runner.USER_INITIATED_JOB, true);

        IllegalStateException duplicate = assertThrows(IllegalStateException.class, () ->
                journal.begin(request(), TalosTransferPlan.Runner.USER_INITIATED_JOB, true));

        assertEquals("duplicate-transfer", duplicate.getMessage());
    }

    @Test
    public void probesPastAJobIdCollisionWithoutReplacingTheExistingJob() {
        Set<Integer> used = new HashSet<>();
        used.add(123_456);
        used.add(123_457);

        assertEquals(123_458, TalosTransferJournal.nextJobId(123_456, used));
    }

    @Test
    public void migratesTheSingleV1RecordAndKeepsItsScheduledJobIdentity() throws Exception {
        MemoryStorage storage = legacyStorage();
        TalosTransferJournal journal = new TalosTransferJournal(storage);

        List<TalosTransferJournal.Snapshot> migrated = journal.list();

        assertEquals(1, migrated.size());
        assertEquals(TalosTransferJournal.LEGACY_JOB_ID, migrated.get(0).jobId);
        assertEquals(TalosTransferJournal.Phase.PAUSED, migrated.get(0).phase);
        JSONObject persisted = new JSONObject(storage.body);
        assertEquals(2, persisted.getInt("schemaVersion"));
        assertEquals(1, persisted.getJSONArray("transfers").length());
        assertNotNull(persisted.getJSONArray("transfers").getJSONObject(0).getString("id"));
    }

    @Test
    public void rejectsAndClearsAnUnknownSchema() throws Exception {
        MemoryStorage storage = validStorage();
        JSONObject body = new JSONObject(storage.body);
        body.put("schemaVersion", TalosTransferJournal.SCHEMA_VERSION + 1);
        storage.body = body.toString();

        assertNull(new TalosTransferJournal(storage).read());
        assertTrue(storage.cleared);
    }

    @Test
    public void rejectsTraversalAndMalformedHashes() throws Exception {
        MemoryStorage traversal = validStorage();
        JSONObject escaped = firstRecord(traversal);
        escaped.getJSONArray("paths").put(0, "../owner-model.gguf");
        traversal.body = wrap(escaped).toString();
        assertNull(new TalosTransferJournal(traversal).read());
        assertTrue(traversal.cleared);

        MemoryStorage hash = validStorage();
        JSONObject malformed = firstRecord(hash);
        malformed.getJSONArray("hashes").put(0, "not-a-sha256");
        hash.body = wrap(malformed).toString();
        assertNull(new TalosTransferJournal(hash).read());
        assertTrue(hash.cleared);
    }

    @Test
    public void aFreshJournalReconstructsTheExactNativeRequest() {
        MemoryStorage storage = validStorage();

        TalosTransferSession.Request restored = new TalosTransferJournal(storage).read().request();

        assertEquals(request().repo, restored.repo);
        assertEquals(request().revision, restored.revision);
        assertArrayEquals(request().paths, restored.paths);
        assertArrayEquals(request().sizes, restored.sizes);
        assertArrayEquals(request().hashes, restored.hashes);
        assertEquals(request().modelName, restored.modelName);
    }

    @Test
    public void aTransitionSurvivesTheWallClockMovingBackwards() throws Exception {
        MemoryStorage storage = validStorage();
        JSONObject record = firstRecord(storage);
        long future = System.currentTimeMillis() + 86_400_000L;
        record.put("createdAtMs", future);
        record.put("updatedAtMs", future);
        storage.body = wrap(record).toString();

        TalosTransferJournal.Snapshot transitioned = new TalosTransferJournal(storage)
                .transition(record.getString("id"), TalosTransferJournal.Phase.RUNNING, null);

        assertNotNull(transitioned);
        assertTrue(transitioned.updatedAtMs >= future);
        assertNotNull(new TalosTransferJournal(storage).read());
    }

    private static MemoryStorage validStorage() {
        MemoryStorage storage = new MemoryStorage();
        new TalosTransferJournal(storage).begin(
                request(), TalosTransferPlan.Runner.FOREGROUND_SERVICE, false);
        return storage;
    }

    private static JSONObject firstRecord(MemoryStorage storage) throws Exception {
        return new JSONObject(storage.body).getJSONArray("transfers").getJSONObject(0);
    }

    private static JSONObject wrap(JSONObject record) throws Exception {
        return new JSONObject()
                .put("schemaVersion", TalosTransferJournal.SCHEMA_VERSION)
                .put("transfers", new JSONArray().put(record));
    }

    private static MemoryStorage legacyStorage() throws Exception {
        TalosTransferSession.Request request = request();
        JSONArray paths = new JSONArray();
        JSONArray sizes = new JSONArray();
        JSONArray hashes = new JSONArray();
        for (int index = 0; index < request.paths.length; index += 1) {
            paths.put(request.paths[index]);
            sizes.put(request.sizes[index]);
            hashes.put(request.hashes[index] == null ? JSONObject.NULL : request.hashes[index]);
        }
        JSONObject body = new JSONObject()
                .put("schemaVersion", 1)
                .put("phase", "paused")
                .put("repo", request.repo)
                .put("revision", request.revision)
                .put("paths", paths)
                .put("sizes", sizes)
                .put("hashes", hashes)
                .put("modelName", request.modelName)
                .put("totalBytes", request.totalBytes)
                .put("runner", TalosTransferPlan.Runner.USER_INITIATED_JOB.name())
                .put("networkBound", true)
                .put("failure", JSONObject.NULL)
                .put("updatedAtMs", 123456789L);
        MemoryStorage storage = new MemoryStorage();
        storage.body = body.toString();
        return storage;
    }
}
