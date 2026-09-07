import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TalosApiError } from '../lib/api'
import {
    parseTalosCapabilityPolicyEnvelope,
    useTalosCapabilityPolicies,
} from './useTalosCapabilityPolicies'

function policy(capability = 'web.search', decision = 'ask') {
    return {
        capability,
        actions: ['read', 'outbound'],
        decision,
        source: 'user',
        risk: 'low',
        updated_at: '2026-08-05T10:00:00.000000Z',
        last_used_at: null,
    }
}

function contract(revision = 4, overrides: Record<string, unknown> = {}) {
    return {
        schema_version: 1,
        revision,
        policies: [policy()],
        grants: [],
        ...overrides,
    }
}

function envelope(revision = 4) {
    return {
        data: contract(revision),
        meta: {
            catalog: [{
                capability: 'web.search',
                group: 'web',
                label: 'Search the web',
                description: 'Query a configured web-search provider.',
                risk: 'low',
                actions: ['read', 'outbound'],
                master_enable_eligible: true,
            }],
            master_enable: { eligible: ['web.search'], excluded: [] },
            faults: [],
        },
    }
}

describe('parseTalosCapabilityPolicyEnvelope', () => {
    it('accepts the exact canonical envelope', () => {
        expect(parseTalosCapabilityPolicyEnvelope(envelope()).contract.revision).toBe(4)
    })

    it.each([
        ['unknown envelope key', { ...envelope(), surprise: true }],
        ['duplicate actions', { ...envelope(), data: contract(4, { policies: [{ ...policy(), actions: ['read', 'read'] }] }) }],
        ['parseable non-RFC-3339 timestamp', { ...envelope(), data: contract(4, { policies: [{ ...policy(), updated_at: 'August 5, 2026 10:00 UTC' }] }) }],
        ['impossible RFC-3339 calendar date', { ...envelope(), data: contract(4, { policies: [{ ...policy(), updated_at: '2026-02-31T10:00:00Z' }] }) }],
        ['invalid session scope', { ...envelope(), data: contract(4, { grants: [{ id: 'g1', capability: 'web.search', actions: ['read'], scope: 'session', scope_id: null, status: 'active', granted_at: '2026-08-05T10:00:00.000000Z', expires_at: null, risk_acknowledged: false }] }) }],
        ['deny and active grant conflict', { ...envelope(), data: contract(4, { policies: [policy('web.search', 'deny')], grants: [{ id: 'g1', capability: 'web.search', actions: ['read'], scope: 'once', scope_id: null, status: 'active', granted_at: '2026-08-05T10:00:00.000000Z', expires_at: null, risk_acknowledged: false }] }) }],
    ])('fails closed for %s', (_label, value) => {
        expect(() => parseTalosCapabilityPolicyEnvelope(value)).toThrow(/capability policy/i)
    })
})

describe('useTalosCapabilityPolicies', () => {
    beforeEach(() => vi.restoreAllMocks())

    it('keeps only the latest load response', async () => {
        const resolvers: Array<(value: unknown) => void> = []
        const request = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)))
        const policies = useTalosCapabilityPolicies({ request })

        const first = policies.loadPolicies()
        const second = policies.loadPolicies()
        resolvers[1]?.(envelope(8))
        await second
        resolvers[0]?.(envelope(3))
        await first

        expect(policies.contract.value?.revision).toBe(8)
        expect(policies.loadState.value).toBe('loaded')
    })

    it('rejects a mutation while a policy refresh is pending without issuing another request', async () => {
        let resolveRefresh!: (value: unknown) => void
        const request = vi.fn()
            .mockResolvedValueOnce(envelope(4))
            .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve }))
        const policies = useTalosCapabilityPolicies({ request })
        await policies.loadPolicies()

        const refresh = policies.loadPolicies()
        const error = await policies.updateDecision('web.search', 'allow').catch((value) => value)

        expect(error).toBeInstanceOf(Error)
        expect(error.message).toMatch(/refresh/i)
        expect(request).toHaveBeenCalledTimes(2)
        resolveRefresh(envelope(5))
        await refresh
    })

    it('rejects a refresh while a policy mutation is pending without issuing another request', async () => {
        let resolveMutation!: (value: unknown) => void
        const request = vi.fn()
            .mockResolvedValueOnce(envelope(4))
            .mockImplementationOnce(() => new Promise((resolve) => { resolveMutation = resolve }))
        const policies = useTalosCapabilityPolicies({ request })
        await policies.loadPolicies()

        const mutation = policies.updateDecision('web.search', 'allow')
        const error = await policies.loadPolicies().catch((value) => value)

        expect(error).toBeInstanceOf(Error)
        expect(error.message).toMatch(/change/i)
        expect(request).toHaveBeenCalledTimes(2)
        resolveMutation({ data: contract(5, { policies: [policy('web.search', 'allow')] }) })
        await mutation
    })

    it('sends the current revision and replaces state only with server data', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce(envelope(4))
            .mockResolvedValueOnce({ data: contract(5, { policies: [policy('web.search', 'allow')] }) })
        const policies = useTalosCapabilityPolicies({ request })
        await policies.loadPolicies()

        await policies.updateDecision('web.search', 'allow')

        expect(request).toHaveBeenLastCalledWith('/api/talos/capability-policies/web.search', expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ expected_revision: 4, decision: 'allow' }),
        }))
        expect(policies.contract.value?.revision).toBe(5)
        expect(policies.contract.value?.policies[0]?.decision).toBe('allow')
    })

    it('reconciles a 409 snapshot once and never replays the mutation', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce(envelope(4))
            .mockRejectedValueOnce(new TalosApiError('Revision changed.', {
                status: 409,
                details: { data: contract(9) },
            }))
        const policies = useTalosCapabilityPolicies({ request })
        await policies.loadPolicies()

        await expect(policies.updateDecision('web.search', 'deny')).rejects.toThrow('Revision changed.')

        expect(request).toHaveBeenCalledTimes(2)
        expect(policies.contract.value?.revision).toBe(9)
        expect(policies.conflictMessage.value).toMatch(/changed/i)
    })

    it('creates and revokes grants with exact revision-bound payloads', async () => {
        const activeGrant = { id: 'g1', capability: 'web.search', actions: ['read'], scope: 'once', scope_id: null, status: 'active', granted_at: '2026-08-05T10:00:00.000000Z', expires_at: null, risk_acknowledged: false }
        const request = vi.fn()
            .mockResolvedValueOnce(envelope(4))
            .mockResolvedValueOnce({ data: contract(5, { grants: [activeGrant] }) })
            .mockResolvedValueOnce({ data: contract(6, { grants: [{ ...activeGrant, status: 'revoked' }] }) })
        const policies = useTalosCapabilityPolicies({ request })
        await policies.loadPolicies()

        await policies.createGrant('web.search', { scope: 'once', actions: ['read'] })
        await policies.revokeGrant('g1')

        expect(request).toHaveBeenNthCalledWith(2, '/api/talos/capability-policies/web.search/grants', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ expected_revision: 4, scope: 'once', actions: ['read'] }),
        }))
        expect(request).toHaveBeenNthCalledWith(3, '/api/talos/capability-policies/grants/g1', expect.objectContaining({
            method: 'DELETE',
            body: JSON.stringify({ expected_revision: 5 }),
        }))
        expect(policies.contract.value?.revision).toBe(6)
    })

    it('executes master enable and revoke all without a client-side master boolean', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce(envelope(4))
            .mockResolvedValueOnce({ data: contract(5), meta: { enabled_capabilities: ['web.search'], excluded_capabilities: [] } })
            .mockResolvedValueOnce({ data: contract(6) })
        const policies = useTalosCapabilityPolicies({ request })
        await policies.loadPolicies()

        await policies.masterEnable()
        await policies.revokeAll()

        expect(request).toHaveBeenNthCalledWith(2, '/api/talos/capability-policies/master-enable', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ expected_revision: 4, warning_acknowledged: true }),
        }))
        expect(request).toHaveBeenNthCalledWith(3, '/api/talos/capability-policies/revoke-all', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ expected_revision: 5 }),
        }))
        expect(policies.contract.value?.revision).toBe(6)
    })
})
