import type { TalosProfileForSelection } from '@/lib/models/localProfileSelector'
import { talosSelectBestProfile } from '@/lib/models/localProfileSelector'

/**
 * ⭐⭐⭐ CHI fa girare il modello — e la scelta è di chi usa l'app.
 *
 * ## L'ordine dell'owner, 2026-09-10
 *
 * «LA SCELTA RESTA ALL UTENTE, SCEGLIE SEMPRE LUI, CPU GPU O HEXAGON, DI
 * DEFAULT SCEGLIAMO QUELLO PIU VELOCE (DI SOLITO GPU)».
 *
 * Tre cose, e nessuna delle tre è quella che TALOS faceva prima:
 *
 * 1. la scelta manuale è **sempre** disponibile e **vince sempre** su
 *    qualunque euristica nostra — non è una modalità esperto, non è un
 *    ripiego quando la qualifica fallisce;
 * 2. il predefinito è «il più veloce», e **si deriva da una misura**, mai da
 *    una costante — la stessa disciplina di `localContextPolicy.ts`;
 * 3. i backend sono **tre**, non due. Hexagon non è cancellato: oggi non è
 *    ancora compilato (`.claude/TACCUINO-HEXAGON-2026-09-10.md`), e questo
 *    modulo deve lasciargli il posto invece di cablare due sole opzioni.
 *
 * ## ⛔ SCELTO non è IN USO, ed è il difetto che stiamo battendo
 *
 * La ricerca dell'owner lo nomina per PocketPal: *«backend selezionabile non
 * equivale a backend realmente utilizzato»* — si seleziona Hexagon e si gira
 * su CPU senza che niente lo dica, e «99 strati sulla GPU» non prova che 99
 * strati ci siano andati. È la stessa lezione già in memoria qui
 * (`la-gpu-non-e-spedita-non-e-scelta-non-e-usata`): dichiarare non è usare.
 *
 * ⇒ Questo modulo tiene **due** informazioni separate e non le mescola mai:
 * {@link TalosLocalBackendDecision} è ciò che è stato CHIESTO al motore, e
 * {@link TalosLocalBackendInUse} è ciò che il motore dichiara di aver fatto.
 * La seconda si valorizza dal nativo, non si deduce dalla prima.
 *
 * ## ⛔ Il vocabolario è quello del motore, non uno nostro
 *
 * Le famiglie sono tre perché l'utente ne vede tre; ma la traduzione da
 * «famiglia» a «cosa esiste su questo telefono» passa dal NOME DEL REGISTRY
 * che ggml dichiara di sé — `CPU`, `OpenCL`, `Vulkan`, `HTP`. Non da una
 * lista di chip scritta a mano, che invecchierebbe al telefono successivo.
 *
 * ⛔ E il nome del registry è l'UNICO discriminante. Verificato alla fonte nel
 * sottomodulo che spediamo (commit `dc72703`, letto il 2026-09-10): sia
 * `ggml/src/ggml-opencl/ggml-opencl.cpp:10804` sia
 * `ggml/src/ggml-hexagon/ggml-hexagon.cpp:3922` dichiarano
 * `GGML_BACKEND_DEVICE_TYPE_GPU`. ⇒ Il TIPO del dispositivo non distingue
 * l'NPU dalla scheda grafica; il nome sì (`ggml-hexagon.cpp:4317` torna
 * `"HTP"`, `ggml-opencl.cpp:10903` torna `"OpenCL"`). Chi guardasse solo il
 * tipo offrirebbe «GPU» per un DSP.
 */

/** Le tre famiglie che l'utente sceglie. Tre, e restano tre anche finché una non è compilata. */
export type TalosLocalBackendKind = 'cpu' | 'gpu' | 'hexagon'

/**
 * L'ordine in cui si offrono, e non è alfabetico: è quello dell'interfaccia
 * di riferimento (CPU · GPU · Hexagon), così una persona che ha già visto un
 * altro strumento ritrova le voci dove se le aspetta.
 */
export const TALOS_LOCAL_BACKEND_KINDS: readonly TalosLocalBackendKind[] = Object.freeze([
    'cpu', 'gpu', 'hexagon',
] as const)

/** Il registry ggml che realizza l'NPU Qualcomm, come lo nomina il motore stesso. */
const REGISTRY_HEXAGON = 'HTP'
/** Il registry ggml della CPU. Non è un bersaglio di offload — vedi `TalosBackendInventory`. */
const REGISTRY_CPU = 'CPU'

/**
 * Da nome di registry a famiglia.
 *
 * ⛔ Il confronto è senza distinzione di maiuscole ma sul nome INTERO: un
 * `includes('cpu')` prenderebbe anche un ipotetico registry `CPU_REPACK`, e
 * un `includes('htp')` prenderebbe qualunque cosa contenga quelle tre
 * lettere. I nomi sono pochi e noti; si confrontano per intero.
 */
export function talosBackendKindOfRegistry(registry: string): TalosLocalBackendKind {
    const nome = registry.trim().toLowerCase()
    if (nome === REGISTRY_CPU.toLowerCase()) return 'cpu'
    /*
     * ⛔⛔⛔ DUE VOCABOLARI, misurato sul Pad l'11/09/2026 alle 20:12.
     *
     * Il motore chiama il registry `HTP`; il sondaggio scrive nei profili la
     * FAMIGLIA, `hexagon` (`TalosBackendChoice.HEXAGON`). Questa funzione
     * conosceva solo il primo: il profilo dell'NPU — il piu' veloce, 856
     * token/s in lettura contro 155 — cadeva nel ripiego «tutto il resto e'
     * la scheda grafica», e la chat apriva su `GPUOpenCL` con i numeri
     * dell'NPU in mano: `backend_decided kind=gpu reason=fastest
     * source=measured`, 3,0 s alla prima parola dove ne bastavano 0,3.
     *
     * Stessa forma di «adesso gira su Hexagon · GPU» (§59): un nome del
     * vocabolario sbagliato che finisce nel ripiego giusto per caso.
     */
    if (nome === REGISTRY_HEXAGON.toLowerCase() || nome === 'hexagon') return 'hexagon'
    // Tutto ciò che non è né la CPU né il DSP e che il motore ha registrato
    // come dispositivo di offload è, per chi guarda lo schermo, «la scheda
    // grafica»: OpenCL oggi, Vulkan domani, senza toccare questa riga.
    return 'gpu'
}

/**
 * Che cosa si chiede al motore per ottenere questa famiglia.
 *
 * ⛔ `backend: null` vuol dire «non nominare nessun bersaglio», che NON è la
 * stessa cosa di «CPU»: è il comportamento storico, in cui llama.cpp decide
 * da sé. La CPU si chiede per nome (`gpuLayers = 0`), perché chiederla è una
 * decisione e va distinta dal non aver deciso.
 */
export interface TalosLocalBackendRequest {
    /** Quanti strati spostare: `0` = nessuno (CPU), `-1` = tutti. */
    gpuLayers: number
    /** Il registry da nominare, o `null` per lasciar scegliere il motore. */
    backend: string | null
}

/**
 * ⛔ Il bersaglio si NOMINA quando non è la CPU, e non è pedanteria.
 *
 * Con due acceleratori compilati insieme — il giorno in cui Hexagon entra
 * nell'APK accanto a OpenCL — un `gpuLayers = -1` senza nome è una lotteria
 * decisa dall'ordine di caricamento delle librerie native. È scritto per
 * esteso in `TalosBackendInventory.java`, e vale esattamente qui.
 *
 * ⇒ Nominare il registry ha un secondo effetto, più importante: il nativo
 * allora RISOLVE il dispositivo e può dichiarare quale ha preso
 * (`backendDevice` nella snapshot). Senza nome, quel campo resta vuoto e
 * «quale motore sta girando» torna a essere una deduzione.
 */
export function talosLocalBackendRequest(
    kind: TalosLocalBackendKind,
    registries: readonly string[],
): TalosLocalBackendRequest {
    if (kind === 'cpu') return { gpuLayers: 0, backend: null }
    const nome = registries.find((registry) => talosBackendKindOfRegistry(registry) === kind)
    return { gpuLayers: -1, backend: nome ?? null }
}

/** Come la scelta viene conservata fra un avvio e l'altro. */
export interface TalosLocalBackendPreference {
    /**
     * `auto` = decide la misura; `manual` = decide la persona.
     *
     * ⛔ Due campi e non uno: `manual` sopravvive anche in modalità `auto`,
     * così tornare a `manual` non costringe a riscegliere. Spegnere non è
     * dimenticare — `spegnere-non-e-dimenticare`.
     */
    mode: 'auto' | 'manual'
    manual: TalosLocalBackendKind | null
}

export const TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE: TalosLocalBackendPreference = Object.freeze({
    mode: 'auto',
    manual: null,
})

const KINDS = new Set<string>(TALOS_LOCAL_BACKEND_KINDS)

/**
 * Legge la preferenza salvata, e qualunque cosa non sia esattamente la forma
 * attesa torna al predefinito — mai una modalità a metà.
 */
export function parseTalosLocalBackendPreference(value: unknown): TalosLocalBackendPreference {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE
    }
    const record = value as Record<string, unknown>
    const mode = record.mode === 'manual' ? 'manual' : record.mode === 'auto' ? 'auto' : null
    if (mode === null) return TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE
    const manual = typeof record.manual === 'string' && KINDS.has(record.manual)
        ? record.manual as TalosLocalBackendKind
        : null
    // Una preferenza `manual` senza una scelta dentro non è manuale: non c'è
    // niente da rispettare, e trattarla come tale bloccherebbe la misura.
    if (mode === 'manual' && manual === null) return TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE
    return { mode, manual }
}

/** Un dispositivo come lo dichiara l'inventario nativo. Solo i campi che servono a decidere. */
export interface TalosLocalBackendDevice {
    registry: string
    name: string
    /** `true` se il motore lo accetta come bersaglio di offload. */
    canOffload: boolean
}

/** Una voce dell'elenco che l'utente vede: sempre tutte e tre, anche quelle assenti. */
/**
 * ⭐⭐⭐ I FORMATI CHE L'NPU MANGIA DAVVERO — misurati, non letti su una tabella.
 *
 * ## Il fatto, dal banco dell'11/09/2026 sul Pad dell'owner
 *
 * Stesso modello, stesso giorno, stesso telefono. Cambia **solo il formato dei
 * pesi**:
 *
 * ```
 *   Qwen3-4B-Instruct  Q4_0     NPU   lettura 1126 t/s   scrittura 14,0
 *   Qwen3-4B-Instruct  Q4_K_M   NPU   lettura   55,7     scrittura  5,0
 *                               GPU   lettura  206       scrittura 16,7
 * ```
 *
 * ⛔ **Venti volte piu' lenta in lettura**, e quattro volte sotto la GPU.
 * Accendere l'NPU su un Q4_K_M non e' «un po' meno veloce»: rende l'app
 * **peggiore di non avere l'NPU**. E il nostro catalogo e' 14 Q4_K_M contro
 * 7 Q4_0 — la regola sbagliata farebbe danno su due modelli su tre.
 *
 * ## Perche' succede
 *
 * L'NPU ha kernel nativi solo per questi formati. Su tutto il resto ricade
 * operazione per operazione sul processore, e il rimbalzo fra i due costa piu'
 * del calcolo che evita. Lo conferma la letteratura:
 * [«Is Your NPU Ready for LLMs?», arXiv 2607.05475](https://arxiv.org/html/2607.05475v1)
 * misura NPU **oltre 1.400 t/s** in lettura e un crollo in scrittura, con la
 * stessa forma che vediamo qui.
 *
 * ## ⛔ Perche' un elenco e non «tutto quello che non e' K»
 *
 * Perche' il vincolo dell'owner e' **«TALOS deve far girare tutti i modelli di
 * Hugging Face che entrano nel dispositivo»**. Un formato nuovo che non
 * conosciamo deve poter **entrare** — semplicemente non sull'NPU finche'
 * qualcuno non lo misura. Un elenco chiuso di cio' che e' AMMESSO fallisce
 * verso il lato sicuro; una regola dedotta dal nome fallirebbe verso quello
 * sbagliato.
 */
const TALOS_FORMATI_PER_NPU: ReadonlySet<string> = new Set(['Q4_0', 'Q8_0', 'MXFP4'])

/**
 * Se l'NPU sa mangiare questo formato di pesi.
 *
 * @param quantisation `general.file_type` letto dal GGUF — `Q4_0`, `Q4_K_M`…
 *     ⛔ `null` significa **«non l'abbiamo letto»**, e la risposta e' `false`:
 *     l'incertezza non e' un permesso. Il costo di sbagliare in un verso e'
 *     quattro volte piu' lento; nell'altro e' «gira sulla GPU come ieri».
 */
export function talosNpuAcceptsQuantisation(quantisation: string | null | undefined): boolean {
    if (typeof quantisation !== 'string') return false
    return TALOS_FORMATI_PER_NPU.has(quantisation.toUpperCase())
}

export interface TalosLocalBackendOption {
    kind: TalosLocalBackendKind
    /**
     * ⛔ `false` NON significa «non esiste al mondo»: significa «questa build,
     * su questo telefono, non lo ha registrato». Un Hexagon non ancora
     * compilato e un Hexagon assente dal chip danno lo stesso `false`, e la
     * differenza non si può inventare da qui.
     */
    available: boolean
    /** I registry che lo realizzano qui, come li nomina il motore. Vuoto se assente. */
    registries: readonly string[]
}

/**
 * L'elenco completo, sempre di tre voci.
 *
 * ⛔ Tre SEMPRE, anche quando due sono assenti: un elenco che nasconde ciò
 * che manca non permette di dire *perché* manca, e la domanda «e Hexagon?»
 * tornerebbe a ogni telefono. La CPU è sempre presente — è il pavimento, e
 * non deve dimostrare niente.
 */
export function talosLocalBackendOptions(
    devices: readonly TalosLocalBackendDevice[],
    /**
     * ⛔ Il formato dei pesi di QUESTO modello, da `general.file_type`.
     * Assente = non lo sappiamo, e allora l'NPU resta fuori: vedi
     * `talosNpuAcceptsQuantisation`.
     */
    quantisation?: string | null,
): readonly TalosLocalBackendOption[] {
    return TALOS_LOCAL_BACKEND_KINDS.map((kind) => {
        if (kind === 'cpu') return { kind, available: true, registries: [REGISTRY_CPU] }
        const registries = [...new Set(
            devices
                .filter((device) => device.canOffload && talosBackendKindOfRegistry(device.registry) === kind)
                .map((device) => device.registry),
        )]
        /*
         * ⛔ L'NPU c'e' ma questo modello non e' per lei: `available: false`
         * con i registry INTATTI. I due fatti sono diversi — «il telefono non
         * ce l'ha» e «c'e', ma su questo file andrebbe venti volte piu' piano»
         * — e chi disegna la riga deve poterli distinguere per dire il perche'
         * giusto. Cancellare i registry qui li renderebbe identici.
         */
        if (kind === 'hexagon' && registries.length > 0
            && !talosNpuAcceptsQuantisation(quantisation)) {
            return { kind, available: false, registries }
        }
        return { kind, available: registries.length > 0, registries }
    })
}

/** Perché è stato scelto proprio questo — una parola che l'interfaccia sa spiegare. */
export type TalosLocalBackendReason =
    /** L'ha chiesto la persona, ed è disponibile. */
    | 'user'
    /** L'ha chiesto la persona, e su questo telefono non c'è. */
    | 'unavailable'
    /** L'ha vinto una misura reale su questo dispositivo. */
    | 'fastest'
    /** Nessuna misura esiste ancora: si resta sul pavimento, e lo si dice. */
    | 'unmeasured'

export interface TalosLocalBackendDecision {
    /** Che cosa verrà chiesto al motore. */
    kind: TalosLocalBackendKind
    /** Che cosa aveva chiesto la persona. `null` se non aveva chiesto niente. */
    requested: TalosLocalBackendKind | null
    source: 'user' | 'measured' | 'floor'
    reason: TalosLocalBackendReason
}

/**
 * ⭐ La decisione, e l'ordine dei cancelli È il contenuto della direttiva.
 *
 * 1. **La persona ha scelto** → si fa quello che ha detto, senza guardare
 *    nessuna misura. Se quello che ha scelto qui non esiste, NON si
 *    sostituisce in silenzio: si torna sul pavimento e si dichiara
 *    `requested` + `unavailable`, perché «ho scelto Hexagon e giro su CPU
 *    senza saperlo» è precisamente il difetto che stiamo battendo.
 * 2. **Nessuna scelta** → vince la misura, fra i backend DISPONIBILI.
 * 3. **Nessuna misura** → CPU, e lo si dice: `unmeasured`.
 *
 * ⛔ Il caso 3 non è un predefinito prudente travestito da scelta: è un buco
 * dichiarato. Su questo progetto un buco dichiarato vale più di un default
 * silenzioso — e la cura non è indovinare qui, è far girare la misura.
 *
 * @param expectedOutputTokens quanto ci si aspetta di generare: la formula
 *     di `talosSelectBestProfile` pesa il costo di transizione contro il
 *     guadagno a regime, e per una risposta corta il conto cambia davvero.
 */
export function talosDecideLocalBackend(input: {
    preference: TalosLocalBackendPreference
    options: readonly TalosLocalBackendOption[]
    profiles: readonly TalosProfileForSelection[]
    /** Il registry attivo ADESSO, per non pagare una riapertura per un vantaggio dentro il rumore. */
    activeRegistry: string | null
    expectedOutputTokens: number
    /** D-53 — i token che il motore dovrà leggere. Assente = costo fisso, come prima. */
    promptTokens?: number
}): TalosLocalBackendDecision {
    const disponibile = (kind: TalosLocalBackendKind): boolean =>
        input.options.some((option) => option.kind === kind && option.available)

    if (input.preference.mode === 'manual' && input.preference.manual !== null) {
        const scelto = input.preference.manual
        if (disponibile(scelto)) {
            return { kind: scelto, requested: scelto, source: 'user', reason: 'user' }
        }
        return { kind: 'cpu', requested: scelto, source: 'floor', reason: 'unavailable' }
    }

    const misurabili = input.profiles.filter(
        (profile) => disponibile(talosBackendKindOfRegistry(profile.backendRegistry)),
    )
    const migliore = talosSelectBestProfile(
        misurabili, input.activeRegistry, input.expectedOutputTokens, input.promptTokens,
    )
    if (migliore !== null) {
        return {
            kind: talosBackendKindOfRegistry(migliore.backendRegistry),
            requested: null,
            source: 'measured',
            reason: 'fastest',
        }
    }
    return { kind: 'cpu', requested: null, source: 'floor', reason: 'unmeasured' }
}

/**
 * ⛔⛔ Che cosa sta girando DAVVERO — valorizzato dal nativo, non dedotto.
 *
 * `actual` è `null` quando il motore non lo ha detto, e `null` non è «CPU»:
 * è «non lo so». Il motore lo dice in due casi, entrambi certi:
 *
 *  - gli è stato NOMINATO un bersaglio, e allora `backendDevice` porta il
 *    nome del dispositivo risolto (un nome che non si risolve fa FALLIRE
 *    l'apertura, quindi un nome presente è una conferma, non un indizio);
 *  - nessun acceleratore è registrato in questa build, e allora la CPU è
 *    l'unica risposta possibile per costruzione.
 *
 * ⛔ Nel caso di mezzo — bersaglio non nominato, acceleratore presente —
 * llama.cpp distribuisce gli strati da sé e **non espone dove siano
 * finiti**: verificato il 2026-09-10 sull'header pubblico del sottomodulo,
 * `include/llama.h` non ha nessuna funzione che dica su quale dispositivo un
 * tensore sia stato allocato (l'unica traccia è una riga di log,
 * `src/llama-model.cpp:1678`, che non è un'API). Quel buco si dichiara.
 */
export interface TalosLocalBackendInUse {
    requested: TalosLocalBackendKind
    actual: TalosLocalBackendKind | null
    /** Vero solo quando si SA che è finito altrove. Un `actual` ignoto non è un ripiego. */
    fellBack: boolean
    reason: 'match' | 'no-offload-device' | 'unknown'
}

/** I fatti della snapshot nativa che servono a rispondere. Nomi identici a quelli del ponte. */
export interface TalosLocalBackendSnapshot {
    /** Il dispositivo risolto, quando un bersaglio era stato nominato. `null` altrimenti. */
    backendDevice: string | null
    /** Gli strati CHIESTI, già azzerati dal nativo se nessun acceleratore esiste in questa build. */
    gpuLayersEffective: number
    /** Quanti dispositivi di offload il motore ha registrato. `null` = ponte più vecchio, non «zero». */
    offloadDevices: number | null
}

export function talosLocalBackendInUse(
    requested: TalosLocalBackendKind,
    snapshot: TalosLocalBackendSnapshot,
): TalosLocalBackendInUse {
    if (snapshot.backendDevice !== null && snapshot.backendDevice !== '') {
        return { requested, actual: requested, fellBack: false, reason: 'match' }
    }
    if (requested !== 'cpu' && snapshot.offloadDevices === 0) {
        return { requested, actual: 'cpu', fellBack: true, reason: 'no-offload-device' }
    }
    if (requested === 'cpu' && snapshot.gpuLayersEffective === 0) {
        return { requested, actual: 'cpu', fellBack: false, reason: 'match' }
    }
    return { requested, actual: null, fellBack: false, reason: 'unknown' }
}
