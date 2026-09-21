import { onMounted, ref, type Ref } from 'vue'
import { useChatController } from '@/stores/chatController'
import { talosResearchReportRefOf } from '@/lib/research/researchCard'
import type { TalosResearchRun } from '@/lib/research/researchRun'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'

/**
 * One research and its report, loaded once, for the three pages that need both.
 *
 * The report page, the claim page and the source page are the same object seen
 * at three distances — and each one arrives by URL, which means each one has to
 * be able to load from nothing. Writing that fetch three times is how the three
 * start disagreeing about what "not found" looks like.
 *
 * `missing` is a state, not an error: a link to a research that has been deleted
 * is an ordinary thing to click, and the page should say so plainly rather than
 * show an empty document or a stack trace.
 */
export interface TalosResearchRunView {
    readonly run: Ref<TalosResearchRun | null>
    readonly report: Ref<TalosResearchReportRecord | null>
    readonly loading: Ref<boolean>
    /** The run itself could not be found. */
    readonly missing: Ref<boolean>
    /** The run exists; its report does not parse, or was never written. */
    readonly reportUnreadable: Ref<boolean>
    reload(): Promise<void>
}

export function useTalosResearchRun(runId: () => string): TalosResearchRunView {
    const controller = useChatController()
    const run = ref<TalosResearchRun | null>(null)
    const report = ref<TalosResearchReportRecord | null>(null)
    const loading = ref(true)
    const missing = ref(false)
    const reportUnreadable = ref(false)

    async function reload(): Promise<void> {
        loading.value = true
        missing.value = false
        reportUnreadable.value = false
        try {
            const all = await controller.research.list()
            const found = all.find((entry) => entry.id === runId()) ?? null
            run.value = found
            if (!found) {
                missing.value = true
                report.value = null
                return
            }
            const ref_ = talosResearchReportRefOf(found)
            if (!ref_) {
                // Not an error: a run still working, or one that stopped before
                // writing, simply has no report yet.
                report.value = null
                return
            }
            report.value = await controller.research.report(ref_)
            // Said out loud rather than shown as an empty panel: a report that
            // will not parse is a report whose verification cannot be trusted.
            reportUnreadable.value = report.value === null
        } catch {
            missing.value = run.value === null
        } finally {
            loading.value = false
        }
    }

    onMounted(reload)

    return { run, report, loading, missing, reportUnreadable, reload }
}
