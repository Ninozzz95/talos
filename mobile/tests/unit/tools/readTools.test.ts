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

function listEntry(
    id: string,
    overrides: Partial<{
        displayName: string
        mediaType: string
        fileType: 'image' | 'document' | 'link'
        origin: 'uploaded' | 'generated'
        originSessionId: string | null
        originSessionTitle: string | null
        createdAt: string
        updatedAt: string
    }> = {},
) {
    return {
        id,
        displayName: `${id}.pdf`,
        mediaType: 'application/pdf',
        fileType: 'document' as const,
        origin: 'uploaded' as const,
        originSessionId: null,
        originSessionTitle: 'Conti di casa',
        createdAt: '2026-07-26T09:00:00.000Z',
        updatedAt: '2026-07-26T09:00:00.000Z',
        ...overrides,
    }
}

function sources(overrides: Record<string, unknown> = {}) {
    return {
        listLibraryEntries: vi.fn(async () => [
            listEntry('d1', { displayName: 'Fattura_novembre.txt', mediaType: 'text/plain' }),
            listEntry('d2', { displayName: 'Ricetta_ragu.txt', mediaType: 'text/plain' }),
        ]),
        listLibraryDocs: vi.fn(async () => [
            doc('d1', 'Fattura_novembre.txt', 'Fattura dello studio legale, totale 2196 euro, pagamento a trenta giorni.'),
            doc('d2', 'Ricetta_ragu.txt', 'Rosolare la cipolla e cuocere per tre ore.'),
        ]),
        readLibraryDoc: vi.fn(async (id: string) => (id === 'd1'
            ? { name: 'Fattura_novembre.txt', text: 'Totale 2196 euro.' }
            : null)),
        listNotes: vi.fn(async () => [{ id: 'note-1', title: 'Idee', content: 'comprare il pane', updated_at: '2026-07-26T08:00:00.000Z' }]),
        listTasks: vi.fn(async () => [
            { id: 'task-1', title: 'Chiamare avvocato', status: 'open', priority: 'high', description: 'per la pratica' },
            { id: 'task-2', title: 'Pagare bolletta', status: 'done', priority: 'normal', description: null },
        ]),
        searchMemories: vi.fn(async () => [{ title: 'Preferenze', content: 'Preferisce risposte brevi.' }]),
        now: vi.fn(() => '2026-07-26T10:30:00.000Z'),
        ...overrides,
    }
}

function deps() {
    return {
        // Questo test esercita il CORPO dello strumento, non il cancello: i
        // permessi vanno detti, non ereditati da un predefinito che dal
        // 2026-08-01 chiede.
        permissions: { read: 'allow' as const, write: 'allow' as const, outbound: 'allow' as const },
        isToolEnabled: () => true,
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

function completeLibraryResultIds(content: string): string[] {
    return [...content.matchAll(
        /^id: ([^\n]+)\nname: [^\n]+\norigin: [^\n]+\nfrom chat: [^\n]+\nexcerpt: [^\n]*$/gm,
    )].map((match) => match[1]!)
}

function longMatchingDocs(count: number): LibraryDoc[] {
    return Array.from({ length: count }, (_, index) => ({
        ...doc(
            `long-${index.toString().padStart(2, '0')}`,
            `needle-report-${index}-${'n'.repeat(1_200)}.md`,
            `needle result ${index} ${'body '.repeat(160)}`,
        ),
        originSessionTitle: `Long provenance chat ${index} ${'p'.repeat(700)}`,
        createdAt: `2026-07-${(index + 1).toString().padStart(2, '0')}T09:00:00.000Z`,
    }))
}

describe('read-only tool set', () => {
    it('every tool in the set is a READ — the first set cannot damage anything', () => {
        const tools = createTalosReadTools(sources())
        expect(tools.map((tool) => tool.name)).toEqual([
            'library_list', 'library_search', 'library_read', 'library_file_origin',
            'notes_list', 'tasks_list', 'memory_search', 'time_now',
        ])
        expect(tools.every((tool) => tool.action === 'read')).toBe(true)
    })

    it('P1-LIB-LIST-01 enumerates thirty Library items exactly once through opaque page tokens', async () => {
        const allEntries = Array.from({ length: 30 }, (_, index) => listEntry(
            `entry-${index.toString().padStart(2, '0')}`,
            {
                createdAt: `2026-07-${(index + 1).toString().padStart(2, '0')}T09:00:00.000Z`,
                updatedAt: `2026-07-${(index + 1).toString().padStart(2, '0')}T09:00:00.000Z`,
            },
        ))
        const tools = createTalosReadTools(sources({
            listLibraryEntries: vi.fn(async () => allEntries),
        }))
        const seen: string[] = []
        let pageToken: string | null = null
        let pages = 0

        do {
            const result = await executeTalosTool(
                byName(tools, 'library_list'),
                {
                    origin: 'all',
                    file_type: 'all',
                    page_size: 7,
                    ...(pageToken ? { page_token: pageToken } : {}),
                },
                deps(),
            )
            const evidence = result.evidence as {
                listed: string[]
                total_size: number
                returned: number
                next_page_token: string | null
            }
            expect(result.ok).toBe(true)
            expect(evidence.total_size).toBe(30)
            expect(evidence.returned).toBe(evidence.listed.length)
            expect(result.content).not.toMatch(/truncated/i)
            seen.push(...evidence.listed)
            pageToken = evidence.next_page_token
            if (pageToken) {
                expect(pageToken).toMatch(/^[A-Za-z0-9_-]+$/)
                expect(pageToken).not.toMatch(/^\d+$/)
                expect(pageToken).not.toContain(evidence.listed.at(-1)!)
            }
            pages += 1
        } while (pageToken !== null && pages < 10)

        expect(pageToken).toBeNull()
        expect(pages).toBe(5)
        expect(seen).toHaveLength(30)
        expect(new Set(seen).size).toBe(30)
        expect(new Set(seen)).toEqual(new Set(allEntries.map((entry) => entry.id)))
    })

    it('P1-LIB-LIST-02 filters origin and image/document/link without fabricated rows', async () => {
        const entries = [
            listEntry('uploaded-image', {
                displayName: 'receipt.jpg',
                mediaType: 'image/jpeg',
                fileType: 'image',
            }),
            listEntry('generated-image', {
                displayName: 'concept.webp',
                mediaType: 'image/webp',
                fileType: 'image',
                origin: 'generated',
            }),
            listEntry('generated-link', {
                displayName: 'research.md',
                mediaType: 'text/markdown',
                fileType: 'link',
                origin: 'generated',
            }),
            listEntry('uploaded-document'),
        ]
        const tools = createTalosReadTools(sources({
            listLibraryEntries: vi.fn(async () => entries),
        }))

        const result = await executeTalosTool(
            byName(tools, 'library_list'),
            {
                origin: 'generated',
                file_type: 'image',
                page_size: 20,
            },
            deps(),
        )

        expect(result.ok).toBe(true)
        expect(result.content).toContain('id: generated-image')
        expect(result.content).toContain('type: image')
        expect(result.content).not.toContain('uploaded-image')
        expect(result.content).not.toContain('generated-link')
        expect(result.content).not.toContain('uploaded-document')
        expect(result.evidence).toMatchObject({
            listed: ['generated-image'],
            total_size: 1,
            returned: 1,
            next_page_token: null,
        })
    })

    it('P1-LIB-LIST-03 rejects unknown page tokens and filter drift', async () => {
        const tools = createTalosReadTools(sources({
            listLibraryEntries: vi.fn(async () => Array.from(
                { length: 3 },
                (_, index) => listEntry(`row-${index}`),
            )),
        }))

        const unknown = await executeTalosTool(
            byName(tools, 'library_list'),
            {
                origin: 'all',
                file_type: 'all',
                page_size: 1,
                page_token: 'not-issued-by-talos',
            },
            deps(),
        )
        expect(unknown.ok).toBe(false)
        expect(unknown.content).toMatch(/expired|invalid|restart/i)

        const first = await executeTalosTool(
            byName(tools, 'library_list'),
            { origin: 'all', file_type: 'all', page_size: 1 },
            deps(),
        )
        const token = (first.evidence as { next_page_token: string }).next_page_token
        const drifted = await executeTalosTool(
            byName(tools, 'library_list'),
            {
                origin: 'generated',
                file_type: 'all',
                page_size: 1,
                page_token: token,
            },
            deps(),
        )
        expect(drifted.ok).toBe(false)
        expect(drifted.content).toMatch(/same filters|restart/i)
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

    it('P2-TOOL-01 returns an emoji-only genuine Library match', async () => {
        const tools = createTalosReadTools(sources({
            listLibraryDocs: vi.fn(async () => [
                doc('unrelated-newer', 'notes.txt', 'nothing relevant'),
                {
                    ...doc('locked-file', 'security-🔒.md', 'Private checklist'),
                    createdAt: '2026-07-01T09:00:00.000Z',
                },
            ]),
        }))

        const result = await executeTalosTool(
            byName(tools, 'library_search'),
            { query: '🔒', limit: 5 },
            deps(),
        )

        expect(result.ok).toBe(true)
        expect(result.content).toContain('id: locked-file')
        expect(result.content).not.toContain('unrelated-newer')
        expect(result.evidence).toMatchObject({
            matched: ['locked-file'],
            matched_total: 1,
        })
    })

    it('does not return score-zero Library rows as matches', async () => {
        const tools = createTalosReadTools(sources())
        const result = await executeTalosTool(
            byName(tools, 'library_search'),
            { query: 'ds4 antirez inference' },
            deps(),
        )
        expect(result.ok).toBe(true)
        expect(result.content).toContain('No document in the Library matched that.')
        expect(result.content).not.toContain('Fattura_novembre.txt')
        expect(result.content).not.toContain('Ricetta_ragu.txt')
        expect(result.evidence).toMatchObject({
            matched: [],
            matched_total: 0,
            returned: 0,
            offset: 0,
        })
    })

    it('returns a genuine Arabic Library match through the real tool executor', async () => {
        const listLibraryDocs = vi.fn(async () => [
            doc('new-unrelated', 'notes.txt', 'nothing relevant'),
            {
                ...doc('arabic-budget', 'خطة-العمل.md', 'هذه ميزانية المشروع'),
                createdAt: '2026-07-01T09:00:00.000Z',
            },
        ])
        const tools = createTalosReadTools(sources({ listLibraryDocs }))

        const result = await executeTalosTool(
            byName(tools, 'library_search'),
            { query: 'ميزانية', limit: 5, offset: 0 },
            deps(),
        )

        expect(result.ok).toBe(true)
        expect(result.content).toContain('id: arabic-budget')
        expect(result.evidence).toMatchObject({
            matched: ['arabic-budget'],
            matched_total: 1,
            returned: 1,
            next_offset: null,
        })
    })

    it('reports a bounded page and a deterministic next offset', async () => {
        const listLibraryDocs = vi.fn(async () => [
            doc('r1', 'Report-one.md', 'quarterly report alpha'),
            doc('r2', 'Report-two.md', 'quarterly report beta'),
            doc('r3', 'Report-three.md', 'quarterly report gamma'),
        ])
        const tools = createTalosReadTools(sources({ listLibraryDocs }))

        const first = await executeTalosTool(
            byName(tools, 'library_search'),
            { query: 'quarterly report', limit: 2, offset: 0 },
            deps(),
        )
        expect(first.ok).toBe(true)
        expect(first.content).toContain('showing 1-2 of 3 matching files')
        expect(first.content).toContain('Next offset: 2')
        expect(first.evidence).toMatchObject({
            matched: ['r1', 'r2'],
            matched_total: 3,
            returned: 2,
            offset: 0,
            next_offset: 2,
        })

        const second = await executeTalosTool(
            byName(tools, 'library_search'),
            { query: 'quarterly report', limit: 2, offset: 2 },
            deps(),
        )
        expect(second.ok).toBe(true)
        expect(second.content).toContain('showing 3-3 of 3 matching files')
        expect(second.content).not.toContain('Next offset:')
        expect(second.evidence).toMatchObject({
            matched: ['r3'],
            matched_total: 3,
            returned: 1,
            offset: 2,
            next_offset: null,
        })
    })

    it('counts only complete long records and points next_offset at the first omitted match', async () => {
        const allDocs = longMatchingDocs(25)
        const tools = createTalosReadTools(sources({
            listLibraryDocs: vi.fn(async () => allDocs),
        }))

        const first = await executeTalosTool(
            byName(tools, 'library_search'),
            { query: 'needle', limit: 20, offset: 0 },
            deps(),
        )
        const renderedIds = completeLibraryResultIds(first.content)
        const evidence = first.evidence as {
            matched: string[]
            returned: number
            next_offset: number | null
        }

        expect(renderedIds.length).toBeGreaterThan(0)
        expect(renderedIds.length).toBeLessThan(20)
        expect(first.content).not.toMatch(/truncated/i)
        expect(evidence.matched).toEqual(renderedIds)
        expect(evidence.returned).toBe(renderedIds.length)
        expect(evidence.next_offset).toBe(renderedIds.length)
    })

    it('reaches every long matching record exactly once by following budget-derived offsets', async () => {
        const allDocs = longMatchingDocs(25)
        const tools = createTalosReadTools(sources({
            listLibraryDocs: vi.fn(async () => allDocs),
        }))
        const seen: string[] = []
        let offset: number | null = 0
        let pages = 0

        while (offset !== null && pages < 20) {
            const result = await executeTalosTool(
                byName(tools, 'library_search'),
                { query: 'needle', limit: 20, offset },
                deps(),
            )
            const renderedIds = completeLibraryResultIds(result.content)
            const evidence = result.evidence as {
                matched: string[]
                returned: number
                next_offset: number | null
            }
            expect(result.content).not.toMatch(/truncated/i)
            expect(evidence.matched).toEqual(renderedIds)
            expect(evidence.returned).toBe(renderedIds.length)
            seen.push(...renderedIds)
            offset = evidence.next_offset
            pages += 1
        }

        expect(offset).toBeNull()
        expect(new Set(seen).size).toBe(seen.length)
        expect(new Set(seen)).toEqual(new Set(allDocs.map((entry) => entry.id)))
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

    /**
     * ⛔⭐ IL DIFETTO CHE RENDEVA INUTILIZZABILI CINQUE TOOL.
     *
     * `notes_update`, `notes_delete`, `tasks_complete`, `tasks_update` e
     * `tasks_delete` dicono tutti, nella loro descrizione, «chiama prima la
     * lista per prendere l'id — non indovinarlo dal titolo». Per settimane le
     * due liste non hanno emesso l'id da nessuna parte: né nel testo né
     * nell'evidenza. Cinque strumenti di scrittura che chiedevano un dato che
     * nessuno poteva ottenere.
     *
     * Nessun test lo copriva perché ogni test dei tool di scrittura passava
     * l'id a mano — è il punto cieco di chi prova i pezzi senza provare la
     * catena. Trovato leggendo il codice il 2026-08-07, mentre si completava il
     * CRUD delle attività per l'owner.
     */
    it('tasks_list emette l\'id, perché senza non si può cambiare niente', async () => {
        const tools = createTalosReadTools(sources())
        const result = await executeTalosTool(byName(tools, 'tasks_list'), '{}', deps())

        expect(result.content).toContain('task-1')
        expect(result.content).toContain('task-2')
        expect(result.evidence).toMatchObject({ listed: ['task-1', 'task-2'] })
    })

    it('e anche il dettaglio, che prima si vedeva solo aprendo l\'app', async () => {
        const tools = createTalosReadTools(sources())
        const result = await executeTalosTool(byName(tools, 'tasks_list'), '{}', deps())

        expect(result.content).toContain('per la pratica')
    })

    it('notes_list emette l\'id, per la stessa ragione', async () => {
        const tools = createTalosReadTools(sources())
        const result = await executeTalosTool(byName(tools, 'notes_list'), '{}', deps())

        expect(result.content).toContain('note-1')
        expect(result.evidence).toMatchObject({ listed: ['note-1'] })
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

/**
 * ⛔⛔⛔ CHE GIORNO È SI DICE, non si fa dedurre al modello.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-14
 *
 * «cosa ho in programma questo weekend?» → «Oggi è **giovedì** 14 agosto. Il
 * weekend è sabato 16 e domenica 17». Era **venerdì**, e il weekend era sabato
 * 15: gli eventi elencati erano giusti, le date con cui li ha etichettati no.
 *
 * ## Due cause nella stessa riga, e nessuna era il calendario
 *
 * 1. Si rendeva `toISOString()`, cioè **UTC**, mentre la descrizione prometteva
 *    «local». A Roma d'estate sono due ore: **fra mezzanotte e le 2 il giorno
 *    era ancora quello prima**, per ogni domanda che dice «oggi».
 * 2. Il nome del giorno non c'era, quindi il modello lo calcolava — ed è
 *    esattamente il genere di conto in cui sbaglia in silenzio.
 */
describe('time_now — la data che il modello NON deve dedurre', () => {
    async function orarioDetto(iso: string): Promise<string> {
        const tools = createTalosReadTools(sources({ now: () => iso }))
        const esito = await executeTalosTool(byName(tools, 'time_now'), {}, deps())
        return esito.content
    }

    it('⛔⛔ dice il GIORNO DELLA SETTIMANA per nome', async () => {
        // 2026-08-14 è un VENERDÌ. Il modello non deve doverlo calcolare.
        expect(await orarioDetto('2026-08-14T08:39:00.000Z')).toContain('Friday')
    })

    it('⛔ dice il FUSO, perché senza non si sa di quale «oggi» si parla', async () => {
        const detto = await orarioDetto('2026-08-14T08:39:00.000Z')
        expect(detto).toMatch(/\([A-Za-z]+\/[A-Za-z_]+\)|\(UTC\)/)
    })

    /*
     * ⛔ L'ISO resta: è ciò che serve a chi costruisce un intervallo per il
     * calendario. Si aggiunge la forma leggibile, non si sostituisce.
     */
    it('⛔ e l’ISO resta, perché serve a costruire gli intervalli', async () => {
        expect(await orarioDetto('2026-08-14T08:39:00.000Z')).toContain('2026-08-14T08:39:00.000Z')
    })
})
