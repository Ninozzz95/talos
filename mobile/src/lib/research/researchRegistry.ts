import type { TalosResearchProgress } from '@/services/researchRuntime'

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
    /** The last progress a run reported, if it reported any. */
    latest(runId: string): TalosResearchProgress | null
}

export function createTalosResearchRegistry(): TalosResearchRegistry {
    const watchers = new Map<string, Set<TalosResearchWatcher>>()
    const latest = new Map<string, TalosResearchProgress>()
    const live = new Set<string>()

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
            live.add(runId)
            return (progress) => fanOut(runId, progress)
        },
        close(runId) {
            live.delete(runId)
        },
        isRunning(runId) {
            return live.has(runId)
        },
        running() {
            return [...live]
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
