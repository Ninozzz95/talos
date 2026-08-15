import type { TalosChatRepository } from '@/repositories/chatRepository'

/**
 * Routes a temporary chat away from the disk.
 *
 * F-14, the owner's temporary chat. The research that shaped it: "incognito" in
 * 2026 mostly means "we still have it, we just do not show it to you" —
 * ChatGPT and Claude retain temporary conversations for a stated window, and a
 * court ordered OpenAI to preserve all of them including those. What the mode
 * buys everywhere else is privacy from whoever picks up your phone.
 *
 * TALOS is local-first, so the LOCAL half can be true here: a temporary message
 * is never written, rather than written and hidden. The remote half still is
 * not ours to promise — the provider receives the messages either way — and the
 * surface says so, which is the part nobody else writes.
 *
 * ROUTING, NOT A FLAG. A flag has to be checked at every write site, and the
 * day someone adds write site number nine it is forgotten. Here an ephemeral
 * write has no disk in front of it at all.
 *
 * FAIL CLOSED. A method with no rule throws. When the repository interface
 * grows a thirty-ninth method, a test breaks the day it is added instead of a
 * temporary chat quietly landing on disk — which is the one failure this whole
 * feature exists to prevent, and the only one the user would never find out
 * about until they read their own history.
 */

export interface TalosEphemeralRoutingOptions {
    durable: TalosChatRepository
    ephemeral: TalosChatRepository
    isEphemeral(sessionId: string): boolean
}

/** How a method's session is found. */
type Rule =
    /** First argument IS the session id. */
    | 'session-arg'
    /** First argument is an input object carrying the session id under `session_id`. */
    | 'session-in-input'
    /** First argument is an input object whose `id` IS the session id. */
    | 'session-is-input-id'
    /** First argument is a message id; follow whatever we wrote for it. */
    | 'message-arg'
    /** Never ephemeral: vault, drafts, tasks, notes, memories all stay on disk. */
    | 'durable'
    /** Both are real objects and both need it. */
    | 'both'

/**
 * One line per method. This table IS the contract — the reason a reviewer can
 * see at a glance where a temporary chat can and cannot reach.
 *
 * Typed against `keyof TalosChatRepository`, so the compiler is what enforces
 * "fail closed": adding a thirty-ninth method to the interface breaks
 * `npm run typecheck` immediately, before anyone can run it. The runtime throw
 * below stays as the second net, for a property that is not a declared method.
 *
 * `listSessions` is deliberately `durable`: a temporary chat must not appear in
 * the history. It exists as the chat you are in, and nowhere else, which is what
 * the owner asked for and what the word means to anyone who has used one.
 */
const ROUTES: Readonly<Record<keyof TalosChatRepository, Rule>> = {
    initialize: 'both',
    close: 'both',

    listSessions: 'durable',
    getActiveSessionId: 'durable',
    createSession: 'session-is-input-id',
    selectSession: 'session-arg',
    renameSession: 'session-arg',
    updateSession: 'session-arg',
    updateSessionMetadata: 'session-arg',
    deleteSession: 'session-arg',
    listMessages: 'session-arg',
    listSessionToolActivities: 'session-arg',
    listSessionAttachmentMessageIds: 'session-arg',
    listSessionAttachmentFileIds: 'session-arg',

    appendMessage: 'session-in-input',
    appendToolActivity: 'session-in-input',

    listMessageToolActivities: 'message-arg',
    listMessageAttachments: 'message-arg',
    updateToolActivity: 'message-arg',

    // Everything below is not a conversation. A file the user keeps is a file
    // they keep; tasks, notes and memories are theirs across chats. Suppressing
    // what a temporary chat may WRITE to memory is a decision for the caller,
    // not a reason to hide the user's own data from it.
    listVaultFiles: 'durable',
    listVaultFileSummaries: 'durable',
    matchVaultFileTerms: 'durable',
    getVaultFile: 'durable',
    createVaultFile: 'durable',
    updateVaultFile: 'durable',
    deleteVaultFile: 'durable',
    createFileAuthorityGrant: 'durable',
    revokeFileAuthorityGrant: 'durable',
    loadComposerDraft: 'durable',
    saveComposerDraft: 'durable',
    createTask: 'durable',
    listTasks: 'durable',
    setTaskStatus: 'durable',
    updateTask: 'durable',
    deleteTask: 'durable',
    /**
     * The research journal is `durable`, and that is a decision with a cost.
     *
     * The ephemeral twin is an in-memory object: routing the journal there
     * would mean a run vanishes exactly when the process is killed, which is
     * the one thing R-1 exists to prevent. So it stays on disk.
     *
     * The consequence, said out loud rather than buried: a research run started
     * from a TEMPORARY chat would leave its journal behind, and that
     * contradicts what "temporary" means to the person who chose it. Nothing
     * leaks today — no surface can start a run yet — but before Deep Research
     * is wired to the chat, the owner has to decide which of the two promises
     * wins: refuse research inside a temporary chat, or say plainly that this
     * one thing outlives it.
     */
    appendResearchEvent: 'durable',
    readResearchJournal: 'durable',
    upsertResearchRun: 'durable',
    listResearchRuns: 'durable',
    deleteResearchRun: 'durable',
    createNote: 'durable',
    listNotes: 'durable',
    updateNote: 'durable',
    deleteNote: 'durable',
    createMemory: 'durable',
    upsertMemory: 'durable',
    listMemories: 'durable',
    // Durevole come tutta la memoria: una memoria vive fuori dalla chat che
    // l'ha scritta, quindi anche la sua correzione.
    updateMemory: 'durable',
    updateMemoryStatus: 'durable',
    touchMemories: 'durable',
    deleteMemory: 'durable',
}

export function createTalosEphemeralRoutingRepository(
    options: TalosEphemeralRoutingOptions,
): TalosChatRepository {
    const { durable, ephemeral, isEphemeral } = options
    // What we actually sent to memory. A message id does not say which session
    // it belongs to, so the answer comes from what happened rather than a guess.
    const ephemeralMessageIds = new Set<string>()

    function pick(method: string, args: readonly unknown[]): TalosChatRepository | 'both' {
        // The table is typed against the interface, so the COMPILER already
        // proved it is complete. This widening is only so an undeclared
        // property — anything a Proxy can be asked for — reaches the throw
        // below instead of silently reading `undefined`.
        const rule = (ROUTES as Readonly<Record<string, Rule | undefined>>)[method]
        if (!rule) throw new Error(`TALOS_EPHEMERAL_ROUTE_MISSING:${method}`)
        switch (rule) {
            case 'both':
                return 'both'
            case 'durable':
                return durable
            case 'session-arg':
                return isEphemeral(String(args[0] ?? '')) ? ephemeral : durable
            case 'session-in-input': {
                const input = args[0] as { session_id?: unknown } | undefined
                return isEphemeral(String(input?.session_id ?? '')) ? ephemeral : durable
            }
            case 'session-is-input-id': {
                const input = args[0] as { id?: unknown } | undefined
                return isEphemeral(String(input?.id ?? '')) ? ephemeral : durable
            }
            case 'message-arg':
                return ephemeralMessageIds.has(String(args[0] ?? '')) ? ephemeral : durable
        }
    }

    // A Proxy rather than 38 hand-written forwards: copies drift one at a time,
    // and a copy that was never written is the silent disk write above.
    return new Proxy({} as TalosChatRepository, {
        get(_target, property) {
            const method = String(property)
            return async (...args: unknown[]) => {
                const target = pick(method, args)
                if (target === 'both') {
                    const [, second] = await Promise.all([
                        (ephemeral as never as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]!(...args),
                        (durable as never as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]!(...args),
                    ])
                    return second
                }
                const result = await (target as never as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]!(...args)
                // Remember the ids memory now owns, so later questions about
                // them are answered by the same side that stored them.
                if (target === ephemeral && method === 'appendMessage') {
                    const id = (result as { id?: unknown } | null)?.id
                    if (typeof id === 'string') ephemeralMessageIds.add(id)
                }
                return result
            }
        },
    })
}
