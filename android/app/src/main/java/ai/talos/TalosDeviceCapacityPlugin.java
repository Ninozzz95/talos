package ai.talos;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.os.storage.StorageManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.UUID;

/**
 * What this phone can actually do, asked of the phone rather than of a table.
 *
 * `fit.ts` has been able to answer "will this model run here" since it was
 * written and has never been asked, because nothing measured the device. This
 * is the missing input, and it is deliberately the LIVE one: available memory
 * and thermal state change while the user is reading the list, and an answer
 * computed from the spec sheet is wrong exactly when it matters — on a warm
 * phone with three other apps open, which is the normal condition.
 *
 * Nothing here is cached across calls except the bandwidth measurement, which
 * costs tens of milliseconds and does not change. Everything else is read
 * again every time, because every one of them can have changed since the last.
 */
@CapacitorPlugin(name = "TalosDeviceCapacity")
public class TalosDeviceCapacityPlugin extends Plugin {

    /** Measured once: the bus does not get faster, and the probe is not free. */
    private static volatile long measuredBandwidth = -1L;

    @PluginMethod
    public void measure(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();

        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
        ActivityManager activity = context.getSystemService(ActivityManager.class);
        if (activity != null) activity.getMemoryInfo(memory);

        result.put("totalRamBytes", memory.totalMem);
        result.put("availableRamBytes", memory.availMem);
        // NOT free memory: below this Android starts killing processes, so it
        // is the floor a model must stay above rather than space it may use.
        result.put("lowMemoryThresholdBytes", memory.threshold);

        result.put("freeStorageBytes", allocatableBytes(context));
        result.put("abiSupported", supportsArm64());
        result.put("thermal", thermal(context));

        if (measuredBandwidth < 0) {
            measuredBandwidth = TalosBandwidthProbe.measure(memory.availMem);
        }
        // Zero means the probe refused, which the fit calculation reads as "no
        // speed predicted". A card that says nothing about tokens per second is
        // honest; one that says the wrong number is not.
        result.put("memoryBandwidthBytesPerSecond",
                measuredBandwidth == TalosBandwidthProbe.UNKNOWN ? null : measuredBandwidth);

        /**
         * I core VERI, con la loro capacità.
         *
         * `availableProcessors()` dice quanti sono e niente di più, e su un SoC
         * moderno «quanti» è la metà della domanda: sei core a 3,5 GHz e due a
         * 4,3 non sono otto core uguali, e non sono nemmeno il classico
         * big.LITTLE con quattro core lenti.
         *
         * MISURATO sul OnePlus Pad 3 il 2026-08-06: capacità 792 su cpu0-5 e
         * 1024 su cpu6-7. Chi decide quanti thread dare al prefill e quanti
         * alla generazione ha bisogno di questo, non di un nome di chipset.
         *
         * Il file può non esistere: su quel dispositivo la lista torna vuota, e
         * chi legge deve poterlo distinguere da «un core solo».
         */
        result.put("cpuCores", Runtime.getRuntime().availableProcessors());
        result.put("cpuCapacities", cpuCapacities());
        result.put("deviceModel", Build.MODEL);
        result.put("androidSdk", Build.VERSION.SDK_INT);
        call.resolve(result);
    }

    /**
     * Ask again on demand.
     *
     * The thermal state is the one that moves under the user's hand: a phone
     * that was comfortable when the list loaded is throttling three minutes
     * into a download, and a screen that never re-asks keeps promising a speed
     * the device has stopped being able to deliver.
     */
    @PluginMethod
    public void thermalState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("thermal", thermal(getContext()));
        call.resolve(result);
    }

    /**
     * What the platform is willing to free up, which is LARGER than free space
     * because it counts caches it would drop. Asking free space instead is what
     * refuses a download on a phone that looks full and is not.
     */
    private static long allocatableBytes(Context context) {
        StorageManager storage = context.getSystemService(StorageManager.class);
        if (storage == null) return 0L;
        try {
            UUID volume = storage.getUuidForPath(context.getFilesDir());
            return storage.getAllocatableBytes(volume);
        } catch (Exception cannotAsk) {
            return 0L;
        }
    }

    /**
     * 64-bit ARM, or the runtime cannot load these weights at all.
     *
     * A hard gate rather than a warning: an x86 emulator and a 32-bit phone
     * both fail at load time, and telling someone a 4 GB download will work and
     * then failing to open it is the worst version of this answer.
     */
    private static boolean supportsArm64() {
        for (String abi : Build.SUPPORTED_ABIS) {
            if ("arm64-v8a".equals(abi)) return true;
        }
        return false;
    }

    /**
     * Moved to {@link TalosThermal} once the local engine needed the same
     * reading while it measures itself. One vocabulary, one reader: two copies
     * are two copies that drift apart.
     */
    private static String thermal(Context context) {
        return TalosThermal.read(context);
    }

    /**
     * La capacità di ogni core, come la dichiara il kernel.
     *
     * `cpu_capacity` è un numero relativo dove 1024 è il core più forte del
     * sistema. È l'unico modo portabile di sapere che sei core valgono 792 e
     * due 1024 senza conoscere il nome del chip — e riconoscere i nomi dei chip
     * è una lista che invecchia a ogni telefono nuovo
     * (vedi la regola: niente scritto a mano).
     *
     * Un file che non c'è o non si legge NON è un errore: alcuni kernel non lo
     * espongono. In quel caso la lista resta vuota e chi decide sa di sapere
     * soltanto quanti core ci sono.
     */
    private static JSArray cpuCapacities() {
        JSArray capacities = new JSArray();
        int cores = Runtime.getRuntime().availableProcessors();
        for (int index = 0; index < cores; index++) {
            File file = new File("/sys/devices/system/cpu/cpu" + index + "/cpu_capacity");
            try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
                String line = reader.readLine();
                if (line == null) return new JSArray();
                capacities.put(Integer.parseInt(line.trim()));
            } catch (Exception unreadable) {
                // Mezza lista sarebbe peggio di nessuna: farebbe credere che i
                // core mancanti non esistano.
                return new JSArray();
            }
        }
        return capacities;
    }
}
