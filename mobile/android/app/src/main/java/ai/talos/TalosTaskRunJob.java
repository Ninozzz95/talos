package ai.talos;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * L'attività che si esegue da sola, all'ora giusta, con l'app chiusa.
 *
 * <h2>Perché è il pezzo che vale</h2>
 *
 * È la cosa che i concorrenti non fanno. «Pianificare» di ChatGPT gira su un
 * server, non può toccare il telefono, arriva al massimo una volta all'ora e
 * **va in letargo** se non apri l'app per un po'. Qui il lavoro è sul
 * dispositivo: il modello è già sul disco, il tempo lo decide il sistema, e non
 * c'è un abbonamento che conti quante attività puoi avere.
 *
 * <h2>Il vincolo che ha deciso la forma</h2>
 *
 * ⛔ Un `JobService` normale ha circa **dieci minuti** per finire. Si potrebbe
 * chiedere di più con un servizio in primo piano — e da Android 15 tutti i
 * servizi in primo piano dell'app si dividono **sei ore**, mentre da Android 16
 * un lavoro lungo può consumare la quota dell'app. Cioè: chiedere di più costa
 * a tutto il resto, download compresi.
 *
 * Quindi non si chiede di più: si **sta dentro**. Il tetto di token è calcolato
 * per finire comodamente in quella finestra, e un'attività che non ci sta viene
 * troncata e lo dice, invece di far pagare la sua lunghezza a tutta l'app.
 *
 * <h2>Niente WebView</h2>
 *
 * Questo lavoro gira nel processo dell'app ma **senza interfaccia**: la WebView
 * non esiste, e chiederle qualcosa significherebbe aspettare che qualcuno apra
 * l'app — cioè non essere automatici. Il modello si apre da qui, con lo stesso
 * motore della chat, e il testo prodotto viene messo da parte per quando
 * qualcuno tornerà.
 */
public class TalosTaskRunJob extends JobService {

    /**
     * Il tetto di token per un'attività automatica.
     *
     * MISURATO sul OnePlus Pad 3 con Qwen3-1.7B-Q8_0: circa 26 token al secondo
     * in generazione. 512 token sono quindi una ventina di secondi, più il
     * caricamento del modello e il prefill — largamente dentro i dieci minuti,
     * anche su un telefono tre volte più lento.
     *
     * Non è una preferenza estetica: è il numero che tiene l'attività dentro la
     * finestra economica del sistema invece di farla pagare a tutto il resto.
     */
    private static final int MAX_TOKENS = 512;

    /**
     * Da dove partono gli identificatori delle notifiche delle attività.
     *
     * Distinti da ricerca (4801) e trasferimenti (4802), e distinti FRA LORO:
     * due attività che si sovrascrivessero la notifica farebbero sparire il
     * risultato di una delle due senza dirlo a nessuno.
     */
    private static final int NOTIFICATION_BASE = 4900;

    private final List<Thread> workers = new ArrayList<>();

    @Override
    public boolean onStartJob(JobParameters params) {
        final Context context = getApplicationContext();
        final String id = params.getExtras() == null ? null : params.getExtras().getString("taskId");
        if (id == null || id.isEmpty()) return false;

        Thread worker = new Thread(() -> {
            boolean riprovare = false;
            try {
                riprovare = !esegui(context, id);
            } catch (Throwable caduta) {
                // Un'eccezione che risalisse da qui ucciderebbe il processo
                // dell'app mentre nessuno guarda, e la sola traccia sarebbe un
                // tombstone. Un'attività che fallisce è un esito, non un guasto
                // di sistema.
                riprovare = false;
            }
            jobFinished(params, riprovare);
        }, "talos-task-" + id);
        workers.add(worker);
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // Il sistema si è ripreso lo slot. Si riproverà: l'attività non è
        // fallita, è stata interrotta, e le due cose non si dicono uguali.
        for (Thread worker : workers) worker.interrupt();
        return true;
    }

    /** @return vero se l'esecuzione è arrivata in fondo. */
    private static boolean esegui(Context context, String id) {
        List<TalosTaskStore.Entry> entries = TalosTaskStore.read(context);
        TalosTaskStore.Entry entry = null;
        for (TalosTaskStore.Entry candidate : entries) {
            if (candidate.id.equals(id)) entry = candidate;
        }
        if (entry == null) return true;   // Cancellata mentre aspettava: niente da fare.
        if (entry.modelPath.isEmpty() || entry.instruction.isEmpty()) return true;

        /*
         * ⛔ Un file che non è un modello non si apre nemmeno.
         *
         * Lo stesso controllo del selettore: un proiettore multimodale è un
         * GGUF valido con cui non si parla, e provare ad aprirlo qui vorrebbe
         * dire un'attività che fallisce ogni giorno alla stessa ora senza che
         * nessuno capisca perché.
         */
        if (!TalosLlamaEngine.isConversational(entry.modelPath)) return true;

        TalosLlamaEngine engine = TalosLlamaEngine.open(
                context, entry.modelPath, 4, 4096, 0, false);
        if (engine == null) {
            // Non si è aperto: memoria occupata, file sparito, quantizzazione
            // non supportata. Vale la pena riprovare più tardi — le prime due
            // cambiano da sole.
            return false;
        }

        String risultato;
        try {
            String prompt = engine.chatPrompt(
                    new String[] { "user" },
                    new String[] { entry.instruction },
                    null,
                    true);
            if (prompt == null || prompt.isEmpty()) return true;
            risultato = engine.generateBlocking(prompt, MAX_TOKENS, TalosLlamaEngine.Mode.CHAT);
        } finally {
            // I gigabyte tornano SUBITO. Questo lavoro gira mentre l'utente sta
            // facendo altro, e tenere un modello aperto dopo aver finito è il
            // modo migliore per farsi uccidere il processo — o per far uccidere
            // qualcos'altro.
            engine.close();
        }
        if (risultato == null || risultato.trim().isEmpty()) return true;

        /*
         * `onlyIfChanged`: la risposta al difetto più citato dei concorrenti.
         *
         * Un'attività che dice ogni mattina la stessa cosa insegna a ignorare le
         * sue notifiche, e da quel momento non serve più a niente. Si confronta
         * l'impronta, non il testo: per rispondere «è cambiato?» basta, e tenere
         * meno è sempre meglio.
         */
        String impronta = impronta(risultato);
        boolean cambiato = !impronta.equals(entry.lastResultHash);
        if (entry.onlyIfChanged && !cambiato) {
            aggiorna(context, entries, entry, impronta);
            return true;
        }

        TalosDoneNotification.ensureChannel(context);
        TalosDoneNotification.post(
                context,
                NOTIFICATION_BASE + Math.abs(id.hashCode() % 1000),
                entry.title == null || entry.title.isEmpty() ? id : entry.title,
                risultato.trim(),
                // Dove porta il tocco: l'attività che l'ha prodotto. Una
                // notifica che apre la schermata iniziale fa ricominciare la
                // ricerca di ciò che aveva appena annunciato.
                "/tasks/" + id);
        aggiorna(context, entries, entry, impronta);
        return true;
    }

    private static void aggiorna(Context context, List<TalosTaskStore.Entry> entries,
                                 TalosTaskStore.Entry eseguita, String impronta) {
        List<TalosTaskStore.Entry> dopo = new ArrayList<>();
        for (TalosTaskStore.Entry entry : entries) {
            dopo.add(entry.id.equals(eseguita.id)
                    ? new TalosTaskStore.Entry(entry.id, entry.nextRunAtMillis, entry.modelPath,
                            entry.instruction, entry.title, impronta, entry.onlyIfChanged)
                    : entry);
        }
        TalosTaskStore.write(context, dopo);
    }

    private static String impronta(String testo) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] somma = digest.digest(testo.trim().getBytes("UTF-8"));
            StringBuilder fuori = new StringBuilder();
            for (byte b : somma) fuori.append(String.format("%02x", b));
            return fuori.toString();
        } catch (Exception impossibile) {
            // Senza impronta ogni esito conta come cambiato: si notifica di
            // più, che è l'errore innocuo dei due.
            return "";
        }
    }
}
