package ai.talos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import java.util.ArrayList;
import java.util.LinkedHashMap;

import androidx.core.app.NotificationCompat;

/**
 * R-1b — the thing that keeps a long operation alive.
 *
 * Owner 2026-07-26: leaving the app while an answer was being written produced
 * "network error". The streaming path is `fetch` INSIDE the WebView, and Android
 * suspends a backgrounded WebView — so the request did not fail, it was killed.
 * No amount of retry logic fixes that, because nothing was holding the process.
 *
 * A foreground service is what holds it. The notification is not decoration:
 * Android requires it, and it is also the honest thing — an app doing work you
 * cannot see, on your battery, should say so.
 *
 * Deliberately NOT started for every message. A two-second reply that flashes a
 * persistent notification is worse than the problem; the JavaScript side starts
 * this only when an operation is genuinely long (a tool round, or streaming that
 * outlives a threshold).
 */
public class TalosRunService extends Service {

    static final String CHANNEL_ID = "talos.run";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    private static final int NOTIFICATION_ID = TalosNotificationIds.RUN;

    /**
     * ⛔ F4 (14/10/2026; ledger `LEDGER-CODICE-SENZA-PONTE-2026-10-13.md` §15) — CHI tiene acceso il servizio, per nome.
     *
     * Prima c'era un solo padrone, il JavaScript (`longRunKeeper.ts`, che conta i suoi custodi: KEEPER-01). Ma sul Pad la
     * WebView in secondo piano è congelata: un giro del Codice finito con l'app sulla Home non lo vedeva nessuno, e la
     * notifica restava accesa dopo il lavoro. Ora la fine del giro del Codice la vede il nativo
     * (`ai.talos.terminal.TalosCodiceCustode`, titolare `codice:<sessione>`), il JavaScript è il titolare `web`, e il
     * servizio si ferma solo quando non resta nessuno: lo `stop` del JavaScript non spegne più il giro del Codice.
     * L'ultimo arrivato dà titolo e testo alla notifica.
     */
    private static final LinkedHashMap<String, String[]> TITOLARI = new LinkedHashMap<>();

    public static synchronized boolean acquisisci(Context context, String titolare, String title, String text) {
        TITOLARI.remove(titolare);
        TITOLARI.put(titolare, new String[] { title, text });
        try {
            final Intent intent = new Intent(context, TalosRunService.class);
            intent.putExtra(EXTRA_TITLE, title);
            intent.putExtra(EXTRA_TEXT, text);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            return true;
        } catch (Exception failure) {
            // Reported, never thrown: the work continues without the keeper.
            TITOLARI.remove(titolare);
            return false;
        }
    }

    /** Nuove parole per un titolare che c'è già; la notifica cambia solo se è il suo turno (l'ultimo arrivato). */
    public static synchronized boolean aggiorna(Context context, String titolare, String title, String text) {
        if (!TITOLARI.containsKey(titolare)) return false;
        TITOLARI.put(titolare, new String[] { title, text });
        if (!titolare.equals(ultimo())) return true;
        return mostra(context, title, text);
    }

    /** Il titolare se ne va. Se era l'ultimo il servizio si ferma; altrimenti la notifica torna a chi resta. */
    public static synchronized void rilascia(Context context, String titolare) {
        if (TITOLARI.remove(titolare) == null) return;
        if (TITOLARI.isEmpty()) {
            try {
                context.stopService(new Intent(context, TalosRunService.class));
            } catch (Exception ignored) {
                // Nothing else to do: the service is either gone already or will go with the process.
            }
            return;
        }
        final String[] resta = TITOLARI.get(ultimo());
        mostra(context, resta[0], resta[1]);
    }

    private static String ultimo() {
        final ArrayList<String> nomi = new ArrayList<>(TITOLARI.keySet());
        return nomi.isEmpty() ? null : nomi.get(nomi.size() - 1);
    }

    private static boolean mostra(Context context, String title, String text) {
        try {
            ensureChannel(context);
            final NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, build(context, title, text));
            return true;
        } catch (Exception failure) {
            return false;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String title = intent != null && intent.getStringExtra(EXTRA_TITLE) != null
                ? intent.getStringExtra(EXTRA_TITLE)
                : "TALOS is working";
        final String text = intent != null && intent.getStringExtra(EXTRA_TEXT) != null
                ? intent.getStringExtra(EXTRA_TEXT)
                : "";

        ensureChannel(this);
        final Notification notification = build(this, title, text);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+ demands the type be declared at start, and it must
            // match the manifest or the service is refused outright.
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // NOT_STICKY: if Android kills us anyway, it must not resurrect the
        // service on its own. The run's state is on disk, and the app decides
        // whether to resume — a service that restarts itself without the app
        // would hold a notification for work nobody is doing.
        return START_NOT_STICKY;
    }

    /**
     * Android 15+ gives a `dataSync` service a SIX-HOUR budget per day, and
     * calls this when it runs out. An app that does not stop itself within a
     * few seconds is killed with `ForegroundServiceDidNotStopInTimeException` —
     * a crash, not a warning.
     *
     * This service was written before that rule and had no override at all, on
     * a build targeting SDK 36. Found on 2026-07-31 by a review that was
     * looking at something else entirely: the six-hour budget is SHARED, so a
     * future model download on this path would spend it and crash the app on
     * the way out.
     *
     * Stopping is the only correct answer — the budget is gone and no amount of
     * asking gets it back. The work itself is not cancelled here: its state
     * lives on disk and the WebView keeps running while the app is in front.
     * What is lost is the guarantee that it survives being backgrounded, and
     * that is exactly what the notification was claiming, so the notification
     * goes with it rather than lying for the rest of the day.
     */
    @Override
    public void onTimeout(int startId, int fgsType) {
        stopKeeper();
    }

    /** API 34's single-argument form; kept so the behaviour is not version-shaped. */
    @Override
    public void onTimeout(int startId) {
        stopKeeper();
    }

    private void stopKeeper() {
        // Il budget è finito per tutti: nessun titolare può più dire che il lavoro è protetto.
        synchronized (TalosRunService.class) {
            TITOLARI.clear();
        }
        try {
            // minSdk is 26, so the constant form is always available.
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {
            // Stopping must happen regardless; a failure here must not prevent
            // stopSelf() below, which is the part that avoids the crash.
        }
        stopSelf();
    }

    static void ensureChannel(Context context) {
        ensureChannel(context, false);
    }

    static void ensureChannel(Context context, boolean rinomina) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        final NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || (!rinomina && manager.getNotificationChannel(CHANNEL_ID) != null)) return;
        // `rinomina` solo da `TalosNotificationCentre.refreshNames` (lingua dell'app); gli altri creano soltanto se manca (N0, D-N0-6).
        final NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, context.getString(R.string.talos_canale_in_corso_nome), NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(context.getString(R.string.talos_canale_in_corso_descrizione));
        // LOW, and no sound or vibration: this reports work, it does not
        // interrupt. A notification that buzzes for every long answer is one the
        // user turns off, and then they cannot see the work at all.
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    static Notification build(Context context, String title, String text) {
        final Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        final PendingIntent pending = PendingIntent.getActivity(
                context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentIntent(pending)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }
}
