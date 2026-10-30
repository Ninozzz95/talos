// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { aperturaCodiceTablet, riapriCodiceTablet, segnaApertura, talosTabletLeavesChatsRoute } from '@/lib/tabletLayout'

// LISTA-DOPPIA-02/03 montano l'elenco del Codice vero: la rotta, le sessioni e lo stato vivo sono finti, come in `harnessScreen.test.ts`
const finto = vi.hoisted(() => ({
    route: { name: 'harness' as string, params: {} as Record<string, string>, query: {} as Record<string, string> },
    listCodiceSessions: vi.fn(),
}))
vi.mock('vue-router', () => ({
    useRoute: () => finto.route,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/harness/terminalePonte', async (originale) => ({
    ...(await originale<typeof import('@/lib/harness/terminalePonte')>()),
    talosR4Disponibile: async () => false,
    talosR4Pronto: async () => null,
}))
vi.mock('@/lib/harness/codiceSessions', () => ({ listCodiceSessions: finto.listCodiceSessions, renameCodiceSession: vi.fn(), deleteCodiceSession: vi.fn() }))
vi.mock('@/lib/harness/harnessUiSessionStatus', () => ({ fetchTalosHarnessSessionsStatus: vi.fn(async () => new Map()) }))

import HarnessScreen from '@/screens/HarnessScreen.vue'
import { __resetTalosTabletLayoutForTests, useTalosTabletLayout } from '@/composables/useTalosTabletLayout'

/**
 * ⛔⛔ LISTA-DOPPIA-01 — la stessa lista, disegnata due volte, affiancata.
 *
 * ## Fotografato dall'owner il 2026-08-20
 *
 * Tablet in verticale: a sinistra la barra laterale con l'elenco delle chat, a
 * destra — dove va la conversazione — **lo stesso identico elenco**, con la sua
 * intestazione «Chat» e la sua freccia indietro. Venti righe a sinistra, le
 * stesse venti a destra.
 *
 * ## Perché succedeva
 *
 * Sul tablet la barra laterale **è** l'elenco delle chat: c'è sempre. La rotta
 * `chats` disegna quell'elenco nel riquadro principale, e sul telefono è
 * giusto — lì la barra non c'è. Sul tablet le due cose si sommano.
 *
 * ⛔ E il codice lo sapeva già: all'avvio, se la stazione ricordata era
 * `chats` e il dispositivo è un tablet, non la ripristinava — con accanto il
 * commento «sheet right next to the identical panel». Ma quella guardia
 * copriva **solo l'avvio a freddo**. Ci si arriva anche a caldo: dal telefono
 * si tocca «Tutte le chat», poi si allarga la finestra o si ruota, ed eccole
 * due.
 *
 * ⇒ La domanda è una sola e va risposta in un posto solo: su un tablet la
 * rotta `chats` non ha ragione di esistere, perché il pannello la sta già
 * mostrando.
 */

/*
 * ⛔ SUPERATA il 12/09/2026 (owner, B09): la barra laterale Calm mostra SEI
 * recenti, non piu' l'elenco intero — la pagina «Chat» non e' piu' un doppione
 * ma la sola via a ricerca, gruppi e selezione multipla su tablet. La domanda
 * resta pura e provata qui, con la risposta nuova.
 */
describe('LISTA-DOPPIA-01', () => {
    it('12/09: su TABLET la rotta «chats» RESTA — la barra laterale mostra solo sei recenti', () => {
        expect(talosTabletLeavesChatsRoute(true, 'chats')).toBe(false)
    })

    it('⛔ e al contrario, sul TELEFONO resta: lì la barra laterale non c\'è', () => {
        expect(talosTabletLeavesChatsRoute(false, 'chats')).toBe(false)
    })

    it('nessun\'altra rotta viene toccata, su nessuno dei due', () => {
        for (const rotta of ['chat', 'settings', 'research', 'context']) {
            expect(talosTabletLeavesChatsRoute(true, rotta)).toBe(false)
            expect(talosTabletLeavesChatsRoute(false, rotta)).toBe(false)
        }
    })

    it('⛔ una rotta assente non fa decidere niente', () => {
        // Durante il primo giro del router il nome può non esserci ancora, e
        // una redirezione decisa lì porterebbe via da una pagina che la persona
        // non ha ancora visto.
        expect(talosTabletLeavesChatsRoute(true, null)).toBe(false)
        expect(talosTabletLeavesChatsRoute(true, undefined)).toBe(false)
    })
})

/*
 * ⛔ E3 — LISTA-DOPPIA-01 tornata dal lato del Codice (Desktop 29/10 notte, ledger «Amendment 29/10 notte»): sul tablet la rotta nuda
 * `harness` apre l'ultima sessione (`App.vue`, `openDefaultHarnessSession`), ma quell'apertura è asincrona (import dinamici, r4 che si
 * accende). Finché non arriva, il riquadro principale disegnava l'elenco intero accanto a quello della colonna: due elenchi.
 * Revisione del Desktop (F1-F3): sul tablet, a tutta pagina sulla rotta `harness`, l'elenco NON si disegna mai (sta nella colonna).
 * In corso → solo la carta; finita senza sessioni → la frase dell'elenco vuoto; rifiutata → «Codice non si è aperto» con «Riprova»;
 * finita con delle sessioni e senza rimando → vuoto (restano solo le righe d'avviso). Il segno è sincrono (`tabletLayout.ts`).
 */
const fakeSession = (id: string, title: string) => ({
    id, title, surface: 'chat' as const, mode: 'verified_execution' as const, persistence_mode: 'persistent' as const,
    active_model_profile_id: null, metadata: { codice: true }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
})
/** Un'apertura che si chiude quando lo dice la prova. */
function aperturaInSospeso() {
    let chiudi: () => void = () => {}
    const apri = vi.fn(() => new Promise<void>((r) => { chiudi = r }))
    return { apri, chiudi: () => chiudi() }
}

describe('LISTA-DOPPIA-02..06 sul tablet, la pagina del Codice mentre si apre l\'ultima sessione', () => {
    beforeEach(() => {
        finto.route = reactive({ name: 'harness', params: {}, query: {} })
        finto.listCodiceSessions.mockReset()
        __resetTalosTabletLayoutForTests()
        document.body.innerHTML = ''
    })
    afterEach(() => {
        __resetTalosTabletLayoutForTests()
        aperturaCodiceTablet.value = 'ferma'
    })

    it('LISTA-DOPPIA-02 apertura in corso: a destra solo la carta, nessuna riga dell\'elenco; ⛔ sul telefono l\'elenco resta', async () => {
        const { apri, chiudi } = aperturaInSospeso()
        const apertura = segnaApertura(apri)
        expect(aperturaCodiceTablet.value).toBe('in-corso')
        finto.listCodiceSessions.mockResolvedValue([fakeSession('session-a', 'Refactor auth flow')])

        useTalosTabletLayout().isTablet.value = true
        const tablet = mount(HarnessScreen, { attachTo: document.body })
        await flushPromises()
        expect(tablet.find('[data-testid="talos-harness-loading"]').exists()).toBe(true)
        expect(tablet.findAll('[data-testid="talos-harness-row"]')).toHaveLength(0)
        expect(tablet.find('[data-testid="talos-harness-filters"]').exists()).toBe(false)
        expect(tablet.find('[data-testid="talos-new-chat-fab"]').exists()).toBe(false)
        tablet.unmount()

        __resetTalosTabletLayoutForTests()
        useTalosTabletLayout().isTablet.value = false
        const telefono = mount(HarnessScreen, { attachTo: document.body })
        await flushPromises()
        expect(telefono.find('[data-testid="talos-harness-loading"]').exists()).toBe(false)
        expect(telefono.findAll('[data-testid="talos-harness-row"]')).toHaveLength(1)
        telefono.unmount()

        chiudi()
        await apertura
        expect(aperturaCodiceTablet.value).toBe('ferma')
    })

    it('LISTA-DOPPIA-03 finita senza sessioni sulla rotta dell\'elenco: la carta se ne va e resta la frase dell\'elenco vuoto', async () => {
        finto.listCodiceSessions.mockResolvedValue([])
        useTalosTabletLayout().isTablet.value = true
        const { apri, chiudi } = aperturaInSospeso()
        const apertura = segnaApertura(apri)
        const w = mount(HarnessScreen, { attachTo: document.body })
        await flushPromises()
        expect(w.find('[data-testid="talos-harness-loading"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-harness-empty"]').exists()).toBe(false)
        chiudi()
        await apertura
        await flushPromises()
        expect(w.find('[data-testid="talos-harness-loading"]').exists()).toBe(false)
        expect(w.get('[data-testid="talos-harness-empty"]').text()).toBe('No sessions yet. Tap "New", or just write below to start one.')
        expect(w.find('[data-testid="talos-harness-filters"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-harness-pick-from-list"]').exists()).toBe(false)
        w.unmount()
    })

    it('LISTA-DOPPIA-04 finita con delle sessioni ma senza rimando: mai l\'elenco, una riga sola che dice di sceglierne una', async () => {
        finto.listCodiceSessions.mockResolvedValue([fakeSession('session-a', 'Refactor auth flow'), fakeSession('session-b', 'Fix composer')])
        useTalosTabletLayout().isTablet.value = true
        const { apri, chiudi } = aperturaInSospeso()
        const apertura = segnaApertura(apri)
        const w = mount(HarnessScreen, { attachTo: document.body })
        await flushPromises()
        chiudi()
        await apertura
        await flushPromises()
        expect(aperturaCodiceTablet.value).toBe('ferma')
        for (const id of ['talos-harness-loading', 'talos-harness-row', 'talos-harness-fascia', 'talos-harness-empty', 'talos-harness-filters', 'talos-harness-new']) {
            expect(w.find(`[data-testid="${id}"]`).exists(), id).toBe(false)
        }
        // owner 29/10 notte: non un riquadro vuoto, una riga sola, al centro, quieta come quella dell'elenco vuoto; nessun pulsante
        const scegli = w.get('[data-testid="talos-harness-pick-from-list"]')
        expect(scegli.text()).toBe('Choose a session from the list.')
        expect(scegli.classes()).toEqual(expect.arrayContaining(['text-center', 'text-sm', 'text-[var(--talos-muted)]']))
        expect(scegli.findAll('button')).toHaveLength(0)
        w.unmount()
    })

    it('LISTA-DOPPIA-05 un\'apertura che rifiuta: nessun rifiuto scappato, niente carta, l\'avviso con «Retry», che riapre', async () => {
        const scappati: unknown[] = []
        const conta = (e: unknown) => { scappati.push(e) }
        process.on('unhandledRejection', conta)
        try {
            finto.listCodiceSessions.mockResolvedValue([])
            useTalosTabletLayout().isTablet.value = true
            const apri = vi.fn<() => Promise<void>>()
                .mockRejectedValueOnce(new Error('import fallito'))
                .mockResolvedValueOnce(undefined)
            await segnaApertura(apri)
            expect(aperturaCodiceTablet.value).toBe('fallita')
            const w = mount(HarnessScreen, { attachTo: document.body })
            await flushPromises()
            expect(w.find('[data-testid="talos-harness-loading"]').exists()).toBe(false)
            const avviso = w.get('[data-testid="talos-harness-open-failed"]')
            expect(avviso.attributes('role')).toBe('alert')
            expect(avviso.text()).toContain('Code didn')
            expect(avviso.text()).toContain('t open. Try again.')
            expect(avviso.find('svg').exists()).toBe(true)
            // il rifiuto non è l'elenco vuoto: la frase vuota non si somma all'avviso
            expect(w.find('[data-testid="talos-harness-empty"]').exists()).toBe(false)
            const riprova = avviso.get('button')
            expect(riprova.attributes('aria-label')).toBe('Retry')
            await riprova.trigger('click')
            await flushPromises()
            expect(apri).toHaveBeenCalledTimes(2)
            expect(aperturaCodiceTablet.value).toBe('ferma')
            expect(w.find('[data-testid="talos-harness-open-failed"]').exists()).toBe(false)
            w.unmount()
            await flushPromises()
            expect(scappati).toEqual([])
        } finally {
            process.off('unhandledRejection', conta)
        }
    })

    it('LISTA-DOPPIA-06 il segno è sincrono: al ritorno con l\'elenco già letto, e al primo disegno, niente righe', async () => {
        finto.listCodiceSessions.mockResolvedValue([fakeSession('session-a', 'Refactor auth flow')])
        useTalosTabletLayout().isTablet.value = true
        // il ritorno a caldo: la pagina ha già il suo elenco (qui su un'altra rotta, dove a tutta pagina si vede)
        finto.route.name = 'harness-session'
        const w = mount(HarnessScreen, { attachTo: document.body })
        await flushPromises()
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(1)
        // App.vue nello stesso giro: la rotta torna `harness` e l'apertura si segna
        const { apri } = aperturaInSospeso()
        finto.route.name = 'harness'
        void segnaApertura(apri)
        await nextTick()
        expect(w.find('[data-testid="talos-harness-loading"]').exists()).toBe(true)
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(0)
        w.unmount()

        // e al primo disegno di una pagina nuova, prima di qualunque attesa
        const nuova = mount(HarnessScreen, { attachTo: document.body })
        expect(nuova.find('[data-testid="talos-harness-loading"]').exists()).toBe(true)
        expect(nuova.findAll('[data-testid="talos-harness-row"]')).toHaveLength(0)
        nuova.unmount()
    })

    it('LISTA-DOPPIA-04-SORGENTE App.vue segna l\'apertura in modo sincrono (tabletLayout.ts); il modulo vecchio non c\'è più', () => {
        const app = readFileSync(resolve(__dirname, '../../../src/App.vue'), 'utf8')
        expect(app).toMatch(/segnaApertura\(\s*\(\)\s*=>\s*openDefaultHarnessSession\(\)\.catch\(/u)
        expect(app).toContain('console.warn(')
        expect(app).not.toContain('aperturaCodiceTablet')
        expect(existsSync(resolve(__dirname, '../../../src/lib/harness/aperturaCodiceTablet.ts'))).toBe(false)
        // l'apertura vera resta dinamica: i suoi moduli non entrano nel chunk d'avvio
        expect(app).toContain("import('@/lib/harness/codiceSessions')")
        expect(typeof riapriCodiceTablet).toBe('function')
    })
})

/*
 * ⛔ Revisione avversaria del Desktop (29/10 notte, `REVISIONE-UI-111-MOBILE-2026-10-29.md`): le sue prove portate qui. Vince l'ultima
 * apertura nei due ordini (M1); un `apri` che lancia in modo sincrono non scappa e non lascia la carta senza fine (S3-2); «Riprova» senza
 * un'apertura non fa niente; rifiutata mentre l'elenco si legge, un segno solo (S3-1); la riga «scegli dall'elenco» solo sul tablet (M13).
 */
function sospesa() {
    let chiudi: () => void = () => {}
    let rifiuta: (e: unknown) => void = () => {}
    const p = new Promise<void>((r, j) => { chiudi = r; rifiuta = j })
    return { apri: () => p, chiudi: () => chiudi(), rifiuta: (e: unknown) => rifiuta(e) }
}

describe('REV-UI111 segnaApertura', () => {
    afterEach(() => { aperturaCodiceTablet.value = 'ferma' })

    it('REV-01 due aperture in fila: il rifiuto della PRIMA non tocca lo stato della seconda; vince l\'ultima', async () => {
        const a = sospesa()
        const b = sospesa()
        const pa = segnaApertura(a.apri)
        const pb = segnaApertura(b.apri)
        a.rifiuta(new Error('vecchia'))
        await pa
        expect(aperturaCodiceTablet.value).toBe('in-corso')
        b.chiudi()
        await pb
        expect(aperturaCodiceTablet.value).toBe('ferma')
    })

    it('REV-01b e al contrario: la prima che finisce DOPO il rifiuto della seconda non cancella «fallita»', async () => {
        const a = sospesa()
        const b = sospesa()
        const pa = segnaApertura(a.apri)
        const pb = segnaApertura(b.apri)
        b.rifiuta(new Error('nuova'))
        await pb
        expect(aperturaCodiceTablet.value).toBe('fallita')
        a.chiudi()
        await pa
        expect(aperturaCodiceTablet.value).toBe('fallita')
    })

    it('REV-02 un apri che lancia in modo SINCRONO: niente eccezione che scappa, e il segno finisce «fallita»', async () => {
        let esito: Promise<void> | undefined
        expect(() => { esito = segnaApertura(() => { throw new Error('sincrono') }) }).not.toThrow()
        await esito
        expect(aperturaCodiceTablet.value).toBe('fallita')
    })

    it('REV-02b lo stato dopo un apri che lancia in modo sincrono, anche se l\'eccezione scappasse: mai «in-corso» per sempre', async () => {
        try { await segnaApertura(() => { throw new Error('sincrono') }) } catch { /* scappata: lo dice REV-02 */ }
        await new Promise((r) => setTimeout(r, 20))
        expect(aperturaCodiceTablet.value).toBe('fallita')
    })

    it('REV-03 «Riprova» senza un\'apertura precedente (modulo nuovo): non lancia e non cambia lo stato', async () => {
        vi.resetModules()
        const fresco = await import('@/lib/tabletLayout')
        await expect(fresco.riapriCodiceTablet()).resolves.toBeUndefined()
        expect(fresco.aperturaCodiceTablet.value).toBe('ferma')
    })
})

describe('REV-UI111 la pagina del Codice', () => {
    beforeEach(() => {
        finto.route = reactive({ name: 'harness', params: {}, query: {} })
        finto.listCodiceSessions.mockReset()
        __resetTalosTabletLayoutForTests()
        document.body.innerHTML = ''
    })
    afterEach(() => {
        __resetTalosTabletLayoutForTests()
        aperturaCodiceTablet.value = 'ferma'
    })

    it('REV-04 apertura rifiutata mentre l\'elenco si legge ancora: un segno solo (l\'avviso), non avviso + carta d\'attesa', async () => {
        finto.listCodiceSessions.mockReturnValue(new Promise(() => {}))
        useTalosTabletLayout().isTablet.value = true
        await segnaApertura(() => Promise.reject(new Error('import fallito')))
        expect(aperturaCodiceTablet.value).toBe('fallita')
        const w = mount(HarnessScreen, { attachTo: document.body })
        await flushPromises()
        const avviso = w.find('[data-testid="talos-harness-open-failed"]').exists()
        const carta = w.find('[data-testid="talos-harness-loading"]').exists()
        expect({ avviso, carta }).toEqual({ avviso: true, carta: false })
        w.unmount()
    })

    it('REV-13 sul telefono la riga «scegli dall\'elenco» non c\'è: c\'è l\'elenco (solo il tablet lo ha nella colonna)', async () => {
        finto.listCodiceSessions.mockResolvedValue([fakeSession('session-a', 'Refactor auth flow')])
        useTalosTabletLayout().isTablet.value = false
        const w = mount(HarnessScreen, { attachTo: document.body })
        await flushPromises()
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(1)
        expect(w.find('[data-testid="talos-harness-pick-from-list"]').exists()).toBe(false)
        w.unmount()
    })
})
