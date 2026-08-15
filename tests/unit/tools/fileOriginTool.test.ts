import { describe, expect, it, vi } from 'vitest'
import { createTalosReadTools } from '@/lib/tools/readTools'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'

/**
 * The second door of famiglia B.
 *
 * Owner's standing rule: «ogni funzione ha DUE porte — la stazione e il tool
 * chiamabile dal modello in chat; una porta sola = progettata a metà». The
 * origin card is the station. This is the other one: a model in ANOTHER chat
 * can be asked "who made this file?" and can answer.
 *
 * It sits in the `library` group on purpose, which means incognito withdraws it
 * along with the rest — asking a model to trace a file back to a conversation
 * is exactly the kind of question an anonymous chat must not be able to answer.
 */
function sources(origin: unknown) {
    return {
        listLibraryEntries: vi.fn(async () => []),
        listLibraryDocs: vi.fn(async () => []),
        readLibraryDoc: vi.fn(async () => null),
        readFileOrigin: vi.fn(async () => origin as never),
        listNotes: vi.fn(async () => []),
        listTasks: vi.fn(async () => []),
        searchMemories: vi.fn(async () => []),
        now: () => '2026-07-31T12:00:00.000Z',
    }
}

function originTool(origin: unknown) {
    const source = sources(origin)
    const tool = createTalosReadTools(source as never).find((entry) => entry.name === 'library_file_origin')
    if (!tool) throw new Error('missing tool library_file_origin')
    return { tool, source }
}

async function ask(origin: unknown, input: Record<string, unknown> = { id: 'file-1' }) {
    const { tool } = originTool(origin)
    // Through the REAL executor, because that is the path the model takes and
    // it is where the permission gate and the audit row live.
    return executeTalosTool(tool, input, {
        // Questo test esercita il CORPO dello strumento, non il cancello: i
        // permessi vanno detti, non ereditati da un predefinito che dal
        // 2026-08-01 chiede.
        permissions: { read: 'allow' as const, write: 'allow' as const, outbound: 'allow' as const },
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => { throw new Error('a read tool must never ask') }),
        audit: vi.fn(async () => {}),
        context: { sessionId: 'session-1' },
    } as never)
}

const MADE = {
    name: 'gatto.png',
    origin: 'generated' as const,
    model: 'kimi-k3',
    provider: 'moonshotai',
    createdAt: '2026-07-31T09:15:00.000Z',
    originSessionTitle: 'Sei capace di generazione immagini?',
    sourceUrl: null,
}

describe('asking a model where a file came from', () => {
    it('answers with the model, the provider and the chat', async () => {
        const result = await ask(MADE)

        expect(result.ok).toBe(true)
        expect(result.content).toContain('kimi-k3')
        expect(result.content).toContain('moonshotai')
        expect(result.content).toContain('Sei capace di generazione immagini?')
    })

    /**
     * P-05 at the tool boundary. The record REFERENCES the prompt; handing that
     * reference to a model gives it an id it cannot resolve and a thread it has
     * no business holding. The card does not show it and the tool does not
     * return it — one rule, both doors.
     */
    it('never hands over the prompt reference', async () => {
        const result = await ask({ ...MADE, promptMessageId: 'msg-42' })

        expect(JSON.stringify(result)).not.toContain('msg-42')
    })

    /**
     * The honest answer is an answer. A file with no record must not produce a
     * confident sentence, and must not produce a failure either — "I do not
     * know where this came from" is true and useful.
     */
    it('says it does not know rather than inventing a history', async () => {
        const result = await ask({
            name: 'vecchio.pdf', origin: 'unknown', model: null, provider: null,
            createdAt: null, originSessionTitle: null, sourceUrl: null,
        })

        expect(result.ok).toBe(true)
        expect(result.content.toLowerCase()).toContain('not recorded')
    })

    it('refuses a file that does not exist instead of guessing', async () => {
        const result = await ask(null)

        expect(result.ok).toBe(false)
        expect(result.content).toContain('file-1')
    })

    it('says a file was brought in by the person, when it was', async () => {
        const result = await ask({
            name: 'foto.jpg', origin: 'uploaded', model: null, provider: null,
            createdAt: '2026-07-20T08:00:00.000Z', originSessionTitle: null, sourceUrl: null,
        })

        expect(result.content.toLowerCase()).toContain('uploaded')
        expect(result.content).not.toContain('generated')
    })
})
