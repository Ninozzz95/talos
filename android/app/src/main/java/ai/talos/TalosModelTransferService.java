package ai.talos;

import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

import java.util.ArrayList;
import java.util.concurrent.ConcurrentHashMap;

/** API 26–33 foreground host for at most two independent transfer workers. */
public class TalosModelTransferService extends Service {

    static final String EXTRA_TRANSFER_ID = "ai.talos.extra.SERVICE_TRANSFER_ID";

    private static volatile TalosModelTransferService current;
    private final ConcurrentHashMap<String, Thread> workers = new ConcurrentHashMap<>();
    private volatile boolean foreground;
    private volatile boolean surrendering;

    static boolean enqueue(Context context, String id) {
        TalosModelTransferService running = current;
        if (running != null) {
            running.launch(id);
            return true;
        }
        Intent intent = new Intent(context, TalosModelTransferService.class)
                .putExtra(EXTRA_TRANSFER_ID, id);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            return true;
        } catch (RuntimeException refused) {
            return false;
        }
    }

    static void interrupt(String id) {
        TalosModelTransferService running = current;
        if (running == null) return;
        Thread worker = running.workers.get(id);
        if (worker != null) worker.interrupt();
    }

    static boolean isRunning() {
        return current != null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        current = this;
        TalosTransferNotification.ensureChannel(this);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String id = intent == null ? null : intent.getStringExtra(EXTRA_TRANSFER_ID);
        if (id != null) launch(id);
        if (workers.isEmpty()) stopSelf(startId);
        return START_NOT_STICKY;
    }

    private void launch(String id) {
        if (id == null || surrendering || workers.containsKey(id)) return;
        TalosTransferJournal.Snapshot snapshot = TalosTransferSession.restore(this, id);
        TalosTransferSession.Request request = TalosTransferSession.active(id);
        if (snapshot == null || request == null
                || snapshot.phase == TalosTransferJournal.Phase.WAITING
                || snapshot.phase == TalosTransferJournal.Phase.PAUSED
                || snapshot.phase == TalosTransferJournal.Phase.FAILED) return;

        Thread worker = new Thread(() -> runWorker(snapshot, request),
                "talos-transfer-" + id.substring(0, Math.min(8, id.length())));
        if (workers.putIfAbsent(id, worker) != null) return;
        ensureForeground();
        postProgress(snapshot, request, TalosTransferSession.haveBytes(id),
                new TalosTransferProgress());
        worker.start();
    }

    private void runWorker(
            TalosTransferJournal.Snapshot snapshot,
            TalosTransferSession.Request request) {
        final String id = snapshot.id;
        TalosTransferSession.run(
                getApplicationContext(), id, request, null,
                new TalosTransferSession.Report() {
                    private long lastShownAtMs;

                    @Override
                    public void progress(
                            long haveBytes,
                            long totalBytes,
                            TalosTransferProgress progress) {
                        long now = SystemClock.elapsedRealtime();
                        if (now - lastShownAtMs < 1000L) return;
                        lastShownAtMs = now;
                        postProgress(snapshot, request, haveBytes, progress);
                    }

                    @Override
                    public void finished(String reason) {
                        TalosTransferSession.StopCause cause =
                                TalosTransferSession.stopCause(id);
                        TalosTransferSession.Completion completion =
                                TalosTransferSession.finish(
                                        TalosModelTransferService.this, id, reason);
                        workers.remove(id);
                        if (completion.retry
                                || cause == TalosTransferSession.StopCause.USER_CANCEL) {
                            cancelProgress(snapshot);
                        } else {
                            TalosTransferNotification.announceEnd(
                                    TalosModelTransferService.this,
                                    id,
                                    snapshot.jobId,
                                    request.modelName,
                                    reason);
                        }
                        if (!completion.retry) {
                            TalosTransferDispatcher.dispatchAfterRelease(
                                    TalosModelTransferService.this);
                        }
                        updateForegroundOrStop();
                    }
                });
    }

    private void ensureForeground() {
        int count = Math.max(1, workers.size());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                    TalosTransferNotification.SUMMARY_NOTIFICATION_ID,
                    TalosTransferNotification.summary(this, count),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(
                    TalosTransferNotification.SUMMARY_NOTIFICATION_ID,
                    TalosTransferNotification.summary(this, count));
        }
        foreground = true;
    }

    private void postProgress(
            TalosTransferJournal.Snapshot snapshot,
            TalosTransferSession.Request request,
            long haveBytes,
            TalosTransferProgress progress) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.notify(
                TalosTransferNotification.notificationId(snapshot.jobId),
                TalosTransferNotification.building(
                        this,
                        snapshot.id,
                        snapshot.jobId,
                        request.modelName,
                        haveBytes,
                        request.totalBytes,
                        progress));
    }

    private void cancelProgress(TalosTransferJournal.Snapshot snapshot) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.cancel(TalosTransferNotification.notificationId(snapshot.jobId));
        }
    }

    private void updateForegroundOrStop() {
        if (!workers.isEmpty()) {
            ensureForeground();
            return;
        }
        if (foreground) stopForeground(STOP_FOREGROUND_REMOVE);
        foreground = false;
        stopSelf();
    }

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
        for (String id : new ArrayList<>(workers.keySet())) {
            if (TalosTransferSession.stopCause(id) == TalosTransferSession.StopCause.NONE) {
                TalosTransferSession.requestStop(
                        id, TalosTransferSession.StopCause.SYSTEM_STOP);
            }
            Thread worker = workers.get(id);
            if (worker != null) worker.interrupt();
        }
        if (current == this) current = null;
        super.onDestroy();
    }

    private void surrender() {
        surrendering = true;
        for (String id : new ArrayList<>(workers.keySet())) {
            TalosTransferSession.requestStop(id, TalosTransferSession.StopCause.SYSTEM_STOP);
            Thread worker = workers.get(id);
            if (worker != null) worker.interrupt();
        }
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {
            // The service still has to stop and leave its durable checkpoints.
        }
        stopSelf();
    }
}
