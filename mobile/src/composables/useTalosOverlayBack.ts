import { onScopeDispose } from 'vue'

/**
 * Owner 2026-07-24 — a LIFO registry of "close" handlers for the top-most
 * overlay surfaces (the composer bottom-sheets: the "+" tool drawer, the
 * model/effort drawer, the enhancer). The Android system-Back handler in
 * App.vue consults this so Back CLOSES the open drawer instead of exiting the
 * app. Module-scoped so the deep-in-the-tree composer doesn't have to
 * prop-drill its open state up to the shell.
 */
const stack: Array<() => void> = []

export function useTalosOverlayBack(close: () => void): void {
    stack.push(close)
    onScopeDispose(() => {
        const index = stack.lastIndexOf(close)
        if (index >= 0) stack.splice(index, 1)
    })
}

export function talosOverlayBackActive(): boolean {
    return stack.length > 0
}

export function handleTalosOverlayBack(): boolean {
    const top = stack[stack.length - 1]
    if (!top) return false
    top()
    return true
}

/** Test-only: clear the registry between tests. */
export function __resetTalosOverlayBackForTests(): void {
    stack.length = 0
}
