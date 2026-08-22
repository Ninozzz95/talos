import { describe, expect, it } from 'vitest'
import {
    TALOS_RESEARCH_DEPTHS,
    talosResearchPlanCost,
    talosResearchPlanFor,
    talosResearchPlanReworded,
    talosResearchPlanTotals,
    talosResearchPlanWith,
    talosResearchPlanWithout,
} from '@/lib/research/researchPlan'

const QUESTION = 'quale tablet conviene'

describe('the plan a user is shown before anything is spent', () => {
    it('opens the question along different sides, not four paraphrases of it', () => {
        const plan = talosResearchPlanFor(QUESTION, 'deep')

        expect(plan).toHaveLength(TALOS_RESEARCH_DEPTHS.deep.branches)
        // A plan whose branches say the same thing spends four times to learn
        // one thing, which is the failure this ordering exists to avoid.
        expect(new Set(plan.map((branch) => branch.question)).size).toBe(plan.length)
        expect(plan.every((branch) => branch.question.startsWith(QUESTION))).toBe(true)
    })

    it('gets bigger with depth, in every dimension the user is deciding about', () => {
        const quick = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'quick'))
        const deep = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'deep'))
        const exhaustive = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'exhaustive'))

        expect(quick.pages).toBeLessThan(deep.pages)
        expect(deep.pages).toBeLessThan(exhaustive.pages)
        expect(quick.tokens).toBeLessThan(deep.tokens)
        expect(quick.minutes).toBeLessThanOrEqual(deep.minutes)
    })

    it('never announces a run of zero minutes when there is work in it', () => {
        // "0 minutes" for something that takes forty seconds is a lie about the
        // one thing the user asked before pressing start.
        const tiny = talosResearchPlanFor(QUESTION, 'quick').slice(0, 1)

        expect(talosResearchPlanTotals(tiny).minutes).toBeGreaterThanOrEqual(1)
        expect(talosResearchPlanTotals([]).minutes).toBe(0)
    })

    /**
     * THE assertion this module exists for.
     *
     * Prices change, and a price list inside an APK is a lie with a release
     * date on it. OpenRouter publishes per-token rates we may read; the other
     * providers publish nothing machine-readable. So when no price was
     * obtained, the answer is "not knowable from here" — never a plausible
     * figure, and never zero, which would read as free.
     */
    it('refuses to invent a price it was never given', () => {
        const totals = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'deep'))

        const cost = talosResearchPlanCost(totals, null)

        expect(cost).toEqual({ known: false })
        expect(cost).not.toHaveProperty('amount')
    })

    it('states the money when a published price was actually obtained', () => {
        const totals = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'deep'))

        const cost = talosResearchPlanCost(totals, {
            currency: 'USD',
            promptPerMillion: 3,
            completionPerMillion: 15,
        })

        expect(cost.known).toBe(true)
        if (!cost.known) throw new Error('unreachable')
        expect(cost.currency).toBe('USD')
        // Reading dominates a research run, so the prompt rate carries most of
        // the total: at 85/15 the answer sits nearer 3 than 15 per million.
        const perMillion = (cost.amount / totals.tokens) * 1_000_000
        expect(perMillion).toBeGreaterThan(3)
        expect(perMillion).toBeLessThan(6)
    })

    it('lets a branch go, and the others keep their names', () => {
        const plan = talosResearchPlanFor(QUESTION, 'deep')

        const shorter = talosResearchPlanWithout(plan, 'b2')

        expect(shorter.map((branch) => branch.id)).toEqual(['b1', 'b3', 'b4'])
        expect(talosResearchPlanTotals(shorter).pages).toBeLessThan(talosResearchPlanTotals(plan).pages)
    })

    /**
     * Removing then adding must not reuse a name.
     *
     * A step is identified by its branch, so a second `b2` would take the first
     * one's place in the journal — and the journal is what decides whether
     * something was already paid for.
     */
    it('never hands a new branch the name of one that was removed', () => {
        const plan = talosResearchPlanFor(QUESTION, 'deep')

        const edited = talosResearchPlanWith(talosResearchPlanWithout(plan, 'b2'), 'e i prezzi usati?', 'deep')

        expect(edited.map((branch) => branch.id)).toEqual(['b1', 'b3', 'b4', 'b5'])
        expect(new Set(edited.map((branch) => branch.id)).size).toBe(edited.length)
    })

    it('rewords a branch without changing what it is expected to cost', () => {
        const plan = talosResearchPlanFor(QUESTION, 'quick')

        const reworded = talosResearchPlanReworded(plan, 'b1', '  quanto durano le batterie  ')

        expect(reworded[0]!.question).toBe('quanto durano le batterie')
        expect(reworded[0]!.estimate).toEqual(plan[0]!.estimate)
        expect(talosResearchPlanTotals(reworded)).toEqual(talosResearchPlanTotals(plan))
    })
})
