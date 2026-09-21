package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Random;

/**
 * A hand-written hash that is never compared to a reference is worse than no
 * hash at all — it reports success and nobody checks.
 *
 * So every assertion here is against `MessageDigest` itself, on the published
 * vectors and on megabytes of random data at every awkward boundary. The class
 * exists only because the JDK cannot export a digest's state, and the state is
 * the whole point: a download killed at 61% must resume with the hash already
 * carrying those 61%, instead of reading four gigabytes a second time to
 * verify a file it just finished writing.
 */
public class TalosResumableSha256Test {

    private static String reference(byte[] data) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        StringBuilder out = new StringBuilder();
        for (byte value : digest.digest(data)) out.append(String.format("%02x", value));
        return out.toString();
    }

    private static String ours(byte[] data) {
        TalosResumableSha256 digest = new TalosResumableSha256();
        digest.update(data, 0, data.length);
        return digest.hex();
    }

    @Test
    public void matchesThePublishedVectors() {
        assertEquals(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                ours(new byte[0]));
        assertEquals(
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                ours("abc".getBytes(StandardCharsets.UTF_8)));
    }

    /**
     * The lengths where a block-based hash goes wrong: either side of 64, of
     * 56 (where the length field stops fitting in the final block), and of a
     * multiple of the block size.
     */
    @Test
    public void matchesTheJdkAtEveryAwkwardLength() throws Exception {
        Random random = new Random(20260731L);
        int[] lengths = { 0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 1000, 65_536 };
        for (int length : lengths) {
            byte[] data = new byte[length];
            random.nextBytes(data);
            assertEquals("length " + length, reference(data), ours(data));
        }
    }

    @Test
    public void matchesTheJdkWhenFedInRaggedPieces() throws Exception {
        Random random = new Random(1L);
        byte[] data = new byte[4 * 1024 * 1024];
        random.nextBytes(data);

        TalosResumableSha256 digest = new TalosResumableSha256();
        int offset = 0;
        while (offset < data.length) {
            int chunk = Math.min(1 + random.nextInt(9999), data.length - offset);
            digest.update(data, offset, chunk);
            offset += chunk;
        }

        assertEquals(reference(data), digest.hex());
    }

    /** Reading the answer must not consume the digest: more bytes can follow. */
    @Test
    public void canBeAskedForTheAnswerAndThenCarryOn() throws Exception {
        byte[] first = "hello ".getBytes(StandardCharsets.UTF_8);
        byte[] second = "world".getBytes(StandardCharsets.UTF_8);

        TalosResumableSha256 digest = new TalosResumableSha256();
        digest.update(first, 0, first.length);
        String midway = digest.hex();
        digest.update(second, 0, second.length);

        assertEquals(reference(first), midway);
        assertEquals(reference("hello world".getBytes(StandardCharsets.UTF_8)), digest.hex());
        assertNotEquals(midway, digest.hex());
    }

    /**
     * THE test this class exists for: the process dies mid-download, the state
     * comes back off disk, and the finished hash is identical to one computed
     * in a single pass. Without it, verifying a 4 GB model means reading it all
     * again — minutes of disk on a phone, for something we could remember.
     */
    @Test
    public void survivesBeingWrittenDownAndPickedUpAgain() throws Exception {
        Random random = new Random(7L);
        byte[] data = new byte[3_000_000];
        random.nextBytes(data);

        TalosResumableSha256 before = new TalosResumableSha256();
        before.update(data, 0, 1_234_567);
        String saved = before.exportState();

        // A different process, holding nothing but that line.
        TalosResumableSha256 after = TalosResumableSha256.restore(saved);
        after.update(data, 1_234_567, data.length - 1_234_567);

        assertEquals(reference(data), after.hex());
        assertEquals(1_234_567L, TalosResumableSha256.restore(saved).bytesHashed());
    }

    @Test
    public void survivesBeingInterruptedRepeatedly() throws Exception {
        Random random = new Random(11L);
        byte[] data = new byte[1_500_000];
        random.nextBytes(data);

        TalosResumableSha256 digest = new TalosResumableSha256();
        int offset = 0;
        while (offset < data.length) {
            int chunk = Math.min(1 + random.nextInt(50_000), data.length - offset);
            digest.update(data, offset, chunk);
            offset += chunk;
            // Killed and restored, over and over, at boundaries that are never
            // aligned to anything.
            digest = TalosResumableSha256.restore(digest.exportState());
        }

        assertEquals(reference(data), digest.hex());
    }

    /**
     * A corrupt sidecar must not produce a confident wrong hash. Refusing is
     * recoverable — the file is re-read once — while a silently wrong state
     * would fail verification on a file that is perfectly good, or pass one
     * that is not.
     */
    @Test
    public void refusesAStateItCannotRead() {
        assertNull(TalosResumableSha256.restore(null));
        assertNull(TalosResumableSha256.restore(""));
        assertNull(TalosResumableSha256.restore("not:a:state"));
        assertNull(TalosResumableSha256.restore("1:2:3:4:5:6:7:8:9:99:"));
        assertNull(TalosResumableSha256.restore("1:2:3:4:5:6:7:8:9:2:ab"));
    }
}
