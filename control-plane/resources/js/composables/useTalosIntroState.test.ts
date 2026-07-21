// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { TalosApiError } from '../lib/api'
import type { TalosSettingsLoadState, TalosWorkspaceSettings } from './useTalosSettings'
import { TALOS_INTRO_VERSION, useTalosIntroState } from './useTalosIntroState'

function workspaceSettings(overrides: Partial<TalosWorkspaceSettings> = {}): TalosWorkspaceSettings {
    return {
        id: 'settings-account-a',
        revision: 3,
        preferences: {},
        ...overrides,
    }
}

function harness(overrides: {
    settings?: TalosWorkspaceSettings | null
    loadState?: TalosSettingsLoadState
    updateSettings?: ReturnType<typeof vi.fn>
} = {}) {
    const authenticated = ref(true)
    const workspaceRuntimeReady = ref(true)
    const settings = ref<TalosWorkspaceSettings | null>(
        overrides.settings === undefined ? workspaceSettings() : overrides.settings,
    )
    const settingsLoadState = ref<TalosSettingsLoadState>(overrides.loadState ?? 'loaded')
    const blockingOverlayOpen = ref(false)
    const updateSettings = overrides.updateSettings
        ?? vi.fn(async () => workspaceSettings({ revision: 4 }))
    const notify = vi.fn()

    const intro = useTalosIntroState({
        authenticated,
        workspaceRuntimeReady,
        settings,
        settingsLoadState,
        blockingOverlayOpen,
        updateSettings,
        notify,
    })

    return { intro, authenticated, workspaceRuntimeReady, settings, settingsLoadState, blockingOverlayOpen, updateSettings, notify }
}

const expectedPatch = (outcome: 'completed' | 'skipped') => ({
    preferences: {
        onboarding: { intro_version: TALOS_INTRO_VERSION, intro_outcome: outcome },
    },
})

describe('useTalosIntroState', () => {
    it('opens only when authenticated, runtime ready, settings loaded non-null, version older and no blocking overlay', async () => {
        const h = harness()
        expect(h.intro.introOpen.value).toBe(true)

        h.authenticated.value = false
        expect(h.intro.introOpen.value).toBe(false)
        h.authenticated.value = true

        h.workspaceRuntimeReady.value = false
        expect(h.intro.introOpen.value).toBe(false)
        h.workspaceRuntimeReady.value = true

        h.settings.value = null
        expect(h.intro.introOpen.value).toBe(false)
        h.settings.value = workspaceSettings()

        h.blockingOverlayOpen.value = true
        expect(h.intro.introOpen.value).toBe(false)
        h.blockingOverlayOpen.value = false

        h.settings.value = workspaceSettings({
            preferences: { onboarding: { intro_version: TALOS_INTRO_VERSION, intro_outcome: 'completed' } },
        })
        expect(h.intro.introOpen.value).toBe(false)

        h.intro.replayIntro()
        expect(h.intro.introOpen.value).toBe(true)
    })

    it('failed settings request never opens and produces no flash', () => {
        const failed = harness({ settings: null, loadState: 'error' })
        expect(failed.intro.introOpen.value).toBe(false)

        const loading = harness({ settings: null, loadState: 'loading' })
        expect(loading.intro.introOpen.value).toBe(false)

        const idle = harness({ settings: null, loadState: 'idle' })
        expect(idle.intro.introOpen.value).toBe(false)
    })

    it('close persists versioned outcome once, reconciles 409 once, notifies on failure without reopening', async () => {
        const h = harness()

        const first = h.intro.closeIntro('skipped')
        expect(h.intro.introOpen.value).toBe(false)
        const second = h.intro.closeIntro('skipped')
        await Promise.all([first, second])
        expect(h.updateSettings).toHaveBeenCalledTimes(1)
        expect(h.updateSettings).toHaveBeenCalledWith(expectedPatch('skipped'))
        expect(h.notify).not.toHaveBeenCalled()

        let reconcileSnapshot: (() => void) | null = null
        const conflictThenOk = vi.fn()
            .mockImplementationOnce(async () => {
                reconcileSnapshot?.()
                throw new TalosApiError('conflict', { status: 409 })
            })
            .mockResolvedValueOnce(workspaceSettings({ revision: 9 }))
        const conflicted = harness({ updateSettings: conflictThenOk })
        reconcileSnapshot = () => {
            conflicted.settings.value = workspaceSettings({ revision: 8 })
        }
        await conflicted.intro.closeIntro('completed')
        expect(conflictThenOk).toHaveBeenCalledTimes(2)
        expect(conflictThenOk).toHaveBeenNthCalledWith(2, expectedPatch('completed'))
        expect(conflicted.notify).not.toHaveBeenCalled()
        expect(conflicted.intro.introOpen.value).toBe(false)

        const alwaysFailing = vi.fn(async () => {
            throw new TalosApiError('offline', { status: 0 })
        })
        const failing = harness({ updateSettings: alwaysFailing })
        await failing.intro.closeIntro('completed')
        expect(alwaysFailing).toHaveBeenCalledTimes(1)
        expect(failing.notify).toHaveBeenCalledTimes(1)
        expect(failing.intro.introOpen.value).toBe(false)

        const [, retry] = failing.notify.mock.calls[0]
        expect(typeof retry).toBe('function')
        await retry()
        expect(alwaysFailing).toHaveBeenCalledTimes(2)
        expect(failing.intro.introOpen.value).toBe(false)
    })

    it('switching from account A to B during an in-flight 409 reconciliation never mutates account B', async () => {
        let rejectFirst: (error: unknown) => void = () => undefined
        const updateSettings = vi.fn(() => new Promise<TalosWorkspaceSettings>((_resolve, reject) => {
            rejectFirst = reject
        }))
        const h = harness({ updateSettings })

        const closing = h.intro.closeIntro('completed')
        expect(updateSettings).toHaveBeenCalledTimes(1)

        h.settings.value = workspaceSettings({ id: 'settings-account-b', revision: 1 })
        rejectFirst(new TalosApiError('conflict', { status: 409 }))
        await closing

        expect(updateSettings).toHaveBeenCalledTimes(1)
        expect(h.notify).not.toHaveBeenCalled()
    })

    it('blocker open during settings load keeps intro closed and it opens after the blocker closes', async () => {
        const h = harness({ settings: null, loadState: 'loading' })
        h.blockingOverlayOpen.value = true
        expect(h.intro.introOpen.value).toBe(false)

        h.settings.value = workspaceSettings()
        h.settingsLoadState.value = 'loaded'
        expect(h.intro.introOpen.value).toBe(false)

        h.blockingOverlayOpen.value = false
        await nextTick()
        expect(h.intro.introOpen.value).toBe(true)
    })
})
