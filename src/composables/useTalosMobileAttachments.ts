import { computed, reactive, readonly, ref, type ComputedRef, type Ref } from 'vue'
import type { TalosPickedFile } from '@/services/nativeFilePicker'
import type { TalosTranslate } from '@/i18n/contracts'
import { TALOS_MOBILE_ATTACHMENT_LIMITS } from '@/lib/chat/attachmentContracts'
import type {
    AppendChatAttachmentInput,
    TalosFileAuthorityPermission,
    TalosLocalVaultFile,
} from '@/repositories/chatRepository'
import type { TalosNativeFilePicker } from '@/services/nativeFilePicker'
import type {
    TalosGeneratedOrigin,
    TalosGeneratedTextInput,
    TalosVaultService,
    TalosVaultTrayItem,
} from '@/services/talosVaultService'

export type TalosMobileAttachmentDraftStatus = 'ingesting' | 'authorized' | 'failed'
export type TalosMobileAttachmentDraftSource = 'picker' | 'vault'

export interface TalosMobileAttachmentDraft {
    id: string
    source: TalosMobileAttachmentDraftSource
    displayName: string
    mediaType: string
    sizeBytes: number
    status: TalosMobileAttachmentDraftStatus
    vaultFileId: string | null
    grantId: string | null
    bindingId: string | null
    permissions: readonly TalosFileAuthorityPermission[]
    error: string | null
}

export interface TalosMobileAttachmentsOptions {
    picker: TalosNativeFilePicker
    vault: TalosVaultService
    translate: TalosTranslate
    idFactory?: () => string
    /** The active chat, stamped as a file's origin (provenance + grouping). */
    currentSessionId?: () => string | null
    /**
     * Se un'immagine puo' uscire da questo telefono, e come chiederlo.
     *
     * Owner 2026-08-04. Sta qui e non nella schermata perche' questo e' il
     * punto UNICO da cui passano tutte le vie — scelta file, fotocamera,
     * galleria — e un cancello messo su una sola di quelle e' un cancello con
     * tre porte accanto.
     */
    imageConsent?: () => 'allow' | 'ask' | 'deny'
    askImageConsent?: (count: number) => Promise<'allow' | 'once' | 'deny'>
}

export interface TalosMobileAttachmentsController {
    readonly items: readonly TalosMobileAttachmentDraft[]
    readonly vaultFiles: readonly TalosLocalVaultFile[]
    readonly selecting: Readonly<Ref<boolean>>
    readonly error: Readonly<Ref<string | null>>
    readonly vaultLoading: Readonly<Ref<boolean>>
    readonly vaultError: Readonly<Ref<string | null>>
    readonly hasAuthorized: ComputedRef<boolean>
    readonly blocking: ComputedRef<boolean>
    readonly bindings: ComputedRef<AppendChatAttachmentInput[]>
    initialize(): Promise<void>
    refreshVault(): Promise<void>
    selectFiles(): Promise<void>
    takePhoto(): Promise<void>
    pickPhotos(): Promise<void>
    /**
     * Save a chat-generated artifact into the Library (origin='generated').
     *
     * The origin bag carries what only the caller knows — which model made it,
     * on which provider, answering which message — and `model`/`provider` are
     * required so a layer cannot quietly drop them (famiglia B).
     */
    saveGenerated(
        input: TalosGeneratedTextInput,
        origin: TalosGeneratedOrigin,
    ): Promise<TalosLocalVaultFile>
    /** F2: a generated file that is bytes (xlsx, pdf, docx, pptx). */
    saveGeneratedBinary(
        input: { name: string; mediaType: string; bytes: Uint8Array },
        forMessage: false,
        origin: TalosGeneratedOrigin,
    ): Promise<TalosLocalVaultFile>
    saveGeneratedBinary(
        input: { name: string; mediaType: string; bytes: Uint8Array },
        forMessage: true,
        origin: TalosGeneratedOrigin,
    ): Promise<{ file: TalosLocalVaultFile; attachment: AppendChatAttachmentInput }>
    /** Object URL for a file's bytes (image thumbnail / open). Caller revokes it. */
    previewUrl(fileId: string): Promise<string | null>
    /** The raw bytes, for handing a file to another app. */
    previewBytes(fileId: string): Promise<Uint8Array | null>
    /** Full extracted text for one file (the list holds bounded previews). */
    hydrateText(fileId: string): Promise<string | null>
    attachExisting(file: TalosLocalVaultFile): Promise<boolean>
    remove(itemId: string): Promise<void>
    deleteVaultFile(fileId: string): Promise<void>
    /**
     * Remove many files as ONE operation, and answer which ones survived.
     *
     * Not a loop over `deleteVaultFile`: that re-reads the whole vault after
     * every file (twenty documents, twenty list queries, a list visibly
     * disintegrating) and stops at the first failure, leaving the deletion half
     * done with no account of what is left. Returns the ids it could NOT
     * remove — empty means everything went.
     */
    deleteVaultFiles(fileIds: readonly string[]): Promise<string[]>
    /** The reason the last `deleteVaultFiles` lost a file, once. Null if none. */
    takeDeleteFailure(): string | null
    /** Debt S7: withdraw a document from model context, or put it back. */
    setVaultFileShared(fileId: string, shared: boolean): Promise<void>
    discardAll(): Promise<void>
    clearSent(): void
    clearError(): void
}

function attachmentErrorMessage(error: unknown, translate: TalosTranslate): string {
    const code = error instanceof Error ? error.message : ''
    const messages: Record<string, string> = {
        TALOS_ATTACHMENT_TOO_MANY_FILES: 'chat.attachmentErrors.tooMany',
        TALOS_ATTACHMENT_MESSAGE_TOO_LARGE: 'chat.attachmentErrors.messageTooLarge',
        TALOS_ATTACHMENT_FILE_TOO_LARGE: 'chat.attachmentErrors.fileTooLarge',
        TALOS_ATTACHMENT_SIGNATURE_MISMATCH: 'chat.attachmentErrors.typeMismatch',
        TALOS_ATTACHMENT_TYPE_MISMATCH: 'chat.attachmentErrors.typeMismatch',
        TALOS_ATTACHMENT_EXTENSION_UNSUPPORTED: 'chat.attachmentErrors.unsupported',
        TALOS_ATTACHMENT_ANALYSIS_TIMEOUT: 'chat.attachmentErrors.analysisTimeout',
        TALOS_ATTACHMENT_ANALYSIS_FAILED: 'chat.attachmentErrors.analysisFailed',
        TALOS_VAULT_FILE_UNAVAILABLE: 'chat.attachmentErrors.vaultUnavailable',
    }
    // Never surface a raw TALOS_* code to the UI — an unmapped code falls back
    // to the friendly generic, same as any other unexpected error.
    return translate(messages[code] ?? 'chat.attachmentErrors.generic')
}

export function useTalosMobileAttachments(
    options: TalosMobileAttachmentsOptions,
): TalosMobileAttachmentsController {
    const idFactory = options.idFactory ?? (() => crypto.randomUUID())
    const items = reactive<TalosMobileAttachmentDraft[]>([])
    const vaultFiles = reactive<TalosLocalVaultFile[]>([])
    const selecting = ref(false)
    const error = ref<string | null>(null)
    const vaultLoading = ref(false)
    const vaultError = ref<string | null>(null)
    let vaultRevision = 0
    const hasAuthorized = computed(() => items.some((item) => item.status === 'authorized'))
    const blocking = computed(() => selecting.value || items.some((item) => item.status !== 'authorized'))
    const bindings = computed<AppendChatAttachmentInput[]>(() => items
        .filter((item): item is TalosMobileAttachmentDraft & {
            vaultFileId: string
            grantId: string
            bindingId: string
        } => item.status === 'authorized'
            && item.vaultFileId !== null
            && item.grantId !== null
            && item.bindingId !== null)
        .map((item) => ({
            id: item.bindingId,
            vault_file_id: item.vaultFileId,
            grant_id: item.grantId,
        })))

    function selectedSize(): number {
        return items
            .filter((item) => item.status !== 'failed')
            .reduce((total, item) => total + item.sizeBytes, 0)
    }

    function validateAddition(files: readonly { sizeBytes: number }[]): boolean {
        const selectedCount = items.filter((item) => item.status !== 'failed').length
        if (selectedCount + files.length > TALOS_MOBILE_ATTACHMENT_LIMITS.maxFilesPerMessage) {
            error.value = attachmentErrorMessage(new Error('TALOS_ATTACHMENT_TOO_MANY_FILES'), options.translate)
            return false
        }
        const total = files.reduce((sum, file) => sum + file.sizeBytes, selectedSize())
        if (total > TALOS_MOBILE_ATTACHMENT_LIMITS.maxBytesPerMessage) {
            error.value = attachmentErrorMessage(new Error('TALOS_ATTACHMENT_MESSAGE_TOO_LARGE'), options.translate)
            return false
        }
        return true
    }

    async function refreshVault(): Promise<void> {
        const revision = ++vaultRevision
        vaultLoading.value = true
        vaultError.value = null
        try {
            // Perf review 2026-07-25: summaries only — the full corpus used to be
            // read into a reactive array on every launch.
            const files = await options.vault.listSummaries()
            if (revision !== vaultRevision) return
            vaultFiles.splice(0, vaultFiles.length, ...files)
        } catch (cause) {
            if (revision !== vaultRevision) return
            vaultError.value = attachmentErrorMessage(cause, options.translate)
        } finally {
            if (revision === vaultRevision) vaultLoading.value = false
        }
    }

    async function initialize(): Promise<void> {
        try {
            await options.vault.reconcilePending()
        } catch (cause) {
            vaultError.value = attachmentErrorMessage(cause, options.translate)
        }
        await refreshVault()
    }

    async function ingestDraft(draft: TalosMobileAttachmentDraft, pickedFile: Parameters<TalosVaultService['ingest']>[0]): Promise<void> {
        try {
            const result = await options.vault.ingest(pickedFile, options.currentSessionId?.() ?? null)
            const current = items.find((item) => item.id === draft.id)
            if (!current) {
                await options.vault.revokeGrant(result.grant.id)
                return
            }
            current.vaultFileId = result.file.id
            current.grantId = result.grant.id
            current.bindingId = idFactory()
            current.permissions = [...result.grant.permissions]
            current.mediaType = result.file.media_type
            current.sizeBytes = result.file.size_bytes
            current.status = 'authorized'
            current.error = null
        } catch (cause) {
            const current = items.find((item) => item.id === draft.id)
            if (!current) return
            current.status = 'failed'
            current.error = attachmentErrorMessage(cause, options.translate)
            error.value = options.translate('chat.attachmentErrors.needsAttention')
        }
    }

    /**
     * Everything that happens AFTER a picker hands over files.
     *
     * F-6 added two more ways to choose a file — the camera and the photo
     * picker — and each needed exactly this. Extracted rather than copied,
     * because a second ingestion path is how two surfaces end up validating,
     * naming and failing differently for the same picture.
     */
    async function addPickedFiles(pick: () => Promise<TalosPickedFile[]>): Promise<void> {
        if (selecting.value) return
        selecting.value = true
        error.value = null
        try {
            const pickedFiles = await pick()
            if (pickedFiles.length === 0 || !validateAddition(pickedFiles)) return

            // Le immagini si chiedono PRIMA di entrare nel Vault: rifiutare
            // dopo l'ingestione vorrebbe dire aver gia' copiato la foto.
            const images = pickedFiles.filter((file) => (file.declaredMediaType || '').startsWith('image/'))
            if (images.length > 0) {
                const stance = options.imageConsent?.() ?? 'allow'
                if (stance === 'deny') {
                    error.value = options.translate('chat.imageConsentDenied')
                    return
                }
                if (stance === 'ask' && options.askImageConsent) {
                    const answer = await options.askImageConsent(images.length)
                    if (answer === 'deny') return
                }
            }
            const jobs = pickedFiles.map((pickedFile) => {
                const draft: TalosMobileAttachmentDraft = {
                    id: idFactory(),
                    source: 'picker',
                    displayName: pickedFile.name,
                    mediaType: pickedFile.declaredMediaType || 'application/octet-stream',
                    sizeBytes: pickedFile.sizeBytes,
                    status: 'ingesting',
                    vaultFileId: null,
                    grantId: null,
                    bindingId: null,
                    permissions: [],
                    error: null,
                }
                items.push(draft)
                return { draft, pickedFile }
            })
            for (const job of jobs) {
                await ingestDraft(job.draft, job.pickedFile)
            }
            await refreshVault()
        } catch (cause) {
            error.value = attachmentErrorMessage(cause, options.translate)
        } finally {
            selecting.value = false
        }
    }

    function selectFiles(): Promise<void> {
        return addPickedFiles(() => options.picker.pickFiles())
    }

    /** F-6: straight to the camera. */
    function takePhoto(): Promise<void> {
        return addPickedFiles(async () => {
            const { createTalosNativeCamera } = await import('@/services/nativeCamera')
            return createTalosNativeCamera().takePhoto()
        })
    }

    /**
     * F-6: Android's Photo Picker — the chosen pictures only, and no storage
     * permission asked for or held.
     */
    function pickPhotos(): Promise<void> {
        return addPickedFiles(async () => {
            const { createTalosNativeCamera } = await import('@/services/nativeCamera')
            return createTalosNativeCamera().pickPhotos()
        })
    }

    async function settleGenerated(result: TalosVaultTrayItem, retainGrant = false): Promise<TalosVaultTrayItem> {
        if (!retainGrant) await options.vault.revokeGrant(result.grant.id).catch(() => undefined)
        await refreshVault()
        return result
    }

    function generatedOriginSessionId(explicit: string | null | undefined): string | null {
        return explicit === undefined ? (options.currentSessionId?.() ?? null) : explicit
    }

    /** Absent sessionId means "the chat I am in"; null means "none at all". */
    function resolvedOrigin(origin: TalosGeneratedOrigin): TalosGeneratedOrigin {
        return { ...origin, sessionId: generatedOriginSessionId(origin.sessionId) }
    }

    async function saveGenerated(
        input: TalosGeneratedTextInput,
        origin: TalosGeneratedOrigin,
    ): Promise<TalosLocalVaultFile> {
        vaultError.value = null
        const result = await settleGenerated(
            await options.vault.createGenerated(input, resolvedOrigin(origin)),
        )
        // Saved to the Library, not attached to a message → drop the pre-minted
        // grant; attaching it later from the Library mints its own.
        return result.file
    }

    /**
     * F2 — a generated file whose content is BYTES.
     *
     * `saveGenerated` encodes a string, so routing an xlsx through it produced a
     * text file named `.xlsx` holding a placeholder sentence: the generator was
     * making valid documents and this sink was discarding them. Nothing in the
     * Library opened, because there was nothing in it to open.
     */
    function saveGeneratedBinary(
        input: { name: string; mediaType: string; bytes: Uint8Array },
        forMessage: false,
        origin: TalosGeneratedOrigin,
    ): Promise<TalosLocalVaultFile>
    function saveGeneratedBinary(
        input: { name: string; mediaType: string; bytes: Uint8Array },
        forMessage: true,
        origin: TalosGeneratedOrigin,
    ): Promise<{ file: TalosLocalVaultFile; attachment: AppendChatAttachmentInput }>
    async function saveGeneratedBinary(
        input: { name: string; mediaType: string; bytes: Uint8Array },
        forMessage: boolean,
        origin: TalosGeneratedOrigin,
    ): Promise<TalosLocalVaultFile | {
        file: TalosLocalVaultFile
        attachment: AppendChatAttachmentInput
    }> {
        vaultError.value = null
        const result = await settleGenerated(
            await options.vault.createGeneratedBinary(input, resolvedOrigin(origin)),
            forMessage,
        )
        return forMessage ? {
            file: result.file,
            attachment: {
                id: result.grant.id,
                vault_file_id: result.file.id,
                grant_id: result.grant.id,
            },
        } : result.file
    }

    async function previewBytes(fileId: string): Promise<Uint8Array | null> {
        const preview = await options.vault.readFilePreview(fileId)
        return preview?.bytes ?? null
    }

    async function previewUrl(fileId: string): Promise<string | null> {
        try {
            const preview = await options.vault.readFilePreview(fileId)
            if (!preview) return null
            return URL.createObjectURL(new Blob([preview.bytes as BlobPart], { type: preview.mediaType }))
        } catch {
            return null
        }
    }

    async function hydrateText(fileId: string): Promise<string | null> {
        try {
            // Round 3: this used to list the WHOLE corpus to return one body.
            return await options.vault.readFileText(fileId)
        } catch {
            return null
        }
    }

    async function attachExisting(file: TalosLocalVaultFile): Promise<boolean> {
        error.value = null
        if (items.some((item) => item.vaultFileId === file.id)) {
            error.value = options.translate('chat.attachmentErrors.alreadyAttached', {
                name: file.display_name,
            })
            return false
        }
        if (file.status !== 'available') {
            error.value = attachmentErrorMessage(new Error('TALOS_VAULT_FILE_UNAVAILABLE'), options.translate)
            return false
        }
        if (!validateAddition([{ sizeBytes: file.size_bytes }])) return false

        const draft: TalosMobileAttachmentDraft = {
            id: idFactory(),
            source: 'vault',
            displayName: file.display_name,
            mediaType: file.media_type,
            sizeBytes: file.size_bytes,
            status: 'ingesting',
            vaultFileId: file.id,
            grantId: null,
            bindingId: null,
            permissions: [],
            error: null,
        }
        items.push(draft)
        try {
            const createdGrant = await options.vault.createGrant(file.id)
            const current = items.find((item) => item.id === draft.id)
            if (!current) {
                await options.vault.revokeGrant(createdGrant.id)
                return false
            }
            current.grantId = createdGrant.id
            current.bindingId = idFactory()
            current.permissions = [...createdGrant.permissions]
            current.status = 'authorized'
            return true
        } catch (cause) {
            draft.status = 'failed'
            draft.error = attachmentErrorMessage(cause, options.translate)
            error.value = options.translate('chat.attachmentErrors.authorizationFailed')
            return false
        }
    }

    async function remove(itemId: string): Promise<void> {
        const item = items.find((candidate) => candidate.id === itemId)
        if (!item) return
        if (item.grantId) {
            try {
                await options.vault.revokeGrant(item.grantId)
            } catch (cause) {
                error.value = attachmentErrorMessage(cause, options.translate)
                return
            }
        }
        const index = items.findIndex((candidate) => candidate.id === itemId)
        if (index >= 0) items.splice(index, 1)
        if (!items.some((candidate) => candidate.status === 'failed')) error.value = null
    }

    async function deleteVaultFile(fileId: string): Promise<void> {
        vaultError.value = null
        try {
            await options.vault.deleteFile(fileId)
            for (let index = items.length - 1; index >= 0; index -= 1) {
                if (items[index]?.vaultFileId === fileId) items.splice(index, 1)
            }
            await refreshVault()
        } catch (cause) {
            vaultError.value = attachmentErrorMessage(cause, options.translate)
            throw cause
        }
    }

    async function deleteVaultFiles(fileIds: readonly string[]): Promise<string[]> {
        if (fileIds.length === 0) return []
        const failed: string[] = []
        for (const fileId of fileIds) {
            try {
                await options.vault.deleteFile(fileId)
            } catch (cause) {
                // A row the vault has already lost is not a failure — the file
                // is gone, which is what was asked for.
                const code = cause instanceof Error ? cause.message : ''
                if (code !== 'TALOS_VAULT_FILE_NOT_FOUND') {
                    // One stubborn file must not strand the rest.
                    failed.push(fileId)
                    // Keep the FIRST real cause: a permission error, a locked
                    // file and a database fault are different problems, and a
                    // generic summary makes them indistinguishable.
                    if (deleteFailure === null) {
                        deleteFailure = attachmentErrorMessage(cause, options.translate)
                    }
                    continue
                }
            }
            for (let index = items.length - 1; index >= 0; index -= 1) {
                if (items[index]?.vaultFileId === fileId) items.splice(index, 1)
            }
        }
        // ONE read for the whole batch. The list is what the user sees; letting
        // it re-render per file makes a bulk delete look like a fault.
        await refreshVault()
        // Deliberately NOT written to vaultError: this runs for chat deletion
        // too, and that banner is rendered only by the Library — the user would
        // meet it hours later, out of context and undated. The caller reports.
        return failed
    }

    /** Why the last bulk delete failed, in the user's words. Null if it did not. */
    let deleteFailure: string | null = null
    function takeDeleteFailure(): string | null {
        const message = deleteFailure
        deleteFailure = null
        return message
    }

    async function setVaultFileShared(fileId: string, shared: boolean): Promise<void> {
        vaultError.value = null
        try {
            await options.vault.setFileShared(fileId, shared)
            await refreshVault()
        } catch (cause) {
            vaultError.value = attachmentErrorMessage(cause, options.translate)
            throw cause
        }
    }

    async function discardAll(): Promise<void> {
        const grants = items
            .filter((item): item is TalosMobileAttachmentDraft & { grantId: string } => item.grantId !== null)
            .map((item) => item.grantId)
        try {
            for (const grantId of grants) await options.vault.revokeGrant(grantId)
        } catch (cause) {
            error.value = attachmentErrorMessage(cause, options.translate)
            throw cause
        }
        items.splice(0, items.length)
        error.value = null
    }

    function clearSent(): void {
        items.splice(0, items.length)
        error.value = null
    }

    function clearError(): void {
        error.value = null
    }

    return {
        items: readonly(items),
        vaultFiles: readonly(vaultFiles),
        selecting: readonly(selecting),
        error: readonly(error),
        vaultLoading: readonly(vaultLoading),
        vaultError: readonly(vaultError),
        hasAuthorized,
        blocking,
        bindings,
        initialize,
        refreshVault,
        selectFiles,
        takePhoto,
        pickPhotos,
        saveGenerated,
        saveGeneratedBinary,
        previewUrl,
        previewBytes,
        hydrateText,
        attachExisting,
        remove,
        deleteVaultFile,
        deleteVaultFiles,
        takeDeleteFailure,
        setVaultFileShared,
        discardAll,
        clearSent,
        clearError,
    }
}
