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
 *
 * ⛔⛔ ATTENZIONE, sono DUE diritti diversi e la riga sopra ne copre uno solo.
 *
 * «Stare sopra mentre sono davanti» lo dà il ruolo — vero, e resta vero. Ma
 * **tornare davanti dopo essermi tolto** è un'altra cosa: è un background
 * activity launch, e su Android 15+ vuole `SYSTEM_ALERT_WINDOW` **e una
 * finestra ancora visibile**. È il difetto che l'owner ha nominato il
 * 2026-08-15: «apre WhatsApp e la barra non ricompare».
 *
 * ## ⛔ La strada del PALLINO è chiusa — owner, 2026-08-15
 *
 * «Rimuovi definitivamente il pulsante flottante e il pallino di TALOS
 * d'ora in poi», «assicurati che siano obliterati per sempre».
 *
 * Il pallino teneva una finestra visibile apposta per soddisfare quella
 * condizione. Non ha mai funzionato: il suo servizio non reggeva il primo
 * piano e Android uccideva l'app con
 * `ForegroundServiceDidNotStartInTimeException` — era già staccato prima di
 * essere rimosso. C'è un cancello che ne impedisce il ritorno, in
 * `tests/unit/build/niente-pallino-niente-bottone.test.ts`.
 *
 * ⇒ QUINDI IL RIENTRO DELLA BARRA RESTA APERTO, e va risolto per un'altra
 * strada. Le due che restano da valutare, senza tenere una finestra a schermo:
 * il `PendingIntent` di una notifica (che Android considera un lancio
 * consentito) e il ritorno chiesto dalla persona — «hey TALOS», che dal
 * 2026-08-15 apre la barra 10 volte su 10.
 */
public class TalosBarraActivity extends MainActivity {

    /** Lo dice all'app web: sei la barra, non la schermata intera. */
    public static final String EXTRA_BARRA = "ai.talos.BARRA";

    /**
     * ⛔⛔ CHI HA DECISO DI ANDARSENE — e senza questa distinzione il pallino
     * non poteva funzionare.
     *
     * MISURATO sul Pad il 2026-08-15: quando TALOS apre Chrome, la barra riceve
     * `onPause` con **`isFinishing=true`** e poi `onDestroy`. Cioè non va in
     * background: **si chiude**. Un pallino agganciato a «vado in pausa senza
     * chiudermi» non compariva mai, perché quel caso non esiste.
     *
     * ⇒ La domanda giusta non è «mi sto chiudendo?» ma **«chi mi ha chiuso?»**:
     *
     *   - la PERSONA (HOME, recenti, indietro, X) → conversazione finita, e un
     *     pallino che resta è l'assistente che non se ne va;
     *   - un'APP che TALOS ha aperto per lei → la conversazione continua, e
     *     senza una finestra visibile TALOS non potrà nemmeno tornare.
     *
     * `onUserLeaveHint` risponde esattamente a quella domanda: per contratto
     * Android arriva **solo** quando è la persona ad andarsene. Qui lo si
     * registra, e `onPause` lo legge.
     */
    private boolean personaAndataVia = false;

    /**
     * ⛔⛔ STO ASPETTANDO UN RISULTATO — e senza questo il file scelto si PERDE.
     *
     * ## Il difetto, MISURATO sul Pad il 2026-08-15
     *
     * Dall'assistente: `+` → File → il selettore di sistema si apre → scelgo
     * `prova-talos.txt` → e torno a trovare **le Impostazioni**, senza nessun
     * gettone. Il file non era allegato da nessuna parte.
     *
     * Il registro dice perché, in due righe:
     *
     * ```
     *   ActivityRecord.destroyed
     *   ActivityRecord.removeFromHistory
     * ```
     *
     * ⇒ Aprendo il selettore, `onUserLeaveHint` scatta (misurato: arriva anche
     * quando NON è la persona ad andarsene) e la barra fa `finish()`. Un'activity
     * distrutta non può ricevere `onActivityResult`: **il risultato torna a
     * nessuno**.
     *
     * ## La cura, e perché è universale
     *
     * Ogni plugin che chiede qualcosa al sistema — il selettore file, la
     * fotocamera, la galleria — passa da `startActivityForResult`. Sovrascriverlo
     * è il punto unico in cui TALOS sa di stare aspettando qualcosa, senza un
     * caso speciale per ogni plugin.
     */
    private boolean aspettoUnRisultato = false;

    @Override
    public void startActivityForResult(Intent intent, int requestCode, Bundle options) {
        aspettoUnRisultato = true;
        Log.i(SEGNO, "aspetto un risultato: non mi chiudo se cedo lo schermo");
        super.startActivityForResult(intent, requestCode, options);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        aspettoUnRisultato = false;
        Log.i(SEGNO, "risultato arrivato: code=" + resultCode + " dati=" + (data != null));
        super.onActivityResult(requestCode, resultCode, data);
    }

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

        /*
         * ⭐⭐⭐ SOPRA IL BLOCCO — e MUTA, che è la parte che conta.
         *
         * Owner 2026-08-16: «da telefono bloccato, se dico la parola lo schermo
         * si sveglia, e appena lo sblocco parte subito l'assistente».
         *
         * ⛔⛔ LA DOMANDA DI SICUREZZA VIENE PRIMA DI QUELLA TECNICA.
         *
         * Se la barra rispondesse sopra il lockscreen, un telefono bloccato sul
         * tavolo diventerebbe un microfono che serve CHIUNQUE — e le risposte
         * contengono agenda, messaggi, memoria. La parola detta si TIENE e non
         * si esegue: l'assistente parte all'istante dello sblocco, che è
         * esattamente ciò che l'owner ha chiesto.
         *
         * ⇒ Qui si accende solo lo schermo. L'ascolto anticipato NON parte
         * (vedi la condizione qui sotto): sopra il blocco la barra si vede, e
         * basta.
         *
         * ⛔ `setShowWhenLocked` + `setTurnScreenOn` insieme, e non uno solo:
         * il secondo da solo accende lo schermo su un'activity che il
         * lockscreen coprirebbe. Da API 27 sono questi due metodi, non più i
         * flag di finestra, che sono deprecati.
         *
         * ⛔ E `requestDismissKeyguard` NON chiede di saltare il blocco: chiede
         * al sistema di MOSTRARE la richiesta di sblocco. È la persona a
         * sbloccare, con la sua faccia o il suo PIN — noi arriviamo dopo.
         */
        final boolean daBloccato = deciso != null && "1".equals(deciso.getQueryParameter("bloccato"));
        if (daBloccato && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            final android.app.KeyguardManager blocco =
                    (android.app.KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (blocco != null) {
                blocco.requestDismissKeyguard(this, null);
            }
        }

        /*
         * ⛔ Sopra il blocco il microfono NON si accende. La condizione era
         * «voce=1»; adesso è «voce=1 e non siamo sul lockscreen», perché una
         * barra muta con il microfono aperto sarebbe il peggio dei due mondi:
         * ascolta e non può rispondere.
         */
        if (deciso != null && "1".equals(deciso.getQueryParameter("voce")) && !daBloccato) {
            ai.talos.agent.TalosOrecchioAnticipato.accendi(this);
        }

        super.onCreate(savedInstanceState);
        registraIlTastoIndietro();
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
        viva = true;
        Log.i(SEGNO, "davanti=true (onResume)");
        rendiTrasparenteLaWebView("onResume");
    }

    /**
     * ⭐⭐⭐ QUI NASCE IL PALLINO — owner 2026-08-15, «la barra assistente non
     * ricompare».
     *
     * ## ⛔ Non era un difetto: era una regola di sistema
     *
     * Rientrare dopo aver ceduto lo schermo è un background activity launch, e
     * su Android 15+ vuole `SYSTEM_ALERT_WINDOW` **e una finestra ancora
     * visibile**. ⇒ Una barra che sparisce **non può richiamarsi**. Il pallino
     * è quella finestra: tenendolo, TALOS conserva il diritto di tornare — e
     * intanto dà alla persona il modo di tornarci lei.
     *
     * ## ⛔ Perché QUI e non «quando apro WhatsApp»
     *
     * Owner: «universale per tutte le app possibili». `onPause` è il punto in
     * cui la barra cede lo schermo **a chiunque**, per qualunque strada — un
     * intent, il pilota, un tocco. Legarlo a una app sola vorrebbe dire un caso
     * per ognuna.
     *
     * ## ⛔ E la distinzione che evita il pallino di troppo era GIÀ in casa
     *
     * `onUserLeaveHint` arriva **solo** quando è la persona ad andarsene (HOME,
     * recenti) e lì la barra fa `finish()`. Quando invece è TALOS ad aprire
     * un'app arriva **solo** `onPause`. ⇒ `isFinishing()` separa i due casi
     * senza inventare niente: se la conversazione è chiusa di proposito, un
     * pallino che resta è l'assistente che non se ne va.
     */
    @Override
    public void onPause() {
        super.onPause();
        viva = false;
        Log.i(SEGNO, "davanti=false (onPause) personaAndataVia=" + personaAndataVia);
        /*
         * ⛔ Si guarda CHI ha chiuso, non SE si sta chiudendo: misurato, la barra
         * si chiude anche quando è TALOS ad aprire un'app, quindi `isFinishing`
         * qui è sempre vero e non distingue niente.
         */
    }

    /**
     * ⭐⭐⭐ «LA BARRA È DAVANTI ADESSO?» — e serve alla PAROLA DI ATTIVAZIONE.
     *
     * Owner 2026-08-14: «hey jarvis non funziona quando la barra è già aperta».
     * Con la barra a schermo il servizio chiedeva al sistema una sessione
     * d'assistente che era **già mostrata**: nessun intent nuovo, nessuna
     * chiamata nuova per il lato web, e quindi nessun ascolto che riparte.
     *
     * ⇒ Chi sente la parola guarda qui: se la barra c'è già, le manda un intent
     * — che `onNewIntent` timbra come apertura nuova, e il lato web tratta come
     * «mi hanno chiamato di nuovo», che è esattamente ciò che deve succedere.
     *
     * ⛔ `onResume`/`onPause` e non `onCreate`/`onDestroy`: la domanda è «è
     * davanti», non «esiste». Una barra esistente ma coperta non deve far
     * saltare la strada dell'assistente, che è quella che porta il contesto
     * dello schermo.
     */
    private static volatile boolean viva = false;

    public static boolean eDavanti() {
        return viva;
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
    /**
     * ⛔⛔⛔ SE LA PERSONA SE NE VA, LA BARRA SI CHIUDE — e prima non lo faceva.
     *
     * ## Il difetto, misurato sul Pad il 2026-08-14
     *
     * Chiamata la barra con la parola, poi lasciata lì in silenzio: rimane
     * `topResumedActivity` **per sempre**. `dumpsys activity activities` la
     * mostrava viva e visibile minuti dopo, riaperta col suo stesso indirizzo
     * (`talos://barra?voce=1`), e nemmeno tre `KEYCODE_HOME` la mandavano via.
     *
     * ⇒ E finché vive, ogni sua sessione di ascolto chiama
     * `TalosParola.cedi()` — misurato: una cessione ogni ~2,3 secondi. La
     * parola di attivazione resta sorda, e il difetto che la persona sente è
     * «hey TALOS funziona una volta sola».
     *
     * ## ⛔ Perché `onUserLeaveHint` e non `onPause`
     *
     * `onPause` scatta anche quando **noi** mettiamo davanti un'altra
     * activity — ed è ciò che succede nell'ultimo centimetro di WhatsApp, dove
     * TALOS apre l'app e preme il tasto. Chiudersi lì spezzerebbe la capacità
     * che ci è costata di più.
     *
     * `onUserLeaveHint` per contratto Android arriva **solo** quando è la
     * persona ad andarsene — HOME, recenti — e **non** quando un'activity viene
     * lanciata davanti dall'app stessa. È esattamente la distinzione che serve,
     * e non è una furbizia: è la domanda a cui quella richiamata risponde.
     *
     * ⛔ `riprendi()` non si chiama qui: lo fa `onDestroy`, che `finish()`
     * garantisce. Metterlo in due posti vorrebbe dire due verità sullo stesso
     * microfono.
     */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // ⛔ Prima di `finish()`: è questo flag a dire a `onPause` che la
        // conversazione è finita per volontà della persona, e che quindi non
        // deve restare nessun pallino.
        /*
         * ⛔⛔ NON si chiude se stiamo ASPETTANDO UN RISULTATO.
         *
         * MISURATO: aprendo il selettore file, `onUserLeaveHint` arriva lo
         * stesso — cioè Android non distingue «la persona se n'è andata» da
         * «l'app ha aperto qualcosa» quanto il suo contratto promette. Chiudersi
         * lì distruggeva l'activity, e il file scelto tornava a nessuno.
         *
         * ⇒ Chi aspetta un risultato resta vivo. È la stessa disciplina
         * dell'ultimo centimetro: non si molla a metà di un'operazione.
         */
        if (aspettoUnRisultato) {
            android.util.Log.i("TalosBarra", "cedo lo schermo ma aspetto un risultato: resto viva");
            return;
        }
        personaAndataVia = true;
        android.util.Log.i("TalosBarra", "la persona se n'è andata: chiudo e mollo il microfono");
        finish();
    }

    /**
     * ⛔⛔⛔ IL BACK CHIUDE LA BARRA — e prima veniva INGHIOTTITO.
     *
     * MISURATO sul Pad il 2026-08-14: chiamata la barra con la parola, premuto
     * `KEYCODE_BACK`, e `dumpsys window` mostrava ancora
     * `mCurrentFocus=TalosBarraActivity`. Nessuna riga di registro, da nessuna
     * parte: il tasto arrivava e non succedeva niente.
     *
     * La causa è l'eredità: `BridgeActivity` passa il «indietro» alla WebView
     * perché torni indietro nella sua cronologia. Nella schermata intera è
     * giusto — ci sono pagine da risalire. Qui **non c'è nessuna cronologia**:
     * la barra è UNA superficie, aperta sopra quello che la persona stava
     * facendo. Il «indietro» lì significa una cosa sola: **toglila di mezzo**.
     *
     * ⇒ E finché non si toglie, tiene il microfono: ogni sua sessione di
     * ascolto chiama `TalosParola.cedi()`, e la parola di attivazione resta
     * sorda. Un assistente che non si può congedare è peggio di uno che non si
     * apre — quello almeno non ti porta via niente.
     *
     * ## ⛔⛔ E `onBackPressed()` NON BASTA PIÙ: l'ho provato e non veniva chiamato
     *
     * Primo tentativo: `@Override public void onBackPressed() { finish(); }`.
     * Compilato, installato, premuto indietro — **la barra restava aperta e il
     * registro restava vuoto**, esattamente come prima.
     *
     * Con `targetSdk 36` il sistema usa il **back predittivo**: la vecchia
     * richiamata è deprecata e non viene invocata. Chi vuole rispondere al
     * gesto deve registrarsi su `OnBackInvokedDispatcher`. ⇒ La differenza fra
     * «ho scritto la cura» e «la cura viene chiamata» l'ha detta il dispositivo,
     * non il compilatore: il codice era corretto e non serviva a niente.
     *
     * ⛔ `finish()` e non `moveTaskToBack`: la barra deve MORIRE, perché è
     * `onDestroy` a restituire il microfono. Mandarla dietro la lascerebbe viva
     * a tenersi la presa, che è esattamente il difetto.
     */
    private void registraIlTastoIndietro() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            /*
             * ⛔⛔ `PRIORITY_OVERLAY` e non `PRIORITY_DEFAULT`, e l'ho scoperto
             * provando: con la priorità normale il back restava inghiottito
             * lo stesso. Capacitor registra la SUA richiamata per la WebView, e
             * a parità di priorità il dispatcher chiama l'ultima registrata —
             * la sua, che arriva dopo la nostra.
             *
             * `PRIORITY_OVERLAY` esiste esattamente per questo: una superficie
             * disegnata SOPRA il contenuto, che sul «indietro» deve andarsene
             * per prima. È ciò che la barra è.
             */
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_OVERLAY,
                    () -> {
                        android.util.Log.i("TalosBarra", "indietro: chiudo la barra e mollo il microfono");
                        finish();
                    });
        }
    }

    /**
     * ⛔ La strada VECCHIA resta, per i telefoni sotto Android 13: là il back
     * predittivo non esiste e il dispatcher nemmeno. `minSdk` è 26, quindi
     * quei telefoni sono nel parco — togliere questo lascerebbe la barra
     * inchiodata proprio su di loro.
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        android.util.Log.i("TalosBarra", "indietro (strada vecchia): chiudo la barra");
        finish();
    }

    @Override
    public void onDestroy() {
        Log.i(SEGNO, "onDestroy personaAndataVia=" + personaAndataVia);
        ai.talos.parola.TalosParola.riprendi();
        /*
         * ⛔⛔ QUI NON SI TOGLIE IL PALLINO, ed è tutto il suo senso.
         *
         * La prima versione lo toglieva, e non poteva funzionare: il pallino
         * esiste per **sopravvivere** alla barra: la barra muore appena cede lo
         * schermo (misurato: `onPause isFinishing=true`, poi `onDestroy`), e un
         * pallino che muore con lei non tiene aperta nessuna porta.
         *
         * Vive col PROCESSO — che resta su, perché c'è il servizio della parola
         * — e si spegne quando la persona torna (`onResume`) o quando lo tocca.
         *
         * ⛔ E se la persona se n'è andata di sua volontà, in `onPause` non è
         * stato acceso affatto: non c'è niente da togliere.
         */
        super.onDestroy();
    }

}
