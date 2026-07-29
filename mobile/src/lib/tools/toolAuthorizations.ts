import {
    decideTalosToolPermission,
    type TalosToolAction,
    type TalosToolPermissions,
} from '@/lib/tools/permissionTypes'
import {
    isTalosAgentToolId,
    type TalosAgentToolId,
} from '@/lib/tools/toolControls'

const SHA256 = /^[0-9a-f]{64}$/

export interface TalosToolAuthorizationGrantV1 {
    readonly schema_version: 1
    readonly tool: TalosAgentToolId
    readonly actions: readonly TalosToolAction[]
    readonly scope: 'device'
    readonly granted_at: string
}

export interface TalosToolAuthorizationGrantsV1 {
    readonly schema_version: 1
    readonly revision: number
    readonly grants: Readonly<Partial<Record<TalosAgentToolId, TalosToolAuthorizationGrantV1>>>
}

export type TalosToolAuthorizationDecision =
    | 'pending'
    | 'allow_once'
    | 'always_allow'
    | 'deny'

export interface TalosToolAuthorizationRequestV1 {
    readonly schema_version: 1
    readonly id: string
    readonly checkpoint_id: string
    readonly session_id: string
    readonly send_id: string
    readonly model_profile_id: string | null
    readonly call_id: string
    readonly tool: string
    /** Only actions unresolved by the baseline policy. */
    readonly actions: readonly TalosToolAction[]
    /** Validated canonical tool input; persisted only in encrypted activity. */
    readonly input: unknown
    readonly input_digest: string
    readonly allow_persistent: boolean
    readonly decision: TalosToolAuthorizationDecision
    readonly created_at: string
    readonly decided_at: string | null
}

export type TalosToolAuthorizationResolution =
    | {
        readonly status: 'allowed'
        readonly source: 'baseline' | 'persistent' | 'allow_once' | 'always_allow'
        readonly actions: readonly TalosToolAction[]
    }
    | {
        readonly status: 'ask'
        readonly actions: readonly TalosToolAction[]
        readonly allow_persistent: boolean
    }
    | {
        readonly status: 'denied'
        readonly actions: readonly TalosToolAction[]
        readonly source: 'policy' | 'user'
    }

export const TALOS_EMPTY_TOOL_AUTHORIZATIONS: TalosToolAuthorizationGrantsV1
    = Object.freeze({
        schema_version: 1,
        revision: 0,
        grants: Object.freeze({}),
    })

function recordOf(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function validTimestamp(value: unknown): value is string {
    return typeof value === 'string'
        && value.length <= 64
        && Number.isFinite(Date.parse(value))
}

function normalizeActions(value: unknown): TalosToolAction[] | null {
    if (!Array.isArray(value) || value.length === 0) return null
    const actions: TalosToolAction[] = []
    for (const action of value) {
        if (action !== 'read' && action !== 'write' && action !== 'outbound') return null
        if (!actions.includes(action)) actions.push(action)
    }
    return actions
}

function freezeGrant(
    tool: TalosAgentToolId,
    actions: readonly TalosToolAction[],
    grantedAt: string,
): TalosToolAuthorizationGrantV1 {
    return Object.freeze({
        schema_version: 1,
        tool,
        actions: Object.freeze([...actions]),
        scope: 'device',
        granted_at: grantedAt,
    })
}

function freezeGrants(
    revision: number,
    grants: Partial<Record<TalosAgentToolId, TalosToolAuthorizationGrantV1>>,
): TalosToolAuthorizationGrantsV1 {
    return Object.freeze({
        schema_version: 1,
        revision,
        grants: Object.freeze({ ...grants }),
    })
}

/**
 * Missing state is an empty grant set. A corrupt entry is dropped rather than
 * broadening access; a corrupt envelope is discarded completely.
 */
export function parseTalosToolAuthorizationGrants(
    value: unknown,
): TalosToolAuthorizationGrantsV1 {
    const record = recordOf(value)
    if (!record || record.schema_version !== 1) return TALOS_EMPTY_TOOL_AUTHORIZATIONS
    if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 0) {
        return TALOS_EMPTY_TOOL_AUTHORIZATIONS
    }
    const rawGrants = recordOf(record.grants)
    if (!rawGrants) return freezeGrants(record.revision as number, {})

    const grants: Partial<Record<TalosAgentToolId, TalosToolAuthorizationGrantV1>> = {}
    for (const [key, raw] of Object.entries(rawGrants)) {
        if (!isTalosAgentToolId(key)) continue
        const grant = recordOf(raw)
        if (
            !grant
            || grant.schema_version !== 1
            || grant.tool !== key
            || grant.scope !== 'device'
            || !validTimestamp(grant.granted_at)
        ) {
            continue
        }
        const actions = normalizeActions(grant.actions)
        if (!actions) continue
        grants[key] = freezeGrant(key, actions, grant.granted_at)
    }
    return freezeGrants(record.revision as number, grants)
}

function requireRevision(
    current: TalosToolAuthorizationGrantsV1,
    expectedRevision: number,
): void {
    if (current.revision !== expectedRevision) {
        throw new Error('TALOS_TOOL_AUTHORIZATION_REVISION_CONFLICT')
    }
}

export function applyTalosToolAuthorizationGrant(
    value: TalosToolAuthorizationGrantsV1,
    tool: TalosAgentToolId,
    actionsValue: readonly TalosToolAction[],
    expectedRevision: number,
    grantedAt: string,
): TalosToolAuthorizationGrantsV1 {
    const current = parseTalosToolAuthorizationGrants(value)
    requireRevision(current, expectedRevision)
    if (!isTalosAgentToolId(tool)) throw new Error('TALOS_TOOL_AUTHORIZATION_TOOL_INVALID')
    const actions = normalizeActions(actionsValue)
    if (!actions) throw new Error('TALOS_TOOL_AUTHORIZATION_ACTIONS_INVALID')
    if (!validTimestamp(grantedAt)) throw new Error('TALOS_TOOL_AUTHORIZATION_TIME_INVALID')
    if (current.revision >= Number.MAX_SAFE_INTEGER) {
        throw new Error('TALOS_TOOL_AUTHORIZATION_REVISION_INVALID')
    }
    return freezeGrants(current.revision + 1, {
        ...current.grants,
        [tool]: freezeGrant(tool, actions, grantedAt),
    })
}

export function revokeTalosToolAuthorizationGrant(
    value: TalosToolAuthorizationGrantsV1,
    tool: TalosAgentToolId,
    expectedRevision: number,
): TalosToolAuthorizationGrantsV1 {
    const current = parseTalosToolAuthorizationGrants(value)
    requireRevision(current, expectedRevision)
    if (!isTalosAgentToolId(tool)) throw new Error('TALOS_TOOL_AUTHORIZATION_TOOL_INVALID')
    if (!current.grants[tool]) return current
    if (current.revision >= Number.MAX_SAFE_INTEGER) {
        throw new Error('TALOS_TOOL_AUTHORIZATION_REVISION_INVALID')
    }
    const grants = { ...current.grants }
    delete grants[tool]
    return freezeGrants(current.revision + 1, grants)
}

function sameActions(
    left: readonly TalosToolAction[],
    right: readonly TalosToolAction[],
): boolean {
    return left.length === right.length
        && left.every((action, index) => action === right[index])
}

function exactRequest(
    request: TalosToolAuthorizationRequestV1 | undefined,
    tool: string,
    callId: string,
    inputDigest: string,
    actions: readonly TalosToolAction[],
): request is TalosToolAuthorizationRequestV1 {
    return !!request
        && request.schema_version === 1
        && request.tool === tool
        && request.call_id === callId
        && request.input_digest === inputDigest
        && SHA256.test(request.input_digest)
        && sameActions(request.actions, actions)
}

export function resolveTalosToolAuthorization(input: {
    tool: string
    requiredActions: readonly TalosToolAction[]
    permissions: Partial<TalosToolPermissions> | undefined
    grants: TalosToolAuthorizationGrantsV1
    callId: string
    inputDigest: string
    request?: TalosToolAuthorizationRequestV1
    /** Dedicated high-impact tools ignore saved grants and ask every time. */
    forceConfirmation?: boolean
}): TalosToolAuthorizationResolution {
    const required = normalizeActions(input.requiredActions)
    if (!required) return { status: 'denied', actions: [], source: 'policy' }

    const denied = required.filter(
        (action) => decideTalosToolPermission(action, input.permissions) === 'deny',
    )
    if (denied.length > 0) {
        return { status: 'denied', actions: denied, source: 'policy' }
    }

    const asked = input.forceConfirmation
        ? required
        : required.filter(
            (action) => decideTalosToolPermission(action, input.permissions) === 'ask',
        )
    const request = input.request
    const requestMatches = exactRequest(
        request,
        input.tool,
        input.callId,
        input.inputDigest,
        asked,
    )
    if (requestMatches && request.decision === 'deny') {
        return { status: 'denied', actions: asked, source: 'user' }
    }
    if (
        requestMatches
        && (request.decision === 'allow_once'
            || request.decision === 'always_allow')
    ) {
        if (request.decision === 'allow_once') {
            return {
                status: 'allowed',
                source: request.decision,
                actions: asked,
            }
        }
        // “Always” is a pointer to the revocable Settings grant, not a second
        // immortal grant hidden inside a checkpoint. Removing the Settings
        // grant must take effect even while a continuation is queued.
        const persistent = isTalosAgentToolId(input.tool)
            ? parseTalosToolAuthorizationGrants(input.grants).grants[input.tool]
            : undefined
        if (
            request.allow_persistent
            && persistent
            && asked.every((action) => persistent.actions.includes(action))
        ) {
            return {
                status: 'allowed',
                source: request.decision,
                actions: asked,
            }
        }
    }

    if (!input.forceConfirmation && asked.length > 0) {
        const grant = isTalosAgentToolId(input.tool)
            ? parseTalosToolAuthorizationGrants(input.grants).grants[input.tool]
            : undefined
        if (grant && asked.every((action) => grant.actions.includes(action))) {
            return { status: 'allowed', source: 'persistent', actions: asked }
        }
    }
    if (asked.length > 0) {
        return {
            status: 'ask',
            actions: asked,
            allow_persistent: input.forceConfirmation !== true,
        }
    }
    return { status: 'allowed', source: 'baseline', actions: [] }
}

function hasUnpairedSurrogate(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1)
            if (!(next >= 0xdc00 && next <= 0xdfff)) return true
            index += 1
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            return true
        }
    }
    return false
}

function invalidInput(): never {
    throw new Error('TALOS_TOOL_AUTHORIZATION_INPUT_INVALID')
}

/**
 * RFC 8785 JCS subset for already schema-validated JSON tool input.
 *
 * JavaScript's `<`/default sort compares UTF-16 code units, matching JCS.
 */
export function canonicalizeTalosToolAuthorizationInput(value: unknown): string {
    const visiting = new Set<object>()

    const serialize = (node: unknown): string => {
        if (node === null || typeof node === 'boolean') return JSON.stringify(node)
        if (typeof node === 'string') {
            if (hasUnpairedSurrogate(node)) return invalidInput()
            return JSON.stringify(node)
        }
        if (typeof node === 'number') {
            if (!Number.isFinite(node)) return invalidInput()
            return JSON.stringify(node)
        }
        if (typeof node !== 'object') return invalidInput()
        if (visiting.has(node)) return invalidInput()
        visiting.add(node)
        try {
            if (Array.isArray(node)) {
                return `[${node.map((entry) => serialize(entry)).join(',')}]`
            }
            const prototype = Object.getPrototypeOf(node)
            if (prototype !== Object.prototype && prototype !== null) return invalidInput()
            const record = node as Record<string, unknown>
            const fields = Object.keys(record).sort().map((key) => {
                if (hasUnpairedSurrogate(key)) return invalidInput()
                return `${JSON.stringify(key)}:${serialize(record[key])}`
            })
            return `{${fields.join(',')}}`
        } finally {
            visiting.delete(node)
        }
    }

    return serialize(value)
}

export async function digestTalosToolAuthorizationInput(value: unknown): Promise<string> {
    const canonical = canonicalizeTalosToolAuthorizationInput(value)
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(canonical),
    )
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}
