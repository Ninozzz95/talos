package ai.talos;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.List;

/**
 * The only way JavaScript can move four gigabytes.
 *
 * It cannot do it itself: Android suspends a backgrounded WebView, so a
 * download driven from `fetch` stops the moment the user leaves the app — which
 * is most of the hours a model takes. What crosses this boundary is a request
 * and a question, never the loop.
 *
 * The runner is chosen by `TalosTransferPlan`, which is proved on the JVM, and
 * the choice is REPORTED BACK rather than hidden. It matters to the interface:
 * on Android 13 and below there is no user-initiated job, so the transfer runs
 * on a foreground service with a six-hour daily budget and no bound network —
 * and the download centre has to be able to say so before someone starts a 4 GB
 * transfer on a train.
 */
@CapacitorPlugin(name = "TalosModelTransfer")
public class TalosModelTransferPlugin extends Plugin {

    private static final int JOB_ID = 4712;

    /**
     * Start, or say precisely why not.
     *
     * `totalBytes` and `sha256` come from the Hub's paths-info answer and are
     * required: without the length there is nothing to reserve, and without the
     * hash the file cannot be proved — which is the one thing this download
     * does that no competitor does.
     */
    @PluginMethod
    public void start(PluginCall call) {
        if (TalosTransferSession.active() != null) {
            call.reject("A download is already running");
            return;
        }

        String repo = call.getString("repo");
        String revision = call.getString("revision", "main");
        String path = call.getString("path");
        String modelName = call.getString("modelName", path);
        Long totalBytes = call.getLong("totalBytes");
        String sha256 = call.getString("sha256");

        if (repo == null || path == null || totalBytes == null || totalBytes <= 0) {
            call.reject("repo, path and totalBytes are required");
            return;
        }

        TalosTransferSession.Request request = new TalosTransferSession.Request(
                repo, revision, path, modelName, totalBytes, sha256);

        // Visible, because this call came from a WebView that is only running
        // while the app is in front. Having an activity in Recents does not
        // count, which is why this is not inferred from the task stack.
        TalosTransferPlan.Runner runner =
                TalosTransferPlan.runner(Build.VERSION.SDK_INT, true);

        TalosTransferSession.begin(request);

        boolean started;
        switch (runner) {
            case USER_INITIATED_JOB:
            case DEFERRED_JOB:
                started = schedule(runner == TalosTransferPlan.Runner.USER_INITIATED_JOB);
                break;
            default:
                started = startService();
                break;
        }

        if (!started) {
            TalosTransferSession.end();
            call.reject("Android refused to start the transfer");
            return;
        }

        JSObject result = new JSObject();
        result.put("runner", runner.name());
        // The honest caveat, handed to the interface rather than buried: below
        // API 34 the transfer is not bound to the network it started on and can
        // follow the phone onto mobile data.
        result.put("networkBound", runner == TalosTransferPlan.Runner.USER_INITIATED_JOB);
        call.resolve(result);
    }

    /** Pause. The bytes and the hash state stay on disk; it resumes where it was. */
    @PluginMethod
    public void stop(PluginCall call) {
        TalosTransferSession.requestStop();
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        TalosTransferSession.Request active = TalosTransferSession.active();
        JSObject result = new JSObject();
        result.put("active", active != null);
        if (active != null) {
            result.put("repo", active.repo);
            result.put("path", active.path);
            result.put("modelName", active.modelName);
        }
        result.put("haveBytes", TalosTransferSession.haveBytes());
        result.put("totalBytes", TalosTransferSession.totalBytes());
        call.resolve(result);
    }

    /**
     * What abandoned attempts are costing.
     *
     * These matter here more than anywhere else: the space is claimed up front,
     * so an attempt abandoned after ten seconds still holds the whole four
     * gigabytes. Without this the user watches free space vanish with nothing
     * to point at.
     */
    @PluginMethod
    public void leftovers(PluginCall call) {
        TalosModelStore store = new TalosModelStore(
                TalosTransferSession.rootFor(getContext()));
        List<TalosModelStore.Leftover> found = store.leftovers();

        com.getcapacitor.JSArray items = new com.getcapacitor.JSArray();
        long total = 0;
        for (TalosModelStore.Leftover leftover : found) {
            JSObject item = new JSObject();
            item.put("path", leftover.path);
            item.put("bytes", leftover.bytes);
            items.put(item);
            total += leftover.bytes;
        }

        JSObject result = new JSObject();
        result.put("items", items);
        result.put("totalBytes", total);
        call.resolve(result);
    }

    /**
     * Give the space back.
     *
     * Only paths this store produced are accepted. A delete that takes any path
     * JavaScript hands it is a delete that a compromised page can aim anywhere
     * the app can write.
     */
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

    private boolean schedule(boolean userInitiated) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false;

        JobScheduler scheduler = getContext().getSystemService(JobScheduler.class);
        if (scheduler == null) return false;

        NetworkRequest network = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)
                .build();

        TalosTransferSession.Request request = TalosTransferSession.active();
        JobInfo.Builder builder = new JobInfo.Builder(
                JOB_ID, new ComponentName(getContext(), TalosModelTransferJob.class))
                .setRequiredNetwork(network)
                // Told, not guessed: the system schedules a transfer it knows
                // the size of far better than one it does not.
                .setEstimatedNetworkBytes(
                        request == null ? JobInfo.NETWORK_BYTES_UNKNOWN : request.totalBytes,
                        0);

        // setRequiresStorageNotLow stays off deliberately — see TalosTransferPlan.
        if (userInitiated) builder.setUserInitiated(true);

        return scheduler.schedule(builder.build()) == JobScheduler.RESULT_SUCCESS;
    }

    private boolean startService() {
        Context context = getContext();
        Intent intent = new Intent(context, TalosModelTransferService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            return true;
        } catch (RuntimeException refused) {
            // Android 12+ refuses a foreground service started from the
            // background. Reported rather than swallowed: a download that never
            // starts and says nothing is the worst of the failures here.
            return false;
        }
    }
}
