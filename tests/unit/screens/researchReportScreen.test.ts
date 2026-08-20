// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { TalosResearchRun, TalosResearchStep } from '@/lib/research/researchRun'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'

/**
 * ⛔ I popup di questa pagina sono TELEPORTATI nel body, e un test che finisce
 * col popup aperto — ce n'e' uno, apposta: prova che dopo un guasto si puo'
 * riprovare senza ricominciare — lascia le sue righe nel documento. Il test
 * successivo che cerca una riga per 'data-testid' trova QUELLA, cliccando un
 * bottone agganciato a un controller che non e' il suo: zero chiamate, e
 * nessun indizio sul perche'.
 *
 * ⇒ Il documento si sgombera fra un test e l'altro. Da soli passavano tutti.
 */
afterEach(() => { document.body.innerHTML = '' })

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

/**
 * The station split into pages on 2026-08-03, so these mount the page that now
 * owns each contract — the report at its own address, the setup behind the FAB.
 * The route is mocked rather than a real router because the contracts here are
 * about the report, not about navigation.
 */
const routeState = vi.hoisted(() => ({ params: { id: 'run-1' } as Record<string, string> }))
const routerCalls = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => routeState, useRouter: () => routerCalls }))

import { __resetSettingsStoreForTests, useSettingsStore } from '@/stores/settings'
import TalosThemedTabs from '@/components/talos/ui/TalosThemedTabs.vue'
import ResearchReportScreen from '@/screens/ResearchReportScreen.vue'
import ResearchNewScreen from '@/screens/ResearchNewScreen.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'

const NOTHING = { searches: 0, pages: 0, tokens: 0 }

function step(over: Partial<TalosResearchStep>): TalosResearchStep {
    return {
        id: 'b1:search',
        branchId: 'b1',
        kind: 'search',
        state: 'done',
        attempts: 1,
        startedAt: '2026-08-02T10:00:00.000Z',
        finishedAt: '2026-08-02T10:01:00.000Z',
        spend: NOTHING,
        resultRef: null,
        error: null,
        ...over,
    }
}

const RUN: TalosResearchRun = {
    id: 'run-1',
    sessionId: 'chat-1',
    question: 'chi ha vinto?',
    depth: 'quick',
    engine: 'device',
    status: 'done',
    plan: [
        { id: 'b1', question: 'risultato', estimate: { searches: 1, pages: 3, minutes: 1, tokens: 100 } },
        { id: 'b2', question: 'ordine d’arrivo', estimate: { searches: 1, pages: 3, minutes: 1, tokens: 100 } },
    ],
    steps: [
        step({ id: 'b1:search', branchId: 'b1' }),
        step({ id: 'b2:search', branchId: 'b2' }),
        step({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', resultRef: 'file-report' }),
    ],
    startedAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-08-02T10:05:00.000Z',
}

const REPORT: TalosResearchReportRecord = {
    version: 1,
    question: 'chi ha vinto?',
    summary: 'Ha vinto Norris.',
    judge: 'local:qwen3-3b',
    claims: [
        {
            text: 'Norris ha vinto il Gran Premio.',
            sourceIndex: 1,
            passage: 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026',
            checks: {
                resolved: 'page',
                quotePresent: true,
                quoteSpan: { from: 0, to: 52 },
                claimSupported: 'yes',
                supportReason: 'lo dice testualmente',
                judge: 'local:qwen3-3b',
                judgedAt: '2026-08-02T10:04:00.000Z',
            },
        },
        {
            text: 'Antonelli è arrivato secondo.',
            sourceIndex: 2,
            passage: '',
            checks: {
                resolved: 'snippet',
                quotePresent: false,
                quoteSpan: null,
                claimSupported: 'unchecked',
                supportReason: 'il passaggio non è nel testo della fonte',
                judge: null,
                judgedAt: null,
            },
        },
    ],
    sources: [
        { url: 'https://rainews.it/x', title: 'Il resoconto', publishedAt: '2026-07-26', obtained: 'page' },
        { url: 'https://oasport.it/y', title: 'Ordine d’arrivo', publishedAt: null, obtained: 'snippet' },
    ],
}

const CATALOGS = {
    deepseek: {
        configured: true,
        status: 'idle',
        error: null,
        errorDetail: null,
        models: [
            { id: 'deepseek-v4-flash', provider: 'deepseek', displayName: 'deepseek-v4-flash' },
            { id: 'deepseek-v4-pro', provider: 'deepseek', displayName: 'deepseek-v4-pro' },
        ],
    },
    local: {
        configured: true,
        status: 'idle',
        error: null,
        errorDetail: null,
        models: [{ id: '/storage/qwen.gguf', provider: 'local', displayName: 'qwen2.5-3b-instruct' }],
    },
}

function controllerWith(report: TalosResearchReportRecord | null, run: TalosResearchRun = RUN) {
    return {
        // The real controller always has these; a double without them is a
        // double that cannot fail the way production would.
        catalogs: CATALOGS,
        research: {
            // The live index the pages subscribe to. A double without it is a
            // double that cannot fail the way production would.
            registry: {
                watch: vi.fn(() => () => {}),
                isRunning: vi.fn(() => false),
                running: vi.fn(() => []),
                latest: vi.fn(() => null),
                open: vi.fn(() => () => {}),
                close: vi.fn(),
            },
            list: vi.fn().mockResolvedValue([run]),
            unfinished: vi.fn().mockResolvedValue([]),
            start: vi.fn(),
            resume: vi.fn(),
            report: vi.fn().mockResolvedValue(report),
            recheck: vi.fn().mockResolvedValue({
                at: '2027-01-01T00:00:00.000Z',
                sources: [
                    { url: 'https://rainews.it/x', title: 'A', state: 'intact', survived: 1, reason: null, passagesStanding: 1, passagesLost: 0 },
                    { url: 'https://oasport.it/y', title: 'B', state: 'unreachable', survived: null, reason: '404', passagesStanding: 0, passagesLost: 0 },
                ],
            }),
            followUp: vi.fn().mockResolvedValue('file-answer'),
            exportReport: vi.fn().mockResolvedValue({ ok: true }),
            exportReportPdf: vi.fn().mockResolvedValue({ ok: true }),
            exportCitations: vi.fn().mockResolvedValue({ ok: true }),
            recheckHistory: vi.fn().mockResolvedValue([]),
            openChat: vi.fn().mockResolvedValue(undefined),
        },
    }
}

/**
 * The two model pickers are the shared TalosThemedSelect, not a native <select>,
 * so the test drives them the way a user does — through the component's own
 * contract — instead of setting a value on an element that no longer exists.
 *
 * The empty choice is not an item: it is the picker's `noneLabel` row, and the
 * value it emits is ''. `offered` puts it back at the head of the list so the
 * expectations still read as the list the user actually sees.
 */
function picker(wrapper: ReturnType<typeof mount>, testid: string) {
    return wrapper.getComponent<typeof TalosThemedSelect>(`[data-testid="${testid}"]`)
}

function offered(wrapper: ReturnType<typeof mount>, testid: string): string[] {
    const found = picker(wrapper, testid)
    const items = found.props('items').map((item) => item.value)
    return found.props('noneLabel') === undefined ? items : ['', ...items]
}

async function choose(wrapper: ReturnType<typeof mount>, testid: string, value: string): Promise<void> {
    picker(wrapper, testid).vm.$emit('update:modelValue', value)
    await settle(wrapper)
}

async function settle(wrapper: { vm: { $nextTick: () => Promise<void> } }): Promise<void> {
    // A macrotask hop, not just microtasks: saving a preference goes through
    // persistence, so a settle that only drains promises reads the state as it
    // was before the choice landed — which looked exactly like a choice that
    // did not stick.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
}

describe('the report a person can actually check', () => {
    beforeEach(() => { mockState.controller = controllerWith(REPORT) })

    /**
     * The counter that used to say "3 of 2".
     *
     * The synthesis counts among the finished steps but was missing from the
     * total, so the moment the report was written the station announced more
     * work done than existed. A progress line that can exceed its own total is
     * a progress line nobody can read.
     */
    /**
     * The counter that used to say "3 of 2" is now arithmetic in
     * `talosResearchProgressOf`, asserted in researchCard.test.ts where it can
     * be checked without a screen. A finished report shows the BALANCE here,
     * not a counter — the counter is for work still happening.
     */
    it('leads with how well it holds, not with how much was read', async () => {
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        const balance = wrapper.get('[data-testid="talos-research-balance"]')
        expect(balance.text()).toContain('50%')
        // Never the source count: scale is not support.
        expect(balance.text()).not.toContain('2 fonti')
    })

    it('opens in layers: the answer here, the evidence one page in', async () => {
        // The layering survived the restructure; it just moved from an
        // expanding row to a route. The report gives the answer and the list of
        // claims; the passage a claim rests on is the claim's own page.
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        expect(wrapper.text()).toContain('Ha vinto Norris.')
        expect(wrapper.findAll('[data-testid="talos-research-claim"]')).toHaveLength(2)
        expect(wrapper.find('[data-testid="talos-research-passage"]').exists()).toBe(false)

        // The exact words from the page live one route in — the thing a
        // product that stores only links cannot show at any price.
        await wrapper.findAll('[data-testid="talos-research-claim"]')[0]!.trigger('click')
        expect(routerCalls.push).toHaveBeenCalledWith({
            name: 'research-claim',
            params: { id: 'run-1', index: '0' },
        })
    })

    it('shows the standing and names the judge, which is never the author', async () => {
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-standing"]').text()).toContain('1 of 2 supported')
        expect(wrapper.get('[data-testid="talos-research-standing"]').text()).toContain('1 unverified')
        expect(wrapper.get('[data-testid="talos-research-judge"]').text()).toBe('local:qwen3-3b')
        expect(wrapper.text()).toContain('never the one that wrote the report')
    })

    /**
     * ⛔⛔ Quanto VALE la percentuale, non solo quanto è alta.
     *
     * Un 100% su due affermazioni giudicate su dieci, con tre fonti che
     * riprendono lo stesso comunicato, si legge identico a un 100% solido.
     * Le quattro misure dei benchmark 2026 sono la differenza — copertura,
     * fedeltà delle citazioni, ancoraggio, prove distinte — e nessuno dei
     * cinque concorrenti le mostra alla persona: restano dove le legge chi
     * costruisce, non chi decide in base al rapporto.
     */
    /**
     * ⛔⛔ REGISTRO-01 — «Come è stato costruito».
     *
     * Due rapporti col 100% possono avere dietro lavori incomparabili —
     * quattro estratti guardati o dieci pagine lette — e senza il registro si
     * leggono uguali. Il sommario dice quanto lavoro c'è dentro; i passi si
     * aprono a richiesta, perché dieci righe sempre aperte sarebbero rumore su
     * una pagina che deve far decidere.
     */
    /**
     * ⛔ LA BARRA — la stessa cosa del conteggio, ma vista.
     *
     * «6 sostenute · 1 in parte · 1 contesa · 1 non verificata» va letto e
     * sommato; la barra si guarda. Ma NON sostituisce le parole: il colore da
     * solo non è un esito, e chi non distingue i colori resterebbe senza
     * informazione. Vive col conteggio, e la sua etichetta dice le stesse cose.
     */
    it('disegna la barra, e la sua etichetta ripete le parole del conteggio', async () => {
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        const barra = wrapper.get('[data-testid="talos-research-barra"]')
        expect(barra.attributes('role')).toBe('img')
        expect(barra.attributes('aria-label')).toMatch(/supported/i)
        // ⛔ Il conteggio a parole resta: la barra si aggiunge, non sostituisce.
        expect(wrapper.find('[data-testid="talos-research-standing"]').exists()).toBe(true)
    })

    /**
     * ⛔ Dire se una fonte è una PROVA o una ECO.
     *
     * Tre articoli che riprendono lo stesso comunicato non sono tre conferme, e
     * finché non lo si scrive accanto alla fonte si leggono come tre.
     */
    it('dice per ogni fonte se è primaria o si appoggia ad altre', async () => {
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        // Si tocca la linguetta, come farebbe una persona: reka-ui monta il
        // pannello solo quando è scelto, e provarlo da fuori proverebbe altro.
        // La scheda si sceglie dal componente delle linguette: reka-ui monta il
        // pannello solo quando è selezionato, e un click sintetico non gli basta.
        wrapper.findComponent(TalosThemedTabs).vm.$emit('update:model-value', 'sources')
        await settle(wrapper)
        const righe = wrapper.findAll('[data-testid="talos-research-indipendenza"]')
        expect(righe.length).toBeGreaterThan(0)
        expect(righe[0]!.text()).toMatch(/only page from its site|same site as|unica pagina|stesso sito/i)

        // ⛔ La scheda scelta SOPRAVVIVE alla pagina — è memorizzata, ed è voluto.
        // Lasciarla su «fonti» farebbe partire il test dopo dalla scheda sbagliata:
        // un test che sporca lo stato fa fallire un vicino innocente.
        wrapper.findComponent(TalosThemedTabs).vm.$emit('update:model-value', 'claims')
        await settle(wrapper)
    })

    it('riassume il lavoro fatto, e i passi restano chiusi finché non li chiedi', async () => {
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        const sommario = wrapper.get('[data-testid="talos-research-registro-sommario"]')
        expect(sommario.text()).toMatch(/steps/i)
        expect(wrapper.find('[data-testid="talos-research-registro-passi"]').exists()).toBe(false)
    })

    it('⛔ e a richiesta si aprono, col tipo e la durata di ognuno', async () => {
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        await wrapper.get('[data-testid="talos-research-registro-apri"]').trigger('click')
        const passi = wrapper.get('[data-testid="talos-research-registro-passi"]')
        expect(passi.findAll('li').length).toBeGreaterThan(0)
    })

    it('mostra le quattro misure di fedeltà, con la loro data', async () => {
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        const pannello = wrapper.get('[data-testid="talos-research-fedelta"]')
        // Una giudicata su due.
        expect(wrapper.get('[data-testid="talos-research-fedelta-copertura"]').text()).toContain('50%')
        // Un passaggio ritrovato nella pagina su due affermazioni.
        expect(wrapper.get('[data-testid="talos-research-fedelta-citazioni"]').text()).toContain('50%')
        // Due domini diversi: due prove distinte.
        expect(wrapper.get('[data-testid="talos-research-fedelta-indipendenti"]').text()).toContain('2')
        expect(pannello.text()).toMatch(/2026-08-02/)
    })

    /**
     * ⛔ Un punteggio su cui nessuno ha giudicato non è un punteggio basso:
     * NON È un punteggio. Un 0% verrebbe letto come una misura, e sarebbe una
     * misura di niente.
     */
    it('⛔ senza nessun giudizio dice «non verificata», non uno zero', async () => {
        mockState.controller = controllerWith({
            ...REPORT,
            judge: null,
            claims: REPORT.claims.map((claim) => ({
                ...claim,
                checks: { ...claim.checks, claimSupported: 'unchecked', judge: null, judgedAt: null },
            })),
        })
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        expect(wrapper.find('[data-testid="talos-research-fedelta-assente"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-research-fedelta-copertura"]').exists()).toBe(false)
    })

    /**
     * The tablet showed `local:&#x2F;storage&#x2F;emulated&#x2F;…`.
     *
     * vue-i18n escapes what it interpolates, so a name holding a path is
     * mangled the moment it goes inside a phrase. The name is rendered beside
     * the sentence instead — the second time this project has paid for the same
     * lesson, hence a test rather than a comment.
     */
    it('shows a judge whose name contains slashes exactly as it is', async () => {
        mockState.controller = controllerWith({ ...REPORT, judge: 'local:/storage/emulated/0/qwen.gguf' })
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-judge"]').text()).toBe('local:/storage/emulated/0/qwen.gguf')
        expect(wrapper.html()).not.toContain('&amp;#x2F;')
    })

    it('does not hide the claim whose quotation was never in the source', async () => {
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        // Still listed, and marked. A report that drops its weakest claim tells
        // the reader it never had one.
        expect(wrapper.text()).toContain('Antonelli è arrivato secondo.')

        // And it leads somewhere like the others: a weak claim is not a
        // dead end, it is the one most worth opening.
        await wrapper.findAll('[data-testid="talos-research-claim"]')[1]!.trigger('click')
        expect(routerCalls.push).toHaveBeenCalledWith({
            name: 'research-claim',
            params: { id: 'run-1', index: '1' },
        })
    })

    /**
     * Nearly lost in the 2026-08-03 restructure. The station this page replaced
     * printed the cause of every failed branch; the first draft of the page
     * printed a count. "2 branches failed" is not something a person can act
     * on — and three of these codes are our own refusals with a remedy.
     */
    it('goes and reads the report when the research finishes under it', async () => {
        /**
         * The report is loaded once, on mount. A research that FINISHES while
         * you are watching it therefore had a report on disk and a page that
         * had never gone to look — it read «conclusa senza scrivere il
         * rapporto» while six judged claims sat there, and appeared the moment
         * the page was reopened from the list. Watching a thing has to include
         * noticing that it arrived.
         */
        const working = {
            ...RUN,
            status: 'collecting' as const,
            steps: [step({ id: 'b1:search', branchId: 'b1' })],
        }
        mockState.controller = controllerWith(REPORT, working)
        const controller = mockState.controller as never as ReturnType<typeof controllerWith>

        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)
        // Nothing to read yet: no synthesis step, so no report reference.
        expect(controller.research.report).not.toHaveBeenCalled()

        // The run finishes, and the registry says so.
        const watcher = controller.research.registry.watch.mock.calls[0]?.[1] as
            (progress: { run: TalosResearchRun; done: number; total: number }) => void
        controller.research.list = vi.fn().mockResolvedValue([RUN])
        watcher({ run: RUN, done: 3, total: 3 })
        await settle(wrapper)
        await settle(wrapper)

        expect(controller.research.report).toHaveBeenCalledWith('file-report')
        expect(wrapper.text()).toContain('Ha vinto Norris.')

        // And it stops looking once it has it. Progress arrives many times a
        // minute; re-reading the file on every tick would put the disk in the
        // path of an indicator.
        watcher({ run: RUN, done: 3, total: 3 })
        watcher({ run: RUN, done: 3, total: 3 })
        await settle(wrapper)
        expect(controller.research.report).toHaveBeenCalledTimes(1)
    })

    it('says WHY a branch failed, once per distinct cause', async () => {
        mockState.controller = controllerWith(REPORT, {
            ...RUN,
            steps: [
                step({ id: 'b1:search', branchId: 'b1', state: 'failed', error: 'TALOS_RESEARCH_NO_SEARCH_SOURCE' }),
                step({ id: 'b2:search', branchId: 'b2', state: 'failed', error: 'TALOS_RESEARCH_NO_SEARCH_SOURCE' }),
                step({ id: 'b3:search', branchId: 'b3', state: 'failed', error: 'HTTP 503 upstream' }),
                step({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', resultRef: 'file-report' }),
            ],
        })
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        // Three failed, so the plural is right — but see the sibling case: the
        // device rendered "1 linee di indagine non sono riuscite" for one.
        expect(wrapper.get('[data-testid="talos-research-failed-steps"]').text())
            .toContain('3 lines of enquiry failed')

        const reasons = wrapper.findAll('[data-testid="talos-research-step-error"]')
        // Two branches died of the same thing: that is ONE problem, said once.
        expect(reasons).toHaveLength(2)
        // Our own refusal, spelled out with its remedy…
        expect(reasons[0]!.text()).toContain('search')
        expect(reasons[0]!.text()).not.toContain('TALOS_RESEARCH')
        // …and an error nobody has read yet, left raw rather than dressed up in
        // a friendly sentence that would hide the only clue there is.
        expect(reasons[1]!.text()).toBe('HTTP 503 upstream')
    })

    it('counts a single failed branch in words, not as "1 branches"', async () => {
        // Caught on the tablet, on a real interrupted run: the only sentence a
        // person sees when a research goes wrong was ungrammatical in both
        // languages at the one count it is most likely to have.
        mockState.controller = controllerWith(REPORT, {
            ...RUN,
            steps: [
                step({ id: 'b1:search', branchId: 'b1', state: 'failed', error: 'TALOS_RESEARCH_NO_SEARCH_SOURCE' }),
                step({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', resultRef: 'file-report' }),
            ],
        })
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        const panel = wrapper.get('[data-testid="talos-research-failed-steps"]').text()
        expect(panel).toContain('One line of enquiry failed')
        expect(panel).not.toContain('1 lines')
    })

    /**
     * The tablet caught this one: the panel read the judge off the verdicts, so
     * a run whose citations all failed the mechanical check announced that no
     * independent judge had been available — while one was standing right
     * there. Nothing needed judging; that is a different sentence.
     */
    it('does not report "no judge" for a run that had one and nothing to use it on', async () => {
        mockState.controller = controllerWith({
            ...REPORT,
            claims: REPORT.claims.map((claim) => ({
                ...claim,
                checks: { ...claim.checks, claimSupported: 'unchecked' as const, judge: null, judgedAt: null },
            })),
        })
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        expect(wrapper.text()).toContain('local:qwen3-3b')
        expect(wrapper.text()).not.toContain('there was no independent judge')
    })

    it('says so when the report cannot be read back', async () => {
        mockState.controller = controllerWith(null)
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-unreadable"]').text()).toContain('cannot be read back')
    })
})

describe('R7 — the two models are the user’s choice', () => {
    beforeEach(async () => {
        __resetSettingsStoreForTests()
        mockState.controller = controllerWith(REPORT)
    })

    it('offers every model for the writer, and follows the composer by default', async () => {
        const wrapper = mount(ResearchNewScreen)
        await settle(wrapper)

        expect(picker(wrapper, 'talos-research-author').props('modelValue')).toBe('')
        expect(offered(wrapper, 'talos-research-author')).toEqual([
            '', 'deepseek:deepseek-v4-flash', 'deepseek:deepseek-v4-pro', 'local:/storage/qwen.gguf',
        ])
    })

    /**
     * The refusal, moved one step earlier.
     *
     * The run already refuses a model asked to check its own work — up to 50%
     * more lenient on itself — so offering it in the picker would only be a
     * promise the run breaks later.
     */
    it('never offers the writer as its own checker', async () => {
        const wrapper = mount(ResearchNewScreen)
        await settle(wrapper)

        await choose(wrapper, 'talos-research-author', 'deepseek:deepseek-v4-flash')

        expect(offered(wrapper, 'talos-research-judge-choice')).toEqual([
            '', 'deepseek:deepseek-v4-pro', 'local:/storage/qwen.gguf',
        ])
    })

    it('drops a checker that has just been made the writer', async () => {
        const wrapper = mount(ResearchNewScreen)
        await settle(wrapper)

        await choose(wrapper, 'talos-research-judge-choice', 'deepseek:deepseek-v4-pro')
        expect(useSettingsStore().state.research_models.judge).toBe('deepseek:deepseek-v4-pro')

        await choose(wrapper, 'talos-research-author', 'deepseek:deepseek-v4-pro')

        // Back to automatic rather than left pointing at the writer.
        expect(useSettingsStore().state.research_models.judge).toBeNull()
    })

    it('says when both come from the same house instead of blocking it', async () => {
        const wrapper = mount(ResearchNewScreen)
        await settle(wrapper)

        await choose(wrapper, 'talos-research-author', 'deepseek:deepseek-v4-flash')
        expect(wrapper.find('[data-testid="talos-research-same-house"]').exists()).toBe(false)

        await choose(wrapper, 'talos-research-judge-choice', 'deepseek:deepseek-v4-pro')

        // Stated, not forbidden: self-preference reaches a model's family, but
        // whether that matters here is the user's call to make knowingly.
        expect(wrapper.get('[data-testid="talos-research-same-house"]').text()).toContain('same house')

        await choose(wrapper, 'talos-research-judge-choice', 'local:/storage/qwen.gguf')
        expect(wrapper.find('[data-testid="talos-research-same-house"]').exists()).toBe(false)
    })
})

describe('R-5 — what a dossier is worth after the day it was made', () => {
    beforeEach(() => { mockState.controller = controllerWith(REPORT) })

    async function openReport(wrapper: ReturnType<typeof mount>) {
        await settle(wrapper)
        await settle(wrapper)
    }

    /**
     * R12, and the sentence no competitor can write.
     *
     * Over 75% of referenced web content changes within three years. Everyone
     * else stored a URL, so the most they can report is that a request
     * succeeded — which a rewritten page and a soft 404 both do. We kept the
     * text, so "this one is gone AND you can still read it here" is a true
     * sentence, and it has to be on screen when it applies.
     */
    it('reports what became of the sources, and that the dead ones are still readable', async () => {
        const wrapper = mount(ResearchReportScreen)
        await openReport(wrapper)

        await wrapper.get('[data-testid="talos-research-recheck"]').trigger('click')
        await settle(wrapper)

        const line = wrapper.get('[data-testid="talos-research-recheck-result"]').text()
        expect(line).toContain('2 sources')
        expect(line).toContain('1 intact')
        expect(line).toContain('1 no longer answer')
        expect(line).toContain('stay readable here')
    })

    it('answers a follow-up from the sources already paid for, verdicts included', async () => {
        const wrapper = mount(ResearchReportScreen)
        await openReport(wrapper)

        await wrapper.get('[data-testid="talos-research-followup"]').setValue('e Antonelli?')
        await wrapper.get('[data-testid="talos-research-followup-send"]').trigger('click')
        await settle(wrapper)

        const answer = wrapper.get('[data-testid="talos-research-followup-answer"]')
        // Read back from what was filed, so the answer on screen is the one in
        // the Library — the two cannot drift apart.
        expect(answer.text()).toContain('Ha vinto Norris.')
        expect(answer.text()).toContain('supported')
        expect(wrapper.text()).toContain('no new search')
    })

    it('exports the report to the phone and says it did', async () => {
        const wrapper = mount(ResearchReportScreen)
        await openReport(wrapper)

        // Owner 2026-08-03: esportare ora CHIEDE prima. Il .md non e' sparito —
        // e' l'ultima riga del popup, per chi vuole il testo da aprire altrove.
        await wrapper.get('[data-testid="talos-research-export"]').trigger('click')
        await settle(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-export-md"]')!.click()
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-export"]').text()).toContain('Saved')
    })

    it('chiede il TONO prima di generare il PDF, e i tre non sono lo stesso documento', async () => {
        /**
         * Owner 2026-08-03: «quando clicchi per generare il pdf appare un popup
         * che ti fa scegliere il "tono" del pdf tra 3 template».
         *
         * Ogni riga porta anche la frase che dice A CHI serve: un elenco di
         * soli nomi costringe ad aprirli tutti e tre per capire la differenza.
         */
        const wrapper = mount(ResearchReportScreen)
        await openReport(wrapper)

        await wrapper.get('[data-testid="talos-research-export"]').trigger('click')
        await settle(wrapper)

        for (const tone of ['report', 'brief', 'dossier']) {
            const riga = document.querySelector<HTMLElement>(`[data-testid="talos-research-export-${tone}"]`)
            expect(riga, tone).not.toBeNull()
            expect(riga!.textContent!.length).toBeGreaterThan(40)
        }

        document.querySelector<HTMLElement>('[data-testid="talos-research-export-dossier"]')!.click()
        await settle(wrapper)

        const controller = mockState.controller as ReturnType<typeof controllerWith>
        expect(controller.research.exportReportPdf).toHaveBeenCalledTimes(1)
        // Il tono scelto arriva davvero al generatore, e il nome del file e'
        // quello che si legge nella cartella Download fra un mese.
        const [, tono, nome] = controller.research.exportReportPdf.mock.calls[0]!
        expect(tono).toBe('dossier')
        expect(nome).toMatch(/\.pdf$/)
        expect(controller.research.exportReport).not.toHaveBeenCalled()
    })

    it('un PDF che non si e fatto viene DETTO, non nascosto da un popup che si chiude', async () => {
        const wrapper = mount(ResearchReportScreen)
        await openReport(wrapper)
        const rotto = mockState.controller as ReturnType<typeof controllerWith>
        rotto.research.exportReportPdf = vi.fn().mockRejectedValue(new Error('font mancante'))

        await wrapper.get('[data-testid="talos-research-export"]').trigger('click')
        await settle(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-export-report"]')!.click()
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-report-error"]').text()).toContain('font mancante')
        // E il popup resta aperto: si puo' riprovare con un altro tono senza
        // ricominciare dal bottone.
        expect(document.querySelector('[data-testid="talos-research-export-brief"]')).not.toBeNull()
    })

    it('never shows a re-check result the reader did not just ask for', async () => {
        // A stale panel would be reporting on sources it never checked. The
        // report lives at its own address now, so "a different reading" is a
        // new page rather than a reopened row — and a new page starts empty.
        const first = mount(ResearchReportScreen)
        await openReport(first)
        await first.get('[data-testid="talos-research-recheck"]').trigger('click')
        await settle(first)
        expect(first.find('[data-testid="talos-research-recheck-result"]').exists()).toBe(true)
        first.unmount()

        const second = mount(ResearchReportScreen)
        await openReport(second)
        expect(second.find('[data-testid="talos-research-recheck-result"]').exists()).toBe(false)
    })
})

/**
 * A chat about the research, which is a different thing from the follow-up box.
 *
 * Owner 2026-08-03: «quando in fondo voglio fare partire un'altra chat, deve
 * partire fisicamente una chat, ma col contesto della ricerca. Deve essere
 * esattamente come una chat nuova, non deve essere nella pagina della ricerca».
 */
describe('leaving the report for a real chat about it', () => {
    beforeEach(() => {
        mockState.controller = controllerWith(REPORT)
        routerCalls.push.mockClear()
    })

    async function openReport(wrapper: ReturnType<typeof mount>) {
        await settle(wrapper)
        await settle(wrapper)
    }

    it('opens a session AND navigates away, because a chat is not a page section', async () => {
        const wrapper = mount(ResearchReportScreen)
        await openReport(wrapper)

        await wrapper.get('[data-testid="talos-research-open-chat"]').trigger('click')
        await settle(wrapper)

        const controller = mockState.controller as ReturnType<typeof controllerWith>
        expect(controller.research.openChat).toHaveBeenCalledWith('run-1')
        // The navigation is half the requirement: staying here would be the
        // follow-up box again, which already exists and is a different thing.
        expect(routerCalls.push).toHaveBeenCalledWith({ name: 'chat' })
    })

    it('does not offer it while there is no report to take along', async () => {
        mockState.controller = controllerWith(null)
        const wrapper = mount(ResearchReportScreen)
        await openReport(wrapper)

        expect(wrapper.find('[data-testid="talos-research-open-chat"]').exists()).toBe(false)
    })

    it('stays on the report when the session could not be made', async () => {
        // Navigating anyway would leave the person in an unrelated chat with no
        // idea that the thing they asked for did not happen.
        const controller = controllerWith(REPORT)
        controller.research.openChat = vi.fn().mockRejectedValue(new Error('TALOS_RESEARCH_NO_REPORT'))
        mockState.controller = controller

        const wrapper = mount(ResearchReportScreen)
        await openReport(wrapper)
        await wrapper.get('[data-testid="talos-research-open-chat"]').trigger('click')
        await settle(wrapper)

        expect(routerCalls.push).not.toHaveBeenCalled()
        expect(wrapper.get('[data-testid="talos-research-report-error"]').text()).toContain('TALOS_RESEARCH_NO_REPORT')
    })
})

/**
 * Il perche' di un passo fallito, 2026-08-04.
 *
 * Con l'autore locale la sintesi falliva e la pagina dava la colpa al formato,
 * mandando a scegliere un modello piu' capace. La causa vera era un'altra: il
 * motore aveva rifiutato 11009 token in un contesto da 4096, e nessun modello
 * piu' capace avrebbe cambiato niente.
 */
describe('quando un passo fallisce, la pagina dice la cosa GIUSTA', () => {
    it('il prompt troppo lungo non viene chiamato «formato sbagliato»', async () => {
        const rotto = {
            ...RUN,
            status: 'failed' as const,
            steps: [
                step({ id: 'b1:search', branchId: 'b1' }),
                step({
                    id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', state: 'failed',
                    error: 'TALOS_LOCAL_PROMPT_TOO_LONG: 11009 token, il contesto ne regge 4096',
                }),
            ],
        }
        mockState.controller = controllerWith(null, rotto)
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        const testo = wrapper.text()
        expect(testo).toContain('longer than this model can read at once')
        // Il rimedio sbagliato non deve comparire: cambiare modello non risolve
        // un prompt che non entra.
        expect(testo).not.toContain('did not answer in the required format')
    })

    it('«zero affermazioni» porta con se COSA ha risposto il modello', async () => {
        // «Non ha risposto niente» e «ha risposto un'altra cosa» mandano a fare
        // due cose diverse.
        const rotto = {
            ...RUN,
            status: 'failed' as const,
            steps: [step({
                id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', state: 'failed',
                error: 'TALOS_RESEARCH_NO_CLAIMS: Certo! Ecco un riassunto della storia della Lavazza.',
            })],
        }
        mockState.controller = controllerWith(null, rotto)
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        expect(wrapper.text()).toContain('Certo! Ecco un riassunto')
    })
})

/**
 * L'autore sul dispositivo, 2026-08-04.
 *
 * Owner, dopo aver visto un 3B macinare mezz'ora senza consegnare: approvate
 * entrambe — il piano si stringe E lo si dice prima di avviare.
 */
describe('quando a scrivere e un modello sul telefono', () => {
    it('il piano si STRINGE, invece di chiedergli un prompt che non finisce', async () => {
        const { talosResearchPlanFor } = await import('@/lib/research/researchPlan')
        const rete = talosResearchPlanFor('quando nasce la Vespa', 'deep', false)
        const telefono = talosResearchPlanFor('quando nasce la Vespa', 'deep', true)

        const pagine = (p: readonly { estimate: { pages: number } }[]) =>
            p.reduce((n, b) => n + b.estimate.pages, 0)
        expect(pagine(telefono)).toBeLessThan(pagine(rete))
        // Stessi rami: si accorcia la lettura, non si taglia la domanda.
        expect(telefono).toHaveLength(rete.length)
    })

    it('non GONFIA una ricerca rapida che chiedeva gia meno', async () => {
        // Il limite abbassa soltanto. Nessuno ha chiesto piu' fonti.
        const { talosResearchPlanFor } = await import('@/lib/research/researchPlan')
        const rete = talosResearchPlanFor('x', 'quick', false)
        const telefono = talosResearchPlanFor('x', 'quick', true)
        expect(telefono[0]!.estimate.pages).toBeLessThanOrEqual(rete[0]!.estimate.pages)
    })
})

describe('il tetto locale, distribuito', () => {
    it('da lo STESSO totale a ogni profondita — piu profonda non puo rendere meno', async () => {
        /**
         * Visto sul tablet il 2026-08-04: le linguette dicevano «Rapida 6» e
         * «Approfondita 4». Dividere sei fonti su quattro rami e arrotondare
         * per difetto ne perdeva due. Piu' profonda che rende meno non e' una
         * scelta discutibile: sembra rotta.
         */
        const { talosResearchPlanFor } = await import('@/lib/research/researchPlan')
        const totale = (depth: 'quick' | 'deep' | 'exhaustive') =>
            talosResearchPlanFor('x', depth, true).reduce((n, b) => n + b.estimate.pages, 0)

        expect(totale('quick')).toBe(totale('deep'))
        expect(totale('deep')).toBe(totale('exhaustive'))
        // E i rami restano quelli della profondita': si accorcia la lettura,
        // non si tolgono le domande.
        expect(talosResearchPlanFor('x', 'exhaustive', true)).toHaveLength(
            talosResearchPlanFor('x', 'exhaustive', false).length,
        )
    })
})


/**
 * SCHEDE-APERTE-01 — il dissenso e l’eccesso, sul rapporto e senza un tocco.
 *
 * Il mockup approvato dall’owner tiene aperte due schede: l’affermazione
 * contesa coi due passaggi affiancati, e quella che dice piu’ di quanto la sua
 * pagina sostenga. Erano gia’ costruite, ma dentro la pagina dell’affermazione
 * — cioe’ raggiungibili solo da chi sapeva gia’ dov’erano.
 */
describe('le due schede che il rapporto tiene aperte', () => {
    const CONTRO = {
        url: 'https://contro.example/x',
        title: 'La smentita',
        passage: 'la giuria non ha mai assegnato quel primo posto',
        span: { from: 10, to: 20 },
    }

    function conSchede(over) {
        return {
            ...REPORT,
            claims: [
                {
                    text: 'Norris ha vinto il Gran Premio.',
                    sourceIndex: 0,
                    passage: 'Lando Norris ha vinto il Gran Premio',
                    checks: {
                        resolved: 'page', quotePresent: true, quoteSpan: { from: 6, to: 12 },
                        claimSupported: 'contested',
                        supportReason: 'due fonti dicono di si, una dice di no',
                        judge: 'local:qwen3-3b', judgedAt: '2026-08-02T10:04:00.000Z',
                        opposing: [CONTRO],
                    },
                },
                {
                    text: 'Il circuito ospita la gara dal 1986.',
                    sourceIndex: 1,
                    passage: 'il circuito ospita una gara di Formula 1',
                    checks: {
                        resolved: 'page', quotePresent: true, quoteSpan: { from: 3, to: 11 },
                        claimSupported: 'partial',
                        supportReason: 'la fonte non nomina nessun anno',
                        judge: 'local:qwen3-3b', judgedAt: '2026-08-02T10:04:00.000Z',
                    },
                },
            ],
            ...over,
        }
    }

    it('apre la contesa sul rapporto, coi due passaggi affiancati', async () => {
        mockState.controller = controllerWith(conSchede({}))
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        const scheda = wrapper.find('[data-testid="talos-research-contesa-aperta"]')
        expect(scheda.exists()).toBe(true)
        // I DUE lati, non solo quello che ci fa comodo.
        expect(scheda.text()).toContain('Norris ha vinto il Gran Premio.')
        expect(scheda.text()).toContain('la giuria non ha mai assegnato')
        expect(scheda.text()).toContain('La smentita')
        wrapper.unmount()
    })

    it('evidenzia il pezzo che il giudice ha riconosciuto, e solo quello', async () => {
        mockState.controller = controllerWith(conSchede({}))
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        const marcati = wrapper.findAll('[data-testid="talos-research-contesa-aperta"] mark')
        expect(marcati.map((m) => m.text())).toEqual(['Norris', 'non ha mai'])
        wrapper.unmount()
    })

    it('apre anche l’affermazione che eccede la sua fonte, col motivo', async () => {
        mockState.controller = controllerWith(conSchede({}))
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        const scheda = wrapper.find('[data-testid="talos-research-eccede"]')
        expect(scheda.exists()).toBe(true)
        expect(scheda.text()).toContain('la fonte non nomina nessun anno')
        wrapper.unmount()
    })

    it('E AL CONTRARIO: un rapporto senza contese e senza eccessi non apre schede vuote', async () => {
        // REPORT ha una sostenuta e una non verificata: nessuna delle due
        // schede ha materia, e disegnarle vuote occuperebbe lo schermo per
        // dire niente.
        mockState.controller = controllerWith(REPORT)
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        expect(wrapper.find('[data-testid="talos-research-contesa-aperta"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-research-eccede"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('E una contesa SENZA i passaggi contrari non si apre', async () => {
        const senzaContrari = conSchede({})
        const claims = senzaContrari.claims.map((c, i) => (i === 0
            ? { ...c, checks: { ...c.checks, opposing: [] } }
            : c))
        mockState.controller = controllerWith({ ...senzaContrari, claims })
        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)

        expect(wrapper.find('[data-testid="talos-research-contesa-aperta"]').exists()).toBe(false)
        wrapper.unmount()
    })
})

/**
 * EXPORT-06 — le fonti in un formato che un gestore di bibliografie legge.
 *
 * Le funzioni esistevano da giorni, coi loro test, e nessuna porta le
 * chiamava: codice vivo dietro un muro.
 */
describe('esportare le sole fonti', () => {
    beforeEach(() => { mockState.controller = controllerWith(REPORT) })

    it('offre BibTeX e RIS, e passa la data di LETTURA, non quella di oggi', async () => {
        const wrapper = mount(ResearchReportScreen)
        // Due giri come openReport: il run arriva asincrono, e con uno solo
        // exportAs esce subito perche non ha ancora il rapporto da esportare.
        await settle(wrapper)
        await settle(wrapper)

        await wrapper.get('[data-testid="talos-research-export"]').trigger('click')
        await settle(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-export-bibtex"]')!.click()
        await settle(wrapper)

        const controller = mockState.controller as ReturnType<typeof controllerWith>
        const chiamate = controller.research.exportCitations.mock.calls
        expect(chiamate).toHaveLength(1)
        const [, formato, nome, letto] = chiamate[0]!
        expect(formato).toBe('bibtex')
        expect(nome.endsWith('.bib')).toBe(true)
        // La data e RUN.startedAt: un export fatto fra un mese non deve dire
        // che le pagine sono state lette fra un mese.
        expect(letto).toBe(RUN.startedAt)
        wrapper.unmount()
    })

    it('e il RIS esce col suo nome, non come PDF', async () => {
        const wrapper = mount(ResearchReportScreen)
        // Due giri come openReport: il run arriva asincrono, e con uno solo
        // exportAs esce subito perche non ha ancora il rapporto da esportare.
        await settle(wrapper)
        await settle(wrapper)

        await wrapper.get('[data-testid="talos-research-export"]').trigger('click')
        await settle(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-export-ris"]')!.click()
        await settle(wrapper)

        const controller = mockState.controller as ReturnType<typeof controllerWith>
        expect(controller.research.exportReportPdf).not.toHaveBeenCalled()
        const [, formato, nome] = controller.research.exportCitations.mock.calls[0]!
        expect(formato).toBe('ris')
        expect(nome.endsWith('.ris')).toBe(true)
        wrapper.unmount()
    })
})


/**
 * TENUTA-NEL-TEMPO-01 — quanto vale OGGI un rapporto di ieri.
 *
 * Chi ha salvato un URL sa riferire soltanto che una richiesta e’ andata a
 * buon fine, cosa che riesce anche a una pagina riscritta: nella letteratura
 * fra i link ancora VIVI solo il 29,9% conteneva davvero il materiale citato.
 * Noi il testo di allora ce l’abbiamo, e i ricontrolli sono gia’ in Libreria.
 */
describe('la tenuta nel tempo', () => {
    const TAPPE = [
        {
            at: '2026-08-19T10:00:00.000Z', total: 2, intact: 2, changed: 0, unreachable: 0,
            passagesStanding: 7, passagesLost: 0, tenuta: 1, primo: true, delta: null,
        },
        {
            at: '2026-09-03T08:00:00.000Z', total: 2, intact: 1, changed: 1, unreachable: 0,
            passagesStanding: 6, passagesLost: 1, tenuta: 6 / 7, primo: false, delta: 6 / 7 - 1,
        },
    ]

    it('mette le tappe in fila e dice di quanto e’ scesa', async () => {
        mockState.controller = controllerWith(REPORT)
        const controller = mockState.controller as ReturnType<typeof controllerWith>
        controller.research.recheckHistory = vi.fn().mockResolvedValue(TAPPE)

        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        const pannello = wrapper.find('[data-testid="talos-research-tenuta-nel-tempo"]')
        expect(pannello.exists()).toBe(true)
        expect(wrapper.findAll('[data-testid="talos-research-tappa"]')).toHaveLength(2)
        // 6 su 7 = 86%, e il salto e’ 14 punti in meno.
        expect(pannello.text()).toContain('86%')
        expect(pannello.text()).toContain('14%')
        wrapper.unmount()
    })

    it('E AL CONTRARIO: una tappa sola non e’ una storia, e non si disegna', async () => {
        // Un punto disegnato come una linea suggerisce un andamento che
        // nessuno ha misurato.
        mockState.controller = controllerWith(REPORT)
        const controller = mockState.controller as ReturnType<typeof controllerWith>
        controller.research.recheckHistory = vi.fn().mockResolvedValue([TAPPE[0]])

        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        expect(wrapper.find('[data-testid="talos-research-tenuta-nel-tempo"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('⛔ due tappe nello STESSO giorno portano l’ora, se no sono la stessa riga', async () => {
        // Visto sul Pad il 2026-08-20 facendo due ricontrolli di fila: due
        // righe con «20 agosto 2026» e nient’altro a distinguerle.
        mockState.controller = controllerWith(REPORT)
        const controller = mockState.controller as ReturnType<typeof controllerWith>
        controller.research.recheckHistory = vi.fn().mockResolvedValue([
            { ...TAPPE[0], at: '2026-08-20T09:00:00.000Z' },
            { ...TAPPE[1], at: '2026-08-20T11:30:00.000Z' },
        ])

        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        const righe = wrapper.findAll('[data-testid="talos-research-tappa"]').map((r) => r.text())
        expect(righe).toHaveLength(2)
        // Le due etichette temporali sono DIVERSE fra loro.
        expect(righe[0]).not.toBe(righe[1])
        // E portano un orario, non solo un giorno.
        for (const riga of righe) expect(riga).toMatch(/\d{1,2}[:.]\d{2}/)
        wrapper.unmount()
    })

    it('e in giorni diversi basta il giorno, senza ora', async () => {
        mockState.controller = controllerWith(REPORT)
        const controller = mockState.controller as ReturnType<typeof controllerWith>
        controller.research.recheckHistory = vi.fn().mockResolvedValue(TAPPE)

        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        const righe = wrapper.findAll('[data-testid="talos-research-tappa"]').map((r) => r.text())
        expect(righe[0]).not.toMatch(/\d{1,2}[:.]\d{2}/)
        wrapper.unmount()
    })

    it('E se la Libreria non risponde, il rapporto resta in piedi lo stesso', async () => {
        mockState.controller = controllerWith(REPORT)
        const controller = mockState.controller as ReturnType<typeof controllerWith>
        controller.research.recheckHistory = vi.fn().mockRejectedValue(new Error('vault giu'))

        const wrapper = mount(ResearchReportScreen)
        await settle(wrapper)
        await settle(wrapper)

        expect(wrapper.find('[data-testid="talos-research-balance"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-research-tenuta-nel-tempo"]').exists()).toBe(false)
        wrapper.unmount()
    })
})
