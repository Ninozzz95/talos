import { describe, expect, it, vi } from 'vitest'
import {
    createAttachmentAnalysisClient,
    type TalosAttachmentWorkerPort,
} from '@/services/attachmentAnalysisClient'

describe('createAttachmentAnalysisClient', () => {
    it('AV-05 resolves the matching worker response and terminates the worker', async () => {
        const worker: TalosAttachmentWorkerPort = {
            postMessage: vi.fn(),
            terminate: vi.fn(),
            onmessage: null,
            onerror: null,
        }
        const client = createAttachmentAnalysisClient({
            workerFactory: () => worker,
            timeoutMs: 100,
            idFactory: () => 'analysis-1',
        })
        const pending = client.analyze({
            bytes: new TextEncoder().encode('hello'),
            name: 'hello.txt',
            declaredMediaType: 'text/plain',
        })
        worker.onmessage?.({ data: {
            id: 'analysis-1',
            ok: true,
            analysis: {
                mediaType: 'text/plain',
                extension: 'txt',
                sha256: 'a'.repeat(64),
                extractedText: 'hello',
                pageCount: null,
            },
        } })

        await expect(pending).resolves.toMatchObject({ extractedText: 'hello' })
        expect(worker.terminate).toHaveBeenCalledOnce()
    })

    it('AV-05 terminates a pathological parser and returns one bounded timeout code', async () => {
        vi.useFakeTimers()
        const worker: TalosAttachmentWorkerPort = {
            postMessage: vi.fn(),
            terminate: vi.fn(),
            onmessage: null,
            onerror: null,
        }
        const client = createAttachmentAnalysisClient({
            workerFactory: () => worker,
            timeoutMs: 15_000,
            idFactory: () => 'analysis-timeout',
        })
        const pending = client.analyze({
            bytes: new Uint8Array([1]),
            name: 'slow.pdf',
            declaredMediaType: 'application/pdf',
        })
        const assertion = expect(pending).rejects.toThrow('TALOS_ATTACHMENT_ANALYSIS_TIMEOUT')
        await vi.advanceTimersByTimeAsync(15_001)
        await assertion
        expect(worker.terminate).toHaveBeenCalledOnce()
        vi.useRealTimers()
    })
})
