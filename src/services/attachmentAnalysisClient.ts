import { TALOS_MOBILE_ATTACHMENT_LIMITS, type TalosMobileAttachmentAnalysis } from '@/lib/chat/attachmentContracts'
import type { TalosAttachmentAnalysisRequest } from '@/lib/chat/attachmentAnalysis'

interface TalosAttachmentWorkerSuccess {
    id: string
    ok: true
    analysis: TalosMobileAttachmentAnalysis
}

interface TalosAttachmentWorkerFailure {
    id: string
    ok: false
    code: string
}

export type TalosAttachmentWorkerResponse = TalosAttachmentWorkerSuccess | TalosAttachmentWorkerFailure

export interface TalosAttachmentWorkerPort {
    postMessage(message: unknown, transfer?: Transferable[]): void
    terminate(): void
    onmessage: ((event: MessageEvent<TalosAttachmentWorkerResponse>) => void) | null
    onerror: ((event: ErrorEvent) => void) | null
}

export interface TalosAttachmentAnalysisClient {
    analyze(request: TalosAttachmentAnalysisRequest): Promise<TalosMobileAttachmentAnalysis>
}

export interface TalosAttachmentAnalysisClientOptions {
    workerFactory?: () => TalosAttachmentWorkerPort
    timeoutMs?: number
    idFactory?: () => string
}

function defaultWorkerFactory(): TalosAttachmentWorkerPort {
    return new Worker(new URL('../workers/attachmentAnalysis.worker.ts', import.meta.url), {
        type: 'module',
        name: 'talos-attachment-analysis',
    })
}

export function createAttachmentAnalysisClient(
    options: TalosAttachmentAnalysisClientOptions = {},
): TalosAttachmentAnalysisClient {
    const workerFactory = options.workerFactory ?? defaultWorkerFactory
    const timeoutMs = options.timeoutMs ?? TALOS_MOBILE_ATTACHMENT_LIMITS.extractionTimeoutMs
    const idFactory = options.idFactory ?? (() => crypto.randomUUID())
    return {
        analyze(request) {
            return new Promise((resolve, reject) => {
                const worker = workerFactory()
                const id = idFactory()
                let settled = false
                const finish = (callback: () => void): void => {
                    if (settled) return
                    settled = true
                    clearTimeout(timeout)
                    worker.terminate()
                    callback()
                }
                const timeout = setTimeout(() => {
                    finish(() => reject(new Error('TALOS_ATTACHMENT_ANALYSIS_TIMEOUT')))
                }, timeoutMs)
                worker.onerror = () => {
                    finish(() => reject(new Error('TALOS_ATTACHMENT_ANALYSIS_FAILED')))
                }
                worker.onmessage = (event) => {
                    const response = event.data
                    if (response.id !== id) return
                    if (response.ok) {
                        finish(() => resolve(response.analysis))
                        return
                    }
                    const code = /^TALOS_ATTACHMENT_[A-Z0-9_]+$/.test(response.code)
                        ? response.code
                        : 'TALOS_ATTACHMENT_ANALYSIS_FAILED'
                    finish(() => reject(new Error(code)))
                }
                const bytes = Uint8Array.from(request.bytes)
                worker.postMessage({
                    id,
                    request: { ...request, bytes },
                }, [bytes.buffer])
            })
        },
    }
}
