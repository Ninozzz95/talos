import { computed, reactive, readonly, ref, type ComputedRef, type Ref } from 'vue'
import {
    useTalosMobileAttachments,
    type TalosMobileAttachmentsController,
} from '@/composables/useTalosMobileAttachments'
import type {
    TalosMobileModelProfileView,
    TalosMobileProviderId,
} from '@/components/chat/mobileChatTypes'
import { buildChatCompletion } from '@/lib/chat/chatCompletion'
import { talosToolActivityDetail, type TalosToolActivity } from '@/lib/tools/toolLabels'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import type {
    TalosMobileProviderCatalog,
    TalosMobileProviderModel,
    TalosMobileProviderProbeResult,
} from '@/lib/chat/providerContracts'
import { talosMobileHttpTransport, type TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { providerAdapterFor } from '@/lib/chat/providerRegistry'
import { manualModelToProviderModel, talosMobileModelProfiles } from '@/lib/mobileModelCatalog'
import {
    TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
    parseTalosMobileModelLabPreferences,
    type TalosMobileManualModel,
    type TalosMobileModelLabPreferences,
    type TalosMobileModelProbeRecord,
} from '@/lib/modelLabContracts'
import { clampMobileEffort, mobileEffortLadderFromLevels, type TalosMobileEffortLevel } from '@/lib/mobileEffort'
import { talosMobileModelProfileIsCallable, TALOS_MOBILE_PROVIDERS } from '@/lib/mobileProviders'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import { createLazyChatRepository } from '@/repositories/lazyChatRepository'
import {
    clearProviderEndpoint as realClearEndpoint,
    getProviderEndpoint as realGetEndpoint,
    setProviderEndpoint as realSetEndpoint,
} from '@/services/providerEndpointStore'
import {
    clearProviderKey as realClearKey,
    getProviderKey as realGetKey,
    hasProviderKey as realHasKey,
    setProviderKey as realSetKey,
} from '@/services/secureKeyStore'
import type { TalosNativeFilePicker } from '@/services/nativeFilePicker'
import type { TalosVaultService } from '@/services/talosVaultService'
import { createChatStore, type ChatCompletion, type ChatStore } from '@/stores/chat'
import { TALOS_TONE_PRESETS, buildTalosSystemPrompt, extractToneSuggestion, type TalosToneId } from '@/lib/tone'
import { extractLibrarySaveBlocks, librarySaveInstruction, stripLibrarySaveMarkers } from '@/lib/chat/librarySave'
import { createTalosConsentQueue } from '@/lib/tools/consentQueue'
import {
    createTalosTraceRecorder,
    type TalosRoundTraceHandle,
    type TalosSendTraceHandle,
} from '@/lib/diagnostics/sendTrace'
import {
    planTalosSessionCleanup,
    type TalosSessionCleanupPlan,
} from '@/lib/chat/sessionCleanup'
import {
    buildTalosLibraryContextBlock,
    selectLibraryDocsForInjection,
    talosLibraryDisclosure,
    type LibraryDoc,
} from '@/lib/chat/libraryContext'
import { parseVaultOrigin } from '@/lib/vaultLibrary'
import { createStationFacades } from '@/stores/stationFacades'
import {
    buildTalosMemoryContextMessage,
    selectTalosMemoriesForSession,
    talosMemoryDisclosure,
} from '@/lib/chat/memoryContext'
import { useTalosMobileToasts } from '@/stores/toasts'
import {
    TALOS_DEFAULT_COMPOSER_DEFAULTS,
    useSettingsStore,
    type TalosComposerDefaults,
} from '@/stores/settings'

// F3-T4 (owner #11): the system prompt is tone-driven (lib/tone.ts) — the old
// hardwired "precise engineering copilot" made every reply engineering-grade.
const TALOS_BROWSE_APPENDIX = ' Browse mode is active with a manual local browser. You have no page content, DOM, screenshot, or navigation result unless trusted browser evidence is explicitly included in the conversation. Never claim that you opened, saw, inspected, clicked, scrolled, or captured a page without that evidence. Ask the user to open the detected link or provide verified evidence when page contents are required.'
const TALOS_MODEL_PROBE_SENTINEL = 'TALOS_PROBE_OK'
const PROVIDER_IDS = TALOS_MOBILE_PROVIDERS.map((provider) => provider.id)
    .filter((provider): provider is TalosMobileProviderId => provider !== 'unknown')

const productionChatRepository = createLazyChatRepository(async () => {
    const { createProductionChatRepository } = await import('@/repositories/productionChatRepository')
    return createProductionChatRepository()
})

let productionVaultServicePromise: Promise<TalosVaultService> | null = null

function loadProductionVaultService(): Promise<TalosVaultService> {
    if (!productionVaultServicePromise) {
        productionVaultServicePromise = Promise.all([
            import('@/services/attachmentAnalysisClient'),
            import('@/services/attachmentFileStore'),
            import('@/services/talosVaultService'),
        ]).then(([analysis, fileStore, vault]) => vault.createTalosVaultService({
            repository: productionChatRepository,
            fileStore: fileStore.createAttachmentFileStore(),
            analysisClient: analysis.createAttachmentAnalysisClient(),
        }))
    }
    return productionVaultServicePromise
}

const productionVaultService: TalosVaultService = {
    ingest: async (file, originSessionId) => (await loadProductionVaultService()).ingest(file, originSessionId),
    createGenerated: async (input, originSessionId) => (await loadProductionVaultService()).createGenerated(input, originSessionId),
    createGeneratedBinary: async (input, originSessionId) => (await loadProductionVaultService()).createGeneratedBinary(input, originSessionId),
    createGrant: async (fileId) => (await loadProductionVaultService()).createGrant(fileId),
    readFilePreview: async (fileId) => (await loadProductionVaultService()).readFilePreview(fileId),
    revokeGrant: async (grantId) => (await loadProductionVaultService()).revokeGrant(grantId),
    resolveMessageParts: async (messageId) => (await loadProductionVaultService()).resolveMessageParts(messageId),
    listFiles: async () => (await loadProductionVaultService()).listFiles(),
    listSummaries: async () => (await loadProductionVaultService()).listSummaries(),
    readFileText: async (fileId) => (await loadProductionVaultService()).readFileText(fileId),
    setFileShared: async (fileId, shared) => (await loadProductionVaultService()).setFileShared(fileId, shared),
    deleteFile: async (fileId) => (await loadProductionVaultService()).deleteFile(fileId),
    reconcilePending: async () => (await loadProductionVaultService()).reconcilePending(),
}

const productionFilePicker: TalosNativeFilePicker = {
    async pickFiles() {
        const { createNativeFilePicker } = await import('@/services/nativeFilePicker')
        return createNativeFilePicker().pickFiles()
    },
}

const unavailableVaultService: TalosVaultService = {
    ingest: async (_file, _originSessionId) => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
    createGenerated: async (_input, _originSessionId) => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
    createGeneratedBinary: async (_input, _originSessionId) => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
    createGrant: async () => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
    readFilePreview: async () => null,
    setFileShared: async () => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
    revokeGrant: async () => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
    resolveMessageParts: async () => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
    listFiles: async () => [],
    listSummaries: async () => [],
    readFileText: async () => null,
    deleteFile: async () => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
    reconcilePending: async () => undefined,
}

const unavailableFilePicker: TalosNativeFilePicker = {
    pickFiles: async () => { throw new Error('TALOS_ATTACHMENT_RUNTIME_UNAVAILABLE') },
}

import * as imageGateway from '@/lib/images/imageGateway'

/** Characters a file name may not carry on Android, Windows or a zip. */
const TALOS_UNSAFE_FILE_CHARS = new RegExp('[\\\\/:*?"<>|\\r\\n]+', 'g')

export type ProviderCatalogStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface ProviderCatalogState {
    status: ProviderCatalogStatus
    models: TalosMobileProviderModel[]
    error: string | null
    updatedAt: string | null
    configured: boolean
}

export interface ChatControllerDeps {
    hasKey: (provider: TalosMobileProviderId) => Promise<boolean>
    getKey: (provider: TalosMobileProviderId) => Promise<string | null>
    setKey: (provider: TalosMobileProviderId, key: string) => Promise<void>
    clearKey: (provider: TalosMobileProviderId) => Promise<void>
    getEndpoint: (provider: TalosMobileProviderId) => Promise<string | null>
    setEndpoint: (provider: TalosMobileProviderId, endpoint: string) => Promise<void>
    clearEndpoint: (provider: TalosMobileProviderId) => Promise<void>
    transport: TalosMobileHttpTransport
    chatRepository: TalosChatRepository
    filePicker?: TalosNativeFilePicker
    vaultService?: TalosVaultService
    settings: {
        readonly state: {
            readonly composer_defaults: TalosComposerDefaults
            readonly model_lab: TalosMobileModelLabPreferences
            readonly tone: { readonly preset: TalosToneId }
            readonly shell?: {
                readonly library_context_enabled?: boolean
                readonly library_autosave_generated?: boolean
            /** Owner 2026-07-26: show technical codes, off in production. */
            readonly debug_diagnostics?: boolean
            }
            /** Vision routing preference (now a real behaviour, not an inert switch). */
            readonly ai_defaults?: { readonly vision_enabled?: boolean }
            /** Owner 2026-07-25: what the model may do without asking. */
            readonly tools?: {
                readonly read?: 'allow' | 'ask' | 'deny'
                readonly write?: 'allow' | 'ask' | 'deny'
                readonly outbound?: 'allow' | 'ask' | 'deny'
            }
            /** F1: which web-search source is configured, if any (D3). */
            readonly search?: {
                readonly source?: 'tavily' | 'brave' | 'searxng' | 'custom' | null
                readonly endpoint?: string | null
            }
        }
        hydrate(): Promise<void>
        setComposerDefaults(patch: Partial<TalosComposerDefaults>): Promise<void>
        setModelLabPreferences(value: TalosMobileModelLabPreferences): Promise<void>
        setTone(preset: TalosToneId): Promise<void>
    }
}

const realDeps: ChatControllerDeps = {
    hasKey: realHasKey,
    getKey: realGetKey,
    setKey: realSetKey,
    clearKey: realClearKey,
    getEndpoint: realGetEndpoint,
    setEndpoint: realSetEndpoint,
    clearEndpoint: realClearEndpoint,
    transport: talosMobileHttpTransport,
    chatRepository: productionChatRepository,
    filePicker: productionFilePicker,
    vaultService: productionVaultService,
    settings: useSettingsStore(),
}

// R2-7 — orchestrated session actions (draft flush + attachment revocation +
// scope re-activation), registered by the persistent ChatScreen.
export interface TalosSessionOrchestrator {
    newSession(): Promise<void>
    selectSession(sessionId: string): Promise<void>
    renameSession(sessionId: string, title: string): Promise<void>
    deleteSession(sessionId: string): Promise<void>
}

export interface TalosSessionLifecycle extends TalosSessionOrchestrator {
    register(orchestrator: TalosSessionOrchestrator): void
    unregister(orchestrator: TalosSessionOrchestrator): void
}

export interface ChatController {
    readonly catalogs: Readonly<Record<TalosMobileProviderId, ProviderCatalogState>>
    readonly endpoints: Readonly<Record<TalosMobileProviderId, string | null>>
    readonly modelLabPreferences: ComputedRef<TalosMobileModelLabPreferences>
    readonly profiles: ComputedRef<TalosMobileModelProfileView[]>
    readonly selectedModelId: Ref<string | null>
    readonly selectedProfile: ComputedRef<TalosMobileModelProfileView | null>
    readonly selectedProviderModel: ComputedRef<TalosMobileProviderModel | null>
    readonly effort: Ref<TalosMobileEffortLevel>
    readonly effortLadder: ComputedRef<TalosMobileEffortLevel[]>
    readonly thinking: Ref<boolean>
    /** Tool names running right now, so the chat can say what TALOS is doing. */
    readonly toolActivity: Readonly<Ref<TalosToolActivity[]>>
    /** Deny whatever consent is open — the shell calls this when it re-locks. */
    denyPendingToolConsent(): void
    /** Forget a conversation-scoped yes (D12): the shell calls it on re-lock. */
    clearSessionToolConsent(): void
    /**
     * The vault ids attached anywhere in one chat — the half of "this chat's
     * media" that metadata cannot answer, since a document picked out of the
     * global Library keeps its original chat's origin.
     */
    listChatMediaFileIds(sessionId: string): Promise<string[]>
    /** A write waiting for the user's answer; null when nothing is pending. */
    readonly pendingToolConsent: Readonly<Ref<{
        title: string
        description: string
        input: unknown
        allow(): void
        deny(): void
    } | null>>
    readonly canSend: ComputedRef<boolean>
    readonly browseMode: ComputedRef<boolean>
    readonly sendDisabledReason: ComputedRef<string>
    readonly preferenceError: Readonly<Ref<string | null>>
    readonly enhancingPrompt: Readonly<Ref<boolean>>
    readonly promptEnhancement: Readonly<Ref<TalosMobilePromptEnhancementResult | null>>
    readonly promptEnhancementError: Readonly<Ref<string | null>>
    readonly attachments: TalosMobileAttachmentsController
    readonly chat: ChatStore
    readonly secrets: Readonly<Record<string, boolean>>
    init(): Promise<void>
    refreshSecrets(): Promise<void>
    refreshProvider(provider: TalosMobileProviderId): Promise<TalosMobileProviderCatalog | null>
    refreshConfiguredProviders(): Promise<void>
    probeProvider(provider: TalosMobileProviderId): Promise<TalosMobileProviderProbeResult>
    probeModel(profileId: string): Promise<TalosMobileModelProbeRecord>
    setModelVisibility(profileId: string, visible: boolean): Promise<void>
    setModelDisplayName(profileId: string, displayName: string): Promise<void>
    saveManualModel(model: TalosMobileManualModel): Promise<void>
    removeManualModel(id: string): Promise<void>
    setProviderTimeout(provider: TalosMobileProviderId, seconds: number): Promise<void>
    selectModel(id: string): Promise<void>
    selectEffort(level: TalosMobileEffortLevel): Promise<void>
    setThinking(enabled: boolean): Promise<void>
    setBrowseMode(enabled: boolean): Promise<void>
    saveKey(provider: TalosMobileProviderId, key: string): Promise<void>
    removeKey(provider: TalosMobileProviderId): Promise<void>
    saveEndpoint(provider: TalosMobileProviderId, endpoint: string): Promise<void>
    removeEndpoint(provider: TalosMobileProviderId): Promise<void>
    newSession(): Promise<void>
    selectSession(sessionId: string): Promise<void>
    renameSession(sessionId: string, title: string): Promise<void>
    deleteSession(sessionId: string): Promise<void>
    /** Which Library files a chat would take with it (owner 2026-07-26). */
    planSessionCleanup(sessionId: string): TalosSessionCleanupPlan
    /** Remove those files. Returns the ids it could NOT delete. */
    deleteSessionMedia(sessionId: string): Promise<string[]>
    /** Timings of the recent sends, newest first. Empty unless debug is on. */
    traces(): readonly import('@/lib/diagnostics/sendTrace').TalosSendTrace[]
    clearTraces(): void
    /** R2-7 — single orchestration point for session actions (see impl). */
    sessionLifecycle: TalosSessionLifecycle
    tasks: {
        list(): Promise<import('@/repositories/chatRepository').TalosLocalTask[]>
        create(input: {
            title: string
            description: string | null
            run_id: string | null
            priority: 'low' | 'normal' | 'high'
        }): Promise<import('@/repositories/chatRepository').TalosLocalTask>
        setStatus(taskId: string, status: 'todo' | 'doing' | 'done'): Promise<import('@/repositories/chatRepository').TalosLocalTask>
        remove(taskId: string): Promise<void>
    }
    notes: {
        list(): Promise<import('@/repositories/chatRepository').TalosLocalNote[]>
        create(input: { title: string; content: string }): Promise<import('@/repositories/chatRepository').TalosLocalNote>
        remove(noteId: string): Promise<void>
    }
    memories: {
        list(): Promise<import('@/repositories/chatRepository').TalosLocalMemory[]>
        create(input: {
            title: string
            content: string
            kind: 'preference' | 'project_fact' | 'procedure' | 'policy_note'
            scope_type: 'global' | 'project' | 'session'
            scope_id: string | null
        }): Promise<import('@/repositories/chatRepository').TalosLocalMemory>
        setStatus(
            memoryId: string,
            status: 'active' | 'disabled' | 'quarantined' | 'rejected',
        ): Promise<import('@/repositories/chatRepository').TalosLocalMemory>
        remove(memoryId: string): Promise<void>
    }
    resendMessage(messageId: string): Promise<void>
    retryAssistantMessage(messageId: string): Promise<void>
    send(text: string): Promise<boolean>
    enhancePrompt(text: string): Promise<TalosMobilePromptEnhancementResult | null>
    clearPromptEnhancement(): void
}

function initialCatalogs(): Record<TalosMobileProviderId, ProviderCatalogState> {
    return PROVIDER_IDS.reduce<Record<TalosMobileProviderId, ProviderCatalogState>>((result, provider) => {
        result[provider] = {
            status: 'idle',
            models: [],
            error: null,
            updatedAt: null,
            configured: false,
        }
        return result
    }, {} as Record<TalosMobileProviderId, ProviderCatalogState>)
}

function initialEndpoints(): Record<TalosMobileProviderId, string | null> {
    return Object.fromEntries(PROVIDER_IDS.map((provider) => [provider, null])) as Record<
        TalosMobileProviderId,
        string | null
    >
}

function cloneModelLabPreferences(value: TalosMobileModelLabPreferences): TalosMobileModelLabPreferences {
    return {
        schema_version: 1,
        manual_models: value.manual_models.map((model) => ({
            ...model,
            input_modalities: [...model.input_modalities],
            output_modalities: [...model.output_modalities],
            supported_parameters: [...model.supported_parameters],
        })),
        model_overrides: Object.fromEntries(
            Object.entries(value.model_overrides).map(([profileId, override]) => [profileId, { ...override }]),
        ),
        provider_runtime: Object.fromEntries(
            Object.entries(value.provider_runtime).map(([provider, options]) => [provider, { ...options }]),
        ),
        probe_results: Object.fromEntries(
            Object.entries(value.probe_results).map(([profileId, result]) => [profileId, { ...result }]),
        ),
    }
}

function safeProviderMessage(error: unknown, secret: string | null): string {
    let message = error instanceof Error && error.message
        ? error.message
        : 'The provider request failed.'
    if (secret) message = message.replaceAll(secret, '[redacted]')
    return message
}

export function createChatController(deps: ChatControllerDeps = realDeps): ChatController {
    const secrets = reactive<Record<string, boolean>>(
        Object.fromEntries(PROVIDER_IDS.map((provider) => [provider, false])),
    )
    const catalogs = reactive(initialCatalogs())
    const endpoints = reactive(initialEndpoints())
    const selectedModelId = ref<string | null>(null)
    // Defect A2 discipline: the toolset is assembled in its OWN module and built
    // once per controller, not per message. `toolActivity` is what the chat
    // renders while a round of tools is running.
    const toolActivity = ref<TalosToolActivity[]>([])
    /** The pages read while answering the message currently in flight. */
    const readSources: Array<{
        url: string
        title: string
        site: string | null
        publishedAt: string | null
    }> = []
    /**
     * The pending write the user has to answer. A promise resolver is parked
     * here and the sheet settles it: the executor is already written to fail
     * CLOSED, so an unanswered request is a refusal, never an implicit yes.
     */
    const pendingToolConsent = ref<{
        title: string
        description: string
        input: unknown
        allow(): void
        deny(): void
    } | null>(null)
    let toolsetPromise: Promise<import('@/lib/tools/toolset').TalosToolset> | null = null

    /**
     * D12 — "ask once per conversation".
     *
     * Owner testing 2026-07-26: creating one PDF asked for permission five
     * times. The decision was taken and never implemented — the gate still only
     * knew `allow / ask / deny`, and `ask` means EVERY time. Five sheets for one
     * document is not a safeguard, it is an obstacle people learn to tap through
     * without reading, which is worse than no gate at all.
     *
     * So a granted `write` now covers the rest of THAT conversation. It is
     * cleared when the chat changes, and it never covers a destructive action
     * (D13) — a yes given for "make a document" cannot authorise "delete".
     */
    const writeConsentGrantedFor = ref<string | null>(null)

    function clearSessionToolConsent(): void {
        writeConsentGrantedFor.value = null
    }

    /** SF-MAJOR: a pending request must die with the run it belongs to. */
    function denyPendingToolConsent(): void {
        pendingToolConsent.value?.deny()
    }

    /**
     * One sheet at a time — but QUEUED, not refused.
     *
     * Two sheets at once is a question nobody can reason about, so the gate
     * used to answer a second concurrent request 'busy'. That was safe while
     * the loop ran one call at a time; running a round together (the 2026-07-26
     * speed work) would have turned a legitimate ask into a machine refusal the
     * user never saw. In practice the queue is one deep and then empty: the
     * first "yes" grants the action type for the conversation (D12), so
     * everything behind it is answered without a sheet at all.
     */
    const consentQueue = createTalosConsentQueue()

    function askToolConsent(
        request: { tool: { title: string; description: string }; input: unknown },
        signal?: AbortSignal,
    ): Promise<boolean | 'busy'> {
        // D12: already granted for this conversation, and this is not a
        // destructive action, so it does not ask again.
        if (writeConsentGrantedFor.value !== null
            && writeConsentGrantedFor.value === chat.activeSession.value?.id) {
            return Promise.resolve(true)
        }
        // SF-MAJOR: Stop used to leave the sheet open and the send stuck with
        // `sending` true. A cancelled request's honest answer is "deny".
        if (signal?.aborted) return Promise.resolve(false)
        return consentQueue.run(() => {
            // Re-checked on this caller's turn: the sheet ahead of it may have
            // granted the whole conversation while it waited.
            if (writeConsentGrantedFor.value !== null
                && writeConsentGrantedFor.value === chat.activeSession.value?.id) {
                return Promise.resolve(true)
            }
            return askOnce(request, signal)
        }, signal)
    }

    function askOnce(
        request: { tool: { title: string; description: string }; input: unknown },
        signal?: AbortSignal,
    ): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const settle = (allowed: boolean): void => {
                pendingToolConsent.value = null
                resolve(allowed)
            }
            signal?.addEventListener('abort', () => settle(false), { once: true })
            pendingToolConsent.value = {
                title: request.tool.title,
                description: request.tool.description,
                input: request.input,
                allow: () => {
                    // The yes lasts for this conversation (D12).
                    writeConsentGrantedFor.value = chat.activeSession.value?.id ?? null
                    settle(true)
                },
                deny: () => settle(false),
            }
        })
    }
    const effort = ref<TalosMobileEffortLevel>('high')
    const thinking = ref(false)
    const preferenceError = ref<string | null>(null)
    const enhancingPrompt = ref(false)
    const promptEnhancement = ref<TalosMobilePromptEnhancementResult | null>(null)
    const promptEnhancementError = ref<string | null>(null)
    let initialized = false
    let initialization: Promise<void> | null = null
    let modelLabWrite: Promise<void> = Promise.resolve()
    let promptEnhancementRevision = 0
    const vaultService = deps.vaultService ?? unavailableVaultService
    const attachments = useTalosMobileAttachments({
        picker: deps.filePicker ?? unavailableFilePicker,
        vault: vaultService,
        currentSessionId: () => chat.activeSession.value?.id ?? null,
    })

    const modelLabPreferences = computed(() =>
        deps.settings.state.model_lab ?? TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
    )
    const discoveredModels = computed(() => PROVIDER_IDS.flatMap((provider) => catalogs[provider].models))
    const availableProviderModels = computed(() => {
        const result = [...discoveredModels.value]
        const identities = new Set(result.map((model) => `${model.provider}:${model.id}`))
        for (const manual of modelLabPreferences.value.manual_models) {
            const identity = `${manual.provider}:${manual.model}`
            if (identities.has(identity)) continue
            identities.add(identity)
            result.push(manualModelToProviderModel(manual))
        }
        return result
    })
    const profiles = computed(() => talosMobileModelProfiles(
        discoveredModels.value,
        (provider) => secrets[provider] === true,
        modelLabPreferences.value,
    ))
    const selectedProfile = computed(() =>
        profiles.value.find((profile) => profile.id === selectedModelId.value) ?? null,
    )
    // Coherence audit 2026-07-25: `ai_defaults.vision_enabled` shipped as an inert
    // switch promising "prefer a vision-capable profile when an image is attached".
    // It now does exactly that: with an image in the tray and a text-only model
    // selected, TALOS routes to the first vision-capable profile and says so.
    function profileSeesImages(profile: TalosMobileModelProfileView): boolean {
        const modalities = (profile.capabilities as { input_modalities?: unknown } | null)?.input_modalities
        return Array.isArray(modalities) && modalities.includes('image')
    }
    function preferVisionProfileForAttachments(): void {
        if (deps.settings.state.ai_defaults?.vision_enabled !== true) return
        const hasImage = attachments.items.some((item) =>
            item.status === 'authorized' && item.mediaType.startsWith('image/'))
        if (!hasImage) return
        const current = selectedProfile.value
        if (!current || profileSeesImages(current)) return
        const capable = profiles.value.find((profile) =>
            profile.id !== current.id && profileSeesImages(profile) && talosMobileModelProfileIsCallable(profile))
        if (!capable) return
        if (!applyModelSelection(capable.id)) return
        void persistComposerDefaults()
        toasts.push({
            message: `Switched to ${capable.display_name} — ${current.display_name} cannot read images.`,
            durationMs: 8000,
        })
    }

    const selectedProviderModel = computed(() => {
        const profile = selectedProfile.value
        if (!profile) return null
        return availableProviderModels.value.find(
            (model) => model.provider === profile.provider && model.id === profile.model,
        ) ?? null
    })
    const effortLadder = computed(() => mobileEffortLadderFromLevels(selectedProfile.value?.effort_levels))

    const toasts = useTalosMobileToasts()
    // F4 Memory station — retrieval happens per send: the untrusted block is
    // applied to the LAST user turn of the PROVIDER payload only, the
    // persisted message stays verbatim (disclosure in its metadata).
    let pendingMemoryBlock: string | null = null

    async function prepareMemoryInjection(): Promise<Record<string, unknown>> {
        // SF-4 invariant: disclosure and injection are set TOGETHER or not at
        // all — any failure resets both, and a send already in flight keeps
        // its own selection untouched (the follow-up chat.send is a no-op).
        if (chat.state.sending) return {}
        pendingMemoryBlock = null
        memorySelection = []
        try {
            const all = await deps.chatRepository.listMemories()
            const selected = selectTalosMemoriesForSession(all, chat.activeSession.value?.id ?? null)
                .filter((memory) => memory.content !== '')
            if (selected.length === 0) return {}
            memorySelection = selected
            pendingMemoryBlock = 'pending'
            // Usage stamp is best-effort bookkeeping: it must never block or
            // desync the injection/disclosure pair.
            void deps.chatRepository
                .touchMemories(selected.map((memory) => memory.id), new Date().toISOString())
                .catch(() => undefined)
            return { used_memories: talosMemoryDisclosure(selected) }
        } catch {
            pendingMemoryBlock = null
            memorySelection = []
            return {}
        }
    }
    let memorySelection: ReturnType<typeof selectTalosMemoriesForSession> = []

    // Owner 2026-07-25: the model in ANY chat can read the GLOBAL Library. Mirrors
    // prepareMemoryInjection — select (auto-scaling), stamp the disclosure, and set
    // a pending block that complete() prepends to the last user turn. Each doc
    // carries its origin chat so the model knows a document's provenance.
    let pendingLibraryBlock: string | null = null
    let librarySelection: LibraryDoc[] = []
    async function prepareLibraryInjection(query: string): Promise<Record<string, unknown>> {
        if (chat.state.sending) return {}
        pendingLibraryBlock = null
        librarySelection = []
        if (!deps.settings.state.shell?.library_context_enabled) return {}
        try {
            // Security review 2026-07-25:
            // - NEVER inject origin='generated' documents. Model-authored content
            //   must not become future model input, or a single poisoned reply
            //   becomes a permanent instruction in every later chat.
            // - Per-file opt-out (metadata.library_shared === false) is honored.
            // Perf review: the vault list is read WITHOUT extracted_text; only the
            // few selected documents are hydrated (a full read shipped every
            // document's whole body across the bridge on every single send).
            const summaries = (await deps.chatRepository.listVaultFileSummaries())
                .filter((file) => file.status === 'available')
                .filter((file) => parseVaultOrigin(file.metadata) === 'uploaded')
                .filter((file) => (file.metadata as { library_shared?: boolean }).library_shared !== false)
            if (summaries.length === 0) return {}
            const titles = new Map(chat.sessions.map((session) => [session.id, session.title]))
            const toDoc = (file: { id: string; display_name: string; metadata: Record<string, unknown>; created_at: string }, text: string): LibraryDoc => {
                const originSessionId = (file.metadata as { origin_session_id?: string | null }).origin_session_id ?? null
                return {
                    id: file.id,
                    displayName: file.display_name,
                    origin: parseVaultOrigin(file.metadata),
                    originSessionId,
                    originSessionTitle: originSessionId ? (titles.get(originSessionId) ?? null) : null,
                    text,
                    createdAt: file.created_at,
                }
            }
            // Rank on names + the search preview only, then hydrate the winners.
            const ranked = selectLibraryDocsForInjection(
                summaries.map((file) => toDoc(file, file.text_preview ?? '')),
                { query, charBudget: 24_000, maxDocs: 8, perDocChars: 4_000 },
            )
            // Re-review 2026-07-25: hydrate in PARALLEL (8 serial bridge round-trips
            // sat on the send hot path), then enforce the char budget on the REAL
            // bodies — ranking on 600-char previews made the budget check always
            // pass, so up to 8x4000 chars could ship, 33% over the stated budget.
            const hydrated = await Promise.all(ranked.map(async (doc) => {
                const full = await deps.chatRepository.getVaultFile(doc.id)
                return full?.extracted_text ? { ...doc, text: full.extracted_text } : null
            }))
            const selected: LibraryDoc[] = []
            let used = 0
            for (const doc of hydrated) {
                if (!doc) continue
                const cost = Math.min(doc.text.length, 4_000)
                if (selected.length > 0 && used + cost > 24_000) break
                selected.push(doc)
                used += cost
            }
            if (selected.length === 0) return {}
            librarySelection = selected
            pendingLibraryBlock = 'pending'
            return { used_library: talosLibraryDisclosure(selected) }
        } catch {
            pendingLibraryBlock = null
            librarySelection = []
            return {}
        }
    }

    /**
     * Where a send spends its time (owner 2026-07-26).
     *
     * Behind the same debug switch as the technical error codes, and reading
     * `performance.now()` rather than `Date.now()`: the system clock can be
     * corrected mid-answer and print a negative duration in the one report
     * meant to settle an argument.
     */
    const traceRecorder = createTalosTraceRecorder({
        enabled: () => deps.settings.state.shell?.debug_diagnostics === true,
        now: () => performance.now(),
        // Read alongside the monotonic clock to catch a send that spanned a
        // device sleep: on Android CLOCK_MONOTONIC stops while suspended, and
        // the owner leaves the app WHILE it generates.
        wallNow: () => Date.now(),
    })

    const complete: ChatCompletion = async (turns, stream) => {
        // Assigned INSIDE the try. SF-critic 2026-07-26: three awaits sit
        // between here and it (the secure-store key read, the endpoint read, a
        // dynamic import), and any of them throwing left a trace in the list
        // exactly as `begin` pushed it — "ok, 0ms" for a send the user watched
        // fail, and one more on the recorded count.
        let trace: TalosSendTraceHandle | null = null
        /**
         * A "round" is the model call AND the tools it then asks for.
         *
         * That is the unit a reader wants: the loop calls the model, runs what
         * it asked for, calls again. Timing the model call alone would hide
         * exactly the half the owner is chasing, and timing the tools alone
         * would hide the thinking. So a new round OPENS at each model call and
         * the previous one closes there — its duration therefore covers the
         * call plus everything that call set in motion.
         */
        // A holder, not a bare `let`: the assignment happens inside a callback
        // the compiler cannot follow, so a plain variable stays narrowed to null
        // at every later use and `round?.finish()` fails to typecheck.
        const round: { open: TalosRoundTraceHandle | null } = { open: null }
        function openRound(): void {
            round.open?.finish()
            round.open = trace?.round() ?? null
        }
        const profile = selectedProfile.value
        const providerModel = selectedProviderModel.value
        const apiKey = profile ? await deps.getKey(profile.provider) : null
        const endpoint = profile ? await deps.getEndpoint(profile.provider) : null
        const timeoutSeconds = profile
            ? modelLabPreferences.value.provider_runtime[profile.provider]?.timeout_seconds
            : undefined
        const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : undefined
        /**
         * R-1b — what keeps this alive if the user leaves the app.
         *
         * Owner 2026-07-26: switching apps mid-answer produced "network error".
         * The streaming path is `fetch` inside the WebView and Android suspends
         * a backgrounded WebView, so the request was not failing — it was being
         * killed, and no retry logic fixes that.
         *
         * It arms itself only when the work is long: a tool round engages it at
         * once, plain streaming after a few seconds. A short reply never starts
         * anything, so no notification appears for a two-second answer.
         */
        const { createTalosRunKeeper } = await import('@/services/longRunKeeper')
        const keeper = createTalosRunKeeper(chat.activeSession.value?.title || 'TALOS')
        try {
            trace = traceRecorder.begin({
                provider: selectedProfile.value?.provider ?? 'unknown',
                model: selectedProviderModel.value?.displayName
                    ?? selectedProfile.value?.model
                    ?? 'unknown',
            })
            const autosaveGenerated = deps.settings.state.shell?.library_autosave_generated === true
            const baseTonePrompt = buildTalosSystemPrompt(
                deps.settings.state.tone.preset,
                profile ? { provider: profile.provider, model: providerModel?.displayName ?? profile.model } : null,
            )
            let payloadTurns = turns
            let memoryWrapped = false
            if (pendingMemoryBlock !== null && memorySelection.length > 0) {
                const lastUserIndex = turns.map((turn) => turn.role).lastIndexOf('user')
                if (lastUserIndex >= 0) {
                    payloadTurns = turns.map((turn, index) => index === lastUserIndex
                        ? { ...turn, content: buildTalosMemoryContextMessage(turn.content, memorySelection) }
                        : turn)
                    memoryWrapped = true
                }
                pendingMemoryBlock = null
                memorySelection = []
            }
            if (pendingLibraryBlock !== null && librarySelection.length > 0) {
                const block = buildTalosLibraryContextBlock(librarySelection, { perDocChars: 4_000 })
                const lastUserIndex = payloadTurns.map((turn) => turn.role).lastIndexOf('user')
                if (block !== '' && lastUserIndex >= 0) {
                    payloadTurns = payloadTurns.map((turn, index) => index === lastUserIndex
                        // If memory already wrapped the turn it carries the single final
                        // USER_TASK, so just prepend; otherwise add the boundary here so
                        // untrusted doc bodies are delimited from the user's instruction.
                        ? { ...turn, content: memoryWrapped ? `${block}\n\n${turn.content}` : `${block}\n\nUSER_TASK:\n${turn.content}` }
                        : turn)
                }
                pendingLibraryBlock = null
                librarySelection = []
            }
            // The tool suite. Sources come from what the controller already
            // owns; the loop runs the calls through the permission gate and
            // writes an audit row for every outcome.
            const toolset = await (toolsetPromise ??= import('@/lib/tools/toolset')
                .then(({ createTalosToolset }) => createTalosToolset({
                    repository: deps.chatRepository,
                    // Read through the SAME resolved service the rest of the
                    // controller uses: reading the raw dep skipped the
                    // unavailable-vault fallback, so library_search listed a
                    // document that library_read then swore did not exist.
                    readVaultFileText: (fileId) => vaultService.readFileText(fileId),
                    // Owner 2026-07-27: the Library could FIND an image and not
                    // look at it. The bytes path already existed for message
                    // attachments; it just was not wired to the tool.
                    readVaultFileBytes: (fileId) => vaultService.readFilePreview(fileId),
                    sessionTitles: async () => new Map(chat.sessions.map((session) => [session.id, session.title])),
                    // SF-MAJOR: with "let chats use your Library" OFF (the
                    // default) the ambient injection reads nothing — but the
                    // tools read everything, which is the same opt-out being
                    // walked around one level up.
                    libraryEnabled: () => deps.settings.state.shell?.library_context_enabled === true,
                    /**
                     * F2 — making documents. Always available: unlike search it
                     * needs no third party and no key, because the generators
                     * run on the device.
                     */
                    /**
                     * Drawing, owner's own gateway sketch: chat -> model ->
                     * gateway -> provider adapter -> the Library -> the image
                     * in the conversation.
                     *
                     * Only the providers whose keys are already on this device
                     * are offered, so nobody is asked to sign up for anything to
                     * draw. Null when neither has a key: the tool is then not
                     * advertised at all, which is what stops a model calling it
                     * five times and being refused five times.
                     */
                    images: () => {
                        const { chooseTalosImageProvider } = imageGateway
                        const drawer = chooseTalosImageProvider(
                            { openai: secrets.openai === true, gemini: secrets.gemini === true },
                            selectedProfile.value?.provider ?? null,
                        )
                        if (!drawer) return null
                        return {
                            provider: () => drawer,
                            async generate(prompt, shape, signal) {
                                const {
                                    planTalosImageRequest, parseTalosGeneratedImages,
                                    readTalosImageError, talosImageErrorIsPermanent,
                                } = await import('@/lib/images/imageGateway')
                                const apiKey = await deps.getKey(drawer)
                                if (!apiKey) throw new Error('the key for this provider is no longer on this device')
                                // From the catalogue TALOS already discovered,
                                // never from a constant in the APK: this app
                                // ships and a frozen model id ages in the field.
                                const { pickTalosImageModel } = imageGateway
                                const plan = planTalosImageRequest(drawer, { prompt, shape }, {
                                    apiKey,
                                    model: pickTalosImageModel(drawer, catalogs[drawer].models),
                                    endpoint: endpoints[drawer] ?? null,
                                })
                                const drawing = deps.transport.request({
                                    url: plan.url,
                                    method: 'POST',
                                    headers: plan.headers,
                                    data: plan.body,
                                    // Drawing is slower than answering; the chat
                                    // timeout would cut a picture that is coming.
                                    connectTimeout: 120_000,
                                    readTimeout: 120_000,
                                })
                                /**
                                 * Stop means stop waiting.
                                 *
                                 * HONEST LIMIT: the http transport contract has
                                 * no abort, and adding one is a contract change
                                 * that is not mine to make unilaterally. So a
                                 * stopped message stops the WAIT and reports it,
                                 * but the request already in flight may still
                                 * complete upstream and still be billed. Racing
                                 * it is strictly better than ignoring the signal
                                 * — which is what the first cut did — and the
                                 * remaining gap is written down rather than
                                 * quietly tolerated.
                                 */
                                const response = signal
                                    ? await Promise.race([
                                        drawing,
                                        new Promise<never>((_resolve, reject) => {
                                            if (signal.aborted) reject(new Error('TALOS_IMAGE_STOPPED'))
                                            signal.addEventListener(
                                                'abort',
                                                () => reject(new Error('TALOS_IMAGE_STOPPED')),
                                                { once: true },
                                            )
                                        }),
                                    ])
                                    : await drawing
                                /**
                                 * The transport does NOT throw on a non-2xx, it
                                 * returns the body. Owner's trace 2026-07-27:
                                 * every attempt failed in 140-389ms — an error
                                 * page, not a drawing — and because nobody read
                                 * the status, the model was handed "no image"
                                 * and told the user his cat prompt had been
                                 * refused. The status is read now, and the
                                 * provider's own words travel.
                                 */
                                const failure = readTalosImageError(response.status, response.data)
                                return {
                                    images: failure ? [] : parseTalosGeneratedImages(response.data),
                                    error: failure,
                                    permanent: failure !== null && talosImageErrorIsPermanent(response.status),
                                }
                            },
                            async save(image, prompt) {
                                // Decoded by the platform, not by a JS loop.
                                // Self-review 2026-07-27: `atob` plus a
                                // char-by-char loop over a multi-megabyte image
                                // runs on the UI thread and freezes the app for
                                // the length of the picture. `fetch` on a data
                                // URL does the same work natively.
                                const decoded = await fetch(`data:${image.mediaType};base64,${image.base64}`)
                                const bytes = new Uint8Array(await decoded.arrayBuffer())
                                // Named after what it shows, so the Library is
                                // browsable later; a timestamped blob is not.
                                const stem = prompt.trim().slice(0, 48)
                                    .replace(TALOS_UNSAFE_FILE_CHARS, ' ')
                                    .replace(/\s+/g, ' ')
                                    .trim()
                                const extension = image.mediaType === 'image/jpeg' ? 'jpg' : 'png'
                                const saved = await attachments.saveGeneratedBinary({
                                    name: `${stem || 'image'}.${extension}`,
                                    mediaType: image.mediaType,
                                    bytes,
                                })
                                return { id: saved.id, name: saved.display_name }
                            },
                        }
                    },
                    documents: () => ({
                        diagnostics: () => deps.settings.state.shell?.debug_diagnostics === true,
                        async generate(spec) {
                            const { generateTalosDocument } = await import('@/lib/documents/documentGenerator')
                            return generateTalosDocument(spec)
                        },
                        async verify(document) {
                            const { verifyTalosDocument } = await import('@/lib/documents/documentGenerator')
                            return verifyTalosDocument(document)
                        },
                        async save(document) {
                            // The failure code travels. A save that fails with
                            // "could not be saved" leaves the model guessing —
                            // and a guessing model tells the user it was a
                            // "temporary storage problem", which is a sentence
                            // nobody can act on.
                            // The REAL bytes, always. Routing a binary format
                            // through the text sink produced a file named .xlsx
                            // containing a placeholder sentence — the document
                            // was generated correctly and thrown away here.
                            const saved = await attachments.saveGeneratedBinary({
                                name: document.fileName,
                                mediaType: document.mediaType,
                                bytes: document.bytes,
                            })
                            return { id: saved.id }
                        },
                    }),
                    /**
                     * F1 — the web tools exist only when a source is configured
                     * (D3). Evaluated per send, so choosing a source in Settings
                     * takes effect on the next message rather than the next
                     * launch.
                     */
                    web: () => {
                        const source = deps.settings.state.search?.source ?? null
                        if (!source) return null
                        // Which pages THIS answer rests on. Kept per send, so a
                        // chip under one reply cannot show another reply's
                        // sources — the whole point of citing.
                        readSources.length = 0
                        return {
                            async search(query: string, maxResults: number) {
                                const [{ runTalosSearch }, { getProviderKey }] = await Promise.all([
                                    import('@/services/webSearchRuntime'),
                                    import('@/services/secureKeyStore'),
                                ])
                                const apiKey = await getProviderKey(`search.${source}`).catch(() => null)
                                return runTalosSearch(source, {
                                    apiKey: apiKey ?? undefined,
                                    endpoint: deps.settings.state.search?.endpoint ?? undefined,
                                }, query, maxResults)
                            },
                            async read(url: string) {
                                const { readTalosPage } = await import('@/services/webSearchRuntime')
                                return readTalosPage(url)
                            },
                            /**
                             * D5 — every page read becomes a source of THIS chat:
                             * it lands in the Library with its text, so six months
                             * later the answer is still auditable even though the
                             * page has changed or gone. Marked `generated` so it
                             * is never re-injected as if the user had uploaded it.
                             */
                            async remember(page) {
                                readSources.push({
                                    url: page.url,
                                    title: page.title,
                                    site: page.siteName,
                                    publishedAt: page.publishedAt,
                                })
                                await attachments.saveGenerated({
                                    // A source, not a document the user made.
                                    kind: 'web_source',
                                    // Owner 2026-07-27: the address must survive as
                                    // an address, not only as a line of prose inside
                                    // the transcript — that is what lets the Library
                                    // list it as a link you can open.
                                    sourceUrl: page.url,
                                    name: `${page.title || new URL(page.url).hostname}.md`,
                                    mediaType: 'text/markdown',
                                    text: [
                                        `# ${page.title}`,
                                        '',
                                        `Source: ${page.url}`,
                                        `Published: ${page.publishedAt ?? 'date unknown'}`,
                                        page.siteName ? `Site: ${page.siteName}` : '',
                                        '',
                                        page.text,
                                    ].filter(Boolean).join('\n'),
                                })
                            },
                        }
                    },
                    requestConsent: (request) => askToolConsent(request as never, stream?.signal),
                })))
            // Evaluated now, from the live settings, so a permission changed a
            // minute ago governs this message.
            const offeredTools = toolset.offer(deps.settings.state.tools)

            /**
             * Owner 2026-07-26: asking for a PDF produced the PDF *and* a
             * parallel .md nobody wanted.
             *
             * Two mechanisms were doing the same job at once. The
             * `[TALOS_SAVE_LIBRARY]` marker predates the tool suite — it was how
             * a model without tools could still hand over a file. With
             * `document_create` offered, instructing the model to ALSO emit
             * markers guarantees it does both, and the marker version is the
             * worse one: markdown pretending to be whatever was asked for,
             * with no format and no verification.
             *
             * So the marker instruction is given only when the real tool is not
             * there. The marker PARSER stays either way, because a model can
             * still emit one unprompted and dropping it silently would lose
             * content the user watched being written.
             */
            const documentToolOffered = offeredTools.some(
                (tool: { name: string }) => tool.name === 'document_create',
            )
            const tonePrompt = baseTonePrompt
                + (autosaveGenerated && !documentToolOffered ? '\n' + librarySaveInstruction() : '')
            const completeOnce = buildChatCompletion(
                () => ({
                    profile,
                    providerModel,
                    apiKey,
                    endpoint,
                    timeoutMs,
                    effort: effort.value,
                    thinking: thinking.value,
                    system: chat.activeSession.value?.surface === 'browse'
                        ? tonePrompt + TALOS_BROWSE_APPENDIX
                        : tonePrompt,
                }),
                deps.transport,
            )
            const { runTalosAgentLoop } = await import('@/lib/tools/agentLoop')
            const { executeTalosTool } = await import('@/lib/tools/executor')
            const loop = await runTalosAgentLoop(payloadTurns, {
                complete: (turns) => {
                    openRound()
                    // The first chunk is the first word the user sees, which is
                    // the number that decides whether an answer FEELS slow.
                    // BOTH channels: on a reasoning model the first bytes on
                    // the wire are reasoning, and timing only visible text
                    // measures how long the model thought, not how long the
                    // provider took to answer.
                    const timed = stream && {
                        ...stream,
                        onChunk: (text: string) => { round.open?.firstChunk(); stream.onChunk(text) },
                        onReasoning: (text: string) => {
                            round.open?.firstChunk()
                            stream.onReasoning?.(text)
                        },
                    }
                    return completeOnce(turns, timed ?? stream, offeredTools).then((result) => {
                        // What the cache actually did, straight from the wire.
                        round.open?.cache?.(result.usage)
                        return result
                    })
                },
                execute: async (call) => {
                    const timing = round.open?.tool(call.name)
                    // The permission sheet is human time, not TALOS being slow.
                    // Measured here so the tool's duration can report the WORK.
                    let waitedForConsentMs = 0
                    const tool = offeredTools.find((entry: { name: string }) => entry.name === call.name)
                    if (!tool) {
                        // A model can hallucinate a tool name. Saying so is more
                        // useful than failing the turn.
                        timing?.finish(false, waitedForConsentMs, 'TALOS_TOOL_UNKNOWN')
                        return { ok: false, content: `There is no tool called "${call.name}".` }
                    }
                    const result = await executeTalosTool(tool, call.arguments, {
                        permissions: deps.settings.state.tools as never,
                        requestConsent: async (request: never) => {
                            const askedAt = performance.now()
                            try {
                                return await toolset.requestConsent(request)
                            } finally {
                                waitedForConsentMs += performance.now() - askedAt
                            }
                        },
                        audit: (row) => toolset.audit(row, chat.activeSession.value?.id ?? null),
                        context: { sessionId: chat.activeSession.value?.id ?? null, signal: stream?.signal },
                    })
                    timing?.finish(result.ok, waitedForConsentMs, result.code ?? null)
                    return { ok: result.ok, content: result.content }
                },
                onToolRound: (calls) => {
                    // A tool round means pages, documents or searches: long by
                    // definition, so the keeper starts now rather than waiting.
                    keeper.engage(calls.map((call) => call.name).join(', '))
                    // The detail is what makes four `web_read` rows tell the
                    // user anything at all.
                    toolActivity.value = calls.map((call) => ({
                        name: call.name,
                        detail: talosToolActivityDetail(call.name, call.arguments),
                    }))
                },
            })
            const completion = loop
            keeper.release()
            denyPendingToolConsent()
            toolActivity.value = []
            const raw = completion.text
            // F3-T4: a final-line tone suggestion is stripped from the durable
            // reply and surfaced as a toast — the user decides, never auto-applied.
            const { text, suggestion } = extractToneSuggestion(raw)
            if (suggestion && suggestion !== deps.settings.state.tone.preset) {
                const preset = TALOS_TONE_PRESETS.find((candidate) => candidate.id === suggestion)
                toasts.push({
                    message: `The model suggests the ${preset?.label ?? suggestion} tone for this conversation.`,
                    action: { label: 'Switch', run: () => { void deps.settings.setTone(suggestion) } },
                    durationMs: 12000,
                })
            }
            // Owner 2026-07-25: the chat can't hand out downloads — a file the model
            // wraps in the save marker is captured into the Library (generated,
            // provenance-stamped) and the marker tags are stripped from the reply.
            // Gated by the opt-out toggle so untrusted output never creates files
            // silently when the user turned auto-save off.
            const { text: finalText, blocks } = autosaveGenerated
                ? extractLibrarySaveBlocks(text)
                : { text, blocks: [] as ReturnType<typeof extractLibrarySaveBlocks>['blocks'] }
            // SF-MAJOR: this write never touched the permission gate, while
            // Settings told the user "create or change things: ask me every
            // time". One setting must govern every write, whether it arrives as
            // a tool call or as a marker in the reply.
            const { decideTalosToolPermission } = await import('@/lib/tools/permissionTypes')
            const writePermission = decideTalosToolPermission('write', deps.settings.state.tools)
            for (const block of blocks) {
                if (writePermission === 'deny') {
                    toasts.push({
                        message: `“${block.name}” was not saved: your settings do not allow TALOS to create files.`,
                        durationMs: 6000,
                    })
                    continue
                }
                if (writePermission === 'ask') {
                    const allowed = await askToolConsent({
                        tool: {
                            title: `Save “${block.name}” to your Library`,
                            description: 'The model produced a file and wants to store it on this device.',
                        },
                        input: { name: block.name, type: block.mediaType, characters: block.text.length },
                    }, stream?.signal)
                    // `busy` is truthy — treating it as consent would save the
                    // file on a refusal. Only an explicit yes may pass.
                    if (allowed !== true) {
                        toasts.push({ message: `“${block.name}” was not saved.`, durationMs: 4000 })
                        continue
                    }
                }
                void attachments.saveGenerated(block)
                    .then((file) => toasts.push({
                        message: `Saved “${file.display_name}” to your Library.`,
                        // Re-review 2026-07-25: a write driven by untrusted model output
                        // must be reversible from where it is announced — the toast used
                        // to be non-actionable and the only undo was hunting the file down
                        // in the Library.
                        action: {
                            label: 'Undo',
                            run: () => { void attachments.deleteVaultFile(file.id).catch(() => undefined) },
                        },
                        durationMs: 10000,
                    }))
                    .catch(() => toasts.push({
                        message: `“${block.name}” could not be saved to the Library.`, durationMs: 6000,
                    }))
            }
            // Re-review 2026-07-25: strip UNCONDITIONALLY. With autosave off the raw
            // reply was persisted verbatim, and even with it on a reply truncated
            // mid-block kept its opening marker — which is then replayed to the
            // provider as history and teaches the syntax.
            // The last round has no next model call to close it, so it closes
            // here — with the send, whose duration is the number the owner is
            // holding a stopwatch against.
            round.open?.finish()
            trace?.finish('ok')
            // Debt A1: the controller's completion returns the RESULT, carrying
            // finishReason (and any tool calls) through to the store's loop.
            return {
                text: stripLibrarySaveMarkers(finalText),
                finishReason: completion.finishReason ?? null,
                toolCalls: completion.toolCalls,
                // Defect #5: the reasoning reaches the store, which persists it
                // with the message instead of letting it evaporate.
                reasoning: completion.reasoning,
                // Owner 2026-07-26: the pages THIS answer rests on, so the chat
                // can show a "Sources" chip under it — the way Claude and
                // ChatGPT do. Per answer, never per chat: a chip that shows
                // everything the conversation ever read is not a citation.
                ...(readSources.length ? { sources: readSources.slice() } : {}),
            }
        } catch (error) {
            round.open?.finish()
            // Stopping is not failing: the owner asked for it, and a report that
            // calls his own Stop an error teaches him to distrust the report.
            trace?.finish(stream?.signal?.aborted ? 'stopped' : 'error')
            // Unconditional: a notification that outlives its work is worse than
            // never having shown one.
            keeper.release()
            /**
             * Owner 2026-07-26: a new chat answered "you declined" and no sheet
             * had ever appeared.
             *
             * A pending consent is settled by the user, or by the abort signal —
             * but the buffered path has NO signal, so a send that died (Android
             * killing the backgrounded WebView, for one) left the request hanging
             * forever. Every later write then got "another confirmation is
             * already open", which the model reports as a refusal. One dead send
             * silently disabled writing for the rest of the app's life.
             */
            denyPendingToolConsent()
            // SF-MINOR: cleared only on the success path, so a failed or aborted
            // send left stale tool names for the start of the next one.
            toolActivity.value = []
            // A user Stop must stay an AbortError all the way to the chat store, or
            // it gets persisted as a failed system message instead of a clean cancel.
            if (error instanceof Error && error.name === 'AbortError') throw error
            const safeMessage = safeProviderMessage(error, apiKey)
            if (error instanceof TalosMobileProviderError) {
                throw new TalosMobileProviderError({
                    provider: error.provider,
                    operation: error.operation,
                    message: safeMessage,
                    status: error.status,
                })
            }
            throw new Error(safeMessage)
        }
    }
    const chat = createChatStore(complete, {
        repository: deps.chatRepository,
        resolveMessageParts: vaultService.resolveMessageParts,
    })
    const browseMode = computed(() => chat.activeSession.value?.surface === 'browse')
    const canSend = computed(() =>
        chat.state.persistenceStatus === 'ready'
        && chat.state.persistenceError === null
        && talosMobileModelProfileIsCallable(selectedProfile.value)
        && selectedProviderModel.value !== null
        && (selectedProfile.value ? catalogs[selectedProfile.value.provider].configured : false)
        && !chat.state.sending,
    )
    const sendDisabledReason = computed(() => {
        if (chat.state.persistenceStatus === 'error') {
            return chat.state.persistenceError ?? 'Local chat storage is unavailable'
        }
        if (chat.state.persistenceStatus !== 'ready') return 'Preparing local chat storage'
        if (!selectedProfile.value) return 'Add a provider API key or local endpoint in Settings'
        if (!talosMobileModelProfileIsCallable(selectedProfile.value)) {
            return `Add your ${selectedProfile.value.provider} API key in Settings`
        }
        if (!selectedProviderModel.value) return 'Refresh the selected provider model catalog'
        return ''
    })

    function applyModelSelection(id: string | null): boolean {
        const profile = id ? profiles.value.find((candidate) => candidate.id === id) ?? null : null
        if (!profile || !profile.show_in_composer || !talosMobileModelProfileIsCallable(profile)) return false
        selectedModelId.value = profile.id
        effort.value = clampMobileEffort(profile.effort_levels, effort.value)
        if (!profile.supports_thinking) thinking.value = false
        return true
    }

    function ensureSelection(preferredProvider?: TalosMobileProviderId): void {
        if (applyModelSelection(selectedModelId.value)) return
        const preferred = preferredProvider
            ? profiles.value.find((profile) =>
                profile.provider === preferredProvider
                && profile.show_in_composer
                && talosMobileModelProfileIsCallable(profile),
            )
            : null
        const callable = profiles.value.find((profile) =>
            profile.show_in_composer && talosMobileModelProfileIsCallable(profile),
        )
        const next = preferred ?? callable ?? null
        selectedModelId.value = next?.id ?? null
        effort.value = clampMobileEffort(next?.effort_levels, effort.value)
        if (!next?.supports_thinking) thinking.value = false
    }

    async function refreshSecrets(): Promise<void> {
        await Promise.all(PROVIDER_IDS.map(async (provider) => {
            secrets[provider] = await deps.hasKey(provider)
        }))
        ensureSelection()
    }

    async function refreshProvider(provider: TalosMobileProviderId): Promise<TalosMobileProviderCatalog | null> {
        const adapter = providerAdapterFor(provider)
        const [apiKey, endpoint] = await Promise.all([
            deps.getKey(provider),
            deps.getEndpoint(provider),
        ])
        endpoints[provider] = endpoint
        const timeoutSeconds = modelLabPreferences.value.provider_runtime[provider]?.timeout_seconds
        const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : undefined
        const state = catalogs[provider]
        state.configured = adapter.requiresSecret ? Boolean(apiKey) : Boolean(endpoint)
        if ((adapter.requiresSecret && !apiKey) || (!adapter.requiresSecret && !endpoint)) {
            state.status = 'idle'
            state.error = null
            return null
        }

        state.status = 'loading'
        state.error = null
        try {
            const catalog = await adapter.listModels({ apiKey, endpoint, timeoutMs }, deps.transport)
            state.models = [...catalog.models]
            state.status = state.models.length > 0 ? 'ready' : 'empty'
            state.updatedAt = new Date().toISOString()
            ensureSelection(provider)
            return catalog
        } catch (error) {
            state.status = 'error'
            state.error = safeProviderMessage(error, apiKey)
            throw error
        }
    }

    async function performInit(): Promise<void> {
        try {
            await deps.settings.hydrate()
        } catch (error) {
            preferenceError.value = safeProviderMessage(error, null)
        }
        await chat.initialize()
        if (chat.state.persistenceStatus === 'ready') await attachments.initialize()
        await refreshSecrets()
        await Promise.all(PROVIDER_IDS.map(async (provider) => {
            try {
                await refreshProvider(provider)
            } catch {
                // Each provider owns its actionable error state; another provider can still initialize.
            }
        }))
        const defaults = deps.settings.state.composer_defaults ?? TALOS_DEFAULT_COMPOSER_DEFAULTS
        effort.value = defaults.effort
        thinking.value = defaults.thinking
        const restoredModel = chat.activeSession.value?.active_model_profile_id ?? defaults.model_profile_id
        if (!applyModelSelection(restoredModel)) ensureSelection()
        effort.value = clampMobileEffort(selectedProfile.value?.effort_levels, effort.value)
        if (!selectedProfile.value?.supports_thinking) thinking.value = false
        initialized = true
    }

    async function init(): Promise<void> {
        if (initialized) return
        if (!initialization) {
            initialization = performInit().finally(() => { initialization = null })
        }
        await initialization
    }

    async function persistComposerDefaults(): Promise<void> {
        try {
            await deps.settings.setComposerDefaults({
                model_profile_id: selectedModelId.value,
                effort: effort.value,
                thinking: thinking.value,
            })
            preferenceError.value = null
        } catch (error) {
            preferenceError.value = `TALOS could not save composer preferences. ${safeProviderMessage(error, null)}`
            throw error
        }
    }

    function updateModelLab(
        mutation: (preferences: TalosMobileModelLabPreferences) => void,
    ): Promise<void> {
        const operation = modelLabWrite.then(async () => {
            const candidate = cloneModelLabPreferences(modelLabPreferences.value)
            mutation(candidate)
            const parsed = parseTalosMobileModelLabPreferences(candidate)
            if (parsed === TALOS_DEFAULT_MODEL_LAB_PREFERENCES) {
                throw new Error('TALOS rejected invalid Model Lab preferences.')
            }
            await deps.settings.setModelLabPreferences(parsed)
        })
        modelLabWrite = operation.catch(() => undefined)
        return operation
    }

    async function persistSelectionAfterProjectionChange(previousModelId: string | null): Promise<void> {
        ensureSelection()
        if (selectedModelId.value === previousModelId) return
        const operations: Promise<unknown>[] = [persistComposerDefaults()]
        if (chat.activeSession.value) operations.push(chat.setActiveModelProfile(selectedModelId.value))
        await Promise.all(operations)
    }

    async function setModelVisibility(profileId: string, visible: boolean): Promise<void> {
        if (!profiles.value.some((profile) => profile.id === profileId)) {
            throw new Error('The selected model no longer exists.')
        }
        const previousModelId = selectedModelId.value
        await updateModelLab((preferences) => {
            const current = preferences.model_overrides[profileId] ?? {}
            preferences.model_overrides[profileId] = { ...current, show_in_composer: visible }
        })
        await persistSelectionAfterProjectionChange(previousModelId)
    }

    async function setModelDisplayName(profileId: string, displayName: string): Promise<void> {
        if (!profiles.value.some((profile) => profile.id === profileId)) {
            throw new Error('The selected model no longer exists.')
        }
        const normalized = displayName.trim()
        if (normalized.length > 255) throw new Error('Model display names support at most 255 characters.')
        await updateModelLab((preferences) => {
            const current = preferences.model_overrides[profileId] ?? {}
            const next = { ...current }
            if (normalized) next.display_name = normalized
            else delete next.display_name
            if (Object.keys(next).length) preferences.model_overrides[profileId] = next
            else delete preferences.model_overrides[profileId]
        })
    }

    async function saveManualModel(model: TalosMobileManualModel): Promise<void> {
        await updateModelLab((preferences) => {
            const duplicateIdentity = preferences.manual_models.find((candidate) =>
                candidate.id !== model.id
                && candidate.provider === model.provider
                && candidate.model === model.model,
            )
            if (duplicateIdentity) throw new Error('That provider model ID already has a manual profile.')
            const index = preferences.manual_models.findIndex((candidate) => candidate.id === model.id)
            const copy = {
                ...model,
                input_modalities: [...model.input_modalities],
                output_modalities: [...model.output_modalities],
                supported_parameters: [...model.supported_parameters],
            }
            if (index >= 0) preferences.manual_models[index] = copy
            else preferences.manual_models.push(copy)
        })
        ensureSelection(model.provider)
    }

    async function removeManualModel(id: string): Promise<void> {
        const manual = modelLabPreferences.value.manual_models.find((candidate) => candidate.id === id)
        if (!manual) return
        const previousModelId = selectedModelId.value
        const profileId = `${manual.provider}:${manual.model}`
        const observed = discoveredModels.value.some((model) =>
            model.provider === manual.provider && model.id === manual.model,
        )
        await updateModelLab((preferences) => {
            preferences.manual_models = preferences.manual_models.filter((candidate) => candidate.id !== id)
            if (!observed) {
                delete preferences.model_overrides[profileId]
                delete preferences.probe_results[profileId]
            }
        })
        await persistSelectionAfterProjectionChange(previousModelId)
    }

    async function setProviderTimeout(provider: TalosMobileProviderId, seconds: number): Promise<void> {
        if (!Number.isInteger(seconds) || seconds < 5 || seconds > 300) {
            throw new Error('Provider timeout must be an integer from 5 to 300 seconds.')
        }
        await updateModelLab((preferences) => {
            preferences.provider_runtime[provider] = { timeout_seconds: seconds }
        })
    }

    async function selectModel(id: string): Promise<void> {
        if (!applyModelSelection(id)) return
        const operations: Promise<unknown>[] = [persistComposerDefaults()]
        if (chat.activeSession.value) operations.push(chat.setActiveModelProfile(id))
        await Promise.all(operations)
    }

    async function selectEffort(level: TalosMobileEffortLevel): Promise<void> {
        effort.value = clampMobileEffort(selectedProfile.value?.effort_levels, level)
        await persistComposerDefaults()
    }

    async function setThinking(enabled: boolean): Promise<void> {
        thinking.value = selectedProfile.value?.supports_thinking === true && enabled
        await persistComposerDefaults()
    }

    async function setBrowseMode(enabled: boolean): Promise<void> {
        await chat.initialize()
        await chat.setSurface(enabled ? 'browse' : 'chat')
    }

    async function saveKey(provider: TalosMobileProviderId, key: string): Promise<void> {
        await deps.setKey(provider, key)
        secrets[provider] = true
        await refreshProvider(provider)
        ensureSelection(provider)
    }

    async function removeKey(provider: TalosMobileProviderId): Promise<void> {
        await deps.clearKey(provider)
        secrets[provider] = false
        ensureSelection()
    }

    async function saveEndpoint(provider: TalosMobileProviderId, endpoint: string): Promise<void> {
        await deps.setEndpoint(provider, endpoint)
        endpoints[provider] = endpoint
        await refreshProvider(provider)
        ensureSelection(provider)
    }

    async function removeEndpoint(provider: TalosMobileProviderId): Promise<void> {
        await deps.clearEndpoint(provider)
        endpoints[provider] = null
        const state = catalogs[provider]
        state.configured = false
        state.status = 'idle'
        state.error = null
        state.models = []
        state.updatedAt = null
        ensureSelection()
    }

    async function probeProvider(provider: TalosMobileProviderId): Promise<TalosMobileProviderProbeResult> {
        try {
            const catalog = await refreshProvider(provider)
            if (!catalog) {
                return { ok: false, provider, message: `Configure ${provider} before testing.` }
            }
            const count = catalog.models.length
            return {
                ok: count > 0,
                provider,
                modelId: catalog.models[0]?.id ?? null,
                message: `${count} ${count === 1 ? 'model' : 'models'} available.`,
            }
        } catch (error) {
            return {
                ok: false,
                provider,
                message: catalogs[provider].error ?? safeProviderMessage(error, null),
            }
        }
    }

    async function probeModel(profileId: string): Promise<TalosMobileModelProbeRecord> {
        const profile = profiles.value.find((candidate) => candidate.id === profileId)
        const providerModel = availableProviderModels.value.find((candidate) =>
            candidate.provider === profile?.provider && candidate.id === profile?.model,
        )
        if (!profile || !providerModel) throw new Error('The selected model no longer exists.')

        const [apiKey, endpoint] = await Promise.all([
            deps.getKey(profile.provider),
            deps.getEndpoint(profile.provider),
        ])
        const timeoutSeconds = modelLabPreferences.value.provider_runtime[profile.provider]?.timeout_seconds
        const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : undefined
        const startedAt = Date.now()
        let ok = false
        let message = 'Completion probe failed.'
        try {
            const adapter = providerAdapterFor(profile.provider)
            if (adapter.requiresSecret && !apiKey) throw new Error(`Add your ${profile.provider} API key before testing.`)
            if (!adapter.requiresSecret && !endpoint) throw new Error(`Configure the ${profile.provider} endpoint before testing.`)
            const completion = await adapter.complete({
                model: providerModel,
                turns: [{ role: 'user', content: `Reply exactly ${TALOS_MODEL_PROBE_SENTINEL}` }],
                system: `Return only ${TALOS_MODEL_PROBE_SENTINEL}.`,
                effort: 'off',
                thinking: false,
            }, { apiKey, endpoint, timeoutMs }, deps.transport)
            ok = completion.text.trim() === TALOS_MODEL_PROBE_SENTINEL
            message = ok
                ? 'Completion probe passed.'
                : 'The provider responded, but not with the required probe result.'
        } catch (error) {
            message = safeProviderMessage(error, apiKey)
        }

        const latency = Math.min(300_000, Math.max(0, Date.now() - startedAt))
        const record: TalosMobileModelProbeRecord = {
            profile_id: profile.id,
            provider: profile.provider,
            model: profile.model,
            ok,
            checked_at: new Date().toISOString(),
            latency_ms: latency,
            message: message.slice(0, 500),
        }
        const current = profiles.value.find((candidate) => candidate.id === profile.id)
        if (!current || current.provider !== profile.provider || current.model !== profile.model) {
            throw new Error('The model changed while TALOS was testing it. Retry on the current catalog.')
        }
        await updateModelLab((preferences) => {
            preferences.probe_results[profile.id] = record
        })
        return record
    }

    async function refreshConfiguredProviders(): Promise<void> {
        await Promise.all(PROVIDER_IDS.map(async (provider) => {
            if (!catalogs[provider].configured) return
            try {
                await refreshProvider(provider)
            } catch {
                // The provider catalog keeps its own safe, actionable failure state.
            }
        }))
    }

    function clearPromptEnhancement(): void {
        promptEnhancementRevision += 1
        enhancingPrompt.value = false
        promptEnhancement.value = null
        promptEnhancementError.value = null
    }

    async function enhancePrompt(text: string): Promise<TalosMobilePromptEnhancementResult | null> {
        const revision = ++promptEnhancementRevision
        enhancingPrompt.value = true
        promptEnhancement.value = null
        promptEnhancementError.value = null

        const profile = selectedProfile.value
        const providerModel = selectedProviderModel.value
        let apiKey: string | null = null
        try {
            const promptModule = await import('@/lib/chat/promptEnhancement')
            if (revision !== promptEnhancementRevision) return null
            const [storedKey, endpoint] = profile
                ? await Promise.all([
                    deps.getKey(profile.provider),
                    deps.getEndpoint(profile.provider),
                ])
                : [null, null]
            apiKey = storedKey
            if (revision !== promptEnhancementRevision) return null
            const timeoutSeconds = profile
                ? modelLabPreferences.value.provider_runtime[profile.provider]?.timeout_seconds
                : undefined

            const result = await promptModule.runTalosMobilePromptEnhancement(
                {
                    profile,
                    providerModel,
                    apiKey,
                    endpoint,
                    timeoutMs: timeoutSeconds ? timeoutSeconds * 1000 : undefined,
                    effort: effort.value,
                    thinking: thinking.value,
                },
                text,
                deps.transport,
            )
            if (revision !== promptEnhancementRevision) return null

            promptEnhancement.value = result
            return result
        } catch (error) {
            if (revision !== promptEnhancementRevision) return null
            const safeMessage = safeProviderMessage(error, apiKey)
            promptEnhancementError.value = safeMessage
            if (error instanceof Error && error.message === safeMessage) throw error
            throw new Error(safeMessage)
        } finally {
            if (revision === promptEnhancementRevision) enhancingPrompt.value = false
        }
    }

    // R2-8 — station facades live in stores/stationFacades.ts (the controller
    // was a 1000+ line god-facade); same public surface, same guarantees.
    const { memories, tasks, notes } = createStationFacades({
        repository: deps.chatRepository,
        activeSessionId: () => chat.activeSession.value?.id ?? null,
    })

    async function send(text: string): Promise<boolean> {
        clearPromptEnhancement()
        preferVisionProfileForAttachments()
        const accepted = await chat.send(
            text,
            selectedModelId.value,
            // Perf review 2026-07-25: the two retrievals run in PARALLEL (they were
            // sequential awaits in the argument list, so both completed before the
            // user's own turn was even appended — the composer emptied and nothing
            // appeared for the duration).
            Object.assign({}, ...await Promise.all([prepareMemoryInjection(), prepareLibraryInjection(text)])),
            attachments.bindings.value,
            // Owner 2026-07-24: clear the composer's attachments the instant the
            // user turn is COMMITTED — not after the whole generation, which left
            // the sent file lingering in the composer for the entire response.
            () => attachments.clearSent(),
        )
        return accepted
    }

    async function resendMessage(messageId: string): Promise<void> {
        clearPromptEnhancement()
        const message = chat.messages.find((candidate) => candidate.id === messageId)
        if (!message || message.role !== 'user') throw new Error('TALOS could not find the message to resend.')
        const [memoryMeta, libraryMeta] = await Promise.all([
            prepareMemoryInjection(), prepareLibraryInjection(message.content),
        ])
        await chat.send(message.content, selectedModelId.value, {
            ...memoryMeta,
            ...libraryMeta,
            command_id: 'resend_message',
            resend_of_message_id: message.id,
        })
    }

    async function retryAssistantMessage(messageId: string): Promise<void> {
        clearPromptEnhancement()
        const index = chat.messages.findIndex((candidate) => candidate.id === messageId)
        const message = index >= 0 ? chat.messages[index] : null
        if (!message || message.role !== 'assistant') throw new Error('TALOS could not find the response to retry.')
        const previousUser = chat.messages.slice(0, index).reverse().find((candidate) => candidate.role === 'user')
        if (!previousUser) throw new Error('TALOS could not find the prompt that produced this answer.')
        const [memoryMeta, libraryMeta] = await Promise.all([
            prepareMemoryInjection(), prepareLibraryInjection(previousUser.content),
        ])
        await chat.send(previousUser.content, selectedModelId.value, {
            ...memoryMeta,
            ...libraryMeta,
            command_id: 'retry_assistant_response',
            retry_of_message_id: message.id,
            resend_of_message_id: previousUser.id,
        })
    }

    async function newSession(): Promise<void> {
        clearPromptEnhancement()
        await chat.createSession('New chat', selectedModelId.value)
    }

    async function selectSession(sessionId: string): Promise<void> {
        clearPromptEnhancement()
        await chat.selectSession(sessionId)
        const restoredModel = chat.activeSession.value?.active_model_profile_id
        if (restoredModel) applyModelSelection(restoredModel)
    }

    async function renameSession(sessionId: string, title: string): Promise<void> {
        await chat.renameSession(sessionId, title)
    }

    async function deleteSession(sessionId: string): Promise<void> {
        clearPromptEnhancement()
        await chat.deleteSession(sessionId)
        const restoredModel = chat.activeSession.value?.active_model_profile_id
        if (restoredModel) applyModelSelection(restoredModel)
    }

    /**
     * Which Library files a chat would take with it (owner 2026-07-26).
     *
     * Read straight off the vault list the Library already keeps loaded, so the
     * confirmation can name a count without a query, and computed by the same
     * function that does the deleting — a dialog that says "3 files" and then
     * removes 5 is worse than one that says nothing.
     */
    function planSessionCleanup(sessionId: string): TalosSessionCleanupPlan {
        return planTalosSessionCleanup(attachments.vaultFiles, sessionId)
    }

    /** Remove those files. Returns the ids it could NOT delete. */
    async function deleteSessionMedia(sessionId: string): Promise<string[]> {
        const plan = planSessionCleanup(sessionId)
        const ids = [...plan.documents, ...plan.sources].map((file) => file.id)
        return attachments.deleteVaultFiles(ids)
    }

    // R2-7 — ONE orchestration point for session actions. The composer draft
    // controller lives in ChatScreen (the persistent base), which registers
    // its orchestrated actions (draft flush + attachment revocation + scope
    // re-activation) here. Every other surface (Chats page, tablet panel,
    // sidebar) calls THROUGH this facade — before R2, delete-from-Chats
    // skipped attachment revocation entirely. Errors PROPAGATE so each
    // surface keeps its own error UX (dialog vs toast). Bare methods are the
    // fallback when no orchestrator is registered (tests, early boot).
    let sessionOrchestrator: TalosSessionOrchestrator | null = null
    const sessionLifecycle: TalosSessionLifecycle = {
        register(value) { sessionOrchestrator = value },
        unregister(value) { if (sessionOrchestrator === value) sessionOrchestrator = null },
        newSession: () => (sessionOrchestrator ?? { newSession }).newSession(),
        selectSession: (sessionId) => sessionOrchestrator
            ? sessionOrchestrator.selectSession(sessionId)
            : selectSession(sessionId),
        renameSession: (sessionId, title) => sessionOrchestrator
            ? sessionOrchestrator.renameSession(sessionId, title)
            : renameSession(sessionId, title),
        deleteSession: (sessionId) => sessionOrchestrator
            ? sessionOrchestrator.deleteSession(sessionId)
            : deleteSession(sessionId),
    }

    return {
        sessionLifecycle,
        catalogs: readonly(catalogs) as Readonly<Record<TalosMobileProviderId, ProviderCatalogState>>,
        endpoints: readonly(endpoints) as Readonly<Record<TalosMobileProviderId, string | null>>,
        modelLabPreferences,
        profiles,
        selectedModelId,
        selectedProfile,
        selectedProviderModel,
        effort,
        effortLadder,
        thinking,
        toolActivity,
        pendingToolConsent,
        denyPendingToolConsent,
        clearSessionToolConsent,
        /**
         * The vault ids attached anywhere in one chat — the half of "this
         * chat's media" that metadata cannot answer, since a document picked
         * from the global Library keeps its original chat's origin.
         *
         * A thin pass-through so the shell does not reach into the repository
         * itself: App.vue owning a query would put persistence knowledge in the
         * one file that should only compose surfaces.
         */
        listChatMediaFileIds: (sessionId: string) =>
            deps.chatRepository.listSessionAttachmentFileIds(sessionId),
        canSend,
        browseMode,
        sendDisabledReason,
        preferenceError: readonly(preferenceError),
        enhancingPrompt: readonly(enhancingPrompt),
        promptEnhancement: readonly(promptEnhancement),
        promptEnhancementError: readonly(promptEnhancementError),
        attachments,
        chat,
        secrets: readonly(secrets),
        init,
        refreshSecrets,
        refreshProvider,
        refreshConfiguredProviders,
        probeProvider,
        probeModel,
        setModelVisibility,
        setModelDisplayName,
        saveManualModel,
        removeManualModel,
        setProviderTimeout,
        selectModel,
        selectEffort,
        setThinking,
        setBrowseMode,
        saveKey,
        removeKey,
        saveEndpoint,
        removeEndpoint,
        newSession,
        selectSession,
        renameSession,
        deleteSession,
        planSessionCleanup,
        deleteSessionMedia,
        /** Owner 2026-07-26: what the Doctor reads to show where time went. */
        traces: () => traceRecorder.sends(),
        clearTraces: () => traceRecorder.clear(),
        memories,
        tasks,
        notes,
        resendMessage,
        retryAssistantMessage,
        send,
        enhancePrompt,
        clearPromptEnhancement,
    }
}

let singleton: ChatController | null = null

export function useChatController(): ChatController {
    if (!singleton) singleton = createChatController()
    return singleton
}

export function __resetChatControllerForTests(): void {
    singleton = null
}
