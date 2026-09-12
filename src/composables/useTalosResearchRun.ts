import { onMounted, ref, type Ref } from 'vue'
import { useChatController } from '@/stores/chatController'
import { talosResearchReportRefOf, talosResearchVerdictKey } from '@/lib/research/researchCard'
import { talosResearchCompletionOf, type TalosResearchCompletion } from '@/lib/research/researchCompletion'
import { talosResearchParseReport } from '@/lib/research/researchReport'
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
    /**
     * MB-1 — come e' finita davvero, misurata sull'artefatto.
     *
     * `null` finche' non si e' guardato. Sta accanto a `reportUnreadable` e non
     * al suo posto: quello e' un si'/no, questo dice PERCHE', ed e' il perche'
     * che la pagina deve mettere a schermo.
     */
    readonly completion: Ref<TalosResearchCompletion | null>
    reload(): Promise<void>
    /**
     * ⛔ Rilegge se la corsa non è più quella su cui si è misurato. (MB-1)
     *
     * Il verdetto si misura sull'artefatto, quindi invecchia quando l'artefatto
     * cambia — e cambia proprio nel momento che conta, quando la ricerca
     * finisce e il rapporto viene scritto. Misurato sul Pad il 12/09/2026 (foto
     * RE5/RE6) sulla stazione: una corsa conclusa col suo rapporto mostrava
     * ancora «Senza conclusione», e tornava «Conclusa» solo riaprendo l'app.
     *
     * Chi guarda una corsa viva chiama questa a ogni passo: costa un confronto
     * di stringhe finché non c'è niente di nuovo da leggere.
     */
    ensureFresh(latest: TalosResearchRun): Promise<void>
}

export function useTalosResearchRun(runId: () => string): TalosResearchRunView {
    const controller = useChatController()
    const run = ref<TalosResearchRun | null>(null)
    const report = ref<TalosResearchReportRecord | null>(null)
    const loading = ref(true)
    const missing = ref(false)
    const reportUnreadable = ref(false)
    const completion = ref<TalosResearchCompletion | null>(null)

    /**
     * L'impronta della corsa su cui il verdetto è stato misurato. (MB-1)
     *
     * `null` = non ancora letta. Serve a `ensureFresh` per sapere se ciò che ha
     * in mano parla ancora della corsa che ha davanti.
     */
    const letturaChiave = ref<string | null>(null)

    async function reload(): Promise<void> {
        /*
         * ⛔ Una RILETTURA non è un'apertura.
         *
         * `loading` sostituisce l'intera pagina con «Sto aprendo…». Farlo mentre
         * si guarda una ricerca già a schermo — ed è quello che succede quando
         * la corsa finisce sotto gli occhi — spegnerebbe il rapporto per
         * riaccenderlo identico: uno sfarfallio al posto di un aggiornamento.
         * Per lo stesso motivo gli stati si azzerano a lettura FINITA, non
         * prima: qui in mezzo la pagina resta quella di un istante fa.
         */
        const apertura = run.value === null
        if (apertura) loading.value = true
        try {
            const all = await controller.research.list()
            const found = all.find((entry) => entry.id === runId()) ?? null
            run.value = found
            if (!found) {
                missing.value = true
                report.value = null
                completion.value = null
                reportUnreadable.value = false
                letturaChiave.value = null
                return
            }
            missing.value = false
            const ref_ = talosResearchReportRefOf(found)
            /*
             * ⛔ MB-1 — si legge il DOCUMENTO, e il record si ricava da quello.
             *
             * Prima si chiedeva direttamente il record: e `null` significava sia
             * «non c'e' nessun rapporto» sia «c'e' e non si rilegge» sia «e' la
             * scusa del modello», tre situazioni che si riparano in tre modi
             * diversi. Il testo le distingue; il record no.
             */
            const document = ref_ ? await controller.research.reportDocument(ref_) : null
            report.value = document ? talosResearchParseReport(document) : null
            completion.value = talosResearchCompletionOf({
                reportRef: ref_,
                report: document,
                evidence: found.steps.map((step) => step.error),
            })
            // Said out loud rather than shown as an empty panel: a report that
            // will not parse is a report whose verification cannot be trusted.
            reportUnreadable.value = ref_ !== null && report.value === null
            // Su QUALE corsa è stato misurato tutto questo. Vedi `ensureFresh`.
            letturaChiave.value = talosResearchVerdictKey(found)
        } catch {
            missing.value = run.value === null
        } finally {
            loading.value = false
        }
    }

    async function ensureFresh(latest: TalosResearchRun): Promise<void> {
        // Un'altra ricerca non è affare di questa pagina.
        if (latest.id !== runId()) return
        if (talosResearchVerdictKey(latest) === letturaChiave.value) return
        /*
         * ⛔ Mentre lavora non si rilegge a ogni passo: il verdetto non si mostra
         * su una corsa in volo (il secchio dice «in corso»), e una lettura per
         * passo sarebbe un giro su disco per niente. Due eccezioni, e sono
         * esattamente i momenti in cui la pagina sarebbe in ritardo: quando la
         * corsa si ferma, e quando compare un rapporto che prima non c'era.
         */
        const rapportoNuovo = talosResearchReportRefOf(latest) !== null && report.value === null
        if (controller.research.registry.isRunning(latest.id) && !rapportoNuovo) return
        await reload()
    }

    onMounted(reload)

    return { run, report, loading, missing, reportUnreadable, completion, reload, ensureFresh }
}
