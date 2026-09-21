import { describe, expect, it } from 'vitest'
import { parseTalosWelcomeCatalog } from '@/lib/welcome/catalog'
import { resolveTalosWelcome } from '@/lib/welcome/resolver'
import englishRaw from '@/lib/welcome/catalogs/en.json'
import italianRaw from '@/lib/welcome/catalogs/it.json'

const english = parseTalosWelcomeCatalog(englishRaw, 'en')
const italian = parseTalosWelcomeCatalog(italianRaw, 'it')

function localDate(month: number, day: number, hour: number, minute = 0): Date {
    return new Date(2026, month - 1, day, hour, minute, 0, 0)
}

describe('TALOS welcome resolver', () => {
    it.each([
        [0, 0, 'morning'],
        [11, 59, 'morning'],
        [12, 0, 'afternoon'],
        [17, 59, 'afternoon'],
        [18, 0, 'evening'],
        [20, 59, 'evening'],
        [21, 0, 'night'],
        [23, 59, 'night'],
    ])('WELCOME-RESOLVE-01 maps English %i:%i to %s', (hour, minute, condition) => {
        expect(resolveTalosWelcome(english, {
            at: localDate(7, 29, hour as number, minute as number),
            seed: 'session-en',
        })?.condition).toBe(condition)
    })

    it.each([
        [0, 0, 'night'],
        [5, 59, 'night'],
        [6, 0, 'morning'],
        [11, 59, 'morning'],
        [12, 0, 'afternoon'],
        [17, 59, 'afternoon'],
        [18, 0, 'evening'],
        [23, 59, 'evening'],
    ])('WELCOME-RESOLVE-02 maps Italian %i:%i to %s', (hour, minute, condition) => {
        expect(resolveTalosWelcome(italian, {
            at: localDate(7, 29, hour as number, minute as number),
            seed: 'session-it',
        })?.condition).toBe(condition)
    })

    it.each([
        ['new_year_day', 1, 1, 'party-popper'],
        ['valentines_day', 2, 14, 'heart'],
        ['halloween', 10, 31, 'ghost'],
        ['christmas_eve', 12, 24, 'snowflake'],
        ['christmas_day', 12, 25, 'gift'],
        ['new_year_eve', 12, 31, 'clock'],
    ])('WELCOME-RESOLVE-03 gives %s precedence over its day period', (
        condition,
        month,
        day,
        easterEgg,
    ) => {
        const result = resolveTalosWelcome(english, {
            at: localDate(month as number, day as number, 9),
            seed: 'special-date',
        })
        expect(result).toMatchObject({
            kind: 'specialDate',
            condition,
            easterEgg,
        })
    })

    it('WELCOME-RESOLVE-04 is deterministic, varied across seeds, aligned across locales and fail closed', () => {
        const at = localDate(12, 25, 10)
        const first = resolveTalosWelcome(english, { at, seed: 'stable-session' })
        const repeated = resolveTalosWelcome(english, { at, seed: 'stable-session' })
        const translated = resolveTalosWelcome(italian, { at, seed: 'stable-session' })
        const indices = new Set(Array.from({ length: 24 }, (_, index) => (
            resolveTalosWelcome(english, { at, seed: `session-${index}` })?.index
        )))

        expect(repeated).toEqual(first)
        expect(translated?.index).toBe(first?.index)
        expect(indices.size).toBeGreaterThan(1)
        expect(resolveTalosWelcome(english, { at: new Date(Number.NaN), seed: 'x' }))
            .toBeNull()
        expect(resolveTalosWelcome(english, { at, seed: '' })).toBeNull()
    })
})
