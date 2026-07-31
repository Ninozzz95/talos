package ai.talos;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

/**
 * The fallback for Android 8 to 13, where user-initiated transfer jobs do not
 * exist.
 *
 * ITS OWN SERVICE, deliberately — never `TalosRunService`. From Android 15 a
 * `dataSync` service has a six-hour daily budget, and that budget is shared
 * across the app: a download running on the same service as the one that keeps
 * long answers alive would spend it and take the other down with it. Separate
 * services, separate notifications, separate failures.
 *
 * It uses the default network rather than a granted one, because there is no
 * job to grant it. That is a real difference from the modern path and is stated
 * rather than hidden: on these versions a transfer can follow the phone onto
 * mobile data when Wi-Fi drops, which the download centre has to make clear
 * before starting one.
 */
public class TalosModelTransferService extends Service {

    private volatile Thread worker;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        TalosTransferSession.Request request = TalosTransferSession.active();
        if (request == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        TalosTransferNotification.ensureChannel(this);
        Notification starting = TalosTransferNotification.building(
                this, request.modelName, 0, request.totalBytes, new TalosTransferProgress());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(TalosTransferNotification.NOTIFICATION_ID, starting,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(TalosTransferNotification.NOTIFICATION_ID, starting);
        }

        if (worker == null) {
            worker = new Thread(() -> TalosTransferSession.run(
                    getApplicationContext(), request, null, new TalosTransferSession.Report() {
                        private long lastShownAtMs;

                        @Override
                        public void progress(long haveBytes, long totalBytes, TalosTransferProgress progress) {
                            long now = SystemClock.elapsedRealtime();
                            if (now - lastShownAtMs < 1000L) return;
                            lastShownAtMs = now;
                            NotificationManager manager = getSystemService(NotificationManager.class);
                            if (manager == null) return;
                            manager.notify(TalosTransferNotification.NOTIFICATION_ID,
                                    TalosTransferNotification.building(
                                            TalosModelTransferService.this, request.modelName,
                                            haveBytes, totalBytes, progress));
                        }

                        @Override
                        public void finished(String reason) {
                            Notification ended = TalosTransferNotification.ended(
                                    TalosModelTransferService.this, request.modelName, reason);
                            // Detach first, then post: stopping the service with
                            // the notification attached takes the outcome off
                            // screen, and a download that fails silently in a
                            // pocket is one the user believes finished.
                            stopForeground(STOP_FOREGROUND_DETACH);
                            NotificationManager manager = getSystemService(NotificationManager.class);
                            if (manager != null) {
                                manager.notify(TalosTransferNotification.NOTIFICATION_ID, ended);
                            }
                            TalosTransferSession.end();
                            stopSelf();
                        }
                    }), "talos-transfer");
            worker.start();
        }

        // NOT_STICKY: if Android kills this, it must not resurrect itself. The
        // state is on disk and the app decides whether to resume — a service
        // that restarts alone would hold a bar for work nobody asked for.
        return START_NOT_STICKY;
    }

    /**
     * Android 15+ hands back the six-hour `dataSync` budget here, and an app
     * that does not stop within seconds is killed with
     * `ForegroundServiceDidNotStopInTimeException` — a crash, not a warning.
     *
     * Stopping is the only answer: the budget is gone and no amount of asking
     * returns it. The download is not lost, it is checkpointed, and the app
     * resumes it the next time it is opened. The notification goes too, rather
     * than promising for the rest of the day that something is still moving.
     */
    @Override
    public void onTimeout(int startId, int fgsType) {
        surrender();
    }

    @Override
    public void onTimeout(int startId) {
        surrender();
    }

    @Override
    public void onDestroy() {
        TalosTransferSession.requestStop();
        Thread running = worker;
        if (running != null) running.interrupt();
        super.onDestroy();
    }

    private void surrender() {
        TalosTransferSession.requestStop();
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {
            // Stopping must happen regardless; this must not prevent stopSelf().
        }
        stopSelf();
    }
}
