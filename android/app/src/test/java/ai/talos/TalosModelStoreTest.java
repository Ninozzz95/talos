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
 * The whole file turns on one consequence of claiming space up front: a
 * reserved file is already its full length. Its size therefore says nothing
 * about how much has been downloaded, and anything that reads progress off the
 * file size will call an empty reservation a finished model.
 */
public class TalosModelStoreTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private static final String REPO = "unsloth/Qwen3-4B-GGUF";
    private static final String REVISION = "main";
    private static final String PATH = "Qwen3-4B-Q4_K_M.gguf";
    private static final long TOTAL = 4L * 1024 * 1024 * 1024;

    private TalosModelStore store;

    /** Stands in for `StorageManager.allocateBytes`, which grows the file. */
    private final TalosModelStore.Reservation reservation = (file, totalBytes) -> file.setLength(totalBytes);

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

        slot.finish(4096L);

        assertTrue(slot.finished.exists());
        assertFalse("the partial is gone once it is whole", slot.partial.exists());
        assertFalse("and so is its sidecar", slot.sidecar.exists());
        assertEquals(4096L, slot.finished.length());
    }

    @Test
    public void aFreshSlotResumesFromNothing() {
        TalosModelStore.Resume resume = slot().resume(TOTAL);

        assertEquals(0L, resume.haveBytes);
        assertNull(resume.hashState);
    }

    /**
     * THE test this class exists for.
     *
     * The space is claimed before the first byte is requested, so the file is
     * four gigabytes long while holding nothing. Anything that reads progress
     * off the file size calls that a finished download — and then hashes four
     * gigabytes of zeroes, or worse, does not hash at all and hands the user a
     * model made of nothing.
     */
    @Test
    public void neverMistakesReservedSpaceForDownloadedBytes() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(TOTAL, reservation);

        assertEquals("the reservation is real", TOTAL, slot.partial.length());
        assertEquals("and none of it is progress", 0L, slot.resume(TOTAL).haveBytes);
    }

    @Test
    public void resumesFromTheCheckpointItWroteDown() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(TOTAL, reservation);
        slot.checkpoint(TOTAL, 1_500_000_000L, "a-hash-state");

        TalosModelStore.Resume resume = store.slot(REPO, REVISION, PATH).resume(TOTAL);

        assertEquals(1_500_000_000L, resume.haveBytes);
        assertEquals("a-hash-state", resume.hashState);
    }

    /**
     * The sidecar is the only record of progress, so an unreadable one means
     * the honest answer is zero. The reservation itself is kept: throwing it
     * away hands the space back to whatever else on the phone wants it, which
     * is the failure the reservation existed to prevent.
     */
    @Test
    public void keepsTheReservationButTrustsNothingWhenTheSidecarIsUnreadable() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(TOTAL, reservation);
        slot.checkpoint(TOTAL, 1_500_000_000L, "a-hash-state");
        Files.write(slot.sidecar.toPath(), "{\"haveBytes\":60".getBytes(StandardCharsets.UTF_8));

        TalosModelStore.Resume resume = store.slot(REPO, REVISION, PATH).resume(TOTAL);

        assertEquals(0L, resume.haveBytes);
        assertNull(resume.hashState);
        assertEquals("the claimed space is still ours", TOTAL, slot.partial.length());
    }

    /**
     * A note about a file of a different length is a note about a different
     * file.
     *
     * The sidecar used to be trusted on nothing but its own say-so, so a note
     * left by an attempt at another revision of the same path would be read as
     * progress against the new one — and the hash then computed across a
     * mixture of two files. Found by an adversarial review, 2026-08-01.
     * Refusing costs one re-download; trusting produces a proof of nothing.
     */
    @Test
    public void refusesASidecarWrittenAboutADifferentFile() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(TOTAL, reservation);
        slot.checkpoint(TOTAL, 1_500_000_000L, "a-hash-state");

        // The same path at another revision: a file of a different length.
        // The partial does not shrink, so nothing on disk gives this away —
        // only the length the caller is asking to resume FOR.
        TalosModelStore.Resume resume = store.slot(REPO, REVISION, PATH).resume(TOTAL / 2);

        assertEquals(0L, resume.haveBytes);
        assertNull(resume.hashState);
    }

    /** And the note is still good for the file it was actually written about. */
    @Test
    public void acceptsTheSidecarForTheFileItDescribes() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(TOTAL, reservation);
        slot.checkpoint(TOTAL, 1_500_000_000L, "a-hash-state");

        assertEquals(1_500_000_000L, store.slot(REPO, REVISION, PATH).resume(TOTAL).haveBytes);
    }

    /** A record describing bytes past the end of the file describes a hole. */
    @Test
    public void refusesACheckpointThatRanPastTheFile() throws Exception {
        TalosModelStore.Slot slot = slot();
        writeBytes(slot.partial, 50_000);
        slot.checkpoint(TOTAL, 60_000L, "a-hash-state");

        TalosModelStore.Resume resume = store.slot(REPO, REVISION, PATH).resume(TOTAL);

        assertEquals(0L, resume.haveBytes);
        assertNull(resume.hashState);
    }

    /** Claiming space twice must not throw away what is already downloaded. */
    @Test
    public void preparingAgainLeavesAnInterruptedDownloadAlone() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(TOTAL, reservation);
        slot.checkpoint(TOTAL, 900_000_000L, "state");

        store.slot(REPO, REVISION, PATH).prepare(TOTAL, reservation);

        assertEquals(900_000_000L, store.slot(REPO, REVISION, PATH).resume(TOTAL).haveBytes);
    }

    /**
     * Checkpointing is the one write that must survive being interrupted: it is
     * written every few seconds for hours, and the Task Manager kills the
     * process outright without ever calling `onStopJob`. A torn sidecar costs
     * the whole download, so it is replaced atomically and never edited.
     */
    @Test
    public void leavesNoTornSidecarBehind() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(TOTAL, reservation);
        slot.checkpoint(TOTAL, 60_000L, "first");
        slot.checkpoint(TOTAL, 60_000L, "second");

        File[] strays = slot.sidecar.getParentFile().listFiles(
                (dir, name) -> name.endsWith(".tmp") || name.endsWith(".new"));

        assertEquals("no half-written sidecar may be left lying around", 0, strays.length);
        assertEquals("second", store.slot(REPO, REVISION, PATH).resume(TOTAL).hashState);
    }

    /**
     * A reservation may hand back more room than was asked for. A model file
     * one byte longer than the repository says is a model file that fails its
     * own hash — after the download, when it is far too late to be useful.
     */
    @Test
    public void publishesExactlyTheLengthTheRepositoryPromised() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(20_000L, (file, total) -> file.setLength(total + 4096));

        slot.finish(20_000L);

        assertEquals(20_000L, slot.finished.length());
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
     * Leftovers matter more here than anywhere else: because the space is
     * claimed up front, an attempt abandoned after ten seconds still holds the
     * whole four gigabytes. The user sees free space disappear and has nothing
     * to point at, so the storage screen has to be able to name it.
     */
    @Test
    public void namesTheLeftoversOfAbandonedDownloads() throws Exception {
        TalosModelStore.Slot abandoned = slot();
        abandoned.prepare(128_000L, reservation);
        abandoned.checkpoint(128_000L, 64_000L, "state");

        TalosModelStore.Slot done = store.slot(REPO, REVISION, "other.gguf");
        writeBytes(done.partial, 2048);
        done.finish(2048L);

        java.util.List<TalosModelStore.Leftover> leftovers = store.leftovers().entries;

        assertEquals(1, leftovers.size());
        assertEquals("what it actually costs the phone, not what was downloaded",
                128_000L, leftovers.get(0).bytes);
        assertTrue(leftovers.get(0).path.endsWith(TalosModelStore.PARTIAL_SUFFIX));
    }

    /**
     * A store nobody has downloaded into is EMPTY, and must not look broken.
     *
     * The other half of the pair below. If "I have not looked yet" were
     * reported as a failure, every fresh install would open with an error about
     * a folder that is simply not there yet.
     */
    @Test
    public void aStoreNothingHasBeenDownloadedIntoIsEmptyAndNotBroken() {
        TalosModelStore empty = new TalosModelStore(new File(folder.getRoot(), "never-used"));

        TalosModelStore.Listing listing = empty.finished();

        assertTrue("nothing downloaded means no models", listing.entries.isEmpty());
        assertTrue("and it is a complete answer, not a failed one", listing.complete());
    }

    /**
     * THE test this change exists for.
     *
     * `File.listFiles()` answers null to "not a directory", to "permission
     * denied" and to an I/O error alike, and the code that consumed it treated
     * null as an empty list. So a folder the app could not open travelled all
     * the way to the model picker as "no models downloaded" — the opposite
     * advice from the one the user needed. It cost three rounds of debugging on
     * a real tablet on 2026-08-01, with a two-gigabyte model sitting in the
     * folder the whole time.
     *
     * A plain file where the models folder belongs is the same failure through
     * the same channel, and it is the one that can be provoked identically on
     * every machine: no chmod, no root, no platform differences. What is
     * asserted is that the walk SAYS SO — with a cause — rather than answering
     * "empty" and letting the interface invent an explanation.
     */
    @Test
    public void aFolderItCannotReadIsSaidOutLoud() throws Exception {
        File root = folder.newFolder("blocked");
        // "models" exists but is not a directory: unreadable, definitively.
        assertTrue(new File(root, "models").createNewFile());
        TalosModelStore blocked = new TalosModelStore(root);

        TalosModelStore.Listing listing = blocked.finished();

        assertTrue("nothing could be listed", listing.entries.isEmpty());
        assertFalse("and that emptiness is NOT an answer", listing.complete());
        assertEquals(1, listing.unreadable.size());
        assertTrue("the path has to be nameable to be fixable",
                listing.unreadable.get(0).path.contains("models"));
        assertNotNull("a cause, or the message is as useless as the silence was",
                listing.unreadable.get(0).reason);
        assertFalse("the cause must not be empty", listing.unreadable.get(0).reason.isEmpty());
        // No stack trace: this string is shown to a person.
        assertFalse(listing.unreadable.get(0).reason.contains("\n"));
    }

    /** The leftovers walk is the same walk, so it owes the same honesty. */
    @Test
    public void theLeftoversWalkIsEquallyHonestAboutWhatItCouldNotRead() throws Exception {
        File root = folder.newFolder("blocked-leftovers");
        assertTrue(new File(root, "models").createNewFile());

        TalosModelStore.Listing listing = new TalosModelStore(root).leftovers();

        assertFalse("a storage total computed over a folder it could not open is a lie",
                listing.complete());
    }

    @Test
    public void discardingGivesBackEveryByteItClaimed() throws Exception {
        TalosModelStore.Slot slot = slot();
        slot.prepare(128_000L, reservation);
        slot.checkpoint(TOTAL, 4096L, "state");

        slot.discard();

        assertFalse(slot.partial.exists());
        assertFalse(slot.sidecar.exists());
        assertEquals(0, store.leftovers().entries.size());
    }
}
