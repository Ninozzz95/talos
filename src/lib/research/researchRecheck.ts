import { talosResearchLocate } from '@/lib/research/researchVerification'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'

/**
 * R12 — asking, later, whether the sources still say what they said.
 *
 * The measured reason this matters: **over 75% of referenced web content had
 * changed within three years**, and accessibility of a citation falls from 87%
 * in its first five years to 38% after ten. The dead link is the visible half;
 * the live link that now says something else is the dangerous one, because
 * nothing about it looks wrong.
 *
 * Nobody else can run this check. Every research product stores URLs, so the
 * most it can ever tell you is whether a request succeeds — and a soft 404 or a
 * silently rewritten page answers 200. We kept the extracted text, so the
 * question we can ask is the one that matters: *is what we read still there?*
 *
 * Two measurements, deliberately of different kinds:
 *
 *  - **How much of the kept text survives**, as a proportion. A heuristic, and
 *    named as one. It uses CONTAINMENT rather than a symmetric similarity: a
 *    page that added three paragraphs has not lost anything we relied on, and
 *    calling that "changed" would cry wolf on every living site.
 *  - **Whether each cited passage is still findable**, exactly, by the same
 *    mechanical check R-4 uses. No heuristic, no threshold, no opinion. This is
 *    the answer that decides whether the report still stands: a page can be
 *    rewritten from top to bottom, and if the sentences we quoted survived, the
 *    citations are as good as the day they were made.
 */

export type TalosRecheckState = 'intact' | 'changed' | 'unreachable'

/** How much of the kept text must survive before a page counts as unchanged. */
const INTACT_AT = 0.95

/** Words per shingle. Five is the usual size for near-duplicate work on prose. */
const SHINGLE = 5

export interface TalosResearchSourceRecheck {
    readonly url: string
    readonly title: string
    readonly state: TalosRecheckState
    /** 0…1 of the kept text still present. Null when the page could not be read. */
    readonly survived: number | null
    /** Why it could not be read, when that is the answer. */
    readonly reason: string | null
    /** Cited passages still findable in today's page. */
    readonly passagesStanding: number
    /** Cited passages that are no longer there. The number that matters. */
    readonly passagesLost: number
}

export interface TalosResearchRecheck {
    readonly at: string
    readonly sources: readonly TalosResearchSourceRecheck[]
}

function shingles(text: string): Set<string> {
    const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
    const out = new Set<string>()
    for (let index = 0; index + SHINGLE <= words.length; index += 1) {
        out.add(words.slice(index, index + SHINGLE).join(' '))
    }
    // A text too short to shingle is compared whole rather than declared empty.
    if (out.size === 0 && words.length > 0) out.add(words.join(' '))
    return out
}

/**
 * How much of `kept` is still present in `now`, from 0 to 1.
 *
 * One-directional on purpose. The question is not "are these two pages the
 * same" — it is "is what we relied on still there", and a page that grew is not
 * a page that changed out from under us.
 */
export function talosResearchSurvival(kept: string, now: string): number {
    const before = shingles(kept)
    if (before.size === 0) return 1
    const after = shingles(now)
    let found = 0
    for (const piece of before) if (after.has(piece)) found += 1
    return found / before.size
}

export interface TalosResearchRecheckDeps {
    /** Reads the page again. Null or a throw both mean "could not read it". */
    readonly read: (url: string) => Promise<{ text: string } | null>
    readonly at: () => string
}

/**
 * Re-checks every source of a finished report.
 *
 * SEQUENTIALLY, like the verification: this runs on a phone against other
 * people's servers, and a dozen simultaneous requests is how a home connection
 * and a news site both decide you are a scraper.
 *
 * A source that cannot be read is recorded, never dropped — and it is worth
 * saying why that is not a loss: the extracted text is still here, so the
 * dossier remains readable and quotable after the page itself is gone. That is
 * the whole reason the text was kept.
 */
export async function talosResearchRecheckReport(
    deps: TalosResearchRecheckDeps,
    report: TalosResearchReportRecord,
    /** The kept text, by url — it lives in the dossiers, not in the report. */
    keptByUrl: ReadonlyMap<string, string>,
): Promise<TalosResearchRecheck> {
    const sources: TalosResearchSourceRecheck[] = []

    for (const source of report.sources) {
        const kept = keptByUrl.get(source.url) ?? ''
        const quoted = report.claims
            .filter((claim) => report.sources[claim.sourceIndex - 1]?.url === source.url)
            .map((claim) => claim.passage)
            .filter((passage) => passage.length > 0)

        let fresh: { text: string } | null = null
        let reason: string | null = null
        try {
            fresh = await deps.read(source.url)
            if (!fresh) reason = 'unreadable'
        } catch (failure) {
            reason = failure instanceof Error ? failure.message : 'unreadable'
        }

        if (!fresh) {
            sources.push({
                url: source.url,
                title: source.title,
                state: 'unreachable',
                survived: null,
                reason,
                // Not counted as lost: we cannot see the page, which is a
                // different thing from having looked and not found them.
                passagesStanding: 0,
                passagesLost: 0,
            })
            continue
        }

        const survived = talosResearchSurvival(kept, fresh.text)
        const standing = quoted.filter((passage) => talosResearchLocate(fresh!.text, passage) !== null).length

        sources.push({
            url: source.url,
            title: source.title,
            state: survived >= INTACT_AT ? 'intact' : 'changed',
            survived,
            reason: null,
            passagesStanding: standing,
            passagesLost: quoted.length - standing,
        })
    }

    return { at: deps.at(), sources }
}

/** The line the reader gets first: what happened to the dossier since. */
export function talosResearchRecheckStanding(recheck: TalosResearchRecheck): {
    readonly total: number
    readonly intact: number
    readonly changed: number
    readonly unreachable: number
    /** Citations that no longer resolve to the words they quoted. */
    readonly passagesLost: number
} {
    const count = (state: TalosRecheckState) => recheck.sources.filter((entry) => entry.state === state).length
    return {
        total: recheck.sources.length,
        intact: count('intact'),
        changed: count('changed'),
        unreachable: count('unreachable'),
        passagesLost: recheck.sources.reduce((total, entry) => total + entry.passagesLost, 0),
    }
}
