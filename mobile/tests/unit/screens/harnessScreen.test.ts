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
    routerReplace: vi.fn(),
    // K4-E: l'APK porta r4? Di serie no (come il web e le build senza archivio)
    r4: false,
    // ELENCO-R4-PAG-05: l'APK porta r4 ma r4 non si accende
    r4NonParte: false,
    route: { name: 'harness' as string, params: {} as Record<string, string>, query: {} as Record<string, string> },
}))
vi.mock('@/lib/harness/terminalePonte', async (originale) => ({
    ...(await originale<typeof import('@/lib/harness/terminalePonte')>()),
    talosR4Disponibile: async () => mockState.r4,
    talosR4Pronto: async () => (mockState.r4 && !mockState.r4NonParte ? { disponibile: true, acceso: true, cartella: '/lavoro' } : null),
}))
// `reactive()` needs the real `vue` import bound, which `vi.hoisted`'s
// factory runs BEFORE (its whole body is relocated above every import,
// including `vue` itself) — wrapped here instead, a normal statement that
// still runs before any test body ever calls `useRoute()`.
mockState.route = reactive(mockState.route)
vi.mock('vue-router', () => ({
    useRoute: () => mockState.route,
    useRouter: () => ({ push: mockState.routerPush, replace: mockState.routerReplace }),
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

// Owner 18/10 «la lista delle sessioni … esattamente come sulla chat Legacy»: con r4 la pagina elenca le sessioni di r4
const r4 = vi.hoisted(() => ({ leggi: vi.fn(), rinomina: vi.fn(), elimina: vi.fn() }))
// review 18/10: la frase dei rifiuti e la classe restano quelle vere, si fingono solo le chiamate a r4
vi.mock('@/lib/harness/r4/elencoSessioniR4', async (originale) => ({
    ...(await originale<typeof import('@/lib/harness/r4/elencoSessioniR4')>()),
    leggiSessioniR4: r4.leggi, rinominaSessioneR4: r4.rinomina, eliminaSessioneR4: r4.elimina,
}))
vi.mock('@/lib/harness/r4/clienteR4', () => ({ talosClienteR4: () => ({ richiesta: vi.fn() }) }))
const rigaR4 = (id: string, title: string, stato: Record<string, unknown> = {}) => ({
    id, title, updated_at: NOW,
    stato: { conclusa: true, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: 'successo', ...stato },
})

// UI-111 (CODICE-LISTE-03): i PC collegati, solo per le prove che li accendono; le altre usano il modulo vero, com'era
const remotiFinti = vi.hoisted(() => ({
    attivi: false,
    pcs: [] as Array<{ pcId: string, nome: string | null, relay: string | null, accoppiatoAlle: number }>,
    righe: {} as Record<string, unknown[]>,
}))
vi.mock('@/lib/remoto/computerRemoti', async (originale) => {
    const vero = await originale<typeof import('@/lib/remoto/computerRemoti')>()
    const { ref } = await import('vue')
    return {
        ...vero,
        useComputerRemoti: () => {
            if (!remotiFinti.attivi) return vero.useComputerRemoti()
            const elenco = ref<typeof remotiFinti.pcs>([])
            return {
                elenco,
                aggiorna: vi.fn(async () => { elenco.value = remotiFinti.pcs }),
                riepilogo: vi.fn(async (pcId: string) => ({ inLinea: true, conteggi: { totale: 0, inCorso: 0, aspettaTe: 0 }, righe: remotiFinti.righe[pcId] ?? [] })),
            }
        },
    }
})

import HarnessScreen from '@/screens/HarnessScreen.vue'
import { doveDelCodice } from '@/lib/remoto/doveDelCodice'
import { __resetTalosTabletLayoutForTests, useTalosTabletLayout } from '@/composables/useTalosTabletLayout'

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
    r4.leggi.mockReset()
    r4.leggi.mockResolvedValue([rigaR4('r4-a', 'Gestore di attività'), rigaR4('r4-b', 'Leggi NOTA.md')])
    r4.rinomina.mockReset(); r4.rinomina.mockResolvedValue(undefined)
    r4.elimina.mockReset(); r4.elimina.mockResolvedValue(undefined)
    mockState.routerReplace.mockReset()
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
    it('K4E-01 → ELENCO-R4-PAG-01 (owner 18/10): con r4 la voce «Codice» resta sull\'elenco, non rimanda più a r4', async () => {
        mockState.r4 = true
        try {
            const w = await mountScreen()
            await flushPromises()
            expect(mockState.routerReplace).not.toHaveBeenCalled()
            expect(listCodiceSessions).not.toHaveBeenCalled()
            expect(w.findAll('[data-testid="talos-harness-row"]').map((r) => r.text())).toEqual([
                expect.stringContaining('Gestore di attività'), expect.stringContaining('Leggi NOTA.md'),
            ])
        } finally {
            mockState.r4 = false
        }
    })

    it('ELENCO-R4-PAG-02: una riga apre la sessione su r4, «Nuova» apre r4 vuoto', async () => {
        mockState.r4 = true
        try {
            const w = await mount(HarnessScreen, { attachTo: document.body, props: { embedded: true } })
            await flushPromises(); await flushPromises()
            await w.findAll('[data-testid="talos-harness-row"]')[1]!.trigger('click')
            expect(mockState.routerPush).toHaveBeenLastCalledWith({ name: 'codice-r4', params: { id: 'r4-b' } })
            await w.get('[data-testid="talos-harness-new"]').trigger('click')
            expect(mockState.routerPush).toHaveBeenLastCalledWith({ name: 'codice-r4' })
        } finally {
            mockState.r4 = false
        }
    })

    it('ELENCO-R4-PAG-03: la riga della sessione aperta su r4 è quella attiva; lo stato viene da r4', async () => {
        mockState.r4 = true
        mockState.route = reactive({ name: 'codice-r4', params: { id: 'r4-b' }, query: {} })
        r4.leggi.mockResolvedValue([rigaR4('r4-a', 'Gestore di attività', { conclusa: false }), rigaR4('r4-b', 'Leggi NOTA.md', { inAttesaApprovazione: true })])
        try {
            const w = await mountScreen()
            await flushPromises()
            const righe = w.findAll('[data-testid="talos-harness-row"]')
            expect(righe.map((r) => r.attributes('data-harness-active'))).toEqual([undefined, 'true'])
            expect(w.findAll('[data-testid="talos-harness-row-status"]').map((s) => s.attributes('data-harness-status'))).toEqual(['running', 'waiting-approval'])
        } finally {
            mockState.r4 = false
        }
    })

    it('ELENCO-R4-PAG-05: r4 nell APK ma non parte: si torna al Codice classico col ripiego, e intanto si vede il suo elenco', async () => {
        mockState.r4 = true
        mockState.r4NonParte = true
        try {
            const w = await mountScreen()
            await flushPromises()
            expect(mockState.routerReplace).toHaveBeenCalledWith({ name: 'harness', query: { ripiego: '1' } })
            expect(r4.leggi).not.toHaveBeenCalled()
            expect(w.findAll('[data-testid="talos-harness-row"]').map((r) => r.text())).toEqual([
                expect.stringContaining('Refactor auth flow'), expect.stringContaining('Fix mobile composer'),
            ])
        } finally {
            mockState.r4 = false
            mockState.r4NonParte = false
        }
    })

    /*
     * ⛔ ELENCO-R4-PAG-06 — visto sul Pad (18/10): 4 sessioni r4 col cerchio «In corso» mentre non girava niente. Erano interrotte
     * (`interrotta: true`, non concluse: r4 le ha trovate a metà dopo un riavvio). Con r4 vale l'ordine del desktop (`statoSessione()`,
     * harness-ui `app.js`): attesa, poi interrotta, poi in corso. E l'attesa è di qualunque tipo (domanda, piano…): «Aspetta te».
     */
    it('ELENCO-R4-PAG-06: con r4 una sessione interrotta e non conclusa è interrotta, non in corso; ogni attesa è «Aspetta te»', async () => {
        mockState.r4 = true
        r4.leggi.mockResolvedValue([
            rigaR4('r4-a', 'Interrotta a metà', { conclusa: false, interrotta: true, ultimoEsito: null }),
            rigaR4('r4-b', 'Domanda in sospeso', { conclusa: false, interrotta: true, inAttesaApprovazione: true }),
            rigaR4('r4-c', 'Gira davvero', { conclusa: false }),
        ])
        try {
            const w = await mountScreen()
            await flushPromises()
            const stati = w.findAll('[data-testid="talos-harness-row-status"]')
            expect(stati.map((s) => s.attributes('data-harness-status'))).toEqual(['interrupted', 'waiting-approval', 'running'])
            expect(stati[1]!.text()).toBe('Waiting for you')
        } finally {
            mockState.r4 = false
        }
    })

    /*
     * ⛔ «Ferma tutto», «Elenco» (owner 29/10/2026 sera; scheda `mockup/ferma-tutto/pezzi/SCHEDA-DI-CONSEGNA.md`, voce 8): una sessione r4
     * finita con agenti al lavoro sotto sta «In corso» e la riga lo dice («2 agents working», col segno di chi lavora); finiti tutti torna
     * com'era; «Aspetta te» resta (dice di più).
     */
    it('ELENCO-AGENTI-01 finita con 2 agenti al lavoro: «2 agents working» col segno vivo, scheda «In progress»', async () => {
        mockState.r4 = true
        r4.leggi.mockResolvedValue([{ ...rigaR4('r4-a', 'Prepara la release'), agentiAlLavoro: 2 }, rigaR4('r4-b', 'Leggi NOTA.md')])
        try {
            const w = await mountScreen()
            await flushPromises()
            const riga = w.get('[data-harness-session-id="r4-a"]')
            const stato = riga.get('[data-testid="talos-harness-row-status"]')
            expect(stato.attributes('data-harness-status')).toBe('running')
            expect(riga.get('[data-testid="talos-harness-row-status-label"]').text()).toBe('2 agents working')
            expect(riga.find('.animate-spin').exists()).toBe(true)
            const testi = w.findAll('[data-testid^="talos-harness-filter-"]').map((s) => s.text())
            expect(testi).toEqual(['All2', 'In progress1', 'Waiting for you0', 'Finished1', 'To resume0', 'Interrupted0'])
            // uno solo: il singolare
            r4.leggi.mockResolvedValue([{ ...rigaR4('r4-a', 'Prepara la release'), agentiAlLavoro: 1 }])
            const w1 = await mountScreen()
            await flushPromises()
            expect(w1.get('[data-harness-session-id="r4-a"] [data-testid="talos-harness-row-status-label"]').text()).toBe('1 agent working')
        } finally {
            mockState.r4 = false
        }
    })

    it("ELENCO-AGENTI-02 finiti gli agenti la riga torna com'era: l'ora, «Finished», nessun segno vivo", async () => {
        mockState.r4 = true
        r4.leggi.mockResolvedValue([rigaR4('r4-a', 'Prepara la release')])
        try {
            const w = await mountScreen()
            await flushPromises()
            const riga = w.get('[data-harness-session-id="r4-a"]')
            expect(riga.get('[data-testid="talos-harness-row-status"]').attributes('data-harness-status')).toBe('idle')
            expect(riga.find('.animate-spin').exists()).toBe(false)
            expect(w.get('[data-testid="talos-harness-filter-concluse"]').text()).toBe('Finished1')
        } finally {
            mockState.r4 = false
        }
    })

    it('ELENCO-AGENTI-03 «Aspetta te» resta anche con agenti al lavoro', async () => {
        mockState.r4 = true
        r4.leggi.mockResolvedValue([{ ...rigaR4('r4-a', 'Prepara la release', { inAttesaApprovazione: true }), agentiAlLavoro: 2 }])
        try {
            const w = await mountScreen()
            await flushPromises()
            const stato = w.get('[data-harness-session-id="r4-a"] [data-testid="talos-harness-row-status"]')
            expect(stato.attributes('data-harness-status')).toBe('waiting-approval')
            expect(stato.text()).toBe('Waiting for you')
            expect(w.get('[data-testid="talos-harness-filter-aspettano-te"]').text()).toBe('Waiting for you1')
        } finally {
            mockState.r4 = false
        }
    })

    it('ELENCO-R4-PAG-04: rinomina ed elimina passano per r4; col ripiego resta l\'elenco del Codice classico', async () => {
        mockState.r4 = true
        try {
            const w = await mountScreen()
            await flushPromises()
            await w.get('[data-testid="talos-harness-actions-r4-a"]').trigger('click')
            ;(document.querySelector('[data-testid="talos-harness-action-rename"]') as HTMLElement).click()
            await flushPromises()
            const campo = document.querySelector('input[aria-label="Session name"]') as HTMLInputElement
            campo.value = 'Nome nuovo'; campo.dispatchEvent(new Event('input'))
            campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
            await flushPromises()
            expect(r4.rinomina).toHaveBeenCalledWith(expect.anything(), 'r4-a', 'Nome nuovo')
            expect(renameCodiceSession).not.toHaveBeenCalled()
            await w.get('[data-testid="talos-harness-actions-r4-b"]').trigger('click')
            ;(document.querySelector('[data-testid="talos-harness-action-delete"]') as HTMLElement).click()
            await flushPromises()
            ;(document.querySelector('[data-testid="talos-harness-delete-confirm"]') as HTMLElement).click()
            await flushPromises()
            expect(r4.elimina).toHaveBeenCalledWith(expect.anything(), 'r4-b')
            expect(deleteCodiceSession).not.toHaveBeenCalled()

            mockState.route = reactive({ name: 'harness', params: {}, query: { ripiego: '1' } })
            r4.leggi.mockClear()
            await mountScreen()
            expect(r4.leggi).not.toHaveBeenCalled()
            expect(listCodiceSessions).toHaveBeenCalled()
        } finally {
            mockState.r4 = false
        }
    })

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

    /*
     * CODICE-ATTESA-01 — owner 29/10 sera, mockup «Caricamenti vivi» v6 (D2/D3): mentre l'elenco si legge la pagina non resta muta,
     * mostra la carta della Chat con «Caricamento sessioni…» (r4 può metterci fino a ~20 s, REV-ELENCO-03).
     * ⛔ Solo la pagina: nella colonna del tablet (`embedded`) un velo a tutto schermo coprirebbe anche la sessione aperta accanto.
     */
    it('CODICE-ATTESA-01 mentre l\'elenco si legge c\'è la carta della Chat; a lettura finita se ne va', async () => {
        let leggi: (righe: unknown[]) => void = () => {}
        listCodiceSessions.mockReturnValue(new Promise((r) => { leggi = r }))
        const w = await mountScreen()
        const carta = w.find('[data-testid="talos-harness-loading"]')
        expect(carta.exists()).toBe(true)
        // E2 (owner 29/10 notte): senza i puntini, come «Caricamento chat» e «Caricamento Libreria»
        expect(carta.get('[role="status"]').attributes('aria-label')).toBe('Loading sessions')
        expect(w.find('[data-testid="talos-harness-empty"]').exists()).toBe(false)
        leggi([fakeSession('session-a', 'Refactor auth flow', NOW)])
        await flushPromises()
        expect(w.find('[data-testid="talos-harness-loading"]').exists()).toBe(false)
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(1)
    })

    it('CODICE-ATTESA-01 AL CONTRARIO: nella colonna del tablet niente velo; con l\'elenco già a schermo una rilettura non lo copre', async () => {
        listCodiceSessions.mockReturnValue(new Promise(() => {}))
        // E1 (owner 29/10 notte): la riga piccola solo quando accanto c'è già una sessione aperta (CODICE-ATTESA-02)
        mockState.route.name = 'harness-session'
        const colonna = mount(HarnessScreen, { attachTo: document.body, props: { embedded: true } })
        await flushPromises()
        expect(colonna.find('[data-testid="talos-harness-loading"]').exists()).toBe(false)
        // owner 29/10 notte («Sì, la riga piccola in cima»): la colonna non resta muta, ha la riga in corso con la rotella arancione
        const riga = colonna.get('[data-testid="talos-harness-loading-row"] [data-testid="talos-riga-in-corso"]')
        expect(riga.text()).toContain('Loading sessions')
        expect(riga.find('[data-testid="talos-riga-in-corso-giro"]').classes()).toContain('text-[var(--talos-accent)]')
        colonna.unmount()

        mockState.route.name = 'harness'
        listCodiceSessions.mockResolvedValue([fakeSession('session-a', 'Refactor auth flow', NOW)])
        const w = await mountScreen()
        listCodiceSessions.mockReturnValue(new Promise(() => {}))
        mockState.route.name = 'harness-session'
        await w.vm.$nextTick()
        mockState.route.name = 'harness'
        await w.vm.$nextTick()
        await flushPromises()
        expect(listCodiceSessions.mock.calls.length).toBeGreaterThan(1)
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(1)
        expect(w.find('[data-testid="talos-harness-loading"]').exists()).toBe(false)
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

    // ⛔ owner 16/10 («levare l'icona, quella tipo provetta, non ha più senso»; scelta «Niente, come le chat»): la casella da 48 px
    // con la provetta era uguale per ogni sessione e non diceva niente. Come le righe delle chat: titolo e stato, a tutta larghezza.
    it('HARNESS-ROW-NO-ICON-01 la riga è il titolo e lo stato, senza la casella della provetta', async () => {
        const w = mount(HarnessScreen, { props: { embedded: true } })
        await flushPromises()
        const righe = w.findAll('[role="listitem"]')
        expect(righe).toHaveLength(2)
        for (const riga of righe) {
            expect(riga.find('.lucide-flask-conical').exists()).toBe(false)
            expect(riga.find('span[aria-hidden="true"].size-12').exists()).toBe(false)
            expect(riga.element.firstElementChild?.getAttribute('data-testid')).toBe('talos-harness-row')
        }
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
            // owner 29/10 sera: «In progress» ovunque in inglese, come la scheda e la Board del PC
            expect(status.textContent).toContain('In progress')
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
            // 23/10 sera (Desktop, «stesso stato, stessa veste»): l'interrotta non è un allarme. Niente rosso, la veste quieta
            // della Chat (`TalosMobileStatoChat`: CircleDashed, muted), come il pallino senza colore del desktop.
            expect(status.className).not.toContain('danger')
            expect(status.className).toContain('var(--talos-muted)')
            expect(status.querySelector('svg')?.getAttribute('class')).toContain('lucide-circle-dashed')
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
            // owner 23/10 sera, esteso al Codice dal Desktop («stesso stato, stessa parola»): l'ultimo giro finito in errore si
            // può riprendere scrivendo nella stessa sessione, quindi «To resume», l'icona di Riprendi e il tono d'attenzione, non rosso
            expect(status.textContent?.trim()).toBe('To resume')
            expect(status.querySelector('svg')?.getAttribute('class')).toContain('lucide-rotate-ccw')
            expect(status.className).toContain('var(--talos-warning)')
            expect(status.className).not.toContain('danger')
        })

        it('⛔ HARNESS-STATUS-PRECEDENCE-01 AL CONTRARIO: "interrotta" vince su "errore" — un crash è un tipo di interruzione', async () => {
            fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map([
                ['session-a', { conclusa: true, interrotta: true, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: 'errore' }],
            ]))
            const w = await mountScreen()
            const status = w.get('[data-harness-session-id="session-a"]').element.closest('[role="listitem"]')!.querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('interrupted')
        })

        // ELENCO-R4-PAG-06 cambia l'ordine solo per r4: nel Codice classico una sessione che riparte non è più interrotta (2/9)
        it('HARNESS-STATUS-PRECEDENCE-02 nel Codice classico "in corso" vince ancora su "interrotta"', async () => {
            fetchTalosHarnessSessionsStatus.mockResolvedValue(new Map([
                ['session-a', { conclusa: false, interrotta: true, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: null }],
            ]))
            const w = await mountScreen()
            const status = w.get('[data-harness-session-id="session-a"]').element.closest('[role="listitem"]')!.querySelector('[data-testid="talos-harness-row-status"]')!
            expect(status.getAttribute('data-harness-status')).toBe('running')
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

            // D-MOCK-10 (24/10/2026): DENTRO il dialogo rimasto aperto, non dietro di lui nella lista sfocata
            expect(document.body.querySelector('[role="dialog"] [data-testid="talos-harness-dialog-error"]')?.textContent).toContain('disk full')
            expect(w.text()).not.toContain('disk full')
            w.unmount()
        })

        /*
         * ⛔ HARNESS-ESCAPE-01 (15/10/2026, owner «Spento solo dove serve»): `escapeParameter` è acceso su tutta l'app e un titolo
         * con l'apostrofo arrivava come «L&apos;IVA» nell'etichetta del menu e nella conferma; un errore con una barra come
         * `&#x2F;`. Vue protegge già testo e attributi: qui il testo libero passa da `tTesto`, che spegne l'escape per quella chiamata.
         */
        it('HARNESS-ESCAPE-01 titolo e dettaglio con apostrofi, virgolette, barre e «&» restano come sono', async () => {
            const titolo = `L'IVA di "marzo" 3/4 & co <b>`
            listCodiceSessions.mockResolvedValue([fakeSession('session-x', titolo, NOW)])
            deleteCodiceSession.mockRejectedValue(new Error("can't remove /data/x & y"))
            const w = await mountScreen()
            expect(w.get('[data-testid="talos-harness-actions-session-x"]').attributes('aria-label')).toBe(`Actions for ${titolo}`)
            await openRowMenu(w, 'session-x')
            menuItem('talos-harness-action-delete').click()
            await flushPromises()
            const dialog = document.body.querySelector('[role="dialog"]')
            expect(dialog?.textContent).toContain(`"${titolo}" will be removed from this device.`)
            menuItem('talos-harness-delete-confirm').click()
            await flushPromises()
            const nelDialogo = () => document.body.querySelector('[role="dialog"] [data-testid="talos-harness-dialog-error"]')?.textContent ?? ''
            expect(nelDialogo()).toContain("can't remove /data/x & y")
            ;[...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent?.includes('Cancel'))!.click()
            await flushPromises()
            renameCodiceSession.mockRejectedValue(new Error(`l'archivio "a/b" è pieno`))
            await openRowMenu(w, 'session-x')
            menuItem('talos-harness-action-rename').click()
            await flushPromises()
            document.body.querySelector<HTMLInputElement>('[aria-label="Session name"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
            await flushPromises()
            expect(nelDialogo()).toContain(`Couldn't rename the session: l'archivio "a/b" è pieno`)
            expect(`${w.html()} ${document.body.innerHTML}`).not.toMatch(/&amp;apos;|&amp;#x2F;|&amp;quot;/u)
            w.unmount()
        })
    })
})

/*
 * ⛔ Review avversariale della v0.1.42 (owner 18/10: «voglio che questa versione sia estremamente robusta»), ledger
 * `LEDGER-ELENCO-SESSIONI-R4-2026-10-18.md`, sezione «Review avversariale». Ogni prova nomina il difetto che ha trovato.
 */
describe('elenco delle sessioni r4: review avversariale (REV-ELENCO)', () => {
    const conR4 = async (corpo: () => Promise<void>) => {
        mockState.r4 = true
        try { await corpo() } finally { mockState.r4 = false; mockState.r4NonParte = false }
    }

    it('REV-ELENCO-01 il perché di un rifiuto di r4 si legge in italiano, dal motivo (non «Invalid query»)', () => conR4(async () => {
        const { RifiutoSessioneR4 } = await import('@/lib/harness/r4/elencoSessioniR4')
        r4.elimina.mockRejectedValue(new RifiutoSessioneR4('Operation failed', 'SESSION_STILL_RUNNING', 'running-stop-before-delete'))
        const w = await mountScreen()
        await w.get('[data-testid="talos-harness-actions-r4-a"]').trigger('click')
        ;(document.querySelector('[data-testid="talos-harness-action-delete"]') as HTMLElement).click()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-harness-delete-confirm"]') as HTMLElement).click()
        await flushPromises()
        expect(document.body.textContent).toContain('Session still running — stop it before deleting it')
        expect(document.body.textContent).not.toContain('Operation failed')
    }))

    it('REV-ELENCO-02 r4 che non risponde si dice a parole, non col codice TALOS_R4_IRRAGGIUNGIBILE', () => conR4(async () => {
        r4.leggi.mockRejectedValue(new Error('TALOS_R4_IRRAGGIUNGIBILE'))
        const w = await mountScreen()
        expect(w.text()).not.toContain('TALOS_R4_IRRAGGIUNGIBILE')
        expect(w.get('[role="alert"]').text()).toContain('Code is not responding yet')
    }))

    /*
     * ⛔ D-0145-2/3 (Desktop, prova dal vivo 25/10 notte): sul Pad con due TALOS (ai.talos e la copia affiancata ai.talos.dev) l'r4
     * dell'una teneva la porta e l'altra ci parlava col suo segreto: 401 AUTH_REQUIRED e la frase INGLESE del server dentro quella
     * italiana. La causa si cura dando alla copia la sua porta (`TalosR4Avvio.portaPer`); qui la frase dice cosa fare.
     */
    it('REV-ELENCO-08 AUTH_REQUIRED dell\'r4 del dispositivo: un\'altra app TALOS lo sta usando, mai l\'inglese del server', () => conR4(async () => {
        const { RifiutoSessioneR4 } = await import('@/lib/harness/r4/elencoSessioniR4')
        r4.leggi.mockRejectedValue(new RifiutoSessioneR4('This server only accepts the TALOS window that started it', 'AUTH_REQUIRED', ''))
        const w = await mountScreen()
        expect(w.text()).not.toContain('only accepts the TALOS window')
        expect(w.get('[role="alert"]').text()).toContain('Sessions did not load: another TALOS app on this device is using Code. Close it from Settings › Apps and try again.')
    }))

    it('REV-ELENCO-09 un rifiuto di r4 con un codice senza frase non passa mai il suo inglese', () => conR4(async () => {
        const { RifiutoSessioneR4 } = await import('@/lib/harness/r4/elencoSessioniR4')
        r4.leggi.mockRejectedValue(new RifiutoSessioneR4('Something internal exploded', 'CODICE_MAI_VISTO', ''))
        const w = await mountScreen()
        expect(w.text()).not.toContain('Something internal exploded')
        expect(w.get('[role="alert"]').text()).toContain('the Code engine refused the request. Try again.')
    }))

    it('REV-ELENCO-03 una lettura vecchia che arriva dopo una nuova non rimette l\'elenco vecchio', () => conR4(async () => {
        let finisciVecchia: (righe: unknown) => void = () => {}
        r4.leggi.mockImplementationOnce(() => new Promise((ok) => { finisciVecchia = ok }))
        r4.leggi.mockResolvedValueOnce([rigaR4('nuova', 'Dopo')])
        const w = mount(HarnessScreen, { attachTo: document.body })
        await flushPromises()
        mockState.route.name = 'codice-r4'
        mockState.route.params = { id: 'nuova' }
        await flushPromises()
        finisciVecchia([rigaR4('vecchia', 'Prima')])
        await flushPromises()
        expect(w.findAll('[data-testid="talos-harness-row"]').map((r) => r.attributes('data-harness-session-id'))).toEqual(['nuova'])
    }))

    it('REV-ELENCO-04 l\'elenco nella colonna non avvisa e non sposta la rotta se r4 non parte: lo fa la pagina, una volta', () => conR4(async () => {
        mockState.r4NonParte = true
        const { useTalosMobileToasts } = await import('@/stores/toasts')
        const prima = useTalosMobileToasts().items.value.length
        mount(HarnessScreen, { attachTo: document.body, props: { embedded: true } })
        await flushPromises()
        expect(mockState.routerReplace).not.toHaveBeenCalled()
        expect(useTalosMobileToasts().items.value.length).toBe(prima)
    }))

    it('REV-ELENCO-05 un errore di lettura sparisce quando l\'elenco poi si carica', () => conR4(async () => {
        r4.leggi.mockRejectedValueOnce(new Error('TALOS_R4_IRRAGGIUNGIBILE'))
        const w = await mountScreen()
        expect(w.find('[role="alert"]').exists()).toBe(true)
        mockState.route.params = { id: 'altra' }
        mockState.route.name = 'codice-r4'
        await flushPromises()
        expect(w.find('[role="alert"]').exists()).toBe(false)
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(2)
    }))

    it('REV-ELENCO-06 il nome di una sessione r4 si ferma a 80 caratteri, come vuole r4', () => conR4(async () => {
        const w = await mountScreen()
        await w.get('[data-testid="talos-harness-actions-r4-a"]').trigger('click')
        ;(document.querySelector('[data-testid="talos-harness-action-rename"]') as HTMLElement).click()
        await flushPromises()
        expect((document.querySelector('input[aria-label="Session name"]') as HTMLInputElement).maxLength).toBe(80)
    }))

    it('REV-ELENCO-07 rinomina ed eliminazione si annunciano; un annuncio da fuori (il titolo della sessione) rilegge l\'elenco', () => conR4(async () => {
        const { talosCambiSessioniR4 } = await import('@/lib/harness/r4/avvisiSessioniR4')
        const w = await mountScreen()
        await w.get('[data-testid="talos-harness-actions-r4-a"]').trigger('click')
        ;(document.querySelector('[data-testid="talos-harness-action-rename"]') as HTMLElement).click()
        await flushPromises()
        const campo = document.querySelector('input[aria-label="Session name"]') as HTMLInputElement
        campo.value = 'Nome nuovo'; campo.dispatchEvent(new Event('input'))
        campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        await flushPromises()
        expect(talosCambiSessioniR4.value).toMatchObject({ id: 'r4-a', nome: 'Nome nuovo', eliminata: false })
        await w.get('[data-testid="talos-harness-actions-r4-b"]').trigger('click')
        ;(document.querySelector('[data-testid="talos-harness-action-delete"]') as HTMLElement).click()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-harness-delete-confirm"]') as HTMLElement).click()
        await flushPromises()
        expect(talosCambiSessioniR4.value).toMatchObject({ id: 'r4-b', eliminata: true })
        const letture = r4.leggi.mock.calls.length
        const { annunciaCambioSessioneR4 } = await import('@/lib/harness/r4/avvisiSessioniR4')
        annunciaCambioSessioneR4({ id: 'r4-a', nome: 'Dal titolo' })
        await flushPromises()
        expect(r4.leggi.mock.calls.length).toBeGreaterThan(letture)
    }))
})

describe('elenco delle sessioni r4: lo stato vivo si aggiorna (REV-ELENCO-10)', () => {
    /*
     * ⛔ REV-ELENCO-10 (review avversariale v0.1.42): una riga «In corso» (un'automazione, un giro lasciato a metà) restava ferma
     * finché non si cambiava pagina. Come il battito del desktop per le figlie (`legacy/app.js:11666`, 5 s), l'elenco si rilegge
     * ogni 5 s solo finché una riga lavora o aspetta, e mai con l'app in sottofondo.
     */
    it('REV-ELENCO-10 con una riga che lavora l\'elenco si rilegge ogni 5 s; senza, o con l\'app nascosta, no', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        mockState.r4 = true
        try {
            r4.leggi.mockResolvedValue([rigaR4('r4-a', 'Lavora', { conclusa: false })])
            const w = mount(HarnessScreen, { attachTo: document.body })
            await flushPromises()
            const prima = r4.leggi.mock.calls.length
            vi.advanceTimersByTime(5000)
            await flushPromises()
            expect(r4.leggi.mock.calls.length).toBe(prima + 1)
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
            vi.advanceTimersByTime(5000)
            await flushPromises()
            expect(r4.leggi.mock.calls.length).toBe(prima + 1)
            Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
            r4.leggi.mockResolvedValue([rigaR4('r4-a', 'Finita')])
            vi.advanceTimersByTime(5000)
            await flushPromises()
            const dopoFinita = r4.leggi.mock.calls.length
            vi.advanceTimersByTime(15000)
            await flushPromises()
            expect(r4.leggi.mock.calls.length).toBe(dopoFinita)
            w.unmount()
        } finally {
            mockState.r4 = false
            vi.useRealTimers()
            Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        }
    })
})

/*
 * ⛔ UI-111 «Liste coerenti» (mockup v2.1 approvato dall'owner il 29/10 sera; ledger `LEDGER-LISTE-COERENTI-MOBILE-2026-10-29.md`,
 * voce 5): il Codice nella grammatica delle Chat. In cima la testa delle sezioni a elenco (`TalosMobileElencoTesta`): titolo, frase,
 * «+» sul telefono, ricerca, «Opzioni» col numero dei filtri accesi, le schede degli stati veri coi numeri, il conteggio. «Dove» e
 * «Ordina» stanno nel foglio «Opzioni»; la pillola galleggiante se ne va. Righe e menu ⋯ restano quelli di prima; nella colonna del
 * tablet (`embedded`) la testa non c'è.
 */
describe('UI-111 il Codice nella grammatica delle Chat', () => {
    const FASCIA_DELLE_CHAT = 'px-2 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)] landscape:pb-0.5 landscape:pt-1.5'
    const stati = new Map([
        ['session-a', { conclusa: false, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: null }],
        ['session-b', { conclusa: true, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: 'errore' }],
    ])
    const idDelleRighe = (w: ReturnType<typeof mount>) =>
        w.findAll('[data-testid="talos-harness-row"]').map((r) => r.attributes('data-harness-session-id'))

    beforeEach(() => {
        doveDelCodice.value = null
        remotiFinti.attivi = false
        remotiFinti.pcs = []
        remotiFinti.righe = {}
        __resetTalosTabletLayoutForTests()
    })

    it('CODICE-LISTE-01 la testa delle Chat: titolo, frase, «+» sul telefono, schede degli stati coi numeri, conteggio; niente pillola', async () => {
        fetchTalosHarnessSessionsStatus.mockResolvedValue(stati)
        const w = await mountScreen()
        await flushPromises()
        expect(w.get('[data-testid="talos-harness-subtitle"]').text()).toBe('Your code sessions, here and on your computers.')
        expect(w.find('[data-testid="talos-new-chat-fab"]').exists()).toBe(false)
        const piu = w.get('[data-testid="talos-harness-new"]')
        expect(piu.element.closest('header')).not.toBeNull()
        expect(piu.attributes('aria-label')).toBe('New Code session')
        await piu.trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'new' } })

        const schede = w.get('[data-testid="talos-harness-filters"]')
        expect(schede.attributes()).toMatchObject({ role: 'radiogroup', 'aria-label': 'Session status' })
        const testi = w.findAll('[data-testid^="talos-harness-filter-"]').map((s) => s.text())
        expect(testi).toEqual(['All2', 'In progress1', 'Waiting for you0', 'Finished0', 'To resume1', 'Interrupted0'])
        expect(w.get('[data-testid="talos-harness-count"]').text()).toBe('2 sessions')

        await w.get('[data-testid="talos-harness-filter-da-riprendere"]').trigger('click')
        expect(idDelleRighe(w)).toEqual(['session-b'])
        expect(w.get('[data-testid="talos-harness-count"]').text()).toBe('1 session')
        // la riga resta quella di prima: lo stato, l'etichetta, il menu ⋯
        expect(w.get('[data-testid="talos-harness-row-status"]').attributes('data-harness-status')).toBe('error')
        expect(w.find('[data-testid="talos-harness-actions-session-b"]').exists()).toBe(true)
        // la fascia del giorno ha la classe delle Chat (`ChatsScreen.vue:1070-1073`)
        expect([...w.get('[data-testid="talos-harness-fascia"]').classes()].sort()).toEqual(FASCIA_DELLE_CHAT.split(' ').sort())

        // una scheda senza sessioni lo dice con la frase delle assenze, non con quella dell'elenco vuoto
        await w.get('[data-testid="talos-harness-filter-interrotte"]').trigger('click')
        expect(idDelleRighe(w)).toEqual([])
        expect(w.get('[data-testid="talos-harness-empty"]').text()).toBe('No sessions here.')
    })

    it('CODICE-LISTE-01b sul tablet a tutta pagina «+ Nuova» con l\'etichetta nella riga degli strumenti', async () => {
        useTalosTabletLayout().isTablet.value = true
        mockState.route.name = 'harness-session'
        const w = await mountScreen()
        const nuova = w.get('[data-testid="talos-harness-new"]')
        expect(nuova.element.closest('header')).toBeNull()
        expect(nuova.text()).toBe('New')
        expect(nuova.element.previousElementSibling?.getAttribute('data-testid')).toBe('talos-harness-options')
    })

    // owner 29/10 notte («come le Chat», `ChatsScreen.vue:175-181`): mentre si scrive i numeri delle schede restano, si accorcia l'elenco
    it('CODICE-LISTE-02 la ricerca guarda titolo e cartella, senza maiuscole né accenti; i numeri delle schede NON la seguono', async () => {
        listCodiceSessions.mockResolvedValue([
            fakeSession('session-a', 'Refactor auth flow', NOW),
            fakeSession('session-b', 'Città del composer', NOW),
        ])
        const w = await mountScreen()
        const cerca = w.get('[data-testid="talos-harness-search"]')
        expect(cerca.attributes('placeholder')).toBe('Search sessions')
        await cerca.setValue('CITTA')
        expect(idDelleRighe(w)).toEqual(['session-b'])
        expect(w.get('[data-testid="talos-harness-filter-tutte"]').text()).toBe('All2')
        expect(w.get('[data-testid="talos-harness-filter-concluse"]').text()).toBe('Finished2')
        await cerca.setValue('nessuna di queste')
        expect(idDelleRighe(w)).toEqual([])
        expect(w.get('[data-testid="talos-harness-filter-tutte"]').text()).toBe('All2')
        expect(w.get('[data-testid="talos-harness-empty"]').text()).toBe('No sessions here.')
        await cerca.setValue('')
        expect(idDelleRighe(w)).toEqual(['session-a', 'session-b'])
    })

    it('CODICE-LISTE-03 «Opzioni»: «Ordina» (più e meno recenti) e, con un PC, «Dove» coi numeri; il pulsante conta i filtri accesi', async () => {
        remotiFinti.attivi = true
        remotiFinti.pcs = [{ pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 }]
        // revisione del Desktop (REV-05, M3): due fasce diverse, oggi e un mese fa, così «Meno recenti» deve rovesciare anche le fasce
        const PRIMA = new Date(Date.now() - 40 * 24 * 3600_000).toISOString()
        listCodiceSessions.mockResolvedValue([fakeSession('session-a', 'Refactor auth flow', PRIMA)])
        remotiFinti.righe = { '31ab0001': [rigaR4('pc-1', 'Del PC', NOW)] }
        const w = await mountScreen()
        await flushPromises()
        const fasceDi = () => w.findAll('[data-testid="talos-harness-fascia"]').map((f) => f.text())
        const fascePrima = fasceDi()
        expect(fascePrima).toHaveLength(2)
        // «Dove» non sta più sopra l'elenco: il pulsante e il suo conteggio se ne sono andati nel foglio e nella riga del conteggio
        expect(w.find('[data-testid="talos-codice-dove"]').exists()).toBe(false)
        expect(idDelleRighe(w)).toEqual(['pc-1', 'session-a'])
        const opzioni = w.get('[data-testid="talos-harness-options"]')
        expect(opzioni.attributes('aria-label')).toBe('Session options')
        expect(w.find('[data-testid="talos-harness-options-active"]').exists()).toBe(false)
        await opzioni.trigger('click')
        await flushPromises()
        const foglio = document.body.querySelector('[data-testid="talos-codice-options-sheet"]')
        expect(foglio).not.toBeNull()
        const voci = (gruppo: string) => [...document.body.querySelectorAll(`[data-testid^="talos-codice-${gruppo}-"]`)].map((v) => v.textContent?.trim())
        expect(voci('sort')).toEqual(['Most recent', 'Least recent'])
        expect(voci('dove')).toEqual(['All2', 'Here1', 'UFFICIO1'])

        ;(document.body.querySelector('[data-testid="talos-codice-dove-qui"]') as HTMLElement).click()
        await flushPromises()
        expect(idDelleRighe(w)).toEqual(['session-a'])
        expect(mockState.routerReplace).toHaveBeenCalledWith({ name: 'harness', query: { dove: 'qui' } })
        expect(w.get('[data-testid="talos-harness-options-active"]').text()).toBe('1')
        expect(w.get('[data-testid="talos-harness-options"]').attributes('aria-label')).toBe('Session options, 1 filter on')

        ;(document.body.querySelector('[data-testid="talos-codice-dove-tutte"]') as HTMLElement).click()
        ;(document.body.querySelector('[data-testid="talos-codice-sort-vecchie"]') as HTMLElement).click()
        await flushPromises()
        expect(idDelleRighe(w)).toEqual(['session-a', 'pc-1'])
        expect(fasceDi()).toEqual([...fascePrima].reverse())
        expect(w.get('[data-testid="talos-harness-options-active"]').text()).toBe('1')
    })

    // revisione del Desktop (REV-06, M5): «Dove» che non lascia niente ha la frase delle assenze, non quella dell'elenco vuoto
    it('REV-06 «Qui» senza sessioni del dispositivo ma con quelle del PC: «No sessions here.», non l\'elenco vuoto', async () => {
        remotiFinti.attivi = true
        remotiFinti.pcs = [{ pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 }]
        remotiFinti.righe = { '31ab0001': [rigaR4('pc-1', 'Del PC', NOW)] }
        listCodiceSessions.mockResolvedValue([])
        mockState.route = reactive({ name: 'harness', params: {}, query: { dove: 'qui' } })
        const w = await mountScreen()
        await flushPromises()
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(0)
        expect(w.get('[data-testid="talos-harness-empty"]').text()).toBe('No sessions here.')
        w.unmount()
    })

    // revisione del Desktop (M10): cambiando «Dove» nel foglio la scheda torna a «Tutte», come promette il bozzetto
    it('REV-10 cambiando «Dove» la scheda scelta torna a «Tutte»', async () => {
        remotiFinti.attivi = true
        remotiFinti.pcs = [{ pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 }]
        remotiFinti.righe = { '31ab0001': [rigaR4('pc-1', 'Del PC', NOW, { conclusa: false })] }
        const w = await mountScreen()
        await flushPromises()
        await w.get('[data-testid="talos-harness-filter-in-corso"]').trigger('click')
        expect(w.get('[data-testid="talos-harness-filter-in-corso"]').attributes('aria-checked')).toBe('true')
        await w.get('[data-testid="talos-harness-options"]').trigger('click')
        await flushPromises()
        ;(document.body.querySelector('[data-testid="talos-codice-dove-qui"]') as HTMLElement).click()
        await flushPromises()
        expect(w.get('[data-testid="talos-harness-filter-tutte"]').attributes('aria-checked')).toBe('true')
        expect(idDelleRighe(w)).toEqual(['session-a', 'session-b'])
        w.unmount()
    })

    /*
     * E4 (owner 29/10 notte, «Col nome, come sul tablet»): sul telefono, con «Dove» su un PC, il «+» diventa il pulsante col testo del
     * tablet («Nuova sessione su <PC>», al più due righe): la sessione nasce lì e lo si deve leggere. Su «Tutte» o «Qui», il «+» quadrato.
     */
    it('CODICE-LISTE-05 telefono con «Dove» su un PC: il pulsante col nome del PC; su «Tutte» il «+» quadrato', async () => {
        remotiFinti.attivi = true
        remotiFinti.pcs = [{ pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 }]
        remotiFinti.righe = { '31ab0001': [rigaR4('pc-1', 'Del PC', NOW)] }
        const tutte = await mountScreen()
        await flushPromises()
        const piu = tutte.get('[data-testid="talos-harness-new"]')
        expect(piu.element.closest('header')).not.toBeNull()
        expect(piu.text()).toBe('')
        expect(piu.classes()).toContain('size-12')
        tutte.unmount()

        mockState.route = reactive({ name: 'harness', params: {}, query: { dove: '31ab0001' } })
        const sulPc = await mountScreen()
        await flushPromises()
        const nuova = sulPc.get('[data-testid="talos-harness-new"]')
        expect(nuova.element.closest('header')).toBeNull()
        expect(nuova.text()).toBe('New session on UFFICIO')
        expect(nuova.attributes('aria-label')).toBe('New session on UFFICIO')
        expect(sulPc.get('[data-testid="talos-harness-new-label"]').classes()).toEqual(expect.arrayContaining(['line-clamp-2', 'min-w-0']))
        sulPc.unmount()
    })

    it('CODICE-LISTE-03b senza PC il foglio ha solo «Ordina»', async () => {
        const w = await mountScreen()
        await w.get('[data-testid="talos-harness-options"]').trigger('click')
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-codice-options-sheet"]')).not.toBeNull()
        expect(document.body.querySelector('[data-testid="talos-codice-group-dove"]')).toBeNull()
        expect(document.body.querySelectorAll('[data-testid^="talos-codice-sort-"]')).toHaveLength(2)
    })

    it('CODICE-LISTE-04 nella colonna del tablet niente testa: niente titolo, ricerca, schede né «Opzioni»; «Nuova» resta quella di prima', async () => {
        mockState.route.name = 'harness-session'
        const w = mount(HarnessScreen, { attachTo: document.body, props: { embedded: true } })
        await flushPromises()
        for (const id of ['talos-harness-subtitle', 'talos-harness-search', 'talos-harness-filters', 'talos-harness-options', 'talos-harness-count']) {
            expect(w.find(`[data-testid="${id}"]`).exists(), id).toBe(false)
        }
        expect(w.findAll('h1')).toHaveLength(0)
        expect(w.get('[data-testid="talos-harness-new-label"]').text()).toBe('New')
        expect(idDelleRighe(w)).toEqual(['session-a', 'session-b'])
    })

    /*
     * E1 (owner 29/10 notte, un segno d'attesa per schermo sul tablet): quando aspetta la pagina intera (rotta `harness`, a destra
     * c'è l'elenco a tutta pagina con la sua carta), la colonna non mette la sua riga; quando a destra c'è già una sessione e legge
     * solo la colonna, la riga piccola sì.
     */
    it('CODICE-ATTESA-02 la colonna mette la riga solo se accanto c\'è una sessione; sulla rotta dell\'elenco no', async () => {
        listCodiceSessions.mockReturnValue(new Promise(() => {}))
        const sullElenco = mount(HarnessScreen, { attachTo: document.body, props: { embedded: true } })
        await flushPromises()
        expect(sullElenco.find('[data-testid="talos-harness-loading-row"]').exists()).toBe(false)
        expect(sullElenco.find('[data-testid="talos-harness-loading"]').exists()).toBe(false)
        sullElenco.unmount()

        mockState.route.name = 'codice-r4'
        const accanto = mount(HarnessScreen, { attachTo: document.body, props: { embedded: true } })
        await flushPromises()
        expect(accanto.find('[data-testid="talos-harness-loading-row"]').exists()).toBe(true)
        expect(accanto.find('[data-testid="talos-harness-loading"]').exists()).toBe(false)
        accanto.unmount()
    })
})
