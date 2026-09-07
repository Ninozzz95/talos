<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch } from 'vue'
import {
    Bell,
    Bot,
    BrainCircuit,
    Database,
    Globe2,
    Keyboard,
    Loader2,
    Mail,
    Palette,
    Save,
    Search,
    Settings,
    Shield,
    User,
    Wrench,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Chip from '../../ui/Chip.vue'
import Input from '../../ui/Input.vue'
import TalosThemedSelect from '../ui/TalosThemedSelect.vue'
import Switch from '../../ui/Switch.vue'
import Tabs from '../../ui/Tabs.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import TalosSettingsAppearancePanel from './TalosSettingsAppearancePanel.vue'
import TalosSettingsBrowserPanel from './TalosSettingsBrowserPanel.vue'
import TalosSettingsIntegrationsPanel from './TalosSettingsIntegrationsPanel.vue'
import TalosSettingsModelsPanel from './TalosSettingsModelsPanel.vue'
import TalosSettingsSearchPanel from './TalosSettingsSearchPanel.vue'
import TalosSettingsShortcutsPanel from './TalosSettingsShortcutsPanel.vue'
import TalosSettingsToolsPanel from './TalosSettingsToolsPanel.vue'
import type {
    TalosChatLayoutPreferences,
    TalosContextSet,
    TalosModelProfile,
    TalosPromptCacheMode,
    TalosPromptCachePreferences,
} from '../../../lib/talosTypes'
import {
    TALOS_DEFAULT_CHAT_LAYOUT,
    sanitizeTalosChatLayout,
} from '../../../lib/talosChatLayout'
import {
    isTalosUiScale,
    TALOS_UI_SCALE_CONSTRAINT,
} from '../../../lib/talosUiScale'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import {
    normalizeTalosTheme,
    resolveTalosThemeMode,
    type TalosThemeId,
    type TalosThemeMode,
} from '../../../lib/talosThemes'
import {
    TALOS_APPEARANCE_GROUPS,
    resolveTalosAppearanceVisibility,
    type TalosAppearanceGroup,
    type TalosAppearanceVisibility,
} from '../../../lib/talosAppearancePreferences'
import {
    defaultTalosShortcuts,
    resolveTalosShortcuts,
    shortcutConflict,
    type TalosShortcutActionId,
} from '../../../lib/talosShortcuts'
import {
    normalizeTalosBrowserHmiMode,
    type TalosBrowserHmiMode,
} from '../../../lib/talosBrowserHmiPolicy'
import { TALOS_CAPABILITIES_KEY } from '../../../composables/useTalosCapabilities'
import {
    TALOS_CAPABILITY_LABELS,
    type TalosCapabilityId,
    type TalosCapabilityRecord,
    type TalosCapabilityState,
} from '../../../lib/talosCapabilities'

const AI_MODEL_MODE_OPTIONS = [
    { value: 'same_as_chat', label: 'Same as chat' },
    { value: 'default_profile', label: 'Use default profile' },
]
const REMINDER_CHANNEL_OPTIONS = [
    { value: 'browser', label: 'Browser notification' },
    { value: 'task', label: 'Task queue' },
    { value: 'disabled', label: 'Disabled' },
]
const PROMPT_CACHE_MODES: readonly TalosPromptCacheMode[] = [
    'provider_default',
    'automatic',
    'explicit',
    'disabled',
]
const PROMPT_CACHE_TTLS: ReadonlyArray<Exclude<TalosPromptCachePreferences['ttl'], null>> = [
    '5m',
    '30m',
    '1h',
]

type SettingsTab =
    | 'models'
    | 'ai_defaults'
    | 'search'
    | 'browser'
    | 'integrations'
    | 'email'
    | 'reminders'
    | 'appearance'
    | 'shortcuts'
    | 'account'
    | 'agent_tools'
    | 'system'

type SettingsPreferences = {
    theme: TalosThemeId
    theme_mode: TalosThemeMode
    ui_scale: number
    chat_layout: TalosChatLayoutPreferences
    ai_defaults: {
        utility_model_mode: string
        vision_enabled: boolean
        research_model_mode: string
    }
    search: {
        provider: string
        results_per_query: number
        url: string
        fallback: string
        deep_research: {
            max_tokens: number
            extract_timeout: number
            extract_parallel: number
            timeout: number
        }
    }
    browser_hmi_mode: TalosBrowserHmiMode
    prompt_cache: TalosPromptCachePreferences
    reminders: {
        channel: string
        ai_synthesis: boolean
        public_app_url: string
    }
    appearance_visibility: TalosAppearanceVisibility
    keyboard_shortcuts: Record<TalosShortcutActionId, string>
    agent_tools: {
        tool_call_limit: number
        max_steps_per_message: number
        code_enabled: boolean
        search_enabled: boolean
        documents_enabled: boolean
        media_enabled: boolean
        knowledge_enabled: boolean
        system_enabled: boolean
    }
}

const props = defineProps<{
    modelProfiles: TalosModelProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedContextSetId: string
    focusedTab?: SettingsTab | null
    focusedTabRevision?: number
    authenticated?: boolean
    authUserName?: string
    logoutUrl?: string
    csrfToken?: string
    activeTalosSessionId?: string | null
}>()

const emit = defineEmits<{
    selectModel: [id: string]
    selectContext: [id: string]
    changeTheme: [theme: TalosThemeId, persist?: boolean]
    openModule: [id: string, section?: string]
    saved: []
    replayIntro: []
}>()

const tabs: Array<{ id: SettingsTab; label: string; icon: unknown; group?: string }> = [
    { id: 'models', label: 'Models', icon: Bot },
    { id: 'ai_defaults', label: 'AI Defaults', icon: BrainCircuit },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'browser', label: 'Browser', icon: Globe2 },
    { id: 'integrations', label: 'Integrations', icon: Wrench },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'account', label: 'Account', icon: User },
    { id: 'agent_tools', label: 'Agent Tools', icon: Shield, group: 'Admin' },
    { id: 'system', label: 'System', icon: Settings, group: 'Admin' },
]

const agentToolOptions: Array<{ key: keyof Omit<SettingsPreferences['agent_tools'], 'tool_call_limit' | 'max_steps_per_message'>; label: string }> = [
    { key: 'code_enabled', label: 'Code tools' },
    { key: 'search_enabled', label: 'Search tools' },
    { key: 'documents_enabled', label: 'Document tools' },
    { key: 'media_enabled', label: 'Media tools' },
    { key: 'knowledge_enabled', label: 'Knowledge tools' },
    { key: 'system_enabled', label: 'System tools' },
]
const reminderExecutionAvailable = false

const SETTINGS_CAPABILITIES: Readonly<Partial<Record<SettingsTab, readonly TalosCapabilityId[]>>> = Object.freeze({
    models: ['models.profiles', 'models.local_runtime', 'models.multi_model_orchestration'],
    browser: ['browser.hmi'],
    integrations: ['integrations.google_workspace', 'memory.supermemory'],
    agent_tools: ['chat.streaming', 'reasoning.visible', 'speech.local_tts'],
    system: ['settings.workspace', 'runs.replay', 'benchmarks.avm'],
})
const CAPABILITY_STATE_LABELS: Readonly<Record<TalosCapabilityState, string>> = Object.freeze({
    available: 'Available',
    degraded: 'Degraded',
    blocked: 'Blocked',
    planned: 'Roadmap',
})

const activeTab = ref<SettingsTab>('models')
const capabilities = inject(TALOS_CAPABILITIES_KEY, null)

const preferences = reactive<SettingsPreferences>({
    theme: 'forge',
    theme_mode: 'system',
    ui_scale: TALOS_UI_SCALE_CONSTRAINT.default,
    chat_layout: { ...TALOS_DEFAULT_CHAT_LAYOUT },
    ai_defaults: {
        utility_model_mode: 'same_as_chat',
        vision_enabled: true,
        research_model_mode: 'same_as_chat',
    },
    search: {
        provider: 'searxng',
        results_per_query: 5,
        url: '',
        fallback: 'duckduckgo',
        deep_research: {
            max_tokens: 16384,
            extract_timeout: 90,
            extract_parallel: 3,
            timeout: 1800,
        },
    },
    browser_hmi_mode: 'confirm_sensitive',
    prompt_cache: {
        mode: 'automatic',
        ttl: null,
    },
    reminders: {
        channel: 'browser',
        ai_synthesis: false,
        public_app_url: '',
    },
    appearance_visibility: resolveTalosAppearanceVisibility({}),
    keyboard_shortcuts: defaultTalosShortcuts(),
    agent_tools: {
        tool_call_limit: 0,
        max_steps_per_message: 20,
        code_enabled: true,
        search_enabled: true,
        documents_enabled: true,
        media_enabled: true,
        knowledge_enabled: true,
        system_enabled: true,
    },
})

const {
    settings,
    loadingSettings,
    savingSettings,
    settingsError,
    settingsSavedMessage,
    loadSettings,
    updateSettings,
} = useTalosSettings()

const selectedTab = computed(() => tabs.find((tab) => tab.id === activeTab.value) ?? tabs[0])
const activeModelProfile = computed(() => props.modelProfiles.find((profile) => profile.id === props.selectedModelProfileId) ?? null)
const activeContextSet = computed(() => props.contextSets.find((contextSet) => contextSet.id === props.selectedContextSetId) ?? null)
const operatorLabel = computed(() => props.authUserName?.trim() || 'Operator')
const themePolicyLocked = computed(() => settings.value?.preferences?.theme_policy_locked === true)
const activeCapabilities = computed<TalosCapabilityRecord[]>(() => (
    (SETTINGS_CAPABILITIES[activeTab.value] ?? []).map((id) => (
        capabilities?.capability(id) ?? {
            id,
            state: 'blocked',
            reason: 'Capability status has not been verified for this workspace.',
            evidence: ['client:capability-manifest-unavailable'],
        }
    ))
))

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback: string) {
    return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback: number) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : fallback
    }

    return fallback
}

function booleanValue(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback
}

function isPromptCacheMode(value: unknown): value is TalosPromptCacheMode {
    return typeof value === 'string' && PROMPT_CACHE_MODES.includes(value as TalosPromptCacheMode)
}

function isPromptCacheTtl(value: unknown): value is Exclude<TalosPromptCachePreferences['ttl'], null> {
    return typeof value === 'string'
        && PROMPT_CACHE_TTLS.includes(value as Exclude<TalosPromptCachePreferences['ttl'], null>)
}

function isSettingsTab(value: unknown): value is SettingsTab {
    return tabs.some((tab) => tab.id === value)
}

function applyPreferences(nextPreferences: Record<string, unknown>) {
    preferences.theme = normalizeTalosTheme(nextPreferences.theme)
    preferences.theme_mode = resolveTalosThemeMode(nextPreferences.theme_mode)
    preferences.ui_scale = isTalosUiScale(nextPreferences.ui_scale)
        ? nextPreferences.ui_scale
        : TALOS_UI_SCALE_CONSTRAINT.default
    preferences.chat_layout = sanitizeTalosChatLayout(nextPreferences.chat_layout)

    const aiDefaults = record(nextPreferences.ai_defaults)
    preferences.ai_defaults.utility_model_mode = stringValue(aiDefaults.utility_model_mode, preferences.ai_defaults.utility_model_mode)
    preferences.ai_defaults.vision_enabled = booleanValue(aiDefaults.vision_enabled, preferences.ai_defaults.vision_enabled)
    preferences.ai_defaults.research_model_mode = stringValue(aiDefaults.research_model_mode, preferences.ai_defaults.research_model_mode)

    const searchPreferences = record(nextPreferences.search)
    preferences.search.provider = stringValue(searchPreferences.provider, preferences.search.provider)
    preferences.search.results_per_query = numberValue(searchPreferences.results_per_query, preferences.search.results_per_query)
    preferences.search.url = stringValue(searchPreferences.url, preferences.search.url)
    preferences.search.fallback = stringValue(searchPreferences.fallback, preferences.search.fallback)

    const deepResearch = record(searchPreferences.deep_research)
    preferences.search.deep_research.max_tokens = numberValue(deepResearch.max_tokens, preferences.search.deep_research.max_tokens)
    preferences.search.deep_research.extract_timeout = numberValue(deepResearch.extract_timeout, preferences.search.deep_research.extract_timeout)
    preferences.search.deep_research.extract_parallel = numberValue(deepResearch.extract_parallel, preferences.search.deep_research.extract_parallel)
    preferences.search.deep_research.timeout = numberValue(deepResearch.timeout, preferences.search.deep_research.timeout)
    preferences.browser_hmi_mode = normalizeTalosBrowserHmiMode(nextPreferences.browser_hmi_mode)

    const promptCache = record(nextPreferences.prompt_cache)
    preferences.prompt_cache.mode = isPromptCacheMode(promptCache.mode) ? promptCache.mode : 'automatic'
    preferences.prompt_cache.ttl = promptCache.ttl === null || isPromptCacheTtl(promptCache.ttl)
        ? promptCache.ttl
        : null

    const reminders = record(nextPreferences.reminders)
    preferences.reminders.channel = stringValue(reminders.channel, preferences.reminders.channel)
    preferences.reminders.ai_synthesis = booleanValue(reminders.ai_synthesis, preferences.reminders.ai_synthesis)
    preferences.reminders.public_app_url = stringValue(reminders.public_app_url, preferences.reminders.public_app_url)

    preferences.appearance_visibility = resolveTalosAppearanceVisibility(nextPreferences.appearance_visibility)
    preferences.keyboard_shortcuts = resolveTalosShortcuts(nextPreferences.keyboard_shortcuts)

    const agentTools = record(nextPreferences.agent_tools)
    preferences.agent_tools.tool_call_limit = numberValue(agentTools.tool_call_limit, preferences.agent_tools.tool_call_limit)
    preferences.agent_tools.max_steps_per_message = numberValue(agentTools.max_steps_per_message, preferences.agent_tools.max_steps_per_message)
    preferences.agent_tools.code_enabled = booleanValue(agentTools.code_enabled, preferences.agent_tools.code_enabled)
    preferences.agent_tools.search_enabled = booleanValue(agentTools.search_enabled, preferences.agent_tools.search_enabled)
    preferences.agent_tools.documents_enabled = booleanValue(agentTools.documents_enabled, preferences.agent_tools.documents_enabled)
    preferences.agent_tools.media_enabled = booleanValue(agentTools.media_enabled, preferences.agent_tools.media_enabled)
    preferences.agent_tools.knowledge_enabled = booleanValue(agentTools.knowledge_enabled, preferences.agent_tools.knowledge_enabled)
    preferences.agent_tools.system_enabled = booleanValue(agentTools.system_enabled, preferences.agent_tools.system_enabled)
}

function preferencesPayload() {
    const storedTheme = normalizeTalosTheme(settings.value?.preferences?.theme)
    const themeChanged = preferences.theme !== storedTheme

    return {
        ...(settings.value?.preferences ?? {}),
        theme: preferences.theme,
        theme_mode: preferences.theme_mode,
        ui_scale: preferences.ui_scale,
        workspace_default_theme: preferences.theme,
        ...(themeChanged ? { theme_customization: {} } : {}),
        chat_layout: {
            ...preferences.chat_layout,
        },
        ai_defaults: {
            ...preferences.ai_defaults,
        },
        search: {
            provider: preferences.search.provider,
            results_per_query: Number(preferences.search.results_per_query) || 5,
            url: preferences.search.url,
            fallback: preferences.search.fallback,
            deep_research: {
                max_tokens: Number(preferences.search.deep_research.max_tokens) || 16384,
                extract_timeout: Number(preferences.search.deep_research.extract_timeout) || 90,
                extract_parallel: Number(preferences.search.deep_research.extract_parallel) || 3,
                timeout: Number(preferences.search.deep_research.timeout) || 1800,
            },
        },
        browser_hmi_mode: preferences.browser_hmi_mode,
        prompt_cache: {
            ...preferences.prompt_cache,
        },
        reminders: {
            ...preferences.reminders,
        },
        appearance_visibility: preferences.appearance_visibility,
        keyboard_shortcuts: preferences.keyboard_shortcuts,
        agent_tools: {
            ...preferences.agent_tools,
        },
    }
}

async function saveWorkspaceDefaults() {
    const nextSettings = await updateSettings({
        default_model_profile_id: props.selectedModelProfileId || null,
        default_context_set_id: props.selectedContextSetId || null,
        preferences: preferencesPayload(),
    })

    applyPreferences(nextSettings.preferences ?? {})
    emit('changeTheme', preferences.theme, false)

    if (nextSettings.default_model_profile_id) {
        emit('selectModel', nextSettings.default_model_profile_id)
    }

    if (nextSettings.default_context_set_id) {
        emit('selectContext', nextSettings.default_context_set_id)
    }

    emit('saved')
}

function openModule(id: string, section?: string) {
    emit('openModule', id, section)
}

function updateSearchPreferences(nextPreferences: Partial<Omit<SettingsPreferences['search'], 'deep_research'>>) {
    Object.assign(preferences.search, nextPreferences)
}

function updateDeepResearchPreferences(nextPreferences: Partial<SettingsPreferences['search']['deep_research']>) {
    Object.assign(preferences.search.deep_research, nextPreferences)
}

function updatePromptCache(nextPreferences: TalosPromptCachePreferences) {
    Object.assign(preferences.prompt_cache, nextPreferences)
}

function updateAppearancePreference(group: TalosAppearanceGroup, key: string, enabled: boolean) {
    const groupPreferences = preferences.appearance_visibility[group] as Record<string, boolean>
    if (Object.prototype.hasOwnProperty.call(groupPreferences, key)) {
        groupPreferences[key] = enabled
    }
}

function resetAppearanceGroup(group: TalosAppearanceGroup) {
    const defaults = resolveTalosAppearanceVisibility({})
    preferences.appearance_visibility[group] = defaults[group]
}

function resetAllAppearance() {
    preferences.appearance_visibility = resolveTalosAppearanceVisibility({})
}

function updateShortcutBinding(id: TalosShortcutActionId, binding: string) {
    const conflict = shortcutConflict(preferences.keyboard_shortcuts, id, binding)
    if (conflict) {
        settingsError.value = `${binding} is already assigned to ${conflict}.`
        return
    }

    preferences.keyboard_shortcuts = {
        ...preferences.keyboard_shortcuts,
        [id]: binding,
    }
}

function resetShortcuts() {
    preferences.keyboard_shortcuts = defaultTalosShortcuts()
}

function updateAgentToolPreference(
    key: keyof Omit<SettingsPreferences['agent_tools'], 'tool_call_limit' | 'max_steps_per_message'>,
    enabled: boolean,
) {
    preferences.agent_tools[key] = enabled
}

onMounted(async () => {
    const loaded = await loadSettings().catch(() => null)
    if (loaded?.default_model_profile_id) {
        emit('selectModel', loaded.default_model_profile_id)
    }
    if (loaded?.default_context_set_id) {
        emit('selectContext', loaded.default_context_set_id)
    }
    applyPreferences(loaded?.preferences ?? {})
    emit('changeTheme', preferences.theme, false)
})

watch(
    () => [props.focusedTab, props.focusedTabRevision] as const,
    ([tab]) => {
        if (isSettingsTab(tab)) {
            activeTab.value = tab
        }
    },
    { immediate: true },
)
</script>

<template>
    <Card class="overflow-hidden p-0">
        <div class="flex min-h-[540px] flex-col md:flex-row">
            <aside class="border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)]/80 p-3 md:w-56 md:border-b-0 md:border-r" aria-label="Settings categories">
                <div class="px-2 pb-3">
                    <div class="flex items-center gap-1.5">
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Settings Center</h3>
                        <TalosGuideInfoButton guide-id="rail.settings" compact side="bottom" />
                    </div>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Workspace defaults, model behavior and operator preferences from /api/talos/settings.
                    </p>
                </div>
                <Tabs
                    :model-value="activeTab"
                    :items="tabs"
                    label="TALOS settings categories"
                    tab-id-prefix="talos-settings-tab"
                    panel-id-prefix="talos-settings-panel"
                    orientation="vertical"
                    variant="settings"
                    @update:model-value="activeTab = $event as SettingsTab"
                >
                    <template #tab="{ item }">
                        <component :is="item.icon" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                        <span>{{ item.label }}</span>
                    </template>
                </Tabs>
            </aside>

            <section
                :id="`talos-settings-panel-${selectedTab.id}`"
                class="min-w-0 flex-1 p-4"
                role="tabpanel"
                :aria-labelledby="`talos-settings-tab-${selectedTab.id}`"
            >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--talos-muted)]">
                            <Database class="h-3.5 w-3.5 text-[var(--talos-accent)]" />
                            Protected preferences
                        </div>
                        <div class="mt-1 flex items-center gap-1.5">
                            <h3 class="text-base font-semibold text-[var(--talos-text)]">{{ selectedTab.label }}</h3>
                            <TalosGuideInfoButton :guide-id="`settings.${selectedTab.id}`" compact side="bottom" />
                        </div>
                    </div>
                    <Button size="sm" :disabled="savingSettings" @click="saveWorkspaceDefaults">
                        <Loader2 v-if="savingSettings" class="h-4 w-4 animate-spin" />
                        <Save v-else class="h-4 w-4" />
                        Save settings
                    </Button>
                </div>

                <div v-if="settingsError || settingsSavedMessage" class="sticky top-0 z-20 mt-3 grid gap-2 bg-[var(--talos-card)]/95 py-1 backdrop-blur">
                    <div v-if="settingsError" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                        {{ settingsError }}
                    </div>
                    <div v-if="settingsSavedMessage" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                        {{ settingsSavedMessage }}
                    </div>
                </div>
                <div v-if="loadingSettings" class="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading settings
                </div>

                <div
                    v-if="activeCapabilities.length"
                    class="mt-4 divide-y divide-[var(--talos-border)] border-y border-[var(--talos-border)]"
                    aria-label="Capability status"
                >
                    <div
                        v-for="capability in activeCapabilities"
                        :key="capability.id"
                        :data-capability-id="capability.id"
                        class="flex items-start justify-between gap-3 py-2"
                    >
                        <div class="min-w-0">
                            <div class="text-sm font-medium text-[var(--talos-text)]">
                                {{ TALOS_CAPABILITY_LABELS[capability.id] }}
                            </div>
                            <p v-if="capability.reason" class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">
                                {{ capability.reason }}
                            </p>
                        </div>
                        <Chip :code="CAPABILITY_STATE_LABELS[capability.state]" class="shrink-0" />
                    </div>
                </div>

                <div class="mt-4 space-y-3">
                    <template v-if="activeTab === 'models'">
                        <TalosSettingsModelsPanel
                            :model-profiles="modelProfiles"
                            :context-sets="contextSets"
                            :selected-model-profile-id="selectedModelProfileId"
                            :selected-context-set-id="selectedContextSetId"
                            :active-model-profile="activeModelProfile"
                            :active-context-set="activeContextSet"
                            :prompt-cache="preferences.prompt_cache"
                            :loading-settings="loadingSettings"
                            @select-model="emit('selectModel', $event)"
                            @select-context="emit('selectContext', $event)"
                            @update-prompt-cache="updatePromptCache"
                            @open-module="openModule"
                        />
                    </template>

                    <template v-else-if="activeTab === 'ai_defaults'">
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Utility model mode</span>
                                <TalosThemedSelect v-model="preferences.ai_defaults.utility_model_mode" class="mt-2" :items="AI_MODEL_MODE_OPTIONS" aria-label="Utility model mode" />
                            </label>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Research model mode</span>
                                <TalosThemedSelect v-model="preferences.ai_defaults.research_model_mode" class="mt-2" :items="AI_MODEL_MODE_OPTIONS" aria-label="Research model mode" />
                            </label>
                        </div>
                        <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <span>
                                <span class="block text-sm font-semibold text-[var(--talos-text)]">Vision routing preference</span>
                                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Stored as a safe routing preference until model capability routing consumes it.</span>
                            </span>
                            <Switch v-model="preferences.ai_defaults.vision_enabled" class="mt-1" aria-label="Vision routing preference" />
                        </label>
                    </template>

                    <template v-else-if="activeTab === 'search'">
                        <TalosSettingsSearchPanel
                            :search="preferences.search"
                            @update-search="updateSearchPreferences"
                            @update-deep-research="updateDeepResearchPreferences"
                        />
                    </template>

                    <template v-else-if="activeTab === 'browser'">
                        <TalosSettingsBrowserPanel
                            v-model="preferences.browser_hmi_mode"
                            :policy="settings?.browser_hmi_policy ?? null"
                            :active-talos-session-id="activeTalosSessionId ?? null"
                        />
                    </template>

                    <template v-else-if="activeTab === 'integrations'">
                        <TalosSettingsIntegrationsPanel @open-module="openModule" />
                    </template>

                    <template v-else-if="activeTab === 'email'">
                        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <div class="text-sm font-semibold text-[var(--talos-text)]">Email triage</div>
                            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                                TALOS email drafts and connector status live in Tasks. Sending remains policy-gated by the backend.
                            </p>
                            <Button class="mt-3" size="sm" variant="secondary" @click="openModule('tasks')">Open Tasks</Button>
                        </div>
                    </template>

                    <template v-else-if="activeTab === 'reminders'">
                        <p class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs text-[var(--talos-text)]" role="status">
                            Reminder delivery settings are read-only until a delivery worker advertises readiness.
                        </p>
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Channel</span>
                                <TalosThemedSelect v-model="preferences.reminders.channel" class="mt-2" :items="REMINDER_CHANNEL_OPTIONS" aria-label="Reminder channel" :disabled="!reminderExecutionAvailable" />
                            </label>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Public app URL</span>
                                <Input v-model="preferences.reminders.public_app_url" class="mt-2" placeholder="https://talos.example.test" aria-label="Public app URL" :disabled="!reminderExecutionAvailable" />
                            </label>
                        </div>
                        <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <span>
                                <span class="block text-sm font-semibold text-[var(--talos-text)]">AI synthesis for reminder text</span>
                                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Available only when the reminder delivery worker is ready.</span>
                            </span>
                            <Switch v-model="preferences.reminders.ai_synthesis" class="mt-1" aria-label="AI synthesis for reminder text" :disabled="!reminderExecutionAvailable" />
                        </label>
                    </template>

                    <template v-else-if="activeTab === 'appearance'">
                        <TalosSettingsAppearancePanel
                            :theme="preferences.theme"
                            :theme-mode="preferences.theme_mode"
                            :ui-scale="preferences.ui_scale"
                            :chat-layout="preferences.chat_layout"
                            :theme-policy-locked="themePolicyLocked"
                            :appearance-visibility="preferences.appearance_visibility"
                            :appearance-groups="TALOS_APPEARANCE_GROUPS"
                            @update-theme="preferences.theme = $event"
                            @update-theme-mode="preferences.theme_mode = $event"
                            @open-theme-engine="openModule('theme', 'motion')"
                            @update-ui-scale="preferences.ui_scale = $event"
                            @update-message-scale="preferences.chat_layout.message_scale = $event"
                            @update-chat-composer-mode="preferences.chat_layout.composer_mode = $event"
                            @update-chat-message-style="preferences.chat_layout.message_style = $event"
                            @update-mobile-window-presentation="preferences.chat_layout.mobile_window_presentation = $event"
                            @update-advanced-rail-expanded="preferences.chat_layout.advanced_rail_expanded = $event"
                            @update-appearance="updateAppearancePreference"
                            @reset-appearance-group="resetAppearanceGroup"
                            @reset-all-appearance="resetAllAppearance"
                        />
                    </template>

                    <template v-else-if="activeTab === 'shortcuts'">
                        <TalosSettingsShortcutsPanel
                            :shortcuts="preferences.keyboard_shortcuts"
                            @update-shortcut="updateShortcutBinding"
                            @reset-shortcuts="resetShortcuts"
                        />
                    </template>

                    <template v-else-if="activeTab === 'account'">
                        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <div class="text-sm font-semibold text-[var(--talos-text)]">{{ operatorLabel }}</div>
                            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Authenticated Laravel operator session.</p>
                            <form v-if="authenticated && logoutUrl && csrfToken" :action="logoutUrl" method="post" class="mt-3">
                                <input type="hidden" name="_token" :value="csrfToken">
                                <Button type="submit" size="sm" variant="destructive">Sign out</Button>
                            </form>
                        </div>
                        <div data-testid="talos-settings-intro-replay" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <div class="text-sm font-semibold text-[var(--talos-text)]">Introduction</div>
                            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Watch the TALOS introduction again at any time.</p>
                            <Button class="mt-3" type="button" size="sm" variant="secondary" @click="emit('replayIntro')">Replay introduction</Button>
                        </div>
                    </template>

                    <template v-else-if="activeTab === 'agent_tools'">
                        <TalosSettingsToolsPanel
                            :agent-tools="preferences.agent_tools"
                            :agent-tool-options="agentToolOptions"
                            @update-tool-call-limit="preferences.agent_tools.tool_call_limit = $event"
                            @update-max-steps-per-message="preferences.agent_tools.max_steps_per_message = $event"
                            @update-agent-tool="updateAgentToolPreference"
                            @open-module="openModule"
                        />
                    </template>

                    <template v-else-if="activeTab === 'system'">
                        <div class="grid gap-3 md:grid-cols-2">
                            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                                <div class="text-sm font-semibold text-[var(--talos-text)]">Doctor, policy and audit</div>
                                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Readiness checks, policy state and audit events are admin-token gated.</p>
                                <Button class="mt-3" size="sm" variant="secondary" @click="openModule('doctor')">Open Doctor</Button>
                            </div>
                            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                                <div class="text-sm font-semibold text-[var(--talos-text)]">Backup validation</div>
                                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Backup manifest and restore validation are exposed in the Doctor window.</p>
                                <Button class="mt-3" size="sm" variant="secondary" @click="openModule('doctor', 'backup')">Open Backup</Button>
                            </div>
                        </div>
                    </template>
                </div>
            </section>
        </div>
    </Card>
</template>
