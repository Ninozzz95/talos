/// <reference lib="webworker" />

import { analyzeTalosMobileAttachment, type TalosAttachmentAnalysisRequest } from '@/lib/chat/attachmentAnalysis'

interface WorkerRequest {
    id: string
    request: TalosAttachmentAnalysisRequest
}

function boundedCode(error: unknown): string {
    if (error instanceof Error && /^TALOS_ATTACHMENT_[A-Z0-9_]+$/.test(error.message)) {
        return error.message
    }
    return 'TALOS_ATTACHMENT_ANALYSIS_FAILED'
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    try {
        const analysis = await analyzeTalosMobileAttachment(event.data.request)
        self.postMessage({ id: event.data.id, ok: true, analysis })
    } catch (error) {
        self.postMessage({ id: event.data.id, ok: false, code: boundedCode(error) })
    }
}

export {}
