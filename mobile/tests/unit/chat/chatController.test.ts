import { describe, expect, it, vi } from 'vitest'
import { createChatController, type ChatControllerDeps } from '@/stores/chatController'
import type { HttpTransport } from '@/lib/chat/anthropicClient'

function makeDeps() {
    const store = new Map<string, string>()
    const post = vi.fn().mockResolvedValue({ status: 200, data: { content: [{ type: 'text', text: 'pong' }] } })
    const transport: HttpTransport = { post }
    const deps: ChatControllerDeps = {
        hasKey: async (provider) => store.has(provider),
        getKey: async (provider) => store.get(provider) ?? null,
        setKey: async (provider, key) => { store.set(provider, key) },
        clearKey: async (provider) => { store.delete(provider) },
        transport,
    }
    return { store, post, deps }
}

describe('chatController', () => {
    it('exposes callable Anthropic profiles and a valid selection once a key exists', async () => {
        const { deps, store } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        expect(controller.secrets.anthropic).toBe(true)
        expect(controller.selectedProfile.value?.provider).toBe('anthropic')
        expect(controller.canSend.value).toBe(true)
    })

    it('gates sending with a Settings hint when no provider key is present', async () => {
        const { deps } = makeDeps()
        const controller = createChatController(deps)
        await controller.init()
        expect(controller.canSend.value).toBe(false)
        expect(controller.sendDisabledReason.value).toMatch(/api key/i)
    })

    it('saveKey unlocks the provider and makes its models callable', async () => {
        const { deps } = makeDeps()
        const controller = createChatController(deps)
        await controller.init()
        expect(controller.canSend.value).toBe(false)
        await controller.saveKey('anthropic', 'sk-ant')
        expect(controller.secrets.anthropic).toBe(true)
        expect(controller.canSend.value).toBe(true)
    })

    it('send drives the chat store to a real reply using the stored key', async () => {
        const { deps, store, post } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        await controller.send('ping')
        expect(post).toHaveBeenCalledOnce()
        expect(post.mock.calls[0][0].headers['x-api-key']).toBe('sk-ant')
        expect(controller.chat.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'pong' })
    })

    it('clamps effort to the selected model ladder on selection', async () => {
        const { deps, store } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        // haiku supports only low/high; selecting it while on 'medium' clamps to a valid rung
        controller.selectModel('claude-haiku')
        expect(controller.effortLadder.value).toEqual(['off', 'low', 'high'])
        expect(controller.effortLadder.value).toContain(controller.effort.value)
    })
})
