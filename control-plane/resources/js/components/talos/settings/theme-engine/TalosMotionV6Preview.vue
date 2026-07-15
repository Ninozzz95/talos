<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Moon, Pause, Play, RefreshCcw, Sun } from '@lucide/vue'
import Button from '../../../ui/Button.vue'
import Tooltip from '../../../ui/Tooltip.vue'
import TalosMotionStage from '../../motion/TalosMotionStage.vue'
import type { TalosMotionV6Preferences } from '../../../../motion-v6/contracts'
import {
    createDomInteractionMotionPlatform,
    createInteractionMotionController,
} from '../../../../motion-v6/interaction/controller'
import { getTalosInteractionProfileV6 } from '../../../../motion-v6/interaction/profiles'
import { createDefaultInteractionProfile, resolveTalosInteractionMotion } from '../../../../motion-v6/interaction/resolver'
import { createTalosBrowserProductSceneRegistry } from '../../../../motion-v6/productRegistry'
import { resolveTalosWorkspaceMotionV6 } from '../../../../motion-v6/workspaceRuntime'
import type { TalosThemeId } from '../../../../lib/talosThemes'
import { resolveTalosBackgroundPresentation } from '../../../../motion-v6/backgroundPresentation'

const props = defineProps<{
    theme: TalosThemeId
    preferences: TalosMotionV6Preferences
}>()

const colorMode = ref<'light' | 'dark'>('dark')
const paused = ref(false)
const stageRevision = ref(0)
const sampleWindow = ref<HTMLElement | null>(null)
const sampleMenu = ref<HTMLElement | null>(null)
const sampleMessage = ref<HTMLElement | null>(null)
const sampleFeedback = ref<HTMLElement | null>(null)
const registry = shallowRef(createTalosBrowserProductSceneRegistry())
const interactions = createInteractionMotionController(createDomInteractionMotionPlatform())

const previewRuntime = computed(() => resolveTalosWorkspaceMotionV6({
    settingsPreferences: { theme_motion_v6: props.preferences },
    themeId: props.theme,
    colorMode: colorMode.value,
    environment: {
        workspaceBackgroundAllowed: true,
        workspaceInterfaceMotionAllowed: true,
        prefersReducedMotion: false,
        documentHidden: false,
        saveData: false,
        rendererFault: false,
        failedEffectiveMode: null,
        frameP95Ms: null,
        frameSampleSufficient: false,
    },
}))
const effectivePreviewMode = computed(() => (
    previewRuntime.value.decision.effectiveMode === 'complex'
    && typeof globalThis.CanvasRenderingContext2D === 'undefined'
        ? 'simple'
        : previewRuntime.value.decision.effectiveMode
))
const previewStyle = computed(() => {
    const palette = previewRuntime.value.sceneInput.palette[colorMode.value]
    return {
        ...resolveTalosBackgroundPresentation(
            previewRuntime.value.sceneInput.parameters,
            props.preferences.glow_intensity,
        ).style,
        '--talos-background': palette.background,
        '--talos-panel': palette.surface,
        '--talos-panel-soft': palette.surface_muted,
        '--talos-card': palette.surface_elevated,
        '--talos-window-bg': palette.surface_elevated,
        '--talos-header': palette.surface,
        '--talos-text': palette.text,
        '--talos-muted': palette.text_muted,
        '--talos-border': palette.border,
        '--talos-border-strong': palette.border_strong,
        '--talos-accent': palette.accent,
        '--talos-accent-text': palette.accent_text,
        '--talos-accent-soft': `color-mix(in srgb, ${palette.accent} 18%, transparent)`,
        '--talos-success': palette.success,
        '--talos-warning': palette.warning,
        '--talos-danger': palette.danger,
    }
})

function plan(intent: 'window-open' | 'dropdown-open' | 'message-insert' | 'success') {
    return resolveTalosInteractionMotion({
        intent,
        profile: getTalosInteractionProfileV6(props.theme) ?? createDefaultInteractionProfile(),
        interfaceEnabled: props.preferences.interface_enabled && !paused.value,
        reducedMotion: false,
        preferences: props.preferences.interface,
    })
}

async function replayInterfacePreview() {
    await nextTick()
    const targets = [
        ['window', sampleWindow.value, 'window-open'],
        ['menu', sampleMenu.value, 'dropdown-open'],
        ['message', sampleMessage.value, 'message-insert'],
        ['feedback', sampleFeedback.value, 'success'],
    ] as const
    for (const [key, target, intent] of targets) {
        if (target) interactions.run(`preview:${key}`, target, plan(intent), { preserveFocus: false })
    }
}

function restart() {
    stageRevision.value += 1
    void replayInterfacePreview()
}

function togglePaused() {
    paused.value = !paused.value
    if (!paused.value) restart()
}

watch(() => props.preferences, () => {
    stageRevision.value += 1
    void replayInterfacePreview()
}, { deep: true })
watch(() => props.theme, restart)

onMounted(replayInterfacePreview)
onBeforeUnmount(() => interactions.dispose())
</script>

<template>
    <section class="space-y-2" aria-label="Live Motion V6 preview" data-testid="talos-motion-v6-preview">
        <header class="flex flex-wrap items-center justify-between gap-2">
            <div>
                <h5 class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Live product preview</h5>
                <p class="text-[11px] text-[var(--talos-muted)]">Draft only. No settings are written until Save motion.</p>
            </div>
            <div class="flex items-center gap-1">
                <div class="flex overflow-hidden rounded-md border border-[var(--talos-border)]" role="group" aria-label="Preview color mode">
                    <Tooltip content="Light preview">
                        <template #default><Button size="icon" variant="ghost" aria-label="Light preview" :aria-pressed="colorMode === 'light'" @click="colorMode = 'light'"><Sun class="h-4 w-4" aria-hidden="true" /></Button></template>
                    </Tooltip>
                    <Tooltip content="Dark preview">
                        <template #default><Button size="icon" variant="ghost" aria-label="Dark preview" :aria-pressed="colorMode === 'dark'" @click="colorMode = 'dark'"><Moon class="h-4 w-4" aria-hidden="true" /></Button></template>
                    </Tooltip>
                </div>
                <Tooltip :content="paused ? 'Resume preview' : 'Pause preview'">
                    <template #default><Button size="icon" variant="ghost" :aria-label="paused ? 'Resume preview' : 'Pause preview'" @click="togglePaused"><Play v-if="paused" class="h-4 w-4" aria-hidden="true" /><Pause v-else class="h-4 w-4" aria-hidden="true" /></Button></template>
                </Tooltip>
                <Tooltip content="Restart preview">
                    <template #default><Button size="icon" variant="ghost" aria-label="Restart preview" @click="restart"><RefreshCcw class="h-4 w-4" aria-hidden="true" /></Button></template>
                </Tooltip>
            </div>
        </header>

        <div
            class="talos-background-procedural relative isolate aspect-[16/9] min-h-56 w-full overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-background)]"
            :data-preview-color-mode="colorMode"
            :style="previewStyle"
        >
            <TalosMotionStage
                v-if="previewRuntime.decision.backgroundEnabled"
                :key="stageRevision"
                class="absolute inset-0 h-full w-full"
                :registry="registry"
                :requested-mode="previewRuntime.decision.requestedMode"
                :effective-mode="effectivePreviewMode"
                :scene-id="previewRuntime.sceneId"
                :input="previewRuntime.sceneInput"
                :background-enabled="previewRuntime.decision.backgroundEnabled"
                :paused="paused || previewRuntime.decision.paused"
            />
            <div v-if="previewRuntime.decision.backgroundEnabled" class="talos-theme-background-glow pointer-events-none absolute inset-0" data-talos-background-glow />
            <div v-if="previewRuntime.decision.backgroundEnabled" class="talos-theme-background-scrim pointer-events-none absolute inset-0" data-talos-background-scrim />

            <div class="pointer-events-none absolute inset-0 z-10 grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3 p-4">
                <div ref="sampleWindow" class="self-center overflow-hidden rounded-md border border-[var(--talos-border-strong)] bg-[var(--talos-window-bg)]/95 shadow-xl" data-preview-sample="window">
                    <div class="flex items-center justify-between border-b border-[var(--talos-border)] bg-[var(--talos-header)] px-2 py-1.5">
                        <span class="text-[10px] font-semibold text-[var(--talos-text)]">Evidence run</span>
                        <span class="text-[9px] text-[var(--talos-muted)]">verified</span>
                    </div>
                    <div class="space-y-2 p-2">
                        <div ref="sampleMessage" class="rounded-sm border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-1.5 text-[10px] leading-4 text-[var(--talos-text)]" data-preview-sample="message">The execution trace is attached to this response.</div>
                        <div ref="sampleFeedback" class="flex items-center gap-2 text-[9px]" data-preview-sample="feedback"><span class="text-[var(--talos-success)]">Success</span><span class="text-[var(--talos-warning)]">Warning</span><span class="text-[var(--talos-danger)]">Error</span></div>
                    </div>
                </div>
                <div ref="sampleMenu" class="self-start rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)]/95 p-1.5 text-[9px] text-[var(--talos-text)] shadow-lg" data-preview-sample="menu">
                    <div class="rounded-sm bg-[var(--talos-accent-soft)] px-2 py-1">Inspect trace</div>
                    <div class="px-2 py-1 text-[var(--talos-muted)]">Replay run</div>
                    <div class="px-2 py-1 text-[var(--talos-muted)]">Export evidence</div>
                </div>
            </div>

            <div class="absolute bottom-2 right-2 z-20 rounded-sm border border-[var(--talos-border)] bg-[var(--talos-card)]/90 px-2 py-1 font-mono text-[9px] text-[var(--talos-muted)]" data-testid="talos-motion-preview-diagnostics">
                {{ previewRuntime.decision.requestedMode }} -> {{ effectivePreviewMode }} / {{ previewRuntime.decision.reason }}
            </div>
        </div>
    </section>
</template>
