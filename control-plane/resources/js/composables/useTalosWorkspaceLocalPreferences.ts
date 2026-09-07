import type { Ref } from 'vue'
import { normalizeTalosTheme, type TalosThemeId } from '../lib/talosThemes'

type WorkspacePreferenceRefs = {
    theme: Ref<TalosThemeId>
    selectedModelProfileId: Ref<string>
    selectedModelRoutingProfileId: Ref<string>
    selectedContextSetId: Ref<string>
    selectedEffort?: Ref<string>
    thinking?: Ref<boolean>
}

export function useTalosWorkspaceLocalPreferences(refs: WorkspacePreferenceRefs) {
    function loadWorkspacePreferences() {
        const savedTheme = localStorage.getItem('talos_theme')
        if (savedTheme) {
            refs.theme.value = normalizeTalosTheme(savedTheme)
        }
        const savedPreferences = localStorage.getItem('talos_workspace_preferences')
        if (!savedPreferences) {
            return
        }
        try {
            const parsed = JSON.parse(savedPreferences) as {
                model_profile_id?: string
                model_routing_profile_id?: string
                context_set_id?: string
                effort?: string
                thinking?: boolean
            }
            refs.selectedModelProfileId.value = typeof parsed.model_profile_id === 'string' ? parsed.model_profile_id : ''
            refs.selectedModelRoutingProfileId.value = typeof parsed.model_routing_profile_id === 'string' ? parsed.model_routing_profile_id : ''
            refs.selectedContextSetId.value = typeof parsed.context_set_id === 'string' ? parsed.context_set_id : ''
            if (refs.selectedEffort && typeof parsed.effort === 'string') {
                refs.selectedEffort.value = parsed.effort
            }
            if (refs.thinking && typeof parsed.thinking === 'boolean') {
                refs.thinking.value = parsed.thinking
            }
        } catch {
            localStorage.removeItem('talos_workspace_preferences')
        }
    }

    function saveWorkspacePreferences() {
        localStorage.setItem('talos_workspace_preferences', JSON.stringify({
            model_profile_id: refs.selectedModelProfileId.value,
            model_routing_profile_id: refs.selectedModelRoutingProfileId.value,
            context_set_id: refs.selectedContextSetId.value,
            effort: refs.selectedEffort?.value,
            thinking: refs.thinking?.value,
        }))
    }

    return {
        loadWorkspacePreferences,
        saveWorkspacePreferences,
    }
}
