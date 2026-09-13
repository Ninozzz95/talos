import { describe, expect, it } from 'vitest'
import {
    rankLibraryDocs,
    selectLibraryDocsForInjection,
    buildTalosLibraryContextMessage,
    talosLibraryDisclosure,
    type LibraryDoc,
} from '@/lib/chat/libraryContext'

function doc(over: Partial<LibraryDoc> = {}): LibraryDoc {
    return {
        id: 'd1', displayName: 'notes.md', origin: 'uploaded',
        originSessionId: 's1', originSessionTitle: 'Planning chat',
        text: 'general notes', createdAt: '2026-07-01T00:00:00.000Z', ...over,
    }
}

const docs: LibraryDoc[] = [
    doc({ id: 'a', displayName: 'budget.xlsx', text: 'headcount and costs', createdAt: '2026-07-01T00:00:00.000Z', originSessionTitle: 'Finance chat' }),
    doc({ id: 'b', displayName: 'revenue-report.pdf', text: 'quarterly revenue grew; revenue mix shifted', createdAt: '2026-07-03T00:00:00.000Z', originSessionTitle: 'Q3 review' }),
    doc({ id: 'c', displayName: 'diagram.png', text: '', origin: 'generated', createdAt: '2026-07-02T00:00:00.000Z', originSessionTitle: 'Arch chat' }),
]

describe('rankLibraryDocs (hybrid keyword)', () => {
    it('ranks by relevance to the query — term frequency + name match', () => {
        const ranked = rankLibraryDocs(docs, 'revenue')
        expect(ranked[0]!.doc.id).toBe('b') // name AND repeated body term
        expect(ranked[0]!.score).toBeGreaterThan(0)
    })
    it('falls back to recency (newest first) for an empty query', () => {
        expect(rankLibraryDocs(docs, '   ').map((r) => r.doc.id)).toEqual(['b', 'c', 'a'])
    })

    it.each([
        {
            label: 'canonically equivalent accented Italian',
            query: 'déjà',
            displayName: 'appunti.txt',
            text: 'Promemoria de\u0301ja\u0300 verificato',
        },
        {
            label: 'Cyrillic',
            query: 'смета',
            displayName: 'смета-проекта.md',
            text: 'Расходы проекта',
        },
        {
            label: 'Arabic',
            query: 'ميزانية',
            displayName: 'خطة.txt',
            text: 'هذه هي ميزانية المشروع',
        },
        {
            label: 'single-code-point CJK',
            query: '京',
            displayName: '東京-viaggio.md',
            text: '旅程',
        },
        {
            label: 'full-width compatibility form',
            query: 'ＤＳ４',
            displayName: 'Citroen-DS4.pdf',
            text: 'Scheda tecnica',
        },
        {
            label: 'multi-code-point CJK substring',
            query: '预算',
            displayName: '项目预算.md',
            text: '季度计划',
        },
        {
            label: 'currency symbol only',
            query: '€',
            displayName: 'invoice-euro.pdf',
            text: 'Totale € 42',
        },
        {
            label: 'emoji only',
            query: '🔒',
            displayName: 'security-🔒.md',
            text: 'Private checklist',
        },
        {
            label: 'emoji presentation variant',
            query: '☕',
            displayName: 'menu-☕️.md',
            text: 'Coffee notes',
        },
    ])('matches $label text without falling back to unrelated recency', ({ query, displayName, text }) => {
        const multilingualDocs = [
            doc({
                id: 'unrelated-newer',
                displayName: 'unrelated.txt',
                text: 'nothing relevant',
                createdAt: '2026-07-03T00:00:00.000Z',
            }),
            doc({
                id: 'relevant-older',
                displayName,
                text,
                createdAt: '2026-07-01T00:00:00.000Z',
            }),
        ]

        const ranked = rankLibraryDocs(multilingualDocs, query)

        expect(ranked[0]!.doc.id).toBe('relevant-older')
        expect(ranked[0]!.score).toBeGreaterThan(0)
        expect(ranked[1]!.score).toBe(0)
    })
})

describe('selectLibraryDocsForInjection (auto-scaling like Claude Projects)', () => {
    it('P1-CTX-COMPAT-01 keeps broad whole-library injection when it fits the budget', () => {
        const sel = selectLibraryDocsForInjection(docs, { query: 'revenue', charBudget: 100_000, maxDocs: 50, perDocChars: 4000 })
        expect(sel.map((d) => d.id).sort()).toEqual(['a', 'b', 'c'])
    })
    it('P1-CTX-COMPAT-02 keeps broad over-budget top-K fallback', () => {
        const big = [
            doc({ id: 'x', text: 'x'.repeat(5000), displayName: 'x.txt' }),
            doc({ id: 'y', text: 'revenue '.repeat(600), displayName: 'y.txt' }),
            doc({ id: 'z', text: 'z'.repeat(5000), displayName: 'z.txt' }),
        ]
        const sel = selectLibraryDocsForInjection(big, { query: 'revenue', charBudget: 4000, maxDocs: 1, perDocChars: 2000 })
        expect(sel).toHaveLength(1)
        expect(sel[0]!.id).toBe('y') // the relevant one
    })
})

describe('buildTalosLibraryContextMessage', () => {
    it('returns the message unchanged when there are no docs', () => {
        expect(buildTalosLibraryContextMessage('hi', [], { perDocChars: 4000 })).toBe('hi')
    })
    it('wraps the user turn with an untrusted library block that carries per-doc chat provenance', () => {
        const out = buildTalosLibraryContextMessage('summarize revenue', [docs[1]!], { perDocChars: 4000 })
        expect(out).toContain('TALOS_LIBRARY_CONTEXT:')
        expect(out).toContain('untrusted')
        expect(out).toContain('revenue-report.pdf')
        expect(out).toContain('from chat "Q3 review"') // provenance the model can read
        expect(out).toContain('quarterly revenue grew')
        expect(out).toContain('USER_TASK:\nsummarize revenue')
    })
    it('truncates each document to perDocChars', () => {
        const long = doc({ id: 'l', displayName: 'l.txt', text: 'A'.repeat(9000) })
        const out = buildTalosLibraryContextMessage('q', [long], { perDocChars: 50 })
        expect(out).toContain('A'.repeat(50))
        expect(out).not.toContain('A'.repeat(51))
    })
})

describe('talosLibraryDisclosure', () => {
    it('lists what was injected, including the origin chat', () => {
        expect(talosLibraryDisclosure([docs[1]!])).toEqual([
            { id: 'b', title: 'revenue-report.pdf', origin: 'uploaded', from_session_id: 's1', from_chat: 'Q3 review', trust_level: 'untrusted' },
        ])
    })
})
