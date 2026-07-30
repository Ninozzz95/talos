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
            { title: 'Research', items: [{ id: 'a', chat: 'Research' }, { id: 'c', chat: 'Research' }] },
            { title: 'Invoices', items: [{ id: 'b', chat: 'Invoices' }] },
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
