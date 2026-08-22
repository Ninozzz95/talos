import type { TalosSupportedLocale } from '@/i18n/contracts'

export const TALOS_WELCOME_SCHEMA_VERSION = 'talos.welcome/1' as const
export const TALOS_WELCOME_DAY_PERIOD_IDS = [
    'morning',
    'afternoon',
    'evening',
    'night',
] as const
export const TALOS_WELCOME_SPECIAL_DATE_IDS = [
    'new_year_day',
    'valentines_day',
    'halloween',
    'christmas_eve',
    'christmas_day',
    'new_year_eve',
] as const
export const TALOS_WELCOME_EASTER_EGG_KINDS = [
    'party-popper',
    'heart',
    'ghost',
    'snowflake',
    'gift',
    'clock',
] as const

export type TalosWelcomeDayPeriodId = typeof TALOS_WELCOME_DAY_PERIOD_IDS[number]
export type TalosWelcomeSpecialDateId = typeof TALOS_WELCOME_SPECIAL_DATE_IDS[number]
export type TalosWelcomeEasterEggKind = typeof TALOS_WELCOME_EASTER_EGG_KINDS[number]

export interface TalosWelcomeTimeCondition {
    readonly from: string
    readonly before: string
}

export interface TalosWelcomeDateCondition {
    readonly month: number
    readonly day: number
}

export interface TalosWelcomeDayPeriod {
    readonly condition: TalosWelcomeTimeCondition
    readonly titles: readonly string[]
}

export interface TalosWelcomeSpecialDate {
    readonly condition: TalosWelcomeDateCondition
    readonly titles: readonly string[]
    readonly easterEgg: TalosWelcomeEasterEggKind
}

export interface TalosWelcomeCatalog {
    readonly schema: typeof TALOS_WELCOME_SCHEMA_VERSION
    readonly locale: TalosSupportedLocale
    readonly dayPeriods: Readonly<Record<TalosWelcomeDayPeriodId, TalosWelcomeDayPeriod>>
    readonly specialDates: Readonly<Record<TalosWelcomeSpecialDateId, TalosWelcomeSpecialDate>>
}

const EXPECTED_PERIODS: Readonly<Record<
    TalosSupportedLocale,
    Readonly<Record<TalosWelcomeDayPeriodId, TalosWelcomeTimeCondition>>
>> = {
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
}

const EXPECTED_SPECIAL_DATES: Readonly<Record<
    TalosWelcomeSpecialDateId,
    TalosWelcomeDateCondition & { readonly easterEgg: TalosWelcomeEasterEggKind }
>> = {
    new_year_day: { month: 1, day: 1, easterEgg: 'party-popper' },
    valentines_day: { month: 2, day: 14, easterEgg: 'heart' },
    halloween: { month: 10, day: 31, easterEgg: 'ghost' },
    christmas_eve: { month: 12, day: 24, easterEgg: 'snowflake' },
    christmas_day: { month: 12, day: 25, easterEgg: 'gift' },
    new_year_eve: { month: 12, day: 31, easterEgg: 'clock' },
}

const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u

function invalid(reason: string): never {
    throw new Error(`TALOS_WELCOME_CATALOG_INVALID: ${reason}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path)
    return value as Record<string, unknown>
}

function requireExactKeys(
    value: Record<string, unknown>,
    expected: readonly string[],
    path: string,
): void {
    const actual = Object.keys(value).sort()
    const required = [...expected].sort()
    if (
        actual.length !== required.length
        || actual.some((key, index) => key !== required[index])
    ) {
        invalid(`${path}.keys`)
    }
}

function titles(value: unknown, path: string): readonly string[] {
    if (!Array.isArray(value) || value.length < 10) invalid(`${path}.titles`)
    const parsed = value.map((candidate, index) => {
        if (typeof candidate !== 'string') invalid(`${path}.titles.${index}`)
        if (!candidate || candidate !== candidate.trim()) {
            invalid(`${path}.titles.${index}.whitespace`)
        }
        if ([...candidate].length > 72) invalid(`${path}.titles.${index}.length`)
        if (EXTENDED_PICTOGRAPHIC.test(candidate)) {
            invalid(`${path}.titles.${index}.emoji`)
        }
        return candidate
    })
    if (new Set(parsed).size !== parsed.length) invalid(`${path}.titles.duplicate`)
    return Object.freeze(parsed)
}

function timeCondition(
    value: unknown,
    expected: TalosWelcomeTimeCondition,
    path: string,
): TalosWelcomeTimeCondition {
    const candidate = record(value, path)
    requireExactKeys(candidate, ['from', 'before'], path)
    if (candidate.from !== expected.from || candidate.before !== expected.before) {
        invalid(`${path}.cldr-48.2`)
    }
    return Object.freeze({ from: expected.from, before: expected.before })
}

function dateCondition(
    value: unknown,
    expected: TalosWelcomeDateCondition,
    path: string,
): TalosWelcomeDateCondition {
    const candidate = record(value, path)
    requireExactKeys(candidate, ['month', 'day'], path)
    if (candidate.month !== expected.month || candidate.day !== expected.day) {
        invalid(`${path}.date`)
    }
    return Object.freeze({ month: expected.month, day: expected.day })
}

/**
 * Shape-preserving fail-closed boundary for packaged welcome JSON.
 */
export function parseTalosWelcomeCatalog(
    value: unknown,
    expectedLocale: TalosSupportedLocale,
): TalosWelcomeCatalog {
    const root = record(value, 'root')
    requireExactKeys(root, ['schema', 'locale', 'dayPeriods', 'specialDates'], 'root')
    if (
        root.schema !== TALOS_WELCOME_SCHEMA_VERSION
        || root.locale !== expectedLocale
    ) {
        invalid('identity')
    }

    const rawPeriods = record(root.dayPeriods, 'dayPeriods')
    requireExactKeys(rawPeriods, TALOS_WELCOME_DAY_PERIOD_IDS, 'dayPeriods')
    const dayPeriods = {} as Record<TalosWelcomeDayPeriodId, TalosWelcomeDayPeriod>
    for (const id of TALOS_WELCOME_DAY_PERIOD_IDS) {
        const entry = record(rawPeriods[id], `dayPeriods.${id}`)
        requireExactKeys(entry, ['condition', 'titles'], `dayPeriods.${id}`)
        dayPeriods[id] = Object.freeze({
            condition: timeCondition(
                entry.condition,
                EXPECTED_PERIODS[expectedLocale][id],
                `dayPeriods.${id}.condition`,
            ),
            titles: titles(entry.titles, `dayPeriods.${id}`),
        })
    }

    const rawSpecialDates = record(root.specialDates, 'specialDates')
    requireExactKeys(rawSpecialDates, TALOS_WELCOME_SPECIAL_DATE_IDS, 'specialDates')
    const specialDates = {} as Record<TalosWelcomeSpecialDateId, TalosWelcomeSpecialDate>
    for (const id of TALOS_WELCOME_SPECIAL_DATE_IDS) {
        const entry = record(rawSpecialDates[id], `specialDates.${id}`)
        requireExactKeys(entry, ['condition', 'titles', 'easterEgg'], `specialDates.${id}`)
        const expected = EXPECTED_SPECIAL_DATES[id]
        if (entry.easterEgg !== expected.easterEgg) {
            invalid(`specialDates.${id}.easterEgg`)
        }
        specialDates[id] = Object.freeze({
            condition: dateCondition(
                entry.condition,
                expected,
                `specialDates.${id}.condition`,
            ),
            titles: titles(entry.titles, `specialDates.${id}`),
            easterEgg: expected.easterEgg,
        })
    }

    return Object.freeze({
        schema: TALOS_WELCOME_SCHEMA_VERSION,
        locale: expectedLocale,
        dayPeriods: Object.freeze(dayPeriods),
        specialDates: Object.freeze(specialDates),
    })
}

/**
 * Explicit imports keep each locale visible as its own Vite dynamic entry.
 */
export async function loadTalosWelcomeCatalog(
    locale: TalosSupportedLocale,
): Promise<TalosWelcomeCatalog> {
    if (locale === 'it') {
        const module = await import('@/lib/welcome/catalogs/it.json')
        return parseTalosWelcomeCatalog(module.default, 'it')
    }
    const module = await import('@/lib/welcome/catalogs/en.json')
    return parseTalosWelcomeCatalog(module.default, 'en')
}
