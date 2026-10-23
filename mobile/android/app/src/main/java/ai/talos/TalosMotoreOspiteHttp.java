package ai.talos;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): la parte pura dell'endpoint che l'app serve a
 * r4 sul socket Unix privato. Nessun socket e nessun motore qui: leggere la richiesta, controllare la chiave, capire la domanda
 * OpenAI, scrivere le risposte e i pezzi SSE nella forma di `llama-server` (`tools/server`), che il kernel di r4 legge già
 * (`talosHarness.mjs:1078-1269`). Provata sul PC (`TalosMotoreOspiteHttpTest`).
 *
 * Messaggi e attrezzi passano COSÌ COME SONO: il nativo li legge con i parser OpenAI di llama.cpp
 * (`common_chat_msgs_parse_oaicompat`, `common_chat_tools_parse_oaicompat` in `nativeApplyChatTemplate`).
 */
final class TalosMotoreOspiteHttp {

    private TalosMotoreOspiteHttp() {}

    /** Un corpo più grande non è una domanda del Codice: si rifiuta senza leggerlo. */
    static final int TETTO_CORPO = 8 * 1024 * 1024;
    /** Le intestazioni stanno in poco: una riga senza fine non deve riempire la memoria. */
    private static final int TETTO_INTESTAZIONI = 16 * 1024;
    /** Il tetto della risposta quando la domanda non lo dice (il server lo riduce comunque a quanto resta nella finestra). */
    static final int MAX_TOKEN_DI_SERIE = 4096;
    static final String FINE_SSE = "data: [DONE]\n\n";

    static final class Richiesta {
        final String metodo;
        final String percorso;
        /** Nomi in minuscolo. */
        final Map<String, String> intestazioni;
        final byte[] corpo;

        Richiesta(String metodo, String percorso, Map<String, String> intestazioni, byte[] corpo) {
            this.metodo = metodo;
            this.percorso = percorso;
            this.intestazioni = intestazioni;
            this.corpo = corpo;
        }
    }

    static final class ErroreHttp extends Exception {
        final int stato;
        final String codice;

        ErroreHttp(int stato, String codice) {
            super(codice);
            this.stato = stato;
            this.codice = codice;
        }
    }

    /** La domanda del Codice, pronta per `chatPrompt` e per il ciclo di generazione. */
    static final class Domanda {
        final String messaggiJson;
        /** `null` = nessun attrezzo per il template. */
        final String attrezziJson;
        final boolean stream;
        final boolean pensa;
        final int maxToken;
        /** Il modello che r4 crede aperto (campo `model`); vuoto = non lo dice. */
        final String modello;

        Domanda(String messaggiJson, String attrezziJson, boolean stream, boolean pensa, int maxToken, String modello) {
            this.messaggiJson = messaggiJson;
            this.attrezziJson = attrezziJson;
            this.stream = stream;
            this.pensa = pensa;
            this.maxToken = maxToken;
            this.modello = modello;
        }
    }

    /** Una richiesta HTTP/1.1: riga, intestazioni, corpo di `Content-Length` byte. */
    static Richiesta leggi(InputStream in) throws IOException, ErroreHttp {
        String testa = leggiTesta(in);
        String[] righe = testa.split("\r\n", -1);
        String[] prima = righe[0].split(" ", -1);
        if (prima.length != 3 || !prima[2].startsWith("HTTP/1.") || prima[0].isEmpty() || !prima[1].startsWith("/")) {
            throw new ErroreHttp(400, "BAD_REQUEST");
        }
        Map<String, String> intestazioni = new LinkedHashMap<>();
        for (int i = 1; i < righe.length; i++) {
            if (righe[i].isEmpty()) continue;
            int due = righe[i].indexOf(':');
            if (due <= 0) throw new ErroreHttp(400, "BAD_REQUEST");
            intestazioni.put(righe[i].substring(0, due).trim().toLowerCase(Locale.ROOT), righe[i].substring(due + 1).trim());
        }
        int lunghezza = 0;
        String dichiarata = intestazioni.get("content-length");
        if (dichiarata != null) {
            long n;
            try {
                n = Long.parseLong(dichiarata);
            } catch (NumberFormatException e) {
                throw new ErroreHttp(400, "BAD_REQUEST");
            }
            if (n < 0) throw new ErroreHttp(400, "BAD_REQUEST");
            if (n > TETTO_CORPO) throw new ErroreHttp(413, "PAYLOAD_TOO_LARGE");
            lunghezza = (int) n;
        }
        byte[] corpo = new byte[lunghezza];
        int letti = 0;
        while (letti < lunghezza) {
            int n = in.read(corpo, letti, lunghezza - letti);
            if (n < 0) throw new ErroreHttp(400, "BAD_REQUEST");
            letti += n;
        }
        return new Richiesta(prima[0], prima[1], Collections.unmodifiableMap(intestazioni), corpo);
    }

    private static String leggiTesta(InputStream in) throws IOException, ErroreHttp {
        ByteArrayOutputStream testa = new ByteArrayOutputStream();
        int fine = 0;
        while (true) {
            int b = in.read();
            if (b < 0) throw new ErroreHttp(400, "BAD_REQUEST");
            testa.write(b);
            if (testa.size() > TETTO_INTESTAZIONI) throw new ErroreHttp(431, "HEADERS_TOO_LARGE");
            // la fine della testa è «\r\n\r\n»
            fine = (b == '\r' && (fine == 0 || fine == 2)) || (b == '\n' && (fine == 1 || fine == 3)) ? fine + 1 : (b == '\r' ? 1 : 0);
            if (fine == 4) break;
        }
        String testo = testa.toString(StandardCharsets.ISO_8859_1.name());
        return testo.substring(0, testo.length() - 4);
    }

    /** `Authorization: Bearer <chiave>` esatta, confrontata a tempo costante. */
    static boolean autorizzata(Richiesta r, String chiave) {
        if (chiave == null || chiave.isEmpty()) return false;
        String data = r.intestazioni.get("authorization");
        if (data == null) return false;
        return MessageDigest.isEqual(data.getBytes(StandardCharsets.UTF_8), ("Bearer " + chiave).getBytes(StandardCharsets.UTF_8));
    }

    /** Il corpo di `POST /v1/chat/completions`. */
    static Domanda domanda(byte[] corpo) throws ErroreHttp {
        return domanda(corpo, false);
    }

    /**
     * `perContare`: il corpo di `POST /tokenize` (contratto vLLM `TokenizeChatRequest`, D-MO-11): lo stesso della chat completion, così
     * il prompt contato è esattamente quello che il motore genererebbe; `max_tokens` lì non serve.
     */
    static Domanda domanda(byte[] corpo, boolean perContare) throws ErroreHttp {
        JSONObject d;
        try {
            d = new JSONObject(new String(corpo, StandardCharsets.UTF_8));
        } catch (JSONException e) {
            throw new ErroreHttp(400, "BAD_JSON");
        }
        JSONArray messaggi = d.optJSONArray("messages");
        if (messaggi == null || messaggi.length() == 0) throw new ErroreHttp(400, "MESSAGES_REQUIRED");
        JSONArray attrezzi = d.optJSONArray("tools");
        boolean senzaAttrezzi = attrezzi == null || attrezzi.length() == 0 || "none".equals(d.optString("tool_choice", ""));
        boolean pensa = true;
        if ("none".equals(d.optString("reasoning_effort", ""))) pensa = false;
        JSONObject ragionamento = d.optJSONObject("reasoning");
        if (ragionamento != null && "none".equals(ragionamento.optString("effort", ""))) pensa = false;
        JSONObject kwargs = d.optJSONObject("chat_template_kwargs");
        if (kwargs != null && kwargs.has("enable_thinking")) pensa = kwargs.optBoolean("enable_thinking", pensa);
        int maxToken = d.has("max_completion_tokens") ? d.optInt("max_completion_tokens", 0)
                : d.has("max_tokens") ? d.optInt("max_tokens", 0) : MAX_TOKEN_DI_SERIE;
        if (maxToken <= 0 && !perContare) throw new ErroreHttp(400, "MAX_TOKENS_INVALID");
        return new Domanda(messaggi.toString(), senzaAttrezzi ? null : attrezzi.toString(), d.optBoolean("stream", false), pensa, maxToken,
                d.optString("model", ""));
    }

    /**
     * Un errore a flusso già aperto (la coda D-MO-10 manda l'intestazione SSE prima di avere il motore): come OpenRouter, `error` in
     * cima e `finish_reason: "error"` — r4 lo legge così (`consumaFlussoSSE`, `erroreFornitore`).
     */
    static JSONObject pezzoErrore(String codice, String messaggio) {
        try {
            JSONObject scelta = new JSONObject().put("index", 0).put("delta", new JSONObject()).put("finish_reason", "error");
            return errore(codice, messaggio).put("object", "chat.completion.chunk").put("choices", new JSONArray().put(scelta));
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    static JSONObject pezzo(String id, String modello, long creato, JSONObject delta, String fine) {
        try {
            JSONObject scelta = new JSONObject().put("index", 0).put("delta", delta).put("finish_reason", fine == null ? JSONObject.NULL : fine);
            return new JSONObject().put("id", id).put("object", "chat.completion.chunk").put("created", creato).put("model", modello)
                    .put("choices", new JSONArray().put(scelta));
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * L'ultimo pezzo, col solo uso (come `stream_options.include_usage` di OpenAI) e, quando ci sono, i `timings` di llama-server:
     * llama-server li mette proprio qui, sull'ultimo pacchetto (`server-task.cpp:517`, `deltas.back()["timings"]`).
     */
    static JSONObject pezzoUso(String id, String modello, long creato, int promptToken, int rispostaToken, JSONObject tempi) {
        try {
            JSONObject pezzo = new JSONObject().put("id", id).put("object", "chat.completion.chunk").put("created", creato).put("model", modello)
                    .put("choices", new JSONArray()).put("usage", uso(promptToken, rispostaToken));
            if (tempi != null) pezzo.put("timings", tempi);
            return pezzo;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    static String evento(JSONObject pezzo) {
        return "data: " + pezzo + "\n\n";
    }

    static String motivoDellaFine(boolean attrezzi, boolean troncato) {
        return attrezzi ? "tool_calls" : troncato ? "length" : "stop";
    }

    /** La risposta intera, dalla forma di `nativeParseReply` (content, reasoning, toolCalls[{name, arguments, id}]). */
    static JSONObject completo(String id, String modello, long creato, JSONObject letta, String fine, int promptToken, int rispostaToken,
                               JSONObject tempi) {
        try {
            JSONObject messaggio = new JSONObject().put("role", "assistant").put("content", letta.optString("content", ""));
            String ragionamento = letta.optString("reasoning", "");
            if (!ragionamento.isEmpty()) messaggio.put("reasoning_content", ragionamento);
            JSONArray chiamate = letta.optJSONArray("toolCalls");
            if (chiamate != null && chiamate.length() > 0) {
                JSONArray fuori = new JSONArray();
                for (int i = 0; i < chiamate.length(); i++) {
                    JSONObject c = chiamate.getJSONObject(i);
                    String idChiamata = c.optString("id", "");
                    // r4 abbina i risultati per id: un modello che non lo dà ne riceve uno, unico in questa risposta
                    if (idChiamata.isEmpty()) idChiamata = id + "_" + i;
                    fuori.put(new JSONObject().put("id", idChiamata).put("type", "function")
                            .put("function", new JSONObject().put("name", c.optString("name", "")).put("arguments", c.optString("arguments", ""))));
                }
                messaggio.put("tool_calls", fuori);
            }
            JSONObject scelta = new JSONObject().put("index", 0).put("message", messaggio).put("finish_reason", fine);
            JSONObject risposta = new JSONObject().put("id", id).put("object", "chat.completion").put("created", creato).put("model", modello)
                    .put("choices", new JSONArray().put(scelta)).put("usage", uso(promptToken, rispostaToken));
            if (tempi != null) risposta.put("timings", tempi);
            return risposta;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * I `timings` di llama-server (`tools/server/server-common.cpp`, `server_slot_stats::to_json`: uguali nel sottomodulo b11312 e su
     * master del 21/10/2026) dai tempi del motore (`nativeLastTimings`). Il nativo dà ISTANTI in ms dall'ingresso in JNI: il prompt
     * dura `prefillMs - prefixMs`, la generazione `totalMs - prefillMs` (come `t_token_generation`, che parte a prompt finito). Il
     * Desktop ci legge `prompt_per_second` per stimare la durata del riassunto prima di chiamarlo (contratto A1 §5, accordo del 21/10).
     *
     * ⛔ Mai numeri inventati: tempi assenti (-1, un giro interrotto prima della fine del prompt) o JSON storto ⇒ `null`, e il pacchetto
     * esce senza `timings`; una divisione per zero (prompt tutto in cache, nessun token prodotto) ⇒ `null` nel campo, come nlohmann
     * serializza l'infinito e il NaN che llama-server calcolerebbe.
     */
    static JSONObject tempi(String nativi) {
        if (nativi == null || nativi.isEmpty()) return null;
        try {
            JSONObject n = new JSONObject(nativi);
            long prefisso = n.optLong("prefixMs", -1);
            long prefill = n.optLong("prefillMs", -1);
            long totale = n.optLong("totalMs", -1);
            if (prefisso < 0 || prefill < prefisso || totale < prefill) return null;
            int nuovi = n.optInt("newTokens", 0);
            int prodotti = n.optInt("producedTokens", 0);
            double promptMs = prefill - prefisso;
            double generazioneMs = totale - prefill;
            return new JSONObject()
                    .put("cache_n", n.optInt("reusedTokens", 0))
                    .put("prompt_n", nuovi)
                    .put("prompt_ms", promptMs)
                    .put("prompt_per_token_ms", quoziente(promptMs, nuovi))
                    .put("prompt_per_second", quoziente(1000.0 * nuovi, promptMs))
                    .put("predicted_n", prodotti)
                    .put("predicted_ms", generazioneMs)
                    .put("predicted_per_token_ms", quoziente(generazioneMs, prodotti))
                    .put("predicted_per_second", quoziente(1000.0 * prodotti, generazioneMs));
        } catch (JSONException storto) {
            return null;
        }
    }

    private static Object quoziente(double sopra, double sotto) {
        return sotto > 0 ? (Object) (sopra / sotto) : JSONObject.NULL;
    }

    private static JSONObject uso(int promptToken, int rispostaToken) throws JSONException {
        return new JSONObject().put("prompt_tokens", promptToken).put("completion_tokens", rispostaToken)
                .put("total_tokens", promptToken + rispostaToken);
    }

    /** La busta d'errore di OpenAI, col codice che r4 legge. */
    static JSONObject errore(String codice, String messaggio) {
        try {
            return new JSONObject().put("error", new JSONObject().put("code", codice).put("message", messaggio).put("type", "server_error"));
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Una risposta JSON intera; la connessione si chiude dopo (una domanda per connessione). */
    static byte[] risposta(int stato, String corpoJson) {
        byte[] corpo = corpoJson.getBytes(StandardCharsets.UTF_8);
        String testa = "HTTP/1.1 " + stato + " " + frase(stato) + "\r\n"
                + "Content-Type: application/json\r\n"
                + "Content-Length: " + corpo.length + "\r\n"
                + "Connection: close\r\n\r\n";
        byte[] t = testa.getBytes(StandardCharsets.ISO_8859_1);
        byte[] tutto = new byte[t.length + corpo.length];
        System.arraycopy(t, 0, tutto, 0, t.length);
        System.arraycopy(corpo, 0, tutto, t.length, corpo.length);
        return tutto;
    }

    /** La testa di una risposta in streaming: gli eventi seguono finché la connessione non si chiude. */
    static byte[] inizioSse() {
        return ("HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/event-stream\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Connection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1);
    }

    private static String frase(int stato) {
        switch (stato) {
            case 200: return "OK";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 409: return "Conflict";
            case 413: return "Payload Too Large";
            case 431: return "Request Header Fields Too Large";
            case 503: return "Service Unavailable";
            default: return "Error";
        }
    }
}
