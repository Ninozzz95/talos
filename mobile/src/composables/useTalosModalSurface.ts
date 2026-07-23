import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/**
 * SF-7 / SF5-4 — real modality behind every aria-modal surface: the app root
 * goes inert while at least one modal is open (ref-counted so overlapping
 * surfaces never strip it early), Tab wraps inside the surface, and focus
 * returns to the opener on close.
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

export function useTalosModalSurface(root: Ref<HTMLElement | null>): {
    trapTab: (event: KeyboardEvent) => void
} {
    let opener: HTMLElement | null = null

    onMounted(() => {
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        acquireInert()
        root.value?.focus()
    })

    onBeforeUnmount(() => {
        releaseInert()
        opener?.focus?.()
    })

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
