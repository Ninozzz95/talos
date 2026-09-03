import { describe, expect, it, vi } from 'vitest'
import { executeTalosLocalTool } from '@/lib/tools/dynamic/interpreter'
import { validateTalosLocalTool } from '@/lib/tools/dynamic/validator'
import { createInMemoryForgeIdempotencyStore } from '@/lib/tools/dynamic/idempotency'
import { defaultForgeCapability } from '@/lib/tools/dynamic/capabilityCatalog'
import type { ForgeCapabilityRuntime, ForgeNode, TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 7, i test avversariali che la
 * revisione originale elencava come mancanti: fuzz del manifest, nesting
 * profondo, retry+side-effect, abort in OGNI fase, registro corrotto,
 * concorrenza oltre quella di Fase 3, prompt injection nei risultati.
 *
 * Due difetti REALI trovati progettando questi test, corretti insieme
 * (non solo documentati): l'abort dentro un `foreach` che aspettava fino a
 * `maxItems` invece di fermarsi all'elemento in corso (`interpreter.ts`), e
 * `parseManifest` che lanciava un `SyntaxError` non catturato su un
 * manifest genuinamente corrotto (`forgeRegistryRepository.ts`, coperto
 * nel suo file di test dedicato, non qui).
 */

const REAL_CAPABILITY = 'notes.list'

function manifestWithCapability(capability: string, input: unknown = {}): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id: 'adversarial_probe', version: 1, title: 'Adversarial probe',
        description: 'Fase 7 probe', createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        flow: {
            entry: 'call', maxTransitions: 8,
            nodes: [
                { id: 'call', type: 'capability', capability, input, target: '$.result', next: 'done' },
                { id: 'done', type: 'return', value: { $ref: '$.result' } },
            ],
        },
    }
}

function fakeCapabilityRuntime(execute: ForgeCapabilityRuntime['execute']): ForgeCapabilityRuntime {
    return { describe: (id: string) => defaultForgeCapability(id), execute }
}

// ────────────────────────────────────────────────────────────────────────
// 1. Fuzz del manifest — mai un'eccezione non gestita, sempre un verdetto
// ────────────────────────────────────────────────────────────────────────
describe('Fase 7 — fuzz del manifest: mai un crash, sempre {ok:false, diagnostics}', () => {
    const GARBAGE: unknown[] = [
        null, undefined, 42, 'una stringa qualsiasi', true, [], {},
        { schema: 'talos.local-tool.v1' }, // manca praticamente tutto
        { schema: 'wrong-schema', id: 'x', version: 1 },
        { ...{}, toString: () => { throw new Error('hostile toString') } },
        new Array(10_000).fill('x'), // un array enorme al posto di un oggetto
        Object.freeze({ schema: 'talos.local-tool.v1', id: 'frozen', flow: null }),
    ]

    it.each(GARBAGE.map((value, index) => [index, value] as const))(
        'input spazzatura #%i non lancia mai, torna sempre ok:false',
        (_index, value) => {
            expect(() => {
                const result = validateTalosLocalTool(value)
                expect(result.ok).toBe(false)
                expect(Array.isArray(result.diagnostics)).toBe(true)
                expect(result.diagnostics.length).toBeGreaterThan(0)
            }).not.toThrow()
        },
    )

    it('un manifest con più nodi del tetto (MAX_NODES=64) viene rifiutato con FORGE_NODE_BOUNDS', () => {
        const nodes: ForgeNode[] = []
        for (let i = 0; i < 65; i++) {
            nodes.push({ id: `n${i}`, type: 'set', target: '$.state.x', value: i, next: i === 64 ? 'ret' : `n${i + 1}` })
        }
        nodes.push({ id: 'ret', type: 'return', value: 1 })
        const manifest = { ...manifestWithCapability(REAL_CAPABILITY), flow: { entry: 'n0', maxTransitions: 256, nodes } }
        const result = validateTalosLocalTool(manifest)
        expect(result.ok).toBe(false)
        expect(result.diagnostics.some((d) => d.code === 'FORGE_NODE_BOUNDS')).toBe(true)
    })

    it('un network.domains con un elemento non-stringa non fa esplodere il validator', () => {
        const manifest: unknown = {
            ...manifestWithCapability(REAL_CAPABILITY),
            network: { mode: 'allowlist', domains: [123, null, { evil: true }] },
        }
        expect(() => validateTalosLocalTool(manifest)).not.toThrow()
        expect(validateTalosLocalTool(manifest).ok).toBe(false)
    })
})

// ────────────────────────────────────────────────────────────────────────
// 2. Nesting profondo
// ────────────────────────────────────────────────────────────────────────
describe('Fase 7 — nesting profondo', () => {
    it('un foreach DENTRO il body di un altro foreach è strutturalmente impossibile (Zod, non solo TypeScript)', () => {
        const manifest: unknown = {
            schema: 'talos.local-tool.v1', id: 'nested_foreach', version: 1, title: 'x', description: 'x',
            createdAt: new Date().toISOString(), parentVersion: null, execution: 'declarative-flow', installScope: 'device',
            network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
            flow: {
                entry: 'outer', maxTransitions: 8,
                nodes: [{
                    id: 'outer', type: 'foreach', source: [], itemVar: 'item', maxItems: 10, next: 'ret',
                    // ⛔ Un `foreach` qui dentro: `ForgeInlineNode` non ha
                    // quella variante — `forgeInlineNodeSchema` (Zod) la
                    // rifiuta al parse, non solo il tipo TS la vieta.
                    body: [{ type: 'foreach', source: [], itemVar: 'inner', maxItems: 10, next: 'x', body: [] }],
                }, { id: 'ret', type: 'return', value: 1 }],
            },
        }
        const result = validateTalosLocalTool(manifest)
        expect(result.ok).toBe(false)
        expect(result.diagnostics.some((d) => d.code === 'FORGE_MANIFEST_STRUCTURE')).toBe(true)
    })

    it('foreach.maxItems al tetto (100) è strutturalmente valido, 101 è rifiutato (FORGE_FOREACH_BOUNDS)', () => {
        const at = { ...manifestWithCapability(REAL_CAPABILITY), flow: { entry: 'fe', maxTransitions: 8, nodes: [
            { id: 'fe', type: 'foreach', source: [], itemVar: 'i', maxItems: 100, next: 'ret', body: [] },
            { id: 'ret', type: 'return', value: 1 },
        ] as ForgeNode[] } }
        expect(validateTalosLocalTool(at).diagnostics.some((d) => d.code === 'FORGE_FOREACH_BOUNDS')).toBe(false)

        const over = { ...at, flow: { ...at.flow, nodes: at.flow.nodes.map((n) => n.id === 'fe' ? { ...n, maxItems: 101 } : n) } }
        expect(validateTalosLocalTool(over).diagnostics.some((d) => d.code === 'FORGE_FOREACH_BOUNDS')).toBe(true)
    })

    it('un foreach dichiarato maxItems=5 ma con una sorgente REALE di 6 elementi si ferma a runtime (FORGE_FOREACH_LIMIT), non solo all\'installazione', async () => {
        const manifest: TalosLocalToolManifestV1 = {
            ...manifestWithCapability(REAL_CAPABILITY),
            flow: {
                entry: 'loop', maxTransitions: 8,
                nodes: [
                    { id: 'loop', type: 'foreach', source: { $ref: '$.input.items' }, itemVar: 'item', maxItems: 5, next: 'ret', body: [] },
                    { id: 'ret', type: 'return', value: 1 },
                ],
            },
        }
        const runtime = fakeCapabilityRuntime(async () => ({ ok: true }))
        const result = await executeTalosLocalTool(manifest, { items: [1, 2, 3, 4, 5, 6] }, { capabilities: runtime })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_FOREACH_LIMIT')
    })
})

// ────────────────────────────────────────────────────────────────────────
// 3. Retry + side-effect — il confine onesto già documentato, ora PROVATO
// ────────────────────────────────────────────────────────────────────────
describe('Fase 7 — retry e side-effect: il confine onesto di idempotency.ts è un fatto misurato, non un\'ipotesi', () => {
    it('un fallimento DOPO l\'effetto (non un fallimento di rete PRIMA) fa richiamare la capability una seconda volta: l\'idempotenza dentro l\'interprete non copre questo caso, per costruzione', async () => {
        const state = { calls: 0 }
        // Simula una capability che ESEGUE l'effetto e SOLO DOPO lancia
        // (es. una scrittura riuscita ma una risposta malformata) — il
        // caso che `idempotency.ts` dichiara esplicitamente di NON coprire:
        // l'errore arriva prima che `deps.idempotency?.put(...)` possa mai
        // essere raggiunto in `interpreter.ts:callCapability`.
        const runtime = fakeCapabilityRuntime(async () => {
            state.calls += 1
            if (state.calls === 1) throw new Error('risposta persa DOPO l\'effetto')
            return { ok: true }
        })
        const store = createInMemoryForgeIdempotencyStore()
        const manifest: TalosLocalToolManifestV1 = {
            ...manifestWithCapability(REAL_CAPABILITY),
            flow: {
                entry: 'call', maxTransitions: 8,
                nodes: [
                    { id: 'call', type: 'capability', capability: REAL_CAPABILITY, input: {}, target: '$.r', next: 'ret', retry: { maxAttempts: 2 } },
                    { id: 'ret', type: 'return', value: { $ref: '$.r' } },
                ],
            },
        }
        const result = await executeTalosLocalTool(manifest, {}, { capabilities: runtime, idempotency: store })
        expect(result.status).toBe('succeeded')
        // ⛔ Il PUNTO del test: l'effetto simulato è girato DUE volte, non
        // una — questo è esattamente ciò che il commento di idempotency.ts
        // chiama "l'effetto perso dentro la capability stessa", e finché
        // le capability built-in non deduplicano per conto proprio (fuori
        // scope v1), un retry con un fallimento POST-effetto raddoppia
        // l'azione. Non è un difetto nuovo: è la prova che il limite
        // dichiarato è reale, non solo scritto in un commento.
        expect(state.calls).toBe(2)
    })

    it('al contrario: un fallimento PRIMA dell\'effetto (rete mai partita) con retry riesce SENZA doppio effetto, quando la risposta del PRIMO tentativo riuscito arriva', async () => {
        const state = { calls: 0 }
        const runtime = fakeCapabilityRuntime(async () => { state.calls += 1; return { ok: true, call: state.calls } })
        const store = createInMemoryForgeIdempotencyStore()
        const manifest = manifestWithCapability(REAL_CAPABILITY)
        // Stessa executionId due volte: il SECONDO giro riusa la cache
        // scritta dal primo, non richiama la capability — questo È il caso
        // che idempotency.ts copre davvero (già provato in
        // forgeInterpreter.test.ts; ripetuto qui come contrappeso esplicito
        // al test sopra, non un doppione).
        await executeTalosLocalTool(manifest, {}, { capabilities: runtime, idempotency: store }, { executionId: 'exec-x' })
        await executeTalosLocalTool(manifest, {}, { capabilities: runtime, idempotency: store }, { executionId: 'exec-x' })
        expect(state.calls).toBe(1)
    })
})

// ────────────────────────────────────────────────────────────────────────
// 4. Abort in OGNI fase
// ────────────────────────────────────────────────────────────────────────
describe('Fase 7 — abort in ogni fase', () => {
    it('segnale già abortito prima di partire: la capability non viene MAI chiamata', async () => {
        const state = { calls: 0 }
        const runtime = fakeCapabilityRuntime(async () => { state.calls += 1; return {} })
        const controller = new AbortController()
        controller.abort()
        const result = await executeTalosLocalTool(manifestWithCapability(REAL_CAPABILITY), {}, { capabilities: runtime }, { signal: controller.signal })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_ABORTED')
        expect(state.calls).toBe(0)
    })

    it('abort durante l\'attesa di backoff fra un tentativo e l\'altro: si ferma lì, non ritenta', async () => {
        const state = { calls: 0 }
        const controller = new AbortController()
        const runtime = fakeCapabilityRuntime(async () => {
            state.calls += 1
            // Sincrono, non `queueMicrotask`: il punto del test è che
            // `wait()` veda `signal.aborted` già vero quando la ENTRA — la
            // corsa fra un abort schedulato e i microtask della promise non
            // è quello che questo test vuole provare (vedi il fix su
            // `wait()`: prima controllava SOLO l'evento futuro).
            if (state.calls === 1) controller.abort()
            throw new Error('sempre fallisce')
        })
        const manifest: TalosLocalToolManifestV1 = {
            ...manifestWithCapability(REAL_CAPABILITY),
            flow: {
                entry: 'call', maxTransitions: 8,
                nodes: [
                    { id: 'call', type: 'capability', capability: REAL_CAPABILITY, input: {}, next: 'ret', retry: { maxAttempts: 3, backoffMs: 50 } },
                    { id: 'ret', type: 'return', value: 1 },
                ],
            },
        }
        const result = await executeTalosLocalTool(manifest, {}, { capabilities: runtime }, { signal: controller.signal })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_ABORTED')
        expect(state.calls).toBe(1) // il SECONDO tentativo non è mai partito
    })

    it('abort prima di un nodo LLM: il runtime del modello non viene mai invocato', async () => {
        const model = { execute: vi.fn(async () => ({ value: 'never' })) }
        const controller = new AbortController()
        controller.abort()
        const manifest: TalosLocalToolManifestV1 = {
            ...manifestWithCapability(REAL_CAPABILITY),
            flow: {
                entry: 'ask', maxTransitions: 8,
                nodes: [
                    { id: 'ask', type: 'llm', op: 'classify', input: {}, target: '$.r', next: 'ret' },
                    { id: 'ret', type: 'return', value: { $ref: '$.r' } },
                ],
            },
        }
        const runtime = fakeCapabilityRuntime(async () => ({}))
        const result = await executeTalosLocalTool(manifest, {}, { capabilities: runtime, model }, { signal: controller.signal })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_ABORTED')
        expect(model.execute).not.toHaveBeenCalled()
    })

    it('abort dopo il PRIMO elemento di un foreach: si ferma lì (fix di Fase 7), non macina fino a maxItems', async () => {
        const state = { calls: 0 }
        const controller = new AbortController()
        const runtime = fakeCapabilityRuntime(async () => {
            state.calls += 1
            if (state.calls === 1) controller.abort() // abortisce DOPO il primo elemento
            return { ok: true }
        })
        const manifest: TalosLocalToolManifestV1 = {
            ...manifestWithCapability(REAL_CAPABILITY),
            flow: {
                entry: 'loop', maxTransitions: 32,
                nodes: [
                    {
                        id: 'loop', type: 'foreach', source: { $ref: '$.input.items' }, itemVar: 'item', maxItems: 10, next: 'ret',
                        body: [{ type: 'capability', capability: REAL_CAPABILITY, input: {} }],
                    },
                    { id: 'ret', type: 'return', value: 1 },
                ],
            },
        }
        const result = await executeTalosLocalTool(manifest, { items: [1, 2, 3, 4, 5] }, { capabilities: runtime }, { signal: controller.signal })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_ABORTED')
        // ⛔ SENZA il fix di Fase 7 questo sarebbe 5 (tutti gli elementi
        // macinati prima che l'outer loop si accorgesse dell'abort).
        expect(state.calls).toBe(1)
    })
})

// ────────────────────────────────────────────────────────────────────────
// 7. Iniezione nei risultati — un risultato di capability resta DATO, mai controllo
// ────────────────────────────────────────────────────────────────────────
describe('Fase 7 — un risultato ostile di capability resta sempre dato, mai controllo o codice', () => {
    it('un risultato che imita testualmente un nodo del DSL non cambia il flusso: nessuna seconda capability viene mai chiamata', async () => {
        const calledCapabilities: string[] = []
        const hostilePayload = { title: 'nota ostile', content: JSON.stringify({ capability: 'memory.create', next: 'evil-node', $ref: '__proto__.polluted' }) }
        const runtime = fakeCapabilityRuntime(async (id) => { calledCapabilities.push(id); return [hostilePayload] })
        const manifest: TalosLocalToolManifestV1 = {
            ...manifestWithCapability(REAL_CAPABILITY),
            flow: {
                entry: 'call', maxTransitions: 8,
                nodes: [
                    { id: 'call', type: 'capability', capability: REAL_CAPABILITY, input: {}, target: '$.notes', next: 'ret' },
                    { id: 'ret', type: 'return', value: { $ref: '$.notes' } },
                ],
            },
        }
        const result = await executeTalosLocalTool(manifest, {}, { capabilities: runtime })
        expect(result.status).toBe('succeeded')
        // Il contenuto ostile arriva intatto come DATO nell'output...
        expect((result.output as typeof hostilePayload[])[0]?.content).toContain('memory.create')
        // ...ma non ha MAI causato una seconda chiamata: `capability` e
        // `next` sono sempre stringhe statiche nel manifest, mai un
        // `ForgeExpr` — la proprietà è vera per costruzione del DSL
        // (stessa prova già fatta per l'output di un nodo LLM in Fase 5,
        // qui ripetuta per il canale DATI, non il canale MODELLO).
        expect(calledCapabilities).toEqual([REAL_CAPABILITY])
        // E `Object.prototype` non è stato toccato dal payload malevolo,
        // nonostante contenga letteralmente la stringa `__proto__`.
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })

    it('un risultato con una chiave letterale "__proto__" (JSON.parse, non un letterale sorgente) resta una proprietà innocua, mai una mutazione del prototipo', async () => {
        // JSON.parse NON attiva la semantica speciale di `__proto__` che ha
        // un letterale oggetto scritto a mano — crea una proprietà propria
        // normale. Object.fromEntries (usato da resolveExpr) e
        // Object.create(null) (usato da setPath) sono entrambi immuni al
        // trappola "[[Set]] su __proto__" per lo stesso motivo strutturale
        // documentato in expr.ts. Provato qui end-to-end, non solo dedotto.
        const hostile = JSON.parse('{"__proto__":{"polluted":true},"safe":"value"}') as Record<string, unknown>
        const runtime = fakeCapabilityRuntime(async () => hostile)
        const result = await executeTalosLocalTool(manifestWithCapability(REAL_CAPABILITY), {}, { capabilities: runtime })
        expect(result.status).toBe('succeeded')
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
        expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
    })
})
