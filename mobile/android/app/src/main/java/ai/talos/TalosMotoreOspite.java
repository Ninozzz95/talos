package ai.talos;

import android.content.Context;
import android.net.Credentials;
import android.net.LocalServerSocket;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.os.Process;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.concurrent.Callable;
import java.util.function.Consumer;
import java.util.function.Predicate;

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`; owner 18/10: «socket Unix privato», «solo per il
 * Codice»): il guscio Android dell'endpoint che r4 usa per il modello aperto nell'app.
 *
 * Tre difese, una dentro l'altra:
 * 1. il socket sta in `files/locale-ospite/` (0700) sotto la cartella dati dell'app: le altre app non ci arrivano (su Android
 *    127.0.0.1 è raggiungibile da tutte, CERT DRD23-J — per questo niente TCP);
 * 2. dall'altra parte deve esserci lo STESSO utente Linux dell'app (r4 è un suo processo figlio): `getPeerCredentials`;
 * 3. la chiave, nuova a ogni avvio (32 byte da `SecureRandom`), mai su disco, su ogni richiesta.
 * La logica delle risposte sta in `TalosMotoreOspiteServizio`, provata sul PC; qui solo socket, thread e il motore vero.
 */
final class TalosMotoreOspite {

    private static final String TAG = "TalosMotoreOspite";
    private static final long SGUARDO_MS = 150L;
    /** Metà di quello di llama-server (30 s): una connessione chiusa si scopre comunque subito, dal lettore della chiusura. */
    private static final long PING_MS = 15_000L;
    private static final long ATTESA_OCCUPATO_MS = 3_000L;
    private static Custode<TalosMotoreOspite> custode;

    final String socketPath;
    final String chiave;
    /*
     * ⛔⛔ D-0146-1 (Pad, 26/10/2026): `legato` POSSIEDE il descrittore del socket in ascolto (il `LocalServerSocket` costruito dal
     * suo descrittore no). Era scritto e mai letto: R8 l'ha tolto (candidata 0.1.46 e 0.1.45 pubblicata, nessun `iput`), il GC
     * finalizzava il `LocalSocket` e chiudeva il socket, `accept` dava EBADF e il Codice col modello locale moriva fino al
     * riavvio («nessun modello aperto»). Ora `ferma()` lo LEGGE (un campo letto R8 non lo toglie), la regola `-keepclassmembers`
     * di `proguard-rules.pro` è la cintura, e `scripts/verify-release-r8-risorse.mjs` lo controlla sul mapping della release.
     */
    private final LocalSocket legato;
    private final LocalServerSocket server;
    private final File socket;
    private final TalosMotoreOspiteServizio servizio;
    private volatile boolean vivo = true;
    private final UnaVolta fermato = new UnaVolta();

    /**
     * L'endpoint, avviato la prima volta che serve e poi lo stesso finché vive. ⛔ D-0146-1: un endpoint morto (il ciclo di
     * `accept` si è rotto) si chiude e se ne fa uno nuovo, con socket e chiave nuovi: il Codice li riceve a ogni invio
     * (`motoreOspite` → `spingiAccessoLocaleR4`), e mentre si rifà chi chiede aspetta (metodo sincronizzato), mai il vecchio.
     */
    static synchronized TalosMotoreOspite avvia(Context context) throws IOException {
        if (custode == null) {
            Context app = context.getApplicationContext();
            custode = new Custode<>(() -> new TalosMotoreOspite(app), o -> o.vivo, TalosMotoreOspite::ferma);
        }
        return custode.ottieni();
    }

    /** L'unico oggetto vivo, rifatto quando quello di prima è morto (chiuso PRIMA di legarne uno nuovo). Provato sul PC. */
    static final class Custode<T> {
        interface Fabbrica<T> { T crea() throws IOException; }

        private final Fabbrica<T> fabbrica;
        private final Predicate<T> vivo;
        private final Consumer<T> ferma;
        private T attivo;

        Custode(Fabbrica<T> fabbrica, Predicate<T> vivo, Consumer<T> ferma) {
            this.fabbrica = fabbrica;
            this.vivo = vivo;
            this.ferma = ferma;
        }

        synchronized T ottieni() throws IOException {
            if (attivo != null && !vivo.test(attivo)) {
                T morto = attivo;
                attivo = null;
                ferma.accept(morto);
            }
            if (attivo == null) attivo = fabbrica.crea();
            return attivo;
        }
    }

    interface Accettatore<C> { C accetta() throws IOException; }

    /** Serve ogni connessione finché `accept` regge; quando si rompe lo dice UNA volta (`allaMorte`) e si ferma. Provato sul PC. */
    static <C> void cicloDiAccettazione(Accettatore<C> server, Consumer<C> servi, Consumer<IOException> allaMorte) {
        while (true) {
            final C connessione;
            try {
                connessione = server.accetta();
            } catch (IOException e) {
                allaMorte.accept(e);
                return;
            }
            servi.accept(connessione);
        }
    }

    private TalosMotoreOspite(Context context) throws IOException {
        File cartella = new File(context.getFilesDir(), "locale-ospite");
        if (!cartella.isDirectory() && !cartella.mkdirs()) throw new IOException("locale-ospite: cartella non creata");
        try {
            Os.chmod(cartella.getPath(), 0700);
        } catch (Exception e) {
            throw new IOException("locale-ospite: permessi non impostati", e);
        }
        // i socket lasciati da un avvio di prima (o da un motore morto) non si riusano: via tutti, poi uno col suo nome
        spazzaSocketVecchi(cartella);
        socket = fileDelSocket(cartella, esadecimale(8));
        if (socket.exists() && !socket.delete()) throw new IOException("locale-ospite: socket vecchio non tolto");
        socketPath = socket.getAbsolutePath();
        chiave = esadecimale(32);
        legato = new LocalSocket();
        legato.bind(new LocalSocketAddress(socketPath, LocalSocketAddress.Namespace.FILESYSTEM));
        server = new LocalServerSocket(legato.getFileDescriptor());
        servizio = new TalosMotoreOspiteServizio(chiave, new MotoreVero(), () -> System.currentTimeMillis() / 1000L, SGUARDO_MS,
                PING_MS, ATTESA_OCCUPATO_MS, true);
        servizio.diario = riga -> Log.i(TAG, riga);
        Thread accetta = new Thread(() -> cicloDiAccettazione(server::accept, connessione -> {
            Thread t = new Thread(() -> servi(connessione), "talos-motore-ospite-domanda");
            t.setDaemon(true);
            t.start();
        }, e -> {
            Log.w(TAG, "accept non riuscito: il motore ospite si ferma e si rifà alla prossima richiesta", e);
            ferma();
        }), "talos-motore-ospite");
        accetta.setDaemon(true);
        accetta.start();
    }

    /**
     * Fermo per sempre: prima il server, poi il socket legato che possiede il descrittore, poi il SUO file. Solo la prima chiamata
     * lo fa (`UnaVolta`): il thread di `accept` e `avvia` possono arrivarci insieme. Il file ha un nome suo (`fileDelSocket`):
     * una cancellazione in ritardo non tocca mai il socket del motore nuovo (revisione del Desktop, D-0146-1).
     */
    private void ferma() {
        vivo = false;
        if (!fermato.prima()) return;
        try { server.close(); } catch (IOException ignorata) { /* già chiuso */ }
        try { legato.close(); } catch (IOException ignorata) { /* già chiuso */ }
        if (socket.exists() && !socket.delete()) Log.w(TAG, "socket vecchio non tolto: il prossimo avvio lo spazza");
    }

    /** Il file del socket di UN motore: nome suo, mai riusato da quello dopo. r4 riceve il percorso a ogni invio. */
    static File fileDelSocket(File cartella, String casuale) {
        return new File(cartella, "motore-" + casuale + ".sock");
    }

    /** Via i file dei socket lasciati da motori di prima (anche il vecchio `motore.sock`), prima di legarne uno nuovo. */
    static void spazzaSocketVecchi(File cartella) {
        File[] vecchi = cartella.listFiles((d, nome) -> nome.matches("motore(-[0-9a-f]+)?\\.sock"));
        if (vecchi == null) return;
        // uno che non si toglie lo dirà il bind dopo, col suo errore
        for (File f : vecchi) f.delete();
    }

    /** Vero solo alla prima chiamata, anche da più thread. */
    static final class UnaVolta {
        private boolean fatto;

        synchronized boolean prima() {
            if (fatto) return false;
            fatto = true;
            return true;
        }
    }

    private static String esadecimale(int byteCasuali) {
        byte[] casuali = new byte[byteCasuali];
        new SecureRandom().nextBytes(casuali);
        StringBuilder s = new StringBuilder();
        for (byte b : casuali) s.append(String.format("%02x", b & 0xff));
        return s.toString();
    }

    private void servi(LocalSocket connessione) {
        try (LocalSocket c = connessione) {
            Credentials chi = c.getPeerCredentials();
            if (chi == null || chi.getUid() != Process.myUid()) {
                Log.w(TAG, "connessione rifiutata: un altro utente (" + (chi == null ? "?" : chi.getUid()) + ")");
                return;
            }
            try {
                servizio.servi(c.getInputStream(), c.getOutputStream());
            } finally {
                /*
                 * Revisione avversaria (2): su Linux `close()` da questo thread non sveglia la sentinella bloccata in `read()` su un
                 * altro thread, e r4 non vedeva la fine della connessione dopo un errore a metà streaming. `shutdown` la chiude davvero.
                 */
                try { c.shutdownOutput(); } catch (IOException | UnsupportedOperationException ignorata) { /* già chiusa */ }
                try { c.shutdownInput(); } catch (IOException | UnsupportedOperationException ignorata) { /* già chiusa */ }
            }
        } catch (IOException e) {
            // r4 se n'è andato prima della risposta
        }
    }

    /** Il motore aperto dalla chat, visto dal servizio. Tutto ciò che tocca il motore passa dall'attore (`soloAttore`). */
    private static final class MotoreVero implements TalosMotoreOspiteServizio.MotoreDaServire {
        private static TalosLlamaEngine motore() {
            TalosLlamaEngine m = TalosMotoreCondiviso.MOTORE.get();
            if (m == null) throw new IllegalStateException("LOCAL_RUNTIME_NOT_READY");
            return m;
        }

        @Override public TalosMotoreCondiviso.Esito prendi() { return TalosMotoreCondiviso.prendi(); }
        @Override public void lascia() { TalosMotoreCondiviso.lascia(); }

        @Override public String modello() {
            String percorso = TalosMotoreCondiviso.PERCORSO.get();
            return percorso == null || TalosMotoreCondiviso.MOTORE.get() == null ? null : new File(percorso).getName();
        }

        @Override public int finestra() {
            try {
                return TalosMotoreCondiviso.sullAttore(() -> motore().contextTokens());
            } catch (Exception e) {
                return 0;
            }
        }

        @Override public <T> T sullAttore(Callable<T> lavoro) throws Exception { return TalosMotoreCondiviso.sullAttore(lavoro); }
        @Override public String chatPrompt(String messaggiJson, String attrezziJson, boolean pensa) { return motore().chatPrompt(messaggiJson, attrezziJson, pensa); }
        @Override public int promptTokens(String prompt) { return motore().promptTokens(prompt); }
        @Override public void generateBlocking(String prompt, int maxTokens) { motore().generateBlocking(prompt, maxTokens, TalosLlamaEngine.Mode.CHAT); }
        @Override public String textSoFar() { return motore().textSoFar(); }
        @Override public String parseReplyPartial(String text) { return motore().parseReplyPartial(text); }
        @Override public String parseReply(String text) { return motore().parseReply(text); }
        @Override public int tokensProduced() { return motore().tokensProduced(); }
        @Override public void cancel() { TalosLlamaEngine m = TalosMotoreCondiviso.MOTORE.get(); if (m != null) m.cancel(); }
        // una vedetta come `textSoFar`: il nativo la serve col suo lucchetto (`tempi_lock`), senza passare dall'attore
        @Override public String ultimiTempi() { TalosLlamaEngine m = TalosMotoreCondiviso.MOTORE.get(); return m == null ? null : m.lastTimings(); }
    }
}
