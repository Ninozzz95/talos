import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import { useTalosFileAuthority } from './useTalosFileAuthority'

type ApiEnvelope<T> = { data: T }

type TalosIngestedFile = {
    id: string
    original_name: string
    mime_type?: string | null
    size_bytes?: number | null
    checksum?: string | null
    status: string
    failure_reason?: string | null
}

export type TalosChatAttachment = {
    id: string
    file_id: string | null
    grant_id: string | null
    name: string
    status: 'uploading' | 'available' | 'failed'
    failure_reason: string | null
}

function attachmentId() {
    const id = globalThis.crypto?.randomUUID?.()
    if (!id) throw new Error('Secure attachment identity is unavailable.')
    return id
}

/**
 * Owns the chat composer attachment tray. Every attachment is a governed Vault
 * reference: uploads go through the real ingestion endpoint and only owned
 * `available` file ids ever leave this composable. Raw file content and client
 * paths never enter the chat payload.
 */
export function useTalosChatAttachments() {
    const attachments = ref<TalosChatAttachment[]>([])
    const authority = useTalosFileAuthority()

    const readyFileIds = computed(() => attachments.value
        .filter((attachment) => attachment.status === 'available' && attachment.file_id !== null && attachment.grant_id !== null)
        .map((attachment) => attachment.file_id as string))
    const readyGrantIds = computed(() => attachments.value
        .filter((attachment) => attachment.status === 'available' && attachment.file_id !== null && attachment.grant_id !== null)
        .map((attachment) => attachment.grant_id as string))
    const hasPendingUpload = computed(() => attachments.value.some((attachment) => attachment.status === 'uploading'))

    async function attachFile(file: File) {
        const id = attachmentId()
        attachments.value = [...attachments.value, {
            id,
            file_id: null,
            grant_id: null,
            name: file.name,
            status: 'uploading',
            failure_reason: null,
        }]

        const body = new FormData()
        body.append('file', file)

        try {
            const response = await talosFetch<ApiEnvelope<TalosIngestedFile>>('/api/files/ingest', {
                method: 'POST',
                body,
                validationMessage: 'TALOS rejected this file for ingestion.',
                networkMessage: 'TALOS could not reach the file ingestion endpoint.',
            })
            const ingested = response.data
            if (ingested.status !== 'available') {
                patch(id, { file_id: ingested.id, status: 'failed', failure_reason: ingested.failure_reason ?? 'TALOS could not parse this file.' })
                return ingested
            }
            const grant = await authority.createGrant({
                scope: 'file',
                permissions: ['model.read', 'browser.upload'],
                file_ids: [ingested.id],
                label: ingested.original_name,
            })
            patch(id, { file_id: ingested.id, grant_id: grant.id, status: 'available', failure_reason: null })
            return ingested
        } catch (error) {
            patch(id, {
                status: 'failed',
                failure_reason: error instanceof Error ? error.message : 'TALOS could not ingest this file.',
            })
            throw error
        }
    }

    async function attachVaultFile(file: TalosIngestedFile) {
        if (file.status !== 'available') {
            throw new Error('Only available Vault files can be attached to a message.')
        }
        if (attachments.value.some((attachment) => attachment.file_id === file.id)) return

        const id = attachmentId()
        attachments.value = [...attachments.value, {
            id,
            file_id: file.id,
            grant_id: null,
            name: file.original_name,
            status: 'uploading',
            failure_reason: null,
        }]
        try {
            const grant = await authority.createGrant({
                scope: 'file',
                permissions: ['model.read', 'browser.upload'],
                file_ids: [file.id],
                label: file.original_name,
            })
            patch(id, { grant_id: grant.id, status: 'available', failure_reason: null })
        } catch (error) {
            patch(id, {
                status: 'failed',
                failure_reason: error instanceof Error ? error.message : 'TALOS could not authorize this Vault file.',
            })
            throw error
        }
    }

    function patch(id: string, changes: Partial<TalosChatAttachment>) {
        attachments.value = attachments.value.map((attachment) => (
            attachment.id === id ? { ...attachment, ...changes } : attachment
        ))
    }

    async function remove(id: string) {
        const attachment = attachments.value.find((candidate) => candidate.id === id)
        if (attachment?.grant_id) await authority.revokeGrant(attachment.grant_id)
        attachments.value = attachments.value.filter((attachment) => attachment.id !== id)
    }

    function reset() {
        attachments.value = []
    }

    return {
        attachments,
        readyFileIds,
        readyGrantIds,
        hasPendingUpload,
        attachFile,
        attachVaultFile,
        remove,
        reset,
    }
}
