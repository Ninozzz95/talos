import type { TalosCalendarDraft } from './talosTypes'

export type TalosCalendarViewMode = 'week' | 'month' | 'year' | 'agenda'

export type TalosCalendarDay = {
    date: Date
    key: string
    dayNumber: number
    inCurrentMonth: boolean
    isToday: boolean
}

export type TalosQuickAddResult = {
    title: string
    starts_at: string
    ends_at: string
    timezone: string
    metadata: Record<string, unknown>
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Supported examples: crew muster 10am daily, meeting tomorrow 15:00, review Friday 9-10.
export const TALOS_CALENDAR_QUICK_ADD_EXAMPLES = [
    'crew muster 10am daily',
    'meeting tomorrow 15:00',
    'review Friday 9-10',
]

export function dateKey(date: Date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-')
}

export function sameDay(left: Date, right: Date) {
    return dateKey(left) === dateKey(right)
}

export function monthLabel(date: Date) {
    return date.toLocaleDateString([], {
        month: 'long',
        year: 'numeric',
    })
}

export function buildMonthGrid(month: Date, today = new Date()): TalosCalendarDay[] {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = new Date(firstDay)
    start.setDate(firstDay.getDate() - firstDay.getDay())

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start)
        date.setDate(start.getDate() + index)

        return {
            date,
            key: dateKey(date),
            dayNumber: date.getDate(),
            inCurrentMonth: date.getMonth() === month.getMonth(),
            isToday: sameDay(date, today),
        }
    })
}

export function draftsForDay(drafts: TalosCalendarDraft[], date: Date) {
    return drafts.filter((draft) => sameDay(new Date(draft.starts_at), date))
}

export function addMinutes(date: Date, minutes: number) {
    const next = new Date(date)
    next.setMinutes(next.getMinutes() + minutes)

    return next
}

export function parseQuickAddEvent(input: string, now = new Date(), timezone = 'Europe/Rome'): TalosQuickAddResult | null {
    const raw = input.trim().replace(/\s+/g, ' ')
    if (!raw) {
        return null
    }

    const dailyMatch = raw.match(/^(.+?)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+daily$/i)
    if (dailyMatch) {
        const startsAt = withTime(now, toTwentyFourHour(Number(dailyMatch[2]), dailyMatch[4]), Number(dailyMatch[3] ?? 0))

        return quickAddResult(dailyMatch[1], startsAt, addMinutes(startsAt, 30), timezone, raw, { recurrence: 'daily' })
    }

    const tomorrowMatch = raw.match(/^(.+?)\s+tomorrow\s+(\d{1,2})(?::(\d{2}))$/i)
    if (tomorrowMatch) {
        const day = new Date(now)
        day.setDate(now.getDate() + 1)
        const startsAt = withTime(day, Number(tomorrowMatch[2]), Number(tomorrowMatch[3] ?? 0))

        return quickAddResult(tomorrowMatch[1], startsAt, addMinutes(startsAt, 30), timezone, raw)
    }

    const weekdayMatch = raw.match(/^(.+?)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/i)
    if (weekdayMatch) {
        const day = nextWeekday(now, weekdayMatch[2])
        const startsAt = withTime(day, Number(weekdayMatch[3]), Number(weekdayMatch[4] ?? 0))
        const endsAt = withTime(day, Number(weekdayMatch[5]), Number(weekdayMatch[6] ?? 0))

        return quickAddResult(weekdayMatch[1], startsAt, endsAt, timezone, raw)
    }

    return null
}

function quickAddResult(title: string, startsAt: Date, endsAt: Date, timezone: string, raw: string, metadata: Record<string, unknown> = {}): TalosQuickAddResult {
    return {
        title: title.trim(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        timezone,
        metadata: {
            quick_add_raw: raw,
            ...metadata,
        },
    }
}

function withTime(date: Date, hour: number, minute: number) {
    const next = new Date(date)
    next.setHours(hour, minute, 0, 0)

    return next
}

function toTwentyFourHour(hour: number, meridiem: string) {
    const normalized = meridiem.toLowerCase()
    if (normalized === 'pm' && hour < 12) {
        return hour + 12
    }

    if (normalized === 'am' && hour === 12) {
        return 0
    }

    return hour
}

function nextWeekday(now: Date, weekday: string) {
    const target = DAY_NAMES.indexOf(weekday.toLowerCase())
    const next = new Date(now)
    const delta = (target - now.getDay() + 7) % 7 || 7
    next.setDate(now.getDate() + delta)

    return next
}
