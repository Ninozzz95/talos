/**
 * Relative timestamps per the frozen refinement-brief ("just now", "2m ago", …).
 * Lowercase mid-line (SF-critic #8): the label sits inside a meta sentence.
 * Pure and fail-closed: garbage input renders nothing rather than "NaN ago".
 */
export function talosRelativeTime(iso: string, now: Date = new Date()): string {
    const then = new Date(iso).getTime()
    if (!Number.isFinite(then)) return ''
    const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000))
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}
