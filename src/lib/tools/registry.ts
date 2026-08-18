import { z, type ZodType } from 'zod'

/**
 * The tool suite — one internal representation, four wire formats.
 *
 * Web research (2026): the agent loop is identical across providers — declare
 * schemas, detect calls, execute, feed results back — and all the friction is
 * in the payload shape. Anthropic wants `input_schema` and hands back an
 * already-parsed object; OpenAI and DeepSeek want `parameters` and hand back a
 * JSON *string*; Gemini wants `functionDeclarations`; Ollama follows the
 * OpenAI shape. Translating at the edge keeps every tool written once.
 *
 * The other half of that research is blunter: prompt injection is not solved at
 * the model layer, so the strategy is containment. Hence `action`, which the
 * permission gate reads, and hence arguments that are VALIDATED against a
 * schema before any tool body runs — a tool that accepts free-form text is a
 * tool that can be talked into anything.
 */
export type { TalosToolAction } from '@/lib/tools/permissionTypes'
import type { TalosToolAction } from '@/lib/tools/permissionTypes'

export interface TalosToolResult {
    ok: boolean
    /** What the model receives back. Data, never instructions. */
    content: string
    /**
     * A stable code for WHY it failed — for the diagnostics trace, never for
     * the model. Codes travel; sentences get rewritten.
     */
    code?: string | null
    /**
     * Something for the model to LOOK at, not read.
     *
     * Not inside the tool result: Anthropic accepts image blocks there, OpenAI
     * only in the Responses API (which is not the one TALOS speaks), Gemini and
     * Ollama not at all. Every provider does accept an image on a USER turn —
     * the path attachments already use — so the loop hands these over as parts
     * after the results, and all four adapters translate them unchanged.
     */
    images?: import('@/lib/chat/attachmentContracts').TalosMobileImageInputPart[]
    /** Vault bindings to persist on the final assistant message. */
    messageAttachments?: import('@/repositories/chatRepository').AppendChatAttachmentInput[]
    /** Anything the audit row should keep that the model does not need. */
    evidence?: Record<string, unknown>
    /**
     * ⛔⛔ RIUSCITO, ma NON HA FATTO NIENTE — e la differenza si vede a schermo.
     *
     * MISURATO sul Pad il 2026-08-13: a «manda il file nota-talos su WhatsApp»,
     * `invia_file` ha trovato DUE file con lo stesso nome e ha fatto la cosa
     * giusta — ha chiesto quale. Non è partito niente. Eppure sotto la risposta
     * compariva il segno **«✓ Fatto: Invio di un file»**.
     *
     * La chiamata era riuscita (`ok: true`), quindi la riga di audit diceva
     * `succeeded`, e il chip legge quello. È la stessa bugia curata poche ore
     * prima nel testo del modello, spostata nell'interfaccia — e vale la frase
     * che sta già nell'esecutore: «un "fatto" su una cosa non fatta è peggio di
     * un errore, l'utente smette di controllare».
     *
     * ⇒ Un tool che ELENCA, DISAMBIGUA o CHIEDE lo dichiara qui. Non è un
     * fallimento — la risposta è utile e va data al modello con `ok: true`,
     * altrimenti scarta il contenuto e inventa. È un successo **senza effetto
     * nel mondo**, e solo gli effetti nel mondo meritano un «Fatto».
     */
    senzaEffetto?: boolean
    /**
     * ⭐⭐⭐ LA SCHEDA che la chat deve disegnare per questo risultato.
     *
     * Decisione dell'owner del 2026-08-13: «scheda sempre, l'app si apre solo
     * quando non c'è altro modo». Dopo «accendi la torcia» la persona deve
     * trovarsi **l'interruttore**, non la parola «fatto» — perché è quello che
     * fa Gemini, ed è misurato che funziona meglio.
     *
     * ⛔ La dichiara il TOOL e non la schermata: una mappa `nome → componente`
     * dentro la vista sarebbe un secondo posto da tenere allineato, e il primo
     * a invecchiare. È lo schema che la letteratura chiama *generative UI*.
     */
    scheda?: import('@/lib/tools/tracciaAzione').TalosScheda
    /**
     * ⛔ A8 — da dove viene il testo che sta in `content`.
     *
     * Facoltativo, e quando manca si ricade sulla bandiera statica del tool. Va
     * dichiarato da chi PUÒ saperlo davvero: `library_read` conosce l'origine
     * del file che ha aperto, `notes_list` conosce quella di ogni nota. Un tool
     * che non lo sa non deve indovinare — indovinare qui vorrebbe dire regalare
     * fiducia, ed è l'unico errore che non si vede finché non fa danno.
     *
     * Quando più elementi tornano insieme vince il PEGGIORE: un elenco di
     * quindici note di cui una viene dal web è un elenco che viene dal web.
     */
    contentOrigin?: import('@/lib/tools/security').TalosContentOrigin
}

export interface TalosToolContext {
    sessionId: string | null
    signal?: AbortSignal
}

export interface TalosToolDefinition<Input = unknown> {
    name: string
    /** Shown to a HUMAN in the consent sheet and the activity row. */
    title: string
    /** Read by the MODEL: it decides whether the tool fits the question. */
    description: string
    /**
     * Complete capability set for compound tools. `action` remains the stable
     * primary activity label; legacy tools omit this field and require only it.
     */
    requiredActions?: readonly TalosToolAction[]
    action: TalosToolAction
    /**
     * `always` is a hard per-call confirmation boundary. It ignores baseline
     * allow and saved grants; deny and disabled state still win.
     */
    confirmation?: 'policy' | 'always'
    input: ZodType<Input>
    run(input: Input, context: TalosToolContext): Promise<TalosToolResult>
    /**
     * ⛔ La postcondizione: «l'effetto c'è davvero?», chiesta DOPO.
     *
     * ## Perché non basta guardare com'è andata la chiamata
     *
     * Esiste una classe di guasti in cui **l'effetto avviene e la risposta si
     * perde**: il ponte va in timeout dopo aver consegnato, Android uccide
     * l'app fra la scrittura e la conferma, un'eccezione scatta dopo il commit.
     * La letteratura la chiama fallimento **non atomico** e la misura: chi
     * ritenta senza controllare produce doppioni nel **72%** dei casi, che
     * scendono al **20%** verificando lo stato prima — e l'ablazione dice che
     * quasi tutto il guadagno viene dalla sola verifica, non dal ritentativo
     * (arXiv 2608.02645, «Verified Tool Calls Improve LLM Agent Reliability
     * Under Non-Atomic Failures»).
     *
     * Da noi il ritentativo automatico non esiste — l'esecutore non ne ha — ma
     * lo fa il **modello**, appena legge `ok: false`. Stesso effetto, un piano
     * sopra: dire «non è andata» quando invece è andata **è** l'istruzione che
     * crea il doppione.
     *
     * ## Cosa fa l'esecutore con la risposta
     *
     * Va in **due direzioni**, e la seconda è quella che vale:
     *
     * - `run` è riuscito ma `verify` dice `held: false` ⇒ l'esito **si degrada**
     *   a fallimento, nominando la postcondizione che non regge. Un «fatto» su
     *   una cosa non fatta è peggio di un errore.
     * - `run` è fallito ma `verify` dice `held: true` ⇒ l'esito **si promuove** a
     *   riuscita, con `verified` nell'audit. È il caso non atomico.
     *
     * Facoltativo di proposito: si dichiara solo dove la verifica è **gratis**,
     * cioè dove basta rileggere quello che si è appena scritto. Una verifica che
     * costa una seconda chiamata di rete non è una verifica: è un altro tool.
     */
    /**
     * ⭐⭐⭐ LA PRECONDIZIONE: «esiste ciò che questa azione presume?», chiesta
     * **PRIMA** — prima della scheda di consenso, prima di `run`.
     *
     * ## È la metà simmetrica di `verify`, e mancava
     *
     * ```
     * premesse   esiste ciò che presumo?      →  PRIMA del consenso
     * run        l'azione
     * verify     l'effetto c'è davvero?       →  DOPO
     * ```
     *
     * `verify` impedisce di dire «fatto» su una cosa non fatta. `premesse`
     * impedisce una cosa peggiore: **chiedere alla persona di autorizzare
     * un'azione che è già impossibile**. Ogni scheda mostrata per una premessa
     * falsa è un consenso speso per niente — e insegna a toccare «Consenti»
     * senza leggere, che è il danno vero.
     *
     * ⇒ E riconoscere una premessa falsa è una **scelta** del modello, non una
     * sua proprietà: le scelte hanno una distribuzione, e una distribuzione non
     * è un invariante. La cura non è chiedere al modello di essere più
     * diligente — i divieti decadono dal 73% al 33% fra il turno 5 e il turno 16
     * (arXiv 2604.20911). È togliere a quella decisione il potere di arrivare
     * alla persona.
     *
     * ## ⛔ Dove sta l'aggancio, e perché lì
     *
     * Nell'**esecutore**, non dentro `run` e non nel testo che il modello
     * produce: un controllo che vive nell'output del modello lo si scavalca
     * scrivendo un altro output. Qui il modello propone e il runtime decide, ed
     * è la stessa mossa del compilatore col type checker.
     *
     * ## ⛔ E il tri-stato arriva fino all'effetto
     *
     * - `presente` ⇒ si prosegue, come sempre
     * - `assente`  ⇒ **terminale**: niente scheda, niente `run`, e al modello si
     *   dice *cosa* manca — se no riprova identico
     * - `ignoto`   ⇒ ⛔ **si prosegue**. Non sapere non autorizza a rifiutare:
     *   bloccare su `ignoto` renderebbe TALOS inutile appena un permesso è
     *   negato, e insegnerebbe che «non lo so» è un «no».
     *
     * Facoltativo di proposito, come `verify`: si dichiara dove la risposta è
     * **gratis** — una lettura locale già a disposizione. Una premessa che costa
     * una chiamata di rete non è una premessa: è un altro tool.
     */
    premesse?(input: Input, context: TalosToolContext): Promise<TalosPremessaEsito>
    /**
     * ⛔⛔ CHE FARE QUANDO LA PREMESSA È `ignoto` — e il default resta `continue`.
     *
     * Su una capacità del telefono, «non riesco a provare che la torcia sia
     * spenta» può ancora consentire un comando idempotente: rifiutare sempre
     * renderebbe TALOS inutile appena un permesso è negato o un ponte cade.
     *
     * Ma su «questa funzione esiste ed è il bersaglio che sto per sostituire?»
     * un `ignoto` **non autorizza una mutazione strutturale**. Le mutazioni di
     * codice dichiarano `reject`.
     *
     * ⛔ È una proprietà semantica del TOOL, non una preferenza dell'utente: non
     * va nelle impostazioni. Un utente non può sapere per quali predicati «non
     * lo so» è tollerabile.
     */
    premiseUnknownPolicy?: 'continue' | 'reject'
    verify?(
        input: Input,
        /**
         * Cosa ha restituito `run`, oppure **null** se ha sollevato.
         *
         * Il null e' il caso interessante: e' li' che si scopre se l'effetto
         * c'e' lo stesso. Chi verifica deve quindi poter lavorare col solo
         * input — di solito un id — e non dipendere dal risultato.
         */
        result: TalosToolResult | null,
        context: TalosToolContext,
    ): Promise<TalosToolVerdict>
}

/**
 * L'esito di una verifica di postcondizione.
 *
 * `reason` è obbligatorio quando non regge, e non è una cortesia: finisce nel
 * messaggio che il modello legge, e un modello a cui si dice «non ha funzionato»
 * senza dire cosa non ha funzionato riprova identico.
 */
export type TalosToolVerdict =
    | { held: true }
    | { held: false, reason: string }

/**
 * ⭐⭐⭐ L'esito di una PREMESSA — e gli stati sono **tre**, mai due.
 *
 * ## Perché non è un booleano
 *
 * «Non l'ho trovato» e «non c'è» sono due affermazioni diverse: la prima è un
 * fatto su di me, la seconda è un fatto sul mondo. Un sistema che le confonde
 * dice «assente» quando ha solo fallito una lettura — e su un telefono quella
 * bugia diventa «il contatto Marco non esiste» detto a chi ce l'ha in rubrica,
 * perché il permesso era negato.
 *
 * ```
 * presente  l'ho visto
 * assente   ho guardato TUTTO ciò che dovevo, e non c'è
 * ignoto    non posso dirlo — permesso negato, ponte giù, elenco troncato
 * ```
 *
 * ⛔ `assente` **solo** con copertura completa. Permesso negato, ponte caduto,
 * timeout, elenco parziale: tutti `ignoto`. Chi dichiara `assente` per un
 * fallimento di lettura ha già perso la proprietà per cui questo tipo esiste.
 */
export type TalosPremessaEsito =
    | { stato: 'presente', fatto?: TalosFattoPresunto }
    /**
     * ⛔ `perche` va al MODELLO e alla persona: nomina cosa manca, e dove.
     *
     * ⛔⛔ E `copertura` è **obbligatoria**: dichiarare assente qualcosa senza
     * dire fin dove si è guardato è la bugia esatta che questo tipo impedisce.
     * Vedi `TalosCopertura`.
     */
    | { stato: 'assente', perche: string, copertura: TalosCopertura, fatto?: TalosFattoPresunto }
    /** `perche` nomina l'ostacolo — «permesso contatti negato», non «errore». */
    | { stato: 'ignoto', perche: string, fatto?: TalosFattoPresunto }

/**
 * ⛔⛔⛔ FIN DOVE SI È GUARDATO — e senza, `assente` non significa niente.
 *
 * Per un contatto la copertura è implicita: la rubrica o si legge tutta o non si
 * legge, e non c'è una terza possibilità. **Per il codice no**, ed è la ragione
 * per cui questo campo esiste prima che la sezione codice sia scritta:
 *
 * ```
 * «scontoFedelta non c'è in src/prezzo.mjs»   dimostrabile
 * «scontoFedelta non c'è nel progetto»        quasi mai dimostrabile
 * ```
 *
 * Un file che non si lascia leggere, un'estensione che non sappiamo trattare, un
 * elenco troncato: ognuno rompe la seconda affermazione e lascia intatta la
 * prima. Chi dichiara `completa` avendo saltato un file ha detto una cosa falsa
 * con l'aria di aver controllato.
 *
 * ⛔ `parziale` NON autorizza un `assente`: esiste per l'audit, cioè per poter
 * dire dopo perché quella risposta era `ignoto`.
 */
export type TalosCopertura =
    /** Ho guardato **tutto** l'ambito dichiarato, e ogni parte si è lasciata leggere. */
    | 'completa'
    /** Qualcosa nell'ambito non si è lasciato leggere. ⇒ l'esito non può essere `assente`. */
    | 'parziale'

/**
 * ⭐⭐ CHE COSA si presume, e DOVE — la stessa forma per la chat e per il codice.
 *
 * Owner 2026-08-18: «il kernel deve occuparsi **anche di coding**, non solo
 * chat… anche nella app mobile andrà la nuova sezione codice».
 *
 * ⇒ Un kernel per gli attrezzi e uno per il codice sarebbero **due**, e due
 * divergono: uno guadagna la copertura per ambito, l'altro no, e il giorno in
 * cui la sezione codice chiede «questa funzione esiste?» si scopre che la
 * risposta la sa solo l'altro. Le famiglie cambiano; la forma no.
 */
export interface TalosFattoPresunto {
    /**
     * `contact-exists`, `app-installed`, `symbol-declared`, `file-exists`…
     *
     * ⛔ Una stringa e non un'enumerazione chiusa: le famiglie nasceranno da
     * ciò che gli attrezzi presumono davvero, e un'enumerazione qui costringe a
     * toccare questo file — cioè il contratto pubblico — per ogni attrezzo nuovo.
     */
    famiglia: string
    /** Il nome presunto: un contatto, un pacchetto, un simbolo. */
    nome: string
    /** Dove si presume che sia: un file, una cartella, l'intero dispositivo. */
    ambito?: string
}

export function defineTalosTool<Input>(definition: TalosToolDefinition<Input>): TalosToolDefinition<Input> {
    return definition
}

/**
 * One canonical permission view for schema offering, execution and audit.
 *
 * Always retain the primary action even if a malformed compound declaration
 * omits it, and remove duplicates without changing declaration order.
 */
export function talosToolRequiredActions(
    tool: Pick<TalosToolDefinition<never>, 'action' | 'requiredActions'>,
): TalosToolAction[] {
    const actions: TalosToolAction[] = [tool.action]
    for (const action of tool.requiredActions ?? []) {
        if (!actions.includes(action)) actions.push(action)
    }
    return actions
}

type JsonSchema = Record<string, unknown>

function schemaOf(tool: TalosToolDefinition<never>): JsonSchema {
    // zod 4 emits JSON Schema natively — no second schema to keep in sync, and
    // no chance of the validated shape and the advertised shape drifting apart.
    // It also emits `$schema`, which Gemini's OpenAPI-subset validator rejects
    // outright and OpenAI's strict mode refuses; nobody needs the dialect URL
    // inside a function declaration, so it is dropped here rather than in each
    // of the four translations.
    const { $schema: _dialect, ...schema } = z.toJSONSchema(tool.input, { io: 'input' }) as JsonSchema
    /**
     * A top-level union loses its `type`, and Anthropic refuses the whole call.
     *
     * Owner 2026-08-03, verbatim from the device:
     * `tools.4.custom.input_schema.type: Field required` — HTTP 400, every send
     * to Anthropic, not just the one that wanted the tool. `z.discriminatedUnion`
     * emits `{oneOf: [...]}` with no `type` of its own, which is correct JSON
     * Schema and unacceptable to a provider that requires the key.
     *
     * Saying `type: 'object'` here is not a guess: every branch of those unions
     * IS an object, and the tool-calling contract of all four providers takes an
     * object and nothing else. It is written down rather than assumed, and the
     * gate in registry.test.ts fails if a tool ever advertises otherwise.
     */
    if (typeof schema.type !== 'string') return { type: 'object', ...schema }
    return schema
}

/**
 * La stessa cosa, PIATTA — la forma che vuole `/v1/responses`.
 *
 * `name`, `description` e `parameters` accanto a `type: "function"`, non
 * annidati. Sta qui e non nel modulo dell'endpoint perche' deve passare dallo
 * STESSO `schemaOf`: e' li' che uno schema senza `type` viene normalizzato, e
 * due normalizzazioni diverse sarebbero due descrizioni dello stesso tool a
 * seconda di quale endpoint lo riceve.
 */
export function talosToolsForOpenAiResponses(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
): unknown[] {
    return tools.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: schemaOf(tool),
    }))
}

/**
 * ⭐ Le clausole che fanno ESPLODERE una grammatica, e che il motore locale non
 * deve ricevere.
 *
 * ## Il difetto, con il messaggio del parser in mano
 *
 * MISURATO sul Pad il 2026-08-08. Con 46 tool offerti, la GBNF che llama.cpp
 * costruisce dal nostro schema pesa **55.871 byte** e non compila:
 *
 * ```
 * parse: error parsing grammar: number of rules that are going to be repeated
 * multiplied by the new repetition exceeds sane defaults, please reduce the
 * number of repetitions or rule complexity
 * ```
 *
 * Non e' un errore di sintassi: e' una difesa del parser contro l'esplosione
 * delle regole. E la causa siamo noi: `z.string().max(2000)` diventa
 * `maxLength: 2000`, e la grammatica lo traduce in una regola **ripetuta fino a
 * duemila volte**. Moltiplicato per i campi di 46 tool, si sfonda il tetto.
 *
 * Conseguenza a valle, e non piccola: senza grammatica niente vincola la forma
 * **ne' la fine** della chiamata, quindi il modello locale la riscrive come
 * testo libero — cinque esecuzioni per una torcia sola, e la sintassi interna
 * leggibile in chat.
 *
 * ## ⛔ Perche' togliere questi limiti NON allenta niente
 *
 * La grammatica non e' il posto dove si validano gli argomenti: quello e' Zod,
 * all'esecuzione, e resta identico. Un `max(2000)` violato produce lo stesso
 * errore di prima, con lo stesso messaggio. Qui si toglie soltanto la pretesa
 * di far **contare i caratteri al campionatore** — che e' un uso della
 * grammatica sbagliato in partenza: costa un'esplosione di regole per garantire
 * una cosa che il livello sotto garantisce meglio.
 *
 * ⇒ Restano i tipi, i campi obbligatori e gli `enum`, che sono la parte che
 * serve davvero: dicono al modello COSA scrivere, non quanto lungo.
 */
const CLAUSOLE_CHE_ESPLODONO = new Set([
    'maxLength', 'minLength',
    'maxItems', 'minItems',
    'pattern',
    // I limiti numerici diventano regole per intervallo di cifre: piu' piccole
    // delle stringhe, ma dello stesso genere, e non servono al campionatore.
    'maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum',
    'multipleOf',
])

function senzaEsplosioni(valore: unknown): unknown {
    if (Array.isArray(valore)) return valore.map(senzaEsplosioni)
    if (valore && typeof valore === 'object') {
        return Object.fromEntries(
            Object.entries(valore as Record<string, unknown>)
                .filter(([chiave]) => !CLAUSOLE_CHE_ESPLODONO.has(chiave))
                .map(([chiave, dentro]) => [chiave, senzaEsplosioni(dentro)]),
        )
    }
    return valore
}

/**
 * ⭐ Il MOTORE SU QUESTO TELEFONO: stessi tool, stessa descrizione, stessi nomi.
 *
 * Cambia una cosa sola rispetto a `talosToolsForOpenAi`, ed e' quella che
 * decide se la grammatica si compila: gli schemi arrivano senza le clausole di
 * lunghezza e di intervallo. Nient'altro si muove — la parita' con i provider a
 * chiave e' un vincolo, non un obiettivo, e un tool non puo' avere due
 * descrizioni a seconda di chi lo esegue.
 */
export function talosToolsForLocalEngine(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
): unknown[] {
    return talosToolsForOpenAi(tools).map(senzaEsplosioni)
}

/** OpenAI, DeepSeek, OpenRouter and Ollama all speak this shape. */
export function talosToolsForOpenAi(tools: ReadonlyArray<TalosToolDefinition<never>>): unknown[] {
    return tools.map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: schemaOf(tool),
        },
    }))
}

export function talosToolsForAnthropic(tools: ReadonlyArray<TalosToolDefinition<never>>): unknown[] {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: schemaOf(tool),
    }))
}

/**
 * ⭐⭐⭐ LA RICERCA DEGLI ATTREZZI DI ANTHROPIC — il nome esatto, dalla doc.
 *
 * Due varianti: `regex`, dove il modello scrive un pattern Python, e `bm25`,
 * dove scrive in **lingua naturale**. Qui si usa BM25, e non per gusto: le
 * nostre descrizioni sono in inglese e chi scrive a TALOS scrive in italiano.
 * Con BM25 il ponte fra «annulla la sveglia» e `alarm` lo fa il modello, che
 * sa entrambe le lingue; con una regex lo dovrebbe fare una stringa di 200
 * caratteri, che non lo sa.
 *
 * ⛔ NON porta `defer_loading`: differire anche l'attrezzo di ricerca è il
 * primo dei due errori che la documentazione elenca, e rende 400.
 */
export const TALOS_RICERCA_ATTREZZI_ANTHROPIC = Object.freeze({
    type: 'tool_search_tool_bm25_20251119',
    name: 'tool_search_tool_bm25',
})

/**
 * ⭐⭐⭐ GLI ATTREZZI PER ANTHROPIC, APERTI A GRADI.
 *
 * ## Come funziona, in una riga
 *
 * Si spediscono **tutti** gli schemi, come sempre — l'API ne ha bisogno lato
 * server per cercare — ma quelli marcati `defer_loading: true` **non entrano
 * nel prefisso del prompt**. Il modello li scopre cercandoli, e l'API espande
 * la definizione in linea nel corpo della conversazione.
 *
 * ⇒ Due conseguenze che valgono più del risparmio:
 *  - **la cache del prompt resta valida**, perché il prefisso non si muove;
 *  - **nessun giro in più**, perché la ricerca gira sui server di Anthropic
 *    dentro lo stesso turno.
 *
 * ## ⛔ La guardia contro il 400
 *
 * «Almeno un attrezzo deve avere `defer_loading=false`». I nostri quattro
 * sempre-in-vista dipendono dai permessi: `web_search` sparisce se non c'è un
 * motore configurato, e in un caso limite potrebbero mancare tutti e quattro.
 * Allora non si differisce niente e si torna alla forma di prima — una lista
 * lunga è un difetto di efficienza, un 400 è una risposta che non arriva.
 */
export function talosAttrezziAnthropicAGradi(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
    vaDifferito: (nome: string) => boolean,
): unknown[] {
    const inVista = tools.filter((tool) => !vaDifferito(tool.name))
    if (inVista.length === 0) return talosToolsForAnthropic(tools)
    const riga = (tool: TalosToolDefinition<never>, differito: boolean) => ({
        name: tool.name,
        description: tool.description,
        input_schema: schemaOf(tool),
        ...(differito ? { defer_loading: true } : {}),
    })
    /*
     * ⛔⛔ L'ORDINE NON È ESTETICO: i differiti PRIMA, i sempre-in-vista IN
     * FONDO. Il taglio della cache di `promptCache` va sull'ULTIMO attrezzo, e
     * un differito non può portare `cache_control` — 400, nessuna risposta.
     * Visto sul Pad il 2026-08-13 alle 23:52 con Claude Haiku 4.5.
     *
     * Garantirlo qui con un ordinamento costa zero byte; cercarlo là ne costava
     * 62 al grafo d'avvio, che ha un tetto suo.
     */
    return [
        TALOS_RICERCA_ATTREZZI_ANTHROPIC,
        ...tools.filter((tool) => vaDifferito(tool.name)).map((tool) => riga(tool, true)),
        ...inVista.map((tool) => riga(tool, false)),
    ]
}

/**
 * Gemini reads an OpenAPI SUBSET, and `const` is not in it.
 *
 * Owner 2026-07-27, verbatim from the wire: `Unknown name "const" at
 * 'tools[0].function_declarations[8].parameters…one_of[0].properties[0].value'`
 * — the whole call refused. `const` arrives from every `z.literal()`, which is
 * how a discriminated union names its discriminator, so the first tool with one
 * broke Gemini for the entire suite.
 *
 * Rewritten, not dropped: a one-value `enum` says exactly what `const` said,
 * and Gemini accepts it. Dropping the discriminator would trade a 400 for a
 * schema that no longer tells the model which block is which.
 */
function forGeminiDialect(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(forGeminiDialect)
    if (node === null || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
        if (key === 'const') {
            /**
             * Owner 2026-07-30, live on the wire, the same bug one layer down:
             *
             *   Invalid value at '…enum[0]' (TYPE_STRING), 1
             *
             * Gemini's `enum` accepts STRINGS only. Rewriting every `const` to a
             * one-value enum fixed the string discriminators and broke the
             * numeric ones — `document_create` types a heading level as
             * `z.union([z.literal(1), z.literal(2), z.literal(3)])`, and each
             * became `enum: [1]`, which kills the whole call.
             *
             * A non-string literal keeps its meaning through `type` instead. The
             * exact value is lost, which is the honest trade: Gemini has nowhere
             * to put it, and saying "an integer" is true where `enum: [1]` was
             * simply refused.
             */
            if (typeof value === 'string') {
                out.enum = [value]
            } else if (typeof value === 'number') {
                out.type = Number.isInteger(value) ? 'integer' : 'number'
            } else if (typeof value === 'boolean') {
                out.type = 'boolean'
            }
            // null and anything else: no faithful representation exists, so the
            // key is dropped rather than turned into something untrue.
            continue
        }
        if (key === 'oneOf') {
            /**
             * `anyOf` is the one Gemini documents; `oneOf` is a maybe.
             *
             * The 400 the owner hit walked THROUGH `one_of` to complain about
             * `const`, which suggests it parsed — but "suggests" is not a thing
             * to ship to a distributed app. For a discriminated union the two
             * are interchangeable in practice: the branches are distinguished
             * by their discriminator enum, not by the exclusivity rule. So this
             * costs nothing and removes the doubt.
             */
            out.anyOf = forGeminiDialect(value)
            continue
        }
        /*
         * ⛔⛔ SI TIENE CIO' CHE E' PERMESSO, non si tolgono i vietati.
         *
         * MISURATO sul telefono dell'owner il 2026-08-10, HTTP 400 di
         * gemini-2.5-flash:
         *
         *   Invalid JSON payload received. Unknown name "additionalProperties"
         *   at 'tools[0].function_declarations[9].parameters': Cannot find field.
         *
         * ⇒ Qui c'era una lista di ECCEZIONI — `const`, `oneOf` — e ha retto
         * finche' nessuno schema ha prodotto una chiave nuova. Poi Zod ha
         * emesso `additionalProperties` su un tool, e Gemini ha rifiutato
         * l'INTERA chiamata: non un tool, tutta la conversazione.
         *
         * La ricerca dice che l'elenco dei rifiutati e' lungo e cresce —
         * `$schema`, `$defs`, `$ref`, `$id`, `default`, `title`, `examples`,
         * `propertyNames`, `additionalProperties`… Inseguirlo a colpi di
         * eccezioni significa aspettare il prossimo 400 in produzione.
         *
         * ⇒ Gemini accetta un SOTTOINSIEME di OpenAPI 3.0, e quel sottoinsieme
         * e' corto e documentato. Si tiene quello. Una chiave nuova che non c'e'
         * dentro viene lasciata fuori PRIMA di partire, e il difetto non nasce.
         */
        if (key === 'properties') {
            /*
             * ⛔ DENTRO `properties` le chiavi sono NOMI DI CAMPO, non parole
             * chiave di schema: `testo`, `quanti`, `tipo`. Applicarci la lista
             * degli ammessi li cancella tutti e lo schema esce VUOTO — cioe' il
             * modello smette di sapere cosa passare.
             *
             * Preso da un test un minuto dopo aver scritto il filtro: la cura
             * stava per diventare un difetto peggiore del difetto.
             */
            const campi: Record<string, unknown> = {}
            for (const [nome, sotto] of Object.entries(value as Record<string, unknown>)) {
                campi[nome] = forGeminiDialect(sotto)
            }
            out.properties = campi
            continue
        }
        if (!GEMINI_AMMESSE.has(key)) continue
        out[key] = forGeminiDialect(value)
    }
    return out
}

/**
 * Il sottoinsieme di OpenAPI 3.0 che `generateContent` accetta nei
 * `function_declarations`, dalla documentazione di Google.
 *
 * ⛔ `format` NON c'e': e' documentato come supportato ma solo per certi
 * valori, e uno sbagliato e' un altro 400. E' un suggerimento, non un
 * significato: toglierlo non cambia cosa il modello puo' chiamare.
 */
const GEMINI_AMMESSE: ReadonlySet<string> = new Set([
    'type', 'description', 'nullable', 'enum', 'items', 'properties',
    'required', 'minItems', 'maxItems', 'propertyOrdering', 'anyOf',
])

export function talosToolsForGemini(tools: ReadonlyArray<TalosToolDefinition<never>>): unknown[] {
    if (tools.length === 0) return []
    return [{
        functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: forGeminiDialect(schemaOf(tool)),
        })),
    }]
}

export type TalosToolArguments =
    | { ok: true; value: unknown }
    | { ok: false; error: string }

/**
 * Arguments arrive as a JSON string (OpenAI family) or as an object
 * (Anthropic). Both are validated against the same schema, and a failure is a
 * VALUE, not an exception: the message goes back to the model as a tool result
 * so it can correct itself, which is the difference between an agent that
 * recovers and one that derails.
 */
export function parseTalosToolCallArguments(
    tool: TalosToolDefinition<never>,
    raw: unknown,
): TalosToolArguments {
    let candidate: unknown = raw
    if (typeof raw === 'string') {
        const text = raw.trim()
        try {
            candidate = text === '' ? {} : JSON.parse(text)
        } catch {
            return { ok: false, error: 'The arguments were not valid JSON. Send a single JSON object.' }
        }
    }
    const parsed = tool.input.safeParse(candidate)
    if (parsed.success) return { ok: true, value: parsed.data }
    const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')
    return { ok: false, error: `The arguments do not match the schema — ${detail}` }
}
