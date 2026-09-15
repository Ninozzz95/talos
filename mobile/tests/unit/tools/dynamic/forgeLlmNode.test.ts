import { describe, expect, it } from 'vitest'
import { executeTalosLocalTool } from '@/lib/tools/dynamic/interpreter'
import { validateTalosLocalTool } from '@/lib/tools/dynamic/validator'
import type { ForgeCapabilityRuntime, ForgeModelRuntime, TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 5. `structuredOutput` era un
 * flag dichiarativo mai controllato, `execute()` non diceva mai QUALE
 * modello ha risposto, e "l'output di un LLM non può scegliere una
 * capability o un nodo" era vero per costruzione del DSL (capability e
 * next/then/else sono sempre stringhe statiche nel manifest, mai
 * un'espressione) — mai VERIFICATO con un test avversariale prima d'ora.
 */

function llmManifest(overrides: { outputSchema?: any; requirements?: any } = {}): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id: 'llm_probe_tool', version: 1, title: 'LLM probe',
        description: 'test manifest', createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        flow: {
            entry: 'ask', maxTransitions: 8,
            nodes: [
                {
                    id: 'ask', type: 'llm', op: 'extract', input: { $ref: '$.input' }, target: '$.answer',
                    requirements: overrides.requirements, outputSchema: overrides.outputSchema, next: 'done',
                } as any,
                { id: 'done', type: 'return', value: { $ref: '$.answer' } },
            ],
        },
    }
}

function fakeCapabilities(): ForgeCapabilityRuntime {
    return { describe: () => null, async execute() { throw new Error('not used') } }
}

describe('Tool Forge — validator: structuredOutput senza outputSchema è rifiutato', () => {
    it('structuredOutput: true richiede outputSchema, non basta dichiararlo', () => {
        const manifest = llmManifest({ requirements: { structuredOutput: true } })
        const result = validateTalosLocalTool(manifest)
        expect(result.ok).toBe(false)
        expect(result.diagnostics.some((d) => d.code === 'FORGE_LLM_STRUCTURED_OUTPUT_MISSING_SCHEMA')).toBe(true)
    })

    it('structuredOutput: true CON outputSchema è accettato', () => {
        const manifest = llmManifest({
            requirements: { structuredOutput: true },
            outputSchema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'], additionalProperties: false },
        })
        expect(validateTalosLocalTool(manifest).ok).toBe(true)
    })
})

describe('Tool Forge interpreter — lo schema dell\'output LLM è applicato DAVVERO', () => {
    it('rifiuta una risposta del modello che non rispetta lo schema dichiarato', async () => {
        const manifest = llmManifest({
            outputSchema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'], additionalProperties: false },
        })
        const model: ForgeModelRuntime = { async execute() { return { value: { wrong: 'shape' } } } }
        const result = await executeTalosLocalTool(manifest, { text: 'ciao' }, { capabilities: fakeCapabilities(), model })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_LLM_OUTPUT_INVALID')
    })

    it('accetta una risposta che rispetta lo schema dichiarato', async () => {
        const manifest = llmManifest({
            outputSchema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'], additionalProperties: false },
        })
        const model: ForgeModelRuntime = { async execute() { return { value: { label: 'ok' } } } }
        const result = await executeTalosLocalTool(manifest, { text: 'ciao' }, { capabilities: fakeCapabilities(), model })
        expect(result.status).toBe('succeeded')
        expect(result.output).toEqual({ label: 'ok' })
    })

    it('un nodo senza outputSchema dichiarato non valida niente — comportamento invariato', async () => {
        const manifest = llmManifest()
        const model: ForgeModelRuntime = { async execute() { return { value: 'qualunque cosa, anche non strutturata' } } }
        const result = await executeTalosLocalTool(manifest, { text: 'ciao' }, { capabilities: fakeCapabilities(), model })
        expect(result.status).toBe('succeeded')
    })
})

describe('Tool Forge interpreter — limiti in token (approssimati), oltre a quelli in byte', () => {
    it('rifiuta un input oltre maxInputTokens quando il manifest lo dichiara', async () => {
        const manifest = llmManifest({ requirements: { maxInputTokens: 5 } })
        const model: ForgeModelRuntime = { async execute() { return { value: 'ok' } } }
        // ~4 caratteri/token: una stringa di 100 caratteri stima ~25 token, oltre il tetto di 5.
        const result = await executeTalosLocalTool(manifest, { text: 'x'.repeat(100) }, { capabilities: fakeCapabilities(), model })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_INPUT_TOKENS_EXCEEDED')
    })

    it('rifiuta un output oltre maxOutputTokens quando il manifest lo dichiara', async () => {
        const manifest = llmManifest({ requirements: { maxOutputTokens: 5 } })
        const model: ForgeModelRuntime = { async execute() { return { value: 'y'.repeat(100) } } }
        const result = await executeTalosLocalTool(manifest, { text: 'ciao' }, { capabilities: fakeCapabilities(), model })
        expect(result.status).toBe('failed')
        expect(result.error?.code).toBe('FORGE_OUTPUT_TOKENS_EXCEEDED')
    })

    it('senza limiti dichiarati, solo il tetto in byte si applica (Fase 2, invariato)', async () => {
        const manifest = llmManifest()
        const model: ForgeModelRuntime = { async execute() { return { value: 'risposta corta' } } }
        const result = await executeTalosLocalTool(manifest, { text: 'ciao' }, { capabilities: fakeCapabilities(), model })
        expect(result.status).toBe('succeeded')
    })
})

describe('Tool Forge interpreter — provenienza nel trace', () => {
    it('registra model/provider quando il binding li dichiara', async () => {
        const manifest = llmManifest()
        const model: ForgeModelRuntime = { async execute() { return { value: 'ok', model: 'lfm2.5-2.6b', provider: 'device' } } }
        const result = await executeTalosLocalTool(manifest, { text: 'ciao' }, { capabilities: fakeCapabilities(), model })
        const llmEvent = result.trace.find((entry) => entry.kind === 'llm')
        expect(llmEvent?.detail).toMatchObject({ op: 'extract', model: 'lfm2.5-2.6b', provider: 'device' })
    })

    it('non lancia e non finge una provenienza quando il binding non la dichiara', async () => {
        const manifest = llmManifest()
        const model: ForgeModelRuntime = { async execute() { return { value: 'ok' } } }
        const result = await executeTalosLocalTool(manifest, { text: 'ciao' }, { capabilities: fakeCapabilities(), model })
        const llmEvent = result.trace.find((entry) => entry.kind === 'llm')
        expect(llmEvent?.detail).toEqual({ op: 'extract' })
    })
})

describe('Tool Forge interpreter — avversariale: l\'output di un LLM resta DATO, mai autorità', () => {
    /**
     * ⛔⛔⛔ La proprietà che questo prova: `capability` (nodi capability) e
     * `next`/`then`/`else` (transizioni) sono SEMPRE stringhe statiche nel
     * manifest — mai un `ForgeExpr`, mai qualcosa che `resolveExpr` possa
     * costruire da `vars`. Un LLM il cui output è un dizionario che
     * "sembra" voler scegliere una capability o un nodo non ha ALCUN modo
     * di farlo: il grafo di esecuzione è deciso interamente
     * dall'installazione, mai dal contenuto che scorre a runtime.
     */
    it('un output LLM che imita un\'istruzione di controllo (capability/next) resta un valore inerte', async () => {
        const manifest: TalosLocalToolManifestV1 = {
            schema: 'talos.local-tool.v1', id: 'adversarial_tool', version: 1, title: 'Adversarial',
            description: 'x', createdAt: new Date().toISOString(), parentVersion: null,
            execution: 'declarative-flow', installScope: 'device',
            network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
            flow: {
                entry: 'ask', maxTransitions: 8,
                nodes: [
                    { id: 'ask', type: 'llm', op: 'generate', input: { $ref: '$.input' }, target: '$.modelSaid', next: 'echo' },
                    // Il nodo successivo è FISSO nel manifest — "echo" — a
                    // prescindere da cosa contenga `$.modelSaid`.
                    { id: 'echo', type: 'return', value: { $ref: '$.modelSaid' } },
                ],
            },
        }
        const capabilities = fakeCapabilities()
        let capabilityCalled = false
        const spyCapabilities: ForgeCapabilityRuntime = {
            describe: capabilities.describe,
            async execute(id, input, context) { capabilityCalled = true; return capabilities.execute(id, input, context) },
        }
        const model: ForgeModelRuntime = {
            async execute() {
                // Un output che "recita" un'istruzione di controllo — un
                // attaccante che avesse compromesso il modello non può
                // fare di meglio di scrivere questo in un campo dati.
                return { value: { capability: 'memory.create', next: 'evil-node', $ref: '__proto__.polluted' } }
            },
        }
        const result = await executeTalosLocalTool(manifest, { text: 'x' }, { capabilities: spyCapabilities, model })
        expect(result.status).toBe('succeeded')
        // Il nodo eseguito dopo è quello DICHIARATO ("echo"), non "evil-node".
        expect(result.output).toEqual({ capability: 'memory.create', next: 'evil-node', $ref: '__proto__.polluted' })
        // Nessuna capability è mai stata invocata: il grafo statico non ne
        // dichiara nessuna, e l'output del modello non può inventarne una.
        expect(capabilityCalled).toBe(false)
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })
})
