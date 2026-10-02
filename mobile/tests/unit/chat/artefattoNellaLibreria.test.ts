// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createChatController, type ChatControllerDeps } from '@/stores/chatController'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { parseTalosFileProvenance } from '@/lib/files/provenance'
import { createTalosVaultService, talosSha256Hex } from '@/services/talosVaultService'
import { talosTestT } from '../../helpers/talosTestI18n'
import { TALOS_EMPTY_TOOL_AUTHORIZATIONS } from '@/lib/tools/toolAuthorizations'

/*
 * ⛔ OSS-70B-1 e OSS-70B-3 (30/09/2026 notte, visti sul Pad). Owner: «Codice · titolo della sessione» — una pagina salvata
 * dal Codice non si lega alla chat aperta nell'app; «Riconoscere la stessa pagina» — la stessa pagina salvata due volte
 * è un file solo (impronta sha256 come chiave di idempotenza). Controller e repository veri, in memoria; finto solo il
 * plugin nativo che rilegge l'HTML. Ledger `.claude/ragionamento/LEDGER-OSS70B-ORIGINE-E-DOPPIONI-2026-09-30.md`.
 */
const artefatti = vi.hoisted(() => ({ html: new Map<string, string>() }))
vi.mock('@/lib/device/artifactPlugin', () => ({
    TalosArtifactBridge: { read: async ({ id }: { id: string }) => ({ html: artefatti.html.get(id) ?? '' }) },
}))

const controllers: ReturnType<typeof createChatController>[] = []
afterEach(() => {
    for (const controller of controllers.splice(0)) controller.dispose()
    artefatti.html.clear()
})

function setup() {
    const state = reactive({
        composer_defaults: { model_profile_id: null, effort: 'off', thinking: false },
        model_lab: { schema_version: 1, manual_models: [], model_overrides: {}, provider_runtime: {}, probe_results: {} },
        tone: { preset: 'balanced' },
        shell: { library_context_enabled: false, library_autosave_generated: false },
        search: { source: null, endpoint: null },
        tools: { read: 'allow', write: 'ask', outbound: 'deny' },
        agent_tools: {},
        tool_authorizations: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
        local_engine_probe: { consent: 'declined' },
    })
    const repository = createMemoryChatRepository()
    // Il vault vero sul repository in memoria: finti solo il disco (tiene i byte veri) e l'analisi (impronta vera).
    const vaultService = createTalosVaultService({
        repository,
        fileStore: {
            copyToPrivate: async (scelto: { source: { blob: Blob } }, fileId: string) => ({
                privateUri: `talos-vault/files/${fileId}`,
                bytes: new Uint8Array(await scelto.source.blob.arrayBuffer()),
            }),
            deletePrivate: async () => {},
            readPrivate: async () => new Uint8Array(),
        } as never,
        analysisClient: {
            analyze: async ({ bytes }: { bytes: Uint8Array }) => ({ sha256: await talosSha256Hex(bytes), extractedText: null, extension: 'html', pageCount: null }),
        } as never,
    })
    const deps = {
        vaultService,
        translate: talosTestT('it'), chatRepository: repository,
        transport: { request: vi.fn(async () => { throw new Error('Rete vietata in questa prova') }) },
        hasKey: async () => false, getKey: async () => null, getEndpoint: async () => null,
        settings: {
            state, hydrate: async () => {},
            setComposerDefaults: vi.fn(async () => {}), setShell: vi.fn(async () => {}),
            effectiveToolPermissions: () => state.tools,
        },
    } as unknown as ChatControllerDeps
    const controller = createChatController(deps)
    controllers.push(controller)
    return { controller, repository }
}

const PAGINA = '<!doctype html><html><body><p>vendite</p></body></html>'

describe('OSS70B-SAVE — salvare un artefatto nella Libreria', () => {
    it('OSS70B-SAVE-01 la stessa pagina salvata due volte è un file solo', async () => {
        const { controller, repository } = setup()
        await controller.init()
        artefatti.html.set('nativo-1', PAGINA)
        artefatti.html.set('nativo-2', PAGINA)
        const primo = await controller.saveArtifactToLibrary('nativo-1', 'Vendite')
        const secondo = await controller.saveArtifactToLibrary('nativo-2', 'Vendite')
        expect(primo.ok && secondo.ok).toBe(true)
        expect(secondo).toEqual(primo)
        expect((await repository.listVaultFiles()).filter((file) => file.status === 'available')).toHaveLength(1)
    })

    it('OSS70B-SAVE-02 dal Codice: nessuna chat, e la provenienza dice Codice, sessione e modello', async () => {
        const { controller, repository } = setup()
        await controller.init()
        artefatti.html.set('nativo-1', PAGINA)
        const esito = await controller.saveArtifactToLibrary('nativo-1', 'Vendite', {
            codice: { sessionId: 'cod-1', title: 'mi disegni un grafico' }, model: 'z-ai/glm-5.3-flash',
        })
        expect(esito.ok).toBe(true)
        const file = (await repository.listVaultFiles())[0]!
        const metadata = file.metadata as Record<string, unknown>
        expect(metadata.origin_session_id).toBeNull()
        expect(parseTalosFileProvenance(metadata.provenance)).toMatchObject({
            model: 'z-ai/glm-5.3-flash', originSessionId: null, toolName: 'artifact_create',
            codice: { sessionId: 'cod-1', title: 'mi disegni un grafico' },
        })
    })

    it('OSS70B-SAVE-03 (caratterizzante) dalla chat resta legato alla chat aperta, come prima', async () => {
        const { controller, repository } = setup()
        await controller.init()
        await controller.newSession()
        const chatAperta = controller.chat.activeSession.value!.id
        artefatti.html.set('nativo-1', PAGINA)
        await controller.saveArtifactToLibrary('nativo-1', 'Vendite')
        const metadata = (await repository.listVaultFiles())[0]!.metadata as Record<string, unknown>
        expect(metadata.origin_session_id).toBe(chatAperta)
        expect(parseTalosFileProvenance(metadata.provenance)?.codice).toBeUndefined()
    })

    it('OSS70B-SAVE-04 libraryFileWithSameContent trova la pagina dopo il salvataggio, e non prima', async () => {
        const { controller } = setup()
        await controller.init()
        artefatti.html.set('nativo-1', PAGINA)
        expect(await controller.libraryFileWithSameContent(PAGINA)).toBeNull()
        const esito = await controller.saveArtifactToLibrary('nativo-1', 'Vendite')
        expect(await controller.libraryFileWithSameContent(PAGINA)).toBe(esito.ok ? esito.fileId : 'no')
        expect(await controller.libraryFileWithSameContent('<p>un’altra pagina</p>')).toBeNull()
    })
})
