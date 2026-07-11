<script setup lang="ts">
import InfoPopover from '../../../ui/InfoPopover.vue'
import Select from '../../../ui/Select.vue'
import Switch from '../../../ui/Switch.vue'
import {
    TALOS_THEME_MOTION_OPTIONS,
    type TalosThemeMotionMode,
} from '../../../../lib/talosThemes'

const props = defineProps<{
    simpleAnimation: boolean
    motionDisabled: boolean
    backgroundDisabled: boolean
    motionMode: TalosThemeMotionMode
    disabled: boolean
    saving: boolean
}>()

const emit = defineEmits<{
    'update:simpleAnimation': [value: boolean]
    'update:motionDisabled': [value: boolean]
    'update:backgroundDisabled': [value: boolean]
    'update:motionMode': [value: TalosThemeMotionMode]
    'persist-simple-animation': []
    'persist-motion-disabled': []
    'persist-background-disabled': []
    'persist-motion-mode': []
}>()

function updateSimpleAnimation(value: boolean) {
    emit('update:simpleAnimation', value)
    emit('persist-simple-animation')
}

function updateMotionDisabled(value: boolean) {
    emit('update:motionDisabled', value)
    emit('persist-motion-disabled')
}

function updateBackgroundDisabled(value: boolean) {
    emit('update:backgroundDisabled', value)
    emit('persist-background-disabled')
}

function updateMotionMode(value: TalosThemeMotionMode) {
    emit('update:motionMode', value)
    emit('persist-motion-mode')
}
</script>

<template>
    <section
        id="talos-theme-control-panel-motion"
        role="tabpanel"
        aria-labelledby="talos-theme-control-tab-motion"
        aria-label="Motion controls"
        class="space-y-4"
    >
        <div>
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Motion controls</h4>
            <div class="mt-1 flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                <p>Motion mode controls procedural intensity without loading video backgrounds.</p>
                <InfoPopover label="Motion and background policy">
                    Disable background motion freezes the selected procedural scene. Disable procedural background removes the scene entirely.
                </InfoPopover>
            </div>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
            <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <span>
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Use simple animation</span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Default optimized canvas profile for slower devices and long sessions.</span>
                </span>
                <Switch :model-value="simpleAnimation" class="mt-1" aria-label="Use simple animation" :disabled="saving || disabled" @change="updateSimpleAnimation" />
            </label>
            <div v-if="!simpleAnimation" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3 text-xs leading-5 text-[var(--talos-text)]">
                Rich animation raises frame rate, DPR and effect complexity. It can slow lower-end devices.
            </div>
            <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <span>
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable background motion</span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Keep the selected background visible, but freeze canvas and background DOM animation.</span>
                </span>
                <Switch :model-value="motionDisabled" class="mt-1" aria-label="Disable background motion" :disabled="saving || disabled" @change="updateMotionDisabled" />
            </label>
            <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <span>
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable procedural background</span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Remove canvas, grids, trace streams and procedural layers from the workspace.</span>
                </span>
                <Switch :model-value="backgroundDisabled" class="mt-1" aria-label="Disable procedural background" :disabled="saving || disabled" @change="updateBackgroundDisabled" />
            </label>
        </div>

        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
            <span>Theme motion</span>
            <Select :model-value="motionMode" aria-label="Theme motion" :disabled="disabled" @update:model-value="updateMotionMode($event as TalosThemeMotionMode)">
                <option v-for="mode in TALOS_THEME_MOTION_OPTIONS" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
            </Select>
        </label>
        <div class="grid gap-2 md:grid-cols-2">
            <article v-for="mode in TALOS_THEME_MOTION_OPTIONS" :key="mode.value" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="text-sm font-semibold text-[var(--talos-text)]">{{ mode.label }}</div>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ mode.description }}</p>
            </article>
        </div>
    </section>
</template>
