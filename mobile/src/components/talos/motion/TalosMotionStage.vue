<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch, type PropType } from 'vue'
import {
    TALOS_MOTION_SCENE_IDS,
} from '../../../motion-v6/contracts'
import {
    TALOS_MOTION_RUNTIME_EFFECTIVE_MODES,
    TALOS_MOTION_RUNTIME_REQUESTED_MODES,
    type TalosMotionRuntimeEffectiveMode,
    type TalosMotionRuntimeRequestedMode,
} from '../../../motion-v6/runtimePolicy'
import type {
    SceneId,
    SceneInput,
    SceneRegistry,
    SceneViewport,
} from '../../../motion-v6/sceneRegistry'
import {
    createTalosMotionStageController,
    type TalosMotionStageBlankProbe,
    type TalosMotionStageController,
    type TalosMotionStageFaultEvent,
    type TalosMotionStageFallbackEvent,
    type TalosMotionStageSnapshot,
} from '../../../motion-v6/stageController'

const props = defineProps({
    registry: {
        type: Object as PropType<SceneRegistry>,
        required: true,
        validator: (value: unknown) => {
            const keys = ['lookup', 'create', 'snapshot'] as const
            try {
                if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
                const ownKeys = Reflect.ownKeys(value)
                if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key as typeof keys[number]))) return false
                for (const key of keys) {
                    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
                    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof descriptor.value !== 'function') return false
                }
                return true
            } catch {
                // Vue may inspect invalid props while formatting a warning; the controller rejects uninspectable values.
                return true
            }
        },
    },
    requestedMode: {
        type: String as PropType<TalosMotionRuntimeRequestedMode>,
        required: true,
        validator: (value: unknown) => (TALOS_MOTION_RUNTIME_REQUESTED_MODES as readonly unknown[]).includes(value),
    },
    effectiveMode: {
        type: String as PropType<TalosMotionRuntimeEffectiveMode>,
        required: true,
        validator: (value: unknown) => (TALOS_MOTION_RUNTIME_EFFECTIVE_MODES as readonly unknown[]).includes(value),
    },
    sceneId: {
        type: String as PropType<SceneId>,
        required: true,
        validator: (value: unknown) => (TALOS_MOTION_SCENE_IDS as readonly unknown[]).includes(value),
    },
    input: {
        type: Object as PropType<SceneInput>,
        required: true,
        validator: (value: unknown) => {
            try {
                return typeof value === 'object' && value !== null && !Array.isArray(value)
            } catch {
                return true
            }
        },
    },
    backgroundEnabled: {
        type: Boolean,
        default: true,
    },
    paused: {
        type: Boolean,
        required: true,
    },
    blankProbe: Function as PropType<TalosMotionStageBlankProbe>,
    onFault: Function as PropType<(event: TalosMotionStageFaultEvent) => void>,
    onFallback: Function as PropType<(event: TalosMotionStageFallbackEvent) => void>,
})

const rendererTarget = shallowRef<HTMLElement | null>(null)
const controller = shallowRef<TalosMotionStageController | null>(null)
const snapshot = shallowRef<TalosMotionStageSnapshot>({
    requestedMode: 'off',
    effectiveMode: 'off',
    paused: false,
    activeKind: null,
    activeId: null,
    fallbackReason: null,
    faultCount: 0,
    status: 'idle',
    solidFallback: true,
})

let resizeObserver: ResizeObserver | null = null

function syncSnapshot(): void {
    if (controller.value) snapshot.value = controller.value.snapshot()
}

function failClosedSnapshot(): void {
    const requestedMode = (TALOS_MOTION_RUNTIME_REQUESTED_MODES as readonly unknown[]).includes(props.requestedMode)
        ? props.requestedMode
        : 'off'
    const effectiveMode = (TALOS_MOTION_RUNTIME_EFFECTIVE_MODES as readonly unknown[]).includes(props.effectiveMode)
        ? props.effectiveMode
        : 'off'
    snapshot.value = Object.freeze({
        requestedMode,
        effectiveMode,
        paused: props.paused === true,
        activeKind: null,
        activeId: null,
        fallbackReason: 'invalid_configuration',
        faultCount: 1,
        status: 'solid-fallback',
        solidFallback: true,
    })
}

function viewportFromElement(): SceneViewport {
    const fallback = props.input.viewport
    const rect = rendererTarget.value?.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect?.width || fallback.width))
    const height = Math.max(1, Math.round(rect?.height || fallback.height))
    const pixelRatio = Math.min(2, Math.max(0.25, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
    return { width, height, pixelRatio }
}

onMounted(() => {
    try {
        controller.value = createTalosMotionStageController({
            registry: props.registry,
            requestedMode: props.requestedMode,
            effectiveMode: props.effectiveMode,
            sceneId: props.sceneId,
            input: props.input,
            target: rendererTarget.value,
            backgroundEnabled: props.backgroundEnabled,
            paused: props.paused,
            blankProbe: props.blankProbe,
            onFault: props.onFault,
            onFallback: props.onFallback,
        })
        controller.value.mount()
        syncSnapshot()
    } catch {
        failClosedSnapshot()
    }

    try {
        if (typeof ResizeObserver !== 'undefined' && rendererTarget.value) {
            const observer = new ResizeObserver(() => {
                try {
                    controller.value?.resize(viewportFromElement())
                    syncSnapshot()
                } catch {
                    // ResizeObserver callbacks cannot surface page errors.
                }
            })
            resizeObserver = observer
            try {
                observer.observe(rendererTarget.value)
            } catch {
                try {
                    observer.disconnect()
                } catch {
                    // Observer cleanup is best effort; controller disposal is independent.
                } finally {
                    resizeObserver = null
                }
            }
        }
    } catch {
        resizeObserver = null
    }

})

watch(
    () => [props.requestedMode, props.effectiveMode, props.sceneId, props.input, props.backgroundEnabled, props.paused],
    () => {
        try {
            controller.value?.update({
                requestedMode: props.requestedMode,
                effectiveMode: props.effectiveMode,
                sceneId: props.sceneId,
                input: props.input,
                backgroundEnabled: props.backgroundEnabled,
                paused: props.paused,
            })
            controller.value?.resize(viewportFromElement())
        } catch {
            // A hostile DOM measurement cannot escape the stage boundary.
        } finally {
            syncSnapshot()
        }
    },
    { deep: false },
)

onBeforeUnmount(() => {
    try {
        try {
            resizeObserver?.disconnect()
        } catch {
            // Controller disposal remains mandatory when observer cleanup fails.
        } finally {
            resizeObserver = null
        }
    } finally {
        try {
            controller.value?.dispose()
        } catch {
            // The controller owns its own fault boundary; unmount remains contained.
        }
    }
})
</script>

<template>
    <div
        class="relative isolate min-h-0 overflow-hidden"
        data-talos-motion-stage
        :data-requested-mode="snapshot.requestedMode"
        :data-requested="snapshot.requestedMode"
        :data-effective-mode="snapshot.effectiveMode"
        :data-effective="snapshot.effectiveMode"
        :data-paused="snapshot.paused"
        :data-fallback-reason="snapshot.fallbackReason ?? ''"
        :data-reason="snapshot.fallbackReason ?? ''"
        :data-status="snapshot.status"
        :data-active-kind="snapshot.activeKind ?? ''"
        :data-scene-id="snapshot.activeId ?? ''"
        :data-requested-scene-id="sceneId"
        :data-solid-fallback="snapshot.solidFallback"
    >
        <div
            class="pointer-events-none absolute inset-0"
            data-talos-motion-solid-underlay
            aria-hidden="true"
            style="background-color: var(--talos-background, #101820)"
        />
        <div
            ref="rendererTarget"
            class="absolute inset-0"
            data-talos-motion-renderer-target
            aria-hidden="true"
        />
    </div>
</template>
