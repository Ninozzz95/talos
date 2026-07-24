import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

/**
 * SF-7 / SF5-4 — real modality behind every aria-modal surface: the app root
 * goes inert while at least one modal is open (ref-counted so overlapping
 * surfaces never strip it early), Tab wraps inside the surface, and focus
 * returns to the opener on close.
 *
 * R1-SF-B1 — `active` option for surfaces whose HOST component is always
 * mounted (v-if only on the surface markup): modality then follows the open
 * STATE, not the component lifecycle. Without it, an always-mounted host
 * inerted #app with no modal visible — the whole app went dead to taps.
 */
let inertHolders = 0

function acquireInert(): void {
    inertHolders += 1
    if (inertHolders === 1) document.getElementById('app')?.setAttribute('inert', '')
}

function releaseInert(): void {
    inertHolders = Math.max(0, inertHolders - 1)
    if (inertHolders === 0) document.getElementById('app')?.removeAttribute('inert')
}

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useTalosModalSurface(
    root: Ref<HTMLElement | null>,
    options?: { active?: Ref<boolean> },
): {
    trapTab: (event: KeyboardEvent) => void
} {
    let opener: HTMLElement | null = null
    let holding = false

    function engage(): void {
        if (holding) return
        holding = true
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        acquireInert()
        // Focus now when the surface is already in the DOM (mount-mode);
        // state-driven surfaces may render their markup on this very tick.
        if (root.value) root.value.focus()
        else void nextTick(() => root.value?.focus())
    }

    function disengage(): void {
        if (!holding) return
        holding = false
        releaseInert()
        opener?.focus?.()
    }

    if (options?.active) {
        const active = options.active
        watch(active, (value) => { if (value) engage(); else disengage() })
        onMounted(() => { if (active.value) engage() })
    } else {
        onMounted(engage)
    }

    onBeforeUnmount(disengage)

    function trapTab(event: KeyboardEvent): void {
        if (event.key !== 'Tab' || !root.value) return
        const focusables = [...root.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (!event.shiftKey && (active === last || !root.value.contains(active))) {
            event.preventDefault()
            first.focus()
        } else if (event.shiftKey && (active === first || !root.value.contains(active))) {
            event.preventDefault()
            last.focus()
        }
    }

    return { trapTab }
}
