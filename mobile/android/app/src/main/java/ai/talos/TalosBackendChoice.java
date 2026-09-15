package ai.talos;

/**
 * Which engine runs the model, and what earns it the right.
 *
 * On Android a GPU backend is a lottery, and that is measured rather than
 * feared. With llama.cpp's Vulkan backend, Adreno devices frequently fail to
 * load a model at all and Mali loads it and runs slowly; the outcome turns on
 * the DRIVER BUILD rather than the chip, which is why the community answer for
 * Adreno is a different backend entirely. Every competitor ships an "enable
 * GPU" switch and lets the user discover which kind of phone they own.
 *
 * So this encodes Zethos's third principle — evidence before claims — as
 * something executable: a backend is offered ONLY after it has produced a
 * correct answer on THIS device under THIS driver. CPU is the floor and needs
 * no proof, because it is the reference every other backend is measured
 * against, and because an app that concludes nothing works is an app that does
 * nothing.
 *
 * Pure: no JNI, no Android. The rules are provable before a single line of
 * native code exists, which is the point — they are what the native layer will
 * be asked to obey.
 */
public final class TalosBackendChoice {

    public static final String CPU = "cpu";
    public static final String VULKAN = "vulkan";
    public static final String OPENCL = "opencl";

    /**
     * ⭐⭐⭐ L'NPU Hexagon — la terza famiglia, e dal 11/09/2026 e' misurabile.
     *
     * ⛔ Il nome e' la FAMIGLIA, non il registry: il motore chiama il suo
     * registry {@code HTP} e i suoi dispositivi {@code HTP0}, {@code HTP1}.
     * Qui dentro vive il vocabolario della decisione, che e' un'altra cosa —
     * la stessa separazione che gia' vale per {@code opencl} contro
     * {@code OpenCL}.
     */
    public static final String HEXAGON = "hexagon";

    /**
     * How much faster a GPU's time to first token has to be before it is worth
     * the risk.
     *
     * ⛔⛔ Not decode tokens/second — that was the wrong quantity, measured wrong
     * on 2026-08-20 and corrected here on 2026-08-21 (Fase 7(b),
     * `DECISIONE-0.1.17.md`). TALOS's own abort cure made OpenCL decode
     * indistinguishable from CPU (16.43 -> 16.43 tok/s on this device, no
     * change), and after a long prompt GPU decode measured SLOWER than CPU
     * (8.07 vs 8.51). Decode was never the axis where GPU earned anything.
     *
     * The axis that moved is prefill latency — what a person actually waits
     * through before the first word appears. Measured same-day, same device: a
     * 2048-token prompt on the CPU floor, cold, takes 43.2s; the same prompt on
     * OpenCL with the abort cure takes 11.0s even in its WORST thermal state —
     * right after ten minutes of sustained load, no cooldown. That is roughly
     * 4x, not the single-digit percent decode throughput ever showed. This
     * margin asks for half of that: a real, generous margin of safety, because
     * the same driver that gives a fast prefill is the driver that gives the
     * load failures and the wrong answers, and the CPU path always works.
     */
    static final double WORTHWHILE_MARGIN = 2.0;

    private TalosBackendChoice() {}

    public enum Outcome {
        /** Ran and produced the answer the harness expected. */
        CORRECT,
        /** Failed to load, crashed, or produced the wrong answer. All the same. */
        FAILED,
    }

    /** What was observed, on one device, under one driver. */
    public static final class Evidence {
        public final String backend;
        /**
         * Driver and version together.
         *
         * The identity that matters is the driver BUILD, not the GPU model: the
         * same chip passes under one and fails under the next, which is exactly
         * why evidence has to be scoped to it.
         */
        public final String driver;
        public final Outcome outcome;
        /**
         * Time to first token, in milliseconds, on a representative long
         * prompt. Lower is better — the opposite direction from the decode
         * throughput this field replaced.
         */
        public final long ttftMs;
        /**
         * ⛔⛔ IL SECONDO NUMERO — quanto scrive, non quanto ci mette a partire.
         *
         * Banco sul Pad dell'owner, 11/09/2026, otto modelli da 1 a 4 miliardi
         * sui tre motori: **chi vince la lettura del prompt non e' chi vince la
         * scrittura della risposta**, e non per poco.
         *
         * <pre>
         *   Llama-3.2 3B Q4_0   lettura  CPU 139  GPU 361  NPU 1475   ← NPU, 4,1x
         *                       scrittura CPU 21,5 GPU 21,0 NPU 16,8  ← CPU
         * </pre>
         *
         * Sette modelli su otto cambiano vincitore fra le due colonne. Con un
         * numero solo la decisione non puo' che essere giusta a meta': si
         * registrano entrambi, e chi decide sa qual e' la forma del lavoro che
         * ha davanti.
         *
         * ⛔ {@code 0} vale «non misurato», non «lentissimo»: le prove scritte
         * prima dell'11/09/2026 non portano questo campo, e leggerle come zero
         * token al secondo le farebbe sembrare tutte guaste.
         */
        public final double tokensPerSecond;

        public Evidence(String backend, String driver, Outcome outcome, long ttftMs) {
            this(backend, driver, outcome, ttftMs, 0);
        }

        public Evidence(String backend, String driver, Outcome outcome,
                        long ttftMs, double tokensPerSecond) {
            this.backend = backend;
            this.driver = driver;
            this.outcome = outcome;
            this.ttftMs = ttftMs;
            this.tokensPerSecond = tokensPerSecond;
        }
    }

    public static final class Decision {
        public final String backend;
        /**
         * Why, in a word the interface can explain: `faster`, `margin`,
         * `unproven`, `hot`. A backend chosen for reasons nobody can state is a
         * backend nobody can debug.
         */
        public final String reason;

        Decision(String backend, String reason) {
            this.backend = backend;
            this.reason = reason;
        }
    }

    /** Heat is where GPU drivers fail, so a struggling phone goes to the floor. */
    private static boolean struggling(String thermal) {
        return "severe".equals(thermal) || "critical".equals(thermal);
    }

    private static Evidence find(Evidence[] evidence, String backend, String driver) {
        for (Evidence candidate : evidence) {
            // Evidence from another driver is evidence about another machine.
            if (candidate.backend.equals(backend) && candidate.driver.equals(driver)) return candidate;
        }
        return null;
    }

    /**
     * Choose, with a reason.
     *
     * @param driver the driver fingerprint this phone is running RIGHT NOW.
     *     Evidence gathered under any other is ignored in both directions: a
     *     backend that passed must earn its place again, and one that failed
     *     deserves another chance.
     */
    public static Decision choose(String driver, String thermal, Evidence[] evidence) {
        return choose(driver, thermal, evidence, false);
    }

    /**
     * ⭐⭐⭐ Come sopra, ma sapendo se l'NPU puo' mangiare QUESTO modello.
     *
     * ## Il difetto, misurato l'11/09/2026 e vissuto a schermo
     *
     * Il sondaggio sul Pad dell'owner aveva appena giudicato **tutti e tre** i
     * motori CORRETTI, con questi tempi al primo token:
     *
     * <pre>
     *   cpu       VALID   ttft 36.530 ms
     *   opencl    VALID   ttft  6.003 ms
     *   hexagon   VALID   ttft  2.002 ms      ← diciotto volte il pavimento
     * </pre>
     *
     * E l'automatico sceglieva **la GPU**, perche' l'elenco dei candidati qui
     * sotto conteneva `VULKAN` e `OPENCL` e basta: l'NPU non era scartata, era
     * **invisibile**. Owner, 11/09: «con automatico dovrebbe farlo
     * automaticamente». Non era la decisione a essere sbagliata — era l'elenco
     * di chi poteva partecipare.
     *
     * ⛔ Stessa forma di `funzione-con-i-test-e-nessun-chiamante`: l'NPU era
     * spedita, caricata, sondata e registrata — e non poteva vincere.
     *
     * ## ⛔⛔ Perche' serve un permesso, e non basta aggiungerla all'elenco
     *
     * L'evidenza e' registrata per **driver**, cioe' per telefono; il formato
     * dei pesi invece cambia **a ogni modello**. Stesso Qwen3-4B, stesso
     * giorno, stesso Pad:
     *
     * <pre>
     *   Q4_0     NPU  lettura 1126 t/s
     *   Q4_K_M   NPU  lettura   55,7        ← venti volte piu' piano
     *            GPU  lettura  206          ← e quattro volte sopra l'NPU
     * </pre>
     *
     * Una prova vinta su un Q4_0 direbbe «hexagon, ed e' il piu' veloce» anche
     * mentre si apre un Q4_K_M, dove sarebbe la scelta peggiore possibile. ⇒
     * chi chiama porta il permesso, letto dall'intestazione del file.
     *
     * ⛔ E il predefinito e' **no**: la variante a tre argomenti passa
     * {@code false}. Un chiamante che non sa che formato sta aprendo non puo'
     * autorizzare l'NPU per distrazione.
     *
     * ## ⛔ Perche' la regola NON viene dalla letteratura
     *
     * [«When NPUs Are Not Always Faster: A Stage-Level Analysis of Mobile LLM
     * Inference», arXiv 2605.27435](https://arxiv.org/html/2605.27435), letto
     * l'11/09/2026, conclude l'**opposto** di cio' che questo Pad misura: per
     * loro la CPU batte l'NPU in lettura di 1,27-1,62x, e l'NPU vince la
     * scrittura di 1,05-1,20x. Da noi, su otto modelli e cinque architetture,
     * l'NPU vince la lettura da 2,3x a 4,4x e perde la scrittura sette volte su
     * otto.
     *
     * Non e' una smentita di nessuno dei due: e' un'altra macchina, un altro
     * runtime NPU, un'altra versione di driver. ⇒ **Una regola scritta a mano
     * a partire da un paper avrebbe spento su questo telefono il motore piu'
     * veloce che ha.** La stessa strada la prende lo stato dell'arte quando
     * puo': [HeRo, DAC '26, arXiv 2603.01661](https://arxiv.org/abs/2603.01661)
     * costruisce «profiling-based performance models for each sub-stage and
     * model-PU configuration» e ne cava fino a 10,94x. Qui il profilo lo
     * facciamo sul telefono della persona, che e' l'unico che conta.
     *
     * @param npuAdmissible vero solo se i pesi del modello che si sta per
     *     aprire sono in un formato che l'NPU esegue nativamente (Q4_0, Q8_0,
     *     MXFP4). In dubbio, falso.
     */
    public static Decision choose(String driver, String thermal, Evidence[] evidence,
                                  boolean npuAdmissible) {
        if (struggling(thermal)) return new Decision(CPU, "hot");

        Evidence reference = find(evidence, CPU, driver);
        long baseline = reference != null && reference.outcome == Outcome.CORRECT
                ? reference.ttftMs
                : 0;

        // Fastest TTFT wins among the proven candidates — lower is better here.
        Evidence best = null;
        String[] candidati = npuAdmissible
                ? new String[] { VULKAN, OPENCL, HEXAGON }
                : new String[] { VULKAN, OPENCL };
        for (String backend : candidati) {
            Evidence candidate = find(evidence, backend, driver);
            if (candidate == null || candidate.outcome != Outcome.CORRECT) continue;
            if (best == null || candidate.ttftMs < best.ttftMs) best = candidate;
        }

        if (best == null) return new Decision(CPU, "unproven");
        // With no measured reference there is nothing to be faster THAN, so the
        // margin cannot be judged and the floor wins.
        if (baseline <= 0) return new Decision(CPU, "unproven");
        // The candidate's TTFT must beat the reference's by the full margin —
        // e.g. at 2.0x it must be at most half the reference's time.
        if ((double) baseline < (double) best.ttftMs * WORTHWHILE_MARGIN) return new Decision(CPU, "margin");
        return new Decision(best.backend, "faster");
    }

    /**
     * Whether this backend is worth proving on this device.
     *
     * A backend that failed here is not tried again: the user whose phone froze
     * once does not get to discover it a second time. A driver update lifts
     * that, because it is a different machine.
     */
    public static boolean shouldProbe(String backend, String driver, Evidence[] evidence) {
        return find(evidence, backend, driver) == null;
    }

    /**
     * And a phone already in trouble is not probed at all.
     *
     * Proving costs a real generation — the whole point is that it is real —
     * and the worst moment to spend one is on a device that is already hot.
     */
    public static boolean shouldProbeNow(String thermal) {
        return !struggling(thermal);
    }

    /**
     * How many layers a decision means for the native engine.
     *
     * ⛔ Fase 7(c): {@code -1} moves every layer (the same value the research
     * harness already uses for "all of it"); the CPU decision is {@code 0},
     * which is what `nativeOpen` has always defaulted to. This is the one
     * place a {@link Decision} becomes the number the JNI boundary actually
     * reads — extracted so the wiring in the plugin is a one-line call, not
     * logic duplicated where it cannot be unit-tested without a device.
     */
    public static int gpuLayers(Decision decision) {
        return CPU.equals(decision.backend) ? 0 : -1;
    }

    /**
     * ⭐⭐⭐ E DOVE — il nome del registry da passare a {@code open()}.
     *
     * ⛔⛔ Perche' {@link #gpuLayers} da solo non basta piu'. Finche' l'unico
     * acceleratore spedito era OpenCL, «muovi tutti gli strati» non aveva
     * ambiguita': c'era un solo posto dove potevano andare. Dall'11/09/2026 su
     * questo Pad ci sono **due** registry di offload — `OpenCL` e `HTP` — e
     * `-1` senza un nome lascia scegliere all'ordine con cui le librerie
     * native si sono caricate. Cioe' esattamente la lotteria che
     * {@link ai.talos.research.TalosBackendTarget} esiste per togliere di
     * mezzo, e che il sondaggio evita gia' per l'NPU nominando `HTP`.
     *
     * ⇒ Una decisione che dice QUANTI senza dire DOVE non e' una decisione:
     * e' un sorteggio con un'etichetta sopra.
     *
     * ⛔ La CPU torna stringa vuota, e vuoto significa «nessuna richiesta»
     * dall'altra parte del ponte ({@code call.getString("backend", "")}) —
     * non «CPU». Con zero strati non c'e' niente da nominare.
     *
     * ⛔ I nomi sono quelli del MOTORE, non i nostri: `ggml_backend_reg_name`
     * dice `OpenCL` e `HTP`, mentre qui dentro le famiglie si chiamano
     * `opencl` e `hexagon`. La stessa separazione dichiarata al campo
     * {@link #HEXAGON}, e questo e' l'unico posto dove i due vocabolari si
     * toccano.
     */
    public static String registryOf(Decision decision) {
        if (OPENCL.equals(decision.backend)) return "OpenCL";
        if (VULKAN.equals(decision.backend)) return "Vulkan";
        if (HEXAGON.equals(decision.backend)) return "HTP";
        return "";
    }
}
