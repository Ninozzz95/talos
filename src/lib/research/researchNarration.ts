import {
    talosResearchIsResting,
    talosResearchIsTerminal,
    talosResearchWorkLeft,
    type TalosResearchRun,
    type TalosResearchStep,
} from '@/lib/research/researchRun'
import { talosResearchReportRefOf } from '@/lib/research/researchCard'

/**
 * What the research is doing, said in a sentence.
 *
 * Owner 2026-08-03, on the page as it was: «non c'è un progresso di quello che
 * si sta facendo … dei termini molto tecnici». He was right, and the diagnosis
 * is precise: the page said HOW MUCH (`0/2`, `3 s`, `RACCOLGO`) and never WHAT.
 * A counter is only meaningful to someone who already knows what is being
 * counted; the person watching wants the other half.
 *
 * The material for the sentence was already there and unused. The plan was
 * approved before a penny was spent, so every branch carries the question it
 * went to answer — which means «sto cercando le fonti su «chi la brevettò»» is
 * not a friendly paraphrase of the state, it IS the state, read out loud.
 *
 * Everything here is arithmetic over the run: no disk, no network, no clock of
 * its own. The line can therefore be drawn in the same frame as the tap.
 */

export interface TalosResearchLine {
    /** An i18n key. The words live in the locales, never here. */
    readonly key: string
    readonly params: Readonly<Record<string, string>>
}

const NO_PARAMS: Readonly<Record<string, string>> = Object.freeze({})

function line(key: string, params: Readonly<Record<string, string>> = NO_PARAMS): TalosResearchLine {
    return { key, params }
}

/** The question a branch went to answer — the only human name a step has. */
function branchQuestion(run: TalosResearchRun, branchId: string): string | null {
    return run.plan.find((branch) => branch.id === branchId)?.question ?? null
}

/**
 * One sentence for the whole run.
 *
 * `driving` comes from the registry rather than from the journal, and the two
 * genuinely disagree: a run killed with the app still reads `collecting`, and
 * saying «sto cercando» about a run nobody is driving would be a lie the person
 * could sit and watch for an hour. Stopped is its own sentence, with the place
 * it would pick up from.
 */
export function talosResearchNarration(run: TalosResearchRun, driving: boolean): TalosResearchLine {
    if (talosResearchIsTerminal(run.status)) {
        if (run.status === 'cancelled') return line('research.cancelledHere')
        if (run.status === 'failed') return line('research.say.failed')
        /**
         * «Conclusa» and «conclusa senza rapporto» are the same status and two
         * entirely different situations, and telling the person the first when
         * it was the second cost hours on 2026-08-03: the run had ended, the
         * page said so, and nobody thought to ask why there was nothing to read.
         */
        return talosResearchReportRefOf(run) ? line('research.say.done') : line('research.doneNoReport')
    }

    // Where it would pick up. Terminal runs owe nothing, which is why this is
    // read only after the terminal branch above.
    const next = talosResearchWorkLeft(run)[0]?.question ?? null

    /**
     * Asked to stop is not stopped. A pause during a step that has already been
     * paid for lets it finish and commit first — «drain then checkpoint» — and
     * the gap between the two can be a minute of a person watching a button
     * they already pressed. Saying «in pausa» there would be the page's word
     * against the spinner's.
     */
    if (run.status === 'pause_requested') return line('research.say.pausing')
    if (talosResearchIsResting(run.status)) {
        return next ? line('research.say.pausedAt', { question: next }) : line('research.say.paused')
    }
    if (!driving) {
        return next ? line('research.say.stoppedAt', { question: next }) : line('research.say.stopped')
    }
    if (run.plan.length === 0) return line('research.say.planning')

    const running = run.steps.find((step) => step.state === 'running')
    if (running) {
        if (running.kind === 'synthesise') return line('research.say.writing')
        if (running.kind === 'verify') return line('research.say.verifying')
        const question = branchQuestion(run, running.branchId)
        if (!question) return line('research.say.collecting')
        return line(running.kind === 'read' ? 'research.say.reading' : 'research.say.searching', { question })
    }

    // Between two steps the engine has already decided what comes next, and the
    // gap is milliseconds. Saying what it is about to do beats going silent for
    // the one frame where a person is most likely to be looking.
    return next ? line('research.say.searching', { question: next }) : line('research.say.writing')
}

export interface TalosResearchDoneNotice {
    /** The person's own words, untranslated — it is their question. */
    readonly title: string
    readonly text: TalosResearchLine
    /** The page of THIS research. A notification that lands anywhere else has
     *  spent the user's attention and given nothing back. */
    readonly route: string
}

/**
 * What to announce when a research ends, or nothing.
 *
 * A research takes minutes: the person starts it, locks the phone, and until
 * today nothing told them it was over. They had to sit and watch it — which
 * makes the background work worth nothing.
 *
 * `cancelled` is deliberately silent. They stopped it themselves seconds ago;
 * telling them it stopped is the app repeating their own action back at them,
 * and every such notification makes the next one easier to swipe away unread.
 */
export function talosResearchDoneNotice(run: TalosResearchRun): TalosResearchDoneNotice | null {
    if (!talosResearchIsTerminal(run.status)) return null
    if (run.status === 'cancelled') return null
    return {
        title: run.title ?? run.question,
        // Not driving, and terminal: the same sentence the page shows, which is
        // how the notification and the page cannot end up disagreeing.
        text: talosResearchNarration(run, false),
        route: `/research/${run.id}`,
    }
}

/**
 * A step's name, for the record at the bottom of the page.
 *
 * The record used to print `b1:search` and `synthesis`, which are the engine's
 * own identifiers — useful to exactly one reader, and he wrote them. The names
 * here say what the step was FOR, and the branch question makes each search
 * distinguishable from the next without a serial number.
 */
export function talosResearchStepTitle(run: TalosResearchRun, step: TalosResearchStep): TalosResearchLine {
    if (step.kind === 'synthesise') return line('research.stepTitle.write')
    if (step.kind === 'verify') return line('research.stepTitle.verify')
    const question = branchQuestion(run, step.branchId)
    if (step.kind === 'read') {
        return question ? line('research.stepTitle.read', { question }) : line('research.stepTitle.readPlain')
    }
    return question ? line('research.stepTitle.search', { question }) : line('research.stepTitle.searchPlain')
}
