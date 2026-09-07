import { describe, expect, it } from 'vitest'
import {
    TALOS_CAPABILITY_CONTRACT,
    parseTalosCapabilityManifest,
} from './talosCapabilities'

function canonicalManifest() {
    return {
        contract: TALOS_CAPABILITY_CONTRACT,
        revision: '2026-07-28.1',
        capabilities: [
            {
                id: 'chat.provider',
                state: 'available',
                reason: null,
                evidence: ['api:POST /api/talos/chat'],
            },
            {
                id: 'models.local_runtime',
                state: 'planned',
                reason: 'Local runtime is not promoted yet.',
                evidence: ['roadmap:P6-local-runtime'],
            },
        ],
    }
}

describe('parseTalosCapabilityManifest', () => {
    it('accepts the strict versioned contract and returns an immutable projection', () => {
        const parsed = parseTalosCapabilityManifest(canonicalManifest())

        expect(parsed.contract).toBe(TALOS_CAPABILITY_CONTRACT)
        expect(parsed.revision).toBe('2026-07-28.1')
        expect(parsed.capabilities).toHaveLength(2)
        expect(Object.isFrozen(parsed)).toBe(true)
        expect(Object.isFrozen(parsed.capabilities)).toBe(true)
        expect(Object.isFrozen(parsed.capabilities[0])).toBe(true)
        expect(Object.isFrozen(parsed.capabilities[0].evidence)).toBe(true)
    })

    it('rejects duplicate and unknown capability identifiers', () => {
        const duplicate = canonicalManifest()
        duplicate.capabilities.push({ ...duplicate.capabilities[0] })

        expect(() => parseTalosCapabilityManifest(duplicate)).toThrow(/duplicate capability identifier/i)
        expect(() => parseTalosCapabilityManifest({
            ...canonicalManifest(),
            capabilities: [{
                id: 'future.unregistered',
                state: 'planned',
                reason: 'Unknown to this client.',
                evidence: ['roadmap:unknown'],
            }],
        })).toThrow(/unknown capability identifier/i)
    })

    it('rejects unknown states, optimistic reasons, missing reasons and empty evidence', () => {
        const base = canonicalManifest()

        expect(() => parseTalosCapabilityManifest({
            ...base,
            capabilities: [{ ...base.capabilities[0], state: 'experimental' }],
        })).toThrow(/unknown capability state/i)
        expect(() => parseTalosCapabilityManifest({
            ...base,
            capabilities: [{ ...base.capabilities[0], reason: 'Optimistic copy.' }],
        })).toThrow(/available capability.*reason/i)
        expect(() => parseTalosCapabilityManifest({
            ...base,
            capabilities: [{ ...base.capabilities[1], reason: null }],
        })).toThrow(/requires a non-empty reason/i)
        expect(() => parseTalosCapabilityManifest({
            ...base,
            capabilities: [{ ...base.capabilities[0], evidence: [] }],
        })).toThrow(/registered evidence/i)
    })

    it('rejects unknown keys and malformed envelope fields', () => {
        expect(() => parseTalosCapabilityManifest({
            ...canonicalManifest(),
            unexpected: true,
        })).toThrow(/only contract, revision, and capabilities/i)
        expect(() => parseTalosCapabilityManifest({
            ...canonicalManifest(),
            contract: 'talos.product.capabilities.v2',
        })).toThrow(/unsupported capability contract/i)
        expect(() => parseTalosCapabilityManifest({
            ...canonicalManifest(),
            revision: '',
        })).toThrow(/invalid capability revision/i)
        expect(() => parseTalosCapabilityManifest({
            ...canonicalManifest(),
            capabilities: [{
                ...canonicalManifest().capabilities[0],
                extra: true,
            }],
        })).toThrow(/only id, state, reason, and evidence/i)
    })
})
