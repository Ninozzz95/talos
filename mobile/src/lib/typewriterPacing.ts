/**
 * Owner 2026-07-25: the progressive reply "è troppo scattante" — it must print
 * letter by letter, fluidly.
 *
 * Root cause: the UI rendered at the pace tokens ARRIVED (a 120ms trailing
 * throttle over provider chunks), so the text moved in visible jumps of
 * whatever size the network happened to deliver. Web research — Vercel AI SDK
 * `smoothStream`, flowtoken, and the buffering pattern documented for
 * ChatGPT/Claude — agrees on one fix: decouple arrival from reveal and pace the
 * reveal on a frame clock.
 *
 * This module is the pacing maths only (pure, testable). The frame loop and the
 * DOM writes live in the streaming component, which appends characters WITHOUT
 * re-parsing markdown — measured at 4–16ms per parse, i.e. impossible at 60fps.
 */
export interface TalosTypewriterOptions {
    /** Floor, in characters per second: the pace when the buffer is nearly dry. */
    minCharsPerSecond: number
    /** Ceiling: a 20k-character burst must still read as typing, not as a flash. */
    maxCharsPerSecond: number
    /** Target time to drain whatever is pending — the "never fall behind" knob. */
    catchUpMs: number
    /**
     * SF: with only a speed ceiling, a provider that returns the whole reply in
     * one shot leaves thousands of characters unrevealed — and the message
     * COMMITS (component unmounts) with the rest appearing instantly. Cap how
     * far behind the reveal may ever be: past this, it jumps forward, so the
     * typing always covers the tail and finishes with the stream.
     */
    maxLagChars: number
}

export const TALOS_TYPEWRITER_DEFAULTS: TalosTypewriterOptions = {
    minCharsPerSecond: 110,
    maxCharsPerSecond: 1_600,
    catchUpMs: 260,
    maxLagChars: 420,
}

/**
 * The revealed count after `elapsedMs`, as a FLOAT: callers keep the fraction
 * between frames, otherwise sub-character-per-frame speeds would round to zero
 * and stall.
 */
export function talosNextRevealCount(
    revealed: number,
    total: number,
    elapsedMs: number,
    options: Partial<TalosTypewriterOptions> = {},
): number {
    const { minCharsPerSecond, maxCharsPerSecond, catchUpMs, maxLagChars } = {
        ...TALOS_TYPEWRITER_DEFAULTS,
        ...options,
    }
    const raw = Number.isFinite(revealed) && revealed > 0 ? revealed : 0
    const target = Number.isFinite(total) && total > 0 ? total : 0
    // Never trail the stream by more than the cap (see maxLagChars).
    const current = Math.max(raw, target - Math.max(0, maxLagChars))
    if (current >= target) return target
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return current
    const pending = target - current
    const speed = Math.min(maxCharsPerSecond, Math.max(minCharsPerSecond, (pending * 1_000) / catchUpMs))
    return Math.min(target, current + (speed * elapsedMs) / 1_000)
}

/**
 * Slice at a character boundary. Cutting between the two halves of a surrogate
 * pair paints a replacement glyph for one frame — a visible defect at 60fps.
 */
export function talosSafeRevealSlice(text: string, count: number): string {
    if (!Number.isFinite(count) || count <= 0) return ''
    const end = Math.min(text.length, Math.floor(count))
    const last = text.charCodeAt(end - 1)
    // A high surrogate at the cut means its low half is still pending.
    const safeEnd = last >= 0xd800 && last <= 0xdbff ? end - 1 : end
    return text.slice(0, Math.max(0, safeEnd))
}
