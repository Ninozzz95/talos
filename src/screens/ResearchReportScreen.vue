<script setup lang="ts">
/**
 * One research, at its own address.
 *
 * The report used to expand inside a row on the station — five thousand words
 * unfolding under a list. Owner 2026-08-03 asked for the card to lead somewhere,
 * and the competitor research puts "a page of its own" at L1: OpenAI, Gemini and
 * Perplexity all separated the document from the conversation, and only Claude
 * and Grok still answer with a long chat bubble.
 *
 * What leads the page is the BALANCE, not the source count. "12 supported, 3
 * partial, 1 contradicted" says whether the thing holds; "56 sources" says how
 * much was read, which is scale mistaken for support — and the research names
 * that as the single most copied mistake in the category.
 *
 * Below it the page splits in two, both registered surfaces so they inherit the
 * one strip, the swipe and the remembered choice: what it claims, and what it
 * read. Each row leads further in, because the claim and the source are the two
 * places where our evidence work is actually visible.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { talosResearchIsResting, talosResearchIsTerminal, talosResearchSpent } from '@/lib/research/researchRun'
import { talosResearchReportRefOf } from '@/lib/research/researchCard'
import {
    talosResearchDuration,
    talosResearchElapsedSeconds,
    talosResearchOutline,
} from '@/lib/research/researchOutline'
import { talosResearchNarration, talosResearchStepTitle } from '@/lib/research/researchNarration'
import { talosPublishedOn } from '@/lib/publishedDate'
import { useRoute, useRouter } from 'vue-router'
import { TabsContent } from 'reka-ui'
import { AlertTriangle, ChevronRight, Download, MessageSquare, Pause, Play, RotateCcw } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosThemedTabs from '@/components/talos/ui/TalosThemedTabs.vue'
import { useChatController } from '@/stores/chatController'
import { useTalosResearchRun } from '@/composables/useTalosResearchRun'
import { talosRememberView, talosRememberedView } from '@/lib/navigation/rememberedView'
import { talosResearchSolidity, type TalosResearchStanding } from '@/lib/research/researchCard'
import { talosResearchVerifiedStanding } from '@/lib/research/researchVerification'
import { talosResearchFidelity } from '@/lib/research/researchFidelity'
import { talosResearchLedger } from '@/lib/research/researchLedger'
import {
    talosResearchIndependentSources,
    talosResearchRegistrableHost,
} from '@/lib/research/researchIndependence'
import { talosResearchRecheckStanding, type TalosResearchRecheck } from '@/lib/research/researchRecheck'
import type { TalosResearchRecheckPasso } from '@/lib/research/researchRecheckHistory'
import {
    talosResearchContestedCard,
    talosResearchMarkedPassage,
    talosResearchOverreachingCard,
} from '@/lib/research/researchOpenCards'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'
import type { TalosResearchProgress } from '@/services/researchRuntime'

const route = useRoute()
const router = useRouter()
const controller = useChatController()
const { t, locale } = useTalosI18n()

const runId = computed(() => String(route.params.id ?? ''))
const view = useTalosResearchRun(() => runId.value)
const { run, report, loading, missing, reportUnreadable } = view

const section = ref<string>(talosRememberedView('research-report') ?? 'claims')
function chooseSection(next: string): void {
    section.value = next
    talosRememberView('research-report', next)
}

/**
 * Live while it is live.
 *
 * The page has to work for a research that is still being made — that is where
 * "Avvia" now lands — so it subscribes to the registry like the station does,
 * and lets go on the way out without touching the run.
 */
const liveRun = ref<TalosResearchProgress | null>(null)
let unwatch: (() => void) | null = null

watch(runId, (id) => {
    unwatch?.()
    unwatch = null
    liveRun.value = null
    if (!id) return
    unwatch = controller.research.registry.watch(id, (progress) => {
        liveRun.value = progress
        /**
         * The report is loaded once, when the page mounts. A research that
         * FINISHES while you are watching it therefore had a report on disk and
         * a page that had never gone to look.
         *
         * Owner 2026-08-03: a run with Sonnet 5 as author read «conclusa senza
         * scrivere il rapporto». The report was complete — six claims, ten
         * sources, judged — and it appeared the moment the page was reopened
         * from the list. The engine had done its job; only the screen was
         * behind. Watching a thing has to include noticing that it arrived.
         */
        if (!view.report.value && talosResearchReportRefOf(progress.run)) void view.reload()
    })
}, { immediate: true })

onBeforeUnmount(() => unwatch?.())

const isRunning = computed(() => controller.research.registry.isRunning(runId.value))
const current = computed(() => liveRun.value?.run ?? run.value)

const standing = computed<TalosResearchStanding | null>(() => (report.value
    ? talosResearchVerifiedStanding(report.value.claims.map((claim) => ({
        claim: { text: claim.text, sourceIndex: claim.sourceIndex, quote: '', quotePresent: 'yes' as const },
        passage: claim.passage,
        checks: claim.checks,
    })))
    : null))

const solidity = computed(() => {
    const value = talosResearchSolidity(standing.value)
    return value === null ? null : Math.round(value * 100)
})

/**
 * ⛔⛔ Le quattro misure con cui i benchmark 2026 giudicano un agente di
 * ricerca — copertura, fedeltà delle citazioni, ancoraggio, prove distinte.
 *
 * La percentuale grande qui sopra dice quanto REGGE. Non dice quanto vale
 * la verifica che l'ha prodotta: un 100% su due affermazioni giudicate su
 * dieci, con tre fonti che riprendono lo stesso comunicato, è un 100% che
 * non vale niente — e oggi si legge identico a un 100% solido.
 *
 * ⛔ Nessuno dei cinque concorrenti mostra queste misure alla persona.
 * Restano nei benchmark, cioè dove le legge chi costruisce, non chi decide
 * in base al rapporto.
 */
const fidelity = computed(() => (report.value
    ? talosResearchFidelity({
        claims: report.value.claims.map((claim) => ({
            claim: { text: claim.text, sourceIndex: claim.sourceIndex, quote: '', quotePresent: 'yes' as const },
            passage: claim.passage,
            checks: claim.checks,
        })),
        sources: (report.value.sources ?? []).map((source) => ({ url: source.url })),
    })
    : null))

/**
 * Le quattro voci, con la loro spiegazione accanto.
 *
 * ⛔ La spiegazione NON è decorazione: «copertura 50%» da solo non dice
 * niente a chi non legge benchmark, e un numero che non si capisce viene
 * saltato — cioè vale zero pur essendo lì.
 */
const misure = computed(() => {
    const f = fidelity.value
    if (!f) return []
    return [
        { chiave: 'copertura', nome: t('research.fedeltaCopertura'), valore: quota(f.coverage) ?? '—', spiega: t('research.fedeltaCoperturaSpiega') },
        { chiave: 'citazioni', nome: t('research.fedeltaCitazioni'), valore: quota(f.citationFaithfulness) ?? '—', spiega: t('research.fedeltaCitazioniSpiega') },
        { chiave: 'ancoraggio', nome: t('research.fedeltaAncoraggio'), valore: quota(f.claimGroundedness) ?? '—', spiega: t('research.fedeltaAncoraggioSpiega') },
        // ⛔ Una FRAZIONE, non una frase. Le altre tre celle dicono «100%» in
        //   grande: questa diceva «5 prove distinte su 10 fonti» nello stesso
        //   posto e nello stesso corpo, e su tablet orizzontale la differenza di
        //   forma fra celle gemelle si vedeva a colpo d'occhio. Le parole non si
        //   perdono: scendono nella spiegazione, che è il loro posto.
        { chiave: 'indipendenti', nome: t('research.fedeltaIndipendenti'), valore: t('research.indipendentiFrazione', { independent: f.independentSources, total: (report.value?.sources ?? []).length }), spiega: t('research.fedeltaIndipendentiSpiega') },
    ]
})

/** Una quota in percentuale intera, o `null` se non c'è una quota. */
function quota(valore: number | null | undefined): string | null {
    return typeof valore === 'number' ? `${Math.round(valore * 100)}%` : null
}

/** Which model judged this run — from the record, never inferred from the claims. */
const judge = computed(() => report.value?.judge ?? null)

const steps = computed(() => current.value?.steps ?? [])

/**
 * Everything the page says about a run in flight — all of it local, none of it
 * waiting for anything.
 *
 * Owner 2026-08-03, on the page this replaces: «non c'è un titolo hero, non c'è
 * un progresso di quello che si sta facendo … dei termini molto tecnici. Deve
 * essere production ready». The diagnosis was exact. The page said HOW MUCH —
 * `0/2`, `RACCOLGO`, `b1:search` — and never WHAT, which is the half a person
 * actually wants; and the material for that half was already on the run,
 * unused. The plan is approved before a penny is spent, so every branch carries
 * the question it went to answer, and the sentence writes itself from it.
 *
 * The visual research of the same day found that none of the five competitors
 * documents the first half-second of a run at all. Nothing here touches disk or
 * network, so ours cannot be late.
 */
const heading = computed(() => current.value?.title ?? current.value?.question ?? '')
/** Renaming keeps the question asked. Showing it is how that promise stays true. */
const renamed = computed(() => Boolean(current.value?.title))
const outline = computed(() => (current.value ? talosResearchOutline(current.value) : []))
const sectionsDone = computed(() => outline.value.filter((entry) => entry.state === 'done').length)
const ended = computed(() => talosResearchIsTerminal(current.value?.status ?? 'planning'))
const resting = computed(() => talosResearchIsResting(current.value?.status ?? 'planning'))
const say = computed(() => (current.value
    ? talosResearchNarration(current.value, isRunning.value)
    : { key: 'research.say.planning', params: {} }))

/**
 * The clock ticks from a timestamp on the RUN, not from a timer started when
 * this screen mounted: a research outlives every screen that watches it, and a
 * duration owned by a component would restart each time somebody looked.
 */
const nowIso = ref(new Date().toISOString())
let clock: ReturnType<typeof setInterval> | null = null
function stopClock(): void {
    if (clock === null) return
    clearInterval(clock)
    clock = null
}
// A finished research has a duration that cannot change, so a timer for it is a
// wake-up per second on a phone that buys nothing. It stops the moment the run
// ends under you, not only when the page closes.
onMounted(() => { if (!ended.value) clock = setInterval(() => { nowIso.value = new Date().toISOString() }, 1000) })
watch(ended, (over) => { if (over) stopClock() })
onBeforeUnmount(stopClock)

const elapsed = computed(() => (current.value
    ? talosResearchDuration(talosResearchElapsedSeconds(current.value, nowIso.value))
    : null))

const balance = computed(() => standing.value
    ?? { total: 0, supported: 0, partial: 0, unsupported: 0, unchecked: 0, contested: 0 })

const failedSteps = computed(() => current.value?.steps.filter((step) => step.state === 'failed') ?? [])

/**
 * ⛔⛔ REGISTRO-01 — «Come è stato costruito».
 *
 * Una ricerca dura minuti e costa crediti, e alla fine la persona vede un
 * rapporto e una percentuale senza aver visto niente di quello che è
 * successo in mezzo. Due rapporti col 100% possono avere dietro lavori
 * incomparabili — quattro estratti o dieci pagine lette — e oggi si
 * leggono uguali.
 *
 * ⛔ Sommario sempre, righe A RICHIESTA: è il pattern concorde per gli
 * agenti che lavorano a lungo (sommario → dettaglio → dati grezzi, il
 * registro completo a un clic). Dieci righe sempre aperte sarebbero
 * rumore su una pagina che deve far decidere.
 */
/*
 * ⛔ Le prove viaggiano col registro: senza, conterebbe tipi di passo che il
 * runtime non emette mai e direbbe «0 pagine lette» su un rapporto costruito
 * leggendo le pagine. È successo, sul Pad, il 2026-08-20.
 */
const registro = computed(() => talosResearchLedger(steps.value, {
    sources: report.value?.sources ?? [],
    claims: report.value?.claims ?? [],
}))
const registroAperto = ref(false)

/**
 * ⛔⛔ L'INDIPENDENZA, portata dove si decide.
 *
 * Il conteggio esisteva già nel pannello di testa — «7 prove distinte su
 * 10 fonti» — ma lì è un totale, e nessuno decide su un totale: si decide
 * sulla singola affermazione. «Sostenuta da 3 fonti» è una promessa
 * numerica, e se quelle tre riprendono lo stesso comunicato è falsa.
 *
 * ⇒ Il numero va SULLA CARD, accanto al verdetto, e la catena va sulla
 * fonte: chi la legge deve sapere se sta guardando una prova o una eco.
 */
const indipendenza = computed(() => talosResearchIndependentSources(
    (report.value?.sources ?? []).map((source) => ({ url: source.url })),
))

/*
 * ⛔⛔ QUI IL MOCKUP CHIEDE UNA COSA CHE I DATI NON SANNO DIRE.
 *
 * Il mockup approvato scrive sulla card «sostenuta dalla fonte · 2 fonti
 * indipendenti». Il nostro modello però dà a ogni affermazione UNA sola
 * fonte — `sourceIndex`, al singolare: una affermazione, una pagina, un
 * passaggio. Il numero per affermazione sarebbe quindi sempre 1.
 *
 * Le due strade sbagliate erano entrambe a portata di mano: scrivere «1
 * sola fonte» su ogni riga — vero ma sempre uguale, cioè rumore — oppure
 * contare le fonti del GRUPPO e spacciarle per sostegni di quella
 * affermazione, che sarebbe un numero più grande e **falso**: è
 * esattamente la promessa numerica gonfiata contro cui esiste
 * `researchIndependence`.
 *
 * ⇒ Sulla card dell'affermazione non si scrive niente. L'indipendenza
 * resta dove i dati la reggono davvero: il totale in cima e la catena
 * sulla fonte. Quando una affermazione potrà portare più fonti, il numero
 * tornerà qui — con dietro qualcosa da contare.
 */

/**
 * Cosa dire di QUESTA fonte, in una riga.
 *
 * ⛔ Il singolare e il plurale sono due frasi, non una con un numero: la
 * prima versione ha scritto sul Pad «altre 1 fonti», che è il modo più
 * veloce di far sembrare automatico un testo che deve essere letto.
 */
function catenaDi(url: string): string {
    const gruppo = indipendenza.value.groups.find((g) => g.sources.includes(url))
    const altre = gruppo ? gruppo.sources.length - 1 : 0
    if (altre <= 0) return t('research.catenaPrimaria')
    if (altre === 1) return t('research.catenaRipresa')
    return t('research.catenaRipreseMolte', { count: altre })
}
/** Il lavoro in parole, con la stessa funzione che scrive le altre durate. */
const durataLavoro = computed(() => talosResearchDuration(registro.value.summary.workedSeconds))

/**
 * The record, in names instead of identifiers.
 *
 * It stays — it is what ended an hours-long hunt on 2026-08-03, when the page
 * could only say «conclusa senza scrivere il rapporto» and the record showed
 * the synthesis had in fact produced one. But it printed `b1:search` and a `●`,
 * which are useful to exactly one reader, and he wrote them. Owner, same day:
 * closed, at the bottom, in words.
 */
const record = computed(() => steps.value.map((step) => ({
    id: step.id,
    state: step.state,
    saved: Boolean(step.resultRef),
    title: current.value ? talosResearchStepTitle(current.value, step) : null,
})))

/**
 * WHY a branch failed, not just how many did.
 *
 * The restructure very nearly dropped this: the new panel counted failures and
 * said nothing else, and "2 rami non sono riusciti" is a fact you can do
 * nothing with. Three of these codes are OUR OWN refusals with a remedy the
 * person can act on in seconds — no search source configured, the chosen model
 * could not hold the format, the author model is unreachable — so they are
 * spelled out. Anything else stays raw: inventing a friendly sentence for an
 * error nobody has read yet would hide the only clue there is.
 */
function reason(code: string): string {
    if (code === 'TALOS_RESEARCH_NO_SEARCH_SOURCE') return t('research.noSearchSource')
    /*
     * Il prompt piu' lungo del contesto NON e' «non ha tenuto il formato».
     *
     * Misurato il 2026-08-04: con l'autore locale il passo falliva, e la frase
     * qui sotto dava la colpa al formato mandando a cambiare modello — mentre
     * il motore aveva rifiutato 11009 token in un contesto da 4096, e nessun
     * modello piu' capace avrebbe cambiato niente. Il rimedio vero e' un'altra
     * cosa, quindi e' un'altra frase.
     */
    if (code.startsWith('TALOS_LOCAL_PROMPT_TOO_LONG')) return t('research.promptTooLong')
    if (code.startsWith('TALOS_RESEARCH_NO_CLAIMS')) {
        // Il rifiuto porta con se' cosa e' arrivato: se c'e', si mostra, perche'
        // «non ha risposto niente» e «ha risposto un'altra cosa» mandano a fare
        // due cose diverse.
        const detto = code.slice('TALOS_RESEARCH_NO_CLAIMS:'.length).trim()
        return detto.length > 0
            ? `${t('research.noClaims')} ${t('research.modelSaid', { detail: detto })}`
            : t('research.noClaims')
    }
    if (code === 'TALOS_RESEARCH_AUTHOR_UNAVAILABLE') return t('research.authorUnavailable')
    // Prefix, not equality: the storage layer's own message is appended, and it
    // is the only clue about WHY the write failed.
    if (code.startsWith('TALOS_RESEARCH_REPORT_NOT_SAVED')) return t('research.reportNotSaved')
    return code
}

/** One line per distinct cause: five branches that died of the same thing are one problem. */
const failureReasons = computed(() => [...new Set(failedSteps.value
    .map((step) => step.error)
    .filter((code): code is string => typeof code === 'string' && code.length > 0))]
    .map(reason))

/**
 * ⛔⛔ SCHEDE-APERTE-01 — il dissenso e l'eccesso, SENZA un tocco.
 *
 * Il mockup approvato dall'owner tiene aperte due schede sul rapporto:
 * l'affermazione contesa col passaggio a favore e quello contro affiancati,
 * e quella che dice più di quanto la sua pagina sostenga.
 *
 * ⛔ Erano già costruite — `ResearchClaimScreen` le disegna entrambe — ma
 * dietro un tocco, e chi legge un rapporto all'86% non ha nessun motivo di
 * aprire proprio quella riga fra dodici. La cosa che ci distingue era
 * raggiungibile solo da chi sapeva già dov'era.
 *
 * Una ciascuna, non tutte: l'elenco intero resta nella scheda
 * «Affermazioni», e queste due sono l'esempio leggibile che porta lì.
 */
/**
 * La riga sotto il titolo, come la disegna il mockup: quanto e’ durata,
 * quante sezioni, quante fonti, quanti token.
 *
 * ⛔ Le fonti e i token si mostrano SOLO se ci sono davvero. `spend` porta
 * «solo cio’ che e’ stato osservato», e un motore che non dichiara i token
 * lascia zero: scrivere «~0 token» sotto un rapporto vero e’ peggio che non
 * scrivere niente, perche’ si legge come una misura invece che come
 * un’assenza di misura.
 */
const fonti = computed(() => report.value?.sources.length ?? 0)
const token = computed(() => (current.value ? talosResearchSpent(current.value).tokens : 0))
const numero = (quanti: number) => new Intl.NumberFormat(locale.value).format(quanti)

/**
 * Il dominio della fonte, quando si riesce a leggerlo.
 *
 * ⛔ FOTOGRAFATO sul Pad il 2026-08-20: due righe nell’elenco delle fonti,
 * tutte e due «GGUF», tutte e due «stesso sito di un’altra fonte». Sono due
 * pagine diverse, e a colpo d’occhio erano la stessa riga scritta due volte.
 * Il titolo lo decide la pagina, e le pagine si chiamano come gli pare: il
 * dominio è l’unica cosa che distingue sempre.
 */
const dominio = (url: string): string | null => talosResearchRegistrableHost(url)

const contesa = computed(() => talosResearchContestedCard(report.value?.claims))
const eccede = computed(() => talosResearchOverreachingCard(report.value?.claims))

/** Il passaggio spezzato in tre, per evidenziare il pezzo che il giudice ha riconosciuto. */
function evidenzia(passage: string | null | undefined, span: { from: number, to: number } | null | undefined) {
    return talosResearchMarkedPassage(passage, span ?? null)
}

/**
 * ⛔⛔ TENUTA-NEL-TEMPO-01 — quanto vale OGGI un rapporto di ieri.
 *
 * Il decadimento delle citazioni web ha due assi: l’indirizzo che muore e la
 * pagina che risponde ancora senza dire più ciò che era citato. Nella
 * letteratura la seconda si misura a mano, e fra i link ancora VIVI solo il
 * 29,9% conteneva davvero il materiale citato. Chi ha salvato un URL sa
 * riferire soltanto che una richiesta è andata a buon fine — cosa che riesce
 * anche a una pagina riscritta.
 *
 * Noi il testo di allora ce l’abbiamo, e ogni ricontrollo lo ha già scritto
 * in Libreria. Mancava solo di rileggerli in fila.
 */
const storia = ref<readonly TalosResearchRecheckPasso[]>([])

async function caricaStoria(): Promise<void> {
    if (!runId.value) return
    // ⛔ Un guasto qui non deve portarsi via il rapporto: la storia è un di
    //   più, il rapporto è la pagina.
    //
    // ⛔ try/catch e NON `.catch()`: se il metodo non c'è la chiamata esplode
    //   PRIMA che esista una promessa a cui attaccarlo, e l'errore esce dal
    //   watcher come non gestito — 31 in una suite che restava verde.
    try {
        storia.value = await controller.research.recheckHistory(runId.value)
    } catch {
        storia.value = []
    }
}

// La storia si legge quando il rapporto c'e': prima non c'e' niente da
// mettere in fila, e un giro sulla Libreria a vuoto costa e non dice nulla.
watch(report, (presente) => { if (presente) void caricaStoria() }, { immediate: true })

/**
 * Quando è stata fatta una tappa, scritto corto.
 *
 * ⛔ Due cure a un difetto solo, visto sul Pad il 2026-08-20 facendo due
 * ricontrolli di fila:
 *
 *   · «20 agosto 2026» andava a capo dentro la sua colonna, e la riga si
 *     spezzava in due. Il mese corto ci sta.
 *   · Le due tappe portavano la STESSA data e non si distinguevano. Se
 *     due cadono nello stesso giorno, l’ora entra su TUTTE: un elenco in
 *     cui alcune righe hanno l’ora e altre no si legge come un errore.
 */
const stessoGiorno = computed(() => {
    const giorni = storia.value.map((passo) => passo.at.slice(0, 10))
    return new Set(giorni).size !== giorni.length
})

function quandoTappa(iso: string): string {
    const quando = new Date(iso)
    if (Number.isNaN(quando.getTime())) return iso
    const giorno = new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }).format(quando)
    if (!stessoGiorno.value) return giorno
    const ora = new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(quando)
    return `${giorno} ${ora}`
}

const percento = (quota: number | null): string => (quota === null
    ? '—'
    : `${Math.round(quota * 100)}%`)

const rechecking = ref(false)
/**
 * R-5, kept through the restructure: the research was paid for once, so asking
 * more of it must not cost again.
 *
 * The re-check compares today's pages against the passages we stored — possible
 * only because we stored them — and the follow-up answers from those same
 * passages instead of searching the web. Both were nearly lost when this moved
 * out of the station and into a page; they are the reason the page is worth
 * more than a rendered document.
 */
const recheck = ref<TalosResearchRecheck | null>(null)
const recheckStanding = computed(() => (recheck.value ? talosResearchRecheckStanding(recheck.value) : null))
const followQuestion = ref('')
const followBusy = ref(false)
const followAnswer = ref<TalosResearchReportRecord | null>(null)
const exported = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

async function resume(): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
        await controller.research.resume(runId.value)
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        busy.value = false
    }
}

/**
 * Stopping it from the page it is running on.
 *
 * The station has had this in its row menu since the CRUD block; the page it
 * leads to had only Resume, so a research you were watching could be started
 * and followed from here but only stopped by going back. Pausing asks nothing
 * first — it takes nothing away — which is the same rule the station follows.
 */
async function pause(): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
        await controller.research.pause(runId.value)
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        busy.value = false
    }
}

async function runRecheck(): Promise<void> {
    rechecking.value = true
    recheck.value = null
    try {
        recheck.value = await controller.research.recheck(runId.value)
        // Il ricontrollo appena fatto è una tappa nuova: la storia va riletta,
        // se no la riga in fondo resta a ieri sotto un numero di oggi.
        await caricaStoria()
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        rechecking.value = false
    }
}

/**
 * Leave for a chat about this research — an actual one.
 *
 * Owner 2026-08-03: «deve partire fisicamente una chat … esattamente come una
 * chat nuova, non deve essere nella pagina della ricerca». The navigation is
 * the point as much as the session is: the report page is not where a
 * conversation belongs, so this ends by leaving it.
 */
const openingChat = ref(false)
async function openChat(): Promise<void> {
    if (openingChat.value) return
    openingChat.value = true
    try {
        await controller.research.openChat(runId.value)
        await router.push({ name: 'chat' })
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        openingChat.value = false
    }
}

/**
 * Esportare: prima la domanda «a chi lo stai dando».
 *
 * Owner 2026-08-03: «quando clicchi per generare il pdf appare un popup che ti
 * fa scegliere il "tono" del pdf tra 3 template».
 *
 * I tre sono documenti diversi per FORMA, non tre tavolozze — vedi
 * `researchPdf.ts` per il perche' proprio quei tre. Il .md resta in fondo,
 * sottovoce: e' quello che serve a chi vuole il testo per aprirlo altrove, e
 * toglierlo per fare posto alla novita' sarebbe una perdita travestita da
 * riordino.
 */
const exportOpen = ref(false)
const exportBusy = ref<string | null>(null)

const EXPORT_CHOICES = [
    { id: 'report', label: 'research.pdfToneReport', why: 'research.pdfToneReportWhy' },
    { id: 'brief', label: 'research.pdfToneBrief', why: 'research.pdfToneBriefWhy' },
    { id: 'dossier', label: 'research.pdfToneDossier', why: 'research.pdfToneDossierWhy' },
    { id: 'md', label: 'research.pdfMarkdown', why: 'research.pdfMarkdownWhy' },
    // ⛔ EXPORT-06 — le fonti sole, per chi le mette in una bibliografia.
    //   Ultime perche' non producono il rapporto: producono le CITAZIONI, ed
    //   e' un'altra domanda.
    { id: 'bibtex', label: 'research.pdfBibtex', why: 'research.pdfBibtexWhy' },
    { id: 'ris', label: 'research.pdfRis', why: 'research.pdfRisWhy' },
] as const

/** Chi esce come sole fonti, e con quale estensione. */
const SOLO_FONTI: Record<string, string> = { bibtex: 'bib', ris: 'ris' }

async function reportFileId(): Promise<string | null> {
    return current.value
        ? (await import('@/lib/research/researchCard')).talosResearchReportRefOf(current.value)
        : null
}

/** Il nome del file: quello che si legge nella cartella Download fra un mese. */
function exportName(extension: string): string {
    const run = current.value
    return `${run?.title?.trim() || run?.question || 'ricerca'}.${extension}`
}

async function exportAs(choice: string): Promise<void> {
    if (exportBusy.value) return
    const fileId = await reportFileId()
    if (!fileId || !current.value) return
    exportBusy.value = choice
    error.value = null
    try {
        const estensione = SOLO_FONTI[choice]
        if (estensione) {
            // ⛔ La data di lettura è quella dell'esecuzione, non di adesso: un
            //   export fatto fra un mese non deve dire che le pagine sono state
            //   lette fra un mese.
            const letto = current.value?.startedAt ?? new Date().toISOString()
            await controller.research.exportCitations(fileId, choice as 'bibtex' | 'ris', exportName(estensione), letto)
        } else if (choice === 'md') await controller.research.exportReport(fileId, exportName('md'))
        else await controller.research.exportReportPdf(fileId, choice, exportName('pdf'))
        exported.value = true
        exportOpen.value = false
    } catch (failure) {
        // Detto per nome: un PDF che non si e' fatto e un popup che si chiude
        // da solo sono la stessa cosa vista da fuori.
        error.value = t('research.pdfFailed', {
            detail: failure instanceof Error ? failure.message : String(failure),
        })
    } finally {
        exportBusy.value = null
    }
}

async function askFollowUp(): Promise<void> {
    const question = followQuestion.value.trim()
    if (question.length === 0 || followBusy.value) return
    followBusy.value = true
    followAnswer.value = null
    try {
        const fileId = await controller.research.followUp(runId.value, question)
        // Read back what was FILED rather than keeping a copy in memory: the
        // answer shown is then literally the one in the Library, verdicts
        // included, and the two cannot disagree.
        followAnswer.value = fileId ? await controller.research.report(fileId) : null
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        followBusy.value = false
    }
}

function openClaim(index: number): void {
    void router.push({ name: 'research-claim', params: { id: runId.value, index: String(index) } })
}

function openSource(index: number): void {
    void router.push({ name: 'research-source', params: { id: runId.value, index: String(index) } })
}
</script>

<template>
    <!-- The station name, not the question: inside the sheet this header hides
         and the question becomes the body's own <h1>, so passing it here would
         print the same title twice on the one surface that does show it. -->
    <TalosMobileScreen :title="t('stations.deepResearchTitle')" data-testid="talos-research-report-screen">
        <div class="flex flex-col gap-4">
            <p v-if="loading" class="text-sm text-[var(--talos-muted)]">{{ t('research.loading') }}</p>

            <p v-else-if="missing" data-testid="talos-research-missing" class="rounded-xl border border-[var(--talos-border)] p-4 text-sm text-[var(--talos-muted)]">
                {{ t('research.missing') }}
            </p>

            <template v-else>
                <!--
                    The question, first and large.

                    Owner 2026-08-03: «non c'è un titolo hero». True — the
                    question lived only in the sheet chrome, truncated, while
                    the page opened on a status badge in monospaced capitals. A
                    research IS a question being answered, so the question is
                    this document's title and belongs where a title goes.
                -->
                <header data-testid="talos-research-hero" class="pt-4">
                    <h1 class="talos-title text-xl font-semibold leading-7 text-[var(--talos-text)]">{{ heading }}</h1>
                    <p v-if="renamed" data-testid="talos-research-asked-question" class="mt-1 text-2xs leading-5 text-[var(--talos-muted)]">
                        {{ t('research.askedQuestion', { question: current?.question ?? '' }) }}
                    </p>

                    <!--
                        What it is doing, in a sentence, named after the branch
                        it is on. `role="status"` announces it without moving
                        the focus — the visual research asks for exactly this
                        and for nothing more theatrical.
                    -->
                    <p
                        data-testid="talos-research-say"
                        role="status"
                        class="mt-3 text-sm leading-6 text-[var(--talos-text)]"
                    >{{ t(say.key, say.params) }}</p>

                    <p data-testid="talos-research-meta" class="mt-1 flex flex-wrap items-baseline gap-x-2 text-2xs leading-5 text-[var(--talos-muted)]">
                        <span v-if="elapsed" data-testid="talos-research-elapsed">
                            {{ ended ? t('research.endedAfter', { elapsed }) : t('research.runningSince', { elapsed }) }}
                        </span>
                        <!-- The separator is its own element so the flex gap
                             falls on BOTH sides of it. Glued to the text it
                             read «1 min 14 s  ·2 di 2 sezioni» on the tablet. -->
                        <span v-if="elapsed && outline.length" aria-hidden="true">·</span>
                        <span v-if="outline.length">{{ t('research.sectionsDone', { done: sectionsDone, total: outline.length }) }}</span>
                        <span v-if="fonti" aria-hidden="true">·</span>
                        <span v-if="fonti" data-testid="talos-research-meta-fonti">{{ t('research.metaFonti', { count: fonti }) }}</span>
                        <span v-if="token" aria-hidden="true">·</span>
                        <span v-if="token" data-testid="talos-research-meta-token">{{ t('research.metaToken', { count: numero(token) }) }}</span>
                    </p>

                    <!-- One control, and only the one that applies. While it is
                         draining towards a checkpoint neither does: the pause
                         has been asked for and there is nothing left to press. -->
                    <Button v-if="isRunning && !resting" data-testid="talos-research-pause" variant="outline" class="mt-3" :disabled="busy" @click="pause()">
                        <Pause class="h-4 w-4" aria-hidden="true" />
                        {{ t('research.actionPause') }}
                    </Button>
                    <Button v-else-if="!isRunning && !ended" data-testid="talos-research-resume" variant="outline" class="mt-3" :disabled="busy" @click="resume()">
                        <Play class="h-4 w-4" aria-hidden="true" />
                        {{ t('research.resume') }}
                    </Button>
                </header>

                <!--
                    What a report claims is worth less than whether the claims
                    stood, and every competitor leads with the opposite: the
                    number of sources, which is scale mistaken for support.
                -->
                <section v-if="report" data-testid="talos-research-balance" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4">
                    <p class="flex items-baseline gap-2">
                        <span class="text-3xl font-semibold tabular-nums text-[var(--talos-text)]">{{ solidity === null ? '—' : `${solidity}%` }}</span>
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('research.solidity') }}</span>
                    </p>
                    <!--
                        ⛔ LA BARRA — la stessa cosa del conteggio, ma vista.

                        «6 sostenute · 1 in parte · 1 contesa · 1 non verificata» va
                        letto e sommato; la barra si guarda. ⛔ Ma non sostituisce le
                        parole: il colore da solo non è un esito — chi non distingue
                        i colori resterebbe senza informazione. Vive col conteggio,
                        e la sua etichetta dice le stesse parole.
                    -->
                    <div
                        v-if="balance.total"
                        data-testid="talos-research-barra"
                        class="mt-3 flex h-1.5 gap-px overflow-hidden rounded-full bg-[var(--talos-panel-soft)]"
                        role="img"
                        :aria-label="t('research.barraLegenda', {
                            supported: balance.supported,
                            partial: balance.partial,
                            contested: balance.contested ?? 0,
                            unsupported: balance.unsupported,
                            unchecked: balance.unchecked,
                        })"
                    >
                        <i v-if="balance.supported" class="block h-full bg-[var(--talos-accent)]" :style="{ flex: balance.supported }" />
                        <i v-if="balance.partial" class="block h-full bg-[var(--talos-accent-soft)]" :style="{ flex: balance.partial }" />
                        <i v-if="balance.contested" class="block h-full bg-[var(--talos-warning-border)]" :style="{ flex: balance.contested }" />
                        <i v-if="balance.unsupported" class="block h-full bg-[var(--talos-danger-border)]" :style="{ flex: balance.unsupported }" />
                        <i v-if="balance.unchecked" class="block h-full bg-[var(--talos-border-strong)]" :style="{ flex: balance.unchecked }" />
                    </div>
                    <p data-testid="talos-research-standing" class="mt-2 text-2xs leading-5 tabular-nums text-[var(--talos-muted)]">
                        {{ t('research.standing', {
                            supported: balance.supported,
                            total: balance.total,
                            partial: balance.partial,
                            contested: balance.contested ?? 0,
                            unsupported: balance.unsupported,
                            unchecked: balance.unchecked,
                        }) }}
                    </p>
                    <p class="mt-2 text-2xs leading-5 text-[var(--talos-muted)]">
                        <template v-if="judge">{{ t('research.verifiedByLead') }} <span data-testid="talos-research-judge" class="break-all font-mono">{{ judge }}</span></template>
                        <template v-else>{{ t('research.notVerified') }}</template>
                    </p>

                    <!--
                        ⭐⭐ LA TENUTA NEL TEMPO — quanto vale oggi un rapporto di ieri.

                        Compare solo quando esiste piu’ di un ricontrollo: una tappa
                        sola non e’ una storia, e disegnarla come tale suggerirebbe
                        un andamento dove c’e’ un punto.
                    -->
                    <div
                        v-if="storia.length > 1"
                        data-testid="talos-research-tenuta-nel-tempo"
                        class="mt-3 border-t border-[var(--talos-border)] pt-3"
                    >
                        <p class="text-2xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.tenutaNelTempo') }}</p>
                        <div
                            v-for="passo in storia"
                            :key="passo.at"
                            data-testid="talos-research-tappa"
                            class="mt-2 flex items-baseline gap-2"
                        >
                            <span class="w-24 shrink-0 font-mono text-2xs tabular-nums text-[var(--talos-muted)]">{{ quandoTappa(passo.at) }}</span>
                            <span class="min-w-0 flex-1 text-2xs leading-5 text-[var(--talos-muted)]">
                                {{ passo.primo
                                    ? t('research.tenutaPrima', { standing: passo.passagesStanding, total: passo.passagesStanding + passo.passagesLost })
                                    : t('research.tenutaCambio', { changed: passo.changed, unreachable: passo.unreachable, lost: passo.passagesLost }) }}
                            </span>
                            <span class="shrink-0 font-mono text-2xs tabular-nums text-[var(--talos-text)]">{{ percento(passo.tenuta) }}</span>
                            <span
                                v-if="passo.delta !== null && Math.round(passo.delta * 100) !== 0"
                                class="w-10 shrink-0 text-right font-mono text-2xs tabular-nums text-[var(--talos-muted)]"
                            >{{ passo.delta > 0 ? '+' : '−' }}{{ Math.abs(Math.round(passo.delta * 100)) }}%</span>
                        </div>
                        <p class="mt-2 text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.tenutaSuiPassaggi') }}</p>
                    </div>

                    <!--
                        ⛔⛔ QUANTO VALE la percentuale qui sopra.

                        Un 100% su due affermazioni giudicate su dieci, con tre
                        fonti che riprendono lo stesso comunicato, si legge oggi
                        identico a un 100% solido. Queste quattro misure sono la
                        differenza, e nessuno dei cinque concorrenti le mostra.

                        ⛔ Senza giudice non esce un numero basso: esce la frase.
                        Un 40% verrebbe letto come una misura, e sarebbe una
                        misura di niente.
                    -->
                    <div v-if="fidelity" data-testid="talos-research-fedelta" class="mt-3 border-t border-[var(--talos-border)] pt-3">
                        <p class="text-2xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.fedeltaTitolo') }}</p>
                        <p v-if="!fidelity.verified" data-testid="talos-research-fedelta-assente" class="mt-2 text-2xs leading-5 text-[var(--talos-muted)]">
                            {{ t('research.fedeltaNonVerificata') }}
                        </p>
                        <dl v-else class="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
                            <div v-for="misura in misure" :key="misura.chiave" :data-testid="`talos-research-fedelta-${misura.chiave}`">
                                <dt class="text-2xs leading-5 text-[var(--talos-muted)]">{{ misura.nome }}</dt>
                                <dd class="text-base font-semibold tabular-nums text-[var(--talos-text)]">{{ misura.valore }}</dd>
                                <dd class="text-2xs leading-4 text-[var(--talos-muted)]">{{ misura.spiega }}</dd>
                            </div>
                        </dl>
                        <p
                            v-if="fidelity.measuredAt"
                            data-testid="talos-research-fedelta-data"
                            class="mt-3 text-2xs leading-5 text-[var(--talos-muted)]"
                        >{{ t('research.fedeltaMisurataIl', { quando: fidelity.measuredAt.slice(0, 10) }) }}</p>
                    </div>
                </section>

                <!--
                    ⛔ Il registro: sommario sempre, passi a richiesta.
                    Vedi la nota accanto a `registro` per il perché.
                -->
                <section v-if="registro.summary.total" data-testid="talos-research-registro" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4">
                    <p class="text-2xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.registroTitolo') }}</p>
                    <p data-testid="talos-research-registro-sommario" class="mt-1 text-2xs leading-5 tabular-nums text-[var(--talos-muted)]">
                        {{ t('research.registroSommario', {
                            total: registro.summary.total,
                            search: registro.summary.search,
                            read: registro.summary.read,
                            verify: registro.summary.verify,
                            worked: durataLavoro,
                        }) }}
                        <template v-if="registro.summary.failed">
                            · {{ t('research.registroFalliti', { failed: registro.summary.failed }) }}
                        </template>
                        <template v-if="registro.summary.interrupted">
                            · {{ t('research.registroInterrotti', { interrupted: registro.summary.interrupted }) }}
                        </template>
                    </p>
                    <button
                        type="button"
                        data-testid="talos-research-registro-apri"
                        class="talos-pressable mt-2 min-h-touch text-2xs text-[var(--talos-accent)]"
                        :aria-expanded="registroAperto"
                        @click="registroAperto = !registroAperto"
                    >{{ registroAperto ? t('research.registroChiudi') : t('research.registroApri') }}</button>
                    <ol v-if="registroAperto" data-testid="talos-research-registro-passi" class="mt-2 space-y-1">
                        <li
                            v-for="passo in registro.entries"
                            :key="passo.id"
                            class="flex items-baseline justify-between gap-3 border-t border-[var(--talos-border)] pt-1 text-2xs leading-5"
                        >
                            <span class="min-w-0 flex-1 text-[var(--talos-text)]">
                                {{ t(`research.registroTipo.${passo.kind}`) }}
                                <span v-if="passo.attempts > 1" class="text-[var(--talos-muted)]">· {{ t('research.registroTentativi', { attempts: passo.attempts }) }}</span>
                                <span v-if="passo.error" class="block break-words text-[var(--talos-danger)]">{{ passo.error }}</span>
                            </span>
                            <span class="shrink-0 tabular-nums text-[var(--talos-muted)]">
                                {{ passo.duration ?? t('research.registroInCorso') }}
                            </span>
                        </li>
                    </ol>
                </section>

                <div v-if="failedSteps.length" data-testid="talos-research-failed-steps" class="flex items-start gap-2 rounded-xl border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-xs leading-5 text-[var(--talos-danger)]">
                    <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                        <p>{{ t(failedSteps.length === 1 ? 'research.branchesFailedOne' : 'research.branchesFailedMany', { count: failedSteps.length }) }}</p>
                        <!-- The reason, kept from the station this page replaced:
                             a count you can do nothing with is not a diagnosis. -->
                        <p
                            v-for="text in failureReasons"
                            :key="text"
                            data-testid="talos-research-step-error"
                            class="mt-1 break-words"
                        >{{ text }}</p>
                    </div>
                </div>

                <!--
                    The document, before it exists: one section per approved
                    branch, each saying where it is. This is the answer to the
                    question the visual research found NOBODY answering — what to
                    draw in the first half-second — and it costs nothing, because
                    the plan was agreed before any money was spent.
                -->
                <section v-if="!report && outline.length" data-testid="talos-research-outline" class="flex flex-col gap-2">
                    <h2 class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.expectedSections') }}</h2>
                    <div
                        v-for="(entry, index) in outline"
                        :key="entry.id"
                        data-testid="talos-research-outline-section"
                        class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
                    >
                        <p class="flex items-baseline gap-2">
                            <span class="text-2xs tabular-nums text-[var(--talos-muted)]">{{ index + 1 }}</span>
                            <span class="min-w-0 flex-1 text-sm leading-5 text-[var(--talos-text)]">{{ entry.question }}</span>
                        </p>
                        <p
                            class="mt-1 text-2xs"
                            :class="entry.state === 'failed' ? 'text-[var(--talos-danger)]' : 'text-[var(--talos-muted)]'"
                        >{{ t(`research.sectionState.${entry.state}`) }}</p>
                    </div>
                </section>

                <!-- The one number that says what this product is for, promised
                     before it can be shown. A page that reveals it only at the
                     end teaches the reader to look for something else meanwhile. -->
                <p v-if="!report" data-testid="talos-research-balance-empty" class="text-2xs leading-5 text-[var(--talos-muted)]">
                    {{ t('research.balanceEmpty') }}
                </p>

                <p v-if="reportUnreadable" data-testid="talos-research-unreadable" class="rounded-xl border border-[var(--talos-border)] p-3 text-sm text-[var(--talos-muted)]">
                    {{ t('research.reportUnreadable') }}
                </p>

                <template v-else-if="report">
                    <p class="text-sm leading-6 text-[var(--talos-text)]">{{ report.summary }}</p>

                    <TalosThemedTabs
                        surface="research-report"
                        :model-value="section"
                        :aria-label="t('research.reportSections')"
                        @update:model-value="chooseSection"
                    >
                        <TabsContent value="claims" data-research-section="claims" class="talos-motion-tab-panel flex flex-col gap-2 pt-3 outline-none">
                            <button
                                v-for="(claim, index) in report.claims"
                                :key="index"
                                type="button"
                                data-testid="talos-research-claim"
                                :data-claim-index="index"
                                class="talos-pressable flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left"
                                @click="openClaim(index)"
                            >
                                <span class="min-w-0 flex-1">
                                    <span class="block text-sm leading-5 text-[var(--talos-text)]">{{ claim.text }}</span>
                                    <span class="mt-1 block text-2xs text-[var(--talos-muted)]">
                                        {{ t(`research.support.${claim.checks.claimSupported}`) }}
                                    </span>
                                </span>
                                <ChevronRight class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            </button>
                        </TabsContent>

                        <TabsContent value="sources" data-research-section="sources" class="talos-motion-tab-panel flex flex-col gap-2 pt-3 outline-none">
                            <button
                                v-for="(source, index) in report.sources"
                                :key="index"
                                type="button"
                                data-testid="talos-research-source"
                                :data-source-index="index"
                                class="talos-pressable flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left"
                                @click="openSource(index)"
                            >
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-sm text-[var(--talos-text)]">{{ source.title || source.url }}</span>
                                    <span class="mt-1 block text-2xs text-[var(--talos-muted)]">
                                        {{ source.publishedAt ? talosPublishedOn(source.publishedAt, locale) : t('research.noDate') }} ·
                                        {{ source.obtained === 'snippet' ? t('research.onlySnippet') : t('research.pageRead') }}
                                        <template v-if="dominio(source.url)"> · <span class="font-mono">{{ dominio(source.url) }}</span></template>
                                    </span>
                                    <!--
                                        ⛔ Dire se questa fonte è una PROVA o una ECO.
                                        Tre articoli che riprendono lo stesso comunicato
                                        non sono tre conferme, e finché non lo si scrive
                                        si leggono come tre.
                                    -->
                                    <span data-testid="talos-research-indipendenza" class="mt-0.5 block text-2xs leading-4 text-[var(--talos-muted)]">
                                        {{ catenaDi(source.url) }}
                                    </span>
                                </span>
                                <ChevronRight class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            </button>
                        </TabsContent>
                    </TalosThemedTabs>

                    <!--
                        LE DUE SCHEDE APERTE - il dissenso e l’eccesso, senza un tocco.

                        Nessun concorrente mostra il disaccordo fra le sue fonti: chi
                        ne trova uno sceglie in silenzio la versione piu’ comoda.
                        Tenerlo aperto e’ la ragione per cui il rapporto vale, e
                        finche’ stava dietro un tocco lo vedeva solo chi sapeva gia’
                        dov’era.
                    -->
                    <section
                        v-if="contesa"
                        data-testid="talos-research-contesa-aperta"
                        class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4"
                    >
                        <p class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.contesaAperta') }}</p>
                        <p class="mt-2 text-sm font-medium leading-6 text-[var(--talos-text)]">{{ contesa.claim.text }}</p>
                        <p class="mt-1 text-2xs font-medium text-[var(--talos-text)]">{{ t('research.support.contested') }}</p>
                        <p v-if="contesa.claim.checks.supportReason" class="mt-2 text-2xs leading-5 text-[var(--talos-muted)]">{{ contesa.claim.checks.supportReason }}</p>
                        <p class="mt-2 text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.dissensoSpiega') }}</p>

                        <div class="mt-3 grid gap-3 sm:grid-cols-2">
                            <div class="rounded-lg border border-[var(--talos-border)] p-3">
                                <p class="mb-1 text-2xs font-medium text-[var(--talos-muted)]">{{ t('research.dissensoAFavore') }}</p>
                                <p class="text-sm leading-6 text-[var(--talos-text)]">
                                    <template v-for="(pezzo, dove) in [evidenzia(contesa.claim.passage, contesa.claim.checks.quoteSpan)]" :key="dove">
                                        {{ pezzo.before }}<mark v-if="pezzo.quote" class="rounded bg-[var(--talos-accent-soft)] px-0.5 text-[var(--talos-text)]">{{ pezzo.quote }}</mark>{{ pezzo.after }}
                                    </template>
                                </p>
                                <p class="mt-2 break-words text-2xs leading-5 text-[var(--talos-muted)]">
                                    {{ report.sources[contesa.claim.sourceIndex]?.title || report.sources[contesa.claim.sourceIndex]?.url }}
                                </p>
                            </div>
                            <div
                                v-for="(contro, i) in (contesa.claim.checks.opposing ?? [])"
                                :key="contro.url + i"
                                class="rounded-lg border border-[var(--talos-danger-border)] p-3"
                            >
                                <p class="mb-1 text-2xs font-medium text-[var(--talos-muted)]">{{ t('research.dissensoContro') }}</p>
                                <p class="text-sm leading-6 text-[var(--talos-text)]">
                                    <template v-for="(pezzo, dove) in [evidenzia(contro.passage, contro.span)]" :key="dove">
                                        {{ pezzo.before }}<mark v-if="pezzo.quote" class="rounded bg-[var(--talos-accent-soft)] px-0.5 text-[var(--talos-text)]">{{ pezzo.quote }}</mark>{{ pezzo.after }}
                                    </template>
                                </p>
                                <p class="mt-2 break-words text-2xs leading-5 text-[var(--talos-muted)]">{{ contro.title || contro.url }}</p>
                            </div>
                        </div>

                        <Button variant="ghost" class="mt-2" data-testid="talos-research-contesa-apri" @click="openClaim(contesa.index)">
                            {{ t('research.apriLaffermazione') }}
                            <ChevronRight class="h-4 w-4" aria-hidden="true" />
                        </Button>
                    </section>

                    <!--
                        L’affermazione che dice PIU’ di quanto la sua pagina sostenga.
                        Non e’ un errore di fatto e non e’ una bugia: e’ il caso in cui
                        il testo regge meta’ della frase, ed e’ il difetto piu’ comune
                        di ogni rapporto scritto da un modello.
                    -->
                    <section
                        v-if="eccede"
                        data-testid="talos-research-eccede"
                        class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4"
                    >
                        <p class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.eccedeTitolo') }}</p>
                        <p class="mt-2 text-sm font-medium leading-6 text-[var(--talos-text)]">{{ eccede.claim.text }}</p>
                        <p class="mt-1 text-2xs font-medium text-[var(--talos-muted)]">{{ t('research.support.partial') }}</p>
                        <p class="mt-2 text-2xs leading-5 text-[var(--talos-muted)]">{{ eccede.claim.checks.supportReason }}</p>
                        <p class="mt-3 rounded-lg border border-[var(--talos-border)] p-3 text-sm leading-6 text-[var(--talos-text)]">
                            <template v-for="(pezzo, dove) in [evidenzia(eccede.claim.passage, eccede.claim.checks.quoteSpan)]" :key="dove">
                                {{ pezzo.before }}<mark v-if="pezzo.quote" class="rounded bg-[var(--talos-accent-soft)] px-0.5 text-[var(--talos-text)]">{{ pezzo.quote }}</mark>{{ pezzo.after }}
                            </template>
                        </p>
                        <p class="mt-2 break-words text-2xs leading-5 text-[var(--talos-muted)]">
                            {{ report.sources[eccede.claim.sourceIndex]?.title || report.sources[eccede.claim.sourceIndex]?.url }}
                        </p>
                        <Button variant="ghost" class="mt-2" data-testid="talos-research-eccede-apri" @click="openClaim(eccede.index)">
                            {{ t('research.apriLaffermazione') }}
                            <ChevronRight class="h-4 w-4" aria-hidden="true" />
                        </Button>
                    </section>

                    <div class="flex flex-wrap gap-2">
                        <Button data-testid="talos-research-recheck" variant="outline" :disabled="rechecking" @click="runRecheck()">
                            <RotateCcw class="h-4 w-4" aria-hidden="true" />
                            {{ rechecking ? t('research.rechecking') : t('research.recheck') }}
                        </Button>
                        <Button data-testid="talos-research-export" variant="outline" @click="exportOpen = true">
                            <Download class="h-4 w-4" aria-hidden="true" />
                            {{ exported ? t('research.exported') : t('research.export') }}
                        </Button>
                        <!-- Leaves this page on purpose: a conversation does not
                             belong inside a report. -->
                        <Button data-testid="talos-research-open-chat" variant="outline" :disabled="openingChat" @click="openChat()">
                            <MessageSquare class="h-4 w-4" aria-hidden="true" />
                            {{ openingChat ? t('research.openingChat') : t('research.openChat') }}
                        </Button>
                    </div>

                    <div v-if="recheckStanding" data-testid="talos-research-recheck-result" class="space-y-1 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                        <p class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                            {{ t('research.recheckLine', {
                                total: recheckStanding.total,
                                intact: recheckStanding.intact,
                                changed: recheckStanding.changed,
                                unreachable: recheckStanding.unreachable,
                            }) }}
                        </p>
                        <!-- The point of keeping the passages: a page that has
                             gone can still be read here. -->
                        <p class="text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.recheckStillReadable') }}</p>
                    </div>

                    <!-- Ask more of a research already paid for, answered from
                         the passages on disk rather than from the web. -->
                    <div class="space-y-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                        <label class="block">
                            <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.followUpTitle') }}</span>
                            <input
                                v-model="followQuestion"
                                type="text"
                                data-testid="talos-research-followup"
                                :placeholder="t('research.followUpPlaceholder')"
                                :aria-label="t('research.followUpTitle')"
                                class="min-h-touch w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none"
                                @keyup.enter="askFollowUp()"
                            >
                        </label>
                        <Button data-testid="talos-research-followup-send" variant="outline" :disabled="followBusy" @click="askFollowUp()">
                            {{ followBusy ? t('research.followUpAsking') : t('research.followUpSend') }}
                        </Button>
                        <p v-if="followAnswer" data-testid="talos-research-followup-answer" class="space-y-1 text-sm leading-6 text-[var(--talos-text)]">
                            {{ followAnswer.summary }}
                            <span v-for="(claim, at) in followAnswer.claims" :key="at" class="mt-1 block text-2xs text-[var(--talos-muted)]">
                                {{ t(`research.support.${claim.checks.claimSupported}`) }}
                            </span>
                        </p>
                        <!-- Said where the money is: the answer costs nothing
                             new because it never leaves the passages on disk. -->
                        <p class="text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.followUpNote') }}</p>
                    </div>
                </template>

                <!--
                    The record, closed and last.

                    It stays, and for a reason worth stating: on 2026-08-03 the
                    page could only say «conclusa senza scrivere il rapporto»
                    while the record showed the synthesis had produced one, and
                    that line is what ended an hours-long hunt. But it is
                    evidence, not content — owner, same day: closed, at the
                    bottom, and in words rather than `b1:search`.

                    The visual research puts the same shape at the centre of the
                    chosen direction: plan and record openable, never dominant,
                    the way GitHub Actions keeps a workflow's log.
                -->
                <details v-if="record.length" data-testid="talos-research-activity" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]">
                    <summary class="talos-pressable min-h-touch cursor-pointer list-none px-3 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ t('research.howItWasBuilt') }}
                    </summary>
                    <ul class="flex flex-col gap-2 px-3 pb-3">
                        <li
                            v-for="entry in record"
                            :key="entry.id"
                            data-testid="talos-research-activity-step"
                            class="flex items-baseline justify-between gap-3 text-2xs leading-5"
                        >
                            <span class="min-w-0 flex-1 text-[var(--talos-text)]">{{ entry.title ? t(entry.title.key, entry.title.params) : entry.id }}</span>
                            <!-- Whether the step left something behind is the
                                 difference between "it ran" and "it produced". -->
                            <span class="shrink-0" :class="entry.state === 'failed' ? 'text-[var(--talos-danger)]' : 'text-[var(--talos-muted)]'">
                                {{ t(`research.stepState.${entry.state}`) }}<template v-if="entry.saved"> · {{ t('research.stepSaved') }}</template>
                            </span>
                        </li>
                    </ul>
                </details>

                <p v-if="error" role="alert" data-testid="talos-research-report-error" class="rounded-xl border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
                    {{ error }}
                </p>
            </template>
        </div>

        <!-- Owner 2026-08-03: il popup che chiede il TONO. Quattro righe, ognuna
             con una frase che dice a chi serve: un elenco di nomi senza il
             «per chi» costringe ad aprirli tutti e tre per capire. -->
        <TalosMobileConfirmDialog
            v-if="exportOpen"
            :title="t('research.pdfTitle')"
            :description="t('research.pdfBody')"
            @close="exportOpen = false"
        >
            <div class="flex flex-col gap-2">
                <button
                    v-for="choice in EXPORT_CHOICES"
                    :key="choice.id"
                    type="button"
                    :data-testid="`talos-research-export-${choice.id}`"
                    :disabled="exportBusy !== null"
                    class="talos-pressable flex flex-col gap-0.5 rounded-xl border border-[var(--talos-border)] p-3 text-left disabled:opacity-60"
                    :class="choice.id === 'md' ? 'border-dashed' : ''"
                    @click="exportAs(choice.id)"
                >
                    <span class="text-sm font-medium text-[var(--talos-text)]">
                        {{ exportBusy === choice.id ? t('research.pdfBuilding') : t(choice.label) }}
                    </span>
                    <span class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t(choice.why) }}</span>
                </button>
            </div>
            <template #footer>
                <Button variant="ghost" :disabled="exportBusy !== null" @click="exportOpen = false">
                    {{ t('common.cancel') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </TalosMobileScreen>
</template>
