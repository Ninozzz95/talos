import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosArtifactPreview, TalosDocument, TalosRunArtifact } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type TalosCreateDocumentInput = {
    run_id?: string | null
    run_artifact_id?: string | null
    research_report_id?: string | null
    title: string
    document_type?: string | null
    format?: string | null
    content: string
    metadata?: Record<string, unknown> | null
}

export function useTalosDocuments() {
    const documents = ref<TalosDocument[]>([])
    const artifacts = ref<TalosRunArtifact[]>([])
    const artifactPreviews = ref<Record<string, TalosArtifactPreview>>({})
    const loadingDocuments = ref(false)
    const loadingArtifacts = ref(false)
    const exportingDocumentId = ref<string | null>(null)
    const previewingArtifactId = ref<string | null>(null)
    const creatingDocument = ref(false)
    const documentError = ref<string | null>(null)
    const artifactError = ref<string | null>(null)

    async function loadDocuments() {
        loadingDocuments.value = true
        documentError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosDocument[]>>('/api/talos/documents')
            documents.value = response.data
            return response.data
        } catch (error) {
            documentError.value = error instanceof Error ? error.message : 'TALOS could not load documents.'
            throw error
        } finally {
            loadingDocuments.value = false
        }
    }

    async function createDocument(input: TalosCreateDocumentInput) {
        creatingDocument.value = true
        documentError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosDocument>>('/api/talos/documents', {
                method: 'POST',
                body: JSON.stringify(input),
                validationMessage: 'TALOS rejected this document contract.',
            })
            documents.value = [
                response.data,
                ...documents.value.filter((document) => document.id !== response.data.id),
            ]
            return response.data
        } catch (error) {
            documentError.value = error instanceof Error ? error.message : 'TALOS could not create this document.'
            throw error
        } finally {
            creatingDocument.value = false
        }
    }

    async function exportDocument(documentId: string) {
        exportingDocumentId.value = documentId
        documentError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosDocument>>(`/api/talos/documents/${documentId}/export`)
            return response.data
        } catch (error) {
            documentError.value = error instanceof Error ? error.message : 'TALOS could not export this document.'
            throw error
        } finally {
            exportingDocumentId.value = null
        }
    }

    async function loadArtifacts() {
        loadingArtifacts.value = true
        artifactError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosRunArtifact[]>>('/api/talos/artifacts')
            artifacts.value = response.data
            return response.data
        } catch (error) {
            artifactError.value = error instanceof Error ? error.message : 'TALOS could not load artifacts.'
            throw error
        } finally {
            loadingArtifacts.value = false
        }
    }

    async function previewArtifact(artifactId: string) {
        previewingArtifactId.value = artifactId
        artifactError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosArtifactPreview>>(`/api/talos/artifacts/${artifactId}/preview`)
            artifactPreviews.value = {
                ...artifactPreviews.value,
                [artifactId]: response.data,
            }
            return response.data
        } catch (error) {
            artifactError.value = error instanceof Error ? error.message : 'TALOS could not load this artifact preview.'
            throw error
        } finally {
            previewingArtifactId.value = null
        }
    }

    return {
        documents,
        artifacts,
        artifactPreviews,
        loadingDocuments,
        loadingArtifacts,
        exportingDocumentId,
        previewingArtifactId,
        creatingDocument,
        documentError,
        artifactError,
        loadDocuments,
        createDocument,
        exportDocument,
        loadArtifacts,
        previewArtifact,
    }
}
