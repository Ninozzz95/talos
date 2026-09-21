package ai.talos;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.os.PersistableBundle;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Le attività che si eseguono da sole: da qui si programmano e si tolgono.
 *
 * <h2>Perché JobScheduler e non WorkManager</h2>
 *
 * Non per gusto: perché **questo progetto ha già un lavoro durevole in
 * background che funziona** — i download dei modelli, con il loro registro che
 * sopravvive alla morte del processo ({@link TalosModelTransferJob}). Aggiungere
 * WorkManager vorrebbe dire una seconda dipendenza e un secondo scheduler che
 * fanno la stessa cosa in due modi, e la prima volta che uno dei due si comporta
 * diversamente nessuno saprà quale guardare.
 *
 * <h2>⛔ Il vincolo che l'interfaccia deve dire prima, non dopo</h2>
 *
 * Con il blocco dell'app **acceso** qui non si programma niente. Il database è
 * cifrato con una chiave avvolta dal PIN, senza recupero: un lavoro che parte
 * alle sette del mattino non ha modo di chiederlo. Chi protegge tutto accetta
 * che «tutto» comprenda anche il lavoro automatico, e va detto quando si crea
 * l'attività — non scoperto la mattina in cui non è arrivata.
 *
 * Il lato JavaScript non chiama {@code schedule} quando il blocco è acceso, e
 * {@code clear} viene chiamato nel momento in cui il blocco si accende: una
 * copia leggibile senza PIN sopravvissuta all'accensione del blocco
 * smentirebbe la promessa.
 */
@CapacitorPlugin(name = "TalosTaskRun")
public class TalosTaskRunPlugin extends Plugin {

    /**
     * Quanto prima del momento esatto il sistema può svegliarci.
     *
     * Un `JobScheduler` non promette la puntualità al secondo — e non serve:
     * un'attività che riassume le notizie del mattino non cambia se arriva alle
     * 7:00 o alle 7:03. La puntualità esatta costerebbe `USE_EXACT_ALARM`, che
     * ha senso chiedere per una sveglia e non per questo.
     */
    private static final long FINESTRA_MS = 5 * 60 * 1000L;

    @PluginMethod
    public void schedule(PluginCall call) {
        String id = call.getString("id");
        String modelPath = call.getString("modelPath");
        String instruction = call.getString("instruction");
        if (id == null || id.isEmpty() || modelPath == null || modelPath.isEmpty()
                || instruction == null || instruction.isEmpty()) {
            call.reject("TALOS_TASK_INCOMPLETE");
            return;
        }
        final long runAt = call.getLong("nextRunAtMillis", 0L);
        if (runAt <= 0L) {
            call.reject("TALOS_TASK_NO_TIME");
            return;
        }

        List<TalosTaskStore.Entry> entries = new ArrayList<>();
        for (TalosTaskStore.Entry entry : TalosTaskStore.read(getContext())) {
            // Riprogrammare la stessa attività la SOSTITUISCE. Due copie con
            // orari diversi sono due notifiche per un lavoro solo.
            if (!entry.id.equals(id)) entries.add(entry);
        }
        entries.add(new TalosTaskStore.Entry(
                id, runAt, modelPath, instruction,
                call.getString("title", ""),
                // L'impronta precedente si conserva attraverso la
                // riprogrammazione: cambiare l'orario non è cambiare il
                // risultato, e azzerarla farebbe notificare una volta di troppo.
                improntaPrecedente(id),
                Boolean.TRUE.equals(call.getBoolean("onlyIfChanged", false))));
        TalosTaskStore.write(getContext(), entries);

        JobScheduler scheduler = getContext().getSystemService(JobScheduler.class);
        if (scheduler == null) {
            call.reject("TALOS_TASK_NO_SCHEDULER");
            return;
        }
        PersistableBundle extras = new PersistableBundle();
        extras.putString("taskId", id);
        final long ritardo = Math.max(0L, runAt - System.currentTimeMillis());
        /*
         * ⛔ Un rifiuto del sistema NON deve uccidere l'applicazione.
         *
         * MISURATO il 2026-08-06: `setPersisted(true)` senza il permesso
         * `RECEIVE_BOOT_COMPLETED` non viene ignorato — lancia, e l'eccezione
         * ha portato giù il processo mentre l'app era in primo piano. Il
         * permesso adesso c'è, ma la lezione resta: qui passano regole di
         * Android che cambiano da una versione all'altra, e programmare
         * un'attività è la cosa meno importante che l'app stia facendo.
         */
        int esito;
        try {
            esito = scheduler.schedule(new JobInfo.Builder(
                jobId(id), new ComponentName(getContext(), TalosTaskRunJob.class))
                .setMinimumLatency(ritardo)
                .setOverrideDeadline(ritardo + FINESTRA_MS)
                // Sopravvive al riavvio: un'attività dimenticata perché il
                // telefono si è spento nella notte è un'attività che non ci si
                // fida più a programmare.
                .setPersisted(true)
                .setExtras(extras)
                .build());
        } catch (RuntimeException rifiutata) {
            call.reject("TALOS_TASK_REFUSED", rifiutata.getMessage() == null
                    ? "TALOS_TASK_REFUSED" : rifiutata.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("scheduled", esito == JobScheduler.RESULT_SUCCESS);
        result.put("inMillis", ritardo);
        call.resolve(result);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.resolve();
            return;
        }
        JobScheduler scheduler = getContext().getSystemService(JobScheduler.class);
        if (scheduler != null) scheduler.cancel(jobId(id));
        List<TalosTaskStore.Entry> restano = new ArrayList<>();
        for (TalosTaskStore.Entry entry : TalosTaskStore.read(getContext())) {
            if (!entry.id.equals(id)) restano.add(entry);
        }
        TalosTaskStore.write(getContext(), restano);
        call.resolve();
    }

    /**
     * Tutto via: si chiama quando il blocco dell'app viene ACCESO.
     *
     * ⛔ Non è una pulizia opzionale. Da quel momento la promessa è che senza il
     * PIN non si legga nulla, e una copia che il sistema può aprire da solo la
     * contraddirebbe.
     */
    @PluginMethod
    public void clearAll(PluginCall call) {
        JobScheduler scheduler = getContext().getSystemService(JobScheduler.class);
        if (scheduler != null) {
            for (TalosTaskStore.Entry entry : TalosTaskStore.read(getContext())) {
                scheduler.cancel(jobId(entry.id));
            }
        }
        TalosTaskStore.clear(getContext());
        call.resolve();
    }

    /** Cosa è programmato adesso — per mostrarlo, e per provarlo. */
    @PluginMethod
    public void scheduled(PluginCall call) {
        JSArray rows = new JSArray();
        for (TalosTaskStore.Entry entry : TalosTaskStore.read(getContext())) {
            JSObject row = new JSObject();
            row.put("id", entry.id);
            row.put("nextRunAtMillis", entry.nextRunAtMillis);
            row.put("title", entry.title);
            row.put("onlyIfChanged", entry.onlyIfChanged);
            // ⛔ L'istruzione NON esce di qui. È contenuto personale, e chi
            // chiede «cosa è programmato» vuole sapere quando, non cosa.
            row.put("hasResult", entry.lastResultHash != null && !entry.lastResultHash.isEmpty());
            rows.put(row);
        }
        JSObject result = new JSObject();
        result.put("tasks", rows);
        call.resolve(result);
    }

    private String improntaPrecedente(String id) {
        for (TalosTaskStore.Entry entry : TalosTaskStore.read(getContext())) {
            if (entry.id.equals(id)) return entry.lastResultHash;
        }
        return "";
    }

    /**
     * Un numero stabile per un identificatore testuale.
     *
     * Stabile è il requisito: riprogrammare deve SOSTITUIRE il lavoro
     * precedente, e con un numero diverso ne resterebbero due. Il valore
     * assoluto tiene il numero positivo, che `JobScheduler` pretende.
     */
    private static int jobId(String id) {
        return 4900 + Math.abs(id.hashCode() % 1000);
    }
}
