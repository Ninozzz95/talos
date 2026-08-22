package ai.talos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * La porta verso il centro notifiche di sistema.
 *
 * Deliberatamente sottile: non decide niente. QUALE superficie riceva un evento
 * lo decide `notificationCentre.ts`, che è una funzione pura e provata senza
 * telefono; qui si posta e basta. Una seconda decisione da questo lato sarebbe
 * una seconda risposta alla stessa domanda, e le due si scoprirebbero diverse
 * solo sul dispositivo di chi usa l'app.
 */
@CapacitorPlugin(name = "TalosNotificationCentre")
public class TalosNotificationCentrePlugin extends Plugin {

    @Override
    public void load() {
        // I canali si creano all'avvio e non alla prima notifica: così
        // compaiono nelle impostazioni di sistema PRIMA che arrivi qualcosa, e
        // chi vuole zittire i download può farlo senza aspettare di esserne
        // disturbato una volta.
        TalosNotificationCentre.ensureChannels(getContext());
    }

    @PluginMethod
    public void post(PluginCall call) {
        String title = call.getString("title");
        if (title == null || title.isEmpty()) {
            // Una notifica senza titolo è una riga vuota nella tenda: si rifiuta
            // dicendolo, invece di postare qualcosa che non si può leggere.
            call.reject("TALOS_NOTIFICATION_TITLE_REQUIRED");
            return;
        }
        TalosNotificationCentre.post(
                getContext(),
                call.getString("channel", "transfers"),
                call.getString("key", ""),
                title,
                call.getString("body", ""),
                call.getString("route", ""));
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        TalosNotificationCentre.cancel(getContext(), call.getString("key", ""));
        call.resolve();
    }

    /** Se il sistema ci lascia notificare. Da Android 13 è un permesso vero. */
    @PluginMethod
    public void permitted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("permitted", androidx.core.app.NotificationManagerCompat
                .from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }
}
