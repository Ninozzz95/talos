import { reactive, readonly } from 'vue'
import {
    talosCancelModelTransfer,
    talosModelTransferStatus,
    talosPauseModelTransfer,
    talosResumeModelTransfer,
    talosStartModelTransfer,
    type TalosTransferItem,
    type TalosTransferPhase,
    type TalosTransferRunner,
    type TalosTransferStatus,
} from '@/services/modelTransfer'
import {
    talosTransferNotices,
    type TalosTransferNotice,
} from '@/lib/models/transferNotices'
import { talosT } from '@/i18n'
import { useTalosMobileToasts } from '@/stores/toasts'

export interface TalosModelTransferState {
    items: TalosTransferItem[]
    phase: TalosTransferPhase
    active: boolean
    /** Compatibility view used by existing Model Lab/tool surfaces. */
    paused: boolean
    repo: string | null
    revision: string | null
    paths: readonly string[]
    modelName: string | null
    haveBytes: number
    totalBytes: number
    runner: TalosTransferRunner | null
    networkBound: boolean
    failure: string | null
    resumable: boolean
    readFailure: string | null
}

const state = reactive<TalosModelTransferState>({
    items: [],
    phase: 'idle',
    active: false,
    paused: false,
    repo: null,
    revision: null,
    paths: [],
    modelName: null,
    haveBytes: 0,
    totalBytes: 0,
    runner: null,
    networkBound: true,
    failure: null,
    resumable: false,
    readFailure: null,
})

export const talosModelTransfers = readonly(state)

let observers = 0
let poller: ReturnType<typeof setInterval> | null = null
/**
 * Le stesse tre notizie che Android gia' dava fuori dall'app, dette anche
 * dentro.
 *
 * Owner 2026-08-05: le notifiche di download devono andare «di pari passo col
 * sistema di notifiche Android». Il nativo postava progresso e fine da mesi; il
 * flusso dentro l'app non spingeva **nessun** toast, quindi chi guardava la
 * schermata era l'unico a non essere avvisato.
 *
 * Usa la grammatica che c'e' gia' — lo store dei toast — invece di aggiungerne
 * una seconda, come chiesto esplicitamente.
 */
function announce(prima: readonly TalosTransferItem[], dopo: readonly TalosTransferItem[]): void {
    const avvisi = talosTransferNotices(prima, dopo, annullati)
    /*
     * Un id annullato serve finche' la sua riga non e' sparita davvero. Poi va
     * dimenticato, altrimenti il registro cresce per tutta la sessione e — se
     * l'id venisse riusato — zittirebbe l'annuncio di un download successivo.
     *
     * Si pulisce per ID, non per nome del modello: due download dello stesso
     * repository hanno lo stesso nome e id diversi.
     */
    if (annullati.size) {
        const vivi = new Set(dopo.map((item) => item.id))
        for (const id of [...annullati]) if (!vivi.has(id)) annullati.delete(id)
    }
    for (const avviso of avvisi) (emitTransferNotice ?? pushToast)(avviso)
}

/**
 * Dove finiscono le frasi.
 *
 * Le spinge lo STORE, non un ascoltatore registrato da `App.vue`. La prima
 * versione faceva il contrario, ed e' costata il tetto d'avvio: importare
 * questo store dentro `App.vue` tirava l'intero servizio di trasferimento nel
 * grafo iniziale — **601.379 byte contro 600.000**, misurato dal cancello.
 *
 * Cosi' invece il costo resta dove il codice gia' viveva: chi carica i
 * trasferimenti carica anche i loro avvisi, e chi non li apre non paga niente.
 * `toasts` e' uno store di dati, non un disegno, ed e' gia' cio' che importa
 * `chatController`.
 *
 * Resta iniettabile per i test — l'unico motivo per cui l'indirezione valeva.
 */
let emitTransferNotice: ((notice: TalosTransferNotice) => void) | null = null

export function talosOnTransferNotice(sink: ((notice: TalosTransferNotice) => void) | null): void {
    emitTransferNotice = sink
}

function pushToast(notice: TalosTransferNotice): void {
    const chiave = notice.kind === 'started'
        ? 'localModels.transferStarted'
        : notice.kind === 'finished'
            ? 'localModels.transferFinished'
            : 'localModels.transferFailed'
    useTalosMobileToasts().push({
        message: talosT(chiave, { model: notice.modelName }),
        // Il fallimento resta piu' a lungo: e' l'unico che chiede una decisione.
        durationMs: notice.kind === 'failed' ? 8_000 : 4_000,
    })
}

let refreshing: Promise<void> | null = null

export function talosRefreshModelTransfer(): Promise<void> {
    if (refreshing) return refreshing
    refreshing = (async () => {
        const status = await talosModelTransferStatus()
        if (status.readFailure) {
            state.readFailure = status.readFailure
            return
        }
        applyStatus(status)
    })().finally(() => { refreshing = null })
    return refreshing
}

/** One ref-counted poller shared by all five chrome surfaces. */
export function talosRetainModelTransferObserver(): () => void {
    observers += 1
    if (observers === 1) {
        void talosRefreshModelTransfer()
        poller = setInterval(() => { void talosRefreshModelTransfer() }, 1_000)
    }
    let released = false
    return () => {
        if (released) return
        released = true
        observers = Math.max(0, observers - 1)
        if (observers === 0 && poller !== null) {
            clearInterval(poller)
            poller = null
        }
    }
}

type StartRequest = Parameters<typeof talosStartModelTransfer>[0]
type ManagedResult = { ok: true } | { ok: false; reason: string }

function rememberFailure(result: ManagedResult): ManagedResult {
    if (!result.ok) state.failure = result.reason
    return result
}

export async function talosBeginModelTransfer(request: StartRequest): Promise<ManagedResult> {
    const started = await talosStartModelTransfer(request)
    if (!started.ok) return rememberFailure(started)
    const totalBytes = request.files.reduce((sum, file) => sum + file.bytes, 0)
    const item: TalosTransferItem = {
        id: started.started.id,
        jobId: null,
        createdAtMs: Date.now(),
        phase: started.started.phase,
        active: moving(started.started.phase),
        repo: request.repo,
        revision: request.revision ?? 'main',
        paths: request.files.map((file) => file.path),
        modelName: request.modelName ?? request.files[0]?.path ?? null,
        haveBytes: 0,
        totalBytes,
        runner: started.started.runner,
        networkBound: started.started.networkBound,
        failure: null,
        resumable: true,
    }
    const at = state.items.findIndex((existing) => existing.id === item.id)
    if (at >= 0) state.items.splice(at, 1, item)
    else state.items.push(item)
    projectItems()
    /*
     * L'avvio si annuncia QUI, non dal poller.
     *
     * MISURATO sul dispositivo il 2026-08-05: la riga viene inserita nello
     * stato in modo ottimistico due istruzioni sopra, quindi quando il giro
     * successivo del poller confronta le istantanee l'elemento **c'e' gia'** e
     * non risulta nuovo — nessun avviso di partenza, mai.
     *
     * I test unitari non potevano vederlo: provavano la funzione pura, che era
     * ed e' corretta. Il difetto stava nella cucitura.
     *
     * Ed e' anche il posto giusto: partire e' un COMANDO, e chi lo esegue lo
     * sa. Il poller deve riportare solo cio' che SCOPRE.
     */
    if (at < 0) (emitTransferNotice ?? pushToast)({
        kind: 'started',
        modelName: item.modelName ?? item.id,
    })
    await talosRefreshModelTransfer()
    return { ok: true }
}

export async function talosPauseManagedModelTransfer(id?: string): Promise<ManagedResult> {
    const result = rememberFailure(await talosPauseModelTransfer(id))
    if (result.ok) {
        updateItem(id, (item) => ({ ...item, phase: 'pausing', active: true }))
        await talosRefreshModelTransfer()
    }
    return result
}

export async function talosResumeManagedModelTransfer(id?: string): Promise<ManagedResult> {
    const resumed = await talosResumeModelTransfer(id)
    if (!resumed.ok) return rememberFailure(resumed)
    updateItem(id ?? resumed.started.id, (item) => ({
        ...item,
        phase: resumed.started.phase,
        active: moving(resumed.started.phase),
        runner: resumed.started.runner,
        networkBound: resumed.started.networkBound,
        failure: null,
        resumable: true,
    }))
    await talosRefreshModelTransfer()
    return { ok: true }
}

export async function talosCancelManagedModelTransfer(id?: string): Promise<ManagedResult> {
    const result = rememberFailure(await talosCancelModelTransfer(id))
    if (result.ok) {
        if (id) {
            // Dichiarato PRIMA di toglierlo: la sua sparizione non e` una fine.
            annullati.add(id)
            const at = state.items.findIndex((item) => item.id === id)
            if (at >= 0) state.items.splice(at, 1)
            projectItems()
        }
        await talosRefreshModelTransfer()
    }
    return result
}

/**
 * Gli id che l'utente ha annullato.
 *
 * Servono perche' un download **riuscito** e uno **annullato** fanno la stessa
 * cosa: spariscono dalla lista. Chi annulla pero' lo sa, e dichiararlo qui e'
 * cio' che evita di annunciare «scaricato» a qualcosa che e' stato fermato.
 * Vedi [[transferNotices]].
 */
const annullati = new Set<string>()

function applyStatus(status: TalosTransferStatus): void {
    const rows = Array.isArray(status.items)
        ? status.items
        : legacyItems(status)
    const prima = state.items
    state.items = rows.map((item) => ({ ...item, paths: [...item.paths] }))
    announce(prima, state.items)
    state.phase = status.phase
    state.active = status.active
    state.paused = status.phase === 'paused'
    state.repo = status.repo
    state.revision = status.revision
    state.paths = [...status.paths]
    state.modelName = status.modelName
    state.haveBytes = status.haveBytes
    state.totalBytes = status.totalBytes
    state.runner = status.runner
    state.networkBound = status.networkBound
    state.failure = status.failure
    state.resumable = status.resumable
    state.readFailure = null
}

function legacyItems(status: TalosTransferStatus): TalosTransferItem[] {
    if (status.phase === 'idle') return []
    return [{
        id: 'legacy',
        jobId: null,
        createdAtMs: null,
        phase: status.phase,
        active: status.active,
        repo: status.repo,
        revision: status.revision,
        paths: [...status.paths],
        modelName: status.modelName,
        haveBytes: status.haveBytes,
        totalBytes: status.totalBytes,
        runner: status.runner,
        networkBound: status.networkBound,
        failure: status.failure,
        resumable: status.resumable,
    }]
}

function updateItem(
    requestedId: string | undefined,
    update: (item: TalosTransferItem) => TalosTransferItem,
): void {
    const id = requestedId ?? (state.items.length === 1 ? state.items[0]?.id : undefined)
    if (!id) return
    const at = state.items.findIndex((item) => item.id === id)
    if (at < 0) return
    state.items.splice(at, 1, update(state.items[at]!))
    projectItems()
}

function projectItems(): void {
    const first = state.items[0]
    if (!first) {
        Object.assign(state, {
            phase: 'idle' as const,
            active: false,
            paused: false,
            repo: null,
            revision: null,
            paths: [],
            modelName: null,
            haveBytes: 0,
            totalBytes: 0,
            runner: null,
            networkBound: true,
            failure: null,
            resumable: false,
        })
        return
    }
    Object.assign(state, {
        phase: first.phase,
        active: state.items.some((item) => item.active),
        paused: first.phase === 'paused',
        repo: first.repo,
        revision: first.revision,
        paths: [...first.paths],
        modelName: first.modelName,
        haveBytes: first.haveBytes,
        totalBytes: first.totalBytes,
        runner: first.runner,
        networkBound: first.networkBound,
        failure: first.failure,
        resumable: state.items.some((item) => item.resumable),
        readFailure: null,
    })
}

function moving(phase: TalosTransferPhase): boolean {
    return phase === 'queued'
        || phase === 'running'
        || phase === 'pausing'
        || phase === 'verifying'
}
