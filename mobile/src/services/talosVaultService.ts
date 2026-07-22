import type {
    TalosChatRepository,
    TalosLocalFileAuthorityGrant,
    TalosLocalVaultFile,
} from '@/repositories/chatRepository'
import type { TalosMobileInputPart } from '@/lib/chat/attachmentContracts'
import type {
    TalosAttachmentAnalysisClient,
} from '@/services/attachmentAnalysisClient'
import type { TalosAttachmentFileStore } from '@/services/attachmentFileStore'
import type { TalosPickedFile } from '@/services/nativeFilePicker'

export interface TalosVaultTrayItem {
    file: TalosLocalVaultFile
    grant: TalosLocalFileAuthorityGrant
}

export interface TalosVaultService {
    ingest(file: TalosPickedFile): Promise<TalosVaultTrayItem>
    createGrant(fileId: string): Promise<TalosLocalFileAuthorityGrant>
    revokeGrant(grantId: string): Promise<void>
    resolveMessageParts(messageId: string): Promise<TalosMobileInputPart[]>
    listFiles(): Promise<TalosLocalVaultFile[]>
    deleteFile(fileId: string): Promise<void>
    reconcilePending(): Promise<void>
}

export interface TalosVaultServiceOptions {
    repository: TalosChatRepository
    fileStore: TalosAttachmentFileStore
    analysisClient: TalosAttachmentAnalysisClient
    idFactory?: () => string
    now?: () => string
}

function failureCode(error: unknown): string {
    if (error instanceof Error && /^TALOS_ATTACHMENT_[A-Z0-9_]+$/.test(error.message)) {
        return error.message
    }
    return 'TALOS_ATTACHMENT_ANALYSIS_FAILED'
}

function base64FromBytes(bytes: Uint8Array): string {
    let binary = ''
    const chunkSize = 32_768
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
}

export function createTalosVaultService(options: TalosVaultServiceOptions): TalosVaultService {
    const idFactory = options.idFactory ?? (() => crypto.randomUUID())
    const now = options.now ?? (() => new Date().toISOString())

    async function createGrant(fileId: string): Promise<TalosLocalFileAuthorityGrant> {
        const file = await options.repository.getVaultFile(fileId)
        if (!file) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
        if (file.status !== 'available') throw new Error('TALOS_VAULT_FILE_UNAVAILABLE')
        return options.repository.createFileAuthorityGrant({
            id: idFactory(),
            vault_file_id: file.id,
            permissions: ['model.read', 'browser.upload'],
            label: file.display_name,
            created_at: now(),
        })
    }

    async function failPendingFile(
        fileId: string,
        privateUri: string,
        error: unknown,
    ): Promise<never> {
        if (privateUri) {
            try {
                await options.fileStore.deletePrivate(privateUri)
            } catch {
                // The failed row remains recoverable; no private path is exposed to the UI.
            }
        }
        const code = failureCode(error)
        try {
            await options.repository.updateVaultFile(fileId, {
                status: 'failed',
                private_uri: '',
                sha256: null,
                extracted_text: null,
                failure_code: code,
            })
        } catch {
            // Preserve the bounded ingestion error if storage recovery also fails.
        }
        throw new Error(code)
    }

    return {
        async ingest(pickedFile) {
            const fileId = idFactory()
            await options.repository.createVaultFile({
                id: fileId,
                display_name: pickedFile.name,
                media_type: pickedFile.declaredMediaType || 'application/octet-stream',
                size_bytes: pickedFile.sizeBytes,
                private_uri: '',
                status: 'pending',
                trust: 'untrusted',
                sha256: null,
                extracted_text: null,
                failure_code: null,
                created_at: now(),
            })
            let privateUri = ''
            try {
                const copy = await options.fileStore.copyToPrivate(pickedFile, fileId)
                privateUri = copy.privateUri
                const analysis = await options.analysisClient.analyze({
                    bytes: copy.bytes,
                    name: pickedFile.name,
                    declaredMediaType: pickedFile.declaredMediaType,
                })
                const file = await options.repository.updateVaultFile(fileId, {
                    private_uri: privateUri,
                    status: 'available',
                    sha256: analysis.sha256,
                    extracted_text: analysis.extractedText,
                    failure_code: null,
                    metadata: { extension: analysis.extension, page_count: analysis.pageCount },
                })
                const grant = await createGrant(file.id)
                return { file, grant }
            } catch (error) {
                return failPendingFile(fileId, privateUri, error)
            }
        },
        createGrant,
        revokeGrant: (grantId) => options.repository.revokeFileAuthorityGrant(grantId),
        async resolveMessageParts(messageId) {
            const bindings = await options.repository.listMessageAttachments(messageId)
            const parts: TalosMobileInputPart[] = []
            for (const binding of bindings) {
                if (binding.grant_status !== 'active' || !binding.permissions.includes('model.read')) {
                    throw new Error('TALOS_ATTACHMENT_AUTHORITY_INVALID')
                }
                const file = await options.repository.getVaultFile(binding.vault_file_id)
                if (!file || file.status !== 'available' || !file.sha256) {
                    throw new Error('TALOS_VAULT_FILE_UNAVAILABLE')
                }
                if (['image/png', 'image/jpeg', 'image/webp'].includes(file.media_type)) {
                    const bytes = await options.fileStore.readPrivate(file.private_uri)
                    if (bytes.byteLength !== file.size_bytes) {
                        throw new Error('TALOS_ATTACHMENT_SIZE_MISMATCH')
                    }
                    parts.push({
                        type: 'image',
                        attachmentId: binding.id,
                        name: binding.display_name,
                        mediaType: file.media_type as 'image/png' | 'image/jpeg' | 'image/webp',
                        base64: base64FromBytes(bytes),
                        sha256: file.sha256,
                    })
                    continue
                }
                if (file.extracted_text === null) throw new Error('TALOS_ATTACHMENT_TEXT_UNAVAILABLE')
                parts.push({
                    type: 'document_text',
                    attachmentId: binding.id,
                    name: binding.display_name,
                    mediaType: file.media_type,
                    text: file.extracted_text,
                    sha256: file.sha256,
                })
            }
            return parts
        },
        listFiles: () => options.repository.listVaultFiles(),
        async deleteFile(fileId) {
            const file = await options.repository.getVaultFile(fileId)
            if (!file) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
            await options.repository.deleteVaultFile(fileId)
            if (file.private_uri) await options.fileStore.deletePrivate(file.private_uri)
        },
        async reconcilePending() {
            const pending = (await options.repository.listVaultFiles())
                .filter((file) => file.status === 'pending')
            for (const file of pending) {
                try {
                    if (!file.private_uri) throw new Error('TALOS_ATTACHMENT_PRIVATE_COPY_MISSING')
                    const bytes = await options.fileStore.readPrivate(file.private_uri)
                    const analysis = await options.analysisClient.analyze({
                        bytes,
                        name: file.display_name,
                        declaredMediaType: file.media_type,
                    })
                    await options.repository.updateVaultFile(file.id, {
                        status: 'available',
                        sha256: analysis.sha256,
                        extracted_text: analysis.extractedText,
                        failure_code: null,
                        metadata: { extension: analysis.extension, page_count: analysis.pageCount },
                    })
                } catch (error) {
                    try {
                        await failPendingFile(file.id, file.private_uri, error)
                    } catch {
                        // Continue reconciling independent pending files.
                    }
                }
            }
        },
    }
}
