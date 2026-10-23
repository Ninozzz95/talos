package ai.talos;

import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger, emendamento «streaming senza compute_diffs»): che cosa dire a r4 mentre il modello scrive.
 *
 * Durante lo streaming escono solo testo e ragionamento NUOVI, dalle letture parziali del nativo (`nativeParseReplyPartial`, già
 * tagliate al primo innesco di una chiamata). Si confronta per prefisso: una lettura che non prolunga quanto già detto (il parser
 * ha cambiato idea) si tiene, perché un delta OpenAI non si ritira. Alla fine, dalla lettura finale — quella col rimedio a
 * llama.cpp #20260 — esce ciò che manca e le chiamate agli attrezzi INTERE (il kernel di r4 le accumula per indice).
 * Un oggetto per giro, da un solo thread.
 */
final class TalosMotoreOspiteFlusso {

    private String testoDetto = "";
    private String ragionamentoDetto = "";
    private boolean chiamato = false;
    /**
     * Le chiamate già cominciate durante lo streaming (sessione lunga sul Pad, 21/10: un `scrivi` lungo teneva r4 senza dati per più di
     * 300 s). Per indice: gli argomenti già mandati, e se la lettura parziale ha «cambiato idea» (allora per quella chiamata non esce più
     * niente fino alla fine). Gli ultimi `TRATTIENI` caratteri non si mandano mai durante lo streaming: sono quelli che la lettura
     * parziale può ancora riscrivere (contratto del Desktop: solo aggiunte in coda, il JSON concatenato è quello finale).
     */
    private static final int TRATTIENI = 6;
    private final List<String> argomentiDetti = new ArrayList<>();
    private final List<Boolean> bloccate = new ArrayList<>();

    /** Una lettura parziale `{content, reasoning}`: il delta nuovo, o `null` se non c'è niente da aggiungere. */
    JSONObject avanza(JSONObject parziale) {
        try {
            JSONObject delta = new JSONObject();
            aggiungi(delta, parziale);
            return delta.length() == 0 ? null : delta;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Le chiamate lette finora (`toolCalls` della lettura parziale, `[{name, arguments, id}]`): i delta nuovi, in ordine. Una chiamata
     * nuova esce con `{index, id, type:'function', function:{name, arguments:''}}`; poi solo `{index, function:{arguments:'<pezzo>'}}`.
     * Una chiamata senza nome ancora, e tutte quelle dopo, aspettano.
     */
    List<JSONObject> avanzaChiamate(JSONArray parziali, String idRisposta) {
        List<JSONObject> fuori = new ArrayList<>();
        if (parziali == null) return fuori;
        try {
            for (int i = 0; i < parziali.length(); i++) {
                JSONObject c = parziali.optJSONObject(i);
                String nome = c == null ? "" : c.optString("name", "");
                if (nome.isEmpty()) break;
                /*
                 * Revisione avversaria (1), confermata contro r4 @625: r4 CHIUDE la chiamata j quando arriva l'intestazione di j+1 e ne
                 * conta la firma per le ripetizioni. Una chiamata che ha già una successiva nella lettura è finita: i suoi argomenti
                 * escono interi, senza coda trattenuta, prima dell'intestazione della prossima.
                 */
                JSONObject dopo = parziali.optJSONObject(i + 1);
                boolean chiusa = dopo != null && !dopo.optString("name", "").isEmpty();
                String argomenti = c.optString("arguments", "");
                if (i >= argomentiDetti.size()) {
                    if (i != argomentiDetti.size()) break;
                    // revisione (7): l'intestazione aspetta i primi argomenti, così un id che segue il nome (Mistral) è completo
                    if (argomenti.isEmpty() && !chiusa) break;
                    String id = c.optString("id", "");
                    if (id.isEmpty()) id = idRisposta + "_" + i;
                    fuori.add(new JSONObject().put("tool_calls", new JSONArray().put(new JSONObject().put("index", i).put("id", id)
                            .put("type", "function").put("function", new JSONObject().put("name", nome).put("arguments", "")))));
                    argomentiDetti.add("");
                    bloccate.add(false);
                }
                if (bloccate.get(i)) continue;
                String detti = argomentiDetti.get(i);
                if (!argomenti.startsWith(detti)) {
                    bloccate.set(i, true);
                    continue;
                }
                int stabile = chiusa ? argomenti.length() : argomenti.length() - TRATTIENI;
                // revisione (6): il taglio è in unità UTF-16, e una coppia surrogata spezzata diventa «??» nei byte UTF-8
                if (stabile > 0 && stabile < argomenti.length() && Character.isHighSurrogate(argomenti.charAt(stabile - 1))) stabile--;
                if (stabile > detti.length()) {
                    fuori.add(new JSONObject().put("tool_calls", new JSONArray().put(new JSONObject().put("index", i)
                            .put("function", new JSONObject().put("arguments", argomenti.substring(detti.length(), stabile))))));
                    argomentiDetti.set(i, argomenti.substring(0, stabile));
                }
            }
            return fuori;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** La lettura finale (forma di `nativeParseReply`): i delta che mancano, poi le chiamate (intere, o il resto di quelle già cominciate). */
    List<JSONObject> chiudi(JSONObject finale, String idRisposta) {
        try {
            List<JSONObject> fuori = new ArrayList<>();
            JSONObject resto = new JSONObject();
            aggiungi(resto, finale);
            if (resto.length() > 0) fuori.add(resto);
            JSONArray chiamate = finale.optJSONArray("toolCalls");
            if (chiamate != null && chiamate.length() > 0) {
                JSONArray voci = new JSONArray();
                for (int i = 0; i < chiamate.length(); i++) {
                    JSONObject c = chiamate.getJSONObject(i);
                    if (i < argomentiDetti.size()) {
                        // già cominciata nello streaming: solo il resto degli argomenti, se la lettura finale prolunga quanto detto
                        String finali = c.optString("arguments", "");
                        String detti = argomentiDetti.get(i);
                        // revisione (5): conta solo che la lettura finale prolunghi quanto già detto, anche dopo un blocco
                        if (finali.startsWith(detti) && finali.length() > detti.length()) {
                            voci.put(new JSONObject().put("index", i)
                                    .put("function", new JSONObject().put("arguments", finali.substring(detti.length()))));
                        }
                        continue;
                    }
                    String id = c.optString("id", "");
                    // r4 abbina i risultati per id: un modello che non lo dà ne riceve uno, unico nel giro
                    if (id.isEmpty()) id = idRisposta + "_" + i;
                    voci.put(new JSONObject().put("index", i).put("id", id).put("type", "function")
                            .put("function", new JSONObject().put("name", c.optString("name", "")).put("arguments", c.optString("arguments", ""))));
                }
                if (voci.length() > 0) fuori.add(new JSONObject().put("tool_calls", voci));
                chiamato = true;
            }
            return fuori;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Quanti caratteri di testo e di ragionamento sono già usciti verso r4 (per il diario del giro). */
    int detto() {
        int argomenti = 0;
        for (String a : argomentiDetti) argomenti += a.length();
        return testoDetto.length() + ragionamentoDetto.length() + argomenti;
    }

    /** Il giro ha chiamato attrezzi (motivo della fine `tool_calls`). */
    boolean haChiamato() {
        return chiamato;
    }

    private void aggiungi(JSONObject delta, JSONObject lettura) throws JSONException {
        String ragionamento = lettura.optString("reasoning", "");
        if (ragionamento.length() > ragionamentoDetto.length() && ragionamento.startsWith(ragionamentoDetto)) {
            delta.put("reasoning_content", ragionamento.substring(ragionamentoDetto.length()));
            ragionamentoDetto = ragionamento;
        }
        String testo = lettura.optString("content", "");
        if (testo.length() > testoDetto.length() && testo.startsWith(testoDetto)) {
            delta.put("content", testo.substring(testoDetto.length()));
            testoDetto = testo;
        }
    }
}
