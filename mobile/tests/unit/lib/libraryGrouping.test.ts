import { describe, expect, it } from 'vitest'
import { groupTalosLibraryByChat } from '@/lib/libraryGrouping'

/**
 * Slice 5 of the Library source cards. Links were rendered in a branch of their
 * own, so the grouping and the grid/list switch — both of which live in the file
 * branch — never reached them. The owner's report: "i link non vengono
 * raggruppati per nome e data chat e non vengono displayati in layout griglia".
 *
 * What is genuinely shared between a file and a link is the GROUPING. What is
 * not shared is the tile: a file tile carries multi-select, an actions menu, a
 * context-state pill and a generated badge, and a link has none of them.
 * Forcing both through one template would produce a component made of
 * `v-if="kind === 'file'"`, which is worse than two tiles, not better.
 *
 * So this is the shared half, extracted and pure.
 */
describe('groupTalosLibraryByChat', () => {
    const fallback = 'Not from a chat'

    it('groups by chat, keeping the order the items arrived in', () => {
        const grouped = groupTalosLibraryByChat(
            [
                { id: 'a', chat: 'Research' },
                { id: 'b', chat: 'Invoices' },
                { id: 'c', chat: 'Research' },
            ],
            (item) => item.chat,
            fallback,
        )

        expect(grouped).toEqual([
            {
                title: 'Research',
                latestAt: null,
                items: [{ id: 'a', chat: 'Research' }, { id: 'c', chat: 'Research' }],
            },
            { title: 'Invoices', latestAt: null, items: [{ id: 'b', chat: 'Invoices' }] },
        ])
    })

    it('gathers everything without a chat under one honest heading', () => {
        const grouped = groupTalosLibraryByChat(
            [{ id: 'a', chat: null }, { id: 'b', chat: 'Research' }, { id: 'c', chat: null }],
            (item) => item.chat,
            fallback,
        )

        expect(grouped.map((section) => section.title)).toEqual([fallback, 'Research'])
        expect(grouped[0]?.items).toHaveLength(2)
    })

    it('returns nothing for nothing, rather than an empty heading', () => {
        expect(groupTalosLibraryByChat([], () => null, fallback)).toEqual([])
    })

    /**
     * A chat title is user text. Two chats can be called the same thing, and a
     * chat can be called the same thing as the fallback — neither may silently
     * merge items from different places under one heading it cannot justify.
     */
    it('does not let a chat named like the fallback swallow the orphans', () => {
        const grouped = groupTalosLibraryByChat(
            [{ id: 'a', chat: null }, { id: 'b', chat: fallback }],
            (item) => item.chat,
            fallback,
        )

        // One heading, because the titles are genuinely equal on screen — but
        // the count proves nothing was dropped on the way.
        expect(grouped).toHaveLength(1)
        expect(grouped[0]?.items).toHaveLength(2)
    })
})

/**
 * Owner 2026-07-30, answering a question with a request that was not among the
 * options: «ottima trovata mettiamo nel menu a puntini un filtro per ordinare in
 * base alla data (più recente etc)» — and, on the heading itself, «non
 * dimenticare la data accanto alla chat».
 *
 * D-17 settled WHICH date: the most recent item in the section. It is the date
 * that moves when the section changes, and it is the key the new sort orders by
 * — showing a creation date while sorting by "most recent" would put a section
 * labelled March at the top and look broken.
 */
const TIMES: Record<string, string> = {
    a: '2026-07-10T09:00:00.000Z',
    b: '2026-07-28T09:00:00.000Z',
    c: '2026-07-20T09:00:00.000Z',
    d: '2026-07-02T09:00:00.000Z',
}
const ITEMS = [
    { id: 'a', chat: 'Ricerche' },
    { id: 'b', chat: 'Fatture' },
    { id: 'c', chat: 'Ricerche' },
    { id: 'd', chat: 'Fatture' },
]
const timeOf = (item: { id: string }) => TIMES[item.id] ?? null

describe('a section carries its own date', () => {
    it('dates a section by its most recent item, not its first', () => {
        const grouped = groupTalosLibraryByChat(ITEMS, (item) => item.chat, 'Altro', { timeOf })

        // Ricerche holds the 10th and the 20th; the 20th is what the heading says.
        expect(grouped.find((s) => s.title === 'Ricerche')?.latestAt).toBe(TIMES.c)
        expect(grouped.find((s) => s.title === 'Fatture')?.latestAt).toBe(TIMES.b)
    })

    it('has no date when nothing in the section has one', () => {
        const grouped = groupTalosLibraryByChat(
            [{ id: 'x', chat: 'Vuota' }],
            (item) => item.chat,
            'Altro',
            { timeOf: () => null },
        )

        // Null rather than today: a heading that invents a date is worse than a
        // heading without one.
        expect(grouped[0]?.latestAt).toBeNull()
    })

    it('ignores a time it cannot read instead of dating the section by it', () => {
        const grouped = groupTalosLibraryByChat(
            [{ id: 'good', chat: 'C' }, { id: 'bad', chat: 'C' }],
            (item) => item.chat,
            'Altro',
            { timeOf: (item) => (item.id === 'good' ? TIMES.a! : 'not a date') },
        )

        expect(grouped[0]?.latestAt).toBe(TIMES.a)
    })
})

describe('ordering the sections', () => {
    it('puts the most recently touched chat first, and its newest item first', () => {
        const grouped = groupTalosLibraryByChat(ITEMS, (item) => item.chat, 'Altro', {
            timeOf,
            sort: 'recent',
        })

        expect(grouped.map((s) => s.title)).toEqual(['Fatture', 'Ricerche'])
        expect(grouped[0]?.items.map((i) => i.id)).toEqual(['b', 'd'])
        expect(grouped[1]?.items.map((i) => i.id)).toEqual(['c', 'a'])
    })

    it('turns the whole thing around for oldest-first', () => {
        const grouped = groupTalosLibraryByChat(ITEMS, (item) => item.chat, 'Altro', {
            timeOf,
            sort: 'oldest',
        })

        expect(grouped.map((s) => s.title)).toEqual(['Ricerche', 'Fatture'])
        expect(grouped[0]?.items.map((i) => i.id)).toEqual(['a', 'c'])
    })

    /**
     * Sorting by name orders the HEADINGS. Inside one, newest still comes first:
     * whoever picked A-Z was organising the chats, not asking for their oldest
     * file to be the first thing they see.
     */
    it('orders headings alphabetically while keeping newest first inside', () => {
        const grouped = groupTalosLibraryByChat(ITEMS, (item) => item.chat, 'Altro', {
            timeOf,
            sort: 'name',
        })

        expect(grouped.map((s) => s.title)).toEqual(['Fatture', 'Ricerche'])
        expect(grouped[0]?.items.map((i) => i.id)).toEqual(['b', 'd'])
    })

    it('sorts names the way a reader would, accents and case included', () => {
        const grouped = groupTalosLibraryByChat(
            [{ id: 'a', chat: 'zebra' }, { id: 'b', chat: 'Èlite' }, { id: 'c', chat: 'alfa' }],
            (item) => item.chat,
            'Altro',
            { sort: 'name' },
        )

        expect(grouped.map((s) => s.title)).toEqual(['alfa', 'Èlite', 'zebra'])
    })

    it('leaves a dateless section at the end rather than at the top', () => {
        const grouped = groupTalosLibraryByChat(
            [{ id: 'a', chat: 'Datata' }, { id: 'x', chat: 'Senza' }],
            (item) => item.chat,
            'Altro',
            { timeOf: (item) => (item.id === 'a' ? TIMES.a! : null), sort: 'recent' },
        )

        // "Unknown" is not "newest". Sorting it to the top would put the least
        // informative heading where the eye lands first.
        expect(grouped.map((s) => s.title)).toEqual(['Datata', 'Senza'])
    })

    it('keeps the arrival order when no sort is asked for', () => {
        const grouped = groupTalosLibraryByChat(ITEMS, (item) => item.chat, 'Altro', { timeOf })

        expect(grouped.map((s) => s.title)).toEqual(['Ricerche', 'Fatture'])
        expect(grouped[0]?.items.map((i) => i.id)).toEqual(['a', 'c'])
    })
})
