<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import TalosProceduralBackground from '@/components/talos/workspace/TalosProceduralBackground.vue'
import { useTalosMotionEnvironment } from '@/composables/useTalosMotionEnvironment'
import { resolveTalosWorkspaceMotionV6 } from '@/motion-v6/workspaceRuntime'
import { createTalosBrowserProductSceneRegistry } from '@/motion-v6/productRegistry'
import type { SceneRegistry } from '@/motion-v6/sceneRegistry'
import type { TalosMotionRuntimeEnvironment } from '@/motion-v6/runtimePolicy'
import { effectiveTalosThemeMode } from '@/lib/talosThemes'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'

// Mobile mirror of the desktop workspace's procedural-background wiring
// (TalosWorkspace + useTalosWorkspaceTheme): resolve the motion-v6 runtime for the
// active preset/mode + device environment, build the browser scene registry, and
// render the same TalosProceduralBackground. Motion preferences default until the
// Appearance settings feed real `preferences.motion_v6` (they arrive with settings).
const theme = useThemeStore()
const settings = useSettingsStore()
const environment = useTalosMotionEnvironment()
const registry = shallowRef<SceneRegistry | null>(null)

function systemPrefersDark(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches
}

const resolvedMode = computed(() => effectiveTalosThemeMode(theme.state.theme, theme.state.mode, systemPrefersDark()))

const runtimeEnvironment = computed<TalosMotionRuntimeEnvironment>(() => ({
    workspaceBackgroundAllowed: true,
    workspaceInterfaceMotionAllowed: true,
    prefersReducedMotion: environment.prefersReducedMotion.value,
    documentHidden: environment.documentHidden.value,
    saveData: environment.lowPower.value,
    rendererFault: false,
    failedEffectiveMode: null,
    frameP95Ms: null,
    frameSampleSufficient: false,
}))

const motion = computed(() => resolveTalosWorkspaceMotionV6({
    // T6.5 device defect: the migration contract reads `theme_motion_v6`
    // (desktop settings key) — the previous `motion_v6` key was silently
    // ignored and the background never left the default OFF mode.
    settingsPreferences: { theme_motion_v6: settings.state.motion_v6 },
    themeId: theme.state.theme,
    colorMode: resolvedMode.value,
    environment: runtimeEnvironment.value,
}))

onMounted(() => {
    try {
        registry.value = createTalosBrowserProductSceneRegistry()
    } catch {
        registry.value = null
    }
})
</script>

<template>
    <TalosProceduralBackground
        v-if="registry"
        :requested-mode="motion.decision.requestedMode"
        :effective-mode="motion.decision.effectiveMode"
        :scene-id="motion.sceneId"
        :input="motion.sceneInput"
        :background-enabled="motion.decision.backgroundEnabled"
        :glow-intensity="motion.preferences.glow_intensity"
        :paused="motion.decision.paused"
        :runtime-reason="motion.decision.reason"
        :degradation-stage="motion.decision.degradationStage"
        :recovery-locked="false"
        :registry="registry"
    />
</template>
