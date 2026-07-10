import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { resolveTalosAppearanceVisibility } from '../lib/talosAppearancePreferences'
import { syncTalosFavicon } from '../lib/talosFavicon'
import { resolveTalosShortcuts } from '../lib/talosShortcuts'
import {
    effectiveTalosThemeMode,
    resolveTalosMotionMode,
    resolveTalosThemeMode,
    resolveTalosUiAnimationProfile,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    sanitizeTalosUiAnimationCustomization,
    talosBackgroundEffectFromCustomization,
    talosThemeAreaTokenStyle,
    talosThemeClass,
    talosThemeCustomizationStyle,
    talosThemeModeVariantStyle,
    talosThemeMotionStyle,
    talosThemePreset,
    talosUiAnimationStyle,
    type TalosThemeCustomization,
    type TalosThemeId,
} from '../lib/talosThemes'
import type { TalosChatBubbleScale } from '../lib/talosTypes'
import type { TalosWorkspaceSettings } from './useTalosSettings'

export function useTalosWorkspaceTheme(options: {
    theme: Ref<TalosThemeId>
    themeDraftCustomization: Ref<TalosThemeCustomization | null>
    workspaceSettings: Ref<TalosWorkspaceSettings | null>
    workspaceRoot: Ref<HTMLElement | null>
    railCollapsed: Ref<boolean>
    railWidth: Ref<number>
    bubbleScale: Ref<TalosChatBubbleScale>
}) {
    const browserReducedMotion = ref(false)
    const browserPrefersDark = ref<boolean | null>(null)
    let reducedMotionQuery: MediaQueryList | null = null
    let colorSchemeQuery: MediaQueryList | null = null

    const themeMode = computed(() => resolveTalosThemeMode(options.workspaceSettings.value?.preferences?.theme_mode))
    const resolvedThemeMode = computed(() => effectiveTalosThemeMode(options.theme.value, themeMode.value, browserPrefersDark.value))
    const preset = computed(() => talosThemePreset(options.theme.value))
    const motionMode = computed(() => resolveTalosMotionMode(options.workspaceSettings.value?.preferences?.theme_motion))
    const simpleAnimation = computed(() => options.workspaceSettings.value?.preferences?.theme_simple_animation !== false)
    const backgroundDisabled = computed(() => options.workspaceSettings.value?.preferences?.theme_background_disabled === true)
    const reducedMotion = computed(() => options.workspaceSettings.value?.preferences?.reduced_motion === true
        || (motionMode.value === 'system' && browserReducedMotion.value))
    const motionDisabled = computed(() => options.workspaceSettings.value?.preferences?.theme_motion_disabled === true
        || reducedMotion.value
        || motionMode.value === 'off')
    const savedCustomization = computed(() => sanitizeTalosThemeCustomization(options.workspaceSettings.value?.preferences?.theme_customization))
    const effectiveCustomization = computed(() => options.themeDraftCustomization.value ?? savedCustomization.value)
    const areaTokens = computed(() => sanitizeTalosThemeAreaTokens(options.workspaceSettings.value?.preferences?.theme_area_tokens))
    const appearanceVisibility = computed(() => resolveTalosAppearanceVisibility(options.workspaceSettings.value?.preferences?.appearance_visibility))
    const keyboardShortcuts = computed(() => resolveTalosShortcuts(options.workspaceSettings.value?.preferences?.keyboard_shortcuts))
    const uiAnimationProfile = computed(() => resolveTalosUiAnimationProfile(options.workspaceSettings.value?.preferences?.ui_animation_profile))
    const uiAnimationCustomization = computed(() => sanitizeTalosUiAnimationCustomization(options.workspaceSettings.value?.preferences?.ui_animation_customization))
    const uiMotionDisabled = computed(() => reducedMotion.value || uiAnimationProfile.value === 'off')
    const backgroundEffect = computed(() => talosBackgroundEffectFromCustomization(effectiveCustomization.value, preset.value, backgroundDisabled.value))
    const currentRailWidth = computed(() => options.railCollapsed.value ? 64 : options.railWidth.value)
    const shellClass = computed(() => [
        talosThemeClass(options.theme.value),
        resolvedThemeMode.value === 'light' ? 'talos-light' : 'talos-dark',
        `talos-theme-mode-${resolvedThemeMode.value}`,
        `talos-density-${effectiveCustomization.value.density ?? 'comfortable'}`,
        `talos-radius-${effectiveCustomization.value.radius ?? 'balanced'}`,
        `talos-effect-${backgroundEffect.value}`,
        motionDisabled.value ? 'talos-motion-disabled' : '',
        uiMotionDisabled.value ? 'talos-ui-motion-disabled' : '',
        backgroundDisabled.value ? 'talos-background-disabled' : '',
    ])
    const workspaceStyle = computed(() => ({
        '--talos-rail-width': `${currentRailWidth.value}px`,
        '--talos-message-max-width': options.bubbleScale.value === 'compact' ? '640px' : options.bubbleScale.value === 'expanded' ? '880px' : '760px',
        '--talos-message-padding-inline': options.bubbleScale.value === 'compact' ? '0.75rem' : options.bubbleScale.value === 'expanded' ? '1.25rem' : '1rem',
        '--talos-message-padding-block': options.bubbleScale.value === 'compact' ? '0.625rem' : options.bubbleScale.value === 'expanded' ? '1rem' : '0.75rem',
        '--talos-message-font-size': options.bubbleScale.value === 'compact' ? '0.8125rem' : options.bubbleScale.value === 'expanded' ? '0.9375rem' : '0.875rem',
        '--talos-message-line-height': options.bubbleScale.value === 'compact' ? '1.35rem' : options.bubbleScale.value === 'expanded' ? '1.65rem' : '1.5rem',
        ...talosThemeMotionStyle(motionMode.value),
        ...talosUiAnimationStyle(options.theme.value, uiAnimationProfile.value, motionMode.value, uiMotionDisabled.value, uiAnimationCustomization.value),
        ...talosThemeModeVariantStyle(options.theme.value, resolvedThemeMode.value),
        ...talosThemeCustomizationStyle(effectiveCustomization.value),
        ...talosThemeAreaTokenStyle(areaTokens.value),
    }))

    async function refreshFavicon() {
        await nextTick()
        if (options.workspaceRoot.value) syncTalosFavicon(options.workspaceRoot.value)
    }
    function handleReducedMotionChange(event: MediaQueryListEvent) {
        browserReducedMotion.value = event.matches
    }
    function handleColorSchemeChange(event: MediaQueryListEvent) {
        browserPrefersDark.value = event.matches
    }
    function startMediaWatchers() {
        reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
        colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
        browserReducedMotion.value = reducedMotionQuery?.matches ?? false
        browserPrefersDark.value = colorSchemeQuery?.matches ?? null
        reducedMotionQuery?.addEventListener('change', handleReducedMotionChange)
        colorSchemeQuery?.addEventListener('change', handleColorSchemeChange)
    }
    function stopMediaWatchers() {
        reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
        colorSchemeQuery?.removeEventListener('change', handleColorSchemeChange)
        reducedMotionQuery = null
        colorSchemeQuery = null
    }

    watch(workspaceStyle, refreshFavicon, { deep: true })
    onMounted(() => {
        startMediaWatchers()
        void refreshFavicon()
    })
    onBeforeUnmount(stopMediaWatchers)

    return {
        themeMode,
        resolvedThemeMode,
        shellClass,
        motionMode,
        motionDisabled,
        simpleAnimation,
        backgroundDisabled,
        appearanceVisibility,
        keyboardShortcuts,
        uiAnimationProfile,
        uiMotionDisabled,
        backgroundEffect,
        currentRailWidth,
        workspaceStyle,
    }
}
