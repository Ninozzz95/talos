import { onScopeDispose } from 'vue'

/**
 * Owner 2026-07-24 — a LIFO registry of "close" handlers for the top-most
 * overlay surfaces (the composer bottom-sheets: the "+" tool drawer, the
 * model/effort drawer, the enhancer). The Android system-Back handler in
 * App.vue consults this so Back CLOSES the open drawer instead of exiting the
 * app. Module-scoped so the deep-in-the-tree composer doesn't have to
 * prop-drill its open state up to the shell.
 */
interface OverlayEntry {
    close: () => void
    /** Optional: an always-mounted host registers once and reports when its
     *  overlay is actually open (product review 2026-07-25 — the Library preview). */
    isActive?: () => boolean
}

const stack: OverlayEntry[] = []

export function useTalosOverlayBack(close: () => void, isActive?: () => boolean): void {
    const entry: OverlayEntry = { close, isActive }
    stack.push(entry)
    onScopeDispose(() => {
        const index = stack.lastIndexOf(entry)
        if (index >= 0) stack.splice(index, 1)
    })
}

function topActive(): OverlayEntry | null {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
        const entry = stack[index]!
        if (!entry.isActive || entry.isActive()) return entry
    }
    return null
}

export function talosOverlayBackActive(): boolean {
    return topActive() !== null
}

export function handleTalosOverlayBack(): boolean {
    const top = topActive()
    if (!top) return false
    top.close()
    return true
}

/** Test-only: clear the registry between tests. */
export function __resetTalosOverlayBackForTests(): void {
    stack.length = 0
}
