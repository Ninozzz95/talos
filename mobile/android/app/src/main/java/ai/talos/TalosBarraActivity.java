package ai.talos;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.util.Log;

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
 * Cambia solo il VESTITO — il tema trasparente — e cambia perché è una classe
 * diversa, quindi il sistema può darle un tema suo e un'istanza sua senza
 * toccare la schermata intera.
 *
 * ⛔ La finestra invece NON si tocca: l'ancoraggio in basso lo fa il CSS. Le
 * prime due versioni la forzavano (prima `WRAP_CONTENT`, poi `gravity=BOTTOM`) e
 * la seconda è caduta confrontando `dumpsys window` con Gemini — vedi il blocco
 * in `onCreate`.
 *
 * ⛔ E il diritto di stare sopra le altre app NON è `SYSTEM_ALERT_WINDOW`: lo
 * dà il ruolo di assistente, che la persona ha già scelto di darci. Un permesso
 * in meno da chiedere è un permesso in meno da spiegare.
 */
public class TalosBarraActivity extends MainActivity {

    /** Lo dice all'app web: sei la barra, non la schermata intera. */
    public static final String EXTRA_BARRA = "ai.talos.BARRA";

    /**
     * ⛔⛔ IL TEMA SI RIPRENDE A FORZA, perché Capacitor lo SOVRASCRIVE.
     *
     * `BridgeActivity.onCreate` chiama `setTheme(AppTheme_NoActionBar)` prima di
     * tutto: il tema che il manifest dichiara per questa activity
     * (`@style/TalosBarra`, trasparente) veniva cancellato, e la finestra
     * finiva vestita da `Theme.AppCompat.DayNight.NoActionBar`.
     *
     * ## Come l'ho scoperto: il COLORE è l'impronta digitale
     *
     * Tre ipotesi mie erano già cadute — la gravità della finestra, il
     * `launchMode`, il fondo della WebView — e ogni volta lo schermo restava un
     * rettangolo grigio. Allora invece di guardare i flag ho campionato il
     * PIXEL, dal raw di `screencap`:
     *
     *     (200,900) (1200,1700) (2200,2600) = #303030
     *
     * `#303030` non è un colore di TALOS: il nostro fondo è `#1e1f22`, la carta
     * `#1d1e22`, l'orlo `#2c2f36`. È `background_material_dark`, cioè il
     * `windowBackground` di AppCompat in modalità notte. ⇒ Non stavamo
     * disegnando male il nostro tema: **non era il nostro tema**.
     *
     * ⛔ E la lezione vale oltre questo file: un flag si può leggere e sembrare
     * giusto (`fmt=TRANSPARENT`, `occludesParent=false`: erano entrambi corretti
     * mentre il difetto c'era). Un colore misurato dice CHI ha disegnato.
     */
    @Override
    public void setTheme(int resid) {
        super.setTheme(R.style.TalosBarra);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        /*
         * ⛔⛔ QUESTA È LA BARRA ANCHE QUANDO NESSUNO L'HA DETTO NELL'INDIRIZZO.
         *
         * La sessione dell'assistente apre la barra con `talos://barra?nodi=…`,
         * e l'app web accende il modo barra leggendo quell'indirizzo
         * (`App.getLaunchUrl`). Ma il TASTO DELLE CUFFIE (`VOICE_COMMAND`) apre
         * questa stessa Activity SENZA indirizzo: senza questa riga, l'app web
         * non troverebbe `talos://barra`, monterebbe la SCHERMATA INTERA dentro
         * la finestra trasparente, e il tasto darebbe una app rotta.
         *
         * La verità non sta nell'indirizzo, sta nella CLASSE: se sei
         * `TalosBarraActivity`, sei la barra. Quindi se l'indirizzo non è già il
         * nostro, gliene mettiamo uno di partenza — `voce=1` perché chi arriva
         * dalle cuffie vuole parlare, `nodi=0` perché a mani libere non c'è
         * nessuno schermo da guardare, ed è giusto che la spia lo dica.
         *
         * ⛔ Prima di `super.onCreate`: è lì che il ponte cattura l'intent di
         * lancio, e un dato messo dopo arriverebbe troppo tardi.
         */
        final Intent lancio = getIntent();
        final android.net.Uri indirizzo = lancio == null ? null : lancio.getData();
        final boolean giaBarra = indirizzo != null && "talos".equals(indirizzo.getScheme());
        if (!giaBarra) {
            final Intent conIndirizzo = lancio != null ? lancio : new Intent();
            conIndirizzo.setData(android.net.Uri.parse("talos://barra?voce=1&nodi=0&immagine=0"));
            setIntent(conIndirizzo);
        }

        super.onCreate(savedInstanceState);
        /*
         * ⛔⛔ LA FINESTRA NON SI TOCCA — e ci sono volute due prove sbagliate e
         * un confronto per capirlo.
         *
         * Le prime due versioni le imponevano una forma: prima
         * `WRAP_CONTENT` in altezza (e non si vedeva NIENTE: una WebView dentro
         * una finestra che le chiede di misurarsi da sola non ha un'altezza da
         * cui partire, e il contenuto web disposto in percentuale non aveva
         * dove stare), poi `MATCH_PARENT` con `gravity = BOTTOM`.
         *
         * ⭐ La prova che chiude la questione è un CONFRONTO, non un
         * ragionamento. `dumpsys window` sullo stesso telefono, con Gemini
         * aperta sopra Chrome e poi con noi:
         *
         *   Gemini  mAttrs={(0,0)(fillxfill) sim={adjust=resize} … fmt=TRANSPARENT
         *   TALOS   mAttrs={(0,0)(fillxfill) gr=BOTTOM CENTER_VERTICAL sim={adjust=resize} … fmt=TRANSPARENT
         *
         * Tutto il resto identico: stessi `fl=`, stessi `pfl=`, stesso
         * `ty=BASE_APPLICATION`, ognuna nel suo task. L'UNICA differenza era la
         * gravità che avevo messo io — e per giunta incoerente, perché il
         * sistema la componeva in `BOTTOM CENTER_VERTICAL`, cioè «in basso» e
         * «centrata in verticale» insieme.
         *
         * ⛔ E non serviva a niente: la barra si ancora in basso da SOLA, col
         * CSS (`position: fixed; inset: 0` più `justify-content: flex-end`).
         * Stavo chiedendo due volte la stessa cosa a due strati diversi, e uno
         * dei due non l'aveva capita.
         *
         * Resta solo ciò che il tema non può fare: togliere l'oscuramento
         * dietro — l'app sotto deve restare LEGGIBILE, è tutto il punto della
         * funzione — e mettere un fondo trasparente al posto di quello del tema.
         */
        final android.view.Window finestra = getWindow();
        if (finestra != null) {
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
