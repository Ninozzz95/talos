import { nextTick, type Ref } from 'vue'
import { normalizeTalosTheme, type TalosThemeId } from '../lib/talosThemes'
import { TALOS_WORKSPACE_WINDOW_IDS } from '../lib/talosWorkspaceCommandRoutes'
import type { TalosSession } from '../lib/talosTypes'

export type TalosWorkspaceBootstrapSettings = {
    default_model_profile_id?: string | null
    default_context_set_id?: string | null
    preferences?: { theme?: unknown; chat_layout?: unknown }
}

export type TalosWorkspaceBootstrapDependencies = {
    uiError: Ref<string | null>
    theme: Ref<TalosThemeId>
    selectedModelProfileId: Ref<string>
    selectedModelRoutingProfileId: Ref<string>
    selectedContextSetId: Ref<string>
    callableModelProfiles: Readonly<Ref<ReadonlyArray<{ id: string }>>>
    usableModelRoutingProfiles: Readonly<Ref<ReadonlyArray<{ id: string }>>>
    loadModelProfiles: () => Promise<void>
    loadModelRoutingProfiles: () => Promise<void>
    loadContextSets: () => Promise<void>
    saveWorkspacePreferences: () => void
    loadWorkspacePreferences: () => void
    loadWorkspaceSettings: () => Promise<TalosWorkspaceBootstrapSettings>
    applyChatLayoutPreference: (value: unknown) => void
    openWindowFromSource: (id: 'runtime' | 'compare' | typeof TALOS_WORKSPACE_WINDOW_IDS[number], event?: undefined, source?: 'command') => void
    loadSessions: () => Promise<TalosSession[]>
    selectSession: (session: TalosSession) => Promise<void>
    restoreBrowseForActiveSession: () => Promise<void>
    scrollChat: () => void
    initializeBrowse: () => Promise<void>
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export function useTalosWorkspaceBootstrap(deps: TalosWorkspaceBootstrapDependencies) {
    function reconcileModelSelection(preferredModelProfileId: string | null = null) {
        const previousModelProfileId = deps.selectedModelProfileId.value
        const previousRoutingProfileId = deps.selectedModelRoutingProfileId.value
        const preferredProfile = preferredModelProfileId
            ? deps.callableModelProfiles.value.find((profile) => profile.id === preferredModelProfileId)
            : null
        const selectedProfileIsUsable = deps.callableModelProfiles.value.some((profile) => profile.id === previousModelProfileId)
        const selectedRouteIsUsable = deps.usableModelRoutingProfiles.value.some((profile) => profile.id === previousRoutingProfileId)

        if (preferredProfile) {
            deps.selectedModelProfileId.value = preferredProfile.id
            deps.selectedModelRoutingProfileId.value = ''
        } else if (selectedProfileIsUsable) {
            deps.selectedModelRoutingProfileId.value = ''
        } else if (selectedRouteIsUsable) {
            deps.selectedModelProfileId.value = ''
        } else if (deps.callableModelProfiles.value.length > 0) {
            deps.selectedModelProfileId.value = deps.callableModelProfiles.value[0].id
            deps.selectedModelRoutingProfileId.value = ''
        } else if (deps.usableModelRoutingProfiles.value.length > 0) {
            deps.selectedModelProfileId.value = ''
            deps.selectedModelRoutingProfileId.value = deps.usableModelRoutingProfiles.value[0].id
        } else {
            deps.selectedModelProfileId.value = ''
            deps.selectedModelRoutingProfileId.value = ''
        }

        if (
            deps.selectedModelProfileId.value !== previousModelProfileId
            || deps.selectedModelRoutingProfileId.value !== previousRoutingProfileId
        ) {
            deps.saveWorkspacePreferences()
        }
    }

    async function refreshModelAndContext(preferredModelProfileId: string | null = null) {
        await Promise.allSettled([deps.loadModelProfiles(), deps.loadModelRoutingProfiles(), deps.loadContextSets()])
        reconcileModelSelection(preferredModelProfileId)
    }

    async function loadPersistedWorkspaceSettings() {
        const settings = await deps.loadWorkspaceSettings()
        if (settings.default_model_profile_id) {
            deps.selectedModelProfileId.value = settings.default_model_profile_id
            deps.selectedModelRoutingProfileId.value = ''
        }
        if (settings.default_context_set_id) deps.selectedContextSetId.value = settings.default_context_set_id
        if (settings.preferences?.theme) {
            const nextTheme = normalizeTalosTheme(settings.preferences.theme)
            deps.theme.value = nextTheme
            localStorage.setItem('talos_theme', nextTheme)
        }
        deps.applyChatLayoutPreference(settings.preferences?.chat_layout)
    }

    function applyQueryModules() {
        const params = new URLSearchParams(window.location.search)
        const module = params.get('module')
        if (module && TALOS_WORKSPACE_WINDOW_IDS.includes(module as typeof TALOS_WORKSPACE_WINDOW_IDS[number])) {
            deps.openWindowFromSource(module as typeof TALOS_WORKSPACE_WINDOW_IDS[number], undefined, 'command')
        }
        if (params.has('run')) deps.openWindowFromSource('runtime', undefined, 'command')
        if (params.has('benchmark')) deps.openWindowFromSource('compare', undefined, 'command')
    }

    async function initialize() {
        deps.loadWorkspacePreferences()
        applyQueryModules()
        await deps.initializeBrowse()
        try {
            await refreshModelAndContext()
            await loadPersistedWorkspaceSettings()
            reconcileModelSelection()
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not load model and context state.')
        }
        try {
            const loadedSessions = await deps.loadSessions()
            if (loadedSessions.length > 0) {
                await deps.selectSession(loadedSessions[0])
                await deps.restoreBrowseForActiveSession()
                await nextTick()
                deps.scrollChat()
            }
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not load chat sessions.')
        }
    }

    return {
        refreshModelAndContext,
        reconcileModelSelection,
        loadPersistedWorkspaceSettings,
        applyQueryModules,
        initialize,
    }
}
