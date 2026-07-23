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
    created_at: string
    updated_at: string
}

export interface CreateTaskInput {
    id: string
    title: string
    description: string | null
    run_id: string | null
    priority: TalosTaskPriority
    created_at: string
}

export interface TalosLocalNote {
    id: string
    title: string
    content: string
    trust_level: 'untrusted'
    created_at: string
    updated_at: string
}

export interface CreateNoteInput {
    id: string
    title: string
    content: string
    created_at: string
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
    listMessages(sessionId: string): Promise<TalosLocalChatMessage[]>
    appendMessage(input: AppendChatMessageInput): Promise<TalosLocalChatMessage>
    appendToolActivity(input: CreateToolActivityInput): Promise<TalosLocalToolActivity>
    updateToolActivity(activityId: string, input: UpdateToolActivityInput): Promise<void>
    listMessageToolActivities(messageId: string): Promise<TalosLocalToolActivity[]>
    listSessionToolActivities(sessionId: string): Promise<TalosLocalToolActivity[]>
    listVaultFiles(): Promise<TalosLocalVaultFile[]>
    getVaultFile(fileId: string): Promise<TalosLocalVaultFile | null>
    createVaultFile(input: CreateVaultFileInput): Promise<TalosLocalVaultFile>
    updateVaultFile(fileId: string, input: UpdateVaultFileInput): Promise<TalosLocalVaultFile>
    deleteVaultFile(fileId: string): Promise<void>
    createFileAuthorityGrant(input: CreateFileAuthorityGrantInput): Promise<TalosLocalFileAuthorityGrant>
    revokeFileAuthorityGrant(grantId: string): Promise<void>
    listMessageAttachments(messageId: string): Promise<TalosChatAttachmentBinding[]>
    loadComposerDraft(scopeId: string): Promise<string>
    saveComposerDraft(scopeId: string, draft: string): Promise<void>
    createTask(input: CreateTaskInput): Promise<TalosLocalTask>
    listTasks(): Promise<TalosLocalTask[]>
    setTaskStatus(taskId: string, status: TalosTaskStatus): Promise<TalosLocalTask>
    deleteTask(taskId: string): Promise<void>
    createNote(input: CreateNoteInput): Promise<TalosLocalNote>
    listNotes(): Promise<TalosLocalNote[]>
    deleteNote(noteId: string): Promise<void>
    createMemory(input: CreateMemoryInput): Promise<TalosLocalMemory>
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
