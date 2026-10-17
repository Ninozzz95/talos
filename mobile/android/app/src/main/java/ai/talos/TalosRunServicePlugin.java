package ai.talos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The bridge to {@link TalosRunService}.
 *
 * Every method is safe to call when the service is not running, and none of them
 * reject on a platform that refuses the service: a failure to start the keeper
 * must never fail the WORK. The worst case is what happens today — the operation
 * dies if the user leaves the app — and turning that into a thrown error would
 * make a long answer impossible instead of merely fragile.
 */
@CapacitorPlugin(name = "TalosRunService")
public class TalosRunServicePlugin extends Plugin {

    /**
     * ⛔ F4 (14/10/2026): il JavaScript è il titolare `web` del servizio (vedi `TalosRunService.TITOLARI`). I suoi custodi
     * li conta `longRunKeeper.ts`; qui `stop` rilascia solo il suo nome, così non spegne un giro del Codice che il nativo
     * sta ancora seguendo con l'app in secondo piano.
     */
    private static final String TITOLARE_WEB = "web";

    @PluginMethod
    public void start(PluginCall call) {
        final String title = call.getString("title", "TALOS is working");
        final String text = call.getString("text", "");
        // Reported, never thrown: the operation continues without the keeper, exactly as it did before this existed.
        call.resolve(ok(TalosRunService.acquisisci(getContext(), TITOLARE_WEB, title, text)));
    }

    @PluginMethod
    public void update(PluginCall call) {
        final String title = call.getString("title", "TALOS is working");
        final String text = call.getString("text", "");
        call.resolve(ok(TalosRunService.aggiorna(getContext(), TITOLARE_WEB, title, text)));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        TalosRunService.rilascia(getContext(), TITOLARE_WEB);
        call.resolve(ok(true));
    }

    private JSObject ok(boolean value) {
        final JSObject result = new JSObject();
        result.put("ok", value);
        return result;
    }
}
