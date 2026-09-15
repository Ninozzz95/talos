package ai.talos;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Build;

import androidx.annotation.RequiresApi;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** API 34+ UIDT/deferred host; every JobParameters maps to one durable id. */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
public class TalosModelTransferJob extends JobService {

    private final ConcurrentHashMap<Integer, Thread> workers = new ConcurrentHashMap<>();
    private final Set<Integer> platformStopped = ConcurrentHashMap.newKeySet();

    @Override
    public boolean onStartJob(JobParameters params) {
        TalosTransferSession.restoreAll(getApplicationContext());
        TalosTransferJournal.Snapshot snapshot = TalosTransferJournal
                .forContext(getApplicationContext())
                .readByJobId(params.getJobId());
        if (snapshot == null) return false;
        final String id = snapshot.id;
        TalosTransferSession.Request request = TalosTransferSession.active(id);
        if (request == null
                || snapshot.phase == TalosTransferJournal.Phase.WAITING
                || snapshot.phase == TalosTransferJournal.Phase.PAUSED
                || snapshot.phase == TalosTransferJournal.Phase.FAILED) return false;

        platformStopped.remove(params.getJobId());
        TalosTransferNotification.ensureChannel(this);
        setNotification(
                params,
                TalosTransferNotification.notificationId(snapshot.jobId),
                TalosTransferNotification.building(
                        this,
                        id,
                        snapshot.jobId,
                        request.modelName,
                        TalosTransferSession.haveBytes(id),
                        request.totalBytes,
                        new TalosTransferProgress()),
                JobService.JOB_END_NOTIFICATION_POLICY_DETACH);

        Thread worker = new Thread(() -> TalosTransferSession.run(
                getApplicationContext(),
                id,
                request,
                params.getNetwork(),
                new TalosTransferSession.Report() {
                    private long lastShownAtMs;

                    @Override
                    public void progress(
                            long haveBytes,
                            long totalBytes,
                            TalosTransferProgress progress) {
                        long now = android.os.SystemClock.elapsedRealtime();
                        if (now - lastShownAtMs < 1000L) return;
                        lastShownAtMs = now;
                        setNotification(
                                params,
                                TalosTransferNotification.notificationId(snapshot.jobId),
                                TalosTransferNotification.building(
                                        TalosModelTransferJob.this,
                                        id,
                                        snapshot.jobId,
                                        request.modelName,
                                        haveBytes,
                                        totalBytes,
                                        progress),
                                JobService.JOB_END_NOTIFICATION_POLICY_DETACH);
                    }

                    @Override
                    public void finished(String reason) {
                        TalosTransferSession.StopCause cause =
                                TalosTransferSession.stopCause(id);
                        TalosTransferSession.Completion completion =
                                TalosTransferSession.finish(
                                        TalosModelTransferJob.this, id, reason);
                        workers.remove(params.getJobId());
                        if (!completion.retry
                                && cause != TalosTransferSession.StopCause.USER_CANCEL) {
                            TalosTransferNotification.announceEnd(
                                    TalosModelTransferJob.this,
                                    id,
                                    snapshot.jobId,
                                    request.modelName,
                                    reason);
                        }
                        if (!completion.retry) {
                            TalosTransferDispatcher.dispatchAfterRelease(
                                    TalosModelTransferJob.this);
                        }
                        if (!platformStopped.remove(params.getJobId())) {
                            jobFinished(params, completion.retry);
                        }
                    }
                }), "talos-transfer-" + snapshot.jobId);

        Thread previous = workers.putIfAbsent(params.getJobId(), worker);
        if (previous != null) return true;
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        platformStopped.add(params.getJobId());
        TalosTransferJournal.Snapshot snapshot = TalosTransferJournal
                .forContext(getApplicationContext())
                .readByJobId(params.getJobId());
        if (snapshot == null) return false;
        String id = snapshot.id;
        if (TalosTransferSession.stopCause(id) == TalosTransferSession.StopCause.NONE) {
            TalosTransferSession.requestStop(id, TalosTransferSession.StopCause.SYSTEM_STOP);
        }
        Thread running = workers.get(params.getJobId());
        if (running != null) running.interrupt();
        return TalosTransferSession.stopCause(id)
                == TalosTransferSession.StopCause.SYSTEM_STOP;
    }
}
