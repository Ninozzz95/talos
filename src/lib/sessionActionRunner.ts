import { ref, type Ref } from 'vue'
import type { TalosTranslate } from '@/i18n/contracts'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'

/**
 * F4-#22 — shared guard for session actions (new/select/rename/delete). The
 * call sites are fire-and-forget (`void runner.run(...)`), so a rejection must
 * never escape as an unhandled rejection: it surfaces as a toast carrying the
 * real error text instead. The busy flag guards re-entry and always resets.
 */
export interface TalosSessionActionToasts {
    push(toast: { message: string; durationMs?: number }): number
}

export interface TalosSessionActionRunner {
    busy: Ref<boolean>
    run(label: string, action: () => Promise<void>): Promise<void>
}

export function createSessionActionRunner(
    toasts: TalosSessionActionToasts,
    translate: TalosTranslate,
): TalosSessionActionRunner {
    const busy = ref(false)
    return {
        busy,
        async run(label, action) {
            if (busy.value) return
            busy.value = true
            try {
                await action()
            } catch (error) {
                const detail = talosTranslatableErrorMessage(error, translate)
                    ?? (error instanceof Error && error.message ? error.message : String(error))
                toasts.push({
                    message: translate('common.actionFailed', { action: label, detail }),
                    durationMs: 6000,
                })
            } finally {
                busy.value = false
            }
        },
    }
}
