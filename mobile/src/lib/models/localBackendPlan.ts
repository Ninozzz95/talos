import {
    type TalosLocalBackendDecision,
    type TalosLocalBackendDevice,
    type TalosLocalBackendOption,
    type TalosLocalBackendPreference,
    talosDecideLocalBackend,
    talosLocalBackendOptions,
    talosLocalBackendRequest,
} from '@/lib/models/localBackendChoice'
import type { TalosProfileForSelection } from '@/lib/models/localProfileSelector'

/**
 * ⭐⭐⭐ IL PONTE fra la decisione e l'apertura — cioè la riga che mancava.
 *
 * `localBackendChoice.ts` sapeva già decidere: tre famiglie, la scelta manuale
 * che vince sempre, il predefinito dalla misura, il buco dichiarato. Ma il
 * 2026-09-10 quel file era **ORFANO** — zero import in tutto `src/`, i suoi
 * test verdi e nessun chiamante — quindi la direttiva dell'owner («LA SCELTA
 * RESTA ALL UTENTE, SCEGLIE SEMPRE LUI, CPU GPU O HEXAGON, DI DEFAULT
 * SCEGLIAMO QUELLO PIU VELOCE (DI SOLITO GPU)») era implementata e morta. È la
 * stessa malattia di `funzione-con-i-test-e-nessun-chiamante` e di «la GPU è
 * spedita, è scelta, è usata», applicata al nostro stesso lavoro.
 *
 * Questo modulo è la traduzione — **pura, provabile senza telefono** — da «cosa
 * dichiara questo motore + cosa ha chiesto la persona + cosa dice la misura» a
 * «quali opzioni passare a `open()`». Chi apre (l'adattatore della chat, il
 * riscaldamento anticipato) raccoglie i fatti e chiama qui: nessuno dei due
 * rifà la politica per conto proprio, perché due politiche divergono sempre.
 *
 * ## ⛔ La regola che protegge il predefinito di oggi
 *
 * Quando NON c'è né una scelta della persona né una misura, questo modulo non
 * passa **niente** al motore — non `gpuLayers: 0`, non un nome di backend.
 *
 * Non è timidezza, è il contratto del ponte nativo: `TalosLlamaPlugin.open`
 * (righe 336-341) usa `gpuLayers` del chiamante SOLO se il chiamante lo
 * nomina, altrimenti la richiesta la fa `TalosBackendChoice` sull'evidenza
 * registrata da `qualifyBackend`. Scrivere `gpuLayers: 0` nel caso «non lo so»
 * vorrebbe dire **spegnere quell'arbitro**: una persona che ha appena fatto
 * girare il sondaggio si ritroverebbe la CPU imposta da noi. ⇒ `unmeasured` si
 * dichiara e si lascia decidere a chi ha l'evidenza, non si traveste da CPU.
 *
 * ⛔ L'`unavailable` invece SÌ: lì la persona ha chiesto qualcosa che su questo
 * telefono non c'è, e restare sul pavimento è una conseguenza della sua
 * richiesta, non un'assenza di decisione — si impone `gpuLayers: 0` e
 * l'interfaccia dirà perché.
 *
 * ## Perché `gpuLayers` e `backend` viaggiano SEMPRE insieme
 *
 * Verificato alla fonte upstream il 2026-09-10 — `llama.cpp`,
 * `tools/cli/README.md` (ramo master): `-dev/--device` è «comma-separated list
 * of devices to use for offloading (none = don't offload)» mentre `-ngl` è
 * «max. number of layers to store in VRAM». Sono due domande diverse: *dove* e
 * *quanti*. Nominare un dispositivo senza chiedere gli strati non sposta
 * niente, e chiedere gli strati senza nominare il dispositivo lascia scegliere
 * all'ordine di caricamento delle librerie — la lotteria che
 * `TalosBackendTarget.java` esiste per togliere di mezzo.
 */

/** Le opzioni di apertura che riguardano DOVE gira il modello. Vuoto = nessuna richiesta. */
export interface TalosLocalBackendOpenOptions {
    gpuLayers?: number
    backend?: string
}

export interface TalosLocalBackendPlan {
    /** Cosa è stato deciso e perché — la parola che l'interfaccia saprà spiegare. */
    decision: TalosLocalBackendDecision
    /** Cosa si passa a `open()`. Un oggetto vuoto significa «non chiedere niente». */
    options: TalosLocalBackendOpenOptions
    /** Le tre voci, sempre tre: pronte per il selettore a schermo (fase successiva). */
    choices: readonly TalosLocalBackendOption[]
}

/**
 * Quanti token ci si aspetta di generare, per la formula di
 * `talosSelectBestProfile` (costo di transizione contro guadagno a regime).
 *
 * ⛔ È lo stesso tetto di `MAX_TOKENS` in `lib/chat/providers/localAdapter.ts`,
 * che è il numero vero per la chat. Vive qui perché anche il riscaldamento
 * anticipato (`talosWarmLocalModel`) deve decidere DOVE aprire, e importare la
 * costante dall'adattatore creerebbe un anello fra i due moduli. Chi ha il
 * numero vero sotto mano lo passa esplicitamente e questo non viene usato.
 */
export const TALOS_LOCAL_EXPECTED_OUTPUT_TOKENS = 1024

/**
 * Da ciò che il ponte dichiara a un inventario di dispositivi.
 *
 * ⛔ Il ponte NON espone l'inventario strutturato (`nativeBackendInventory()`
 * esiste in Java ma non attraversa il ponte verso JS): di qui si vedono solo
 * due fatti, la stringa dei registry — `"CPU,OpenCL"`, cioè
 * `ggml_backend_reg_name` per ogni registry caricato — e quanti dispositivi di
 * offload il motore ha registrato. Si costruisce con quelli, e si dichiara il
 * limite invece di inventare il resto:
 *
 *  - un registry che non compare nella stringa **non c'è in questa build su
 *    questo telefono** (§9 del ledger 2026-09-10: sulle build di DEBUG il
 *    registro contiene il solo `CPU`, perché `GGML_OPENCL=ON` sta solo dentro
 *    `buildTypes.release`);
 *  - `offloadDevices === 0` è l'unico modo di sapere con certezza che nessuna
 *    richiesta di offload potrebbe essere onorata: allora nessun acceleratore è
 *    un bersaglio, per quanto il suo registry si sia registrato;
 *  - `offloadDevices === null` è «questo ponte non lo dichiara», e **non è
 *    zero**: il campo arriva solo con un modello già aperto, quindi alla prima
 *    apertura manca sempre. Trattarlo come zero cancellerebbe la GPU proprio
 *    nel momento in cui la si sta scegliendo.
 */
export function talosLocalBackendDevicesOf(
    backends: string,
    offloadDevices: number | null,
): readonly TalosLocalBackendDevice[] {
    const nessunBersaglio = offloadDevices === 0
    return backends
        .split(',')
        .map((nome) => nome.trim())
        .filter((nome) => nome !== '')
        .map((registry) => ({
            registry,
            name: registry,
            // La CPU non è mai un bersaglio di offload: non è una convenzione
            // nostra, è il contratto di llama.cpp (`common/arg.cpp` rifiuta con
            // «invalid device» un nome che risolva a un dispositivo CPU).
            canOffload: registry.trim().toLowerCase() !== 'cpu' && !nessunBersaglio,
        }))
}

/** I registry che realizzano una famiglia qui, come li nomina il motore. */
function registriesOf(
    choices: readonly TalosLocalBackendOption[],
    decision: TalosLocalBackendDecision,
): readonly string[] {
    return choices.find((choice) => choice.kind === decision.kind)?.registries ?? []
}

/**
 * ⭐ Il piano: cosa si chiederà al motore, e la parola che dice perché.
 *
 * Funzione pura apposta — l'unica cosa che serve per provarla è un elenco di
 * stringhe e un elenco di profili, e così la precedenza della scelta manuale
 * si prova senza un telefono, senza un modello e senza aprire niente.
 */
export function talosLocalBackendPlan(input: {
    preference: TalosLocalBackendPreference
    /** La stringa dei registry, verbatim dal ponte (`available().backends`). */
    backends: string
    /** Quanti bersagli di offload, o `null` se il ponte non lo dichiara. */
    offloadDevices: number | null
    /** I profili già misurati per QUESTO modello. Vuoto = nessuna misura. */
    profiles: readonly TalosProfileForSelection[]
    /**
     * Il registry attivo ADESSO, o `null`.
     *
     * ⛔ `null` quando si sta per aprire comunque: il costo di transizione
     * (CR-12) non è zero per nessun candidato se i pesi vanno riletti, e
     * dichiarare attivo un registry in quel momento regalerebbe uno sconto che
     * nessuno ha guadagnato.
     */
    activeRegistry: string | null
    expectedOutputTokens?: number
    /**
     * D-53 — quanti token il motore dovrà LEGGERE per questa richiesta. È già
     * noto prima di aprire (`anticipo.promptTokens`). Assente = il selettore
     * usa `ttftMs` come costo fisso, cioè il metro di prima.
     */
    promptTokens?: number
    /**
     * ⛔⛔ IL FORMATO DEI PESI DI QUESTO MODELLO, e senza di lui l'NPU va spenta.
     *
     * Misurato sul Pad l'11/09/2026, stesso modello e stesso giorno:
     * `Qwen3-4B` in **Q4_0** legge a 1.126 t/s sull'NPU; lo stesso modello in
     * **Q4_K_M** legge a **55,7** — venti volte piu' piano, e quattro volte
     * sotto la GPU. Il catalogo e' 14 Q4_K_M contro 7 Q4_0.
     *
     * ⛔ Assente = «non l'abbiamo letto» = NPU fuori. L'incertezza non e' un
     * permesso: sbagliare in un verso costa quattro volte la velocita',
     * nell'altro costa «gira sulla GPU come ieri».
     */
    quantisation?: string | null
}): TalosLocalBackendPlan {
    const choices = talosLocalBackendOptions(
        talosLocalBackendDevicesOf(input.backends, input.offloadDevices),
        input.quantisation ?? null,
    )
    const decision = talosDecideLocalBackend({
        preference: input.preference,
        options: choices,
        profiles: input.profiles,
        activeRegistry: input.activeRegistry,
        expectedOutputTokens: input.expectedOutputTokens ?? TALOS_LOCAL_EXPECTED_OUTPUT_TOKENS,
        promptTokens: input.promptTokens,
    })

    // Vedi il cappello del modulo: il buco si dichiara, non si traveste da CPU.
    if (decision.reason === 'unmeasured') return { decision, options: {}, choices }

    const request = talosLocalBackendRequest(decision.kind, registriesOf(choices, decision))
    return {
        decision,
        options: {
            gpuLayers: request.gpuLayers,
            // ⛔ La chiave si OMETTE quando non c'è un nome, non si manda a
            // `null`: dall'altra parte del ponte `call.getString("backend", "")`
            // legge un valore assente come «nessuna richiesta», mentre un null
            // che attraversa Capacitor è un caso in più che nessuno ha provato.
            ...(request.backend !== null ? { backend: request.backend } : {}),
        },
        choices,
    }
}
