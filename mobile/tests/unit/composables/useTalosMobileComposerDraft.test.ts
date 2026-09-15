import { describe, expect, it, vi } from 'vitest'
import {
    createTalosMobileComposerDraftController as createDraftController,
    type TalosMobileComposerDraftOptions,
} from '@/composables/useTalosMobileComposerDraft'
import { talosTestT } from '../../helpers/talosTestI18n'

function createTalosMobileComposerDraftController(
    options: Omit<TalosMobileComposerDraftOptions, 'translate'>,
) {
    return createDraftController({ ...options, translate: talosTestT('en') })
}

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return { promise, resolve, reject }
}

describe('createTalosMobileComposerDraftController', () => {
    it('restores independent drafts and flushes before switching scope', async () => {
        const drafts = new Map<string, string>([['chat-a', 'Draft A'], ['chat-b', 'Draft B']])
        const writes: Array<[string, string]> = []
        const controller = createTalosMobileComposerDraftController({
            load: async (scope) => drafts.get(scope) ?? '',
            save: async (scope, value) => {
                writes.push([scope, value])
                drafts.set(scope, value)
            },
        })

        await controller.activateScope('chat-a')
        expect(controller.prompt.value).toBe('Draft A')
        controller.updatePrompt('Changed A')
        await controller.activateScope('chat-b')

        expect(writes).toContainEqual(['chat-a', 'Changed A'])
        expect(controller.prompt.value).toBe('Draft B')
    })

    it('drops a superseded asynchronous read', async () => {
        const first = deferred<string>()
        const controller = createTalosMobileComposerDraftController({
            load: (scope) => scope === 'chat-a' ? first.promise : Promise.resolve('Draft B'),
            save: vi.fn().mockResolvedValue(undefined),
        })

        const loadingA = controller.activateScope('chat-a')
        const loadingB = controller.activateScope('chat-b')
        await loadingB
        first.resolve('Late A')
        await loadingA

        expect(controller.prompt.value).toBe('Draft B')
        expect(controller.scope.value).toBe('chat-b')
    })

    it('keeps the typed draft and reports a write failure', async () => {
        const controller = createTalosMobileComposerDraftController({
            load: vi.fn().mockResolvedValue(''),
            save: vi.fn().mockRejectedValue(new Error('disk full')),
        })
        await controller.activateScope('chat-a')
        controller.updatePrompt('Do not lose this')

        await controller.flush()

        expect(controller.prompt.value).toBe('Do not lose this')
        expect(controller.error.value).toContain('disk full')
    })
})
