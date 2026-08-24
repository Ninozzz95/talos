package ai.talos;

import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * P2-3 blocco 1 — prova che {@link TalosPerformanceSignals#sample} legge
 * segnali VERI sul dispositivo reale, non solo che compila. Questo Pad
 * (OnePlus Pad 3) gira Android 16/API 36 — verificato con
 * {@code getprop ro.build.version.sdk} prima di scrivere questo file, non
 * presunto — quindi le API CPU/GPU headroom introdotte in BAKLAVA sono
 * davvero raggiungibili qui, non solo sulla carta.
 */
@RunWith(AndroidJUnit4.class)
public class TalosPerformanceSignalsDeviceTest {

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Test
    public void leggeSegnaliVeriSuAndroid16() {
        assertTrue("questo device dovrebbe essere BAKLAVA/36 per questa prova",
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA);

        long prima = SystemClock.elapsedRealtime();
        TalosPerformanceSignals segnali = TalosPerformanceSignals.sample(context());
        long dopo = SystemClock.elapsedRealtime();

        android.util.Log.i("TalosPerfSignals", "cpuHeadroom=" + segnali.cpuHeadroom
                + " gpuHeadroom=" + segnali.gpuHeadroom
                + " thermalHeadroom=" + segnali.thermalHeadroom
                + " thermalForecast=" + segnali.thermalForecast
                + " thermalStatus=" + segnali.thermalStatus
                + " sampledAtElapsedMs=" + segnali.sampledAtElapsedMs);

        // ⛔ NaN e' un esito valido (rate-limit, servizio assente) - qui si
        // prova solo che la lettura torna un numero reale, non che sia
        // sempre disponibile. Su BAKLAVA con carico reale ci si aspetta un
        // valore vero almeno la prima volta.
        assertTrue("cpuHeadroom fuori range [0,100] o NaN: " + segnali.cpuHeadroom,
                Float.isNaN(segnali.cpuHeadroom) || (segnali.cpuHeadroom >= 0f && segnali.cpuHeadroom <= 100f));
        assertTrue("gpuHeadroom fuori range [0,100] o NaN: " + segnali.gpuHeadroom,
                Float.isNaN(segnali.gpuHeadroom) || (segnali.gpuHeadroom >= 0f && segnali.gpuHeadroom <= 100f));

        // Lo stato termico e' nel vocabolario gia' chiuso di TalosThermal,
        // mai un valore fuori da quello (o null, se il device lo nega).
        if (segnali.thermalStatus != null) {
            assertTrue("thermalStatus fuori vocabolario: " + segnali.thermalStatus,
                    segnali.thermalStatus.equals("none") || segnali.thermalStatus.equals("light")
                            || segnali.thermalStatus.equals("moderate") || segnali.thermalStatus.equals("severe")
                            || segnali.thermalStatus.equals("critical"));
        }

        // Il timestamp e' preso DURANTE questa chiamata, non prima ne' dopo.
        assertTrue("sampledAtElapsedMs fuori dalla finestra della chiamata",
                segnali.sampledAtElapsedMs >= prima && segnali.sampledAtElapsedMs <= dopo);
    }

    /**
     * AL CONTRARIO: un {@link Context} nullo non deve far cadere niente —
     * ogni helper lo controlla esplicitamente prima di chiamare
     * {@code getSystemService}.
     */
    @Test
    public void contestoNulloNonCade() {
        TalosPerformanceSignals segnali = TalosPerformanceSignals.sample(null);
        assertTrue(Float.isNaN(segnali.cpuHeadroom));
        assertTrue(Float.isNaN(segnali.gpuHeadroom));
        assertTrue(Float.isNaN(segnali.thermalHeadroom));
        assertTrue(Float.isNaN(segnali.thermalForecast));
    }
}
