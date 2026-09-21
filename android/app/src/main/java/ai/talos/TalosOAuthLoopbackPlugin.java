package ai.talos;

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
import java.nio.charset.StandardCharsets;

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
 * Accetta <b>una</b> connessione, legge la prima riga della richiesta, risponde
 * con una pagina che dice di tornare all'app, e chiude. Non è un server: non
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
 */
@CapacitorPlugin(name = "TalosOAuthLoopback")
public class TalosOAuthLoopbackPlugin extends Plugin {

    /**
     * Quanto si resta in ascolto. Un accesso lo si fa in un minuto o non lo si
     * fa: oltre, la porta va chiusa da sola anche se nessuno la richiude.
     */
    private static final int LISTEN_TIMEOUT_MS = 180_000;
    private static final int MAX_REQUEST_LINE = 8192;

    private ServerSocket socket;
    private Thread listener;

    /**
     * ⛔⛔ IL CODICE SI CONSERVA, non si consegna e basta — 2026-08-10, misurato
     * sul Pad.
     *
     * `awaitCallback` risponde a una chiamata TENUTA VIVA nella WebView. Se
     * Android ricrea l'attività mentre il browser di sistema è davanti — e lo
     * fa, perché la nostra pagina è in secondo piano e la memoria serve al
     * browser — quella chiamata muore col suo contesto JavaScript. Il thread
     * qui sotto riceve il codice e lo consegna a NESSUNO: la pagina locale
     * scrive «Fatto, torna a TALOS», l'utente torna, e non succede niente.
     * Nessun errore, nessuna traccia. È esattamente ciò che è successo tre
     * volte di fila.
     *
     * ⛔ `static` non è pigrizia: il campo deve sopravvivere alla ricreazione
     * dell'ATTIVITÀ, che è il caso reale. Se muore il processo muore anche la
     * porta in ascolto, quindi il browser non avrebbe mai potuto rispondere —
     * quel caso non esiste e non va difeso.
     */
    private static volatile String pendingTarget;

    /**
     * Apre la porta e dice quale è. Non aspetta: il browser deve poter partire
     * subito, e la risposta arriverà su {@code awaitCallback}.
     */
    @PluginMethod
    public void open(PluginCall call) {
        closeQuietly();
        try {
            ServerSocket opened = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
            opened.setSoTimeout(LISTEN_TIMEOUT_MS);
            socket = opened;
            JSObject payload = new JSObject();
            payload.put("port", opened.getLocalPort());
            call.resolve(payload);
        } catch (Exception error) {
            closeQuietly();
            call.reject("TALOS_OAUTH_PORT_UNAVAILABLE", "TALOS_OAUTH_PORT_UNAVAILABLE", error);
        }
    }

    /**
     * Aspetta la prima — e unica — richiesta, e restituisce la riga di
     * indirizzo così com'è arrivata. Chi legge il codice è JavaScript: qui non
     * si interpreta niente, per non avere due idee diverse di cosa sia una
     * risposta valida.
     */
    @PluginMethod
    public void awaitCallback(PluginCall call) {
        final ServerSocket current = socket;
        if (current == null || current.isClosed()) {
            call.reject("TALOS_OAUTH_NOT_LISTENING", "TALOS_OAUTH_NOT_LISTENING");
            return;
        }
        call.setKeepAlive(true);
        listener = new Thread(() -> {
            try (Socket connection = current.accept()) {
                String target = readRequestTarget(connection);
                writeClosingPage(connection);
                // Si mette DA PARTE prima di consegnarlo: se di là non c'è più
                // nessuno, resta qui e lo si ritira con `pendingCallback`.
                pendingTarget = target == null ? "" : target;
                JSObject payload = new JSObject();
                payload.put("target", pendingTarget);
                call.resolve(payload);
            } catch (Exception error) {
                // Una porta chiusa mentre si aspettava è un annullamento, non un
                // guasto: chi ha chiuso sa perché.
                String code = current.isClosed()
                    ? "TALOS_OAUTH_CANCELLED"
                    : "TALOS_OAUTH_CALLBACK_FAILED";
                call.reject(code, code, error);
            } finally {
                closeQuietly();
            }
        }, "talos-oauth-loopback");
        listener.start();
    }

    /**
     * Il codice arrivato mentre di là non c'era più nessuno.
     *
     * Si ritira UNA volta sola: un codice di autorizzazione vale un uso, e
     * lasciarlo in giro dopo averlo speso è un modo di riprovare a vuoto.
     */
    @PluginMethod
    public void pendingCallback(PluginCall call) {
        String target = pendingTarget;
        pendingTarget = null;
        JSObject payload = new JSObject();
        payload.put("target", target == null ? "" : target);
        call.resolve(payload);
    }

    /** Chiude la porta: annulla un accesso in corso e libera il numero. */
    @PluginMethod
    public void close(PluginCall call) {
        closeQuietly();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        closeQuietly();
        super.handleOnDestroy();
    }

    private String readRequestTarget(Socket connection) throws Exception {
        BufferedReader reader = new BufferedReader(
            new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder line = new StringBuilder();
        int character;
        // Si legge a mano e con un tetto: `readLine` su una richiesta ostile
        // senza fine di riga leggerebbe finché c'è memoria.
        while ((character = reader.read()) >= 0 && character != '\n' && character != '\r') {
            line.append((char) character);
            if (line.length() > MAX_REQUEST_LINE) break;
        }
        String[] parts = line.toString().split(" ");
        return parts.length >= 2 ? parts[1] : null;
    }

    private void writeClosingPage(Socket connection) throws Exception {
        byte[] body = ("<!doctype html><meta charset=utf-8>"
            + "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
            + "<title>TALOS</title>"
            + "<body style=\"font:16px system-ui;padding:2rem;text-align:center\">"
            + "<p>Fatto. Torna a TALOS.</p>"
            + "<p style=\"opacity:.6\">Done. Return to TALOS.</p>")
            .getBytes(StandardCharsets.UTF_8);
        OutputStream out = connection.getOutputStream();
        out.write(("HTTP/1.1 200 OK\r\n"
            + "Content-Type: text/html; charset=utf-8\r\n"
            + "Content-Length: " + body.length + "\r\n"
            + "Connection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private void closeQuietly() {
        ServerSocket current = socket;
        socket = null;
        if (current != null) {
            try {
                current.close();
            } catch (Exception ignored) {
                // Chiudere una porta già chiusa non è un problema di nessuno.
            }
        }
    }
}
