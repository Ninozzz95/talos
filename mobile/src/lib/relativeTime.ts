/**
 * Relative timestamps per the frozen refinement-brief ("just now", "2m ago", …).
 * Lowercase mid-line (SF-critic #8): the label sits inside a meta sentence.
 * Pure and fail-closed: garbage input renders nothing rather than "NaN ago".
 */
export interface TalosRelativeTimeLabels {
    justNow: string
    minutesAgo: (count: number) => string
    hoursAgo: (count: number) => string
    daysAgo: (count: number) => string
}

const ENGLISH_RELATIVE_TIME: TalosRelativeTimeLabels = {
    justNow: 'just now',
    minutesAgo: count => `${count}m ago`,
    hoursAgo: count => `${count}h ago`,
    daysAgo: count => `${count}d ago`,
}

export function talosRelativeTime(
    iso: string,
    now: Date = new Date(),
    labels: TalosRelativeTimeLabels = ENGLISH_RELATIVE_TIME,
): string {
    const then = new Date(iso).getTime()
    if (!Number.isFinite(then)) return ''
    const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000))
    if (seconds < 60) return labels.justNow
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return labels.minutesAgo(minutes)
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return labels.hoursAgo(hours)
    const days = Math.floor(hours / 24)
    return labels.daysAgo(days)
}
