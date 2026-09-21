<script setup lang="ts">
import { ref } from 'vue'
import {
    TALOS_TABLET_SIDEBAR_DEFAULT,
    TALOS_TABLET_SIDEBAR_MAX,
    TALOS_TABLET_SIDEBAR_MIN,
    clampTalosTabletSidebarWidth,
} from '@/lib/tabletLayout'

/**
 * F6 — drag handle between the tablet chat panel and the chat content.
 * Split-view a11y contract (APG window splitter): role=separator (vertical)
 * with value now/min/max, arrows ±16px, Home/End to the bounds, Enter/double
 * tap restore the default. `resize` streams live widths during a gesture;
 * `commit` fires once at release — and only when something actually moved
 * (SF6-F12: a bare tap must not write settings). Double-tap is detected from
 * paired pointerups (SF6-F8: WKWebView never synthesizes dblclick from touch).
 * Hit area 33px (SF6-F4 vs F14 trade: reliably grabbable without stealing
 * deep edge taps from the panels), visual footprint 1px.
 */
const props = defineProps<{ width: number }>()

const emit = defineEmits<{
    resize: [width: number]
    commit: []
}>()

const KEY_STEP = 16
const DOUBLE_TAP_MS = 350

const dragging = ref(false)
let dragOriginX = 0
let dragOriginWidth = 0
let moved = false
let lastTapAt = 0

function onPointerDown(event: PointerEvent): void {
    dragging.value = true
    moved = false
    dragOriginX = event.clientX
    dragOriginWidth = props.width
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
    if (!dragging.value) return
    const next = clampTalosTabletSidebarWidth(dragOriginWidth + (event.clientX - dragOriginX))
    if (next === props.width && !moved) return
    moved = true
    emit('resize', next)
}

function onPointerEnd(): void {
    if (!dragging.value) return
    dragging.value = false
    if (moved) {
        emit('commit')
        lastTapAt = 0
        return
    }
    // Stationary tap: pair two of them into a reset (touch double-tap).
    const now = Date.now()
    if (now - lastTapAt <= DOUBLE_TAP_MS) {
        lastTapAt = 0
        onReset()
    } else {
        lastTapAt = now
    }
}

function onKeydown(event: KeyboardEvent): void {
    let next: number | null = null
    if (event.key === 'ArrowRight') next = clampTalosTabletSidebarWidth(props.width + KEY_STEP)
    else if (event.key === 'ArrowLeft') next = clampTalosTabletSidebarWidth(props.width - KEY_STEP)
    else if (event.key === 'Home') next = TALOS_TABLET_SIDEBAR_MIN
    else if (event.key === 'End') next = TALOS_TABLET_SIDEBAR_MAX
    else if (event.key === 'Enter') next = TALOS_TABLET_SIDEBAR_DEFAULT
    if (next === null) return
    event.preventDefault()
    emit('resize', next)
    emit('commit')
}

function onReset(): void {
    emit('resize', TALOS_TABLET_SIDEBAR_DEFAULT)
    emit('commit')
}
</script>

<template>
    <div
        role="separator"
        aria-orientation="vertical"
        :aria-label="$t('accessibility.resizeSidebar')"
        data-testid="talos-tablet-divider"
        tabindex="0"
        :aria-valuenow="props.width"
        :aria-valuemin="TALOS_TABLET_SIDEBAR_MIN"
        :aria-valuemax="TALOS_TABLET_SIDEBAR_MAX"
        class="group relative z-30 -mx-4 w-[33px] shrink-0 cursor-col-resize touch-none outline-none"
        :class="dragging ? 'select-none' : ''"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
        @keydown="onKeydown"
        @dblclick="onReset"
    >
        <span
            aria-hidden="true"
            class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--talos-border)] transition-colors group-hover:bg-[var(--talos-accent)] group-focus-visible:bg-[var(--talos-accent)]"
            :class="dragging ? 'bg-[var(--talos-accent)]' : ''"
        />
        <span
            aria-hidden="true"
            class="absolute left-1/2 top-1/2 h-10 w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--talos-border)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-visible:ring-2 group-focus-visible:ring-[var(--talos-ring,var(--talos-accent))]"
            :class="dragging ? 'opacity-100' : ''"
        />
    </div>
</template>
