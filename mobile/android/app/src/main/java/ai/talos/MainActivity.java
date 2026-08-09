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
        if (getIntent() != null && getIntent().getBooleanExtra("talos_spia", false)) {
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
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosDevicePermissionsPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Owner 2026-07-28: durable, user-chosen Save-As for encrypted Library
        // files. The plugin accepts only TALOS's private export staging path.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosFileExportPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Android per-app language state; JS remains the catalog owner.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosLocalePlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
        // Arbitrary model-selected page reads use DNS-pinned public addresses
        // and per-hop redirect validation, never unrestricted Capacitor HTTP.
        { long t = android.os.SystemClock.uptimeMillis(); registerPlugin(TalosSafeWebPlugin.class); long d = android.os.SystemClock.uptimeMillis() - t; if (d > 20) Log.i("TalosAvvio", "registerPlugin class: " + d + " ms"); }
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
        long tSuper = android.os.SystemClock.uptimeMillis();
        super.onCreate(savedInstanceState);
        Log.i("TalosAvvio", "super.onCreate: " + (android.os.SystemClock.uptimeMillis() - tSuper) + " ms");
    }
}
