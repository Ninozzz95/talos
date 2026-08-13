// @vitest-environment jsdom

/**
 * ⛔⛔ L'INTERRUTTORE CHE MENTIVA — owner 2026-08-12, verbatim: «l'assistente non
 * ha accesso alla ricerca web, cosa che dovrebbe essere tranquillamente
 * accessibile dalla chat. Questo è assolutamente inaccettabile».
 *
 * La premessa era falsa e la misura l'ha ribaltata: non ce l'aveva **nessuno
 * dei due**. In questo pannello `web_search` era acceso, i permessi erano
 * `allow`, e la sonda sul Pad diceva `offerti=59` **senza `web_search`** —
 * perché nessun motore di ricerca era mai stato scelto e la dipendenza `web` del
 * toolset fa `if (!source) return null`. Messa la chiave Tavily dalla schermata
 * vera: `offerti=61 [web_search, web_read, …]`. La differenza di **due** è la
 * prova che la causa era quella.
 *
 * ⇒ Da fuori, «acceso ma manca il pezzo a monte» e «acceso e bloccato dai
 * permessi» erano indistinguibili, e l'owner ha dedotto il secondo — la
 * spiegazione sbagliata. Questo test tiene la riga onesta, **nei due versi**:
 * senza motore lo dice e porta dove si aggiusta; col motore **tace**.
 *
 * Un test in un verso solo qui non morderebbe: un avviso stampato sempre
 * passerebbe la metà «lo dice» e sarebbe un difetto peggiore di quello che
 * cura. Vedi `provare-sempre-anche-il-verso-contrario`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const settings = vi.hoisted(() => ({
    state: {
        tools: { read: 'allow', write: 'allow', outbound: 'allow' },
        tools_chosen: ['read', 'write', 'outbound'],
        search: { source: null as string | null },
        agent_tools: { web_search: true, web_read: true } as Record<string, boolean>,
        tool_authorizations: { schema_version: 1, revision: 0, grants: {} as Record<string, unknown> },
    },
    setAgentToolEnabled: vi.fn(async () => {}),
    revokeToolAuthorization: vi.fn(async () => {}),
    effectiveToolPermissions: () => settings.state.tools,
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

import TalosMobileSettingsAgentToolsPanel from '@/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'

/** I tool che senza un motore di ricerca non vengono nemmeno costruiti. */
const DIPENDENTI = TALOS_AGENT_TOOL_CONTROLS
    .filter((tool) => tool.richiede === 'motoreDiRicerca')
    .map((tool) => tool.id)

beforeEach(() => {
    vi.clearAllMocks()
    settings.state.search.source = null
    settings.state.agent_tools.web_search = true
    settings.state.agent_tools.web_read = true
})

describe('l’interruttore che mente', () => {
    it('il catalogo dichiara CHI dipende dal motore, e sono i due tool web', () => {
        // Non un numero scritto a mano: se nasce un terzo tool che esce sul web
        // passando dal motore, deve dichiararlo — o questa riga lo scopre.
        expect([...DIPENDENTI].sort()).toEqual(['web_read', 'web_search'])
        // E nessun altro lo dichiara per sbaglio: il requisito non è decorativo.
        expect(TALOS_AGENT_TOOL_CONTROLS.filter((tool) => tool.richiede).length).toBe(2)
    })

    it('SENZA motore: la riga dice che non funziona, e offre la strada', () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)

        for (const id of DIPENDENTI) {
            const riga = wrapper.get(`[data-agent-tool="${id}"]`)
            // ⛔ L'interruttore resta ACCESO — è la scelta della persona, e
            // spegnerlo di nascosto sarebbe un'altra bugia, nell'altro verso.
            expect(riga.get('[role="switch"]').attributes('aria-checked')).toBe('true')
            // …e accanto c'è la verità, in parole, non un nome di chiave.
            expect(riga.find(`[data-agent-tool-missing="${id}"]`).exists()).toBe(true)
            expect(riga.text()).toContain('no search engine is set')
            expect(riga.text()).not.toContain('agentTools.')
        }
    })

    it('SENZA motore: il pulsante PORTA al pannello del motore', async () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)

        // Un avviso che nomina una schermata e non la apre lascia la persona a
        // cercarla: è metà del difetto che l'avviso doveva chiudere.
        await wrapper.get('[data-agent-tool="web_search"] [data-agent-tool-fix="search-source"]')
            .trigger('click')

        expect(wrapper.emitted('vaiAlMotore')).toHaveLength(1)
    })

    it('CON il motore scelto: l’avviso SPARISCE, e non resta traccia', () => {
        settings.state.search.source = 'tavily'

        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)

        for (const id of DIPENDENTI) {
            expect(wrapper.find(`[data-agent-tool-missing="${id}"]`).exists()).toBe(false)
        }
        expect(wrapper.find('[data-agent-tool-fix="search-source"]').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('no search engine is set')
    })

    it('l’avviso riguarda il MOTORE, non l’interruttore: resta anche a tool spento', () => {
        // Perché sono due fatti diversi. «Spento da te» e «non esiste comunque»
        // vogliono cure opposte, e una riga che li fondesse rimanderebbe la
        // persona a riaccendere un interruttore che non cambierebbe niente.
        settings.state.agent_tools.web_search = false

        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        const riga = wrapper.get('[data-agent-tool="web_search"]')

        expect(riga.get('[role="switch"]').attributes('aria-checked')).toBe('false')
        expect(riga.find('[data-agent-tool-missing="web_search"]').exists()).toBe(true)
    })
})
