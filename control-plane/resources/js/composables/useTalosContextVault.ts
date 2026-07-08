import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosContextSet,
    TalosFile,
    TalosFileWithChunks,
} from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type CreateTalosContextSetPayload = {
    name: string
    file_ids: string[]
    chunk_ids: string[]
    metadata: Record<string, unknown>
}

export type TalosFileIngestionResponse = TalosFile & {
    benchmark_scenario?: {
        storage_path?: string | null
        [key: string]: unknown
    } | null
}

export function useTalosContextVault() {
    const files = ref<TalosFile[]>([])
    const contextSets = ref<TalosContextSet[]>([])
    const fileDetailsById = ref<Record<string, TalosFileWithChunks>>({})
    const loadingFiles = ref(false)
    const loadingContextSets = ref(false)
    const loadingFileId = ref<string | null>(null)
    const uploadingFile = ref(false)
    const creatingContextSet = ref(false)
    const fileError = ref<string | null>(null)
    const uploadError = ref<string | null>(null)
    const contextSetError = ref<string | null>(null)
    const fileDetailError = ref<string | null>(null)

    const availableFiles = computed(() => files.value.filter((file) => file.status === 'available'))

    function storeFile(file: TalosFile) {
        files.value = [
            file,
            ...files.value.filter((existing) => existing.id !== file.id),
        ]

        return file
    }

    function storeContextSet(contextSet: TalosContextSet) {
        contextSets.value = [
            contextSet,
            ...contextSets.value.filter((existing) => existing.id !== contextSet.id),
        ]

        return contextSet
    }

    async function loadFiles() {
        loadingFiles.value = true
        fileError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosFile[]>>('/api/talos/files')
            files.value = response.data
            return response.data
        } catch (error) {
            fileError.value = error instanceof Error ? error.message : 'TALOS could not load uploaded files.'
            throw error
        } finally {
            loadingFiles.value = false
        }
    }

    async function loadFileDetails(fileId: string) {
        loadingFileId.value = fileId
        fileDetailError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosFileWithChunks>>(`/api/talos/files/${encodeURIComponent(fileId)}`)
            fileDetailsById.value = {
                ...fileDetailsById.value,
                [fileId]: response.data,
            }
            storeFile(response.data)
            return response.data
        } catch (error) {
            fileDetailError.value = error instanceof Error ? error.message : 'TALOS could not load file sources.'
            throw error
        } finally {
            loadingFileId.value = null
        }
    }

    async function uploadFile(file: File) {
        uploadingFile.value = true
        uploadError.value = null

        const body = new FormData()
        body.append('file', file)

        try {
            const response = await talosFetch<ApiEnvelope<TalosFileIngestionResponse>>('/api/files/ingest', {
                method: 'POST',
                body,
                validationMessage: 'TALOS rejected this file for ingestion.',
                networkMessage: 'TALOS could not reach the file ingestion endpoint.',
            })
            storeFile(response.data)
            return response.data
        } catch (error) {
            uploadError.value = error instanceof Error ? error.message : 'TALOS could not ingest this file.'
            throw error
        } finally {
            uploadingFile.value = false
        }
    }

    async function loadContextSets() {
        loadingContextSets.value = true
        contextSetError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosContextSet[]>>('/api/talos/context-sets')
            contextSets.value = response.data
            return response.data
        } catch (error) {
            contextSetError.value = error instanceof Error ? error.message : 'TALOS could not load context sets.'
            throw error
        } finally {
            loadingContextSets.value = false
        }
    }

    async function createContextSet(payload: CreateTalosContextSetPayload) {
        creatingContextSet.value = true
        contextSetError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosContextSet>>('/api/talos/context-sets', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS rejected this context set.',
            })
            return storeContextSet(response.data)
        } catch (error) {
            contextSetError.value = error instanceof Error ? error.message : 'TALOS could not create this context set.'
            throw error
        } finally {
            creatingContextSet.value = false
        }
    }

    async function loadContextSet(contextSetId: string) {
        contextSetError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosContextSet>>(`/api/talos/context-sets/${encodeURIComponent(contextSetId)}`)
            return storeContextSet(response.data)
        } catch (error) {
            contextSetError.value = error instanceof Error ? error.message : 'TALOS could not load this context set.'
            throw error
        }
    }

    return {
        files,
        availableFiles,
        contextSets,
        fileDetailsById,
        loadingFiles,
        loadingContextSets,
        loadingFileId,
        uploadingFile,
        creatingContextSet,
        fileError,
        uploadError,
        contextSetError,
        fileDetailError,
        loadFiles,
        loadFileDetails,
        uploadFile,
        loadContextSets,
        createContextSet,
        loadContextSet,
    }
}
