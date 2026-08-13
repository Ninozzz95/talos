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
        timbraLApertura();

        /*
         * ⭐⭐ L'ORECCHIO SI APRE QUI, PRIMA DI TUTTO IL RESTO.
         *
         * Owner 2026-08-11: «dico "apri Google Chrome" e ha sentito solo "Google
         * Chrome"». MISURATO dal momento della richiesta di apertura: la barra si
         * VEDE a +569 ms e il riconoscitore è pronto a **+763 ms**, perché
         * l'ascolto partiva da `onMounted` di un componente Vue — cioè dopo
         * l'Activity, dopo la WebView, dopo il bundle, dopo il montaggio. Chi
         * tocca e parla subito regala tre quarti di secondo al vuoto, e «apri»
         * dura meno di così.
         *
         * ⛔ Sta PRIMA di `super.onCreate` di proposito: è quella chiamata a
         * costruire il ponte e la WebView, cioè la parte lenta. Metterlo dopo
         * significherebbe aver scritto tutto questo per niente.
         *
         * ⛔ E solo se l'indirizzo chiede la voce: la barra si apre anche per
         * scrivere, e un microfono acceso senza che nessuno l'abbia chiesto è
         * esattamente ciò che non si fa. Il resto — permesso, disponibilità,
         * spegnimento se nessuno si aggancia — lo decide `TalosOrecchioAnticipato`.
         */
        final android.net.Uri deciso = getIntent() == null ? null : getIntent().getData();
        if (deciso != null && "1".equals(deciso.getQueryParameter("voce"))) {
            ai.talos.agent.TalosOrecchioAnticipato.accendi(this);
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
        trattieniIlPrimoFrame();
    }

    /**
     * ⭐⭐ NON SI DISEGNA NIENTE finché la barra non è pronta a essere vista.
     *
     * ## Il difetto, misurato sui fotogrammi
     *
     * Owner 2026-08-11, con un video del suo schermo: «un lampeggio nero poco
     * prima che la barra entra… solo all'inizio, deve sparire». Dal 132° al 148°
     * fotogramma (61,5 al secondo) lo schermo è un rettangolo pieno `#1e1f22` —
     * **455 ms** in cui l'app sotto è cancellata.
     *
     * `#1e1f22` non è un colore di sistema: è `--talos-background`, il fondo
     * della nostra app. ⇒ Alla PRIMA apertura la WebView dipinge la pagina col
     * suo fondo normale, e solo dopo il JS la rende trasparente. Dalla seconda
     * volta non si vede più perché l'activity è `singleTask` e resta viva: ecco
     * perché il lampo era «solo all'inizio», e perché sul Pad — dove provavo
     * sempre a caldo — non l'ho mai riprodotto.
     *
     * ## ⛔ Perché fermare il DISEGNO e non schiarire il frame
     *
     * Dipingere quel mezzo secondo di un colore meno vistoso lascerebbe il lampo
     * dov'è, solo più educato — e il difetto tornerebbe intero il giorno che
     * qualcuno cambia tema. Qui invece non c'è nessun fotogramma da nascondere:
     * finché il primo frame non è quello giusto, la finestra **non disegna**, e
     * l'app sotto resta visibile come se non fosse successo niente.
     *
     * ⛔ E c'è un TETTO, perché una schermata che non si disegna mai è peggio di
     * un lampo: se il lato web non suona il campanello entro `TETTO_MS` si
     * disegna comunque. Un blocco senza uscita è il modo in cui una cura diventa
     * un difetto peggiore di quello che curava.
     */
    private void trattieniIlPrimoFrame() {
        final android.view.View contenuto = findViewById(android.R.id.content);
        if (contenuto == null) return;
        contenuto.getViewTreeObserver().addOnPreDrawListener(
            new android.view.ViewTreeObserver.OnPreDrawListener() {
                @Override
                public boolean onPreDraw() {
                    if (!pronta) return false;
                    contenuto.getViewTreeObserver().removeOnPreDrawListener(this);
                    return true;
                }
            });
        contenuto.postDelayed(() -> {
            if (pronta) return;
            Log.w(SEGNO, "il campanello non è arrivato entro " + TETTO_MS + " ms: disegno lo stesso");
            laBarraEPronta();
        }, TETTO_MS);
    }

    /** Il campanello: lo suona `lib/barra/avvia.ts` via `TalosBarraPlugin`. */
    void laBarraEPronta() {
        if (pronta) return;
        pronta = true;
        final android.view.View contenuto = findViewById(android.R.id.content);
        if (contenuto != null) contenuto.invalidate();
    }

    /**
     * ⛔ `volatile`: il campanello arriva dal ponte, il disegno lo legge dal
     * thread dell'interfaccia. Senza, uno dei due potrebbe non vedere l'altro.
     */
    private volatile boolean pronta = false;

    /** Oltre questo, si disegna comunque. Vedi `trattieniIlPrimoFrame`. */
    private static final long TETTO_MS = 1500L;

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

    /**
     * ⭐⭐ IL TIMBRO DELL'APERTURA — «questa chiamata è una sola».
     *
     * ## ⛔ Il difetto, misurato in logcat
     *
     * Owner 2026-08-11: «dico "ciao mi senti" e mi stampa solo "mi senti", è come
     * se ci fosse un ritardo subito dopo che compare l'assistente». MISURATO:
     *
     *     58.795  toggle da stato=idle        parte l'ascolto
     *     58.876  listening                    sta ascoltando
     *     00.729  toggle da stato=listening   ⛔ qualcuno lo SPEGNE
     *     01.286  pronto epoca=2               riparte 2,5 s dopo l'apertura
     *
     * Il colpevole era `chiamata nuova (2)` su **una apertura sola**: Capacitor
     * consegna lo stesso identico intent DUE volte — una da `getLaunchUrl()`,
     * che dice con quale indirizzo l'app è partita, e una da `appUrlOpen`. È
     * documentato e noto (issue #971 di ionic-team/capacitor), e deduplicare
     * tocca a chi riceve: `singleTask` evita la seconda ISTANZA, non il secondo
     * EVENTO.
     *
     * Il lato web trattava quella seconda consegna come «mi hanno chiamato di
     * nuovo» e rilanciava l'ascolto, spegnendo la sessione viva. «Ciao» cadeva
     * nel mezzo secondo di riapertura.
     *
     * ## Perché un timbro e non un confronto di indirizzi
     *
     * Confrontare le stringhe avrebbe funzionato quasi sempre e sbagliato nel
     * caso che conta: due chiamate VERE consecutive dalla stessa porta hanno
     * l'indirizzo identico, e verrebbero fuse in una. L'identità di un'apertura
     * non si indovina guardando i dati — la dichiara chi apre.
     *
     * ⛔ E si timbra QUI perché questa Activity è l'imbuto di tutte le porte:
     * gesto dell'assistente, tendina, pallino, tasto delle cuffie, parola di
     * attivazione. Un timbro messo in una sola di quelle strade lascerebbe le
     * altre col difetto.
     */
    private void timbraLApertura() {
        final Intent adesso = getIntent();
        if (adesso == null || adesso.getData() == null) return;
        final android.net.Uri vecchio = adesso.getData();
        /*
         * ⛔⛔ CHI APRE PUÒ DICHIARARE LA PROPRIA APERTURA, e allora si rispetta.
         *
         * MISURATO il 12 agosto: un solo gesto dell'assistente produce DUE
         * `startActivity` a 28 ms di distanza, perché il conteggio dei nodi
         * arriva dopo che la barra è già a schermo (vedi `TalosAssistente`). Sono
         * due Intent diversi, quindi qui ricevevano due timbri diversi, e per il
         * lato web erano due CHIAMATE: due ascolti aperti nello stesso
         * millisecondo, e l'errore della sessione morente raccolto da chi non era
         * ancora nato — «speech recognition failed» su un ascolto sano.
         *
         * ⛔ E non si poteva indovinare da qui: due chiamate vere consecutive
         * dalla stessa porta hanno l'indirizzo identico. L'unica cosa che separa
         * «ti mando il dato che mancava» da «ti chiamo di nuovo» è l'intenzione
         * di chi manda — quindi la dichiara chi manda, e questo imbuto timbra
         * solo per le porte che non hanno dichiarato niente (pallino, tendina,
         * cuffie, parola di attivazione).
         */
        if (vecchio.getQueryParameter("apertura") != null) return;
        // `uptimeMillis` e non l'orologio: non torna indietro, e due aperture
        // non possono cadere sullo stesso millisecondo di macchina accesa.
        final android.net.Uri timbrato = vecchio.buildUpon()
            .appendQueryParameter("apertura", String.valueOf(android.os.SystemClock.uptimeMillis()))
            .build();
        adesso.setData(timbrato);
        setIntent(adesso);
    }

    /**
     * ⛔ ANCHE le aperture successive vanno timbrate.
     *
     * L'activity è `singleTask`: dalla seconda volta in poi non nasce niente,
     * arriva solo un intent nuovo qui. Senza questo timbro la seconda chiamata
     * vera sarebbe indistinguibile dalla ripetizione della prima — cioè si
     * curerebbe il difetto di stasera creandone uno peggiore, la barra che non
     * risponde più alla seconda chiamata.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        setIntent(intent);
        timbraLApertura();
        super.onNewIntent(getIntent());
    }


    /**
     * ⛔ La barra se ne va: la parola di attivazione riprende il microfono.
     *
     * Senza questa riga, chi apre la barra e la chiude lascia «hey TALOS» in
     * pausa **per sempre**: il servizio resta vivo, la notifica dice che sta
     * aspettando, e non sente più niente. Sarebbe la bugia peggiore, perché
     * riguarda un microfono.
     *
     * ⛔ Anche qui vale la simmetria: chi prende deve restituire, e la
     * restituzione va messa dove la presa finisce DAVVERO — non dove speriamo
     * che finisca.
     */
    @Override
    public void onDestroy() {
        ai.talos.parola.TalosParola.riprendi();
        super.onDestroy();
    }

}
