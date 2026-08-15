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
import { computed, ref, watch } from 'vue'
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

/**
 * Named `surfaceEntry`, not `surface`. In `<script setup>` a binding shadows a
 * prop of the same name inside the template, so `:data-talos-tabs="surface"`
 * was stamping "[object Object]" on every strip in the app — found on the
 * device, and it also meant the end-to-end selector written against that hook
 * could never have matched anything.
 */
const surfaceEntry = computed(() => talosViewSurfaceOf(props.surface))
const views = computed(() => surfaceEntry.value?.views ?? [])

/**
 * A surface can only be shown as tabs if it declared itself as tabs. Navigation
 * and filters are different controls with different semantics, and rendering
 * them through a tablist is exactly the mistake the settings centre makes today.
 */
const renders = computed(() => surfaceEntry.value?.grammar === 'tabs' && views.value.length > 1)

const activation = computed(() => surfaceEntry.value?.activation ?? 'manual')

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

/**
 * Which way the panel should arrive from: 1 going forward through the
 * register's order, -1 going back.
 *
 * Owner 2026-08-02, on the device: the change was "uno scatto di un frame".
 * Half of that was magnitude, fixed in the motion engine. The other half is
 * this: with no direction, swiping left and swiping right looked identical,
 * which reads as nothing happening at all once the movement is visible.
 *
 * The watcher's default `pre` flush matters — the variable has to be on the
 * element before the panel is marked active, or the first change animates the
 * wrong way round.
 */
const direction = ref(1)

watch(selected, (next, previous) => {
    if (!previous || next === previous) return
    const order = views.value
    const to = order.findIndex((view) => view.id === next)
    const from = order.findIndex((view) => view.id === previous)
    if (to === -1 || from === -1) return
    direction.value = to > from ? 1 : -1
})

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

/**
 * The strip does not compete with Android for the edges.
 *
 * Gesture navigation reserves a band down each side of the screen for Back —
 * 20dp by default, and more when the user raises back sensitivity. A horizontal
 * drag that starts in there belongs to the system: the WebView usually never
 * sees it, and when it does the gesture has already been half-consumed. Trying
 * to take it back is possible (`setSystemGestureExclusionRects`) and wrong —
 * stealing Back to change a tab is a bad trade in any app, let alone one asking
 * for trust with the whole phone.
 *
 * So the rule is to yield: a swipe that starts near an edge is not ours, and
 * the user gets the Back they were asking for. 24 CSS px covers the 20dp
 * default with a little room; someone on high sensitivity simply gets Back over
 * a wider band, which is the outcome we want anyway.
 */
const SYSTEM_GESTURE_EDGE_PX = 24

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
        // Overflowing is not the same as scrolling. This checked the widths
        // alone at first, and on the device that made a bordered box whose text
        // ran 10px past its padding "a horizontal scroller" — so the swipe died
        // anywhere near it. Only an element that can actually be scrolled
        // sideways has a claim on the gesture.
        if (node.scrollWidth > node.clientWidth + 1) {
            const overflowX = getComputedStyle(node).overflowX
            if (overflowX === 'auto' || overflowX === 'scroll') return true
        }
        node = node.parentElement
    }
    return false
}

function startsInTheSystemsBackGesture(clientX: number): boolean {
    const width = typeof window === 'undefined' ? 0 : window.innerWidth
    if (width <= SYSTEM_GESTURE_EDGE_PX * 2) return false
    return clientX <= SYSTEM_GESTURE_EDGE_PX || clientX >= width - SYSTEM_GESTURE_EDGE_PX
}

/**
 * Owner 2026-08-02: "quando scorro molto lentamente la schermata deve seguire
 * il tocco del dito".
 *
 * So this is direct manipulation, not a gesture that is merely detected at the
 * end. The panels move under the finger while the drag is happening, and only
 * settle when it is released — which is also what tells you, mid-drag, that the
 * app noticed and how far you still have to go.
 *
 * Two details that decide whether it feels right:
 *   - the drag only starts once the movement is clearly horizontal, so the
 *     first few pixels of a vertical scroll never nudge the panel sideways;
 *   - past the first and the last view there is nowhere to go, so the movement
 *     is damped instead of free. Following the finger 1:1 into nothing reads as
 *     a bug; resistance reads as an edge.
 */
const DRAG_START_PX = 8
const DRAG_EDGE_RESISTANCE = 0.32

const dragOffset = ref(0)
const dragging = ref(false)
/** Set while the release is settling back, so the spring-back can be animated. */
const settling = ref(false)

/**
 * Direct manipulation is the user's own finger rather than motion the app
 * decided on — but someone who has asked the system for less movement has asked
 * for less movement, and this is cheap to honour. They still get the change,
 * just without the panel travelling under them.
 */
function reducedMotionRequested(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function stepFrom(index: number, dx: number): number {
    return dx < 0 ? Math.min(views.value.length - 1, index + 1) : Math.max(0, index - 1)
}

function onSwipeStart(event: PointerEvent): void {
    if (
        startsInsideASideScroller(event.target, event.currentTarget)
        || startsInTheSystemsBackGesture(event.clientX)
    ) {
        onSwipeCancel()
        return
    }
    settling.value = false
    swipeX = event.clientX
    swipeY = event.clientY
}

function onSwipeMove(event: PointerEvent): void {
    if (swipeX === null || swipeY === null) return
    const dx = event.clientX - swipeX
    const dy = event.clientY - swipeY

    if (!dragging.value) {
        if (Math.abs(dx) < DRAG_START_PX) return
        // Mostly vertical: this was a scroll all along, and the panel should not
        // have moved at all.
        if (Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) {
            onSwipeCancel()
            return
        }
        dragging.value = true
    }
    if (reducedMotionRequested()) return

    const order = views.value
    const index = order.findIndex((view) => view.id === selected.value)
    const atEnd = index === -1 || stepFrom(index, dx) === index
    dragOffset.value = atEnd ? dx * DRAG_EDGE_RESISTANCE : dx
}

/** A pointer that leaves the element, or is taken over by a scroll, is not a swipe. */
function onSwipeCancel(): void {
    swipeX = null
    swipeY = null
    if (dragging.value) settleBack()
    dragging.value = false
}

/** Spring back to rest, animated, so "not far enough" is something you can see. */
function settleBack(): void {
    if (dragOffset.value === 0) return
    settling.value = true
    dragOffset.value = 0
}

function onSwipeEnd(event: PointerEvent): void {
    if (swipeX === null || swipeY === null) return
    const dx = event.clientX - swipeX
    const dy = event.clientY - swipeY
    swipeX = null
    swipeY = null
    const wasDragging = dragging.value
    dragging.value = false

    // Short drags are taps with a shaky hand, and a mostly-vertical drag is
    // someone scrolling the panel. Neither should move the selection.
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) {
        if (wasDragging) settleBack()
        return
    }

    const order = views.value
    const index = order.findIndex((view) => view.id === selected.value)
    if (index === -1) {
        settleBack()
        return
    }
    // Clamped rather than wrapped: on the last view a further swipe left should
    // feel like the end of the strip, not like jumping back to the first.
    const next = order[stepFrom(index, dx)]
    if (next && next.id !== selected.value) {
        // Released without a transition, because the panel underneath is being
        // replaced at this instant and the incoming one plays its own entrance.
        // Springing back AND animating in would be two motions arguing.
        settling.value = false
        dragOffset.value = 0
        emit('update:modelValue', next.id)
        return
    }
    settleBack()
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
        @pointermove="onSwipeMove"
        @pointerup="onSwipeEnd"
        @pointercancel="onSwipeCancel"
    >
        <TabsList
            :aria-label="ariaLabel"
            class="relative flex items-stretch gap-1 overflow-x-auto border-b border-[var(--talos-border)]"
            :class="listClass"
        >
            <!-- The press dip is Tailwind rather than `.talos-pressable`, which
                 Doctor's own tabs used: that class sets the whole `transition`
                 shorthand from outside Tailwind's layers, so it would win over
                 the colour transition and quietly take the fade with it. Same
                 feel, one cascade, and `motion-reduce` still switches it off. -->
            <TabsTrigger
                v-for="view in views"
                :key="view.id"
                :value="view.id"
                :data-talos-tab="view.id"
                class="relative inline-flex min-h-touch shrink-0 items-center justify-center gap-2 whitespace-nowrap px-3 text-sm font-medium text-[var(--talos-muted)] outline-none transition-[color,transform] duration-[var(--talos-motion-duration-control,160ms)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 data-[state=active]:text-[var(--talos-text)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-inset"
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
        <!-- `touch-pan-y` is what makes the swipe exist at all on a phone, and it
             took a device to find out. Chrome hands a touch drag to the
             compositor after the first move and fires `pointercancel`: the
             measured sequence was pointerdown → pointermove → pointercancel,
             with pointerup NEVER arriving. So the swipe was dead on Android —
             in this strip and in the hand-rolled one it replaced, since 2026-07-24.
             Declaring that this area pans vertically only tells Chrome not to
             take horizontal drags, and the full stream survives to pointerup.

             On the panels rather than on the root, deliberately: the strip
             itself is `overflow-x-auto`, and restricting it here would take away
             the drag that reaches a tab sitting off-screen. touch-action cannot
             be widened again by a descendant, so the boundary is the only place
             this choice can be made. -->
        <div
            class="min-w-0 touch-pan-y"
            :data-talos-tab-dragging="dragging ? 'true' : undefined"
            :style="{
                '--talos-tab-direction': direction,
                transform: dragOffset === 0 ? undefined : `translate3d(${dragOffset}px, 0, 0)`,
                // Only while settling. During the drag the panel is pinned to
                // the finger, and a transition there would make it lag behind.
                transition: settling
                    ? 'transform var(--talos-motion-duration-tab-change, 160ms) var(--talos-motion-ease-tab-change, ease-out)'
                    : undefined,
            }"
            @transitionend="settling = false"
        >
            <slot :view="selected" />
        </div>
    </TabsRoot>
</template>
