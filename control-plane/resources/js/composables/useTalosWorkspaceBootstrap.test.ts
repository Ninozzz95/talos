// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTalosWorkspaceBootstrap } from './useTalosWorkspaceBootstrap'
import type { TalosSession } from '../lib/talosTypes'

const session: TalosSession = {
    id: 'session-1', title: 'Chat', surface: 'chat', mode: 'verified_execution',
    persistence_mode: 'persistent', metadata: {}, created_at: '2026-07-11T10:00:00Z', updated_at: '2026-07-11T10:00:00Z',
}

function dependencies() {
    return {
        uiError: ref<string | null>(null),
        theme: ref<'forge' | 'paper'>('forge'),
        selectedModelProfileId: ref(''),
        selectedModelRoutingProfileId: ref(''),
        selectedContextSetId: ref(''),
        callableModelProfiles: ref([{ id: 'model-1' }]),
        usableModelRoutingProfiles: ref([]),
        loadModelProfiles: vi.fn(async () => undefined),
        loadModelRoutingProfiles: vi.fn(async () => undefined),
        loadContextSets: vi.fn(async () => undefined),
        saveWorkspacePreferences: vi.fn(),
        loadWorkspacePreferences: vi.fn(),
        loadWorkspaceSettings: vi.fn(async () => ({
            default_model_profile_id: 'default-model', default_context_set_id: 'context-1', preferences: { theme: 'paper', chat_layout: { composer_mode: 'minimal' } },
        })),
        applyChatLayoutPreference: vi.fn(),
        isWindowId: (value: string): value is 'runtime' | 'compare' => value === 'runtime' || value === 'compare',
        openWindowFromSource: vi.fn(),
        loadSessions: vi.fn(async () => [session]),
        selectSession: vi.fn(async () => undefined),
        restoreBrowseForActiveSession: vi.fn(async () => undefined),
        scrollChat: vi.fn(),
        initializeBrowse: vi.fn(async () => undefined),
    }
}

describe('useTalosWorkspaceBootstrap', () => {
    it('replaces a stale persisted model selection with the first callable profile', async () => {
        const deps = dependencies()
        deps.selectedModelProfileId.value = 'deleted-model'
        const bootstrap = useTalosWorkspaceBootstrap(deps)

        await bootstrap.refreshModelAndContext()

        expect(deps.selectedModelProfileId.value).toBe('model-1')
        expect(deps.selectedModelRoutingProfileId.value).toBe('')
        expect(deps.saveWorkspacePreferences).toHaveBeenCalledOnce()
    })

    it('applies query modules without consuming unrelated parameters', () => {
        const deps = dependencies()
        const bootstrap = useTalosWorkspaceBootstrap(deps)
        window.history.replaceState({}, '', '/?module=runtime&run=run-1&benchmark=group-1')

        bootstrap.applyQueryModules()

        expect(deps.openWindowFromSource).toHaveBeenNthCalledWith(1, 'runtime', undefined, 'command')
        expect(deps.openWindowFromSource).toHaveBeenNthCalledWith(2, 'runtime', undefined, 'command')
        expect(deps.openWindowFromSource).toHaveBeenNthCalledWith(3, 'compare', undefined, 'command')
    })

    it('loads preferences, settings, sessions, and Browse in bootstrap order', async () => {
        const deps = dependencies()
        const order: string[] = []
        deps.loadWorkspacePreferences.mockImplementation(() => order.push('preferences'))
        deps.loadModelProfiles.mockImplementation(async () => { order.push('models') })
        deps.loadModelRoutingProfiles.mockImplementation(async () => { order.push('routing') })
        deps.loadContextSets.mockImplementation(async () => { order.push('context') })
        deps.loadWorkspaceSettings.mockImplementation(async () => { order.push('settings'); return { preferences: {} } })
        deps.loadSessions.mockImplementation(async () => { order.push('sessions'); return [session] })
        deps.selectSession.mockImplementation(async () => { order.push('select') })
        deps.restoreBrowseForActiveSession.mockImplementation(async () => { order.push('restore-browse') })
        deps.initializeBrowse.mockImplementation(async () => { order.push('browse') })
        const bootstrap = useTalosWorkspaceBootstrap(deps)

        await bootstrap.initialize()

        expect(order).toEqual(['preferences', 'browse', 'models', 'routing', 'context', 'settings', 'sessions', 'select', 'restore-browse'])
        expect(deps.scrollChat).toHaveBeenCalledOnce()
    })
})
