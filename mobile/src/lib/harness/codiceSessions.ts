import { newTalosMobileId } from '@/lib/mobileIds'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import { productionChatRepository } from '@/repositories/productionChatRepositorySingleton'

/**
 * Codice (Harness) sessions — real, on-device rows in the SAME
 * `talos_chat_sessions` table Chat uses, tagged `metadata.codice === true`.
 * Replaces `harnessDemoSessions.ts`'s five hardcoded rows (28/8, owner:
 * the sidebar list must attach to real sessions, not a mockup).
 *
 * ⛔ Local-first: this reads/writes the on-device repository directly.
 * Nothing here reaches a network or a PC — see
 * [[mobile-app-local-first-requirement]], forgotten and re-stated 28/8.
 *
 * ⛔ Lives OUTSIDE `chatController.ts`/`useChatController()` on purpose:
 * `HarnessSessionScreen.vue` must never import that composable
 * (CODE-COMPOSER-SINGLE-SOURCE-01 asserts the string never appears in its
 * source — it mounts the shared chat composer directly, decoupled from the
 * full chat store). Both this module and `chatController.ts` import the
 * SAME `productionChatRepository` singleton, so there is still only one
 * on-device connection either way.
 *
 * ⛔ Deliberately NOT `chat.createSession()`/`chat.activeSession`: that
 * pointer is the ONE currently-open conversation Chat/browse mode share —
 * a Codice session created while a real chat is active would hijack it,
 * and the person would switch back to Chat to find the new, empty Codice
 * session staring back instead of what they were talking about. A Codice
 * session is addressed by its ROUTE id (HarnessScreen.vue/HarnessSessionScreen.vue),
 * the same way it already addressed the demo array it replaces — it never
 * needs a global "current" pointer.
 */

export async function listCodiceSessions(): Promise<TalosLocalChatSession[]> {
    const all = await productionChatRepository.listSessions()
    return all
        .filter((session) => session.metadata?.codice === true)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function findCodiceSession(sessionId: string): Promise<TalosLocalChatSession | null> {
    if (!sessionId) return null
    const sessions = await listCodiceSessions()
    return sessions.find((session) => session.id === sessionId) ?? null
}

/**
 * Created lazily, from the FIRST message — never eagerly on a button tap.
 * Chat itself follows the same rule (`ensureActiveSession` in
 * `stores/chat.ts`) for the identical reason: an eagerly-created empty row
 * is a ghost entry nobody asked for the moment it is abandoned.
 */
export async function createCodiceSession(titleHint: string): Promise<TalosLocalChatSession> {
    const title = titleHint.replace(/\s+/g, ' ').trim().slice(0, 255)
    return productionChatRepository.createSession({
        id: newTalosMobileId(),
        title,
        active_model_profile_id: null,
        created_at: new Date().toISOString(),
        metadata: { codice: true },
    })
}

/**
 * Rename/delete — 28/8, next increment after the session list itself went
 * real: a list of real, persisted rows with no way to clean one up is only
 * half "real" session management. Same repository primitives Chat's own
 * `sessionLifecycle.renameSession`/`.deleteSession` call, reached the same
 * way as everything else here (never through `useChatController()`).
 *
 * Exposed as a VISIBLE per-row action (reusing `TalosRowActions.vue`, the
 * same overflow-menu pattern Chat/Library already use), not swipe-only —
 * researched 28/8: swipe-to-delete alone fails users who can't swipe
 * accurately or use switch control, current guidance is a visible button
 * alternative for every gesture-based action.
 */
export async function renameCodiceSession(sessionId: string, title: string): Promise<TalosLocalChatSession> {
    return productionChatRepository.renameSession(sessionId, title)
}

export async function deleteCodiceSession(sessionId: string): Promise<void> {
    await productionChatRepository.deleteSession(sessionId)
}
