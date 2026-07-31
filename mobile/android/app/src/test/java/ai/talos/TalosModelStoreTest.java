package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Where four gigabytes live while they are arriving, and what a resumed
 * download is allowed to believe about them.
 *
 * The rule this file mostly exists to hold: the bytes on disk and the hash
 * state must agree, always, no matter where the process was killed. If they
 * ever disagree the download finishes and fails a hash check on a file that is
 * perfectly good — or worse, passes one on a file that is not.
 */
public class TalosModelStoreTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private static final String REPO = "unsloth/Qwen3-4B-GGUF";
    private static final String REVISION = "main";
    private static final String PATH = "Qwen3-4B-Q4_K_M.gguf";

    private TalosModelStore store;

    @Before
    public void setUp() {
        store = new TalosModelStore(folder.getRoot());
    }

    private TalosModelStore.Slot slot() {
        return store.slot(REPO, REVISION, PATH);
    }

    private static void writeBytes(File file, int count) throws Exception {
        file.getParentFile().mkdirs();
        try (RandomAccessFile handle = new RandomAccessFile(file, "rw")) {
            handle.setLength(0);
            handle.write(new byte[count]);
        }
    }

    /**
     * A partial download must never be reachable under the name a loader will
     * open. Two of nine competitor apps get this right; the rest leave a
     * truncated file where the finished one belongs, and a truncated GGUF does
     * not crash — it loads and produces plausible garbage.
     */
    @Test
    public void keepsThePartialFileOutOfTheWayUntilItIsWhole() throws Exception {
        TalosModelStore.Slot slot = slot();
        writeBytes(slot.partial, 4096);

        assertFalse("nothing may sit under the final name yet", slot.finished.exists());
        assertTrue(slot.partial.exists());
        assertFalse("the partial must not be the final name", slot.partial.equals(slot.finished));

        slot.finish();

        assertTrue(slot.finished.exists());
        assertFalse("the partial is gone once it is whole", slot.partial.exists());
        assertFalse("and so is its sidecar", slot.sidecar.exists());
        assertEquals(4096L, slot.finished.length());
    }

    @Test
    public void aFreshSlotResumesFromNothing() {
        TalosModelStore.Resume resume = slot().resume();

        assertEquals(0L, resume.haveBytes);
        assertNull(resume.hashState);
    }

    @Test
    public void resumesFromTheCheckpointItWroteDown() throws Exception {
        TalosModelStore.Slot slot = slot();
        writeBytes(slot.partial, 60_000);
        slot.checkpoint(60_000L, "a-hash-state");

        TalosModelStore.Resume resume = store.slot(REPO, REVISION, PATH).resume();

        assertEquals(60_000L, resume.haveBytes);
        assertEquals("a-hash-state", resume.hashState);
    }

    /**
     * THE reconciliation rule. Bytes are flushed before the checkpoint is
     * written, so a kill in between leaves MORE bytes on disk than the hash
     * state accounts for. Those extra bytes have not been hashed, and there is
     * no way to hash them without re-reading — so they are thrown away.
     *
     * Bounded by the checkpoint interval: at most a few seconds of transfer,
     * paid to keep the two in step. Keeping them instead would produce a hash
     * that is quietly wrong about a file that is quietly fine.
     */
    @Test
    public void throwsAwayBytesTheHashStateDoesNotCover() throws Exception {
        TalosModelStore.Slot slot = slot();
        writeBytes(slot.partial, 60_000);
        slot.checkpoint(60_000L, "a-hash-state");
        // The process kept downloading, then died before the next checkpoint.
        writeBytes(slot.partial, 61_500);

        TalosModelStore.Resume resume = store.slot(REPO, REVISION, PATH).resume();

        assertEquals("resumes at the checkpoint, not at the file length", 60_000L, resume.haveBytes);
        assertEquals("a-hash-state", resume.hashState);
        assertEquals("and the uncovered bytes are actually gone", 60_000L, slot.partial.length());
    }

    /**
     * The other direction: fewer bytes than the checkpoint claims. That is the
     * filesystem losing a write, so the hash state is ahead of reality and
     * cannot be trusted at all. Refuse it and re-read — a slow start beats a
     * confident wrong answer.
     */
    @Test
    public void refusesAHashStateThatRanAheadOfTheBytes() throws Exception {
        TalosModelStore.Slot slot = slot();
        writeBytes(slot.partial, 60_000);
        slot.checkpoint(60_000L, "a-hash-state");
        writeBytes(slot.partial, 50_000);

        TalosModelStore.Resume resume = store.slot(REPO, REVISION, PATH).resume();

        assertEquals(50_000L, resume.haveBytes);
        assertNull("the state is ahead of the bytes, so it is worthless", resume.hashState);
    }

    /** A sidecar half-written by a kill must not be read as if it were whole. */
    @Test
    public void refusesASidecarItCannotRead() throws Exception {
        TalosModelStore.Slot slot = slot();
        writeBytes(slot.partial, 60_000);
        slot.checkpoint(60_000L, "a-hash-state");
        Files.write(slot.sidecar.toPath(), "{\"haveBytes\":60".getBytes(StandardCharsets.UTF_8));

        TalosModelStore.Resume resume = store.slot(REPO, REVISION, PATH).resume();

        assertEquals(60_000L, resume.haveBytes);
        assertNull(resume.hashState);
    }

    /**
     * Checkpointing is the one write that must survive being interrupted: it is
     * written every few seconds for hours. A torn sidecar costs the whole
     * download, so it is replaced atomically and never edited in place.
     */
    @Test
    public void leavesNoTornSidecarBehind() throws Exception {
        TalosModelStore.Slot slot = slot();
        writeBytes(slot.partial, 60_000);
        slot.checkpoint(60_000L, "first");
        slot.checkpoint(60_000L, "second");

        File[] strays = slot.sidecar.getParentFile().listFiles(
                (dir, name) -> name.endsWith(".tmp") || name.endsWith(".new"));

        assertEquals("no half-written sidecar may be left lying around", 0, strays.length);
        assertEquals("second", store.slot(REPO, REVISION, PATH).resume().hashState);
    }

    /**
     * The file names come from a remote server that anyone in the world can
     * publish to. A path is not a name, and `../` in one is how an app that
     * trusts the Hub writes wherever it likes on the phone.
     */
    @Test
    public void refusesAPathThatWouldEscapeItsOwnFolder() {
        String[] hostile = {
            "../../../../data/data/ai.talos/databases/talos.db",
            "sub/../../escape.gguf",
            "/etc/hosts",
            "C:\\Windows\\System32\\drivers\\etc\\hosts",
            "weights\\..\\..\\escape.gguf",
            "",
            ".",
            "..",
            "trailing/",
            "nul\u0000byte.gguf",
        };

        for (String path : hostile) {
            try {
                store.slot(REPO, REVISION, path);
                fail("accepted a hostile path: " + path);
            } catch (IllegalArgumentException refused) {
                assertNotNull(refused.getMessage());
            }
        }
    }

    /** Repositories publish weights in subfolders; that is ordinary and allowed. */
    @Test
    public void acceptsAnOrdinaryNestedPath() {
        TalosModelStore.Slot slot = store.slot(REPO, REVISION, "Q4_K_M/model-00001-of-00002.gguf");

        assertTrue(slot.finished.getAbsolutePath()
                .startsWith(folder.getRoot().getAbsolutePath() + File.separator));
        assertTrue(slot.finished.getName().endsWith(".gguf"));
    }

    /** Two revisions of one file are two files, never one overwriting the other. */
    @Test
    public void keepsRevisionsApart() {
        File one = store.slot(REPO, "main", PATH).finished;
        File other = store.slot(REPO, "5f2a1c9", PATH).finished;

        assertFalse(one.getAbsolutePath().equals(other.getAbsolutePath()));
    }

    /**
     * A download abandoned months ago is invisible: the user sees free space
     * disappear and has nothing to point at. Naming the leftovers is what makes
     * the storage screen able to tell the truth.
     */
    @Test
    public void namesTheLeftoversOfAbandonedDownloads() throws Exception {
        TalosModelStore.Slot abandoned = slot();
        writeBytes(abandoned.partial, 128_000);
        abandoned.checkpoint(128_000L, "state");

        TalosModelStore.Slot done = store.slot(REPO, REVISION, "other.gguf");
        writeBytes(done.partial, 2048);
        done.finish();

        java.util.List<TalosModelStore.Leftover> leftovers = store.leftovers();

        assertEquals(1, leftovers.size());
        assertEquals(128_000L, leftovers.get(0).bytes);
        assertTrue(leftovers.get(0).path.endsWith(TalosModelStore.PARTIAL_SUFFIX));
    }

    @Test
    public void discardingRemovesEveryTraceOfTheAttempt() throws Exception {
        TalosModelStore.Slot slot = slot();
        writeBytes(slot.partial, 4096);
        slot.checkpoint(4096L, "state");

        slot.discard();

        assertFalse(slot.partial.exists());
        assertFalse(slot.sidecar.exists());
        assertEquals(0, store.leftovers().size());
    }
}
