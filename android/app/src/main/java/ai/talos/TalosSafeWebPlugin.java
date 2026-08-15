package ai.talos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TalosSafeWeb")
public class TalosSafeWebPlugin extends Plugin {

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final TalosSafeWebClient client = TalosSafeWebClient.production();

    @PluginMethod
    public void read(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("TALOS_WEB_URL_BLOCKED:missing", "TALOS_WEB_URL_BLOCKED");
            return;
        }
        if (executor.isShutdown()) {
            call.reject("TALOS_SAFE_WEB_READ_SHUTDOWN", "TALOS_SAFE_WEB_READ_SHUTDOWN");
            return;
        }

        executor.submit(() -> {
            try {
                TalosSafeWebClient.Result result = client.read(url);
                JSObject payload = new JSObject();
                payload.put("status", result.status);
                payload.put("url", result.url);
                payload.put("body", result.body);
                call.resolve(payload);
            } catch (Exception error) {
                String message = error.getMessage() == null
                    ? "TALOS_SAFE_WEB_READ_FAILED"
                    : error.getMessage();
                call.reject(message, code(message), error);
            }
        });
    }

    /**
     * The bytes of a favicon or a preview image, through the same boundary.
     *
     * Library source cards are captured once at save time and rendered offline
     * forever, so this is the only moment those bytes are fetched. It refuses
     * every URL `read` refuses, walks redirects through the same policy, is
     * bounded far below the page limit, and rejects anything that is not an
     * image — see TalosSafeWebClient.readBytes.
     */
    @PluginMethod
    public void readBytes(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("TALOS_WEB_URL_BLOCKED:missing", "TALOS_WEB_URL_BLOCKED");
            return;
        }
        if (executor.isShutdown()) {
            call.reject("TALOS_SAFE_WEB_READ_SHUTDOWN", "TALOS_SAFE_WEB_READ_SHUTDOWN");
            return;
        }

        executor.submit(() -> {
            try {
                TalosSafeWebClient.BytesResult result = client.readBytes(url);
                JSObject payload = new JSObject();
                payload.put("status", result.status);
                payload.put("url", result.url);
                payload.put("contentType", result.contentType);
                payload.put("base64", android.util.Base64.encodeToString(
                    result.bytes, android.util.Base64.NO_WRAP
                ));
                call.resolve(payload);
            } catch (Exception error) {
                String message = error.getMessage() == null
                    ? "TALOS_SAFE_WEB_READ_FAILED"
                    : error.getMessage();
                call.reject(message, code(message), error);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        client.cancelAll();
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    private static String code(String message) {
        int separator = message.indexOf(':');
        String candidate = separator > 0 ? message.substring(0, separator) : message;
        return candidate.matches("TALOS_[A-Z0-9_]+")
            ? candidate
            : "TALOS_SAFE_WEB_READ_FAILED";
    }
}

