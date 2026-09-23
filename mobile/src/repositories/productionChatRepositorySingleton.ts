import { createLazyChatRepository } from '@/repositories/lazyChatRepository'
import { createTalosEphemeralRoutingRepository } from '@/repositories/ephemeralRoutingRepository'
import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'
import type { TalosChatRepository } from '@/repositories/chatRepository'

/**
 * THE ONE production chat-table repository instance — module-scope,
 * constructed once. Extracted out of `chatController.ts` (28/8, unchanged
 * otherwise — same lazy durable/ephemeral halves, same router) so a surface
 * that must NOT depend on `useChatController()` can still reach the SAME
 * on-device SQLite-backed session table Chat uses, without opening a SECOND
 * connection to it.
 *
 * `HarnessSessionScreen.vue` is that surface: CODE-COMPOSER-SINGLE-SOURCE-01
 * asserts the literal string `'useChatController'` never appears in its
 * source (it mounts the shared chat composer directly, decoupled from the
 * full chat store). Its Codice-session read/write (`@/lib/harness/codiceSessions.ts`)
 * imports THIS file instead — ES modules are singletons by import path, so
 * every importer gets the identical object, never a second SQLite handle.
 *
 * ⛔ Both halves stay lazy: the in-memory ephemeral side costs nothing until
 * a temporary chat actually starts, and the durable SQLite side costs
 * nothing until its first real call — unchanged from before the extraction.
 */
export const productionChatRepository: TalosChatRepository = createTalosEphemeralRoutingRepository({
    durable: createLazyChatRepository(async () => {
        const { createProductionChatRepository } = await import('@/repositories/productionChatRepository')
        return createProductionChatRepository()
    }),
    ephemeral: createLazyChatRepository(async () => {
        const { createMemoryChatRepository } = await import('@/repositories/memoryChatRepository')
        return createMemoryChatRepository()
    }),
    isEphemeral: talosIsEphemeralSessionId,
})
