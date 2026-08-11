import { reactive, readonly } from 'vue'
import {
    talosCreateHuggingFaceClient,
    type TalosHuggingFaceClient,
    type TalosHuggingFaceFailure,
    type TalosHuggingFaceModel,
    type TalosHuggingFaceSort,
} from '@/lib/models/huggingFace'
import {
    talosGroupGgufFiles,
    talosModelloDiUnSet,
    type TalosGgufSet,
} from '@/lib/models/ggufSet'
import { TALOS_GGUF_FIRST_READ_BYTES, talosReadGgufHeader } from '@/lib/models/gguf'
import { talosModelFit, type TalosModelFit, type TalosModelShape } from '@/lib/models/fit'
import { TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS } from '@/lib/models/localContextPolicy'
import { talosMeasureDevice, type TalosMeasuredDevice } from '@/services/deviceCapacity'
import { clearProviderKey, getProviderKey, setProviderKey } from '@/services/secureKeyStore'
import { talosCreateHubTransport } from '@/services/hubTransport'
import { talosLoadModelCatalogue } from '@/services/modelCatalogue'
import {
    talosRecommendFromCatalogue,
    type TalosCatalogueRecommendation,
} from '@/lib/models/catalogue'
import {
    talosModelTransferLeftovers,
} from '@/services/modelTransfer'
import {
    talosBeginModelTransfer,
    talosModelTransfers,
    talosPauseManagedModelTransfer,
    talosRefreshModelTransfer,
    talosResumeManagedModelTransfer,
} from '@/stores/modelTransfers'

/**
 * The download centre, as state.
 *
 * Everything underneath it has been built and proved separately — the Hub
 * client, the header reader, the fit arithmetic, the device probe, the native
 * transfer. This is where they become one answer to a question no other app in
 * this category asks: not "here are some files", but "this one runs on YOUR
 * phone, at this speed, and here is what it will cost you".
 *
 * The refusals matter more than the offers. A set missing a shard, a header
 * that cannot be read, a file the repository publishes no hash for, a model
 * that will not fit — each is stated with its reason rather than hidden behind
 * a disabled button, because a reason is something a person can act on.
 */

/** A sane starting point on a phone; the counter-offer moves it. */
export const TALOS_DEFAULT_LOCAL_CONTEXT = TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS

/**
 * The Hugging Face token sits with the provider keys, in the same Keystore.
 *
 * The same namespace on purpose: it IS a provider credential, and a second
 * secret store beside a working one is two things to audit and two to get
 * wrong. The native download job reads this exact entry.
 */
export const TALOS_HUGGING_FACE_PROVIDER = 'huggingface'

/**
 * How many times to go back for more header before giving up.
 *
 * Each round asks for exactly what the parser said it needed, so two are enough
 * for anything real; the third exists so a malformed header cannot turn into a
 * download of the whole file one doubling at a time.
 */
/**
 * Quanti giri di lettura concede la sonda dell'intestazione.
 *
 * Cinque, non tre, e il numero non e' arbitrario: partendo da un mebibyte, un
 * raddoppio per giro arriva a 32 MiB — cioe' esattamente al tetto — solo al
 * quinto. Con tre si fermava a otto, e un'intestazione da 10,9 MB (reale:
 * mradermacher/Holo-3.1-4B-i1) veniva dichiarata irraggiungibile sotto un
 * soffitto che non era mai stato sfiorato. La stima per estrapolazione arriva
 * quasi sempre prima; questo e' il paracadute per quando non c'e' niente da
 * estrapolare.
 */
const TALOS_GGUF_HEADER_ATTEMPTS = 5

/** Past this, it is not a header — and we are not fetching a model to read one. */
const TALOS_GGUF_MAX_HEADER_BYTES = 32 * 1024 * 1024

export type TalosSetExamination =
    | { state: 'unread' }
    | { state: 'reading' }
    | { state: 'read'; fit: TalosModelFit; quantisation: string | null; trainedContext: number }
    /** Named, never silent: an unreadable header is a model we will not vouch for. */
    | { state: 'unreadable'; reason: string }

export interface TalosLocalModelSet extends TalosGgufSet {
    examination: TalosSetExamination
}

export interface TalosLocalModelsState {
    query: string
    /**
     * I filtri accesi nella scheda del Hub, e la vista aperta.
     *
     * Owner 2026-08-06: «quando vado su una scheda modello e torno indietro mi
     * resetta i filtri». Vivevano nel componente e morivano con lui: aprire un
     * modello e tornare indietro cancellava la ricerca appena costruita, che è
     * il momento in cui costa di più — si è appena finito di restringere.
     *
     * Stanno qui accanto a `query` e `sort`, che sopravvivevano già: erano nel
     * posto giusto da soli, e la metà mancante è ciò che rendeva il ritorno
     * inutile.
     */
    browseFilters: string[]
    /** Vero quando il campo di ricerca del Hub è aperto. */
    browseSearchOpen: boolean
    /**
     * Quale delle due tab si sta guardando, e il filtro «entra in memoria» sui
     * modelli già scaricati.
     *
     * ⛔ Stessa lezione, imparata due volte nello stesso giorno: **tutto ciò che
     * la schermata ricorda deve stare qui**. Aprire un modello è una ROTTA, e
     * al ritorno il componente si rimonta da capo: qualunque `ref` locale
     * riparte dal valore iniziale. Il 2026-08-06 avevo spostato filtri, ricerca
     * e ordinamento e lasciato indietro questi due — e l'owner si è ritrovato
     * riportato sulla tab del dispositivo con il filtro spento, che dal suo
     * punto di vista è esattamente il difetto che avevo dichiarato chiuso.
     */
    browseTab: string
    installedFitsOnly: boolean
    /**
     * ⛔ **I DUE che l'owner usa davvero**: l'autore e la fascia di peso.
     *
     * Owner 2026-08-06, la seconda volta sullo stesso difetto: «vado sui
     * modelli, sull'area Hugging Face, imposto che ne so, più scaricati, è da
     * uno a quattro miliardi, clicco su un modello, poi torno indietro sia da
     * gesture che dal pulsante in alto a sinistra e mi annulla i filtri».
     *
     * La prima correzione aveva spostato le PILLOLE e lasciato i due MENU A
     * TENDINA — e i menu sono quelli che si usano per restringere sul serio.
     * Provare metà di una schermata e dichiararla a posto è lo stesso errore
     * di non provarla affatto.
     */
    browseProvider: string
    browseWeightBand: string
    /** La ricerca fra i modelli già scaricati, che si perdeva allo stesso modo. */
    installedQuery: string
    /** Come ordinare la lista sfogliata. I nomi sono quelli del Hub. */
    sort: TalosHuggingFaceSort
    searching: boolean
    results: TalosHuggingFaceModel[]
    searchFailure: string | null
    /**
     * Come chiedere la pagina dopo, oppure `null` = **non c'e' una pagina dopo**.
     *
     * Owner 2026-08-06: «non possiamo dare solo 20 risultati, e' da pazzi». Il
     * tetto era `searchModels(query, 20, sort)`: una pagina sola, e il resto del
     * Hub invisibile.
     */
    nextCursor: string | null
    /** Vero mentre arriva una pagina SUCCESSIVA, non la prima. */
    loadingMore: boolean
    /** Un guasto sulla pagina dopo NON cancella quelle gia' arrivate. */
    moreFailure: string | null
    repo: {
        id: string
        revision: string
        sets: TalosLocalModelSet[]
        loading: boolean
        /** Why opening it failed — never confused with the search's own failure. */
        failure: string | null
    } | null
    device: TalosMeasuredDevice | null
    context: number
    /** Whether one exists — never the token itself, which stays in the Keystore. */
    hasToken: boolean
    /**
     * The showcase, and what it means for THIS phone.
     *
     * The screen IS this list: the section opens with what the device can run,
     * already ranked, and free search on the Hub is the door underneath. That
     * is only possible because the catalogue carries `ram_working_bytes`, so a
     * verdict costs no network at all.
     */
    catalogue: {
        state: 'idle' | 'measuring' | 'ready' | 'absent'
        ageDays: number | null
        fromCache: boolean
        refusal: string | null
        recommended: TalosCatalogueRecommendation[]
        rejected: TalosCatalogueRecommendation[]
    }
    transfer: typeof talosModelTransfers
    leftovers: { items: Array<{ path: string; bytes: number }>; totalBytes: number }
}

const state = reactive<TalosLocalModelsState>({
    browseFilters: [],
    browseSearchOpen: false,
    browseTab: 'installed',
    installedFitsOnly: false,
    browseProvider: '',
    browseWeightBand: '',
    installedQuery: '',
    query: '',
    /*
     * L'ordinamento della lista sfogliata.
     *
     * Owner 2026-08-04: «metti anche ordinamenti con dropdown, la grammatica
     * c'e' gia'». I nomi sono quelli del Hub, non nostri: `downloads`,
     * `likes`, `lastModified`, `createdAt`. Inventarne di nostri vorrebbe dire
     * tradurli a ogni richiesta e sbagliare la traduzione una volta.
     *
     * Il predefinito e' «piu' scaricati»: e' il solo segnale onesto che l'API
     * offre su cosa funziona davvero, e chi apre la schermata non ha ancora una
     * preferenza.
     */
    sort: 'downloads',
    searching: false,
    results: [],
    searchFailure: null,
    nextCursor: null,
    loadingMore: false,
    moreFailure: null,
    repo: null,
    device: null,
    context: TALOS_DEFAULT_LOCAL_CONTEXT,
    hasToken: false,
    catalogue: {
        state: 'idle',
        ageDays: null,
        fromCache: false,
        refusal: null,
        recommended: [],
        rejected: [],
    },
    transfer: talosModelTransfers,
    leftovers: { items: [], totalBytes: 0 },
})

export const talosLocalModels = readonly(state)

/**
 * I filtri del Hub e l'apertura del campo, scritti dallo store e non dal
 * componente.
 *
 * Lo stato è esposto in sola lettura — è la regola di questo file — quindi un
 * componente che provasse a scriverci direttamente verrebbe ignorato in
 * silenzio. Ci sono passato: la prima stesura usava un `computed` con setter, i
 * filtri non si accendevano e niente lo diceva.
 */
export function talosSetBrowseFilters(filters: readonly string[]): void {
    state.browseFilters = [...filters]
}

export function talosSetBrowseSearchOpen(open: boolean): void {
    state.browseSearchOpen = open
}

export function talosSetBrowseTab(tab: string): void {
    state.browseTab = tab
}

export function talosSetInstalledFitsOnly(only: boolean): void {
    state.installedFitsOnly = only
}

export function talosSetBrowseProvider(provider: string): void {
    state.browseProvider = provider
}

export function talosSetBrowseWeightBand(band: string): void {
    state.browseWeightBand = band
}

export function talosSetInstalledQuery(query: string): void {
    state.installedQuery = query
}

let client: TalosHuggingFaceClient | null = null
let transportInUse: typeof globalThis.fetch | null = null
type TalosLocalTransferRequest = Parameters<typeof talosBeginModelTransfer>[0]

/**
 * @param transport injected so the whole store is provable without a network.
 *     The DEFAULT is the native transport, and that is the fix for a defect the
 *     whole unit suite certified as working: with the WebView's own `fetch`,
 *     `redirect: 'manual'` yields an opaque-redirect response — status 0, no
 *     headers — so the signed CDN address could never be read and the fit
 *     verdict failed on every model on every device. It is the default rather
 *     than something wired at boot precisely so nobody has to remember it.
 */
export function talosInitLocalModels(
    transport: typeof globalThis.fetch = talosCreateHubTransport(),
    token?: string,
): void {
    transportInUse = transport
    client = talosCreateHuggingFaceClient(token ? { fetch: transport, token } : { fetch: transport })
}

function requireClient(): TalosHuggingFaceClient {
    if (client === null) talosInitLocalModels()
    return client!
}

/**
 * A Hugging Face token, in the same Keystore the provider keys live in.
 *
 * Worth having even for someone who only wants open models: anonymous Hub
 * limits are per IP ADDRESS, and a mobile carrier puts thousands of subscribers
 * behind one, so without a token a user gets throttled for traffic that was
 * never theirs. It also unlocks repositories whose licence they have accepted.
 *
 * The value never reaches this store's state — only whether one exists. The
 * native download job reads it straight from the Keystore for the length of a
 * single request; it is never put in the job's extras, which Android persists
 * in the clear.
 */
export async function talosRefreshHuggingFaceToken(): Promise<void> {
    const token = await getProviderKey(TALOS_HUGGING_FACE_PROVIDER).catch(() => null)
    state.hasToken = token !== null
    talosInitLocalModels(transportInUse ?? talosCreateHubTransport(), token ?? undefined)
}

export async function talosSetHuggingFaceToken(token: string): Promise<void> {
    await setProviderKey(TALOS_HUGGING_FACE_PROVIDER, token)
    await talosRefreshHuggingFaceToken()
}

export async function talosForgetHuggingFaceToken(): Promise<void> {
    await clearProviderKey(TALOS_HUGGING_FACE_PROVIDER)
    await talosRefreshHuggingFaceToken()
}

function describe(failure: unknown): string {
    const known = failure as Partial<TalosHuggingFaceFailure>
    if (typeof known?.kind === 'string') {
        if (known.kind === 'rate-limited' && known.retryAfterSeconds) {
            return `rate-limited:${known.retryAfterSeconds}`
        }
        return known.kind
    }
    return 'transport'
}

/**
 * Measure the phone.
 *
 * Called again whenever the screen is opened rather than once at start: free
 * memory, free storage and heat all move, and a fit answer computed an hour ago
 * is a fit answer about a different phone.
 */
export async function talosRefreshDeviceCapacity(): Promise<void> {
    state.device = await talosMeasureDevice()
}

/**
 * Only the newest answer is allowed to land.
 *
 * Two searches and two repository opens can be in flight at once — a phone
 * changes networks, one request stalls and the next is instant — and without
 * these counters a slow EARLIER answer overwrites a fast later one, so the list
 * shows results for words the user has already replaced. Found by an
 * adversarial review, 2026-08-01.
 */
let searchGeneration = 0
let repoGeneration = 0

/**
 * Measure the phone, then answer it — in that order, and without the network.
 *
 * This is the screen's opening move, not a background nicety: the section shows
 * a list the moment it can, and the list means nothing until the device it is
 * about has been measured. The catalogue carries the working memory of every
 * model, so the ranking costs no request at all once the document is cached.
 */
export async function talosLoadLocalCatalogue(): Promise<void> {
    state.catalogue.state = 'measuring'
    state.catalogue.refusal = null

    await talosRefreshDeviceCapacity()
    const loaded = await talosLoadModelCatalogue()

    if (loaded.state !== 'ready') {
        state.catalogue.state = 'absent'
        // `unconfigured` is not a failure and must not read like one: this
        // build simply has no host and no key yet.
        state.catalogue.refusal = loaded.state === 'refused' ? loaded.reason : null
        state.catalogue.recommended = []
        state.catalogue.rejected = []
        /*
         * Senza catalogo curato si SFOGLIA il Hub, invece di mostrare il vuoto.
         *
         * Il documento curato porta la memoria di lavoro gia' misurata, quindi
         * quando c'e' e' meglio: la capienza si calcola senza una richiesta. Ma
         * quando non c'e' — ed e' il caso di questa build, che non ha un host
         * configurato — la schermata restava con un campo da riempire, che e'
         * esattamente cio' che l'owner ha chiesto di togliere.
         *
         * Non si aspetta l'esito: la lista arriva quando arriva, e intanto la
         * parte installata e' gia' usabile.
         */
        void talosSearchLocalModels('')
        return
    }

    const device = state.device
    const ranked = device ? talosRecommendFromCatalogue(loaded.catalogue.entries, device) : []

    state.catalogue.state = 'ready'
    state.catalogue.ageDays = loaded.ageDays
    state.catalogue.fromCache = loaded.fromCache
    state.catalogue.recommended = ranked.filter((row) => row.fits)
    // What does not fit STAYS on screen, with its reason. A model that vanishes
    // teaches nobody anything about their phone.
    state.catalogue.rejected = ranked.filter((row) => !row.fits)
}

export async function talosSearchLocalModels(query: string): Promise<void> {
    const generation = ++searchGeneration
    state.query = query
    state.searchFailure = null
    /*
     * Il vuoto SFOGLIA, non svuota.
     *
     * Owner 2026-08-04: «voglio una lista gia' caricata con un loading, con i
     * filtri». Prima una ricerca senza testo azzerava i risultati, quindi la
     * schermata si apriva vuota e restava vuota finche' non scrivevi qualcosa —
     * e su questo dispositivo il catalogo curato non arriva nemmeno, perche' e'
     * un documento su un host che questa build non ha configurato.
     *
     * Il Hub una lista ce l'ha: omettendo `search` risponde coi modelli GGUF
     * ordinati per download. Misurato contro l'API vera.
     */
    state.searching = true
    try {
        const page = await requireClient().searchModelsPage(query.trim(), {
            limit: TALOS_MODEL_PAGE_SIZE,
            sort: state.sort,
        })
        if (generation !== searchGeneration) return
        state.results = page.models
        state.nextCursor = page.nextCursor
        state.moreFailure = null
    } catch (failure) {
        if (generation !== searchGeneration) return
        state.results = []
        state.nextCursor = null
        state.searchFailure = describe(failure)
    } finally {
        if (generation === searchGeneration) state.searching = false
    }
}

/**
 * Quanti per pagina.
 *
 * Cinquanta e non venti perche' venti erano il TETTO totale, non una pagina, e
 * la prima schermata di un tablet ne mostra gia' piu' di venti: una pagina che
 * finisce prima di riempire lo schermo fa partire subito la seconda, e lo
 * scorrimento diventa una scala invece di un flusso.
 *
 * Non e' un numero sul modello ne' sul dispositivo, quindi non viola
 * `nothing-hardcoded-must-adapt`: e' una nostra politica, e questo e' il perche'.
 */
export const TALOS_MODEL_PAGE_SIZE = 50

/**
 * La pagina successiva, aggiunta in fondo a quelle gia' arrivate.
 *
 * ## Le tre cose che rendono questo diverso da «rifai la ricerca»
 *
 * 1. **Si accumula.** I risultati precedenti restano dove sono: chi ha scorso
 *    trecento righe non torna in cima perche' e' arrivata la pagina quattro.
 * 2. **Un guasto qui non cancella niente.** `moreFailure` e' separato da
 *    `searchFailure` proprio per questo: la rete che cade alla pagina tre non
 *    deve svuotare lo schermo.
 * 3. **Si ferma da sola.** `nextCursor` a null significa fine elenco, e chi
 *    disegna lo dice — uno scorrimento infinito che non dichiara mai la fine
 *    lascia tirare in basso per sempre una lista che non cresce piu'.
 *
 * Ignorata se una ricerca nuova e' partita nel frattempo: la generazione e' la
 * stessa guardia che protegge la prima pagina.
 */
export async function talosLoadMoreLocalModels(): Promise<void> {
    const cursor = state.nextCursor
    if (!cursor || state.loadingMore || state.searching) return
    const generation = searchGeneration
    state.loadingMore = true
    state.moreFailure = null
    try {
        const page = await requireClient().searchModelsPage(state.query.trim(), {
            limit: TALOS_MODEL_PAGE_SIZE,
            sort: state.sort,
            cursor,
        })
        if (generation !== searchGeneration) return
        // Per identificativo, non per posizione: il Hub riordina fra una pagina
        // e l'altra quando i download si muovono, e un doppione in lista e' una
        // riga che si puo' scaricare due volte.
        const visti = new Set(state.results.map((row) => row.id))
        state.results = [...state.results, ...page.models.filter((row) => !visti.has(row.id))]
        state.nextCursor = page.nextCursor
    } catch (failure) {
        if (generation !== searchGeneration) return
        state.moreFailure = describe(failure)
    } finally {
        if (generation === searchGeneration) state.loadingMore = false
    }
}

/**
 * Open a repository and turn it into the models it actually holds.
 *
 * Two requests, not one per file: the tree lists the GGUFs and a single
 * paths-info call returns every size and sha256 at once. Doing it per file is
 * how an app with a hundred-file repository walks into the rate limiter that
 * anonymous users share with everyone else behind their carrier's address.
 */
/**
 * Cambia ordinamento e RICARICA.
 *
 * L'ordinamento lo fa il Hub, non noi: riordinare in locale i venti che abbiamo
 * gia' darebbe «i venti piu' scaricati, ordinati per data» — che non e' «i piu'
 * recenti», ed e' la specie di bugia che nessuno nota finche' non cerca
 * qualcosa che c'e' ma non compare.
 */
/**
 * La scheda di un repository: autore, licenza, README.
 *
 * Non tocca lo stato: torna il dato e basta. Chi la chiama decide se e quando
 * mostrarla, e una scheda che fallisce non deve poter rompere la pagina del
 * modello — che serve a scegliere una variante, non a leggere una descrizione.
 */
export async function talosDescribeModelRepo(repo: string) {
    return requireClient().describeModel(repo)
}

export async function talosSetLocalModelSort(sort: TalosHuggingFaceSort): Promise<void> {
    if (state.sort === sort) return
    state.sort = sort
    await talosSearchLocalModels(state.query)
}

export async function talosOpenModelRepo(id: string, revision = 'main'): Promise<void> {
    const generation = ++repoGeneration
    // ⛔ L'eredita' e' di QUESTO repository: tenerla fra un'apertura e l'altra
    // vorrebbe dire, un giorno, dare la forma di un modello a un altro.
    letture.clear()
    state.repo = { id, revision, sets: [], loading: true, failure: null }
    try {
        const paths = await requireClient().listGgufFiles(id, revision)
        // A late answer must not resurrect a screen the user has left, nor
        // replace the repository they are looking at now.
        if (generation !== repoGeneration) return
        if (paths.length === 0) {
            state.repo = { id, revision, sets: [], loading: false, failure: null }
            return
        }
        const files = await requireClient().pathsInfo(id, revision, paths)
        if (generation !== repoGeneration) return
        state.repo = {
            id,
            revision,
            sets: talosGroupGgufFiles(files).map((set) => ({ ...set, examination: { state: 'unread' } })),
            loading: false,
            failure: null,
        }
    } catch (failure) {
        if (generation !== repoGeneration) return
        // The failure belongs to the REPOSITORY, not to the search.
        //
        // It was written into `searchFailure`, where the screen renders it in
        // place of the results list — so one failed open permanently replaced
        // the user's search with a bare error code. And the empty `sets` left
        // behind made the screen say "this repository has no GGUF files a phone
        // can open" about what was actually a rate limit. Found by an
        // adversarial review, 2026-08-01.
        state.repo = { id, revision, sets: [], loading: false, failure: describe(failure) }
    }
}

/** Back to the results. Not `open('')`, which would ask the Hub for nothing. */
export function talosCloseModelRepo(): void {
    repoGeneration += 1
    state.repo = null
}

/**
 * Read the model's own header and answer the only question that matters.
 *
 * About a megabyte over a Range request, spent before four gigabytes are
 * committed to. The file name is a hint written by whoever uploaded it; the
 * header is the model.
 */
export async function talosExamineSet(key: string): Promise<void> {
    const repo = state.repo
    const device = state.device
    if (!repo) return
    // Identified rather than handed in. Everything this store exposes is
    // `readonly`, so a caller passing a set back would be passing a frozen
    // proxy and every write here would vanish without a sound.
    const set = repo.sets.find((candidate) => candidate.paths[0] === key)
    if (!set) return
    if (!device) {
        set.examination = { state: 'unreadable', reason: 'no-device-measurement' }
        return
    }
    if (set.incomplete) {
        set.examination = { state: 'unreadable', reason: 'incomplete-set' }
        return
    }

    set.examination = { state: 'reading' }
    try {
        /**
         * Read, and read AGAIN when the parser says how much more it needs.
         *
         * The parser computes `needBytes` precisely so this can happen, and it
         * was thrown away: `truncated` became a terminal "unreadable" state. A
         * modern large-vocabulary GGUF routinely carries a header past one
         * mebibyte — its tokeniser alone is a hundred thousand strings — so the
         * models most worth checking were exactly the ones that could never be
         * checked. Found by an adversarial review, 2026-08-01.
         *
         * Bounded: each attempt asks for what the parser named, and after a few
         * rounds a header that keeps growing is a header we decline to chase.
         */
        let wanted = TALOS_GGUF_FIRST_READ_BYTES
        let parsed = talosReadGgufHeader(
            await requireClient().readHead(repo.id, repo.revision, set.paths[0]!, wanted),
            set.totalBytes)
        for (let attempt = 0; attempt < TALOS_GGUF_HEADER_ATTEMPTS; attempt += 1) {
            if (parsed.ok || parsed.reason !== 'truncated') break
            if (parsed.needBytes <= wanted || parsed.needBytes > TALOS_GGUF_MAX_HEADER_BYTES) break
            wanted = Math.min(parsed.needBytes, TALOS_GGUF_MAX_HEADER_BYTES)
            parsed = talosReadGgufHeader(
                await requireClient().readHead(repo.id, repo.revision, set.paths[0]!, wanted),
                set.totalBytes)
        }
        if (!parsed.ok) {
            set.examination = { state: 'unreadable', reason: parsed.reason }
            return
        }
        set.examination = {
            state: 'read',
            fit: talosModelFit({
                model: parsed.header.shape,
                device,
                context: state.context,
                fileBytes: set.totalBytes,
            }),
            // The header's own word, which outranks the file name it came with.
            quantisation: parsed.header.quantisation ?? set.quantisation,
            trainedContext: parsed.header.shape.trainedContext,
        }
        letture.set(set.paths[0]!, {
            forma: parsed.header.shape,
            inizioDeiPesi: parsed.header.dataOffset,
        })
    } catch (failure) {
        set.examination = { state: 'unreadable', reason: describe(failure) }
    }
}

/** Ciò che una lettura riuscita lascia in eredità alle altre qualità. */
const letture = new Map<string, { forma: TalosModelShape, inizioDeiPesi: number }>()

/**
 * ⭐⭐ ESAMINA UN REPOSITORY: una lettura per MODELLO, non per versione.
 *
 * ## Il difetto, con i numeri (misurato l'11 agosto)
 *
 * `local_model_inspect` leggeva l'intestazione di **ogni** versione, una dopo
 * l'altra, in fila. E le versioni sono tante: 18, 26, 29 nei tre repository
 * misurati. Il costo vero, cronometrato da rete fissa:
 *
 * | pezzo                              | costo                |
 * |------------------------------------|----------------------|
 * | una prima lettura da 1 MiB         | **1.630 ms**         |
 * | l'intestazione VERA di quel modello| **7,48 MiB**         |
 * | ⇒ richieste per versione           | **2** (1 MiB + 7,5)  |
 * | ⇒ 18 versioni in fila              | **~153 MB**, minuti  |
 *
 * È questo che l'owner ha visto come «DeepSeek ci mette un casino di tempo»:
 * non era il modello che risponde piano, era questo tool che scaricava
 * centocinquanta megabyte uno alla volta prima di poter dire qualcosa.
 *
 * ## Perché una sola lettura basta, e non è una scorciatoia
 *
 * Le versioni di un modello differiscono per la **qualità**, non per la forma:
 * misurato su IQ3_M, Q4_0 e Q8_0 dello stesso modello, blocchi, embedding,
 * teste, contesto addestrato e perfino il numero di tensori sono identici — e
 * **l'inizio dei pesi coincide byte per byte** (7.837.984 in tutti e tre).
 *
 * ⇒ `pesi = dimensione del file − inizio dei pesi` è **esatto**, non stimato:
 * l'unica cosa che cambia fra due qualità è quanto pesano i pesi, e quella la
 * dice la dimensione del file, che sappiamo già dall'elenco.
 *
 * ⛔ Il raggruppamento è per MODELLO e non per repository: vedi
 * `talosModelloDiUnSet`. E i capofila si leggono in **parallelo** fra loro,
 * perché sono modelli diversi e non c'è niente da riusare.
 */
export async function talosExamineRepo(): Promise<void> {
    const repo = state.repo
    if (!repo) return
    const gruppi = new Map<string, TalosLocalModelSet[]>()
    for (const set of repo.sets) {
        if (set.incomplete) continue
        const chiave = talosModelloDiUnSet(set)
        const gia = gruppi.get(chiave)
        if (gia) gia.push(set)
        else gruppi.set(chiave, [set])
    }
    await Promise.all([...gruppi.values()].map(async (membri) => {
        const capofila = membri[0]!
        await talosExamineSet(capofila.paths[0]!)
        const eredita = letture.get(capofila.paths[0]!)
        if (!eredita) return
        for (const altro of membri.slice(1)) talosEredita(altro, eredita)
    }))
}

/**
 * Applica a una versione la forma letta da un'altra dello stesso modello.
 *
 * ⛔ Non si copia il verdetto: si ricalcola con la dimensione di QUESTA
 * versione. Copiarlo direbbe che un Q8 da 3,4 GB sta in memoria come un IQ3 da
 * 1,6 — cioè esattamente la bugia che questo tool esiste per non dire.
 */
function talosEredita(
    set: TalosLocalModelSet,
    eredita: { forma: TalosModelShape, inizioDeiPesi: number },
): void {
    const device = state.device
    if (!device) return
    const pesi = set.totalBytes - eredita.inizioDeiPesi
    // Un file più piccolo dell'intestazione non è una versione: è un residuo.
    if (pesi <= 0) return
    const forma: TalosModelShape = { ...eredita.forma, weightBytes: pesi }
    set.examination = {
        state: 'read',
        fit: talosModelFit({
            model: forma,
            device,
            context: state.context,
            fileBytes: set.totalBytes,
        }),
        // ⛔ Qui il nome del file è l'UNICA fonte: l'intestazione letta è di
        // un'altra qualità, e riportare la sua direbbe che sono tutte uguali.
        quantisation: set.quantisation,
        trainedContext: forma.trainedContext,
    }
}

/** Re-answer every examined set at a new context length, without re-reading. */
export function talosSetLocalContext(context: number): void {
    state.context = context
}

export type TalosDownloadRefusal =
    | 'incomplete-set'
    | 'no-transfer'
    | 'already-running'
    | 'unsupported'
    | string

/**
 * Start, or refuse with a reason.
 *
 * A model that will not fit is NOT refused here. The fit card has already said
 * so in the user's own terms, and someone who reads "will crawl at 2 tokens a
 * second" and wants it anyway is entitled to it — this is their phone. What is
 * refused is what cannot work at all: a set the repository is missing pieces of.
 */
export async function talosDownloadSet(
    key: string,
    modelName?: string,
): Promise<{ ok: true } | { ok: false; reason: TalosDownloadRefusal }> {
    const repo = state.repo
    if (!repo) return { ok: false, reason: 'no-transfer' }
    const set = repo.sets.find((candidate) => candidate.paths[0] === key)
    if (!set) return { ok: false, reason: 'no-transfer' }
    if (set.incomplete) return { ok: false, reason: 'incomplete-set' }
    return startLocalTransfer({
        repo: repo.id,
        revision: repo.revision,
        // EVERY piece, each with its own length and its own hash. Handing over
        // only the first with the set's total is what made the job download one
        // shard, ask past its end, read the 416 as "the file changed" and delete
        // everything it had downloaded — found by an adversarial review on
        // 2026-08-01, in the same code that had just learned a set is one model.
        files: set.paths.map((path, index) => ({
            path,
            bytes: set.sizes[index] ?? 0,
            // Null is honest and the screen says so: this repository publishes
            // no hash for that piece, so it is one we cannot prove.
            sha256: set.sha256[index] ?? null,
        })),
        modelName: modelName ?? `${repo.id.split('/').pop()} ${set.label}`,
    })
}

async function startLocalTransfer(
    request: TalosLocalTransferRequest,
): Promise<{ ok: true } | { ok: false; reason: TalosDownloadRefusal }> {
    const started = await talosBeginModelTransfer(request)

    if (!started.ok) {
        return { ok: false, reason: started.reason }
    }
    return { ok: true }
}

export async function talosStopLocalDownload(id?: string): Promise<void> {
    await talosPauseManagedModelTransfer(id)
}

/** Resume from the native journal even after the repository route unmounted. */
export async function talosResumeLocalDownload(
    id?: string,
): Promise<{ ok: true } | { ok: false; reason: TalosDownloadRefusal }> {
    return talosResumeManagedModelTransfer(id)
}

export async function talosRefreshTransfer(): Promise<void> {
    await talosRefreshModelTransfer()
}

/**
 * What abandoned attempts are costing.
 *
 * The space is claimed before the first byte, so an attempt abandoned after ten
 * seconds still holds the whole file. Every app in this category leaves those
 * behind invisibly; naming them is what lets someone get the space back.
 */
export async function talosRefreshLeftovers(): Promise<void> {
    state.leftovers = await talosModelTransferLeftovers()
}
