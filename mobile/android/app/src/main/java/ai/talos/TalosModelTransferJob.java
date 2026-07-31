package ai.talos;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.app.Notification;
import android.app.NotificationManager;
import android.os.Build;

import androidx.annotation.RequiresApi;

/**
 * The user-initiated data transfer job — the way Android wants a large download
 * done, from 34 onwards.
 *
 * It exists instead of a foreground service because from Android 15 a
 * `dataSync` service gets six hours a day and is then killed, and that budget
 * is SHARED with the run service that keeps long answers alive. A four-gigabyte
 * download on a slow link can reach it; when it does, the app that does not
 * stop in time crashes rather than warns. A user-initiated job has no such cap.
 *
 * The system stops it for reasons that are not failures — thermal pressure, a
 * constraint no longer met, a better moment to retry — so `onStopJob` returns
 * true and the transfer resumes from the last checkpoint. And the Task Manager
 * kills the process outright WITHOUT calling `onStopJob` at all, which is why
 * nothing durable is held in this class.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
public class TalosModelTransferJob extends JobService {

    private volatile Thread worker;

    @Override
    public boolean onStartJob(JobParameters params) {
        TalosTransferSession.Request request = TalosTransferSession.active();
        if (request == null) return false;

        TalosTransferNotification.ensureChannel(this);
        TalosTransferProgress starting = new TalosTransferProgress();

        // Required, and required HERE: a user-initiated job must post its
        // notification during onStartJob. DETACH leaves it on screen after the
        // job ends, which is what lets the outcome be stated rather than
        // vanishing while the phone is in a pocket.
        setNotification(
                params,
                TalosTransferNotification.NOTIFICATION_ID,
                TalosTransferNotification.building(this, request.modelName, 0, request.totalBytes, starting),
                JobService.JOB_END_NOTIFICATION_POLICY_DETACH);

        worker = new Thread(() -> TalosTransferSession.run(
                getApplicationContext(),
                request,
                params.getNetwork(),
                new TalosTransferSession.Report() {
                    private long lastShownAtMs;

                    @Override
                    public void progress(long haveBytes, long totalBytes, TalosTransferProgress progress) {
                        // Once a second. Posting per chunk is thousands of
                        // updates the user cannot read and the system throttles.
                        long now = android.os.SystemClock.elapsedRealtime();
                        if (now - lastShownAtMs < 1000L) return;
                        lastShownAtMs = now;
                        setNotification(
                                params,
                                TalosTransferNotification.NOTIFICATION_ID,
                                TalosTransferNotification.building(
                                        TalosModelTransferJob.this, request.modelName,
                                        haveBytes, totalBytes, progress),
                                JobService.JOB_END_NOTIFICATION_POLICY_DETACH);
                    }

                    @Override
                    public void finished(String reason) {
                        Notification ended = TalosTransferNotification.ended(
                                TalosModelTransferJob.this, request.modelName, reason);
                        NotificationManager manager = getSystemService(NotificationManager.class);
                        if (manager != null) {
                            manager.notify(TalosTransferNotification.NOTIFICATION_ID, ended);
                        }

                        // "stopped" is the system taking the job away — thermal
                        // pressure, a constraint no longer met, a better moment
                        // to retry — and `onStopJob` returns true to ask for it
                        // back. So the REQUEST MUST SURVIVE.
                        //
                        // It did not: `end()` ran on every path, so the
                        // rescheduled `onStartJob` found no active request and
                        // returned false. The job promised to resume and then
                        // abandoned the download on its first interruption,
                        // which on a phone is a matter of minutes. Found by an
                        // adversarial review, 2026-08-01.
                        boolean retry = "stopped".equals(reason);
                        if (!retry) TalosTransferSession.end();
                        else TalosTransferSession.clearStopRequest();
                        jobFinished(params, retry);
                    }
                }), "talos-transfer");
        worker.start();
        return true;
    }

    /**
     * True: come back and finish it.
     *
     * Every byte is already on disk with a checkpoint beside it, so resuming
     * costs a request rather than a download. The stop reason is worth
     * recording but not worth acting on differently — thermal, constraint or
     * timing, the answer is the same, and pretending otherwise adds paths that
     * are never exercised.
     */
    @Override
    public boolean onStopJob(JobParameters params) {
        TalosTransferSession.requestStop();
        Thread running = worker;
        if (running != null) running.interrupt();
        return true;
    }
}
