package ai.talos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * "It finished" — one notification for every long job TALOS runs.
 *
 * Its own channel, and that is the whole point rather than tidiness. The
 * download bar is IMPORTANCE_LOW and silent on purpose: it reports hours of
 * progress, and a bar that buzzes is a bar the user switches off, after which
 * four gigabytes move invisibly. But the ENDING was posted on that same channel,
 * so it inherited the silence — and owner 2026-08-03: «ho appena scaricato un
 * modello ma non ho idea di dove sia, nel composer non spunta nessuna notifica
 * in app o android di avvenuto scaricamento, NON VA BENE».
 *
 * He was right and the diagnosis is exact: a completion is not progress. It is
 * a one-shot event the person has been waiting for, often with the phone in a
 * pocket, and it has to arrive. So it gets DEFAULT importance and a sound, on a
 * switch of its own that can be turned off without taking the progress bar with
 * it. Two different promises, two different switches — the same reasoning the
 * download channel was split out with, applied one level further.
 *
 * The route travels with it. The visual research of 2026-08-03 (§2.8) is blunt
 * about this: tapping the notification must open the page of THAT job, not a
 * generic chat. A notification that lands you somewhere you then have to
 * navigate out of has spent the user's attention and given nothing back.
 */
public final class TalosDoneNotification {

    public static final String CHANNEL_ID = "talos.done";

    /** Where tapping it should land. Read once and cleared — see the plugin. */
    public static final String EXTRA_ROUTE = "ai.talos.extra.ROUTE";

    /**
     * Revisione R-M5a bis (11), 21/10/2026: ogni notifica che porta una rotta porta anche un nonce. Con `singleTask` e il processo
     * morto Android ricrea l'attività con l'intent ORIGINALE (rotta compresa: il `removeExtra` era solo in memoria); il ponte
     * ricorda i nonce consumati e non riapre una pagina già aperta.
     */
    public static final String EXTRA_NONCE = "ai.talos.extra.ROUTE_NONCE";
    static final int NONCE_RICORDATI = 64;

    /** I nonce consumati (separati da virgole) dopo `nonce`; `null` se era già consumato. Senza nonce: si segue la rotta. */
    static String consumaNonce(String salvate, String nonce) {
        String base = salvate == null ? "" : salvate;
        if (nonce == null || nonce.isEmpty()) return base;
        java.util.List<String> elenco = new java.util.ArrayList<>();
        for (String n : base.split(",")) if (!n.isEmpty()) elenco.add(n);
        if (elenco.contains(nonce)) return null;
        elenco.add(nonce);
        while (elenco.size() > NONCE_RICORDATI) elenco.remove(0);
        return String.join(",", elenco);
    }

    /** Vero se l'intent porta un nonce già consumato (e allora la sua rotta non va seguita); altrimenti lo segna consumato. */
    public static boolean giaConsumata(Context context, Intent intent) {
        if (intent == null) return false;
        android.content.SharedPreferences p = context.getSharedPreferences("talos.route", Context.MODE_PRIVATE);
        String dopo = consumaNonce(p.getString("nonce", ""), intent.getStringExtra(EXTRA_NONCE));
        if (dopo == null) return true;
        p.edit().putString("nonce", dopo).apply();
        return false;
    }

    /**
     * Deliberately not the download bar's id. A notification cannot change
     * channel in place, so the outcome is a NEW post and the bar is cancelled —
     * reusing the id would silently keep it on the quiet channel.
     */
    public static final int RESEARCH_ID = TalosNotificationIds.RESEARCH;
    public static final int TRANSFER_ID = TalosNotificationIds.TRANSFER_DONE_LEGACY;

    private TalosDoneNotification() {}

    public static void ensureChannel(Context context) {
        ensureChannel(context, false);
    }

    /** `rinomina` solo da `TalosNotificationCentre.refreshNames` (lingua dell'app); gli altri creano soltanto se manca (N0, D-N0-6). */
    static void ensureChannel(Context context, boolean rinomina) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || (!rinomina && manager.getNotificationChannel(CHANNEL_ID) != null)) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, context.getString(R.string.talos_canale_finiti_nome), NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(context.getString(R.string.talos_canale_finiti_descrizione));
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }

    public static void post(Context context, int id, String title, String text, String route) {
        ensureChannel(context);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.notify(id, build(context, id, title, text, route));
    }

    public static Notification build(Context context, int id, String title, String text, String route) {
        Intent open = new Intent(context, MainActivity.class);
        // SINGLE_TOP so a running app is handed the intent instead of being
        // rebuilt: recreating the activity would drop the WebView, and with it
        // every research still in flight.
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (route != null && !route.isEmpty()) {
            open.putExtra(EXTRA_ROUTE, route);
            open.putExtra(EXTRA_NONCE, java.util.UUID.randomUUID().toString());
        }

        PendingIntent pending = PendingIntent.getActivity(
                context,
                // A per-id request code: with a shared one the second job's
                // PendingIntent would overwrite the first's extras, and the
                // download notification would open the research.
                id,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();
    }
}
