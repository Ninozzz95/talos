// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosResearchRun, TalosResearchStatus } from '@/lib/research/researchRun'

const mockState = vi.hoisted(() => ({ controller: null as never }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

const routerCalls = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('vue-router', () => ({
    useRoute: () => ({ params: {} }),
    useRouter: () => routerCalls,
}))

import { __resetSettingsStoreForTests } from '@/stores/settings'
import ResearchScreen from '@/screens/ResearchScreen.vue'

/**
 * The station's CRUD, added 2026-08-03. Owner: "tutte le operazioni CRUD sulla
 * pagina ricerca … non possiamo tralasciare nulla."
 *
 * Before this, `controller.research` could start, list, resume, re-check and
 * export — and nothing else. The station could be filled and never emptied.
 */
function run(patch: Partial<TalosResearchRun> = {}): TalosResearchRun {
    return {
        id: 'run-1',
        sessionId: 'chat-1',
        question: 'Quando è uscito il primo iPhone',
        depth: 'quick',
        engine: 'device',
        status: 'done' as TalosResearchStatus,
        title: null,
        plan: [{ id: 'b1', question: 'b1', estimate: { tokens: 1, searches: 1, pages: 1 } }],
        steps: [],
        startedAt: '2026-08-03T08:00:00.000Z',
        updatedAt: '2026-08-03T08:05:00.000Z',
        ...patch,
    }
}

function controllerWith(runs: readonly TalosResearchRun[], live: readonly string[] = []) {
    return {
        catalogs: {},
        research: {
            registry: {
                watch: vi.fn(() => () => {}),
                isRunning: vi.fn((id: string) => live.includes(id)),
                running: vi.fn(() => live),
                latest: vi.fn(() => null),
                open: vi.fn(() => () => {}),
                close: vi.fn(),
                report: vi.fn(),
                forget: vi.fn(),
            },
            list: vi.fn().mockResolvedValue(runs),
            unfinished: vi.fn().mockResolvedValue([]),
            report: vi.fn().mockResolvedValue(null),
            start: vi.fn(),
            resume: vi.fn().mockResolvedValue({ id: 'run-1' }),
            pause: vi.fn().mockResolvedValue(run({ status: 'paused' })),
            cancel: vi.fn().mockResolvedValue(run({ status: 'cancelled' })),
            rename: vi.fn().mockResolvedValue(run({ title: 'iPhone' })),
            remove: vi.fn().mockResolvedValue(['file-1', 'file-2']),
            recheck: vi.fn(),
            followUp: vi.fn(),
            exportReport: vi.fn(),
        },
    }
}

async function station(runs: readonly TalosResearchRun[], live: readonly string[] = []) {
    mockState.controller = controllerWith(runs, live) as never
    const wrapper = mount(ResearchScreen, { attachTo: document.body })
    await flushPromises()
    return wrapper
}

function menuItems(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function openMenu(wrapper: Awaited<ReturnType<typeof station>>, id = 'run-1') {
    await wrapper.get(`[data-testid="talos-research-menu-${id}"]`).trigger('click')
    await wrapper.vm.$nextTick()
}

beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    __resetSettingsStoreForTests()
    routerCalls.push.mockClear()
})

describe('the actions on a research card', () => {
    it('offers a visible button rather than a gesture nobody can see', async () => {
        // The decisive reason is not taste: inside a WebView there is no public
        // way to give one DOM row an Android accessibility action, so a real
        // button is the only path TalkBack can reach.
        const wrapper = await station([run()])
        const button = wrapper.get('[data-testid="talos-research-menu-run-1"]')

        expect(button.element.tagName).toBe('BUTTON')
        expect(button.attributes('aria-haspopup')).toBe('menu')
        // Named by the row, not "More" twenty times over.
        expect(button.attributes('aria-label')).toContain('Quando è uscito il primo iPhone')
    })

    it('offers Pause and Cancel to a running research, and never Delete', async () => {
        const wrapper = await station([run({ status: 'collecting' })], ['run-1'])
        await openMenu(wrapper)

        const labels = menuItems().map((item) => item.dataset.testid)
        expect(labels).toContain('talos-research-action-pause')
        expect(labels).toContain('talos-research-action-cancel')
        // Removing the journal from under the single writer would destroy the
        // only record that a step already sent to a provider was paid for.
        expect(labels).not.toContain('talos-research-action-delete')
    })

    it('pauses without asking, because pausing takes nothing away', async () => {
        const wrapper = await station([run({ status: 'collecting' })], ['run-1'])
        await openMenu(wrapper)

        wrapper.vm // keep the instance alive for the click below
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-pause"]')!.click()
        await flushPromises()

        expect(mockState.controller.research.pause).toHaveBeenCalledWith('run-1')
        // No dialog stood in the way.
        expect(document.querySelector('[data-testid="talos-confirm-dialog"]')).toBeNull()
    })

    it('says the pause was heard, and does not re-read it away', async () => {
        /**
         * The tablet 2026-08-03: tapping Pause on a running research changed
         * nothing on screen. The registry HAD reported `pause_requested` — the
         * interval between being asked and being able to comply — and the card
         * carried it for an instant, before the list was re-read from the
         * journal and the `collecting` still on disk was put back. The journal
         * is not wrong; it simply has not heard yet, because the driver is the
         * only writer and it is mid-step.
         */
        const wrapper = await station([run({ status: 'collecting' })], ['run-1'])
        const controller = mockState.controller as never as ReturnType<typeof controllerWith>
        controller.research.pause = vi.fn(async () => {
            // What the real controller does: report, then hand back the run.
            const asked = run({ status: 'pause_requested' })
            const watcher = controller.research.registry.watch.mock.calls[0]?.[1] as
                ((progress: { run: TalosResearchRun; done: number; total: number }) => void) | undefined
            watcher?.({ run: asked, done: 1, total: 2 })
            return asked
        })

        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-pause"]')!.click()
        await flushPromises()

        // Still working — a paid-for step is in flight — but visibly on its way.
        expect(wrapper.get('[data-testid="talos-research-card-pausing"]').text())
            .toContain('then stopping')
        expect(wrapper.find('[data-testid="talos-research-card-progress"]').exists()).toBe(false)
        // The list was NOT re-read: that is what used to undo it.
        expect(controller.research.list).toHaveBeenCalledTimes(1)
    })

    it('admits when a pause turned into a finish instead', async () => {
        /**
         * Seen on the tablet 2026-08-03. A pause asked while the REPORT was
         * being written let that step finish — drain-then-checkpoint working,
         * since the call was already sent and already paid for — and the
         * research completed. Correct, and completely silent: the tap vanished.
         * A stop that quietly does nothing is worse than one that refuses,
         * because the person taps it again next time and trusts it less.
         */
        const wrapper = await station([run({ status: 'collecting' })], ['run-1'])
        const controller = mockState.controller as never as ReturnType<typeof controllerWith>
        const watcher = controller.research.registry.watch.mock.calls[0]?.[1] as
            (progress: { run: TalosResearchRun; done: number; total: number }) => void

        controller.research.pause = vi.fn(async () => run({ status: 'pause_requested' }))
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-pause"]')!.click()
        await flushPromises()

        // The last step lands, and with it the whole research.
        watcher({ run: run({ status: 'done' }), done: 3, total: 3 })
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-research-notice"]').text())
            .toContain('already paid for')
    })

    it('says nothing extra when the pause simply worked', async () => {
        const wrapper = await station([run({ status: 'collecting' })], ['run-1'])
        const controller = mockState.controller as never as ReturnType<typeof controllerWith>
        const watcher = controller.research.registry.watch.mock.calls[0]?.[1] as
            (progress: { run: TalosResearchRun; done: number; total: number }) => void

        controller.research.pause = vi.fn(async () => run({ status: 'pause_requested' }))
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-pause"]')!.click()
        await flushPromises()

        watcher({ run: run({ status: 'paused' }), done: 1, total: 3 })
        await flushPromises()

        // The card already says "paused". A second sentence would be noise.
        expect(wrapper.find('[data-testid="talos-research-notice"]').exists()).toBe(false)
    })

    it('asks before cancelling, and says what cancelling costs', async () => {
        // Unlike pause, this cannot be undone — W3C G168 is about exactly this.
        const wrapper = await station([run({ status: 'collecting' })], ['run-1'])
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-cancel"]')!.click()
        await flushPromises()

        expect(mockState.controller.research.cancel).not.toHaveBeenCalled()
        const dialog = document.querySelector('[data-testid="talos-confirm-dialog"]')!
        expect(dialog.textContent).toContain('Quando è uscito il primo iPhone')
        expect(dialog.textContent).toContain('will not resume')

        document.querySelector<HTMLElement>('[data-testid="talos-research-cancel-confirm"]')!.click()
        await flushPromises()
        expect(mockState.controller.research.cancel).toHaveBeenCalledWith('run-1')
    })
})

describe('deleting a research', () => {
    it('names the research and what goes with it, instead of "Are you sure?"', async () => {
        const wrapper = await station([run()])
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-delete"]')!.click()
        await flushPromises()

        const dialog = document.querySelector('[data-testid="talos-confirm-dialog"]')!
        expect(dialog.textContent).toContain('Quando è uscito il primo iPhone')
        // The dossiers are the part a person cannot see coming.
        expect(dialog.textContent).toContain('dossiers of the sources')
        // The verb, not "OK".
        expect(document.querySelector('[data-testid="talos-research-delete-confirm"]')!.textContent?.trim())
            .toBe('Delete permanently')
    })

    it('says afterwards how much went', async () => {
        // A delete that also took two dossiers and said nothing is a delete the
        // person has no way to check.
        const wrapper = await station([run()])
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-delete"]')!.click()
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid="talos-research-delete-confirm"]')!.click()
        await flushPromises()

        expect(mockState.controller.research.remove).toHaveBeenCalledWith('run-1')
        const notice = wrapper.get('[data-testid="talos-research-notice"]')
        expect(notice.text()).toContain('2')
        // Heard, not jumped to.
        expect(notice.attributes('role')).toBe('status')
    })

    it('shows the real failure instead of doing nothing quietly', async () => {
        // An action that silently did nothing is worse than one that failed:
        // the person tries it again.
        const wrapper = await station([run()])
        mockState.controller.research.remove = vi.fn().mockRejectedValue(new Error('TALOS_RESEARCH_RUN_BUSY'))
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-delete"]')!.click()
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid="talos-research-delete-confirm"]')!.click()
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-research-action-error"]').text())
            .toContain('TALOS_RESEARCH_RUN_BUSY')
    })
})

describe('renaming a research', () => {
    it('starts empty when the label is still the question, and shows it as the hint', async () => {
        // Pre-filling with the question would make the person delete it before
        // typing, and would make "no custom title" look like a custom one.
        const wrapper = await station([run()])
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-rename"]')!.click()
        await flushPromises()

        const field = document.querySelector<HTMLInputElement>('[data-testid="talos-research-rename-field"]')!
        expect(field.value).toBe('')
        expect(field.placeholder).toBe('Quando è uscito il primo iPhone')
    })

    it('saves the label and leaves the question alone', async () => {
        const wrapper = await station([run()])
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-rename"]')!.click()
        await flushPromises()

        const field = document.querySelector<HTMLInputElement>('[data-testid="talos-research-rename-field"]')!
        field.value = '  iPhone, le date  '
        field.dispatchEvent(new Event('input'))
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid="talos-research-rename-save"]')!.click()
        await flushPromises()

        expect(mockState.controller.research.rename).toHaveBeenCalledWith('run-1', 'iPhone, le date')
    })

    it('treats a blank title as putting the question back', async () => {
        // Whitespace is not a title, and silently substituting one would leave
        // the person unsure what was saved.
        const wrapper = await station([run({ title: 'vecchio nome' })])
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-rename"]')!.click()
        await flushPromises()

        const field = document.querySelector<HTMLInputElement>('[data-testid="talos-research-rename-field"]')!
        expect(field.value).toBe('vecchio nome')
        field.value = '   '
        field.dispatchEvent(new Event('input'))
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid="talos-research-rename-save"]')!.click()
        await flushPromises()

        expect(mockState.controller.research.rename).toHaveBeenCalledWith('run-1', null)
    })

    it('shows the chosen label on the card, not the question', async () => {
        const wrapper = await station([run({ title: 'iPhone, le date' })])
        const card = wrapper.get('[data-testid="talos-research-card"]')
        expect(card.text()).toContain('iPhone, le date')
        expect(card.text()).not.toContain('Quando è uscito il primo iPhone')
    })
})

describe('a paused research in the list', () => {
    it('has a drawer of its own, apart from the ones the phone killed', async () => {
        // Filing a deliberate stop with the accidents would tell the person
        // their decision was an accident.
        const wrapper = await station([run({ status: 'paused' })])
        expect(wrapper.get('[data-testid="talos-research-card"]').attributes('data-bucket')).toBe('paused')
        expect(wrapper.find('[data-testid="talos-research-filter-paused"]').exists()).toBe(true)
    })

    it('offers Resume, and resuming starts watching it again', async () => {
        const wrapper = await station([run({ status: 'paused' })])
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-resume"]')!.click()
        await flushPromises()

        expect(mockState.controller.research.resume).toHaveBeenCalledWith('run-1')
        // Otherwise the card would sit still while the research worked — the
        // exact lie the live registry was built to remove.
        expect(mockState.controller.research.registry.running).toHaveBeenCalled()
    })
})

describe('the destructive button', () => {
    it('is painted with the theme danger triple, not the upstream variant', async () => {
        /**
         * The shadcn variant draws `text-destructive` over `bg-destructive/20`,
         * which assumes that token is a saturated fill. In TALOS it is a light
         * red TEXT colour (#fee2e2), legible only ON `--talos-danger-soft` —
         * so over 20% of itself it produced pale pink on a pale wash, and
         * "Delete permanently" looked like a secondary button on the tablet.
         *
         * The upstream file is not forked (a conformance test guards it); the
         * class is passed at the call site, where tailwind-merge drops the
         * conflicting utilities.
         */
        const wrapper = await station([run()])
        await openMenu(wrapper)
        document.querySelector<HTMLElement>('[data-testid="talos-research-action-delete"]')!.click()
        await flushPromises()

        const confirm = document.querySelector('[data-testid="talos-research-delete-confirm"]')!
        expect(confirm.className).toContain('bg-[var(--talos-danger-soft)]')
        expect(confirm.className).toContain('text-[var(--talos-danger)]')
        /**
         * …and NO pale background survives, in either variant. tailwind-merge
         * only drops utilities sharing a prefix, so an unprefixed `bg-…` leaves
         * `dark:bg-destructive/20` standing — and `.dark .foo` outranks it on
         * specificity, so in a dark-first app the pale wash would win anyway.
         */
        expect(confirm.className).not.toMatch(/(^|\s|:)bg-destructive/)
        expect(confirm.className).not.toMatch(/(^|\s)text-destructive/)
    })
})

/**
 * La selezione multipla, aggiunta 2026-08-04.
 *
 * Il gesto del tieni-premuto era stato LIBERATO per questa funzione e poi non
 * costruita: tenere premuta una ricerca non faceva niente. La ricerca sulle
 * azioni di riga (2026-08-03) dice che ⋮ e' la via primaria per agire su UNA e
 * il tieni-premuto e' la SELEZIONE — quindi qui il gesto accende il modo.
 */
async function hold(wrapper: Awaited<ReturnType<typeof station>>, id = 'run-1') {
    const row = wrapper.get(`[data-research-id="${id}"]`).element.closest('li')!
    row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }))
    vi.advanceTimersByTime(600)
    await wrapper.vm.$nextTick()
}

describe('selezionarne piu di una', () => {
    beforeEach(() => vi.useFakeTimers())

    it('il tieni-premuto ACCENDE la selezione, non apre un secondo menu', async () => {
        const wrapper = await station([run()])
        expect(wrapper.find('[data-testid="talos-research-selection-bar"]').exists()).toBe(false)

        await hold(wrapper)

        expect(wrapper.get('[data-testid="talos-research-selection-bar"]').text()).toContain('1')
        // Il menu di riga tace: «Apri» porterebbe via a meta' selezione.
        expect(wrapper.find('[data-testid="talos-research-menu-run-1"]').exists()).toBe(false)
    })

    it('si entra anche da un pulsante, perche il gesto da solo non lo trova nessuno', async () => {
        // Owner sulle Chat, chiesto due volte.
        const wrapper = await station([run()])
        await wrapper.get('[data-testid="talos-research-select-header"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-research-selection-bar"]').text()).toContain('0')
    })

    it('una IN CORSO non si spunta, e lo dice invece di ignorare il dito', async () => {
        /**
         * Non e' una scelta di questa schermata: `talosResearchActionsFor` non
         * offre `delete` mentre gira, perche' il driver sta ancora scrivendo su
         * quella voce del giornale. Lasciarla spuntare e poi saltarla in
         * silenzio direbbe che sono andate cinque cose quando ne sono andate
         * quattro.
         */
        const wrapper = await station([run({ status: 'collecting' }), run({ id: 'run-2' })], ['run-1'])
        await wrapper.get('[data-testid="talos-research-select-header"]').trigger('click')

        const inCorso = wrapper.get('[data-research-id="run-1"]')
        expect(inCorso.text()).toContain('Running')
        await inCorso.trigger('click')
        expect(wrapper.get('[data-testid="talos-research-selection-bar"]').text()).toContain('0')

        // Quella ferma si', e «tutte» prende solo lei.
        await wrapper.get('[data-testid="talos-research-select-all"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-research-selection-bar"]').text()).toContain('1')
    })

    it('nel modo selezione un tocco SPUNTA, non apre la ricerca', async () => {
        const wrapper = await station([run()])
        await wrapper.get('[data-testid="talos-research-select-header"]').trigger('click')
        routerCalls.push.mockClear()

        await wrapper.get('[data-research-id="run-1"]').trigger('click')

        expect(routerCalls.push).not.toHaveBeenCalled()
        expect(wrapper.get('[data-testid="talos-research-selection-bar"]').text()).toContain('1')
    })

    it('elimina tutte quelle spuntate e DICE quanti dossier sono andati con loro', async () => {
        vi.useRealTimers()
        const wrapper = await station([run(), run({ id: 'run-2' })])
        await wrapper.get('[data-testid="talos-research-select-header"]').trigger('click')
        await wrapper.get('[data-testid="talos-research-select-all"]').trigger('click')
        await wrapper.get('[data-testid="talos-research-bulk-delete"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid="talos-research-bulk-delete-confirm"]')!.click()
        await flushPromises()

        const controller = mockState.controller as never as ReturnType<typeof controllerWith>
        expect(controller.research.remove).toHaveBeenCalledTimes(2)
        // Due per ricerca, quattro in tutto: un'eliminazione che tace su cosa
        // si e' portata via e' un'eliminazione che non si puo' verificare.
        expect(wrapper.get('[data-testid="talos-research-notice"]').text()).toContain('4')
    })

    it('una che si rifiuta non ferma il resto, e viene DETTA', async () => {
        vi.useRealTimers()
        const wrapper = await station([run(), run({ id: 'run-2' })])
        const controller = mockState.controller as never as ReturnType<typeof controllerWith>
        controller.research.remove = vi.fn(async (id: string) => {
            if (id === 'run-1') throw new Error('il file e in uso')
            return ['file-1']
        }) as never

        await wrapper.get('[data-testid="talos-research-select-header"]').trigger('click')
        await wrapper.get('[data-testid="talos-research-select-all"]').trigger('click')
        await wrapper.get('[data-testid="talos-research-bulk-delete"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid="talos-research-bulk-delete-confirm"]')!.click()
        await flushPromises()

        expect(controller.research.remove).toHaveBeenCalledTimes(2)
        const detto = wrapper.get('[data-testid="talos-research-notice"]').text()
        expect(detto).toContain('1')
        expect(detto.toLowerCase()).toContain('could not be deleted')
    })
})

describe('il tocco dopo il tieni-premuto', () => {
    beforeEach(() => vi.useFakeTimers())

    it('non viene ingoiato dalla soppressione del gesto precedente', async () => {
        /**
         * Trovato sul OnePlus Pad 3, 2026-08-04, e da nessuna altra parte.
         *
         * Il tieni-premuto alza una bandiera per mangiarsi il PROPRIO click —
         * quello che chiude la pressione, che altrimenti aprirebbe la ricerca
         * nell'istante in cui si accende la selezione. Ma quel click a volte non
         * arriva mai, e la bandiera resta alzata ad aspettarlo: se la mangia il
         * tocco successivo, che era legittimo. Sullo schermo: si tiene premuta
         * una ricerca, si tocca la seconda, e la seconda non si spunta.
         */
        const wrapper = await station([run(), run({ id: 'run-2' })])
        const prima = wrapper.get('[data-research-id="run-1"]').element.closest('li')!

        // Tieni premuto: la selezione si accende, la bandiera resta alzata
        // perche' nessun click chiude la pressione.
        prima.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }))
        vi.advanceTimersByTime(600)
        prima.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(wrapper.get('[data-testid="talos-research-selection-bar"]').text()).toContain('1')

        // Ora un tocco sulla seconda: pointerdown e poi click, come fa un dito.
        const seconda = wrapper.get('[data-research-id="run-2"]')
        seconda.element.closest('li')!.dispatchEvent(
            new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }),
        )
        await seconda.trigger('click')

        expect(wrapper.get('[data-testid="talos-research-selection-bar"]').text()).toContain('2')
    })
})
