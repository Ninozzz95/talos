package ai.talos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.text.format.Formatter;

import androidx.core.app.NotificationCompat;

/** Independent, grouped progress notifications for model transfers. */
public final class TalosTransferNotification {

    public static final String CHANNEL_ID = "talos.download";
    public static final int NOTIFICATION_ID = TalosNotificationIds.TRANSFER_BAR;
    public static final int SUMMARY_NOTIFICATION_ID = TalosNotificationIds.TRANSFER_SUMMARY;
    public static final String GROUP_KEY = "ai.talos.group.MODEL_DOWNLOADS";
    public static final String EXTRA_TRANSFER_ID = "ai.talos.extra.TRANSFER_ID";

    public static final String ACTION_PAUSE = "ai.talos.action.PAUSE_TRANSFER";
    @Deprecated public static final String ACTION_STOP = ACTION_PAUSE;

    private TalosTransferNotification() {}

    public static void ensureChannel(Context context) {
        ensureChannel(context, false);
    }

    /** `rinomina` solo da `TalosNotificationCentre.refreshNames` (lingua dell'app); gli altri creano soltanto se manca (N0, D-N0-6). */
    static void ensureChannel(Context context, boolean rinomina) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || (!rinomina && manager.getNotificationChannel(CHANNEL_ID) != null)) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, context.getString(R.string.talos_canale_download_nome), NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(context.getString(R.string.talos_canale_download_descrizione));
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    public static Notification building(
            Context context,
            String transferId,
            int jobId,
            String modelName,
            long haveBytes,
            long totalBytes,
            TalosTransferProgress progress) {
        int percent = progress.percent(haveBytes, totalBytes);
        long seconds = progress.secondsRemaining(haveBytes, totalBytes);
        String sizes = Formatter.formatShortFileSize(context, haveBytes)
                + " / " + Formatter.formatShortFileSize(context, totalBytes);
        String detail = seconds == TalosTransferProgress.UNKNOWN
                ? sizes
                : sizes + " · " + context.getString(R.string.talos_download_mancano, remaining(seconds));

        Intent pause = new Intent(context, TalosTransferControl.class).setAction(ACTION_PAUSE);
        pause.putExtra(EXTRA_TRANSFER_ID, transferId);
        PendingIntent pausing = PendingIntent.getBroadcast(
                context,
                jobId,
                pause,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return base(context, notificationId(jobId), modelName, detail)
                .setProgress(100, percent, totalBytes <= 0)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setGroup(GROUP_KEY)
                .addAction(0, context.getString(R.string.talos_download_pausa), pausing)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    /** Compatibility for callers compiled against the single-transfer shape. */
    public static Notification building(
            Context context,
            String modelName,
            long haveBytes,
            long totalBytes,
            TalosTransferProgress progress) {
        return building(
                context, "legacy", TalosTransferJournal.LEGACY_JOB_ID,
                modelName, haveBytes, totalBytes, progress);
    }

    public static Notification summary(Context context, int count) {
        return base(
                context,
                SUMMARY_NOTIFICATION_ID,
                context.getString(R.string.talos_canale_download_nome),
                context.getResources().getQuantityString(R.plurals.talos_download_attivi, count, count))
                .setGroup(GROUP_KEY)
                .setGroupSummary(true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }

    public static void announceEnd(
            Context context,
            String transferId,
            int jobId,
            String modelName,
            String reason) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(notificationId(jobId));
        TalosDoneNotification.post(
                context,
                doneNotificationId(jobId),
                modelName,
                explain(context, reason),
                "/settings/models/local");
    }

    public static void announceEnd(Context context, String modelName, String reason) {
        announceEnd(
                context,
                "legacy",
                TalosTransferJournal.LEGACY_JOB_ID,
                modelName,
                reason);
    }

    static int notificationId(int jobId) {
        return TalosNotificationIds.transferBar(jobId);
    }

    static int doneNotificationId(int jobId) {
        return TalosNotificationIds.transferDone(jobId);
    }

    private static NotificationCompat.Builder base(
            Context context,
            int requestCode,
            String title,
            String text) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra(TalosDoneNotification.EXTRA_ROUTE, "/settings/models/local");
        PendingIntent pending = PendingIntent.getActivity(
                context,
                requestCode,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentIntent(pending)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
    }

    private static String remaining(long seconds) {
        if (seconds < 60) return seconds + "s";
        if (seconds < 3600) return (seconds / 60) + "m";
        return (seconds / 3600) + "h " + ((seconds % 3600) / 60) + "m";
    }

    /** N0 (21/10/2026), D-N0-6: erano in inglese fisso. */
    private static String explain(Context context, String reason) {
        if (reason == null) return context.getString(R.string.talos_download_fine_ok);
        switch (reason) {
            case "file-changed": return context.getString(R.string.talos_download_fine_cambiato);
            case "hash-mismatch": return context.getString(R.string.talos_download_fine_controllo);
            case "gone": return context.getString(R.string.talos_download_fine_sparito);
            case "unreachable": return context.getString(R.string.talos_download_fine_irraggiungibile);
            case "no-space": return context.getString(R.string.talos_download_fine_spazio);
            case "stopped": return context.getString(R.string.talos_download_fine_pausa);
            default: return context.getString(R.string.talos_download_fine_fermato, reason);
        }
    }
}
