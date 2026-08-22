package ai.talos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "TalosSafeWeb")
public class TalosSafeWebPlugin extends Plugin {

    /**
     * ⛔⛔⛔ UN POOL CON UN TETTO, e il tetto viene dal TELEFONO.
     *
     * Prima era `newCachedThreadPool()`: cresce con la domanda, senza limite.
     * Per uno strumento che un ciclo di agente puo' invocare in raffica non e' un
     * budget di risorse — e' l'assenza di un budget. Venti pagine chieste insieme
     * diventano venti thread, ognuno con la sua pila, su un dispositivo che sta
     * gia' facendo girare un modello.
     *
     * ## Da dove viene il numero
     *
     * ⛔ NON da una buona pratica astratta. `availableProcessors()` e' una misura
     * di QUESTO dispositivo, e il lavoro qui e' quasi tutto attesa di rete: i
     * thread stanno fermi su una socket, non a calcolare. Da qui il fattore due —
     * abbastanza da tenere occupata la rete, abbastanza poco da non moltiplicare
     * le pile mentre il modello macina.
     *
     * ⛔ «Abbastanza» non e' una misura. Va guardato sul Pad, sotto un ciclo di
     * agente vero, contando quante letture restano in coda e per quanto. Finche'
     * non e' stato fatto, il fattore due e' un'ipotesi dichiarata come tale.
     *
     * ## ⛔ E la saturazione si DICE
     *
     * Con una coda limitata, la richiesta in piu' viene rifiutata invece di
     * accumularsi. Rifiutata ad alta voce: `TALOS_WEB_BUSY` e' una risposta vera,
     * e il modello puo' riprovare piu' tardi. Una coda senza fondo, invece,
     * accetta tutto e poi consegna tardi — che dal di fuori sembra un'app rotta,
     * e non lascia nessuna traccia di cosa sia successo.
     */
    private static final int NUCLEI = Math.max(1, Runtime.getRuntime().availableProcessors());
    private static final int LETTURE_INSIEME = NUCLEI * 2;
    private static final int LETTURE_IN_CODA = LETTURE_INSIEME * 2;

    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
        LETTURE_INSIEME, LETTURE_INSIEME,
        /* i thread inattivi non restano a vuoto: il picco e' raro */
        30L, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(LETTURE_IN_CODA),
        runnable -> {
            Thread t = new Thread(runnable, "talos-web");
            t.setDaemon(true);
            return t;
        }
    );

    {
        executor.allowCoreThreadTimeOut(true);
    }
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

        try {
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
        catch (RejectedExecutionException piena) {
            // ⛔ Saturo si DICE. Il modello puo riprovare piu tardi;
            // una coda senza fondo accetterebbe e consegnerebbe tardi,
            // che dal di fuori sembra un app rotta e non lascia traccia.
            call.reject("TALOS_WEB_BUSY", "TALOS_WEB_BUSY");
        }
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

        try {
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
        catch (RejectedExecutionException piena) {
            // ⛔ Saturo si DICE. Il modello puo riprovare piu tardi;
            // una coda senza fondo accetterebbe e consegnerebbe tardi,
            // che dal di fuori sembra un app rotta e non lascia traccia.
            call.reject("TALOS_WEB_BUSY", "TALOS_WEB_BUSY");
        }
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

