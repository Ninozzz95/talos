<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { AlertCircle, BarChart3, Command, Loader2, ShieldCheck } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Input from '../../ui/Input.vue'
import Select from '../../ui/Select.vue'
import TalosEvidenceDrawer from '../chat/TalosEvidenceDrawer.vue'
import TalosPromptEnhancerPopover from '../chat/TalosPromptEnhancerPopover.vue'
import TalosSlimComposer from '../chat/TalosSlimComposer.vue'
import TalosToolWindow from '../window/TalosToolWindow.vue'
import TalosGuidedStart from './TalosGuidedStart.vue'
import TalosLeftRail from './TalosLeftRail.vue'
import TalosProceduralBackground from './TalosProceduralBackground.vue'
import TalosBenchmarkWorkbench from '../benchmarks/TalosBenchmarkWorkbench.vue'
import TalosModelCenter from '../models/TalosModelCenter.vue'
import TalosContextVault from '../context/TalosContextVault.vue'
import TalosRunTimeline from '../runs/TalosRunTimeline.vue'
import TalosToolRegistry from '../tools/TalosToolRegistry.vue'
import TalosMemoryManager from '../memory/TalosMemoryManager.vue'
import TalosSkillRegistry from '../memory/TalosSkillRegistry.vue'
import TalosSkillAudit from '../memory/TalosSkillAudit.vue'
import TalosResearchWorkbench from '../research/TalosResearchWorkbench.vue'
import TalosDocuments from '../documents/TalosDocuments.vue'
import TalosArtifactGallery from '../documents/TalosArtifactGallery.vue'
import TalosNotes from '../productivity/TalosNotes.vue'
import TalosTasks from '../productivity/TalosTasks.vue'
import TalosCalendar from '../productivity/TalosCalendar.vue'
import TalosEmailTriage from '../email/TalosEmailTriage.vue'
import TalosDoctorPanel from '../admin/TalosDoctorPanel.vue'
import TalosAuditLog from '../admin/TalosAuditLog.vue'
import TalosPolicyPanel from '../admin/TalosPolicyPanel.vue'
import TalosBackupPanel from '../admin/TalosBackupPanel.vue'
import TalosCommandPalette from '../shell/TalosCommandPalette.vue'
import TalosSettingsCenter from '../settings/TalosSettingsCenter.vue'
import TalosThemeEngine from '../settings/TalosThemeEngine.vue'
import { useTalosChat } from '../../../composables/useTalosChat'
import { useTalosContextVault } from '../../../composables/useTalosContextVault'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import { useTalosPromptEnhancement } from '../../../composables/useTalosPromptEnhancement'
import { useTalosSessions, type TalosSessionPersistenceMode } from '../../../composables/useTalosSessions'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import { useTalosWindows, type TalosWindowId, type TalosWindowPosition } from '../../../composables/useTalosWindows'
import { talosFetch } from '../../../lib/api'
import { talosCommands } from '../../../lib/commandRegistry'
import {
    TALOS_DEFAULT_THEME,
    normalizeTalosTheme,
    resolveTalosMotionMode,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    talosBackgroundEffectFromCustomization,
    talosThemeAreaTokenStyle,
    talosThemeClass,
    talosThemeCustomizationStyle,
    talosThemeMotionStyle,
    talosThemePreset,
    talosThemeIsLight,
    type TalosThemeCustomization,
    type TalosThemeId,
} from '../../../lib/talosThemes'
import type { TalosCommand, TalosContextSet, TalosMessage, TalosSession } from '../../../lib/talosTypes'

type InitialSurface = 'workspace' | 'chat' | 'dashboard'
type MessageSource = {
    context_set_id?: string
    file_id?: string
    chunk_id?: string
    file_name?: string
    preview?: string
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

const windowIds: TalosWindowId[] = [
    'runtime',
    'search',
    'brain',
    'calendar',
    'compare',
    'model_lab',
    'research',
    'gallery',
    'library',
    'notes',
    'tasks',
    'settings',
    'theme',
    'doctor',
    'tools',
]

const windowCopy: Record<TalosWindowId, { title: string; description: string }> = {
    runtime: { title: 'Runtime', description: 'Runs, replay and recovery evidence.' },
    search: { title: 'Knowledge', description: 'Persisted files, context sets and generated documents.' },
    brain: { title: 'Brain', description: 'Memory, skills and planning context.' },
    calendar: { title: 'Calendar', description: 'Calendar drafts, no external write without confirmation.' },
    compare: { title: 'Compare', description: 'AVM ON/OFF benchmark workbench.' },
    model_lab: { title: 'Model Lab', description: 'Server-side model profiles and probes.' },
    research: { title: 'Deep Research', description: 'Research reports, sources and claims.' },
    gallery: { title: 'Artifacts', description: 'Run artifacts and previews with provenance.' },
    library: { title: 'Library', description: 'Files, context sets and generated documents.' },
    notes: { title: 'Notes', description: 'Untrusted notes, never silently injected.' },
    tasks: { title: 'Tasks', description: 'Persisted tasks and workflow follow-up.' },
    settings: { title: 'Settings', description: 'Workspace setup and safe configuration.' },
    theme: { title: 'Theme', description: 'Appearance controls for this workspace.' },
    doctor: { title: 'Doctor', description: 'Readiness, policy, audit and backup controls.' },
    tools: { title: 'Tools', description: 'Connectors and tool registry.' },
}

type CommandRoute = {
    windowId: TalosWindowId
    sectionTestId?: string
}

const commandWindowTargets: Partial<Record<TalosCommand['id'], CommandRoute>> = {
    attach_file: { windowId: 'library' },
    open_context_vault: { windowId: 'library' },
    open_trace_replay: { windowId: 'runtime' },
    open_benchmark_workbench: { windowId: 'compare' },
    open_model_center: { windowId: 'model_lab' },
    open_doctor: { windowId: 'doctor' },
    open_audit_log: { windowId: 'doctor', sectionTestId: 'talos-admin-section-audit' },
    open_policy_panel: { windowId: 'doctor', sectionTestId: 'talos-admin-section-policy' },
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
const chatThreadEl = ref<HTMLElement | null>(null)
const uiError = ref<string | null>(null)
const commandPaletteOpen = ref(false)
const commandFeedback = ref('')
const adminToken = ref('')
const expandedEvidenceMessageIds = ref<string[]>([])
const selectedBenchmarkGroupId = ref<string | null>(null)
const selectedBenchmarkScenarioPath = ref<string | null>(null)
const modelPopoverOpen = ref(false)
const contextPopoverOpen = ref(false)
const selectedModelProfileId = ref('')
const selectedContextSetId = ref('')
const sessionPersistenceMode = ref<TalosSessionPersistenceMode>('persistent')
const railCollapsed = ref(false)
const railWidth = ref(236)
const themeDraftCustomization = ref<TalosThemeCustomization | null>(null)

const {
    sessions,
    activeSession,
    messages,
    loadingSessions,
    loadingMessages,
    sessionError,
    messageError,
    loadSessions,
    createSession,
    updateSessionTitle,
    selectSession,
    createMessage,
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
    activeWindowId,
    windowPositions,
    windowZIndexes,
    openWindow,
    closeWindow,
    minimizeWindow,
    toggleDock,
    focusWindow,
    setWindowPosition,
} = useTalosWindows(props.initialSurface === 'dashboard' ? ['runtime'] : [])

const shellClass = computed(() => [
    talosThemeClass(theme.value),
    talosThemeIsLight(theme.value) ? 'talos-light' : 'talos-dark',
    `talos-density-${workspaceEffectiveThemeCustomization.value.density ?? 'comfortable'}`,
    `talos-radius-${workspaceEffectiveThemeCustomization.value.radius ?? 'balanced'}`,
    `talos-effect-${workspaceBackgroundEffect.value}`,
])
const currentThemePreset = computed(() => talosThemePreset(theme.value))
const workspaceReducedMotion = computed(() => workspaceSettings.value?.preferences?.reduced_motion === true)
const workspaceThemeCustomization = computed(() => sanitizeTalosThemeCustomization(workspaceSettings.value?.preferences?.theme_customization))
const workspaceEffectiveThemeCustomization = computed(() => themeDraftCustomization.value ?? workspaceThemeCustomization.value)
const workspaceMotionMode = computed(() => resolveTalosMotionMode(workspaceSettings.value?.preferences?.theme_motion))
const workspaceAreaTokens = computed(() => sanitizeTalosThemeAreaTokens(workspaceSettings.value?.preferences?.theme_area_tokens))
const workspaceBackgroundEffect = computed(() => talosBackgroundEffectFromCustomization(
    workspaceEffectiveThemeCustomization.value,
    currentThemePreset.value,
    workspaceReducedMotion.value,
    workspaceMotionMode.value,
))
const currentRailWidth = computed(() => railCollapsed.value ? 64 : railWidth.value)
const workspaceStyle = computed(() => ({
    '--talos-rail-width': `${currentRailWidth.value}px`,
    ...talosThemeMotionStyle(workspaceMotionMode.value),
    ...talosThemeCustomizationStyle(workspaceEffectiveThemeCustomization.value),
    ...talosThemeAreaTokenStyle(workspaceAreaTokens.value),
}))
const floatingWindowIds = computed(() => visibleWindowIds.value.filter((item) => !dockedWindowIds.value.includes(item)))
const dockedVisibleWindowIds = computed(() => visibleWindowIds.value.filter((item) => dockedWindowIds.value.includes(item)))
const hasDockedWindows = computed(() => dockedVisibleWindowIds.value.length > 0)
const selectedModelProfile = computed(() => findModelProfile(selectedModelProfileId.value))
const selectedContextSet = computed(() => contextSets.value.find((contextSet) => contextSet.id === selectedContextSetId.value) ?? null)
const selectedModelProfileIsUsable = computed(() => Boolean(selectedModelProfile.value && selectedModelProfile.value.status !== 'disabled' && selectedModelProfile.value.has_secret))
const messageEvidenceReady = computed(() => messages.value.some((message) => message.role === 'assistant' && Boolean(message.run_id)))
const activeSessionIsTemporary = computed(() => activeSession.value?.persistence_mode === 'temporary')
const canSend = computed(() => prompt.value.trim().length > 0 && !sending.value && selectedModelProfileIsUsable.value)
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

    if (!selectedModelProfileIsUsable.value) {
        return 'Choose a usable server-side model profile before sending.'
    }

    return ''
})
const runAvmCompareCommandDisabledReason = computed(() => {
    if (selectedBenchmarkScenarioIsRunnable.value) {
        return ''
    }

    return 'Select a private benchmark scenario from Context Vault before running AVM compare.'
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

    return command
}))
const modelLabel = computed(() => {
    if (selectedModelProfile.value) {
        return selectedModelProfile.value.display_name
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

    if (selectedModelProfileIsUsable.value) {
        const context = selectedContextSet.value ? ` + ${selectedContextSet.value.name}` : ''
        return `${selectedModelProfile.value?.display_name}${context}`
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

    if (!selectedModelProfileIsUsable.value) {
        return 'Add a model profile first'
    }

    if (!prompt.value.trim()) {
        return 'Write a prompt first'
    }

    return ''
})
const workspaceSubtitle = computed(() => {
    if (selectedModelProfileIsUsable.value) {
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
let stopWindowDragListeners: (() => void) | null = null
let stopRailResizeListeners: (() => void) | null = null

function isWindowId(value: string): value is TalosWindowId {
    return windowIds.includes(value as TalosWindowId)
}

function defaultFloatingWindowPosition(index: number): TalosWindowPosition {
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
    const maxX = Math.max(16, viewportWidth - currentRailWidth.value - 780)
    const maxY = Math.max(72, viewportHeight - 430)

    return {
        x: Math.min(220 + (index * 28), maxX),
        y: Math.min(30 + (index * 28), maxY),
    }
}

function clampFloatingWindowPosition(position: TalosWindowPosition): TalosWindowPosition {
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
    const maxX = Math.max(16, viewportWidth - currentRailWidth.value - 380)
    const maxY = Math.max(72, viewportHeight - 250)

    return {
        x: Math.min(Math.max(16, position.x), maxX),
        y: Math.min(Math.max(24, position.y), maxY),
    }
}

function floatingWindowPosition(id: TalosWindowId, index: number): TalosWindowPosition {
    return windowPositions.value[id] ?? defaultFloatingWindowPosition(index)
}

function floatingWindowStyle(id: TalosWindowId, index: number) {
    const position = floatingWindowPosition(id, index)

    return {
        '--talos-window-x': `${position.x}px`,
        '--talos-window-y': `${position.y}px`,
        zIndex: String(30 + (windowZIndexes.value[id] ?? index)),
    }
}

function stopWindowDrag() {
    if (stopWindowDragListeners) {
        stopWindowDragListeners()
        stopWindowDragListeners = null
    }
}

function startWindowDrag(id: string, event: PointerEvent) {
    if (!isWindowId(id) || event.button !== 0 || dockedWindowIds.value.includes(id)) {
        return
    }

    event.preventDefault()
    focusWindow(id)

    const index = Math.max(0, floatingWindowIds.value.indexOf(id))
    const initialPosition = floatingWindowPosition(id, index)
    const startX = event.clientX
    const startY = event.clientY

    stopWindowDrag()
    document.body.style.userSelect = 'none'

    const handleMove = (moveEvent: PointerEvent) => {
        setWindowPosition(id, clampFloatingWindowPosition({
            x: initialPosition.x + (moveEvent.clientX - startX),
            y: initialPosition.y + (moveEvent.clientY - startY),
        }))
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
    stopWindowDragListeners = stop
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
        const parsed = JSON.parse(savedPreferences) as { model_profile_id?: string; context_set_id?: string }
        selectedModelProfileId.value = typeof parsed.model_profile_id === 'string' ? parsed.model_profile_id : ''
        selectedContextSetId.value = typeof parsed.context_set_id === 'string' ? parsed.context_set_id : ''
    } catch {
        localStorage.removeItem('talos_workspace_preferences')
    }
}

function saveWorkspacePreferences() {
    localStorage.setItem('talos_workspace_preferences', JSON.stringify({
        model_profile_id: selectedModelProfileId.value,
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

async function refreshWorkspaceSettingsAfterThemeUpdate() {
    try {
        await loadPersistedWorkspaceSettings()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not refresh workspace appearance settings.'
    }
}

function handleThemeDraftChanged(customization: TalosThemeCustomization | null) {
    themeDraftCustomization.value = customization
}

function formatTime(value: string) {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function messageLabel(message: TalosMessage) {
    if (message.role === 'user') {
        return 'Tu'
    }

    if (message.role === 'assistant') {
        return 'TALOS'
    }

    return 'Sistema'
}

function messageMeta(message: TalosMessage) {
    if (message.role === 'user') {
        return 'persisted prompt'
    }

    const summary = message.metadata?.summary
    if (typeof summary === 'string' && summary.trim()) {
        return summary.replaceAll('_', ' ')
    }

    const faultType = message.metadata?.fault_type
    if (typeof faultType === 'string' && faultType.trim()) {
        return faultType.replaceAll('_', ' ')
    }

    return message.role === 'assistant' ? 'persisted answer' : 'system note'
}

function messageMutations(message: TalosMessage) {
    const mutations = message.metadata?.mutations
    return Array.isArray(mutations) ? mutations : []
}

function messageSources(message: TalosMessage): MessageSource[] {
    const sources = message.metadata?.used_context

    if (!Array.isArray(sources)) {
        return []
    }

    return sources.flatMap((source) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return []
        }

        return [source as MessageSource]
    })
}

function messageHasEvidence(message: TalosMessage) {
    return message.role === 'assistant'
        && (Boolean(message.run_id) || messageMutations(message).length > 0 || messageSources(message).length > 0)
}

function messageEvidenceOpen(message: TalosMessage) {
    return expandedEvidenceMessageIds.value.includes(message.id)
}

function toggleMessageEvidence(message: TalosMessage) {
    expandedEvidenceMessageIds.value = messageEvidenceOpen(message)
        ? expandedEvidenceMessageIds.value.filter((id) => id !== message.id)
        : [...expandedEvidenceMessageIds.value, message.id]
}

function sourceLabel(source: MessageSource, index: number) {
    return source.file_name || source.chunk_id || source.file_id || `Source ${index + 1}`
}

function sourcePreview(source: MessageSource) {
    return source.preview || 'Context source attached to this answer.'
}

function scrollChat() {
    const el = chatThreadEl.value
    if (el) {
        el.scrollTop = el.scrollHeight
    }
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
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load this session.'
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
            model_profile_id: selectedModelProfileId.value,
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

async function sendChat() {
    const message = prompt.value.trim()
    if (!message || sending.value) {
        return
    }

    if (!selectedModelProfileIsUsable.value) {
        uiError.value = 'Choose a usable server-side model profile before sending.'
        openWindow('settings')
        modelPopoverOpen.value = true
        return
    }

    sending.value = true
    uiError.value = null
    prompt.value = ''

    try {
        const session = await ensureSessionForPrompt(message)
        await sendPersistentChat({
            sessionId: session.id,
            prompt: message,
            modelProfileId: selectedModelProfileId.value,
            contextSetId: selectedContextSetId.value || null,
            chatEndpoint: '/api/talos/chat',
            persistMessage: createMessage,
        })
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not complete this chat turn.'
    } finally {
        sending.value = false
        await nextTick()
        scrollChat()
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
        openWindow('compare')
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
        openWindow('compare')
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
        openWindow('compare')
        commandFeedback.value = 'Benchmark comparison completed.'
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not run the benchmark comparison.'
    }
}

function openModule(id: string) {
    if (!isWindowId(id)) {
        return
    }

    openWindow(id)
}

function closePopover() {
    modelPopoverOpen.value = false
    contextPopoverOpen.value = false
}

function selectModelProfile(profileId: string) {
    selectedModelProfileId.value = profileId
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
    openWindow('compare')
}

function openCommandPalette() {
    commandPaletteOpen.value = true
}

function closeCommandPalette() {
    commandPaletteOpen.value = false
}

async function focusCommandRoute(route: CommandRoute) {
    openWindow(route.windowId)

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

function handleKeyboard(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openCommandPalette()
        return
    }

    if (event.key === 'Escape') {
        if (commandPaletteOpen.value) {
            closeCommandPalette()
        }
        closePopover()
    }
}

async function refreshModelAndContext() {
    await Promise.allSettled([
        loadModelProfiles(),
        loadContextSets(),
    ])

    if (!selectedModelProfileId.value && usableModelProfiles.value.length > 0) {
        selectedModelProfileId.value = usableModelProfiles.value[0].id
        saveWorkspacePreferences()
    }
}

async function loadPersistedWorkspaceSettings() {
    const settings = await loadWorkspaceSettings()

    if (settings.default_model_profile_id) {
        selectedModelProfileId.value = settings.default_model_profile_id
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
        openWindow(module)
    }

    if (params.has('run')) {
        openWindow('runtime')
    }

    if (params.has('benchmark')) {
        openWindow('compare')
    }
}

onMounted(async () => {
    loadWorkspacePreferences()
    window.addEventListener('keydown', handleKeyboard)
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
    window.removeEventListener('keydown', handleKeyboard)
    stopWindowDrag()
    stopRailResize()
})
</script>

<template>
    <main
        :class="['talos-shell talos-workspace talos-chat-layout flex min-h-screen overflow-hidden', shellClass]"
        :style="workspaceStyle"
        :data-background-effect="workspaceBackgroundEffect"
        data-testid="talos-workspace"
    >
        <TalosLeftRail
            :active-ids="openWindowIds"
            :theme="theme"
            :creating-session="creatingSession"
            :collapsed="railCollapsed"
            :width="railWidth"
            @open="openModule"
            @new-chat="startNewChat"
            @toggle-theme="toggleTheme()"
            @collapse="railCollapsed = true"
            @expand="railCollapsed = false"
            @resize-start="startRailResize"
        />

        <section class="relative flex min-w-0 flex-1 flex-col">
            <TalosProceduralBackground
                :effect="workspaceBackgroundEffect"
                :motion="workspaceMotionMode"
                :reduced-motion="workspaceReducedMotion"
            />

            <header class="relative z-20 flex min-h-14 items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-header)]/88 px-4 backdrop-blur md:px-5">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--talos-muted)]">
                        <ShieldCheck class="h-3.5 w-3.5 text-[var(--talos-accent)]" />
                        {{ workspaceSubtitle }}
                    </div>
                    <h1 class="truncate text-base font-semibold text-[var(--talos-text)]">TALOS</h1>
                </div>
                <div class="flex min-w-0 items-center gap-2">
                    <div class="hidden max-w-[360px] truncate rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-1.5 text-xs text-[var(--talos-muted)] md:block">
                        {{ statusText }}
                    </div>
                    <Badge v-if="activeSessionIsTemporary" tone="warning">Temporary session</Badge>
                    <Button type="button" variant="secondary" size="sm" aria-label="Open command palette" @click="openCommandPalette">
                        <Command class="h-4 w-4" />
                        Commands
                    </Button>
                    <form v-if="authenticated" :action="logoutUrl" method="post" class="hidden items-center gap-2 md:flex" aria-label="TALOS account">
                        <input type="hidden" name="_token" :value="csrfToken">
                        <span class="max-w-32 truncate rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 py-1.5 text-xs text-[var(--talos-muted)]">
                            {{ authLabel }}
                        </span>
                        <Button type="submit" variant="ghost" size="sm">Sign out</Button>
                    </form>
                    <a
                        v-else
                        :href="loginUrl"
                        class="hidden h-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-secondary)] px-3 text-sm font-medium text-[var(--talos-text)] transition hover:bg-[var(--talos-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] md:inline-flex"
                    >
                        Sign in
                    </a>
                </div>
            </header>

            <div class="relative z-10 flex gap-2 overflow-x-auto border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)]/82 px-3 py-2 lg:hidden" aria-label="TALOS workspace rail">
                <Button size="sm" :disabled="creatingSession" @click="startNewChat">New Chat</Button>
                <Button size="sm" variant="ghost" @click="openWindow('runtime')">Runtime</Button>
                <Button size="sm" variant="ghost" @click="openWindow('search')">Knowledge</Button>
                <Button size="sm" variant="ghost" @click="openWindow('brain')">Brain</Button>
                <Button size="sm" variant="ghost" @click="openWindow('compare')">Compare</Button>
                <Button size="sm" variant="ghost" @click="openWindow('model_lab')">Model Lab</Button>
                <Button size="sm" variant="ghost" @click="openWindow('library')">Library</Button>
                <Button size="sm" variant="ghost" @click="openWindow('gallery')">Artifacts</Button>
                <Button size="sm" variant="ghost" @click="openWindow('notes')">Notes</Button>
                <Button size="sm" variant="ghost" @click="openWindow('settings')">Settings</Button>
                <Button size="sm" variant="ghost" @click="openWindow('theme')">Theme</Button>
                <Button size="sm" variant="ghost" @click="openWindow('doctor')">Doctor</Button>
            </div>

            <section ref="chatThreadEl" class="talos-chat-thread relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-48 pt-7 md:px-6 lg:pb-52" aria-label="TALOS chat thread">
                <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col">
                    <div v-if="uiError || sessionError || messageError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                        <span>{{ uiError || sessionError || messageError }}</span>
                    </div>
                    <div v-if="modelProfileError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                        <span>{{ modelProfileError }}</span>
                    </div>
                    <div v-if="contextSetError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                        <span>{{ contextSetError }}</span>
                    </div>

                    <div v-if="loadingMessages" class="flex flex-1 items-center justify-center text-sm text-[var(--talos-muted)]">
                        <Loader2 class="mr-2 h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                        Loading messages
                    </div>

                    <div v-else-if="!messages.length" class="flex flex-1 flex-col items-center justify-center text-center">
                        <div data-testid="talos-empty-brand" class="mb-4 flex items-center justify-center gap-3" aria-label="TALOS">
                            <span class="talos-short-logo" aria-hidden="true">
                                <ShieldCheck class="h-5 w-5" />
                            </span>
                            <span class="talos-orbitron-brand text-3xl font-semibold text-[var(--talos-text)] sm:text-4xl">TALOS</span>
                        </div>
                        <h2 class="text-2xl font-semibold text-[var(--talos-text)]">What workflow should TALOS handle?</h2>
                        <p class="mt-3 max-w-[560px] text-sm leading-6 text-[var(--talos-muted)]">
                            Type a task, attach a context set when needed, and TALOS will route it through the AVM control plane with replayable evidence.
                        </p>
                        <TalosGuidedStart
                            class="mt-5"
                            :model-ready="selectedModelProfileIsUsable"
                            :context-selected="Boolean(selectedContextSet)"
                            :context-available="contextSets.length > 0"
                            :session-ready="Boolean(activeSession)"
                            :evidence-ready="messageEvidenceReady"
                            @open-model="openWindow('model_lab')"
                            @open-context="openWindow('library')"
                        />
                        <div class="mt-5 flex flex-wrap justify-center gap-2">
                            <button type="button" class="rounded-md border border-[var(--talos-border)] px-3 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Create a verified workflow for checking an external API.'">
                                Verify API
                            </button>
                            <button type="button" class="rounded-md border border-[var(--talos-border)] px-3 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Analyze these logs and build a replayable plan.'">
                                Analyze logs
                            </button>
                            <button type="button" class="rounded-md border border-[var(--talos-border)] px-3 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Generate a DAG for reading and validating a CSV dataset.'">
                                Generate DAG
                            </button>
                        </div>
                    </div>

                    <div v-else class="space-y-5">
                        <article
                            v-for="message in messages"
                            :key="message.id"
                            class="flex"
                            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                        >
                            <div
                                class="max-w-[760px] rounded-md border px-4 py-3"
                                :class="message.role === 'user'
                                    ? 'border-[var(--talos-border-strong)] bg-[var(--talos-user)] text-[var(--talos-user-text)]'
                                    : message.role === 'system'
                                        ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]'
                                        : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]'"
                            >
                                <div class="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase opacity-75">
                                    <span class="font-semibold">{{ messageLabel(message) }}</span>
                                    <span>{{ messageMeta(message) }}</span>
                                    <span>{{ formatTime(message.created_at) }}</span>
                                </div>
                                <p class="whitespace-pre-wrap text-sm leading-6">{{ message.content }}</p>
                                <div v-if="message.role === 'assistant'" class="mt-3 flex flex-wrap gap-2">
                                    <Badge v-if="messageMutations(message).length" tone="success">{{ messageMutations(message).length }} JMP</Badge>
                                    <Badge tone="neutral">Persisted</Badge>
                                    <Button
                                        v-if="messageHasEvidence(message)"
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        :aria-expanded="messageEvidenceOpen(message)"
                                        @click="toggleMessageEvidence(message)"
                                    >
                                        <ShieldCheck class="h-4 w-4" />
                                        Evidence
                                    </Button>
                                    <Button
                                        v-if="message.run_id"
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        :disabled="benchmarkingRunId === message.run_id"
                                        @click="benchmarkMessageRun(message)"
                                    >
                                        <Loader2 v-if="benchmarkingRunId === message.run_id" class="h-4 w-4 animate-spin" />
                                        <BarChart3 v-else class="h-4 w-4" />
                                        Compare AVM ON/OFF
                                    </Button>
                                </div>
                                <TalosEvidenceDrawer
                                    v-if="message.role === 'assistant' && messageEvidenceOpen(message)"
                                    :message="message"
                                />
                                <div v-if="message.role === 'assistant' && messageSources(message).length" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                                    <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Source provenance</div>
                                    <div class="mt-2 space-y-2">
                                        <article
                                            v-for="(source, index) in messageSources(message)"
                                            :key="`${source.context_set_id ?? 'context'}-${source.chunk_id ?? source.file_id ?? index}`"
                                            class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2"
                                        >
                                            <div class="truncate text-xs font-semibold text-[var(--talos-text)]">{{ sourceLabel(source, index) }}</div>
                                            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ sourcePreview(source) }}</p>
                                        </article>
                                    </div>
                                </div>
                            </div>
                        </article>

                        <div v-if="sending" class="flex justify-start">
                            <div class="inline-flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 py-3 text-sm text-[var(--talos-muted)]">
                                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                                Kadmos is processing
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div class="pointer-events-none absolute inset-x-3 bottom-32 top-24 z-30 flex flex-col gap-3 overflow-y-auto pb-3 lg:inset-x-0 lg:bottom-32 lg:top-14 lg:block lg:overflow-hidden lg:pb-0">
                <TalosToolWindow
                    v-for="(id, index) in floatingWindowIds"
                    :id="id"
                    :key="id"
                    :title="windowCopy[id].title"
                    :description="windowCopy[id].description"
                    :active="activeWindowId === id"
                    class="talos-floating-window pointer-events-auto"
                    :style="floatingWindowStyle(id, index)"
                    @close="closeWindow"
                    @minimize="minimizeWindow"
                    @dock="toggleDock"
                    @focus="focusWindow"
                    @drag-start="startWindowDrag"
                >
                    <template v-if="id === 'runtime'">
                        <TalosRunTimeline />
                    </template>
                    <template v-else-if="id === 'search'">
                        <TalosContextVault
                            @context-set-created="handleContextSetCreated"
                            @benchmark-scenario-selected="handleBenchmarkScenarioSelected"
                        />
                        <TalosDocuments class="mt-3" />
                    </template>
                    <template v-else-if="id === 'brain'">
                        <TalosMemoryManager />
                        <TalosSkillRegistry class="mt-3" />
                        <TalosSkillAudit class="mt-3" />
                    </template>
                    <template v-else-if="id === 'calendar'">
                        <TalosCalendar />
                    </template>
                    <template v-else-if="id === 'compare'">
                        <TalosBenchmarkWorkbench
                            compare-endpoint="/api/benchmarks/compare"
                            groups-endpoint="/api/talos/benchmark-groups"
                            export-endpoint="/api/talos/benchmark-groups/{id}/export"
                            :default-runs="1"
                            :initial-benchmark-group-id="selectedBenchmarkGroupId"
                            :initial-scenario-path="selectedBenchmarkScenarioPath"
                        />
                    </template>
                    <template v-else-if="id === 'model_lab'">
                        <TalosModelCenter />
                    </template>
                    <template v-else-if="id === 'research'">
                        <TalosResearchWorkbench />
                    </template>
                    <template v-else-if="id === 'gallery'">
                        <TalosArtifactGallery />
                    </template>
                    <template v-else-if="id === 'library'">
                        <TalosContextVault
                            @context-set-created="handleContextSetCreated"
                            @benchmark-scenario-selected="handleBenchmarkScenarioSelected"
                        />
                        <TalosDocuments class="mt-3" />
                    </template>
                    <template v-else-if="id === 'notes'">
                        <TalosNotes />
                    </template>
                    <template v-else-if="id === 'tasks'">
                        <TalosTasks />
                        <section data-testid="talos-productivity-section-email-triage" tabindex="-1" class="mt-3 outline-none">
                            <TalosEmailTriage />
                        </section>
                    </template>
                    <template v-else-if="id === 'tools'">
                        <TalosToolRegistry />
                    </template>
                    <template v-else-if="id === 'settings'">
                        <TalosSettingsCenter
                            :model-profiles="modelProfiles"
                            :context-sets="contextSets"
                            :selected-model-profile-id="selectedModelProfileId"
                            :selected-context-set-id="selectedContextSetId"
                            :authenticated="authenticated"
                            :auth-user-name="authUserName"
                            :logout-url="logoutUrl"
                            :csrf-token="csrfToken"
                            @select-model="selectModelProfile"
                            @select-context="selectContextSet"
                            @change-theme="toggleTheme"
                            @open-module="openModule"
                            @saved="saveWorkspacePreferences"
                        />
                    </template>
                    <template v-else-if="id === 'theme'">
                        <TalosThemeEngine
                            :theme="theme"
                            @change-theme="toggleTheme"
                            @theme-customization-changed="refreshWorkspaceSettingsAfterThemeUpdate"
                            @theme-draft-changed="handleThemeDraftChanged"
                        />
                    </template>
                    <template v-else-if="id === 'doctor'">
                        <Card>
                            <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Admin token</div>
                            <Input
                                v-model="adminToken"
                                type="password"
                                class="mt-2"
                                placeholder="X-Talos-Api-Token"
                                aria-label="TALOS admin API token"
                            />
                        </Card>
                        <section data-testid="talos-admin-section-doctor" tabindex="-1" class="mt-3 outline-none">
                            <TalosDoctorPanel :token="adminToken" />
                        </section>
                        <section data-testid="talos-admin-section-policy" tabindex="-1" class="mt-3 outline-none">
                            <TalosPolicyPanel :token="adminToken" />
                        </section>
                        <section data-testid="talos-admin-section-backup" tabindex="-1" class="mt-3 outline-none">
                            <TalosBackupPanel :token="adminToken" />
                        </section>
                        <section data-testid="talos-admin-section-audit" tabindex="-1" class="mt-3 outline-none">
                            <TalosAuditLog :token="adminToken" />
                        </section>
                    </template>
                </TalosToolWindow>
            </div>

            <aside v-if="hasDockedWindows" data-testid="talos-right-dock" class="pointer-events-none absolute inset-y-14 right-0 z-30 hidden w-[420px] flex-col gap-3 overflow-y-auto border-l border-[var(--talos-border)] bg-[var(--talos-sidebar)]/92 p-3 backdrop-blur lg:flex">
                <TalosToolWindow
                    v-for="id in dockedVisibleWindowIds"
                    :id="id"
                    :key="`dock-${id}`"
                    :title="windowCopy[id].title"
                    :description="windowCopy[id].description"
                    :active="activeWindowId === id"
                    docked
                    class="pointer-events-auto"
                    @close="closeWindow"
                    @minimize="minimizeWindow"
                    @dock="toggleDock"
                    @focus="focusWindow"
                    @drag-start="startWindowDrag"
                >
                    <TalosNotes v-if="id === 'notes'" />
                    <TalosTasks v-else-if="id === 'tasks'" />
                    <TalosDoctorPanel v-else-if="id === 'doctor'" :token="adminToken" />
                    <div v-else class="text-sm text-[var(--talos-muted)]">
                        Docked mode is optimized for Notes, Tasks and Doctor. Undock to inspect this module in full width.
                    </div>
                </TalosToolWindow>
            </aside>

            <div v-if="minimizedWindowIds.length" class="absolute bottom-28 left-4 z-40 flex flex-wrap gap-2 lg:left-6">
                <button
                    v-for="id in minimizedWindowIds"
                    :key="`min-${id}`"
                    type="button"
                    class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2 text-xs font-medium text-[var(--talos-text)] shadow"
                    @click="openWindow(id)"
                >
                    {{ windowCopy[id].title }}
                </button>
            </div>

            <div class="pointer-events-none fixed inset-x-0 bottom-7 z-40 px-4 lg:left-[var(--talos-rail-width)] lg:px-6">
                <div class="relative">
                    <div v-if="modelPopoverOpen" class="pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[420px] -translate-x-1/2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-3 shadow-xl">
                        <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Model profile</div>
                        <label class="sr-only" for="talos-workspace-model-profile">Server-side model profile</label>
                        <Select
                            id="talos-workspace-model-profile"
                            :model-value="selectedModelProfileId"
                            class="mt-2"
                            :disabled="loadingModelProfiles || !modelProfiles.length"
                            aria-label="Server-side model profile"
                            @update:model-value="(value) => selectModelProfile(String(value))"
                        >
                            <option value="">{{ loadingModelProfiles ? 'Loading profiles' : 'Choose profile' }}</option>
                            <option
                                v-for="profile in modelProfiles"
                                :key="profile.id"
                                :value="profile.id"
                                :disabled="profile.status === 'disabled' || !profile.has_secret"
                            >
                                {{ profile.display_name }} - {{ profile.model }} - {{ profile.status }}
                            </option>
                        </Select>
                        <div class="mt-3 flex justify-between gap-2">
                            <Button size="sm" variant="ghost" @click="refreshModelAndContext">Refresh</Button>
                            <Button size="sm" @click="openWindow('model_lab')">Model Lab</Button>
                        </div>
                    </div>

                    <div v-if="contextPopoverOpen" class="pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[420px] -translate-x-1/2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-3 shadow-xl">
                        <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Grounding context</div>
                        <label class="sr-only" for="talos-workspace-context-set">Grounding context set</label>
                        <Select
                            id="talos-workspace-context-set"
                            :model-value="selectedContextSetId"
                            class="mt-2"
                            :disabled="loadingContextSets || !contextSets.length"
                            aria-label="Grounding context set"
                            @update:model-value="(value) => selectContextSet(String(value))"
                        >
                            <option value="">{{ loadingContextSets ? 'Loading context' : 'No grounding context' }}</option>
                            <option
                                v-for="contextSet in contextSets"
                                :key="contextSet.id"
                                :value="contextSet.id"
                                :disabled="contextSet.status !== 'available' && contextSet.status !== 'draft'"
                            >
                                {{ contextSet.name }} - {{ contextSet.status }} - {{ contextSet.sources_count ?? contextSet.sources?.length ?? 0 }} sources
                            </option>
                        </Select>
                        <p v-if="selectedContextSet" class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                            Uploaded content is injected server-side as untrusted data.
                        </p>
                        <div class="mt-3 flex justify-between gap-2">
                            <Button size="sm" variant="ghost" @click="refreshModelAndContext">Refresh</Button>
                            <Button size="sm" @click="openWindow('library')">Library</Button>
                        </div>
                    </div>

                    <div v-if="promptEnhancementResult" class="pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[560px] -translate-x-1/2">
                        <TalosPromptEnhancerPopover
                            :result="promptEnhancementResult"
                            @replace="replacePromptWithEnhanced"
                            @insert="insertEnhancedPromptBelow"
                            @cancel="clearPromptEnhancement"
                        />
                    </div>

                    <div v-else-if="enhancingPrompt || promptEnhancementError" class="pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[560px] -translate-x-1/2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-3 text-sm text-[var(--talos-text)] shadow-xl">
                        <div v-if="enhancingPrompt" class="flex items-center gap-2 text-[var(--talos-muted)]">
                            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                            Enhancing prompt
                        </div>
                        <div v-else class="flex items-start justify-between gap-3">
                            <span>{{ promptEnhancementError }}</span>
                            <Button size="sm" variant="ghost" @click="clearPromptEnhancement">Cancel</Button>
                        </div>
                    </div>

                    <TalosSlimComposer
                        v-model:prompt="prompt"
                        :can-send="canSend"
                        :sending="sending"
                        :status-text="statusText"
                        :model-label="modelLabel"
                        :context-label="contextLabel"
                        :temporary-mode="sessionPersistenceMode === 'temporary'"
                        :send-disabled-reason="sendMessageCommandDisabledReason"
                        :enhancer-disabled-reason="assistantEnhancerDisabledReason"
                        @send="sendChat"
                        @open-model="() => { modelPopoverOpen = !modelPopoverOpen; contextPopoverOpen = false; clearPromptEnhancement() }"
                        @open-context="() => { contextPopoverOpen = !contextPopoverOpen; modelPopoverOpen = false; clearPromptEnhancement() }"
                        @open-settings="openWindow('settings')"
                        @toggle-temporary="toggleTemporaryMode"
                        @enhance="enhanceCurrentPrompt"
                    />
                </div>
            </div>

            <div
                v-if="commandPaletteOpen"
                class="fixed inset-0 z-50 bg-black/40 px-4 py-16 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label="TALOS command palette"
                @click.self="closeCommandPalette"
            >
                <div class="mx-auto w-full max-w-2xl">
                    <TalosCommandPalette :commands="workspaceCommands" @selected="selectCommand" />
                </div>
            </div>

            <div v-if="commandFeedback" class="fixed right-4 top-20 z-50 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2 text-xs text-[var(--talos-muted)] shadow">
                {{ commandFeedback }}
            </div>
        </section>
    </main>
</template>
