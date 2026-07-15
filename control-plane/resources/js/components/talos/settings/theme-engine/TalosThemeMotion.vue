<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCcw, RotateCcw, Save } from '@lucide/vue'
import Button from '../../../ui/Button.vue'
import InfoPopover from '../../../ui/InfoPopover.vue'
import Select from '../../../ui/Select.vue'
import Switch from '../../../ui/Switch.vue'
import TalosGuideInfoButton from '../../guide/TalosGuideInfoButton.vue'
import {
    TALOS_INTERFACE_EASINGS,
    TALOS_INTERFACE_PROFILES,
    TALOS_MOTION_DPR_CAPS,
    TALOS_MOTION_FPS_CAPS,
    TALOS_MOTION_QUALITY_LEVELS,
    TALOS_MOTION_RENDERER_MODES,
    TALOS_MOTION_SCENE_IDS,
    type TalosInterfaceMotionCategories,
    type TalosInterfaceMotionPreferences,
    type TalosMotionV6Preferences,
} from '../../../../motion-v6/contracts'
import type { TalosMotionRuntimeDecision } from '../../../../motion-v6/runtimePolicy'
import type { TalosThemeId } from '../../../../lib/talosThemes'
import TalosMotionV6Preview from './TalosMotionV6Preview.vue'

const props = defineProps<{
    modelValue: TalosMotionV6Preferences
    theme: TalosThemeId
    runtimeDecision: TalosMotionRuntimeDecision
    source: 'v6' | 'legacy' | 'default'
    dirty: boolean
    error: string
    canRetry: boolean
    disabled: boolean
    saving: boolean
}>()

const emit = defineEmits<{
    'update:modelValue': [value: TalosMotionV6Preferences]
    save: []
    retry: []
    resetBackground: []
    resetInterface: []
    resetAll: []
}>()

type NumericTopLevelKey = 'speed' | 'intensity' | 'glow_intensity' | 'density' | 'depth' | 'trails' | 'contrast' | 'parallax'
type NumericInterfaceKey = 'duration_scale' | 'intensity' | 'stagger'

const backgroundRanges: ReadonlyArray<{
    key: NumericTopLevelKey
    label: string
    min: number
    max: number
    step: number
    suffix: string
}> = [
    { key: 'speed', label: 'Motion speed', min: 25, max: 200, step: 5, suffix: '%' },
    { key: 'intensity', label: 'Background intensity', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'glow_intensity', label: 'Glow / lens flare', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'density', label: 'Scene density', min: 25, max: 150, step: 5, suffix: '%' },
    { key: 'depth', label: 'Scene depth', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'trails', label: 'Trail strength', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'contrast', label: 'Ambient contrast', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'parallax', label: 'Parallax depth', min: 0, max: 100, step: 1, suffix: '%' },
]

const interfaceRanges: ReadonlyArray<{
    key: NumericInterfaceKey
    label: string
    min: number
    max: number
    step: number
    suffix: string
}> = [
    { key: 'duration_scale', label: 'Interface duration', min: 50, max: 150, step: 5, suffix: '%' },
    { key: 'intensity', label: 'Interface intensity', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'stagger', label: 'Interface stagger', min: 0, max: 120, step: 5, suffix: ' ms' },
]

const categoryControls: ReadonlyArray<{
    key: keyof TalosInterfaceMotionCategories
    label: string
}> = [
    { key: 'windows', label: 'Animate windows' },
    { key: 'surfaces', label: 'Animate surfaces' },
    { key: 'navigation', label: 'Animate navigation' },
    { key: 'composer', label: 'Animate composer' },
    { key: 'messages', label: 'Animate messages' },
    { key: 'feedback', label: 'Animate feedback' },
]

const controlsDisabled = computed(() => props.disabled || props.saving)
const backgroundControlValue = computed(() => props.modelValue.background_enabled && props.modelValue.mode !== 'off')
const interfaceControlValue = computed(() => props.modelValue.interface_enabled && props.modelValue.interface.profile !== 'off')
const backgroundMotionState = computed(() => {
    if (!backgroundControlValue.value) return 'Off'
    if (props.runtimeDecision.paused || !props.runtimeDecision.backgroundEnabled) return 'Suppressed'
    return props.runtimeDecision.effectiveMode === 'static' ? 'Static' : 'Active'
})
const interfaceMotionState = computed(() => {
    if (!interfaceControlValue.value) return 'Off'
    return props.runtimeDecision.uiMotionEnabled ? 'Active' : 'Suppressed'
})

function clone(): TalosMotionV6Preferences {
    return {
        ...props.modelValue,
        interface: {
            ...props.modelValue.interface,
            categories: { ...props.modelValue.interface.categories },
        },
    }
}

function updateTopLevel<K extends Exclude<keyof TalosMotionV6Preferences, 'schema_version' | 'interface'>>(
    key: K,
    value: TalosMotionV6Preferences[K],
) {
    const next = clone()
    ;(next as unknown as Record<string, unknown>)[key] = value
    emit('update:modelValue', next)
}

function updateBackgroundEnabled(value: boolean) {
    const next = clone()
    next.background_enabled = value
    if (value && next.mode === 'off') next.mode = 'adaptive'
    emit('update:modelValue', next)
}

function updateInterfaceEnabled(value: boolean) {
    const next = clone()
    next.interface_enabled = value
    if (value && next.interface.profile === 'off') next.interface.profile = 'preset'
    emit('update:modelValue', next)
}

function updateInterface<K extends Exclude<keyof TalosInterfaceMotionPreferences, 'categories'>>(
    key: K,
    value: TalosInterfaceMotionPreferences[K],
) {
    const next = clone()
    ;(next.interface as unknown as Record<string, unknown>)[key] = value
    emit('update:modelValue', next)
}

function updateCategory(key: keyof TalosInterfaceMotionCategories, value: boolean) {
    const next = clone()
    next.interface.categories[key] = value
    emit('update:modelValue', next)
}

function numberFrom(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value)
}

function title(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('-', ' ')
}
</script>

<template>
    <section
        id="talos-theme-control-panel-motion"
        role="tabpanel"
        aria-labelledby="talos-theme-control-tab-motion"
        aria-label="Motion controls"
        class="space-y-5"
        data-testid="talos-motion-v6-editor"
    >
        <header class="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--talos-border)] pb-4">
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Motion Engine V6</h4>
                    <TalosGuideInfoButton guide-id="theme.motion" compact side="bottom" />
                    <span class="rounded-sm border border-[var(--talos-border)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--talos-muted)]">{{ source }}</span>
                </div>
                <div class="mt-1 flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                    <p>Background rendering and interface motion are independent and saved as one validated policy.</p>
                    <InfoPopover label="Motion runtime policy">
                        Adaptive selects a renderer from device policy. Reduced motion, data saver and renderer faults can lower the effective mode without overwriting your request.
                    </InfoPopover>
                </div>
            </div>
            <div class="flex flex-col items-end gap-3">
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-live="polite">
                    <span class="text-[var(--talos-muted)]">Requested</span>
                    <strong class="text-[var(--talos-text)]">{{ title(runtimeDecision.requestedMode) }}</strong>
                    <span class="text-[var(--talos-muted)]">Effective</span>
                    <strong class="text-[var(--talos-text)]">{{ title(runtimeDecision.effectiveMode) }}</strong>
                    <span class="text-[var(--talos-muted)]">Reason</span>
                    <span class="text-[var(--talos-text)]">{{ title(runtimeDecision.reason) }}</span>
                </div>
                <Button size="sm" variant="outline" :disabled="controlsDisabled" @click="emit('resetAll')">
                    <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
                    Reset all defaults
                </Button>
            </div>
        </header>

        <TalosMotionV6Preview :theme="theme" :preferences="modelValue" />

        <div v-if="error" class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-3 py-2 text-xs text-[var(--talos-text)]" role="alert">
            <span>{{ error }}</span>
            <Button v-if="canRetry" size="sm" variant="outline" :disabled="controlsDisabled" @click="emit('retry')">
                <RefreshCcw class="h-3.5 w-3.5" aria-hidden="true" />
                Retry last change
            </Button>
        </div>

        <fieldset :disabled="controlsDisabled" class="space-y-4">
            <legend class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Renderer mode</legend>
            <div class="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--talos-border)] sm:grid-cols-5" role="group" aria-label="Motion renderer mode">
                <button
                    v-for="mode in TALOS_MOTION_RENDERER_MODES"
                    :key="mode"
                    type="button"
                    class="min-h-10 border-b border-r border-[var(--talos-border)] px-3 text-xs font-medium text-[var(--talos-muted)] last:border-r-0 hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] sm:border-b-0"
                    :class="modelValue.mode === mode ? 'bg-[var(--talos-accent-soft)] text-[var(--talos-text)]' : ''"
                    :aria-label="`Motion mode ${title(mode)}`"
                    :aria-pressed="modelValue.mode === mode"
                    @click="updateTopLevel('mode', mode)"
                >
                    {{ title(mode) }}
                </button>
            </div>
        </fieldset>

        <div class="grid gap-3 md:grid-cols-2">
            <label class="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--talos-border)] py-2">
                <span>
                    <span class="flex items-center gap-2 text-sm font-medium text-[var(--talos-text)]">
                        Procedural background
                        <span data-testid="talos-background-motion-state" class="text-[10px] font-semibold uppercase text-[var(--talos-muted)]">{{ backgroundMotionState }}</span>
                    </span>
                    <span class="block text-xs text-[var(--talos-muted)]">Keep the selected scene visible. Enabling it from Off restores Adaptive.</span>
                </span>
                <Switch :model-value="backgroundControlValue" aria-label="Procedural background" :disabled="controlsDisabled" @change="updateBackgroundEnabled" />
            </label>
            <label class="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--talos-border)] py-2">
                <span>
                    <span class="flex items-center gap-2 text-sm font-medium text-[var(--talos-text)]">
                        Interface motion
                        <span data-testid="talos-interface-motion-state" class="text-[10px] font-semibold uppercase text-[var(--talos-muted)]">{{ interfaceMotionState }}</span>
                    </span>
                    <span class="block text-xs text-[var(--talos-muted)]">Animate windows, navigation and feedback independently from the background renderer.</span>
                </span>
                <Switch :model-value="interfaceControlValue" aria-label="Interface motion" :disabled="controlsDisabled" @change="updateInterfaceEnabled" />
            </label>
        </div>

        <section class="space-y-3" aria-labelledby="talos-motion-background-heading">
            <div class="flex items-center justify-between gap-3">
                <h5 id="talos-motion-background-heading" class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Background scene</h5>
                <Button size="sm" variant="ghost" :disabled="controlsDisabled" @click="emit('resetBackground')">
                    <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
                    Reset background
                </Button>
            </div>
            <div class="grid gap-x-5 gap-y-4 md:grid-cols-2">
                <label v-for="control in backgroundRanges" :key="control.key" class="space-y-1.5 text-xs text-[var(--talos-muted)]">
                    <span class="flex justify-between gap-3"><span>{{ control.label }}</span><output class="font-mono text-[var(--talos-text)]">{{ modelValue[control.key] }}{{ control.suffix }}</output></span>
                    <input
                        type="range"
                        class="w-full accent-[var(--talos-accent)]"
                        :aria-label="control.label"
                        :min="control.min"
                        :max="control.max"
                        :step="control.step"
                        :value="modelValue[control.key]"
                        :disabled="controlsDisabled"
                        @input="updateTopLevel(control.key, numberFrom($event))"
                    >
                </label>
            </div>
        </section>

        <section class="space-y-3 border-t border-[var(--talos-border)] pt-4" aria-labelledby="talos-motion-interface-heading">
            <div class="flex items-center justify-between gap-3">
                <h5 id="talos-motion-interface-heading" class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Interface profile</h5>
                <Button size="sm" variant="ghost" :disabled="controlsDisabled" @click="emit('resetInterface')">
                    <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
                    Reset interface
                </Button>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
                <label class="space-y-1 text-xs text-[var(--talos-muted)]">
                    <span>Profile</span>
                    <Select :model-value="modelValue.interface.profile" aria-label="Interface motion profile" :disabled="controlsDisabled" @update:model-value="updateInterface('profile', $event as TalosInterfaceMotionPreferences['profile'])">
                        <option v-for="profile in TALOS_INTERFACE_PROFILES" :key="profile" :value="profile">{{ title(profile) }}</option>
                    </Select>
                </label>
                <label class="space-y-1 text-xs text-[var(--talos-muted)]">
                    <span>Easing</span>
                    <Select :model-value="modelValue.interface.easing" aria-label="Interface easing" :disabled="controlsDisabled" @update:model-value="updateInterface('easing', $event as TalosInterfaceMotionPreferences['easing'])">
                        <option v-for="easing in TALOS_INTERFACE_EASINGS" :key="easing" :value="easing">{{ title(easing) }}</option>
                    </Select>
                </label>
                <label v-for="control in interfaceRanges" :key="control.key" class="space-y-1.5 text-xs text-[var(--talos-muted)]">
                    <span class="flex justify-between gap-3"><span>{{ control.label }}</span><output class="font-mono text-[var(--talos-text)]">{{ modelValue.interface[control.key] }}{{ control.suffix }}</output></span>
                    <input
                        type="range"
                        class="w-full accent-[var(--talos-accent)]"
                        :aria-label="control.label"
                        :min="control.min"
                        :max="control.max"
                        :step="control.step"
                        :value="modelValue.interface[control.key]"
                        :disabled="controlsDisabled"
                        @input="updateInterface(control.key, numberFrom($event))"
                    >
                </label>
            </div>
            <div class="grid gap-x-5 md:grid-cols-2">
                <label v-for="control in categoryControls" :key="control.key" class="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--talos-border)] py-2 text-xs text-[var(--talos-text)]">
                    <span>{{ control.label }}</span>
                    <Switch :model-value="modelValue.interface.categories[control.key]" :aria-label="control.label" :disabled="controlsDisabled" @change="updateCategory(control.key, $event)" />
                </label>
            </div>
        </section>

        <details class="border-t border-[var(--talos-border)] pt-4">
            <summary class="cursor-pointer text-xs font-semibold uppercase text-[var(--talos-muted)]">Performance and advanced</summary>
            <div class="mt-4 grid gap-4 md:grid-cols-2">
                <label class="space-y-1 text-xs text-[var(--talos-muted)]"><span>Quality policy</span><Select :model-value="modelValue.quality" aria-label="Motion quality" :disabled="controlsDisabled" @update:model-value="updateTopLevel('quality', $event as TalosMotionV6Preferences['quality'])"><option v-for="quality in TALOS_MOTION_QUALITY_LEVELS" :key="quality" :value="quality">{{ title(quality) }}</option></Select></label>
                <label class="space-y-1 text-xs text-[var(--talos-muted)]"><span>Scene override</span><Select :model-value="modelValue.scene_override ?? ''" aria-label="Motion scene override" :disabled="controlsDisabled" @update:model-value="updateTopLevel('scene_override', ($event || null) as TalosMotionV6Preferences['scene_override'])"><option value="">Follow preset</option><option v-for="scene in TALOS_MOTION_SCENE_IDS" :key="scene" :value="scene">{{ title(scene) }}</option></Select></label>
                <label class="space-y-1 text-xs text-[var(--talos-muted)]"><span>FPS cap</span><Select :model-value="modelValue.fps_cap" aria-label="Motion FPS cap" :disabled="controlsDisabled" @update:model-value="updateTopLevel('fps_cap', Number($event) as TalosMotionV6Preferences['fps_cap'])"><option v-for="fps in TALOS_MOTION_FPS_CAPS" :key="fps" :value="fps">{{ fps }} FPS</option></Select></label>
                <label class="space-y-1 text-xs text-[var(--talos-muted)]"><span>DPR cap</span><Select :model-value="modelValue.dpr_cap" aria-label="Motion DPR cap" :disabled="controlsDisabled" @update:model-value="updateTopLevel('dpr_cap', Number($event) as TalosMotionV6Preferences['dpr_cap'])"><option v-for="dpr in TALOS_MOTION_DPR_CAPS" :key="dpr" :value="dpr">{{ dpr }}x</option></Select></label>
                <label class="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--talos-border)] py-2 text-xs text-[var(--talos-text)]"><span>Pause when hidden</span><Switch :model-value="modelValue.pause_when_hidden" aria-label="Pause when hidden" :disabled="controlsDisabled" @change="updateTopLevel('pause_when_hidden', $event)" /></label>
                <label class="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--talos-border)] py-2 text-xs text-[var(--talos-text)]"><span>Respect data saver</span><Switch :model-value="modelValue.respect_data_saver" aria-label="Respect data saver" :disabled="controlsDisabled" @change="updateTopLevel('respect_data_saver', $event)" /></label>
            </div>
        </details>

        <footer class="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--talos-border)] bg-[var(--talos-card)]/95 py-3 backdrop-blur">
            <p class="text-xs text-[var(--talos-muted)]">{{ dirty ? 'Unsaved motion changes' : 'Motion settings are synchronized' }}</p>
            <Button :disabled="disabled || saving || !dirty" :loading="saving" @click="emit('save')">
                <Save class="h-4 w-4" aria-hidden="true" />
                Save motion
            </Button>
        </footer>
    </section>
</template>
