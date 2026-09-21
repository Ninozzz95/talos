import { describe, expect, it } from 'vitest'
import { validateTalosLocalTool } from '@/lib/tools/dynamic/validator'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

const manifest: TalosLocalToolManifestV1 = {
    schema: 'talos.local-tool.v1', id: 'notes_digest', version: 1, title: 'Digest',
    description: 'Local digest', createdAt: new Date().toISOString(), parentVersion: null,
    execution: 'declarative-flow', installScope: 'device',
    network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
    flow: {
        entry: 'list', maxTransitions: 8,
        nodes: [
            { id: 'list', type: 'capability', capability: 'notes.list', input: {}, target: '$.notes', next: 'done' },
            { id: 'done', type: 'return', value: { $ref: '$.notes' } },
        ],
    },
}

describe('Tool Forge validator', () => {
    it('derives permissions from reachable capabilities', () => {
        const result = validateTalosLocalTool(manifest)
        expect(result.ok).toBe(true)
        expect(result.actions).toEqual(['read'])
    })

    it('rejects arbitrary capability names', () => {
        const broken = structuredClone(manifest)
        ;(broken.flow.nodes[0] as any).capability = 'shell.exec'
        expect(validateTalosLocalTool(broken).ok).toBe(false)
    })

    /**
     * ⛔⛔⛔ Owner 2026-08-27 — i tre bug riprodotti a mano prima del fix,
     * ognuno col comportamento ESATTO che aveva prima (per non perderlo di
     * nuovo in un refactor futuro) e quello che ha ora.
     */
    describe('regressioni — i bug riprodotti a mano prima del fix', () => {
        it('un target/$ref che tenta __proto__ è rifiutato con un diagnostico, non installato', () => {
            const broken = structuredClone(manifest)
            broken.flow.nodes[0]!.target = '__proto__.polluted' as any
            const result = validateTalosLocalTool(broken)
            expect(result.ok).toBe(false)
            expect(result.diagnostics.some((d) => d.code === 'FORGE_TARGET_UNSAFE')).toBe(true)
            expect(({} as Record<string, unknown>).polluted).toBeUndefined()
        })

        it('outboundScope mancante: prima lanciava TypeError, ora un diagnostico pulito — MAI un\'eccezione', () => {
            const broken: any = structuredClone(manifest)
            broken.credentialRequirements = [{ id: 'svc', kind: 'api_profile', purpose: 'x' }] // outboundScope omesso
            expect(() => validateTalosLocalTool(broken)).not.toThrow()
            const result = validateTalosLocalTool(broken)
            expect(result.ok).toBe(false)
            expect(result.diagnostics.some((d) => d.code === 'FORGE_MANIFEST_STRUCTURE')).toBe(true)
        })

        it('network.domains come stringa: prima iterava i CARATTERI come domini, ora un diagnostico strutturale solo', () => {
            const broken: any = structuredClone(manifest)
            broken.network = { mode: 'allowlist', domains: 'evil.com' }
            const result = validateTalosLocalTool(broken)
            expect(result.ok).toBe(false)
            // Un solo diagnostico strutturale sul campo, non 8 FORGE_DOMAIN_INVALID
            // (uno per carattere di "evil.com") come avrebbe prodotto il vecchio
            // codice iterando `"evil.com".entries()`.
            expect(result.diagnostics.filter((d) => d.code === 'FORGE_DOMAIN_INVALID')).toHaveLength(0)
            expect(result.diagnostics.some((d) => d.code === 'FORGE_MANIFEST_STRUCTURE' && d.path.includes('domains'))).toBe(true)
        })
    })

    describe('gate strutturale — chiavi sconosciute e forma sbagliata', () => {
        it('rifiuta una chiave di primo livello non dichiarata (stessa difesa allowlist dei path)', () => {
            const broken: any = { ...structuredClone(manifest), extraneous: true }
            expect(validateTalosLocalTool(broken).ok).toBe(false)
        })

        it('non lancia mai, qualunque cosa arrivi — null, un numero, un array', () => {
            for (const candidate of [null, undefined, 42, 'x', [], {}]) {
                expect(() => validateTalosLocalTool(candidate)).not.toThrow()
                expect(validateTalosLocalTool(candidate).ok).toBe(false)
            }
        })
    })

    /**
     * ⛔⛔ Owner 2026-08-27 (Fase 2, finding critico #4): prima bastava che
     * la capability di compensazione ESISTESSE nel catalogo — una
     * scrittura poteva dichiarare arbitrariamente una compensazione non
     * correlata. Ora deve essere registrata come compensatrice DI QUELLA
     * capability (`compensatesFor` in capabilityCatalog.ts).
     */
    describe('la compensazione deve compensare DAVVERO quel nodo, non una capability qualsiasi', () => {
        it('rifiuta una compensazione che esiste ma non è registrata per quella capability', () => {
            const broken = structuredClone(manifest)
            ;(broken.flow.nodes[0] as any).compensation = { capability: 'notes.create', input: {} } // esiste, ma non compensa notes.list
            const result = validateTalosLocalTool(broken)
            expect(result.ok).toBe(false)
            expect(result.diagnostics.some((d) => d.code === 'FORGE_COMPENSATION_MISMATCH')).toBe(true)
        })

        it('nessuna capability built-in dichiara ancora compensatesFor — un flow di scrittura non è mai "compensable" oggi', () => {
            const write = structuredClone(manifest)
            write.flow.nodes[0]!.capability = 'tasks.create' as any
            const result = validateTalosLocalTool(write)
            expect(result.allWritesCompensated).toBe(false)
        })
    })

    describe('itemVar/indexVar di un foreach seguono la stessa grammatica di path', () => {
        it('rifiuta un itemVar pericoloso', () => {
            const broken = structuredClone(manifest)
            broken.flow.nodes.unshift({
                id: 'each', type: 'foreach', source: { $ref: '$.notes' },
                itemVar: '__proto__', maxItems: 10, body: [], next: 'list',
            } as any)
            broken.flow.entry = 'each'
            const result = validateTalosLocalTool(broken)
            expect(result.ok).toBe(false)
            expect(result.diagnostics.some((d) => d.code === 'FORGE_VAR_UNSAFE')).toBe(true)
        })
    })
})
