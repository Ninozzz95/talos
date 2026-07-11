import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { resolveTalosAppearanceVisibility } from '../lib/talosAppearancePreferences'
import { syncTalosFavicon } from '../lib/talosFavicon'
import { resolveTalosShortcuts } from '../lib/talosShortcuts'
import { validateTalosThemeStateContrast } from '../lib/talosThemeValidation'
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
    validateTalosThemeCustomizationContrast,
    type TalosThemeCustomization,
    type TalosThemeId,
} from '../lib/talosThemes'
import type { TalosChatBubbleScale } from '../lib/talosTypes'
import { useTalosMotion } from './useTalosMotion'
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
    const browserPrefersDark = ref<boolean | null>(null)
    let colorSchemeQuery: MediaQueryList | null = null

    const themeMode = computed(() => resolveTalosThemeMode(options.workspaceSettings.value?.preferences?.theme_mode))
    const resolvedThemeMode = computed(() => effectiveTalosThemeMode(options.theme.value, themeMode.value, browserPrefersDark.value))
    const preset = computed(() => talosThemePreset(options.theme.value))
    const configuredMotionMode = computed(() => resolveTalosMotionMode(options.workspaceSettings.value?.preferences?.theme_motion))
    const motionMode = computed(() => configuredMotionMode.value === 'system'
        ? preset.value.defaultMotion
        : configuredMotionMode.value)
    const uiAnimationProfile = computed(() => resolveTalosUiAnimationProfile(options.workspaceSettings.value?.preferences?.ui_animation_profile))
    const uiAnimationCustomization = computed(() => sanitizeTalosUiAnimationCustomization(options.workspaceSettings.value?.preferences?.ui_animation_customization))
    const simpleAnimation = computed(() => options.workspaceSettings.value?.preferences?.theme_simple_animation !== false)
    const backgroundDisabled = computed(() => options.workspaceSettings.value?.preferences?.theme_background_disabled === true)
    const workspaceReducedMotion = computed(() => options.workspaceSettings.value?.preferences?.reduced_motion === true)
    const themeMotionDisabled = computed(() => options.workspaceSettings.value?.preferences?.theme_motion_disabled === true)
    const runtimeMotion = useTalosMotion({
        themeMotion: motionMode,
        themeMotionDisabled,
        uiAnimationProfile,
        prefersReducedMotion: workspaceReducedMotion,
        root: options.workspaceRoot,
    })
    const motionDisabled = computed(() => !runtimeMotion.backgroundMotionEnabled.value)
    const savedCustomization = computed(() => {
        const customization = sanitizeTalosThemeCustomization(options.workspaceSettings.value?.preferences?.theme_customization)

        return validateTalosThemeCustomizationContrast(customization, options.theme.value).valid
            ? customization
            : {}
    })
    const effectiveCustomization = computed(() => options.themeDraftCustomization.value ?? savedCustomization.value)
    const areaTokens = computed(() => {
        const tokens = sanitizeTalosThemeAreaTokens(options.workspaceSettings.value?.preferences?.theme_area_tokens)

        return validateTalosThemeStateContrast({
            baseTheme: options.theme.value,
            customization: savedCustomization.value,
            areaTokens: tokens,
        }).valid
            ? tokens
            : {}
    })
    const appearanceVisibility = computed(() => resolveTalosAppearanceVisibility(options.workspaceSettings.value?.preferences?.appearance_visibility))
    const keyboardShortcuts = computed(() => resolveTalosShortcuts(options.workspaceSettings.value?.preferences?.keyboard_shortcuts))
    const uiMotionDisabled = computed(() => !runtimeMotion.uiMotionEnabled.value)
    const backgroundMotionEnabled = runtimeMotion.backgroundMotionEnabled
    const backgroundEffect = computed(() => talosBackgroundEffectFromCustomization(effectiveCustomization.value, preset.value, backgroundDisabled.value))
    const backgroundPaletteKey = computed(() => JSON.stringify([
        options.theme.value,
        resolvedThemeMode.value,
        effectiveCustomization.value,
        areaTokens.value,
    ]))
    const currentRailWidth = computed(() => options.railCollapsed.value ? 64 : options.railWidth.value)
    const shellClass = computed(() => [
        talosThemeClass(options.theme.value),
        resolvedThemeMode.value === 'light' ? 'talos-light' : 'talos-dark',
        `talos-theme-mode-${resolvedThemeMode.value}`,
        `talos-density-${effectiveCustomization.value.density ?? preset.value.defaultDensity}`,
        `talos-radius-${effectiveCustomization.value.radius ?? preset.value.defaultRadius}`,
        `talos-effect-${backgroundEffect.value}`,
        motionDisabled.value ? 'talos-motion-disabled' : '',
        uiMotionDisabled.value ? 'talos-ui-motion-disabled' : '',
        runtimeMotion.lowPower.value ? 'talos-low-power-motion' : '',
        runtimeMotion.motionPaused.value ? 'talos-motion-paused' : '',
        backgroundDisabled.value ? 'talos-background-disabled' : '',
        ...Object.keys(areaTokens.value).map((area) => `talos-area-${area}-customized`),
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
    function handleColorSchemeChange(event: MediaQueryListEvent) {
        browserPrefersDark.value = event.matches
    }
    function startMediaWatchers() {
        colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
        browserPrefersDark.value = colorSchemeQuery?.matches ?? null
        colorSchemeQuery?.addEventListener('change', handleColorSchemeChange)
    }
    function stopMediaWatchers() {
        colorSchemeQuery?.removeEventListener('change', handleColorSchemeChange)
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
        backgroundMotionEnabled,
        motionPaused: runtimeMotion.motionPaused,
        backgroundEffect,
        backgroundPaletteKey,
        currentRailWidth,
        workspaceStyle,
    }
}
