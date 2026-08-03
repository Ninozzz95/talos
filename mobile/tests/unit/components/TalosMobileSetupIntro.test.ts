// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'

/**
 * Owner 2026-07-27, after the research: the six-slide carousel is gone and
 * first run is the two things TALOS cannot start without.
 *
 * What the research pinned down, and what these tests hold to it:
 *  - NN/g: deck-of-cards tutorials "make the interface appear more complicated
 *    than it actually is"; onboarding is justified only when the app needs
 *    something to begin. So: no slides, two steps, both about a real need.
 *  - NN/g on wizards: show the steps and where you are, allow going back,
 *    let people resume.
 *  - NN/g: "always provide a highly visible Skip option".
 *  - Android: never request runtime permissions at first launch.
 */
const state = vi.hoisted(() => ({
    security: { app_lock_enabled: false },
    secrets: {} as Record<string, boolean>,
    account: { display_name: '' },
    savedNames: [] as string[],
    memoryNames: [] as string[],
    memoryFailure: false,
    memoryExisting: false,
}))

vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: reactive({ security: state.security }),
        setSecurity: vi.fn(async () => {}),
    }),
}))

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        secrets: state.secrets,
        memories: {
            list: async () => state.memoryExisting
                ? [{
                    id: 'talos-profile-display-name',
                    status: 'active',
                    content: state.account.display_name,
                }]
                : [],
            upsertDisplayName: async (name: string) => {
                state.memoryNames.push(name)
                if (state.memoryFailure) throw new Error('sqlite unavailable')
                state.memoryExisting = true
            },
        },
    }),
}))

vi.mock('@/stores/account', () => ({
    useTalosAccountStore: () => ({
        state: reactive(state.account),
        setDisplayName: async (name: string) => {
            const normalized = name.trim().slice(0, 60)
            state.account.display_name = normalized
            state.savedNames.push(normalized)
        },
    }),
}))

vi.mock('@/services/appLock', () => ({
    setupAppLockPin: vi.fn(async () => {}),
    clearAppLock: vi.fn(async () => {}),
    biometricUnlockAvailable: vi.fn(async () => false),
    requestBiometricUnlock: vi.fn(async () => false),
    verifyAppLockPin: vi.fn(async () => false),
    appLockThrottleRemainingMs: vi.fn(async () => 0),
}))

vi.mock('@/services/databaseProtection', () => ({
    enableTalosDatabaseProtection: vi.fn(async () => ({ migrated: false })),
    disableTalosDatabaseProtection: vi.fn(async () => {}),
}))

// The provider key panel is reused wholesale rather than reimplemented; it
// drags the whole model catalogue in, which this test does not need.
vi.mock('@/components/talos/models/TalosMobileProviderRuntimePanel.vue', () => ({
    // `__esModule` matters: without it defineAsyncComponent treats the module
    // itself as the component and Vue reads properties off the mock.
    __esModule: true,
    default: { name: 'ProviderRuntimePanelStub', template: '<div data-testid="settings-provider-keys" />' },
}))

import TalosMobileSetupIntro from '@/components/intro/TalosMobileSetupIntro.vue'

beforeEach(() => {
    state.security.app_lock_enabled = false
    state.account.display_name = ''
    state.savedNames.length = 0
    state.memoryNames.length = 0
    state.memoryFailure = false
    state.memoryExisting = false
    for (const key of Object.keys(state.secrets)) delete state.secrets[key]
})

function mountIntro() {
    return mount(TalosMobileSetupIntro, { attachTo: document.body })
}

async function mountStory() {
    const wrapper = mountIntro()
    await flushPromises()
    await wrapper.get('[data-testid="talos-language-continue"]').trigger('click')
    return wrapper
}

/** Past language and story, into identity/PIN/model setup. */
async function mountSetup() {
    const wrapper = await mountStory()
    await wrapper.get('[data-testid="talos-setup-begin"]').trigger('click')
    return wrapper
}

describe('what TALOS says it is, before asking for anything', () => {
    it('ONBOARD-UNIFIED-01 opens on the separate language page before the story', async () => {
        const wrapper = mountIntro()
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-setup-language"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-testid="talos-language-choice"]')).toHaveLength(3)
        expect(wrapper.find('[data-testid="talos-setup-story"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-setup-step"]').exists()).toBe(false)
    })

    it('makes the claim against itself, which is the only one worth making', async () => {
        // Obsidian sells this with "No one else can read them, not even us".
        // TALOS can say something stronger and still true: there is no server
        // of ours, so there is no "us" for anything to reach.
        const wrapper = await mountStory()
        expect(wrapper.text()).toMatch(/no us to reach/i)
        expect(wrapper.text()).toMatch(/no backend/i)
        wrapper.unmount()
    })

    it('names every thing the owner asked to be named', async () => {
        const wrapper = await mountStory()
        const text = wrapper.text()
        expect(text).toMatch(/encrypted on this phone/i) // privacy, local-first
        expect(text).toMatch(/download a model/i) // models on the device
        expect(text).toMatch(/memory/i) // a memory you can argue with
        expect(text).toMatch(/from inside the conversation/i) // changed from chat
        expect(text).toMatch(/two models at once/i)
        expect(text).toMatch(/zethos/i)
        expect(text).toMatch(/shizuku/i) // acting on the phone itself
        expect(text).toMatch(/encrypted sync/i) // cloud, optional, off by default
        expect(text).toMatch(/encrypted Library/i) // the phone's own files
        wrapper.unmount()
    })

    it('does not make the project about the person who built it', async () => {
        // Owner 2026-07-27: "non voglio che metti che e' stato fatto da una sola
        // persona, penso sia troppo egocentrica come cosa".
        const wrapper = await mountStory()
        expect(wrapper.text()).not.toMatch(/one engineer|single builder|one-person/i)
        wrapper.unmount()
    })

    it('keeps what is built apart from what is coming', async () => {
        // The modal this replaces mixed them, and the owner called it fake.
        const wrapper = await mountStory()
        // The invariant that matters: nothing unbuilt is described in the
        // present tense. Shizuku and cloud sync exist only in the future list,
        // so the four things TALOS says it DOES must not mention them.
        const built = wrapper.findAll('li').map((node) => node.text())
            .filter((text) => /encrypted on this phone|download a model|remembers what you tell|second model|Library/i.test(text))
        expect(built.length).toBeGreaterThanOrEqual(4)
        expect(built.join(' ')).not.toMatch(/shizuku|sync/i)
        // And the future list says all three, in the future tense.
        const coming = wrapper.findAll('li').map((node) => node.text()).join(' ')
        expect(coming).toMatch(/zethos/i)
        expect(coming).toMatch(/shizuku/i)
        expect(coming).toMatch(/encrypted sync/i)
        wrapper.unmount()
    })

    it('can be left from the story too', async () => {
        const wrapper = await mountStory()
        await wrapper.get('[data-testid="talos-setup-skip"]').trigger('click')
        expect(wrapper.emitted('close')).toEqual([['skipped']])
        wrapper.unmount()
    })
})

describe('first-run setup', () => {
    it('ONBOARD-UNIFIED-02 keeps name, PIN, model and background in one setup modal', async () => {
        const wrapper = await mountSetup()
        const steps = wrapper.findAll('[data-testid="talos-setup-step"]')
        /**
         * Quattro dal 2026-08-03, e il quarto e ultimo di proposito.
         *
         * Owner: «assicurarci che l'utente venga guidato per whitelistare
         * l'applicazione in modo che giri in BG. Senza questa non possiamo
         * andare avanti.» Ultimo perche la ricerca sui permessi dice di
         * chiedere quando la persona ha capito a che serve: a quel punto ha
         * gia dato nome, PIN e modello.
         */
        expect(steps).toHaveLength(4)
        expect(steps.map((step) => step.text())).toEqual(['Name', 'PIN', 'Model', 'Background'])
        expect(steps[0]!.attributes('aria-current')).toBe('step')
        expect(wrapper.find('[data-testid="talos-setup-identity"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('leads with the consequence instead of a reassurance', async () => {
        // The PIN is not a lock over the app: `enableTalosDatabaseProtection`
        // makes it the database key. Softening that would be the one lie this
        // screen cannot afford.
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toMatch(/no recovery/i)
        wrapper.unmount()
    })

    it('ONBOARD-UNIFIED-03 saves the name and its global memory before advancing', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('  Ninò 🚀  ')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(state.savedNames).toEqual(['Ninò 🚀'])
        expect(state.memoryNames).toEqual(['Ninò 🚀'])
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[1]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('ONBOARD-UNIFIED-05 keeps a failed memory write visible and retryable', async () => {
        state.memoryFailure = true
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-setup-identity-error"]').attributes('role')).toBe('alert')
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[0]!.attributes('aria-current')).toBe('step')

        state.memoryFailure = false
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        expect(state.memoryNames).toEqual(['Nino', 'Nino'])
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[1]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('goes forward and back across identity, PIN and model', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[2]!.attributes('aria-current')).toBe('step')
        await flushPromises()
        expect(wrapper.find('[data-testid="settings-provider-keys"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-setup-back"]').trigger('click')
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[1]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('opens on the model step when a name and PIN already exist', async () => {
        // Killed between the two steps, or the PIN was set earlier in Settings.
        // Asking again would be the app not looking at its own state.
        state.account.display_name = 'Nino'
        state.memoryExisting = true
        state.security.app_lock_enabled = true
        const wrapper = await mountSetup()
        const steps = wrapper.findAll('[data-testid="talos-setup-step"]')
        expect(steps[2]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('keeps a visible way out on every step, and reports it as skipped', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-skip"]').trigger('click')
        expect(wrapper.emitted('close')).toEqual([['skipped']])
        wrapper.unmount()
    })

    it('finishes as completed from the last step', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        // Un passo in piu: la pagina del background e l'ultima.
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-intro-cta"]').trigger('click')
        expect(wrapper.emitted('close')).toEqual([['completed']])
        wrapper.unmount()
    })

    it('offre il background senza chiederlo da solo, e lascia passare', async () => {
        /**
         * Owner: «senza questa non possiamo andare avanti» — ma un onboarding
         * che non lascia passare e un onboarding che le persone disinstallano.
         * La pagina spiega, offre un pulsante, e il tasto avanti resta.
         */
        const permissions = await import('@/services/devicePermissions')
        const spy = vi.spyOn(permissions, 'requestTalosBatteryExemption')
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-setup-background"]').exists()).toBe(true)
        // Niente e stato chiesto al sistema per il solo fatto di essere arrivati
        // qui: la richiesta parte dal dito, come dice la guida di Android.
        expect(spy).not.toHaveBeenCalled()
        // E si puo chiudere senza concedere.
        expect(wrapper.find('[data-testid="talos-intro-cta"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('asks the device for nothing at all', async () => {
        // Android is explicit: permissions are requested when the person invokes
        // the feature that needs them, never at first launch.
        const permissions = await import('@/services/devicePermissions')
        const spy = vi.spyOn(permissions, 'requestTalosNotifications')
        const mic = vi.spyOn(permissions, 'requestTalosMicrophone')
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        expect(spy).not.toHaveBeenCalled()
        expect(mic).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('does not carry a single slide of marketing', async () => {
        const wrapper = await mountSetup()
        // What the owner called "molto fake": promises about things that do not
        // exist on this device yet.
        expect(wrapper.text()).not.toMatch(/roadmap/i)
        expect(wrapper.text()).not.toMatch(/step \d of 6/i)
        wrapper.unmount()
    })
})
