/**
 * The permission vocabulary, deliberately free of any dependency.
 *
 * Settings needs these three words at boot; the executor that enforces them
 * pulls in zod (for schema validation) and belongs in the lazy graph. Keeping
 * them apart is worth ~27 KB of initial JavaScript — measured, not assumed.
 */
export type TalosToolAction = 'read' | 'write' | 'outbound'

export type TalosToolPermission = 'allow' | 'ask' | 'deny'

export type TalosToolPermissions = Record<TalosToolAction, TalosToolPermission>

/** Owner 2026-07-25: read is free, write asks, anything outbound is refused. */
export const TALOS_DEFAULT_TOOL_PERMISSIONS: TalosToolPermissions = {
    read: 'allow',
    write: 'ask',
    outbound: 'deny',
}

/** Anything unrecognised resolves to the SAFEST setting for that class. */
export function decideTalosToolPermission(
    action: TalosToolAction,
    permissions: Partial<TalosToolPermissions> | undefined,
): TalosToolPermission {
    const value = permissions?.[action]
    if (value === 'allow' || value === 'ask' || value === 'deny') return value
    return TALOS_DEFAULT_TOOL_PERMISSIONS[action]
}

export const TALOS_TOOL_ACTIONS: readonly TalosToolAction[] = ['read', 'write', 'outbound']

/**
 * Which actions the user has actually DECIDED, as opposed to inherited.
 *
 * The difference is the whole point of what follows. A default is a guess made
 * on the user's behalf before they had an opinion; a choice is an opinion. Only
 * one of the two may be revised by the app.
 */
export function parseTalosChosenToolActions(value: unknown): readonly TalosToolAction[] {
    if (!Array.isArray(value)) return []
    const chosen: TalosToolAction[] = []
    for (const entry of value) {
        if (entry !== 'read' && entry !== 'write' && entry !== 'outbound') continue
        if (!chosen.includes(entry)) chosen.push(entry)
    }
    return chosen
}

/**
 * The permissions that actually apply, once configuration is taken into account.
 *
 * One rule, and it exists because of a real defect: after saving a search key
 * the panel said «Pronto: il modello può cercare sul web» while the model had
 * no such tool, because `outbound` defaults to `deny` and deny is a hard
 * refusal that never asks. The user had configured a search source — an
 * unmistakable statement of intent — and got a polite refusal naming none of
 * the reasons.
 *
 * So: **configuring a search source turns an INHERITED refusal into a
 * question.** Not into permission — into a question, answered by the
 * authorization card with «Deny / Allow this time / Always allow». Nothing is
 * sent anywhere until the user says so.
 *
 * What it deliberately does NOT do is revise a refusal the user CHOSE. Someone
 * who set "never allow" on purpose means it, and an app that quietly promotes
 * that to a prompt has taken the word "never" away from them.
 */
export function talosEffectiveToolPermissions(input: {
    readonly stored: TalosToolPermissions
    readonly chosen: readonly TalosToolAction[]
    readonly searchConfigured: boolean
}): TalosToolPermissions {
    const promote = input.searchConfigured
        && input.stored.outbound === 'deny'
        && !input.chosen.includes('outbound')
    return promote ? { ...input.stored, outbound: 'ask' } : input.stored
}
