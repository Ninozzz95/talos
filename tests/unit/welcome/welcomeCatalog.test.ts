import { describe, expect, it } from 'vitest'
import {
    TALOS_WELCOME_DAY_PERIOD_IDS,
    TALOS_WELCOME_EASTER_EGG_KINDS,
    TALOS_WELCOME_SCHEMA_VERSION,
    TALOS_WELCOME_SPECIAL_DATE_IDS,
    loadTalosWelcomeCatalog,
    parseTalosWelcomeCatalog,
} from '@/lib/welcome/catalog'
import englishRaw from '@/lib/welcome/catalogs/en.json'
import italianRaw from '@/lib/welcome/catalogs/it.json'

const EXPECTED_SPECIAL_DATES = {
    new_year_day: { month: 1, day: 1, easterEgg: 'party-popper' },
    valentines_day: { month: 2, day: 14, easterEgg: 'heart' },
    halloween: { month: 10, day: 31, easterEgg: 'ghost' },
    christmas_eve: { month: 12, day: 24, easterEgg: 'snowflake' },
    christmas_day: { month: 12, day: 25, easterEgg: 'gift' },
    new_year_eve: { month: 12, day: 31, easterEgg: 'clock' },
} as const

const EXPECTED_PERIODS = {
    en: {
        morning: { from: '00:00', before: '12:00' },
        afternoon: { from: '12:00', before: '18:00' },
        evening: { from: '18:00', before: '21:00' },
        night: { from: '21:00', before: '24:00' },
    },
    it: {
        morning: { from: '06:00', before: '12:00' },
        afternoon: { from: '12:00', before: '18:00' },
        evening: { from: '18:00', before: '24:00' },
        night: { from: '00:00', before: '06:00' },
    },
} as const

describe('TALOS localized welcome catalogs', () => {
    it('WELCOME-CATALOG-01 parses only the strict talos.welcome/1 locale contract', () => {
        const english = parseTalosWelcomeCatalog(englishRaw, 'en')
        const italian = parseTalosWelcomeCatalog(italianRaw, 'it')

        expect(english.schema).toBe(TALOS_WELCOME_SCHEMA_VERSION)
        expect(italian.schema).toBe(TALOS_WELCOME_SCHEMA_VERSION)
        expect(english.locale).toBe('en')
        expect(italian.locale).toBe('it')

        const invalid = { ...englishRaw, unexpected: true }
        expect(() => parseTalosWelcomeCatalog(invalid, 'en'))
            .toThrowError('TALOS_WELCOME_CATALOG_INVALID')
        expect(() => parseTalosWelcomeCatalog(englishRaw, 'it'))
            .toThrowError('TALOS_WELCOME_CATALOG_INVALID')
    })

    it('WELCOME-CATALOG-02 pins exact CLDR 48.2 periods with complete minute coverage', () => {
        for (const [locale, raw] of [['en', englishRaw], ['it', italianRaw]] as const) {
            const catalog = parseTalosWelcomeCatalog(raw, locale)
            const coverage = new Uint8Array(1_440)

            for (const id of TALOS_WELCOME_DAY_PERIOD_IDS) {
                expect(catalog.dayPeriods[id].condition)
                    .toEqual(EXPECTED_PERIODS[locale][id])
                const [fromHour, fromMinute] = catalog.dayPeriods[id].condition.from
                    .split(':').map(Number)
                const [beforeHour, beforeMinute] = catalog.dayPeriods[id].condition.before
                    .split(':').map(Number)
                const start = fromHour! * 60 + fromMinute!
                const end = beforeHour! * 60 + beforeMinute!
                for (let minute = start; minute < end; minute += 1) coverage[minute]! += 1
            }

            expect([...coverage].every(count => count === 1)).toBe(true)
        }
    })

    it('WELCOME-CATALOG-03 contains exactly the six approved dates and icon allowlist', () => {
        for (const [locale, raw] of [['en', englishRaw], ['it', italianRaw]] as const) {
            const catalog = parseTalosWelcomeCatalog(raw, locale)
            expect(Object.keys(catalog.specialDates)).toEqual([...TALOS_WELCOME_SPECIAL_DATE_IDS])
            for (const id of TALOS_WELCOME_SPECIAL_DATE_IDS) {
                const expected = EXPECTED_SPECIAL_DATES[id]
                expect(catalog.specialDates[id].condition).toEqual({
                    month: expected.month,
                    day: expected.day,
                })
                expect(catalog.specialDates[id].easterEgg).toBe(expected.easterEgg)
                expect(TALOS_WELCOME_EASTER_EGG_KINDS)
                    .toContain(catalog.specialDates[id].easterEgg)
            }
        }
    })

    it('WELCOME-CATALOG-04 provides ten unique bounded emoji-free titles per condition', () => {
        const emoji = /\p{Extended_Pictographic}/u
        for (const [locale, raw] of [['en', englishRaw], ['it', italianRaw]] as const) {
            const catalog = parseTalosWelcomeCatalog(raw, locale)
            const collections = [
                ...TALOS_WELCOME_DAY_PERIOD_IDS.map(id => catalog.dayPeriods[id].titles),
                ...TALOS_WELCOME_SPECIAL_DATE_IDS.map(id => catalog.specialDates[id].titles),
            ]

            expect(collections).toHaveLength(10)
            for (const titles of collections) {
                expect(titles).toHaveLength(10)
                expect(new Set(titles).size).toBe(titles.length)
                for (const title of titles) {
                    expect(title).toBe(title.trim())
                    expect(title.length).toBeGreaterThan(0)
                    expect([...title]).toHaveLength(
                        Math.min([...title].length, 72),
                    )
                    expect(emoji.test(title)).toBe(false)
                }
            }
        }
    })

    it('WELCOME-CATALOG-05 keeps English and Italian condition counts and semantic indices aligned', async () => {
        const [english, italian] = await Promise.all([
            loadTalosWelcomeCatalog('en'),
            loadTalosWelcomeCatalog('it'),
        ])

        expect(Object.keys(italian.dayPeriods)).toEqual(Object.keys(english.dayPeriods))
        expect(Object.keys(italian.specialDates)).toEqual(Object.keys(english.specialDates))
        for (const id of TALOS_WELCOME_DAY_PERIOD_IDS) {
            expect(italian.dayPeriods[id].titles)
                .toHaveLength(english.dayPeriods[id].titles.length)
        }
        for (const id of TALOS_WELCOME_SPECIAL_DATE_IDS) {
            expect(italian.specialDates[id].titles)
                .toHaveLength(english.specialDates[id].titles.length)
        }
    })
})
