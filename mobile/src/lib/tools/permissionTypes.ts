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
