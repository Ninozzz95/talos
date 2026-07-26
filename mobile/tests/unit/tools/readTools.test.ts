import { describe, expect, it, vi } from 'vitest'
import { createTalosReadTools } from '@/lib/tools/readTools'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'
import type { LibraryDoc } from '@/lib/chat/libraryContext'

/**
 * The first tool set, driven through the real executor rather than called
 * directly — that is the path the model will take, and it is where the
 * permission gate and the audit row live.
 */
function doc(id: string, name: string, text: string): LibraryDoc {
    return {
        id,
        displayName: name,
        origin: 'uploaded',
        originSessionId: null,
        originSessionTitle: 'Conti di casa',
        createdAt: '2026-07-26T09:00:00.000Z',
        text,
    }
}

function sources(overrides: Record<string, unknown> = {}) {
    return {
        listLibraryDocs: vi.fn(async () => [
            doc('d1', 'Fattura_novembre.txt', 'Fattura dello studio legale, totale 2196 euro, pagamento a trenta giorni.'),
            doc('d2', 'Ricetta_ragu.txt', 'Rosolare la cipolla e cuocere per tre ore.'),
        ]),
        readLibraryDoc: vi.fn(async (id: string) => (id === 'd1'
            ? { name: 'Fattura_novembre.txt', text: 'Totale 2196 euro.' }
            : null)),
        listNotes: vi.fn(async () => [{ title: 'Idee', content: 'comprare il pane', updated_at: '2026-07-26T08:00:00.000Z' }]),
        listTasks: vi.fn(async () => [
            { title: 'Chiamare avvocato', status: 'open', priority: 'high' },
            { title: 'Pagare bolletta', status: 'done', priority: 'normal' },
        ]),
        searchMemories: vi.fn(async () => [{ title: 'Preferenze', content: 'Preferisce risposte brevi.' }]),
        now: vi.fn(() => '2026-07-26T10:30:00.000Z'),
        ...overrides,
    }
}

function deps() {
    return {
        permissions: TALOS_DEFAULT_TOOL_PERMISSIONS,
        requestConsent: vi.fn(async () => { throw new Error('a read tool must never ask') }),
        audit: vi.fn(async () => {}),
        context: { sessionId: 'session-1' },
    }
}

function byName(tools: ReturnType<typeof createTalosReadTools>, name: string) {
    const tool = tools.find((entry) => entry.name === name)
    if (!tool) throw new Error(`missing tool ${name}`)
    return tool
}

describe('read-only tool set', () => {
    it('every tool in the set is a READ — the first set cannot damage anything', () => {
        const tools = createTalosReadTools(sources())
        expect(tools.map((tool) => tool.name)).toEqual([
            'library_search', 'library_read', 'notes_list', 'tasks_list', 'memory_search', 'time_now',
        ])
        expect(tools.every((tool) => tool.action === 'read')).toBe(true)
    })

    it('library_search returns ids, names and provenance so the model can cite and re-read', async () => {
        const tools = createTalosReadTools(sources())
        const result = await executeTalosTool(byName(tools, 'library_search'), '{"query":"fattura avvocato"}', deps())
        expect(result.ok).toBe(true)
        expect(result.content).toContain('id: d1')
        expect(result.content).toContain('Fattura_novembre.txt')
        // Provenance travels with the answer: which chat the document came from.
        expect(result.content).toContain('Conti di casa')
    })

    it('library_read refuses an id that does not exist instead of inventing one', async () => {
        const tools = createTalosReadTools(sources())
        const result = await executeTalosTool(byName(tools, 'library_read'), { id: 'nope' }, deps())
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/no library document/i)
    })

    it('tasks_list filters by status', async () => {
        const tools = createTalosReadTools(sources())
        const open = await executeTalosTool(byName(tools, 'tasks_list'), '{"status":"open"}', deps())
        expect(open.content).toContain('Chiamare avvocato')
        expect(open.content).not.toContain('Pagare bolletta')
    })

    it('time_now takes no arguments and answers from the device clock', async () => {
        const tools = createTalosReadTools(sources())
        const result = await executeTalosTool(byName(tools, 'time_now'), '{}', deps())
        expect(result.content).toContain('2026-07-26T10:30:00.000Z')
    })

    it('a huge document is truncated, and says so rather than silently cutting', async () => {
        const long = 'x'.repeat(20_000)
        const tools = createTalosReadTools(sources({
            readLibraryDoc: vi.fn(async () => ({ name: 'Enorme.txt', text: long })),
        }))
        const result = await executeTalosTool(byName(tools, 'library_read'), { id: 'whatever' }, deps())
        expect(result.content.length).toBeLessThan(9_500)
        expect(result.content).toMatch(/truncated/i)
    })

    it('a source that throws surfaces as a failed result, and the run is audited', async () => {
        const audit = vi.fn(async () => {})
        const tools = createTalosReadTools(sources({
            listLibraryDocs: vi.fn(async () => { throw new Error('storage unavailable') }),
        }))
        const result = await executeTalosTool(byName(tools, 'library_search'), '{"query":"x"}', { ...deps(), audit })
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/storage unavailable/)
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    })
})
