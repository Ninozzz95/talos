import { ref, type Ref } from 'vue'

/**
 * F3-T4 — calm toast infrastructure (mobile). Singleton store: any surface can
 * push; the region in App renders them above the composer. A toast may carry
 * one action (e.g. the tone suggestion's "Switch") — acting dismisses it.
 * Toasts NEVER change state on their own beyond expiring: they inform, the
 * user decides.
 */
export interface TalosMobileToast {
    id: number
    message: string
    action?: { label: string; run: () => void }
    durationMs?: number
}

export interface TalosMobileToastsStore {
    items: Ref<readonly TalosMobileToast[]>
    push(toast: Omit<TalosMobileToast, 'id'>): number
    dismiss(id: number): void
    act(id: number): void
}

let singleton: TalosMobileToastsStore | null = null
let nextId = 1

export function useTalosMobileToasts(): TalosMobileToastsStore {
    if (singleton) return singleton
    const items = ref<TalosMobileToast[]>([])
    const timers = new Map<number, ReturnType<typeof setTimeout>>()

    function dismiss(id: number): void {
        items.value = items.value.filter((toast) => toast.id !== id)
        const timer = timers.get(id)
        if (timer) {
            clearTimeout(timer)
            timers.delete(id)
        }
    }

    singleton = {
        items,
        push(toast) {
            const id = nextId++
            items.value = [...items.value, { ...toast, id }]
            if (toast.durationMs && toast.durationMs > 0) {
                timers.set(id, setTimeout(() => dismiss(id), toast.durationMs))
            }
            return id
        },
        dismiss,
        act(id) {
            const toast = items.value.find((candidate) => candidate.id === id)
            toast?.action?.run()
            dismiss(id)
        },
    }
    return singleton
}

export function __resetToastsForTests(): void {
    singleton = null
    nextId = 1
}
