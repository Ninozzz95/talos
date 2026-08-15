package ai.talos;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Promotes durable FIFO work into at most two Android hosts. */
final class TalosTransferDispatcher {

    static final int MAX_ACTIVE_TRANSFERS = 2;
    private static final Object DISPATCH_LOCK = new Object();

    private TalosTransferDispatcher() {}

    static int occupied(List<TalosTransferJournal.Snapshot> records) {
        int count = 0;
        for (TalosTransferJournal.Snapshot snapshot : records) {
            if (occupiesSlot(snapshot.phase)) count += 1;
        }
        return count;
    }

    static int availableSlots(List<TalosTransferJournal.Snapshot> records) {
        return Math.max(0, MAX_ACTIVE_TRANSFERS - occupied(records));
    }

    /** Pure FIFO selection, shared by production and the JVM contract test. */
    static List<TalosTransferJournal.Snapshot> select(
            List<TalosTransferJournal.Snapshot> records) {
        int available = availableSlots(records);
        if (available == 0) return Collections.emptyList();
        List<TalosTransferJournal.Snapshot> selected = new ArrayList<>();
        for (TalosTransferJournal.Snapshot snapshot : records) {
            if (snapshot.phase != TalosTransferJournal.Phase.WAITING) continue;
            selected.add(snapshot);
            if (selected.size() == available) break;
        }
        return selected;
    }

    /**
     * Promote waiting work. The caller chooses a runner it is currently
     * allowed to start: visible plugin calls use UIDT/FGS, host completion uses
     * deferred JobScheduler or the already-running foreground service.
     */
    static List<TalosTransferJournal.Snapshot> dispatch(
            Context context,
            TalosTransferPlan.Runner runner) {
        synchronized (DISPATCH_LOCK) {
            TalosTransferJournal journal = TalosTransferJournal.forContext(context);
            List<TalosTransferJournal.Snapshot> started = new ArrayList<>();
            for (TalosTransferJournal.Snapshot waiting : select(journal.list())) {
                boolean networkBound = runner != TalosTransferPlan.Runner.FOREGROUND_SERVICE;
                TalosTransferJournal.Snapshot queued =
                        journal.queue(waiting.id, runner, networkBound);
                if (queued == null) continue;
                if (startHost(context, queued)) {
                    started.add(queued);
                } else {
                    journal.transition(
                            queued.id, TalosTransferJournal.Phase.FAILED, "android-refused");
                }
            }
            return started;
        }
    }

    static void dispatchAfterRelease(Context context) {
        TalosTransferPlan.Runner runner;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            runner = TalosTransferPlan.Runner.DEFERRED_JOB;
        } else if (TalosModelTransferService.isRunning()) {
            runner = TalosTransferPlan.Runner.FOREGROUND_SERVICE;
        } else {
            return;
        }
        dispatch(context, runner);
    }

    /** Whether Android still owns the job host recorded for this transfer. */
    static boolean hasHost(Context context, TalosTransferJournal.Snapshot snapshot) {
        if (snapshot.runner == TalosTransferPlan.Runner.FOREGROUND_SERVICE) return false;
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return false;
        try {
            return scheduler.getPendingJob(snapshot.jobId) != null;
        } catch (RuntimeException cannotInspectScheduler) {
            // Unknown ownership must not launch a duplicate socket/worker.
            return true;
        }
    }

    /** Pure recovery decision shared with the JVM contract test. */
    static TalosTransferJournal.Phase recoveredPhase(
            TalosTransferPlan.Runner runner,
            boolean hasHost) {
        if (runner == TalosTransferPlan.Runner.FOREGROUND_SERVICE || !hasHost) {
            return TalosTransferJournal.Phase.WAITING;
        }
        return TalosTransferJournal.Phase.QUEUED;
    }

    /** Stop only the host that owns this record. */
    static void stopHost(Context context, TalosTransferJournal.Snapshot snapshot) {
        if (snapshot == null) return;
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler != null) scheduler.cancel(snapshot.jobId);
        TalosModelTransferService.interrupt(snapshot.id);
    }

    private static boolean startHost(
            Context context,
            TalosTransferJournal.Snapshot snapshot) {
        switch (snapshot.runner) {
            case USER_INITIATED_JOB:
                return schedule(context, snapshot, true);
            case DEFERRED_JOB:
                return schedule(context, snapshot, false);
            case FOREGROUND_SERVICE:
            default:
                return TalosModelTransferService.enqueue(context, snapshot.id);
        }
    }

    private static boolean schedule(
            Context context,
            TalosTransferJournal.Snapshot snapshot,
            boolean userInitiated) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false;
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return false;

        NetworkRequest network = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)
                .build();
        JobInfo.Builder builder = new JobInfo.Builder(
                snapshot.jobId,
                new ComponentName(context, TalosModelTransferJob.class))
                .setRequiredNetwork(network)
                .setEstimatedNetworkBytes(snapshot.totalBytes, 0);
        if (userInitiated) builder.setUserInitiated(true);
        return scheduler.schedule(builder.build()) == JobScheduler.RESULT_SUCCESS;
    }

    private static boolean occupiesSlot(TalosTransferJournal.Phase phase) {
        return phase == TalosTransferJournal.Phase.QUEUED
                || phase == TalosTransferJournal.Phase.RUNNING
                || phase == TalosTransferJournal.Phase.PAUSING
                || phase == TalosTransferJournal.Phase.VERIFYING;
    }
}
