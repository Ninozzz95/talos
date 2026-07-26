import {
    parseTalosToolCallArguments,
    type TalosToolAction,
    type TalosToolContext,
    type TalosToolDefinition,
    type TalosToolResult,
} from '@/lib/tools/registry'

/**
 * The permission gate and the one place a tool is ever executed.
 *
 * Owner decision 2026-07-25: permissions per ACTION TYPE, configured by the
 * user, with safe defaults — reading is free, writing asks, anything leaving
 * the device is refused. The research is blunt about why the gate carries the
 * weight rather than a cleverer filter: prompt injection is unsolved at the
 * model layer, so the strategy is containment. A document in the Library can
 * absolutely say "now call the write tool"; the gate is what makes that
 * sentence worthless.
 *
 * A denial is a RESULT, never an exception. An agent told "denied by user
 * policy" adapts and explains itself; an agent handed an exception derails
 * mid-run and the user sees a broken app instead of a boundary being enforced.
 */
export type TalosToolPermission = 'allow' | 'ask' | 'deny'

export type TalosToolPermissions = Record<TalosToolAction, TalosToolPermission>

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

export interface TalosToolConsentRequest {
    tool: TalosToolDefinition<never>
    input: unknown
}

export interface TalosToolAuditRow {
    tool: string
    action: TalosToolAction
    status: 'succeeded' | 'failed' | 'denied'
    input: unknown
    /** Kept for the record, not shown to the model. */
    evidence?: Record<string, unknown>
    error?: string
}

export interface TalosToolExecutionDeps {
    permissions: Partial<TalosToolPermissions> | undefined
    /** Returns true when the human allows this specific call. */
    requestConsent(request: TalosToolConsentRequest): Promise<boolean>
    audit(row: TalosToolAuditRow): Promise<void>
    context: TalosToolContext
}

async function record(deps: TalosToolExecutionDeps, row: TalosToolAuditRow): Promise<void> {
    try {
        await deps.audit(row)
    } catch {
        // A failed audit write must not swallow the tool's answer; the Doctor
        // ring already carries storage failures.
    }
}

export async function executeTalosTool(
    tool: TalosToolDefinition<never>,
    rawArguments: unknown,
    deps: TalosToolExecutionDeps,
): Promise<TalosToolResult> {
    const parsed = parseTalosToolCallArguments(tool, rawArguments)
    if (!parsed.ok) {
        // Validation comes FIRST: a tool body must never see an argument shape
        // it did not describe, and the model needs to be told what was wrong
        // or it simply repeats the same call.
        await record(deps, { tool: tool.name, action: tool.action, status: 'failed', input: rawArguments, error: parsed.error })
        return { ok: false, content: parsed.error }
    }

    const permission = decideTalosToolPermission(tool.action, deps.permissions)
    if (permission === 'deny') {
        const message = `Refused: "${tool.title}" is a ${tool.action} action and your policy denies it. Ask the user to change it in Settings if it is really needed.`
        await record(deps, { tool: tool.name, action: tool.action, status: 'denied', input: parsed.value })
        return { ok: false, content: message }
    }
    if (permission === 'ask') {
        let allowed = false
        try {
            allowed = await deps.requestConsent({ tool, input: parsed.value })
        } catch {
            // A broken consent surface must fail CLOSED.
            allowed = false
        }
        if (!allowed) {
            await record(deps, { tool: tool.name, action: tool.action, status: 'denied', input: parsed.value })
            return { ok: false, content: `Declined by the user: "${tool.title}" was not run.` }
        }
    }

    try {
        const result = await tool.run(parsed.value as never, deps.context)
        await record(deps, {
            tool: tool.name,
            action: tool.action,
            status: result.ok ? 'succeeded' : 'failed',
            input: parsed.value,
            evidence: result.evidence,
            ...(result.ok ? {} : { error: result.content }),
        })
        return result
    } catch (error) {
        const detail = error instanceof Error && error.message ? error.message : String(error)
        await record(deps, { tool: tool.name, action: tool.action, status: 'failed', input: parsed.value, error: detail })
        return { ok: false, content: `The tool failed: ${detail}` }
    }
}
