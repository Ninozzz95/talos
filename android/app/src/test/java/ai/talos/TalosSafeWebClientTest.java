package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.net.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.ResponseBody;
import org.junit.Test;

public class TalosSafeWebClientTest {

    private static final class ScriptedTransport implements TalosSafeWebClient.Transport {
        final List<String> requested = new ArrayList<>();
        final List<TalosSafeWebClient.TransportResponse> responses = new ArrayList<>();
        final List<TalosSafeWebClient.BytesResponse> byteResponses = new ArrayList<>();

        @Override
        public TalosSafeWebClient.TransportResponse execute(HttpUrl url) throws IOException {
            requested.add(url.toString());
            if (responses.isEmpty()) throw new IOException("no scripted response");
            return responses.remove(0);
        }

        @Override
        public TalosSafeWebClient.BytesResponse executeBytes(HttpUrl url) throws IOException {
            requested.add(url.toString());
            if (byteResponses.isEmpty()) throw new IOException("no scripted byte response");
            return byteResponses.remove(0);
        }
    }

    @Test
    public void rejectsCredentialsPortsAndLocalLiteralBeforeTransport() throws Exception {
        for (String url : new String[] {
            "https://user:secret@example.org/",
            "https://example.org:8443/",
            "http://127.0.0.1/",
            "http://[::1]/",
            "http://169.254.169.254/latest/meta-data/",
        }) {
            ScriptedTransport transport = new ScriptedTransport();
            TalosSafeWebClient client = new TalosSafeWebClient(transport);
            try {
                client.read(url);
                fail(url + " must be blocked");
            } catch (IOException expected) {
                assertTrue(expected.getMessage().startsWith("TALOS_WEB_URL_BLOCKED"));
                assertTrue(transport.requested.isEmpty());
            }
        }
    }

    @Test
    public void followsOnePublicRedirectAndReturnsTheValidatedFinalUrl() throws Exception {
        ScriptedTransport transport = new ScriptedTransport();
        transport.responses.add(new TalosSafeWebClient.TransportResponse(
            302, "", "/final", "https://example.org/start"
        ));
        transport.responses.add(new TalosSafeWebClient.TransportResponse(
            200, "<html>final</html>", null, "https://example.org/final"
        ));

        TalosSafeWebClient.Result result = new TalosSafeWebClient(transport)
            .read("https://example.org/start");

        assertEquals(200, result.status);
        assertEquals("https://example.org/final", result.url);
        assertEquals("<html>final</html>", result.body);
        assertEquals(2, transport.requested.size());
    }

    @Test
    public void validatesRedirectTargetBeforeASecondTransportCall() throws Exception {
        ScriptedTransport transport = new ScriptedTransport();
        transport.responses.add(new TalosSafeWebClient.TransportResponse(
            302, "", "http://192.168.1.1/admin", "https://example.org/start"
        ));

        try {
            new TalosSafeWebClient(transport).read("https://example.org/start");
            fail("private redirect must be blocked");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().startsWith("TALOS_WEB_URL_BLOCKED"));
            assertEquals(1, transport.requested.size());
        }
    }

    @Test
    public void rejectsHttpsDowngradeRedirectLoopsAndExcessiveHops() throws Exception {
        ScriptedTransport downgrade = new ScriptedTransport();
        downgrade.responses.add(new TalosSafeWebClient.TransportResponse(
            302, "", "http://example.org/plain", "https://example.org/start"
        ));
        assertBlocked(new TalosSafeWebClient(downgrade), "https://example.org/start", "TALOS_WEB_REDIRECT_DOWNGRADE");

        ScriptedTransport loop = new ScriptedTransport();
        loop.responses.add(new TalosSafeWebClient.TransportResponse(
            302, "", "/start", "https://example.org/start"
        ));
        assertBlocked(new TalosSafeWebClient(loop), "https://example.org/start", "TALOS_WEB_REDIRECT_LOOP");

        ScriptedTransport hops = new ScriptedTransport();
        for (int index = 1; index <= 6; index++) {
            hops.responses.add(new TalosSafeWebClient.TransportResponse(
                302, "", "/hop-" + index, "https://example.org/hop-" + (index - 1)
            ));
        }
        assertBlocked(new TalosSafeWebClient(hops), "https://example.org/hop-0", "TALOS_WEB_TOO_MANY_REDIRECTS");
    }

    @Test
    public void productionClientPinsDnsAndDisablesProxyAndAutomaticRedirects() {
        OkHttpClient client = TalosSafeWebClient.productionHttpClient();

        assertTrue(client.dns() instanceof TalosPublicDns);
        assertSame(Proxy.NO_PROXY, client.proxy());
        assertFalse(client.followRedirects());
        assertFalse(client.followSslRedirects());
    }

    @Test
    public void responseBodyIsBoundedBeforeItCrossesTheBridge() throws Exception {
        byte[] exact = "x".repeat(TalosSafeWebClient.MAX_RESPONSE_BYTES)
            .getBytes(StandardCharsets.UTF_8);
        ResponseBody accepted = ResponseBody.create(
            exact,
            MediaType.get("text/html; charset=utf-8")
        );
        assertEquals(TalosSafeWebClient.MAX_RESPONSE_BYTES, TalosSafeWebClient.boundedBody(accepted).length());

        ResponseBody oversized = ResponseBody.create(
            new byte[TalosSafeWebClient.MAX_RESPONSE_BYTES + 1],
            MediaType.get("text/html")
        );
        try {
            TalosSafeWebClient.boundedBody(oversized);
            fail("oversized response must fail before the bridge");
        } catch (IOException expected) {
            assertEquals("TALOS_WEB_RESPONSE_TOO_LARGE", expected.getMessage());
        }
    }

    /**
     * Library source cards need the BYTES of a favicon and a preview image, and
     * the text path decodes every response as a string. The danger in adding a
     * second path is that it grows its own weaker copy of the URL policy, so
     * these tests exist to prove it does not: the byte path is refused for the
     * same reasons, at the same points, as the text path.
     */
    @Test
    public void bytePathRefusesEveryUrlTheTextPathRefuses() throws Exception {
        for (String url : new String[] {
            "https://user:secret@example.org/icon.png",
            "https://example.org:8443/icon.png",
            "http://127.0.0.1/icon.png",
            "http://[::1]/icon.png",
            "http://169.254.169.254/icon.png",
            "https://router.lan/icon.png",
        }) {
            ScriptedTransport transport = new ScriptedTransport();
            TalosSafeWebClient client = new TalosSafeWebClient(transport);
            try {
                client.readBytes(url);
                fail("byte path must refuse " + url);
            } catch (IOException expected) {
                assertTrue(expected.getMessage().startsWith("TALOS_WEB_URL_BLOCKED"));
            }
            assertTrue("nothing may be fetched", transport.requested.isEmpty());
        }
    }

    @Test
    public void bytePathWalksRedirectsThroughTheSamePolicy() throws Exception {
        ScriptedTransport transport = new ScriptedTransport();
        transport.byteResponses.add(new TalosSafeWebClient.BytesResponse(
            302, new byte[0], "image/png", "https://cdn.example.org/final.png",
            "https://example.org/icon.png"
        ));
        transport.byteResponses.add(new TalosSafeWebClient.BytesResponse(
            200, new byte[] { 1, 2, 3 }, "image/png", null,
            "https://cdn.example.org/final.png"
        ));
        TalosSafeWebClient client = new TalosSafeWebClient(transport);

        TalosSafeWebClient.BytesResult result = client.readBytes("https://example.org/icon.png");

        assertEquals(200, result.status);
        assertEquals("https://cdn.example.org/final.png", result.url);
        assertEquals(3, result.bytes.length);
        assertEquals(2, transport.requested.size());
    }

    @Test
    public void bytePathRefusesAnythingThatIsNotAnImage() throws Exception {
        // A favicon URL that answers with HTML is a redirect to a login page or
        // a soft 404, not an icon. Storing it would put a document where an
        // image is expected and hand the renderer bytes it never asked for.
        ScriptedTransport transport = new ScriptedTransport();
        transport.byteResponses.add(new TalosSafeWebClient.BytesResponse(
            200, "<html>not an icon</html>".getBytes(StandardCharsets.UTF_8),
            "text/html", null, "https://example.org/favicon.ico"
        ));
        TalosSafeWebClient client = new TalosSafeWebClient(transport);

        try {
            client.readBytes("https://example.org/favicon.ico");
            fail("a non-image content type must be refused");
        } catch (IOException expected) {
            assertEquals("TALOS_WEB_NOT_AN_IMAGE", expected.getMessage());
        }
    }

    @Test
    public void imageBytesAreBoundedFarBelowThePageLimit() throws Exception {
        // An icon is not a document: the page bound would let a multi-megabyte
        // "favicon" through and it would be stored on the device forever.
        assertTrue(
            TalosSafeWebClient.MAX_IMAGE_BYTES < TalosSafeWebClient.MAX_RESPONSE_BYTES
        );

        ResponseBody oversized = ResponseBody.create(
            new byte[TalosSafeWebClient.MAX_IMAGE_BYTES + 1],
            MediaType.get("image/png")
        );
        try {
            TalosSafeWebClient.boundedBytes(oversized);
            fail("an oversized image must fail before the bridge");
        } catch (IOException expected) {
            assertEquals("TALOS_WEB_RESPONSE_TOO_LARGE", expected.getMessage());
        }
    }

    private static void assertBlocked(
        TalosSafeWebClient client,
        String url,
        String code
    ) throws Exception {
        try {
            client.read(url);
            fail(code + " expected");
        } catch (IOException expected) {
            assertEquals(code, expected.getMessage());
        }
    }
}
