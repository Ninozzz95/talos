package ai.talos;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongSupplier;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): il servizio che risponde a r4, una domanda per
 * connessione, sopra il motore della chat. Senza socket (lo apre `TalosMotoreOspite`) e senza Android: provato sul PC con un motore
 * finto (`TalosMotoreOspiteServizioTest`).
 *
 * - Chiave su ogni rotta (`Authorization: Bearer`), seconda difesa dopo il socket privato.
 * - `GET /props` e `GET /v1/models` come `llama-server` (Hermes legge `default_generation_settings.n_ctx`).
 * - `POST /v1/chat/completions`: il motore si PRENDE (`TalosMotoreCondiviso`: un giro alla volta con la chat) e tutto il lavoro
 *   sul motore va all'ATTORE (`TalosLlamaEngine.soloAttore`); il lettore dello streaming gira dentro quel lavoro e si aspetta prima
 *   che finisca, così una chiusura in coda sull'attore non arriva a metà.
 * - r4 che chiude la connessione ⇒ la generazione si annulla e il motore torna libero.
 */
final class TalosMotoreOspiteServizio {

    /** Il motore, visto da qui. In produzione è il `TalosLlamaEngine` aperto dalla chat. */
    interface MotoreDaServire {
        TalosMotoreCondiviso.Esito prendi();
        void lascia();
        /** Il nome del modello aperto, o `null` se non ce n'è uno. */
        String modello();
        int finestra();
        <T> T sullAttore(Callable<T> lavoro) throws Exception;
        String chatPrompt(String messaggiJson, String attrezziJson, boolean pensa);
        int promptTokens(String prompt);
        void generateBlocking(String prompt, int maxTokens);
        String textSoFar();
        String parseReplyPartial(String text);
        String parseReply(String text);
        int tokensProduced();
        void cancel();
        /** I tempi dell'ultima generazione (`nativeLastTimings`), o `null`: per i `timings` di llama-server. */
        String ultimiTempi();
    }

    private static final SecureRandom CASO = new SecureRandom();

    /*
     * D-MO-10 (giro 16 sul Pad, 21/10 17:30): le richieste di QUESTO socket che tengono il motore adesso. Il socket ha un solo cliente,
     * r4; la chat dell'app usa il motore dentro il processo. Una richiesta che trova il motore tenuto da un'altra del socket (il
     * riassunto del contesto mentre il giro aspetta il passo dopo) non è «occupato»: aspetta in coda. Accordo col Desktop, 21/10.
     */
    private final java.util.concurrent.atomic.AtomicInteger ospitiInVolo = new java.util.concurrent.atomic.AtomicInteger();

    private final String chiave;
    private final MotoreDaServire motore;
    private final LongSupplier orologioSecondi;
    private final long sguardoMs;
    /** Ogni quanto, se il motore tace, lo stream porta un commento SSE `: ping` (llama-server `--sse-ping-interval`, di serie 30 s). */
    private final long pingMs;
    /** Quanto si aspetta un motore appena occupato (un giro abbandonato che si sta fermando) prima di dire LOCAL_ENGINE_BUSY. */
    private final long attesaOccupatoMs;
    /** Sul socket vero: un lettore che vede r4 chiudere la connessione anche quando il motore non sta scrivendo niente. */
    private final boolean sorvegliaChiusura;
    /**
     * Il diario del giro (logcat sul telefono): ogni `pingMs` di silenzio, quanti token ha prodotto il motore, quanto testo grezzo ha e
     * quanto ne è uscito verso r4; e come è finito. Desktop 21/10: un silenzio di 300 s dopo il primo dato va spiegato con i numeri.
     */
    java.util.function.Consumer<String> diario;

    TalosMotoreOspiteServizio(String chiave, MotoreDaServire motore, LongSupplier orologioSecondi, long sguardoMs) {
        this(chiave, motore, orologioSecondi, sguardoMs, 0L, 0L, false);
    }

    /*
     * Sessione lunga sul Pad, 21/10/2026 (r4 625f422a7, LFM2.5-2.6B): al 12° passo il motore ha taciuto 5 minuti, r4 ha chiuso la
     * richiesta e l'ha ripresentata dopo 0,7 s; il motore non scriveva niente, non sapeva che r4 se n'era andato e generava ancora
     * per nessuno ⇒ LOCAL_ENGINE_BUSY, giro morto, e il giro dopo partito 7 minuti più tardi. Tre rimedi: il ping (come llama-server),
     * il lettore della chiusura (annulla subito), e una breve attesa del motore che si sta liberando.
     */
    TalosMotoreOspiteServizio(String chiave, MotoreDaServire motore, LongSupplier orologioSecondi, long sguardoMs,
                              long pingMs, long attesaOccupatoMs, boolean sorvegliaChiusura) {
        this.chiave = chiave;
        this.motore = motore;
        this.orologioSecondi = orologioSecondi;
        this.sguardoMs = sguardoMs;
        this.pingMs = pingMs;
        this.attesaOccupatoMs = attesaOccupatoMs;
        this.sorvegliaChiusura = sorvegliaChiusura;
    }

    /** Una domanda e la sua risposta. Non chiude i flussi (lo fa chi ha aperto la connessione) e non lancia. */
    void servi(InputStream in, OutputStream out) {
        try {
            TalosMotoreOspiteHttp.Richiesta r;
            try {
                r = TalosMotoreOspiteHttp.leggi(in);
            } catch (TalosMotoreOspiteHttp.ErroreHttp e) {
                rispondi(out, e.stato, e.codice, "The request could not be read.");
                return;
            }
            if (!TalosMotoreOspiteHttp.autorizzata(r, chiave)) {
                rispondi(out, 401, "UNAUTHORIZED", "A valid key is required.");
                return;
            }
            String percorso = r.percorso.split("\\?", 2)[0];
            switch (percorso) {
                case "/props":
                case "/v1/props":
                    if (!"GET".equals(r.metodo)) rispondi(out, 405, "METHOD_NOT_ALLOWED", "Use GET.");
                    else proprieta(out);
                    return;
                case "/models":
                case "/v1/models":
                    if (!"GET".equals(r.metodo)) rispondi(out, 405, "METHOD_NOT_ALLOWED", "Use GET.");
                    else modelli(out);
                    return;
                case "/chat/completions":
                case "/v1/chat/completions":
                    if (!"POST".equals(r.metodo)) rispondi(out, 405, "METHOD_NOT_ALLOWED", "Use POST.");
                    else completa(r, in, out, false);
                    return;
                // D-MO-11: i token ESATTI del prompt, per il controllo della finestra di r4 (contratto vLLM `/tokenize`)
                case "/tokenize":
                case "/v1/tokenize":
                    if (!"POST".equals(r.metodo)) rispondi(out, 405, "METHOD_NOT_ALLOWED", "Use POST.");
                    else completa(r, in, out, true);
                    return;
                default:
                    rispondi(out, 404, "NOT_FOUND", "Unknown path.");
            }
        } catch (IOException connessioneCaduta) {
            // r4 se n'è andato: non c'è nessuno a cui dirlo
        }
    }

    private void proprieta(OutputStream out) throws IOException {
        String modello = motore.modello();
        if (modello == null) {
            nonPronto(out);
            return;
        }
        try {
            JSONObject props = new JSONObject()
                    .put("default_generation_settings", new JSONObject().put("n_ctx", motore.finestra()))
                    .put("model_path", modello);
            out.write(TalosMotoreOspiteHttp.risposta(200, props.toString()));
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private void modelli(OutputStream out) throws IOException {
        String modello = motore.modello();
        if (modello == null) {
            nonPronto(out);
            return;
        }
        try {
            JSONObject voce = new JSONObject().put("id", modello).put("object", "model").put("owned_by", "talos")
                    .put("meta", new JSONObject().put("n_ctx", motore.finestra()));
            out.write(TalosMotoreOspiteHttp.risposta(200, new JSONObject().put("object", "list").put("data", new JSONArray().put(voce)).toString()));
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private void nonPronto(OutputStream out) throws IOException {
        rispondi(out, 503, "LOCAL_RUNTIME_NOT_READY", "No on-device model is loaded.");
    }

    private void completa(TalosMotoreOspiteHttp.Richiesta r, InputStream in, OutputStream out, boolean conta) throws IOException {
        final TalosMotoreOspiteHttp.Domanda d;
        try {
            d = TalosMotoreOspiteHttp.domanda(r.corpo, conta);
        } catch (TalosMotoreOspiteHttp.ErroreHttp e) {
            rispondi(out, e.stato, e.codice, "The request body is not a valid chat completion request.");
            return;
        }
        TalosMotoreCondiviso.Esito esito = motore.prendi();
        // un giro abbandonato si ferma in meno di un secondo (annullamento dentro llama.cpp): si aspetta un attimo prima di dire «occupato»
        final long scade = System.nanoTime() + attesaOccupatoMs * 1_000_000L;
        while (esito == TalosMotoreCondiviso.Esito.OCCUPATO && System.nanoTime() < scade) {
            try {
                Thread.sleep(50L);
            } catch (InterruptedException interrotto) {
                Thread.currentThread().interrupt();
                break;
            }
            esito = motore.prendi();
        }
        boolean intestazioneMandata = false;
        if (esito == TalosMotoreCondiviso.Esito.OCCUPATO && ospitiInVolo.get() > 0) {
            // D-MO-10: lo tiene un'altra richiesta di r4 ⇒ in coda, senza tetto, finché r4 tiene aperta la connessione
            final boolean ferma = conta || !d.stream;
            final AtomicBoolean andatoVia = new AtomicBoolean(false);
            if (ferma) {
                if (sorvegliaChiusura) {
                    Thread sentinella = new Thread(() -> {
                        try {
                            while (in.read() >= 0) { /* si aspetta la chiusura */ }
                        } catch (IOException chiusa) {
                            // chiusa anche questa
                        }
                        andatoVia.set(true);
                    }, "talos-motore-ospite-coda");
                    sentinella.setDaemon(true);
                    sentinella.start();
                }
            } else {
                // l'intestazione subito, poi i ping: r4 vede il canale vivo, e un ping che non passa dice che se n'è andato
                synchronized (out) {
                    out.write(TalosMotoreOspiteHttp.inizioSse());
                    out.flush();
                }
                intestazioneMandata = true;
            }
            long ultimoPing = System.nanoTime();
            while (esito == TalosMotoreCondiviso.Esito.OCCUPATO) {
                if (andatoVia.get()) return;
                if (!ferma && pingMs > 0 && System.nanoTime() - ultimoPing >= pingMs * 1_000_000L) {
                    try {
                        ping(out);
                    } catch (IOException r4AndatoVia) {
                        return;
                    }
                    ultimoPing = System.nanoTime();
                }
                try {
                    Thread.sleep(50L);
                } catch (InterruptedException interrotto) {
                    Thread.currentThread().interrupt();
                    return;
                }
                esito = motore.prendi();
            }
        }
        if (esito == TalosMotoreCondiviso.Esito.OCCUPATO) {
            rispondi(out, 503, "LOCAL_ENGINE_BUSY",
                    "The on-device model is busy with another job (a chat reply or a context summary); try again when it has finished.");
            return;
        }
        if (esito == TalosMotoreCondiviso.Esito.NESSUN_MODELLO) {
            rifiuta(out, intestazioneMandata, 503, "LOCAL_RUNTIME_NOT_READY", "No on-device model is loaded.");
            return;
        }
        ospitiInVolo.incrementAndGet();
        final boolean giaAperto = intestazioneMandata;
        final AtomicBoolean iniziata = new AtomicBoolean(giaAperto);
        try {
            motore.sullAttore(() -> {
                if (conta) conta(d, out);
                else giro(d, in, out, iniziata, giaAperto);
                return null;
            });
        } catch (Exception guasto) {
            if (!iniziata.get()) rispondi(out, 500, "LOCAL_ENGINE_FAILED", "The on-device engine could not answer.");
        } finally {
            motore.lascia();
            ospitiInVolo.decrementAndGet();
        }
    }

    /** D-MO-11, sull'attore: il prompt che il motore genererebbe per questo corpo, contato coi token veri, e la finestra. */
    private void conta(TalosMotoreOspiteHttp.Domanda d, OutputStream out) throws IOException {
        int n = motore.promptTokens(motore.chatPrompt(d.messaggiJson, d.attrezziJson, d.pensa));
        try {
            out.write(TalosMotoreOspiteHttp.risposta(200, new JSONObject().put("count", n).put("max_model_len", motore.finestra()).toString()));
            out.flush();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Sull'attore: prompt, finestra, generazione, risposta. */
    private void giro(TalosMotoreOspiteHttp.Domanda d, InputStream in, OutputStream out, AtomicBoolean iniziata,
                      boolean intestazioneMandata) throws IOException {
        // nella chat si può aprire un altro modello fra due giri del Codice: si dice, invece di parlare in silenzio col modello nuovo
        if (!d.modello.isEmpty() && !d.modello.equalsIgnoreCase(motore.modello())) {
            iniziata.set(true);
            rifiuta(out, intestazioneMandata, 409, "LOCAL_MODEL_CHANGED", "Another on-device model is open now; choose it again in Code.");
            return;
        }
        String prompt = motore.chatPrompt(d.messaggiJson, d.attrezziJson, d.pensa);
        int promptToken = motore.promptTokens(prompt);
        int resto = motore.finestra() - promptToken - 1;
        // SERV-26 (Pad 22/10/2026, Qwen3.5): un prompt VUOTO è il template di chat del GGUF che ha rifiutato la conversazione, non
        // una finestra piena. Un codice suo, che r4 tratta come rifiuto (riprova senza attrezzi, poi «il motore locale non ha
        // accettato questa richiesta», Desktop 22/10): mai CONTEXT_LENGTH_EXCEEDED, che darebbe la colpa alla lunghezza.
        if (promptToken <= 0) {
            iniziata.set(true);
            rifiuta(out, intestazioneMandata, 400, "CHAT_TEMPLATE_FAILED", "This model's chat template does not accept the conversation.");
            return;
        }
        if (resto <= 0) {
            iniziata.set(true);
            // i numeri nei campi di llama-server (`exceed_context_size_error`) che r4 legge: la frase a schermo li dice
            rifiuta(out, intestazioneMandata, 400, "CONTEXT_LENGTH_EXCEEDED", "The conversation does not fit in the on-device model's context window.",
                    promptToken, motore.finestra());
            return;
        }
        final int massimo = Math.min(d.maxToken, resto);
        final String id = "chatcmpl-" + esadecimale(12);
        final long creato = orologioSecondi.getAsLong();
        final String modello = motore.modello();
        try {
            if (!d.stream) {
                /*
                 * SERV-25 (22/10/2026, rete chiesta dal Desktop): anche senza stream una connessione chiusa ferma il giro, come
                 * llama-server (`server-context.cpp:4333`, `rd.wait_for_all(req.should_stop)`). Prima il giro arrivava a `max_tokens`
                 * e la richiesta dopo aspettava in coda per niente.
                 */
                final AtomicBoolean finitoSenzaStream = new AtomicBoolean(false);
                final AtomicBoolean cadutaSenzaStream = new AtomicBoolean(false);
                if (sorvegliaChiusura) sorvegliaLaChiusura(in, finitoSenzaStream, cadutaSenzaStream);
                try {
                    motore.generateBlocking(prompt, massimo);
                } finally {
                    finitoSenzaStream.set(true);
                }
                // nessuno ascolta più: non si scrive una risposta a una connessione chiusa
                if (cadutaSenzaStream.get()) return;
                JSONObject letta = new JSONObject(motore.parseReply(motore.textSoFar()));
                JSONArray chiamate = letta.optJSONArray("toolCalls");
                int prodotti = motore.tokensProduced();
                String fine = TalosMotoreOspiteHttp.motivoDellaFine(chiamate != null && chiamate.length() > 0, prodotti >= massimo);
                iniziata.set(true);
                out.write(TalosMotoreOspiteHttp.risposta(200, TalosMotoreOspiteHttp.completo(id, modello, creato, letta, fine, promptToken,
                        prodotti, TalosMotoreOspiteHttp.tempi(motore.ultimiTempi())).toString()));
                out.flush();
                return;
            }
            iniziata.set(true);
            if (!intestazioneMandata) {
                out.write(TalosMotoreOspiteHttp.inizioSse());
                out.flush();
            }
            final TalosMotoreOspiteFlusso flusso = new TalosMotoreOspiteFlusso();
            final AtomicBoolean finito = new AtomicBoolean(false);
            final AtomicBoolean caduta = new AtomicBoolean(false);
            if (sorvegliaChiusura) sorvegliaLaChiusura(in, finito, caduta);
            /*
             * Il testo della risposta di PRIMA resta nel motore finché la generazione nuova non lo azzera: letto da qui usciva come
             * inizio della risposta nuova (diario del Pad, 21/10 14:21:49: 5.411 caratteri con token=0), r4 armava il guardiano dei
             * dati su un dato finto e il prefill lungo lo faceva scattare. Si legge solo dopo che il testo vecchio è sparito.
             */
            final String stantio = motore.textSoFar();
            Thread lettore = new Thread(() -> {
                long ultimoInvio = System.nanoTime();
                boolean avviata = stantio == null || stantio.isEmpty();
                while (!finito.get() && !caduta.get()) {
                    try {
                        String letto = motore.textSoFar();
                        if (!avviata) {
                            if (letto != null && letto.equals(stantio)) {
                                if (pingMs > 0 && System.nanoTime() - ultimoInvio >= pingMs * 1_000_000L) {
                                    ping(out);
                                    ultimoInvio = System.nanoTime();
                                }
                                Thread.sleep(sguardoMs);
                                continue;
                            }
                            avviata = true;
                        }
                        JSONObject parziale = new JSONObject(motore.parseReplyPartial(letto));
                        JSONObject delta = flusso.avanza(parziale);
                        // prima il testo che precede la chiamata, poi i pezzi della chiamata (contratto del Desktop, 21/10)
                        List<JSONObject> pezziChiamate = flusso.avanzaChiamate(parziale.optJSONArray("toolCalls"), id);
                        if (delta != null) {
                            manda(out, TalosMotoreOspiteHttp.pezzo(id, modello, creato, delta, null));
                            ultimoInvio = System.nanoTime();
                        }
                        for (JSONObject pezzo : pezziChiamate) {
                            manda(out, TalosMotoreOspiteHttp.pezzo(id, modello, creato, pezzo, null));
                            ultimoInvio = System.nanoTime();
                        }
                        if (delta == null && pezziChiamate.isEmpty() && pingMs > 0
                                && System.nanoTime() - ultimoInvio >= pingMs * 1_000_000L) {
                            ping(out);
                            ultimoInvio = System.nanoTime();
                            scrivi("silenzio " + id + " token=" + motore.tokensProduced() + " grezzo=" + motore.textSoFar().length()
                                    + " uscito=" + flusso.detto());
                        }
                        Thread.sleep(sguardoMs);
                    } catch (IOException r4AndatoVia) {
                        caduta.set(true);
                        motore.cancel();
                    } catch (InterruptedException fermato) {
                        return;
                    } catch (RuntimeException | JSONException letturaStorta) {
                        // una lettura parziale storta non ferma il giro: si aspetta la prossima, o la finale
                    }
                }
            }, "talos-motore-ospite-lettore");
            lettore.start();
            try {
                motore.generateBlocking(prompt, massimo);
            } finally {
                finito.set(true);
                try {
                    lettore.join(5_000L);
                } catch (InterruptedException interrotto) {
                    Thread.currentThread().interrupt();
                }
            }
            scrivi("fine " + id + " token=" + motore.tokensProduced() + " grezzo=" + motore.textSoFar().length()
                    + " uscito=" + flusso.detto() + (caduta.get() ? " r4-andato-via" : ""));
            if (caduta.get()) return;
            JSONObject finale = new JSONObject(motore.parseReply(motore.textSoFar()));
            List<JSONObject> resti = flusso.chiudi(finale, id);
            for (JSONObject delta : resti) manda(out, TalosMotoreOspiteHttp.pezzo(id, modello, creato, delta, null));
            int prodotti = motore.tokensProduced();
            manda(out, TalosMotoreOspiteHttp.pezzo(id, modello, creato, new JSONObject(),
                    TalosMotoreOspiteHttp.motivoDellaFine(flusso.haChiamato(), prodotti >= massimo)));
            // i `timings` di llama-server sull'ultimo pacchetto: il Desktop ci stima la durata del riassunto (contratto A1 §5)
            JSONObject tempi = TalosMotoreOspiteHttp.tempi(motore.ultimiTempi());
            if (tempi != null) scrivi("tempi " + id + " prompt_per_second=" + tempi.opt("prompt_per_second") + " prompt_n="
                    + tempi.optInt("prompt_n") + " cache_n=" + tempi.optInt("cache_n"));
            manda(out, TalosMotoreOspiteHttp.pezzoUso(id, modello, creato, promptToken, prodotti, tempi));
            synchronized (out) {
                out.write(TalosMotoreOspiteHttp.FINE_SSE.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (JSONException rispostaStorta) {
            throw new IllegalStateException(rispostaStorta);
        }
    }

    private void scrivi(String riga) {
        java.util.function.Consumer<String> d = diario;
        if (d != null) {
            try {
                d.accept(riga);
            } catch (RuntimeException ignorato) {
                // il diario non ferma mai il giro
            }
        }
    }

    /**
     * La sentinella della chiusura: la richiesta è già letta tutta, quindi dal socket arriva solo la fine, quando r4 chiude. Allora il
     * giro si annulla, con o senza stream (SERV-07, SERV-11, SERV-25), e `caduta` dice a chi scrive che nessuno ascolta più.
     * Revisione avversaria (3): se r4 chiude prima che la generazione parta, il suo avvio azzera l'annullamento (`nativeGenerate`);
     * quindi si ripete finché il giro non è `finito`: il motore è nostro fino a `lascia()`.
     */
    private void sorvegliaLaChiusura(InputStream in, AtomicBoolean finito, AtomicBoolean caduta) {
        Thread sentinella = new Thread(() -> {
            try {
                while (in.read() >= 0) { /* niente da leggere: si aspetta la chiusura */ }
            } catch (IOException chiusa) {
                // chiusa anche questa
            }
            if (!finito.get() && caduta.compareAndSet(false, true)) {
                while (!finito.get()) {
                    motore.cancel();
                    try {
                        Thread.sleep(sguardoMs);
                    } catch (InterruptedException interrotto) {
                        return;
                    }
                }
            }
        }, "talos-motore-ospite-sentinella");
        sentinella.setDaemon(true);
        sentinella.start();
    }

    /** Un commento SSE: i client lo scartano (non è un `data:`), ma il canale si vede vivo e una connessione chiusa si scopre qui. */
    private static void ping(OutputStream out) throws IOException {
        byte[] commento = ": ping\n\n".getBytes(StandardCharsets.UTF_8);
        synchronized (out) {
            out.write(commento, 0, commento.length);
            out.flush();
        }
    }

    private static void manda(OutputStream out, JSONObject pezzo) throws IOException {
        byte[] evento = TalosMotoreOspiteHttp.evento(pezzo).getBytes(StandardCharsets.UTF_8);
        synchronized (out) {
            out.write(evento, 0, evento.length);
            out.flush();
        }
    }

    /** Un rifiuto: risposta HTTP intera, o a flusso già aperto dalla coda un pacchetto d'errore e la fine dello stream. */
    private static void rifiuta(OutputStream out, boolean intestazioneMandata, int stato, String codice, String messaggio) throws IOException {
        rifiuta(out, intestazioneMandata, stato, codice, messaggio, -1, -1);
    }

    /** Come sopra; con `promptToken`/`finestra` ≥ 0 l'errore porta anche `n_prompt_tokens` e `n_ctx`, come llama-server. */
    private static void rifiuta(OutputStream out, boolean intestazioneMandata, int stato, String codice, String messaggio,
                                int promptToken, int finestra) throws IOException {
        if (!intestazioneMandata) {
            out.write(TalosMotoreOspiteHttp.risposta(stato, conINumeri(TalosMotoreOspiteHttp.errore(codice, messaggio), promptToken, finestra).toString()));
            out.flush();
            return;
        }
        manda(out, conINumeri(TalosMotoreOspiteHttp.pezzoErrore(codice, messaggio), promptToken, finestra));
        synchronized (out) {
            out.write(TalosMotoreOspiteHttp.FINE_SSE.getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }

    private static JSONObject conINumeri(JSONObject corpo, int promptToken, int finestra) {
        if (promptToken < 0 || finestra < 0) return corpo;
        try {
            corpo.getJSONObject("error").put("n_prompt_tokens", promptToken).put("n_ctx", finestra);
            return corpo;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void rispondi(OutputStream out, int stato, String codice, String messaggio) throws IOException {
        out.write(TalosMotoreOspiteHttp.risposta(stato, TalosMotoreOspiteHttp.errore(codice, messaggio).toString()));
        out.flush();
    }

    private static String esadecimale(int byteCasuali) {
        byte[] b = new byte[byteCasuali];
        CASO.nextBytes(b);
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x & 0xff));
        return s.toString();
    }
}
