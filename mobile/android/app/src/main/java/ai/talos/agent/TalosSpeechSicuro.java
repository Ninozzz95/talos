package ai.talos.agent;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import android.Manifest;

import app.capgo.speechrecognition.SpeechRecognitionPlugin;

/**
 * ⛔⛔⛔ IL PLUGIN DEL DETTATO CHE NON UCCIDE L'APP.
 *
 * Il 18 agosto TALOS crashava aprendo la Diagnostica, su un dispositivo vero:
 *
 *     FATAL EXCEPTION: CapacitorPlugins
 *     Caused by: java.lang.NullPointerException
 *       at com.getcapacitor.Bridge.getPermissionStates
 *
 * La causa e la stessa di {@code TalosDevicePermissionsPlugin}: {@code
 * getPermissionState} puo tornare {@code null}, e su questo telefono lo fa. Ma
 * qui il codice che ci scrive sopra NON e nostro — e in
 * {@code @capgo/capacitor-speech-recognition}, dentro {@code node_modules}:
 *
 *     String state = permissionStateValue(getPermissionState(SPEECH_RECOGNITION));
 *
 * {@code permissionStateValue} non regge un {@code null}, e la diagnostica del
 * dettato chiama {@code checkPermissions} — quindi aprire la Diagnostica lo
 * innescava. E il crash e SINCRONO sul thread {@code CapacitorPlugins}: nessun
 * {@code try/catch} in JavaScript lo puo prendere, perche avviene prima che la
 * promessa torni.
 *
 * ## ⇒ Non si tocca node_modules: si SCAVALCA
 *
 * Questa sottoclasse eredita tutto dal plugin capgo e sovrascrive SOLO le porte
 * che leggono il permesso, con la stessa rete di {@code statoPermesso}: un
 * permesso il cui stato non si legge e {@code unknown}, non un crash e non un
 * «negato» inventato.
 *
 * ⛔ Va REGISTRATA ESPLICITAMENTE in {@code MainActivity}, cosi vince
 * sull'auto-registrazione del capgo. Stesso {@code name} = stessa identita per il
 * frontend: la chat non sa che e cambiato niente, chiama «SpeechRecognition» come
 * prima.
 *
 * ⛔ E l'annotazione va RIPETUTA — verificato sulla documentazione Capacitor: il
 * nome e il permesso NON si ereditano dall'annotazione della superclasse. Senza,
 * questa sarebbe un plugin senza nome e senza RECORD_AUDIO, cioe' peggio del
 * difetto.
 */
@CapacitorPlugin(
    name = "SpeechRecognition",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "speechRecognition"),
    }
)
public class TalosSpeechSicuro extends SpeechRecognitionPlugin {

    private static final String ALIAS = "speechRecognition";

    /**
     * ⛔ La lettura protetta, gemella di {@code TalosDevicePermissionsPlugin.statoPermesso}.
     * I valori sono quelli del framework: chi legge dal frontend non vede un
     * dialetto nuovo.
     */
    private String statoSicuro() {
        try {
            PermissionState stato = getPermissionState(ALIAS);
            return stato == null ? "unknown" : stato.toString();
        } catch (RuntimeException nonLeggibile) {
            return "unknown";
        }
    }

    @PluginMethod
    @Override
    public void checkPermissions(PluginCall call) {
        call.resolve(new JSObject().put(ALIAS, statoSicuro()));
    }
}
