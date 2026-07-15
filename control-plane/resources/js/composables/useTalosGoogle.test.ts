import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosGoogle } from './useTalosGoogle'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

describe('useTalosGoogle concurrent state', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('stays loading until every concurrent Google request settles', async () => {
        const releases = new Map<string, (value: { data: unknown }) => void>()
        talosFetchMock.mockImplementation((url) => new Promise((resolve) => {
            releases.set(String(url), resolve as (value: { data: unknown }) => void)
        }) as never)
        const google = useTalosGoogle()

        const accounts = google.loadAccounts()
        const drive = google.loadDriveFiles('google-account')
        expect(google.loading.value).toBe(true)

        releases.get('/api/talos/google/accounts')?.({ data: [] })
        await accounts
        expect(google.loading.value).toBe(true)

        releases.get('/api/talos/google/drive/files?account_id=google-account')?.({ data: { files: [] } })
        await drive
        expect(google.loading.value).toBe(false)
    })
})
