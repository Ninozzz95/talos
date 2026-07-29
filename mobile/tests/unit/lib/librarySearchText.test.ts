import { describe, expect, it } from 'vitest'
import {
    matchesTalosLibrarySearchFields,
    normalizeTalosLibrarySearchText,
    scoreTalosLibrarySearchFields,
    talosLibrarySearchTerms,
} from '@/lib/librarySearchText'

describe('canonical Library search text', () => {
    it('P2-UNI-01 folds canonical accents, compatibility forms, case and whitespace', () => {
        expect(normalizeTalosLibrarySearchText('  CAFÉ\tＡＶＭ  '))
            .toBe(normalizeTalosLibrarySearchText('cafe\u0301 avm'))
        expect(normalizeTalosLibrarySearchText('  CAFÉ\tＡＶＭ  ')).toBe('café avm')
    })

    it('P2-UNI-02 preserves CJK, symbols, punctuation, emoji and ZWJ atoms', () => {
        expect(talosLibrarySearchTerms(
            '预算 € C++ 🔒 👨‍👩‍👧‍👦',
        )).toEqual([
            '预算',
            '€',
            'c++',
            '🔒',
            '👨‍👩‍👧‍👦',
        ])
    })

    it('deduplicates terms without reordering the user query', () => {
        expect(talosLibrarySearchTerms('AVM 预算 avm 🔒 🔒'))
            .toEqual(['avm', '预算', '🔒'])
    })

    it('P2-UNI-03 ignores emoji presentation selectors only in comparison keys', () => {
        expect(normalizeTalosLibrarySearchText('coffee ☕️'))
            .toBe(normalizeTalosLibrarySearchText('coffee ☕'))
        expect(matchesTalosLibrarySearchFields('☕', [{ text: 'Menu ☕️.md' }]))
            .toBe(true)
    })

    it('scores weighted fields and keeps empty-query browsing explicit', () => {
        const score = scoreTalosLibrarySearchFields('budget', [
            { text: 'budget.pdf', weight: 3 },
            { text: 'budget budget', weight: 1 },
        ])
        expect(score).toBeGreaterThan(
            scoreTalosLibrarySearchFields('budget', [{ text: 'budget.pdf' }]),
        )
        expect(matchesTalosLibrarySearchFields('   ', [{ text: 'anything' }]))
            .toBe(true)
        expect(matchesTalosLibrarySearchFields('🔒', [{ text: 'plain notes' }]))
            .toBe(false)
    })
})
