import { markRaw } from 'vue'
import TalosSonnerToastContent from '../components/ui/sonner/TalosSonnerToastContent.vue'

export type TalosToastTone = 'info' | 'success' | 'warning' | 'error'
export type TalosToastId = string | number

export interface TalosToastAction {
    label: string
    onClick: () => void
}

export interface TalosToastOptions {
    id?: string
    action?: TalosToastAction
}

export type TalosToastMethod = (message: string, options?: TalosToastOptions) => void

const content = markRaw(TalosSonnerToastContent)
let sonnerModule: Promise<typeof import('vue-sonner')> | null = null

// The vue-sonner runtime is loaded on first toast so it stays out of the
// initial static chunk. No caller consumes the toast id, so dispatch is
// fire-and-forget; queued toasts render once the Toaster region mounts.
function dispatch(tone: TalosToastTone, message: string, options?: TalosToastOptions): void {
    sonnerModule ??= import('vue-sonner')
    void sonnerModule.then(({ toast }) => {
        toast[tone](content, {
            id: options?.id,
            componentProps: { message, tone },
            action: options?.action
                ? { label: options.action.label, onClick: options.action.onClick }
                : undefined,
        })
    })
}

export function useTalosToast(): Record<TalosToastTone, TalosToastMethod> {
    return {
        info: (message, options) => dispatch('info', message, options),
        success: (message, options) => dispatch('success', message, options),
        warning: (message, options) => dispatch('warning', message, options),
        error: (message, options) => dispatch('error', message, options),
    }
}
