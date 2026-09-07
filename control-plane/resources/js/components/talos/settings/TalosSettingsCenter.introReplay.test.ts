// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosSettingsCenter from './TalosSettingsCenter.vue'

vi.mock('../../../composables/useTalosSettings', () => ({
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

describe('TalosSettingsCenter intro replay row', () => {
    it('renders a Replay introduction row on the Account tab that emits replayIntro per activation', async () => {
        const replayEvents: unknown[][] = []
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)

        app = createApp(defineComponent({
            setup() {
                return () => h(TalosSettingsCenter, {
                    modelProfiles: [],
                    contextSets: [],
                    selectedModelProfileId: '',
                    selectedContextSetId: '',
                    focusedTab: 'account',
                    focusedTabRevision: 1,
                    authenticated: true,
                    authUserName: 'Nino',
                    logoutUrl: 'https://talos.test/logout',
                    csrfToken: 'token',
                    onReplayIntro: (...payload: unknown[]) => { replayEvents.push(payload) },
                })
            },
        }))
        app.mount(mountPoint)
        await nextTick()
        await nextTick()

        const replayButton = [...document.querySelectorAll('button')].find((candidate) => (
            candidate.textContent?.trim() === 'Replay introduction'
        ))
        expect(replayButton).toBeTruthy()
        expect(replayButton?.closest('[data-testid="talos-settings-intro-replay"]')).toBeTruthy()

        replayButton?.click()
        await nextTick()
        expect(replayEvents).toHaveLength(1)

        replayButton?.click()
        await nextTick()
        expect(replayEvents).toHaveLength(2)
    })
})
