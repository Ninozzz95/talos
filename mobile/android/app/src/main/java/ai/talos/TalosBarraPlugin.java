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
}
