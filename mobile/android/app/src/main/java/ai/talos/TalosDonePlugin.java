package ai.talos;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The JavaScript end of "it finished".
 *
 * Two directions, and both are needed. Outward: a research that ends while the
 * phone is in a pocket says so. Inward: tapping that notification has to land on
 * the page of the job it is about — the visual research of 2026-08-03 (§2.8)
 * names this specifically, and a notification that opens a generic chat has
 * spent the user's attention and given nothing back.
 *
 * The inward half is two cases and they are genuinely different. A COLD start
 * arrives as the launch intent, and JavaScript asks for it when it is ready
 * (`takeRoute`) — pushing at that moment would race the router's own boot. A
 * WARM one arrives while the app is already up, and there is nobody to ask, so
 * it is announced (`route`).
 */
@CapacitorPlugin(name = "TalosDone")
public class TalosDonePlugin extends Plugin {

    @PluginMethod
    public void notifyDone(PluginCall call) {
        String title = call.getString("title");
        String text = call.getString("text");
        if (title == null || text == null) {
            call.reject("title and text are required");
            return;
        }
        TalosDoneNotification.post(
                getContext(),
                call.getInt("id", TalosDoneNotification.RESEARCH_ID),
                title,
                text,
                call.getString("route"));
        call.resolve();
    }

    /**
     * The route the app was opened with, if any — and only once.
     *
     * Cleared as it is read, because the launch intent outlives the launch: it
     * is still hanging on the activity after a rotation or a return from the
     * background, and a route that answers a second time would drag the person
     * back to a page they had deliberately left.
     */
    @PluginMethod
    public void takeRoute(PluginCall call) {
        JSObject result = new JSObject();
        Intent intent = getActivity() == null ? null : getActivity().getIntent();
        String route = intent == null ? null : intent.getStringExtra(TalosDoneNotification.EXTRA_ROUTE);
        if (intent != null && route != null) intent.removeExtra(TalosDoneNotification.EXTRA_ROUTE);
        result.put("route", route);
        call.resolve(result);
    }

    /** The app was already running when the notification was tapped. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String route = intent == null ? null : intent.getStringExtra(TalosDoneNotification.EXTRA_ROUTE);
        if (route == null || route.isEmpty()) return;
        intent.removeExtra(TalosDoneNotification.EXTRA_ROUTE);
        JSObject payload = new JSObject();
        payload.put("route", route);
        notifyListeners("route", payload);
    }
}
