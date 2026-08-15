package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Reading the app's own secret store from a job with no WebView alive.
 *
 * The interesting part is not the cryptography — that is the platform's — but
 * the two facts this class borrows from a dependency: where the store keeps its
 * entries and what it prefixes their names with. Borrowed facts rot silently.
 * A version bump that renames the prefix would not fail a build; it would make
 * every gated download quietly anonymous, months later, on someone else's
 * phone.
 *
 * So they are pinned against the library's own source, here, where a
 * `npm update` fails the gate instead.
 */
public class TalosSecretReaderTest {

    private static final Path LIBRARY = Paths.get(
            "..", "..", "node_modules", "@aparajita", "capacitor-secure-storage");

    private static String read(Path path) throws Exception {
        assertTrue("the dependency must be installed: " + path.toAbsolutePath(),
                Files.exists(path));
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }

    /**
     * The prefix the library puts in front of every key. If it ever changes,
     * this class looks in the wrong place and finds nothing — which reads as
     * "no token" and downloads anonymously, so nothing crashes and nobody
     * finds out.
     */
    @Test
    public void pinsThePrefixItBorrowsFromTheLibrary() throws Exception {
        String source = read(LIBRARY.resolve("dist/esm/base.js"));

        assertTrue("the library no longer declares '" + TalosSecretReader.PREFIX + "'",
                source.contains("'" + TalosSecretReader.PREFIX + "'"));
    }

    /** And the preferences file the entries actually live in. */
    @Test
    public void pinsThePreferencesFileItReadsFrom() throws Exception {
        String source = read(LIBRARY.resolve(
                "android/src/main/java/com/aparajita/capacitor/securestorage/SecureStorage.java"));

        assertTrue("the library no longer uses " + TalosSecretReader.PREFERENCES,
                source.contains(TalosSecretReader.PREFERENCES));
    }

    /**
     * And that it still splits ciphertext from IV the same way. This one is the
     * quiet disaster: a changed separator means `splitCiphertext` returns two
     * halves of the wrong thing.
     */
    @Test
    public void pinsTheSeparatorBetweenCiphertextAndIv() throws Exception {
        String source = read(LIBRARY.resolve(
                "android/src/main/java/com/aparajita/capacitor/securestorage/SecureStorage.java"));

        assertTrue("the library no longer separates data and IV with U+0010",
                source.contains("'\\u0010'"));
        assertTrue("nor uses AES/GCM", source.contains("AES/GCM/NoPadding"));
    }

    /** The alias is the library's prefix, then the app's own namespace. */
    @Test
    public void composesTheAliasTheStoreActuallyWroteUnder() {
        assertEquals("capacitor-storage_talos.provider.key.huggingface",
                TalosSecretReader.aliasForProvider("huggingface"));
    }

    /**
     * A malformed entry is a secret we do not have.
     *
     * Half a decrypted string in an `Authorization` header would be sent to the
     * Hub as a credential — so anything that is not exactly ciphertext,
     * separator, IV is refused outright.
     */
    @Test
    public void refusesAnythingThatIsNotExactlyCiphertextAndIv() {
        assertNull(TalosSecretReader.splitCiphertext(null));
        assertNull(TalosSecretReader.splitCiphertext(""));
        assertNull("no separator at all", TalosSecretReader.splitCiphertext("just-some-text"));
        assertNull("two separators", TalosSecretReader.splitCiphertext("abc"));
        assertNull("empty ciphertext", TalosSecretReader.splitCiphertext("aXY"));
        assertNull("empty iv", TalosSecretReader.splitCiphertext("aXY"));
    }

    /**
     * The store writes JSON. `SecureStorage.set` stringifies and `get` parses,
     * so JavaScript round-trips cleanly and nothing looks wrong from there —
     * but reading it natively without unwrapping sent
     * `Authorization: Bearer "hf_xxx"` to the Hub, quotes included.
     *
     * Found by an adversarial review on 2026-08-01. The pins beside this test
     * covered the prefix, the file and the cipher, and never the ENCODING: they
     * guarded everything except the thing that was broken.
     */
    @Test
    public void unwrapsTheJsonTheStoreActuallyWrote() {
        assertEquals("hf_abc123", TalosSecretReader.unwrapJson("\"hf_abc123\""));
    }

    @Test
    public void leavesAValueThatWasNeverWrappedAlone() {
        assertEquals("hf_abc123", TalosSecretReader.unwrapJson("hf_abc123"));
    }

    /** A quote inside the value survives; JSON escaped it on the way in. */
    @Test
    public void unescapesWhatJsonEscaped() {
        assertEquals("a\"b", TalosSecretReader.unwrapJson("\"a\\\"b\""));
        assertEquals("a\\b", TalosSecretReader.unwrapJson("\"a\\\\b\""));
    }

    /** An empty token is no token, wrapped or not. */
    @Test
    public void treatsAnEmptyValueAsAbsent() {
        assertNull(TalosSecretReader.unwrapJson("\"\""));
        assertNull(TalosSecretReader.unwrapJson(""));
        assertNull(TalosSecretReader.unwrapJson(null));
    }

    /**
     * And the encoding itself is pinned now, so a library that stops
     * stringifying fails here rather than in the field.
     */
    @Test
    public void pinsThatTheStoreStillWritesJson() throws Exception {
        String source = read(LIBRARY.resolve("dist/esm/base.js"));

        assertTrue("the library no longer JSON-encodes what it stores",
                source.contains("JSON.stringify"));
        assertTrue("nor decodes it on the way back", source.contains("JSON.parse"));
    }

    @Test
    public void splitsAWellFormedEntry() {
        String[] parts = TalosSecretReader.splitCiphertext("Y2lwaGVyaXY");

        assertEquals("Y2lwaGVy", parts[0]);
        assertEquals("aXY", parts[1]);
    }
}
