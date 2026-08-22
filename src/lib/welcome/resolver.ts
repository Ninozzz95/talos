import {
    TALOS_WELCOME_DAY_PERIOD_IDS,
    TALOS_WELCOME_SPECIAL_DATE_IDS,
    type TalosWelcomeCatalog,
    type TalosWelcomeDayPeriodId,
    type TalosWelcomeEasterEggKind,
    type TalosWelcomeSpecialDateId,
} from '@/lib/welcome/catalog'

export interface TalosWelcomeResolverInput {
    readonly at: Date
    readonly seed: string
}

export interface TalosWelcomeSelection {
    readonly title: string
    readonly kind: 'dayPeriod' | 'specialDate'
    readonly condition: TalosWelcomeDayPeriodId | TalosWelcomeSpecialDateId
    readonly index: number
    readonly easterEgg: TalosWelcomeEasterEggKind | null
}

function minuteOfDay(value: string): number {
    const [hour, minute] = value.split(':').map(Number)
    return hour! * 60 + minute!
}

function stableIndex(seed: string, length: number): number {
    let hash = 0x811c9dc5
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0) % length
}

/**
 * Resolves only captured local date/time and packaged catalog data.
 */
export function resolveTalosWelcome(
    catalog: TalosWelcomeCatalog,
    input: TalosWelcomeResolverInput,
): TalosWelcomeSelection | null {
    if (!Number.isFinite(input.at.getTime()) || !input.seed.trim()) return null

    const month = input.at.getMonth() + 1
    const day = input.at.getDate()
    for (const id of TALOS_WELCOME_SPECIAL_DATE_IDS) {
        const entry = catalog.specialDates[id]
        if (entry.condition.month !== month || entry.condition.day !== day) continue
        const index = stableIndex(input.seed, entry.titles.length)
        const title = entry.titles[index]
        if (!title) return null
        return {
            title,
            kind: 'specialDate',
            condition: id,
            index,
            easterEgg: entry.easterEgg,
        }
    }

    const minute = input.at.getHours() * 60 + input.at.getMinutes()
    for (const id of TALOS_WELCOME_DAY_PERIOD_IDS) {
        const entry = catalog.dayPeriods[id]
        const from = minuteOfDay(entry.condition.from)
        const before = minuteOfDay(entry.condition.before)
        if (minute < from || minute >= before) continue
        const index = stableIndex(input.seed, entry.titles.length)
        const title = entry.titles[index]
        if (!title) return null
        return {
            title,
            kind: 'dayPeriod',
            condition: id,
            index,
            easterEgg: null,
        }
    }

    return null
}
