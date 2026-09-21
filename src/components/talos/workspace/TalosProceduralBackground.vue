<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch, type PropType } from 'vue'
import TalosMotionStage from '../motion/TalosMotionStage.vue'
import { createTalosBrowserProductSceneRegistry } from '../../../motion-v6/productRegistry'
import type { ComplexRendererFrameMetric } from '../../../motion-v6/renderers/complexRenderer'
import type {
    TalosMotionRuntimeEffectiveMode,
    TalosMotionRuntimeReason,
    TalosMotionRuntimeRequestedMode,
} from '../../../motion-v6/runtimePolicy'
import type {
    TalosMotionRuntimeFaultSignal,
    TalosMotionRuntimeStableWindowMetric,
} from '../../../motion-v6/runtimeGovernor'
import type { SceneId, SceneInput, SceneRegistry } from '../../../motion-v6/sceneRegistry'
import type { TalosMotionStageFaultEvent } from '../../../motion-v6/stageController'
import { resolveTalosBackgroundPresentation } from '../../../motion-v6/backgroundPresentation'

const RECOVERY_PROBE_MS = 1_000

const emit = defineEmits<{
    motionFrame: [metric: ComplexRendererFrameMetric]
    rendererFault: [signal: TalosMotionRuntimeFaultSignal]
    stableWindow: [metric: TalosMotionRuntimeStableWindowMetric]
}>()

const props = defineProps({
    requestedMode: { type: String as PropType<TalosMotionRuntimeRequestedMode>, required: true },
    effectiveMode: { type: String as PropType<TalosMotionRuntimeEffectiveMode>, required: true },
    sceneId: { type: String as PropType<SceneId>, required: true },
    input: { type: Object as PropType<SceneInput>, required: true },
    backgroundEnabled: { type: Boolean, required: true },
    glowIntensity: { type: Number, default: 0 },
    paused: { type: Boolean, required: true },
    runtimeReason: { type: String as PropType<TalosMotionRuntimeReason>, default: 'requested' },
    degradationStage: { type: Number, default: 0 },
    recoveryLocked: { type: Boolean, default: false },
    registry: Object as PropType<SceneRegistry>,
})

const productRegistry = shallowRef<SceneRegistry | null>(props.registry ?? null)
const registryFault = shallowRef(false)
const presentation = computed(() => resolveTalosBackgroundPresentation(props.input.parameters, props.glowIntensity))
let recoveryProbe: ReturnType<typeof setInterval> | null = null
let nextRecoveryProbeAtMs = 0

function emitRendererFault(
    effectiveMode: TalosMotionRuntimeEffectiveMode,
    reason: TalosMotionRuntimeFaultSignal['reason'],
): void {
    if (effectiveMode === 'off') return
    emit('rendererFault', Object.freeze({ effectiveMode, reason }))
}

function handleStageFault(event: TalosMotionStageFaultEvent): void {
    const effectiveMode = event.kind ?? props.effectiveMode
    emitRendererFault(effectiveMode, 'stage_fault')
}

function stopRecoveryProbe(): void {
    if (recoveryProbe === null) return
    clearInterval(recoveryProbe)
    recoveryProbe = null
    nextRecoveryProbeAtMs = 0
}

function recoveryProbeRequired(): boolean {
    return props.runtimeReason === 'performance_degraded'
        && props.degradationStage > 0
        && !props.recoveryLocked
        && props.backgroundEnabled
        && !props.paused
        && props.effectiveMode !== 'off'
        && props.effectiveMode !== 'complex'
        && props.requestedMode !== 'off'
        && props.requestedMode !== 'static'
}

function syncRecoveryProbe(): void {
    stopRecoveryProbe()
    if (!recoveryProbeRequired()) return
    nextRecoveryProbeAtMs = performance.now() + RECOVERY_PROBE_MS
    recoveryProbe = setInterval(() => {
        const nowMs = performance.now()
        const eventLoopDelayMs = Math.max(0, nowMs - nextRecoveryProbeAtMs)
        nextRecoveryProbeAtMs = nowMs + RECOVERY_PROBE_MS
        emit('stableWindow', Object.freeze({ eventLoopDelayMs }))
    }, RECOVERY_PROBE_MS)
}

onMounted(() => {
    if (!productRegistry.value) {
        try {
            productRegistry.value = createTalosBrowserProductSceneRegistry(document, window, performance, {
                onFrame: (metric) => emit('motionFrame', metric),
                onFault: () => emitRendererFault('complex', 'renderer_fault'),
            })
        } catch {
            registryFault.value = true
            emitRendererFault(props.effectiveMode, 'registry_fault')
        }
    }
    syncRecoveryProbe()
})

watch(
    () => [props.runtimeReason, props.degradationStage, props.recoveryLocked, props.backgroundEnabled, props.paused, props.effectiveMode, props.requestedMode],
    syncRecoveryProbe,
)

onBeforeUnmount(stopRecoveryProbe)
</script>

<template>
    <div
        data-testid="talos-motion-background"
        class="talos-background-procedural pointer-events-none absolute inset-0 overflow-hidden"
        :style="presentation.style"
        :data-scene-id="sceneId"
        :data-background-intensity="String(presentation.intensity)"
        :data-background-glow-intensity="String(presentation.glowIntensity)"
        :data-background-contrast="String(presentation.contrast)"
        :data-motion-disabled="effectiveMode === 'static' || effectiveMode === 'off' || paused ? 'true' : 'false'"
        :data-performance-mode="effectiveMode === 'simple' || effectiveMode === 'complex' ? 'motion' : 'static'"
        :data-performance-fps-cap="String(input.effectiveQuality.fpsCap)"
        :data-performance-dpr-cap="String(input.effectiveQuality.dprCap)"
        :data-performance-raf-active="backgroundEnabled && !paused && (effectiveMode === 'simple' || effectiveMode === 'complex') ? 'true' : 'false'"
        :data-simple-animation="effectiveMode === 'simple' || effectiveMode === 'static' ? 'true' : 'false'"
        :data-v6-registry-fault="registryFault ? 'true' : 'false'"
        :data-recovery-locked="recoveryLocked ? 'true' : 'false'"
        aria-hidden="true"
    >
        <TalosMotionStage
            v-if="backgroundEnabled && productRegistry"
            class="absolute inset-0 h-full w-full"
            :registry="productRegistry"
            :requested-mode="requestedMode"
            :effective-mode="effectiveMode"
            :scene-id="sceneId"
            :input="input"
            :background-enabled="backgroundEnabled"
            :paused="paused"
            :on-fault="handleStageFault"
        />
        <div v-else-if="backgroundEnabled" class="absolute inset-0 bg-[var(--talos-background)]" data-talos-motion-solid-fallback />
        <div v-if="backgroundEnabled" class="talos-theme-background-glow pointer-events-none absolute inset-0" data-talos-background-glow />
        <div v-if="backgroundEnabled" class="talos-theme-background-scrim pointer-events-none absolute inset-0" data-talos-background-scrim />
    </div>
</template>
