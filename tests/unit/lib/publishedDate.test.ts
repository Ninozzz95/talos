import { describe, expect, it } from 'vitest'
import { talosPublishedOn } from '@/lib/publishedDate'

/**
 * The dates a search engine hands back, made readable.
 *
 * Found by walking the tablet on 2026-08-03: the report page listed sources as
 * `2023-12-10T08:00:33+01:00`, on the same screen the owner had just asked to
 * be rid of technical notation.
 */
describe('a publication date, as a person writes one', () => {
    it('drops the time of day, which was never information', () => {
        expect(talosPublishedOn('2023-12-10T08:00:33+01:00', 'it')).toBe('10 dicembre 2023')
        expect(talosPublishedOn('2023-12-10T08:00:33+01:00', 'en')).toBe('December 10, 2023')
    })

    it('reads a bare calendar day too', () => {
        expect(talosPublishedOn('2005-06-23', 'it')).toBe('23 giugno 2005')
    })

    it('keeps the publisher’s day, not the reader’s timezone', () => {
        // `new Date('2023-12-10')` is UTC midnight, which anywhere behind UTC
        // renders as the ninth. An article published on the tenth in Rome was
        // published on the tenth, whatever clock the reader is on.
        expect(talosPublishedOn('2023-12-10', 'en')).toContain('10')
        expect(talosPublishedOn('2023-01-01', 'en')).toBe('January 1, 2023')
    })

    it('leaves a date it cannot read exactly as the source wrote it', () => {
        // A site that declares «2023» or «summer 2019» is telling the truth in
        // its own words. Inventing the first of January for it would be worse
        // than printing what it said.
        expect(talosPublishedOn('2023', 'it')).toBe('2023')
        expect(talosPublishedOn('estate 2019', 'it')).toBe('estate 2019')
        expect(talosPublishedOn('', 'it')).toBe('')
    })

    it('refuses a date that does not exist rather than rolling it over', () => {
        // JavaScript turns the 45th of the 13th month into February quietly.
        expect(talosPublishedOn('2023-13-45', 'it')).toBe('2023-13-45')
        expect(talosPublishedOn('2023-02-30', 'it')).toBe('2023-02-30')
    })
})
