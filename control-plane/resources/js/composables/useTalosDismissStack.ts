// LIFO dismissal registry for transient overlays (menus, popovers, palettes).
// Escape must close only the topmost surface, so each overlay registers a
// dismiss callback while open and unregisters on teardown. DOM-free by design:
// the single global keydown listener is wired by the workspace shell (R1),
// never by this module, so importing it can not change runtime behavior.

type TalosDismissEntry = {
    dismiss: () => void
}

const stack: TalosDismissEntry[] = []

export function registerTalosDismiss(dismiss: () => void): () => void {
    const entry: TalosDismissEntry = { dismiss }
    stack.push(entry)

    return () => {
        const index = stack.indexOf(entry)
        if (index !== -1) {
            stack.splice(index, 1)
        }
    }
}

export function dismissTopTalosOverlay(): boolean {
    const entry = stack.pop()
    if (!entry) {
        return false
    }

    entry.dismiss()
    return true
}

export function talosDismissStackSize(): number {
    return stack.length
}

export function resetTalosDismissStackForTests(): void {
    stack.length = 0
}
