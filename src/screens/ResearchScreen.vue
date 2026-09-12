<script setup lang="ts">
/**
 * La stazione della Ricerca: che cosa hai chiesto, e quanto hanno tenuto le risposte.
 *
 * ## Da dove viene questa forma
 *
 * Dal mockup «Talos Calm Finale» approvato dall'owner (sezione `researches`,
 * `app.js:78` e `pResearchCard` a `:194`): intestazione con il titolo e una
 * riga che dice a cosa serve il posto, la ricerca e il selettore di
 * presentazione sulla stessa riga, una striscia di filtri COI CONTEGGI, il
 * conto dei dossier con l'ordinamento, e poi i fascicoli.
 *
 * Cio' che il mockup mostra e' una demo con quattro filtri; qui restano tutti e
 * nove i secchi, perche' i dati veri hanno stati che la demo non ha — una
 * ricerca annullata, una fallita, e i tre di MB-1.
 *
 * ## Perche' la scheda guida col BILANCIO
 *
 * La ricerca sui concorrenti (2026-08-03) ha trovato che tutti e cinque i
 * prodotti aprono col volume — «56 siti», «hundreds of sources» — e nessuno
 * dice se le affermazioni hanno retto. La conclusione di quella ricerca e' che
 * la vittoria non sta in piu' citazioni, sta nel raccontare meglio il rapporto
 * fra affermazione e prova. Quindi una scheda apre col bilancio, mai col numero
 * di fonti.
 *
 * ## ⛔ MB-1 — e col bilancio non basta
 *
 * Una ricerca puo' essere «conclusa» e non avere un rapporto che si rilegge: e'
 * il caso che sul desktop ha prodotto un `done` con dentro la scusa del
 * modello. Il verdetto si calcola AL VOLO leggendo l'artefatto, senza
 * riscrivere niente su disco — cio' che e' costato denaro non si sovrascrive —
 * e la scheda dice che cosa e' successo e che cosa si puo' fare.
 *
 * Il verdetto arriva in ritardo di proposito, come il bilancio: leggere ogni
 * rapporto per disegnare una lista farebbe aspettare il disco. Le righe
 * compaiono subito e si completano dietro, che e' l'unica versione che resta
 * veloce quando ce ne sono cinquanta.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckSquare, LayoutGrid, List, Plus, Search, SlidersHorizontal, Trash2, X } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosResearchDossierCard from '@/components/talos/research/TalosResearchDossierCard.vue'
import TalosResearchDossierRow from '@/components/talos/research/TalosResearchDossierRow.vue'
import { Button } from '@/components/ui/button'
import { talosLightImpact } from '@/services/haptics'
import { useTalosBulkSelection } from '@/composables/useTalosBulkSelection'
import { useTalosDeferredBusy } from '@/composables/useTalosDeferredBusy'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { talosSfasamento } from '@/composables/useTalosCalmMotion'
import { useTalosSlidingIndicator } from '@/composables/useTalosSlidingIndicator'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { talosResearchIsResting, talosResearchIsTerminal, type TalosResearchRun } from '@/lib/research/researchRun'
import type { TalosResearchProgress } from '@/services/researchRuntime'
import {
    talosResearchActionsFor,
    talosResearchCardOf,
    talosResearchCardReportOf,
    talosResearchFilterCards,
    talosResearchReportRefOf,
    talosResearchVerdictKey,
    type TalosResearchAction,
    type TalosResearchBucket,
    type TalosResearchCard,
    type TalosResearchCardReport,
    type TalosResearchStanding,
} from '@/lib/research/researchCard'
import { talosResearchCompletionOf, type TalosResearchCompletion } from '@/lib/research/researchCompletion'
import { talosResearchParseReport } from '@/lib/research/researchReport'
import { talosResearchVerifiedStanding } from '@/lib/research/researchVerification'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'

const controller = useChatController()
const settings = useSettingsStore()
const router = useRouter()
const { t } = useTalosI18n()
const { isTablet } = useTalosTabletLayout()

const runs = ref<readonly TalosResearchRun[]>([])
const caricato = ref(false)
const error = ref<string | null>(null)
const query = ref('')
const bucket = ref<TalosResearchBucket | 'all'>('all')
const sort = ref<'recent' | 'title'>('recent')

/** Riempiti dietro la prima pittura — vedi la nota in testa. */
const standings = ref(new Map<string, TalosResearchStanding>())
const completions = ref(new Map<string, TalosResearchCompletion>())
const reports = ref(new Map<string, TalosResearchCardReport>())
/**
 * ⛔ SU QUALE CORSA è stata fatta ogni lettura.
 *
 * Misurato sul Pad il 12/09/2026 (foto RE5/RE6): una ricerca conclusa col suo
 * rapporto restava «Senza conclusione» nella stazione e nel conteggio del
 * filtro, e tornava «Conclusa» solo riaprendo l'app. La lettura era in cache per
 * ID: misurata durante la sintesi — quando il rapporto ancora non c'era — e mai
 * più guardata, perché l'id non cambia mai. Riaprire l'app svuotava la mappa, ed
 * è per questo che il secondo sguardo diceva il vero.
 *
 * ⇒ La chiave è l'impronta della corsa (`talosResearchVerdictKey`), non il suo
 * nome: quando la corsa si muove, la lettura scade da sola.
 */
const letture = ref(new Map<string, string>())

/**
 * Schede o elenco, ricordato dove la Libreria ricorda il proprio.
 *
 * Stessa impostazione di proposito: le due stazioni sono lo stesso tipo di
 * posto, e chi vuole le schede le vuole in tutti e due. Una seconda preferenza
 * sarebbe una seconda cosa da tenere allineata.
 */
const layout = computed(() => settings.state.shell.library_view)
function chooseLayout(next: 'grid' | 'list'): void {
    void settings.setShell({ library_view: next })
}

/**
 * ⛔ Una lettura vecchia NON si mostra: si aspetta.
 *
 * `null` vuol dire «non ancora guardato», ed è una risposta che il modello della
 * scheda sa dare (vedi `completion` in `researchCard.ts`). Una lettura fatta su
 * una versione precedente della corsa invece è una risposta SBAGLIATA che
 * sembra una risposta giusta — ed è quella che il 12/09 diceva «Senza
 * conclusione» su una ricerca finita col suo rapporto.
 */
function letturaValida(run: TalosResearchRun): boolean {
    return letture.value.get(run.id) === talosResearchVerdictKey(run)
}

const cards = computed(() => runs.value.map((run) => {
    const valida = letturaValida(run)
    return talosResearchCardOf(run, {
        isRunning: controller.research.registry.isRunning(run.id),
        standing: valida ? standings.value.get(run.id) ?? null : null,
        completion: valida ? completions.value.get(run.id) ?? null : null,
        report: valida ? reports.value.get(run.id) ?? null : null,
    })
}))

const shown = computed(() => {
    const filtrate = [...talosResearchFilterCards(cards.value, bucket.value, query.value)]
    if (sort.value === 'title') {
        return filtrate.sort((a, b) => a.question.localeCompare(b.question))
    }
    return filtrate.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
})

const BUCKETS: ReadonlyArray<TalosResearchBucket | 'all'> = [
    'all', 'running', 'paused', 'unfinished', 'done',
    // ⛔ MB-1: i tre nuovi stanno dopo «Concluse» e prima degli esiti veri e
    // propri, perche' e' li' che vanno cercati — chi ha chiesto «le concluse» e
    // non le trova guarda subito a destra.
    'senza-rapporto', 'bloccata-dal-permesso', 'giri-esauriti',
    'cancelled', 'failed',
]

/**
 * I filtri col LORO CONTEGGIO, come nel mockup.
 *
 * Il numero non e' decorazione: e' quello che fa decidere se cambiare filtro
 * prima di averlo provato. Un secchio vuoto resta comunque visibile — sparire
 * e ricomparire farebbe ballare la striscia sotto il dito.
 */
const filters = computed(() => BUCKETS.map((id) => ({
    id,
    label: t(`research.buckets.${id}`),
    count: id === 'all' ? cards.value.length : cards.value.filter((card) => card.bucket === id).length,
})))

const filtering = computed(() => bucket.value !== 'all' || query.value.trim().length > 0)
const countLabel = computed(() => t(filtering.value ? 'research.countFiltered' : 'research.countLabel', {
    count: shown.value.length,
}))

function clearFilters(): void {
    bucket.value = 'all'
    query.value = ''
}

async function refresh(): Promise<void> {
    try {
        runs.value = await controller.research.list()
        error.value = null
        void fillVerdicts()
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        caricato.value = true
    }
}

/**
 * Leggere i rapporti dietro la lista, uno alla volta, dopo che e' a schermo.
 *
 * Un guasto qui costa un verdetto, mai una riga: un rapporto che non si rilegge
 * e' una scheda che lo DICE — che e' esattamente il punto di MB-1 — non una
 * stazione che non si apre.
 *
 * ⛔ Il documento grezzo e non il record gia' letto: `talosResearchParseReport`
 * torna `null` su un rapporto rotto, e da un `null` non si distingue «non si
 * rilegge» da «e' stato bloccato da un permesso». Le due frasi che la scheda
 * deve dire stanno nel TESTO.
 */
async function fillVerdicts(): Promise<void> {
    for (const run of runs.value) {
        // ⛔ Non «l'ho già letta», ma «l'ho letta su QUESTA corsa». Vedi
        // `letture`: la cache per id non scadeva mai, e teneva a schermo un
        // verdetto misurato quando il rapporto non era ancora stato scritto.
        if (letturaValida(run)) continue
        const chiave = talosResearchVerdictKey(run)
        const ref_ = talosResearchReportRefOf(run)
        const document = ref_ ? await controller.research.reportDocument(ref_).catch(() => null) : null

        const completion = talosResearchCompletionOf({
            reportRef: ref_,
            report: document,
            evidence: run.steps.map((step) => step.error),
        })
        // Mappe nuove, o i `computed` qui sopra non si accorgono di niente.
        completions.value = new Map(completions.value).set(run.id, completion)

        /*
         * ⛔ Il rapporto che NON si rilegge cancella l'anteprima vecchia invece
         * di lasciarla in piedi: una scheda che mostra le fonti di una lettura
         * precedente accanto a un verdetto nuovo racconta due corse diverse
         * nello stesso riquadro.
         */
        const record = document ? talosResearchParseReport(document) : null
        const nuoviReports = new Map(reports.value)
        const nuoveStandings = new Map(standings.value)
        if (record) {
            nuoviReports.set(run.id, talosResearchCardReportOf(record))
            nuoveStandings.set(run.id, talosResearchVerifiedStanding(
                record.claims.map((claim) => ({
                    claim: { text: claim.text, sourceIndex: claim.sourceIndex, quote: '', quotePresent: 'yes' as const },
                    passage: claim.passage,
                    checks: claim.checks,
                })),
            ))
        } else {
            nuoviReports.delete(run.id)
            nuoveStandings.delete(run.id)
        }
        reports.value = nuoviReports
        standings.value = nuoveStandings
        /*
         * ⛔ Si segna ALLA FINE, e si segna su quale corsa: prima questa riga
         * non esisteva e al suo posto c'era «ho già una completion per questo
         * id», che è vero per sempre. Da lì il verdetto stantio del 12/09.
         */
        letture.value = new Map(letture.value).set(run.id, chiave)
    }
}

function forget(ids: readonly string[]): void {
    standings.value = new Map([...standings.value].filter(([id]) => !ids.includes(id)))
    completions.value = new Map([...completions.value].filter(([id]) => !ids.includes(id)))
    reports.value = new Map([...reports.value].filter(([id]) => !ids.includes(id)))
    letture.value = new Map([...letture.value].filter(([id]) => !ids.includes(id)))
}

/** Osservatori sulle corse in volo, lasciati andare all'uscita — mai le corse. */
const watching = new Map<string, () => void>()

/**
 * Le ricerche che qualcuno ha chiesto di fermare, finche' la risposta non arriva.
 *
 * Visto sul tablet 2026-08-03: una pausa chiesta mentre si scriveva il RAPPORTO
 * lascia finire quel passo — ed e' drain-then-checkpoint che funziona, perche'
 * la chiamata era gia' partita e gia' pagata — e la ricerca si conclude.
 * Corretto, e del tutto silenzioso: il tocco spariva e basta.
 */
const asked = new Set<string>()

function absorb(progress: TalosResearchProgress): void {
    const run = progress.run
    runs.value = [run, ...runs.value.filter((entry) => entry.id !== run.id)]
    /*
     * ⛔ La corsa è cambiata, quindi la lettura fatta su quella di prima è
     * scaduta: si rilegge. Prima questa riga non c'era, e l'ultimo evento — il
     * più importante, quello in cui la ricerca finisce e il rapporto compare —
     * aggiornava la corsa e lasciava il verdetto di mezz'ora prima (Pad,
     * 12/09/2026, foto RE5/RE6).
     *
     * Costa poco: senza un rapporto su disco non c'è niente da leggere, e la
     * chiave ferma da sola i giri inutili.
     */
    void fillVerdicts()

    if (!asked.has(run.id)) return
    if (talosResearchIsResting(run.status)) {
        asked.delete(run.id)
    } else if (talosResearchIsTerminal(run.status)) {
        asked.delete(run.id)
        notice.value = run.status === 'done' ? t('research.finishedInstead') : null
    }
}

function followRunning(): void {
    for (const runId of controller.research.registry.running()) {
        if (watching.has(runId)) continue
        watching.set(runId, controller.research.registry.watch(runId, absorb))
    }
}

onMounted(async () => {
    await refresh()
    followRunning()
})

onBeforeUnmount(() => {
    for (const stop of watching.values()) stop()
    watching.clear()
})

function open(id: string): void {
    void router.push({ name: 'research-report', params: { id } })
}

function openSource(id: string, index: number): void {
    void router.push({ name: 'research-source', params: { id, index: String(index) } })
}

/**
 * Le azioni di una riga, e le due domande che fanno prima di agire.
 *
 * `busy` tiene una sola azione per volta e disegna un'attesa solo quando si
 * rivela vera. Gli errori si dicono ad alta voce invece di essere inghiottiti:
 * un'azione che in silenzio non ha fatto niente e' peggio di una fallita,
 * perche' la persona la riprova.
 */
const busy = useTalosDeferredBusy()
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)

const renameTarget = ref<TalosResearchCard | null>(null)
const renameValue = ref('')
const renameField = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<TalosResearchCard | null>(null)
const cancelTarget = ref<TalosResearchCard | null>(null)

const ACTION_LABEL: Record<TalosResearchAction, string> = {
    open: 'research.actionOpen',
    rename: 'research.actionRename',
    pause: 'research.actionPause',
    resume: 'research.actionResume',
    cancel: 'research.actionCancel',
    delete: 'research.actionDelete',
}

function menuFor(card: TalosResearchCard): TalosRowAction[] {
    return talosResearchActionsFor(card).map((action) => ({
        id: action,
        label: t(ACTION_LABEL[action]),
        danger: action === 'delete',
        testId: `talos-research-action-${action}`,
    }))
}

async function act(card: TalosResearchCard, action: string): Promise<void> {
    actionError.value = null
    notice.value = null
    switch (action) {
        case 'open': open(card.id); return
        case 'rename':
            renameTarget.value = card
            renameValue.value = card.renamed ? card.question : ''
            await nextTick()
            renameField.value?.focus()
            return
        // Le due distruttive CHIEDONO prima. La pausa no: non porta via niente,
        // e una conferma li' sarebbe attrito a guardia del nulla.
        case 'cancel': cancelTarget.value = card; return
        case 'delete': deleteTarget.value = card; return
        case 'pause':
            asked.add(card.id)
            await guarded(card.id, () => controller.research.pause(card.id), false)
            return
        case 'resume': await guarded(card.id, async () => {
            await controller.research.resume(card.id)
            followRunning()
        }, false); return
    }
}

/**
 * `reread` e' falso per le azioni che il registro VIVO gia' riporta.
 *
 * Il tablet ha mostrato perche': toccare Pausa su una ricerca in corso non
 * cambiava niente a schermo. Il registro aveva riportato `pause_requested` — il
 * momento fra l'essere chiesto e il poter obbedire — e la scheda l'aveva per un
 * istante, prima che questa funzione rileggesse la lista dal giornale e
 * rimettesse il `collecting` che il disco ancora teneva.
 */
async function guarded(key: string, work: () => Promise<unknown>, reread = true): Promise<void> {
    try {
        await busy.run(key, work)
        if (reread) await refresh()
    } catch (failure) {
        actionError.value = failure instanceof Error ? failure.message : String(failure)
    }
}

async function submitRename(): Promise<void> {
    const target = renameTarget.value
    if (!target) return
    const title = renameValue.value.trim()
    await guarded(target.id, () => controller.research.rename(target.id, title.length === 0 ? null : title))
    renameTarget.value = null
}

async function confirmCancel(): Promise<void> {
    const target = cancelTarget.value
    if (!target) return
    await guarded(target.id, () => controller.research.cancel(target.id), false)
    cancelTarget.value = null
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value
    if (!target) return
    try {
        const removed = await busy.run(target.id, () => controller.research.remove(target.id))
        // Si dice cosa se n'e' andato. Un'eliminazione che ha portato via anche
        // diciotto dossier senza dirlo e' un'eliminazione non verificabile.
        if (removed) {
            notice.value = removed.length > 0
                ? t('research.deletedSources', { count: removed.length })
                : t('research.deletedAlone')
        }
        forget([target.id])
        await refresh()
    } catch (failure) {
        actionError.value = failure instanceof Error ? failure.message : String(failure)
    }
    deleteTarget.value = null
}

/**
 * Selezionarne piu' di una, poi eliminarle.
 *
 * Il gesto del tieni-premuto era stato LIBERATO per questa funzione e poi non
 * costruita: tenere premuta una ricerca non faceva niente. La ricerca sulle
 * azioni di riga (2026-08-03) dice esattamente questo — il menu ⋯ e' la via
 * primaria per agire su UNA, e il tieni-premuto e' la SELEZIONE — quindi qui il
 * gesto non apre un secondo menu: accende il modo.
 */
const bulk = useTalosBulkSelection()
const bulkDeleteOpen = ref(false)

/**
 * Una ricerca IN CORSO non si elimina — non e' una scelta di questa schermata,
 * e' `talosResearchActionsFor` che non offre `delete` mentre gira, perche' il
 * driver sta ancora scrivendo su quella voce del giornale.
 */
function selectable(card: TalosResearchCard): boolean {
    return card.bucket !== 'running'
}

const selectableIds = computed(() => shown.value.filter(selectable).map((card) => card.id))

function tapCard(card: TalosResearchCard): void {
    if (!bulk.active.value) { open(card.id); return }
    if (selectable(card)) bulk.toggle(card.id)
}

/**
 * Il tieni-premuto: 500 ms senza muovere il dito, come nelle Chat.
 *
 * Lo stesso `HOLD_SLOP_PX` esiste perche' senza tolleranza uno scorrimento
 * lento della lista accende la selezione, e senza il `touch-action: pan-y` sul
 * contenitore la WebView manda `pointercancel` e il gesto non finisce mai —
 * misurato su questo telefono, non supposto.
 */
const HOLD_MS = 500
const HOLD_SLOP_PX = 10
let holdTimer: ReturnType<typeof setTimeout> | null = null
let holdOrigin: { x: number, y: number } | null = null
let suppressNextClick = false

function clearHold(): void {
    if (holdTimer !== null) clearTimeout(holdTimer)
    holdTimer = null
    holdOrigin = null
}

function onCardPointerDown(card: TalosResearchCard, event: PointerEvent): void {
    /**
     * Un gesto nuovo azzera la soppressione del gesto precedente.
     *
     * Visto sul OnePlus Pad 3 (2026-08-04): dopo un tieni-premuto il tocco DOPO
     * non spuntava niente. Il tieni-premuto alza la bandiera per mangiarsi il
     * proprio click — quello che chiude la pressione, che aprirebbe la ricerca
     * nell'istante in cui si accende la selezione — ma quel click a volte non
     * arriva mai, e la bandiera resta alzata ad aspettarlo.
     */
    suppressNextClick = false
    if (bulk.active.value) return
    clearHold()
    holdOrigin = { x: event.clientX, y: event.clientY }
    holdTimer = setTimeout(() => {
        void talosLightImpact()
        suppressNextClick = true
        bulk.enter(selectable(card) ? card.id : undefined)
        clearHold()
    }, HOLD_MS)
}

function onCardPointerMove(event: PointerEvent): void {
    if (!holdOrigin) return
    if (Math.abs(event.clientX - holdOrigin.x) > HOLD_SLOP_PX
        || Math.abs(event.clientY - holdOrigin.y) > HOLD_SLOP_PX) clearHold()
}

function onCardPointerEnd(): void {
    clearHold()
}

function onCardClickCapture(event: Event): void {
    if (!suppressNextClick) return
    suppressNextClick = false
    event.stopPropagation()
    event.preventDefault()
}

async function confirmBulkDelete(): Promise<void> {
    const ids = bulk.ids.value
    if (ids.length === 0) return
    actionError.value = null
    notice.value = null
    let sources = 0
    const stubborn: string[] = []
    for (const id of ids) {
        try {
            const removed = await controller.research.remove(id)
            sources += removed?.length ?? 0
        } catch {
            stubborn.push(id)
        }
    }
    const done = ids.length - stubborn.length
    // Si dice quante sono andate E quante no: un'eliminazione di gruppo che
    // tace sui rifiuti e' un'eliminazione che la persona non puo' verificare.
    const parts: string[] = []
    if (done > 0) {
        parts.push(sources > 0
            ? t('research.bulkDeletedSources', { count: done, sources })
            : t('research.bulkDeleted', { count: done }))
    }
    if (stubborn.length > 0) parts.push(t('research.bulkDeleteFailed', { count: stubborn.length }))
    notice.value = parts.length > 0 ? parts.join(' ') : null
    forget(ids.filter((id) => !stubborn.includes(id)))
    bulkDeleteOpen.value = false
    await refresh()
    bulk.reconcile(runs.value.map((run) => run.id))
}

function startNew(): void {
    void router.push({ name: 'research-new' })
}

function when(iso: string): string {
    // Solo la data: una ricerca e' una cosa che hai fatto in un giorno, e il
    // minuto in cui e' partita e' rumore in un elenco che si scorre.
    return new Date(iso).toLocaleDateString()
}

/* ═══ U-14 — il movimento del mockup, in questa stazione ═══════════════════
 *
 * Le stesse quattro cose delle Note, dalle stesse composable e dagli stessi
 * token: il filo sotto la scelta attiva SCIVOLA, le schede si riordinano invece
 * di saltare (FLIP), una ricerca nuova ENTRA, l'onda parte dal dito. Nessuna
 * durata e' scritta qui dentro — inventario e numeri misurati in
 * `.claude/MOTION-MOCKUP-2026-09-11.md`.
 */
const gruppoVista = ref<HTMLElement | null>(null)
const gruppoFiltri = ref<HTMLElement | null>(null)
useTalosSlidingIndicator(gruppoVista, layout)
useTalosSlidingIndicator(gruppoFiltri, bucket)

const onda = useTalosTouchWave()

/**
 * L'entrata di una scheda, come attributi da applicare alla riga.
 *
 * ⛔ Il ritardo e' un `calc()` sul token del motore, non un numero: a
 * «Movimento interfaccia» spento il token va a `0ms` e il `calc()` si annulla
 * da se'. Un numero scritto qui resterebbe li' anche a movimento spento, e la
 * lista comparirebbe a scaglioni senza animarsi — il peggiore dei due mondi.
 */
function entrata(indice: number): Record<string, unknown> {
    const stile = talosSfasamento(indice)
    if (!stile) return {}
    return { 'data-talos-motion-intent': 'message-insert', style: stile }
}
</script>

<template>
    <div
        class="flex min-h-full flex-col px-[var(--talos-space-page)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))] pt-[var(--talos-space-section)]"
        data-testid="talos-research-screen"
    >
        <!-- Che posto e' questo. Il titolo e una riga sola che dice cosa ci si
             mette: una stazione aperta dal menu deve dire da sola dove si e'
             finiti. Il pulsante primario sta QUI, e non c'e' piu' un bottone
             che galleggia sopra l'ultima scheda. -->
        <header class="flex items-start justify-between gap-[var(--talos-space-section)]">
            <div class="min-w-0">
                <h1 class="text-3xl font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--talos-text)]">
                    {{ t('stations.deepResearchTitle') }}
                </h1>
                <p class="mt-[var(--talos-space-inline)] text-sm leading-6 text-[var(--talos-muted)]">
                    {{ t('research.subtitle') }}
                </p>
            </div>
            <!-- Sul tablet il pulsante dice cosa fa; sul telefono, dove la riga
                 del titolo e' tutta la larghezza che c'e', resta il quadrato in
                 accento col nome accessibile intatto. -->
            <Button
                type="button"
                data-testid="talos-research-new"
                :aria-label="t('research.newTitle')"
                :class="[
                    'talos-pressable shrink-0 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]',
                    isTablet ? 'min-h-touch gap-2 px-5 text-sm font-medium' : 'size-14 p-0',
                ]"
                @click="startNew"
            >
                <Plus :class="isTablet ? 'size-4' : 'size-6'" aria-hidden="true" />
                <span v-if="isTablet">{{ t('research.newTitle') }}</span>
            </Button>
        </header>

        <!-- Ricerca e presentazione, sulla stessa riga: sono le due cose che si
             fanno prima di guardare. Il campo sta FUORI da ogni catena `v-if` —
             deve restare visibile anche con la lista vuota, perche' e' con la
             lista vuota che si cancella il filtro. -->
        <div class="mt-[var(--talos-space-section)] flex items-stretch gap-[var(--talos-space-card)]">
            <label class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                <input
                    v-model="query"
                    type="search"
                    inputmode="search"
                    data-testid="talos-research-search"
                    :placeholder="t('research.searchPlaceholder')"
                    :aria-label="t('research.searchPlaceholder')"
                    class="min-h-touch w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                >
            </label>

            <!-- Un radiogroup e non due bottoni indipendenti: sono alternative,
                 e dirlo e' cio' che le rende comprensibili a chi naviga con lo
                 screen reader. -->
            <div
                ref="gruppoVista"
                role="radiogroup"
                :aria-label="t('research.viewLabel')"
                class="flex shrink-0 items-center gap-[2px] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[3px]"
            >
                <button
                    v-for="mode in ([['list', t('research.viewList'), List], ['grid', t('research.viewGrid'), LayoutGrid]] as const)"
                    :key="mode[0]"
                    type="button"
                    role="radio"
                    :aria-checked="layout === mode[0]"
                    :aria-label="mode[1]"
                    :data-testid="`talos-research-view-${mode[0]}`"
                    :class="[
                        'talos-pressable talos-wave-host relative flex min-h-touch min-w-touch items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-xs',
                        layout === mode[0] ? 'bg-[var(--talos-secondary)] text-[var(--talos-text)]' : 'text-[var(--talos-muted)]',
                    ]"
                    @click="chooseLayout(mode[0])"
                    @pointerdown="onda.onPointerDown"
                >
                    <component :is="mode[2]" class="size-4" aria-hidden="true" />
                    <span v-if="isTablet">{{ mode[1] }}</span>
                    <span
                        v-if="layout === mode[0]"
                        data-talos-indicator
                        aria-hidden="true"
                        class="talos-calm-indicator absolute bottom-[5px] left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full bg-[var(--talos-accent)]"
                    />
                </button>
            </div>
        </div>

        <!-- Cosa sto guardando, col conto di quante ce ne sono in ciascun
             gruppo: il numero e' cio' che fa decidere se cambiare filtro. -->
        <div
            ref="gruppoFiltri"
            role="radiogroup"
            :aria-label="t('research.filterLabel')"
            data-testid="talos-research-filters"
            class="mt-[var(--talos-space-card)] flex min-h-touch items-center gap-[var(--talos-space-inline)] overflow-x-auto border-b border-[var(--talos-border)] [scrollbar-width:none]"
        >
            <button
                v-for="choice in filters"
                :key="choice.id"
                type="button"
                role="radio"
                :aria-checked="bucket === choice.id"
                :tabindex="bucket === choice.id ? 0 : -1"
                :data-testid="`talos-research-filter-${choice.id}`"
                :class="[
                    'talos-pressable talos-wave-host relative inline-flex min-h-touch shrink-0 items-center gap-[var(--talos-space-inline)] whitespace-nowrap rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-xs',
                    bucket === choice.id ? 'text-[var(--talos-text)]' : 'text-[var(--talos-muted)]',
                ]"
                @click="bucket = choice.id"
                @pointerdown="onda.onPointerDown"
            >
                <span>{{ choice.label }}</span>
                <small class="text-2xs tabular-nums">{{ choice.count }}</small>
                <span
                    v-if="bucket === choice.id"
                    data-talos-indicator
                    aria-hidden="true"
                    class="talos-calm-indicator absolute bottom-0 left-[var(--talos-space-control)] right-[var(--talos-space-control)] h-[2px] rounded-full bg-[var(--talos-accent)]"
                />
            </button>
        </div>

        <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-inline)] text-xs text-[var(--talos-muted)]">
            <span role="status" aria-live="polite" data-testid="talos-research-count">{{ caricato ? countLabel : '' }}</span>
            <div class="flex shrink-0 items-center gap-1">
                <label class="flex items-center gap-1">
                    <SlidersHorizontal class="size-4" aria-hidden="true" />
                    <span class="sr-only">{{ t('research.sortLabel') }}</span>
                    <!-- Un `select` nativo: sul telefono apre la ruota di
                         Android, che e' il controllo che la persona conosce
                         gia', e non ha bisogno di un pannello nostro per due
                         voci. -->
                    <select
                        v-model="sort"
                        data-testid="talos-research-sort"
                        :aria-label="t('research.sortLabel')"
                        class="min-h-touch max-w-36 cursor-pointer border-0 bg-transparent px-1 text-xs text-[var(--talos-muted)] outline-none"
                    >
                        <option value="recent">{{ t('research.sortRecent') }}</option>
                        <option value="title">{{ t('research.sortTitle') }}</option>
                    </select>
                </label>
                <!-- Owner sulle Chat, chiesto due volte: se nella selezione si
                     entra solo tenendo premuto, non la trova nessuno. Sparisce
                     mentre il modo e' acceso perche' la barra sotto possiede
                     gia' l'uscita. -->
                <button
                    v-if="!bulk.active.value && selectableIds.length > 0"
                    type="button"
                    data-testid="talos-research-select-header"
                    :aria-label="t('research.selectResearches')"
                    class="talos-pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="bulk.enter()"
                >
                    <CheckSquare class="size-4" aria-hidden="true" />
                </button>
            </div>
        </div>

        <!-- La barra della selezione: mentre il modo e' acceso la schermata ha
             UN significato solo. -->
        <div
            v-if="bulk.active.value"
            data-testid="talos-research-selection-bar"
            class="mt-[var(--talos-space-inline)] flex items-center gap-1 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] py-1 pl-1 pr-2"
        >
            <Button type="button" size="icon" variant="ghost" class="min-h-touch min-w-touch rounded-full" :aria-label="t('research.cancelSelection')" data-testid="talos-research-selection-exit" @click="bulk.exit()">
                <X class="size-4" aria-hidden="true" />
            </Button>
            <span class="text-sm font-medium">{{ bulk.count.value === 1 ? t('research.selectedOne') : t('research.selected', { count: bulk.count.value }) }}</span>
            <Button type="button" variant="ghost" size="sm" class="ml-auto" data-testid="talos-research-select-all" @click="bulk.selectAll(selectableIds)">
                {{ bulk.allSelected(selectableIds) ? t('common.none') : t('library.all') }}
            </Button>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                class="min-h-touch min-w-touch rounded-full text-[var(--talos-danger)]"
                data-testid="talos-research-bulk-delete"
                :aria-label="t('research.deleteSelected')"
                :disabled="bulk.count.value === 0"
                @click="bulkDeleteOpen = true"
            >
                <Trash2 class="size-4" aria-hidden="true" />
            </Button>
        </div>

        <!-- Detto senza rubare il fuoco: un messaggio di stato si sente, non ci
             si salta sopra. -->
        <p v-if="notice" role="status" data-testid="talos-research-notice" class="mt-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs text-[var(--talos-muted)]">
            {{ notice }}
        </p>
        <p v-if="actionError" role="alert" data-testid="talos-research-action-error" class="mt-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            {{ actionError }}
        </p>
        <p v-if="error" role="alert" data-testid="talos-research-error" class="mt-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            {{ error }}
        </p>

        <!-- Due assenze diverse, due frasi diverse: chi guarda non puo' sapere
             se le ricerche sono finite o se e' il filtro a nasconderle. -->
        <div
            v-if="caricato && shown.length === 0"
            :data-testid="filtering ? 'talos-research-no-matches' : 'talos-research-empty'"
            role="status"
            class="flex flex-1 flex-col items-center justify-center gap-[var(--talos-space-inline)] py-[calc(var(--talos-space-page)*2)] text-center"
        >
            <!-- Il fascicolo disegnato. Un disegno al posto di uno spazio
                 bianco: una pagina vuota che non dice niente si legge come un
                 guasto, un tratto che si disegna dice «qui non c'e' ancora
                 niente». -->
            <svg
                class="talos-calm-line-art mb-[var(--talos-space-section)] h-[132px] w-[140px] text-[var(--talos-border-strong)]"
                viewBox="0 0 150 140"
                aria-hidden="true"
            >
                <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path data-talos-draw d="M24 40h34l10 9h54v62H24Z" />
                    <path data-talos-draw d="M42 40V22h50v27" />
                    <circle data-talos-draw class="stroke-[var(--talos-accent-border)]" cx="90" cy="79" r="19" />
                    <path data-talos-draw class="stroke-[var(--talos-accent-border)]" d="m104 93 12 12" />
                </g>
            </svg>
            <h2 class="max-w-[27ch] text-xl font-medium leading-[1.5] tracking-[-0.02em] text-[var(--talos-text)]">
                {{ filtering ? t('research.noMatches') : t('research.emptyTitle') }}
            </h2>
            <p class="max-w-[38ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
                {{ filtering ? t('research.noMatchesBody') : t('research.emptyBody') }}
            </p>
            <!-- Uno stato vuoto e' un invito ad agire, e la via d'uscita e'
                 quella che RIPARA la situazione in cui si e'. -->
            <Button
                type="button"
                :data-testid="filtering ? 'talos-research-clear-filters' : 'talos-research-empty-new'"
                class="talos-pressable mt-[var(--talos-space-section)] min-h-touch rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-5 text-xs text-[var(--talos-accent-text)]"
                @click="filtering ? clearFilters() : startNew()"
            >
                {{ filtering ? t('research.clearFilters') : t('research.newTitle') }}
            </Button>
        </div>

        <!-- U-14 — LE SCHEDE SI RIORDINANO, NON SALTANO. In Vue il FLIP e' il
             mestiere della classe `move` di `<TransitionGroup>`: si dichiara la
             transizione, la geometria la calcola lui. -->
        <TransitionGroup
            v-else-if="caricato"
            tag="ul"
            role="list"
            data-testid="talos-research-list"
            :data-layout="layout"
            class="mt-[var(--talos-space-card)] min-w-0"
            :class="layout === 'grid'
                ? 'grid grid-cols-[repeat(auto-fill,minmax(clamp(10.5rem,45%,17rem),1fr))] items-start gap-[calc(var(--talos-space-section)*1.25)]'
                : 'flex flex-col'"
            move-class="talos-calm-move"
            leave-active-class="talos-calm-leave-active"
            leave-to-class="talos-calm-leave-to"
        >
            <li
                v-for="(card, indice) in shown"
                :key="card.id"
                class="talos-holdable min-w-0 list-none"
                :style="{ touchAction: 'pan-y' }"
                @pointerdown="onCardPointerDown(card, $event)"
                @pointermove="onCardPointerMove($event)"
                @pointerup="onCardPointerEnd()"
                @pointercancel="onCardPointerEnd()"
                @click.capture="onCardClickCapture($event)"
            >
                <TalosResearchDossierCard
                    v-if="layout === 'grid'"
                    v-bind="entrata(indice)"
                    :card="card"
                    :date-label="when(card.startedAt)"
                    :actions="menuFor(card)"
                    :selection-mode="bulk.active.value"
                    :selected="bulk.isSelected(card.id)"
                    :selectable="selectable(card)"
                    :busy="busy.visible.value === card.id"
                    @open="tapCard(card)"
                    @action="(action) => act(card, action)"
                    @source="(index) => openSource(card.id, index)"
                />
                <TalosResearchDossierRow
                    v-else
                    v-bind="entrata(indice)"
                    :card="card"
                    :date-label="when(card.startedAt)"
                    :actions="menuFor(card)"
                    :selection-mode="bulk.active.value"
                    :selected="bulk.isSelected(card.id)"
                    :selectable="selectable(card)"
                    :busy="busy.visible.value === card.id"
                    @open="tapCard(card)"
                    @action="(action) => act(card, action)"
                />
            </li>
        </TransitionGroup>

        <TalosMobileConfirmDialog
            v-if="renameTarget"
            :title="t('research.renameTitle')"
            :description="t('research.renameHint')"
            @close="renameTarget = null"
        >
            <label class="block text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]" for="talos-research-rename-field">
                {{ t('research.renameLabel') }}
            </label>
            <input
                id="talos-research-rename-field"
                ref="renameField"
                v-model="renameValue"
                type="text"
                maxlength="120"
                data-testid="talos-research-rename-field"
                :placeholder="renameTarget.originalQuestion"
                class="min-h-touch w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                @keyup.enter="submitRename()"
            >
            <template #footer>
                <Button variant="ghost" @click="renameTarget = null">{{ t('common.cancel') }}</Button>
                <Button data-testid="talos-research-rename-save" @click="submitRename()">{{ t('common.save') }}</Button>
            </template>
        </TalosMobileConfirmDialog>

        <!-- Chiede come quella singola, e per la stessa ragione: porta via
             anche i dossier delle fonti. -->
        <TalosMobileConfirmDialog
            v-if="bulkDeleteOpen"
            :title="t('research.bulkDeleteTitle', { count: bulk.count.value })"
            :description="t('research.bulkDeleteBody')"
            @close="bulkDeleteOpen = false"
        >
            <template #footer>
                <Button variant="ghost" @click="bulkDeleteOpen = false">{{ t('common.cancel') }}</Button>
                <Button variant="destructive" :class="TALOS_DANGER_ACTION_CLASS" data-testid="talos-research-bulk-delete-confirm" @click="confirmBulkDelete()">
                    {{ t('research.deleteConfirm') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <!-- ⛔ «Ha raccolto qualcosa?», non «è conclusa».
             La condizione era `bucket === 'done'`, e con MB-1 si è rivelata
             sbagliata: una ricerca finita senza un rapporto che si rilegge NON
             sta più nel secchio «done», ma i dossier delle fonti che ha pagato
             ci sono eccome — e portarli via in silenzio è precisamente ciò che
             questa frase esiste per evitare. Un passo finito è un dossier sul
             disco. -->
        <TalosMobileConfirmDialog
            v-if="deleteTarget"
            :title="t('research.deleteTitle', { title: deleteTarget.question })"
            :description="deleteTarget.done > 0 ? t('research.deleteBodyWithSources') : t('research.deleteBody')"
            @close="deleteTarget = null"
        >
            <template #footer>
                <Button variant="ghost" @click="deleteTarget = null">{{ t('common.cancel') }}</Button>
                <Button variant="destructive" :class="TALOS_DANGER_ACTION_CLASS" data-testid="talos-research-delete-confirm" @click="confirmDelete()">
                    {{ t('research.deleteConfirm') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <!-- Annullare si conferma perche' non si torna indietro. Mettere in
             pausa no, perche' non porta via niente. -->
        <TalosMobileConfirmDialog
            v-if="cancelTarget"
            :title="t('research.cancelTitle', { title: cancelTarget.question })"
            :description="t('research.cancelBody')"
            @close="cancelTarget = null"
        >
            <template #footer>
                <Button variant="ghost" @click="cancelTarget = null">{{ t('research.cancelKeep') }}</Button>
                <Button variant="destructive" :class="TALOS_DANGER_ACTION_CLASS" data-testid="talos-research-cancel-confirm" @click="confirmCancel()">
                    {{ t('research.cancelConfirm') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </div>
</template>
