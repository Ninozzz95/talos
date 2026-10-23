package ai.talos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Il centro notifiche, dal lato del sistema.
 *
 * ## Perché esiste, dato che i canali c'erano già
 *
 * Ce n'erano tre, e ognuno era stato aggiunto da chi ne aveva bisogno: il
 * progresso dei trasferimenti, il servizio dei lavori lunghi, la fine di una
 * ricerca. Tre posti diversi, tre decisioni prese separatamente, e tutto il
 * resto dell'app — i tool, le importazioni, le attività — che non poteva
 * notificare niente perché nessuno aveva ancora scritto il suo canale.
 *
 * Owner 2026-08-06: «ogni funzione, tool, download, installazione ecc. deve
 * avere notifica toast E Android». Questo è il lato Android di quella frase: una
 * porta sola, dove chi ha qualcosa da dire dice CHE COSA è, e il canale lo
 * sceglie questo file.
 *
 * ## Perché quattro canali e non uno
 *
 * Perché Android li fa gestire **uno per uno**, ed è l'unica leva rimasta a chi
 * guarda: chi vuole i download muti ma le attività sonore deve poterlo dire
 * senza spegnere tutto. Con un canale solo il primo rimedio disponibile è
 * disattivare l'app, e a quel punto si perdono anche le notifiche che servivano.
 *
 * Android 16 raggruppa da sé le notifiche della stessa app, quindi i canali
 * contano più di prima: il raggruppamento non distingue, il canale sì.
 *
 * ## Le importanze non sono uguali, ed è il punto
 *
 * `transfers` è **LOW**: una barra di progresso che suona a ogni aggiornamento è
 * il difetto che fa disinstallare un'app. `attention` è **HIGH** perché qualcosa
 * si è fermato ad aspettare una decisione, e se non si vede il lavoro resta
 * fermo senza che nessuno sappia perché. Gli altri due stanno in mezzo.
 *
 * ## L'id viene dalla chiave, e serve a SOSTITUIRE
 *
 * Lo stesso download che riferisce dieci volte deve restare una notifica sola.
 * Android sostituisce quando l'id coincide, quindi l'id si deriva dalla chiave
 * dell'evento — la stessa che nel registro dentro l'app collassa i doppioni. Due
 * cose diverse, la stessa regola, così le due superfici non si contraddicono.
 */
public final class TalosNotificationCentre {

    /** Scaricamenti e installazioni: silenziosi, sono un progresso. */
    public static final String CHANNEL_TRANSFERS = "talos.transfers.centre";
    /** Una risposta arrivata mentre non guardavi. */
    public static final String CHANNEL_CHAT = "talos.chat";
    /** Lavori lunghi: ricerca, generazione, attività pianificate. */
    public static final String CHANNEL_JOBS = "talos.jobs";
    /** Qualcosa aspetta una tua decisione. */
    public static final String CHANNEL_ATTENTION = "talos.attention";

    private TalosNotificationCentre() {}

    private static String channelIdOf(String channel) {
        if (CHANNEL_CHAT.equals(channel) || "chat".equals(channel)) return CHANNEL_CHAT;
        if (CHANNEL_JOBS.equals(channel) || "jobs".equals(channel)) return CHANNEL_JOBS;
        if (CHANNEL_ATTENTION.equals(channel) || "attention".equals(channel)) return CHANNEL_ATTENTION;
        return CHANNEL_TRANSFERS;
    }

    public static void ensureChannels(Context context) {
        ensureChannels(context, false);
    }

    /** `rinomina`: solo da `refreshNames` (contesto dell'attività, lingua dell'app); gli altri creano soltanto se manca. */
    static void ensureChannels(Context context, boolean rinomina) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        create(manager, CHANNEL_TRANSFERS, context.getString(R.string.talos_canale_trasferimenti_nome),
                context.getString(R.string.talos_canale_trasferimenti_descrizione),
                NotificationManager.IMPORTANCE_LOW, rinomina);
        create(manager, CHANNEL_CHAT, context.getString(R.string.talos_canale_risposte_nome),
                context.getString(R.string.talos_canale_risposte_descrizione),
                NotificationManager.IMPORTANCE_DEFAULT, rinomina);
        create(manager, CHANNEL_JOBS, context.getString(R.string.talos_canale_lavori_nome),
                context.getString(R.string.talos_canale_lavori_descrizione),
                NotificationManager.IMPORTANCE_DEFAULT, rinomina);
        create(manager, CHANNEL_ATTENTION, context.getString(R.string.talos_canale_attenzione_nome),
                context.getString(R.string.talos_canale_attenzione_descrizione),
                NotificationManager.IMPORTANCE_HIGH, rinomina);
    }

    /**
     * I canali che esistono già prendono il nome nella lingua di adesso (N0, 21/10/2026, D-N0-6): si chiama all'avvio del ponte,
     * che dopo un cambio di lingua riparte con l'attività. Quelli mai usati non si creano qui: nascono al primo uso.
     */
    public static void refreshNames(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        ensureChannels(context, true);
        if (manager.getNotificationChannel(TalosDoneNotification.CHANNEL_ID) != null) TalosDoneNotification.ensureChannel(context, true);
        if (manager.getNotificationChannel(TalosRunService.CHANNEL_ID) != null) TalosRunService.ensureChannel(context, true);
        if (manager.getNotificationChannel(TalosTransferNotification.CHANNEL_ID) != null) TalosTransferNotification.ensureChannel(context, true);
        if (manager.getNotificationChannel(ai.talos.parola.TalosParola.CANALE) != null) {
            // stessa importanza con cui lo crea il servizio della parola (`TalosParola.avviaInPrimoPiano`)
            NotificationChannel parola = new NotificationChannel(ai.talos.parola.TalosParola.CANALE,
                    context.getString(R.string.talos_canale_parola_nome), NotificationManager.IMPORTANCE_LOW);
            parola.setDescription(context.getString(R.string.talos_canale_parola_descrizione));
            manager.createNotificationChannel(parola);
        }
        // visti sul Pad il 21/10 in italiano con l'app in inglese: i canali del controllo remoto e quello dell'accoppiamento
        ai.talos.remoto.TalosSvegliaNotifiche.INSTANCE.rinominaCanali(context);
        ai.talos.agent.TalosAccoppiamentoNotifica.INSTANCE.rinominaCanale(context);
        ai.talos.aggiornamenti.TalosNotificaAggiornamento.INSTANCE.rinominaCanale(context);
    }

    private static void create(NotificationManager manager, String id, String name,
                               String description, int importance, boolean rinomina) {
        /*
         * Con `rinomina` si ricrea anche se esiste, con la stessa importanza: per un canale che esiste Android aggiorna solo nome e
         * descrizione («should only be changed if the locale changes», javadoc di `createNotificationChannel`) e ignora
         * un'importanza che non sia più bassa. Prima il nome restava nella lingua del primo avvio. Cambiare importanza resta
         * un'altra cosa: serve un id nuovo (fase N4).
         */
        if (!rinomina && manager.getNotificationChannel(id) != null) return;
        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.setDescription(description);
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }

    /**
     * Un id stabile per la stessa cosa, e diverso per cose diverse.
     *
     * `hashCode` di una stringa può essere negativo e può collidere; il valore
     * assoluto tiene l'id valido, e la collisione resta possibile ma innocua —
     * due notifiche diverse che si sostituiscono a vicenda sono un fastidio
     * raro, mentre un id che cambia a ogni aggiornamento è dieci notifiche per
     * un download, cioè il difetto che stiamo togliendo.
     */
    static int idFor(String key) {
        // N0 (21/10/2026): l'intervallo sta in `TalosNotificationIds`; il vecchio ripiego 4900 era la prima attività pianificata.
        return TalosNotificationIds.centre(key);
    }

    public static void post(Context context, String channel, String key,
                            String title, String body, String route) {
        ensureChannels(context);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        String channelId = channelIdOf(channel);
        int id = idFor(key);

        Intent open = new Intent(context, MainActivity.class);
        // SINGLE_TOP perché ricreare l'attività butterebbe via la WebView, e con
        // essa ogni lavoro ancora in volo. La stessa ragione di
        // `TalosDoneNotification`, e va tenuta identica.
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (route != null && !route.isEmpty()) {
            open.putExtra(TalosDoneNotification.EXTRA_ROUTE, route);
        }

        PendingIntent pending = PendingIntent.getActivity(
                context,
                // Codice di richiesta per id: con uno condiviso, gli extra della
                // seconda notifica sovrascriverebbero quelli della prima e il
                // download aprirebbe la ricerca.
                id,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setContentTitle(title)
                .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setPriority(CHANNEL_ATTENTION.equals(channelId)
                        ? NotificationCompat.PRIORITY_HIGH
                        : NotificationCompat.PRIORITY_DEFAULT);

        if (body != null && !body.isEmpty()) {
            builder.setContentText(body)
                    // Il testo lungo si legge espandendo invece di finire in
                    // puntini: un riassunto troncato a metà non riassume niente.
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        manager.notify(id, builder.build());
    }

    /** Toglie una notifica quando la cosa non è più vera (letta, annullata). */
    public static void cancel(Context context, String key) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(idFor(key));
    }
}
