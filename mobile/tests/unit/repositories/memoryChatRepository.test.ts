import { describe, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { exerciseChatRepositoryContract } from './chatRepository.contract'

describe('createMemoryChatRepository', () => {
    it('satisfies the durable chat repository contract used by store tests', async () => {
        await exerciseChatRepositoryContract(createMemoryChatRepository())
    })
})
