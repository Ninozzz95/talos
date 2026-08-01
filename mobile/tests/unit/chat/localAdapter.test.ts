import { beforeEach, describe, expect, it, vi } from 'vitest'

const localEngine = vi.hoisted(() => ({
    talosLocalInstalledModels: vi.fn(),
    talosLocalEngineStatus: vi.fn(),
    talosLocalEngineOpen: vi.fn(),
    talosLocalEngineChatPrompt: vi.fn(),
    talosLocalEngineGenerate: vi.fn(),
    talosLocalEngineCancel: vi.fn(),
    talosLocalEngineClose: vi.fn(),
}))
vi.mock('@/services/localEngine', () => localEngine)

const { localAdapter } = await import('@/lib/chat/providers/localAdapter')

/**
 * The difference between "you have no models" and "I could not look".
 *
 * They were the same sentence for as long as the code below existed: the walk
 * over the models folder answered null for a folder it could not open, the
 * caller read null as an empty list, and the model picker said "no models
 * available". The advice those two situations need is opposite — one means
 * download something, the other means downloading will change nothing — and on
 * 2026-08-01 the wrong one sent a real debugging session in the wrong direction
 * for three rounds, on a tablet with a two-gigabyte model in the folder.
 */
describe('local provider catalogue', () => {
    beforeEach(() => {
        localEngine.talosLocalInstalledModels.mockReset()
    })

    it('reports an empty device as empty, not as broken', async () => {
        localEngine.talosLocalInstalledModels.mockResolvedValue({ models: [], unreadable: [] })

        const catalog = await localAdapter.listModels(
            { apiKey: null, endpoint: null },
            (() => { throw new Error('the local engine must not reach the network') }) as never,
        )

        expect(catalog.models).toEqual([])
    })

    it('refuses to call a folder it could not open an empty device', async () => {
        localEngine.talosLocalInstalledModels.mockResolvedValue({
            models: [],
            unreadable: [{
                path: '/storage/emulated/0/Android/data/ai.talos/files/models',
                reason: 'AccessDeniedException: /storage/emulated/0/Android/data/ai.talos/files/models',
            }],
        })

        // The path travels with the error: a folder nobody can name is a folder
        // nobody can fix. Asserted on the parameters rather than on rendered
        // text so it holds in both languages.
        await expect(localAdapter.listModels(
            { apiKey: null, endpoint: null },
            (() => { throw new Error('unreachable') }) as never,
        )).rejects.toMatchObject({
            uiMessageKey: 'models.localModelsUnreadable',
            uiMessageParameters: {
                path: '/storage/emulated/0/Android/data/ai.talos/files/models',
            },
        })
    })

    it('still offers the models it could read when only part of the walk failed', async () => {
        localEngine.talosLocalInstalledModels.mockResolvedValue({
            models: [{ path: '/models/a/qwen.gguf', name: 'qwen.gguf', bytes: 1 }],
            unreadable: [{ path: '/models/b', reason: 'AccessDeniedException: /models/b' }],
        })

        // One locked folder must not hide the model beside it. The user can run
        // what is runnable, and a refusal here would take that away to report a
        // problem with something they were not asking for.
        const catalog = await localAdapter.listModels(
            { apiKey: null, endpoint: null },
            (() => { throw new Error('unreachable') }) as never,
        )

        expect(catalog.models.map((model) => model.id)).toEqual(['/models/a/qwen.gguf'])
    })
})
