import { describe, expect, it } from 'vitest'
import { pageTalosLibrarySections } from '@/lib/libraryPagination'

describe('Library rendering pages', () => {
    const sections = [
        { title: 'First chat', latestAt: null, items: [1, 2, 3] },
        { title: 'Second chat', latestAt: null, items: [4, 5, 6] },
    ]
    it('LIB-PAGE-01 applies one budget across section boundaries', () => {
        expect(pageTalosLibrarySections(sections, 4)).toEqual([
            sections[0], { ...sections[1], items: [4] },
        ])
    })
    it('LIB-PAGE-02 appends without duplicates or reordered earlier entries', () => {
        const first = pageTalosLibrarySections(sections, 4).flatMap(s => s.items)
        const next = pageTalosLibrarySections(sections, 6).flatMap(s => s.items)
        expect(next.slice(0, first.length)).toEqual(first)
        expect(next).toEqual([1, 2, 3, 4, 5, 6])
    })
    it('LIB-PAGE-03 handles empty/exhausted pages without mutating the collection', () => {
        const before = structuredClone(sections)
        expect(pageTalosLibrarySections(sections, 0)).toEqual([])
        expect(pageTalosLibrarySections(sections, 100)).toEqual(sections)
        expect(sections).toEqual(before)
    })
})
