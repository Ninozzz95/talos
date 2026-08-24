package ai.talos;

import android.content.Context;
import android.os.Build;
import android.os.CpuHeadroomParams;
import android.os.GpuHeadroomParams;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.health.SystemHealthManager;

/**
 * P2-3 blocco 1 — i segnali di prestazione REALI di Android 16, letti e
 * basta: nessun governor qui, nessuna decisione. Il selettore che li
 * consumerà (`localProfileSelector.ts`, P1-5, già chiuso) resta invariato
 * finché non arriva il blocco che lo collega.
 *
 * ⛔⛔⛔ VERIFICATO CONTRO IL JAR REALE (`platforms/android-36/android.jar`
 * via `javap`), non solo dalla documentazione — la pagina ufficiale di
 * riferimento è renderizzata via JS e non si legge da fuori browser, e un
 * esempio di codice trovato per ricerca web citava nomi SBAGLIATI
 * (`setStatType`/`setDurationMillis`): i nomi veri, confermati sul
 * bytecode compilato, sono {@code setCalculationType}/
 * {@code setCalculationWindowMillis}. Scoperta dal jar, non dal web: le
 * costanti vivono in {@code android.os.CpuHeadroomParams}/
 * {@code android.os.GpuHeadroomParams} (pacchetto {@code android.os}),
 * NON in {@code android.os.health} come il nome di
 * {@link SystemHealthManager} suggerirebbe.
 *
 * ⛔ Tre soglie API diverse per tre pezzi diversi, anche loro verificate
 * (mai presunte uguali):
 * <ul>
 *   <li>{@code PowerManager.getCurrentThermalStatus()} — API 29 (Q),
 *       già letto da {@link TalosThermal#read}, riusato qui — non una
 *       seconda copia dello stesso vocabolario (vedi il suo commento su
 *       "il debito A4").</li>
 *   <li>{@code PowerManager.getThermalHeadroom(int)} — API 30 (R).</li>
 *   <li>{@code SystemHealthManager.getCpuHeadroom/getGpuHeadroom} — API
 *       36 (BAKLAVA), le uniche VERE novità di Android 16 qui dentro.</li>
 * </ul>
 * CR-19 del piano sorgente ("additivo — API &lt;36 resta su static
 * profile + thermal status esistente") ne discende naturalmente: sotto
 * BAKLAVA restano comunque leggibili status e headroom termici, sotto R
 * anche quelli spariscono, mai un valore inventato al loro posto.
 *
 * ⛔ Interrogazione diretta (polling), non i listener
 * {@code addThermalHeadroomListener}/{@code addThermalStatusListener}
 * che pure esistono nel jar: un lettore su richiesta, chiamato da un
 * executor fuori dal thread token-critical (la stessa disciplina già in
 * uso per {@link TalosDeviceCapacityPlugin}), copre il requisito "fuori
 * dal thread critico" senza il ciclo di vita aggiuntivo di un listener
 * registrato/derегistrato. Se una misura reale mostrasse che il polling
 * non basta, il passaggio ai listener resta un blocco successivo
 * esplicito, non una necessità presunta oggi.
 */
public final class TalosPerformanceSignals {

    /** Il numero di secondi avanti nel tempo su cui si chiede la previsione. */
    private static final int FORECAST_SECONDS = 10;

    /** {@code NaN}: esattamente il valore che le API stesse usano per "non disponibile ora". */
    public static final float HEADROOM_UNKNOWN = Float.NaN;

    public final float cpuHeadroom;
    public final float gpuHeadroom;
    public final float thermalHeadroom;
    public final float thermalForecast;
    /** Vocabolario di {@link TalosThermal#read}: {@code "none"/"light"/"moderate"/"severe"/"critical"}, o {@code null}. */
    public final String thermalStatus;
    /** {@link SystemClock#elapsedRealtime()}, non l'ora di sistema: sopravvive ai cambi di fuso e non torna indietro. */
    public final long sampledAtElapsedMs;

    private TalosPerformanceSignals(
            float cpuHeadroom, float gpuHeadroom,
            float thermalHeadroom, float thermalForecast,
            String thermalStatus, long sampledAtElapsedMs) {
        this.cpuHeadroom = cpuHeadroom;
        this.gpuHeadroom = gpuHeadroom;
        this.thermalHeadroom = thermalHeadroom;
        this.thermalForecast = thermalForecast;
        this.thermalStatus = thermalStatus;
        this.sampledAtElapsedMs = sampledAtElapsedMs;
    }

    /**
     * Una lettura, adesso. Mai lanciata: un servizio assente o una chiamata
     * che il device rifiuta tornano {@link #HEADROOM_UNKNOWN}, non
     * un'eccezione che spegnerebbe il chiamante per un segnale opzionale.
     */
    public static TalosPerformanceSignals sample(Context context) {
        return new TalosPerformanceSignals(
                cpuHeadroomOrUnknown(context),
                gpuHeadroomOrUnknown(context),
                thermalHeadroomOrUnknown(context, 0),
                thermalHeadroomOrUnknown(context, FORECAST_SECONDS),
                TalosThermal.read(context),
                SystemClock.elapsedRealtime());
    }

    private static float cpuHeadroomOrUnknown(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.BAKLAVA || context == null) return HEADROOM_UNKNOWN;
        try {
            SystemHealthManager health = context.getSystemService(SystemHealthManager.class);
            if (health == null) return HEADROOM_UNKNOWN;
            CpuHeadroomParams params = new CpuHeadroomParams.Builder()
                    .setCalculationType(CpuHeadroomParams.CPU_HEADROOM_CALCULATION_TYPE_AVERAGE)
                    .build();
            return health.getCpuHeadroom(params);
        } catch (RuntimeException guasto) {
            // ⛔ Documentata dalla stessa API: può rifiutare per rate-limit o
            // per carico CPU utente insufficiente — un segnale opzionale che
            // fallisce resta "non lo so", non un crash del chiamante.
            return HEADROOM_UNKNOWN;
        }
    }

    private static float gpuHeadroomOrUnknown(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.BAKLAVA || context == null) return HEADROOM_UNKNOWN;
        try {
            SystemHealthManager health = context.getSystemService(SystemHealthManager.class);
            if (health == null) return HEADROOM_UNKNOWN;
            GpuHeadroomParams params = new GpuHeadroomParams.Builder()
                    .setCalculationType(GpuHeadroomParams.GPU_HEADROOM_CALCULATION_TYPE_AVERAGE)
                    .build();
            return health.getGpuHeadroom(params);
        } catch (RuntimeException guasto) {
            return HEADROOM_UNKNOWN;
        }
    }

    private static float thermalHeadroomOrUnknown(Context context, int forecastSeconds) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || context == null) return HEADROOM_UNKNOWN;
        try {
            PowerManager power = context.getSystemService(PowerManager.class);
            if (power == null) return HEADROOM_UNKNOWN;
            return power.getThermalHeadroom(forecastSeconds);
        } catch (RuntimeException guasto) {
            return HEADROOM_UNKNOWN;
        }
    }
}
