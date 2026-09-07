<script setup lang="ts">
import { ArrowLeft, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, useAttrs } from 'vue'
import Button from '../../ui/Button.vue'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
} from '../../ui/drawer'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '../../ui/dialog'
import type { TalosMobileWindowPresentation } from '../../../lib/talosTypes'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
    id: string
    title: string
    description?: string
    presentation?: TalosMobileWindowPresentation
    returnFocusLabels?: string[]
}>(), {
    presentation: 'drawer',
    returnFocusLabels: () => [],
})

const emit = defineEmits<{
    close: [id: string]
}>()

const attrs = useAttrs()
const open = ref(true)
const closeRequested = ref(false)
const closeEmitted = ref(false)
const focusRestoreStarted = ref(false)
const backButton = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const activePresentation = props.presentation
const returnFocusTarget = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
const isDrawer = computed(() => activePresentation === 'drawer')
const surface = computed(() => isDrawer.value ? {
    root: Drawer,
    content: DrawerContent,
    title: DrawerTitle,
    description: DrawerDescription,
    testId: 'talos-mobile-tool-drawer',
    upstream: 'shadcn-vue-reka-drawer',
} : {
    root: Dialog,
    content: DialogContent,
    title: DialogTitle,
    description: DialogDescription,
    testId: 'talos-mobile-tool-fullscreen',
    upstream: 'shadcn-vue-dialog',
})
const rootProps = computed(() => isDrawer.value ? {
    open: open.value,
    modal: true,
} : {
    open: open.value,
    modal: true,
})
const contentProps = computed(() => isDrawer.value ? {} : {
    showClose: false,
})
const surfaceClass = computed(() => isDrawer.value
    ? 'z-[70] h-[min(88dvh,900px)] max-h-[calc(100dvh-env(safe-area-inset-top))] gap-0 overflow-hidden rounded-t-md border-[var(--talos-border)] bg-[var(--talos-window-bg)] p-0 text-[var(--talos-text)]'
    : 'inset-0 left-0 top-0 z-[70] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-[var(--talos-window-bg)] p-0 text-[var(--talos-text)] sm:rounded-none')

function closeSurface() {
    if (!open.value || closeRequested.value) return
    closeRequested.value = true
    open.value = false
    scheduleCloseFallback()
}

function updateOpen(next: boolean) {
    open.value = next
    if (next) {
        closeRequested.value = false
        closeEmitted.value = false
        return
    }

    closeRequested.value = true
    scheduleCloseFallback()
}

const disposed = ref(false)

function scheduleCloseFallback() {
    window.setTimeout(completeClose, 450)
}

function completeClose() {
    if (disposed.value || !closeRequested.value || closeEmitted.value) return
    closeEmitted.value = true
    emit('close', props.id)
}

function completeOpenTransition(next: boolean) {
    if (!next && isDrawer.value) void nextTick(completeClose)
}

function completeLeaveTransition(event: Event) {
    // Only the surface's own leave transition completes the close. A raw
    // presence after-leave (which jsdom/reduced-motion can fire before any
    // real transition) must never emit close early; a bubbled child transition
    // (target !== the surface) must not either.
    if (!closeRequested.value || event.target !== event.currentTarget) return
    completeClose()
}

function focusPrimaryControl(event: Event) {
    event.preventDefault()
    void nextTick(() => {
        const candidate = backButton.value
        const element = candidate instanceof HTMLElement ? candidate : candidate?.$el
        element?.focus()
    })
}

function restoreLauncherFocus(event?: Event) {
    event?.preventDefault()
    if (focusRestoreStarted.value) return
    focusRestoreStarted.value = true

    if (typeof document === 'undefined') return
    void nextTick(() => {
        if (isVisibleFocusTarget(returnFocusTarget)) {
            returnFocusTarget.focus()
            return
        }

        const candidates = Array.from(document.querySelectorAll<HTMLElement>(
            'button[aria-label], [role="button"][aria-label]',
        ))
        const fallback = props.returnFocusLabels
            .map((label) => candidates.find((candidate) => candidate.getAttribute('aria-label') === label
                && isVisibleFocusTarget(candidate)))
            .find((candidate): candidate is HTMLElement => Boolean(candidate))
        fallback?.focus()
    })
}

function isVisibleFocusTarget(element: HTMLElement | null): element is HTMLElement {
    if (!element?.isConnected || element.hasAttribute('disabled') || element.closest('[hidden]')) return false

    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false

    const browserHasLayout = document.documentElement.getClientRects().length > 0
    return !browserHasLayout || element.getClientRects().length > 0
}

onBeforeUnmount(() => {
    disposed.value = true
    restoreLauncherFocus()
})
</script>

<template>
    <component
        :is="surface.root"
        v-bind="rootProps"
        @update:open="updateOpen"
        @update:open-complete="completeOpenTransition"
    >
        <component
            :is="surface.content"
            v-bind="{ ...contentProps, ...attrs }"
            :class="surfaceClass"
            data-testid="talos-mobile-tool-sheet"
            aria-modal="true"
            :data-talos-surface="surface.testId"
            :data-window-id="id"
            :data-window-presentation="activePresentation"
            :data-talos-upstream="surface.upstream"
            @open-auto-focus="focusPrimaryControl"
            @close-auto-focus="restoreLauncherFocus"
            @transitionend="completeLeaveTransition"
        >
            <div id="talos-mobile-tooltip-root" class="pointer-events-none absolute inset-0 z-[120]"></div>
            <header class="flex shrink-0 items-center gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-header)] px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                <Button ref="backButton" type="button" variant="ghost" size="icon" aria-label="Back to chat" @click="closeSurface">
                    <ArrowLeft class="h-4 w-4" aria-hidden="true" />
                </Button>
                <div class="min-w-0 flex-1">
                    <component :is="surface.title" class="truncate text-sm font-semibold tracking-normal text-[var(--talos-text)]">
                        {{ title }}
                    </component>
                    <component
                        :is="surface.description"
                        class="truncate text-[11px] text-[var(--talos-muted)]"
                    >
                        {{ description || `${title} workspace tools.` }}
                    </component>
                </div>
                <Button type="button" variant="ghost" size="icon" :aria-label="`Close ${title}`" @click="closeSurface">
                    <X class="h-4 w-4" aria-hidden="true" />
                </Button>
            </header>
            <div
                data-testid="talos-mobile-sheet-body"
                class="talos-mobile-sheet-body min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
                <slot />
            </div>
        </component>
    </component>
</template>
