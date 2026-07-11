import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosResearch } from './useTalosResearch'

vi.mock('../lib/api', () => ({
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

describe('useTalosResearch jobs', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
        vi.useRealTimers()
    })

    it('starts a research job and polls it until a terminal state', async () => {
        vi.useFakeTimers()
        const research = useTalosResearch()
        const runningJob = {
            id: 'job-1',
            run_id: 'run-1',
            query: 'Explain the evidence gap.',
            status: 'running',
            settings: { mode: 'deterministic_fixture' },
            progress: { phase: 'fetching' },
            failure_code: null,
            failure_message: null,
        }
        const completedJob = { ...runningJob, status: 'completed', progress: { phase: 'complete' } }
        talosFetchMock
            .mockResolvedValueOnce({ data: runningJob })
            .mockResolvedValueOnce({ data: completedJob })

        const pending = research.startResearchJob({
            query: 'Explain the evidence gap.',
            settings: { mode: 'deterministic_fixture' },
        })

        await vi.waitFor(() => expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/research-jobs', expect.objectContaining({ method: 'POST' })))
        expect(research.activeResearchJob.value).toMatchObject({ id: 'job-1', status: 'running' })

        await vi.advanceTimersByTimeAsync(1000)
        await expect(pending).resolves.toMatchObject({ id: 'job-1', status: 'completed' })
        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/research-jobs/job-1')
        expect(research.researchJobPolling.value).toBe(false)
    })

    it('cancels polling through the real research job cancel endpoint', async () => {
        vi.useFakeTimers()
        const research = useTalosResearch()
        const job = { id: 'job-2', query: 'Long research', status: 'running' }
        const cancelled = { ...job, status: 'cancelled' }
        talosFetchMock
            .mockResolvedValueOnce({ data: job })
            .mockResolvedValueOnce({ data: cancelled })

        const pending = research.startResearchJob({ query: job.query, settings: { mode: 'live' } })
        await vi.waitFor(() => expect(research.researchJobPolling.value).toBe(true))

        const cancelPending = research.cancelResearchJob(job.id)
        await expect(cancelPending).resolves.toMatchObject({ status: 'cancelled' })
        await expect(pending).resolves.toMatchObject({ status: 'cancelled' })
        expect(talosFetchMock).toHaveBeenCalledWith(`/api/talos/research-jobs/${job.id}/cancel`, { method: 'POST' })
        expect(research.researchJobPolling.value).toBe(false)
    })

    it('stops polling after the bounded research job limit without claiming completion', async () => {
        vi.useFakeTimers()
        const research = useTalosResearch()
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/research-jobs') {
                return { data: { id: 'job-3', query: 'Never-ending research', status: 'running' } } as never
            }

            return { data: { id: 'job-3', query: 'Never-ending research', status: 'running' } } as never
        })

        const pending = research.startResearchJob({ query: 'Never-ending research', settings: { mode: 'live' } })
        await vi.advanceTimersByTimeAsync(60_000)

        await expect(pending).resolves.toMatchObject({ id: 'job-3', status: 'running' })
        expect(research.researchJobPolling.value).toBe(false)
        expect(research.researchJobPollingTimedOut.value).toBe(true)
        expect(talosFetchMock).toHaveBeenCalledTimes(61)
    })
})
