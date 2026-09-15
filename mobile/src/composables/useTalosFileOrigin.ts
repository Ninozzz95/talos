import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { talosFileOriginCard, type TalosFileOriginCard } from '@/lib/files/originCard'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * The origin card for a file, built the same way on every surface.
 *
 * Two screens show a file full screen — the Library and a chat's own gallery —
 * and the owner has twice found them drifting apart. The viewer itself is
 * already written once for that reason; this is the other half, so the CARD
 * cannot say one thing in one place and something else in the other.
 *
 * The chat title is resolved from the complete session list rather than the
 * history: a chat with nothing in it is absent from the history by design, and
 * a file can still name it. Absence there is not evidence the chat is gone.
 */
export function useTalosFileOrigin(): {
    cardFor(file: TalosLocalVaultFile | null): TalosFileOriginCard | null
} {
    const { t, locale } = useTalosI18n()
    const controller = useChatController()

    function cardFor(file: TalosLocalVaultFile | null): TalosFileOriginCard | null {
        if (!file) return null
        const metadata = file.metadata as { provenance?: unknown; origin_session_id?: string | null }
        const sessionId = metadata.origin_session_id ?? null
        const title = sessionId
            ? controller.chat.sessions.find((session) => session.id === sessionId)?.title ?? null
            : null
        return talosFileOriginCard({
            provenance: metadata.provenance,
            originSessionTitle: title,
            translate: t,
            locale: locale.value,
        })
    }

    return { cardFor }
}
