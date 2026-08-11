package ai.talos;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.WindowManager;

import com.getcapacitor.Bridge;

/**
 * ⭐⭐ LA BARRA: TALOS sopra l'app che stai usando, senza portartene fuori.
 *
 * Owner 2026-08-11: «bisogna interagire con TALOS FUORI dall'applicazione…
 * posso interagire con lui mentre faccio altre cose». E poi: «facciamo
 * esattamente come i competitor, e poi meglio».
 *
 * ⛔ IL PRIMO DISEGNO ERA SBAGLIATO, e l'owner l'ha bocciato in una riga: la
 * sessione dell'assistente apriva TALOS a schermo pieno. «Potrei farlo con un
 * tap» — vero, e infatti non serviva a niente.
 *
 * ## Cosa fanno gli altri, MISURATO
 *
 * Chiamato Gemini mentre ero in Chrome, l'11 agosto: Chrome resta vivo e
 * visibile sotto, e in basso compare solo una barra «Chiedi a Gemini».
 * `topResumedActivity` diceva `googlequicksearchbox/…FloatyActivity` — cioè
 * un'**activity trasparente flottante**, non un pannello di sistema.
 *
 * ## ⛔ Perché EREDITA da MainActivity invece di essere un pannello nativo
 *
 * Due strade sbagliate, scartate con la loro ragione:
 *
 *   1. **un pannello nativo disegnato da zero** — sarebbe una SECONDA
 *      interfaccia di chat accanto a quella che esiste già, con i suoi
 *      consensi, il suo elenco di strumenti, la sua voce. Due superfici che
 *      fanno la stessa cosa divergono sempre, e la seconda resta indietro
 *      proprio sui pezzi che contano: i permessi, il freno, le schede.
 *   2. **una seconda activity scritta a mano** — vorrebbe dire ricopiare le
 *      venti registrazioni di plugin di `MainActivity`, e il giorno che se ne
 *      aggiunge una la barra resta indietro di una funzione senza dirlo.
 *
 * Ereditando, il codice è quello: stessi plugin, stesso ponte, stessa app web.
 * Cambia solo il VESTITO — il tema trasparente e la finestra ancorata in basso
 * — e cambia perché è una classe diversa, quindi il sistema può darle un tema
 * suo e un'istanza sua senza toccare la schermata intera.
 *
 * ⛔ E il diritto di stare sopra le altre app NON è `SYSTEM_ALERT_WINDOW`: lo
 * dà il ruolo di assistente, che la persona ha già scelto di darci. Un permesso
 * in meno da chiedere è un permesso in meno da spiegare.
 */
public class TalosBarraActivity extends MainActivity {

    /** Lo dice all'app web: sei la barra, non la schermata intera. */
    public static final String EXTRA_BARRA = "ai.talos.BARRA";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        /*
         * ⛔ La finestra si àncora in BASSO, dove sta il pollice e dove la
         * mettono tutti — Gemini compresa, misurata. In alto coprirebbe la
         * barra di stato e quello che stai leggendo; al centro sarebbe una
         * finestra di dialogo, cioè una cosa che ti INTERROMPE invece di
         * starti accanto.
         */
        final android.view.Window finestra = getWindow();
        if (finestra != null) {
            final WindowManager.LayoutParams p = finestra.getAttributes();
            p.gravity = Gravity.BOTTOM;
            p.width = WindowManager.LayoutParams.MATCH_PARENT;
            /*
             * ⛔⛔ MATCH_PARENT, e il primo tentativo diceva WRAP_CONTENT.
             *
             * Sembrava più onesto — «la finestra è alta quanto la barra» — e
             * invece è la ragione per cui l'11 agosto sullo schermo non c'era
             * NIENTE: una WebView dentro una finestra che le chiede di
             * misurarsi da sola non ha un'altezza da cui partire, e il
             * contenuto web (che si dispone in percentuale dell'altezza
             * disponibile) non ha nessun posto dove stare.
             *
             * La finestra prende tutto lo schermo ed è TRASPARENTE; è il
             * contenuto web ad ancorarsi in basso. In cambio si guadagnano tre
             * cose che WRAP_CONTENT non poteva dare: la risposta che si espande
             * senza far ridisegnare la finestra al sistema, il tocco fuori che
             * chiude (perché quel tocco cade dentro la nostra finestra e
             * arriva alla pagina), e la tastiera che spinge in su con
             * `adjustResize` invece di coprire il campo.
             */
            p.height = WindowManager.LayoutParams.MATCH_PARENT;
            finestra.setAttributes(p);
            /*
             * ⛔ Niente oscuramento dietro: l'app sotto deve restare LEGGIBILE.
             * È tutto il punto della funzione — chiedere senza perdere di
             * vista quello che stavi facendo. Un velo scuro la spegnerebbe, e
             * la barra tornerebbe a essere una schermata come le altre.
             */
            finestra.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            finestra.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        /*
         * ⛔⛔ E LA WEBVIEW HA UNO SFONDO SUO, che il tema della finestra non
         * tocca. Una finestra dichiarata trasparente con dentro una WebView
         * bianca è una schermata bianca: la trasparenza va chiesta a tutti e
         * due, e questa è la riga che mancava.
         *
         * Il lato web fa la sua metà (`main.ts` → `montaLaBarra` toglie lo
         * sfondo a `html`, `body` e `#app`): serve tutta la catena, perché
         * basta un anello opaco per cancellare l'app sottostante.
         */
        rendiTrasparenteLaWebView("onCreate");
    }

    /*
     * ⛔⛔ E SI RIFÀ A OGNI RIPRESA, perché una volta sola NON basta.
     *
     * Misurato l'11 agosto: con la chiamata solo in `onCreate` lo schermo era un
     * rettangolo grigio uniforme — Chrome sotto non si vedeva — mentre la sonda
     * CDP giurava che `html`, `body` e `#app` erano già `rgba(0,0,0,0)`. Cioè il
     * lato web aveva fatto la sua parte e l'anello opaco era qui.
     *
     * Due cause possibili, e la cura le copre tutte e due senza doverle
     * distinguere: il ponte non ancora pronto quando `onCreate` finisce, e
     * Capacitor che ridipinge la WebView quando la pagina completa il
     * caricamento. `onResume` arriva dopo entrambe.
     */
    @Override
    public void onResume() {
        super.onResume();
        rendiTrasparenteLaWebView("onResume");
    }

    /*
     * ⛔ E LO DICE, invece di fallire in silenzio.
     *
     * La prima versione era `if (ponte != null && ...) { ... }`: se il ponte non
     * c'era non succedeva niente e nessuno lo sapeva — la stessa forma del
     * difetto che ci è costato mezza giornata il 10 agosto (`cancelNotification`
     * che non faceva niente e non falliva). Una riga in logcat costa zero e
     * trasforma un'ipotesi in una misura.
     */
    private void rendiTrasparenteLaWebView(String quando) {
        final Bridge ponte = getBridge();
        final android.webkit.WebView vista = ponte == null ? null : ponte.getWebView();
        if (vista == null) {
            Log.w(SEGNO, "trasparenza NON applicata a " + quando + ": ponte=" + (ponte != null) + " webview=false");
            return;
        }
        vista.setBackgroundColor(Color.TRANSPARENT);
        /*
         * ⛔ E LA CATENA NON FINISCE ALLA WEBVIEW: sopra di lei ci sono il suo
         * genitore e il decor della finestra, e ognuno può avere un fondo suo.
         * Bastava un anello opaco per cancellare l'app sottostante — misurato:
         * WebView trasparente, documento trasparente, schermo grigio.
         */
        final android.view.View genitore = vista.getParent() instanceof android.view.View
            ? (android.view.View) vista.getParent()
            : null;
        if (genitore != null) genitore.setBackgroundColor(Color.TRANSPARENT);
        final android.view.Window finestra = getWindow();
        if (finestra != null) finestra.getDecorView().setBackgroundColor(Color.TRANSPARENT);
        Log.i(SEGNO, "trasparenza applicata a " + quando + " (webview+genitore=" + (genitore != null) + "+decor)");
    }

    private static final String SEGNO = "TalosBarra";
}
