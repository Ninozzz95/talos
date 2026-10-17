package ai.talos;

import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * La porta su cui rientra la risposta di un accesso OAuth.
 *
 * <h2>Perché serve del codice nativo</h2>
 *
 * Il flusso PKCE di OpenRouter rimanda il browser a un indirizzo. Su Android le
 * due strade abituali sono chiuse per noi: uno schema proprio
 * ({@code talos://…}) OpenRouter non lo accetta, e un indirizzo {@code https}
 * nostro richiederebbe un dominio e un file di verifica firmato con la chiave
 * dell'APK — infrastruttura che un'app distribuita e locale non ha.
 *
 * Resta l'anello di ritorno, {@code http://127.0.0.1:<porta>}, che OpenRouter
 * accetta esplicitamente su qualunque porta ed è anche ciò che RFC 8252
 * raccomanda per le app native. Ma JavaScript non può mettersi in ascolto su
 * una porta: da qui in giù è terra nativa.
 *
 * <h2>Cosa fa, e cosa deliberatamente NON fa</h2>
 *
 * Legge la prima riga di una richiesta, risponde con una pagina che dice di
 * tornare all'app, e consegna la riga a JavaScript. Non è un server: non
 * serve file, non ha rotte, non resta acceso. Vive per la durata di un accesso
 * e muore, perché una porta aperta più a lungo del necessario è una porta che
 * qualcun altro può usare.
 *
 * <h2>Le tre chiusure</h2>
 *
 * <ol>
 *   <li><b>Solo l'anello locale.</b> Il socket si lega a {@code 127.0.0.1}, non
 *       a {@code 0.0.0.0}: nessuno sulla rete Wi-Fi può nemmeno bussare.</li>
 *   <li><b>Porta effimera.</b> La sceglie il sistema (porta 0) fra quelle
 *       libere, quindi non c'è un numero fisso che un'altra app possa occupare
 *       prima di noi.</li>
 *   <li><b>Il codice da solo non basta.</b> Chi bussasse su questa porta
 *       riuscirebbe al massimo a farci provare uno scambio che fallisce: il
 *       verificatore PKCE che sblocca il codice non ha mai lasciato il
 *       processo. La difesa vera è là, questa porta è solo la buca.</li>
 * </ol>
 *
 * <h2>⛔ Revisione del 13/10/2026 (N15, «Continue with ChatGPT»)</h2>
 *
 * Con un secondo flusso sulla stessa porta sono usciti quattro difetti, ognuno
 * con la sua prova in {@code TalosOAuthLoopbackAscoltoTest}:
 *
 * <ul>
 *   <li><b>Un ascolto per canale.</b> La porta era una sola: aprire l'accesso
 *       di OpenRouter chiudeva quello di ChatGPT e viceversa, e chi finiva
 *       chiudeva «la porta corrente», anche se non era la sua. Ora ogni canale
 *       ({@code channel}; OpenRouter è quello senza nome) ha il suo ascolto,
 *       ogni ascolto ha un numero ({@code id}), e {@code close} col numero
 *       chiude solo quello.</li>
 *   <li><b>Il percorso atteso.</b> Vinceva la prima richiesta, qualunque
 *       fosse: bastava che un'altra app bussasse perché il ritorno vero
 *       trovasse la porta chiusa. Con {@code path} ciò che non è il ritorno
 *       riceve 404 e l'ascolto continua fino alla scadenza. Senza
 *       {@code path} (OpenRouter) resta com'era: la prima richiesta, poi si
 *       chiude.</li>
 *   <li><b>Il tempo sulla lettura.</b> Il tempo era solo sull'{@code accept}:
 *       una connessione muta fermava il thread per sempre.</li>
 *   <li><b>Il tempo finito ha il suo codice</b>
 *       ({@code TALOS_OAUTH_TIMEOUT}), diverso da «chiuso da qualcuno».</li>
 * </ul>
 */
@CapacitorPlugin(name = "TalosOAuthLoopback")
public class TalosOAuthLoopbackPlugin extends Plugin {

    /**
     * Quanto si resta in ascolto. Un accesso lo si fa in un minuto o non lo si
     * fa: oltre, la porta va chiusa da sola anche se nessuno la richiude.
     */
    private static final int LISTEN_TIMEOUT_MS = 180_000;
    /**
     * ⛔ N15-ACC-07 — MISURATO sul Pad il 13/10/2026: l'accesso col piano ChatGPT (scelta dell'account, nome dell'agente,
     * consenso) dura più di 180 s; la porta si chiudeva e OpenAI rimandava il browser a «Connessione negata». Chi apre può
     * chiedere il suo tempo ({@code timeoutMs}); resta un tetto, perché una porta non deve restare aperta senza limite.
     * Senza richiesta vale il tempo corto di sempre (OpenRouter non cambia).
     */
    private static final int LISTEN_TIMEOUT_MIN_MS = 30_000;
    private static final int LISTEN_TIMEOUT_MAX_MS = 15 * 60_000;

    static int listenTimeoutMs(Integer requested) {
        if (requested == null) return LISTEN_TIMEOUT_MS;
        return Math.max(LISTEN_TIMEOUT_MIN_MS, Math.min(LISTEN_TIMEOUT_MAX_MS, requested));
    }
    private static final int MAX_REQUEST_LINE = 8192;
    /**
     * Quanto può metterci UNA connessione a dire la sua prima riga. Un browser la manda subito; chi si collega e tace
     * (un'altra app, o una connessione aperta in anticipo e mai usata) non deve tenere ferma la porta.
     */
    private static final int READ_TIMEOUT_MS = 4_000;
    /** Quanti ritorni si tengono da parte quando nessuno aspetta: il nostro è uno, gli altri sono rumore. */
    private static final int MAX_DA_PARTE = 8;

    static final String CANCELLED = "TALOS_OAUTH_CANCELLED";
    static final String TIMEOUT = "TALOS_OAUTH_TIMEOUT";
    static final String CALLBACK_FAILED = "TALOS_OAUTH_CALLBACK_FAILED";
    static final String NOT_LISTENING = "TALOS_OAUTH_NOT_LISTENING";

    /** Chi aspetta un ritorno: per il plugin è la chiamata JavaScript tenuta viva. */
    interface Attesa {
        void arrivato(String target);
        void finito(String codice);
    }

    /**
     * ⛔⛔ IL CODICE SI CONSERVA, non si consegna e basta — 2026-08-10, misurato
     * sul Pad.
     *
     * `awaitCallback` risponde a una chiamata TENUTA VIVA nella WebView. Se
     * Android ricrea l'attività mentre il browser di sistema è davanti — e lo
     * fa, perché la nostra pagina è in secondo piano e la memoria serve al
     * browser — quella chiamata muore col suo contesto JavaScript. Il thread
     * dell'ascolto riceve il codice e lo consegna a NESSUNO: la pagina locale
     * dice di tornare a TALOS, l'utente torna, e non succede niente.
     * Nessun errore, nessuna traccia. È esattamente ciò che è successo tre
     * volte di fila.
     *
     * ⛔ `static` non è pigrizia: gli ascolti (e ciò che tengono da parte)
     * devono sopravvivere alla ricreazione dell'ATTIVITÀ, che è il caso reale.
     * Se muore il processo muore anche la porta in ascolto, quindi il browser
     * non avrebbe mai potuto rispondere — quel caso non esiste e non va difeso.
     */
    private static final Map<String, Ascolto> ASCOLTI = new HashMap<>();
    private static int prossimoId = 0;

    /** Apre l'ascolto di un canale, chiudendo SOLO quello che c'era su quel canale. */
    static Ascolto apri(String canale, String percorso, int timeoutMs) throws Exception {
        return apri(canale, percorso, timeoutMs, READ_TIMEOUT_MS);
    }

    static Ascolto apri(String canale, String percorso, int timeoutMs, int letturaMs) throws Exception {
        return apri(canale, percorso, timeoutMs, letturaMs, null, null);
    }

    /**
     * {@code statoAtteso} e {@code alRitornoGiusto}: quando arriva IL ritorno di questo accesso (percorso giusto e stato
     * giusto) si chiama {@code alRitornoGiusto}, una volta sola. Serve a riportare l'app davanti alla scheda del browser:
     * JavaScript non può farlo, perché con la scheda davanti la WebView è ferma (misurato sul Pad il 13/10/2026 — il
     * ritorno arrivava all'app solo quando la persona chiudeva la scheda da sé). Lo stato qui NON decide l'accesso: quello
     * lo giudica sempre JavaScript. Decide solo se è il momento di tornare.
     */
    static Ascolto apri(String canale, String percorso, int timeoutMs, int letturaMs, String statoAtteso, Runnable alRitornoGiusto) throws Exception {
        synchronized (ASCOLTI) {
            Ascolto vecchio = ASCOLTI.get(canale);
            if (vecchio != null) vecchio.chiudi();
            prossimoId += 1;
            Ascolto nuovo = new Ascolto(prossimoId, percorso, timeoutMs, letturaMs, statoAtteso, alRitornoGiusto);
            ASCOLTI.put(canale, nuovo);
            return nuovo;
        }
    }

    /** L'ultimo ascolto di quel canale, anche già chiuso (ciò che ha tenuto da parte si ritira lo stesso), o {@code null}. */
    static Ascolto ascolto(String canale) {
        synchronized (ASCOLTI) {
            return ASCOLTI.get(canale);
        }
    }

    /** Chiude l'ascolto del canale. Con un numero, solo se è ancora QUELLO: un tentativo vecchio non chiude il nuovo. */
    static void chiudi(String canale, Integer id) {
        Ascolto corrente = ascolto(canale);
        if (corrente != null && (id == null || corrente.id == id)) corrente.chiudi();
    }

    /**
     * Un ascolto: una porta, il suo thread, ciò che è arrivato e chi lo aspetta.
     *
     * Senza {@code percorso} è l'ascolto di sempre (OpenRouter): la prima richiesta è il ritorno, la porta si chiude, e il
     * ritorno resta ANCHE da parte finché non lo si ritira. Con {@code percorso} (ChatGPT) solo le richieste a quel percorso
     * sono un ritorno, le altre ricevono 404, e la porta resta aperta fino alla scadenza o a chi la chiude: lo stato lo
     * giudica JavaScript, e se non era il suo torna ad aspettare qui.
     */
    static final class Ascolto {
        final int id;
        private final String percorso;
        private final ServerSocket socket;
        private final long scadenzaNanos;
        private final int letturaMs;
        private final ArrayDeque<String> arrivati = new ArrayDeque<>();
        private Attesa attesa;
        /** {@code null} finché ascolta; poi perché ha smesso. */
        private String fine;
        /** Solo senza percorso: il ritorno è già stato dato a chi aspettava (resta da parte, ma non si ridà con `aspetta`). */
        private boolean consegnato;
        /**
         * Col percorso: l'ultimo ritorno dato a chi aspettava. ⛔ MISURATO sul Pad il 13/10/2026: il ritorno arriva, lo si dà
         * alla pagina, e subito dopo Android ricrea l'attività — quella pagina muore senza averlo usato. Se l'attività viene
         * distrutta, torna da parte ({@link #dimenticaAttesa}) e la pagina nuova lo ritrova.
         */
        private String datoAChiAspettava;
        private final String statoAtteso;
        private final Runnable alRitornoGiusto;
        private boolean tornato;

        Ascolto(int id, String percorso, int timeoutMs, int letturaMs, String statoAtteso, Runnable alRitornoGiusto) throws Exception {
            this.id = id;
            this.percorso = percorso;
            this.letturaMs = letturaMs;
            this.statoAtteso = statoAtteso;
            this.alRitornoGiusto = alRitornoGiusto;
            this.socket = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
            this.scadenzaNanos = System.nanoTime() + timeoutMs * 1_000_000L;
            Thread thread = new Thread(this::ascolta, "talos-oauth-loopback");
            thread.setDaemon(true);
            thread.start();
        }

        int porta() {
            return socket.getLocalPort();
        }

        boolean haPercorso() {
            return percorso != null;
        }

        synchronized boolean aperto() {
            return fine == null;
        }

        /** Aspetta il prossimo ritorno. Se è già arrivato lo dà subito; se l'ascolto è finito lo dice. */
        void aspetta(Attesa nuova) {
            String target = null;
            String codice = null;
            Attesa scalzata = null;
            synchronized (this) {
                if (!arrivati.isEmpty() && percorso != null) {
                    target = arrivati.poll();
                    datoAChiAspettava = target;
                } else if (!arrivati.isEmpty() && !consegnato) {
                    consegnato = true;
                    target = arrivati.peek();
                } else if (fine != null) {
                    codice = TIMEOUT.equals(fine) ? TIMEOUT : NOT_LISTENING;
                } else {
                    scalzata = attesa;
                    attesa = nuova;
                    // La pagina è viva ed è tornata ad aspettare: ciò che aveva ricevuto l'ha usato (o scartato) lei.
                    datoAChiAspettava = null;
                }
            }
            // Fuori dal blocco: chi viene avvisato può richiamare qui dentro.
            if (target != null) nuova.arrivato(target);
            else if (codice != null) nuova.finito(codice);
            if (scalzata != null) scalzata.finito(CANCELLED);
        }

        /** Ciò che è arrivato mentre nessuno aspettava. Si ritira UNA volta: un codice vale un uso. */
        synchronized String ritira() {
            return arrivati.poll();
        }

        /** L'attività è stata distrutta: la chiamata che aspettava non esiste più, e non le si consegna niente. */
        synchronized void dimenticaAttesa() {
            attesa = null;
            if (percorso != null && datoAChiAspettava != null) {
                if (arrivati.size() < MAX_DA_PARTE) arrivati.addFirst(datoAChiAspettava);
                datoAChiAspettava = null;
            }
        }

        void chiudi() {
            try {
                socket.close();
            } catch (Exception ignored) {
                // Chiudere una porta già chiusa non è un problema di nessuno.
            }
        }

        private void ascolta() {
            String codice = CALLBACK_FAILED;
            try {
                while (true) {
                    long restaMs = (scadenzaNanos - System.nanoTime()) / 1_000_000L;
                    if (restaMs <= 0) {
                        codice = TIMEOUT;
                        break;
                    }
                    socket.setSoTimeout((int) Math.min(Integer.MAX_VALUE, restaMs));
                    Socket connessione;
                    try {
                        connessione = socket.accept();
                    } catch (SocketTimeoutException scaduto) {
                        codice = TIMEOUT;
                        break;
                    }
                    String target = servi(connessione);
                    if (target == null) continue;
                    consegna(target);
                    avvisaSeEIlRitornoGiusto(target);
                    if (percorso == null) {
                        codice = null;
                        break;
                    }
                }
            } catch (Exception error) {
                // Una porta chiusa mentre si aspettava è un annullamento, non un
                // guasto: chi ha chiuso sa perché.
                codice = socket.isClosed() ? CANCELLED : CALLBACK_FAILED;
            } finally {
                // ⛔ Si chiude la PROPRIA porta, mai «quella corrente»: prima questo thread, finendo, chiudeva anche
                // l'ascolto aperto nel frattempo da un altro accesso.
                chiudi();
                finisci(codice);
            }
        }

        /**
         * Serve una connessione. Torna la riga di indirizzo se è un ritorno, {@code null} se non lo è: una connessione
         * muta, lenta o rotta, o (col percorso atteso) una richiesta a un altro percorso. In nessun caso ferma l'ascolto.
         */
        private String servi(Socket connessione) {
            try (Socket aperta = connessione) {
                aperta.setSoTimeout(letturaMs);
                String target = readRequestTarget(aperta, letturaMs);
                boolean nostro = percorso == null || percorso.equals(pathOf(target));
                try {
                    if (nostro) writeClosingPage(aperta);
                    else writeNotFound(aperta);
                } catch (Exception ignored) {
                    // Il ritorno è già stato letto: un browser che chiude prima della pagina non lo cancella.
                }
                if (!nostro) return null;
                return target == null ? "" : target;
            } catch (Exception error) {
                return null;
            }
        }

        private void consegna(String target) {
            Attesa aspettava;
            synchronized (this) {
                aspettava = attesa;
                attesa = null;
                if (percorso == null) {
                    // Si mette DA PARTE anche quando lo si consegna: se di là non c'è più
                    // nessuno, resta qui e lo si ritira con `pendingCallback`.
                    arrivati.clear();
                    arrivati.add(target);
                    consegnato = aspettava != null;
                } else if (aspettava == null && arrivati.size() < MAX_DA_PARTE) {
                    arrivati.add(target);
                } else if (aspettava != null) {
                    datoAChiAspettava = target;
                }
            }
            if (aspettava != null) aspettava.arrivato(target);
        }

        /** Il ritorno di QUESTO accesso è arrivato: si avvisa chi riporta l'app davanti, una volta sola. Un suo guasto non ferma l'ascolto. */
        private void avvisaSeEIlRitornoGiusto(String target) {
            if (percorso == null || statoAtteso == null || alRitornoGiusto == null || tornato) return;
            if (!statoAtteso.equals(parametro(target, "state"))) return;
            tornato = true;
            try {
                alRitornoGiusto.run();
            } catch (Exception ignored) {
                // Non si riesce a tornare da soli: la pagina dice di tornare a TALOS, come prima.
            }
        }

        private void finisci(String codice) {
            Attesa aspettava;
            synchronized (this) {
                if (fine != null) return;
                fine = codice == null ? NOT_LISTENING : codice;
                aspettava = attesa;
                attesa = null;
            }
            if (aspettava != null) aspettava.finito(codice == null ? NOT_LISTENING : codice);
        }
    }

    /**
     * Apre la porta e dice quale è. Non aspetta: il browser deve poter partire
     * subito, e la risposta arriverà su {@code awaitCallback}.
     *
     * {@code timeoutMs}, {@code path} e {@code channel} sono facoltativi: senza, è l'ascolto di OpenRouter di sempre.
     */
    @PluginMethod
    public void open(PluginCall call) {
        try {
            String percorso = call.getString("path");
            String stato = call.getString("returnState");
            Ascolto aperto = apri(
                call.getString("channel", ""),
                percorso == null || percorso.isEmpty() ? null : percorso,
                listenTimeoutMs(call.getInt("timeoutMs")),
                READ_TIMEOUT_MS,
                stato == null || stato.isEmpty() ? null : stato,
                riportaDavanti(getContext().getApplicationContext()));
            JSObject payload = new JSObject();
            payload.put("port", aperto.porta());
            payload.put("id", aperto.id);
            call.resolve(payload);
        } catch (Exception error) {
            call.reject("TALOS_OAUTH_PORT_UNAVAILABLE", "TALOS_OAUTH_PORT_UNAVAILABLE", error);
        }
    }

    /**
     * Aspetta il ritorno e restituisce la riga di indirizzo così com'è
     * arrivata. Chi legge il codice è JavaScript: qui non si interpreta niente
     * (solo il percorso, se chi ha aperto l'ha chiesto), per non avere due idee
     * diverse di cosa sia una risposta valida.
     */
    @PluginMethod
    public void awaitCallback(PluginCall call) {
        final Ascolto corrente = ascolto(call.getString("channel", ""));
        if (corrente == null) {
            call.reject(NOT_LISTENING, NOT_LISTENING);
            return;
        }
        call.setKeepAlive(true);
        corrente.aspetta(new Attesa() {
            @Override
            public void arrivato(String target) {
                JSObject payload = new JSObject();
                payload.put("target", target);
                call.resolve(payload);
            }

            @Override
            public void finito(String codice) {
                call.reject(codice, codice);
            }
        });
    }

    /**
     * Il codice arrivato mentre di là non c'era più nessuno.
     *
     * Si ritira UNA volta sola: un codice di autorizzazione vale un uso, e
     * lasciarlo in giro dopo averlo speso è un modo di riprovare a vuoto.
     * ⛔ Solo dal PROPRIO canale: il ritorno di ChatGPT non è mai fra le cose che la ripresa di OpenRouter può ritirare.
     */
    @PluginMethod
    public void pendingCallback(PluginCall call) {
        Ascolto corrente = ascolto(call.getString("channel", ""));
        String target = corrente == null ? null : corrente.ritira();
        JSObject payload = new JSObject();
        payload.put("target", target == null ? "" : target);
        call.resolve(payload);
    }

    /** Chiude la porta: annulla un accesso in corso e libera il numero. Con {@code id}, solo se l'ascolto è ancora quello. */
    @PluginMethod
    public void close(PluginCall call) {
        chiudi(call.getString("channel", ""), call.getInt("id"));
        call.resolve();
    }

    /**
     * L'attività muore: le chiamate che aspettavano non esistono più. L'ascolto senza percorso (OpenRouter) si chiude come
     * ha sempre fatto. Quello col percorso (ChatGPT, che dura minuti) RESTA: il ritorno che arriva dopo va da parte nel suo
     * canale, e la pagina nuova lo riprende. Non resta aperto senza limite: ha la sua scadenza.
     */
    @Override
    protected void handleOnDestroy() {
        List<Ascolto> tutti;
        synchronized (ASCOLTI) {
            tutti = new ArrayList<>(ASCOLTI.values());
        }
        for (Ascolto uno : tutti) {
            uno.dimenticaAttesa();
            if (!uno.haPercorso()) uno.chiudi();
        }
        super.handleOnDestroy();
    }

    /**
     * Riporta TALOS davanti alla scheda del browser. La scheda (Custom Tab) sta nel compito di TALOS, sopra la sua attività:
     * {@code MainActivity} è {@code singleTask}, quindi avviarla la riporta in cima e toglie la scheda. È il contesto
     * dell'APPLICAZIONE, non l'attività: l'ascolto sopravvive a un'attività ricreata, e non deve trattenerla.
     */
    static Runnable riportaDavanti(final Context app) {
        return () -> {
            Intent ritorno = new Intent(app, MainActivity.class);
            ritorno.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            app.startActivity(ritorno);
        };
    }

    /** Il valore GREZZO di un parametro della riga di indirizzo (nessuna decodifica: lo stato è fatto di caratteri che non ne chiedono), o {@code null}. */
    static String parametro(String target, String nome) {
        if (target == null) return null;
        int inizio = target.indexOf('?');
        if (inizio < 0) return null;
        for (String coppia : target.substring(inizio + 1).split("&")) {
            int uguale = coppia.indexOf('=');
            if (uguale > 0 && coppia.substring(0, uguale).equals(nome)) return coppia.substring(uguale + 1);
        }
        return null;
    }

    /** Il percorso di una riga di indirizzo, senza la parte dopo {@code ?}. */
    static String pathOf(String target) {
        if (target == null) return null;
        int fine = target.indexOf('?');
        return fine < 0 ? target : target.substring(0, fine);
    }

    private static String readRequestTarget(Socket connection, int totalMs) throws Exception {
        BufferedReader reader = new BufferedReader(
            new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
        long scadenza = System.nanoTime() + totalMs * 1_000_000L;
        StringBuilder line = new StringBuilder();
        int character;
        // Si legge a mano e con un tetto: `readLine` su una richiesta ostile
        // senza fine di riga leggerebbe finché c'è memoria. E con un tempo in
        // tutto: chi manda un byte ogni tanto non tiene la porta per sé.
        while ((character = reader.read()) >= 0 && character != '\n' && character != '\r') {
            line.append((char) character);
            if (line.length() > MAX_REQUEST_LINE) break;
            if (System.nanoTime() > scadenza) throw new SocketTimeoutException();
        }
        String[] parts = line.toString().split(" ");
        return parts.length >= 2 ? parts[1] : null;
    }

    /**
     * La pagina che il browser mostra al ritorno. ⛔ Rifatta il 13/10/2026 dopo la prova dal vivo sul Pad: era bianca e senza
     * stile dentro un'app scura, e diceva «Fatto» PRIMA che TALOS avesse verificato qualcosa (la pagina parte appena arriva la
     * richiesta: lo scambio e i controlli vengono dopo, nell'app). Ora segue il tema del telefono e dice la cosa vera: si torna
     * a TALOS per finire. Niente script, niente risorse esterne, niente dati della richiesta dentro la pagina.
     */
    static String closingPageHtml() {
        return "<!doctype html><meta charset=utf-8>"
            + "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
            + "<meta name=color-scheme content=\"dark light\">"
            + "<title>TALOS</title>"
            + "<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;"
            + "gap:.75rem;padding:2rem;box-sizing:border-box;text-align:center;font:17px/1.45 system-ui,sans-serif;"
            + "background:#1c1d21;color:#f2f2f3}p{margin:0;max-width:32rem}.t{font-size:1.35rem;font-weight:600;letter-spacing:.18em}"
            + ".s{opacity:.65}@media(prefers-color-scheme:light){body{background:#f1f2f4;color:#16171a}}</style>"
            + "<body><p class=t>TALOS</p>"
            + "<p>Torna a TALOS per completare l’accesso: puoi chiudere questa scheda.</p>"
            + "<p class=s>Return to TALOS to finish signing in: you can close this tab.</p>";
    }

    private static void writeClosingPage(Socket connection) throws Exception {
        byte[] body = closingPageHtml().getBytes(StandardCharsets.UTF_8);
        OutputStream out = connection.getOutputStream();
        out.write(("HTTP/1.1 200 OK\r\n"
            + "Content-Type: text/html; charset=utf-8\r\n"
            + "Content-Length: " + body.length + "\r\n"
            + "Connection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    /** A chi non è il ritorno: niente pagina, niente che dica che cosa c'è qui. */
    private static void writeNotFound(Socket connection) throws Exception {
        OutputStream out = connection.getOutputStream();
        out.write(("HTTP/1.1 404 Not Found\r\n"
            + "Content-Length: 0\r\n"
            + "Connection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.flush();
    }
}
