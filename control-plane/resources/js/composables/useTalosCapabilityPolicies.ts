import { computed, ref } from 'vue'
import { TalosApiError, talosFetch, type TalosFetchOptions } from '../lib/api'

export type TalosCapabilityPolicyAction = 'read' | 'write' | 'outbound'
export type TalosCapabilityPolicyDecision = 'allow' | 'ask' | 'deny'
export type TalosCapabilityPolicySource = 'default' | 'user' | 'managed'
export type TalosCapabilityPolicyRisk = 'low' | 'medium' | 'high' | 'critical'
export type TalosCapabilityGrantScope = 'once' | 'session' | 'device' | 'account'
export type TalosCapabilityGrantStatus = 'active' | 'consumed' | 'expired' | 'revoked'
export type TalosCapabilityPolicyLoadState = 'idle' | 'loading' | 'loaded' | 'error'

export interface TalosCapabilityPolicy {
    capability: string
    actions: TalosCapabilityPolicyAction[]
    decision: TalosCapabilityPolicyDecision
    source: TalosCapabilityPolicySource
    risk: TalosCapabilityPolicyRisk
    updated_at?: string | null
    last_used_at?: string | null
}

export interface TalosCapabilityGrant {
    id: string
    capability: string
    tool_id?: string | null
    actions: TalosCapabilityPolicyAction[]
    scope: TalosCapabilityGrantScope
    scope_id?: string | null
    status: TalosCapabilityGrantStatus
    granted_at: string
    expires_at?: string | null
    risk_acknowledged?: boolean
}

export interface TalosCapabilityPolicyContract {
    schema_version: 1
    revision: number
    policies: TalosCapabilityPolicy[]
    grants: TalosCapabilityGrant[]
}

export interface TalosCapabilityCatalogEntry {
    capability: string
    group: string
    label: string
    description: string
    risk: TalosCapabilityPolicyRisk
    actions: TalosCapabilityPolicyAction[]
    master_enable_eligible: boolean
}

export interface TalosCapabilityPolicyFault {
    code: string
    capability: string
    message: string
    policy_id?: string
    grant_id?: string
}

export interface TalosCapabilityPolicyMeta {
    catalog: TalosCapabilityCatalogEntry[]
    master_enable: { eligible: string[]; excluded: string[] }
    faults: TalosCapabilityPolicyFault[]
}

export interface TalosCapabilityPolicyEnvelope {
    contract: TalosCapabilityPolicyContract
    meta: TalosCapabilityPolicyMeta
}

export interface TalosCapabilityGrantInput {
    scope: TalosCapabilityGrantScope
    actions: TalosCapabilityPolicyAction[]
    scope_id?: string | null
    tool_id?: string | null
    session_ttl_seconds?: number | null
    risk_acknowledged?: boolean
}

type RequestFunction = (input: RequestInfo | URL, options?: TalosFetchOptions) => Promise<unknown>

export class TalosCapabilityPolicyContractError extends Error {
    constructor(detail: string) {
        super(`TALOS capability policy contract is invalid: ${detail}`)
        this.name = 'TalosCapabilityPolicyContractError'
    }
}

const ACTIONS = new Set<TalosCapabilityPolicyAction>(['read', 'write', 'outbound'])
const DECISIONS = new Set<TalosCapabilityPolicyDecision>(['allow', 'ask', 'deny'])
const SOURCES = new Set<TalosCapabilityPolicySource>(['default', 'user', 'managed'])
const RISKS = new Set<TalosCapabilityPolicyRisk>(['low', 'medium', 'high', 'critical'])
const SCOPES = new Set<TalosCapabilityGrantScope>(['once', 'session', 'device', 'account'])
const STATUSES = new Set<TalosCapabilityGrantStatus>(['active', 'consumed', 'expired', 'revoked'])
const RFC3339_DATE_TIME = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

function fail(detail: string): never {
    throw new TalosCapabilityPolicyContractError(detail)
}

function record(value: unknown, label: string, allowed: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`)
    const result = value as Record<string, unknown>
    const unknown = Object.keys(result).filter((key) => !allowed.includes(key))
    if (unknown.length > 0) fail(`${label} contains unknown keys: ${unknown.join(', ')}.`)
    return result
}

function requiredString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`)
    return value
}

function optionalString(value: unknown, label: string): string | null | undefined {
    if (value === undefined) return undefined
    if (value === null) return null
    return requiredString(value, label)
}

function isRfc3339DateTime(value: string): boolean {
    const match = RFC3339_DATE_TIME.exec(value)
    if (!match) return false
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return day <= (daysInMonth[month - 1] ?? 0)
}

function timestamp(value: unknown, label: string, optional = false): string | null | undefined {
    if (optional && value === undefined) return undefined
    if (value === null) return null
    const result = requiredString(value, label)
    if (!isRfc3339DateTime(result)) fail(`${label} must be an RFC 3339 date-time.`)
    return result
}

function integer(value: unknown, label: string, minimum = 0): number {
    if (!Number.isInteger(value) || (value as number) < minimum) fail(`${label} must be an integer >= ${minimum}.`)
    return value as number
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, label: string): T {
    if (typeof value !== 'string' || !values.has(value as T)) fail(`${label} is unsupported.`)
    return value as T
}

function uniqueStrings(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty list.`)
    const result = value.map((item, index) => requiredString(item, `${label}[${index}]`))
    if (new Set(result).size !== result.length) fail(`${label} must contain unique values.`)
    return result
}

function actions(value: unknown, label: string): TalosCapabilityPolicyAction[] {
    return uniqueStrings(value, label).map((item) => enumValue(item, ACTIONS, label))
}

function parsePolicy(value: unknown, index: number): TalosCapabilityPolicy {
    const label = `data.policies[${index}]`
    const data = record(value, label, ['capability', 'actions', 'decision', 'source', 'risk', 'updated_at', 'last_used_at'])
    return {
        capability: requiredString(data.capability, `${label}.capability`),
        actions: actions(data.actions, `${label}.actions`),
        decision: enumValue(data.decision, DECISIONS, `${label}.decision`),
        source: enumValue(data.source, SOURCES, `${label}.source`),
        risk: enumValue(data.risk, RISKS, `${label}.risk`),
        ...(data.updated_at !== undefined ? { updated_at: timestamp(data.updated_at, `${label}.updated_at`, true) } : {}),
        ...(data.last_used_at !== undefined ? { last_used_at: timestamp(data.last_used_at, `${label}.last_used_at`, true) } : {}),
    }
}

function parseGrant(value: unknown, index: number): TalosCapabilityGrant {
    const label = `data.grants[${index}]`
    const data = record(value, label, ['id', 'capability', 'tool_id', 'actions', 'scope', 'scope_id', 'status', 'granted_at', 'expires_at', 'risk_acknowledged'])
    const scope = enumValue(data.scope, SCOPES, `${label}.scope`)
    const scopeId = optionalString(data.scope_id, `${label}.scope_id`)
    if (['session', 'device'].includes(scope) && !scopeId) fail(`${label}.scope_id is required for ${scope}.`)
    if (['once', 'account'].includes(scope) && scopeId != null) fail(`${label}.scope_id is forbidden for ${scope}.`)
    if (data.risk_acknowledged !== undefined && typeof data.risk_acknowledged !== 'boolean') fail(`${label}.risk_acknowledged must be boolean.`)

    return {
        id: requiredString(data.id, `${label}.id`),
        capability: requiredString(data.capability, `${label}.capability`),
        ...(data.tool_id !== undefined ? { tool_id: optionalString(data.tool_id, `${label}.tool_id`) } : {}),
        actions: actions(data.actions, `${label}.actions`),
        scope,
        ...(data.scope_id !== undefined ? { scope_id: scopeId } : {}),
        status: enumValue(data.status, STATUSES, `${label}.status`),
        granted_at: timestamp(data.granted_at, `${label}.granted_at`) as string,
        ...(data.expires_at !== undefined ? { expires_at: timestamp(data.expires_at, `${label}.expires_at`, true) } : {}),
        ...(data.risk_acknowledged !== undefined ? { risk_acknowledged: data.risk_acknowledged as boolean } : {}),
    }
}

export function parseTalosCapabilityPolicyContract(value: unknown): TalosCapabilityPolicyContract {
    const data = record(value, 'data', ['schema_version', 'revision', 'policies', 'grants'])
    if (data.schema_version !== 1) fail('data.schema_version must equal 1.')
    if (!Array.isArray(data.policies) || !Array.isArray(data.grants)) fail('data policies and grants must be lists.')
    const policies = data.policies.map(parsePolicy)
    const grants = data.grants.map(parseGrant)
    if (new Set(policies.map((item) => item.capability)).size !== policies.length) fail('data.policies capability values must be unique.')
    if (new Set(grants.map((item) => item.id)).size !== grants.length) fail('data.grants ids must be unique.')
    const policyByCapability = new Map(policies.map((item) => [item.capability, item]))
    for (const grant of grants) {
        const policy = policyByCapability.get(grant.capability)
        if (!policy) fail(`grant ${grant.id} references an unknown capability.`)
        if (grant.actions.some((action) => !policy.actions.includes(action))) fail(`grant ${grant.id} contains actions outside its policy.`)
        if (grant.status === 'active' && policy.decision === 'deny' && grant.actions.some((action) => policy.actions.includes(action))) {
            fail(`active grant ${grant.id} conflicts with deny.`)
        }
    }
    return {
        schema_version: 1,
        revision: integer(data.revision, 'data.revision'),
        policies,
        grants,
    }
}

function parseCatalog(value: unknown): TalosCapabilityCatalogEntry[] {
    if (!Array.isArray(value)) fail('meta.catalog must be a list.')
    const result = value.map((item, index) => {
        const label = `meta.catalog[${index}]`
        const data = record(item, label, ['capability', 'group', 'label', 'description', 'risk', 'actions', 'master_enable_eligible'])
        if (typeof data.master_enable_eligible !== 'boolean') fail(`${label}.master_enable_eligible must be boolean.`)
        return {
            capability: requiredString(data.capability, `${label}.capability`),
            group: requiredString(data.group, `${label}.group`),
            label: requiredString(data.label, `${label}.label`),
            description: requiredString(data.description, `${label}.description`),
            risk: enumValue(data.risk, RISKS, `${label}.risk`),
            actions: actions(data.actions, `${label}.actions`),
            master_enable_eligible: data.master_enable_eligible,
        }
    })
    if (new Set(result.map((item) => item.capability)).size !== result.length) fail('meta.catalog capability values must be unique.')
    return result
}

function parseFaults(value: unknown): TalosCapabilityPolicyFault[] {
    if (!Array.isArray(value)) fail('meta.faults must be a list.')
    return value.map((item, index) => {
        const label = `meta.faults[${index}]`
        const data = record(item, label, ['code', 'capability', 'message', 'policy_id', 'grant_id'])
        return {
            code: requiredString(data.code, `${label}.code`),
            capability: requiredString(data.capability, `${label}.capability`),
            message: requiredString(data.message, `${label}.message`),
            ...(data.policy_id !== undefined ? { policy_id: requiredString(data.policy_id, `${label}.policy_id`) } : {}),
            ...(data.grant_id !== undefined ? { grant_id: requiredString(data.grant_id, `${label}.grant_id`) } : {}),
        }
    })
}

export function parseTalosCapabilityPolicyEnvelope(value: unknown): TalosCapabilityPolicyEnvelope {
    const root = record(value, 'envelope', ['data', 'meta'])
    const meta = record(root.meta, 'meta', ['catalog', 'master_enable', 'faults'])
    const master = record(meta.master_enable, 'meta.master_enable', ['eligible', 'excluded'])
    return {
        contract: parseTalosCapabilityPolicyContract(root.data),
        meta: {
            catalog: parseCatalog(meta.catalog),
            master_enable: {
                eligible: Array.isArray(master.eligible) && master.eligible.length === 0 ? [] : uniqueStrings(master.eligible, 'meta.master_enable.eligible'),
                excluded: Array.isArray(master.excluded) && master.excluded.length === 0 ? [] : uniqueStrings(master.excluded, 'meta.master_enable.excluded'),
            },
            faults: parseFaults(meta.faults),
        },
    }
}

function mutationContract(value: unknown): TalosCapabilityPolicyContract {
    const root = record(value, 'mutation response', ['data', 'meta'])
    return parseTalosCapabilityPolicyContract(root.data)
}

export function useTalosCapabilityPolicies(dependencies: { request?: RequestFunction } = {}) {
    const request = dependencies.request ?? talosFetch
    const contract = ref<TalosCapabilityPolicyContract | null>(null)
    const meta = ref<TalosCapabilityPolicyMeta | null>(null)
    const loadState = ref<TalosCapabilityPolicyLoadState>('idle')
    const policyError = ref<string | null>(null)
    const conflictMessage = ref<string | null>(null)
    const pendingOperation = ref<string | null>(null)
    let loadVersion = 0
    let mutationVersion = 0

    const mutating = computed(() => pendingOperation.value !== null)
    const catalogByCapability = computed(() => new Map((meta.value?.catalog ?? []).map((item) => [item.capability, item])))

    function invalidateContract(error: unknown) {
        if (error instanceof TalosCapabilityPolicyContractError) {
            contract.value = null
            meta.value = null
        }
    }

    function message(error: unknown, fallback: string) {
        return error instanceof Error && error.message.trim() ? error.message : fallback
    }

    async function loadPolicies() {
        if (pendingOperation.value !== null) {
            throw new Error('Wait for the current capability policy change before refreshing.')
        }
        const version = ++loadVersion
        loadState.value = 'loading'
        policyError.value = null
        conflictMessage.value = null
        try {
            const parsed = parseTalosCapabilityPolicyEnvelope(await request('/api/talos/capability-policies'))
            if (version !== loadVersion) return contract.value
            contract.value = parsed.contract
            meta.value = parsed.meta
            loadState.value = 'loaded'
            return parsed.contract
        } catch (error) {
            if (version !== loadVersion) return contract.value
            invalidateContract(error)
            loadState.value = 'error'
            policyError.value = message(error, 'TALOS could not load capability policies.')
            throw error
        }
    }

    function currentRevision() {
        if (!contract.value) throw new Error('Load capability policies before changing them.')
        return contract.value.revision
    }

    function reconcileConflict(error: unknown) {
        if (!(error instanceof TalosApiError) || error.status !== 409) return false
        const details = error.details && typeof error.details === 'object' && !Array.isArray(error.details)
            ? error.details as Record<string, unknown>
            : null
        if (!details || !('data' in details)) return false
        contract.value = parseTalosCapabilityPolicyContract(details.data)
        conflictMessage.value = 'Capability policy state changed in another session. Review the current values and retry explicitly.'
        return true
    }

    async function mutate(operation: string, endpoint: string, options: TalosFetchOptions) {
        if (loadState.value === 'loading') {
            throw new Error('Wait for the capability policy refresh to finish before making a change.')
        }
        if (pendingOperation.value !== null) {
            throw new Error('Wait for the current capability policy change to finish.')
        }
        const version = ++mutationVersion
        pendingOperation.value = operation
        policyError.value = null
        conflictMessage.value = null
        try {
            const parsed = mutationContract(await request(endpoint, options))
            if (version === mutationVersion) contract.value = parsed
            return parsed
        } catch (error) {
            if (version === mutationVersion) {
                try {
                    reconcileConflict(error)
                } catch (contractError) {
                    invalidateContract(contractError)
                    policyError.value = message(contractError, 'TALOS returned an invalid conflict snapshot.')
                    throw contractError
                }
                invalidateContract(error)
                policyError.value = message(error, 'TALOS could not update capability policies.')
            }
            throw error
        } finally {
            if (version === mutationVersion) pendingOperation.value = null
        }
    }

    async function updateDecision(capability: string, decision: TalosCapabilityPolicyDecision, riskAcknowledged = false) {
        const id = requiredString(capability, 'capability')
        enumValue(decision, DECISIONS, 'decision')
        const payload: Record<string, unknown> = { expected_revision: currentRevision(), decision }
        if (riskAcknowledged) payload.risk_acknowledged = true
        return mutate(`decision:${id}`, `/api/talos/capability-policies/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
            validationMessage: 'TALOS rejected this capability decision.',
        })
    }

    async function createGrant(capability: string, input: TalosCapabilityGrantInput) {
        const id = requiredString(capability, 'capability')
        enumValue(input.scope, SCOPES, 'scope')
        const selectedActions = actions(input.actions, 'actions')
        const scopeId = input.scope_id == null ? null : requiredString(input.scope_id, 'scope_id')
        if (['session', 'device'].includes(input.scope) && !scopeId) throw new Error(`A ${input.scope} grant requires a scope identifier.`)
        if (['once', 'account'].includes(input.scope) && scopeId !== null) throw new Error(`A ${input.scope} grant cannot carry a scope identifier.`)
        if (input.scope === 'session' && (!Number.isInteger(input.session_ttl_seconds) || (input.session_ttl_seconds as number) < 60 || (input.session_ttl_seconds as number) > 86400)) {
            throw new Error('A session grant requires a TTL from 60 to 86400 seconds.')
        }
        const payload: Record<string, unknown> = {
            expected_revision: currentRevision(),
            scope: input.scope,
            actions: selectedActions,
        }
        if (scopeId !== null) payload.scope_id = scopeId
        if (input.tool_id != null && input.tool_id.trim()) payload.tool_id = input.tool_id.trim()
        if (input.session_ttl_seconds != null) payload.session_ttl_seconds = input.session_ttl_seconds
        if (input.risk_acknowledged) payload.risk_acknowledged = true
        return mutate(`grant:${id}`, `/api/talos/capability-policies/${encodeURIComponent(id)}/grants`, {
            method: 'POST',
            body: JSON.stringify(payload),
            validationMessage: 'TALOS rejected this capability grant.',
        })
    }

    async function revokeGrant(grantId: string) {
        const id = requiredString(grantId, 'grant_id')
        return mutate(`revoke-grant:${id}`, `/api/talos/capability-policies/grants/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ expected_revision: currentRevision() }),
            validationMessage: 'TALOS rejected this grant revocation.',
        })
    }

    async function masterEnable() {
        return mutate('master-enable', '/api/talos/capability-policies/master-enable', {
            method: 'POST',
            body: JSON.stringify({ expected_revision: currentRevision(), warning_acknowledged: true }),
            validationMessage: 'TALOS rejected the master-enable operation.',
        })
    }

    async function revokeAll() {
        return mutate('revoke-all', '/api/talos/capability-policies/revoke-all', {
            method: 'POST',
            body: JSON.stringify({ expected_revision: currentRevision() }),
            validationMessage: 'TALOS rejected the revoke-all operation.',
        })
    }

    return {
        contract,
        meta,
        loadState,
        policyError,
        conflictMessage,
        pendingOperation,
        mutating,
        catalogByCapability,
        loadPolicies,
        updateDecision,
        createGrant,
        revokeGrant,
        masterEnable,
        revokeAll,
    }
}
