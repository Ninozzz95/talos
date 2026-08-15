package ai.talos;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ⭐⭐ IL CAMPANELLO DELLA BARRA: «adesso puoi disegnarmi».
 *
 * ## ⛔ Il difetto che questo file esiste per uccidere
 *
 * Owner 2026-08-11, con un video dello schermo: «c'è tipo un lampeggio nero poco
 * prima che la barra entra… si trova solo all'inizio, deve sparire».
 *
 * Misurato sui fotogrammi del suo video (61,5 al secondo): dal 132° al 148° lo
 * schermo diventa un rettangolo pieno `#1e1f22` — **455 ms**, con solo il
 * pallino sopra. E `#1e1f22` non è un colore di sistema: è
 * `--talos-background`, il fondo scuro della NOSTRA app.
 *
 * ⇒ Non era una transizione e non era la ROM. Alla PRIMA apertura la WebView
 * dipinge la pagina con il suo fondo normale, e solo dopo il JS la rende
 * trasparente: in mezzo c'è mezzo secondo in cui l'app sotto è cancellata. La
 * seconda volta non succede perché l'activity è `singleTask` e resta viva —
 * ecco perché il lampo si vede «solo all'inizio».
 *
 * ## Perché un campanello e non un colore più chiaro
 *
 * Si poteva dipingere quel frame di un colore meno vistoso. Sarebbe stato un
 * cerotto: il lampo resterebbe, solo più educato. La cura vera è **non
 * disegnare affatto** finché il primo frame non è già quello giusto — così non
 * c'è nessun fotogramma da nascondere, su nessun tema e su nessuna ROM.
 *
 * Il lato web suona questo campanello quando ha finito di rendersi trasparente
 * (`lib/barra/avvia.ts`); l'activity fino ad allora tiene fermo il disegno.
 */
@CapacitorPlugin(name = "TalosBarra")
public class TalosBarraPlugin extends Plugin {

    /**
     * La barra è pronta a essere vista.
     *
     * ⛔ Non fa nulla se non siamo dentro la barra: la stessa app web gira anche
     * a schermo intero, e un campanello suonato lì non deve poter sbloccare o
     * bloccare niente.
     */
    @PluginMethod
    public void pronta(PluginCall call) {
        if (getActivity() instanceof TalosBarraActivity) {
            ((TalosBarraActivity) getActivity()).laBarraEPronta();
        }
        call.resolve();
    }

    /**
     * ⭐⭐ IL TESTO DELLO SCHERMO — la porta dichiarata dietro l'occhio.
     *
     * Owner 2026-08-11: «icona occhio a cosa serve? A vedere elementi su schermo
     * giusto? Ma se chiedo "cosa vedi" mi risponde che non vede nulla».
     *
     * Il numero nella spia era vero e il contenuto non arrivava a nessuno: il
     * servizio contava i nodi e buttava la struttura. Questa è la porta che
     * mancava — dichiarata, perché di là c'è l'occhio che la persona può
     * spegnere con un tocco.
     *
     * ⛔ Il testo si consegna UNA VOLTA SOLA e si azzera (`prendiIlTesto`): lo
     * schermo di un'altra app resta in memoria il tempo di attraversare il
     * ponte, non finché a qualcuno serve.
     */
    @PluginMethod
    public void contestoSchermo(PluginCall call) {
        com.getcapacitor.JSObject esito = new com.getcapacitor.JSObject();
        esito.put("testo", ai.talos.agent.TalosAssistente.prendiIlTestoDiSchermo());
        esito.put("nodi", ai.talos.agent.TalosAssistente.quantiNodiVisti());
        /*
         * ⭐⭐⭐ E L'INDIRIZZO DELLA PAGINA — rilievo #4.
         *
         * Il testo dello schermo è quello VISIBILE: su una pagina lunga è il
         * primo schermo e basta. L'indirizzo invece apre tutto: col link il
         * modello può leggere l'articolo intero con `web_read` invece di
         * rispondere sul frammento che si vede.
         *
         * ⛔ Lo consegna Chrome nell'`AssistContent`, non lo ricostruiamo noi
         * dai pixel della barra degli indirizzi. Vuoto quando non c'è — in
         * incognito Chrome non lo dà, di proposito.
         */
        esito.put("pagina", ai.talos.agent.TalosAssistente.indirizzoDellaPagina());
        call.resolve(esito);
    }

    /**
     * ⭐⭐ APRE TALOS INTERO SULLA CONVERSAZIONE CHE STAVI FACENDO.
     *
     * ## ⛔ Il difetto, e la frase falsa che lo nascondeva
     *
     * Owner 2026-08-11: «quando faccio "apri in TALOS" si deve aprire la chat
     * aggiornata col testo che ho inviato, o comunque tutta la conversazione».
     *
     * Il codice apriva l'app col suo intent di lancio, e un commento diceva: «la
     * chat è già la stessa, per costruzione: non c'è niente da trasferire». Era
     * FALSO, ed è il tipo di frase che tiene in piedi un difetto per settimane.
     * La barra vive in un'altra Activity, quindi in un'altra **WebView**: è un
     * altro contesto JavaScript, con un'altra istanza del negozio della chat. In
     * comune c'è solo il database. Aprendo l'app senza dirle niente, quella
     * riapriva la conversazione che aveva lei — non la tua.
     *
     * ⇒ Qui si passa l'id della sessione nell'indirizzo, e l'app intera la apre
     * leggendola da disco. Il dato viaggia dove viaggiano già i modi della barra:
     * nell'URI, che è l'unico canale che sopravvive a due processi web diversi.
     *
     * ⛔ `CLEAR_TOP | SINGLE_TOP`: se TALOS è già aperto da qualche parte deve
     * TORNARE in cima e ricevere l'indirizzo in `onNewIntent`, non impilare una
     * seconda copia di sé stesso sopra la prima.
     */
    /**
     * ⛔⛔ CONSEGNARE L'INTENT NON È PORTARE L'APP DAVANTI.
     *
     * MISURATO sul Pad il 2026-08-12, quattro giri con la sonda in
     * `consegna.ts`: `push=ok rotta=chat` ogni volta, e `mCurrentFocus` sempre
     * `com.android.launcher`. Quattro cure provate e scartate — `App.exitApp()`,
     * `finish()` subito, a +400 ms, e prima del lancio.
     *
     * `dumpsys activity recents` ha escluso le spiegazioni facili: i task sono
     * separati e vivi (`#1723 A=ai.talos.dev`, `#1724 I=TalosBarraActivity`).
     * ⇒ `startActivity` **consegna** l'intent ma non porta il task in cima: su
     * questa ROM il permesso di lanciare dal fondo vive finché la finestra della
     * barra è visibile (`BAL_ALLOW_VISIBLE_WINDOW` nei log) e decade proprio
     * mentre la barra si chiude.
     *
     * ⇒ Si chiede al sistema di portare avanti il NOSTRO task, esplicitamente.
     * `getAppTasks()` restituisce soltanto i nostri, quindi non c'è modo di
     * toccare l'app di qualcun altro nemmeno per errore.
     *
     * ⛔ Non lancia mai: se la ROM lo nega, l'intent è comunque stato consegnato
     * e la chat è comunque quella giusta — si perde il primo piano, non il
     * lavoro. Un'eccezione qui trasformerebbe un difetto di presentazione in una
     * barra che non risponde.
     */
    private void portaAvantiTalos() {
        try {
            final android.app.ActivityManager gestore =
                (android.app.ActivityManager) getContext()
                    .getSystemService(android.content.Context.ACTIVITY_SERVICE);
            if (gestore == null) return;
            for (android.app.ActivityManager.AppTask task : gestore.getAppTasks()) {
                final android.app.ActivityManager.RecentTaskInfo info = task.getTaskInfo();
                if (info == null || info.baseIntent == null || info.baseIntent.getComponent() == null) continue;
                // ⛔ Il task della BARRA no: portarlo avanti rimetterebbe in cima
                // proprio la finestra da cui stiamo uscendo.
                final String classe = info.baseIntent.getComponent().getClassName();
                if (classe.contains("TalosBarraActivity")) continue;
                task.moveToFront();
                return;
            }
        } catch (Exception ignorata) {
            // Vedi sopra: il primo piano è un di più, la consegna è già avvenuta.
        }
    }

    @PluginMethod
    public void apriLaChat(PluginCall call) {
        final String sessione = call.getString("sessione");
        final android.content.Intent apri = new android.content.Intent(
            android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse("talos://chat" + (sessione == null ? "" : "?sessione=" + android.net.Uri.encode(sessione))),
            getContext(),
            MainActivity.class);
        apri.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
            | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
        com.getcapacitor.JSObject esito = new com.getcapacitor.JSObject();
        try {
            /*
             * ⛔⛔ PRIMA SI CHIUDE LA BARRA, POI SI LANCIA — e l'ordine è la cura.
             *
             * MISURATO sul Pad il 2026-08-12, in tre giri: con `startActivity`
             * seguito da `finish()` (subito o dopo 400 ms) la sonda diceva
             * `push=ok rotta=chat` e `mCurrentFocus` restava
             * `com.android.launcher`. I task SONO separati — `dumpsys activity
             * recents` mostra `#1721 A=ai.talos.dev` per l'app e `#1722
             * I=TalosBarraActivity` per la barra — quindi non era un problema di
             * affinity: era che la barra moriva DOPO, e chiudendosi la ROM
             * risaliva al task che le stava sotto, cioè il launcher da cui
             * l'assistente era stato invocato.
             *
             * ⇒ Si esce prima, così l'ultimo movimento è l'ingresso dell'app e
             * non l'uscita della barra. `startActivity` parte dal Context
             * dell'applicazione e porta già `FLAG_ACTIVITY_NEW_TASK`: non ha
             * bisogno che l'Activity chiamante sia ancora viva.
             */
            getContext().startActivity(apri);
            portaAvantiTalos();
            /*
             * ⛔ La barra si chiude PER ULTIMA, e solo la sua finestra.
             *
             * `App.exitApp()` dal JS era `finishAffinity()`: chiudeva l'intero
             * task, MainActivity compresa. Qui muore una finestra sola, e dopo
             * che il task dell'app è già davanti.
             */
            final android.app.Activity finestra = getActivity();
            if (finestra != null) finestra.finish();
            esito.put("aperta", true);
        } catch (Exception errore) {
            // ⛔ Non si lancia: chi chiama sta rispondendo a un tocco, e
            // un'eccezione lì diventa una barra che non dice niente.
            esito.put("aperta", false);
        }
        call.resolve(esito);
    }
}
