import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { resolveTalosAppearanceVisibility } from '../lib/talosAppearancePreferences'
import { syncTalosFavicon } from '../lib/talosFavicon'
import { syncTalosBootAccent } from '../lib/talosBootLoader'
import { resolveTalosShortcuts } from '../lib/talosShortcuts'
import { validateTalosThemeStateContrast } from '../lib/talosThemeValidation'
import {
    effectiveTalosThemeMode,
    resolveTalosThemeMode,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    talosThemeAreaTokenStyle,
    talosThemeClass,
    talosThemeCustomizationStyle,
    talosThemeModeVariantStyle,
    talosThemePreset,
    validateTalosThemeCustomizationContrast,
    type TalosThemeCustomization,
    type TalosThemeId,
} from '../lib/talosThemes'
import type { TalosChatBubbleScale } from '../lib/talosTypes'
import { useTalosMotionEnvironment } from './useTalosMotionEnvironment'
import type { TalosWorkspaceSettings } from './useTalosSettings'
import { resolveTalosWorkspaceMotionV6 } from '../motion-v6/workspaceRuntime'
import { talosInteractionMotionStyleV6 } from '../motion-v6/interaction/style'
import {
    createTalosMotionRuntimeGovernor,
    type TalosMotionRuntimeFaultSignal,
    type TalosMotionRuntimeStableWindowMetric,
} from '../motion-v6/runtimeGovernor'
import type { ComplexRendererFrameMetric } from '../motion-v6/renderers/complexRenderer'
import type { TalosMotionRuntimeEnvironment } from '../motion-v6/runtimePolicy'

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
    const workspaceReducedMotion = computed(() => options.workspaceSettings.value?.preferences?.reduced_motion === true)
    const runtimeEnvironment = useTalosMotionEnvironment({ workspaceReducedMotion })
    const runtimeGovernor = createTalosMotionRuntimeGovernor()
    const runtimeGovernorRevision = ref(0)
    const baseRuntimeEnvironment = computed<TalosMotionRuntimeEnvironment>(() => ({
        workspaceBackgroundAllowed: true,
        workspaceInterfaceMotionAllowed: true,
        prefersReducedMotion: runtimeEnvironment.prefersReducedMotion.value,
        documentHidden: runtimeEnvironment.documentHidden.value,
        saveData: runtimeEnvironment.lowPower.value,
        rendererFault: false,
        failedEffectiveMode: null,
        frameP95Ms: null,
        frameSampleSufficient: false,
    }))
    const motionV6Baseline = computed(() => resolveTalosWorkspaceMotionV6({
        settingsPreferences: options.workspaceSettings.value?.preferences ?? {},
        themeId: options.theme.value,
        colorMode: resolvedThemeMode.value,
        environment: baseRuntimeEnvironment.value,
    }))
    const motionV6ConfigurationKey = computed(() => JSON.stringify([
        options.theme.value,
        resolvedThemeMode.value,
        motionV6Baseline.value.sceneId,
        motionV6Baseline.value.preferences,
    ]))
    const motionV6GovernorResolution = computed(() => {
        void runtimeGovernorRevision.value
        return runtimeGovernor.resolve(
            motionV6Baseline.value.preferences,
            baseRuntimeEnvironment.value,
            motionV6ConfigurationKey.value,
        )
    })
    const motionV6Runtime = computed(() => resolveTalosWorkspaceMotionV6({
        settingsPreferences: options.workspaceSettings.value?.preferences ?? {},
        themeId: options.theme.value,
        colorMode: resolvedThemeMode.value,
        environment: motionV6GovernorResolution.value.environment,
        degradationStage: motionV6GovernorResolution.value.degradationStage,
    }))
    const motionV6Preferences = computed(() => motionV6Runtime.value.preferences)
    const motionV6Decision = computed(() => motionV6Runtime.value.decision)
    const motionV6SceneInput = computed(() => motionV6Runtime.value.sceneInput)
    const motionV6SceneId = computed(() => motionV6Runtime.value.sceneId)
    const uiAnimationProfile = computed(() => motionV6Preferences.value.interface.profile)
    const simpleAnimation = computed(() => motionV6Decision.value.effectiveMode !== 'complex')
    const backgroundDisabled = computed(() => !motionV6Preferences.value.background_enabled || motionV6Preferences.value.mode === 'off')
    const motionDisabled = computed(() => motionV6Decision.value.effectiveMode === 'off'
        || motionV6Decision.value.effectiveMode === 'static'
        || motionV6Decision.value.paused)
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
    const uiMotionDisabled = computed(() => !motionV6Decision.value.uiMotionEnabled || motionV6Decision.value.paused)
    const backgroundMotionEnabled = computed(() => motionV6Decision.value.backgroundEnabled
        && (motionV6Decision.value.effectiveMode === 'simple' || motionV6Decision.value.effectiveMode === 'complex')
        && !motionV6Decision.value.paused)
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
        motionDisabled.value ? 'talos-motion-disabled' : '',
        uiMotionDisabled.value ? 'talos-ui-motion-disabled' : '',
        runtimeEnvironment.lowPower.value ? 'talos-low-power-motion' : '',
        motionV6Decision.value.paused ? 'talos-motion-paused' : '',
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
        ...talosInteractionMotionStyleV6({
            themeId: options.theme.value,
            preferences: motionV6Preferences.value,
            reducedMotion: motionV6Decision.value.reducedMotionApplied,
            paused: !motionV6Decision.value.uiMotionEnabled,
        }),
        ...talosThemeModeVariantStyle(options.theme.value, resolvedThemeMode.value),
        ...talosThemeCustomizationStyle(effectiveCustomization.value),
        ...talosThemeAreaTokenStyle(areaTokens.value),
    }))

    async function refreshFavicon() {
        await nextTick()
        if (options.workspaceRoot.value) {
            syncTalosFavicon(options.workspaceRoot.value)
            syncTalosBootAccent(options.workspaceRoot.value)
        }
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

    function recordMotionFrame(metric: ComplexRendererFrameMetric): void {
        if (!runtimeGovernor.recordFrame(metric)) return
        const previousStage = runtimeGovernor.snapshot().degradationStage
        const next = runtimeGovernor.resolve(
            motionV6Baseline.value.preferences,
            baseRuntimeEnvironment.value,
            motionV6ConfigurationKey.value,
        )
        if (next.degradationStage !== previousStage) runtimeGovernorRevision.value += 1
    }

    function recordMotionStableWindow(metric: TalosMotionRuntimeStableWindowMetric): void {
        if (!runtimeGovernor.recordStableWindow(metric)) return
        const previousStage = runtimeGovernor.snapshot().degradationStage
        const next = runtimeGovernor.resolve(
            motionV6Baseline.value.preferences,
            baseRuntimeEnvironment.value,
            motionV6ConfigurationKey.value,
        )
        if (next.degradationStage !== previousStage) runtimeGovernorRevision.value += 1
    }

    function recordMotionRendererFault(signal: TalosMotionRuntimeFaultSignal): void {
        if (runtimeGovernor.recordRendererFault(signal.effectiveMode, motionV6ConfigurationKey.value)) {
            runtimeGovernorRevision.value += 1
        }
    }

    watch(workspaceStyle, refreshFavicon, { deep: true })
    onMounted(() => {
        startMediaWatchers()
        void refreshFavicon()
    })
    onBeforeUnmount(stopMediaWatchers)
    onBeforeUnmount(() => runtimeGovernor.dispose())

    return {
        themeMode,
        resolvedThemeMode,
        shellClass,
        motionDisabled,
        simpleAnimation,
        backgroundDisabled,
        appearanceVisibility,
        keyboardShortcuts,
        uiAnimationProfile,
        uiMotionDisabled,
        backgroundMotionEnabled,
        motionPaused: computed(() => motionV6Decision.value.paused),
        motionV6Preferences,
        motionV6Decision,
        motionV6SceneInput,
        motionV6SceneId,
        motionV6Source: computed(() => motionV6Runtime.value.source),
        motionV6Valid: computed(() => motionV6Runtime.value.success),
        motionV6GovernorSnapshot: computed(() => {
            void motionV6Runtime.value
            return runtimeGovernor.snapshot()
        }),
        recordMotionFrame,
        recordMotionStableWindow,
        recordMotionRendererFault,
        backgroundPaletteKey,
        currentRailWidth,
        workspaceStyle,
    }
}
