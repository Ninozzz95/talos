// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

// Harness UI (24/8): the list, native — same router-mock convention as
// chatsScreen.test.ts (a real push call asserted on its argument, not on
// navigation actually happening — that belongs to harnessSessionScreen.test.ts).
//
// 28/8: `route` is `reactive()`, not a plain object — a test that mutates
// `mockState.route.name` after mount (the "returned to the list" re-fetch)
// needs the component's `watch(() => route.name, ...)` to actually see it;
// a plain object gives Vue nothing to track.
const mockState = vi.hoisted(() => ({
    routerPush: vi.fn(),
    route: { name: 'harness' as string, params: {} as Record<string, string> },
}))
// `reactive()` needs the real `vue` import bound, which `vi.hoisted`'s
// factory runs BEFORE (its whole body is relocated above every import,
// including `vue` itself) — wrapped here instead, a normal statement that
// still runs before any test body ever calls `useRoute()`.
mockState.route = reactive(mockState.route)
vi.mock('vue-router', () => ({
    useRoute: () => mockState.route,
    useRouter: () => ({ push: mockState.routerPush }),
}))

// 28/8: real sessions, not the static five-row demo array. A fake session
// factory (not the demo shape) so a name collision with the old fixtures
// can never make a test pass for the wrong reason.
const listCodiceSessions = vi.hoisted(() => vi.fn())
const renameCodiceSession = vi.hoisted(() => vi.fn())
const deleteCodiceSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/harness/codiceSessions', () => ({ listCodiceSessions, renameCodiceSession, deleteCodiceSession }))

// ⭐⭐⭐ 2/9, piano §16.1 — stato vivo dal server on-device: best-effort per
// costruzione, quindi il default onesto in ogni test è "il server non ha
// risposto" (Map vuota) — solo i test che lo esercitano esplicitamente lo
// popolano.
const fetchTalosHarnessSessionsStatus = vi.hoisted(() => vi.fn())
vi.mock('@/lib/harness/harnessUiSessionStatus', () => ({ fetchTalosHarnessSessionsStatus }))

import HarnessScreen from '@/screens/HarnessScreen.vue'

function fakeSession(id: string, title: string, updatedAt: string) {
    return {
        id, title, surface: 'chat' as const, mode: 'verified_execution' as const, persistence_mode: 'persistent' as const,
        active_model_profile_id: null, metadata: { codice: true }, created_at: updatedAt, updated_at: updatedAt,
    }
}

const NOW = new Date().toISOString()

beforeEach(() => {
    mockState.routerPush.mockReset()
    // A FRESH reactive object, not a mutation of the shared one: a
    // component from a PRIOR test that was never explicitly unmounted
    // still holds its own `useRoute()` reference and would otherwise keep
    // reacting to every later test's route changes too (10 refresh calls
    // measured across 9 tests before this fix — cross-test leakage, not a
    // component bug).
    mockState.route = reactive({ name: 'harness', params: {} })
    listCodiceSessions.mockReset()
    listCodiceSessions.mockResolvedValue([
        fakeSession('session-a', 'Refactor auth flow', NOW),
        fakeSession('session-b', 'Fix mobile composer', NOW),
    ])
    renameCodiceSession.mockReset()
    renameCodiceSession.mockResolvedValue(fakeSession('session-a', 'Renamed', NOW))
    deleteCodiceSession.mockReset()
    deleteCodiceSession.mockResolvedValue(undefined)
    fetchTalosHarnessSessionsStatus.mockReset()
    fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map())
    // TalosRowActions' menu (and TalosMobileConfirmDialog) `Teleport to="body"`
    // — same convention as chatsScreen.test.ts: `attachTo: document.body` so
    // the teleported content actually lands somewhere findable, cleaned
    // between tests so one test's menu can't leak into the next.
    document.body.innerHTML = ''
})

async function mountScreen() {
    const w = mount(HarnessScreen, { attachTo: document.body })
    await flushPromises()
    return w
}

describe('HarnessScreen (28/8) — real sessions, no more the five-row demo array', () => {
    it('renders every real session listCodiceSessions returns, grouped by date', async () => {
        const w = await mountScreen()
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(2)
        expect(w.text()).toContain('Refactor auth flow')
        expect(w.text()).toContain('Fix mobile composer')
    })

    it('⛔ 29/8 AL CONTRARIO: no leftover mockup notice box in the sidebar (owner: "rimuovi il riquadro")', async () => {
        const w = await mountScreen()
        expect(w.find('[data-testid="talos-harness-demo-notice"]').exists()).toBe(false)
        expect(w.text()).not.toContain('anteprima')
    })

    it('CODE-PRODUCT-NAME-01 presents the feature as Code, never as Harness', async () => {
        const w = await mountScreen()
        expect(w.get('[data-testid="talos-harness-screen"]').attributes('aria-label')).toBe('Code')
        expect(w.text()).not.toMatch(/Harness/i)
    })

    it('an empty list shows the honest empty state, never a stale demo row', async () => {
        listCodiceSessions.mockResolvedValue([])
        const w = await mountScreen()
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(0)
        expect(w.find('[data-testid="talos-harness-empty"]').exists()).toBe(true)
    })

    it('pushes a real router navigation to harness-session with the row\'s id — never a window.location', async () => {
        const w = await mountScreen()
        await w.get('[data-harness-session-id="session-a"]').trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'session-a' } })
    })

    it('HARNESS-NEW-SESSION-01 the embedded "New" button navigates to the draft route — never creates a row itself', async () => {
        const w = mount(HarnessScreen, { props: { embedded: true } })
        await flushPromises()
        await w.get('[data-testid="talos-harness-new"]').trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'new' } })
        // Verso contrario: opening the draft page must not itself have
        // called anything that creates a session — only a real send does.
        expect(listCodiceSessions).not.toHaveBeenCalledWith(expect.anything())
    })

    it('HARNESS-NATIVE-RAIL-ACTIVE-01 marks only the row selected by the route', async () => {
        mockState.route.name = 'harness-session'
        mockState.route.params = { id: 'session-b' }

        const w = mount(HarnessScreen, { props: { embedded: true } })
        await flushPromises()
        const active = w.get('[data-harness-session-id="session-b"]')

        expect(active.attributes('aria-current')).toBe('page')
        expect(active.attributes('data-harness-active')).toBe('true')
        expect(w.findAll('[aria-current="page"]')).toHaveLength(1)
    })

    // F6 sidebar refactor (24/8): TalosTabletSidebar.vue mounts this screen
    // `embedded` in place of the chat rail when the station is Harness — the
    // forwarding to TalosMobileScreen is the only new behaviour here (its own
    // header/background handling is covered by TalosMobileScreen.test.ts).
    it('embedded: forwards the prop, same rows, still real navigation', async () => {
        const w = mount(HarnessScreen, { props: { embedded: true } })
        await flushPromises()
        expect(w.findAll('h1')).toHaveLength(0)
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(2)
        await w.get('[data-harness-session-id="session-a"]').trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'session-a' } })
    })

    // ⭐⭐⭐ 2/9, piano §16.1 — stato vivo (spinner/esito/ultimo messaggio),
    // come Claude Code. Best-effort per costruzione: ogni riga resta quella
    // di sempre finché il server on-device non risponde per QUELLA riga.
    describe('live status from the on-device server (§16.1) — best-effort, additive', () => {
        it('HARNESS-STATUS-IDLE-01 AL CONTRARIO: no server answer keeps today\'s row exactly as it was', async () => {
            const w = await mountScreen()
            const status = w.get('[data-harness-session-id="session-a"]').element
                .closest('[role="listitem"]')!
                .querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('idle')
            expect(w.find('[data-testid="talos-harness-row-preview"]').exists()).toBe(false)
            expect(w.find('.animate-spin').exists()).toBe(false)
        })

        it('HARNESS-STATUS-RUNNING-01 a session the server has not concluded shows a spinner, not the relative time', async () => {
            fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map([
                ['session-a', { conclusa: false, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: null }],
            ]))
            const w = await mountScreen()
            const row = w.get('[data-harness-session-id="session-a"]').element.closest('[role="listitem"]')!
            const status = row.querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('running')
            expect(status.textContent).toContain('Running')
            expect(row.querySelector('.animate-spin')).not.toBeNull()
        })

        it('HARNESS-STATUS-INTERRUPTED-01 a concluded-but-interrupted session shows the warning badge, never the spinner', async () => {
            fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map([
                ['session-a', { conclusa: true, interrotta: true, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: null }],
            ]))
            const w = await mountScreen()
            const row = w.get('[data-harness-session-id="session-a"]').element.closest('[role="listitem"]')!
            const status = row.querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('interrupted')
            expect(status.textContent).toContain('Interrupted')
            expect(row.querySelector('.animate-spin')).toBeNull()
        })

        /**
         * ⭐⭐⭐ 2/9 — owner: "esattamente come fa desktop... metti anche
         * lo stato". Stessi due stati aggiunti lato desktop lo stesso
         * giorno (statoSessione(), harness-ui/public/app.js): attesa
         * d'approvazione ed esito con errore.
         */
        it('HARNESS-STATUS-WAITING-APPROVAL-01 a session paused on a tool approval shows that state, not "running"', async () => {
            fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map([
                ['session-a', { conclusa: false, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: true, ultimoEsito: null }],
            ]))
            const w = await mountScreen()
            const row = w.get('[data-harness-session-id="session-a"]').element.closest('[role="listitem"]')!
            const status = row.querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('waiting-approval')
            expect(status.textContent).toContain('Waiting for approval')
            // AL CONTRARIO — precedenza: "in attesa" vince su "in corso" anche se la sessione È tecnicamente ancora aperta (conclusa:false).
            expect(row.querySelector('.animate-spin')).toBeNull()
        })

        it('HARNESS-STATUS-ERROR-01 a session that concluded with an error shows that state, distinct from "interrupted"', async () => {
            fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map([
                ['session-a', { conclusa: true, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: 'errore' }],
            ]))
            const w = await mountScreen()
            const row = w.get('[data-harness-session-id="session-a"]').element.closest('[role="listitem"]')!
            const status = row.querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('error')
            expect(status.textContent).toContain('Concluded with an error')
        })

        it('⛔ HARNESS-STATUS-PRECEDENCE-01 AL CONTRARIO: "interrotta" vince su "errore" — un crash è un tipo di interruzione', async () => {
            fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map([
                ['session-a', { conclusa: true, interrotta: true, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: 'errore' }],
            ]))
            const w = await mountScreen()
            const status = w.get('[data-harness-session-id="session-a"]').element.closest('[role="listitem"]')!.querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('interrupted')
        })

        it('HARNESS-STATUS-PREVIEW-01 shows the real last-message preview the server reports, verbatim', async () => {
            fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map([
                ['session-a', { conclusa: true, interrotta: false, ultimoMessaggio: 'Fatto: ho aggiornato lo sconto a scaglioni.', inAttesaApprovazione: false, ultimoEsito: 'successo' }],
            ]))
            const w = await mountScreen()
            const preview = w.get('[data-testid="talos-harness-row-preview"]')
            expect(preview.text()).toBe('Fatto: ho aggiornato lo sconto a scaglioni.')
            // A concluded, non-interrupted session still shows the ordinary relative time — the preview is additive, not a replacement.
            const status = w.get('[data-harness-session-id="session-a"]').element.closest('[role="listitem"]')!.querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('idle')
            /*
             * ⛔⛔⛔ 3/9, trovato SOLO dal vivo su device reale (jsdom non ha un
             * motore di layout: nessun test qui sopra poteva accorgersene,
             * la classe era presente e il testo era giusto). `line-clamp-2`
             * imposta `display:-webkit-box` da sé — una `block` esplicita
             * nella STESSA lista di classi vince nella cascata Tailwind e
             * lo sovrascrive a `display:block`, disattivando il clamp: la
             * riga tornava a mostrare il testo intero (misurato 64px resi
             * contro 64px di scrollHeight non troncato — zero clamp).
             * Guardia di non regressione: non prova il rendering reale
             * (impossibile qui), prova che nessuno la faccia tornare.
             */
            expect(preview.classes()).not.toContain('block')
        })

        it('⛔ HARNESS-STATUS-UNREACHABLE-01 AL CONTRARIO: a server failure never throws or blocks the local list', async () => {
            fetchTalosHarnessSessionsStatus.mockRejectedValue(new Error('ECONNREFUSED'))
            const w = await mountScreen()
            expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(2)
            expect(w.find('[data-testid="talos-harness-row-preview"]').exists()).toBe(false)
        })
    })

    it('re-fetches when the route returns to the bare list — the tablet panel never unmounts to pick up a new session', async () => {
        const w = await mountScreen()
        expect(listCodiceSessions).toHaveBeenCalledTimes(1)

        listCodiceSessions.mockResolvedValue([
            fakeSession('session-a', 'Refactor auth flow', NOW),
            fakeSession('session-b', 'Fix mobile composer', NOW),
            fakeSession('session-c', 'Started from the composer', NOW),
        ])
        // Simulate the real transition: the panel stays mounted while a
        // person opens a session, then returns to the bare list — setting
        // the SAME route name again would not be a change Vue's watcher
        // reacts to. The watcher also tracks `params.id` (see
        // HARNESS-DRAFT-LIST-REFRESH-01), so BOTH hops below trigger a
        // fetch — 1 (mount) + 2 (name changes) = 3.
        mockState.route.name = 'harness-session'
        await w.vm.$nextTick()
        mockState.route.name = 'harness'
        await w.vm.$nextTick()
        await flushPromises()

        expect(listCodiceSessions).toHaveBeenCalledTimes(3)
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(3)
    })

    it('HARNESS-DRAFT-LIST-REFRESH-01 also re-fetches on the draft→real id transition — found live on device, route NAME never changes there', async () => {
        mockState.route.name = 'harness-session'
        mockState.route.params = { id: 'new' }
        const w = await mountScreen()
        expect(listCodiceSessions).toHaveBeenCalledTimes(1)

        listCodiceSessions.mockResolvedValue([fakeSession('brand-new-id', 'Fix the flaky test', NOW)])
        // Same route NAME throughout ('harness-session') — only the id
        // param changes, exactly what HarnessSessionScreen.vue's
        // `router.replace` does after creating the session.
        mockState.route.params = { id: 'brand-new-id' }
        await w.vm.$nextTick()
        await flushPromises()

        expect(listCodiceSessions).toHaveBeenCalledTimes(2)
        expect(w.text()).toContain('Fix the flaky test')
    })

    // 28/8, second increment — rename/delete parity, via the same visible
    // per-row menu Chat/Library already use.
    //
    // ⛔ `TalosRowActions`' menu AND `TalosMobileConfirmDialog` both
    // `Teleport to="body"` — invisible to `wrapper.get()`/`.find()`, which
    // only walks the wrapper's own subtree. Same convention already proven
    // in chatsScreen.test.ts: query `document.body` directly with plain DOM
    // methods for anything inside either layer.
    describe('rename and delete — a real, growing list needs a way to clean it up', () => {
        function menuItem(testId: string): HTMLButtonElement {
            const el = document.body.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
            expect(el, `expected a menu item with data-testid="${testId}" in document.body`).not.toBeNull()
            return el!
        }

        async function openRowMenu(w: ReturnType<typeof mount>, sessionId: string) {
            await w.get(`[data-testid="talos-harness-actions-${sessionId}"]`).trigger('click')
        }

        it('HARNESS-RENAME-02 the dialog input is pre-filled with the current title and submits on Enter', async () => {
            const w = await mountScreen()
            await openRowMenu(w, 'session-a')
            menuItem('talos-harness-action-rename').click()
            await flushPromises()

            const input = document.body.querySelector<HTMLInputElement>(`[aria-label="Session name"]`)
            expect(input).not.toBeNull()
            expect(input!.value).toBe('Refactor auth flow')

            input!.value = 'Renamed live'
            input!.dispatchEvent(new Event('input'))
            input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
            await flushPromises()

            expect(renameCodiceSession).toHaveBeenCalledWith('session-a', 'Renamed live')
            expect(listCodiceSessions).toHaveBeenCalledTimes(2) // mount + post-rename refresh
            w.unmount()
        })

        it('HARNESS-RENAME-03 verso contrario: cancel never calls renameCodiceSession', async () => {
            const w = await mountScreen()
            await openRowMenu(w, 'session-a')
            menuItem('talos-harness-action-rename').click()
            await flushPromises()

            const input = document.body.querySelector<HTMLInputElement>(`[aria-label="Session name"]`)
            input!.value = 'abandoned edit'
            input!.dispatchEvent(new Event('input'))

            const cancel = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Cancel'))
            cancel!.click()
            await flushPromises()

            expect(renameCodiceSession).not.toHaveBeenCalled()
            expect(document.body.querySelector(`[aria-label="Session name"]`)).toBeNull()
            w.unmount()
        })

        it('HARNESS-DELETE-01 deletes through the confirmation and refreshes the list', async () => {
            const w = await mountScreen()
            await openRowMenu(w, 'session-b')
            menuItem('talos-harness-action-delete').click()
            await flushPromises()

            const dialog = document.body.querySelector('[role="dialog"]')
            expect(dialog?.textContent).toContain('Fix mobile composer') // named in the confirmation body
            listCodiceSessions.mockResolvedValue([fakeSession('session-a', 'Refactor auth flow', NOW)])
            menuItem('talos-harness-delete-confirm').click()
            await flushPromises()

            expect(deleteCodiceSession).toHaveBeenCalledWith('session-b')
            expect(listCodiceSessions).toHaveBeenCalledTimes(2)
            w.unmount()
        })

        it('HARNESS-DELETE-02 verso contrario: cancel never calls deleteCodiceSession', async () => {
            const w = await mountScreen()
            await openRowMenu(w, 'session-a')
            menuItem('talos-harness-action-delete').click()
            await flushPromises()

            const cancel = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Cancel'))
            cancel!.click()
            await flushPromises()

            expect(deleteCodiceSession).not.toHaveBeenCalled()
            w.unmount()
        })

        it('HARNESS-ACTION-ERROR-01 a real failure stays visible instead of failing silently', async () => {
            renameCodiceSession.mockRejectedValue(new Error('disk full'))
            const w = await mountScreen()
            await openRowMenu(w, 'session-a')
            menuItem('talos-harness-action-rename').click()
            await flushPromises()

            const input = document.body.querySelector<HTMLInputElement>(`[aria-label="Session name"]`)
            input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
            await flushPromises()

            expect(w.text()).toContain('disk full')
            w.unmount()
        })
    })
})
