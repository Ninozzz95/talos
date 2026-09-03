// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'
import type { ForgeInstalledRecord } from '@/lib/tools/dynamic/forgeRegistryRepository'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 6, la stazione VERA. Il
 * repository è mockato (è già provato, per davvero, contro sql.js in
 * `forgeRegistryRepository.test.ts`) — qui si prova SOLO ciò che la UI
 * aggiunge sopra: cosa mostra, cosa nasconde, cosa succede al tocco.
 */

const listForgeTools = vi.fn<() => Promise<ForgeInstalledRecord[]>>()
const setForgeToolEnabled = vi.fn<(id: string, enabled: boolean) => Promise<void>>(async () => undefined)
const removeForgeTool = vi.fn<(id: string) => Promise<void>>(async () => undefined)
vi.mock('@/lib/tools/dynamic/forgeRegistryRepository', () => ({
    listForgeTools: () => listForgeTools(),
    setForgeToolEnabled: (id: string, enabled: boolean) => setForgeToolEnabled(id, enabled),
    removeForgeTool: (id: string) => removeForgeTool(id),
}))

const writeTalosClipboardText = vi.fn<(value: string) => Promise<void>>(async () => undefined)
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: (value: string) => writeTalosClipboardText(value) }))

function manifest(id: string, overrides: Partial<TalosLocalToolManifestV1> = {}): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id, version: 1, title: `Tool ${id}`,
        description: 'test manifest', createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        flow: { entry: 'ret', maxTransitions: 8, nodes: [{ id: 'ret', type: 'return', value: 1 }] },
        ...overrides,
    }
}

function record(id: string, overrides: Partial<ForgeInstalledRecord> = {}, manifestOverrides: Partial<TalosLocalToolManifestV1> = {}): ForgeInstalledRecord {
    return { manifest: manifest(id, manifestOverrides), enabled: false, installedAt: new Date().toISOString(), previousVersions: [], ...overrides }
}

beforeEach(() => {
    listForgeTools.mockReset().mockResolvedValue([])
    setForgeToolEnabled.mockClear()
    removeForgeTool.mockClear()
    writeTalosClipboardText.mockClear()
})

describe('TalosToolForgeStation — elenco vuoto', () => {
    it('senza tool installati mostra SOLO l\'invito a importare, mai una lista', async () => {
        const Station = (await import('@/components/talos/tools/TalosToolForgeStation.vue')).default
        const wrapper = mount(Station)
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-tool-forge-list"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-tool-forge-import-cta"]').exists()).toBe(true)
    })
})

describe('TalosToolForgeStation — elenco popolato', () => {
    it('mostra ogni tool, e blocca il toggle su chi ha una credenziale irrisolvibile', async () => {
        listForgeTools.mockResolvedValue([
            record('tool-a', { enabled: true }),
            record('tool-b', {}, { credentialRequirements: [{ id: 'api-key', kind: 'api_profile', purpose: 'x', outboundScope: [] }] }),
        ])
        const Station = (await import('@/components/talos/tools/TalosToolForgeStation.vue')).default
        const wrapper = mount(Station)
        await flushPromises()

        const righe = wrapper.findAll('[data-testid="talos-tool-forge-row"]')
        expect(righe).toHaveLength(2)
        expect(righe[0]!.find('[data-testid="talos-tool-forge-toggle"]').exists()).toBe(true)
        expect(righe[0]!.find('[data-testid="talos-tool-forge-blocked"]').exists()).toBe(false)
        expect(righe[1]!.find('[data-testid="talos-tool-forge-toggle"]').exists()).toBe(false)
        expect(righe[1]!.find('[data-testid="talos-tool-forge-blocked"]').exists()).toBe(true)
    })

    /**
     * ⛔⛔ Trovato sul dispositivo il 27/8: il riepilogo diceva «N installati»
     * ma contava gli ABILITATI. Con 2 installati e 1 solo abilitato avrebbe
     * mostrato «1 installato» — falso.
     */
    it('il riepilogo conta gli INSTALLATI, non solo gli abilitati', async () => {
        listForgeTools.mockResolvedValue([
            record('tool-a', { enabled: true }),
            record('tool-b', { enabled: false }),
        ])
        const Station = (await import('@/components/talos/tools/TalosToolForgeStation.vue')).default
        const wrapper = mount(Station)
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-tool-forge-summary"]').text()).toContain('2')
        expect(wrapper.get('[data-testid="talos-tool-forge-summary"]').text()).not.toMatch(/\b1\b/)
    })

    it('il tocco sull\'interruttore chiama setForgeToolEnabled con lo stato INVERTITO, e ricarica', async () => {
        listForgeTools.mockResolvedValue([record('tool-a', { enabled: false })])
        const Station = (await import('@/components/talos/tools/TalosToolForgeStation.vue')).default
        const wrapper = mount(Station)
        await flushPromises()

        await wrapper.get('[data-testid="talos-tool-forge-toggle"]').trigger('click')
        await flushPromises()

        expect(setForgeToolEnabled).toHaveBeenCalledWith('tool-a', true)
        expect(listForgeTools).toHaveBeenCalledTimes(2) // montaggio + dopo il toggle
    })

    it('la frase di rischio riusa chat.plan.risk.*, non una sigla R0-R4 nuda', async () => {
        listForgeTools.mockResolvedValue([record('tool-a')])
        const Station = (await import('@/components/talos/tools/TalosToolForgeStation.vue')).default
        const wrapper = mount(Station)
        await flushPromises()

        const risk = wrapper.get('[data-testid="talos-tool-forge-risk"]').text()
        expect(risk).not.toMatch(/^R[0-4]$/)
        expect(risk.length).toBeGreaterThan(0)
    })
})

describe('TalosToolForgeStation — azioni di riga', () => {
    it('Esporta scrive negli appunti col servizio VERO, non con navigator.clipboard nudo', async () => {
        listForgeTools.mockResolvedValue([record('tool-a')])
        const Station = (await import('@/components/talos/tools/TalosToolForgeStation.vue')).default
        const wrapper = mount(Station)
        await flushPromises()

        await wrapper.get('[data-testid="talos-tool-forge-row-actions"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLButtonElement>('[data-testid="talos-tool-forge-action-export"]')?.click()
        // exportTool() fa un import() dinamico di artifact.ts — un ordinario
        // flushPromises() non basta a farlo risolvere (stesso motivo
        // documentato in tests/setup/jsdomShims.ts per il teardown race).
        await vi.dynamicImportSettled()
        await flushPromises()

        expect(writeTalosClipboardText).toHaveBeenCalledTimes(1)
        const [payload] = writeTalosClipboardText.mock.calls[0]!
        expect(JSON.parse(payload).manifest.id).toBe('tool-a')
    })

    it('Elimina chiede conferma PRIMA di chiamare removeForgeTool', async () => {
        listForgeTools.mockResolvedValue([record('tool-a')])
        const Station = (await import('@/components/talos/tools/TalosToolForgeStation.vue')).default
        const wrapper = mount(Station)
        await flushPromises()

        await wrapper.get('[data-testid="talos-tool-forge-row-actions"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLButtonElement>('[data-testid="talos-tool-forge-action-delete"]')?.click()
        await flushPromises()

        expect(removeForgeTool).not.toHaveBeenCalled()
        expect(document.querySelector('[data-testid="talos-tool-forge-delete-confirm"]')).not.toBeNull()

        document.querySelector<HTMLButtonElement>('[data-testid="talos-tool-forge-delete-confirm"]')?.click()
        await flushPromises()
        expect(removeForgeTool).toHaveBeenCalledWith('tool-a')
    })
})
