package ai.talos;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.Proxy;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import okhttp3.Dns;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Bounded GET-only page client. It owns redirects so every destination passes
 * the same URL policy, while OkHttp owns TLS, SNI and the validated DNS list.
 */
final class TalosSafeWebClient {

    static final int MAX_REDIRECTS = 5;
    static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

    interface Transport {
        TransportResponse execute(HttpUrl url) throws IOException;

        default void cancelAll() {}
    }

    static final class TransportResponse {
        final int status;
        final String body;
        final String location;
        final String url;

        TransportResponse(int status, String body, String location, String url) {
            this.status = status;
            this.body = body;
            this.location = location;
            this.url = url;
        }
    }

    static final class Result {
        final int status;
        final String url;
        final String body;

        Result(int status, String url, String body) {
            this.status = status;
            this.url = url;
            this.body = body;
        }
    }

    private final Transport transport;

    TalosSafeWebClient(Transport transport) {
        this.transport = transport;
    }

    static TalosSafeWebClient production() {
        return new TalosSafeWebClient(new OkHttpTransport(productionHttpClient()));
    }

    static OkHttpClient productionHttpClient() {
        return new OkHttpClient.Builder()
            .dns(new TalosPublicDns(Dns.SYSTEM))
            .proxy(Proxy.NO_PROXY)
            .followRedirects(false)
            .followSslRedirects(false)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .callTimeout(45, TimeUnit.SECONDS)
            .build();
    }

    Result read(String rawUrl) throws IOException {
        HttpUrl current = validate(rawUrl);
        Set<String> visited = new HashSet<>();
        int redirects = 0;

        while (true) {
            String key = current.toString();
            if (!visited.add(key)) throw new IOException("TALOS_WEB_REDIRECT_LOOP");

            TransportResponse response = transport.execute(current);
            if (!isRedirect(response.status)) {
                HttpUrl finalUrl = validate(response.url);
                return new Result(response.status, finalUrl.toString(), response.body);
            }

            if (response.location == null || response.location.trim().isEmpty()) {
                throw new IOException("TALOS_WEB_REDIRECT_INVALID");
            }
            if (redirects >= MAX_REDIRECTS) {
                throw new IOException("TALOS_WEB_TOO_MANY_REDIRECTS");
            }

            HttpUrl resolved = current.resolve(response.location);
            if (resolved == null) throw new IOException("TALOS_WEB_REDIRECT_INVALID");
            HttpUrl next = validate(resolved.toString());
            if ("https".equals(current.scheme()) && "http".equals(next.scheme())) {
                throw new IOException("TALOS_WEB_REDIRECT_DOWNGRADE");
            }
            current = next;
            redirects++;
        }
    }

    void cancelAll() {
        transport.cancelAll();
    }

    private static HttpUrl validate(String rawUrl) throws IOException {
        final HttpUrl url;
        try {
            url = new Request.Builder().url(rawUrl).get().build().url();
        } catch (RuntimeException error) {
            throw blocked("invalid");
        }

        if (!"http".equals(url.scheme()) && !"https".equals(url.scheme())) {
            throw blocked("scheme");
        }
        if (!url.username().isEmpty() || !url.password().isEmpty()) {
            throw blocked("credentials");
        }
        if (
            ("http".equals(url.scheme()) && url.port() != 80)
            || ("https".equals(url.scheme()) && url.port() != 443)
        ) {
            throw blocked("port");
        }

        String host = url.host().toLowerCase(Locale.ROOT);
        if (
            host.equals("localhost")
            || host.endsWith(".localhost")
            || host.endsWith(".local")
            || host.endsWith(".internal")
            || host.endsWith(".lan")
            || host.endsWith(".home.arpa")
        ) {
            throw blocked("hostname");
        }

        if (host.contains(":") || host.matches("[0-9.]+")) {
            try {
                if (!TalosPublicAddressPolicy.isPublic(InetAddress.getByName(host))) {
                    throw blocked("address");
                }
            } catch (IOException error) {
                if (error.getMessage() != null && error.getMessage().startsWith("TALOS_WEB_URL_BLOCKED")) {
                    throw error;
                }
                throw blocked("address");
            }
        }

        return url.newBuilder().fragment(null).build();
    }

    private static IOException blocked(String reason) {
        return new IOException("TALOS_WEB_URL_BLOCKED:" + reason);
    }

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    static String boundedBody(ResponseBody body) throws IOException {
        if (body == null) return "";
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (InputStream input = body.byteStream()) {
            byte[] buffer = new byte[16 * 1024];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) {
                    throw new IOException("TALOS_WEB_RESPONSE_TOO_LARGE");
                }
                output.write(buffer, 0, read);
            }
        }

        Charset charset = StandardCharsets.UTF_8;
        MediaType mediaType = body.contentType();
        if (mediaType != null) {
            Charset declared = mediaType.charset(StandardCharsets.UTF_8);
            if (declared != null) charset = declared;
        }
        return output.toString(charset.name());
    }

    private static final class OkHttpTransport implements Transport {

        private final OkHttpClient client;

        OkHttpTransport(OkHttpClient client) {
            this.client = client;
        }

        @Override
        public TransportResponse execute(HttpUrl url) throws IOException {
            Request request = new Request.Builder()
                .url(url)
                .get()
                .header("accept", "text/html,application/xhtml+xml")
                .header(
                    "user-agent",
                    "Mozilla/5.0 (Android) AppleWebKit/537.36 Chrome/146 Mobile Safari/537.36"
                )
                .build();

            try (Response response = client.newCall(request).execute()) {
                String body = isRedirect(response.code()) ? "" : TalosSafeWebClient.boundedBody(response.body());
                return new TransportResponse(
                    response.code(),
                    body,
                    response.header("location"),
                    response.request().url().toString()
                );
            }
        }

        @Override
        public void cancelAll() {
            client.dispatcher().cancelAll();
        }
    }
}
