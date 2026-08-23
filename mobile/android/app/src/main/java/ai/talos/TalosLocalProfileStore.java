package ai.talos;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * P0-2 — dove un {@link TalosLocalProfile} sopravvive a un riavvio, e dove
 * "engine/model/driver invalidation" (piano sorgente, PR 3) succede DAVVERO.
 *
 * ⛔⛔ STESSO PATTERN di {@link TalosBackendEvidenceStore}, apposta — non un
 * secondo modo di fare la stessa cosa. La differenza è tutta nella chiave: lì
 * `(backend, driver)`, qui un'intera {@link TalosLocalProfileIdentity}.
 * Convivono: questo store non sostituisce quello, è un layer parallelo —
 * niente in produzione lo legge ancora (nessun cambiamento di comportamento
 * in questo blocco), e {@link TalosBackendChoice#choose} continua a leggere
 * esattamente come oggi. Il piano sorgente lo chiede esplicito: "compatibile
 * con TalosBackendChoice come ripiego, mai un big-bang rewrite".
 *
 * ⛔ "Un profilo diventa incomplete, non false" (design.md §7.5): questo
 * store non CANCELLA MAI un profilo la cui identità non combacia più con
 * quella corrente — {@link #loadValid} lo esclude dalla lettura, ma resta
 * sul disco. Se il device tornasse a quello stato (un rollback di build, un
 * downgrade del motore) il profilo torna leggibile senza dover essere
 * rimisurato. Solo {@link #record} rimuove righe, e solo quelle nello STESSO
 * punto esatto (stessa identità, stesso backend, stesso device) — mai due
 * giudizi vivi sulla stessa prova.
 *
 * ⛔ Non cifrata, stesso motivo di {@link TalosBackendEvidenceStore}: niente
 * contenuto personale qui dentro, solo fatti sulla macchina e un numero di
 * millisecondi.
 */
final class TalosLocalProfileStore {

    private static final String PREFS = "talos_local_profile";
    private static final String KEY = "profiles_v1";

    private TalosLocalProfileStore() {}

    static TalosLocalProfile[] load(Context context) {
        String json = prefs(context).getString(KEY, null);
        if (json == null) return new TalosLocalProfile[0];
        try {
            JSONArray array = new JSONArray(json);
            List<TalosLocalProfile> letti = new ArrayList<>();
            for (int indice = 0; indice < array.length(); indice += 1) {
                TalosLocalProfile riga = leggiRiga(array.getJSONObject(indice));
                if (riga != null) letti.add(riga);
            }
            return letti.toArray(new TalosLocalProfile[0]);
        } catch (JSONException formatoNonRiconosciuto) {
            // Stessa politica di TalosBackendEvidenceStore: un formato che
            // questa versione non legge più è "nessun profilo ancora", non un
            // errore da propagare.
            return new TalosLocalProfile[0];
        }
    }

    /**
     * Solo i profili la cui identità combacia ESATTAMENTE con quella
     * corrente — la chiamata che rende reale "engine/model/driver
     * invalidation". Un profilo misurato ieri, con un engine build diverso
     * da oggi, semplicemente non compare: non è stato cancellato (vedi sopra),
     * non è stato letto.
     */
    static TalosLocalProfile[] loadValid(Context context, TalosLocalProfileIdentity identitaCorrente) {
        List<TalosLocalProfile> validi = new ArrayList<>();
        for (TalosLocalProfile riga : load(context)) {
            if (riga.identity.equals(identitaCorrente)) validi.add(riga);
        }
        return validi.toArray(new TalosLocalProfile[0]);
    }

    /**
     * Registra una misura, sostituendo quella precedente nello STESSO punto
     * esatto (identità, backend, device) — mai due giudizi vivi sulla stessa
     * prova, la stessa regola di {@link TalosBackendEvidenceStore#record}.
     */
    static void record(Context context, TalosLocalProfile nuovo) {
        List<TalosLocalProfile> aggiornati = new ArrayList<>();
        for (TalosLocalProfile esistente : load(context)) {
            if (esistente.samePlace(nuovo)) continue;
            aggiornati.add(esistente);
        }
        aggiornati.add(nuovo);

        JSONArray array = new JSONArray();
        for (TalosLocalProfile riga : aggiornati) {
            JSONObject o = scriviRiga(riga);
            if (o != null) array.put(o);
        }
        prefs(context).edit().putString(KEY, array.toString()).apply();
    }

    private static TalosLocalProfile leggiRiga(JSONObject riga) {
        try {
            TalosLocalProfileIdentity identity = new TalosLocalProfileIdentity(
                    riga.getString("engineBuild"),
                    riga.getString("modelSha256"),
                    riga.getLong("modelBytes"),
                    riga.getInt("androidSdk"),
                    riga.getString("buildFingerprint"));
            return new TalosLocalProfile(
                    identity,
                    riga.getString("backendRegistry"),
                    riga.isNull("backendDevice") ? null : riga.getString("backendDevice"),
                    "CORRECT".equals(riga.getString("outcome"))
                            ? TalosBackendChoice.Outcome.CORRECT
                            : TalosBackendChoice.Outcome.FAILED,
                    riga.getLong("ttftMs"),
                    riga.getLong("measuredAtMs"),
                    // ⛔ optString, non getString: P0-3 ha aggiunto questo
                    // campo DOPO che P0-2 aveva già scritto righe vere sul
                    // Pad (verificato: un profilo reale con backendRegistry
                    // "cpu" esisteva prima di questo blocco). Q1 era l'UNICO
                    // livello che scriveva allora — il default onesto per
                    // una riga vecchia, non un'invenzione.
                    livelloDaTesto(riga.optString("qualificationLevel", "Q1")),
                    // ⛔ P1-5, stessa storia: optDouble con -1, mai un numero
                    // indovinato per le righe scritte prima di questo campo.
                    riga.optDouble("decodeTokPerSec", -1));
        } catch (JSONException rigaMalformata) {
            // Una riga sola corrotta non deve buttare via tutte le altre.
            return null;
        }
    }

    /** Un nome che questa versione non riconosce torna Q1 — stessa politica di leggiRiga(). */
    private static TalosLocalProfile.Level livelloDaTesto(String testo) {
        try {
            return TalosLocalProfile.Level.valueOf(testo);
        } catch (IllegalArgumentException nomeSconosciuto) {
            return TalosLocalProfile.Level.Q1;
        }
    }

    private static JSONObject scriviRiga(TalosLocalProfile riga) {
        JSONObject o = new JSONObject();
        try {
            o.put("engineBuild", riga.identity.engineBuild);
            o.put("modelSha256", riga.identity.modelSha256);
            o.put("modelBytes", riga.identity.modelBytes);
            o.put("androidSdk", riga.identity.androidSdk);
            o.put("buildFingerprint", riga.identity.buildFingerprint);
            o.put("backendRegistry", riga.backendRegistry);
            o.put("backendDevice", riga.backendDevice == null ? JSONObject.NULL : riga.backendDevice);
            o.put("outcome", riga.outcome == TalosBackendChoice.Outcome.CORRECT ? "CORRECT" : "FAILED");
            o.put("ttftMs", riga.ttftMs);
            o.put("measuredAtMs", riga.measuredAtMs);
            o.put("qualificationLevel", riga.qualificationLevel.name());
            o.put("decodeTokPerSec", riga.decodeTokPerSec);
        } catch (JSONException nonPuoAccadereConChiaviCostanti) {
            return null;
        }
        return o;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
