import { describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import {
    TALOS_DISPLAY_NAME_MEMORY_ID,
    upsertTalosDisplayNameMemory,
} from '@/services/profileMemory'

describe('workspace display-name memory', () => {
    it('ONBOARD-UNIFIED-03 creates one genuine global untrusted preference', async () => {
        const repository = createMemoryChatRepository({
            now: () => '2026-07-28T10:00:00.000Z',
        })

        const memory = await upsertTalosDisplayNameMemory(repository, '  Ninò 🚀  ')

        expect(memory).toMatchObject({
            id: TALOS_DISPLAY_NAME_MEMORY_ID,
            scope_type: 'global',
            scope_id: null,
            kind: 'preference',
            status: 'active',
            title: 'Display name',
            content: 'Ninò 🚀',
            source: 'talos_mobile_workspace_setup',
            trust_level: 'untrusted',
            metadata: {
                system_memory_key: 'profile.display_name',
                created_from: 'talos_mobile_workspace_setup',
            },
        })
        expect(await repository.listMemories()).toHaveLength(1)
    })

    it('ONBOARD-UNIFIED-04 retries and name changes update the stable row without duplicates', async () => {
        const repository = createMemoryChatRepository({
            now: () => '2026-07-28T10:00:00.000Z',
        })

        await upsertTalosDisplayNameMemory(repository, 'Nino')
        await upsertTalosDisplayNameMemory(repository, 'Nino')
        await upsertTalosDisplayNameMemory(repository, 'Antonio')

        const memories = await repository.listMemories()
        expect(memories).toHaveLength(1)
        expect(memories[0]).toMatchObject({
            id: TALOS_DISPLAY_NAME_MEMORY_ID,
            content: 'Antonio',
        })
    })

    it('rejects an empty identity instead of creating a misleading memory', async () => {
        const repository = createMemoryChatRepository()
        await expect(upsertTalosDisplayNameMemory(repository, '   ')).rejects.toThrow(
            'TALOS_PROFILE_DISPLAY_NAME_REQUIRED',
        )
        expect(await repository.listMemories()).toEqual([])
    })
})

