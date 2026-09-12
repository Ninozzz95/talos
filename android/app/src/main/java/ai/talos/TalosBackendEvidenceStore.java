package ai.talos;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Dove l'evidenza che {@link TalosBackendChoice} consuma sopravvive a un
 * riavvio.
 *
 * ⛔ Fase 7(c), 2026-08-21: fino a qui `choose()` non aveva niente da leggere —
 * zero chiamanti in produzione, e nessun posto dove un verdetto misurato
 * potesse restare. Questa classe è quel posto, non il sondaggio che lo
 * riempie: CHI decide di far girare un backend candidato e QUANDO — all'avvio?
 * in un momento di inattività? — è una scelta di prodotto (costa batteria e
 * tempo reale, e non deve interrompere una chat in corso) che questa consegna
 * non include. Finché niente scrive qui, {@link TalosBackendChoice#choose}
 * legge un array vuoto e torna "unproven" — esattamente il comportamento di
 * oggi, invariato.
 *
 * ⛔ Non cifrata, a differenza di {@link TalosTaskStore}: qui non c'è
 * contenuto personale, solo il nome di un backend, l'impronta di un driver e
 * un numero di millisecondi. Cifrarla proteggerebbe un segreto che non esiste.
 */
final class TalosBackendEvidenceStore {

    private static final String PREFS = "talos_backend_evidence";
    /**
     * ⛔⛔⛔ `v2` DALL'11/09/2026 — il METRO e' cambiato, e le prove vecchie non
     * sono confrontabili con le nuove.
     *
     * ## Perche' una prova registrata puo' diventare inservibile
     *
     * Fino a oggi il sondaggio giudicava un backend confrontando i primi 48
     * caratteri del suo testo con quelli della CPU. Sul Pad, l'11/09:
     *
     * <pre>
     *   cpu:      verdetto=VALID          ttft 62.538 ms
     *   opencl:   verdetto=WRONG_ANSWER   ttft  7.505 ms
     *   hexagon:  verdetto=WRONG_ANSWER   ttft  2.505 ms
     * </pre>
     *
     * Entrambi gli acceleratori bocciati, e {@link TalosBackendChoice#choose}
     * scarta chi non ha risposto correttamente: nessuno dei due poteva piu'
     * essere scelto. La causa non erano loro — e' la **non associativita' della
     * virgola mobile** (arXiv 2506.09501, letto l'11/09/2026): a parita' di
     * prompt e di seed, e anche in greedy, l'uscita cambia fra hardware
     * diversi. Il metro chiedeva una cosa che l'aritmetica non garantisce.
     *
     * ## Perche' la cura non basta senza questa riga
     *
     * `TalosLlamaProbe.agreesWithReference` adesso giudica **il compito** (i
     * numeri in ordine) invece del testo. Ma il sondaggio non rimisura cio' che
     * risulta gia' misurato: su un telefono che ha gia' le prove vecchie, la
     * cura **non sarebbe mai entrata in vigore**. Un verdetto porta con se' il
     * metro che l'ha prodotto, e cambiare il metro invalida i verdetti.
     *
     * ⛔ Le righe vecchie NON si cancellano: restano sotto `evidence_v1`, per la
     * stessa ragione per cui {@link TalosLocalProfileStore} non cancella un
     * profilo la cui identita' non combacia piu'. Semplicemente non si leggono.
     */
    /**
     * ⛔ La chiave PORTA L'IMPRONTA DEL METRO, e non un numero scritto a mano.
     *
     * Vedi {@link TalosLlamaProbe#metroId()} per il perche' esteso: l'11/09 ho
     * dovuto invalidare le prove **due volte in un'ora** — una per il criterio
     * di giudizio, una per il prompt — e la seconda me ne ero dimenticato. Una
     * chiave che dipende dal metro non si puo' dimenticare.
     *
     * ⛔ Le righe vecchie NON si cancellano: restano sotto la loro chiave, per
     * la stessa ragione per cui {@link TalosLocalProfileStore} non cancella un
     * profilo la cui identita' non combacia piu'. Semplicemente non si leggono,
     * e se il metro tornasse quello di prima tornerebbero leggibili.
     */
    private static String key() {
        return "evidence_" + TalosLlamaProbe.metroId();
    }

    private TalosBackendEvidenceStore() {}

    /** Tutto ciò che è stato provato su questo telefono, sotto qualunque driver. */
    static TalosBackendChoice.Evidence[] load(Context context) {
        String json = prefs(context).getString(key(), null);
        if (json == null) return new TalosBackendChoice.Evidence[0];
        try {
            JSONArray array = new JSONArray(json);
            List<TalosBackendChoice.Evidence> letta = new ArrayList<>();
            for (int indice = 0; indice < array.length(); indice += 1) {
                JSONObject riga = array.getJSONObject(indice);
                letta.add(new TalosBackendChoice.Evidence(
                        riga.getString("backend"),
                        riga.getString("driver"),
                        "CORRECT".equals(riga.getString("outcome"))
                                ? TalosBackendChoice.Outcome.CORRECT
                                : TalosBackendChoice.Outcome.FAILED,
                        riga.getLong("ttftMs"),
                        // ⛔ `opt`, non `get`: le prove scritte prima
                        // dell'11/09/2026 non hanno questo campo, e una
                        // JSONException qui butterebbe via TUTTE le righe —
                        // il `catch` sotto torna un array vuoto. Zero vale
                        // «non misurato», e chi decide lo sa.
                        riga.optDouble("tokensPerSecond", 0)));
            }
            return letta.toArray(new TalosBackendChoice.Evidence[0]);
        } catch (JSONException formatoNonRiconosciuto) {
            // Un formato che questa versione non legge più non è un errore da
            // propagare: è la stessa situazione di "nessuna evidenza ancora", e
            // la politica sa già tornare alla CPU quando l'array è vuoto.
            return new TalosBackendChoice.Evidence[0];
        }
    }

    /**
     * Registra un verdetto, sostituendo quello precedente per la stessa coppia
     * (backend, driver) — mai due giudizi vivi sulla stessa prova.
     */
    static void record(Context context, TalosBackendChoice.Evidence nuova) {
        List<TalosBackendChoice.Evidence> aggiornata = new ArrayList<>();
        for (TalosBackendChoice.Evidence esistente : load(context)) {
            if (esistente.backend.equals(nuova.backend) && esistente.driver.equals(nuova.driver)) continue;
            aggiornata.add(esistente);
        }
        aggiornata.add(nuova);

        JSONArray array = new JSONArray();
        for (TalosBackendChoice.Evidence riga : aggiornata) {
            JSONObject o = new JSONObject();
            try {
                o.put("backend", riga.backend);
                o.put("driver", riga.driver);
                o.put("outcome", riga.outcome == TalosBackendChoice.Outcome.CORRECT ? "CORRECT" : "FAILED");
                o.put("ttftMs", riga.ttftMs);
                o.put("tokensPerSecond", riga.tokensPerSecond);
            } catch (JSONException nonPuoAccadereConChiaviCostanti) {
                continue;
            }
            array.put(o);
        }
        prefs(context).edit().putString(key(), array.toString()).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
