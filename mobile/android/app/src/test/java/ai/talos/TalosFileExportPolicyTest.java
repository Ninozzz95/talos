package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.Test;

public class TalosFileExportPolicyTest {

    @Test
    public void acceptsOnlyCanonicalFilesInsideTalosExportCache() throws Exception {
        File cache = Files.createTempDirectory("talos-cache").toFile();
        File root = new File(cache, "talos-export");
        assertTrue(root.mkdir());
        File direct = new File(root, "one.bin");
        assertTrue(direct.createNewFile());
        File nestedDirectory = new File(root, "nested");
        assertTrue(nestedDirectory.mkdir());
        File nested = new File(nestedDirectory, "two.bin");
        assertTrue(nested.createNewFile());
        File outside = new File(cache, "outside.bin");
        assertTrue(outside.createNewFile());

        assertTrue(TalosFileExportPolicy.trustedSource(cache, direct));
        assertFalse(TalosFileExportPolicy.trustedSource(cache, nested));
        assertFalse(TalosFileExportPolicy.trustedSource(cache, outside));
        assertFalse(TalosFileExportPolicy.trustedSource(
            cache,
            new File(root, "../outside.bin")
        ));
    }

    @Test
    public void sanitizesSuggestedNamesAndMediaTypes() {
        assertEquals(
            "Q2 report.PDF",
            TalosFileExportPolicy.safeDisplayName(" ../Q2:*? report.PDF ")
        );
        assertEquals(
            "safefdp.pdf",
            TalosFileExportPolicy.safeDisplayName("safe\u202Efdp\u2066.pdf")
        );
        assertEquals("file", TalosFileExportPolicy.safeDisplayName("////"));
        assertEquals(
            "application/pdf",
            TalosFileExportPolicy.safeMediaType("application/pdf")
        );
        assertEquals(
            "application/octet-stream",
            TalosFileExportPolicy.safeMediaType("text/plain\nmalformed")
        );
    }

    @Test
    public void neverSplitsASurrogatePairAtTheBoundedFilenameStem() {
        String prefix = "a".repeat(175);
        String safe = TalosFileExportPolicy.safeDisplayName(
            prefix + "\uD83D\uDE00tail.pdf"
        );

        assertEquals(prefix + ".pdf", safe);
        assertTrue(safe.length() <= 180);
    }

    @Test
    public void neverRetainsHalfAFlagAtTheBoundedFilenameStem() {
        String prefix = "a".repeat(174);
        String safe = TalosFileExportPolicy.safeDisplayName(
            prefix + "\uD83C\uDDEE\uD83C\uDDF9tail.pdf"
        );

        assertEquals(prefix + ".pdf", safe);
        assertTrue(safe.length() <= 180);
    }

    @Test
    public void neverSplitsOtherExtendedClustersAtTheBoundedFilenameStem() {
        assertEquals(
            "a".repeat(175) + ".txt",
            TalosFileExportPolicy.safeDisplayName(
                "a".repeat(175) + "x\u0301tail.txt"
            )
        );
        assertEquals(
            "a".repeat(175) + ".txt",
            TalosFileExportPolicy.safeDisplayName(
                "a".repeat(175) + "1\uFE0F\u20E3tail.txt"
            )
        );
        assertEquals(
            "a".repeat(174) + ".txt",
            TalosFileExportPolicy.safeDisplayName(
                "a".repeat(174) + "\uD83D\uDC4D\uD83C\uDFFDtail.txt"
            )
        );
        assertEquals(
            "a".repeat(174) + ".txt",
            TalosFileExportPolicy.safeDisplayName(
                "a".repeat(174)
                    + "\uD83D\uDC68\u200D\uD83D\uDC69\u200D"
                    + "\uD83D\uDC67\u200D\uD83D\uDC66tail.txt"
            )
        );
    }

    @Test
    public void preservesMeaningfulZwjAndZwnjClusters() {
        assertEquals(
            "family-\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66.png",
            TalosFileExportPolicy.safeDisplayName(
                "family-\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66.png"
            )
        );
        assertEquals(
            "\u0646\u0627\u0645\u0647\u200C\u0647\u0627.txt",
            TalosFileExportPolicy.safeDisplayName(
                "\u0646\u0627\u0645\u0647\u200C\u0647\u0627.txt"
            )
        );
    }

    @Test
    public void copiesEveryByteAndReportsTheExactCount() throws Exception {
        byte[] expected = new byte[131_079];
        for (int index = 0; index < expected.length; index++) {
            expected[index] = (byte) (index % 251);
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        long copied = TalosFileExportPolicy.copy(
            new ByteArrayInputStream(expected),
            output
        );

        assertEquals(expected.length, copied);
        assertTrue(java.util.Arrays.equals(expected, output.toByteArray()));
    }

    @Test
    public void removesTheCreatedDestinationWhenThePostPickerSourceIsUntrusted()
        throws Exception {
        File cache = Files.createTempDirectory("talos-cache").toFile();
        File outside = new File(cache, "outside.bin");
        assertTrue(outside.createNewFile());
        AtomicInteger cleanupCalls = new AtomicInteger();

        String failure = TalosFileExportPolicy.postPickerSourceFailure(
            cache,
            outside,
            0,
            cleanupCalls::incrementAndGet
        );

        assertEquals(TalosFileExportPolicy.UNTRUSTED_SOURCE, failure);
        assertEquals(1, cleanupCalls.get());
    }

    @Test
    public void removesTheCreatedDestinationWhenThePostPickerSizeChanged()
        throws Exception {
        File cache = Files.createTempDirectory("talos-cache").toFile();
        File root = new File(cache, "talos-export");
        assertTrue(root.mkdir());
        File direct = new File(root, "changed.bin");
        assertTrue(direct.createNewFile());
        AtomicInteger cleanupCalls = new AtomicInteger();

        String failure = TalosFileExportPolicy.postPickerSourceFailure(
            cache,
            direct,
            1,
            cleanupCalls::incrementAndGet
        );

        assertEquals(TalosFileExportPolicy.SIZE_MISMATCH, failure);
        assertEquals(1, cleanupCalls.get());
    }

    @Test
    public void keepsTheDestinationWhenThePostPickerSourceStillMatches()
        throws Exception {
        File cache = Files.createTempDirectory("talos-cache").toFile();
        File root = new File(cache, "talos-export");
        assertTrue(root.mkdir());
        File direct = new File(root, "exact.bin");
        Files.write(direct.toPath(), new byte[] { 1, 2, 3 });
        AtomicInteger cleanupCalls = new AtomicInteger();

        assertNull(TalosFileExportPolicy.stagedSourceFailure(cache, direct, 3));
        String failure = TalosFileExportPolicy.postPickerSourceFailure(
            cache,
            direct,
            3,
            cleanupCalls::incrementAndGet
        );

        assertNull(failure);
        assertEquals(0, cleanupCalls.get());
    }
}
