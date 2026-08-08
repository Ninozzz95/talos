package ai.talos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Owner 2026-07-24: per-theme launcher icon switching (activity-alias toggles).
        registerPlugin(TalosAppIconPlugin.class);
        // Debt S2: FLAG_SECURE control (recents thumbnail / screenshots).
        registerPlugin(TalosPrivacyPlugin.class);
        // Owner 2026-07-26: fingerprint unlock for a PIN-encrypted database —
        // a second wrapping of the SAME key, bound to biometrics in hardware.
        registerPlugin(TalosBiometricKeyPlugin.class);
        // R-1b: keeps long operations alive when the app is backgrounded.
        registerPlugin(TalosRunServicePlugin.class);
        // And says so when it ends. The keeper's notification is the work in
        // progress; this is the one the person is actually waiting for, and it
        // carries the address of the thing that finished.
        registerPlugin(TalosDonePlugin.class);
        registerPlugin(TalosNotificationCentrePlugin.class);
        // Il ponte privilegiato. Per ora GUARDA soltanto: dice se Shizuku
        // c'e', se e' vivo e se ci ha autorizzati, cosi' la schermata puo'
        // mostrare il primo passo mancante invece di un elenco di cose da fare.
        registerPlugin(ai.talos.agent.TalosPrivilegePlugin.class);
        // Il primo tool che tocca il telefono senza chiedere niente a nessuno.
        registerPlugin(ai.talos.agent.TalosDevicePlugin.class);
        // ⭐ TALOS che parla. Nessun permesso, e la capacita' col rapporto
        // valore/costo piu' alto di tutto l'inventario.
        registerPlugin(ai.talos.agent.TalosSpeechPlugin.class);
        registerPlugin(TalosDevicePermissionsPlugin.class);
        // Owner 2026-07-28: durable, user-chosen Save-As for encrypted Library
        // files. The plugin accepts only TALOS's private export staging path.
        registerPlugin(TalosFileExportPlugin.class);
        // Android per-app language state; JS remains the catalog owner.
        registerPlugin(TalosLocalePlugin.class);
        // Arbitrary model-selected page reads use DNS-pinned public addresses
        // and per-hop redirect validation, never unrestricted Capacitor HTTP.
        registerPlugin(TalosSafeWebPlugin.class);
        // Downloading a model. It cannot be done from JavaScript at all: Android
        // suspends a backgrounded WebView, and a 4 GB transfer spends most of
        // its hours there.
        registerPlugin(TalosModelTransferPlugin.class);
        // A model the person already has on the phone. Local-first means the
        // door has to open inward too, not only towards Hugging Face.
        registerPlugin(TalosModelImportPlugin.class);
        // "Will this model run on THIS phone" — asked of the phone, live, rather
        // than of a table of chip names that is wrong for anything newer than it.
        registerPlugin(TalosDeviceCapacityPlugin.class);
        // And then actually running it. llama.cpp lives on the other side of
        // JNI, which JavaScript cannot reach; without this line the engine is
        // compiled into the APK, proven by an instrumented test, and unable to
        // answer a single message.
        registerPlugin(TalosLlamaPlugin.class);
        // Accedere a un provider senza incollare una chiave. Il browser di
        // sistema fa l'accesso e rientra su 127.0.0.1: mettersi in ascolto su
        // una porta è l'unica parte che JavaScript non può fare.
        registerPlugin(TalosOAuthLoopbackPlugin.class);
        // Le attivita' che si eseguono da sole. Il modello gira nel processo
        // dell'app SENZA interfaccia: chiedere qualcosa alla WebView vorrebbe
        // dire aspettare che qualcuno apra l'app, cioe' non essere automatici.
        registerPlugin(TalosTaskRunPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
