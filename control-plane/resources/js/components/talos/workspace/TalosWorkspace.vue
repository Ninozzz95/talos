<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import TalosExportDialog from '../chat/TalosExportDialog.vue'
import TalosChatSurface from './TalosChatSurface.vue'
import TalosComposerDock from './TalosComposerDock.vue'
import TalosLeftRail from './TalosLeftRail.vue'
import TalosMobileRail from './TalosMobileRail.vue'
import TalosProceduralBackground from './TalosProceduralBackground.vue'
import TalosWindowLayer from './TalosWindowLayer.vue'
import TalosWorkspaceHeader from './TalosWorkspaceHeader.vue'
import TalosCommandPalette from '../shell/TalosCommandPalette.vue'
import { useTalosChat } from '../../../composables/useTalosChat'
import { useTalosContextVault } from '../../../composables/useTalosContextVault'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import { useTalosModelRoutingProfiles } from '../../../composables/useTalosModelRoutingProfiles'
import { useTalosPromptEnhancement } from '../../../composables/useTalosPromptEnhancement'
import { sessionChatState, useTalosSessions, type TalosSessionPersistenceMode } from '../../../composables/useTalosSessions'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import { useTalosShortcuts } from '../../../composables/useTalosShortcuts'
import { useTalosWindows, type TalosWindowId } from '../../../composables/useTalosWindows'
import { talosFetch } from '../../../lib/api'
import { talosCommands } from '../../../lib/commandRegistry'
import {
    TALOS_DEFAULT_THEME,
    normalizeTalosTheme,
    resolveTalosMotionMode,
    resolveTalosUiAnimationProfile,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    sanitizeTalosUiAnimationCustomization,
    talosBackgroundEffectFromCustomization,
    talosThemeAreaTokenStyle,
    talosThemeClass,
    talosThemeCustomizationStyle,
    talosThemeMotionStyle,
    talosUiAnimationStyle,
    talosThemePreset,
    talosThemeIsLight,
    type TalosThemeCustomization,
    type TalosThemeId,
} from '../../../lib/talosThemes'
import { resolveTalosAppearanceVisibility } from '../../../lib/talosAppearancePreferences'
import { resolveTalosShortcuts } from '../../../lib/talosShortcuts'
import type { TalosCommand, TalosContextSet, TalosMessage, TalosSession, TalosSessionExportFormat, TalosSessionExportPayload } from '../../../lib/talosTypes'
type InitialSurface = 'workspace' | 'chat' | 'dashboard'
const talosShortLogoUrl = '/talos/brand/logo-short.svg'
type TalosWindowLaunchOrigin = {
    x: number
    y: number
    source: 'sidebar' | 'command' | 'dock' | 'default'
}
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
const windowIds: TalosWindowId[] = ['runtime', 'search', 'brain', 'calendar', 'compare', 'model_lab', 'research', 'gallery', 'library', 'notes', 'tasks', 'settings', 'theme', 'doctor', 'tools']
type CommandRoute = { windowId: TalosWindowId; sectionTestId?: string; runtimeTab?: 'timeline' | 'dag' | 'replay' | 'recovery' | 'artifacts' }
const commandWindowTargets: Partial<Record<TalosCommand['id'], CommandRoute>> = {
    attach_file: { windowId: 'library' },
    open_context_vault: { windowId: 'library' },
    open_trace_replay: { windowId: 'runtime', runtimeTab: 'replay' },
    open_benchmark_workbench: { windowId: 'compare' },
    open_model_center: { windowId: 'model_lab' },
    open_doctor: { windowId: 'doctor' },
    open_audit_log: { windowId: 'doctor', sectionTestId: 'talos-admin-section-audit' },
    open_policy_panel: { windowId: 'doctor', sectionTestId: 'talos-admin-section-policy' },
    open_shell_policy_panel: { windowId: 'doctor', sectionTestId: 'talos-admin-section-shell' },
    open_backup_panel: { windowId: 'doctor', sectionTestId: 'talos-admin-section-backup' },
    open_notes: { windowId: 'notes' },
    open_tasks: { windowId: 'tasks' },
    open_calendar_drafts: { windowId: 'calendar' },
    open_email_triage: { windowId: 'tasks', sectionTestId: 'talos-productivity-section-email-triage' },
}
const theme = ref<TalosThemeId>(TALOS_DEFAULT_THEME)
const prompt = ref('')
const sending = ref(false)
const creatingSession = ref(false)
const benchmarkingRunId = ref<string | null>(null)
const chatSurface = ref<{ scrollToBottom: () => void } | null>(null)
const uiError = ref<string | null>(null)
const commandPaletteOpen = ref(false)
const commandFeedback = ref('')
const runtimeRequestedTab = ref<NonNullable<CommandRoute['runtimeTab']>>('timeline')
const runtimeRequestedTabRevision = ref(0)
const settingsRequestedTab = ref<'models' | 'account'>('models')
const settingsRequestedTabRevision = ref(0)
const exportDialogOpen = ref(false)
const sessionExportResult = ref<TalosSessionExportPayload | null>(null)
const expandedEvidenceMessageIds = ref<string[]>([])
const selectedBenchmarkGroupId = ref<string | null>(null)
const selectedBenchmarkScenarioPath = ref<string | null>(null)
const modelPopoverOpen = ref(false)
const contextPopoverOpen = ref(false)
const selectedModelProfileId = ref('')
const selectedModelRoutingProfileId = ref('')
const selectedContextSetId = ref('')
const sessionPersistenceMode = ref<TalosSessionPersistenceMode>('persistent')
const railCollapsed = ref(false)
const railWidth = ref(236)
const themeDraftCustomization = ref<TalosThemeCustomization | null>(null)
const browserReducedMotion = ref(false)
const windowLaunchOrigins = ref<Partial<Record<TalosWindowId, TalosWindowLaunchOrigin>>>({})
const windowLaunchRevisions = ref<Partial<Record<TalosWindowId, number>>>({})
let reducedMotionQuery: MediaQueryList | null = null
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
    createMessage,
    exportSession,
} = useTalosSessions()
const { sendPersistentChat } = useTalosChat()
const {
    modelProfiles,
    usableModelProfiles,
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
    setWindowSize,
    resetWindowSize,
    saveWindowLayout,
} = useTalosWindows(props.initialSurface === 'dashboard' ? ['runtime'] : [])
const shellClass = computed(() => [
    talosThemeClass(theme.value),
    talosThemeIsLight(theme.value) ? 'talos-light' : 'talos-dark',
    `talos-density-${workspaceEffectiveThemeCustomization.value.density ?? 'comfortable'}`,
    `talos-radius-${workspaceEffectiveThemeCustomization.value.radius ?? 'balanced'}`,
    `talos-effect-${workspaceBackgroundEffect.value}`,
    workspaceMotionDisabled.value ? 'talos-motion-disabled' : '',
    workspaceUiMotionDisabled.value ? 'talos-ui-motion-disabled' : '',
    workspaceBackgroundDisabled.value ? 'talos-background-disabled' : '',
])
const currentThemePreset = computed(() => talosThemePreset(theme.value))
const workspaceMotionMode = computed(() => resolveTalosMotionMode(workspaceSettings.value?.preferences?.theme_motion))
const workspaceMotionDisabledPreference = computed(() => workspaceSettings.value?.preferences?.theme_motion_disabled === true)
const workspaceSimpleAnimation = computed(() => workspaceSettings.value?.preferences?.theme_simple_animation !== false)
const workspaceBackgroundDisabled = computed(() => workspaceSettings.value?.preferences?.theme_background_disabled === true)
const workspaceReducedMotionPreference = computed(() => workspaceSettings.value?.preferences?.reduced_motion === true)
const workspaceReducedMotion = computed(() => (
    workspaceReducedMotionPreference.value
    || (workspaceMotionMode.value === 'system' && browserReducedMotion.value)
))
const workspaceMotionDisabled = computed(() => (
    workspaceMotionDisabledPreference.value
    || workspaceReducedMotion.value
    || workspaceMotionMode.value === 'off'
))
const workspaceThemeCustomization = computed(() => sanitizeTalosThemeCustomization(workspaceSettings.value?.preferences?.theme_customization))
const workspaceEffectiveThemeCustomization = computed(() => themeDraftCustomization.value ?? workspaceThemeCustomization.value)
const workspaceAreaTokens = computed(() => sanitizeTalosThemeAreaTokens(workspaceSettings.value?.preferences?.theme_area_tokens))
const workspaceAppearanceVisibility = computed(() => resolveTalosAppearanceVisibility(workspaceSettings.value?.preferences?.appearance_visibility))
const workspaceKeyboardShortcuts = computed(() => resolveTalosShortcuts(workspaceSettings.value?.preferences?.keyboard_shortcuts))
const workspaceUiAnimationProfile = computed(() => resolveTalosUiAnimationProfile(workspaceSettings.value?.preferences?.ui_animation_profile))
const workspaceUiAnimationCustomization = computed(() => sanitizeTalosUiAnimationCustomization(workspaceSettings.value?.preferences?.ui_animation_customization))
const workspaceUiMotionDisabled = computed(() => (
    workspaceReducedMotion.value
    || workspaceUiAnimationProfile.value === 'off'
))
const workspaceBackgroundEffect = computed(() => talosBackgroundEffectFromCustomization(
    workspaceEffectiveThemeCustomization.value,
    currentThemePreset.value,
    workspaceBackgroundDisabled.value,
))
const currentRailWidth = computed(() => railCollapsed.value ? 64 : railWidth.value)
const workspaceStyle = computed(() => ({
    '--talos-rail-width': `${currentRailWidth.value}px`,
    ...talosThemeMotionStyle(workspaceMotionMode.value),
    ...talosUiAnimationStyle(
        theme.value,
        workspaceUiAnimationProfile.value,
        workspaceMotionMode.value,
        workspaceUiMotionDisabled.value,
        workspaceUiAnimationCustomization.value,
    ),
    ...talosThemeCustomizationStyle(workspaceEffectiveThemeCustomization.value),
    ...talosThemeAreaTokenStyle(workspaceAreaTokens.value),
}))
const selectedModelProfile = computed(() => findModelProfile(selectedModelProfileId.value))
const selectedContextSet = computed(() => contextSets.value.find((contextSet) => contextSet.id === selectedContextSetId.value) ?? null)
const selectedModelProfileIsUsable = computed(() => Boolean(selectedModelProfile.value && selectedModelProfile.value.status !== 'disabled' && selectedModelProfile.value.has_secret))
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
const canSend = computed(() => prompt.value.trim().length > 0 && !sending.value && selectedModelSelectionIsUsable.value)
const selectedBenchmarkScenarioIsRunnable = computed(() => {
    const path = selectedBenchmarkScenarioPath.value?.trim() ?? ''
    return path.startsWith('benchmark-scenarios/') && path.endsWith('.json')
})
const sendMessageCommandDisabledReason = computed(() => {
    if (sending.value) {
        return 'TALOS is already processing a message.'
    }
    if (!prompt.value.trim()) {
        return 'Type a workflow in the composer before sending.'
    }
    if (!selectedModelSelectionIsUsable.value) {
        return 'Choose a usable model or routing profile before sending.'
    }
    return ''
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
        return 'Kadmos is processing'
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
let stopRailResizeListeners: (() => void) | null = null
function isWindowId(value: string): value is TalosWindowId {
    return windowIds.includes(value as TalosWindowId)
}
function launchOriginFromEvent(event?: MouseEvent | PointerEvent, source: TalosWindowLaunchOrigin['source'] = 'default'): TalosWindowLaunchOrigin {
    const target = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
    const rect = target?.getBoundingClientRect()
    if (rect) {
        return {
            x: Math.round(rect.left + (rect.width / 2) - currentRailWidth.value),
            y: Math.round(rect.top + (rect.height / 2)),
            source,
        }
    }
    return {
        x: -Math.round(Math.max(72, currentRailWidth.value * 0.45)),
        y: typeof window === 'undefined' ? 120 : Math.round(window.innerHeight * 0.42),
        source,
    }
}
function setWindowLaunchOrigin(id: TalosWindowId, origin: TalosWindowLaunchOrigin) {
    windowLaunchOrigins.value = {
        ...windowLaunchOrigins.value,
        [id]: origin,
    }
    windowLaunchRevisions.value = {
        ...windowLaunchRevisions.value,
        [id]: (windowLaunchRevisions.value[id] ?? 0) + 1,
    }
}
function openWindowFromSource(id: TalosWindowId, event?: MouseEvent | PointerEvent, source: TalosWindowLaunchOrigin['source'] = 'default') {
    setWindowLaunchOrigin(id, launchOriginFromEvent(event, source))
    openWindow(id)
}
function stopRailResize() {
    if (stopRailResizeListeners) {
        stopRailResizeListeners()
        stopRailResizeListeners = null
    }
}
function startRailResize(event: PointerEvent) {
    if (railCollapsed.value || event.button !== 0) {
        return
    }
    event.preventDefault()
    const startX = event.clientX
    const startWidth = railWidth.value
    stopRailResize()
    document.body.style.userSelect = 'none'
    const handleMove = (moveEvent: PointerEvent) => {
        railWidth.value = Math.min(304, Math.max(204, startWidth + (moveEvent.clientX - startX)))
    }
    const stop = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
        document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    stopRailResizeListeners = stop
}
function loadWorkspacePreferences() {
    const savedTheme = localStorage.getItem('talos_theme')
    if (savedTheme) {
        theme.value = normalizeTalosTheme(savedTheme)
    }
    const savedPreferences = localStorage.getItem('talos_workspace_preferences')
    if (!savedPreferences) {
        return
    }
    try {
        const parsed = JSON.parse(savedPreferences) as { model_profile_id?: string; model_routing_profile_id?: string; context_set_id?: string }
        selectedModelProfileId.value = typeof parsed.model_profile_id === 'string' ? parsed.model_profile_id : ''
        selectedModelRoutingProfileId.value = typeof parsed.model_routing_profile_id === 'string' ? parsed.model_routing_profile_id : ''
        selectedContextSetId.value = typeof parsed.context_set_id === 'string' ? parsed.context_set_id : ''
    } catch {
        localStorage.removeItem('talos_workspace_preferences')
    }
}
function saveWorkspacePreferences() {
    localStorage.setItem('talos_workspace_preferences', JSON.stringify({
        model_profile_id: selectedModelProfileId.value,
        model_routing_profile_id: selectedModelRoutingProfileId.value,
        context_set_id: selectedContextSetId.value,
    }))
}
function persistThemePreference(nextTheme: TalosThemeId) {
    updateWorkspaceSettings({
        preferences: {
            ...(workspaceSettings.value?.preferences ?? {}),
            theme: nextTheme,
        },
    }).catch((error) => {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not persist the selected theme.'
    })
}
function toggleTheme(nextTheme?: TalosThemeId, persist = true) {
    theme.value = nextTheme ? normalizeTalosTheme(nextTheme) : (talosThemeIsLight(theme.value) ? 'forge' : 'paper')
    localStorage.setItem('talos_theme', theme.value)
    if (persist) {
        persistThemePreference(theme.value)
    }
}
async function refreshWorkspaceSettingsAfterThemeUpdate(nextSettings?: { preferences?: Record<string, unknown> }) {
    if (nextSettings && nextSettings.preferences) {
        workspaceSettings.value = {
            ...(workspaceSettings.value ?? {
                id: 'default',
                created_at: null,
                updated_at: null,
                default_model_profile_id: null,
                default_context_set_id: null,
            }),
            ...nextSettings,
            preferences: nextSettings.preferences,
        }
        return
    }
    try {
        await loadPersistedWorkspaceSettings()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not refresh workspace appearance settings.'
    }
}
async function handleWorkspaceSettingsSaved() {
    saveWorkspacePreferences()
    await refreshWorkspaceSettingsAfterThemeUpdate()
}
function handleThemeDraftChanged(customization: TalosThemeCustomization | null) {
    themeDraftCustomization.value = customization
}
function toggleMessageEvidence(message: TalosMessage) {
    expandedEvidenceMessageIds.value = expandedEvidenceMessageIds.value.includes(message.id)
        ? expandedEvidenceMessageIds.value.filter((id) => id !== message.id)
        : [...expandedEvidenceMessageIds.value, message.id]
}
function previousUserMessageFor(message: TalosMessage) {
    const index = messages.value.findIndex((item) => item.id === message.id)
    if (index <= 0) {
        return null
    }
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const candidate = messages.value[cursor]
        if (candidate.role === 'user') {
            return candidate
        }
    }
    return null
}
function scrollChat() {
    chatSurface.value?.scrollToBottom()
}
function titleFromPrompt(value: string) {
    const title = value.trim().replace(/\s+/g, ' ')
    if (!title) {
        return 'New chat'
    }
    return title.length > 64 ? `${title.slice(0, 61)}...` : title
}
async function startNewChat() {
    if (creatingSession.value) {
        return
    }
    creatingSession.value = true
    uiError.value = null
    try {
        await createSession('New chat', sessionPersistenceMode.value)
        prompt.value = ''
        sessionExportResult.value = null
        exportDialogOpen.value = false
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not create a chat session.'
    } finally {
        creatingSession.value = false
    }
}
async function chooseSession(session: TalosSession) {
    if (activeSession.value?.id === session.id || loadingMessages.value) {
        return
    }
    uiError.value = null
    try {
        await selectSession(session)
        sessionPersistenceMode.value = session.persistence_mode === 'temporary' ? 'temporary' : 'persistent'
        sessionExportResult.value = null
        exportDialogOpen.value = false
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load this session.'
    }
}
async function renameChatSession(session: TalosSession, title: string) {
    const nextTitle = title.trim()
    if (!nextTitle) {
        uiError.value = 'Chat name cannot be empty.'
        return
    }

    try {
        uiError.value = null
        await updateSessionTitle(session.id, nextTitle)
        commandFeedback.value = 'Chat renamed.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not rename this chat.'
    }
}
async function favoriteChatSession(session: TalosSession) {
    try {
        uiError.value = null
        const updated = await toggleSessionFavorite(session)
        commandFeedback.value = sessionChatState(updated).favorite
            ? 'Chat added to Favorites.'
            : 'Chat removed from Favorites.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not update the favorite state.'
    }
}
async function toggleChatSelection(session: TalosSession) {
    try {
        uiError.value = null
        await toggleManagedSessionSelected(session)
        commandFeedback.value = 'Chat selection updated.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not update the chat selection.'
    }
}
async function archiveChatSession(session: TalosSession) {
    try {
        uiError.value = null
        await archiveSession(session)
        commandFeedback.value = 'Chat archived.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not archive this chat.'
    }
}
async function moveChatSession(session: TalosSession, folder: string) {
    try {
        uiError.value = null
        await moveSessionToFolder(session, folder)
        commandFeedback.value = folder.trim() ? `Chat moved to ${folder.trim()}.` : 'Chat moved to Recent.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not move this chat.'
    }
}
async function deleteChatSession(session: TalosSession) {
    try {
        uiError.value = null
        await deleteSession(session.id)
        commandFeedback.value = 'Chat deleted.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not delete this chat.'
    }
}
async function copyChatSession(session: TalosSession) {
    try {
        uiError.value = null
        await copySession(session)
        commandFeedback.value = 'Chat copied.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not copy this chat.'
    }
}
async function ensureSessionForPrompt(message: string) {
    const desiredPersistenceMode = sessionPersistenceMode.value
    const activePersistenceMode = activeSession.value?.persistence_mode ?? 'persistent'
    if (activeSession.value && activePersistenceMode === desiredPersistenceMode) {
        if (activeSession.value.title === 'New chat' && messages.value.length === 0) {
            await updateSessionTitle(activeSession.value.id, titleFromPrompt(message))
        }
        return activeSession.value
    }
    return createSession(titleFromPrompt(message), desiredPersistenceMode)
}
function toggleTemporaryMode() {
    sessionPersistenceMode.value = sessionPersistenceMode.value === 'temporary' ? 'persistent' : 'temporary'
}
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
    if (!promptEnhancementResult.value) {
        return
    }
    prompt.value = promptEnhancementResult.value.enhanced_prompt
    clearPromptEnhancement()
}
function insertEnhancedPromptBelow() {
    if (!promptEnhancementResult.value) {
        return
    }
    const currentPrompt = prompt.value.trimEnd()
    prompt.value = currentPrompt
        ? `${currentPrompt}\n\n${promptEnhancementResult.value.enhanced_prompt}`
        : promptEnhancementResult.value.enhanced_prompt
    clearPromptEnhancement()
}
async function sendChatText(message: string, userMessageMetadata: Record<string, unknown> = {}, clearComposer = false) {
    const normalizedMessage = message.trim()
    if (!normalizedMessage || sending.value) {
        return false
    }
    if (!selectedModelSelectionIsUsable.value) {
        uiError.value = 'Choose a usable model or routing profile before sending.'
        openSettings()
        modelPopoverOpen.value = true
        return false
    }
    sending.value = true
    uiError.value = null
    if (clearComposer) {
        prompt.value = ''
    }
    try {
        const session = await ensureSessionForPrompt(normalizedMessage)
        await sendPersistentChat({
            sessionId: session.id,
            prompt: normalizedMessage,
            modelProfileId: selectedModelProfileId.value || null,
            modelRoutingProfileId: selectedModelRoutingProfileId.value || null,
            contextSetId: selectedContextSetId.value || null,
            chatEndpoint: '/api/talos/chat',
            userMessageMetadata,
            persistMessage: createMessage,
        })
        await nextTick()
        scrollChat()
        return true
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not complete this chat turn.'
        return false
    } finally {
        sending.value = false
        await nextTick()
        scrollChat()
    }
}
async function sendChat() {
    await sendChatText(prompt.value, {}, true)
}
async function resendMessage(message: TalosMessage) {
    if (message.role !== 'user') {
        return
    }
    const sent = await sendChatText(message.content, {
        command_id: 'resend_message',
        resend_of_message_id: message.id,
    })
    if (sent) {
        commandFeedback.value = 'Message resent through TALOS chat.'
    }
}
async function retryAssistantMessage(message: TalosMessage) {
    if (message.role !== 'assistant') {
        return
    }
    const previousUserMessage = previousUserMessageFor(message)
    if (!previousUserMessage) {
        uiError.value = 'TALOS could not find the prompt that produced this answer.'
        return
    }
    const sent = await sendChatText(previousUserMessage.content, {
        command_id: 'retry_assistant_response',
        retry_of_message_id: message.id,
        resend_of_message_id: previousUserMessage.id,
    })
    if (sent) {
        commandFeedback.value = 'Assistant response retried through TALOS chat.'
    }
}
async function benchmarkMessageRun(message: TalosMessage) {
    if (!activeSession.value || !message.run_id || benchmarkingRunId.value) {
        return
    }
    benchmarkingRunId.value = message.run_id
    uiError.value = null
    try {
        const response = await talosFetch<{
            benchmark_group?: { id?: string; name?: string }
        }>(`/api/talos/runs/${message.run_id}/benchmark`, {
            method: 'POST',
            body: JSON.stringify({ runs: 1 }),
            validationMessage: 'TALOS could not create a benchmark for this run.',
        })
        const groupId = response.benchmark_group?.id ?? 'unknown'
        selectedBenchmarkGroupId.value = response.benchmark_group?.id ?? null
        await createMessage(activeSession.value.id, {
            role: 'system',
            content: `Benchmark run created for ${message.run_id}. Group: ${groupId}. Open Compare to inspect persisted AVM ON/OFF lanes.`,
            run_id: message.run_id,
            metadata: {
                source: 'talos_chat_benchmark',
                benchmark_group: response.benchmark_group ?? null,
            },
        })
        openWindowFromSource('compare', undefined, 'command')
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not benchmark this run.'
    } finally {
        benchmarkingRunId.value = null
    }
}
async function runSelectedBenchmarkScenario() {
    const path = selectedBenchmarkScenarioPath.value?.trim() ?? ''
    if (!selectedBenchmarkScenarioIsRunnable.value) {
        uiError.value = runAvmCompareCommandDisabledReason.value
        openWindowFromSource('compare', undefined, 'command')
        return
    }
    uiError.value = null
    commandFeedback.value = ''
    try {
        const response = await talosFetch<{
            benchmark_group?: { id?: string; name?: string }
        }>('/api/benchmarks/compare', {
            method: 'POST',
            body: JSON.stringify({
                scenario_path: path,
                runs: 1,
            }),
            validationMessage: 'TALOS rejected the benchmark comparison request.',
        })
        selectedBenchmarkGroupId.value = response.benchmark_group?.id ?? null
        openWindowFromSource('compare', undefined, 'command')
        commandFeedback.value = 'Benchmark comparison completed.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not run the benchmark comparison.'
    }
}
function openModule(id: string, event?: MouseEvent | PointerEvent) {
    if (!isWindowId(id)) {
        return
    }
    if (id === 'settings') {
        openSettings('models', event)
        return
    }
    openWindowFromSource(id, event, 'sidebar')
}
function openSettings(tab: 'models' | 'account' = 'models', event?: MouseEvent | PointerEvent) {
    settingsRequestedTab.value = tab
    settingsRequestedTabRevision.value += 1
    openWindowFromSource('settings', event, event ? 'sidebar' : 'command')
}
function openAccountSettings() {
    openSettings('account')
}
function closePopover() {
    modelPopoverOpen.value = false
    contextPopoverOpen.value = false
}
function toggleModelPopover() {
    modelPopoverOpen.value = !modelPopoverOpen.value
    contextPopoverOpen.value = false
    clearPromptEnhancement()
}
function toggleContextPopover() {
    contextPopoverOpen.value = !contextPopoverOpen.value
    modelPopoverOpen.value = false
    clearPromptEnhancement()
}
function selectModelProfile(profileId: string) {
    selectedModelProfileId.value = profileId
    if (profileId) {
        selectedModelRoutingProfileId.value = ''
    }
    saveWorkspacePreferences()
}
function selectModelRoutingProfile(profileId: string) {
    selectedModelRoutingProfileId.value = profileId
    if (profileId) {
        selectedModelProfileId.value = ''
    }
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
function handleBenchmarkScenarioSelected(scenarioPath: string) {
    selectedBenchmarkScenarioPath.value = scenarioPath
    openWindowFromSource('compare', undefined, 'command')
}
function openCommandPalette() {
    commandPaletteOpen.value = true
}
function closeCommandPalette() {
    commandPaletteOpen.value = false
}
function focusChatInput() {
    document.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')?.focus()
}
async function focusCommandRoute(route: CommandRoute) {
    if (route.windowId === 'runtime' && route.runtimeTab) {
        runtimeRequestedTab.value = route.runtimeTab
        runtimeRequestedTabRevision.value += 1
    }
    openWindowFromSource(route.windowId, undefined, 'command')
    if (dockedWindowIds.value.includes(route.windowId)) {
        toggleDock(route.windowId)
    }
    if (!route.sectionTestId || typeof document === 'undefined') {
        return true
    }
    await nextTick()
    const section = document.querySelector<HTMLElement>(`[data-testid="${route.sectionTestId}"]`)
    if (!section) {
        return false
    }
    section.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
    section.focus({ preventScroll: true })
    return true
}
function openSessionExportDialog() {
    if (!activeSession.value) {
        commandFeedback.value = exportReportCommandDisabledReason.value
        return
    }
    closeCommandPalette()
    closePopover()
    sessionExportResult.value = null
    exportDialogOpen.value = true
}
function closeSessionExportDialog() {
    exportDialogOpen.value = false
}
async function runSessionExport(format: TalosSessionExportFormat) {
    if (!activeSession.value) {
        commandFeedback.value = exportReportCommandDisabledReason.value
        return
    }
    try {
        sessionExportResult.value = await exportSession(activeSession.value.id, format)
        commandFeedback.value = `${sessionExportResult.value.report_type} exported.`
    } catch (error) {
        commandFeedback.value = error instanceof Error ? error.message : 'TALOS could not export this session.'
    }
}
async function selectCommand(commandId: TalosCommand['id']) {
    const command = workspaceCommands.value.find((item) => item.id === commandId)
    const route = commandWindowTargets[commandId]
    if (commandId === 'new_session') {
        closeCommandPalette()
        await startNewChat()
        commandFeedback.value = 'New session opened.'
        return
    }
    if (commandId === 'send_message') {
        closeCommandPalette()
        await sendChat()
        commandFeedback.value = uiError.value ? '' : 'Message sent through TALOS chat.'
        return
    }
    if (commandId === 'run_avm_compare') {
        closeCommandPalette()
        await runSelectedBenchmarkScenario()
        return
    }
    if (commandId === 'export_report') {
        openSessionExportDialog()
        return
    }
    if (route) {
        closeCommandPalette()
        const focused = await focusCommandRoute(route)
        commandFeedback.value = focused
            ? `${command?.label ?? 'Command'} opened.`
            : `${command?.label ?? 'Command'} opened, but TALOS could not focus the requested section.`
    } else {
        commandFeedback.value = command?.disabledReason || command?.description || 'Command selected.'
        closeCommandPalette()
    }
}
async function openAuditLogFromRuntime() {
    const route = commandWindowTargets.open_audit_log
    if (!route) {
        commandFeedback.value = 'Audit log route is not available.'
        return
    }
    const focused = await focusCommandRoute(route)
    commandFeedback.value = focused
        ? 'Audit log opened.'
        : 'Audit log opened, but TALOS could not focus the audit section.'
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
    await Promise.allSettled([
        loadModelProfiles(),
        loadModelRoutingProfiles(),
        loadContextSets(),
    ])
    if (!selectedModelProfileId.value && !selectedModelRoutingProfileId.value && usableModelProfiles.value.length > 0) {
        selectedModelProfileId.value = usableModelProfiles.value[0].id
        saveWorkspacePreferences()
    } else if (!selectedModelProfileId.value && !selectedModelRoutingProfileId.value && usableModelRoutingProfiles.value.length > 0) {
        selectedModelRoutingProfileId.value = usableModelRoutingProfiles.value[0].id
        saveWorkspacePreferences()
    }
}
async function loadPersistedWorkspaceSettings() {
    const settings = await loadWorkspaceSettings()
    if (settings.default_model_profile_id) {
        selectedModelProfileId.value = settings.default_model_profile_id
        selectedModelRoutingProfileId.value = ''
    }
    if (settings.default_context_set_id) {
        selectedContextSetId.value = settings.default_context_set_id
    }
    const storedTheme = settings.preferences?.theme
    if (storedTheme) {
        const nextTheme = normalizeTalosTheme(storedTheme)
        theme.value = nextTheme
        localStorage.setItem('talos_theme', nextTheme)
    }
}
function applyQueryModules() {
    const params = new URLSearchParams(window.location.search)
    const module = params.get('module')
    if (module && isWindowId(module)) {
        openWindowFromSource(module, undefined, 'command')
    }
    if (params.has('run')) {
        openWindowFromSource('runtime', undefined, 'command')
    }
    if (params.has('benchmark')) {
        openWindowFromSource('compare', undefined, 'command')
    }
}
function handleReducedMotionChange(event: MediaQueryListEvent) {
    browserReducedMotion.value = event.matches
}
function startReducedMotionWatcher() {
    if (!window.matchMedia) {
        return
    }
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    browserReducedMotion.value = reducedMotionQuery.matches
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
}
function stopReducedMotionWatcher() {
    reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
    reducedMotionQuery = null
}
onMounted(async () => {
    loadWorkspacePreferences()
    startReducedMotionWatcher()
    applyQueryModules()
    try {
        await refreshModelAndContext()
        await loadPersistedWorkspaceSettings()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load model and context state.'
    }
    try {
        const loadedSessions = await loadSessions()
        if (loadedSessions.length > 0) {
            await selectSession(loadedSessions[0])
            await nextTick()
            scrollChat()
        }
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load chat sessions.'
    }
})
onBeforeUnmount(() => {
    stopReducedMotionWatcher()
    stopRailResize()
})
</script>
<template>
    <main
        :class="['talos-shell talos-workspace talos-chat-layout flex min-h-screen overflow-hidden', shellClass]"
        :style="workspaceStyle"
        :data-background-effect="workspaceBackgroundEffect"
        :data-ui-animation-profile="workspaceUiAnimationProfile"
        :data-ui-motion-disabled="workspaceUiMotionDisabled ? 'true' : 'false'"
        data-testid="talos-workspace"
    >
        <TalosLeftRail
            :active-ids="openWindowIds"
            :theme="theme"
            :creating-session="creatingSession"
            :collapsed="railCollapsed"
            :width="railWidth"
            :visibility="workspaceAppearanceVisibility.sidebar"
            :sessions="sessions"
            :active-session-id="activeSession?.id ?? null"
            @open="openModule"
            @new-chat="startNewChat"
            @select-session="chooseSession"
            @rename-session="renameChatSession"
            @favorite-session="favoriteChatSession"
            @toggle-session-selected="toggleChatSelection"
            @archive-session="archiveChatSession"
            @move-session-to-folder="moveChatSession"
            @delete-session="deleteChatSession"
            @copy-session="copyChatSession"
            @toggle-theme="toggleTheme()"
            @collapse="railCollapsed = true"
            @expand="railCollapsed = false"
            @resize-start="startRailResize"
        />
        <section class="relative flex min-w-0 flex-1 flex-col">
            <TalosProceduralBackground
                :effect="workspaceBackgroundEffect"
                :motion="workspaceMotionMode"
                :motion-disabled="workspaceMotionDisabled"
                :simple-animation="workspaceSimpleAnimation"
            />
            <TalosWorkspaceHeader
                v-if="workspaceAppearanceVisibility.chat_area.session_header"
                :logo-url="talosShortLogoUrl"
                :workspace-subtitle="workspaceSubtitle"
                :status-text="statusText"
                :temporary-session="activeSessionIsTemporary"
                :has-active-session="Boolean(activeSession)"
                :exporting-session="exportingSession"
                :authenticated="authenticated"
                :auth-label="authLabel"
                :login-url="loginUrl"
                :logout-url="logoutUrl"
                :csrf-token="csrfToken"
                @open-commands="openCommandPalette"
                @open-export="openSessionExportDialog"
                @open-account="openAccountSettings"
            />
            <TalosMobileRail
                :creating-session="creatingSession"
                :visibility="workspaceAppearanceVisibility.sidebar"
                @new-chat="startNewChat"
                @open-window="openModule"
            />
            <TalosChatSurface
                ref="chatSurface"
                :ui-error="uiError"
                :session-error="sessionError"
                :message-error="messageError"
                :model-profile-error="modelProfileError || modelRoutingProfileError"
                :context-set-error="contextSetError"
                :loading-messages="loadingMessages"
                :messages="messages"
                :logo-url="talosShortLogoUrl"
                :selected-model-profile-is-usable="selectedModelSelectionIsUsable"
                :context-selected="Boolean(selectedContextSet)"
                :context-sets-count="contextSets.length"
                :session-ready="Boolean(activeSession)"
                :message-evidence-ready="messageEvidenceReady"
                :sending="sending"
                :benchmarking-run-id="benchmarkingRunId"
                :expanded-evidence-message-ids="expandedEvidenceMessageIds"
                :welcome-prompt-id="activeWelcomePromptId"
                :show-welcome-message="workspaceAppearanceVisibility.chat_area.welcome_message"
                :full-width-chat="workspaceAppearanceVisibility.chat_area.full_width_chat"
                :sensitive-blur="workspaceAppearanceVisibility.chat_area.sensitive_blur"
                @open-model="openWindowFromSource('model_lab', undefined, 'command')"
                @open-context="openWindowFromSource('library', undefined, 'command')"
                @set-prompt="prompt = $event"
                @message-copied="commandFeedback = 'Message copied.'"
                @message-copy-failed="uiError = 'TALOS could not access the clipboard. Use your browser copy shortcut.'"
                @message-edited="commandFeedback = 'Prompt loaded for reuse.'"
                @resend-message="resendMessage"
                @retry-assistant-message="retryAssistantMessage"
                @toggle-message-evidence="toggleMessageEvidence"
                @benchmark-message-run="benchmarkMessageRun"
            />
            <TalosWindowLayer
                :visible-window-ids="visibleWindowIds" :minimized-window-ids="minimizedWindowIds" :docked-window-ids="dockedWindowIds" :fullscreen-window-ids="fullscreenWindowIds"
                :active-window-id="activeWindowId" :window-positions="windowPositions" :window-sizes="windowSizes" :window-z-indexes="windowZIndexes" :current-rail-width="currentRailWidth"
                :runtime-requested-tab="runtimeRequestedTab" :runtime-requested-tab-revision="runtimeRequestedTabRevision" :selected-benchmark-group-id="selectedBenchmarkGroupId" :selected-benchmark-scenario-path="selectedBenchmarkScenarioPath"
                :model-profiles="modelProfiles" :context-sets="contextSets" :selected-model-profile-id="selectedModelProfileId" :selected-context-set-id="selectedContextSetId"
                :settings-requested-tab="settingsRequestedTab" :settings-requested-tab-revision="settingsRequestedTabRevision" :authenticated="authenticated" :auth-user-name="authUserName" :logout-url="logoutUrl" :csrf-token="csrfToken"
                :theme="theme" :ui-motion-disabled="workspaceUiMotionDisabled" :window-launch-origins="windowLaunchOrigins" :window-launch-revisions="windowLaunchRevisions"
                @close-window="closeWindow" @minimize-window="minimizeWindow" @dock-window="toggleDock" @fullscreen-window="toggleFullscreenWindow" @focus-window="focusWindow"
                @open-window="openWindowFromSource($event, undefined, 'command')" @restore-window="openWindow" @set-window-position="setWindowPosition" @set-window-size="setWindowSize"
                @reset-window-size="resetWindowSize" @save-window-layout="saveWindowLayout" @open-audit-log="openAuditLogFromRuntime" @context-set-created="handleContextSetCreated"
                @benchmark-scenario-selected="handleBenchmarkScenarioSelected" @select-model="selectModelProfile" @select-context="selectContextSet" @change-theme="toggleTheme"
                @open-module="openModule" @settings-saved="handleWorkspaceSettingsSaved" @theme-customization-changed="refreshWorkspaceSettingsAfterThemeUpdate" @theme-draft-changed="handleThemeDraftChanged"
            />
            <TalosComposerDock
                :prompt="prompt" :commands="workspaceCommands" :can-send="canSend" :sending="sending" :status-text="statusText" :model-label="modelLabel" :context-label="contextLabel"
                :temporary-mode="sessionPersistenceMode === 'temporary'" :send-disabled-reason="sendMessageCommandDisabledReason" :enhancer-disabled-reason="assistantEnhancerDisabledReason"
                :model-popover-open="modelPopoverOpen" :context-popover-open="contextPopoverOpen" :model-profiles="modelProfiles" :model-routing-profiles="modelRoutingProfiles" :context-sets="contextSets"
                :selected-model-profile-id="selectedModelProfileId" :selected-model-routing-profile-id="selectedModelRoutingProfileId" :selected-context-set-id="selectedContextSetId" :selected-context-set="selectedContextSet"
                :loading-model-profiles="loadingModelProfiles" :loading-model-routing-profiles="loadingModelRoutingProfiles" :loading-context-sets="loadingContextSets"
                :prompt-enhancement-result="promptEnhancementResult" :enhancing-prompt="enhancingPrompt" :prompt-enhancement-error="promptEnhancementError" :visibility="workspaceAppearanceVisibility.chat_bar"
                @update-prompt="prompt = $event" @send="sendChat" @open-model="toggleModelPopover" @open-context="toggleContextPopover" @open-settings="openSettings()" @toggle-temporary="toggleTemporaryMode"
                @enhance="enhanceCurrentPrompt" @slash-command="selectCommand" @select-model-profile="selectModelProfile" @select-model-routing-profile="selectModelRoutingProfile" @select-context-set="selectContextSet"
                @refresh-model-and-context="refreshModelAndContext" @open-model-lab="openWindowFromSource('model_lab', undefined, 'command')" @open-library="openWindowFromSource('library', undefined, 'command')"
                @replace-prompt-with-enhanced="replacePromptWithEnhanced" @insert-enhanced-prompt-below="insertEnhancedPromptBelow" @clear-prompt-enhancement="clearPromptEnhancement"
            />
            <div
                v-if="commandPaletteOpen"
                class="talos-command-palette-overlay fixed inset-0 z-50 bg-black/40 px-4 py-16 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label="TALOS command palette"
                @click.self="closeCommandPalette"
            >
                <div class="mx-auto w-full max-w-2xl">
                    <TalosCommandPalette :commands="workspaceCommands" @selected="selectCommand" />
                </div>
            </div>
            <TalosExportDialog
                v-if="exportDialogOpen"
                :session="activeSession"
                :result="sessionExportResult"
                :exporting="exportingSession"
                :error="sessionExportError"
                @close="closeSessionExportDialog"
                @export="runSessionExport"
            />
            <div v-if="commandFeedback" class="fixed right-4 top-20 z-50 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2 text-xs text-[var(--talos-muted)] shadow">
                {{ commandFeedback }}
            </div>
        </section>
    </main>
</template>
