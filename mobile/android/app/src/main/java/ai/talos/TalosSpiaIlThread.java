package ai.talos;

import android.util.Log;

/**
 * ⭐⭐⭐ GUARDA COSA STA FACENDO IL THREAD DEI PLUGIN, invece di indovinarlo.
 *
 * <h2>Perché esiste</h2>
 *
 * Owner 2026-08-09: il girello «Caricamento chat» dura dieci secondi. Dodici
 * misure hanno stabilito cosa NON è: non i dati (vuoto = pieno), non la
 * derivazione della chiave (44 ms), non l'apertura cifrata (8 ms), non le
 * risorse (104 ms), non il ciclo JavaScript (zero battiti persi), non il
 * keystore (1 ms), non SQLCipher (3 ms), non il `load()` del TTS (2 ms), non i
 * venti `registerPlugin` (187 ms in tutto), non il server locale (25 richieste
 * servite dentro la finestra).
 *
 * E hanno stabilito cosa È: una <b>coda</b>. Sette chiamate spedite fra 302 ms e
 * 8.708 ms arrivano al nativo <b>tutte nello stesso millisecondo</b>, 10.032 ms
 * dopo la prima.
 *
 * Il sorgente di Capacitor spiega perché è possibile:
 *
 * <pre>
 *   Bridge.java:138   HandlerThread handlerThread = new HandlerThread("CapacitorPlugins")
 *   Bridge.java:854   taskHandler.post(currentThreadTask)
 * </pre>
 *
 * <b>Un thread solo</b> per tutti i metodi di tutti i plugin: chi lo occupa
 * ferma ogni altra cosa.
 *
 * <h2>⛔ Perché smettere di provare un candidato alla volta</h2>
 *
 * Ho consumato quattro build su quattro sospetti scelti a intuito, e tutti si
 * sono rivelati innocenti in pochi millisecondi. Tre volte ho scritto una cura
 * prima di avere la causa, e tutte e tre sono state rimosse dopo che la misura
 * le ha bocciate.
 *
 * ⇒ Questa classe non indovina: campiona la <b>pila di esecuzione</b> del thread
 * incriminato mentre è bloccato, e la scrive nel registro. La riga in cima dice
 * chi lo tiene, con nome di classe e di metodo.
 *
 * <h2>Come si ARMA, e perché non è acceso da solo</h2>
 *
 * Costa un thread che campiona per dodici secondi a ogni avvio: un prezzo
 * giusto durante una caccia, assurdo per sempre. Si accende con un extra
 * sull'intent, cioè senza ricompilare e senza toccare il codice:
 *
 * <pre>
 *   adb shell am start -n ai.talos.dev/ai.talos.MainActivity --ez talos_spia true
 *   adb logcat -d | grep TalosSpia
 * </pre>
 *
 * ⛔ E resta in albero anche quando è spento. Non è codice morto: è l'attrezzo
 * che ha chiuso in UNA build quello che quattro build di ipotesi non avevano
 * chiuso. La prossima volta che una cosa «è lenta e non si sa perché», la
 * differenza fra una riga di comando e una mezza giornata sta qui.
 *
 * Se il thread non esiste ancora, lo dice; se esiste ed è in attesa, la pila
 * mostra su cosa. Un thread fermo su `Object.wait` o `park` sta aspettando
 * qualcuno; uno fermo dentro un metodo nostro sta lavorando.
 */
final class TalosSpiaIlThread {

    private static final String TAG = "TalosSpia";

    /**
     * ⛔ DUE bersagli, e non uno solo. `CapacitorPlugins` è la vittima —
     * il thread condiviso che non deve MAI bloccarsi; `talos-ponte` è il
     * nostro, dove il blocco è legittimo perché non ferma nessun altro.
     *
     * Guardarne uno solo darebbe una prova ambigua: se dopo la cura
     * `CapacitorPlugins` è libero, non si distingue «il lavoro si è spostato»
     * da «il lavoro non è più partito» — e la seconda sarebbe un difetto
     * nuovo travestito da guarigione.
     */
    private static final String[] BERSAGLI = { "CapacitorPlugins", "talos-ponte" };

    private TalosSpiaIlThread() {}

    static void perQuindiciSecondi() {
        Thread spia = new Thread(() -> {
            long inizio = android.os.SystemClock.uptimeMillis();
            java.util.Map<String, String> ultime = new java.util.HashMap<>();
            for (int giro = 0; giro < 30; giro++) {
              long ora = android.os.SystemClock.uptimeMillis() - inizio;
              for (String nome : BERSAGLI) {
                String ultima = ultime.getOrDefault(nome, "");
                Thread bersaglio = null;
                for (Thread t : Thread.getAllStackTraces().keySet()) {
                    if (nome.equals(t.getName())) { bersaglio = t; break; }
                }
                if (bersaglio == null) {
                    if (!"assente".equals(ultima)) {
                        Log.i(TAG, ora + " ms  " + nome + ": non esiste (ancora, o piu')");
                        ultime.put(nome, "assente");
                    }
                } else {
                    StackTraceElement[] pila = bersaglio.getStackTrace();
                    // ⛔ IL VERTICE NON SERVE A NIENTE. La cima della pila è
                    // sempre `nativePollOnce`, `park` o `waitFor`: dice «sto
                    // aspettando», che è vero e non nomina nessuno.
                    //
                    // La riga che nomina il colpevole è la NOSTRA, più in
                    // basso. Al primo giro ho filtrato per «non di sistema» e
                    // ho raccolto quattro righe di `Thread.sleep`: un filtro
                    // che tiene fuori il rumore ma anche il nome.
                    //
                    // ⇒ Si tiene il vertice, UNO, e poi solo i frame di casa.
                    StringBuilder sb = new StringBuilder(bersaglio.getState().toString());
                    if (pila.length > 0) {
                        sb.append(" su ").append(pila[0].getClassName())
                          .append('.').append(pila[0].getMethodName());
                    }
                    int scritte = 0;
                    for (StackTraceElement e : pila) {
                        String riga = e.getClassName() + "." + e.getMethodName();
                        if (!riga.startsWith("ai.talos")) continue;
                        sb.append(" <- ").append(riga).append(':').append(e.getLineNumber());
                        if (++scritte >= 5) break;
                    }
                    if (scritte == 0) sb.append(" <- (nessun frame ai.talos: e' Capacitor o un plugin di terzi)");
                    String adesso = sb.toString();
                    // Solo i CAMBI: trenta righe identiche non dicono niente,
                    // e il momento in cui cambia è l'informazione.
                    if (!adesso.equals(ultima)) {
                        Log.i(TAG, ora + " ms  " + nome + ": " + adesso);
                        ultime.put(nome, adesso);
                    }
                }
              }
              try { Thread.sleep(400); } catch (InterruptedException stop) { return; }
            }
            Log.i(TAG, "fine campionamento");
        }, "talos-spia");
        spia.setDaemon(true);
        spia.start();
    }
}
