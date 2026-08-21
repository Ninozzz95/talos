// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createChatController, type ChatControllerDeps } from '@/stores/chatController'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import type { TalosChatRepository, TalosLocalVaultFile } from '@/repositories/chatRepository'
import type { TalosMobileManualModel, TalosMobileModelLabPreferences } from '@/lib/modelLabContracts'
import type { TalosVaultService } from '@/services/talosVaultService'
import { talosTestT } from '../../helpers/talosTestI18n'
import {
    TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    applyTalosToolAuthorizationGrant,
    digestTalosToolAuthorizationInput,
    revokeTalosToolAuthorizationGrant,
} from '@/lib/tools/toolAuthorizations'
import {
    applyTalosLibraryContextPolicyPatch,
} from '@/lib/chat/libraryPolicy'
import { parseTalosToolAuthorizationCheckpoint } from '@/lib/tools/toolAuthorizationCheckpoint'
import {
    TALOS_DEFAULT_TOOL_PERMISSIONS,
    talosEffectiveToolPermissions,
} from '@/lib/tools/permissionTypes'

const webSearchRuntime = vi.hoisted(() => ({
    runTalosSearch: vi.fn(),
    readTalosPage: vi.fn(),
}))
vi.mock('@/services/webSearchRuntime', () => webSearchRuntime)

const deviceFileSave = vi.hoisted(() => ({
    saveTalosVaultFileToDevice: vi.fn(),
}))
vi.mock('@/services/saveVaultFileToDevice', () => deviceFileSave)

/**
 * The bridge to the native engine, standing in for a device.
 *
 * Only `talosLocalInstalledModels` matters below: it is the far end of the
 * chain the local provider is discovered through, and asserting on IT rather
 * than on "was the adapter called" is the difference between a test that
 * notices the discovery is dead and one that does not.
 */
const localEngine = vi.hoisted(() => ({
    talosLocalEngineStatus: vi.fn(async () => ({ available: true, loadedPath: null })),
    // Empty by default, because that is what a phone that has downloaded
    // nothing reports, and because a model here would silently change every
    // other test in this file: with one local model on disk and no keys saved,
    // the app can send — correct behaviour, and not what those tests are about.
    talosLocalInstalledModels: vi.fn(async (): Promise<{
        models: Array<{ path: string, name: string, bytes: number }>
        unreadable: Array<{ path: string, reason: string }>
    }> => ({ models: [], unreadable: [] })),
    talosLocalEngineOpen: vi.fn(async () => undefined),
    talosLocalEngineChatPrompt: vi.fn(async () => 'prompt'),
    talosLocalEngineGenerate: vi.fn(async () => ({ text: 'ciao', tokens: 2 })),
    talosLocalEngineCancel: vi.fn(async () => undefined),
    talosLocalEngineClose: vi.fn(async () => undefined),
    talosQualifyLocalBackend: vi.fn(async () => ({
        ran: true, reason: null, probedCpu: true, cpuInconclusive: false,
        probedGpu: false, gpuInconclusive: false, decisionBackend: 'cpu', decisionReason: 'unproven',
    })),
}))
vi.mock('@/services/localEngine', () => localEngine)

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>((settle) => { resolve = settle })
    return { promise, resolve }
}

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
        tone: { preset: 'balanced' as const },
        shell: {
            library_context_enabled: false,
            library_access: 'deny' as const,
            library_context_policy: null as import('@/lib/chat/libraryPolicy').TalosLibraryContextPolicyV1 | null,
            library_autosave_generated: false,
            debug_diagnostics: false,
        },
        search: {
            source: null as 'tavily' | 'brave' | 'searxng' | 'custom' | null,
            endpoint: null as string | null,
        },
        tools: {
            read: 'allow' as const,
            write: 'ask' as const,
            outbound: 'deny' as const,
        },
        /**
         * These three are STATED, not inherited — which is what the fixture
         * always meant and never said.
         *
         * Without this the rule that keeps defaults current would read them as
         * leftovers of an older default and replace them with today's, and the
         * whole file would be testing a permission mix it did not choose. That
         * is not a workaround: it is the same distinction the rule exists to
         * make, and a fixture is as entitled to make a deliberate choice as a
         * user is.
         */
        tools_chosen: ['read', 'write', 'outbound'] as const,
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
        tool_authorizations: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
        local_engine_probe: { consent: 'unset' as 'unset' | 'granted' | 'declined' },
    })
    const settings = {
        state: settingsState,
        hydrate: vi.fn().mockResolvedValue(undefined),
        setComposerDefaults: vi.fn(async (patch: Partial<typeof settingsState.composer_defaults>) => {
            Object.assign(settingsState.composer_defaults, patch)
        }),
        /*
         * ⛔ Mancava, e la sua assenza NASCONDEVA un difetto: `applyModelSelection`
         * chiama `deps.settings.setShell?.(…)` in modo opzionale, quindi senza
         * questa riga la scrittura di `composer_model` non avveniva **e nessun
         * test poteva accorgersene**. È lo stesso motivo per cui il ripiego
         * poté diventare preferenza sul Pad dell'owner senza che la suite
         * dicesse niente. Fonde la patch, come fa quello vero.
         */
        setShell: vi.fn(async (patch: Partial<typeof settingsState.shell>) => {
            Object.assign(settingsState.shell, patch)
        }),
        setLocalEngineProbeConsent: vi.fn(async (patch: { consent: 'unset' | 'granted' | 'declined' }) => {
            settingsState.local_engine_probe = { ...patch }
        }),
        setModelLabPreferences: vi.fn(async (value: TalosMobileModelLabPreferences) => {
            settingsState.model_lab = structuredClone(value)
        }),
        setTone: vi.fn(async (preset: 'balanced' | 'engineering' | 'friendly' | 'concise') => {
            settingsState.tone = { preset } as never
        }),
        setLibraryContextPolicy: vi.fn(async (
            patch: import('@/lib/chat/libraryPolicy').TalosLibraryContextPolicyPatch,
            expectedRevision: number,
        ) => {
            const current = settingsState.shell.library_context_policy ?? {
                schema_version: 1 as const,
                revision: 0,
                enabled: settingsState.shell.library_context_enabled,
                mode: 'broad_compat_v1' as const,
                included_file_ids: [],
                excluded_file_ids: [],
                updated_at: null,
            }
            const updated = applyTalosLibraryContextPolicyPatch(
                current,
                patch,
                expectedRevision,
                '2026-07-29T17:00:00.000Z',
            )
            settingsState.shell = {
                ...settingsState.shell,
                library_context_enabled: updated.enabled,
                library_context_policy: updated,
            }
            return updated
        }),
        grantToolAuthorization: vi.fn(async (
            tool: Parameters<typeof applyTalosToolAuthorizationGrant>[1],
            actions: Parameters<typeof applyTalosToolAuthorizationGrant>[2],
        ) => {
            settingsState.tool_authorizations = applyTalosToolAuthorizationGrant(
                settingsState.tool_authorizations,
                tool,
                actions,
                settingsState.tool_authorizations.revision,
                '2026-07-29T12:00:00.000Z',
            )
        }),
        revokeToolAuthorization: vi.fn(async (
            tool: Parameters<typeof revokeTalosToolAuthorizationGrant>[1],
        ) => {
            settingsState.tool_authorizations = revokeTalosToolAuthorizationGrant(
                settingsState.tool_authorizations,
                tool,
                settingsState.tool_authorizations.revision,
            )
        }),
        // The fake answers this the way the real store does, by running the same
        // rule — not by handing back the stored value. A double that skips the
        // rule would let every test here pass against a store that never
        // learned it, which is the shape of a test that guards nothing.
        effectiveToolPermissions: () => talosEffectiveToolPermissions({
            stored: {
                read: settingsState.tools?.read ?? TALOS_DEFAULT_TOOL_PERMISSIONS.read,
                write: settingsState.tools?.write ?? TALOS_DEFAULT_TOOL_PERMISSIONS.write,
                outbound: settingsState.tools?.outbound ?? TALOS_DEFAULT_TOOL_PERMISSIONS.outbound,
            },
            chosen: settingsState.tools_chosen ?? [],
            searchConfigured: settingsState.search?.source != null,
        }),
    }
    const deps: ChatControllerDeps = {
        translate: talosTestT('en'),
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

async function createBroadAnswerGuardDocuments(
    chatRepository: TalosChatRepository,
): Promise<void> {
    await chatRepository.createVaultFile({
        id: 'guard-omniroute',
        display_name: 'OmniRoute architecture.md',
        media_type: 'text/markdown',
        size_bytes: 96,
        private_uri: 'talos-vault/files/guard-omniroute.md',
        status: 'available',
        trust: 'untrusted',
        sha256: '8'.repeat(64),
        extracted_text: 'OMNIROUTE_GUARD_SENTINEL OmniRoute coordinates service routing and renewals.',
        failure_code: null,
        metadata: { origin: 'uploaded', library_shared: true },
        created_at: '2026-07-29T10:00:00.000Z',
    })
    await chatRepository.createVaultFile({
        id: 'guard-iterm',
        display_name: 'iTerm mock GPS.md',
        media_type: 'text/markdown',
        size_bytes: 96,
        private_uri: 'talos-vault/files/guard-iterm.md',
        status: 'available',
        trust: 'untrusted',
        sha256: '9'.repeat(64),
        extracted_text: 'ITERM_GPS_GUARD_SENTINEL iTerm can simulate a location with mock GPS.',
        failure_code: null,
        metadata: { origin: 'uploaded', library_shared: true },
        created_at: '2026-07-29T10:00:01.000Z',
    })
}

describe('chatController', () => {
    it('I18N-TS-03 emits model-probe guidance through the selected locale', async () => {
        const { deps } = makeDeps()
        deps.translate = talosTestT('it')
        const controller = createChatController(deps)

        await expect(controller.probeProvider('anthropic')).resolves.toEqual({
            ok: false,
            provider: 'anthropic',
            message: 'Configura anthropic prima della verifica.',
        })
    })

    it('TOOL-AUTH-25 exposes and cancels an uncertain checkpoint without auto-retry', async () => {
        const { deps, chatRepository, request } = makeDeps()
        const createdAt = '2026-07-29T12:00:00.000Z'
        const input = { title: 'Q2', body: 'Verified.' }
        await chatRepository.createSession({
            id: 'session-recovery',
            title: 'Q2 recovery',
            active_model_profile_id: 'anthropic:claude-live',
            created_at: createdAt,
        })
        await chatRepository.appendToolActivity({
            id: 'checkpoint-recovery',
            session_id: 'session-recovery',
            message_id: null,
            operation: 'tool.authorization',
            status: 'recovery_required',
            payload: {
                contract: 'talos.tool.authorization-checkpoint/1',
                checkpoint: {
                    schema_version: 1,
                    id: 'checkpoint-recovery',
                    session_id: 'session-recovery',
                    send_identity: {
                        sendId: 'send-recovery',
                        sessionId: 'session-recovery',
                        sessionTitle: 'Q2 recovery',
                        surface: 'chat',
                        modelProfileId: 'anthropic:claude-live',
                        acceptedAt: createdAt,
                    },
                    runtime: {
                        profile_id: 'anthropic:claude-live',
                        provider: 'anthropic',
                        model: 'claude-live',
                    },
                    loop: {
                        schema_version: 1,
                        stage: 'before_tools',
                        turns: [{ role: 'user', content: 'Create Q2' }],
                        completion: {
                            text: '',
                            toolCalls: [{
                                id: 'call-recovery',
                                name: 'document_create',
                                arguments: JSON.stringify(input),
                            }],
                        },
                    },
                    phase: 'running_tools',
                    requests: [{
                        schema_version: 1,
                        id: 'request-recovery',
                        checkpoint_id: 'checkpoint-recovery',
                        session_id: 'session-recovery',
                        send_id: 'send-recovery',
                        model_profile_id: 'anthropic:claude-live',
                        call_id: 'call-recovery',
                        tool: 'document_create',
                        actions: ['write'],
                        input,
                        input_digest: await digestTalosToolAuthorizationInput(input),
                        allow_persistent: true,
                        decision: 'allow_once',
                        created_at: createdAt,
                        decided_at: createdAt,
                    }],
                    created_at: createdAt,
                    updated_at: createdAt,
                },
            },
            evidence: {
                contract: 'talos.tool.authorization-checkpoint/1',
                phase: 'running_tools',
            },
            created_at: createdAt,
        })

        const controller = createChatController(deps)
        await controller.init()

        expect(controller.toolAuthorizationRecoveries.value).toEqual([
            expect.objectContaining({
                checkpoint_id: 'checkpoint-recovery',
                session_title: 'Q2 recovery',
                tools: [{
                    tool: 'document_create',
                    actions: ['write'],
                }],
            }),
        ])
        expect(request).not.toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('/v1/messages'),
        }))

        /**
         * I-02. The shell counts pending requests AND recoveries to decide
         * whether to offer the reopen control, but `showToolAuthorization()`
         * only looked at pending ones. A recovery-only card dismissed with
         * "Later" therefore offered a button that did nothing, and the only
         * way back to an uncertain side effect was a reload.
         *
         * "Later" is not a denial, so what it hides must be reachable again.
         */
        expect(controller.pendingToolAuthorizations.value).toEqual([])
        controller.dismissToolAuthorization()
        expect(controller.toolAuthorizationPromptVisible.value).toBe(false)

        controller.showToolAuthorization()

        expect(controller.toolAuthorizationPromptVisible.value).toBe(true)
        // And the recovery itself is untouched by hiding and showing it.
        expect(controller.toolAuthorizationRecoveries.value).toHaveLength(1)

        await controller.cancelToolAuthorization('checkpoint-recovery')

        expect(controller.toolAuthorizationRecoveries.value).toEqual([])
        expect((await chatRepository.listSessionToolActivities('session-recovery'))[0]?.status)
            .toBe('cancelled')
    })

    it('TOOL-AUTH-02 controller persists Italian authorization and releases the foreground send', async () => {
        const { deps, store, request } = makeDeps()
        deps.translate = talosTestT('it')
        store.set('anthropic', 'sk-ant')
        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-localized-consent',
                                name: 'document_create',
                                input: {
                                    format: 'md',
                                    title: 'Rapporto Q2',
                                    body: 'Contenuto verificabile.',
                                },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'Il file non è stato creato.' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController(deps)
        await controller.init()
        const sending = controller.send('crea un markdown chiamato Rapporto Q2')

        await vi.waitFor(
            () => expect(controller.pendingToolAuthorizations.value).toHaveLength(1),
            { timeout: 10_000, interval: 20 },
        )
        await expect(sending).resolves.toBe(true)
        expect(providerRound).toBe(1)
        expect(controller.chat.state.sending).toBe(false)
        expect(controller.pendingToolAuthorizations.value[0]).toMatchObject({
            title: 'Crea un documento',
            description: 'Crea un file reale e lo salva nella Libreria cifrata su questo dispositivo.',
            input: {
                format: 'md',
                title: 'Rapporto Q2',
                body: 'Contenuto verificabile.',
            },
        })
        expect(controller.pendingToolAuthorizations.value[0]?.title).not.toBe('Create a document')

        /**
         * Il cartellino sparisce quando si RISPONDE, non quando il lavoro
         * finisce.
         *
         * Owner 2026-08-04: restava li' finche' il modello non aveva finito.
         * La causa era l'attesa dentro `decideToolAuthorization` — il tool
         * gira, il modello continua, e solo allora la tendina si chiudeva.
         * Qui la promessa NON viene attesa: la visibilita' dev'essere gia'
         * caduta.
         */
        controller.showToolAuthorization()
        expect(controller.toolAuthorizationPromptVisible.value).toBe(true)
        const deciding = controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'deny',
        )
        expect(controller.toolAuthorizationPromptVisible.value).toBe(false)
        await deciding

        expect(providerRound).toBe(2)
        expect(controller.pendingToolAuthorizations.value).toEqual([])
    }, 15_000)

    it('TOOL-AUTH-24 generated save markers use the durable nonblocking authorization path', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: false,
            library_access: 'deny' as const,
                library_autosave_generated: true,
                debug_diagnostics: false,
            },
        })
        const base = attachmentRuntime(chatRepository).vault
        const createGenerated = vi.fn(async (input: {
            name: string
            mediaType: string
            text: string
        }, originSessionId?: string | null) => ({
            file: {
                id: 'generated-marker-file',
                display_name: input.name,
                media_type: input.mediaType,
                size_bytes: input.text.length,
                private_uri: 'talos-vault/files/generated-marker.md',
                status: 'available' as const,
                trust: 'untrusted' as const,
                sha256: 'a'.repeat(64),
                extracted_text: input.text,
                failure_code: null,
                metadata: { origin: 'generated', origin_session_id: originSessionId ?? null },
                created_at: '2026-07-29T12:00:00.000Z',
                updated_at: '2026-07-29T12:00:00.000Z',
            },
            grant: {
                id: 'generated-marker-grant',
                vault_file_id: 'generated-marker-file',
                permissions: ['model.read'] as const,
                status: 'active' as const,
                label: input.name,
                created_at: '2026-07-29T12:00:00.000Z',
                updated_at: '2026-07-29T12:00:00.000Z',
                revoked_at: null,
            },
        }))
        deps.vaultService = { ...base, createGenerated }
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{
                            type: 'text',
                            text: 'Report ready.\n[TALOS_SAVE_LIBRARY:Q2.md]\nVerified.\n[/TALOS_SAVE_LIBRARY]',
                        }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController(deps)
        await controller.init()
        await controller.send('crea il rapporto Q2')

        expect(createGenerated).not.toHaveBeenCalled()
        expect(controller.chat.state.sending).toBe(false)
        expect(controller.pendingToolAuthorizations.value).toHaveLength(1)
        expect(controller.pendingToolAuthorizations.value[0]).toMatchObject({
            tool: 'document_create',
            actions: ['write'],
            input: {
                name: 'Q2.md',
                mediaType: 'text/markdown',
                text: 'Verified.',
            },
        })

        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'allow_once',
        )

        // Famiglia B: the save carries WHICH model made it, not just where.
        expect(createGenerated).toHaveBeenCalledWith({
            name: 'Q2.md',
            mediaType: 'text/markdown',
            text: 'Verified.',
        }, expect.objectContaining({
            sessionId: controller.chat.activeSession.value?.id,
            toolName: 'document_create',
        }))
        expect(controller.pendingToolAuthorizations.value).toEqual([])
    }, 15_000)

    it('P1-CTX-AGENT-01/06 confirms an Italian natural-language policy change while Library is off', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        deps.translate = talosTestT('it')
        store.set('anthropic', 'sk-ant')
        settings.state.agent_tools.library_context_policy_update = true
        settings.state.shell = {
            library_context_enabled: false,
            library_access: 'deny' as const,
            library_context_policy: null,
            library_autosave_generated: false,
            debug_diagnostics: false,
        }
        let providerRound = 0
        request.mockImplementation(async ({ url, data }: { url: string; data?: unknown }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    expect((data as { tools: Array<{ name: string }> }).tools
                        .filter((tool) => tool.name.startsWith('library_'))
                        .map((tool) => tool.name))
                        .toEqual(['library_context_policy_update'])
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-policy-global',
                                name: 'library_context_policy_update',
                                input: {
                                    action: 'set_enabled',
                                    scope: 'global',
                                    enabled: true,
                                    expected_revision: 0,
                                },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'La Libreria è ora attiva.' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController(deps)
        await controller.init()
        const sending = controller.send('Ativa la libreria x tutte le chat')

        await vi.waitFor(
            () => expect(controller.pendingToolAuthorizations.value).toHaveLength(1),
            { timeout: 10_000, interval: 20 },
        )
        await expect(sending).resolves.toBe(true)
        expect(settings.state.shell.library_context_enabled).toBe(false)
        expect(controller.pendingToolAuthorizations.value[0]).toMatchObject({
            tool: 'library_context_policy_update',
            actions: ['write'],
            allow_persistent: false,
            title: 'Modifica la policy Libreria',
        })

        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'allow_once',
        )

        expect(providerRound).toBe(2)
        expect(settings.state.shell.library_context_enabled).toBe(true)
        expect(settings.state.shell.library_context_policy).toMatchObject({
            revision: 1,
            enabled: true,
            mode: 'broad_compat_v1',
        })
        expect(controller.pendingToolAuthorizations.value).toEqual([])
        const sessionId = controller.chat.activeSession.value!.id
        expect(await chatRepository.listSessionToolActivities(sessionId))
            .toContainEqual(expect.objectContaining({
                operation: 'tool.library_context_policy_update',
                status: 'succeeded',
                evidence: expect.objectContaining({
                    contract: 'talos.library-context-policy-receipt/1',
                    scope: 'global',
                    previous_revision: 0,
                    applied_revision: 1,
                }),
            }))
    }, 15_000)

    it('P1-CTX-AGENT-03/04 preserves chat revision and undo across English multi-turn sends', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        settings.state.agent_tools.library_context_policy_update = true
        let providerRound = 0
        let receiptId = ''
        let finalProviderPayload = ''
        request.mockImplementation(async ({ url, data }: { url: string; data?: unknown }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-policy-chat',
                                name: 'library_context_policy_update',
                                input: {
                                    action: 'set_mode',
                                    scope: 'chat',
                                    mode: 'smart_relevant_v1',
                                    expected_revision: 0,
                                },
                            }],
                        },
                    }
                }
                if (providerRound === 2) {
                    receiptId = JSON.stringify(data)
                        .match(/Undo receipt: ([A-Za-z0-9._:-]+)/)?.[1] ?? ''
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'end_turn',
                            content: [{
                                type: 'text',
                                text: `Chat policy changed. Undo receipt: ${receiptId}.`,
                            }],
                        },
                    }
                }
                if (providerRound === 3) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-policy-undo',
                                name: 'library_context_policy_update',
                                input: {
                                    action: 'undo',
                                    scope: 'chat',
                                    receipt_id: receiptId,
                                    expected_revision: 1,
                                },
                            }],
                        },
                    }
                }
                finalProviderPayload = JSON.stringify(data)
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'The prior chat policy is restored.' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController(deps)
        await controller.init()
        await controller.send('Use only relevant Library sources in this chat')
        expect(controller.pendingToolAuthorizations.value).toHaveLength(1)
        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'allow_once',
        )
        expect(controller.chat.activeSession.value?.metadata.library_context_policy)
            .toMatchObject({
                revision: 1,
                enabled: true,
                mode: 'smart_relevant_v1',
            })

        await controller.send('Undo that policy change')
        expect(controller.pendingToolAuthorizations.value).toHaveLength(1)
        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'allow_once',
        )

        expect(providerRound).toBe(4)
        expect(receiptId).toMatch(/\.$/)
        expect(finalProviderPayload).toContain(
            'Restored the previous chat Library policy',
        )
        const persistedSession = (await chatRepository.listSessions())
            .find((session) => session.id === controller.chat.activeSession.value?.id)
        expect(persistedSession?.metadata.library_context_policy)
            .toEqual(expect.objectContaining({
                revision: 2,
                enabled: null,
                mode: null,
                included_file_ids: [],
                excluded_file_ids: [],
            }))
        expect(controller.chat.activeSession.value?.metadata.library_context_policy)
            .toEqual(expect.objectContaining({
                revision: 2,
                enabled: null,
                mode: null,
                included_file_ids: [],
                excluded_file_ids: [],
            }))
    }, 20_000)

    it('P1-CTX-AGENT-07 applies a confirmed turn policy to this response only', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        settings.state.agent_tools.library_context_policy_update = true
        settings.state.shell = {
            library_context_enabled: true,
            library_context_policy: {
                schema_version: 1,
                revision: 4,
                enabled: true,
                mode: 'agentic_on_demand_v1',
                included_file_ids: [],
                excluded_file_ids: [],
                updated_at: '2026-07-29T16:00:00.000Z',
            },
            library_autosave_generated: false,
            debug_diagnostics: false,
        }
        await chatRepository.createVaultFile({
            id: 'turn-contract',
            display_name: 'OmniRoute contract.md',
            media_type: 'text/markdown',
            size_bytes: 48,
            private_uri: 'talos-vault/files/turn-contract.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '7'.repeat(64),
            extracted_text: 'TURN_CONTRACT_SENTINEL OmniRoute expires in March 2027.',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T16:00:00.000Z',
        })
        await chatRepository.createVaultFile({
            id: 'turn-garden',
            display_name: 'Garden notes.md',
            media_type: 'text/markdown',
            size_bytes: 32,
            private_uri: 'talos-vault/files/turn-garden.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '8'.repeat(64),
            extracted_text: 'TURN_GARDEN_SENTINEL Water basil at dawn.',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T16:01:00.000Z',
        })

        let providerRound = 0
        const providerPayloads: string[] = []
        request.mockImplementation(async ({ url, data }: { url: string; data?: unknown }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                providerPayloads.push(JSON.stringify(data))
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-policy-turn',
                                name: 'library_context_policy_update',
                                input: {
                                    action: 'set_mode',
                                    scope: 'turn',
                                    mode: 'smart_relevant_v1',
                                    expected_revision: 0,
                                },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{
                            type: 'text',
                            text: providerRound === 2
                                ? 'OmniRoute expires in March 2027.'
                                : 'No Library context used.',
                        }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController(deps)
        await controller.init()
        await controller.send('For this response use relevant Library sources about OmniRoute')
        expect(controller.pendingToolAuthorizations.value).toHaveLength(1)
        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'allow_once',
        )

        expect(providerPayloads[0]).not.toContain('TURN_CONTRACT_SENTINEL')
        expect(providerPayloads[1]).toContain('TURN_CONTRACT_SENTINEL')
        expect(providerPayloads[1]).not.toContain('TURN_GARDEN_SENTINEL')
        expect(settings.state.shell.library_context_policy).toMatchObject({
            revision: 4,
            mode: 'agentic_on_demand_v1',
        })
        expect(controller.chat.activeSession.value?.metadata.library_context_policy)
            .toBeUndefined()
        expect(controller.chat.messages.at(-1)?.metadata).toMatchObject({
            library_context_receipt: {
                mode: 'smart_relevant_v1',
                transmitted_file_ids: ['turn-contract'],
            },
            used_library: [{
                id: 'turn-contract',
                title: 'OmniRoute contract.md',
            }],
        })

        const authorizationActivity = (await chatRepository.listSessionToolActivities(
            controller.chat.activeSession.value!.id,
        )).find((activity) => activity.operation === 'tool.authorization')
        const checkpoint = parseTalosToolAuthorizationCheckpoint(
            authorizationActivity?.payload.checkpoint,
        )
        expect(checkpoint?.phase).toBe('before_model')
        expect(JSON.stringify(checkpoint?.runtime)).toContain('smart_relevant_v1')
        expect(JSON.stringify(checkpoint?.loop)).toContain('TURN_CONTRACT_SENTINEL')

        await controller.send('Answer this without Library context')
        expect(providerPayloads[2]).not.toContain('TURN_CONTRACT_SENTINEL')
        expect(providerPayloads[2]).not.toContain('TURN_GARDEN_SENTINEL')
    }, 20_000)

    it('AGENT-TOOLS-06 sends only enabled tool schemas for a natural-language request', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        settings.state.agent_tools.library_search = false
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })

        const controller = createChatController(deps)
        await controller.init()
        await controller.selectModel('anthropic:claude-live')
        await controller.send('cerac nella mia libreria il contratto')

        const completion = request.mock.calls
            .map(([call]) => call)
            .find((call) => call.url.includes('anthropic.com/v1/messages'))
        const names = (completion?.data.tools as Array<{ name: string }>).map((tool) => tool.name)
        expect(names).toContain('library_list')
        expect(names).not.toContain('library_search')
    })

    it('P1-CTX-COMPAT-07 LIB-REVOKE-05 denies an offered Library call when access is withdrawn before execution', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const shell = {
            library_context_enabled: true,
            library_autosave_generated: false,
            debug_diagnostics: false,
        }
        Object.assign(settings.state, { shell })
        const listSummaries = vi.spyOn(chatRepository, 'listVaultFileSummaries')

        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    // The schema was legitimately offered. Revoke before the
                    // provider-returned call reaches the execution boundary.
                    // Revoca a meta' volo: sotto la grammatica a tre stati
                    // e' `deny` a chiudere la porta, non l'interruttore
                    // dell'iniezione ambientale.
                    shell.library_context_enabled = false
                    shell.library_access = 'deny'
                    listSummaries.mockClear()
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-library-revoked',
                                name: 'library_list',
                                input: { origin: 'all', file_type: 'all', page_size: 20 },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'Library access was withdrawn.' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController(deps)
        await controller.init()
        await controller.selectModel('anthropic:claude-live')
        await controller.send('elenca tutti i file della mia libreria')

        expect(listSummaries).not.toHaveBeenCalled()
        const messageCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(JSON.stringify(messageCalls[1]?.data)).toContain('disabled in Agent Tools settings')
        const activity = await chatRepository.listSessionToolActivities(
            controller.chat.activeSession.value!.id,
        )
        expect(activity).toEqual(expect.arrayContaining([
            expect.objectContaining({
                operation: 'tool.library_list',
                status: 'failed',
                payload: expect.objectContaining({ outcome: 'denied' }),
            }),
        ]))
    })

    it('OPENROUTER-TOOLS-04 keeps a non-tool catalog model on a truthful plain-chat path', async () => {
        const { deps, store, request } = makeDeps()
        store.set('openrouter', 'router-key')
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url === 'https://openrouter.ai/api/v1/models') {
                return {
                    status: 200,
                    data: {
                        data: [{
                            id: 'vendor/plain',
                            name: 'Plain model',
                            architecture: {
                                input_modalities: ['text'],
                                output_modalities: ['text'],
                            },
                            supported_parameters: [],
                        }],
                    },
                }
            }
            if (url === 'https://openrouter.ai/api/v1/chat/completions') {
                return {
                    status: 200,
                    data: {
                        model: 'vendor/plain',
                        choices: [{ message: { content: 'Use a tool-capable model.' }, finish_reason: 'stop' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('stream unavailable')))

        try {
            const controller = createChatController(deps)
            await controller.init()
            await controller.selectModel('openrouter:vendor/plain')
            await controller.send('salva un file e cerca nella libreria')

            const completion = request.mock.calls
                .map(([call]) => call)
                .find((call) => call.url === 'https://openrouter.ai/api/v1/chat/completions')
            expect(completion?.data).not.toHaveProperty('tools')
            expect(completion?.data).not.toHaveProperty('tool_choice')
            const system = completion?.data.messages[0]?.content
            expect(system).toContain('No TALOS tools are available in this turn')
            expect(system).not.toContain('library_export')
            expect(system).not.toContain('[TALOS_SAVE_LIBRARY]')
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('P1-LIB-NL-01 answers an Italian browse request through library_list and audits every file', async () => {
        const { deps, store, settings, chatRepository, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        for (let index = 1; index <= 12; index += 1) {
            await chatRepository.createVaultFile({
                id: `generated-library-${index.toString().padStart(2, '0')}`,
                display_name: `Documento ${index}.md`,
                media_type: 'text/markdown',
                size_bytes: 32,
                private_uri: `talos-vault/files/generated-library-${index}.md`,
                status: 'available',
                trust: 'untrusted',
                sha256: String(index % 10).repeat(64),
                extracted_text: `Private body ${index} must not enter a metadata-only list.`,
                failure_code: null,
                metadata: {
                    origin: 'generated',
                    origin_session_id: `origin-chat-${index}`,
                },
                created_at: `2026-07-${index.toString().padStart(2, '0')}T12:00:00.000Z`,
            })
        }

        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-library-list',
                                name: 'library_list',
                                input: {
                                    origin: 'all',
                                    file_type: 'all',
                                    page_size: 20,
                                },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{
                            type: 'text',
                            text: 'La tua Library contiene 12 file accessibili alla chat.',
                        }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController(deps)
        await controller.init()
        await controller.send(
            'Mostrami tutti i file della mia libreria, senza cercare una parola specifica.',
        )

        const messageCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(messageCalls[0].data.tools).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'library_list' }),
        ]))
        const secondRound = JSON.stringify(messageCalls[1].data.messages)
        for (let index = 1; index <= 12; index += 1) {
            expect(secondRound).toContain(`generated-library-${index.toString().padStart(2, '0')}`)
        }
        expect(secondRound).not.toContain('Private body')

        const sessionId = controller.chat.activeSession.value!.id
        const activity = await chatRepository.listSessionToolActivities(sessionId)
        expect(activity).toEqual(expect.arrayContaining([
            expect.objectContaining({
                operation: 'tool.library_list',
                status: 'succeeded',
                evidence: expect.objectContaining({
                    total_size: 12,
                    returned: 12,
                    next_page_token: null,
                }),
            }),
        ]))
        expect(controller.chat.messages.at(-1)?.content).toContain('12 file')
    })

    it('P2-FILENAME-04 saves a generated image with a whole-grapheme UTF-8 name', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        store.set('openai', 'sk-openai')
        Object.assign(settings.state.tools, { write: 'allow', outbound: 'allow' })
        const prompt = `${'i'.repeat(47)}😀tail`
        const createGeneratedBinary = vi.fn(async (input: {
            name: string
            mediaType: string
            bytes: Uint8Array
        }) => {
            const createdAt = '2026-07-28T10:00:00.000Z'
            return {
                file: {
                    id: 'generated-image',
                    display_name: input.name,
                    media_type: input.mediaType,
                    size_bytes: input.bytes.byteLength,
                    private_uri: 'talos-vault/files/generated-image.png',
                    status: 'available' as const,
                    trust: 'untrusted' as const,
                    sha256: 'a'.repeat(64),
                    extracted_text: '',
                    failure_code: null,
                    metadata: { origin: 'generated' as const },
                    created_at: createdAt,
                    updated_at: createdAt,
                },
                grant: {
                    id: 'generated-image-grant',
                    vault_file_id: 'generated-image',
                    permissions: ['browser.upload', 'model.read'] as Array<'browser.upload' | 'model.read'>,
                    status: 'active' as const,
                    label: input.name,
                    created_at: createdAt,
                    updated_at: createdAt,
                    revoked_at: null,
                },
            }
        })
        const vaultService: TalosVaultService = {
            ingest: vi.fn(),
            createGenerated: vi.fn(),
            createGeneratedBinary,
            createGrant: vi.fn(),
            revokeGrant: vi.fn().mockResolvedValue(undefined),
            resolveMessageParts: vi.fn().mockResolvedValue([]),
            readFilePreview: vi.fn().mockResolvedValue(null),
            readFileText: vi.fn().mockResolvedValue(null),
            listFiles: vi.fn().mockResolvedValue([]),
            listSummaries: vi.fn().mockResolvedValue([]),
            setFileShared: vi.fn().mockResolvedValue(undefined),
            deleteFile: vi.fn().mockResolvedValue(undefined),
            reconcilePending: vi.fn().mockResolvedValue(undefined),
        }

        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url === 'https://api.openai.com/v1/models') {
                return {
                    status: 200,
                    data: {
                        object: 'list',
                        data: [{ id: 'gpt-image-1', object: 'model', owned_by: 'openai' }],
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-image-name',
                                name: 'generate_image',
                                input: { prompt, shape: 'square' },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'Image saved.' }],
                    },
                }
            }
            if (url.endsWith('/images/generations')) {
                return {
                    status: 200,
                    data: { data: [{ b64_json: 'AQID', revised_prompt: prompt }] },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })
        vi.stubGlobal('fetch', vi.fn(async () => ({
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        })))

        try {
            const controller = createChatController({
                ...deps,
                filePicker: { pickFiles: vi.fn().mockResolvedValue([]) },
                vaultService,
            })
            await controller.init()
            await controller.selectModel('anthropic:claude-live')
            await controller.send('crea una immagine')

            expect(createGeneratedBinary).toHaveBeenCalledWith(
                expect.objectContaining({ name: `${'i'.repeat(47)}.png` }),
                expect.objectContaining({ sessionId: expect.any(String), toolName: 'generate_image' }),
            )
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('SOURCE-FILE-04 saves a requested Python script through a natural-language tool round', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        ;(settings.state.tools as { write: 'allow' | 'ask' | 'deny' }).write = 'allow'
        const body = '# script richiesto\nprint("caffè 你好")\n'
        const createGeneratedBinary = vi.fn(async (input: {
            name: string
            mediaType: string
            bytes: Uint8Array
        }) => {
            const createdAt = '2026-07-28T10:00:00.000Z'
            return {
                file: {
                    id: 'generated-python',
                    display_name: input.name,
                    media_type: input.mediaType,
                    size_bytes: input.bytes.byteLength,
                    private_uri: 'talos-vault/files/generated-python.py',
                    status: 'available' as const,
                    trust: 'untrusted' as const,
                    sha256: 'b'.repeat(64),
                    extracted_text: new TextDecoder().decode(input.bytes),
                    failure_code: null,
                    metadata: { origin: 'generated' as const },
                    created_at: createdAt,
                    updated_at: createdAt,
                },
                grant: {
                    id: 'generated-python-grant',
                    vault_file_id: 'generated-python',
                    permissions: ['browser.upload', 'model.read'] as Array<'browser.upload' | 'model.read'>,
                    status: 'active' as const,
                    label: input.name,
                    created_at: createdAt,
                    updated_at: createdAt,
                    revoked_at: null,
                },
            }
        })
        const vaultService: TalosVaultService = {
            ingest: vi.fn(),
            createGenerated: vi.fn(),
            createGeneratedBinary,
            createGrant: vi.fn(),
            revokeGrant: vi.fn().mockResolvedValue(undefined),
            resolveMessageParts: vi.fn().mockResolvedValue([]),
            readFilePreview: vi.fn().mockResolvedValue(null),
            readFileText: vi.fn().mockResolvedValue(null),
            listFiles: vi.fn().mockResolvedValue([]),
            listSummaries: vi.fn().mockResolvedValue([]),
            setFileShared: vi.fn().mockResolvedValue(undefined),
            deleteFile: vi.fn().mockResolvedValue(undefined),
            reconcilePending: vi.fn().mockResolvedValue(undefined),
        }

        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-python-file',
                                name: 'document_create',
                                input: {
                                    format: 'py',
                                    title: 'patch_mock_gps_iterm.py',
                                    body,
                                },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'Script Python salvato.' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController({
            ...deps,
            filePicker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vaultService,
        })
        await controller.init()
        await controller.send('Salva anche lo script Python nella libreria come patch_mock_gps_iterm.py')

        expect(createGeneratedBinary).toHaveBeenCalledTimes(1)
        const saved = createGeneratedBinary.mock.calls[0]![0]
        expect(saved.name).toBe('patch_mock_gps_iterm.py')
        expect(saved.mediaType).toBe('text/plain')
        expect(new TextDecoder('utf-8', { fatal: true }).decode(saved.bytes)).toBe(body)
    })

    it('IMAGE-OR-05 IMAGE-DUR-01/02/03 returns, stores, renders, and reloads an OpenRouter tool image', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('openrouter', 'router-key')
        Object.assign(settings.state.tools, { write: 'allow', outbound: 'allow' })
        const createGeneratedBinary = vi.fn(async (input: {
            name: string
            mediaType: string
            bytes: Uint8Array
        }) => {
            const createdAt = '2026-07-28T10:00:00.000Z'
            const file = await chatRepository.createVaultFile({
                id: 'generated-openrouter-image',
                display_name: input.name,
                media_type: input.mediaType,
                size_bytes: input.bytes.byteLength,
                private_uri: 'talos-vault/files/generated-openrouter-image.png',
                status: 'available',
                trust: 'untrusted',
                sha256: 'c'.repeat(64),
                extracted_text: null,
                failure_code: null,
                metadata: { origin: 'generated', origin_session_id: 'chat-image' },
                created_at: createdAt,
            })
            const grant = await chatRepository.createFileAuthorityGrant({
                id: 'generated-openrouter-image-grant',
                vault_file_id: file.id,
                permissions: ['browser.upload', 'model.read'],
                label: input.name,
                created_at: createdAt,
            })
            return { file, grant }
        })
        const resolveMessageParts = vi.fn().mockResolvedValue([{
            type: 'image' as const,
            attachmentId: 'generated-openrouter-image-binding',
            name: 'generated.png',
            mediaType: 'image/png' as const,
            base64: 'A'.repeat(600),
            sha256: 'c'.repeat(64),
        }])
        const vaultService: TalosVaultService = {
            ingest: vi.fn(),
            createGenerated: vi.fn(),
            createGeneratedBinary,
            createGrant: vi.fn(),
            revokeGrant: vi.fn().mockResolvedValue(undefined),
            resolveMessageParts,
            readFilePreview: vi.fn().mockResolvedValue({
                bytes: new Uint8Array([1, 2, 3]),
                mediaType: 'image/png',
            }),
            readFileText: vi.fn().mockResolvedValue(null),
            listFiles: () => chatRepository.listVaultFiles(),
            listSummaries: async () => (await chatRepository.listVaultFileSummaries())
                .map(({ text_preview: _preview, ...file }) => ({ ...file, extracted_text: null })),
            setFileShared: vi.fn().mockResolvedValue(undefined),
            deleteFile: vi.fn().mockResolvedValue(undefined),
            reconcilePending: vi.fn().mockResolvedValue(undefined),
        }

        let chatRound = 0
        request.mockImplementation(async ({
            url,
            method,
            data,
        }: {
            url: string
            method?: string
            data?: Record<string, unknown>
        }) => {
            if (url === 'https://openrouter.ai/api/v1/models') {
                return {
                    status: 200,
                    data: {
                        data: [{
                            id: 'google/gemini-3.6-flash',
                            name: 'Gemini 3.6 Flash',
                            architecture: {
                                input_modalities: ['text', 'image'],
                                output_modalities: ['text'],
                            },
                            supported_parameters: ['tools'],
                        }],
                    },
                }
            }
            if (url === 'https://openrouter.ai/api/v1/images/models') {
                return {
                    status: 200,
                    data: {
                        data: [
                            {
                                id: 'zeta/new-image',
                                created: 200,
                                architecture: { input_modalities: ['text'], output_modalities: ['image'] },
                                supported_parameters: {},
                            },
                            {
                                id: 'google/gemini-3.1-flash-image',
                                created: 100,
                                architecture: { input_modalities: ['text'], output_modalities: ['image'] },
                                supported_parameters: { aspect_ratio: { type: 'enum', values: ['1:1'] } },
                            },
                        ],
                    },
                }
            }
            if (url === 'https://openrouter.ai/api/v1/images' && method === 'POST') {
                expect(data).toMatchObject({
                    model: 'google/gemini-3.1-flash-image',
                    prompt: 'un gatto astronauta',
                    n: 1,
                    output_format: 'png',
                })
                return {
                    status: 200,
                    data: {
                        data: [{
                            b64_json: 'A'.repeat(600),
                            media_type: 'image/png',
                        }],
                    },
                }
            }
            if (url === 'https://openrouter.ai/api/v1/chat/completions') {
                chatRound += 1
                if (chatRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'google/gemini-3.6-flash',
                            choices: [{
                                finish_reason: 'tool_calls',
                                message: {
                                    content: null,
                                    tool_calls: [{
                                        id: 'call-image-openrouter',
                                        type: 'function',
                                        function: {
                                            name: 'generate_image',
                                            arguments: JSON.stringify({
                                                prompt: 'un gatto astronauta',
                                                shape: 'square',
                                            }),
                                        },
                                    }],
                                },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'google/gemini-3.6-flash',
                        choices: [{ message: { content: 'Immagine salvata.' }, finish_reason: 'stop' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            if (String(input).startsWith('data:image/')) {
                return {
                    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
                }
            }
            throw new TypeError('stream unavailable')
        }))

        try {
            const controller = createChatController({
                ...deps,
                filePicker: { pickFiles: vi.fn().mockResolvedValue([]) },
                vaultService,
            })
            await controller.init()
            await controller.selectModel('openrouter:google/gemini-3.6-flash')
            await controller.send('genera un gatto astronauta')

            expect(request.mock.calls.some(([call]) =>
                call.url === 'https://openrouter.ai/api/v1/images/models')).toBe(true)
            expect(request.mock.calls.some(([call]) =>
                call.url === 'https://openrouter.ai/api/v1/images')).toBe(true)
            expect(createGeneratedBinary).toHaveBeenCalledWith(
                expect.objectContaining({
                    mediaType: 'image/png',
                    bytes: new Uint8Array([1, 2, 3]),
                }),
                expect.objectContaining({ sessionId: expect.any(String), toolName: 'generate_image' }),
            )
            const chatRequests = request.mock.calls
                .map(([call]) => call)
                .filter((call) => call.url === 'https://openrouter.ai/api/v1/chat/completions')
            expect(JSON.stringify(chatRequests[1]!.data)).toContain('data:image/png;base64,')
            expect(controller.chat.messages.find((message) => message.role === 'assistant')?.attachments)
                .toEqual([expect.objectContaining({
                    vault_file_id: 'generated-openrouter-image',
                    display_name: expect.stringMatching(/\.png$/),
                })])

            const reloaded = createChatController({
                ...deps,
                filePicker: { pickFiles: vi.fn().mockResolvedValue([]) },
                vaultService,
            })
            await reloaded.init()
            expect(reloaded.chat.messages.find((message) => message.role === 'assistant')?.attachments)
                .toEqual([expect.objectContaining({ vault_file_id: 'generated-openrouter-image' })])

            resolveMessageParts.mockClear()
            await reloaded.send('ora rispondi solo ciao')
            const lastChatRequest = request.mock.calls
                .map(([call]) => call)
                .filter((call) => call.url === 'https://openrouter.ai/api/v1/chat/completions')
                .at(-1)!
            expect(JSON.stringify(lastChatRequest.data)).not.toContain('data:image/')
            expect(resolveMessageParts).not.toHaveBeenCalled()
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('IMAGE-DUR-FAIL-02 controller never persists, renders, or regenerates an image after the Vault rejects it', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('openrouter', 'router-key')
        Object.assign(settings.state.tools, { write: 'allow', outbound: 'allow' })
        const createGeneratedBinary = vi.fn()
            .mockRejectedValue(new Error('TALOS_PRIVATE_STORAGE_WRITE_FAILED'))
        const vaultService: TalosVaultService = {
            ingest: vi.fn(),
            createGenerated: vi.fn(),
            createGeneratedBinary,
            createGrant: vi.fn(),
            revokeGrant: vi.fn().mockResolvedValue(undefined),
            resolveMessageParts: vi.fn().mockResolvedValue([]),
            readFilePreview: vi.fn().mockResolvedValue(null),
            readFileText: vi.fn().mockResolvedValue(null),
            listFiles: () => chatRepository.listVaultFiles(),
            listSummaries: async () => (await chatRepository.listVaultFileSummaries())
                .map(({ text_preview: _preview, ...file }) => ({ ...file, extracted_text: null })),
            setFileShared: vi.fn().mockResolvedValue(undefined),
            deleteFile: vi.fn().mockResolvedValue(undefined),
            reconcilePending: vi.fn().mockResolvedValue(undefined),
        }

        let chatRound = 0
        request.mockImplementation(async ({
            url,
            method,
        }: {
            url: string
            method?: string
        }) => {
            if (url === 'https://openrouter.ai/api/v1/models') {
                return {
                    status: 200,
                    data: {
                        data: [{
                            id: 'google/gemini-3.6-flash',
                            name: 'Gemini 3.6 Flash',
                            architecture: {
                                input_modalities: ['text', 'image'],
                                output_modalities: ['text'],
                            },
                            supported_parameters: ['tools'],
                        }],
                    },
                }
            }
            if (url === 'https://openrouter.ai/api/v1/images/models') {
                return {
                    status: 200,
                    data: {
                        data: [{
                            id: 'google/gemini-3.1-flash-image',
                            created: 100,
                            architecture: {
                                input_modalities: ['text'],
                                output_modalities: ['image'],
                            },
                            supported_parameters: {
                                aspect_ratio: { type: 'enum', values: ['1:1'] },
                            },
                        }],
                    },
                }
            }
            if (url === 'https://openrouter.ai/api/v1/images' && method === 'POST') {
                return {
                    status: 200,
                    data: {
                        data: [{
                            b64_json: 'A'.repeat(600),
                            media_type: 'image/png',
                        }],
                    },
                }
            }
            if (url === 'https://openrouter.ai/api/v1/chat/completions') {
                chatRound += 1
                if (chatRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'google/gemini-3.6-flash',
                            choices: [{
                                finish_reason: 'tool_calls',
                                message: {
                                    content: null,
                                    tool_calls: [{
                                        id: 'call-image-storage-failure',
                                        type: 'function',
                                        function: {
                                            name: 'generate_image',
                                            arguments: JSON.stringify({
                                                prompt: 'un gatto astronauta',
                                                shape: 'square',
                                            }),
                                        },
                                    }],
                                },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'google/gemini-3.6-flash',
                        choices: [{
                            message: {
                                content: 'Immagine non disponibile: il salvataggio locale non è riuscito.',
                            },
                            finish_reason: 'stop',
                        }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            if (String(input).startsWith('data:image/')) {
                return {
                    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
                }
            }
            throw new TypeError('stream unavailable')
        }))

        try {
            const controller = createChatController({
                ...deps,
                filePicker: { pickFiles: vi.fn().mockResolvedValue([]) },
                vaultService,
            })
            await controller.init()
            await controller.selectModel('openrouter:google/gemini-3.6-flash')
            await controller.send('genera un gatto astronauta')

            const imageRequests = request.mock.calls
                .map(([call]) => call)
                .filter((call) => call.url === 'https://openrouter.ai/api/v1/images')
            const chatRequests = request.mock.calls
                .map(([call]) => call)
                .filter((call) => call.url === 'https://openrouter.ai/api/v1/chat/completions')
            const persisted = JSON.stringify(controller.chat.messages)

            expect(imageRequests).toHaveLength(1)
            expect(createGeneratedBinary).toHaveBeenCalledTimes(1)
            expect(chatRequests).toHaveLength(2)
            expect(JSON.stringify(chatRequests[1]!.data)).toContain('TALOS_IMAGE_PERSIST_FAILED')
            expect(JSON.stringify(chatRequests[1]!.data)).not.toContain('data:image/')
            expect(persisted).not.toContain('data:image/')
            expect(persisted).not.toContain('A'.repeat(600))
            expect(controller.chat.messages.find((message) => message.role === 'assistant')
                ?.attachments ?? []).toEqual([])
            await expect(chatRepository.listVaultFiles()).resolves.toEqual([])
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('exports an existing Library file through a realistic natural-language tool round', async () => {
        deviceFileSave.saveTalosVaultFileToDevice.mockReset()
        const { deps, store, settings, chatRepository, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        ;(settings.state.tools as { write: 'allow' | 'ask' | 'deny' }).write = 'allow'
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.createVaultFile({
            id: 'vault-export',
            display_name: 'Quarterly Report.pdf',
            media_type: 'application/pdf',
            size_bytes: 3,
            private_uri: 'talos-vault/files/vault-export.pdf',
            status: 'available',
            trust: 'untrusted',
            sha256: 'a'.repeat(64),
            extracted_text: 'private report',
            failure_code: null,
            metadata: { origin: 'generated' },
            created_at: '2026-07-28T10:00:00.000Z',
        })
        const bytes = new Uint8Array([1, 2, 3])
        const readFilePreview = vi.fn(async () => ({
            bytes,
            mediaType: 'application/pdf',
        }))
        const vaultService: TalosVaultService = {
            ingest: vi.fn(),
            createGenerated: vi.fn(),
            createGeneratedBinary: vi.fn(),
            readFilePreview,
            readFileText: vi.fn(async () => 'private report'),
            createGrant: vi.fn(),
            revokeGrant: vi.fn(),
            resolveMessageParts: vi.fn(async () => []),
            listFiles: vi.fn(() => chatRepository.listVaultFiles()),
            listSummaries: vi.fn(() => chatRepository.listVaultFiles()),
            setFileShared: vi.fn(),
            deleteFile: vi.fn(),
            reconcilePending: vi.fn(),
        }
        deviceFileSave.saveTalosVaultFileToDevice.mockResolvedValueOnce({
            status: 'saved',
            delivery: 'android-saf',
            bytesWritten: 3,
            displayName: 'Quarterly Report.pdf',
        })

        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-export-1',
                                name: 'library_export',
                                input: { reference: 'Quarterly Report.pdf' },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'Saved to the location you chose.' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController({
            ...deps,
            filePicker: { pickFiles: vi.fn(async () => []) },
            vaultService,
        })
        await controller.init()
        await controller.send('salva Quarterly Report.pdf nella memoria del telefono')

        expect(readFilePreview).toHaveBeenCalledWith('vault-export')
        expect(deviceFileSave.saveTalosVaultFileToDevice).toHaveBeenCalledWith({
            displayName: 'Quarterly Report.pdf',
            mediaType: 'application/pdf',
            bytes,
        })
        const messageCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(messageCalls[0].data.system).toContain('private Library')
        expect(messageCalls[0].data.system).toContain('library_export')

        const sessionId = controller.chat.activeSession.value!.id
        const activity = await chatRepository.listSessionToolActivities(sessionId)
        expect(activity).toEqual(expect.arrayContaining([
            expect.objectContaining({
                operation: 'tool.library_export',
                status: 'succeeded',
                evidence: expect.objectContaining({
                    library_file_id: 'vault-export',
                    bytes: 3,
                    delivery: 'android-saf',
                }),
            }),
        ]))
        expect(controller.chat.messages.at(-1)?.content).toContain('Saved to the location you chose')
    })

    it('finds a generated PDF from a typoed natural-language Library request without inventing uploaded matches', async () => {
        const { deps, store, settings, chatRepository, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })

        for (let index = 1; index <= 4; index += 1) {
            await chatRepository.createVaultFile({
                id: `uploaded-photo-${index}`,
                display_name: `IMG_2026072${index}.jpg`,
                media_type: 'image/jpeg',
                size_bytes: 3,
                private_uri: `talos-vault/files/uploaded-photo-${index}.jpg`,
                status: 'available',
                trust: 'untrusted',
                sha256: String(index).repeat(64),
                extracted_text: null,
                failure_code: null,
                metadata: { origin: 'uploaded', origin_session_id: `photo-chat-${index}` },
                created_at: `2026-07-28T14:0${index}:00.000Z`,
            })
        }
        await chatRepository.createVaultFile({
            id: 'vault-ds4',
            display_name: 'ds4-inference-engine-antirez.pdf',
            media_type: 'application/pdf',
            size_bytes: 58,
            private_uri: 'talos-vault/files/vault-ds4.pdf',
            status: 'available',
            trust: 'untrusted',
            sha256: 'd'.repeat(64),
            extracted_text: 'DwarfStar 4 is an inference engine by Salvatore Sanfilippo.',
            failure_code: null,
            metadata: { origin: 'generated', origin_session_id: 'research-chat' },
            created_at: '2026-07-28T14:30:00.000Z',
        })

        const readFileText = vi.fn(async (id: string) => (
            id === 'vault-ds4'
                ? 'DwarfStar 4 is an inference engine by Salvatore Sanfilippo.'
                : null
        ))
        const vaultService: TalosVaultService = {
            ingest: vi.fn(),
            createGenerated: vi.fn(),
            createGeneratedBinary: vi.fn(),
            readFilePreview: vi.fn(async () => null),
            readFileText,
            createGrant: vi.fn(),
            revokeGrant: vi.fn(),
            resolveMessageParts: vi.fn(async () => []),
            listFiles: vi.fn(() => chatRepository.listVaultFiles()),
            listSummaries: vi.fn(() => chatRepository.listVaultFiles()),
            setFileShared: vi.fn(),
            deleteFile: vi.fn(),
            reconcilePending: vi.fn(),
        }

        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-library-search',
                                name: 'library_search',
                                input: {
                                    query: 'ds4 inference engine Salvatore Sanfilippo antirez',
                                    limit: 5,
                                },
                            }],
                        },
                    }
                }
                if (providerRound === 2) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-library-read',
                                name: 'library_read',
                                input: { id: 'vault-ds4' },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{
                            type: 'text',
                            text: 'Ho trovato e letto il PDF ds4 già presente nella tua Library.',
                        }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController({
            ...deps,
            filePicker: { pickFiles: vi.fn(async () => []) },
            vaultService,
        })
        await controller.init()
        await controller.send('puoi cercare ancora il pfd ds4 nella libreria?')

        const messageCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        // Generated files are reachable only after an explicit tool call; they
        // are still excluded from the automatic ambient context.
        expect(JSON.stringify(messageCalls[0].data.messages)).not.toContain('vault-ds4')
        expect(JSON.stringify(messageCalls[0].data.messages)).not.toContain(
            'DwarfStar 4 is an inference engine by Salvatore Sanfilippo.',
        )
        expect(JSON.stringify(messageCalls[1].data.messages)).toContain('vault-ds4')
        expect(JSON.stringify(messageCalls[1].data.messages)).toContain('origin: generated')
        expect(JSON.stringify(messageCalls[1].data.messages)).not.toContain('uploaded-photo-')
        expect(JSON.stringify(messageCalls[2].data.messages)).toContain(
            'DwarfStar 4 is an inference engine by Salvatore Sanfilippo.',
        )
        expect(JSON.stringify(messageCalls[2].data.messages)).toContain(
            'TALOS_TOOL_RESULT (untrusted data',
        )
        expect(readFileText).toHaveBeenCalledWith('vault-ds4')

        const sessionId = controller.chat.activeSession.value!.id
        const activity = await chatRepository.listSessionToolActivities(sessionId)
        expect(activity).toEqual(expect.arrayContaining([
            expect.objectContaining({
                operation: 'tool.library_search',
                status: 'succeeded',
                evidence: expect.objectContaining({
                    matched: ['vault-ds4'],
                    matched_total: 1,
                }),
            }),
            expect.objectContaining({
                operation: 'tool.library_read',
                status: 'succeeded',
                evidence: expect.objectContaining({ id: 'vault-ds4' }),
            }),
        ]))
        expect(controller.chat.messages.at(-1)?.content).toContain('già presente')
    })

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

    /*
     * ⛔⛔ R-05 — «UNA CHAT NUOVA NON EREDITA IL MODELLO», e la causa vera.
     *
     * MISURATO sul Pad il 2026-08-13: due chat aperte allo stesso modo a sei
     * minuti di distanza, **Claude Haiku 4.5** la prima e **ByteDance Seed 2.1
     * Turbo** la seconda. Col credito OpenRouter esaurito la seconda sarebbe
     * fallita per un motivo che non c'entrava niente con la funzione in prova:
     * questo difetto **avvelena ogni misura successiva**.
     *
     * La sonda, riprodotta togliendo la rete, ha nominato la causa in una riga:
     * `ricordato=anthropic:claude-haiku-4-5 scartato=non-nel-catalogo profili=0`.
     * ⇒ Il modello scelto veniva scartato come «non esiste» quando la verità
     * era «il suo catalogo non si è potuto leggere» — e il ripiego su un altro
     * provider **diventava permanente**, perché al ritorno del catalogo la
     * scelta corrente era ormai valida e nessuno la rimetteva a posto.
     *
     * ⛔ Il test morde sulla SECONDA metà: senza `modelloInAttesa`, la prima
     * asserzione passa lo stesso (il ripiego è giusto, lì per lì) e solo la
     * terza diventa rossa. Provare il ripiego non prova niente: il difetto è
     * che non torna indietro.
     */
    it('⛔ R-05 il modello scelto TORNA quando il suo catalogo si riesce a leggere', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        store.set('gemini', 'gemini-key')
        settings.state.composer_defaults.model_profile_id = 'anthropic:claude-live'

        // Anthropic non risponde: è «non lo so», non «quel modello non esiste».
        let anthropicGiu = true
        const rispostaVera = request.getMockImplementation()!
        request.mockImplementation(async (arg: { url: string }) => {
            if (anthropicGiu && arg.url.includes('anthropic.com/v1/models')) {
                throw new Error('Unable to resolve host "api.anthropic.com"')
            }
            return await rispostaVera(arg)
        })

        const controller = createChatController(deps)
        await controller.init()

        // Lì per lì il ripiego è giusto: senza catalogo non c'è altro da fare.
        expect(controller.selectedModelId.value).toBe('gemini:gemini-live')

        // ⛔ E QUI STA IL DIFETTO: torna la rete, e deve tornare la SUA scelta.
        anthropicGiu = false
        await controller.refreshProvider('anthropic')
        expect(controller.selectedModelId.value).toBe('anthropic:claude-live')
    })

    /*
     * ⛔⛔ IL RIPIEGO NON DIVENTA LA PREFERENZA — owner, 2026-08-13:
     * «perché il modello selezionato nel composer è bytedance seed etc?»
     *
     * MISURATO sul suo Pad, nel deposito:
     *   composer_model    = openrouter:bytedance-seed/seed-2-1-turbo  ⛔
     *   composer_defaults = anthropic:claude-haiku-4-5-20251001       ✅
     *
     * `applyModelSelection` scriveva `composer_model` **ogni volta che
     * applicava**, ripiego compreso. Un catalogo caduto per pochi secondi
     * bastava a consacrare a preferenza un modello che nessuno aveva scelto —
     * e da lì ogni chat nuova lo ereditava. ⛔ L'ereditarietà è giusta e resta
     * (l'owner: «la nuova chat dovrebbe ereditare l'ultimo modello usato»); è
     * il valore ereditato che era falso.
     */
    it('⛔ un RIPIEGO non diventa la preferenza scritta', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        store.set('gemini', 'gemini-key')
        settings.state.composer_defaults.model_profile_id = 'anthropic:claude-live'

        const rispostaVera = request.getMockImplementation()!
        request.mockImplementation(async (arg: { url: string }) => {
            if (arg.url.includes('anthropic.com/v1/models')) {
                throw new Error('Unable to resolve host "api.anthropic.com"')
            }
            return await rispostaVera(arg)
        })

        const controller = createChatController(deps)
        await controller.init()

        // Il ripiego c'è, ed è giusto che ci sia: senza catalogo non c'è altro.
        expect(controller.selectedModelId.value).toBe('gemini:gemini-live')
        // ⛔ Ma NON deve essere finito nel deposito come se fosse una scelta.
        expect(settings.state.shell?.composer_model).not.toBe('gemini:gemini-live')
    })

    it('una scelta ESPLICITA invece si scrive, ed è così che si eredita', async () => {
        const { deps, store, settings } = makeDeps()
        store.set('anthropic', 'sk-ant')
        store.set('gemini', 'gemini-key')
        const controller = createChatController(deps)
        await controller.init()

        await controller.selectModel('gemini:gemini-live')
        expect(settings.state.shell?.composer_model).toBe('gemini:gemini-live')
    })

    /*
     * ⛔ E il verso contrario, che è la metà che manca sempre: se la persona
     * sceglie un altro modello MENTRE il catalogo è irraggiungibile, riprendersi
     * quello di prima le disferebbe la scelta sotto le mani.
     */
    it('⛔ R-05 una scelta esplicita CHIUDE l\'attesa, e non viene disfatta', async () => {
        const { deps, store, settings, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        store.set('gemini', 'gemini-key')
        settings.state.composer_defaults.model_profile_id = 'anthropic:claude-live'

        let anthropicGiu = true
        const rispostaVera = request.getMockImplementation()!
        request.mockImplementation(async (arg: { url: string }) => {
            if (anthropicGiu && arg.url.includes('anthropic.com/v1/models')) {
                throw new Error('Unable to resolve host "api.anthropic.com"')
            }
            return await rispostaVera(arg)
        })

        const controller = createChatController(deps)
        await controller.init()
        await controller.selectModel('gemini:gemini-live')

        anthropicGiu = false
        await controller.refreshProvider('anthropic')
        expect(controller.selectedModelId.value).toBe('gemini:gemini-live')
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

    /**
     * The engine on this device has no key and no address, and for a while that
     * meant it had no models either.
     *
     * `refreshProvider` used to ask "a key if it wants one, ELSE an address",
     * which is true of every provider that talks to a server and false of the
     * only one that does not. The on-device engine failed the address half and
     * the function returned before reaching the catalogue — so the plugin was
     * never called, and the model picker showed nothing local. Every other test
     * in this file passed throughout, on a device with a model sitting on disk.
     *
     * This asserts the far end: a file the engine reported became something the
     * user can select. Nothing here mentions the gate, so it keeps working if
     * the gate is rewritten again — and it fails if the third kind of provider
     * is ever forgotten a second time.
     */
    it('discovers a provider that needs neither a key nor an address', async () => {
        const { deps } = makeDeps()
        const controller = createChatController(deps)
        localEngine.talosLocalInstalledModels.mockResolvedValueOnce({
            models: [
                { path: '/models/local-test/smollm2-135m.gguf', name: 'smollm2-135m.gguf', bytes: 270_885_952 },
            ],
            unreadable: [],
        })

        // Deliberately no secret and no endpoint stored for `local`: needing
        // nothing is the whole point, and saving either would hide the defect.
        await controller.init()

        expect(localEngine.talosLocalInstalledModels).toHaveBeenCalled()
        expect(controller.profiles.value.map((profile) => profile.id))
            .toContain('local:/models/local-test/smollm2-135m.gguf')
        const profile = controller.profiles.value
            .find((candidate) => candidate.provider === 'local')
        expect(profile?.display_name).toBe('smollm2-135m')
        // `has_secret` reads as "nothing it needs is missing" rather than "a key
        // is stored" — which is why it is true for a provider that has no key at
        // all. The name is worse than the behaviour; `talosMobileModelProfileIsCallable`
        // only consults it for providers that require one.
        expect(profile?.has_secret).toBe(true)
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
        // Su DeepSeek e non su OpenAI: dal 2026-08-03 OpenAI parla
        // `/v1/responses`, e questo caso prova la corsa fra una prova in volo e
        // un modello che sparisce — niente che dipenda dall'endpoint.
        const { deps, store, settings, request } = makeDeps()
        store.set('deepseek', 'sk-deepseek')
        const controller = createChatController(deps)
        await controller.init()
        const manual: TalosMobileManualModel = {
            id: 'manual-race',
            provider: 'deepseek',
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

        const pending = controller.probeModel('deepseek:race-model')
        await vi.waitFor(() => expect(release).toBeTypeOf('function'))
        await controller.removeManualModel(manual.id)
        release({
            status: 200,
            data: { model: 'race-model', choices: [{ message: { content: 'TALOS_PROBE_OK' } }] },
        })

        await expect(pending).rejects.toThrow(/model changed/i)
        expect(settings.state.model_lab.probe_results['deepseek:race-model']).toBeUndefined()
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

    /*
     * ⛔⛔ QUESTI DUE CORRONO IN ITALIANO, e non è un vezzo: è l'unico modo in
     * cui mordono.
     *
     * Visto sul Pad il 2026-08-13: ventiquattro chat nell'elenco, **tutte**
     * chiamate «Nuova chat». Eppure `titleFromPrompt` era giusta e i suoi test
     * erano verdi. A mentire era il GIRO: il controller salvava il titolo
     * **tradotto** e la guardia della rinomina lo confrontava con la costante
     * **inglese**. In inglese `'New chat' === 'New chat'` regge per
     * COINCIDENZA — e ogni test di questo file gira in inglese. Ecco perché
     * nessuno lo vedeva: la lingua del test nascondeva il difetto.
     */
    it('⛔ la prima domanda dà il nome alla chat — anche in italiano', async () => {
        const { deps, store } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController({ ...deps, translate: talosTestT('it') })
        await controller.init()
        await controller.newSession()

        await controller.send('accendi la torcia')

        expect(controller.chat.activeSession.value?.title).toBe('accendi la torcia')
    })

    /*
     * ⛔ IL VERSO CONTRARIO: una chat che ha già un nome non se lo fa cambiare
     * dal messaggio dopo. Senza questo, una guardia rotta al contrario —
     * rinominare sempre — passerebbe il test qui sopra.
     */
    it('⛔ una chat già intitolata NON viene rinominata dal messaggio dopo', async () => {
        const { deps, store } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const controller = createChatController({ ...deps, translate: talosTestT('it') })
        await controller.init()
        await controller.newSession()

        await controller.send('accendi la torcia')
        await controller.send('adesso spegnila')

        expect(controller.chat.activeSession.value?.title).toBe('accendi la torcia')
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

    it('P1-CTX-ISO-03 R8-A-SEND-01 rejects a second send while the first Library preflight is pending', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'preflight-file',
            display_name: 'preflight.md',
            media_type: 'text/markdown',
            size_bytes: 16,
            private_uri: 'talos-vault/files/preflight.md',
            status: 'available',
            trust: 'untrusted',
            sha256: 'c'.repeat(64),
            extracted_text: 'PREFLIGHT_SENTINEL',
            failure_code: null,
            metadata: { origin: 'uploaded' },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const listStarted = deferred()
        const releaseList = deferred()
        const listSummaries = chatRepository.listVaultFileSummaries.bind(chatRepository)
        vi.spyOn(chatRepository, 'listVaultFileSummaries').mockImplementationOnce(async () => {
            listStarted.resolve()
            await releaseList.promise
            return listSummaries()
        })
        const controller = createChatController(deps)
        await controller.init()

        const first = controller.send('first owner turn')
        await listStarted.promise
        const sendingDuringPreflight = controller.chat.state.sending
        const secondAccepted = await controller.send('must be rejected')
        releaseList.resolve()
        const firstAccepted = await first

        expect(sendingDuringPreflight).toBe(true)
        expect(firstAccepted).toBe(true)
        expect(secondAccepted).toBe(false)
        expect(controller.chat.messages.filter((message) => message.role === 'user').map((message) => message.content))
            .toEqual(['first owner turn'])
        expect(request.mock.calls.filter(([call]) => call.url.includes('/v1/messages'))).toHaveLength(1)
    })

    it('P1-CTX-ISO-04 R8-A-SEND-02 keeps a preflight send owned by its accepted session after navigation', async () => {
        const { deps, store, settings, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'session-owner-file',
            display_name: 'owner.md',
            media_type: 'text/markdown',
            size_bytes: 12,
            private_uri: 'talos-vault/files/owner.md',
            status: 'available',
            trust: 'untrusted',
            sha256: 'd'.repeat(64),
            extracted_text: 'OWNER_SENTINEL',
            failure_code: null,
            metadata: { origin: 'uploaded' },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const controller = createChatController(deps)
        await controller.init()
        await controller.newSession()
        const owner = controller.chat.activeSession.value!
        await controller.newSession()
        const destination = controller.chat.activeSession.value!
        await controller.selectSession(owner.id)

        const listStarted = deferred()
        const releaseList = deferred()
        const listSummaries = chatRepository.listVaultFileSummaries.bind(chatRepository)
        vi.spyOn(chatRepository, 'listVaultFileSummaries').mockImplementationOnce(async () => {
            listStarted.resolve()
            await releaseList.promise
            return listSummaries()
        })

        const pending = controller.send('belongs to owner')
        await listStarted.promise
        await controller.selectSession(destination.id)
        releaseList.resolve()
        await expect(pending).resolves.toBe(true)

        const ownerMessages = await chatRepository.listMessages(owner.id)
        const destinationMessages = await chatRepository.listMessages(destination.id)
        expect(ownerMessages.map((message) => message.content)).toEqual(['belongs to owner', 'pong'])
        expect(destinationMessages).toEqual([])
        expect(controller.chat.activeSession.value?.id).toBe(destination.id)
        expect(controller.chat.messages).toEqual([])
    })

    it('P1-CTX-ISO-04 binds tool execution and audit to the accepted session after navigation', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                return providerRound === 1
                    ? {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-owner-list',
                                name: 'library_list',
                                input: { origin: 'all', file_type: 'all', page_size: 20 },
                            }],
                        },
                    }
                    : {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'end_turn',
                            content: [{ type: 'text', text: 'owner tool complete' }],
                        },
                    }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })
        const controller = createChatController(deps)
        await controller.init()
        await controller.newSession()
        const owner = controller.chat.activeSession.value!
        await controller.newSession()
        const destination = controller.chat.activeSession.value!
        await controller.selectSession(owner.id)

        const listStarted = deferred()
        const releaseList = deferred()
        const listSummaries = chatRepository.listVaultFileSummaries.bind(chatRepository)
        vi.spyOn(chatRepository, 'listVaultFileSummaries').mockImplementationOnce(async () => {
            listStarted.resolve()
            await releaseList.promise
            return listSummaries()
        })

        const pending = controller.send('list files for owner')
        await listStarted.promise
        await controller.selectSession(destination.id)
        releaseList.resolve()
        await expect(pending).resolves.toBe(true)

        expect(await chatRepository.listSessionToolActivities(owner.id)).toEqual([
            expect.objectContaining({
                operation: 'tool.library_list',
                status: 'succeeded',
            }),
        ])
        expect(await chatRepository.listSessionToolActivities(destination.id)).toEqual([])
        expect((await chatRepository.listMessages(owner.id)).map((message) => message.content))
            .toEqual(['list files for owner', 'owner tool complete'])
        expect(await chatRepository.listMessages(destination.id)).toEqual([])
        expect(controller.chat.activeSession.value?.id).toBe(destination.id)
        expect(controller.chat.messages).toEqual([])
    })

    it('P1-CTX-COMPAT-10 P1-CTX-ISO-05 R8-A-SEND-03 freezes model and Library sources for the accepted send only', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        store.set('gemini', 'gemini-key')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'frozen-source',
            display_name: 'frozen.md',
            media_type: 'text/markdown',
            size_bytes: 13,
            private_uri: 'talos-vault/files/frozen.md',
            status: 'available',
            trust: 'untrusted',
            sha256: 'e'.repeat(64),
            extracted_text: 'FROZEN_SOURCE',
            failure_code: null,
            metadata: { origin: 'uploaded' },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const controller = createChatController(deps)
        await controller.init()
        await controller.selectModel('anthropic:claude-live')
        await controller.newSession()

        const listStarted = deferred()
        const releaseList = deferred()
        const listSummaries = chatRepository.listVaultFileSummaries.bind(chatRepository)
        vi.spyOn(chatRepository, 'listVaultFileSummaries').mockImplementationOnce(async () => {
            listStarted.resolve()
            await releaseList.promise
            return listSummaries()
        })

        const pending = controller.send('frozen model turn')
        await listStarted.promise
        await controller.selectModel('gemini:gemini-live')
        releaseList.resolve()
        await expect(pending).resolves.toBe(true)

        const anthropicCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        const geminiGenerationCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('gemini-live:'))
        expect(anthropicCalls).toHaveLength(1)
        expect(JSON.stringify(anthropicCalls[0]?.data)).toContain('FROZEN_SOURCE')
        expect(geminiGenerationCalls).toHaveLength(0)

        const persistedUser = controller.chat.messages.find((message) => message.role === 'user')
        expect(persistedUser).toMatchObject({
            content: 'frozen model turn',
            model_profile_id: 'anthropic:claude-live',
            metadata: {
                used_library: [
                    expect.objectContaining({ id: 'frozen-source', trust_level: 'untrusted' }),
                ],
            },
        })
        expect(controller.selectedModelId.value).toBe('gemini:gemini-live')
        expect(controller.chat.activeSession.value?.active_model_profile_id).toBe('gemini:gemini-live')
    })

    // F4 Memory station — active memories inject the desktop-identical
    // untrusted block into the PROVIDER payload only; the persisted message
    // stays verbatim, the disclosure lands in its metadata, and used
    // memories get their last_used_at touched.
    it('injects active memories as untrusted provider context with disclosure and touch', async () => {
        const { deps, store, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        await chatRepository.initialize()
        await chatRepository.createMemory({
            id: 'memory-tone',
            scope_type: 'global',
            scope_id: null,
            kind: 'preference',
            title: 'Tone',
            content: 'Prefer concise italian answers.',
            source: null,
            metadata: {},
            created_at: '2026-07-23T10:00:00.000Z',
        })
        await chatRepository.createMemory({
            id: 'memory-off',
            scope_type: 'global',
            scope_id: null,
            kind: 'project_fact',
            title: 'Disabled',
            content: 'Must never appear.',
            source: null,
            metadata: {},
            created_at: '2026-07-23T10:00:01.000Z',
        })
        await chatRepository.updateMemoryStatus('memory-off', 'disabled')

        const controller = createChatController(deps)
        await controller.init()
        await controller.send('Qual e il piano?')

        const providerCall = request.mock.calls.find(([call]) => call.url.includes('/v1/messages'))
        expect(providerCall).toBeDefined()
        const rawBody = providerCall![0].data
        const body = (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody) as {
            messages: Array<{ role: string; content: unknown }>
        }
        const lastUser = [...body.messages].reverse().find((entry) => entry.role === 'user')
        const payloadText = JSON.stringify(lastUser?.content)
        expect(payloadText).toContain('TALOS_MEMORY_CONTEXT')
        expect(payloadText).toContain('Prefer concise italian answers.')
        expect(payloadText).toContain('USER_TASK')
        expect(payloadText).not.toContain('Must never appear.')

        const persistedUser = controller.chat.messages.find((message) => message.role === 'user')
        expect(persistedUser?.content).toBe('Qual e il piano?')
        expect(persistedUser?.metadata?.used_memories).toEqual([
            expect.objectContaining({ id: 'memory-tone', trust_level: 'untrusted' }),
        ])

        const touched = (await chatRepository.listMemories()).find((entry) => entry.id === 'memory-tone')
        expect(touched?.last_used_at).not.toBeNull()
    })

    it('P1-CTX-COMPAT-05 injects uploaded Library text only and keeps the persisted user turn verbatim', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'uploaded-ambient',
            display_name: 'uploaded-ambient.md',
            media_type: 'text/markdown',
            size_bytes: 32,
            private_uri: 'talos-vault/files/uploaded-ambient.md',
            status: 'available',
            trust: 'untrusted',
            sha256: 'a'.repeat(64),
            extracted_text: 'UPLOADED_AMBIENT_SENTINEL',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-23T10:00:00.000Z',
        })
        await chatRepository.createVaultFile({
            id: 'generated-ambient',
            display_name: 'generated-ambient.md',
            media_type: 'text/markdown',
            size_bytes: 33,
            private_uri: 'talos-vault/files/generated-ambient.md',
            status: 'available',
            trust: 'untrusted',
            sha256: 'b'.repeat(64),
            extracted_text: 'GENERATED_AMBIENT_SENTINEL',
            failure_code: null,
            metadata: { origin: 'generated', library_shared: true },
            created_at: '2026-07-23T10:00:01.000Z',
        })

        const controller = createChatController(deps)
        await controller.init()
        await controller.send('Use only relevant context.')

        const providerCall = request.mock.calls.find(([call]) => call.url.includes('/v1/messages'))
        const providerBody = JSON.stringify(providerCall?.[0].data)
        expect(providerBody).toContain('UPLOADED_AMBIENT_SENTINEL')
        expect(providerBody).not.toContain('GENERATED_AMBIENT_SENTINEL')

        const persistedUser = controller.chat.messages.find((message) => message.role === 'user')
        expect(persistedUser?.content).toBe('Use only relevant context.')
        expect(persistedUser?.metadata?.used_library).toEqual([
            expect.objectContaining({
                id: 'uploaded-ambient',
                origin: 'uploaded',
                trust_level: 'untrusted',
            }),
        ])
    })

    it('P1-CTX-ISO-02 corrects one iTerm pivot from the immutable OmniRoute snapshot, then abstains', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: null,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                const text = providerRound === 1
                    ? 'OmniRouter può indicare più prodotti.'
                    : providerRound === 2
                        ? 'Il secondo è OmniRoute, il componente di routing.'
                        : providerRound === 4
                            ? 'OmniRoute coordina il routing coerente tra i servizi.'
                            : 'Dal documento caricato: iTerm può simulare una posizione con mock GPS.'
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('stream unavailable')))

        try {
            const controller = createChatController(deps)
            await controller.init()
            request.mockClear()
            await controller.send('Parlami di omnirouter')
            await controller.send('Il secondo')
            await createBroadAnswerGuardDocuments(chatRepository)

            await controller.send('Si spiegami')

            let providerCalls = request.mock.calls
                .map(([call]) => call)
                .filter((call) => call.url.includes('anthropic.com/v1/messages'))
            expect(providerCalls).toHaveLength(4)
            const firstGuardPayload = JSON.stringify(providerCalls[2]?.data.messages)
            expect(firstGuardPayload).toContain('OMNIROUTE_GUARD_SENTINEL')
            expect(firstGuardPayload).toContain('ITERM_GPS_GUARD_SENTINEL')
            expect(firstGuardPayload.indexOf('Same-session user topic anchor'))
                .toBeLessThan(firstGuardPayload.indexOf('LIBRARY DOC 1'))
            expect(firstGuardPayload.indexOf('LIBRARY DOC 1'))
                .toBeLessThan(firstGuardPayload.lastIndexOf('USER_TASK'))
            expect(providerCalls[3]?.data).not.toHaveProperty('tools')
            const firstMessages = providerCalls[2]?.data.messages as unknown[]
            const correctionMessages = providerCalls[3]?.data.messages as unknown[]
            expect(correctionMessages).toHaveLength(firstMessages.length)
            expect(correctionMessages.slice(0, -1)).toEqual(firstMessages.slice(0, -1))
            const correctionPayload = JSON.stringify(correctionMessages)
            expect(correctionPayload).toContain('TALOS_LIBRARY_TOPIC_CORRECTION')
            expect(correctionPayload).toContain('OMNIROUTE_GUARD_SENTINEL')
            expect(correctionPayload).toContain('ITERM_GPS_GUARD_SENTINEL')

            let assistant = controller.chat.messages
                .filter((message) => message.role === 'assistant')
                .at(-1)
            expect(assistant?.content).toContain('OmniRoute')
            expect(assistant?.content).not.toContain('iTerm')
            expect(assistant?.metadata.library_answer_guard).toMatchObject({
                contract: 'talos.library-answer-guard/1',
                outcome: 'corrected',
                correction_attempts: 1,
                first_draft_score: 0,
            })
            expect((assistant?.metadata.library_answer_guard as { correction_score: number })
                .correction_score).toBeGreaterThan(0)

            await controller.send('E poi?')

            providerCalls = request.mock.calls
                .map(([call]) => call)
                .filter((call) => call.url.includes('anthropic.com/v1/messages'))
            expect(providerCalls).toHaveLength(6)
            expect(providerCalls[5]?.data).not.toHaveProperty('tools')
            assistant = controller.chat.messages
                .filter((message) => message.role === 'assistant')
                .at(-1)
            expect(assistant?.content).toBe(
                'I could not produce a reliable answer that stayed on the current conversation topic. '
                + 'Please rephrase the question or name the source to use.',
            )
            expect(assistant?.metadata.library_answer_guard).toMatchObject({
                contract: 'talos.library-answer-guard/1',
                outcome: 'abstained',
                correction_attempts: 1,
                first_draft_score: 0,
                correction_score: 0,
            })
        } finally {
            vi.unstubAllGlobals()
        }
    }, 20_000)

    it('P1-CTX-ISO-07 never adds inference after a relevant answer or an executed tool action', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: null,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (!url.includes('anthropic.com/v1/messages')) {
                return { status: 500, data: { error: { message: 'unexpected test request' } } }
            }
            providerRound += 1
            if (providerRound === 4) {
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'tool_use',
                        content: [{
                            type: 'tool_use',
                            id: 'toolu-guard-time',
                            name: 'time_now',
                            input: {},
                        }],
                    },
                }
            }
            const text = providerRound === 1
                ? 'OmniRouter può indicare più prodotti.'
                : providerRound === 2
                    ? 'Il secondo è OmniRoute.'
                    : providerRound === 3
                        ? 'OmniRoute coordina il routing tra servizi.'
                        : 'iTerm e mock GPS sono un altro argomento.'
            return {
                status: 200,
                data: {
                    model: 'claude-live',
                    stop_reason: 'end_turn',
                    content: [{ type: 'text', text }],
                },
            }
        })
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('stream unavailable')))

        try {
            const controller = createChatController(deps)
            await controller.init()
            request.mockClear()
            await controller.send('Parlami di omnirouter')
            await controller.send('Il secondo')
            await createBroadAnswerGuardDocuments(chatRepository)

            await controller.send('Si spiegami')
            expect(providerRound).toBe(3)
            expect(controller.chat.messages.filter((message) => message.role === 'assistant').at(-1)
                ?.metadata.library_answer_guard).toBeUndefined()

            await controller.send('E a che ora?')
            expect(providerRound).toBe(5)
            const activity = await chatRepository.listSessionToolActivities(
                controller.chat.activeSession.value!.id,
            )
            expect(activity.filter((entry) => entry.operation === 'tool.time_now'))
                .toHaveLength(1)
        } finally {
            vi.unstubAllGlobals()
        }
    }, 20_000)

    it('P1-CTX-ISO-07 exposes a failed guarded stream once and never corrects after its partial', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: null,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (!url.includes('anthropic.com/v1/messages')) {
                return { status: 500, data: { error: { message: 'unexpected test request' } } }
            }
            providerRound += 1
            return {
                status: 200,
                data: {
                    model: 'claude-live',
                    stop_reason: 'end_turn',
                    content: [{
                        type: 'text',
                        text: providerRound === 1
                            ? 'OmniRouter può indicare più prodotti.'
                            : 'Il secondo è OmniRoute.',
                    }],
                },
            }
        })
        let guardedStream = false
        let guardedFetches = 0
        const encoder = new TextEncoder()
        vi.stubGlobal('fetch', vi.fn(async () => {
            if (!guardedStream) throw new TypeError('stream unavailable')
            guardedFetches += 1
            let emitted = false
            return new Response(new ReadableStream<Uint8Array>({
                pull(controller) {
                    if (!emitted) {
                        emitted = true
                        controller.enqueue(encoder.encode(
                            'data: {"type":"content_block_delta","delta":'
                            + '{"type":"text_delta","text":"Risposta parziale iTerm"}}\n\n',
                        ))
                        return
                    }
                    controller.error(new Error('connection reset'))
                },
            }), {
                status: 200,
                headers: { 'content-type': 'text/event-stream' },
            })
        }))

        try {
            const controller = createChatController(deps)
            await controller.init()
            request.mockClear()
            await controller.send('Parlami di omnirouter')
            await controller.send('Il secondo')
            await createBroadAnswerGuardDocuments(chatRepository)

            guardedStream = true
            await controller.send('Si spiegami')

            expect(guardedFetches).toBe(1)
            expect(providerRound).toBe(2)
            const assistant = controller.chat.messages
                .filter((message) => message.role === 'assistant')
                .at(-1)
            expect(assistant?.content).toBe('Risposta parziale iTerm')
            expect(assistant?.metadata.interrupted).toBe(true)
            expect(assistant?.metadata.library_answer_guard).toBeUndefined()
        } finally {
            vi.unstubAllGlobals()
        }
    }, 20_000)

    it('P1-CTX-ISO-07 never corrects a guarded request after the user aborts it', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: null,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (!url.includes('anthropic.com/v1/messages')) {
                return { status: 500, data: { error: { message: 'unexpected test request' } } }
            }
            providerRound += 1
            return {
                status: 200,
                data: {
                    model: 'claude-live',
                    stop_reason: 'end_turn',
                    content: [{
                        type: 'text',
                        text: providerRound === 1
                            ? 'OmniRouter può indicare più prodotti.'
                            : 'Il secondo è OmniRoute.',
                    }],
                },
            }
        })
        let guardedStream = false
        let guardedFetches = 0
        const streamStarted = deferred()
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            if (!guardedStream) throw new TypeError('stream unavailable')
            guardedFetches += 1
            return new Response(new ReadableStream<Uint8Array>({
                start(controller) {
                    streamStarted.resolve()
                    init?.signal?.addEventListener('abort', () => {
                        controller.error(new DOMException('Aborted', 'AbortError'))
                    }, { once: true })
                },
            }), {
                status: 200,
                headers: { 'content-type': 'text/event-stream' },
            })
        }))

        try {
            const controller = createChatController(deps)
            await controller.init()
            request.mockClear()
            await controller.send('Parlami di omnirouter')
            await controller.send('Il secondo')
            await createBroadAnswerGuardDocuments(chatRepository)

            guardedStream = true
            const sending = controller.send('Si spiegami')
            await streamStarted.promise
            controller.chat.stopStreaming()
            await sending

            expect(guardedFetches).toBe(1)
            expect(providerRound).toBe(2)
            expect(controller.chat.state.sending).toBe(false)
            expect(controller.chat.messages
                .filter((message) => message.role === 'system')
                .map((message) => message.content)).toEqual([])
        } finally {
            vi.unstubAllGlobals()
        }
    }, 20_000)

    it('P1-CTX-SMART-01 applies one turn override once, then restores broad compatibility', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: {
                    schema_version: 1,
                    revision: 4,
                    enabled: true,
                    mode: 'broad_compat_v1',
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: '2026-07-29T10:00:00.000Z',
                },
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'smart-omniroute',
            display_name: 'Contratto OmniRoute.md',
            media_type: 'text/markdown',
            size_bytes: 64,
            private_uri: 'talos-vault/files/smart-omniroute.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '1'.repeat(64),
            extracted_text: 'OMNIROUTE_SENTINEL Il contratto OmniRoute scade nel marzo 2027.',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        await chatRepository.createVaultFile({
            id: 'smart-garden',
            display_name: 'Garden notes.md',
            media_type: 'text/markdown',
            size_bytes: 64,
            private_uri: 'talos-vault/files/smart-garden.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '2'.repeat(64),
            extracted_text: 'GARDEN_SENTINEL Water the basil every morning.',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T10:00:01.000Z',
        })
        const controller = createChatController(deps)
        await controller.init()
        request.mockClear()

        await controller.send('Quando scade OmniRoute?', {
            mode: 'smart_relevant_v1',
        })
        await controller.send('Second broad turn')

        const providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(JSON.stringify(providerCalls[0]?.data)).toContain('OMNIROUTE_SENTINEL')
        expect(JSON.stringify(providerCalls[0]?.data)).not.toContain('GARDEN_SENTINEL')
        expect(JSON.stringify(providerCalls[1]?.data)).toContain('OMNIROUTE_SENTINEL')
        expect(JSON.stringify(providerCalls[1]?.data)).toContain('GARDEN_SENTINEL')

        const users = controller.chat.messages.filter((message) => message.role === 'user')
        expect(users[0]?.metadata.library_context_receipt).toMatchObject({
            mode: 'smart_relevant_v1',
            candidate_file_ids: ['smart-omniroute'],
            transmitted_file_ids: ['smart-omniroute'],
        })
        expect(users[1]?.metadata.library_context_receipt).toMatchObject({
            mode: 'broad_compat_v1',
            candidate_file_ids: expect.arrayContaining(['smart-omniroute', 'smart-garden']),
        })
    })

    it('P1-CTX-ASK-01/02 yields a durable nonblocking checkpoint before ambient egress', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        const policy = {
            schema_version: 1 as const,
            revision: 1,
            enabled: true,
            mode: 'ask_before_use_v1' as const,
            included_file_ids: [],
            excluded_file_ids: [],
            updated_at: '2026-07-29T10:00:00.000Z',
        }
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: policy,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'consent-omniroute',
            display_name: 'OmniRoute renewal.md',
            media_type: 'text/markdown',
            size_bytes: 48,
            private_uri: 'talos-vault/files/consent-omniroute.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '3'.repeat(64),
            extracted_text: 'CONSENT_SENTINEL OmniRoute renewal is March 2027.',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const controller = createChatController(deps)
        await controller.init()
        request.mockClear()

        const sending = controller.send('When is OmniRoute renewed?')
        await vi.waitFor(
            () => expect(controller.pendingToolAuthorizations.value).toHaveLength(1),
            { timeout: 10_000, interval: 20 },
        )
        await expect(sending).resolves.toBe(true)

        expect(request.mock.calls.filter(
            ([call]) => call.url.includes('anthropic.com/v1/messages'),
        )).toHaveLength(0)
        expect(controller.chat.state.sending).toBe(false)
        expect(controller.pendingToolAuthorizations.value[0]).toMatchObject({
            tool: 'library_read',
            actions: ['read'],
            allow_persistent: true,
            input: {
                contract: 'talos.library-context-consent/1',
                mode: 'ask_before_use_v1',
                candidate_file_ids: ['consent-omniroute'],
                candidate_names: ['OmniRoute renewal.md'],
            },
        })
        expect(JSON.stringify(controller.pendingToolAuthorizations.value[0]?.input))
            .not.toContain('CONSENT_SENTINEL')
        expect(controller.chat.messages.find((message) => message.role === 'user')
            ?.metadata.library_context_receipt).toMatchObject({
                reason: 'awaiting_consent',
                candidate_file_ids: ['consent-omniroute'],
                transmitted_file_ids: [],
            })

        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'allow_once',
        )

        expect(controller.pendingToolAuthorizations.value).toEqual([])
        const consentedProviderCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(consentedProviderCalls).toHaveLength(1)
        expect(JSON.stringify(consentedProviderCalls[0]?.data)).toContain('CONSENT_SENTINEL')
        expect(controller.chat.messages.filter((message) => message.role === 'assistant').at(-1)
            ?.metadata.library_context_receipt).toMatchObject({
                reason: 'consent_granted',
                transmitted_file_ids: ['consent-omniroute'],
            })

        policy.mode = 'agentic_on_demand_v1'
        policy.revision = 2
        await controller.send('Use tools only')

        const providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(JSON.stringify(providerCalls[1]?.data)).not.toContain('CONSENT_SENTINEL')
        expect((providerCalls[1]?.data.tools as Array<{ name: string }>).map((tool) => tool.name))
            .toContain('library_search')

        const users = controller.chat.messages.filter((message) => message.role === 'user')
        expect(users[0]?.metadata.library_context_receipt).toMatchObject({
            reason: 'awaiting_consent',
            candidate_file_ids: ['consent-omniroute'],
            transmitted_file_ids: [],
        })
        expect(users[1]?.metadata.library_context_receipt).toMatchObject({
            reason: 'agentic_on_demand',
            candidate_file_ids: [],
            transmitted_file_ids: [],
        })
    }, 15_000)

    /**
     * I-01. A send builds `sendRuntime` once, and then `effectiveLibraryRuntime`
     * on top of it as consent and turn-scoped policy are resolved. The provider
     * call uses the effective one — correctly. But the checkpoints created LATER
     * in the same send serialised `sendRuntime`, the snapshot from before any of
     * that happened.
     *
     * So: ask-mode, the user taps "Allow once", the answer comes back with a
     * save marker, and the second checkpoint records a runtime that says consent
     * was never granted. Resume from it and the Library consent is demanded
     * again for a decision the user already made a moment ago — or the
     * checkpoint is refused outright as inconsistent.
     *
     * What is serialised has to be what was actually in force.
     */
    it('I-01 a second checkpoint in the same send keeps the consent already granted', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: {
                    schema_version: 1 as const,
                    revision: 1,
                    enabled: true,
                    mode: 'ask_before_use_v1' as const,
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: '2026-07-29T10:00:00.000Z',
                },
                // The second checkpoint of the send comes from this path.
                library_autosave_generated: true,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'i01-omniroute',
            display_name: 'OmniRoute renewal.md',
            media_type: 'text/markdown',
            size_bytes: 48,
            private_uri: 'talos-vault/files/i01-omniroute.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '7'.repeat(64),
            extracted_text: 'I01_SENTINEL OmniRoute renewal is March 2027.',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const base = attachmentRuntime(chatRepository).vault
        deps.vaultService = { ...base, createGenerated: vi.fn(async () => { throw new Error('not reached') }) }
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return { status: 200, data: { data: [{ id: 'claude-live', display_name: 'Claude Live' }], has_more: false } }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{
                            type: 'text',
                            text: 'Renewal noted.\n[TALOS_SAVE_LIBRARY:Renewal.md]\nMarch 2027.\n[/TALOS_SAVE_LIBRARY]',
                        }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const controller = createChatController(deps)
        await controller.init()
        const sessionId = controller.chat.activeSession.value?.id as string

        // First checkpoint: the Library wants consent before any body egresses.
        const sending = controller.send('When is OmniRoute renewed?')
        await vi.waitFor(
            () => expect(controller.pendingToolAuthorizations.value).toHaveLength(1),
            { timeout: 10_000, interval: 20 },
        )
        await expect(sending).resolves.toBe(true)
        expect(controller.pendingToolAuthorizations.value[0]?.tool).toBe('library_read')

        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'allow_once',
        )

        // Second checkpoint: the generated file wants a write authorization.
        await vi.waitFor(
            () => expect(controller.pendingToolAuthorizations.value).toHaveLength(1),
            { timeout: 10_000, interval: 20 },
        )
        expect(controller.pendingToolAuthorizations.value[0]?.tool).toBe('document_create')

        // The consent granted moments ago has to be inside the record that will
        // be resumed, or resuming asks for it a second time.
        const activities = await chatRepository.listSessionToolActivities(
            controller.chat.activeSession.value?.id as string,
        )
        const second = activities
            .filter((activity) => activity.operation === 'tool.authorization')
            .map((activity) => (activity.payload as { checkpoint?: { runtime?: Record<string, unknown> } })?.checkpoint)
            .filter((checkpoint): checkpoint is { runtime?: Record<string, unknown> } => !!checkpoint)
            .at(-1)
        expect(second?.runtime?.libraryConsentGranted).toBe(true)
    }, 20_000)

    /**
     * I-04. Revoking the saved Library permission takes effect on the NEXT send
     * — that is already covered. What was not covered is revoking it DURING one.
     *
     * The consent is resolved once, near the start of the send. The document
     * bodies leave much later, after several awaits on encrypted storage. The
     * live re-check before egress looks at the master switch and at each file's
     * own sharing flag, but never back at the grant that authorised the read in
     * the first place. So a user who opens Settings and revokes while an answer
     * is in flight watches the document go out anyway.
     *
     * The resolver already carries the right intent — its own comment says
     * "Removing the Settings grant must take effect even while a continuation is
     * queued." It just was not consulted a second time.
     *
     * A one-time "allow" is deliberately NOT revoked this way: it is bound to
     * that exact call and the user made it seconds ago. Only the standing
     * permission is re-read, because that is the one they just withdrew.
     */
    it('I-04 revoking the saved permission mid-send stops the document body', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: {
                    schema_version: 1,
                    revision: 1,
                    enabled: true,
                    mode: 'ask_before_use_v1',
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: '2026-07-29T10:00:00.000Z',
                },
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'toctou-omniroute',
            display_name: 'OmniRoute toctou.md',
            media_type: 'text/markdown',
            size_bytes: 48,
            private_uri: 'talos-vault/files/toctou-omniroute.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '9'.repeat(64),
            extracted_text: 'TOCTOU_SENTINEL renewal is March 2027.',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const controller = createChatController(deps)
        await controller.init()

        // Earn the standing permission the honest way.
        await controller.send('When is OmniRoute renewed?')
        expect(controller.pendingToolAuthorizations.value).toHaveLength(1)
        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'always_allow',
        )
        expect(settings.state.tool_authorizations.grants.library_read)
            .toMatchObject({ actions: ['read'] })
        request.mockClear()

        // Hold the send open inside the encrypted read that precedes egress.
        const realGetVaultFile = chatRepository.getVaultFile.bind(chatRepository)
        let holding!: () => void
        const held = new Promise<void>((resolve) => { holding = resolve })
        let reachedRead!: () => void
        const atRead = new Promise<void>((resolve) => { reachedRead = resolve })
        // Read 1 is the selection pass; read 2 is the live re-check immediately
        // before the bodies egress. Only the second one is the window that
        // matters — blocking the first would merely re-run the consent question
        // and prove nothing.
        let reads = 0
        chatRepository.getVaultFile = (async (id: string) => {
            reads += 1
            if (reads === 2) {
                reachedRead()
                await held
            }
            return realGetVaultFile(id)
        }) as typeof chatRepository.getVaultFile

        const sending = controller.send('Verify OmniRoute once more')
        await atRead

        // The user withdraws the permission while the answer is in flight.
        await settings.revokeToolAuthorization('library_read')
        holding()
        await sending

        const providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(providerCalls).toHaveLength(1)
        // Not one byte of the document may have left after the revocation.
        expect(JSON.stringify(providerCalls[0]?.data)).not.toContain('TOCTOU_SENTINEL')
    }, 20_000)

    /**
     * I-03, end to end. `text_preview` is the first 600 characters of a
     * document. Candidate selection scored that preview, so a file whose match
     * sat further in was dropped before its full text was ever read — and the
     * user was told TALOS could not find something the file plainly says.
     *
     * The owner would meet this the moment a document had any preamble.
     */
    it('I-03 finds a file whose match sits past the preview window', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: {
                    schema_version: 1,
                    revision: 1,
                    enabled: true,
                    // Smart mode is where it shows: broad injects everything that
                    // fits regardless of score, so it hides the recall defect.
                    mode: 'smart_relevant_v1',
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: '2026-07-29T10:00:00.000Z',
                },
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'deep-preview-file',
            display_name: 'notes.md',
            media_type: 'text/markdown',
            size_bytes: 4_000,
            private_uri: 'talos-vault/files/deep-preview-file.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '4'.repeat(64),
            // Nothing identifying in the first 600 characters. The name is
            // generic too, so the filename cannot rescue the match.
            extracted_text: `${'Preamble and boilerplate. '.repeat(60)}OMNIROUTE renewal is March 2027.`,
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const controller = createChatController(deps)
        await controller.init()
        request.mockClear()

        await controller.send('When is OMNIROUTE renewed?')

        const providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(providerCalls).toHaveLength(1)
        expect(JSON.stringify(providerCalls[0]?.data)).toContain('OMNIROUTE renewal is March 2027')
    }, 20_000)

    /**
     * I-11. Permitting cleartext is a manifest switch and it is all-or-nothing:
     * Android's network security config matches host NAMES, so "private ranges
     * only" cannot be written there. The narrowing therefore has to hold in the
     * app — and TALOS is distributed, so this rule protects other people's
     * phones, not one developer's.
     *
     * It belongs here rather than in the settings panel: the panel is one
     * caller, and a guard that only lives in a form is a guard the next caller
     * walks around.
     */
    it('I-11 refuses a cleartext endpoint that is not on the local network', async () => {
        const { deps } = makeDeps()
        const setEndpoint = vi.fn(deps.setEndpoint)
        deps.setEndpoint = setEndpoint
        const controller = createChatController(deps)
        await controller.init()

        // The Ollama case: a private literal, which is the whole point.
        await expect(controller.saveEndpoint('ollama', 'http://192.168.1.20:11434'))
            .resolves.toBeUndefined()
        expect(setEndpoint).toHaveBeenCalledWith('ollama', 'http://192.168.1.20:11434')

        // A name is refused however local it sounds: it is resolved later, by
        // someone else, and can answer with a public address.
        await expect(controller.saveEndpoint('ollama', 'http://ollama.lan:11434'))
            .rejects.toThrow(/TALOS_ENDPOINT_CLEARTEXT_PUBLIC/)
        // A public address in the clear, refused outright.
        await expect(controller.saveEndpoint('openai', 'http://93.184.216.34/v1'))
            .rejects.toThrow(/TALOS_ENDPOINT_CLEARTEXT_PUBLIC/)
        // Credentials in the URL leak into logs, diagnostics and redirects.
        await expect(controller.saveEndpoint('openai', 'https://user:pass@api.example.com'))
            .rejects.toThrow(/TALOS_ENDPOINT_CREDENTIALS/)
        // And nothing is stored for any of the refusals.
        expect(setEndpoint).toHaveBeenCalledTimes(1)

        // HTTPS anywhere stays fine.
        await expect(controller.saveEndpoint('openai', 'https://api.example.com/v1'))
            .resolves.toBeUndefined()
    }, 20_000)

    it('P1-CTX-ASK-03 honors persistent consent, revocation, and denial without body drift', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: {
                    schema_version: 1,
                    revision: 1,
                    enabled: true,
                    mode: 'ask_before_use_v1',
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: '2026-07-29T10:00:00.000Z',
                },
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'persistent-omniroute',
            display_name: 'OmniRoute persistent.md',
            media_type: 'text/markdown',
            size_bytes: 48,
            private_uri: 'talos-vault/files/persistent-omniroute.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '5'.repeat(64),
            extracted_text: 'PERSISTENT_CONSENT_SENTINEL renewal is March 2027.',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const controller = createChatController(deps)
        await controller.init()
        request.mockClear()

        await controller.send('When is OmniRoute renewed?')
        expect(controller.pendingToolAuthorizations.value).toHaveLength(1)
        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'always_allow',
        )

        expect(settings.state.tool_authorizations.grants.library_read).toMatchObject({
            actions: ['read'],
            scope: 'device',
        })
        expect(controller.pendingToolAuthorizations.value).toEqual([])
        await controller.send('Please verify OmniRoute again')
        expect(controller.pendingToolAuthorizations.value).toEqual([])

        let providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(providerCalls).toHaveLength(2)
        expect(providerCalls.every(
            (call) => JSON.stringify(call.data).includes('PERSISTENT_CONSENT_SENTINEL'),
        )).toBe(true)

        await settings.revokeToolAuthorization('library_read')
        await controller.send('One final OmniRoute check')
        expect(controller.pendingToolAuthorizations.value).toHaveLength(1)
        providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(providerCalls).toHaveLength(2)

        const revoked = await chatRepository.getVaultFile('persistent-omniroute')
        await chatRepository.updateVaultFile('persistent-omniroute', {
            metadata: { ...revoked!.metadata, library_shared: false },
        })
        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'allow_once',
        )
        providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(providerCalls).toHaveLength(3)
        expect(JSON.stringify(providerCalls[2]?.data))
            .not.toContain('PERSISTENT_CONSENT_SENTINEL')
        expect(controller.chat.messages.filter((message) => message.role === 'assistant').at(-1)
            ?.metadata.library_context_receipt).toMatchObject({
                reason: 'consent_granted',
                candidate_file_ids: ['persistent-omniroute'],
                transmitted_file_ids: [],
            })

        await chatRepository.updateVaultFile('persistent-omniroute', {
            metadata: { ...revoked!.metadata, library_shared: true },
        })
        await controller.send('Deny this OmniRoute check')
        expect(controller.pendingToolAuthorizations.value).toHaveLength(1)
        await controller.decideToolAuthorization(
            controller.pendingToolAuthorizations.value[0]!.request_id,
            'deny',
        )
        providerCalls = request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(providerCalls).toHaveLength(4)
        expect(JSON.stringify(providerCalls[3]?.data))
            .not.toContain('PERSISTENT_CONSENT_SENTINEL')
        expect(controller.chat.messages.filter((message) => message.role === 'assistant').at(-1)
            ?.metadata.library_context_receipt).toMatchObject({
                reason: 'awaiting_consent',
                candidate_file_ids: ['persistent-omniroute'],
                transmitted_file_ids: [],
            })
    }, 15_000)

    it('P1-CTX-COMPAT-07 rechecks file revocation before egress and persists actual transmission', async () => {
        const { deps, store, settings, request, chatRepository } = makeDeps()
        store.set('anthropic', 'sk-ant')
        Object.assign(settings.state, {
            shell: {
                library_context_enabled: true,
                library_context_policy: null,
                library_autosave_generated: false,
                debug_diagnostics: false,
            },
        })
        await chatRepository.initialize()
        await chatRepository.createVaultFile({
            id: 'late-revoked',
            display_name: 'late-revoked.md',
            media_type: 'text/markdown',
            size_bytes: 32,
            private_uri: 'talos-vault/files/late-revoked.md',
            status: 'available',
            trust: 'untrusted',
            sha256: '4'.repeat(64),
            extracted_text: 'LATE_REVOKED_SENTINEL',
            failure_code: null,
            metadata: { origin: 'uploaded', library_shared: true },
            created_at: '2026-07-29T10:00:00.000Z',
        })
        const original = chatRepository.getVaultFile.bind(chatRepository)
        let reads = 0
        vi.spyOn(chatRepository, 'getVaultFile').mockImplementation(async (fileId) => {
            const snapshot = await original(fileId)
            reads += 1
            if (reads === 1 && snapshot) {
                await chatRepository.updateVaultFile(fileId, {
                    metadata: { ...snapshot.metadata, library_shared: false },
                })
            }
            return snapshot
        })
        const controller = createChatController(deps)
        await controller.init()
        request.mockClear()

        await controller.send('Use the late document')

        const providerCall = request.mock.calls
            .map(([call]) => call)
            .find((call) => call.url.includes('anthropic.com/v1/messages'))
        expect(JSON.stringify(providerCall?.data)).not.toContain('LATE_REVOKED_SENTINEL')
        const user = controller.chat.messages.find((message) => message.role === 'user')
        const assistant = controller.chat.messages.find((message) => message.role === 'assistant')
        expect(user?.metadata.library_context_receipt).toMatchObject({
            candidate_file_ids: ['late-revoked'],
            transmitted_file_ids: ['late-revoked'],
        })
        expect(assistant?.metadata.library_context_receipt).toMatchObject({
            candidate_file_ids: ['late-revoked'],
            transmitted_file_ids: [],
        })
    })

    it('P1-CTX-COMPAT-08 reconciles the Vault and sends a granted attachment through the durable provider pipeline', async () => {
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
            // Rolling cache breakpoint on the last cacheable block — the whole
            // point of it is that it rides the real send path.
            {
                type: 'text',
                text: '[Untrusted attachment: brief.txt]\nVerified attachment body',
                cache_control: { type: 'ephemeral' },
            },
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

    it('WEB-LIB-07 keeps a typoed search-only journey in Sources and Library after reload', async () => {
        const { deps, store, settings, chatRepository, request } = makeDeps()
        store.set('anthropic', 'sk-ant')
        settings.state.search.source = 'tavily'
        settings.state.tools.outbound = 'allow'
        settings.state.tools.write = 'allow'
        webSearchRuntime.runTalosSearch.mockResolvedValueOnce([
            {
                url: 'https://example.com/luxury#services',
                title: 'Luxury Italia',
                snippet: 'Yacht, ville e supercar.',
                publishedAt: '2026-07-20',
            },
            {
                url: 'https://concierge.example/offerta',
                title: 'Concierge Italia',
                snippet: 'Elicotteri e jet.',
                publishedAt: null,
            },
        ])

        let providerRound = 0
        request.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('anthropic.com/v1/models')) {
                return {
                    status: 200,
                    data: {
                        data: [{ id: 'claude-live', display_name: 'Claude Live' }],
                        has_more: false,
                    },
                }
            }
            if (url.includes('anthropic.com/v1/messages')) {
                providerRound += 1
                if (providerRound === 1) {
                    return {
                        status: 200,
                        data: {
                            model: 'claude-live',
                            stop_reason: 'tool_use',
                            content: [{
                                type: 'tool_use',
                                id: 'toolu-web-1',
                                name: 'web_search',
                                input: { query: 'aziende di lusso in italia' },
                            }],
                        },
                    }
                }
                return {
                    status: 200,
                    data: {
                        model: 'claude-live',
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'Ho trovato due aziende.' }],
                    },
                }
            }
            return { status: 500, data: { error: { message: 'unexpected test request' } } }
        })

        const vaultFiles: TalosLocalVaultFile[] = []
        const createGenerated = vi.fn(async (input: {
            name: string
            mediaType: string
            text: string
            kind?: 'document' | 'web_source'
            sourceUrl?: string | null
            sourceLinks?: readonly Array<{ url: string; title: string }>
        }, originSessionId: string | null = null) => {
            const createdAt = '2026-07-28T10:00:00.000Z'
            const file: TalosLocalVaultFile = {
                id: 'search-dossier-1',
                display_name: input.name,
                media_type: input.mediaType,
                size_bytes: input.text.length,
                private_uri: 'talos-vault/files/search-dossier-1.md',
                status: 'available',
                trust: 'untrusted',
                sha256: 'a'.repeat(64),
                extracted_text: input.text,
                failure_code: null,
                metadata: {
                    origin: 'generated',
                    origin_session_id: originSessionId,
                    kind: input.kind ?? 'document',
                    ...(input.sourceUrl ? { source_url: input.sourceUrl } : {}),
                    ...(input.sourceLinks?.length ? { source_links: input.sourceLinks } : {}),
                },
                created_at: createdAt,
                updated_at: createdAt,
            }
            vaultFiles.push(file)
            return {
                file,
                grant: {
                    id: 'grant-search-1',
                    vault_file_id: file.id,
                    permissions: ['browser.upload', 'model.read'] as Array<'browser.upload' | 'model.read'>,
                    status: 'active' as const,
                    label: file.display_name,
                    created_at: createdAt,
                    updated_at: createdAt,
                    revoked_at: null,
                },
            }
        })
        const vaultService: TalosVaultService = {
            ingest: vi.fn(),
            createGenerated,
            createGeneratedBinary: vi.fn(),
            createGrant: vi.fn(),
            revokeGrant: vi.fn().mockResolvedValue(undefined),
            resolveMessageParts: vi.fn().mockResolvedValue([]),
            readFilePreview: vi.fn().mockResolvedValue(null),
            readFileText: vi.fn().mockResolvedValue(null),
            listFiles: vi.fn(async () => vaultFiles.slice()),
            listSummaries: vi.fn(async () => vaultFiles.slice()),
            setFileShared: vi.fn().mockResolvedValue(undefined),
            deleteFile: vi.fn().mockResolvedValue(undefined),
            reconcilePending: vi.fn().mockResolvedValue(undefined),
        }
        const controller = createChatController({
            ...deps,
            filePicker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vaultService,
        })
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('Failed to fetch')
        }))

        try {
            await controller.init()
            await controller.send('fai una ricerca weeb delle aziende in italia con yacht auto e ville')

            expect(webSearchRuntime.runTalosSearch).toHaveBeenCalledWith(
                'tavily',
                expect.any(Object),
                'aziende di lusso in italia',
                5,
            )
            expect(createGenerated).toHaveBeenCalledWith(expect.objectContaining({
                kind: 'web_source',
                sourceLinks: [
                    { url: 'https://example.com/luxury', title: 'Luxury Italia' },
                    { url: 'https://concierge.example/offerta', title: 'Concierge Italia' },
                ],
            }), expect.objectContaining({ sessionId: expect.any(String), toolName: 'web_search' }))
            expect(controller.attachments.vaultFiles).toEqual([
                expect.objectContaining({ id: 'search-dossier-1' }),
            ])
            const answer = controller.chat.messages.findLast((message) => message.role === 'assistant')
            expect(answer?.metadata.sources).toEqual([
                expect.objectContaining({ url: 'https://example.com/luxury' }),
                expect.objectContaining({ url: 'https://concierge.example/offerta' }),
            ])

            const reloaded = createChatController({
                ...deps,
                filePicker: { pickFiles: vi.fn().mockResolvedValue([]) },
                vaultService,
            })
            await reloaded.init()
            const restored = reloaded.chat.messages.findLast((message) => message.role === 'assistant')
            expect(restored?.metadata.sources).toEqual(answer?.metadata.sources)
            expect(reloaded.attachments.vaultFiles).toEqual([
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        kind: 'web_source',
                        source_links: expect.arrayContaining([
                            expect.objectContaining({ url: 'https://example.com/luxury' }),
                        ]),
                    }),
                }),
            ])
        } finally {
            vi.unstubAllGlobals()
        }
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

/**
 * Owner 2026-08-04: «riprova prompt non re invia immagini o file allegati».
 *
 * Non era un caso limite: «Riprova» rimandava il SOLO testo, quindi su un
 * messaggio con una foto il modello riceveva la domanda senza la cosa di cui
 * parlava — e rispondeva comunque, che è il modo peggiore di fallire.
 */
describe('riprova e rinvia, con quello che c’era attaccato', () => {
    it('RESEND-ATT-01 rimanda il file insieme al testo', async () => {
        const { deps, store, chatRepository } = makeDeps()
        const runtime = attachmentRuntime(chatRepository)
        deps.filePicker = runtime.picker
        deps.vaultService = runtime.vault
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        await controller.attachments.selectFiles()
        await controller.send('Riassumi questo file')
        const original = controller.chat.messages.find((message) => message.role === 'user')!

        await controller.resendMessage(original.id)

        const rinviato = controller.chat.messages.filter((message) => message.role === 'user').at(-1)!
        expect(rinviato.id).not.toBe(original.id)
        const attaccati = await chatRepository.listMessageAttachments(rinviato.id)
        expect(attaccati).toEqual([expect.objectContaining({
            vault_file_id: 'vault-brief',
            grant_id: 'grant-brief',
        })])
    })

    it('RESEND-ATT-02 il legame è NUOVO, il file e il permesso sono gli stessi', async () => {
        /**
         * L'identificativo del legame è la chiave fra QUESTO messaggio e il
         * file: riusarla direbbe che i due messaggi sono lo stesso. Il permesso
         * invece è concesso al file, non al messaggio, quindi vale ancora.
         */
        const { deps, store, chatRepository } = makeDeps()
        const runtime = attachmentRuntime(chatRepository)
        deps.filePicker = runtime.picker
        deps.vaultService = runtime.vault
        store.set('anthropic', 'sk-ant')
        const controller = createChatController(deps)
        await controller.init()
        await controller.attachments.selectFiles()
        await controller.send('Riassumi questo file')
        const original = controller.chat.messages.find((message) => message.role === 'user')!
        const prima = await chatRepository.listMessageAttachments(original.id)

        await controller.resendMessage(original.id)
        const rinviato = controller.chat.messages.filter((message) => message.role === 'user').at(-1)!
        const dopo = await chatRepository.listMessageAttachments(rinviato.id)

        expect(dopo[0]!.id).not.toBe(prima[0]!.id)
        expect(dopo[0]!.grant_id).toBe(prima[0]!.grant_id)
    })

    /**
     * ⭐⭐⭐ UNA CAPACITA SPENTA SI DICE — se no il modello la INVENTA.
     *
     * Fotografato dall'owner il 2026-08-17, senza chiave di ricerca:
     *
     *   «non ho uno strumento di ricerca web semplice — l'unico modo che ho
     *    per cercare su internet e la deep research»
     *
     * E FALSO: `web_search` e `web_read` esistono, sono due dei 69 attrezzi.
     *
     * ⛔ Ma dal posto in cui sta il modello quella frase e ONESTA: senza motore
     * i due tool non vengono costruiti affatto, quindi non li vede. Non ha
     * allucinato — ha descritto un elenco vero e ne ha tratto la conclusione
     * sbagliata, perche nessuno gli aveva detto che l'assenza era una
     * CONFIGURAZIONE e non un limite.
     *
     * ⛔ E il danno non e la frase: e che la persona conclude «TALOS non sa
     * cercare» e smette di chiederglielo. Una capacita che c'e, persa per un
     * silenzio.
     */
    describe('⭐⭐⭐ la ricerca web spenta si DICE', () => {
        const sistemaDi = (request: { mock: { calls: [{ url: string, data: { system?: string } }][] } }) => request.mock.calls
            .map(([call]) => call)
            .filter((call) => call.url.includes('anthropic.com/v1/messages'))
            .map((call) => call.data.system ?? '')

        it('⛔⛔ senza motore, il modello SA che manca la chiave e dove si mette', async () => {
            const { deps, store } = makeDeps()
            store.set('anthropic', 'sk-ant')
            const controller = createChatController(deps)
            await controller.init()
            await controller.send('cerca sul web che tempo fa')

            const sistema = sistemaDi(deps.transport.request as never)[0] ?? ''
            expect(sistema).toContain('TALOS_WEB_SEARCH_NOT_CONFIGURED')
            // ⛔ E il DIVIETO, che e la meta che cura il difetto vero: senza,
            // il modello resta libero di dire «non ho la ricerca web».
            expect(sistema).toMatch(/do NOT say you have no web search/i)
            expect(sistema).toMatch(/Settings/i)
        })

        /*
         * ⛔ IL VERSO CONTRARIO, e non e un dettaglio: questa riga entra nel
         * PREFISSO CONGELATO, quello che paga il prefill una volta sola. Se
         * comparisse anche con la chiave configurata, sposterebbe il prefisso
         * di ogni messaggio di chi la ricerca ce l'ha — cioe farebbe pagare a
         * tutti la cura di pochi.
         */
        it('⛔⛔ ma col motore configurato NON compare, e il prefisso non si muove', async () => {
            const { deps, store } = makeDeps()
            store.set('anthropic', 'sk-ant')
            deps.settings.state.search.source = 'tavily'
            const controller = createChatController(deps)
            await controller.init()
            await controller.send('cerca sul web che tempo fa')

            const sistema = sistemaDi(deps.transport.request as never)[0] ?? ''
            expect(sistema).not.toContain('TALOS_WEB_SEARCH_NOT_CONFIGURED')
        })
    })
})

/**
 * §1-bis della consegna 0.1.18 — «serve il test che fallisce se qualcuno lo
 * scollega». Non basta che `qualifyBackend` esista sul lato nativo: se
 * `selectModel` smettesse di chiamare `offrireSondaggioSeLocale`, o se la
 * guardia sul consenso si rompesse, questi test lo dicono — non un grep sul
 * sorgente, la CHIAMATA vera attraverso `selectModel`.
 */
describe('il sondaggio GPU della 0.1.17, agganciato alla PRIMA scelta locale', () => {
    async function withLocalModelDiscovered() {
        const { deps } = makeDeps()
        const controller = createChatController(deps)
        localEngine.talosLocalInstalledModels.mockResolvedValueOnce({
            models: [
                { path: '/models/local-test/smollm2-135m.gguf', name: 'smollm2-135m.gguf', bytes: 270_885_952 },
            ],
            unreadable: [],
        })
        await controller.init()
        return { deps, controller }
    }

    it('offre la modale alla prima scelta esplicita, col percorso vero del GGUF', async () => {
        const { controller } = await withLocalModelDiscovered()
        expect(controller.pendingLocalEngineProbeConsent.value).toBeNull()

        await controller.selectModel('local:/models/local-test/smollm2-135m.gguf')

        expect(controller.pendingLocalEngineProbeConsent.value)
            .toEqual({ path: '/models/local-test/smollm2-135m.gguf' })
    })

    it('non la offre una seconda volta: il consenso non è più `unset` dopo la prima', async () => {
        const { deps, controller } = await withLocalModelDiscovered()
        await controller.selectModel('local:/models/local-test/smollm2-135m.gguf')
        await controller.decideLocalEngineProbeConsent('dismissed')
        // `dismissed` non scrive: il consenso resta `unset` di proposito.
        expect(deps.settings.state.local_engine_probe.consent).toBe('unset')

        await controller.selectModel('local:/models/local-test/smollm2-135m.gguf')

        expect(controller.pendingLocalEngineProbeConsent.value)
            .toEqual({ path: '/models/local-test/smollm2-135m.gguf' })
    })

    it('non la offre affatto per un modello remoto', async () => {
        const { deps, controller } = await withLocalModelDiscovered()
        await deps.setKey('anthropic', 'sk-ant')
        await controller.refreshProvider('anthropic')

        await controller.selectModel('anthropic:claude-live')

        expect(controller.pendingLocalEngineProbeConsent.value).toBeNull()
    })

    it("'granted' scrive il consenso e fa partire il sondaggio, senza farlo attendere", async () => {
        const { deps, controller } = await withLocalModelDiscovered()
        await controller.selectModel('local:/models/local-test/smollm2-135m.gguf')

        const decisione = controller.decideLocalEngineProbeConsent('granted')

        // ⛔ La chiusura della modale è SINCRONA rispetto al sondaggio: non si
        // aspetta il suo esito per richiudersi. È esattamente «non blocca la
        // chat» del §1-bis, verificato sull'ordine reale delle promesse.
        expect(controller.pendingLocalEngineProbeConsent.value).toBeNull()
        await decisione
        expect(deps.settings.state.local_engine_probe.consent).toBe('granted')
        // Il sondaggio parte da un `import()` dinamico — un giro di microtask
        // oltre `decisione`, non nello stesso tick — quindi si attende il suo
        // avvio invece di assumerlo già avvenuto.
        await vi.waitFor(() => expect(localEngine.talosQualifyLocalBackend)
            .toHaveBeenCalledWith('/models/local-test/smollm2-135m.gguf'))
    })

    it("'declined' scrive il consenso e NON fa partire niente", async () => {
        const { deps, controller } = await withLocalModelDiscovered()
        await controller.selectModel('local:/models/local-test/smollm2-135m.gguf')
        localEngine.talosQualifyLocalBackend.mockClear()

        await controller.decideLocalEngineProbeConsent('declined')

        expect(deps.settings.state.local_engine_probe.consent).toBe('declined')
        expect(localEngine.talosQualifyLocalBackend).not.toHaveBeenCalled()
    })

    // Il comando MANUALE — «sempre», compreso il caso in cui riaccende il
    // consenso da `declined` — non vive più sul controller: è
    // `talosRunLocalEngineProbeAndEnsureGranted`, provato per conto suo in
    // `tests/unit/lib/localEngineProbeRun.test.ts`. Vedi il commento su
    // `decideLocalEngineProbeConsent` in `chatController.ts`.
})
