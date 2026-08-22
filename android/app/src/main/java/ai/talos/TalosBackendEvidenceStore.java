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
    private static final String KEY = "evidence_v1";

    private TalosBackendEvidenceStore() {}

    /** Tutto ciò che è stato provato su questo telefono, sotto qualunque driver. */
    static TalosBackendChoice.Evidence[] load(Context context) {
        String json = prefs(context).getString(KEY, null);
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
                        riga.getLong("ttftMs")));
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
            } catch (JSONException nonPuoAccadereConChiaviCostanti) {
                continue;
            }
            array.put(o);
        }
        prefs(context).edit().putString(KEY, array.toString()).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
