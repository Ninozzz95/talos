package ai.talos;

import android.app.Activity;
import android.content.res.Resources;
import android.os.Build;

import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.ConfigurationCompat;
import androidx.core.os.LocaleListCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * Synchronizes TALOS's provider-neutral locale mode with Android's supported
 * per-app language API. The empty application locale list means follow system.
 */
@CapacitorPlugin(name = "TalosLocale")
public class TalosLocalePlugin extends Plugin {

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(currentState());
    }

    @PluginMethod
    public void setMode(PluginCall call) {
        final String tag;
        try {
            tag = TalosLocalePolicy.applicationLanguageTag(call.getString("mode"));
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage());
            return;
        }

        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("TALOS_LOCALE_NO_ACTIVITY");
            return;
        }

        final LocaleListCompat locales = tag.isEmpty()
            ? LocaleListCompat.getEmptyLocaleList()
            : LocaleListCompat.forLanguageTags(tag);
        activity.runOnUiThread(() -> {
            AppCompatDelegate.setApplicationLocales(locales);
            call.resolve(currentState());
        });
    }

    private JSObject currentState() {
        JSObject result = new JSObject();
        result.put(
            "applicationLocales",
            languageTags(AppCompatDelegate.getApplicationLocales())
        );
        result.put(
            "systemLocales",
            languageTags(ConfigurationCompat.getLocales(
                Resources.getSystem().getConfiguration()
            ))
        );
        result.put(
            "usesAppCompatStorage",
            Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2
        );
        return result;
    }

    private JSArray languageTags(LocaleListCompat locales) {
        JSArray result = new JSArray();
        for (int index = 0; index < locales.size(); index++) {
            Locale locale = locales.get(index);
            if (locale != null) result.put(locale.toLanguageTag());
        }
        return result;
    }
}
