<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TalosExportDialog from '../chat/TalosExportDialog.vue'
import TalosDeleteSessionDialog from '../chat/TalosDeleteSessionDialog.vue'
import TalosChatSurface from './TalosChatSurface.vue'
import TalosComposerDock from './TalosComposerDock.vue'
import TalosLeftRail from './TalosLeftRail.vue'
import TalosMessageScaleControls from './TalosMessageScaleControls.vue'
import TalosMobileRail from './TalosMobileRail.vue'
import TalosProceduralBackground from './TalosProceduralBackground.vue'
import TalosWindowLayer from './TalosWindowLayer.vue'
import TalosWorkspaceHeader from './TalosWorkspaceHeader.vue'
import TalosCommandPalette from '../shell/TalosCommandPalette.vue'
import ToastRegion, { type TalosToast } from '../../ui/ToastRegion.vue'
import { useTalosChat } from '../../../composables/useTalosChat'
import { useTalosChatViewport } from '../../../composables/useTalosChatViewport'
import { useTalosChatLayoutPreferences } from '../../../composables/useTalosChatLayoutPreferences'
import { useTalosComposerAvailability } from '../../../composables/useTalosComposerAvailability'
import { useTalosContextVault } from '../../../composables/useTalosContextVault'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import { useTalosMessageEvidence } from '../../../composables/useTalosMessageEvidence'
import { useTalosModelRoutingProfiles } from '../../../composables/useTalosModelRoutingProfiles'
import { useTalosPromptEnhancement } from '../../../composables/useTalosPromptEnhancement'
import { useTalosRailResize } from '../../../composables/useTalosRailResize'
import { sessionChatState, useTalosSessions } from '../../../composables/useTalosSessions'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import { useTalosShortcuts } from '../../../composables/useTalosShortcuts'
import { useTalosWorkspaceWindows } from '../../../composables/useTalosWorkspaceWindows'
import { useTalosWorkspaceLocalPreferences } from '../../../composables/useTalosWorkspaceLocalPreferences'
import { useTalosWorkspaceBrowse } from '../../../composables/useTalosWorkspaceBrowse'
import { useTalosWorkspaceTheme } from '../../../composables/useTalosWorkspaceTheme'
import { useTalosWorkspaceThemeActions } from '../../../composables/useTalosWorkspaceThemeActions'
import { useTalosWorkspaceSessionActions } from '../../../composables/useTalosWorkspaceSessionActions'
import { useTalosWorkspaceChatActions } from '../../../composables/useTalosWorkspaceChatActions'
import { useTalosWorkspaceCommandActions } from '../../../composables/useTalosWorkspaceCommandActions'
import { useTalosWorkspaceBootstrap } from '../../../composables/useTalosWorkspaceBootstrap'
import { talosCommands } from '../../../lib/commandRegistry'
import { TALOS_DEFAULT_THEME, type TalosThemeCustomization, type TalosThemeId } from '../../../lib/talosThemes'
import type { TalosCommand, TalosContextSet } from '../../../lib/talosTypes'
type InitialSurface = 'workspace' | 'chat' | 'dashboard' | 'browse'; const talosShortLogoUrl = '/talos/brand/logo-short.svg'
const props = withDefaults(defineProps<{
    initialSurface?: InitialSurface
    authenticated?: boolean
    authUserName?: string
    loginUrl?: string
    logoutUrl?: string
    csrfToken?: string
}>(), {
    initialSurface: 'workspace',
    authenticated: false,
    authUserName: '',
    loginUrl: '/login',
    logoutUrl: '/logout',
    csrfToken: '',
})
const theme = ref<TalosThemeId>(TALOS_DEFAULT_THEME)
const chatSurface = ref<{ scrollToBottom: () => void } | null>(null); const workspaceRoot = ref<HTMLElement | null>(null)
const chatViewport = useTalosChatViewport(), composerHeight = chatViewport.composerHeight
const uiError = ref<string | null>(null)
const prompt = ref('')
const sending = ref(false)
const selectedBenchmarkScenarioRef = ref<string | null>(null)
const selectedModelProfileId = ref('')
const selectedModelRoutingProfileId = ref('')
const selectedContextSetId = ref('')
const browserEvidenceAttached = ref(true)
const railCollapsed = ref(false), railWidth = ref(236), mobileHistoryOpen = ref(false)
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
const {
    browseModeEnabled,
    isBrowseSurface,
    activeBrowserSession, browserCurrentPage,
    browserMode,
    browserContext,
    visibleBrowserActivities,
    latestBrowserSnapshot,
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
)
restoreBrowseForActiveSession = restoreBrowseForActiveSessionAction
const { persistUserMessage, sendPersistentChat } = useTalosChat()
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
    loadSettings: loadWorkspaceSettings,
    updateSettings: updateWorkspaceSettings,
} = useTalosSettings()
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
    advancedRailExpanded,
    policyLocked: chatLayoutPolicyLocked,
    apply: applyChatLayoutPreference,
    decrementBubbleScale,
    incrementBubbleScale,
    resetBubbleScale,
    toggleComposerMode,
    toggleAdvancedRail,
} = useTalosChatLayoutPreferences(workspaceSettings, updateWorkspaceSettings, uiError)
const {
    themeMode: workspaceThemeMode, resolvedThemeMode: workspaceResolvedThemeMode,
    shellClass,
    motionMode: workspaceMotionMode, motionDisabled: workspaceMotionDisabled,
    simpleAnimation: workspaceSimpleAnimation,
    appearanceVisibility: workspaceAppearanceVisibility, keyboardShortcuts: workspaceKeyboardShortcuts,
    uiAnimationProfile: workspaceUiAnimationProfile, uiMotionDisabled: workspaceUiMotionDisabled,
    backgroundMotionEnabled: workspaceBackgroundMotionEnabled, backgroundEffect: workspaceBackgroundEffect,
    backgroundPaletteKey: workspaceBackgroundPaletteKey,
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
    saveWindowLayout,
    windowLaunchOrigins,
    windowLaunchRevisions,
    openWindowFromSource, breakpoint,
} = useTalosWorkspaceWindows({
    initialOpen: props.initialSurface === 'dashboard' ? ['runtime'] : [],
    currentRailWidth, composerHeight,
})
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
const { browserReadyForSend, canSend, sendDisabledReason: sendMessageCommandDisabledReason } = useTalosComposerAvailability(
    { prompt, sending, modelSelectionUsable: selectedModelSelectionIsUsable, browserMode, activeBrowserSession },
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
    commandFeedback,
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
    ensureSessionForPrompt,
    persistUserMessage,
    sendPersistentChat,
    createMessage,
    centerMessage: chatViewport.centerMessage,
    recordBrowserActivities,
    openSettings: () => openSettings(),
    openModelPopover: () => toggleModelPopover(),
    closePopover,
    openCompare: () => openWindowFromSource('compare', undefined, 'command'),
    previousUserMessageFor,
    scrollChat,
    selectedBenchmarkScenarioRef,
    selectedBenchmarkScenarioIsRunnable,
    benchmarkDisabledReason: runAvmCompareCommandDisabledReason,
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
const workspaceSubtitle = computed(() => {
    if (selectedModelSelectionIsUsable.value) {
        return 'Ready for verified workflows'
    }
    if (loadingModelProfiles.value) {
        return 'Checking model readiness'
    }
    if (modelProfiles.value.length > 0) {
        return 'Model secret required'
    }
    return 'Model setup required'
})
const authLabel = computed(() => props.authUserName.trim() || 'Operator')
const workspaceToasts = computed<TalosToast[]>(() => commandFeedback.value
    ? [{ id: 'command-feedback', message: commandFeedback.value, tone: 'info' }]
    : [])
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
onMounted(async () => {
    await workspaceBootstrap.initialize()
})
</script>
<template>
    <main ref="workspaceRoot" :class="['talos-shell talos-workspace talos-chat-layout flex h-[100dvh] min-h-[100dvh] overflow-hidden', shellClass]" :style="workspaceStyle" :data-background-effect="workspaceBackgroundEffect" :data-theme-preset="theme" :data-theme-mode="workspaceResolvedThemeMode" :data-theme-mode-preference="workspaceThemeMode" :data-ui-animation-profile="workspaceUiAnimationProfile" :data-ui-motion-disabled="workspaceUiMotionDisabled ? 'true' : 'false'" data-testid="talos-workspace">
        <TalosLeftRail :active-ids="[...openWindowIds, ...(isBrowseSurface ? ['browse'] : [])]" :theme="theme" :creating-session="creatingSession" :collapsed="railCollapsed" :width="railWidth" :visibility="workspaceAppearanceVisibility.sidebar" :sessions="sessions" :active-session-id="activeSession?.id ?? null" :advanced-expanded="advancedRailExpanded" :mobile-open="mobileHistoryOpen" @open="openModule" @new-chat="startNewChat" @select-session="chooseSession" @rename-session="renameChatSession" @favorite-session="favoriteChatSession" @toggle-session-selected="toggleChatSelection" @archive-session="archiveChatSession" @move-session-to-folder="moveChatSession" @delete-session="requestDeleteSession" @copy-session="copyChatSession" @toggle-theme="toggleTheme()" @collapse="railCollapsed = true" @expand="railCollapsed = false" @resize-start="startRailResize" @toggle-advanced="toggleAdvancedRail" @close-mobile="mobileHistoryOpen = false" />
        <section class="talos-chat-scroll-root relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <TalosProceduralBackground :effect="workspaceBackgroundEffect" :motion="workspaceMotionMode" :background-motion-enabled="workspaceBackgroundMotionEnabled" :simple-animation="workspaceSimpleAnimation" :palette-key="workspaceBackgroundPaletteKey" />
            <TalosWorkspaceHeader v-if="workspaceAppearanceVisibility.chat_area.session_header" :logo-url="talosShortLogoUrl" :workspace-subtitle="workspaceSubtitle" :status-text="statusText" :temporary-session="activeSessionIsTemporary" :has-active-session="Boolean(activeSession)" :exporting-session="exportingSession" :authenticated="authenticated" :auth-label="authLabel" :login-url="loginUrl" :logout-url="logoutUrl" :csrf-token="csrfToken" @open-commands="openCommandPalette" @open-export="openSessionExportDialog" @open-account="openAccountSettings" />
            <TalosMobileRail :creating-session="creatingSession" :visibility="workspaceAppearanceVisibility.sidebar" :advanced-expanded="advancedRailExpanded" :active-ids="[...openWindowIds, ...(isBrowseSurface ? ['browse'] : [])]" :history-open="mobileHistoryOpen" @new-chat="startNewChat" @open-history="mobileHistoryOpen = true" @open-window="openModule" @toggle-advanced="toggleAdvancedRail" />
            <div class="relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden"><TalosMessageScaleControls :bubble-scale="bubbleScale" :label="bubbleScaleLabel" :locked="chatLayoutPolicyLocked" @decrease="decrementBubbleScale" @increase="incrementBubbleScale" @reset="resetBubbleScale" /><TalosChatSurface ref="chatSurface" :ui-error="uiError" :session-error="sessionError" :message-error="messageError" :model-profile-error="modelProfileError || modelRoutingProfileError" :context-set-error="contextSetError" :loading-messages="loadingMessages" :messages="messages" :logo-url="talosShortLogoUrl" :selected-model-profile-is-usable="selectedModelSelectionIsUsable" :context-selected="Boolean(selectedContextSet)" :context-sets-count="contextSets.length" :session-ready="Boolean(activeSession)" :message-evidence-ready="messageEvidenceReady" :sending="sending" :benchmarking-run-id="benchmarkingRunId" :expanded-evidence-message-ids="expandedEvidenceMessageIds" :welcome-prompt-id="activeWelcomePromptId" :show-welcome-message="workspaceAppearanceVisibility.chat_area.welcome_message" :full-width-chat="workspaceAppearanceVisibility.chat_area.full_width_chat" :sensitive-blur="workspaceAppearanceVisibility.chat_area.sensitive_blur" :bubble-scale="bubbleScale" :browser-activities="visibleBrowserActivities" :browser-snapshot="latestBrowserSnapshot" :active-talos-session-id="activeSession?.id ?? null" :viewport="chatViewport" @open-model="openWindowFromSource('model_lab', undefined, 'command')" @open-context="openWindowFromSource('library', undefined, 'command')" @set-prompt="prompt = $event" @message-copied="commandFeedback = 'Message copied.'" @message-copy-failed="uiError = 'TALOS could not access the clipboard. Use your browser copy shortcut.'" @message-edited="commandFeedback = 'Prompt loaded for reuse.'" @resend-message="resendMessage" @retry-assistant-message="retryAssistantMessage" @toggle-message-evidence="toggleMessageEvidence" @benchmark-message-run="benchmarkMessageRun" /></div>
            <div data-testid="talos-window-layer"><TalosWindowLayer :breakpoint="breakpoint" :visible-window-ids="visibleWindowIds" :minimized-window-ids="minimizedWindowIds" :docked-window-ids="dockedWindowIds" :fullscreen-window-ids="fullscreenWindowIds" :active-window-id="activeWindowId" :window-positions="windowPositions" :window-sizes="windowSizes" :window-z-indexes="windowZIndexes" :current-rail-width="currentRailWidth" :runtime-requested-tab="runtimeRequestedTab" :runtime-requested-tab-revision="runtimeRequestedTabRevision" :selected-benchmark-group-id="selectedBenchmarkGroupId" :selected-benchmark-scenario-ref="selectedBenchmarkScenarioRef" :model-profiles="modelProfiles" :context-sets="contextSets" :selected-model-profile-id="selectedModelProfileId" :selected-context-set-id="selectedContextSetId" :settings-requested-tab="settingsRequestedTab" :settings-requested-tab-revision="settingsRequestedTabRevision" :authenticated="authenticated" :auth-user-name="authUserName" :logout-url="logoutUrl" :csrf-token="csrfToken" :theme="theme" :ui-motion-disabled="workspaceUiMotionDisabled" :window-launch-origins="windowLaunchOrigins" :window-launch-revisions="windowLaunchRevisions" :requested-window-sections="requestedWindowSections" :requested-window-section-revision="requestedWindowSectionRevision" @close-window="closeWindow" @minimize-window="minimizeWindow" @dock-window="toggleDock" @fullscreen-window="toggleFullscreenWindow" @focus-window="focusWindow" @open-window="openWindowFromSource($event, undefined, 'command')" @restore-window="restoreWindow" @set-window-position="setWindowPosition" @set-window-bounds="setWindowBounds" @reset-window-size="resetWindowSize" @save-window-layout="saveWindowLayout" @open-audit-log="openAuditLogFromRuntime" @context-set-created="handleContextSetCreated" @snap-window="snapWindow" @benchmark-scenario-selected="handleBenchmarkScenarioSelected" @select-model="selectModelProfile" @select-context="selectContextSet" @change-theme="toggleTheme" @open-module="openModule" @settings-saved="handleWorkspaceSettingsSaved" @theme-customization-changed="refreshWorkspaceSettingsAfterThemeUpdate" @theme-draft-changed="handleThemeDraftChanged" /></div>
            <TalosComposerDock :prompt="prompt" :browser-context="browserEvidenceAttached ? browserContext : null" :browser-current-page="browserCurrentPage" :browser-mode="browserMode" :composer-mode="composerMode" :chat-layout-locked="chatLayoutPolicyLocked" :viewport="chatViewport" :commands="workspaceCommands" :can-send="canSend" :sending="sending" :status-text="statusText" :model-label="modelLabel" :model-provider="selectedModelProvider" :context-label="contextLabel" :temporary-mode="sessionPersistenceMode === 'temporary'" :send-disabled-reason="sendMessageCommandDisabledReason" :enhancer-disabled-reason="assistantEnhancerDisabledReason" :model-popover-open="modelPopoverOpen" :context-popover-open="contextPopoverOpen" :model-profiles="modelProfiles" :model-routing-profiles="modelRoutingProfiles" :context-sets="contextSets" :selected-model-profile-id="selectedModelProfileId" :selected-model-routing-profile-id="selectedModelRoutingProfileId" :selected-context-set-id="selectedContextSetId" :selected-context-set="selectedContextSet" :loading-model-profiles="loadingModelProfiles" :loading-model-routing-profiles="loadingModelRoutingProfiles" :loading-context-sets="loadingContextSets" :prompt-enhancement-result="promptEnhancementResult" :enhancing-prompt="enhancingPrompt" :prompt-enhancement-error="promptEnhancementError" :visibility="workspaceAppearanceVisibility.chat_bar" @update-prompt="prompt = $event" @send="sendChat" @open-model="toggleModelPopover" @open-context="toggleContextPopover" @open-settings="openSettings()" @toggle-temporary="toggleTemporaryMode" @enhance="enhanceCurrentPrompt" @slash-command="selectCommand" @select-model-profile="selectModelProfile" @select-model-routing-profile="selectModelRoutingProfile" @select-context-set="selectContextSet" @browse-open="openBrowseFromComposer" @refresh-model-and-context="refreshModelAndContext" @open-model-lab="openWindowFromSource('model_lab', undefined, 'command')" @open-library="openWindowFromSource('library', undefined, 'command')" @replace-prompt-with-enhanced="replacePromptWithEnhanced" @insert-enhanced-prompt-below="insertEnhancedPromptBelow" @clear-prompt-enhancement="clearPromptEnhancement" @detach-browser-context="browserEvidenceAttached = false" @toggle-composer-mode="toggleComposerMode" @enable-browse="handleEnableBrowse" @disable-browse="handleDisableBrowse" @stop-browse="handleStopBrowse" @restart-browse="handleRestartBrowse" @capture-screenshot="handleCaptureScreenshot" @capture-snapshot="handleCaptureSnapshot" @close-popovers="closePopover" />
            <div v-if="commandPaletteOpen" class="talos-command-palette-overlay fixed inset-0 z-50 bg-black/40 px-4 py-16 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="TALOS command palette" @click.self="closeCommandPalette"><div class="mx-auto w-full max-w-2xl"><TalosCommandPalette :commands="workspaceCommands" @selected="selectCommand" /></div></div>
            <TalosExportDialog v-if="exportDialogOpen" :session="activeSession" :result="sessionExportResult" :exporting="exportingSession" :error="sessionExportError" @close="closeSessionExportDialog" @export="runSessionExport" />
            <TalosDeleteSessionDialog v-if="pendingDeleteSession" :session="pendingDeleteSession" :deleting="deletingSession" @cancel="pendingDeleteSession = null" @confirm="confirmDeleteSession" />
            <ToastRegion :items="workspaceToasts" @dismiss="commandFeedback = ''" />
        </section>
    </main>
</template>
