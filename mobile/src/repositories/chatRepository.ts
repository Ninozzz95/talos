import type { TalosContentOrigin } from '@/lib/tools/security'
export type TalosLocalChatSurface = 'chat' | 'browse'
export type TalosLocalChatMode = 'answer_only' | 'verified_execution'
export type TalosLocalChatPersistenceMode = 'persistent' | 'temporary'
export type TalosLocalMessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type TalosLocalMessageState = 'persisted' | 'pending' | 'failed'

export interface TalosLocalChatSession {
    id: string
    title: string
    surface: TalosLocalChatSurface
    mode: TalosLocalChatMode
    persistence_mode: TalosLocalChatPersistenceMode
    active_model_profile_id: string | null
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
    /**
     * Whether this chat has anything in it. Reported by `listSessions` only.
     *
     * Owner 2026-07-31, approved: «una chat entra nella cronologia solo quando
     * ha dentro qualcosa» — his list had six «Nuova chat» in it, one per chat
     * opened and not used.
     *
     * REPORTED rather than filtered. Filtering inside `listSessions` was the
     * first attempt and it was wrong: it changed what "the sessions" means for
     * everything that reads them — the active chat restored at boot, the
     * replacement nominated after a delete, the owner lookups in the controller
     * — and 29 tests said so. The list stays complete and the HISTORY is a view
     * over it, because those are two different things.
     *
     * Undefined means "not asked": a session handed back by `createSession` or
     * `renameSession` makes no claim either way.
     */
    has_messages?: boolean
}

export interface TalosLocalChatMessage {
    id: string
    session_id: string
    role: TalosLocalMessageRole
    content: string
    state: TalosLocalMessageState
    model_profile_id: string | null
    run_id: string | null
    ordinal: number
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
}

export interface TalosLocalChatAttachment {
    id: string
    session_id: string
    message_id: string | null
    display_name: string
    media_type: string
    size_bytes: number
    local_uri: string
    sha256: string | null
    status: 'pending' | 'available' | 'failed' | 'revoked'
    grant_scope: string | null
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
}

export type TalosVaultFileStatus = 'pending' | 'available' | 'failed' | 'revoked'
export type TalosFileAuthorityGrantStatus = 'active' | 'revoked'
export type TalosFileAuthorityPermission = 'model.read' | 'browser.upload'

export interface TalosLocalVaultFile {
    id: string
    display_name: string
    media_type: string
    size_bytes: number
    private_uri: string
    status: TalosVaultFileStatus
    trust: 'untrusted'
    sha256: string | null
    extracted_text: string | null
    failure_code: string | null
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
}

/** Perf (review 2026-07-25): the Library list without every document's full
 *  extracted_text — reading that on every send shipped the whole corpus across
 *  the native bridge. `text_preview` is a short excerpt for ranking only. */
export interface TalosLocalVaultFileSummary extends Omit<TalosLocalVaultFile, 'extracted_text'> {
    text_preview: string | null
}

export interface TalosLocalFileAuthorityGrant {
    id: string
    vault_file_id: string
    permissions: TalosFileAuthorityPermission[]
    status: TalosFileAuthorityGrantStatus
    label: string
    created_at: string
    updated_at: string
    revoked_at: string | null
}

export interface TalosChatAttachmentBinding {
    id: string
    session_id: string
    message_id: string
    vault_file_id: string
    grant_id: string
    display_name: string
    media_type: string
    size_bytes: number
    permissions: TalosFileAuthorityPermission[]
    grant_status: TalosFileAuthorityGrantStatus
    created_at: string
}

export interface TalosLocalToolActivity {
    id: string
    session_id: string
    message_id: string | null
    operation: string
    status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'recovery_required'
    payload: Record<string, unknown>
    evidence: Record<string, unknown>
    created_at: string
    updated_at: string
}

export interface CreateToolActivityInput {
    id: string
    session_id: string
    message_id: string | null
    operation: string
    status: TalosLocalToolActivity['status']
    payload: Record<string, unknown>
    evidence: Record<string, unknown>
    created_at: string
}

export interface UpdateToolActivityInput {
    status?: TalosLocalToolActivity['status']
    payload?: Record<string, unknown>
    evidence?: Record<string, unknown>
}

export interface CreateChatSessionInput {
    id: string
    title: string
    active_model_profile_id: string | null
    created_at: string
    surface?: TalosLocalChatSurface
    mode?: TalosLocalChatMode
    persistence_mode?: TalosLocalChatPersistenceMode
    metadata?: Record<string, unknown>
}

export interface AppendChatMessageInput {
    id: string
    session_id: string
    role: TalosLocalMessageRole
    content: string
    state: TalosLocalMessageState
    created_at: string
    model_profile_id?: string | null
    run_id?: string | null
    metadata?: Record<string, unknown>
    attachments?: readonly AppendChatAttachmentInput[]
}

export interface AppendChatAttachmentInput {
    id: string
    vault_file_id: string
    grant_id: string
}

export interface CreateVaultFileInput {
    id: string
    display_name: string
    media_type: string
    size_bytes: number
    private_uri: string
    status: TalosVaultFileStatus
    trust: 'untrusted'
    sha256: string | null
    extracted_text: string | null
    failure_code: string | null
    created_at: string
    metadata?: Record<string, unknown>
}

export interface UpdateVaultFileInput {
    /**
     * Il nome che si legge nella Libreria.
     *
     * Mancava, e la sua assenza rendeva impossibile rinominare un file: la riga
     * lo aveva da sempre (`display_name`), ma nessuno poteva cambiarlo. Un file
     * che nasce «documento (1).pdf» restava «documento (1).pdf» per sempre.
     */
    display_name?: string
    status?: TalosVaultFileStatus
    private_uri?: string
    sha256?: string | null
    extracted_text?: string | null
    failure_code?: string | null
    metadata?: Record<string, unknown>
}

export interface CreateFileAuthorityGrantInput {
    id: string
    vault_file_id: string
    permissions: readonly TalosFileAuthorityPermission[]
    label: string
    created_at: string
}

export interface UpdateChatSessionInput {
    title?: string
    surface?: TalosLocalChatSurface
    active_model_profile_id?: string | null
    metadata?: Record<string, unknown>
}

export interface ChatRepositoryOptions {
    now?: () => string
}

export type TalosMemoryScopeType = 'global' | 'project' | 'session'
export type TalosMemoryKind = 'preference' | 'project_fact' | 'procedure' | 'policy_note' | 'rejected'
export type TalosMemoryStatus = 'active' | 'disabled' | 'quarantined' | 'rejected'

// F4 Memory station — desktop-parity memory row: ALWAYS untrusted context,
// never instructions. Status transitions are the only lifecycle mutation.
export interface TalosLocalMemory {
    id: string
    scope_type: TalosMemoryScopeType
    scope_id: string | null
    kind: TalosMemoryKind
    status: TalosMemoryStatus
    title: string
    content: string
    source: string | null
    metadata: Record<string, unknown>
    trust_level: 'untrusted'
    /** A8 — la provenienza registrata quando la riga e' nata. */
    content_origin: TalosContentOrigin
    last_used_at: string | null
    created_at: string
    updated_at: string
}

export interface CreateMemoryInput {
    id: string
    scope_type: TalosMemoryScopeType
    scope_id: string | null
    kind: TalosMemoryKind
    title: string
    content: string
    source: string | null
    metadata: Record<string, unknown>
    created_at: string
    /**
     * ⛔ A8 — da dove viene il testo di questa riga.
     *
     * Non lo decide chi scrive: lo decide lo **stato della catena** nel momento
     * in cui la riga nasce (`talosOriginForWrite`). Una memoria che il modello
     * ha annotato dopo aver letto una pagina web viene da quella pagina, e
     * quando verra' riletta dovra' contaminare come farebbe la pagina.
     *
     * Assente = riga nata prima che la colonna esistesse, e si legge
     * **external**: il predefinito prudente non regala fiducia.
     */
    content_origin?: TalosContentOrigin
}

/** Solo cio' che l'utente puo' davvero voler correggere. */
export interface UpdateMemoryPatch {
    title?: string
    content?: string
    kind?: TalosMemoryKind
}

export type TalosTaskStatus = 'todo' | 'doing' | 'done'
export type TalosTaskPriority = 'low' | 'normal' | 'high'

export interface TalosLocalTask {
    id: string
    title: string
    description: string | null
    run_id: string | null
    priority: TalosTaskPriority
    status: TalosTaskStatus
    /** A8 — la provenienza registrata quando la riga e' nata. */
    content_origin: TalosContentOrigin
    /**
     * Quando ripartire da sola, in JSON — `null` per un'attività normale.
     *
     * Resta una stringa fin qui: il contratto della pianificazione vive in
     * `lib/tasks/schedule.ts`, dov'è provato, e il repository non deve
     * conoscerlo per salvarlo. Chi la legge la passa a `talosParseSchedule`,
     * che risponde `null` a qualunque cosa non abbia capito.
     */
    schedule_json: string | null
    /**
     * Cosa chiedere al modello quando parte. Separata dalla descrizione perché
     * la descrizione la legge un umano e questa la esegue una macchina:
     * confonderle significa mandare al modello degli appunti.
     */
    instruction: string | null
    /** Quando è partita l'ultima volta. Serve a NON rieseguire dopo un riavvio. */
    last_run_at: string | null
    created_at: string
    updated_at: string
}

/** Cosa si può cambiare di un'attività, senza toccarne lo stato. */
export interface UpdateTaskPatch {
    title?: string
    description?: string | null
    priority?: TalosTaskPriority
    schedule_json?: string | null
    instruction?: string | null
}

export interface CreateTaskInput {
    id: string
    title: string
    description: string | null
    run_id: string | null
    priority: TalosTaskPriority
    created_at: string
    /** Facoltativi: senza, nasce un'attività come quelle di prima. */
    schedule_json?: string | null
    instruction?: string | null
    /**
     * ⛔ A8 — da dove viene il testo di questa riga.
     *
     * Non lo decide chi scrive: lo decide lo **stato della catena** nel momento
     * in cui la riga nasce (`talosOriginForWrite`). Una nota che il modello ha
     * scritto dopo aver letto una pagina web viene da quella pagina, e quando
     * verra' riletta dovra' contaminare la conversazione come farebbe la
     * pagina.
     *
     * Assente = riga nata prima che la colonna esistesse, e si legge
     * **external**: il predefinito prudente non regala fiducia a righe di cui
     * non sappiamo la storia.
     */
    content_origin?: TalosContentOrigin
}

export interface TalosLocalNote {
    id: string
    title: string
    content: string
    trust_level: 'untrusted'
    /** A8 — la provenienza registrata quando la riga e' nata. */
    content_origin: TalosContentOrigin
    created_at: string
    updated_at: string
}

export interface CreateNoteInput {
    id: string
    title: string
    content: string
    created_at: string
    /**
     * ⛔ A8 — da dove viene il testo di questa riga.
     *
     * Non lo decide chi scrive: lo decide lo **stato della catena** nel momento
     * in cui la riga nasce (`talosOriginForWrite`). Una nota che il modello ha
     * scritto dopo aver letto una pagina web viene da quella pagina, e quando
     * verra' riletta dovra' contaminare la conversazione come farebbe la
     * pagina.
     *
     * Assente = riga nata prima che la colonna esistesse, e si legge
     * **external**: il predefinito prudente non regala fiducia a righe di cui
     * non sappiamo la storia.
     */
    content_origin?: TalosContentOrigin
}

/**
 * Cosa cambiare di una nota, e cosa lasciare com'è.
 *
 * I due campi sono facoltativi **separatamente** perché correggere il titolo di
 * un appunto lungo e riscriverne il corpo sono due gesti diversi. Con un solo
 * oggetto obbligatorio chi voleva cambiare il titolo avrebbe dovuto rimandare
 * indietro tutto il testo — e chiunque lo dimenticasse avrebbe svuotato la nota
 * senza volerlo. Il tool della chat è esattamente il chiamante che lo
 * dimenticherebbe.
 *
 * `updated_at` non sta qui: lo mette il deposito. Una data di modifica decisa da
 * chi scrive è una data che si può falsificare, e l'ordinamento della lista si
 * regge su quella.
 */
export interface UpdateNoteInput {
    id: string
    title?: string
    content?: string
}


/**
 * One entry of a research run's journal, as it sits on disk.
 *
 * `seq` is assigned by the caller, not by the database, and that is deliberate:
 * the writer knows how many entries it has already appended, so a write that
 * was acknowledged after the process died collides with `UNIQUE (run_id, seq)`
 * instead of being counted a second time. An autoincrement would happily give
 * the duplicate a new number and report money that was never spent.
 */
export interface TalosResearchJournalEntry {
    run_id: string
    seq: number
    kind: string
    at: string
    payload_json: string
}

/** The row the station lists. Derived from the journal, never the truth. */
export interface TalosResearchRunRow {
    id: string
    session_id: string
    question: string
    depth: string
    engine: string
    status: string
    started_at: string
    updated_at: string
}

export interface TalosChatRepository {
    initialize(): Promise<void>
    listSessions(): Promise<TalosLocalChatSession[]>
    getActiveSessionId(): Promise<string | null>
    createSession(input: CreateChatSessionInput): Promise<TalosLocalChatSession>
    selectSession(sessionId: string): Promise<void>
    renameSession(sessionId: string, title: string): Promise<TalosLocalChatSession>
    updateSession(sessionId: string, input: UpdateChatSessionInput): Promise<TalosLocalChatSession>
    /** SF-5: metadata-only write — recency (updated_at) is preserved. */
    updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<TalosLocalChatSession>
    deleteSession(sessionId: string): Promise<string | null>
    /**
     * Owner 2026-07-25 (defect #4): opening a chat used to load EVERY message,
     * so the conversations you use most became the slowest to open. `before` is
     * a KEYSET cursor (ordinal, id) rather than an offset — offsets make the
     * database walk and discard the rows it skips, which gets worse exactly as
     * the history grows.
     */
    listMessages(
        sessionId: string,
        options?: { limit?: number; before?: { ordinal: number; id: string } },
    ): Promise<TalosLocalChatMessage[]>
    appendMessage(input: AppendChatMessageInput): Promise<TalosLocalChatMessage>
    appendToolActivity(input: CreateToolActivityInput): Promise<TalosLocalToolActivity>
    updateToolActivity(activityId: string, input: UpdateToolActivityInput): Promise<void>
    listMessageToolActivities(messageId: string): Promise<TalosLocalToolActivity[]>
    listSessionToolActivities(sessionId: string): Promise<TalosLocalToolActivity[]>
    listVaultFiles(): Promise<TalosLocalVaultFile[]>
    listVaultFileSummaries(): Promise<TalosLocalVaultFileSummary[]>
    /**
     * I-03: which files contain these terms ANYWHERE in their text, and how
     * many of them — answered where the text already lives.
     *
     * Candidate selection used to score on `text_preview`, the first 600
     * characters, so a word further in was invisible: the file was dropped
     * before its full text was ever read, and the user was told their document
     * does not mention something it plainly does.
     *
     * A longer preview only moves the cliff. This asks the question in SQL and
     * returns ids and small integers, so recall stops depending on position
     * without loading the corpus into memory to achieve it.
     *
     * Only files with at least one hit appear. No terms, or only blank ones,
     * means no hits — never "everything".
     *
     * Case folding is ASCII-only in the SQL implementation, so an accented
     * capital matches case-sensitively. A unicode61 FTS index would fix that,
     * and is the reason to want one.
     */
    matchVaultFileTerms(terms: readonly string[]): Promise<Record<string, number>>
    getVaultFile(fileId: string): Promise<TalosLocalVaultFile | null>
    createVaultFile(input: CreateVaultFileInput): Promise<TalosLocalVaultFile>
    updateVaultFile(fileId: string, input: UpdateVaultFileInput): Promise<TalosLocalVaultFile>
    deleteVaultFile(fileId: string): Promise<void>
    createFileAuthorityGrant(input: CreateFileAuthorityGrantInput): Promise<TalosLocalFileAuthorityGrant>
    revokeFileAuthorityGrant(grantId: string): Promise<void>
    listMessageAttachments(messageId: string): Promise<TalosChatAttachmentBinding[]>
    /**
     * Defect #4 follow-up: with the view paged, the turns sent to the model are
     * rebuilt from the FULL history at send time — and resolving attachment
     * parts message by message would be one query per message. This is the one
     * query that says which messages have any.
     */
    listSessionAttachmentMessageIds(sessionId: string): Promise<string[]>
    /**
     * The vault files ATTACHED anywhere in one chat.
     *
     * `talos_vault_files` has no session column — a document's origin lives in
     * its metadata JSON — so "this chat's files" cannot be one query. This is
     * the half the metadata cannot answer: documents picked out of the global
     * Library and sent here, which carry another chat's origin. The per-chat
     * gallery unions the two.
     */
    listSessionAttachmentFileIds(sessionId: string): Promise<string[]>
    loadComposerDraft(scopeId: string): Promise<string>
    saveComposerDraft(scopeId: string, draft: string): Promise<void>
    createTask(input: CreateTaskInput): Promise<TalosLocalTask>
    listTasks(): Promise<TalosLocalTask[]>
    setTaskStatus(taskId: string, status: TalosTaskStatus): Promise<TalosLocalTask>
    /**
     * Cambia i campi di un'attività che esiste. I campi omessi restano.
     *
     * ⛔ Separata da `setTaskStatus` e non fusa con lei: lo stato si cambia
     * cento volte più spesso di tutto il resto, e chiederlo dentro una patch
     * generica costringerebbe chi spunta un'attività a mandare anche il titolo.
     * Vedi la nota su `tasks_complete` in `lib/tools/tasksWriteTools.ts`.
     *
     * `null` esplicito cancella il campo; assente lo lascia com'è — la
     * differenza serve, perché «togli la scadenza» e «non toccare la scadenza»
     * sono due richieste diverse.
     */
    updateTask(taskId: string, patch: UpdateTaskPatch): Promise<TalosLocalTask>
    deleteTask(taskId: string): Promise<void>
    createNote(input: CreateNoteInput): Promise<TalosLocalNote>
    listNotes(): Promise<TalosLocalNote[]>
    /**
     * Corregge una nota che esiste già.
     *
     * Mancava del tutto: una nota si poteva creare e cancellare, mai
     * modificare. L'entità portava `updated_at` fin dall'inizio e nessuno lo
     * muoveva mai — un campo che raccontava una storia che non poteva accadere.
     * Chi si accorgeva di un refuso doveva cancellare e riscrivere, cioè perdere
     * la data di creazione e l'identità della nota.
     *
     * Solleva `TALOS_NOTE_NOT_FOUND` se non c'è: silenziare l'assenza
     * trasformerebbe una modifica persa in un successo apparente.
     */
    updateNote(input: UpdateNoteInput): Promise<TalosLocalNote>
    /**
     * Appends one entry to a run's journal, or refuses.
     *
     * Returns false when that `seq` is already there — a duplicate, not an
     * error. The caller is a process that may have died between writing and
     * learning that it wrote, so the second attempt is expected behaviour and
     * must be silent, not fatal.
     */
    appendResearchEvent(entry: TalosResearchJournalEntry): Promise<boolean>
    /** The whole journal of one run, in the order it happened. */
    readResearchJournal(runId: string): Promise<TalosResearchJournalEntry[]>
    /** Keeps the listing row in step with the journal that produced it. */
    upsertResearchRun(row: TalosResearchRunRow): Promise<void>
    listResearchRuns(): Promise<TalosResearchRunRow[]>
    /**
     * Removes a research: its journal, its listing row, and the dossiers it
     * wrote into the Library.
     *
     * The dossiers go with it because a research IS its sources — leaving them
     * behind would keep the pages the run paid for while losing the only record
     * that says why they were fetched, and the Library would fill with files
     * nobody can trace. Returns the vault ids it removed, so the caller can say
     * what went.
     */
    deleteResearchRun(runId: string): Promise<readonly string[]>
    deleteNote(noteId: string): Promise<void>
    createMemory(input: CreateMemoryInput): Promise<TalosLocalMemory>
    upsertMemory(input: CreateMemoryInput): Promise<TalosLocalMemory>
    /**
     * Cambia il TESTO di una memoria, lasciando stare tutto il resto.
     *
     * ⛔ Non e' `upsertMemory` con meno campi, ed e' il motivo per cui esiste.
     *
     * `upsertMemory` rimette `status = 'active'` e `trust_level = 'untrusted'`
     * a ogni scrittura, perche' nasce per far ENTRARE una riga. Usarlo per una
     * correzione avrebbe un effetto che nessuno chiede e nessuno vede: una
     * memoria che l'utente aveva **disattivato** tornerebbe viva perche' il
     * modello ne ha corretto una virgola. Lo stato di una memoria e' una
     * decisione dell'utente, e una modifica al testo non la revoca.
     *
     * Restituisce la riga aggiornata. Solleva `TALOS_MEMORY_NOT_FOUND` se l'id
     * non esiste, invece di crearla: chi chiama credeva che ci fosse.
     */
    updateMemory(memoryId: string, patch: UpdateMemoryPatch): Promise<TalosLocalMemory>
    listMemories(): Promise<TalosLocalMemory[]>
    updateMemoryStatus(memoryId: string, status: TalosMemoryStatus): Promise<TalosLocalMemory>
    touchMemories(memoryIds: string[], usedAt: string): Promise<void>
    deleteMemory(memoryId: string): Promise<void>
    close(): Promise<void>
}

export const TALOS_COMPOSER_DRAFT_MAX_LENGTH = 262_144

const TALOS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const TALOS_SHA256_PATTERN = /^[a-f0-9]{64}$/i

/** SF5-6: station titles share the sessions discipline — trimmed, 1..255. */
export function normalizeStationTitle(value: string): string {
    const title = value.replace(/\s+/g, ' ').trim().slice(0, 255)
    if (!title) throw new Error('TALOS_TITLE_INVALID')
    return title
}

export function normalizeRepositoryId(value: string): string {
    if (!TALOS_ID_PATTERN.test(value)) throw new Error('TALOS_LOCAL_ID_INVALID')
    return value
}

export function normalizeVaultDisplayName(value: string): string {
    const leaf = value.replaceAll('\\', '/').split('/').at(-1)?.replace(/[\u0000-\u001f\u007f]/g, '').trim() ?? ''
    if (!leaf || leaf === '.' || leaf === '..' || leaf.length > 255) {
        throw new Error('TALOS_ATTACHMENT_NAME_INVALID')
    }
    return leaf
}

export function normalizeVaultMediaType(value: string): string {
    const normalized = value.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(normalized)
        || normalized.length > 127) {
        throw new Error('TALOS_ATTACHMENT_MEDIA_TYPE_INVALID')
    }
    return normalized
}

export function normalizeVaultSize(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10 * 1024 * 1024) {
        throw new Error('TALOS_ATTACHMENT_SIZE_INVALID')
    }
    return value
}

export function normalizeVaultSha256(value: string | null): string | null {
    if (value === null) return null
    if (!TALOS_SHA256_PATTERN.test(value)) throw new Error('TALOS_ATTACHMENT_SHA256_INVALID')
    return value.toLowerCase()
}

export function normalizeFileAuthorityPermissions(
    value: readonly TalosFileAuthorityPermission[],
): TalosFileAuthorityPermission[] {
    if (!Array.isArray(value) || value.length === 0) throw new Error('TALOS_FILE_GRANT_PERMISSION_INVALID')
    const normalized = [...new Set(value)]
    if (normalized.length !== value.length
        || normalized.some((permission) => permission !== 'model.read' && permission !== 'browser.upload')) {
        throw new Error('TALOS_FILE_GRANT_PERMISSION_INVALID')
    }
    return normalized.sort()
}

export function normalizeComposerDraftScope(value: string): string {
    const scope = value.trim()
    if (!scope || scope.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(scope)) {
        throw new Error('TALOS_COMPOSER_DRAFT_SCOPE_INVALID')
    }
    return scope
}

export function normalizeComposerDraft(value: string): string {
    if (value.length > TALOS_COMPOSER_DRAFT_MAX_LENGTH) {
        throw new Error('TALOS_COMPOSER_DRAFT_TOO_LARGE')
    }
    return value
}

export function normalizeChatTitle(value: string): string {
    const title = value.trim()
    if (!title) throw new Error('TALOS_CHAT_TITLE_REQUIRED')
    return title.slice(0, 255)
}

export function normalizeChatSurface(value: string): TalosLocalChatSurface {
    if (value !== 'chat' && value !== 'browse') throw new Error('TALOS_CHAT_SURFACE_INVALID')
    return value
}

export function cloneJsonObject(value: Record<string, unknown> = {}): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('TALOS_CHAT_METADATA_INVALID')
    }
    try {
        const encoded = JSON.stringify(value)
        const decoded: unknown = JSON.parse(encoded)
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
            throw new Error('invalid')
        }
        return decoded as Record<string, unknown>
    } catch {
        throw new Error('TALOS_CHAT_METADATA_INVALID')
    }
}

export function normalizeToolOperation(value: string): string {
    const operation = value.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operation)) {
        throw new Error('TALOS_TOOL_ACTIVITY_OPERATION_INVALID')
    }
    return operation
}
