<script setup lang="ts">
/**
 * The one discrete segmented slider for TALOS.
 *
 * TALOS already ships `reka-ui` and uses its primitives for the shared switch,
 * select and filter controls. This component follows the same grammar instead
 * of hand-rolling pointer capture or keyboard behavior. Reka owns drag, touch,
 * track taps, Arrow keys, Home/End, RTL and the WAI-ARIA slider semantics;
 * TALOS owns only theme tokens and the mapping from an ordered string ladder to
 * a discrete numeric scale.
 *
 * Controlled, like TalosThemedSwitch: `modelValue` is authoritative. The
 * component reports intent and never commits product state on its own.
 */
import { computed } from 'vue'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'

type TalosSegmentedSliderOption = Readonly<{
    value: string
    label: string
    /** Preserve selectors owned by the component being replaced. */
    testId?: string
}>

const props = withDefaults(defineProps<{
    modelValue: string
    options: readonly TalosSegmentedSliderOption[]
    /** Stable accessible name; the current choice is exposed via aria-valuetext. */
    ariaLabel: string
    testId?: string
    disabled?: boolean
}>(), {
    testId: 'talos-themed-segmented-slider',
    disabled: false,
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
}>()

/**
 * Empty and duplicate values cannot form an unambiguous scale. Keep the first
 * occurrence so the caller remains the owner of canonical order.
 */
const normalizedOptions = computed<TalosSegmentedSliderOption[]>(() => {
    const seen = new Set<string>()
    return props.options.filter((option) => {
        if (!option.value || seen.has(option.value)) return false
        seen.add(option.value)
        return true
    })
})

const maximumIndex = computed(() => Math.max(0, normalizedOptions.value.length - 1))
// Reka computes the thumb percentage from (max - min). Keep a non-zero
// disabled range for the one-option case so jsdom and browsers never receive
// `calc(NaN% + ...)` while the control remains visibly inert.
const sliderMaximum = computed(() => Math.max(1, maximumIndex.value))
const selectedIndex = computed(() => {
    const found = normalizedOptions.value.findIndex((option) => option.value === props.modelValue)
    return found >= 0 ? found : 0
})
const selectedOption = computed(() => normalizedOptions.value[selectedIndex.value] ?? null)
const sliderValue = computed<number[]>(() => [selectedIndex.value])
const effectivelyDisabled = computed(() => props.disabled || normalizedOptions.value.length <= 1)

function markerPosition(index: number): string {
    const intervals = Math.max(1, normalizedOptions.value.length - 1)
    return `${(index / intervals) * 100}%`
}

/**
 * Four or five words fit on a phone. Some providers expose seven effort values;
 * in that case every stop stays visible but only the current value and distant
 * endpoints are named. The full current label remains visible above the rail.
 */
function labelIsVisible(index: number): boolean {
    const count = normalizedOptions.value.length
    const last = count - 1
    if (count <= 5 || index === selectedIndex.value) return true
    if (index === 0) return selectedIndex.value >= 2
    if (index === last) return selectedIndex.value <= last - 2
    return false
}

function onSliderValue(values: number[] | undefined): void {
    const raw = values?.[0]
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return
    const index = Math.min(maximumIndex.value, Math.max(0, Math.round(raw)))
    const option = normalizedOptions.value[index]
    if (option && option.value !== props.modelValue) emit('update:modelValue', option.value)
}
</script>

<template>
    <div
        :data-testid="testId"
        class="talos-segmented-slider"
        :class="{ 'talos-segmented-slider--disabled': effectivelyDisabled }"
        :data-value="selectedOption?.value ?? ''"
        :data-index="selectedIndex"
    >
        <div class="talos-segmented-slider__surface">
            <SliderRoot
                :model-value="sliderValue"
                :min="0"
                :max="sliderMaximum"
                :step="1"
                :disabled="effectivelyDisabled"
                orientation="horizontal"
                thumb-alignment="overflow"
                class="talos-segmented-slider__root"
                @update:model-value="onSliderValue"
            >
                <SliderTrack class="talos-segmented-slider__track">
                    <SliderRange class="talos-segmented-slider__range" />
                    <span
                        v-for="(option, index) in normalizedOptions"
                        :key="option.value"
                        class="talos-segmented-slider__marker"
                        :class="{
                            'talos-segmented-slider__marker--filled': index <= selectedIndex,
                            'talos-segmented-slider__marker--current': index === selectedIndex,
                        }"
                        :style="{ left: markerPosition(index) }"
                        aria-hidden="true"
                    />
                </SliderTrack>

                <!-- One true slider thumb, one focus stop, no disguised buttons. -->
                <SliderThumb
                    :data-testid="`${testId}-thumb`"
                    class="talos-segmented-slider__thumb"
                    :aria-label="ariaLabel"
                    :aria-valuetext="selectedOption?.label ?? ''"
                >
                    <i aria-hidden="true" />
                </SliderThumb>
            </SliderRoot>

            <!-- Visual scale only; SliderThumb is the sole interactive node. -->
            <div class="talos-segmented-slider__labels" aria-hidden="true">
                <span
                    v-for="(option, index) in normalizedOptions"
                    :key="option.value"
                    :data-testid="option.testId"
                    :data-talos-filter-option="option.value"
                    :data-selected="index === selectedIndex ? 'true' : 'false'"
                    :data-label-visible="labelIsVisible(index) ? 'true' : 'false'"
                    :data-edge="index === 0 ? 'start' : (index === maximumIndex ? 'end' : 'middle')"
                    :style="{ left: markerPosition(index) }"
                    class="talos-segmented-slider__label"
                >
                    <span v-if="labelIsVisible(index)">{{ option.label }}</span>
                </span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.talos-segmented-slider {
    --talos-segmented-slider-border: var(--talos-border, var(--border));
    --talos-segmented-slider-panel: var(--talos-panel, var(--card));
    --talos-segmented-slider-muted: var(--talos-muted, var(--muted-foreground));
    --talos-segmented-slider-accent: var(--talos-accent, var(--primary));
    --talos-segmented-slider-ring: var(--talos-ring, var(--ring));
    min-width: 0;
}

.talos-segmented-slider__surface {
    min-width: 0;
    border: 1px solid var(--talos-segmented-slider-border);
    border-radius: var(--talos-radius-card, 1rem);
    background: var(--talos-segmented-slider-panel);
    padding: 0.625rem 0.75rem 0.5rem;
    transition:
        border-color var(--talos-motion-duration-fast, 160ms) ease,
        box-shadow var(--talos-motion-duration-fast, 160ms) ease;
}

.talos-segmented-slider:focus-within .talos-segmented-slider__surface {
    border-color: var(--talos-segmented-slider-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--talos-segmented-slider-ring) 42%, transparent);
}

.talos-segmented-slider__root {
    position: relative;
    display: flex;
    height: var(--talos-touch-target, 3rem);
    min-width: 0;
    align-items: center;
    margin-inline: 0.875rem;
    touch-action: none;
    user-select: none;
}

.talos-segmented-slider__track {
    position: relative;
    flex: 1 1 auto;
    height: 0.1875rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--talos-segmented-slider-muted) 28%, transparent);
}

.talos-segmented-slider__range {
    position: absolute;
    height: 100%;
    border-radius: inherit;
    background: var(--talos-segmented-slider-accent);
    box-shadow: 0 0 0.75rem color-mix(in srgb, var(--talos-segmented-slider-accent) 38%, transparent);
}

.talos-segmented-slider__marker {
    position: absolute;
    z-index: 1;
    top: 50%;
    width: 0.5rem;
    height: 0.5rem;
    border: 1px solid var(--talos-segmented-slider-border);
    border-radius: 999px;
    background: var(--talos-segmented-slider-panel);
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition:
        width var(--talos-motion-duration-fast, 160ms) ease,
        height var(--talos-motion-duration-fast, 160ms) ease,
        border-color var(--talos-motion-duration-fast, 160ms) ease,
        background var(--talos-motion-duration-fast, 160ms) ease;
}

.talos-segmented-slider__marker--filled {
    border-color: var(--talos-segmented-slider-accent);
    background: var(--talos-segmented-slider-accent);
}

.talos-segmented-slider__marker--current {
    width: 0.6875rem;
    height: 0.6875rem;
}

.talos-segmented-slider__thumb {
    position: relative;
    z-index: 2;
    display: grid;
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--talos-segmented-slider-accent) 78%, white 22%);
    border-radius: 999px;
    background:
        linear-gradient(145deg,
            color-mix(in srgb, var(--talos-segmented-slider-accent) 62%, white 38%),
            var(--talos-segmented-slider-accent));
    box-shadow:
        0 0.25rem 0.75rem color-mix(in srgb, black 34%, transparent),
        0 0 1rem color-mix(in srgb, var(--talos-segmented-slider-accent) 42%, transparent);
    outline: none;
    cursor: grab;
    transition:
        width var(--talos-motion-duration-fast, 160ms) ease,
        height var(--talos-motion-duration-fast, 160ms) ease,
        box-shadow var(--talos-motion-duration-fast, 160ms) ease;
}

/*
 * The visible thumb remains compact, while this transparent extension makes
 * its pointer target 44px without changing the coordinate Reka uses.
 */
.talos-segmented-slider__thumb::before {
    position: absolute;
    inset: -0.5rem;
    border-radius: inherit;
    content: "";
}

.talos-segmented-slider__thumb:hover {
    width: 1.875rem;
    height: 1.875rem;
}

.talos-segmented-slider__thumb:active {
    width: 2rem;
    height: 2rem;
    cursor: grabbing;
}

.talos-segmented-slider__thumb:focus-visible {
    box-shadow:
        0 0 0 3px var(--talos-segmented-slider-panel),
        0 0 0 5px var(--talos-segmented-slider-ring),
        0 0 1rem color-mix(in srgb, var(--talos-segmented-slider-accent) 42%, transparent);
}

.talos-segmented-slider__thumb i {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: inherit;
    background: color-mix(in srgb, white 76%, var(--talos-segmented-slider-accent));
    box-shadow: 0 0 0.45rem color-mix(in srgb, white 48%, transparent);
}

.talos-segmented-slider__labels {
    position: relative;
    height: 1.5rem;
    min-width: 0;
    margin: 0.125rem 0.875rem 0;
}

.talos-segmented-slider__label {
    position: absolute;
    top: 0;
    max-width: 30%;
    overflow: hidden;
    color: var(--talos-segmented-slider-muted);
    font-size: var(--text-2xs);
    font-weight: 560;
    line-height: 1rem;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    transform: translateX(-50%);
    transition: color var(--talos-motion-duration-fast, 160ms) ease;
}

.talos-segmented-slider__label[data-edge="start"] {
    transform: none;
    text-align: start;
}

.talos-segmented-slider__label[data-edge="end"] {
    transform: translateX(-100%);
    text-align: end;
}

.talos-segmented-slider__label[data-selected="true"] {
    color: var(--talos-segmented-slider-accent);
    font-weight: 700;
}

.talos-segmented-slider--disabled {
    opacity: 0.62;
}

.talos-segmented-slider--disabled .talos-segmented-slider__thumb {
    cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
    .talos-segmented-slider__surface,
    .talos-segmented-slider__marker,
    .talos-segmented-slider__thumb,
    .talos-segmented-slider__label {
        transition: none;
    }
}

@media (forced-colors: active) {
    .talos-segmented-slider__surface {
        border-color: CanvasText;
        background: Canvas;
        forced-color-adjust: auto;
    }

    .talos-segmented-slider__track,
    .talos-segmented-slider__marker {
        border-color: CanvasText;
        background: CanvasText;
    }

    .talos-segmented-slider__range,
    .talos-segmented-slider__marker--filled,
    .talos-segmented-slider__thumb {
        border-color: Highlight;
        background: Highlight;
        box-shadow: none;
    }

    .talos-segmented-slider__thumb:focus-visible {
        outline: 2px solid Highlight;
        outline-offset: 2px;
    }

    .talos-segmented-slider__label[data-selected="true"] {
        color: Highlight;
    }
}
</style>
