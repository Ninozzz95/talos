// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import TalosMobileSpeedDial from '@/components/shell/TalosMobileSpeedDial.vue'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'

/**
 * Il router è quello VERO.
 *
 * Con rotte finte il test direbbe soltanto «il ventaglio chiama push con questo
 * nome», e resterebbe verde anche se quel nome non esistesse in nessuna parte
 * dell'app — che è esattamente il difetto da cui ci si vuole difendere: quattro
 * voci su cinque sono navigazioni, e una navigazione verso il nulla è un tasto
 * morto ([[dead-primary-button-research-start]]).
 */
function router() {
    return createRouter({
        history: createMemoryHistory(),
        routes: TALOS_MOBILE_ROUTES.map((rotta) => ({
            path: rotta.path,
            name: rotta.name,
            component: { template: '<div />' },
        })),
    })
}

async function apriIlVentaglio(props: Record<string, unknown> = {}) {
    const r = router()
    await r.push('/')
    await r.isReady()
    const wrapper = mount(TalosMobileSpeedDial, {
        attachTo: document.body,
        global: { plugins: [r] },
        props,
    })
    await wrapper.find('[data-testid="talos-speed-dial-trigger"]').trigger('click')
    await flushPromises()
    return { wrapper, r }
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('TalosMobileSpeedDial', () => {
    it('parte chiuso e lo dichiara a chi non vede', async () => {
        const r = router()
        const wrapper = mount(TalosMobileSpeedDial, { global: { plugins: [r] } })
        const fab = wrapper.find('[data-testid="talos-speed-dial-trigger"]')
        expect(fab.attributes('aria-expanded')).toBe('false')
        expect(fab.attributes('aria-haspopup')).toBe('menu')
        expect(fab.attributes('aria-controls')).toBe('talos-speed-dial-menu')
        expect(wrapper.find('[data-testid="talos-speed-dial-menu"]').exists()).toBe(false)
    })

    /**
     * Cinque, e l'ordine conta: la chat sta in fondo alla colonna, cioè
     * ATTACCATA al FAB, perché è la cosa che si comincia più spesso e il pollice
     * è già lì. Se un giorno qualcuno la sposta in cima, questo test lo dice.
     */
    it('apre cinque voci, con la chat più vicina al pollice', async () => {
        const { wrapper } = await apriIlVentaglio()
        const voci = wrapper.findAll('[role="menuitem"]')
        expect(voci).toHaveLength(5)
        expect(voci.map((v) => v.attributes('data-testid'))).toEqual([
            'talos-speed-dial-task',
            'talos-speed-dial-memory',
            'talos-speed-dial-note',
            'talos-speed-dial-research',
            'talos-speed-dial-chat',
        ])
        expect(wrapper.find('[data-testid="talos-speed-dial-trigger"]').attributes('aria-expanded')).toBe('true')
        expect(wrapper.find('[data-testid="talos-speed-dial-menu"]').attributes('role')).toBe('menu')
        expect(wrapper.find('[data-testid="talos-speed-dial-menu"]').attributes('aria-orientation')).toBe('vertical')
    })

    /**
     * Ogni voce ha la sua PAROLA accanto all'icona. Un ventaglio di cinque
     * icone mute è un indovinello, e questa è la superficie che deve far
     * cominciare in fretta.
     */
    it('ogni voce dice cosa comincia, a parole', async () => {
        const { wrapper } = await apriIlVentaglio()
        for (const voce of wrapper.findAll('[role="menuitem"]')) {
            expect(voce.text().trim().length).toBeGreaterThan(0)
        }
    })

    /**
     * Il fuoco entra sulla voce più vicina al FAB: è quella sotto il dito, e
     * saltarla per andare in cima alla colonna sarebbe un salto che nessuno ha
     * chiesto.
     */
    it('porta il fuoco dentro il ventaglio, sulla voce più vicina', async () => {
        const { wrapper } = await apriIlVentaglio()
        expect(document.activeElement).toBe(wrapper.find('[data-testid="talos-speed-dial-chat"]').element)
    })

    it('le frecce girano fra le voci e si richiudono ad anello', async () => {
        const { wrapper } = await apriIlVentaglio()
        const voci = wrapper.findAll('[role="menuitem"]')
        await voci[4].trigger('keydown', { key: 'ArrowUp' })
        expect(document.activeElement).toBe(voci[3].element)
        await voci[3].trigger('keydown', { key: 'ArrowDown' })
        expect(document.activeElement).toBe(voci[4].element)
        // L'anello: dall'ultima in giù si torna alla prima, senza vicoli ciechi.
        await voci[4].trigger('keydown', { key: 'ArrowDown' })
        expect(document.activeElement).toBe(voci[0].element)
    })

    /**
     * Escape chiude E RIPORTA IL FUOCO AL FAB. Senza quel ritorno chi naviga da
     * tastiera resterebbe su un elemento che non esiste più, cioè da nessuna
     * parte: il caso peggiore, perché è silenzioso.
     */
    it('Escape chiude e restituisce il fuoco al FAB', async () => {
        const { wrapper } = await apriIlVentaglio()
        await wrapper.find('[data-testid="talos-speed-dial-chat"]').trigger('keydown', { key: 'Escape' })
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-speed-dial-menu"]').exists()).toBe(false)
        expect(document.activeElement).toBe(wrapper.find('[data-testid="talos-speed-dial-trigger"]').element)
    })

    /**
     * Visto sul dispositivo il 2026-08-06: senza velo, l'unica uscita era
     * ripremere il FAB — e chi apre per sbaglio non lo sa. Il gesto che tutti
     * provano per primo è toccare da un'altra parte, e deve funzionare.
     */
    it('un tocco fuori chiude e riporta il fuoco al FAB', async () => {
        const { wrapper } = await apriIlVentaglio()
        await wrapper.find('[data-testid="talos-speed-dial-scrim"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-speed-dial-menu"]').exists()).toBe(false)
        expect(document.activeElement).toBe(wrapper.find('[data-testid="talos-speed-dial-trigger"]').element)
        // Chiudere non è cominciare: nessuno deve credere che sia partito qualcosa.
        expect(wrapper.emitted('started')).toBeUndefined()
    })

    /** Quattro voci su cinque sono navigazioni, e devono ARRIVARE. */
    it.each([
        ['task', '/tasks/new'],
        ['memory', '/memory/new'],
        ['note', '/notes/new'],
        ['research', '/research/new'],
    ])('la voce %s porta a %s', async (id, atteso) => {
        const { wrapper, r } = await apriIlVentaglio()
        await wrapper.find(`[data-testid="talos-speed-dial-${id}"]`).trigger('click')
        await flushPromises()
        expect(r.currentRoute.value.path).toBe(atteso)
        // E il ventaglio si è chiuso: la pagina chiesta sta arrivando sotto.
        expect(wrapper.emitted('started')).toHaveLength(1)
        expect(wrapper.find('[data-testid="talos-speed-dial-menu"]').exists()).toBe(false)
    })

    /**
     * La chat NON viene creata qui: viene CHIESTA. È la differenza fra un
     * ventaglio che naviga e un ventaglio che duplica la creazione di sessione
     * senza saperne mostrare l'attesa.
     */
    it('la voce chat chiede a chi sta sopra, invece di navigare', async () => {
        const { wrapper, r } = await apriIlVentaglio()
        await wrapper.find('[data-testid="talos-speed-dial-chat"]').trigger('click')
        await flushPromises()
        expect(wrapper.emitted('chat')).toHaveLength(1)
        expect(r.currentRoute.value.path).toBe('/')
    })

    /**
     * Mentre una sessione nasce, la chat è spenta — ma SOLO la chat: le altre
     * quattro non c'entrano con quell'attesa, e spegnere tutto bloccherebbe il
     * ventaglio intero per un lavoro che non lo riguarda.
     */
    it('con una sessione in creazione spegne la chat e lascia vive le altre', async () => {
        const { wrapper } = await apriIlVentaglio({ creatingChat: true })
        const chat = wrapper.find('[data-testid="talos-speed-dial-chat"]')
        expect(chat.attributes('disabled')).toBeDefined()
        await chat.trigger('click')
        expect(wrapper.emitted('chat')).toBeUndefined()
        for (const id of ['task', 'memory', 'note', 'research']) {
            expect(wrapper.find(`[data-testid="talos-speed-dial-${id}"]`).attributes('disabled')).toBeUndefined()
        }
    })

    /**
     * Owner 2026-08-06, guardando il tablet: «il pulsante Nuovo deve essere
     * allineato nella stessa linea della sezione utente, non deve andare sotto».
     * Il ventaglio deve galleggiare, non allungare la barra: se un giorno la
     * colonna tornasse nel flusso, aprirla sposterebbe di nuovo il tasto che si
     * è appena premuto — e in jsdom l'altezza non esiste, quindi l'unico modo di
     * accorgersene è guardare che sia fuori dal flusso.
     */
    it('il menu galleggia sopra il FAB invece di allungare la barra', async () => {
        const { wrapper } = await apriIlVentaglio()
        const classi = wrapper.find('[data-testid="talos-speed-dial-menu"]').classes()
        expect(classi).toContain('absolute')
        expect(classi).toContain('bottom-full')
    })

    /**
     * Visto sul tablet: il velo, dichiarando uno `z-index` mentre menu e FAB non
     * ne avevano nessuno, finiva SOPRA di loro — cinque voci sbiadite e
     * illeggibili, e il tasto che le aveva aperte oscurato insieme a tutto il
     * resto. Ogni piano di questo componente dev'essere DICHIARATO, perché
     * dentro uno stacking context «nessun z-index» perde contro qualunque
     * z-index, anche più basso di quello che ci si aspetta.
     */
    it('tiene menu e FAB sopra il proprio velo', async () => {
        const { wrapper } = await apriIlVentaglio()
        expect(wrapper.find('[data-testid="talos-speed-dial-menu"]').classes()).toContain('z-50')
        expect(wrapper.find('[data-testid="talos-speed-dial-trigger"]').classes()).toContain('z-50')
        expect(wrapper.find('[data-testid="talos-speed-dial-scrim"]').classes()).toContain('z-40')
    })

    /**
     * Il movimento è quello del motore, non uno nuovo: se qualcuno togliesse
     * l'intento, le voci comparirebbero di scatto e nessun altro test se ne
     * accorgerebbe.
     */
    it('usa il movimento dichiarato dal motore, scaglionato per indice', async () => {
        const { wrapper } = await apriIlVentaglio()
        const voci = wrapper.findAll('[role="menuitem"]')
        for (const voce of voci) {
            expect(voce.attributes('data-talos-motion-intent')).toBe('menu-open')
        }
        // La prima parte subito, le altre a scalare: una colonna che compare
        // tutta insieme si legge come un pannello, una che sale come un gesto.
        expect(voci[0].attributes('style')).toContain('* 0')
        expect(voci[4].attributes('style')).toContain('* 0.48')
    })
})
