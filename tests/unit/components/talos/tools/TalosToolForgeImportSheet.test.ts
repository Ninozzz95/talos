// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

/**
 * ⛔ Owner 2026-08-27 — Tool Forge Fase 6. `validateTalosLocalTool` gira
 * VERO qui (è la stessa unica fonte di verità che `installForgeTool`
 * consulta) — solo `installForgeTool` è mockato, perché la persistenza è
 * già provata contro sql.js altrove.
 *
 * Il foglio è un `<Teleport to="body">` (`TalosMobileComposerSheet`), quindi
 * il suo contenuto NON è un discendente dell'elemento montato — si legge
 * dal `document` vero, stessa convenzione di `talosRowActions.test.ts`.
 */

const installForgeTool = vi.fn<(manifest: TalosLocalToolManifestV1) => Promise<void>>(async () => undefined)
vi.mock('@/lib/tools/dynamic/forgeRegistryRepository', () => ({
    installForgeTool: (manifest: TalosLocalToolManifestV1) => installForgeTool(manifest),
}))

/**
 * ⛔ Owner 2026-08-27 — «bisogna importare talostool anche da file, non
 * solo da campo text». Stesso selettore nativo di `talosPickBackupFile`
 * (`backupFile.ts`): qui si prova il ramo `web-blob`, quello che il test
 * può davvero esercitare senza un dispositivo.
 */
const pickFiles = vi.fn<() => Promise<Array<{ source: { kind: 'web-blob'; blob: Blob } }>>>()
vi.mock('@/services/nativeFilePicker', () => ({
    createNativeFilePicker: () => ({ pickFiles: () => pickFiles() }),
}))

const VALID_MANIFEST: TalosLocalToolManifestV1 = {
    schema: 'talos.local-tool.v1', id: 'weather-brief', version: 1, title: 'Weather brief',
    description: 'test manifest', createdAt: new Date().toISOString(), parentVersion: null,
    execution: 'declarative-flow', installScope: 'device',
    network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
    flow: { entry: 'ret', maxTransitions: 8, nodes: [{ id: 'ret', type: 'return', value: 1 }] },
}

function textarea(): HTMLTextAreaElement {
    return document.querySelector('[data-testid="talos-tool-forge-import-text"]')!
}
function button(testId: string): HTMLButtonElement {
    return document.querySelector(`[data-testid="${testId}"]`)!
}

async function paste(value: string): Promise<void> {
    const field = textarea()
    field.value = value
    field.dispatchEvent(new Event('input'))
    await flushPromises()
}

beforeEach(() => {
    document.body.innerHTML = ''
    installForgeTool.mockClear()
    pickFiles.mockReset()
})

async function mountSheet() {
    const Sheet = (await import('@/components/talos/tools/TalosToolForgeImportSheet.vue')).default
    return mount(Sheet, { attachTo: document.body })
}

describe('TalosToolForgeImportSheet — JSON non valido', () => {
    it('un testo che non fa JSON.parse mostra l\'errore, e non offre mai "Installa"', async () => {
        await mountSheet()
        await paste('{ questo non è json')
        button('talos-tool-forge-import-validate').click()
        await flushPromises()

        expect(document.querySelector('[data-testid="talos-tool-forge-import-error"]')).not.toBeNull()
        expect(button('talos-tool-forge-import-install').disabled).toBe(true)
    })
})

describe('TalosToolForgeImportSheet — manifest strutturalmente non valido', () => {
    it('mostra i diagnostici VERI del validator (codice + messaggio), non un errore generico', async () => {
        await mountSheet()
        const broken = { ...VALID_MANIFEST, network: { mode: 'forbidden', domains: ['evil.example'] } }
        await paste(JSON.stringify(broken))
        button('talos-tool-forge-import-validate').click()
        await flushPromises()

        const diagnostics = document.querySelector('[data-testid="talos-tool-forge-import-diagnostics"]')
        expect(diagnostics?.textContent).toContain('FORGE_NETWORK_CONTRADICTION')
        expect(button('talos-tool-forge-import-install').disabled).toBe(true)
    })

    it('accetta anche l\'artefatto intero {manifest: ...}, non solo il manifest nudo', async () => {
        await mountSheet()
        const artifact = { artifact: 'talos.tool-artifact.v1', manifest: VALID_MANIFEST }
        await paste(JSON.stringify(artifact))
        button('talos-tool-forge-import-validate').click()
        await flushPromises()

        expect(document.querySelector('[data-testid="talos-tool-forge-import-diagnostics"]')).toBeNull()
        expect(button('talos-tool-forge-import-install').disabled).toBe(false)
    })
})

describe('TalosToolForgeImportSheet — manifest valido', () => {
    it('Installa chiama installForgeTool ed emette imported col titolo', async () => {
        const wrapper = await mountSheet()
        await paste(JSON.stringify(VALID_MANIFEST))
        button('talos-tool-forge-import-validate').click()
        await flushPromises()
        button('talos-tool-forge-import-install').click()
        await flushPromises()

        expect(installForgeTool).toHaveBeenCalledWith(expect.objectContaining({ id: 'weather-brief' }))
        expect(wrapper.emitted('imported')).toEqual([['Weather brief']])
    })

    it('ritoccare il testo dopo una validazione azzera il verdetto precedente', async () => {
        await mountSheet()
        await paste(JSON.stringify(VALID_MANIFEST))
        button('talos-tool-forge-import-validate').click()
        await flushPromises()
        expect(button('talos-tool-forge-import-install').disabled).toBe(false)

        await paste(`${JSON.stringify(VALID_MANIFEST)} `)
        expect(button('talos-tool-forge-import-install').disabled).toBe(true)
    })
})

describe('TalosToolForgeImportSheet — import da file, non solo da campo text', () => {
    it('un file scelto riempie il campo e valida da sola, mostrando il verdetto', async () => {
        pickFiles.mockResolvedValue([{ source: { kind: 'web-blob', blob: new Blob([JSON.stringify(VALID_MANIFEST)]) } }])
        await mountSheet()

        button('talos-tool-forge-import-from-file').click()
        await vi.dynamicImportSettled()
        await flushPromises()

        expect(textarea().value).toBe(JSON.stringify(VALID_MANIFEST))
        expect(button('talos-tool-forge-import-install').disabled).toBe(false)
    })

    it('annullare il selettore non tocca il campo né mostra un errore', async () => {
        pickFiles.mockResolvedValue([])
        await mountSheet()
        await paste('testo già presente')

        button('talos-tool-forge-import-from-file').click()
        await vi.dynamicImportSettled()
        await flushPromises()

        expect(textarea().value).toBe('testo già presente')
        expect(document.querySelector('[data-testid="talos-tool-forge-import-error"]')).toBeNull()
    })
})
