// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'
import type { ForgeAuditEntry, ForgeInstalledRecord } from '@/lib/tools/dynamic/forgeRegistryRepository'

/**
 * ⛔ Owner 2026-08-27 — Tool Forge Fase 6. Stesso motivo del foglio
 * d'importazione: `TalosMobileComposerSheet` teletrasporta, quindi si legge
 * dal `document`, non dal wrapper montato.
 */

const listForgeAudit = vi.fn<(id: string) => Promise<ForgeAuditEntry[]>>(async () => [])
const rollbackForgeTool = vi.fn<(id: string) => Promise<void>>(async () => undefined)
const removeForgeTool = vi.fn<(id: string) => Promise<void>>(async () => undefined)
vi.mock('@/lib/tools/dynamic/forgeRegistryRepository', () => ({
    listForgeAudit: (id: string) => listForgeAudit(id),
    rollbackForgeTool: (id: string) => rollbackForgeTool(id),
    removeForgeTool: (id: string) => removeForgeTool(id),
}))

function manifest(overrides: Partial<TalosLocalToolManifestV1> = {}, version = 1): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id: 'weather-brief', version, title: 'Weather brief',
        description: 'test manifest', createdAt: new Date().toISOString(), parentVersion: version > 1 ? version - 1 : null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        flow: { entry: 'ret', maxTransitions: 8, nodes: [{ id: 'ret', type: 'return', value: version }] },
        ...overrides,
    }
}

function button(testId: string): HTMLButtonElement {
    return document.querySelector(`[data-testid="${testId}"]`)!
}

beforeEach(() => {
    document.body.innerHTML = ''
    listForgeAudit.mockReset().mockResolvedValue([])
    rollbackForgeTool.mockClear()
    removeForgeTool.mockClear()
})

async function mountSheet(record: ForgeInstalledRecord) {
    const Sheet = (await import('@/components/talos/tools/TalosToolForgeDetailSheet.vue')).default
    const wrapper = mount(Sheet, { props: { record }, attachTo: document.body })
    await flushPromises()
    return wrapper
}

describe('TalosToolForgeDetailSheet — rischio', () => {
    it('mostra la frase di rischio, non una sigla R0-R4 nuda', async () => {
        await mountSheet({ manifest: manifest(), enabled: false, installedAt: new Date().toISOString(), previousVersions: [] })
        const risk = document.querySelector('[data-testid="talos-tool-forge-detail-risk"]')?.textContent ?? ''
        expect(risk).not.toMatch(/^R[0-4]$/)
        expect(risk.length).toBeGreaterThan(0)
    })
})

describe('TalosToolForgeDetailSheet — rollback', () => {
    it('senza versioni precedenti non offre il ripristino', async () => {
        await mountSheet({ manifest: manifest(), enabled: false, installedAt: new Date().toISOString(), previousVersions: [] })
        expect(document.querySelector('[data-testid="talos-tool-forge-rollback-cta"]')).toBeNull()
        expect(document.querySelector('[data-testid="talos-tool-forge-no-rollback"]')).not.toBeNull()
    })

    it('con una versione precedente, conferma PRIMA di chiamare rollbackForgeTool, poi emette rolled-back con la versione giusta', async () => {
        const wrapper = await mountSheet({
            manifest: manifest({}, 2), enabled: true, installedAt: new Date().toISOString(),
            previousVersions: [manifest({}, 1)],
        })

        button('talos-tool-forge-rollback-cta').click()
        await flushPromises()
        expect(rollbackForgeTool).not.toHaveBeenCalled()
        expect(document.querySelector('[data-testid="talos-tool-forge-rollback-confirm"]')).not.toBeNull()

        button('talos-tool-forge-rollback-confirm').click()
        await flushPromises()

        expect(rollbackForgeTool).toHaveBeenCalledWith('weather-brief')
        expect(wrapper.emitted('rolled-back')).toEqual([[1]])
    })
})

describe('TalosToolForgeDetailSheet — registro', () => {
    it('senza eventi mostra il vuoto, non una lista vuota silenziosa', async () => {
        listForgeAudit.mockResolvedValue([])
        await mountSheet({ manifest: manifest(), enabled: false, installedAt: new Date().toISOString(), previousVersions: [] })
        expect(document.querySelector('[data-testid="talos-tool-forge-no-audit"]')).not.toBeNull()
    })

    it('mostra ogni evento nell\'ordine restituito dal repository (più recente prima)', async () => {
        listForgeAudit.mockResolvedValue([
            { kind: 'enable', detail: {}, at: '2026-08-27T10:00:00.000Z' },
            { kind: 'install', detail: { version: 1 }, at: '2026-08-27T09:00:00.000Z' },
        ])
        await mountSheet({ manifest: manifest(), enabled: true, installedAt: new Date().toISOString(), previousVersions: [] })

        const list = document.querySelector('[data-testid="talos-tool-forge-audit-list"]')
        const rows = [...(list?.querySelectorAll('li') ?? [])]
        expect(rows).toHaveLength(2)
        expect(rows[0]?.textContent).toContain('Enabled')
        expect(rows[1]?.textContent).toContain('Installed')
    })
})

describe('TalosToolForgeDetailSheet — eliminazione', () => {
    it('conferma PRIMA di chiamare removeForgeTool, poi emette deleted', async () => {
        const wrapper = await mountSheet({ manifest: manifest(), enabled: false, installedAt: new Date().toISOString(), previousVersions: [] })

        button('talos-tool-forge-detail-delete').click()
        await flushPromises()
        expect(removeForgeTool).not.toHaveBeenCalled()

        button('talos-tool-forge-detail-delete-confirm').click()
        await flushPromises()

        expect(removeForgeTool).toHaveBeenCalledWith('weather-brief')
        expect(wrapper.emitted('deleted')).toHaveLength(1)
    })
})
