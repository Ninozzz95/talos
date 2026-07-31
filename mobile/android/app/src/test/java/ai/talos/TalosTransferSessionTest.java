package ai.talos;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

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
}
