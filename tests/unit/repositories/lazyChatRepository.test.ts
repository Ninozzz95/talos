import { describe, expect, it, vi } from 'vitest'
import { createLazyChatRepository } from '@/repositories/lazyChatRepository'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { exerciseChatRepositoryContract } from './chatRepository.contract'

describe('createLazyChatRepository', () => {
    it('loads and initializes the concrete repository exactly once for concurrent callers', async () => {
        const concrete = createMemoryChatRepository()
        const initialize = vi.spyOn(concrete, 'initialize')
        const listSessions = vi.spyOn(concrete, 'listSessions')
        const loader = vi.fn(async () => concrete)
        const repository = createLazyChatRepository(loader)

        expect(loader).not.toHaveBeenCalled()

        await Promise.all([
            repository.initialize(),
            repository.initialize(),
            repository.listSessions(),
        ])

        expect(loader).toHaveBeenCalledTimes(1)
        expect(initialize).toHaveBeenCalledTimes(1)
        expect(listSessions).toHaveBeenCalledTimes(1)
    })

    it('discards a failed concrete repository and obtains a fresh instance on explicit retry', async () => {
        const failed = createMemoryChatRepository()
        const failedInitialize = vi.spyOn(failed, 'initialize')
            .mockRejectedValue(new Error('sqlite unavailable'))
        const failedClose = vi.spyOn(failed, 'close')
        const healthy = createMemoryChatRepository()
        const healthyInitialize = vi.spyOn(healthy, 'initialize')
        const loader = vi.fn()
            .mockResolvedValueOnce(failed)
            .mockResolvedValueOnce(healthy)
        const repository = createLazyChatRepository(loader)

        await expect(repository.initialize()).rejects.toThrow('sqlite unavailable')
        expect(failedInitialize).toHaveBeenCalledTimes(1)
        expect(failedClose).toHaveBeenCalledTimes(1)

        await repository.initialize()

        expect(loader).toHaveBeenCalledTimes(2)
        expect(healthyInitialize).toHaveBeenCalledTimes(1)
        await expect(repository.listSessions()).resolves.toEqual([])
    })

    it('closes the active repository and reloads a new instance after close', async () => {
        const first = createMemoryChatRepository()
        const second = createMemoryChatRepository()
        const firstClose = vi.spyOn(first, 'close')
        const loader = vi.fn()
            .mockResolvedValueOnce(first)
            .mockResolvedValueOnce(second)
        const repository = createLazyChatRepository(loader)

        await repository.initialize()
        await repository.close()
        await repository.initialize()

        expect(firstClose).toHaveBeenCalledTimes(1)
        expect(loader).toHaveBeenCalledTimes(2)
    })
})

/**
 * SF-CRITICAL (2026-07-26): this wrapper is what the app actually uses, and it
 * dropped every paging argument — so the shipped build never paged, and
 * scrolling up prepended the whole thread again, doubling it each time and
 * sending the model each message twice. Running the SHARED contract against
 * the wrapper is the only thing that can catch a delegation that forgets an
 * argument, because the type system cannot.
 */
describe('lazy repository honours the full contract (not just the method names)', () => {
    it('behaves exactly like the repository it wraps', async () => {
        await exerciseChatRepositoryContract(createLazyChatRepository(async () => createMemoryChatRepository()))
    })
})
