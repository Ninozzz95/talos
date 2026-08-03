import { shallowRef } from 'vue'
import type { TalosResearchProgress } from '@/services/researchRuntime'
import { talosResearchProgressOf, type TalosResearchRun } from '@/lib/research/researchRun'

/**
 * The runs that are happening RIGHT NOW, and who is watching them.
 *
 * Owner 2026-08-02: "quando torni indietro quando una Deep research è già
 * iniziata bisogna mantenerla running nello sfondo".
 *
 * The run itself never lived in the screen — the runtime belongs to the
 * controller, and the journal is on disk. What lived in the screen was the only
 * handle to it: `start()` returned a promise for the whole run and the screen
 * awaited it, writing progress into its own ref. Leave the screen and that ref
 * is unmounted, the promise is unobserved, and on returning there is nothing
 * that says "this one is still going" — so a live run looked finished, or
 * abandoned, and the only way back was the Resume button meant for runs a kill
 * had interrupted.
 *
 * This is the missing middle: one place that knows what is in flight, keeps the
 * last progress each run reported, and lets any number of watchers come and go
 * without touching the run. A screen becomes a subscriber rather than an owner.
 *
 * It deliberately holds no journal state of its own. The journal on disk stays
 * the truth; this is a live index over it, and everything here is discardable
 * — losing it costs the progress indicator, never the work.
 *
 * The competitor research (2026-08-03) puts this at L1, not polish: Gemini
 * documents background execution and a notification on Android, and ChatGPT
 * says you may walk away. Stopping when the user navigates is below parity.
 */
export type TalosResearchWatcher = (progress: TalosResearchProgress) => void

export interface TalosResearchRegistry {
    /**
     * Record a run as live and return a progress sink to hand the runtime.
     *
     * The sink both fans out to the current watchers and remembers the last
     * value, so a watcher arriving late — which is the whole point — is not
     * left with a blank row until the next step lands.
     */
    open(runId: string): TalosResearchWatcher
    /** Mark a run finished, however it ended. Idempotent. */
    close(runId: string): void
    /** Whether this run is in flight right now. */
    isRunning(runId: string): boolean
    /** The ids in flight, for a screen deciding what to show as running. */
    running(): readonly string[]
    /**
     * Watch a run. Returns the unsubscribe.
     *
     * Replays the last known progress immediately when there is one: a screen
     * that has just mounted needs the current state, not the next change.
     */
    watch(runId: string, watcher: TalosResearchWatcher): () => void
    /**
     * Publish a state a run reached WITHOUT the engine driving it — a pause, a
     * cancellation, a rename.
     *
     * Deliberately not `open`: those are the moments a run stops being live, and
     * marking it live to announce that it stopped would be the same lie in the
     * other direction. The watchers still hear it, which is what makes a card
     * change under the finger instead of at the next refresh.
     */
    report(runId: string, run: TalosResearchRun): void
    /**
     * The run is GONE — forget it entirely, watchers and last state included.
     *
     * Different from `close`, and the difference matters: close means "finished"
     * and keeps the final progress on purpose, so a screen arriving afterwards
     * still sees how it ended. There is no "how it ended" for a research that
     * has been deleted, and replaying one to a late watcher would put a card
     * back on screen for something that no longer exists.
     */
    forget(runId: string): void
    /** The last progress a run reported, if it reported any. */
    latest(runId: string): TalosResearchProgress | null
}

export function createTalosResearchRegistry(): TalosResearchRegistry {
    const watchers = new Map<string, Set<TalosResearchWatcher>>()
    const latest = new Map<string, TalosResearchProgress>()
    /**
     * REACTIVE, and that is the whole point of it being a ref.
     *
     * The tablet 2026-08-03: a paused research kept saying "in corso" forever.
     * The run really had stopped — the counter sat still — but `isRunning` read
     * a plain Set, so the screen's computed had no reason to run again when the
     * run closed. It only looked right before because pausing also re-read the
     * whole list from disk, which invalidated everything by brute force; the
     * moment that re-read was removed (it was undoing the "pausing…" line) the
     * staleness underneath became visible.
     *
     * A new Set on every change rather than mutation in place: `shallowRef`
     * tracks the reference, not the contents.
     */
    const live = shallowRef<ReadonlySet<string>>(new Set())

    function fanOut(runId: string, progress: TalosResearchProgress): void {
        latest.set(runId, progress)
        for (const watcher of watchers.get(runId) ?? []) {
            // One watcher that throws must not stop the others, and must never
            // reach the run: a repaint is not allowed to fail the research.
            try {
                watcher(progress)
            } catch {
                // Ignored on purpose — see above.
            }
        }
    }

    return {
        open(runId) {
            live.value = new Set(live.value).add(runId)
            return (progress) => fanOut(runId, progress)
        },
        close(runId) {
            if (!live.value.has(runId)) return
            const next = new Set(live.value)
            next.delete(runId)
            live.value = next
        },
        report(runId, run) {
            fanOut(runId, { run, ...talosResearchProgressOf(run) })
        },
        forget(runId) {
            if (live.value.has(runId)) {
                const next = new Set(live.value)
                next.delete(runId)
                live.value = next
            }
            latest.delete(runId)
            watchers.delete(runId)
        },
        isRunning(runId) {
            return live.value.has(runId)
        },
        running() {
            return [...live.value]
        },
        watch(runId, watcher) {
            let set = watchers.get(runId)
            if (!set) {
                set = new Set()
                watchers.set(runId, set)
            }
            set.add(watcher)
            const known = latest.get(runId)
            if (known) {
                try {
                    watcher(known)
                } catch {
                    // As above: a bad watcher costs itself and nothing else.
                }
            }
            return () => {
                const current = watchers.get(runId)
                if (!current) return
                current.delete(watcher)
                // The last watcher leaving must not delete what the run
                // reported: the next screen to arrive needs it.
                if (current.size === 0) watchers.delete(runId)
            }
        },
        latest(runId) {
            return latest.get(runId) ?? null
        },
    }
}
