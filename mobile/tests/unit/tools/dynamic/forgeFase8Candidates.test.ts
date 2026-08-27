import { describe, expect, it } from 'vitest'
import { validateTalosLocalTool } from '@/lib/tools/dynamic/validator'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 8, tre tool reali progettati da
 * TRE angolazioni diverse, tutte pensate da me in sequenza (non da
 * sub-agenti — l'owner ha fermato un dispaccio di 9 agenti a metà e ha
 * chiesto di continuare tutto inline; vedi
 * [[subagenti-sbloccati-per-la-lettura]] in memoria). Ogni manifest è
 * progettato per un bisogno REALE, poi validato con la fonte di verità
 * vera (`validateTalosLocalTool`), non affermato.
 *
 * Le tre angolazioni:
 * 1. **Chi si dimentica le cose** — una frase detta una volta diventa SIA
 *    una nota (le parole esatte sopravvivono) SIA un'attività (non marcisce
 *    in un elenco di note che nessuno rilegge).
 * 2. **Chi tiene un elenco di attività** — chiuderla con un semplice
 *    segno di spunta perde tutto ciò che è successo davvero; questo tool
 *    chiude E lascia una riflessione come memoria durevole.
 * 3. **Chi cerca nella propria memoria** — la capability `memory.search`
 *    è generica; questo la veste con un nome e uno scopo chiari, un
 *    fronte più invitante sulla stessa ricerca.
 *
 * Un vincolo REALE del DSL, scoperto progettando il primo: `resolveExpr`
 * non ha NESSUNA funzione di stringa (niente substring/concat/template) —
 * ogni campo arriva o da un letterale fisso o da un `$ref` verbatim. Non
 * si può derivare "titolo = prime 60 lettere del testo" dentro il DSL
 * stesso. `capture-and-plan` lo aggira onestamente: il titolo della nota è
 * un'etichetta fissa, il CONTENUTO è il testo verbatim.
 */

export const FASE8_CANDIDATES: Record<string, TalosLocalToolManifestV1> = {
    captureAndPlan: {
        schema: 'talos.local-tool.v1', id: 'capture-and-plan', version: 1,
        title: 'Capture and plan',
        description: 'Saves what you just said as a note (so the exact wording survives) and creates a matching task (so it doesn\'t get lost in a list nobody re-reads). One thing said, two things done.',
        createdAt: '2026-08-27T00:00:00.000Z', parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        flow: {
            entry: 'note', maxTransitions: 8,
            nodes: [
                { id: 'note', type: 'capability', capability: 'notes.create', input: { title: 'Captured', content: { $ref: '$.input.text' } }, target: '$.state.note', next: 'task' },
                { id: 'task', type: 'capability', capability: 'tasks.create', input: { title: { $ref: '$.input.text' } }, target: '$.state.task', next: 'ret' },
                { id: 'ret', type: 'return', value: { $ref: '$.state.task' } },
            ],
        },
    },
    closeWithNote: {
        schema: 'talos.local-tool.v1', id: 'close-with-note', version: 1,
        title: 'Close with a note',
        description: 'Marks a task done (or any other status) and, in the same breath, saves a short reflection as a durable memory — so future-you has real context instead of a silent checkmark.',
        createdAt: '2026-08-27T00:00:00.000Z', parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                status: { type: 'string', enum: ['todo', 'doing', 'done'] },
                reflection: { type: 'string' },
            },
            required: ['id', 'status', 'reflection'],
        },
        flow: {
            entry: 'set-status', maxTransitions: 8,
            nodes: [
                { id: 'set-status', type: 'capability', capability: 'tasks.setStatus', input: { id: { $ref: '$.input.id' }, status: { $ref: '$.input.status' } }, target: '$.state.task', next: 'reflect' },
                { id: 'reflect', type: 'capability', capability: 'memory.create', input: { title: 'Task reflection', content: { $ref: '$.input.reflection' } }, target: '$.state.memory', next: 'ret' },
                { id: 'ret', type: 'return', value: { $ref: '$.state.task' } },
            ],
        },
    },
    recallFromMemory: {
        schema: 'talos.local-tool.v1', id: 'recall-from-memory', version: 1,
        title: 'Recall from memory',
        description: 'Brings back what you\'ve told TALOS before about something specific — a friendlier front door onto memory search, one clear action instead of a raw primitive.',
        createdAt: '2026-08-27T00:00:00.000Z', parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        flow: {
            entry: 'search', maxTransitions: 8,
            nodes: [
                { id: 'search', type: 'capability', capability: 'memory.search', input: { query: { $ref: '$.input.query' } }, target: '$.state.matches', next: 'ret' },
                { id: 'ret', type: 'return', value: { $ref: '$.state.matches' } },
            ],
        },
    },
}

describe('Fase 8 — i tre candidati sono REALMENTE validi, non solo progettati sulla carta', () => {
    it.each(Object.entries(FASE8_CANDIDATES))('%s valida senza errori, con rischio e capacità coerenti', (_key, candidate) => {
        const result = validateTalosLocalTool(candidate)
        expect(result.diagnostics.filter((d) => d.level === 'error')).toEqual([])
        expect(result.ok).toBe(true)
        expect(result.risk).not.toBe('R4') // nessuno dei tre chiede conferma sempre — scritture locali semplici
    })

    it('capture-and-plan raggiunge ESATTAMENTE notes.create e tasks.create, nessun\'altra capacità', () => {
        const result = validateTalosLocalTool(FASE8_CANDIDATES.captureAndPlan)
        expect(new Set(result.capabilities)).toEqual(new Set(['notes.create', 'tasks.create']))
    })

    it('close-with-note raggiunge ESATTAMENTE tasks.setStatus e memory.create — niente di più del dichiarato', () => {
        const result = validateTalosLocalTool(FASE8_CANDIDATES.closeWithNote)
        expect(new Set(result.capabilities)).toEqual(new Set(['tasks.setStatus', 'memory.create']))
    })

    it('recall-from-memory è a SOLA LETTURA (memory.search) — rischio più basso dei due che scrivono', () => {
        const result = validateTalosLocalTool(FASE8_CANDIDATES.recallFromMemory)
        expect(result.actions).toEqual(['read'])
        expect(new Set(result.capabilities)).toEqual(new Set(['memory.search']))
    })
})
