package ai.talos;

import android.content.Context;
import android.os.Build;
import android.os.PowerManager;

/**
 * Quanto scotta il telefono, in una parola sola.
 *
 * Estratto da {@link TalosDeviceCapacityPlugin}, dove viveva come metodo
 * privato, perché adesso ha due lettori: la schermata Locale e il motore che
 * misura sé stesso mentre genera. Due copie dello stesso vocabolario sono due
 * copie che divergono — ed è esattamente il debito che il registro chiama A4.
 *
 * Il vocabolario è quello che {@link TalosBenchmarkHarness} e
 * {@link TalosBackendChoice} già leggono: cambiarlo qui li rompe entrambi in
 * silenzio, quindi non si cambia.
 */
public final class TalosThermal {

    /** Quando il sistema non sa dirlo. Non è "fresco": è "non lo so". */
    public static final String UNKNOWN = null;

    private TalosThermal() {}

    /** Null sotto API 29, che è un fatto e non una ragione per inventare 'none'. */
    public static String read(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return UNKNOWN;
        if (context == null) return UNKNOWN;
        PowerManager power = context.getSystemService(PowerManager.class);
        if (power == null) return UNKNOWN;
        switch (power.getCurrentThermalStatus()) {
            case PowerManager.THERMAL_STATUS_NONE: return "none";
            case PowerManager.THERMAL_STATUS_LIGHT: return "light";
            case PowerManager.THERMAL_STATUS_MODERATE: return "moderate";
            case PowerManager.THERMAL_STATUS_SEVERE: return "severe";
            default: return "critical";
        }
    }
}
