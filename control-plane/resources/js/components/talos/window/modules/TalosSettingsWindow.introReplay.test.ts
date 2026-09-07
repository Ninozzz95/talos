// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosSettingsWindow from './TalosSettingsWindow.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

vi.mock('../../../../composables/useTalosSettings', () => ({
    useTalosSettings: () => ({
        settings: ref(null),
        loadingSettings: ref(false),
        savingSettings: ref(false),
        settingsError: ref(null),
        settingsSavedMessage: ref(''),
        loadSettings: () => Promise.resolve(null),
        updateSettings: () => Promise.resolve(null),
    }),
}))

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

function fakeContext(replayIntro: () => void): TalosWindowModuleContext {
    return {
        id: 'settings',
        activeSection: '',
        runtimeRequestedTab: 'timeline',
        runtimeRequestedTabRevision: 0,
        selectedBenchmarkGroupId: null,
        selectedBenchmarkScenarioRef: null,
        modelProfiles: [],
        contextSets: [],
        selectedModelProfileId: '',
        selectedContextSetId: '',
        settingsRequestedTab: 'account',
        settingsRequestedTabRevision: 1,
        authenticated: true,
        authUserName: 'Nino',
        logoutUrl: 'https://talos.test/logout',
        csrfToken: 'token',
        activeTalosSessionId: null,
        theme: 'aurora-dark',
        openWindow: () => undefined,
        openModule: () => undefined,
        openAuditLog: () => undefined,
        contextSetCreated: () => undefined,
        benchmarkScenarioSelected: () => undefined,
        selectModel: () => undefined,
        selectContext: () => undefined,
        changeTheme: () => undefined,
        settingsSaved: () => undefined,
        themeCustomizationChanged: () => undefined,
        themeDraftChanged: () => undefined,
        replayIntro,
    }
}

describe('TalosSettingsWindow intro replay pass-through', () => {
    it('forwards the settings center replayIntro event to the module context', async () => {
        const replayIntro = vi.fn()
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)

        app = createApp(defineComponent({
            setup() {
                return () => h(TalosSettingsWindow, { context: fakeContext(replayIntro) })
            },
        }))
        app.mount(mountPoint)
        await nextTick()
        await nextTick()

        const replayButton = [...document.querySelectorAll('button')].find((candidate) => (
            candidate.textContent?.trim() === 'Replay introduction'
        ))
        expect(replayButton).toBeTruthy()

        replayButton?.click()
        await nextTick()
        expect(replayIntro).toHaveBeenCalledTimes(1)
    })
})
