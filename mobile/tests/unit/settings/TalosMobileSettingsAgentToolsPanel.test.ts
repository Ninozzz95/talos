// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const enabled = {
    library_list: true,
    library_search: true,
    library_read: true,
    notes_list: true,
    tasks_list: true,
    memory_search: true,
    time_now: true,
    web_search: true,
    web_read: true,
    document_create: true,
    generate_image: true,
    library_export: true,
    library_context_policy_update: false,
}

const settings = vi.hoisted(() => ({
    state: {
        agent_tools: {
            library_list: true,
            library_search: true,
            library_read: true,
            notes_list: true,
            tasks_list: true,
            memory_search: true,
            time_now: true,
            web_search: true,
            web_read: true,
            document_create: true,
            generate_image: true,
            library_export: true,
            library_context_policy_update: false,
        },
        tool_authorizations: {
            schema_version: 1,
            revision: 0,
            grants: {},
        } as {
            schema_version: 1
            revision: number
            grants: Record<string, {
                schema_version: 1
                tool: string
                actions: readonly ('read' | 'write' | 'outbound')[]
                scope: 'device'
                granted_at: string
            }>
        },
    },
    setAgentToolEnabled: vi.fn(async () => {}),
    revokeToolAuthorization: vi.fn(async () => {}),
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

import TalosMobileSettingsAgentToolsPanel from '@/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue'

beforeEach(() => {
    vi.clearAllMocks()
    settings.setAgentToolEnabled.mockResolvedValue(undefined)
    settings.revokeToolAuthorization.mockResolvedValue(undefined)
    settings.state.tool_authorizations = {
        schema_version: 1,
        revision: 0,
        grants: {},
    }
    Object.assign(settings.state.agent_tools, enabled)
})

describe('TalosMobileSettingsAgentToolsPanel', () => {
    it('AGENT-TOOLS-07 renders every real tool with persistent accessible switches', async () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)

        expect(wrapper.findAll('[data-agent-tool]')).toHaveLength(13)
        expect(wrapper.text()).toContain('12 of 13 enabled')

        const search = wrapper.get('[data-agent-tool="library_search"]')
        const toggle = search.get('input[role="switch"]')
        expect(toggle.attributes('aria-label')).toBe('Enable Search the Library')
        expect((toggle.element as HTMLInputElement).checked).toBe(true)

        await toggle.setValue(false)

        expect(settings.setAgentToolEnabled).toHaveBeenCalledWith('library_search', false)
        const policy = wrapper.get('[data-agent-tool="library_context_policy_update"]')
        expect(policy.text()).toContain('Manage Library context policy')
        expect((policy.get('input[role="switch"]').element as HTMLInputElement).checked)
            .toBe(false)
    })

    it('AGENT-TOOLS-10 renders a pill switch while preserving the native accessible input', () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        const row = wrapper.get('[data-agent-tool="library_search"]')

        expect(row.get('input[role="switch"]').classes()).toContain('sr-only')
        const visual = row.get('[data-agent-tool-toggle-visual]')
        expect(visual.classes()).toContain('rounded-full')
        expect(visual.classes()).toContain('pointer-events-none')
    })

    it('TOOL-AUTH-27 makes the descriptive row area a native switch label target', () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        const row = wrapper.get('[data-agent-tool="library_search"]')
        const toggle = row.get('input[role="switch"]')
        const label = row.get('[data-agent-tool-label="library_search"]')

        expect(label.element.tagName).toBe('LABEL')
        expect(label.attributes('for')).toBe(toggle.attributes('id'))
        expect(label.classes()).toContain('cursor-pointer')
    })

    it('AGENT-TOOLS-PERSIST-03 restores the controlled switch and announces a failed save', async () => {
        settings.setAgentToolEnabled.mockRejectedValueOnce(new Error('native detail'))
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        const toggle = wrapper.get(
            '[data-agent-tool="library_search"] input[role="switch"]',
        )

        await toggle.setValue(false)
        await flushPromises()

        expect((toggle.element as HTMLInputElement).checked).toBe(true)
        expect(wrapper.text()).toContain('12 of 13 enabled')
        expect(wrapper.get('[data-testid="agent-tools-save-error"]').attributes('role')).toBe('alert')
        expect(wrapper.get('[data-testid="agent-tools-save-error"]').text())
            .toBe('Could not save Search the Library. The previous setting is still active.')
        expect(wrapper.text()).not.toContain('native detail')
        expect(toggle.attributes('disabled')).toBeUndefined()
    })

    it('TOOL-AUTH-20 shows and revokes an exact saved tool authorization', async () => {
        settings.state.tool_authorizations = {
            schema_version: 1,
            revision: 1,
            grants: {
                document_create: {
                    schema_version: 1,
                    tool: 'document_create',
                    actions: ['write'],
                    scope: 'device',
                    granted_at: '2026-07-29T12:00:00.000Z',
                },
            },
        }
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        const row = wrapper.get('[data-agent-tool="document_create"]')

        expect(row.text()).toContain('Always allowed')
        await row.get('[data-agent-tool-revoke="document_create"]').trigger('click')
        await flushPromises()

        expect(settings.revokeToolAuthorization).toHaveBeenCalledWith('document_create')
    })
})
