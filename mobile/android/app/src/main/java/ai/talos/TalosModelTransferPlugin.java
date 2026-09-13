package ai.talos;

import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.List;
import java.util.Locale;

/** Capacitor boundary for a durable collection of model transfers. */
@CapacitorPlugin(name = "TalosModelTransfer")
public class TalosModelTransferPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        TalosTransferSession.restoreAll(getContext());
        TalosTransferSession.Request request = requestFrom(call);
        if (request == null) return;

        TalosTransferJournal.Snapshot created;
        try {
            created = TalosTransferSession.begin(
                    getContext(),
                    request,
                    TalosTransferPlan.Runner.DEFERRED_JOB,
                    true);
        } catch (IllegalStateException duplicate) {
            call.reject("duplicate-transfer".equals(duplicate.getMessage())
                    ? "already-running"
                    : "The transfer request could not be persisted");
            return;
        } catch (RuntimeException invalid) {
            call.reject("The transfer request could not be persisted");
            return;
        }

        TalosTransferPlan.Runner preferred =
                TalosTransferPlan.runner(Build.VERSION.SDK_INT, true);
        TalosTransferDispatcher.dispatch(getContext(), preferred);
        TalosTransferJournal.Snapshot current = TalosTransferJournal
                .forContext(getContext())
                .read(created.id);
        if (current == null) {
            call.reject("The transfer disappeared before Android accepted it");
            return;
        }
        call.resolve(startedResult(current));
    }

    @PluginMethod
    public void pause(PluginCall call) {
        String id = transferId(call);
        if (id == null) return;
        if (!TalosTransferControl.pause(getContext(), id)) {
            call.reject("There is no model download with that id");
            return;
        }
        call.resolve();
    }

    /** Compatibility symbol: Stop has always meant pause. */
    @PluginMethod
    public void stop(PluginCall call) {
        pause(call);
    }

    @PluginMethod
    public void resume(PluginCall call) {
        String id = transferId(call);
        if (id == null) return;
        TalosTransferJournal journal = TalosTransferJournal.forContext(getContext());
        TalosTransferJournal.Snapshot snapshot = TalosTransferSession.restore(getContext(), id);
        if (snapshot == null) {
            call.reject("There is no model download to resume");
            return;
        }
        if (snapshot.phase == TalosTransferJournal.Phase.RUNNING
                || snapshot.phase == TalosTransferJournal.Phase.PAUSING
                || snapshot.phase == TalosTransferJournal.Phase.VERIFYING
                || snapshot.phase == TalosTransferJournal.Phase.QUEUED) {
            call.reject("That model download is already running");
            return;
        }

        TalosTransferSession.clearStopRequest(id);
        journal.transition(id, TalosTransferJournal.Phase.WAITING, null);
        TalosTransferPlan.Runner preferred =
                TalosTransferPlan.runner(Build.VERSION.SDK_INT, true);
        TalosTransferDispatcher.dispatch(getContext(), preferred);
        TalosTransferJournal.Snapshot current = journal.read(id);
        if (current == null) {
            call.reject("The model download could not be queued again");
            return;
        }
        call.resolve(startedResult(current));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = transferId(call);
        if (id == null) return;
        TalosTransferJournal.Snapshot snapshot = TalosTransferSession.restore(getContext(), id);
        if (snapshot == null) {
            call.resolve();
            return;
        }
        boolean immediate = TalosTransferSession.cancel(getContext(), id);
        TalosTransferDispatcher.stopHost(getContext(), snapshot);
        if (immediate) TalosTransferDispatcher.dispatchAfterRelease(getContext());
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        TalosTransferSession.restoreAll(getContext());
        // A foreground poll is also the safe point that revives waiting FGS
        // records after process death.
        TalosTransferDispatcher.dispatch(
                getContext(), TalosTransferPlan.runner(Build.VERSION.SDK_INT, true));
        List<TalosTransferJournal.Snapshot> records = TalosTransferSession
                .restoreAll(getContext());
        JSObject result = new JSObject();
        JSArray items = new JSArray();
        boolean anyMoving = false;
        for (TalosTransferJournal.Snapshot snapshot : records) {
            JSObject item = statusItem(snapshot);
            items.put(item);
            anyMoving = anyMoving || moving(snapshot.phase);
        }
        result.put("items", items);
        /**
         * ⭐ I modelli ARRIVATI, dichiarati da chi li ha portati.
         *
         * Un trasferimento riuscito sparisce dal registro, quindi il lato
         * JavaScript deduceva la fine confrontando due istantanee — e quella
         * deduzione regge solo se qualcuno stava guardando nell'istante esatto
         * della sparizione. MISURATO sul Pad: 214 MB arrivati in meno di dodici
         * secondi, schermata aperta, e il conteggio è rimasto indietro.
         *
         * Leggerli NON li consuma: chi ne fa qualcosa lo dichiara con
         * `acknowledgeCompleted`. Così una lettura dello stato fatta per un
         * altro motivo non ruba la notizia a chi doveva riceverla — che è un
         * errore già commesso, in fase di collaudo, da chi l'aveva scritta.
         */
        JSArray arrivals = new JSArray();
        for (String[] arrivo : TalosTransferSession.arrivals()) {
            JSObject voce = new JSObject();
            voce.put("id", arrivo[0]);
            voce.put("modelName", arrivo[1]);
            arrivals.put(voce);
        }
        result.put("completed", arrivals);

        if (records.isEmpty()) {
            putIdle(result);
            call.resolve(result);
            return;
        }

        TalosTransferJournal.Snapshot primary = records.get(0);
        copyStatus(statusItem(primary), result);
        result.put("active", anyMoving);
        call.resolve(result);
    }

    /**
     * «Questi arrivi li ho raccontati»: si possono dimenticare.
     *
     * Separato da `status` di proposito. Fintanto che leggere consumava, la
     * correttezza dipendeva dal fatto che esistesse **un solo lettore** — un
     * vincolo invisibile che si rompe la prima volta che qualcuno chiede lo
     * stato per un altro motivo. Con l'accusa di ricevuta esplicita, leggere è
     * innocuo e dimenticare è una decisione.
     */
    @PluginMethod
    public void acknowledgeCompleted(PluginCall call) {
        JSArray raw = call.getArray("ids");
        if (raw == null || raw.length() == 0) {
            call.resolve();
            return;
        }
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (int index = 0; index < raw.length(); index++) {
            String id = raw.optString(index, null);
            if (id != null && !id.isEmpty()) ids.add(id);
        }
        TalosTransferSession.acknowledgeArrivals(ids);
        call.resolve();
    }

    @PluginMethod
    public void leftovers(PluginCall call) {
        TalosModelStore store = new TalosModelStore(
                TalosTransferSession.rootFor(getContext()));
        TalosModelStore.Listing listing = store.leftovers();

        JSArray items = new JSArray();
        long total = 0;
        for (TalosModelStore.Leftover leftover : listing.entries) {
            JSObject item = new JSObject();
            item.put("path", leftover.path);
            item.put("bytes", leftover.bytes);
            items.put(item);
            total += leftover.bytes;
        }
        JSArray refused = new JSArray();
        for (TalosModelStore.Unreadable entry : listing.unreadable) {
            JSObject row = new JSObject();
            row.put("path", entry.path);
            row.put("reason", entry.reason);
            refused.put(row);
        }
        JSObject result = new JSObject();
        result.put("items", items);
        result.put("totalBytes", total);
        result.put("unreadable", refused);
        call.resolve(result);
    }

    @PluginMethod
    public void discard(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        }
        File root = TalosTransferSession.rootFor(getContext());
        File target = new File(path);
        String inside = new File(root, "models").getAbsolutePath() + File.separator;
        if (!target.getAbsolutePath().startsWith(inside)
                || !target.getName().endsWith(TalosModelStore.PARTIAL_SUFFIX)) {
            call.reject("that is not a download of ours");
            return;
        }
        target.delete();
        new File(target.getPath().substring(
                0, target.getPath().length() - TalosModelStore.PARTIAL_SUFFIX.length())
                + TalosModelStore.SIDECAR_SUFFIX).delete();
        call.resolve();
    }

    private TalosTransferSession.Request requestFrom(PluginCall call) {
        String repo = call.getString("repo");
        String revision = call.getString("revision", "main");
        JSArray files = call.getArray("files");
        if (repo == null || files == null || files.length() == 0) {
            call.reject("repo and a non-empty files array are required");
            return null;
        }

        String[] paths = new String[files.length()];
        long[] sizes = new long[files.length()];
        String[] hashes = new String[files.length()];
        try {
            for (int index = 0; index < files.length(); index += 1) {
                JSObject file = JSObject.fromJSONObject(files.getJSONObject(index));
                paths[index] = file.getString("path");
                Long size = file.getLong("bytes");
                if (paths[index] == null || size == null || size <= 0) {
                    call.reject("every file needs a path and a positive byte count");
                    return null;
                }
                sizes[index] = size;
                hashes[index] = file.getString("sha256");
            }
        } catch (org.json.JSONException malformed) {
            call.reject("files must be objects with path, bytes and sha256");
            return null;
        }
        return new TalosTransferSession.Request(
                repo,
                revision,
                paths,
                sizes,
                hashes,
                call.getString("modelName", paths[0]));
    }

    private String transferId(PluginCall call) {
        String id = call.getString("id");
        if (id != null) return id;
        List<TalosTransferJournal.Snapshot> records =
                TalosTransferSession.restoreAll(getContext());
        if (records.size() == 1) return records.get(0).id;
        call.reject("id is required when more than one download exists");
        return null;
    }

    private static JSObject startedResult(TalosTransferJournal.Snapshot snapshot) {
        JSObject result = new JSObject();
        result.put("id", snapshot.id);
        result.put("phase", phase(snapshot));
        result.put("runner", snapshot.runner.name());
        result.put("networkBound", snapshot.networkBound);
        return result;
    }

    private static JSObject statusItem(TalosTransferJournal.Snapshot snapshot) {
        JSObject item = new JSObject();
        item.put("id", snapshot.id);
        item.put("jobId", snapshot.jobId);
        item.put("createdAtMs", snapshot.createdAtMs);
        item.put("phase", phase(snapshot));
        item.put("active", moving(snapshot.phase));
        item.put("repo", snapshot.repo);
        item.put("revision", snapshot.revision);
        JSArray paths = new JSArray();
        for (String path : snapshot.paths) paths.put(path);
        item.put("paths", paths);
        item.put("path", snapshot.paths[0]);
        item.put("parts", snapshot.paths.length);
        item.put("modelName", snapshot.modelName);
        item.put("runner", snapshot.runner.name());
        item.put("networkBound", snapshot.networkBound);
        item.put("failure", snapshot.failure);
        item.put("resumable", true);
        item.put("haveBytes", TalosTransferSession.haveBytes(snapshot.id));
        item.put("totalBytes", snapshot.totalBytes);
        return item;
    }

    private static void copyStatus(JSObject from, JSObject to) {
        for (String key : new String[] {
                "id", "jobId", "createdAtMs", "phase", "active", "repo",
                "revision", "paths", "path", "parts", "modelName", "runner",
                "networkBound", "failure", "resumable", "haveBytes", "totalBytes"
        }) {
            to.put(key, from.opt(key));
        }
    }

    private static void putIdle(JSObject result) {
        result.put("phase", "idle");
        result.put("active", false);
        result.put("haveBytes", 0L);
        result.put("totalBytes", 0L);
        result.put("networkBound", true);
        result.put("resumable", false);
    }

    private static String phase(TalosTransferJournal.Snapshot snapshot) {
        return snapshot.phase.name().toLowerCase(Locale.ROOT);
    }

    private static boolean moving(TalosTransferJournal.Phase phase) {
        return phase == TalosTransferJournal.Phase.QUEUED
                || phase == TalosTransferJournal.Phase.RUNNING
                || phase == TalosTransferJournal.Phase.PAUSING
                || phase == TalosTransferJournal.Phase.VERIFYING;
    }
}
