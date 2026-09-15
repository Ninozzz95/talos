package ai.talos;

/**
 * P0-2 — una misura qualificata, immutabile una volta scritta.
 *
 * ⛔ Non è ancora il payload completo che il piano sorgente disegna (§7.3,
 * `TalosLocalPerformanceProfileV1`): quello porta quindici campi di misura
 * (pp512, pp2048, tg64, cancelPrefillP95Ms, sustainedSlope, ...), un
 * dizionario di configurazione, un verdetto a tre stati. Questo blocco
 * (PR 3 del piano: "ProfileIdentity, immutable qualified profile,
 * engine/model/driver invalidation, production reads profile only") non
 * chiede quelle quindici misure — le chiede il motore di selezione che le
 * consumerà (P0-3, P1-5), e costruirle qui senza un consumatore reale
 * sarebbe scrivere un harness di benchmark più grande di quanto questo
 * blocco possa verificare sul dispositivo. Il payload qui è lo stesso di
 * {@link TalosBackendChoice.Evidence} — outcome + TTFT — sotto
 * un'{@link TalosLocalProfileIdentity} molto più ricca. Allargare il
 * payload resta il passo successivo esplicito, non questo.
 *
 * ⛔ P0-3 aggiunge {@link #qualificationLevel}: non un allargamento del
 * payload di misura, un'etichetta su CHI ha misurato — la distinzione
 * Q0/Q1/Q2 che CR-06 rende obbligatoria.
 *
 * Immutabile per costruzione: ogni campo è final, nessun setter. Un profilo
 * non si aggiorna — se ne scrive uno nuovo, e {@link TalosLocalProfileStore}
 * decide se sostituisce quello vecchio (stessa identità, stesso backend).
 */
public final class TalosLocalProfile {

    /**
     * P0-3 — QUALE livello ha misurato questo profilo, non solo COSA dice.
     * Il piano sorgente (CR-06) rende Q0/Q1/Q2 una distinzione obbligatoria
     * proprio perché confondere i livelli è l'anti-pattern che vieta: un
     * profilo Q0 (uno smoke da sedici token, mai un tetto di misura reale)
     * letto come se fosse un Q1 qualificato produrrebbe una decisione di
     * backend su una prova che non era pensata per reggerla.
     *
     * ⛔ Solo {@code Q1} scrive qui oggi — {@link TalosLocalSmokeCheck} (Q0)
     * non produce un profilo per progetto («non produce "massimo profilo" se
     * la campagna è troppo corta», piano sorgente §8.3), e Q2 (il banco di
     * ricerca) resta un androidTest, irraggiungibile da un APK di
     * produzione. Il campo esiste comunque adesso, non quando arriverà un
     * secondo scrittore: uno schema che aggiunge silenziosamente un
     * discriminante dopo che i dati esistono già è uno schema che rompe la
     * lettura di ciò che c'era prima.
     */
    public enum Level { Q0, Q1, Q2 }

    public final TalosLocalProfileIdentity identity;
    public final String backendRegistry;
    /** Nullo per la CPU: nessun dispositivo di offload da nominare. */
    public final String backendDevice;
    public final TalosBackendChoice.Outcome outcome;
    public final long ttftMs;
    public final long measuredAtMs;
    public final Level qualificationLevel;
    /**
     * P1-5 — il pezzo che mancava per il selettore break-even (design.md
     * §21): {@code ttftMs} da solo basta per giudicare correttezza e un
     * primo token, ma non per stimare quanto costerebbe un OUTPUT lungo su
     * un profilo mai provato per davvero. Già calcolato oggi da
     * {@link TalosBenchmarkHarness#judge} come {@code tokensPerSecond} —
     * SOLO salvato prima d'ora, mai scritto qui: zero nuova strumentazione.
     *
     * ⛔ {@code -1} = non misurato, MAI zero — un profilo a "0 token/s"
     * letto alla lettera bloccherebbe il selettore su una divisione che
     * mente. Le righe scritte prima di questo blocco non hanno questo
     * campo: {@code optDouble} in {@link TalosLocalProfileStore} le legge
     * con questa stessa sentinella, non un numero indovinato.
     */
    public final double decodeTokPerSec;

    /**
     * ⭐⭐⭐ D-53 — LE DUE MISURE CHE MANCAVANO, e senza le quali «chi vince»
     * cambia a seconda della domanda.
     *
     * Banco sul Pad dell'owner, 11/09/2026, otto modelli: chi vince la
     * LETTURA del prompt perde la SCRITTURA su sette modelli su otto
     * (`LFM2.5`: NPU legge a 1.621 t/s ma scrive a 15,4; la GPU legge a 445 e
     * scrive a 25,9). Con `ttftMs` solo — misurato su UN prompt fisso da
     * 2.637 token — il selettore trattava la lettura come un costo costante,
     * e un costo costante non distingue una domanda di dieci token da un
     * contesto di tremila.
     *
     * `prefillTokPerSec` e' la lettura come VELOCITA' (token nuovi al secondo
     * nel prefill del sondaggio), cosi' `Prefill(p, prompt) = prompt / pp` per
     * qualunque prompt. `openMs` e' quanto e' costato aprire il modello su
     * questo motore — su GPU sono decine di secondi di caricamento dei buffer
     * (§5 del ledger), sull'NPU tre.
     *
     * ⛔ `-1` vale «non misurato»: i profili scritti prima di oggi non li
     * hanno, e leggerli come zero farebbe sembrare infinita la lettura e
     * gratis l'apertura. Chi decide torna al metro vecchio quando mancano.
     *
     * ⛔ Nessun nome di modello entra in questa decisione: e' la stessa
     * formula per qualunque GGUF, con i numeri di QUEL file su QUESTO telefono
     * — e' cio' che «motore universale» vuol dire.
     */
    public final double prefillTokPerSec;
    public final long openMs;

    public TalosLocalProfile(TalosLocalProfileIdentity identity, String backendRegistry,
                              String backendDevice, TalosBackendChoice.Outcome outcome,
                              long ttftMs, long measuredAtMs, Level qualificationLevel,
                              double decodeTokPerSec) {
        this(identity, backendRegistry, backendDevice, outcome, ttftMs, measuredAtMs,
                qualificationLevel, decodeTokPerSec, -1, -1);
    }

    public TalosLocalProfile(TalosLocalProfileIdentity identity, String backendRegistry,
                              String backendDevice, TalosBackendChoice.Outcome outcome,
                              long ttftMs, long measuredAtMs, Level qualificationLevel,
                              double decodeTokPerSec, double prefillTokPerSec, long openMs) {
        this.identity = identity;
        this.backendRegistry = backendRegistry == null ? "" : backendRegistry;
        this.backendDevice = backendDevice;
        this.outcome = outcome;
        this.ttftMs = ttftMs;
        this.measuredAtMs = measuredAtMs;
        this.qualificationLevel = qualificationLevel == null ? Level.Q1 : qualificationLevel;
        this.decodeTokPerSec = decodeTokPerSec;
        this.prefillTokPerSec = prefillTokPerSec;
        this.openMs = openMs;
    }

    /** Stessa identità, stesso backend, stesso dispositivo — la stessa prova, misurata di nuovo. */
    boolean samePlace(TalosLocalProfile other) {
        return identity.equals(other.identity)
                && backendRegistry.equals(other.backendRegistry)
                && java.util.Objects.equals(backendDevice, other.backendDevice);
    }
}
