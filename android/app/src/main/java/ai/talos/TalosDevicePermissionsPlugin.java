package ai.talos;

import android.annotation.SuppressLint;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * What the device has actually granted, and the one door out to system settings.
 *
 * Written in-house rather than taken from a third-party plugin: TALOS needs a
 * surface no catalogue plugin provides (a notification state that distinguishes
 * "never asked" from "permanently denied", and the app-details intent), and this
 * sits on the security-sensitive path where one less dependency is worth the
 * thirty lines.
 *
 * The distinction that makes the permissions screen honest lives here. Android's
 * own API cannot tell "never asked" from "permanently denied" —
 * `shouldShowRequestPermissionRationale` returns false for both — so a screen
 * built on it alone would show an Allow button that, past a permanent denial,
 * silently does nothing. Capacitor keeps the extra bit in its own cache, and
 * `getPermissionState` reads it.
 */
@CapacitorPlugin(
    name = "TalosDevicePermissions",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        /*
         * ⭐⭐ I QUATTRO CHE LA PAGINA MOSTRAVA SENZA STATO — 2026-08-14.
         *
         * Contatti, Calendario, Conteggio della posta e Fotocamera comparivano
         * con un cerchio vuoto e nient'altro: né «CONSENTITO», né un pulsante.
         * Cioè la pagina che promette di dire tutto taceva proprio sulla domanda
         * per cui una persona la apre — «ce l'ha, o no?».
         *
         * ⛔ Sono dichiarati QUI e non solo nei plugin che li usano, e il motivo
         * sta nel commento in cima a questa classe: Capacitor tiene un bit che
         * Android non espone — «è già stato chiesto» — e senza quel bit un
         * rifiuto definitivo si traveste da «mai chiesto», cioè da pulsante che
         * non fa niente. Il bit vive nel plugin che chiede: chi legge lo stato
         * dev'essere lo stesso che lo domanda.
         */
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "calendar", strings = {
            Manifest.permission.READ_CALENDAR,
            Manifest.permission.WRITE_CALENDAR
        }),
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        /*
         * ⛔ Il contatore di Gmail NON è un permesso di Android: lo definisce
         * Gmail ed è `dangerous` (MISURATO: `dumpsys package permission …` →
         * `prot=dangerous`). Si chiede con lo stesso dialogo, quindi vive in
         * questo elenco come gli altri — ma il nome va scritto per intero,
         * perché in `Manifest.permission` non c'è.
         */
        @Permission(alias = "mailCount", strings = {
            "com.google.android.gm.permission.READ_CONTENT_PROVIDER"
        }),
        /*
         * ⭐⭐ LA QUINTA RIGA CHE TACEVA — 2026-08-16.
         *
         * «Dove ti trovi» era dichiarata `kind: 'runtime'` in
         * `permissionRows.ts` — cioè PROMETTE uno stato — e qui non c'era.
         * `stateOf()` tornava `null`, la riga non diceva né «Consentito» né
         * altro, e il nome accessibile era «Dove ti trovi» e basta: chi usa uno
         * screen reader non aveva NESSUN modo di sapere se era concessa.
         *
         * ⛔⛔ E l'alias contiene SOLO la posizione approssimata, non tutte e
         * due, benché il manifest le dichiari entrambe.
         *
         * Capacitor, `Bridge.getPermissionStates` (Bridge.java:1250):
         *
         *     // multiple permissions with the same alias must all be true,
         *     // otherwise all false.
         *
         * E da Android 12 la persona sceglie fra «Precisa» e «Approssimata»:
         * scegliendo Approssimata, COARSE è concessa e FINE no. Con un alias a
         * due permessi questa riga avrebbe detto «non concessa» a chi l'aveva
         * appena CONCESSA — cioè avrebbe inventato un fatto falso, che è
         * esattamente ciò che questa schermata vieta a sé stessa.
         *
         * Con la sola COARSE la risposta è vera in tutti e due i casi:
         * scegliendo «Precisa» Android concede anche la grossolana. Ed è ciò
         * che la riga promette davvero — «un ristorante per stasera, il negozio
         * più vicino» non ha bisogno del metro.
         */
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_COARSE_LOCATION
        })
    }
)
public class TalosDevicePermissionsPlugin extends Plugin {

    /**
     * ⛔ UN ELENCO SOLO, letto sia da chi RIPORTA lo stato sia da chi CHIEDE.
     *
     * Prima erano due liste scritte a mano, in due punti a ottanta righe di
     * distanza: il ciclo di `state()` e il controllo dentro `requestRuntime()`.
     * Due elenchi che devono coincidere coincidono finché qualcuno non ne
     * aggiorna uno — ed è successo: «Dove ti trovi» è entrata fra le righe
     * della schermata e non in nessuno dei due, restando muta per sempre senza
     * che niente fallisse.
     *
     * Con una costante sola, aggiungere una riga è UN posto, e dimenticarsene
     * non è più possibile.
     */
    private static final String[] RUNTIME_ALIASES = {
        "contacts", "calendar", "camera", "mailCount", "location"
    };

    /**
     * Below Android 13 there is no notification permission at all: notifications
     * are on unless the user turned the whole app's off, and reporting "prompt"
     * would invite a request that can never happen.
     */
    @PluginMethod
    public void state(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            result.put("notifications", enabled ? "granted" : "denied");
            result.put("notificationsRuntime", false);
        } else {
            // Capacitor's own state, which carries the bit Android does not:
            // `denied` here means permanently denied, `prompt` means never asked.
            result.put("notifications", statoPermesso("notifications"));
            result.put("notificationsRuntime", true);
        }
        result.put("microphone", micState());
        /*
         * ⭐ Lo stato dei quattro, chiesto al sistema a ogni lettura.
         *
         * ⛔ Mai messo in cache, come tutto il resto di questa schermata:
         * Android azzera i permessi delle app lasciate ferme qualche mese, e la
         * persona può revocarne uno in qualunque momento. Un valore ricordato
         * direbbe «Consentito» su un permesso tolto la settimana scorsa.
         */
        JSObject runtime = new JSObject();
        for (String alias : RUNTIME_ALIASES) {
            runtime.put(alias, statoPermesso(alias));
        }
        result.put("runtime", runtime);
        /**
         * L'esenzione dal risparmio energetico, che è LA voce di questa pagina.
         *
         * Misurato sul OnePlus 13 il 2026-08-03: senza, ColorOS congela la
         * WebView appena l'app va in background — «OplusHansManager … enter SM»
         * — e una Deep Research muore tre volte su tre; con l'esenzione si
         * conclude da sola in 1 min 04 s. Il foreground service `dataSync` è
         * dichiarato e attivo e NON basta: è l'OEM a decidere.
         *
         * Riletta a ogni chiamata, mai ricordata. La documentazione di OnePlus
         * dice che il sistema **riazzera da solo** questa impostazione — «OnePlus
         * randomly reverts Battery Optimization settings, requiring users to
         * periodically re-verify» — quindi un valore messo in cache all'avvio
         * sarebbe una promessa che scade senza avvisare.
         */
        result.put("batteryExempt", isBatteryExempt());
        /**
         * Chi ha fabbricato il telefono, perché i passi in più li decide lui.
         *
         * Su OnePlus/ColorOS l'esenzione non basta da sola: servono anche
         * l'avvio automatico e il blocco nei recenti, che stanno in menu del
         * produttore senza intent pubblico. La pagina non può indovinare: le
         * serve sapere davanti a quale telefono sta per poter dire i passi
         * giusti invece di quelli generici.
         */
        result.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        /**
         * E il MARCHIO, che non e' la stessa cosa.
         *
         * `MANUFACTURER` e' chi fabbrica, `BRAND` e' quello che il cliente
         * legge sulla scocca: un POCO espone `MANUFACTURER=Xiaomi` e
         * `BRAND=POCO`. Servono entrambi perche' un firmware particolare puo'
         * mettere il nome utile in uno solo dei due campi.
         *
         * NON si legge la versione della ROM (`ro.miui.ui.version.name` e
         * simili): sono interfacce non-SDK, ristrette da Android 9 in poi, che
         * possono sparire senza preavviso. La famiglia OEM basta a scegliere le
         * istruzioni; la versione no, e costerebbe una via d'accesso fragile.
         */
        result.put("brand", Build.BRAND == null ? "" : Build.BRAND.toLowerCase());
        call.resolve(result);
    }

    /** Vero quando Android ha smesso di sospendere questa app. */
    private boolean isBatteryExempt() {
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (power == null) return false;
        return power.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private String micState() {
        boolean granted = getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
        if (granted) return "granted";
        // The activity knows whether a rationale is owed, which is what tells a
        // first-time ask apart from a denial the user can still reverse.
        boolean rationale = getActivity() != null
            && getActivity().shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO);
        return rationale ? "prompt-with-rationale" : "prompt";
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Nothing to request: the only control is the app's notification
            // settings, so send the caller there instead of resolving a lie.
            call.resolve(new JSObject().put("state", "granted"));
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        call.resolve(new JSObject().put("state", statoPermesso("notifications")));
    }

    /**
     * ⭐⭐ CHIEDE uno dei quattro — col dialogo di sistema, non con un viaggio.
     *
     * ⛔ La stessa regola del calendario e della rubrica: chiedere costa un
     * tocco e la finestra compare sopra quello che la persona sta facendo;
     * mandarla a cercare un interruttore è la strada lunga. Le Impostazioni
     * restano per il caso in cui il dialogo non può più comparire — e quel caso
     * lo distingue `getPermissionState`, non un'ipotesi.
     *
     * ⛔ Risponde con lo STATO RILETTO, mai con «fatto»: è il sistema a sapere
     * cosa ha scelto la persona.
     */
    @PluginMethod
    public void requestRuntime(PluginCall call) {
        String alias = call.getString("alias", "");
        if (!conosciuto(alias)) {
            // Un alias che non conosciamo non è un incidente: è una riga che
            // questa schermata non sa chiedere, e chi chiama deve poterlo dire.
            call.resolve(new JSObject().put("state", "prompt").put("known", false));
            return;
        }
        requestPermissionForAlias(alias, call, "runtimeResult");
    }

    /** Sta in `RUNTIME_ALIASES`, cioè: questa schermata lo sa sia leggere che chiedere. */
    private static boolean conosciuto(String alias) {
        for (String noto : RUNTIME_ALIASES) {
            if (noto.equals(alias)) return true;
        }
        return false;
    }

    @PermissionCallback
    private void runtimeResult(PluginCall call) {
        String alias = call.getString("alias", "");
        call.resolve(new JSObject()
            .put("state", statoPermesso(alias))
            .put("known", true));
    }

    /**
     * The app's own page in system settings.
     *
     * There is no way to deep-link a single toggle, which is why the screen
     * shows numbered steps beside this button. Guarded because the docs are
     * explicit that a matching activity may not exist.
     */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception error) {
            // Never reject: a device without that screen is not a failure the
            // user can act on, and the row already tells them what to look for.
            call.resolve(new JSObject().put("opened", false));
        }
    }

    /** The notification channel screen, which is the useful one on Android 8+. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception error) {
            openAppSettings(call);
        }
    }

    /**
     * Chiede l'esenzione dal risparmio energetico — la casella che rende
     * funzionante tutto ciò che dura più di uno schermo acceso.
     *
     * Due intent, e la scelta fra i due non è arbitraria. La documentazione
     * Android ne descrive uno che apre il **dialogo diretto**
     * (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, un tocco) e uno che apre
     * la **lista di sistema** (`ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`,
     * dove l'app va cercata fra tutte). Il primo è riservato ai casi in cui
     * «the core function of the app is adversely affected», con «task
     * automation apps» fra quelli ammessi.
     *
     * TALOS ci sta dentro, e non per interpretazione: è misurato. Senza
     * esenzione una Deep Research muore tre volte su tre appena si blocca lo
     * schermo, e un download da 4 GB con lei. In più TALOS non passa dal Play
     * Store ([[distribution-off-play-store]]), quindi quella policy non ci
     * vincola comunque — ma la ragione per cui la rispetteremmo c'è lo stesso.
     *
     * Il secondo intent resta come rete: se il costruttore ha tolto il dialogo
     * diretto, meglio la lista di sistema con tre istruzioni accanto che un
     * pulsante che non fa niente.
     *
     * Non risponde MAI «concesso»: risponde «aperto». Quello che l'utente ha
     * scelto si legge da `state()` al ritorno, perché è il sistema a saperlo e
     * non noi — e una schermata che dicesse «fatto» senza verificare sarebbe
     * peggio di una che non chiede.
     */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        if (isBatteryExempt()) {
            call.resolve(new JSObject().put("opened", false).put("alreadyExempt", true));
            return;
        }
        JSObject result = new JSObject().put("alreadyExempt", false);
        try {
            @SuppressLint("BatteryLife")
            Intent direct = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            direct.setData(Uri.parse("package:" + getContext().getPackageName()));
            direct.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(direct);
            call.resolve(result.put("opened", true).put("route", "dialog"));
        } catch (Exception noDialog) {
            try {
                Intent list = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                list.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(list);
                call.resolve(result.put("opened", true).put("route", "list"));
            } catch (Exception noList) {
                // Nessuna delle due schermate esiste. Non è un errore su cui
                // l'utente possa agire, ed è la pagina a portare le istruzioni.
                call.resolve(result.put("opened", false).put("route", "none"));
            }
        }
    }

    private Context context() {
        return getContext();
    }

    /**
     * ⛔⛔⛔ `getPermissionState` PUÒ TORNARE NULL, e su un OnePlus 13 lo fa.
     *
     * Il 18 agosto TALOS moriva all'avvio su PJZ110 (Android 16), e il log era
     * inequivocabile:
     *
     *     FATAL EXCEPTION: CapacitorPlugins
     *     Caused by: java.lang.NullPointerException
     *       at com.getcapacitor.Bridge.getPermissionStates
     *       at ai.talos.TalosDevicePermissionsPlugin.state
     *
     * Quattro punti di questo file scrivevano `getPermissionState(alias).toString()`
     * senza rete. Uno solo basta: il plugin muore su un thread di Capacitor, e con
     * lui l'app — prima ancora che la persona veda qualcosa.
     *
     * ⛔ E non è «un telefono strano»: e' l'API che dichiara di poter tornare
     * null, e noi che non lo leggevamo. Sul Pad non capitava, e sul Pad avevamo
     * provato — che e' esattamente il modo in cui un difetto arriva a un'altra
     * persona.
     *
     * ## ⇒ E la risposta giusta non e' «negato»
     *
     * Dire «denied» a un permesso di cui non si conosce lo stato e' inventare un
     * fatto: la scheda mostrerebbe un pulsante «Consenti» su qualcosa che magari
     * e' gia' concesso, oppure nasconderebbe una funzione che invece c'e'.
     *
     * `unknown` e' il terzo stato che questo progetto usa dappertutto: chi legge
     * sa che non lo sappiamo, e puo' chiedere invece di dedurre.
     */
    private String statoPermesso(String alias) {
        try {
            PermissionState stato = getPermissionState(alias);
            return stato == null ? "unknown" : stato.toString();
        } catch (RuntimeException nonDichiarato) {
            /*
             * ⛔ Anche un alias che Capacitor non conosce finisce qui invece di
             * uccidere il processo. Un permesso che non sappiamo leggere e' un
             * permesso IGNOTO, non un'app che si chiude.
             */
            return "unknown";
        }
    }
}
