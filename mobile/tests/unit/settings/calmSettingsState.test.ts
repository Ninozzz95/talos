// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { __resetSettingsStoreForTests, useSettingsStore } from '@/stores/settings'
import AgentTools from '@/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue'
import Privacy from '@/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue'
import Capability from '@/components/talos/settings/TalosMobileSettingsCapabilityPanel.vue'
import Select from '@/components/talos/ui/TalosThemedSelect.vue'
import { talosMobileSettingsTab } from '@/components/talos/settings/settingsTabs'

// Keep persistence real while every device/model boundary stays inert.
vi.mock('@/stores/chatController', () => ({ useChatController: () => ({ selectedProfile: ref(null) }) }))
vi.mock('@/services/devicePermissions', async (original) => ({
    ...await original<typeof import('@/services/devicePermissions')>(),
    readTalosDeviceState: vi.fn(async () => ({
        microphone: 'granted', notifications: 'prompt', notificationsRuntime: false,
        biometricHardware: false, accessibilityEnabled: false, batteryExempt: true,
        manufacturer: '', brand: '', runtime: {},
    })),
}))
vi.mock('@/services/localEngine', () => ({ talosLocalInstalledModels: vi.fn(async () => ({ models: [] })) }))

const wrappers: VueWrapper[] = []
const stubs = { TalosThemedSelect: true, RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
function panel(component: typeof AgentTools | typeof Privacy) {
    const wrapper = mount(component, { attachTo: document.body, global: { stubs } })
    wrappers.push(wrapper)
    return wrapper
}
function select(wrapper: VueWrapper, id: string) {
    return wrapper.findAllComponents(Select).find((entry) => entry.attributes('data-testid') === id)!
}
async function clickDialog(id: string) {
    const button = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
    expect(button).not.toBeNull()
    button!.click()
    await flushPromises()
}
async function seedGrants() {
    const settings = useSettingsStore()
    await settings.grantToolAuthorization('library_read', ['read'])
    await settings.grantToolAuthorization('document_create', ['write'])
    await settings.grantToolAuthorization('dynamic:personal-helper', ['read'])
    return settings
}

beforeEach(() => {
    localStorage.clear()
    __resetSettingsStoreForTests()
})
afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

describe('Calm settings save the choices consumed by the product', () => {
    it('saves both approval scopes and reads the stored value after reopening', async () => {
        const settings = useSettingsStore()
        const wrapper = panel(AgentTools)
        const control = select(wrapper, 'talos-plan-scope')
        expect(control.props('items').map((item: { value: string }) => item.value)).toEqual(['turn', 'conversation'])
        for (const scope of ['conversation', 'turn', 'conversation']) {
            control.vm.$emit('update:modelValue', scope)
            await flushPromises()
            expect(settings.state.shell.plan_scope).toBe(scope)
            expect(control.props('modelValue')).toBe(scope)
        }
        control.vm.$emit('update:modelValue', 'forever')
        await flushPromises()
        expect(settings.state.shell.plan_scope).toBe('conversation')
        wrapper.unmount()
        __resetSettingsStoreForTests()
        await useSettingsStore().hydrate()
        expect(useSettingsStore().state.shell.plan_scope).toBe('conversation')
    })

    it('keeps the previous scope and announces a failed write', async () => {
        vi.spyOn(useSettingsStore(), 'setShell').mockRejectedValueOnce(new Error('private detail'))
        const wrapper = panel(AgentTools)
        select(wrapper, 'talos-plan-scope').vm.$emit('update:modelValue', 'conversation')
        await flushPromises()
        expect(select(wrapper, 'talos-plan-scope').props('modelValue')).toBe('turn')
        expect(wrapper.get('[data-testid="agent-tools-save-error"]').text()).toContain('previous choice')
        expect(wrapper.text()).not.toContain('private detail')
    })

    it('disables collective revocation with a readable reason when no grant exists', () => {
        const wrapper = panel(AgentTools)
        const button = wrapper.get('[data-testid="agent-tools-revoke-all"]')
        expect(button.attributes('disabled')).toBeDefined()
        expect(button.attributes('aria-describedby')).toBe('agent-tools-no-authorizations')
        expect(wrapper.get('[data-testid="agent-tools-no-authorizations"]').text()).toContain('No saved authorizations')
    })

    it('requires confirmation, supports cancel, and revokes built-in and user-created grants without disabling tools', async () => {
        const settings = await seedGrants()
        const enabled = { ...settings.state.agent_tools }
        const revoke = vi.spyOn(settings, 'revokeToolAuthorization')
        const wrapper = panel(AgentTools)
        await wrapper.get('[data-testid="agent-tools-revoke-all"]').trigger('click')
        await flushPromises()
        const dialog = document.querySelector('[role="dialog"]')!
        expect(dialog).not.toBeNull()
        // R1-1: la conferma e' TalosMobileConfirmDialog (velo z-85 sopra il foglio a 70), non il Dialog di reka.
        expect(dialog.closest('[data-testid="talos-confirm-dialog"]')).not.toBeNull()
        expect(revoke).not.toHaveBeenCalled()
        await clickDialog('agent-tools-revoke-cancel')
        expect(Object.keys(settings.state.tool_authorizations.grants)).toHaveLength(3)
        await wrapper.get('[data-testid="agent-tools-revoke-all"]').trigger('click')
        await flushPromises()
        await clickDialog('agent-tools-revoke-confirm')
        expect(revoke.mock.calls.map(([id]) => id).sort()).toEqual(['document_create', 'dynamic:personal-helper', 'library_read'])
        expect(settings.state.tool_authorizations.grants).toEqual({})
        expect(settings.state.agent_tools).toEqual(enabled)
        expect(wrapper.get('[data-testid="agent-tools-revoke-all"]').attributes('disabled')).toBeDefined()
        wrapper.unmount()
        __resetSettingsStoreForTests()
        await useSettingsStore().hydrate()
        expect(useSettingsStore().state.tool_authorizations.grants).toEqual({})
    })

    it('continues after a failed revocation and leaves the remaining grant visible', async () => {
        const settings = await seedGrants()
        vi.spyOn(settings, 'revokeToolAuthorization').mockRejectedValueOnce(new Error('private detail'))
        const wrapper = panel(AgentTools)
        await wrapper.get('[data-testid="agent-tools-revoke-all"]').trigger('click')
        await flushPromises()
        await clickDialog('agent-tools-revoke-confirm')
        expect(Object.keys(settings.state.tool_authorizations.grants)).toEqual(['library_read'])
        expect(wrapper.get('[data-agent-tool="library_read"]').text()).toContain('Always allowed')
        expect(wrapper.get('[data-testid="agent-tools-save-error"]').text()).toContain('Some authorizations')
        expect(wrapper.text()).not.toContain('private detail')
        expect(wrapper.get('[data-testid="agent-tools-revoke-all"]').attributes('disabled')).toBeUndefined()
    })

    it.each(['library_access', 'memory_write_access', 'image_attachment_consent'] as const)('persists all three real values of %s independently', async (key) => {
        const settings = useSettingsStore()
        const initial = { ...settings.state.shell }
        const wrapper = panel(Privacy)
        const control = select(wrapper, `privacy-${key}`)
        expect(control.props('items').map((item: { value: string }) => item.value)).toEqual(['allow', 'ask', 'deny'])
        for (const value of ['allow', 'ask', 'deny']) {
            control.vm.$emit('update:modelValue', value)
            await flushPromises()
            expect(settings.state.shell[key]).toBe(value)
            expect(control.props('modelValue')).toBe(value)
        }
        expect(settings.state.shell).toEqual({ ...initial, [key]: 'deny' })
        wrapper.unmount()
        __resetSettingsStoreForTests()
        await useSettingsStore().hydrate()
        expect(useSettingsStore().state.shell[key]).toBe('deny')
    })

    it('preserves consent on save failure and rejects values outside its real states', async () => {
        const settings = useSettingsStore()
        const save = vi.spyOn(settings, 'setShell').mockRejectedValueOnce(new Error('private detail'))
        const wrapper = panel(Privacy)
        select(wrapper, 'privacy-library_access').vm.$emit('update:modelValue', 'allow')
        await flushPromises()
        expect(select(wrapper, 'privacy-library_access').props('modelValue')).toBe('ask')
        expect(wrapper.get('[data-testid="privacy-content-save-error"]').attributes('role')).toBe('alert')
        select(wrapper, 'privacy-library_access').vm.$emit('update:modelValue', 'sometimes')
        await flushPromises()
        expect(save).toHaveBeenCalledTimes(1)
    })

    it('keeps the existing local engine action and its honest no-model result', async () => {
        const wrapper = panel(Privacy)
        await wrapper.get('[data-testid="talos-local-engine-probe-run"]').trigger('click')
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-local-engine-probe-no-model"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="privacy-phone-control"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-permission-row]').length).toBeGreaterThan(5)
    })

    it.each([['reminders', 'tasks'], ['system', 'doctor']] as const)('opens the existing destination from %s', async (tab, destination) => {
        const router = createRouter({ history: createMemoryHistory(), routes: [
            { path: '/', component: { template: '<div />' } },
            { path: '/tasks', name: 'tasks', component: { template: '<div />' } },
            { path: '/doctor', name: 'doctor', component: { template: '<div />' } },
        ] })
        await router.push('/')
        const wrapper = mount(Capability, { props: { tab: talosMobileSettingsTab(tab) }, global: { plugins: [router] } })
        wrappers.push(wrapper)
        expect(wrapper.get('[data-capability-state="gated"]').exists()).toBe(true)
        await wrapper.get('a').trigger('click')
        await flushPromises()
        expect(router.currentRoute.value.name).toBe(destination)
    })
})
