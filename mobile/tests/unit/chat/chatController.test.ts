import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createChatController, type ChatControllerDeps } from '@/stores/chatController'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosMobileManualModel, TalosMobileModelLabPreferences } from '@/lib/modelLabContracts'
import type { TalosVaultService } from '@/services/talosVaultService'

function attachmentRuntime(repository: TalosChatRepository): {
    picker: { pickFiles: ReturnType<typeof vi.fn> }
    vault: TalosVaultService
} {
    const file = {
        id: 'vault-brief',
        display_name: 'brief.txt',
        media_type: 'text/plain',
        size_bytes: 5,
        private_uri: 'talos-vault/files/vault-brief.txt',
        status: 'available' as const,
        trust: 'untrusted' as const,
        sha256: 'a'.repeat(64),
        extracted_text: 'Verified attachment body',
        failure_code: null,
        metadata: {},
        created_at: '2026-07-22T10:00:00.000Z',
        updated_at: '2026-07-22T10:00:00.000Z',
    }
    const grant = {
        id: 'grant-brief',
        vault_file_id: file.id,
        permissions: ['browser.upload', 'model.read'] as Array<'browser.upload' | 'model.read'>,
        status: 'active' as const,
        label: file.display_name,
        created_at: '2026-07-22T10:00:00.000Z',
        updated_at: '2026-07-22T10:00:00.000Z',
        revoked_at: null,
    }
    return {
        picker: {
            pickFiles: vi.fn().mockResolvedValue([{
                name: file.display_name,
                declaredMediaType: file.media_type,
                sizeBytes: file.size_bytes,
                source: { kind: 'web-blob', blob: new Blob(['brief'], { type: 'text/plain' }) },
            }]),
        },
        vault: {
            ingest: vi.fn(async () => {
                const stored = await repository.createVaultFile({
                    id: file.id,
                    display_name: file.display_name,
                    media_type: file.media_type,
                    size_bytes: file.size_bytes,
                    private_uri: file.private_uri,
                    status: file.status,
                    trust: file.trust,
                    sha256: file.sha256,
                    extracted_text: file.extracted_text,
                    failure_code: file.failure_code,
                    metadata: file.metadata,
                    created_at: file.created_at,
                })
                const storedGrant = await repository.createFileAuthorityGrant({
                    id: grant.id,
                    vault_file_id: stored.id,
                    permissions: grant.permissions,
                    label: grant.label,
                    created_at: grant.created_at,
                })
                return { file: stored, grant: storedGrant }
            }),
            createGrant: vi.fn(async (fileId) => repository.createFileAuthorityGrant({
                id: grant.id,
                vault_file_id: fileId,
                permissions: grant.permissions,
                label: grant.label,
                created_at: grant.created_at,
            })),
            revokeGrant: vi.fn().mockResolvedValue(undefined),
            resolveMessageParts: vi.fn().mockResolvedValue([{
                type: 'document_text',
                attachmentId: 'binding-brief',
                name: file.display_name,
                mediaType: file.media_type,
                text: file.extracted_text,
                sha256: file.sha256,
            }]),
            listFiles: vi.fn(() => repository.listVaultFiles()),
            deleteFile: vi.fn((fileId) => repository.deleteVaultFile(fileId)),
            reconcilePending: vi.fn().mockResolvedValue(undefined),
        },
    }
}

function makeDeps() {
    const store = new Map<string, string>()
    const endpoints = new Map<string, string>()
    const request = vi.fn(async ({ url }: { url: string }) => {
        if (url.includes('anthropic.com/v1/models')) {
            return { status: 200, data: { data: [{ id: 'claude-live', display_name: 'Claude Live' }], has_more: false } }
        }
        if (url.includes('anthropic.com/v1/messages')) {
            return { status: 200, data: { model: 'claude-live', content: [{ type: 'text', text: 'pong' }] } }
        }
        if (url.includes('googleapis.com/v1beta/models?')) {
            return { status: 200, data: { models: [{ name: 'models/gemini-live', displayName: 'Gemini Live', supportedGenerationMethods: ['generateContent'] }] } }
        }
        if (url.endsWith('/api/tags')) {
            return { status: 200, data: { models: [{ model: 'gemma3:4b', name: 'Gemma 3' }] } }
        }
        return { status: 500, data: { error: { message: 'unexpected test request' } } }
    })
    const transport: TalosMobileHttpTransport = { request }
    const chatRepository = createMemoryChatRepository()
    const settingsState = reactive({
        composer_defaults: {
            model_profile_id: null as string | null,
            effort: 'high' as const,
            thinking: false,
        },
        model_lab: {
            schema_version: 1,
            manual_models: [],
            model_overrides: {},
            provider_runtime: {},
            probe_results: {},
        } as TalosMobileModelLabPreferences,
    })
    const settings = {
        state: settingsState,
        hydrate: vi.fn().mockResolvedValue(undefined),
        setComposerDefaults: vi.fn(async (patch: Partial<typeof settingsState.composer_defaults>) => {
            Object.assign(settingsState.composer_defaults, patch)
        }),
        setModelLabPreferences: vi.fn(async (value: TalosMobileModelLabPreferences) => {
            settingsState.model_lab = structuredClone(value)
        }),
    }
    const deps: ChatControllerDeps = {
        hasKey: async (provider) => store.has(provider),
        getKey: async (provider) => store.get(provider) ?? null,
        setKey: async (provider, key) => { store.set(provider, key) },
        clearKey: async (provider) => { store.delete(provider) },
        getEndpoint: async (provider) => endpoints.get(provider) ?? null,
        setEndpoint: async (provider, endpoint) => { endpoints.set(provider, endpoint) },
        clearEndpoint: async (provider) => { endpoints.delete(provider) },
        transport,
        chatRepository,
        settings,
    }
    return { store, endpoints, request, chatRepository, settings, deps }
}

describe('chatController', () => {
    it('BR-A8 waits for an in-flight persistence bootstrap before enabling Browse', async () => {
        const { deps, chatRepository } = makeDeps()
        let releaseInitialization!: () => void
        const initialize = vi.spyOn(chatRepository, 'initialize').mockImplementation(() => new Promise<void>((resolve) => {
            releaseInitialization = resolve
        }))
        const controller = createChatController(deps)

        const boot = controller.init()
        await vi.waitFor(() => expect(initialize).toHaveBeenCalledTimes(1))

        let browseOutcome: 'pending' | 'resolved' | 'rejected' = 'pending'
        const browse = controller.setBrowseMode(true).then(
            () => { browseOutcome = 'resolved' },
            () => { browseOutcome = 'rejected' },
        )
        await Promise.resolve()
        await Promise.resolve()

        expect(browseOutcome).toBe('pending')
        expect(controller.browseMode.value).toBe(false)

        releaseInitialization()
        await Promise.all([boot, browse])

        expect(browseOutcome).toBe('resolved')
        expect(controller.browseMode.value).toBe(true)
        expect(controller.chat.activeSession.value?.surface).toBe('browse')
    })

    it('BR-09 keeps Browse in the current chat and prevents claims of unseen page access', async () => {
        const { deps, store, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()

        await controller.setBrowseMode(true)
        expect(controller.browseMode.value).toBe(true)
        expect(controller.chat.activeSession.value?.surface).toBe('browse')

        await controller.send('Open https://example.com and tell me what you see')
        const completion = request.mock.calls
            .map(([call]) => call)
            .find((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(completion?.data.system).toMatch(/manual local browser/i)
        expect(completion?.data.system).toMatch(/no page content/i)
        expect(completion?.data.system).toMatch(/never claim/i)

        await controller.setBrowseMode(false)
        expect(controller.browseMode.value).toBe(false)
        expect(controller.chat.activeSession.value?.surface).toBe('chat')
    })

    it('discovers callable Anthropic profiles and a valid selection once a key exists', async () => {
        const { deps, store } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        expect(controller.secrets.anthropic).toBe(true)
        expect(controller.selectedProfile.value?.provider).toBe('anthropic')
        expect(controller.selectedProfile.value?.model).toBe('claude-live')
        expect(controller.canSend.value).toBe(true)
    })

    it('restores model, effort, and thinking defaults without a reload', async () => {
        const { deps, store, settings } = makeDeps()
        store.set('anthropic', 'sk-ant')
        settings.state.composer_defaults.model_profile_id = 'anthropic:claude-live'
        settings.state.composer_defaults.effort = 'low'
        settings.state.composer_defaults.thinking = true

        const controller = createChatController(deps)
        await controller.init()

        expect(controller.selectedModelId.value).toBe('anthropic:claude-live')
        expect(controller.effort.value).toBe('low')
        expect(controller.thinking.value).toBe(true)
    })

    it('projects persisted display, visibility, and probe state into Model Lab and the composer', async () => {
        const { deps, store, settings } = makeDeps()
        store.set('anthropic', 'sk-ant')
        settings.state.model_lab.model_overrides['anthropic:claude-live'] = {
            display_name: 'Claude Primary',
            show_in_composer: false,
        }
        settings.state.model_lab.probe_results['anthropic:claude-live'] = {
            profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            ok: true,
            checked_at: '2026-07-22T12:00:00.000Z',
            latency_ms: 92,
            message: 'Completion probe passed.',
        }

        const controller = createChatController(deps)
        await controller.init()

        expect(controller.profiles.value).toContainEqual(expect.objectContaining({
            id: 'anthropic:claude-live',
            display_name: 'Claude Primary',
            show_in_composer: false,
            status: 'healthy',
            probe_ok: true,
        }))
        expect(controller.selectedModelId.value).toBeNull()
    })

    it('hides the active model, selects the next visible callable model, and persists without reload', async () => {
        const { deps, store, settings } = makeDeps()
        store.set('anthropic', 'sk-ant')
        store.set('gemini', 'gemini-key')
        const controller = createChatController(deps)
        await controller.init()
        expect(controller.selectedModelId.value).toBe('anthropic:claude-live')

        await controller.setModelDisplayName('anthropic:claude-live', 'Claude Primary')
        await controller.setModelVisibility('anthropic:claude-live', false)

        expect(controller.profiles.value.find((profile) => profile.id === 'anthropic:claude-live')).toMatchObject({
            display_name: 'Claude Primary',
            show_in_composer: false,
        })
        expect(controller.selectedModelId.value).toBe('gemini:gemini-live')
        expect(settings.setModelLabPreferences).toHaveBeenCalledTimes(2)
        expect(settings.state.model_lab.model_overrides['anthropic:claude-live']).toEqual({
            display_name: 'Claude Primary',
            show_in_composer: false,
        })
    })

    it('adds and removes a manual model as a real provider-backed profile', async () => {
        const { deps, store, settings } = makeDeps()
        store.set('openai', 'sk-openai')
        const controller = createChatController(deps)
        await controller.init()
        const manual: TalosMobileManualModel = {
            id: 'manual-openai-local',
            provider: 'openai',
            model: 'local-chat',
            display_name: 'Local Chat',
            input_modalities: ['text'],
            output_modalities: ['text'],
            supported_parameters: ['reasoning_effort'],
        }

        await controller.saveManualModel(manual)
        await controller.selectModel('openai:local-chat')

        expect(controller.selectedProviderModel.value).toMatchObject({
            id: 'local-chat',
            provider: 'openai',
            capabilityProvenance: 'declared',
        })
        expect(controller.canSend.value).toBe(true)
        expect(settings.state.model_lab.manual_models).toEqual([manual])

        await controller.removeManualModel(manual.id)
        expect(controller.profiles.value.some((profile) => profile.id === 'openai:local-chat')).toBe(false)
        expect(controller.selectedModelId.value).toBeNull()
    })

    it('applies the persisted provider timeout to discovery and ordinary chat', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)

        await controller.init()
        await controller.setProviderTimeout('anthropic', 42)
        await controller.refreshProvider('anthropic')
        await controller.send('ping')

        const providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/'))
        expect(providerCalls.slice(-2).every((call) => call.connectTimeout === 42_000 && call.readTimeout === 42_000)).toBe(true)
        expect(settings.state.model_lab.provider_runtime.anthropic).toEqual({ timeout_seconds: 42 })
    })

    it('runs a real exact-sentinel model probe and persists only bounded evidence', async () => {
        const { deps, store, settings, request } = makeDeps()
        const secret = 'sentinel-probe-secret'
        store.set('anthropic', secret)
        request.mockImplementation(async ({ url, data }: { url: string; data?: Record<string, unknown> }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return { status: 200, data: { data: [{ id: 'claude-live', display_name: 'Claude Live' }], has_more: false } }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                return { status: 200, data: { model: 'claude-live', content: [{ type: 'text', text: 'TALOS_PROBE_OK' }] } }
            }
            return { status: 500, data: { error: { message: `unexpected ${JSON.stringify(data)}` } } }
        })
        const controller = createChatController(deps)
        await controller.init()

        const result = await controller.probeModel('anthropic:claude-live')

        expect(result).toMatchObject({
            profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            ok: true,
            message: 'Completion probe passed.',
        })
        expect(result.latency_ms).toBeGreaterThanOrEqual(0)
        expect(controller.profiles.value.find((profile) => profile.id === result.profile_id)).toMatchObject({
            status: 'healthy',
            probe_ok: true,
        })
        expect(settings.state.model_lab.probe_results[result.profile_id]).toEqual(result)
        const persisted = JSON.stringify(settings.state.model_lab)
        expect(persisted).not.toContain(secret)
        expect(persisted).not.toContain('TALOS_PROBE_OK')
        const completion = request.mock.calls.map(([call]) => call).find((call) => call.url.includes('/v1/messages'))
        expect(completion?.data.messages).toEqual([{ role: 'user', content: 'Reply exactly TALOS_PROBE_OK' }])
    })

    it('fails an inexact model probe without persisting model output', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return { status: 200, data: { data: [{ id: 'claude-live', display_name: 'Claude Live' }], has_more: false } }
            }
            return { status: 200, data: { model: 'claude-live', content: [{ type: 'text', text: 'TALOS_PROBE_OK and more' }] } }
        })
        const controller = createChatController(deps)
        await controller.init()

        const result = await controller.probeModel('anthropic:claude-live')

        expect(result.ok).toBe(false)
        expect(result.message).toMatch(/required probe result/i)
        expect(JSON.stringify(settings.state.model_lab)).not.toContain('and more')
    })

    it('drops probe evidence when the target manual model disappears in flight', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('openai', 'sk-openai')
        const controller = createChatController(deps)
        await controller.init()
        const manual: TalosMobileManualModel = {
            id: 'manual-race',
            provider: 'openai',
            model: 'race-model',
            display_name: 'Race model',
            input_modalities: ['text'],
            output_modalities: ['text'],
            supported_parameters: [],
        }
        await controller.saveManualModel(manual)
        let release!: (value: { status: number; data: unknown }) => void
        request.mockImplementation(({ url }: { url: string }) => {
            if (url.endsWith('/chat/completions')) {
                return new Promise((resolve) => { release = resolve })
            }
            return Promise.resolve({ status: 500, data: { error: { message: 'unexpected request' } } })
        })

        const pending = controller.probeModel('openai:race-model')
        await vi.waitFor(() => expect(release).toBeTypeOf('function'))
        await controller.removeManualModel(manual.id)
        release({
            status: 200,
            data: { model: 'race-model', choices: [{ message: { content: 'TALOS_PROBE_OK' } }] },
        })

        await expect(pending).rejects.toThrow(/model changed/i)
        expect(settings.state.model_lab.probe_results['openai:race-model']).toBeUndefined()
    })

    it('persists a model change immediately into the active session and global default', async () => {
        const { deps, store, settings, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        store.set('gemini', 'gemini-key')
        const controller = createChatController(deps)
        await controller.init()
        await controller.newSession()

        await controller.selectModel('gemini:gemini-live')

        expect(controller.selectedModelId.value).toBe('gemini:gemini-live')
        expect(controller.chat.activeSession.value?.active_model_profile_id).toBe('gemini:gemini-live')
        expect((await chatRepository.listSessions())[0]?.active_model_profile_id).toBe('gemini:gemini-live')
        expect(settings.setComposerDefaults).toHaveBeenCalledWith({
            model_profile_id: 'gemini:gemini-live',
            effort: 'off',
            thinking: false,
        })
    })

    it('initializes exactly once across Chat and Model Lab mounts', async () => {
        const { deps, store, request, settings } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)

        await Promise.all([controller.init(), controller.init()])
        await controller.init()

        const discoveryCalls = request.mock.calls.filter(([call]) => call.url.includes('anthropic.com/v1/models'))
        expect(discoveryCalls).toHaveLength(1)
        expect(settings.hydrate).toHaveBeenCalledTimes(1)
    })

    it('gates sending with a Settings hint when no provider key is present', async () => {
        const { deps } = makeDeps()
        const controller = createChatController(deps)
        await controller.init()
        expect(controller.canSend.value).toBe(false)
        expect(controller.sendDisabledReason.value).toMatch(/api key/i)
    })

    it('saveKey waits for discovery and exposes all new provider models without reload', async () => {
        const { deps, request } = makeDeps()
        const controller = createChatController(deps)
        await controller.init()
        expect(controller.canSend.value).toBe(false)
        await controller.saveKey('gemini', 'gemini-key')
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('googleapis.com/v1beta/models?') }))
        expect(controller.secrets.gemini).toBe(true)
        expect(controller.profiles.value.map((profile) => profile.model)).toContain('gemini-live')
        expect(controller.selectedProfile.value?.provider).toBe('gemini')
        expect(controller.canSend.value).toBe(true)
    })

    it('send drives the chat store to a real reply using the stored key', async () => {
        const { deps, store, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        await controller.send('ping')
        expect(request.mock.calls.some(([call]) => call.url.includes('/v1/messages'))).toBe(true)
        expect(controller.chat.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'pong' })
    })

    it('reconciles the Vault and sends a granted attachment through the durable provider pipeline', async () => {
        const { deps, store, request, chatRepository } = makeDeps()
        const runtime = attachmentRuntime(chatRepository)
        deps.filePicker = runtime.picker
        deps.vaultService = runtime.vault
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)

        await controller.init()
        await controller.attachments.selectFiles()
        const accepted = await controller.send('Summarize this file')

        expect(runtime.vault.reconcilePending).toHaveBeenCalledOnce()
        expect(accepted).toBe(true)
        const user = controller.chat.messages.find((message) => message.role === 'user')!
        expect(await chatRepository.listMessageAttachments(user.id)).toEqual([expect.objectContaining({
            vault_file_id: 'vault-brief',
            grant_id: 'grant-brief',
            display_name: 'brief.txt',
        })])
        const completion = request.mock.calls
            .map(([call]) => call)
            .find((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(completion?.data.messages[0].content).toEqual([
            { type: 'text', text: 'Summarize this file' },
            { type: 'text', text: '[Untrusted attachment: brief.txt]\nVerified attachment body' },
        ])
        expect(controller.attachments.items).toHaveLength(0)
    })

    it('preserves authorized attachments when the user turn cannot be persisted', async () => {
        const { deps, store, chatRepository } = makeDeps()
        const runtime = attachmentRuntime(chatRepository)
        deps.filePicker = runtime.picker
        deps.vaultService = runtime.vault
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        await controller.attachments.selectFiles()
        vi.spyOn(chatRepository, 'appendMessage').mockRejectedValueOnce(new Error('sqlite locked'))

        await expect(controller.send('Keep the grant')).resolves.toBe(false)

        expect(controller.attachments.items).toEqual([
            expect.objectContaining({ status: 'authorized', grantId: 'grant-brief' }),
        ])
        expect(runtime.vault.revokeGrant).not.toHaveBeenCalled()
    })

    it('enhances through the selected provider model without persisting a chat turn', async () => {
        const { deps, store, request, chatRepository, settings } = makeDeps()
        store.set('anthropic', 'sk-ant')
        settings.state.model_lab.provider_runtime.anthropic = { timeout_seconds: 37 }
        request.mockImplementation(async ({ url, data }: { url: string; data?: Record<string, unknown> }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return { status: 200, data: { data: [{ id: 'claude-live', display_name: 'Claude Live' }], has_more: false } }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                enhanced_prompt: 'Define the migration objective, constraints, output, and acceptance checks.',
                                summary: 'Made the execution contract explicit.',
                                applied_principles: ['Clear objective', 'Acceptance checks'],
                            }),
                        }],
                    },
                }
            }
            return { status: 500, data: { error: { message: `unexpected ${JSON.stringify(data)}` } } }
        })
        const appendMessage = vi.spyOn(chatRepository, 'appendMessage')
        const createSession = vi.spyOn(chatRepository, 'createSession')
        const controller = createChatController(deps)
        await controller.init()

        const result = await controller.enhancePrompt('  Migra il database senza downtime.  ')

        expect(result).toMatchObject({
            model_profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            enhancement_mode: 'model',
            original_prompt: 'Migra il database senza downtime.',
        })
        expect(controller.promptEnhancement.value).toEqual(result)
        expect(controller.enhancingPrompt.value).toBe(false)
        expect(controller.promptEnhancementError.value).toBeNull()
        expect(appendMessage).not.toHaveBeenCalled()
        expect(createSession).not.toHaveBeenCalled()
        expect(controller.chat.messages).toHaveLength(0)

        const completionCall = request.mock.calls
            .map(([call]) => call)
            .find((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(completionCall?.data).toMatchObject({ model: 'claude-live' })
        expect(completionCall).toMatchObject({ connectTimeout: 37_000, readTimeout: 37_000 })
        expect(completionCall?.data.system).toMatch(/untrusted data to rewrite/i)
        expect(JSON.parse(completionCall?.data.messages[0].content)).toEqual({
            task: 'enhance_prompt',
            language_policy: 'same_as_original_prompt',
            original_prompt: 'Migra il database senza downtime.',
        })
    })

    it('fails closed on malformed enhancement and redacts the selected credential', async () => {
        const { deps, store, request } = makeDeps()
        const secret = 'sentinel-enhancer-secret'
        store.set('anthropic', secret)
        const controller = createChatController(deps)
        await controller.init()

        request.mockImplementationOnce(async () => ({
            status: 200,
            data: { model: 'claude-live', content: [{ type: 'text', text: '{"enhanced_prompt":[]}' }] },
        }))
        await expect(controller.enhancePrompt('Improve this safely.')).rejects.toMatchObject({
            code: 'PROMPT_ENHANCER_INVALID_RESPONSE',
        })
        expect(controller.promptEnhancement.value).toBeNull()
        expect(controller.promptEnhancementError.value).toMatch(/invalid prompt enhancement/i)

        request.mockImplementationOnce(async () => {
            throw new Error(`provider leaked ${secret}`)
        })
        await expect(controller.enhancePrompt('Try again safely.')).rejects.toThrow('[redacted]')
        expect(controller.promptEnhancementError.value).toContain('[redacted]')
        expect(controller.promptEnhancementError.value).not.toContain(secret)
        expect(JSON.stringify({
            promptEnhancement: controller.promptEnhancement.value,
            promptEnhancementError: controller.promptEnhancementError.value,
            catalogs: controller.catalogs,
        })).not.toContain(secret)
    })

    it('drops a superseded enhancement response after clear or a newer request', async () => {
        const { deps, store, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()

        type CompletionResponse = { status: number; data: Record<string, unknown> }
        const pending: Array<(value: CompletionResponse) => void> = []
        request.mockImplementation(({ url }: { url: string }) => {
            if (!url.includes('anthropic.com/v1/messages')) {
                return Promise.resolve({ status: 500, data: { error: { message: 'unexpected request' } } })
            }
            return new Promise<CompletionResponse>((resolve) => pending.push(resolve))
        })
        const completion = (enhancedPrompt: string): CompletionResponse => ({
            status: 200,
            data: {
                model: 'claude-live',
                content: [{
                    type: 'text',
                    text: JSON.stringify({ enhanced_prompt: enhancedPrompt, summary: '', applied_principles: [] }),
                }],
            },
        })

        const cleared = controller.enhancePrompt('first')
        await vi.waitFor(() => expect(pending).toHaveLength(1))
        controller.clearPromptEnhancement()
        pending.shift()!(completion('stale after clear'))
        await expect(cleared).resolves.toBeNull()
        expect(controller.promptEnhancement.value).toBeNull()
        expect(controller.enhancingPrompt.value).toBe(false)

        const older = controller.enhancePrompt('older')
        await vi.waitFor(() => expect(pending).toHaveLength(1))
        const newer = controller.enhancePrompt('newer')
        await vi.waitFor(() => expect(pending).toHaveLength(2))
        pending.shift()!(completion('superseded result'))
        pending.shift()!(completion('current result'))

        await expect(older).resolves.toBeNull()
        await expect(newer).resolves.toMatchObject({ enhanced_prompt: 'current result', original_prompt: 'newer' })
        expect(controller.promptEnhancement.value?.enhanced_prompt).toBe('current result')
    })

    it('resends and retries messages as append-only contextual turns with provenance', async () => {
        const { deps, store, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        await controller.send('original prompt')
        const originalUser = controller.chat.messages.find((message) => message.role === 'user')!
        const originalAssistant = controller.chat.messages.find((message) => message.role === 'assistant')!

        await controller.resendMessage(originalUser.id)
        expect(controller.chat.messages.at(-2)).toMatchObject({
            role: 'user',
            content: 'original prompt',
            metadata: { command_id: 'resend_message', resend_of_message_id: originalUser.id },
        })

        await controller.retryAssistantMessage(originalAssistant.id)
        expect(controller.chat.messages.at(-2)).toMatchObject({
            role: 'user',
            content: 'original prompt',
            metadata: {
                command_id: 'retry_assistant_response',
                retry_of_message_id: originalAssistant.id,
                resend_of_message_id: originalUser.id,
            },
        })
        const chatRequests = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('/v1/messages'))
        expect(chatRequests).toHaveLength(3)
        expect(chatRequests.at(-1)?.data.messages.at(-1)).toEqual({ role: 'user', content: 'original prompt' })
    })

    it('fails retry without a preceding user prompt and never calls the provider', async () => {
        const { deps, store, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        await controller.newSession()
        const sessionId = controller.chat.activeSession.value!.id
        await chatRepository.appendMessage({
            id: 'assistant-orphan',
            session_id: sessionId,
            role: 'assistant',
            content: 'orphan answer',
            state: 'persisted',
            created_at: '2026-07-22T12:00:00.000Z',
        })
        await controller.selectSession(sessionId)
        const before = request.mock.calls.filter(([call]) => call.url.includes('/v1/messages')).length

        await expect(controller.retryAssistantMessage('assistant-orphan'))
            .rejects.toThrow('TALOS could not find the prompt that produced this answer.')
        const after = request.mock.calls.filter(([call]) => call.url.includes('/v1/messages')).length
        expect(after).toBe(before)
    })

    it('creates, selects, renames, and deletes sessions through the controller', async () => {
        const { deps, store } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()

        await controller.newSession()
        const first = controller.chat.activeSession.value
        expect(first).not.toBeNull()
        await controller.renameSession(first!.id, 'Release review')
        expect(controller.chat.activeSession.value?.title).toBe('Release review')

        await controller.newSession()
        const second = controller.chat.activeSession.value
        expect(second?.id).not.toBe(first?.id)
        await controller.selectSession(first!.id)
        expect(controller.chat.activeSession.value?.id).toBe(first!.id)
        await controller.deleteSession(first!.id)
        expect(controller.chat.activeSession.value?.id).toBe(second?.id)
    })

    it('fails closed when local persistence cannot initialize and never calls the provider', async () => {
        const { deps, store, chatRepository, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        vi.spyOn(chatRepository, 'initialize').mockRejectedValue(new Error('sqlite locked'))
        const controller = createChatController(deps)

        await controller.init()
        expect(controller.chat.state.persistenceStatus).toBe('error')
        expect(controller.canSend.value).toBe(false)
        expect(controller.sendDisabledReason.value).toContain('sqlite locked')

        await controller.send('must remain local')
        expect(request.mock.calls.some(([call]) => call.url.includes('/v1/messages'))).toBe(false)
        expect(controller.chat.messages).toHaveLength(0)
    })

    it('persists an explicit Ollama endpoint and discovers local models', async () => {
        const { deps, endpoints } = makeDeps()
        const controller = createChatController(deps)
        await controller.init()
        await controller.saveEndpoint('ollama', 'http://10.0.0.4:11434')
        expect(endpoints.get('ollama')).toBe('http://10.0.0.4:11434')
        expect(controller.profiles.value).toEqual(expect.arrayContaining([
            expect.objectContaining({ provider: 'ollama', model: 'gemma3:4b' }),
        ]))
    })

    it('removes an Ollama endpoint and immediately revokes local callability', async () => {
        const { deps, endpoints } = makeDeps()
        const controller = createChatController(deps)
        await controller.init()
        await controller.saveEndpoint('ollama', 'http://10.0.0.4:11434')
        expect(controller.canSend.value).toBe(true)
        await controller.removeEndpoint('ollama')
        expect(endpoints.has('ollama')).toBe(false)
        expect(controller.canSend.value).toBe(false)
    })

    it('probes a configured provider through real discovery and returns a safe summary', async () => {
        const { deps, store } = makeDeps()
        store.set('anthropic', 'sentinel-secret')
        const controller = createChatController(deps)
        const result = await controller.probeProvider('anthropic')
        expect(result).toEqual({
            ok: true,
            provider: 'anthropic',
            modelId: 'claude-live',
            message: '1 model available.',
        })
        expect(JSON.stringify(result)).not.toContain('sentinel-secret')
    })

    it('removing a key immediately revokes provider callability', async () => {
        const { deps, store } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        expect(controller.canSend.value).toBe(true)
        await controller.removeKey('anthropic')
        expect(controller.secrets.anthropic).toBe(false)
        expect(controller.canSend.value).toBe(false)
    })

    it('never exposes key bytes in reactive catalog state or errors', async () => {
        const { deps } = makeDeps()
        const controller = createChatController(deps)
        await controller.init()
        await controller.saveKey('gemini', 'sentinel-secret')
        expect(JSON.stringify({ catalogs: controller.catalogs, profiles: controller.profiles.value })).not.toContain('sentinel-secret')
    })
})
