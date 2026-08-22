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
 * Immutabile per costruzione: ogni campo è final, nessun setter. Un profilo
 * non si aggiorna — se ne scrive uno nuovo, e {@link TalosLocalProfileStore}
 * decide se sostituisce quello vecchio (stessa identità, stesso backend).
 */
public final class TalosLocalProfile {

    public final TalosLocalProfileIdentity identity;
    public final String backendRegistry;
    /** Nullo per la CPU: nessun dispositivo di offload da nominare. */
    public final String backendDevice;
    public final TalosBackendChoice.Outcome outcome;
    public final long ttftMs;
    public final long measuredAtMs;

    public TalosLocalProfile(TalosLocalProfileIdentity identity, String backendRegistry,
                              String backendDevice, TalosBackendChoice.Outcome outcome,
                              long ttftMs, long measuredAtMs) {
        this.identity = identity;
        this.backendRegistry = backendRegistry == null ? "" : backendRegistry;
        this.backendDevice = backendDevice;
        this.outcome = outcome;
        this.ttftMs = ttftMs;
        this.measuredAtMs = measuredAtMs;
    }

    /** Stessa identità, stesso backend, stesso dispositivo — la stessa prova, misurata di nuovo. */
    boolean samePlace(TalosLocalProfile other) {
        return identity.equals(other.identity)
                && backendRegistry.equals(other.backendRegistry)
                && java.util.Objects.equals(backendDevice, other.backendDevice);
    }
}
