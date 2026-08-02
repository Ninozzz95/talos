<script setup lang="ts">
/**
 * The one tab strip.
 *
 * Before this the app drew "choose one of these views" five different ways:
 * a filled box in Doctor, an underline in Model Lab, an outlined chip in
 * Appearance, pills carrying aria-pressed in Library and the media panel, and a
 * vertical tablist in the settings centre that on a phone hides its own list —
 * which is not a tab strip at all, it is navigation wearing one. Three of the
 * five already used Reka's TabsRoot, so the markup was never the problem: the
 * problem was that each screen decided the grammar again.
 *
 * This component takes the decision away from the screen and reads it from the
 * register (`lib/navigation/viewRegistry`). From one declaration it gets the
 * views, their order, their names, the default, and whether activation may be
 * automatic — which the APG allows only where a panel can be shown instantly,
 * and Model Lab's cannot because it probes the local engine when it mounts.
 *
 * It also remembers. Not because remembering is a feature, but because the
 * Library had to be taught it separately once already, after someone noticed it
 * "just never survived a reopen". Storage is passed in rather than reached for,
 * so the memory is testable and a caller that does not want it simply does not
 * pass it.
 *
 * The visible treatment is the underline: M3's secondary tabs, which is what
 * fits a strip that lives inside a page rather than at its root.
 */
import { computed, watch } from 'vue'
import { TabsIndicator, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { useTalosI18n } from '@/i18n'
import {
    talosResolveView,
    talosViewExists,
    talosViewSurfaceOf,
} from '@/lib/navigation/viewRegistry'

const props = defineProps<{
    /** Which surface in the register this strip is showing. */
    surface: string
    /** The chosen view. Controlled: the parent owns it, as with the shared switch. */
    modelValue: string
    /** Names the strip for a screen reader. The surface, not the current view. */
    ariaLabel?: string
    /**
     * Layout for the list only — sticky offsets, the bleed a screen needs to
     * reach its own padding. The grammar is not negotiable; where the strip
     * sits on the page is the screen's business.
     */
    listClass?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useTalosI18n()

const surface = computed(() => talosViewSurfaceOf(props.surface))
const views = computed(() => surface.value?.views ?? [])

/**
 * A surface can only be shown as tabs if it declared itself as tabs. Navigation
 * and filters are different controls with different semantics, and rendering
 * them through a tablist is exactly the mistake the settings centre makes today.
 */
const renders = computed(() => surface.value?.grammar === 'tabs' && views.value.length > 1)

const activation = computed(() => surface.value?.activation ?? 'manual')

/**
 * Never hand Reka a value that is not one of its triggers: it would render the
 * strip with nothing selected and no panel at all. A view can disappear in a
 * release while a device still holds its name, so the value is resolved rather
 * than trusted, and the parent is told when the resolution changed it.
 */
const selected = computed(() => talosResolveView(props.surface, props.modelValue) ?? '')

watch(selected, (value) => {
    if (value && value !== props.modelValue) emit('update:modelValue', value)
}, { immediate: true })

function choose(value: unknown): void {
    if (typeof value !== 'string') return
    if (!talosViewExists(props.surface, value)) return
    emit('update:modelValue', value)
}

/**
 * Swipe left and right to step through the views — owner, 2026-07-24, "like
 * ChatGPT tabs". It lived in the Appearance panel alone; now that the register
 * knows the order of every surface, stepping through it is four lines that work
 * everywhere rather than four lines each screen has to write again.
 *
 * A swipe is a path-based gesture, and WCAG 2.5.1 asks that anything driven by
 * one also work from a single pointer without a path. It does: the tabs above
 * are still there, still tappable, still reachable by keyboard. The gesture is
 * a shortcut, never the only way in. (Checked against what I know of the
 * criterion rather than a fresh source — this session's web-search budget is
 * spent, and I would rather say so than imply I re-read it.)
 */
const SWIPE_MIN_PX = 56
const SWIPE_HORIZONTAL_RATIO = 1.5

let swipeX: number | null = null
let swipeY: number | null = null

/**
 * A swipe that starts inside something that scrolls sideways belongs to that
 * thing. The tab strip itself is the common case — it is `overflow-x-auto`, so
 * dragging it to see a hidden tab would otherwise also change the tab — and the
 * catalogue's chip rows are the other. This is not a defect the Appearance
 * version could show, because nothing in Appearance scrolls sideways; it is one
 * the other two surfaces would have inherited the moment they got the gesture.
 */
function startsInsideASideScroller(target: EventTarget | null, root: EventTarget | null): boolean {
    let node = target instanceof Element ? target : null
    while (node && node !== root) {
        if (node.scrollWidth > node.clientWidth + 1) return true
        node = node.parentElement
    }
    return false
}

function onSwipeStart(event: PointerEvent): void {
    if (startsInsideASideScroller(event.target, event.currentTarget)) {
        onSwipeCancel()
        return
    }
    swipeX = event.clientX
    swipeY = event.clientY
}

/** A pointer that leaves the element, or is taken over by a scroll, is not a swipe. */
function onSwipeCancel(): void {
    swipeX = null
    swipeY = null
}

function onSwipeEnd(event: PointerEvent): void {
    if (swipeX === null || swipeY === null) return
    const dx = event.clientX - swipeX
    const dy = event.clientY - swipeY
    onSwipeCancel()

    // Short drags are taps with a shaky hand, and a mostly-vertical drag is
    // someone scrolling the panel. Neither should move the selection.
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) return

    const order = views.value
    const index = order.findIndex((view) => view.id === selected.value)
    if (index === -1) return
    // Clamped rather than wrapped: on the last view a further swipe left should
    // feel like the end of the strip, not like jumping back to the first.
    const next = order[dx < 0 ? Math.min(order.length - 1, index + 1) : Math.max(0, index - 1)]
    if (next && next.id !== selected.value) emit('update:modelValue', next.id)
}
</script>

<template>
    <TabsRoot
        v-if="renders"
        :data-talos-tabs="surface"
        :model-value="selected"
        :activation-mode="activation"
        @update:model-value="choose"
        @pointerdown="onSwipeStart"
        @pointerup="onSwipeEnd"
        @pointercancel="onSwipeCancel"
    >
        <TabsList
            :aria-label="ariaLabel"
            class="relative flex w-full items-stretch gap-1 overflow-x-auto border-b border-[var(--talos-border)]"
            :class="listClass"
        >
            <TabsTrigger
                v-for="view in views"
                :key="view.id"
                :value="view.id"
                :data-talos-tab="view.id"
                class="relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-3 text-sm font-medium text-[var(--talos-muted)] outline-none transition-colors data-[state=active]:text-[var(--talos-text)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-inset"
            >
                <!-- Leading chrome only — Model Lab puts a key, a box and a
                     chip beside its three names. The label itself is never
                     handed out: it is the tab's accessible name, and a screen
                     that could replace it could quietly remove it. -->
                <slot name="tab-leading" :view="view" />
                {{ t(view.labelKey) }}
            </TabsTrigger>
            <!-- The underline follows the selection instead of each trigger
                 drawing its own, so a tab cannot disagree with the indicator. -->
            <TabsIndicator
                class="absolute bottom-0 left-0 h-0.5 w-[var(--reka-tabs-indicator-size)] translate-x-[var(--reka-tabs-indicator-position)] rounded-full bg-[var(--talos-accent)] transition-[width,transform] duration-200"
            />
        </TabsList>
        <slot :view="selected" />
    </TabsRoot>
</template>
