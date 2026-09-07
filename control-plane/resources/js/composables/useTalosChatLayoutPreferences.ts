import { computed, ref, type Ref } from 'vue'
import { sanitizeTalosChatLayout } from '../lib/talosChatLayout'
import {
    TALOS_UI_SCALE_CONSTRAINT,
    canonicalizeTalosMessageScale,
    canonicalizeTalosUiScale,
    isTalosUiScale,
    stepTalosMessageScale,
    talosScalePercentLabel,
} from '../lib/talosUiScale'
import type { TalosComposerMode, TalosMessageStyle, TalosMobileWindowPresentation } from '../lib/talosTypes'
import type { TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'

type UpdateSettings = (payload: UpdateTalosSettingsPayload) => Promise<TalosWorkspaceSettings>

export function useTalosChatLayoutPreferences(
    workspaceSettings: Ref<TalosWorkspaceSettings | null>,
    updateSettings: UpdateSettings,
    uiError: Ref<string | null>,
) {
    const uiScale = ref(TALOS_UI_SCALE_CONSTRAINT.default)
    const messageScale = ref(1)
    const composerMode = ref<TalosComposerMode>('full')
    const messageStyle = ref<TalosMessageStyle>('sections')
    const advancedRailExpanded = ref(false)
    const mobileWindowPresentation = ref<TalosMobileWindowPresentation>('drawer')
    const policyLocked = computed(() => workspaceSettings.value?.preferences?.theme_policy_locked === true)
    const messageScaleLabel = computed(() => talosScalePercentLabel(messageScale.value))

    function apply(value: unknown, uiScaleValue?: unknown) {
        const layout = sanitizeTalosChatLayout(value)
        uiScale.value = isTalosUiScale(uiScaleValue) ? uiScaleValue : TALOS_UI_SCALE_CONSTRAINT.default
        messageScale.value = layout.message_scale
        composerMode.value = layout.composer_mode
        messageStyle.value = layout.message_style
        advancedRailExpanded.value = layout.advanced_rail_expanded
        mobileWindowPresentation.value = layout.mobile_window_presentation
    }

    async function persist(includeVisualPreferences = true) {
        if (includeVisualPreferences && policyLocked.value) {
            apply(
                workspaceSettings.value?.preferences?.chat_layout,
                workspaceSettings.value?.preferences?.ui_scale,
            )
            uiError.value = 'Chat appearance is locked by workspace policy.'
            return
        }

        const preferences = workspaceSettings.value?.preferences ?? {}
        const layout = includeVisualPreferences
            ? {
                message_scale: canonicalizeTalosMessageScale(messageScale.value),
                composer_mode: composerMode.value,
                message_style: messageStyle.value,
                advanced_rail_expanded: advancedRailExpanded.value,
                mobile_window_presentation: mobileWindowPresentation.value,
            }
            : {
                ...sanitizeTalosChatLayout(preferences.chat_layout),
                advanced_rail_expanded: advancedRailExpanded.value,
            }

        try {
            await updateSettings({
                preferences: {
                    ...preferences,
                    ui_scale: includeVisualPreferences
                        ? canonicalizeTalosUiScale(uiScale.value)
                        : (isTalosUiScale(preferences.ui_scale) ? preferences.ui_scale : canonicalizeTalosUiScale(uiScale.value)),
                    chat_layout: {
                        ...layout,
                    },
                },
            })
        } catch (error) {
            uiError.value = error instanceof Error ? error.message : 'TALOS could not persist chat layout preferences.'
        }
    }

    async function setUiScale(next: number) {
        if (policyLocked.value) {
            await persist()
            return
        }
        uiScale.value = canonicalizeTalosUiScale(next)
        await persist()
    }

    async function setMessageScale(next: number) {
        if (policyLocked.value) {
            await persist()
            return
        }
        messageScale.value = canonicalizeTalosMessageScale(next)
        await persist()
    }

    async function decrementMessageScale() {
        await setMessageScale(stepTalosMessageScale(messageScale.value, -1))
    }

    async function incrementMessageScale() {
        await setMessageScale(stepTalosMessageScale(messageScale.value, 1))
    }

    async function resetMessageScale() {
        await setMessageScale(1)
    }

    async function toggleComposerMode() {
        if (policyLocked.value) {
            await persist()
            return
        }
        composerMode.value = composerMode.value === 'full' ? 'minimal' : 'full'
        await persist()
    }

    async function setMessageStyle(next: TalosMessageStyle) {
        if (policyLocked.value) {
            await persist()
            return
        }
        messageStyle.value = next
        await persist()
    }

    async function toggleAdvancedRail() {
        advancedRailExpanded.value = !advancedRailExpanded.value
        await persist(false)
    }

    return {
        uiScale,
        messageScale,
        messageScaleLabel,
        composerMode,
        messageStyle,
        advancedRailExpanded,
        mobileWindowPresentation,
        policyLocked,
        apply,
        setUiScale,
        setMessageScale,
        decrementMessageScale,
        incrementMessageScale,
        resetMessageScale,
        toggleComposerMode,
        setMessageStyle,
        toggleAdvancedRail,
    }
}
