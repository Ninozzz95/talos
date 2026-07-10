import { computed, ref, type Ref } from 'vue'
import { sanitizeTalosChatLayout } from '../lib/talosChatLayout'
import type { TalosChatBubbleScale, TalosComposerMode } from '../lib/talosTypes'
import type { TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'

type UpdateSettings = (payload: UpdateTalosSettingsPayload) => Promise<TalosWorkspaceSettings>

export function useTalosChatLayoutPreferences(
    workspaceSettings: Ref<TalosWorkspaceSettings | null>,
    updateSettings: UpdateSettings,
    uiError: Ref<string | null>,
) {
    const bubbleScale = ref<TalosChatBubbleScale>('balanced')
    const composerMode = ref<TalosComposerMode>('full')
    const advancedRailExpanded = ref(false)
    const policyLocked = computed(() => workspaceSettings.value?.preferences?.theme_policy_locked === true)
    const bubbleScaleLabel = computed(() => bubbleScale.value[0].toUpperCase() + bubbleScale.value.slice(1))

    function apply(value: unknown) {
        const layout = sanitizeTalosChatLayout(value)
        bubbleScale.value = layout.bubble_scale
        composerMode.value = layout.composer_mode
        advancedRailExpanded.value = layout.advanced_rail_expanded
    }

    function persist(includeVisualPreferences = true) {
        if (includeVisualPreferences && policyLocked.value) {
            apply(workspaceSettings.value?.preferences?.chat_layout)
            uiError.value = 'Chat appearance is locked by workspace policy.'
            return
        }

        updateSettings({
            preferences: {
                ...(workspaceSettings.value?.preferences ?? {}),
                chat_layout: {
                    ...(includeVisualPreferences ? {
                        bubble_scale: bubbleScale.value,
                        composer_mode: composerMode.value,
                    } : {}),
                    advanced_rail_expanded: advancedRailExpanded.value,
                },
            },
        }).catch((error) => {
            uiError.value = error instanceof Error ? error.message : 'TALOS could not persist chat layout preferences.'
        })
    }

    function setBubbleScale(next: TalosChatBubbleScale) {
        if (policyLocked.value) return
        bubbleScale.value = next
        persist()
    }

    function decrementBubbleScale() {
        setBubbleScale(bubbleScale.value === 'expanded' ? 'balanced' : 'compact')
    }

    function incrementBubbleScale() {
        setBubbleScale(bubbleScale.value === 'compact' ? 'balanced' : 'expanded')
    }

    function resetBubbleScale() {
        setBubbleScale('balanced')
    }

    function toggleComposerMode() {
        if (policyLocked.value) return
        composerMode.value = composerMode.value === 'full' ? 'minimal' : 'full'
        persist()
    }

    function toggleAdvancedRail() {
        advancedRailExpanded.value = !advancedRailExpanded.value
        persist(false)
    }

    return {
        bubbleScale,
        bubbleScaleLabel,
        composerMode,
        advancedRailExpanded,
        policyLocked,
        apply,
        decrementBubbleScale,
        incrementBubbleScale,
        resetBubbleScale,
        toggleComposerMode,
        toggleAdvancedRail,
    }
}
