// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const enabled = {
    library_list: true,
    library_search: true,
    library_read: true,
    library_file_origin: true,
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
    local_models_search: true,
    local_model_inspect: true,
    local_model_download: true,
    local_models_status: true,
}

const settings = vi.hoisted(() => ({
    state: {
        // The three trust levels moved here from AI defaults on 2026-08-02:
        // the panel now frames the tool list with how far the model may go.
        tools: { read: 'allow', write: 'ask', outbound: 'ask' },
        // ⛔ Scelti TUTTI e tre: qui i permessi non sono l'oggetto della prova,
        // e senza questa riga i tre valori sopra verrebbero riportati al
        // default di oggi — la regola provata in `permessiEffettiviAschermo`.
        tools_chosen: ['read', 'write', 'outbound'],
        // ⛔ Motore scelto: qui non è l'oggetto della prova, e senza motore le
        // due righe web mostrerebbero l'avviso «manca un motore di ricerca» —
        // che ha il suo test in `interruttoreCheMente`.
        search: { source: 'tavily' as string | null },
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
    effectiveToolPermissions: () => settings.state.tools,
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

import TalosMobileSettingsAgentToolsPanel from '@/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'

/*
 * ⛔ Contati dal CATALOGO, non scritti a mano.
 *
 * Il numero a mano era 38 e diceva la cosa giusta finche' i tool erano 38: da
 * quel momento in poi cadeva ogni volta che ne aggiungevamo uno, anche quando
 * il pannello funzionava perfettamente — cioe' proprio quando il pannello
 * FUNZIONAVA, visto che il suo lavoro e' mostrarli TUTTI. Un test che codifica
 * l'implementazione impedisce di migliorarla.
 *
 * L'invariante vero e' un altro, e non ha numeri dentro: **una riga per ogni
 * voce del catalogo**, e **il contatore d'accordo con gli interruttori accesi**
 * — calcolato qui con la stessa regola del pannello, cosi' se la regola cambia
 * da una parte sola il test se ne accorge.
 */
const righeAttese = TALOS_AGENT_TOOL_CONTROLS.length
const accesiAttesi = TALOS_AGENT_TOOL_CONTROLS.filter(
    (control) => (enabled as Record<string, boolean>)[control.id],
).length

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

        // 26 dal 2026-08-06, non 24: `research_list` e `memory_write`
        // esistevano da settimane e non comparivano in questo pannello, perché
        // mancavano dal catalogo. Due tool che il modello poteva usare e che
        // nessuno poteva spegnere.
        expect(wrapper.findAll('[data-agent-tool]')).toHaveLength(righeAttese)
        expect(wrapper.text()).toContain(`${accesiAttesi} of ${righeAttese} enabled`)
        /**
         * Found by an adversarial review, 2026-07-31: a tool was added to the
         * catalog with no strings, and this test still passed because it only
         * counted rows. The user would have read
         * `agentTools.tools.library_file_origin.title` in bold, in both
         * languages. Counting rows is not reading them.
         */
        expect(wrapper.text()).not.toContain('agentTools.tools.')

        const search = wrapper.get('[data-agent-tool="library_search"]')
        const toggle = search.get('[role="switch"]')
        expect(toggle.attributes('aria-label')).toBe('Enable Search the Library')
        expect(toggle.attributes('aria-checked')).toBe('true')

        await toggle.trigger('click')

        expect(settings.setAgentToolEnabled).toHaveBeenCalledWith('library_search', false)
        const policy = wrapper.get('[data-agent-tool="library_context_policy_update"]')
        expect(policy.text()).toContain('Manage Library context policy')
        // The one tool that ships off: announced off, not merely unchecked.
        expect(policy.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    })

    it('AGENT-TOOLS-10 shows exactly one switch per row, and it is the shared one', () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        const row = wrapper.get('[data-agent-tool="library_search"]')

        // The hand-drawn track is gone with the private implementation. Two
        // controls in one row would be the bug this asserts against: the old
        // markup kept a real input and a fake pill, and only one of them worked.
        expect(row.findAll('[role="switch"]')).toHaveLength(1)
        expect(row.findAll('[data-agent-tool-toggle-visual]')).toHaveLength(0)
        expect(row.get('[role="switch"]').attributes('data-testid')).toBe('talos-themed-switch')
    })

    it('TOOL-AUTH-27 keeps the whole row tappable, not just the switch itself', async () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        const row = wrapper.get('[data-agent-tool="library_search"]')
        const target = row.get('[data-agent-tool-label="library_search"]')

        // `for` does nothing when the control is a button, so the row carries
        // the tap itself. The assertion is the effect, not the element: after
        // touching the row area, the store was asked to flip that tool.
        await target.trigger('click')
        expect(settings.setAgentToolEnabled).toHaveBeenCalledWith('library_search', false)
    })

    it('AGENT-TOOLS-PERSIST-03 restores the controlled switch and announces a failed save', async () => {
        settings.setAgentToolEnabled.mockRejectedValueOnce(new Error('native detail'))
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        const toggle = wrapper.get(
            '[data-agent-tool="library_search"] [role="switch"]',
        )

        await toggle.trigger('click')
        await flushPromises()

        // Still announced ON: the save failed, and a controlled switch cannot
        // show a value that was never stored.
        expect(toggle.attributes('aria-checked')).toBe('true')
        expect(wrapper.text()).toContain(`${accesiAttesi} of ${righeAttese} enabled`)
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

    /**
     * P0-COPY-01, re-homed 2026-08-02. The promise about what leaves the device
     * has to be made where the choice is made; when the trust levels moved out
     * of AI defaults, the sentence that explains them moved too, and this is the
     * test that proves it did not get lost on the way.
     */
    it('P0-COPY-01 states the active outbound and persistent-write web contract', () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })

        expect(wrapper.text()).toMatch(
            /web search.*send.*off this device.*encrypted Library.*create or change/is,
        )
        expect(wrapper.text()).not.toMatch(/Nothing in TALOS does this today/i)
    })
})
