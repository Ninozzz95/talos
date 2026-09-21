import { parseVaultKind, parseVaultOrigin, parseVaultOriginSession } from '@/lib/vaultLibrary'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * Which files belong to a conversation, for the moment it is deleted.
 *
 * Owner 2026-07-26: deleting a chat left its documents behind. That is
 * defensible as a default — a file you asked for may outlive the conversation
 * that produced it — but it must be a CHOICE, and until now it was not even
 * mentioned. Worse, the sources a web search collected have no life of their
 * own: nobody wants fifteen pages of a research they just deleted.
 *
 * Pure and separate so the counts shown in the confirmation are computed by the
 * same code that does the deleting. A dialog that says "3 files" and then
 * removes 5 is worse than one that says nothing.
 */
export interface TalosSessionCleanupPlan {
    /** Documents the user or the model made in this chat. */
    documents: TalosLocalVaultFile[]
    /** Pages read while researching in this chat. */
    sources: TalosLocalVaultFile[]
}

export function planTalosSessionCleanup(
    files: readonly TalosLocalVaultFile[],
    sessionId: string,
): TalosSessionCleanupPlan {
    const documents: TalosLocalVaultFile[] = []
    const sources: TalosLocalVaultFile[] = []

    for (const file of files) {
        // A file merely ATTACHED here belongs to whatever chat created it, and
        // deleting this conversation must not take it away from that one.
        if (parseVaultOriginSession(file.metadata) !== sessionId) continue
        // TALOS may delete what TALOS made. What the USER brought is theirs.
        //
        // SF-critic 2026-07-26: `origin_session_id` is stamped on uploads too —
        // it records the chat you uploaded INTO, not authorship. Without this
        // line, a contract uploaded in one chat and since attached to four
        // others was destroyed, private copy and all, by deleting the first.
        if (parseVaultOrigin(file.metadata) !== 'generated') continue
        if (parseVaultKind(file.metadata) === 'web_source') sources.push(file)
        else documents.push(file)
    }

    return { documents, sources }
}

/**
 * The same plan for MANY chats at once, in one pass over the vault.
 *
 * Calling the single-session version per chat re-scans the whole Library every
 * time; a bulk delete of 50 chats against 500 files did 25,000 comparisons and
 * redid them on every vault change.
 */
export function planTalosSessionCleanupFor(
    files: readonly TalosLocalVaultFile[],
    sessionIds: ReadonlySet<string>,
): TalosSessionCleanupPlan {
    const documents: TalosLocalVaultFile[] = []
    const sources: TalosLocalVaultFile[] = []
    if (sessionIds.size === 0) return { documents, sources }

    for (const file of files) {
        const session = parseVaultOriginSession(file.metadata)
        if (session === null || !sessionIds.has(session)) continue
        if (parseVaultOrigin(file.metadata) !== 'generated') continue
        if (parseVaultKind(file.metadata) === 'web_source') sources.push(file)
        else documents.push(file)
    }

    return { documents, sources }
}

export function talosCleanupCount(plan: TalosSessionCleanupPlan): number {
    return plan.documents.length + plan.sources.length
}

/**
 * How the confirmation describes what is about to disappear, in the user's
 * terms. Sources are named separately because they are the ones nobody thinks
 * about and the ones there are most of.
 */
export function describeTalosCleanup(plan: TalosSessionCleanupPlan): string {
    const parts: string[] = []
    if (plan.documents.length) {
        parts.push(`${plan.documents.length} document${plan.documents.length === 1 ? '' : 's'}`)
    }
    if (plan.sources.length) {
        parts.push(`${plan.sources.length} saved page${plan.sources.length === 1 ? '' : 's'}`)
    }
    return parts.join(' and ')
}
