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
    private static TalosMotoreOspite attivo;

    final String socketPath;
    final String chiave;
    private final LocalSocket legato;
    private final LocalServerSocket server;
    private final TalosMotoreOspiteServizio servizio;

    /** L'endpoint, avviato la prima volta che serve e poi lo stesso finché l'app vive. */
    static synchronized TalosMotoreOspite avvia(Context context) throws IOException {
        if (attivo == null) attivo = new TalosMotoreOspite(context.getApplicationContext());
        return attivo;
    }

    private TalosMotoreOspite(Context context) throws IOException {
        File cartella = new File(context.getFilesDir(), "locale-ospite");
        if (!cartella.isDirectory() && !cartella.mkdirs()) throw new IOException("locale-ospite: cartella non creata");
        try {
            Os.chmod(cartella.getPath(), 0700);
        } catch (Exception e) {
            throw new IOException("locale-ospite: permessi non impostati", e);
        }
        File socket = new File(cartella, "motore.sock");
        // un socket lasciato da un avvio di prima non si può riusare: si rifà
        if (socket.exists() && !socket.delete()) throw new IOException("locale-ospite: socket vecchio non tolto");
        socketPath = socket.getAbsolutePath();
        byte[] casuali = new byte[32];
        new SecureRandom().nextBytes(casuali);
        StringBuilder s = new StringBuilder();
        for (byte b : casuali) s.append(String.format("%02x", b & 0xff));
        chiave = s.toString();
        legato = new LocalSocket();
        legato.bind(new LocalSocketAddress(socketPath, LocalSocketAddress.Namespace.FILESYSTEM));
        server = new LocalServerSocket(legato.getFileDescriptor());
        servizio = new TalosMotoreOspiteServizio(chiave, new MotoreVero(), () -> System.currentTimeMillis() / 1000L, SGUARDO_MS,
                PING_MS, ATTESA_OCCUPATO_MS, true);
        servizio.diario = riga -> Log.i(TAG, riga);
        Thread accetta = new Thread(this::accetta, "talos-motore-ospite");
        accetta.setDaemon(true);
        accetta.start();
    }

    private void accetta() {
        while (true) {
            final LocalSocket connessione;
            try {
                connessione = server.accept();
            } catch (IOException e) {
                Log.w(TAG, "accept non riuscito", e);
                return;
            }
            Thread t = new Thread(() -> servi(connessione), "talos-motore-ospite-domanda");
            t.setDaemon(true);
            t.start();
        }
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
