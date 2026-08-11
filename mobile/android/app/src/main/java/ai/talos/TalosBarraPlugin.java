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
            getContext().startActivity(apri);
            esito.put("aperta", true);
        } catch (Exception errore) {
            // ⛔ Non si lancia: chi chiama sta rispondendo a un tocco, e
            // un'eccezione lì diventa una barra che non dice niente.
            esito.put("aperta", false);
        }
        call.resolve(esito);
    }
}
