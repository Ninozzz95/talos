<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
    Bell,
    Bot,
    BrainCircuit,
    Database,
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
import Input from '../../ui/Input.vue'
import Select from '../../ui/Select.vue'
import type { TalosContextSet, TalosModelProfile } from '../../../lib/talosTypes'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import {
    TALOS_THEME_MOTION_OPTIONS,
    TALOS_THEME_PRESETS,
    normalizeTalosTheme,
    resolveTalosMotionMode,
    type TalosThemeId,
    type TalosThemeMotionMode,
} from '../../../lib/talosThemes'

type SettingsTab =
    | 'models'
    | 'ai_defaults'
    | 'search'
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
    theme_motion: TalosThemeMotionMode
    theme_motion_disabled: boolean
    theme_background_disabled: boolean
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
    reminders: {
        channel: string
        ai_synthesis: boolean
        public_app_url: string
    }
    appearance: {
        session_header: boolean
        welcome_message: boolean
        thinking_process: boolean
        sensitive_blur: boolean
        compact_sidebar: boolean
    }
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
    authenticated?: boolean
    authUserName?: string
    logoutUrl?: string
    csrfToken?: string
}>()

const emit = defineEmits<{
    selectModel: [id: string]
    selectContext: [id: string]
    changeTheme: [theme: TalosThemeId, persist?: boolean]
    openModule: [id: string]
    saved: []
}>()

const tabs: Array<{ id: SettingsTab; label: string; icon: unknown; group?: string }> = [
    { id: 'models', label: 'Models', icon: Bot },
    { id: 'ai_defaults', label: 'AI Defaults', icon: BrainCircuit },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'integrations', label: 'Integrations', icon: Wrench },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'account', label: 'Account', icon: User },
    { id: 'agent_tools', label: 'Agent Tools', icon: Shield, group: 'Admin' },
    { id: 'system', label: 'System', icon: Settings, group: 'Admin' },
]

const shortcuts = [
    { scope: 'Navigation', action: 'Search commands', keys: 'Ctrl K' },
    { scope: 'Navigation', action: 'Cancel or close focused overlay', keys: 'Esc' },
    { scope: 'Chat', action: 'Send prompt from composer', keys: 'Enter' },
    { scope: 'Chat', action: 'New line in composer', keys: 'Shift Enter' },
    { scope: 'Workspace', action: 'Open Settings from composer', keys: 'Composer settings icon' },
]
const appearanceOptions: Array<{ key: keyof SettingsPreferences['appearance']; label: string }> = [
    { key: 'session_header', label: 'Session header' },
    { key: 'welcome_message', label: 'Welcome message' },
    { key: 'thinking_process', label: 'Thinking process' },
    { key: 'sensitive_blur', label: 'Sensitive blur' },
    { key: 'compact_sidebar', label: 'Compact sidebar' },
]
const agentToolOptions: Array<{ key: keyof Omit<SettingsPreferences['agent_tools'], 'tool_call_limit' | 'max_steps_per_message'>; label: string }> = [
    { key: 'code_enabled', label: 'Code tools' },
    { key: 'search_enabled', label: 'Search tools' },
    { key: 'documents_enabled', label: 'Document tools' },
    { key: 'media_enabled', label: 'Media tools' },
    { key: 'knowledge_enabled', label: 'Knowledge tools' },
    { key: 'system_enabled', label: 'System tools' },
]

const activeTab = ref<SettingsTab>('models')

const preferences = reactive<SettingsPreferences>({
    theme: 'forge',
    theme_motion: 'system',
    theme_motion_disabled: false,
    theme_background_disabled: false,
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
    reminders: {
        channel: 'browser',
        ai_synthesis: false,
        public_app_url: '',
    },
    appearance: {
        session_header: true,
        welcome_message: true,
        thinking_process: true,
        sensitive_blur: true,
        compact_sidebar: true,
    },
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

function applyPreferences(nextPreferences: Record<string, unknown>) {
    preferences.theme = normalizeTalosTheme(nextPreferences.theme)
    preferences.theme_motion = resolveTalosMotionMode(nextPreferences.theme_motion)
    preferences.theme_motion_disabled = booleanValue(nextPreferences.theme_motion_disabled, false)
    preferences.theme_background_disabled = booleanValue(nextPreferences.theme_background_disabled, false)

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

    const reminders = record(nextPreferences.reminders)
    preferences.reminders.channel = stringValue(reminders.channel, preferences.reminders.channel)
    preferences.reminders.ai_synthesis = booleanValue(reminders.ai_synthesis, preferences.reminders.ai_synthesis)
    preferences.reminders.public_app_url = stringValue(reminders.public_app_url, preferences.reminders.public_app_url)

    const appearance = record(nextPreferences.appearance)
    preferences.appearance.session_header = booleanValue(appearance.session_header, preferences.appearance.session_header)
    preferences.appearance.welcome_message = booleanValue(appearance.welcome_message, preferences.appearance.welcome_message)
    preferences.appearance.thinking_process = booleanValue(appearance.thinking_process, preferences.appearance.thinking_process)
    preferences.appearance.sensitive_blur = booleanValue(appearance.sensitive_blur, preferences.appearance.sensitive_blur)
    preferences.appearance.compact_sidebar = booleanValue(appearance.compact_sidebar, preferences.appearance.compact_sidebar)

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
        workspace_default_theme: preferences.theme,
        ...(themeChanged ? { theme_customization: {} } : {}),
        theme_motion: preferences.theme_motion,
        theme_motion_disabled: preferences.theme_motion_disabled,
        theme_background_disabled: preferences.theme_background_disabled,
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
        reminders: {
            ...preferences.reminders,
        },
        appearance: {
            ...preferences.appearance,
        },
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

function openModule(id: string) {
    emit('openModule', id)
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
</script>

<template>
    <Card class="overflow-hidden p-0">
        <div class="flex min-h-[540px] flex-col md:flex-row">
            <aside class="border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)]/80 p-3 md:w-56 md:border-b-0 md:border-r" aria-label="Settings categories">
                <div class="px-2 pb-3">
                    <h3 class="text-base font-semibold text-[var(--talos-text)]">Settings Center</h3>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Workspace defaults, model behavior and operator preferences from /api/talos/settings.
                    </p>
                </div>
                <div role="tablist" aria-label="TALOS settings categories" class="space-y-1">
                    <template v-for="tab in tabs" :key="tab.id">
                        <div v-if="tab.group && tabs.findIndex((item) => item.group === tab.group) === tabs.findIndex((item) => item.id === tab.id)" class="px-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--talos-muted)]">
                            {{ tab.group }}
                        </div>
                        <button
                            :id="`talos-settings-tab-${tab.id}`"
                            type="button"
                            role="tab"
                            class="flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                            :class="activeTab === tab.id ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]' : 'border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]'"
                            :aria-selected="activeTab === tab.id"
                            :aria-controls="`talos-settings-panel-${tab.id}`"
                            @click="activeTab = tab.id"
                        >
                            <component :is="tab.icon" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                            <span>{{ tab.label }}</span>
                        </button>
                    </template>
                </div>
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
                        <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">{{ selectedTab.label }}</h3>
                    </div>
                    <Button size="sm" :disabled="savingSettings" @click="saveWorkspaceDefaults">
                        <Loader2 v-if="savingSettings" class="h-4 w-4 animate-spin" />
                        <Save v-else class="h-4 w-4" />
                        Save settings
                    </Button>
                </div>

                <div v-if="settingsError" class="mt-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                    {{ settingsError }}
                </div>
                <div v-if="settingsSavedMessage" class="mt-3 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                    {{ settingsSavedMessage }}
                </div>
                <div v-if="loadingSettings" class="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading settings
                </div>

                <div class="mt-4 space-y-3">
                    <template v-if="activeTab === 'models'">
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Default model</span>
                                <Select
                                    class="mt-2"
                                    :model-value="selectedModelProfileId"
                                    aria-label="Default model profile"
                                    :disabled="loadingSettings || !modelProfiles.length"
                                    @update:model-value="(value) => emit('selectModel', String(value))"
                                >
                                    <option value="">Choose profile</option>
                                    <option
                                        v-for="profile in modelProfiles"
                                        :key="profile.id"
                                        :value="profile.id"
                                        :disabled="profile.status === 'disabled' || !profile.has_secret"
                                    >
                                        {{ profile.display_name }} - {{ profile.model }} - {{ profile.status }}
                                    </option>
                                </Select>
                            </label>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Default context</span>
                                <Select
                                    class="mt-2"
                                    :model-value="selectedContextSetId"
                                    aria-label="Default grounding context"
                                    :disabled="loadingSettings || !contextSets.length"
                                    @update:model-value="(value) => emit('selectContext', String(value))"
                                >
                                    <option value="">No grounding context</option>
                                    <option
                                        v-for="contextSet in contextSets"
                                        :key="contextSet.id"
                                        :value="contextSet.id"
                                        :disabled="contextSet.status !== 'available' && contextSet.status !== 'draft'"
                                    >
                                        {{ contextSet.name }} - {{ contextSet.status }}
                                    </option>
                                </Select>
                            </label>
                        </div>
                        <div class="grid gap-3 md:grid-cols-2">
                            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                                <div class="text-sm font-semibold text-[var(--talos-text)]">Active model</div>
                                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                                    {{ activeModelProfile ? `${activeModelProfile.display_name} - ${activeModelProfile.model}` : 'No default model selected.' }}
                                </p>
                                <Button class="mt-3" size="sm" variant="secondary" @click="openModule('model_lab')">Open Model Lab</Button>
                            </div>
                            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                                <div class="text-sm font-semibold text-[var(--talos-text)]">Active context</div>
                                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                                    {{ activeContextSet ? `${activeContextSet.name} - ${activeContextSet.status}` : 'No grounding context selected.' }}
                                </p>
                                <Button class="mt-3" size="sm" variant="secondary" @click="openModule('library')">Open Library</Button>
                            </div>
                        </div>
                    </template>

                    <template v-else-if="activeTab === 'ai_defaults'">
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Utility model mode</span>
                                <Select v-model="preferences.ai_defaults.utility_model_mode" class="mt-2" aria-label="Utility model mode">
                                    <option value="same_as_chat">Same as chat</option>
                                    <option value="default_profile">Use default profile</option>
                                </Select>
                            </label>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Research model mode</span>
                                <Select v-model="preferences.ai_defaults.research_model_mode" class="mt-2" aria-label="Research model mode">
                                    <option value="same_as_chat">Same as chat</option>
                                    <option value="default_profile">Use default profile</option>
                                </Select>
                            </label>
                        </div>
                        <label class="flex items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <span>
                                <span class="block text-sm font-semibold text-[var(--talos-text)]">Vision routing preference</span>
                                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Stored as a safe routing preference until model capability routing consumes it.</span>
                            </span>
                            <input v-model="preferences.ai_defaults.vision_enabled" type="checkbox" class="mt-1 h-4 w-4 accent-[var(--talos-accent)]" aria-label="Vision routing preference">
                        </label>
                    </template>

                    <template v-else-if="activeTab === 'search'">
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Provider</span>
                                <Select v-model="preferences.search.provider" class="mt-2" aria-label="Search provider">
                                    <option value="searxng">SearXNG self-hosted</option>
                                    <option value="duckduckgo">DuckDuckGo fallback</option>
                                    <option value="disabled">Disabled</option>
                                </Select>
                            </label>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Results per query</span>
                                <Input v-model="preferences.search.results_per_query" class="mt-2" type="number" min="1" max="20" aria-label="Results per query" />
                            </label>
                            <label class="block md:col-span-2">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Endpoint URL</span>
                                <Input v-model="preferences.search.url" class="mt-2" placeholder="http://localhost:8080" aria-label="Search endpoint URL" />
                            </label>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Fallback provider</span>
                                <Select v-model="preferences.search.fallback" class="mt-2" aria-label="Search fallback provider">
                                    <option value="duckduckgo">DuckDuckGo</option>
                                    <option value="none">None</option>
                                </Select>
                            </label>
                        </div>
                        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <div class="text-sm font-semibold text-[var(--talos-text)]">Deep Research budgets</div>
                            <div class="mt-3 grid gap-3 md:grid-cols-2">
                                <Input v-model="preferences.search.deep_research.max_tokens" type="number" min="1024" aria-label="Deep research max tokens" />
                                <Input v-model="preferences.search.deep_research.extract_timeout" type="number" min="10" aria-label="Deep research extract timeout" />
                                <Input v-model="preferences.search.deep_research.extract_parallel" type="number" min="1" max="10" aria-label="Deep research extract parallelism" />
                                <Input v-model="preferences.search.deep_research.timeout" type="number" min="60" aria-label="Deep research timeout" />
                            </div>
                        </div>
                    </template>

                    <template v-else-if="activeTab === 'integrations'">
                        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <div class="text-sm font-semibold text-[var(--talos-text)]">Connector registry</div>
                            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                                Connectors and tools are read from the TALOS registry. Registry writes remain capability-gated server-side.
                            </p>
                            <Button class="mt-3" size="sm" variant="secondary" @click="openModule('tools')">Open Tool Registry</Button>
                        </div>
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
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Channel</span>
                                <Select v-model="preferences.reminders.channel" class="mt-2" aria-label="Reminder channel">
                                    <option value="browser">Browser notification</option>
                                    <option value="task">Task queue</option>
                                    <option value="disabled">Disabled</option>
                                </Select>
                            </label>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Public app URL</span>
                                <Input v-model="preferences.reminders.public_app_url" class="mt-2" placeholder="https://talos.example.test" aria-label="Public app URL" />
                            </label>
                        </div>
                        <label class="flex items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <span>
                                <span class="block text-sm font-semibold text-[var(--talos-text)]">AI synthesis for reminder text</span>
                                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Saved as preference; generated text still comes through model/profile policy.</span>
                            </span>
                            <input v-model="preferences.reminders.ai_synthesis" type="checkbox" class="mt-1 h-4 w-4 accent-[var(--talos-accent)]" aria-label="AI synthesis for reminder text">
                        </label>
                    </template>

                    <template v-else-if="activeTab === 'appearance'">
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Theme preset</span>
                                <Select v-model="preferences.theme" class="mt-2" aria-label="Theme preset">
                                    <option v-for="preset in TALOS_THEME_PRESETS" :key="preset.id" :value="preset.id">
                                        {{ preset.label }}
                                    </option>
                                </Select>
                            </label>
                            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
                                Theme selection updates the same preference used by Theme Engine.
                            </div>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Motion mode</span>
                                <Select v-model="preferences.theme_motion" class="mt-2" aria-label="Settings theme motion">
                                    <option v-for="mode in TALOS_THEME_MOTION_OPTIONS" :key="mode.value" :value="mode.value">
                                        {{ mode.label }}
                                    </option>
                                </Select>
                            </label>
                            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
                                Motion mode controls procedural effects only; TALOS does not load theme videos.
                            </div>
                        </div>
                        <div class="grid gap-2 md:grid-cols-2">
                            <label class="flex items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                                <span>
                                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable motion</span>
                                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Freeze the selected procedural background without removing it.</span>
                                </span>
                                <input v-model="preferences.theme_motion_disabled" type="checkbox" role="switch" class="mt-1 h-4 w-4 accent-[var(--talos-accent)]" aria-label="Settings disable motion">
                            </label>
                            <label class="flex items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                                <span>
                                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable procedural background</span>
                                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Remove the animated and static procedural background layers.</span>
                                </span>
                                <input v-model="preferences.theme_background_disabled" type="checkbox" role="switch" class="mt-1 h-4 w-4 accent-[var(--talos-accent)]" aria-label="Settings disable procedural background">
                            </label>
                        </div>
                        <div class="grid gap-2 md:grid-cols-2">
                            <label v-for="item in appearanceOptions" :key="item.key" class="flex items-center justify-between rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                                <span>{{ item.label }}</span>
                                <input v-model="preferences.appearance[item.key]" type="checkbox" class="h-4 w-4 accent-[var(--talos-accent)]" :aria-label="item.label">
                            </label>
                        </div>
                    </template>

                    <template v-else-if="activeTab === 'shortcuts'">
                        <div class="overflow-hidden rounded-md border border-[var(--talos-border)]">
                            <div v-for="shortcut in shortcuts" :key="`${shortcut.scope}-${shortcut.action}`" class="grid grid-cols-[110px_1fr_auto] gap-3 border-b border-[var(--talos-border)] px-3 py-2 text-sm last:border-b-0">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ shortcut.scope }}</span>
                                <span class="text-[var(--talos-text)]">{{ shortcut.action }}</span>
                                <span class="rounded-sm border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 py-0.5 text-xs text-[var(--talos-muted)]">{{ shortcut.keys }}</span>
                            </div>
                        </div>
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
                    </template>

                    <template v-else-if="activeTab === 'agent_tools'">
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Tool call limit</span>
                                <Input v-model="preferences.agent_tools.tool_call_limit" class="mt-2" type="number" min="0" aria-label="Tool call limit" />
                            </label>
                            <label class="block">
                                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Max steps per message</span>
                                <Input v-model="preferences.agent_tools.max_steps_per_message" class="mt-2" type="number" min="1" aria-label="Max steps per message" />
                            </label>
                        </div>
                        <div class="grid gap-2 md:grid-cols-2">
                            <label v-for="item in agentToolOptions" :key="item.key" class="flex items-center justify-between rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                                <span>{{ item.label }}</span>
                                <input v-model="preferences.agent_tools[item.key]" type="checkbox" class="h-4 w-4 accent-[var(--talos-accent)]" :aria-label="item.label">
                            </label>
                        </div>
                        <Button size="sm" variant="secondary" @click="openModule('tools')">Open Tool Registry</Button>
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
                                <Button class="mt-3" size="sm" variant="secondary" @click="openModule('doctor')">Open Backup</Button>
                            </div>
                        </div>
                    </template>
                </div>
            </section>
        </div>
    </Card>
</template>
