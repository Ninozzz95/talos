import { describe, expect, it } from 'vitest'
import { executeTalosLocalTool } from '@/lib/tools/dynamic/interpreter'
import { ForgeCircuitBreaker } from '@/lib/tools/dynamic/circuitBreaker'
import { createInMemoryForgeIdempotencyStore } from '@/lib/tools/dynamic/idempotency'
import { defaultForgeCapability } from '@/lib/tools/dynamic/capabilityCatalog'
import type { ForgeCapabilityRuntime, TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

/**
 * ⛔ `capability` deve essere un id VERO del catalogo (`notes.list`, non
 * un id inventato): `executeTalosLocalTool` rivalida il manifest con
 * `validateTalosLocalTool` prima di girare, e quello controlla gli id
 * contro il catalogo statico REALE (`capabilityCatalog.ts`), non contro
 * il runtime finto passato qui sotto. Un id inventato fa fallire la
 * validazione prima ancora di arrivare al codice che questi test
 * vogliono provare — capitato scrivendo la prima versione di questo
 * file, corretto usando `notes.list` (R1, letta, maxInputBytes reale
 * 1024 dal catalogo).
 */
const REAL_CAPABILITY = 'notes.list'

function manifestWithCapability(input: unknown = {}): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id: 'probe_tool', version: 1, title: 'Probe',
        description: 'Runtime limits probe', createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        flow: {
            entry: 'call', maxTransitions: 8,
            nodes: [
                { id: 'call', type: 'capability', capability: REAL_CAPABILITY, input, target: '$.result', next: 'done' },
                { id: 'done', type: 'return', value: { $ref: '$.result' } },
            ],
        },
    }
}

function fakeCapabilityRuntime(execute: ForgeCapabilityRuntime['execute']): ForgeCapabilityRuntime {
    // describe() delega al catalogo VERO: il tetto maxInputBytes provato
    // qui sotto è quello dichiarato davvero per notes.list, non uno
    // inventato dal test.
    return { describe: (id: string) => defaultForgeCapability(id), execute }
}

describe('Tool Forge interpreter — limiti applicati per davvero', () => {
    it('rifiuta un input più grande del maxInputBytes reale della capability', async () => {
        const runtime = fakeCapabilityRuntime(async () => ({ ok: true }))
        const bigInput = { query: 'x'.repeat(2_000) } // oltre i 1024 byte dichiarati da notes.list
        const result = await executeTalosLocalTool(manifestWithCapability(bigInput), {}, { capabilities: runtime })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_INPUT_TOO_LARGE')
    })

    it('accetta un input entro il limite', async () => {
        const runtime = fakeCapabilityRuntime(async () => ({ ok: true }))
        const result = await executeTalosLocalTool(manifestWithCapability({ n: 1 }), {}, { capabilities: runtime })
        expect(result.status).toBe('succeeded')
    })

    it('rifiuta un risultato di capability più grande di MAX_CAPABILITY_RESULT_BYTES', async () => {
        const runtime = fakeCapabilityRuntime(async () => ({ blob: 'x'.repeat(300_000) }))
        const result = await executeTalosLocalTool(manifestWithCapability(), {}, { capabilities: runtime })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_RESULT_TOO_LARGE')
    })
})

describe('Tool Forge interpreter — circuit breaker collegato per davvero', () => {
    it('dopo la soglia di fallimenti, il circuito si apre e la capability non viene più chiamata', async () => {
        const state = { calls: 0 }
        const runtime = fakeCapabilityRuntime(async () => { state.calls += 1; throw new Error('always fails') })
        const breaker = new ForgeCircuitBreaker(1, 10 * 60_000, 30 * 60_000)
        const manifest = manifestWithCapability()

        const first = await executeTalosLocalTool(manifest, {}, { capabilities: runtime, circuitBreaker: breaker })
        // Capability read-only, nessuna compensazione pendente: un
        // fallimento esaurito i tentativi è 'failed', non 'recovery_required'
        // (quello è per capability irreversibili o compensazioni fallite).
        expect(first.status).toBe('failed')
        expect(state.calls).toBe(1)

        const second = await executeTalosLocalTool(manifest, {}, { capabilities: runtime, circuitBreaker: breaker })
        expect(second.error?.code).toBe('FORGE_CIRCUIT_OPEN')
        // Il circuito era aperto: la capability NON è stata richiamata una seconda volta.
        expect(state.calls).toBe(1)
    })
})

describe('Tool Forge interpreter — idempotenza collegata per davvero', () => {
    it('un retry con la stessa idempotencyKey non richiama la capability una seconda volta', async () => {
        const state = { calls: 0 }
        const runtime = fakeCapabilityRuntime(async () => { state.calls += 1; return { ok: true, call: state.calls } })
        const store = createInMemoryForgeIdempotencyStore()
        const manifest = manifestWithCapability()

        const first = await executeTalosLocalTool(manifest, {}, { capabilities: runtime, idempotency: store }, { executionId: 'exec-1' })
        expect(first.status).toBe('succeeded')
        expect(state.calls).toBe(1)

        // Stessa executionId ⇒ stessa idempotencyKey (`${executionId}:${nodeId}`):
        // simula un retry dopo che la risposta del primo giro si è persa.
        const second = await executeTalosLocalTool(manifest, {}, { capabilities: runtime, idempotency: store }, { executionId: 'exec-1' })
        expect(second.status).toBe('succeeded')
        expect(state.calls).toBe(1) // NON richiamata una seconda volta
    })

    it('non deduplica fra esecuzioni con executionId diversi — non è un cache generico', async () => {
        const state = { calls: 0 }
        const runtime = fakeCapabilityRuntime(async () => { state.calls += 1; return { ok: true } })
        const store = createInMemoryForgeIdempotencyStore()
        const manifest = manifestWithCapability()
        await executeTalosLocalTool(manifest, {}, { capabilities: runtime, idempotency: store }, { executionId: 'exec-a' })
        await executeTalosLocalTool(manifest, {}, { capabilities: runtime, idempotency: store }, { executionId: 'exec-b' })
        expect(state.calls).toBe(2)
    })
})
