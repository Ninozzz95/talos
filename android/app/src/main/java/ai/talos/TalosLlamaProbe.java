package ai.talos;

/**
 * Cosa significa che un backend ha dato la risposta GIUSTA.
 *
 * {@link TalosBenchmarkHarness} pretende un booleano — `answerCorrect` — e lo
 * controlla per primo, perché un backend veloce e sbagliato non è veloce, è
 * rotto. Questa classe è la definizione di quel booleano, e la definizione non
 * è ovvia.
 *
 * Non è «il modello ha risposto bene»: un modello da 135 milioni di parametri
 * sbaglia le domande e non è colpa del backend. È «questo backend ha prodotto
 * LO STESSO testo della CPU», che è la cosa che i driver GPU rotti su Android
 * non riescono a fare — restituiscono spazzatura plausibile invece di fallire.
 * La CPU è il riferimento e non deve dimostrare niente, esattamente come dice
 * {@link TalosBackendChoice}.
 *
 * Pura: nessun JNI, nessun Android. La regola si dimostra sulla JVM prima che
 * esista un telefono che la debba obbedire.
 */
public final class TalosLlamaProbe {

    /**
     * Quanti caratteri del confronto contano.
     *
     * Non tutto il testo, e il motivo è aritmetico: backend diversi sommano in
     * ordine diverso, quindi due esecuzioni entrambe corrette divergono prima o
     * poi anche con campionamento greedy. Una divergenza al primo token è un
     * driver rotto; una al centesimo è la virgola mobile. Confrontare tutto
     * scarterebbe backend sani, confrontare un carattere accetterebbe quelli
     * rotti.
     */
    static final int COMPARED_PREFIX = 48;

    private TalosLlamaProbe() {}

    /**
     * ⛔⛔⛔ QUANTO PREFILL METTERE DAVANTI ALLA DOMANDA — e perché senza questo
     * la GPU non poteva vincere su NESSUN telefono.
     *
     * ## Il difetto, misurato sul Pad il 2026-09-10 alle 20:14
     *
     * Il sondaggio ha girato per due minuti e mezzo e ha riportato:
     *
     *     cpu:    verdetto=VALID  tps=23.95  ttft=501
     *     opencl: verdetto=VALID  tps=24.97  ttft=502
     *
     * e la decisione ha scelto **CPU** con motivo `margin` — perché
     * {@link TalosBackendChoice#WORTHWHILE_MARGIN} chiede che il tempo al primo
     * token della GPU sia **la metà** di quello della CPU, e 502 contro 501 non
     * lo è.
     *
     * ⛔ Ma quel margine è calibrato su una misura fatta con **2.048 token** —
     * lo dice il commento su `WORTHWHILE_MARGIN`, con i numeri: *«a 2048-token
     * prompt on the CPU floor, cold, takes 43.2s; the same prompt on OpenCL
     * takes 11.0s»*, cioè **4×**. Il prompt di questo sondaggio, invece, era
     * lungo **dodici token**: a quella lunghezza il tempo al primo token è
     * quasi tutto **costo fisso**, uguale sui due backend.
     *
     * ⇒ Il carico della misura e la soglia della decisione non parlavano della
     * stessa cosa. **La GPU perdeva per costruzione**, sempre, ovunque — e la
     * schermata diceva «questo telefono risponde più veloce sulla CPU», che è
     * una conclusione tratta da una misura che non poteva distinguere.
     *
     * ## Perché mille e non duemila
     *
     * Il carico vero di TALOS è ~2.800 token di istruzioni, e sarebbe la
     * lunghezza giusta. ⛔ Ma questo sondaggio gira su **qualunque** modello
     * installato, e un modello con una finestra da 2.048 token non
     * sopravviverebbe a 2.800 di prompt più la generazione. Mille lascia posto
     * alla risposta anche nella finestra più piccola che si incontri, e resta
     * **ottantacinque volte** il prompt di prima: abbastanza perché una
     * differenza di due o quattro volte sul prefill si veda.
     *
     * ⛔ Non è la lunghezza ideale: è la più lunga che sia **sicura ovunque**.
     * La misura giusta la dimensionerebbe sulla finestra del modello aperto —
     * è un debito, non una svista.
     *
     * ## Perché righe numerate e non una frase ripetuta
     *
     * Il confronto qui è fra i DUE backend sullo stesso prompt, non con una
     * risposta attesa: quello che conta è che il prefill sia **vero e uguale**.
     * Righe numerate sono deterministiche, non degenerano come una frase
     * ripetuta identica, e la loro lunghezza si conta.
     */
    static final int PREFILL_LINES = 90;

    /**
     * Il prompt della prova.
     *
     * Deve produrre abbastanza token da soddisfare il minimo dell'harness (32)
     * senza dipendere da quanto il modello sia bravo: chiede una continuazione,
     * non una risposta esatta. E davanti porta un prefill vero — vedi
     * {@link #PREFILL_LINES}.
     */
    public static final String PROMPT = costruisciPrompt();

    /**
     * ⭐⭐⭐ L'IMPRONTA DEL METRO — e perche' non e' un numero di versione a mano.
     *
     * ## Il difetto, vissuto due volte l'11/09/2026
     *
     * Cambiato il criterio di giudizio, il sondaggio ha continuato a rispondere
     * **«Niente da verificare — gia' misurato su questo telefono»**: le prove
     * vecchie erano state prodotte da un metro diverso, e nessuno lo sapeva. La
     * cura non poteva entrare in vigore proprio sui telefoni che l'avevano
     * subita. L'ho curato bumpando la chiave dell'archivio a mano — e un'ora
     * dopo, cambiato il PROMPT, e' successo di nuovo.
     *
     * ⇒ Un numero di versione scritto a mano e' una cosa da ricordarsi, e
     * questa e' la seconda volta che me la dimentico nello stesso giorno.
     * L'impronta invece **non si puo' dimenticare**: dipende dal prompt e dalla
     * soglia, cioe' esattamente da cio' che rende due misure confrontabili.
     *
     * ⛔ Stessa disciplina di {@link TalosLocalProfileIdentity}, che invalida un
     * profilo quando cambia il motore o il modello. Qui cambia il METRO.
     *
     * ⛔ Non serve resistenza agli attacchi: il valore lo scriviamo e lo
     * leggiamo noi. Serve che due metri diversi diano nomi diversi.
     */
    /**
     * ⛔⛔ COME la corsa e' fatta fa parte del metro quanto il prompt.
     *
     * L'11/09/2026 il braccio della GPU ha smesso di chiedere «tutti gli strati,
     * dove ti pare» (`gpuLayers = -1`) e ha cominciato a **nominare** il suo
     * registry, come gia' faceva quello dell'NPU. Il prompt non e' cambiato di
     * un carattere — eppure le righe di prima non sono confrontabili con
     * queste: erano misure di «uno dei due acceleratori», senza sapere quale.
     *
     * ⛔ Cambiata una seconda volta lo stesso giorno: il banco ha smesso di
     * registrare le corse che il **motore** abbandona a meta'
     * (`run.abortitaDalMotore`). Un `VALID` scritto prima poteva essere
     * esattamente una di quelle — sul Pad lo era: l'NPU ha mollato il grafo e
     * si e' qualificata con quella corsa. ⇒ Non sono confrontabili.
     *
     * ⇒ Questa stringa e' il posto dove si dichiara un cambio di taratura che
     * il prompt non racconta. Si cambia quando cambia **come** si misura.
     */
    private static final String TARATURA = "bersaglio-nominato+abbandono-visto-2026-09-11";

    public static String metroId() {
        long impronta = 1125899906842597L;
        String materia = PROMPT + "|" + NUMERI_IN_SALITA + "|" + TOKENS + "|" + TARATURA;
        for (int i = 0; i < materia.length(); i += 1) {
            impronta = 31 * impronta + materia.charAt(i);
        }
        return Long.toHexString(impronta);
    }

    /*
     * ⛔⛔⛔ IL RIEMPITIVO NON DEVE PARLARE DI SE STESSO — misurato l'11/09/2026.
     *
     * La versione precedente metteva davanti novanta righe che dicevano
     * «this line exists to give the engine a real amount of text to read…» e
     * poi chiedeva di contare. Con la riga di diagnosi accesa, ecco cosa
     * producevano i tre motori sullo stesso prompt:
     *
     * <pre>
     *   CPU:  « The lines must be exactly as specified in the prompt. Do not
     *           add any extra text. No extra lines. Just the 90 lines…»
     *   GPU:  « Then answer the question. What is the sum of the integers from
     *           1 to 20? What is the sum of the integers from 1 to 20?…»
     *   NPU:  « Then answer the question. In the given measurement, the
     *           measurement line is the line that contains the word…»
     * </pre>
     *
     * ⛔ **Nessuno dei tre conta.** Tutti e tre parlano DEL PROMPT: un
     * riempitivo che descrive se stesso e le proprie regole invita un modello
     * da due miliardi a commentare le regole invece di eseguire il compito.
     *
     * ⛔ E il difetto era invisibile: {@link #referenceIsUsable} chiede alla
     * CPU solo di aver prodotto *qualcosa*, e un commento sul prompt e'
     * qualcosa. La CPU passava per riferimento valido, e gli acceleratori
     * venivano confrontati con un riferimento che non aveva svolto il compito.
     *
     * ⇒ Tre cambi, nella stessa direzione: il riempitivo diventa **contenuto
     * neutro** che non nomina ne' il prompt ne' il modello, ogni riga porta
     * **numeri diversi** (novanta righe identiche invitano a continuarle), e
     * la richiesta finale e' **una sola istruzione** senza avverbi da
     * interpretare e con il primo numero gia' scritto, che e' il modo piu'
     * corto di dire «si comincia cosi'».
     */
    private static String costruisciPrompt() {
        StringBuilder testo = new StringBuilder(8192);
        testo.append("Background notes.\n");
        for (int riga = 1; riga <= PREFILL_LINES; riga += 1) {
            testo.append("Note ").append(riga).append(": station ").append(riga)
                 .append(" recorded a temperature of ").append(10 + (riga % 17))
                 .append(" degrees and a wind speed of ").append(3 + (riga % 11))
                 .append(" kilometres per hour on day ").append(riga).append(".\n");
        }
        // ⛔ NIENTE «1» gia' scritto: sembrava un aiuto e complicava il
        // giudizio, perche' la risposta comincerebbe da «2». Il compito
        // resta uno e intero.
        testo.append("\nIgnore the notes above. Write the numbers from 1 to 20, ")
             .append("one per line, and nothing else.\n");
        return testo.toString();
    }

    /**
     * Il TETTO dei token, non l'obiettivo.
     *
     * A fermare la prova è il tempo, non il conteggio
     * ({@link TalosLlamaEngine#MEASURE_FLOOR_MS}): un conteggio fisso misura
     * finestre diverse su telefoni diversi, ed è esattamente il modo in cui una
     * misura smette di voler dire qualcosa. Questo numero esiste solo perché
     * una generazione senza tetto non finirebbe mai.
     */
    public static final int TOKENS = 1024;

    /**
     * Il candidato concorda col riferimento?
     *
     * Un testo vuoto non concorda mai, nemmeno con un riferimento vuoto: un
     * backend che non produce niente ha fallito, e due silenzi non sono un
     * accordo.
     */
    public static boolean agreesWithReference(String reference, String candidate) {
        if (reference == null || candidate == null) return false;
        String left = reference.trim();
        String right = candidate.trim();
        if (left.isEmpty() || right.isEmpty()) return false;

        /*
         * ⛔ La via rapida: prefissi identici e' un accordo certo, e non costa
         * niente verificarlo.
         */
        int compared = Math.min(COMPARED_PREFIX, Math.min(left.length(), right.length()));
        if (left.length() >= COMPARED_PREFIX && right.length() >= COMPARED_PREFIX
                && left.regionMatches(0, right, 0, compared)) {
            return true;
        }

        /*
         * ⭐⭐⭐ E QUANDO I PREFISSI NON COMBACIANO — che e' il caso NORMALE, non
         * l'eccezione.
         *
         * ## Il difetto, misurato sul Pad l'11/09/2026
         *
         * Il sondaggio con `Llama-3.2-3B-Q4_0` ha riportato:
         *
         * <pre>
         *   cpu:      verdetto=VALID          ttft 62.538 ms
         *   opencl:   verdetto=WRONG_ANSWER   ttft  7.505 ms
         *   hexagon:  verdetto=WRONG_ANSWER   ttft  2.505 ms
         * </pre>
         *
         * ⛔ `TalosBackendChoice.choose` SCARTA chi non ha risposto
         * correttamente (`outcome != CORRECT`). ⇒ Con questo criterio
         * **nessun acceleratore poteva mai essere scelto in automatico** su
         * questo telefono — pur essendo 25 volte piu' veloce della CPU al primo
         * token. Non era una decisione: era il metro di misura.
         *
         * ## Perche' il confronto per caratteri NON PUO' funzionare
         *
         * Non e' un difetto dei nostri backend, ed e' documentato:
         * «Give Me FP32 or Give Me Death? Challenges and Solutions for
         * Reproducible Reasoning» (arXiv 2506.09501, letto l'11/09/2026) misura
         * che **anche a parita' di prompt e di seed, e anche in decodifica
         * greedy**, l'uscita cambia fra configurazioni hardware diverse — la
         * causa e' la **non associativita' della virgola mobile**, `(a+b)+c` non
         * e' `a+(b+c)`. Un token diverso all'inizio e tutto il seguito diverge.
         *
         * ⇒ Pretendere 48 caratteri identici fra CPU e NPU e' chiedere una cosa
         * che l'aritmetica non garantisce. Il commento su `COMPARED_PREFIX`
         * diceva gia' meta' di questa verita' («backend diversi sommano in
         * ordine diverso»), e la conclusione che ne traeva — accorciare il
         * prefisso — era la cura sbagliata: con 48 caratteri il difetto resta,
         * con 3 accetterebbe qualunque cosa.
         *
         * ## La cura: si giudica il COMPITO, non il testo
         *
         * Il prompt chiede **«Count slowly from one to twenty, one number per
         * line»**. Un backend sano produce i numeri in ordine; uno rotto no —
         * l'11/09 un riuso guasto della KV ha prodotto
         * `model 원: ? 어 (Translation **Model 어` e una risposta vuota, e
         * nessuno dei due contiene una salita di numeri.
         *
         * ⛔ Questo non e' un cancello piu' largo: e' un cancello che guarda la
         * cosa giusta. Il vecchio bocciava un backend sano per una virgola
         * mobile e avrebbe promosso un backend rotto che per caso avesse
         * azzeccato i primi 48 caratteri.
         */
        return haContatoInOrdine(right) && haContatoInOrdine(left);
    }

    /**
     * Quanti numeri in salita servono perche' il compito sia stato svolto.
     *
     * ⛔ Cinque e non venti: la generazione si ferma sul TEMPO
     * ({@link TalosLlamaEngine#MEASURE_FLOOR_MS}), non sul conteggio, e su un
     * telefono lento puo' arrivare a otto e fermarsi. Pretendere venti
     * boccerebbe il telefono lento invece del backend rotto — l'opposto di cio'
     * che questo cancello deve fare.
     *
     * ⛔ E cinque non e' «quasi niente»: una salita 1,2,3,4,5 in un testo
     * casuale e' un evento che non capita. Le due uscite guaste dell'11/09 —
     * vuota e in coreano — falliscono entrambe alla prima cifra.
     */
    static final int NUMERI_IN_SALITA = 5;

    /**
     * Vero se il testo contiene i numeri da 1 in su, in ordine, per almeno
     * {@link #NUMERI_IN_SALITA} passi.
     *
     * ⛔ Si accettano sia le cifre («1») sia le parole inglesi («one»): il
     * prompt e' in inglese e chiede di contare, e due modelli sani possono
     * scegliere forme diverse. Bocciare per la forma sarebbe rifare lo stesso
     * errore del confronto per caratteri, un piano piu' in su.
     */
    /**
     * ⛔ Il numero come TOKEN INTERO, non come sottostringa.
     *
     * Senza questo, «1» combacerebbe dentro «10», «2» dentro «12», e un testo
     * che si limita a ripetere le note del prompt — che contengono
     * temperature e velocita' — passerebbe per «ha contato». Un cancello che
     * accetta l'eco del prompt non e' un cancello.
     */
    private static int cercaNumeroIntero(String testo, int numero, int da) {
        String ago = Integer.toString(numero);
        int cerca = da;
        while (true) {
            int dove = testo.indexOf(ago, cerca);
            if (dove < 0) return -1;
            boolean primaLibero = dove == 0 || !Character.isDigit(testo.charAt(dove - 1));
            int fine = dove + ago.length();
            boolean dopoLibero = fine >= testo.length() || !Character.isDigit(testo.charAt(fine));
            if (primaLibero && dopoLibero) return dove;
            cerca = dove + 1;
        }
    }

    static boolean haContatoInOrdine(String testo) {
        if (testo == null) return false;
        String basso = testo.toLowerCase(java.util.Locale.ROOT);
        String[] parole = {
            "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        };
        int da = 0;
        for (int numero = 1; numero <= NUMERI_IN_SALITA; numero += 1) {
            int cifra = cercaNumeroIntero(basso, numero, da);
            int parola = numero <= parole.length ? basso.indexOf(parole[numero - 1], da) : -1;
            int dove;
            if (cifra < 0) {
                dove = parola;
            } else if (parola < 0) {
                dove = cifra;
            } else {
                dove = Math.min(cifra, parola);
            }
            if (dove < 0) return false;
            // ⛔ Si riparte DOPO l'occorrenza trovata: cosi' «2» deve venire
            // dopo «1», che e' il senso di «in ordine». Cercare da capo
            // accetterebbe «5 4 3 2 1».
            da = dove + 1;
        }
        return true;
    }

    /**
     * La CPU è il pavimento: le si chiede solo di aver prodotto qualcosa.
     *
     * Non ha un riferimento contro cui essere confrontata — è lei il
     * riferimento — e un'app che conclude che nemmeno la CPU funziona è
     * un'app che non fa niente.
     */
    public static boolean referenceIsUsable(String reference) {
        return reference != null && !reference.trim().isEmpty();
    }

    /** Il verdetto dell'harness, tradotto nella prova che la scelta consuma. */
    public static TalosBackendChoice.Evidence evidenceOf(
            String backend, String driver, TalosBenchmarkHarness.Result result) {
        return new TalosBackendChoice.Evidence(
                backend, driver,
                TalosBenchmarkHarness.outcomeOf(result),
                result.ttftMs,
                // ⛔ Gia' calcolato da `judge()`, finora solo stampato in
                // logcat e buttato via. La riga «chi vince» del banco cambia
                // fra lettura e scrittura su sette modelli su otto: con un
                // numero solo la decisione e' giusta a meta'.
                result.tokensPerSecond);
    }
}
