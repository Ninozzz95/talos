package ai.talos;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // L'attrezzo che ha trovato chi bloccava l'avvio per dieci secondi.
        // Spento salvo richiesta esplicita: campionare costa un thread, e la
        // caccia e' finita. Come si arma sta scritto su TalosSpiaIlThread.
        //
        // ⛔⛔⛔ E `BuildConfig.DEBUG` NON e' un controllo a runtime.
        //
        // Questa activity e' esportata per forza — un intent-filter su una
        // activity non esportata non viene mai consultato dal sistema, e senza
        // non ci sarebbe l'icona nel launcher. Ma esportata significa che
        // QUALUNQUE app sul telefono puo' lanciarla, e con
        //
        //     am start -n ai.talos/.MainActivity --ez talos_spia true
        //
        // faceva partire un campionatore per quindici secondi: consumo di
        // risorse innescabile da fuori, senza che nessuno lo autorizzi, e pile
        // di thread scritte nei log.
        //
        // `BuildConfig.DEBUG` e' una `static final boolean`, quindi il
        // compilatore Java elimina il ramo morto (JLS 14.21 tiene aperta questa
        // strada apposta, per la compilazione condizionale). Nel bytecode di
        // rilascio la chiamata NON C'E' — non e' spenta, e' assente. E lo si
        // puo' verificare guardando il .class, che e' l'unico modo di saperlo
        // invece di crederlo.
        if (BuildConfig.DEBUG
                && getIntent() != null && getIntent().getBooleanExtra("talos_spia", false)) {
            TalosSpiaIlThread.perQuindiciSecondi();
        }
        // Owner 2026-07-24: per-theme launcher icon switching (activity-alias toggles).
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosAppIconPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Debt S2: FLAG_SECURE control (recents thumbnail / screenshots).
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosPrivacyPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Owner 2026-07-26: fingerprint unlock for a PIN-encrypted database —
        // a second wrapping of the SAME key, bound to biometrics in hardware.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosBiometricKeyPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // R-1b: keeps long operations alive when the app is backgrounded.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosRunServicePlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // And says so when it ends. The keeper's notification is the work in
        // progress; this is the one the person is actually waiting for, and it
        // carries the address of the thing that finished.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosDonePlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // ⭐ «hey TALOS»: l'interruttore della parola di attivazione.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.parola.TalosParolaPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosNotificationCentrePlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Il ponte privilegiato in casa. Per ora GUARDA soltanto: dice se
        // c'e', se e' vivo e se ci ha autorizzati, cosi' la schermata puo'
        // mostrare il primo passo mancante invece di un elenco di cose da fare.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.agent.TalosPrivilegePlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Il primo tool che tocca il telefono senza chiedere niente a nessuno.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.agent.TalosDevicePlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // ⭐ Le notifiche: leggerle e risponderle e' meta' di cio' che fa
        // Gemini, e non passa da nessun ponte privilegiato — si accende dalla
        // pagina di sistema. ⛔ I codici OTP restano oscurati da Android 15 in
        // poi, e TALOS lo dichiara invece di far finta.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.agent.TalosNotificationsPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // ⭐ TALOS che parla. Nessun permesso, e la capacita' col rapporto
        // valore/costo piu' alto di tutto l'inventario.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.agent.TalosSpeechPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // ⭐ L'OCCHIO e la MANO: l'albero in-process (2-26 ms contro i 2.216 di
        // `uiautomator dump`) e le azioni SUL NODO, che portano gratis la
        // scrittura dell'italiano accentato.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.agent.TalosSchermoPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // ⭐ La rubrica: senza, ogni intent «manda a <persona>» resta impossibile.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.agent.TalosRubricaPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.agent.TalosCalendarioPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Il riconoscitore DI CASA: il plugin di terzi passa una lingua sola e
        // nessuna chiave di rilevamento — misurato nel suo sorgente.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.agent.TalosDictationPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosDevicePermissionsPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Owner 2026-07-28: durable, user-chosen Save-As for encrypted Library
        // files. The plugin accepts only TALOS's private export staging path.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosFileExportPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Android per-app language state; JS remains the catalog owner.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosLocalePlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Arbitrary model-selected page reads use DNS-pinned public addresses
        // and per-hop redirect validation, never unrestricted Capacitor HTTP.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosSafeWebPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Owner 2026-08-27: artefatti HTML interattivi in chat, come
        // ChatGPT/Claude — ma renderizzati in una WebView SEPARATA
        // (TalosArtifactActivity, non esportata, mai in questo ponte),
        // perché addJavascriptInterface inietta per istanza di WebView e
        // non per origine (verificato leggendo CapacitorCookies.java vero).
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.artifact.TalosArtifactPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Downloading a model. It cannot be done from JavaScript at all: Android
        // suspends a backgrounded WebView, and a 4 GB transfer spends most of
        // its hours there.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosModelTransferPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // A model the person already has on the phone. Local-first means the
        // door has to open inward too, not only towards Hugging Face.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosModelImportPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // "Will this model run on THIS phone" — asked of the phone, live, rather
        // than of a table of chip names that is wrong for anything newer than it.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosDeviceCapacityPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // And then actually running it. llama.cpp lives on the other side of
        // JNI, which JavaScript cannot reach; without this line the engine is
        // compiled into the APK, proven by an instrumented test, and unable to
        // answer a single message.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosLlamaPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // La voce personale (0.1.18, Fase 4): stessa storia di TalosLlamaPlugin
        // sopra - il motore ONNX di ai.talos.voice vive dentro l'APK dalla
        // Fase 1, ma senza questa riga JavaScript non può raggiungerlo.
        // Registrare la classe è economico: TalosVoiceHost/TalosVoiceEnrollment
        // aprono le sessioni ONNX pigramente, al primo uso vero, non qui.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(ai.talos.voice.TalosNeuralVoicePlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Accedere a un provider senza incollare una chiave. Il browser di
        // sistema fa l'accesso e rientra su 127.0.0.1: mettersi in ascolto su
        // una porta è l'unica parte che JavaScript non può fare.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosOAuthLoopbackPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Le attivita' che si eseguono da sole. Il modello gira nel processo
        // dell'app SENZA interfaccia: chiedere qualcosa alla WebView vorrebbe
        // dire aspettare che qualcuno apra l'app, cioe' non essere automatici.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosTaskRunPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // ⛔ Il cronometro dell'avvio NATIVO. Misurato dal lato JavaScript: il
        // ponte Capacitor risponde per i primi ~170 ms, poi TACE per nove
        // secondi, poi riprende. Chiunque bussi in quella finestra aspetta, e
        // per tre volte ho scambiato l'inquilino di turno per il colpevole.
        // Questi numeri dicono se il silenzio nasce qui dentro, e di chi e'.
        // ⛔ Il campanello della barra: senza, l'activity trattiene il primo
        // frame fino al tetto e la barra compare mezzo secondo dopo. Vedi
        // TalosBarraActivity.trattieniIlPrimoFrame.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosBarraPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        /*
         * ⛔⛔ LA BOLLA SI REGISTRA PER NOME, e la riflessione qui è la scelta
         * giusta, non una scorciatoia.
         *
         * Owner 2026-08-11: «la bolla la voglio solo nella versione di sviluppo,
         * non in produzione». Quel pallino vive nel source set `debug`, quindi
         * questa classe — che sta in `main` — non può NOMINARLO: non compilerebbe
         * la release. Nominarlo come stringa e cercarlo è l'unico modo di tenere
         * il codice fuori dall'APK di produzione invece che spento dentro.
         *
         * ⇒ In release `Class.forName` non trova niente, il ponte non ha il
         * plugin, e la schermata nasconde la scheda perché le è stato risposto
         * «non ci sono». L'ASSENZA è la prova: un interruttore si può sbagliare,
         * un file che non entra nell'APK no.
         */
        try {
            //noinspection unchecked
            registerPlugin((Class<? extends com.getcapacitor.Plugin>)
                Class.forName("ai.talos.bolla.TalosBollaPlugin"));
        } catch (ClassNotFoundException assente) {
            // È la produzione: la bolla non esiste, e va bene così.
        }
        // Harness UI (Codex, 24/8): stessa storia della bolla sopra, stesso
        // meccanismo — la classe vive SOLO nel source set `debug`
        // (ai.talos.harness.TalosHarnessUiPlugin), quindi in release
        // Class.forName trova ClassNotFoundException per costruzione, non
        // per un controllo aggirabile. Owner: «mockup visibile solo nella
        // apk di debug, in quello di release lo nascondiamo».
        try {
            //noinspection unchecked
            registerPlugin((Class<? extends com.getcapacitor.Plugin>)
                Class.forName("ai.talos.harness.TalosHarnessUiPlugin"));
        } catch (ClassNotFoundException assente) {
            // È la produzione: l'harness UI non esiste, e va bene così.
        }
        // Terminale sandboxato in-device per la sezione Codice (owner 28/8:
        // «vincolo obbligatorio, senza eccezioni» — niente ponte adb/PC come
        // via di default). Stessa storia della bolla e dell'harness UI sopra:
        // la classe vive SOLO nel source set `debug`
        // (ai.talos.terminal.TalosTerminalPlugin), MAI verificata su un
        // device reale — vedi il commento di classe sul rischio SELinux/
        // seccomp non ancora chiuso.
        try {
            //noinspection unchecked
            registerPlugin((Class<? extends com.getcapacitor.Plugin>)
                Class.forName("ai.talos.terminal.TalosTerminalPlugin"));
        } catch (ClassNotFoundException assente) {
            // È la produzione: il terminale sandboxato non esiste, e va bene così.
        }
        long tSuper = android.os.SystemClock.uptimeMillis();
        super.onCreate(savedInstanceState);
        Log.i("TalosAvvio", "super.onCreate: " + (android.os.SystemClock.uptimeMillis() - tSuper) + " ms");
    }
    /**
     * ⛔⛔⛔ IL DETTATO SICURO VINCE SUL CAPGO — dal punto giusto, senza toccare il build.
     *
     * Ho provato due strade sbagliate. Prima: registrare TalosSpeechSicuro in
     * onCreate — la sonda ha dimostrato che NON basta, il capgo auto-caricato
     * vince. Poi: un hook Gradle che filtrava il capacitor.plugins.json — rompeva
     * l'impacchettamento sul CI (packageRelease FAILED) perche' un task che
     * riscrive un asset condiviso confonde il tracciamento degli input di gradle.
     * Verde in locale, rosso sul runner: la peggior specie di difetto.
     *
     * ⇒ La via pulita e' QUI. `load()` di BridgeActivity aggiunge `initialPlugins`
     * al builder DOPO i plugin auto-caricati (il capgo). La mappa dei plugin e'
     * un put per nome: chi arriva dopo vince. Aggiungendo TalosSpeechSicuro a
     * initialPlugins prima di super.load(), la nostra sottoclasse — stesso nome
     * «SpeechRecognition» — sovrascrive il capgo che crasha su getPermissionState
     * null. Niente build da toccare, niente asset da riscrivere.
     */
    @Override
    protected void load() {
        initialPlugins.add(ai.talos.agent.TalosSpeechSicuro.class);
        super.load();
    }


    /**
     * ⭐⭐ «HEY TALOS» TORNA VIVA QUANDO L'APP TORNA DAVANTI.
     *
     * ⛔ Il difetto, MISURATO il 12 agosto con `dumpsys activity services`: il
     * servizio della parola non era fra i vivi. Non era sordo — non esisteva.
     * E' `START_NOT_STICKY` di proposito (un microfono non deve resuscitare da
     * solo) e nessuno lo riaccendeva MAI: bastava un riavvio o un force-stop e
     * la funzione finiva per sempre, con l'interruttore che diceva ancora «si».
     *
     * ⛔ E il ricevitore di avvio non e' la cura: da Android 14 un servizio in
     * primo piano di tipo `microphone` avviato da `BOOT_COMPLETED` lancia
     * `ForegroundServiceStartNotAllowedException`. `RECORD_AUDIO` e'
     * *while-in-use*, e dal fondo non si esercita.
     *
     * ⇒ Qui, che e' il primo istante legittimo: l'app e' davanti alla persona.
     */
    @Override
    public void onResume() {
        super.onResume();
        ai.talos.parola.TalosParola.riprendiSeVoluta(this);
        riparaCioCheIlSistemaHaSpento();
    }

    /**
     * ⭐⭐⭐ QUELLO CHE HAI ACCESO RESTA ACCESO.
     *
     * Owner 2026-08-15: «di assoluta critica e vitale importanza è che, alla
     * chiusura e riapertura dell'applicazione, l'utente mantenga tutte le
     * impostazioni di controllo del telefono, anche quelle di accessibilità
     * tutte. D'ora in poi l'utente non deve perdere nulla».
     *
     * MISURATO sul Pad: scorrendo via TALOS dai recenti, l'elenco dei servizi di
     * accessibilità continua a nominarci ma `accessibility_enabled` va a **0** —
     * due righe che dovrebbero dire la stessa cosa e si contraddicono. L'occhio
     * resta «acceso» in elenco e non vede più niente.
     *
     * ⛔ QUI, in `onResume`, e non in `onCreate`: il caso da curare è proprio la
     * RIAPERTURA, e `onCreate` non scatta quando l'Activity è solo tornata
     * davanti. Il posto sbagliato avrebbe curato metà dei casi.
     *
     * ⛔ E FUORI dal thread principale: il ponte fa I/O, e un avvio che aspetta
     * una shell è un avvio che sembra rotto. La riparazione può arrivare un
     * istante dopo — nessuno guarda l'occhio nel primo mezzo secondo.
     *
     * ⛔ Non accende NIENTE che la persona non abbia già acceso: la condizione è
     * «TALOS è ancora nell'elenco». Vedi `TalosNonSiPerdeNiente`.
     */
    private void riparaCioCheIlSistemaHaSpento() {
        final android.content.Context contesto = getApplicationContext();
        new Thread(() -> {
            try {
                String esito = ai.talos.agent.TalosNonSiPerdeNiente.INSTANCE.riparaSeServe(contesto);
                if (!"gia-a-posto".equals(esito) && !"niente-da-fare".equals(esito)) {
                    android.util.Log.i("TalosAvvio", "accessibilità: " + esito);
                }
            } catch (Throwable ignorato) {
                // Un avvio non fallisce mai per una riparazione mancata.
            }
        }, "talos-ripara").start();
    }
}
