// @vitest-environment jsdom

/**
 * ⛔ Owner 2026-09-13, dal Pad, due richieste in una: «non c'è lo slide nel
 * drawer: nel mockup se facevo slide a destra e sinistra le schede cambiavano
 * dinamicamente» e «tutti i drawer devono reagire al tocco: se trascino il
 * drawer, anche il drawer si deve trascinare».
 *
 * Queste guardie nascono INSIEME al gesto, non dopo. La modalità compatta è
 * sparita il 12/09 e nessuna guardia se n'è accorta per un giorno intero,
 * perché le tre che c'erano erano capovolte. Un gesto senza la sua prova al
 * verso contrario è la stessa storia che ricomincia.
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

const profile: TalosMobileModelProfileView = {
    id: 'profile-claude', provider: 'anthropic', model: 'claude-opus', display_name: 'Claude Opus',
    status: 'healthy', has_secret: true, effort_levels: ['low', 'medium', 'high'], supports_thinking: true,
    show_in_composer: true, capabilities: null, probe_ok: true,
}

function puntatore(tipo: string, x: number, y: number): Event {
    return new MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true, cancelable: true })
}

describe('il foglio si trascina col dito (owner 13/09)', () => {
    function montaFoglio() {
        return mount(TalosMobileComposerSheet, {
            attachTo: document.body,
            props: { title: 'Foglio di prova', testid: 'foglio-di-prova' },
        })
    }

    it('oltre la soglia, il trascinamento CHIUDE il foglio', async () => {
        const wrapper = montaFoglio()
        const presa = document.querySelector<HTMLElement>('[data-testid="talos-sheet-grab"]')!
        expect(presa).toBeTruthy()
        presa.dispatchEvent(puntatore('pointerdown', 100, 100))
        presa.dispatchEvent(puntatore('pointermove', 100, 260))
        presa.dispatchEvent(puntatore('pointerup', 100, 260))
        // ⛔ La chiusura e' ANIMATA: requestClose() emette dopo l'uscita (210 ms),
        //    quindi qui si attende la CONDIZIONE — che l'evento sia arrivato —
        //    non un giro di microtask. Aspettare un tick qui accuserebbe il
        //    gesto di non funzionare mentre funziona.
        await vi.waitFor(() => { expect(wrapper.emitted('close')).toBeTruthy() })
        wrapper.unmount()
    })

    /**
     * ⛔ Il verso contrario, ed è quello che conta: un foglio che si chiude a
     * ogni sfioramento sarebbe peggio di uno che non si trascina affatto.
     */
    /**
     * ⛔⛔ IL VERSO CONTRARIO DELLA PRESA ALLARGATA. Dal 13/09 il trascinamento
     * non vive più sulla sola intestazione ma sul FOGLIO INTERO — l'owner ha
     * detto «se trascino il drawer, anche il drawer si deve trascinare», e sul
     * Pad il trascinamento lungo non chiudeva niente perché il dito partiva 31
     * px sotto l'intestazione, cioè fuori dal nodo che ascoltava.
     *
     * ⇒ Ma una presa che copre tutto è pericolosa: il corpo del foglio SCORRE.
     * Se il dito parte dentro un elenco già scorso, quel gesto è una lettura,
     * non un trascinamento — e chiudere il foglio mentre qualcuno legge sarebbe
     * una cura peggiore del difetto. Questa guardia pretende che in quel caso
     * non succeda niente.
     */
    it('se il corpo e gia scorso, il trascinamento NON parte', async () => {
        const wrapper = montaFoglio()
        const corpo = document.querySelector<HTMLElement>('[data-talos-sheet-body]')!
        expect(corpo).toBeTruthy()
        corpo.scrollTop = 120
        corpo.dispatchEvent(puntatore('pointerdown', 100, 100))
        corpo.dispatchEvent(puntatore('pointermove', 100, 400))
        corpo.dispatchEvent(puntatore('pointerup', 100, 400))
        await flushPromises()
        expect(wrapper.emitted('close')).toBeUndefined()
        wrapper.unmount()
    })

    /**
     * ⛔ E il verso opposto: col corpo IN CIMA lo stesso gesto deve chiudere,
     * altrimenti la guardia di sopra avrebbe spento la funzione invece di
     * proteggerla.
     */
    it('col corpo in cima, lo stesso gesto chiude', async () => {
        const wrapper = montaFoglio()
        const corpo = document.querySelector<HTMLElement>('[data-talos-sheet-body]')!
        corpo.scrollTop = 0
        corpo.dispatchEvent(puntatore('pointerdown', 100, 100))
        corpo.dispatchEvent(puntatore('pointermove', 100, 400))
        corpo.dispatchEvent(puntatore('pointerup', 100, 400))
        await vi.waitFor(() => { expect(wrapper.emitted('close')).toBeTruthy() })
        wrapper.unmount()
    })

    it('sotto la soglia, il foglio TORNA al suo posto e non si chiude', async () => {
        const wrapper = montaFoglio()
        const presa = document.querySelector<HTMLElement>('[data-testid="talos-sheet-grab"]')!
        expect(presa).toBeTruthy()
        presa.dispatchEvent(puntatore('pointerdown', 100, 100))
        presa.dispatchEvent(puntatore('pointermove', 100, 130))
        presa.dispatchEvent(puntatore('pointerup', 100, 130))
        await flushPromises()
        expect(wrapper.emitted('close')).toBeUndefined()
        wrapper.unmount()
    })
})

describe('lo scorrimento cambia scheda nel foglio «+» (owner 13/09)', () => {
    function montaCompositore() {
        return mount(TalosMobileComposer, {
            // ⛔ Il gesto si chiude su un ascoltatore del DOCUMENTO, perche' sul
            //    Pad il rilascio del dito atterra fuori dal contenitore delle
            //    voci (misurato: «doc:su fuori»). Senza attachTo i nodi restano
            //    staccati e il rilascio non raggiunge mai il documento: la prova
            //    accuserebbe il codice al posto di se stessa.
            attachTo: document.body,
            global: { stubs: { teleport: true } },
            props: {
                prompt: '', modelProfiles: [profile], routingProfiles: [],
                selectedModelProfileId: profile.id, selectedRoutingProfileId: null,
                selectedEffort: 'high', thinking: false, canSend: true, sending: false,
                sendDisabledReason: '', dictationSupported: true, drawerMode: true,
            },
        })
    }

    async function apriIlFoglio() {
        const wrapper = montaCompositore()
        await wrapper.get('[data-testid="talos-composer-plus"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        return wrapper
    }

    function schedaAttiva(wrapper: Awaited<ReturnType<typeof apriIlFoglio>>): string | undefined {
        return wrapper.findAll('[role="tab"]').find((t) => t.attributes('aria-selected') === 'true')?.attributes('id')
    }

    it('trascinando a SINISTRA si passa alla scheda successiva', async () => {
        const wrapper = await apriIlFoglio()
        const prima = schedaAttiva(wrapper)
        const pannello = wrapper.get('[data-testid="talos-drawer-options"]').element
        pannello.dispatchEvent(puntatore('pointerdown', 300, 200))
        pannello.dispatchEvent(puntatore('pointerup', 180, 205))
        await flushPromises()
        expect(schedaAttiva(wrapper)).not.toBe(prima)
        wrapper.unmount()
    })

    /**
     * ⛔ Il verso contrario: il foglio sotto ha il PROPRIO trascinamento
     * verticale, e l'elenco delle voci scorre. Un gesto in giù che cambiasse
     * scheda renderebbe il foglio inutilizzabile mentre si legge.
     */
    /**
     * ⛔ LA PROVA CHE DISTINGUE IL CODICE DALLO STRUMENTO. Sul Pad il gesto non
     * cambia scheda nemmeno con la spia rimossa e mirando dentro il contenitore
     * delle voci. Ma `adb input swipe` sintetizza una sequenza che la WebView
     * può consegnare come down+up SENZA i movimenti intermedi — e senza
     * movimento nessun browser promuove la sequenza a gesto.
     *
     * ⇒ Qui la sequenza è realistica: down, alcuni move, up. Se questo passa, il
     * codice reagisce e il difetto sta nello strumento di prova; se cade, il
     * difetto è nel codice e l'ho finalmente in mano.
     *
     * Owner 13/09, specifica confermata: destra → sinistra SUL CONTENITORE DELLE
     * VOCI; Allega → Crea → Strumenti → Agente, con le voci che cambiano insieme.
     */
    it('down, move e up sul contenitore delle voci cambiano scheda', async () => {
        const wrapper = await apriIlFoglio()
        const prima = schedaAttiva(wrapper)
        const pannello = wrapper.get('[data-testid="talos-drawer-options"]').element
        pannello.dispatchEvent(puntatore('pointerdown', 850, 800))
        for (const x of [700, 550, 400, 250]) pannello.dispatchEvent(puntatore('pointermove', x, 802))
        pannello.dispatchEvent(puntatore('pointerup', 200, 803))
        await flushPromises()
        expect(schedaAttiva(wrapper)).not.toBe(prima)
        wrapper.unmount()
    })

    it('un gesto VERTICALE non cambia scheda', async () => {
        const wrapper = await apriIlFoglio()
        const prima = schedaAttiva(wrapper)
        const pannello = wrapper.get('[data-testid="talos-drawer-options"]').element
        pannello.dispatchEvent(puntatore('pointerdown', 300, 120))
        pannello.dispatchEvent(puntatore('pointerup', 290, 320))
        await flushPromises()
        expect(schedaAttiva(wrapper)).toBe(prima)
        wrapper.unmount()
    })

    /**
     * ⛔⛔ LA PROVA CHE MI MANCAVA, e me l'ha data il Pad, non i test. Sul
     * dispositivo lo swipe partiva sopra l'elenco delle voci e al rilascio la
     * voce sotto il dito riceveva il CLIC: eseguiva un'azione e chiudeva il
     * foglio. La guardia di sopra non poteva accorgersene perché mandava i due
     * eventi del puntatore su un pannello senza nessun bottone sotto il dito —
     * una prova più debole della realtà.
     *
     * ⇒ Qui il gesto passa SOPRA UNA VOCE VERA, e si pretende che quella voce
     * NON venga attivata.
     */
    it('uno scorrimento sopra una voce NON la attiva', async () => {
        const wrapper = await apriIlFoglio()
        const voce = wrapper.get('[data-testid="talos-drawer-attach"]').element
        voce.dispatchEvent(puntatore('pointerdown', 900, 800))
        voce.dispatchEvent(puntatore('pointerup', 300, 805))
        voce.dispatchEvent(puntatore('click', 300, 805))
        await flushPromises()
        expect(wrapper.emitted('attach')).toBeUndefined()
        wrapper.unmount()
    })

    /**
     * ⛔ Il verso contrario: un tocco fermo sulla stessa voce DEVE attivarla.
     * Senza questo, soffocare il clic sarebbe una cura che rompe il prodotto
     * invece di ripararlo.
     */
    it('un tocco fermo sulla stessa voce la attiva ancora', async () => {
        const wrapper = await apriIlFoglio()
        await wrapper.get('[data-testid="talos-drawer-attach"]').trigger('click')
        await flushPromises()
        expect(wrapper.emitted('attach')).toHaveLength(1)
        wrapper.unmount()
    })

    it('uno scorrimento troppo corto non cambia scheda', async () => {
        const wrapper = await apriIlFoglio()
        const prima = schedaAttiva(wrapper)
        const pannello = wrapper.get('[data-testid="talos-drawer-options"]').element
        pannello.dispatchEvent(puntatore('pointerdown', 300, 200))
        pannello.dispatchEvent(puntatore('pointerup', 280, 200))
        await flushPromises()
        expect(schedaAttiva(wrapper)).toBe(prima)
        wrapper.unmount()
    })
})
