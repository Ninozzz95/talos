<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TalosExportDialog from '../chat/TalosExportDialog.vue'
import TalosDeleteSessionDialog from '../chat/TalosDeleteSessionDialog.vue'
import TalosChatSurface from './TalosChatSurface.vue'
import TalosComposerDock from './TalosComposerDock.vue'
import TalosLeftRail from './TalosLeftRail.vue'
import TalosMobileRail from './TalosMobileRail.vue'
import TalosWorkspaceHeader from './TalosWorkspaceHeader.vue'
import TalosCommandPalette from '../shell/TalosCommandPalette.vue'
import { talosFetch } from '../../../lib/api'
import { useTalosChat } from '../../../composables/useTalosChat'
import { useTalosChatAttachments } from '../../../composables/useTalosChatAttachments'
import { useTalosChatViewport } from '../../../composables/useTalosChatViewport'
import { useTalosChatLayoutPreferences } from '../../../composables/useTalosChatLayoutPreferences'
import { useTalosComposerAvailability } from '../../../composables/useTalosComposerAvailability'
import { useTalosContextVault } from '../../../composables/useTalosContextVault'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import { useTalosMessageEvidence } from '../../../composables/useTalosMessageEvidence'
import { useTalosModelRoutingProfiles } from '../../../composables/useTalosModelRoutingProfiles'
import { useTalosPromptEnhancement } from '../../../composables/useTalosPromptEnhancement'
import { useTalosDictation } from '../../../composables/useTalosDictation'
import { talosFirstUrl } from '../../../lib/talosUrlDetect'
import { useTalosRailResize } from '../../../composables/useTalosRailResize'
import { useTalosIntroState, type TalosIntroOutcome } from '../../../composables/useTalosIntroState'
import { sessionChatState, useTalosSessions } from '../../../composables/useTalosSessions'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import { useTalosToast } from '../../../composables/useTalosToast'
import { useTalosRailPreferences } from '../../../composables/useTalosRailPreferences'
import { dismissTopTalosOverlay, registerTalosDismiss } from '../../../composables/useTalosDismissStack'
import { useTalosShortcuts } from '../../../composables/useTalosShortcuts'
import { useTalosWorkspaceWindows } from '../../../composables/useTalosWorkspaceWindows'
import { useTalosWorkspaceLocalPreferences } from '../../../composables/useTalosWorkspaceLocalPreferences'
import { useTalosWorkspaceBrowse } from '../../../composables/useTalosWorkspaceBrowse'
import { useTalosWorkspaceTheme } from '../../../composables/useTalosWorkspaceTheme'
import { useTalosWorkspaceThemeActions } from '../../../composables/useTalosWorkspaceThemeActions'
import { useTalosWorkspaceSessionActions } from '../../../composables/useTalosWorkspaceSessionActions'
import { useTalosWorkspaceChatActions } from '../../../composables/useTalosWorkspaceChatActions'
import { useTalosToolApprovals } from '../../../composables/useTalosToolApprovals'
import { useTalosWorkspaceCommandActions } from '../../../composables/useTalosWorkspaceCommandActions'
import { useTalosWorkspaceBootstrap } from '../../../composables/useTalosWorkspaceBootstrap'
import { talosCommands } from '../../../lib/commandRegistry'
import { resolveTalosMissionPathVisibility } from '../../../lib/talosAppearancePreferences'
import { TALOS_DEFAULT_THEME, type TalosThemeCustomization, type TalosThemeId } from '../../../lib/talosThemes'
import { resolveTalosWindowReflow } from '../../../lib/talosWindowReflow'
import { talosClampEffort, talosProfileEffortLevels, talosProfileVisibleInComposer } from '../../../lib/talosEffort'
import type { TalosPublicLinks } from '../../../lib/talosPublicLinks'
import type { TalosCommand, TalosContextSet, TalosPendingToolApproval } from '../../../lib/talosTypes'
const TalosProceduralBackground = defineAsyncComponent(() => import('./TalosProceduralBackground.vue'))
const TalosWindowLayer = defineAsyncComponent(() => import('./TalosWindowLayer.vue'))
const TalosIntroModal = defineAsyncComponent(() => import('./TalosIntroModal.vue'))
// The native Sonner toaster (vue-sonner runtime + reka-free wrapper + lucide
// icons) is shell furniture rendered once; loading it behind a dynamic boundary
// keeps it out of the initial static chunk without changing toast behavior.
const Toaster = defineAsyncComponent(() => import('../../ui/sonner').then((module) => module.Toaster))
type InitialSurface = 'workspace' | 'chat' | 'dashboard' | 'browse'; const talosShortLogoUrl = '/talos/brand/logo-short.svg'
const props = withDefaults(defineProps<{
    initialSurface?: InitialSurface
    authenticated?: boolean
    authUserName?: string
    loginUrl?: string
    logoutUrl?: string
    csrfToken?: string
    devBrowserEvidence?: boolean
    developmentMode?: boolean
    publicLinks?: TalosPublicLinks
}>(), {
    initialSurface: 'workspace',
    authenticated: false,
    authUserName: '',
    loginUrl: '/login',
    logoutUrl: '/logout',
    csrfToken: '',
    devBrowserEvidence: false,
    developmentMode: false,
    publicLinks: () => ({}),
})
const theme = ref<TalosThemeId>(TALOS_DEFAULT_THEME)
const chatSurface = ref<{ scrollToBottom: () => void } | null>(null); const workspaceRoot = ref<HTMLElement | null>(null)
const workspaceRuntimeReady = ref(false)
const chatViewport = useTalosChatViewport(), composerHeight = chatViewport.composerHeight
const uiError = ref<string | null>(null)
const prompt = ref('')
const {
    status: dictationStatus,
    supported: dictationSupported,
    toggle: toggleDictation,
} = useTalosDictation({
    onTranscript: (text) => { prompt.value = prompt.value ? `${prompt.value} ${text}` : text },
})
const sending = ref(false)
const selectedBenchmarkScenarioRef = ref<string | null>(null)
const selectedModelProfileId = ref('')
const selectedModelRoutingProfileId = ref('')
const selectedEffort = ref<string>('high')
const thinking = ref(false)
const selectedContextSetId = ref('')
const browserEvidenceAttached = ref(true)
const railCollapsed = ref(false), railWidth = ref(236), mobileNavigationOpen = ref(false)
const { startRailResize } = useTalosRailResize(railCollapsed, railWidth)
const themeDraftCustomization = ref<TalosThemeCustomization | null>(null)
const {
    loadWorkspacePreferences,
    saveWorkspacePreferences,
} = useTalosWorkspaceLocalPreferences({
    theme,
    selectedModelProfileId,
    selectedModelRoutingProfileId,
    selectedContextSetId,
    selectedEffort,
    thinking,
})
const {
    sessions,
    activeSession,
    messages,
    loadingSessions,
    loadingMessages,
    exportingSession,
    sessionError,
    messageError,
    sessionExportError,
    loadSessions,
    createSession,
    updateSessionTitle,
    toggleSessionFavorite,
    toggleManagedSessionSelected,
    archiveSession,
    moveSessionToFolder,
    deleteSession,
    copySession,
    selectSession,
    updateSessionMetadata,
    createMessage,
    acceptPersistedMessage,
    exportSession,
} = useTalosSessions('chat')
let restoreBrowseForActiveSession: () => Promise<void> = async () => undefined
let clearPrompt: () => void = () => undefined
let setCommandFeedback: (message: string) => void = () => undefined
const sessionActions = useTalosWorkspaceSessionActions({
    activeSession,
    messages,
    loadingMessages,
    exportingSession,
    sessionExportError,
    uiError,
    setFeedback: (message) => setCommandFeedback(message),
    clearPrompt: () => clearPrompt(),
    scrollChat,
    restoreBrowseForActiveSession: () => restoreBrowseForActiveSession(),
    createSession,
    updateSessionTitle,
    toggleSessionFavorite,
    toggleManagedSessionSelected,
    archiveSession,
    moveSessionToFolder,
    deleteSession,
    copySession,
    selectSession,
    exportSession,
})
const {
    sessionPersistenceMode, creatingSession, pendingDeleteSession, deletingSession, exportDialogOpen, sessionExportResult,
    startNewChat, chooseSession, renameChatSession, favoriteChatSession, toggleChatSelection, archiveChatSession,
    moveChatSession, requestDeleteSession, confirmDeleteSession, copyChatSession, ensureSessionForPrompt, toggleTemporaryMode,
    openSessionExportDialog, closeSessionExportDialog, runSessionExport,
} = sessionActions
const { expandedEvidenceMessageIds, toggleMessageEvidence, previousUserMessageFor } = useTalosMessageEvidence(messages)
const lastUserPrompt = computed(() => {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
        if (messages.value[index].role === 'user') return messages.value[index].content
    }
    return null
})
const {
    browseModeEnabled,
    isBrowseSurface,
    activeBrowserSession, browserCurrentPage,
    browserMode, browseSetupFault,
    browserContext,
    visibleBrowserActivities,
    latestBrowserScreenshot,
    latestBrowserSnapshot,
    browserTasks,
    browserTaskBusy,
    browserTaskError,
    browserTaskCommandTargetId,
    browserInteractionPending,
    browserInteractionError,
    pendingBrowserInteractionApproval,
    toggleBrowseMode,
    handleEnableBrowse,
    handleDisableBrowse, handleStopBrowse,
    handleRestartBrowse,
    handleCaptureScreenshot,
    handleCaptureSnapshot,
    openBrowse,
    recordBrowserActivities,
    restoreBrowseForActiveSession: restoreBrowseForActiveSessionAction,
    initializeBrowse,
    interactWithBrowserFrame,
    confirmBrowserFrameInteraction,
    cancelBrowserTask,
} = useTalosWorkspaceBrowse(
    props.initialSurface === 'browse',
    uiError,
    computed(() => activeSession.value?.id ?? null),
    async () => {
        const session = activeSession.value ?? await createSession('New chat', sessionPersistenceMode.value)
        return session.id
    },
    {
        shouldRestore: (sessionId) => activeSession.value?.id === sessionId
            && sessionChatState(activeSession.value).browse_enabled,
        persistEnabled: async (sessionId, enabled) => {
            const session = activeSession.value?.id === sessionId
                ? activeSession.value
                : sessions.value.find((candidate) => candidate.id === sessionId) ?? null
            if (!session) return
            await updateSessionMetadata(sessionId, {
                chat_state: {
                    ...sessionChatState(session),
                    browse_enabled: enabled,
                },
            })
        },
    },
    { devBrowserEvidence: props.devBrowserEvidence, taskActivity: sending },
)
restoreBrowseForActiveSession = restoreBrowseForActiveSessionAction
const {
    pendingApprovals: pendingToolApprovals,
    decidingApprovalIds,
    approvalError: toolApprovalError,
    replacePendingApprovals: recordPendingToolApprovals,
    hydratePendingApprovals,
    decideToolApproval,
} = useTalosToolApprovals(computed(() => activeSession.value?.id ?? null))
const { persistUserMessage, persistAssistantMessage, sendPersistentChat } = useTalosChat()
const attachmentTray = useTalosChatAttachments()
const attachmentVaultFiles = ref<Array<{ id: string; original_name: string; status: string }>>([])
const attachmentVaultLoading = ref(false)
async function handleOpenAttachmentVault() {
    attachmentVaultLoading.value = true
    try {
        const response = await talosFetch<{ data: Array<{ id: string; original_name: string; status: string }> }>('/api/talos/files')
        attachmentVaultFiles.value = response.data.filter((file) => file.status === 'available')
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load Vault files.'
    } finally {
        attachmentVaultLoading.value = false
    }
}
async function handleAttachFiles(files: File[]) {
    for (const file of files) {
        try {
            await attachmentTray.attachFile(file)
        } catch (error) {
            uiError.value = error instanceof Error ? error.message : 'TALOS could not ingest this attachment.'
        }
    }
}
async function handleAttachVaultFile(fileId: string) {
    const vaultFile = attachmentVaultFiles.value.find((file) => file.id === fileId)
    if (!vaultFile) return
    try {
        await attachmentTray.attachVaultFile(vaultFile as never)
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not attach this Vault file.'
    }
}
async function handleRemoveAttachment(attachmentId: string) {
    try {
        await attachmentTray.remove(attachmentId)
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not revoke this attachment grant.'
    }
}
watch(() => activeSession.value?.id ?? null, async (sessionId) => {
    attachmentTray.reset()
    try {
        await hydratePendingApprovals(sessionId)
    } catch (error) {
        uiError.value = error instanceof Error
            ? error.message
            : 'TALOS could not restore pending browser approvals.'
    }
}, { flush: 'post' })
async function handleToolApprovalDecision(approval: TalosPendingToolApproval, decision: 'approve' | 'reject') {
    const sessionId = activeSession.value?.id ?? null
    if (!sessionId) return
    uiError.value = null
    try {
        const response = await decideToolApproval(approval, decision)
        if (activeSession.value?.id !== sessionId) return
        await recordBrowserActivities(response.browser_activities)
        const assistantMessage = await persistAssistantMessage(sessionId, response, createMessage)
        if (assistantMessage) acceptPersistedMessage(assistantMessage)
        setCommandFeedback(decision === 'approve'
            ? 'Browser action approved and resumed.'
            : 'Browser action rejected.')
        await nextTick()
        scrollChat()
    } catch (error) {
        if (activeSession.value?.id === sessionId) {
            try {
                await hydratePendingApprovals(sessionId)
            } catch {
                // Preserve the original decision error; hydration exposes its own state separately.
            }
            uiError.value = error instanceof Error
                ? error.message
                : 'TALOS could not apply this browser approval.'
        }
    }
}
const {
    modelProfiles,
    callableModelProfiles,
    loadingModelProfiles,
    modelProfileError,
    loadModelProfiles,
    findModelProfile,
} = useTalosModelProfiles()
const {
    modelRoutingProfiles,
    usableModelRoutingProfiles,
    loadingModelRoutingProfiles,
    modelRoutingProfileError,
    loadModelRoutingProfiles,
    findModelRoutingProfile,
} = useTalosModelRoutingProfiles()
const {
    contextSets,
    loadingContextSets,
    contextSetError,
    loadContextSets,
} = useTalosContextVault()
const {
    settings: workspaceSettings,
    settingsLoadState: workspaceSettingsLoadState,
    loadSettings: loadWorkspaceSettings,
    updateSettings: updateWorkspaceSettings,
} = useTalosSettings()
const railPreferences = useTalosRailPreferences({
    load: async () => {
        const stored = workspaceSettings.value?.preferences?.sidebar_rail
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null
        const record = stored as Record<string, unknown>
        return {
            order: Array.isArray(record.order) ? record.order.filter((id): id is string => typeof id === 'string') : undefined,
            collapsedGroups: Array.isArray(record.collapsed_groups) ? record.collapsed_groups.filter((id): id is string => typeof id === 'string') : undefined,
            collapsed: typeof record.collapsed === 'boolean' ? record.collapsed : undefined,
        }
    },
    persist: async (value) => {
        await updateWorkspaceSettings({
            preferences: {
                sidebar_rail: {
                    order: value.order,
                    collapsed_groups: value.collapsedGroups,
                    collapsed: value.collapsed,
                },
            },
        }, 'Sidebar layout saved.')
    },
    knownItemIds: ['runtime', 'calendar', 'compare', 'model_lab', 'research', 'gallery', 'library', 'browse'],
})
const {
    loading: enhancingPrompt,
    error: promptEnhancementError,
    result: promptEnhancementResult,
    enhancePrompt,
    clearPromptEnhancement,
} = useTalosPromptEnhancement()
const {
    bubbleScale,
    bubbleScaleLabel,
    composerMode,
    messageStyle,
    advancedRailExpanded,
    mobileWindowPresentation,
    policyLocked: chatLayoutPolicyLocked,
    apply: applyChatLayoutPreference,
    decrementBubbleScale,
    incrementBubbleScale,
    resetBubbleScale,
    toggleAdvancedRail,
    setMessageStyle,
} = useTalosChatLayoutPreferences(workspaceSettings, updateWorkspaceSettings, uiError)
const {
    themeMode: workspaceThemeMode, resolvedThemeMode: workspaceResolvedThemeMode,
    shellClass,
    appearanceVisibility: workspaceAppearanceVisibility, keyboardShortcuts: workspaceKeyboardShortcuts,
    uiAnimationProfile: workspaceUiAnimationProfile, uiMotionDisabled: workspaceUiMotionDisabled,
    motionV6Preferences: workspaceMotionV6Preferences,
    motionV6Decision: workspaceMotionV6Decision,
    motionV6SceneInput: workspaceMotionV6SceneInput,
    motionV6SceneId: workspaceMotionV6SceneId,
    motionV6GovernorSnapshot: workspaceMotionV6GovernorSnapshot,
    recordMotionFrame: recordWorkspaceMotionFrame,
    recordMotionStableWindow: recordWorkspaceMotionStableWindow,
    recordMotionRendererFault: recordWorkspaceMotionRendererFault,
    currentRailWidth,
    workspaceStyle,
} = useTalosWorkspaceTheme({
    theme,
    themeDraftCustomization,
    workspaceSettings,
    workspaceRoot,
    railCollapsed,
    railWidth,
    bubbleScale,
})
const {
    openWindowIds,
    visibleWindowIds,
    minimizedWindowIds,
    dockedWindowIds,
    fullscreenWindowIds,
    activeWindowId,
    windowPositions,
    windowSizes,
    windowRestoreBounds,
    windowTileTargets,
    windowZIndexes,
    openWindow,
    closeWindow,
    minimizeWindow,
    toggleDock,
    toggleFullscreenWindow,
    focusWindow,
    setWindowPosition,
    setWindowBounds,
    resetWindowSize,
    restoreWindow,
    snapWindow,
    tileWindow,
    untileWindow,
    saveWindowLayout,
    windowLaunchOrigins,
    windowLaunchRevisions,
    openWindowFromSource, breakpoint,
    area: windowArea,
    tileArea: windowTileArea,
    maximizeArea: windowMaximizeArea,
    fullscreenArea: windowFullscreenArea,
} = useTalosWorkspaceWindows({
    initialOpen: props.initialSurface === 'dashboard' ? ['runtime'] : [],
    currentRailWidth, composerHeight,
})
const windowReflow = computed(() => resolveTalosWindowReflow(
    visibleWindowIds.value,
    windowTileTargets.value,
    breakpoint.value,
    windowSizes.value,
    dockedWindowIds.value,
))
const showMissionPath = computed(() => resolveTalosMissionPathVisibility({
    developmentMode: props.developmentMode,
    breakpoint: breakpoint.value,
    preferenceEnabled: workspaceAppearanceVisibility.value.chat_area.mission_path,
}))
const windowReflowStyle = computed(() => {
    const halfTileWidth = Math.max(0, (windowTileArea.value.right - windowTileArea.value.left) / 2)
    const leftWidth = windowReflow.value.leftWidth || halfTileWidth
    const rightWidth = windowReflow.value.rightWidth || halfTileWidth
    return {
        '--talos-window-reflow-left': `${windowReflow.value.reserveLeft ? leftWidth : 0}px`,
        '--talos-window-reflow-right': `${windowReflow.value.reserveRight ? rightWidth : 0}px`,
    }
})
watch(
    () => windowReflow.value.collapseRail,
    (collapseRail) => {
        if (collapseRail) railCollapsed.value = true
    },
    { immediate: true, flush: 'sync' },
)
const workspaceBootstrap = useTalosWorkspaceBootstrap({
    uiError,
    theme,
    selectedModelProfileId,
    selectedModelRoutingProfileId,
    selectedContextSetId,
    callableModelProfiles,
    usableModelRoutingProfiles,
    loadModelProfiles,
    loadModelRoutingProfiles,
    loadContextSets,
    saveWorkspacePreferences,
    loadWorkspacePreferences,
    loadWorkspaceSettings,
    applyChatLayoutPreference,
    openWindowFromSource,
    loadSessions,
    selectSession,
    restoreBrowseForActiveSession: restoreBrowseForActiveSessionAction,
    scrollChat,
    initializeBrowse,
})
watch(callableModelProfiles, () => {
    workspaceBootstrap.reconcileModelSelection()
})
const {
    toggleTheme,
    refreshWorkspaceSettingsAfterThemeUpdate,
    handleWorkspaceSettingsSaved,
    handleThemeDraftChanged,
} = useTalosWorkspaceThemeActions({
    theme,
    themeDraftCustomization,
    workspaceSettings,
    uiError,
    updateWorkspaceSettings,
    loadPersistedWorkspaceSettings: workspaceBootstrap.loadPersistedWorkspaceSettings,
    applyChatLayoutPreference,
    saveWorkspacePreferences,
})
const selectedModelProfile = computed(() => findModelProfile(selectedModelProfileId.value))
const selectedModelProvider = computed(() => selectedModelProfile.value?.provider ?? null)
// Composer only lists profiles the operator kept visible (show_in_composer).
const composerModelProfiles = computed(() => modelProfiles.value.filter(talosProfileVisibleInComposer))
const selectedProfileEffortLevels = computed(() => talosProfileEffortLevels(selectedModelProfile.value))
const selectedProfileSupportsThinking = computed(() => selectedModelProfile.value?.supports_thinking === true)
const selectedContextSet = computed(() => contextSets.value.find((contextSet) => contextSet.id === selectedContextSetId.value) ?? null)
const selectedModelProfileIsUsable = computed(() => callableModelProfiles.value.some((profile) => profile.id === selectedModelProfileId.value))
const selectedModelRoutingProfile = computed(() => findModelRoutingProfile(selectedModelRoutingProfileId.value))
const selectedModelRoutingProfileIsUsable = computed(() => Boolean(
    selectedModelRoutingProfile.value
    && selectedModelRoutingProfile.value.status === 'enabled'
    && selectedModelRoutingProfile.value.lanes.length > 0,
))
const selectedChatPrimaryModelProfileId = computed(() => selectedModelProfileId.value
    || selectedModelRoutingProfile.value?.lanes[0]?.model_profile_id
    || '')
const selectedModelSelectionIsUsable = computed(() => selectedModelProfileIsUsable.value || selectedModelRoutingProfileIsUsable.value)
const messageEvidenceReady = computed(() => messages.value.some((message) => message.role === 'assistant' && Boolean(message.run_id)))
const activeSessionIsTemporary = computed(() => activeSession.value?.persistence_mode === 'temporary')
const activeWelcomePromptId = computed(() => (
    typeof activeSession.value?.metadata?.welcome_prompt_id === 'string'
        ? activeSession.value.metadata.welcome_prompt_id
        : null
))
const hasFailedAttachments = computed(() => (
    attachmentTray.attachments.value.some((attachment) => attachment.status === 'failed')
))
const { browserReadyForSend, canSend, sendDisabledReason: sendMessageCommandDisabledReason } = useTalosComposerAvailability(
    {
        prompt,
        sending,
        modelSelectionUsable: selectedModelSelectionIsUsable,
        browserMode,
        activeBrowserSession,
        hasFailedAttachments,
    },
)
const selectedBenchmarkScenarioIsRunnable = computed(() => {
    return Boolean(selectedBenchmarkScenarioRef.value?.trim())
})
const runAvmCompareCommandDisabledReason = computed(() => {
    if (selectedBenchmarkScenarioIsRunnable.value) {
        return ''
    }
    return 'Select a private benchmark scenario from Context Vault before running AVM compare.'
})
const exportReportCommandDisabledReason = computed(() => {
    if (!activeSession.value) {
        return 'Start or select a chat session before exporting evidence.'
    }
    return ''
})
const workspaceCommands = computed<TalosCommand[]>(() => talosCommands.map((command) => {
    if (command.id === 'send_message') {
        return {
            ...command,
            disabledReason: sendMessageCommandDisabledReason.value || undefined,
        }
    }
    if (command.id === 'run_avm_compare') {
        return {
            ...command,
            disabledReason: runAvmCompareCommandDisabledReason.value || undefined,
        }
    }
    if (command.id === 'export_report') {
        return {
            ...command,
            disabledReason: exportReportCommandDisabledReason.value || undefined,
        }
    }
    return command
}))
let chatActions: ReturnType<typeof useTalosWorkspaceChatActions> | null = null
const commandActions = useTalosWorkspaceCommandActions({
    workspaceCommands,
    setFeedback: (message) => setCommandFeedback(message),
    openWindowFromSource,
    dockedWindowIds,
    toggleDock,
    toggleBrowseMode,
    onNewSession: () => startNewChat(),
    onSendChat: () => chatActions?.sendChat() ?? Promise.resolve(false),
    onOpenBrowse: () => openBrowseFromComposer(null),
    onRunBenchmark: () => chatActions?.runSelectedBenchmarkScenario() ?? Promise.resolve(),
    onOpenExport: () => {
        commandActions.closeCommandPalette()
        commandActions.closePopover()
        openSessionExportDialog()
    },
    exportDisabledReason: exportReportCommandDisabledReason,
    clearPromptEnhancement,
})
setCommandFeedback = commandActions.setFeedback
const {
    commandPaletteOpen,
    modelPopoverOpen,
    contextPopoverOpen,
    runtimeRequestedTab,
    runtimeRequestedTabRevision,
    settingsRequestedTab,
    settingsRequestedTabRevision,
    requestedWindowSections,
    requestedWindowSectionRevision,
    openSettings,
    openAccountSettings,
    openModule,
    closePopover,
    toggleModelPopover,
    toggleContextPopover,
    focusCommandRoute,
    selectCommand,
    openCommandPalette,
    closeCommandPalette,
    openAuditLogFromRuntime,
} = commandActions
const workspaceChatActions = useTalosWorkspaceChatActions({
    prompt,
    sending,
    activeSession,
    messages,
    uiError,
    setFeedback: (message) => setCommandFeedback(message),
    modelSelectionIsUsable: selectedModelSelectionIsUsable,
    browserReadyForSend,
    browseModeEnabled,
    activeBrowserSession,
    selectedModelProfileId,
    selectedModelRoutingProfileId,
    selectedContextSetId,
    selectedEffort,
    thinking,
    ensureSessionForPrompt,
    persistUserMessage,
    sendPersistentChat,
    createMessage,
    acceptPersistedMessage,
    centerMessage: chatViewport.centerMessage,
    recordBrowserActivities,
    recordPendingToolApprovals,
    openSettings: () => openSettings(),
    openModelPopover: () => toggleModelPopover(),
    closePopover,
    openCompare: () => openWindowFromSource('compare', undefined, 'command'),
    previousUserMessageFor,
    scrollChat,
    selectedBenchmarkScenarioRef,
    selectedBenchmarkScenarioIsRunnable,
    benchmarkDisabledReason: runAvmCompareCommandDisabledReason,
    attachmentTray,
})
chatActions = workspaceChatActions
clearPrompt = () => {
    if (chatActions) chatActions.prompt.value = ''
}
const {
    benchmarkingRunId,
    selectedBenchmarkGroupId,
    sendChat,
    resendMessage,
    retryAssistantMessage,
    benchmarkMessageRun,
    runSelectedBenchmarkScenario,
} = workspaceChatActions
const modelLabel = computed(() => {
    if (selectedModelProfile.value) {
        return selectedModelProfile.value.display_name
    }
    if (selectedModelRoutingProfile.value) {
        return `${selectedModelRoutingProfile.value.name} route`
    }
    if (loadingModelProfiles.value) {
        return 'Loading model'
    }
    return 'Configure model'
})
const contextLabel = computed(() => {
    if (selectedContextSet.value) {
        return selectedContextSet.value.name
    }
    if (loadingContextSets.value) {
        return 'Loading context'
    }
    return 'No context'
})
const statusText = computed(() => {
    if (sending.value) {
        return 'Processing'
    }
    if (selectedModelRoutingProfileIsUsable.value) {
        const context = selectedContextSet.value ? ` + ${selectedContextSet.value.name}` : ''
        return `${selectedModelRoutingProfile.value?.name} route${context}`
    }
    if (selectedModelProfileIsUsable.value) {
        const context = selectedContextSet.value ? ` + ${selectedContextSet.value.name}` : ''
        return `${selectedModelProfile.value?.display_name}${context}`
    }
    if (modelRoutingProfiles.value.length > 0) {
        return 'Choose a usable model routing profile'
    }
    if (modelProfiles.value.length > 0) {
        return 'Choose a usable server-side model profile'
    }
    return 'Add a model profile in Settings'
})
const assistantEnhancerDisabledReason = computed(() => {
    if (enhancingPrompt.value) {
        return 'Enhancing prompt'
    }
    if (!selectedChatPrimaryModelProfileId.value) {
        return 'Add a model profile first'
    }
    if (!prompt.value.trim()) {
        return 'Write a prompt first'
    }
    return ''
})
const authLabel = computed(() => props.authUserName.trim() || 'Operator')
function scrollChat() { chatSurface.value?.scrollToBottom() }
async function enhanceCurrentPrompt() {
    const disabledReason = assistantEnhancerDisabledReason.value
    if (disabledReason) {
        uiError.value = disabledReason
        return
    }
    closePopover()
    uiError.value = null
    try {
        await enhancePrompt({
            prompt: prompt.value.trim(),
            model_profile_id: selectedChatPrimaryModelProfileId.value,
            session_id: activeSession.value?.id ?? null,
        })
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not enhance this prompt.'
    }
}
function replacePromptWithEnhanced() {
    if (!promptEnhancementResult.value) return
    prompt.value = promptEnhancementResult.value.enhanced_prompt
    clearPromptEnhancement()
}
function insertEnhancedPromptBelow() {
    if (!promptEnhancementResult.value) return
    const currentPrompt = prompt.value.trimEnd()
    prompt.value = currentPrompt
        ? `${currentPrompt}\n\n${promptEnhancementResult.value.enhanced_prompt}`
        : promptEnhancementResult.value.enhanced_prompt
    clearPromptEnhancement()
}
async function openBrowseFromComposer(url: string | null) { await openBrowse(url) }
// Auto-prompt Browse: when the composer holds a real URL and Browse is off (and not
// in a setup fault), offer a one-tap "browse this?" — dismissable, never spurious.
const dismissedAutoBrowseUrl = ref<string | null>(null)
const autoBrowseUrl = computed(() => {
    if (browserMode.value.enabled || browseSetupFault.value) return null
    const url = talosFirstUrl(prompt.value)
    return url && url !== dismissedAutoBrowseUrl.value ? url : null
})
function acceptAutoBrowse() {
    const url = autoBrowseUrl.value
    if (!url) return
    dismissedAutoBrowseUrl.value = url
    void openBrowseFromComposer(url)
}
function dismissAutoBrowse() {
    dismissedAutoBrowseUrl.value = autoBrowseUrl.value
}
function selectModelProfile(profileId: string) {
    selectedModelProfileId.value = profileId
    if (profileId) selectedModelRoutingProfileId.value = ''
    saveWorkspacePreferences()
}
function selectModelRoutingProfile(profileId: string) {
    selectedModelRoutingProfileId.value = profileId
    if (profileId) selectedModelProfileId.value = ''
    saveWorkspacePreferences()
}
function selectEffort(level: string) {
    selectedEffort.value = level
    saveWorkspacePreferences()
}
function selectThinking(enabled: boolean) {
    thinking.value = enabled
    saveWorkspacePreferences()
}
// Keep the chosen effort valid for the active model: when the selected profile
// changes, clamp it into the new model's ladder (never a hardcoded set).
watch(selectedModelProfile, (profile) => {
    const clamped = talosClampEffort(profile ?? null, selectedEffort.value)
    if (clamped !== selectedEffort.value) selectedEffort.value = clamped
})
function selectContextSet(contextSetId: string) {
    selectedContextSetId.value = contextSetId
    saveWorkspacePreferences()
}
async function handleContextSetCreated(contextSet: TalosContextSet) {
    selectedContextSetId.value = contextSet.id
    saveWorkspacePreferences()
    try {
        await loadContextSets()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not refresh context sets.'
    }
}
function handleBenchmarkScenarioSelected(scenarioRef: string) {
    selectedBenchmarkScenarioRef.value = scenarioRef
    openWindowFromSource('compare', undefined, 'command')
}
function focusChatInput() {
    document.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')?.focus()
}

async function focusChatFromMobileRail() {
    mobileNavigationOpen.value = false
    closePopover()
    if (activeWindowId.value) closeWindow(activeWindowId.value)
    await nextTick()
    focusChatInput()
}
useTalosShortcuts(workspaceKeyboardShortcuts, {
    search_conversations: openCommandPalette,
    toggle_sidebar: () => {
        railCollapsed.value = !railCollapsed.value
    },
    focus_chat_input: focusChatInput,
    toggle_active_window: () => {
        if (activeWindowId.value) {
            minimizeWindow(activeWindowId.value)
        }
    },
    new_session: () => {
        void startNewChat()
    },
    cancel_close: () => {
        if (commandPaletteOpen.value) {
            closeCommandPalette()
            return
        }
        closePopover()
        if (activeWindowId.value) {
            closeWindow(activeWindowId.value)
        }
    },
    open_calendar: () => openWindowFromSource('calendar', undefined, 'command'),
    open_compare: () => openWindowFromSource('compare', undefined, 'command'),
    open_cookbook: () => openWindowFromSource('model_lab', undefined, 'command'),
    open_deep_research: () => openWindowFromSource('research', undefined, 'command'),
    open_gallery: () => openWindowFromSource('gallery', undefined, 'command'),
    open_library: () => openWindowFromSource('library', undefined, 'command'),
    open_memory: () => openWindowFromSource('brain', undefined, 'command'),
    open_notes: () => openWindowFromSource('notes', undefined, 'command'),
    open_tasks: () => openWindowFromSource('tasks', undefined, 'command'),
    open_theme: () => openWindowFromSource('theme', undefined, 'command'),
})
async function refreshModelAndContext() {
    return workspaceBootstrap.refreshModelAndContext()
}
let unregisterPaletteDismiss: (() => void) | null = null

function handleWorkspaceEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (dismissTopTalosOverlay()) {
        event.preventDefault()
        event.stopPropagation()
    }
}

watch(commandPaletteOpen, (open) => {
    if (!open) {
        unregisterPaletteDismiss?.()
        unregisterPaletteDismiss = null
        return
    }
    unregisterPaletteDismiss = registerTalosDismiss(() => {
        commandPaletteOpen.value = false
    })
})

const composerDock = ref<InstanceType<typeof TalosComposerDock> | null>(null)
const talosToast = useTalosToast()
const introBlockingOverlayOpen = computed(() => commandPaletteOpen.value || exportDialogOpen.value || Boolean(pendingDeleteSession.value))
const { introOpen, closeIntro, replayIntro } = useTalosIntroState({
    authenticated: computed(() => props.authenticated),
    workspaceRuntimeReady,
    settings: workspaceSettings,
    settingsLoadState: workspaceSettingsLoadState,
    blockingOverlayOpen: introBlockingOverlayOpen,
    updateSettings: updateWorkspaceSettings,
    notify: (message, retry) => {
        talosToast.error(message, retry ? { action: { label: 'Retry', onClick: retry } } : undefined)
    },
})

function handleIntroClose(outcome: TalosIntroOutcome) {
    void closeIntro(outcome)
    void nextTick().then(() => {
        requestAnimationFrame(() => {
            composerDock.value?.focusPrompt()
        })
    })
}

function handleIntroReplayRequest() {
    if (visibleWindowIds.value.includes('settings')) {
        closeWindow('settings')
    }
    replayIntro()
}

onMounted(async () => {
    document.addEventListener('keydown', handleWorkspaceEscape, true)
    try {
        await workspaceBootstrap.initialize()
    } finally {
        workspaceRuntimeReady.value = true
    }
    void railPreferences.hydrate().then(() => {
        railCollapsed.value = railPreferences.collapsed.value
    })
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleWorkspaceEscape, true)
    unregisterPaletteDismiss?.()
})
</script>
<template>
    <main ref="workspaceRoot" :class="['talos-shell talos-workspace talos-chat-layout flex h-[100dvh] min-h-[100dvh] overflow-hidden', shellClass]" :style="workspaceStyle" :data-motion-scene="workspaceMotionV6SceneId" :data-theme-preset="theme" :data-theme-mode="workspaceResolvedThemeMode" :data-theme-mode-preference="workspaceThemeMode" :data-ui-animation-profile="workspaceUiAnimationProfile" :data-ui-motion-disabled="workspaceUiMotionDisabled ? 'true' : 'false'" :data-motion-v6-requested="workspaceMotionV6Decision.requestedMode" :data-motion-v6-effective="workspaceMotionV6Decision.effectiveMode" :data-motion-v6-reason="workspaceMotionV6Decision.reason" :data-motion-v6-degradation-stage="String(workspaceMotionV6Decision.degradationStage)" :data-motion-v6-renderer-fault="workspaceMotionV6GovernorSnapshot.rendererFault ? 'true' : 'false'" :data-motion-v6-recovery-locked="workspaceMotionV6GovernorSnapshot.recoveryLocked ? 'true' : 'false'" :data-motion-v6-frame-p95-ms="workspaceMotionV6GovernorSnapshot.lastFrameP95Ms ?? ''" data-testid="talos-workspace">
        <TalosLeftRail :active-ids="[...openWindowIds, ...(isBrowseSurface ? ['browse'] : [])]" :theme="theme" :development-mode="developmentMode" :creating-session="creatingSession" :collapsed="railCollapsed" :width="railWidth" :visibility="workspaceAppearanceVisibility.sidebar" :sessions="sessions" :active-session-id="activeSession?.id ?? null" :advanced-expanded="advancedRailExpanded" :mobile-open="mobileNavigationOpen" :item-order="railPreferences.order.value" @move-item="railPreferences.moveItem" @open="openModule" @new-chat="startNewChat" @select-session="chooseSession" @rename-session="renameChatSession" @favorite-session="favoriteChatSession" @toggle-session-selected="toggleChatSelection" @archive-session="archiveChatSession" @move-session-to-folder="moveChatSession" @delete-session="requestDeleteSession" @copy-session="copyChatSession" @toggle-theme="toggleTheme()" @collapse="railCollapsed = true; railPreferences.setCollapsed(true)" @expand="railCollapsed = false; railPreferences.setCollapsed(false)" @resize-start="startRailResize" @toggle-advanced="toggleAdvancedRail" @close-mobile="mobileNavigationOpen = false" />
        <section class="talos-chat-scroll-root relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" :style="windowReflowStyle" :data-window-reflow="windowReflow.mode">
            <TalosProceduralBackground v-if="workspaceRuntimeReady" :requested-mode="workspaceMotionV6Decision.requestedMode" :effective-mode="workspaceMotionV6Decision.effectiveMode" :scene-id="workspaceMotionV6SceneId" :input="workspaceMotionV6SceneInput" :background-enabled="workspaceMotionV6Decision.backgroundEnabled" :glow-intensity="workspaceMotionV6Preferences.glow_intensity" :paused="workspaceMotionV6Decision.paused" :runtime-reason="workspaceMotionV6Decision.reason" :degradation-stage="workspaceMotionV6Decision.degradationStage" :recovery-locked="workspaceMotionV6GovernorSnapshot.recoveryLocked" @motion-frame="recordWorkspaceMotionFrame" @renderer-fault="recordWorkspaceMotionRendererFault" @stable-window="recordWorkspaceMotionStableWindow" />
            <div v-else class="pointer-events-none absolute inset-0 bg-[var(--talos-background)]" aria-hidden="true" data-testid="talos-workspace-bootstrap-background" />
            <TalosWorkspaceHeader v-if="workspaceAppearanceVisibility.chat_area.session_header" :status-text="statusText" :temporary-session="activeSessionIsTemporary" :has-active-session="Boolean(activeSession)" :exporting-session="exportingSession" :authenticated="authenticated" :auth-label="authLabel" :login-url="loginUrl" :logout-url="logoutUrl" :csrf-token="csrfToken" :bubble-scale="bubbleScale" :bubble-scale-label="bubbleScaleLabel" :chat-layout-locked="chatLayoutPolicyLocked" :navigation-open="mobileNavigationOpen" @open-navigation="mobileNavigationOpen = true" @open-commands="openCommandPalette" @open-export="openSessionExportDialog" @open-account="openAccountSettings" @decrease-message-scale="decrementBubbleScale" @increase-message-scale="incrementBubbleScale" @reset-message-scale="resetBubbleScale" />
            <TalosMobileRail :creating-session="creatingSession" :visibility="workspaceAppearanceVisibility.sidebar" :active-ids="[...openWindowIds, ...(isBrowseSurface ? ['browse'] : [])]" :navigation-open="mobileNavigationOpen" @new-chat="startNewChat" @focus-chat="focusChatFromMobileRail" @open-navigation="mobileNavigationOpen = true" @open-window="openModule" />
            <div class="relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden"><TalosChatSurface ref="chatSurface" :ui-error="uiError || toolApprovalError" :session-error="sessionError" :message-error="messageError" :model-profile-error="modelProfileError || modelRoutingProfileError" :context-set-error="contextSetError" :loading-messages="loadingMessages" :messages="messages" :logo-url="talosShortLogoUrl" :selected-model-profile-is-usable="selectedModelSelectionIsUsable" :context-selected="Boolean(selectedContextSet)" :context-sets-count="contextSets.length" :session-ready="Boolean(activeSession)" :message-evidence-ready="messageEvidenceReady" :sending="sending" :benchmarking-run-id="benchmarkingRunId" :expanded-evidence-message-ids="expandedEvidenceMessageIds" :welcome-prompt-id="activeWelcomePromptId" :show-welcome-message="workspaceAppearanceVisibility.chat_area.welcome_message" :show-mission-path="showMissionPath" :full-width-chat="workspaceAppearanceVisibility.chat_area.full_width_chat" :sensitive-blur="workspaceAppearanceVisibility.chat_area.sensitive_blur" :bubble-scale="bubbleScale" :message-style="messageStyle" :browser-activities="visibleBrowserActivities" :browser-snapshot="latestBrowserSnapshot" :active-browser-session="activeBrowserSession" :browser-interaction-pending="browserInteractionPending" :browser-interaction-locked="browserMode.status === 'recovery_required'" :browser-interaction-error="browserInteractionError" :pending-browser-interaction-approval="pendingBrowserInteractionApproval" :pending-tool-approvals="pendingToolApprovals" :deciding-tool-approval-ids="decidingApprovalIds" :browser-tasks="browserTasks" :browser-task-busy="browserTaskBusy" :browser-task-error="browserTaskError" :browser-task-command-target-id="browserTaskCommandTargetId" :dev-browser-evidence="devBrowserEvidence" :development-mode="developmentMode" :active-talos-session-id="activeSession?.id ?? null" :mobile="breakpoint !== 'desktop'" :mobile-window-presentation="mobileWindowPresentation" :viewport="chatViewport" @open-model="openWindowFromSource('model_lab', undefined, 'command')" @open-context="openWindowFromSource('library', undefined, 'command')" @set-prompt="prompt = $event" @message-copied="setCommandFeedback('Message copied.')" @message-copy-failed="uiError = 'TALOS could not access the clipboard. Use your browser copy shortcut.'" @message-edited="setCommandFeedback('Prompt loaded for reuse.')" @resend-message="resendMessage" @retry-assistant-message="retryAssistantMessage" @toggle-message-evidence="toggleMessageEvidence" @benchmark-message-run="benchmarkMessageRun" @interact-browser-frame="interactWithBrowserFrame" @confirm-browser-frame-interaction="confirmBrowserFrameInteraction" @decide-tool-approval="handleToolApprovalDecision" @cancel-browser-task="cancelBrowserTask" /></div>
            <div data-testid="talos-window-layer"><TalosWindowLayer :breakpoint="breakpoint" :development-mode="developmentMode" :visible-window-ids="visibleWindowIds" :minimized-window-ids="minimizedWindowIds" :docked-window-ids="dockedWindowIds" :fullscreen-window-ids="fullscreenWindowIds" :active-window-id="activeWindowId" :window-positions="windowPositions" :window-sizes="windowSizes" :window-restore-bounds="windowRestoreBounds" :window-tile-targets="windowTileTargets" :window-z-indexes="windowZIndexes" :window-area="windowArea" :window-maximize-area="windowMaximizeArea" :window-fullscreen-area="windowFullscreenArea" :current-rail-width="currentRailWidth" :runtime-requested-tab="runtimeRequestedTab" :runtime-requested-tab-revision="runtimeRequestedTabRevision" :selected-benchmark-group-id="selectedBenchmarkGroupId" :selected-benchmark-scenario-ref="selectedBenchmarkScenarioRef" :model-profiles="modelProfiles" :context-sets="contextSets" :selected-model-profile-id="selectedModelProfileId" :selected-context-set-id="selectedContextSetId" :settings-requested-tab="settingsRequestedTab" :settings-requested-tab-revision="settingsRequestedTabRevision" :authenticated="authenticated" :auth-user-name="authUserName" :logout-url="logoutUrl" :csrf-token="csrfToken" :active-talos-session-id="activeSession?.id ?? null" :theme="theme" :motion-preferences="workspaceMotionV6Preferences" :reduced-motion="workspaceMotionV6Decision.reducedMotionApplied" :ui-motion-disabled="workspaceUiMotionDisabled" :mobile-window-presentation="mobileWindowPresentation" :window-launch-origins="windowLaunchOrigins" :window-launch-revisions="windowLaunchRevisions" :requested-window-sections="requestedWindowSections" :requested-window-section-revision="requestedWindowSectionRevision" @close-window="closeWindow" @minimize-window="minimizeWindow" @dock-window="toggleDock" @fullscreen-window="toggleFullscreenWindow" @focus-window="focusWindow" @open-window="openWindowFromSource($event, undefined, 'command')" @restore-window="restoreWindow" @set-window-position="setWindowPosition" @set-window-bounds="setWindowBounds" @reset-window-size="resetWindowSize" @save-window-layout="saveWindowLayout" @open-audit-log="openAuditLogFromRuntime" @context-set-created="handleContextSetCreated" @snap-window="snapWindow" @tile-window="tileWindow" @untile-window="untileWindow" @benchmark-scenario-selected="handleBenchmarkScenarioSelected" @select-model="selectModelProfile" @select-context="selectContextSet" @change-theme="toggleTheme" @open-module="openModule" @settings-saved="handleWorkspaceSettingsSaved" @theme-customization-changed="refreshWorkspaceSettingsAfterThemeUpdate" @theme-draft-changed="handleThemeDraftChanged" @replay-intro="handleIntroReplayRequest" /></div>
            <TalosComposerDock ref="composerDock" :prompt="prompt" :last-user-prompt="lastUserPrompt" :browser-context="browserEvidenceAttached ? browserContext : null" :browser-current-page="browserCurrentPage" :browser-mode="browserMode" :browse-setup-fault="browseSetupFault" :attachments="attachmentTray.attachments.value" :vault-files="attachmentVaultFiles" :vault-picker-loading="attachmentVaultLoading" :dev-browser-evidence="devBrowserEvidence" :composer-mode="composerMode" :dictation-status="dictationStatus" :dictation-supported="dictationSupported" :auto-browse-url="autoBrowseUrl" :viewport="chatViewport" :commands="workspaceCommands" :can-send="canSend" :sending="sending" :status-text="statusText" :model-label="modelLabel" :model-provider="selectedModelProvider" :context-label="contextLabel" :temporary-mode="sessionPersistenceMode === 'temporary'" :send-disabled-reason="sendMessageCommandDisabledReason" :enhancer-disabled-reason="assistantEnhancerDisabledReason" :model-popover-open="modelPopoverOpen" :context-popover-open="contextPopoverOpen" :model-profiles="composerModelProfiles" :model-routing-profiles="modelRoutingProfiles" :context-sets="contextSets" :selected-model-profile-id="selectedModelProfileId" :selected-model-routing-profile-id="selectedModelRoutingProfileId" :selected-context-set-id="selectedContextSetId" :selected-effort="selectedEffort" :thinking="thinking" :effort-levels="selectedProfileEffortLevels" :supports-thinking="selectedProfileSupportsThinking" :selected-context-set="selectedContextSet" :loading-model-profiles="loadingModelProfiles" :loading-model-routing-profiles="loadingModelRoutingProfiles" :loading-context-sets="loadingContextSets" :prompt-enhancement-result="promptEnhancementResult" :enhancing-prompt="enhancingPrompt" :prompt-enhancement-error="promptEnhancementError" :visibility="workspaceAppearanceVisibility.chat_bar" @update-prompt="prompt = $event" @send="sendChat" @open-model="toggleModelPopover" @open-context="toggleContextPopover" @open-settings="openSettings()" @toggle-temporary="toggleTemporaryMode" @enhance="enhanceCurrentPrompt" @slash-command="selectCommand" @select-model-profile="selectModelProfile" @select-model-routing-profile="selectModelRoutingProfile" @select-effort="selectEffort" @select-thinking="selectThinking" @select-context-set="selectContextSet" @browse-open="openBrowseFromComposer" @refresh-model-and-context="refreshModelAndContext" @open-model-lab="openWindowFromSource('model_lab', undefined, 'command')" @open-library="openWindowFromSource('library', undefined, 'command')" @replace-prompt-with-enhanced="replacePromptWithEnhanced" @insert-enhanced-prompt-below="insertEnhancedPromptBelow" @clear-prompt-enhancement="clearPromptEnhancement" @detach-browser-context="browserEvidenceAttached = false" @enable-browse="handleEnableBrowse" @disable-browse="handleDisableBrowse" @stop-browse="handleStopBrowse" @restart-browse="handleRestartBrowse" @capture-screenshot="handleCaptureScreenshot" @capture-snapshot="handleCaptureSnapshot" @attach-files="handleAttachFiles" @attach-vault-file="handleAttachVaultFile" @remove-attachment="handleRemoveAttachment" @open-vault-picker="handleOpenAttachmentVault" @close-popovers="closePopover" @toggle-dictation="toggleDictation" @accept-auto-browse="acceptAutoBrowse" @dismiss-auto-browse="dismissAutoBrowse" />
            <div v-if="commandPaletteOpen" class="talos-command-palette-overlay fixed inset-0 z-50 bg-black/40 px-4 py-16 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="TALOS command palette" @click.self="closeCommandPalette"><div class="mx-auto w-full max-w-2xl"><TalosCommandPalette :commands="workspaceCommands" @selected="selectCommand" /></div></div>
            <TalosExportDialog v-if="exportDialogOpen" :session="activeSession" :result="sessionExportResult" :exporting="exportingSession" :error="sessionExportError" @close="closeSessionExportDialog" @export="runSessionExport" />
            <TalosDeleteSessionDialog v-if="pendingDeleteSession" :session="pendingDeleteSession" :deleting="deletingSession" @cancel="pendingDeleteSession = null" @confirm="confirmDeleteSession" />
            <TalosIntroModal v-if="introOpen" :open="introOpen" :links="publicLinks" @close="handleIntroClose" />
            <Toaster :theme="workspaceResolvedThemeMode" position="top-right" :class="{ 'talos-sonner-motion-disabled': workspaceUiMotionDisabled }" />
        </section>
        <div id="talos-portal-root" class="talos-portal-root" data-testid="talos-portal-root"></div>
    </main>
</template>
