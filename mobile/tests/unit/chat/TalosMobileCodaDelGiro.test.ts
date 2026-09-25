// @vitest-environment jsdom

/**
 * ⭐ B3 F4-A — la striscia della coda sopra il compositore.
 *
 * Parole e regole dal desktop (sola lettura, `components/coda-messaggi.js`): il numero sta nel badge che non si
 * accorcia («N in coda» / «N in pausa»), il testo della prima voce si accorcia e intero sta nel titolo, «Indirizza
 * ora» solo a giro vivo, «Invia ora» a giro fermo. Regole di casa: più di due azioni ⇒ menu «⋯» + tasto destro;
 * ciò che è nel menu NON resta anche fuori (intersezione vuota, unione completa).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileCodaDelGiro from '@/components/chat/TalosMobileCodaDelGiro.vue'
import type { TalosCodaVoce } from '@/lib/chat/codaDelGiro'
import { __resetTalosTabletLayoutForTests } from '@/composables/useTalosTabletLayout'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let wrapper: VueWrapper | null = null

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    delete (window as unknown as { matchMedia?: unknown }).matchMedia
    __resetTalosTabletLayoutForTests()
})

/** Le aree (`grid-template-areas`) della voce chiusa per un selettore, lette dal sorgente del componente. */
function areeDi(selettore: string): string[] {
    const sorgente = readFileSync(resolve(process.cwd(), 'src/components/chat/TalosMobileCodaDelGiro.vue'), 'utf8')
    const regola = new RegExp(`${selettore.replace(/[.()]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(sorgente)?.[1] ?? ''
    return [...(/grid-template-areas:([^;]*);/.exec(regola)?.[1] ?? '').matchAll(/"([^"]*)"/g)].map((m) => m[1].trim().replace(/\s+/g, ' '))
}

/** Tablet vero per `useTalosTabletLayout` (largo e alto abbastanza); senza chiamarla il componente è sul telefono. */
function suTablet(): void {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
    __resetTalosTabletLayoutForTests()
}

const voci: TalosCodaVoce[] = [
    { id: 'v1', testo: 'Prima domanda in coda, piuttosto lunga da accorciare con i puntini', creataAlle: '2026-09-24T10:00:00Z' },
    { id: 'v2', testo: 'Seconda domanda', creataAlle: '2026-09-24T10:00:01Z' },
]

function mountStrip(overrides: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(TalosMobileCodaDelGiro, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            voci,
            inPausa: false,
            azione: 'indirizza',
            altraChatInCorso: false,
            salvaModifica: vi.fn().mockResolvedValue({ ok: true }),
            ...overrides,
        },
    })
    return wrapper
}

const riga = (view: VueWrapper, id: string) => view.get(`[data-testid="talos-queue-item-${id}"]`)

describe('TalosMobileCodaDelGiro', () => {
    it('CODA-UI-01 senza voci non disegna niente', () => {
        const view = mountStrip({ voci: [] })
        expect(view.find('[data-testid="talos-queue-strip"]').exists()).toBe(false)
    })

    it('CODA-UI-02 conteggio nel badge; solo la prima voce, accorciata e intera nel titolo; si espande', async () => {
        const view = mountStrip()
        expect(view.get('[data-testid="talos-queue-count"]').text()).toBe('2 queued')
        expect(view.get('[data-testid="talos-queue-strip"]').attributes('data-paused')).toBe('false')
        const prima = view.get('[data-testid="talos-queue-text-v1"]')
        expect(prima.attributes('title')).toBe(voci[0].testo)
        expect(prima.classes()).toContain('truncate')
        expect(view.find('[data-testid="talos-queue-item-v2"]').exists()).toBe(false)
        const toggle = view.get('[data-testid="talos-queue-toggle"]')
        expect(toggle.attributes('aria-expanded')).toBe('false')
        await toggle.trigger('click')
        expect(view.get('[data-testid="talos-queue-toggle"]').attributes('aria-expanded')).toBe('true')
        expect(view.get('[data-testid="talos-queue-item-v2"]').text()).toContain('Seconda domanda')
        // Espansa, il testo non si accorcia più.
        expect(view.get('[data-testid="talos-queue-text-v1"]').classes()).not.toContain('truncate')
    })

    it('CODA-UI-03 in pausa: badge «in pausa», la spiegazione dello Stop e «Riprendi la coda», che riprende', async () => {
        const view = mountStrip({ inPausa: true, azione: 'invia-ora' })
        expect(view.get('[data-testid="talos-queue-count"]').text()).toBe('2 paused')
        expect(view.get('[data-testid="talos-queue-strip"]').attributes('data-paused')).toBe('true')
        expect(view.get('[data-testid="talos-queue-hint"]').text()).toContain('Paused by Stop: it goes only when you send it.')
        await view.get('[data-testid="talos-queue-resume"]').trigger('click')
        expect(view.emitted('riprendi')).toEqual([[]])
    })

    it('CODA-UI-04 «Riprendi la coda» SOLO in pausa', () => {
        const view = mountStrip({ inPausa: false })
        expect(view.find('[data-testid="talos-queue-resume"]').exists()).toBe(false)
    })

    it.each([
        ['indirizza', 'Steer now', 'at the next step between tools'],
        ['ferma-e-riparti', 'Stop and restart with this', 'keeps what is already written'],
        ['invia-ora', 'Send now', ''],
    ] as const)('CODA-UI-05 azione principale per «%s»: «%s», con la sua spiegazione', async (azione, etichetta, spiegazione) => {
        suTablet()
        const view = mountStrip({ azione })
        const principale = riga(view, 'v1').get('[data-testid="talos-queue-primary-v1"]')
        expect(principale.text()).toBe(etichetta)
        if (spiegazione) expect(view.get('[data-testid="talos-queue-hint"]').text()).toContain(spiegazione)
        await principale.trigger('click')
        expect(view.emitted('principale')).toEqual([['v1']])
    })

    // ⭐ 24/09/2026 sera (B3-STILE, owner: «i bottoni riprendi la coda e invia ora, come hai fatto a non notare errore di
    // stile?»). Erano capsule trasparenti alte 48px, uno sopra l'altro. Decisioni owner: tablet = pulsante standard come il
    // desktop (index.template.html:579, una riga); telefono = sole icone; mai uno sopra l'altro; aperta = «Riprendi» in fondo.
    it('CODA-UI-12 chiusa è una voce sola (conteggio, testo, azioni, freccia, spiegazione in fondo); aperta, «Riprendi» va in fondo', async () => {
        suTablet()
        const view = mountStrip({ inPausa: true, azione: 'invia-ora' })
        const rigaUnica = riga(view, 'v1')
        for (const id of ['talos-queue-count', 'talos-queue-text-v1', 'talos-queue-resume', 'talos-queue-primary-v1', 'talos-queue-menu-v1', 'talos-queue-toggle']) {
            expect(rigaUnica.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
        }
        // B3-STILE-2: la spiegazione sta nella voce chiusa, DOPO le azioni (la griglia la mette sotto, vedi CODA-UI-15/16)
        const spiegazione = view.get('[data-testid="talos-queue-hint"]')
        expect(rigaUnica.element.contains(spiegazione.element)).toBe(true)
        const azioni = rigaUnica.get('.talos-queue-actions')
        expect(azioni.element.compareDocumentPosition(spiegazione.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        await view.get('[data-testid="talos-queue-toggle"]').trigger('click')
        const righe = view.findAll('[data-testid^="talos-queue-item-"]')
        expect(righe).toHaveLength(2)
        for (const r of righe) expect(r.find('[data-testid="talos-queue-resume"]').exists()).toBe(false)
        const piede = view.get('[data-testid="talos-queue-foot"]')
        expect(piede.find('[data-testid="talos-queue-resume"]').exists()).toBe(true)
        expect(righe.at(-1)!.element.compareDocumentPosition(piede.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        await view.get('[data-testid="talos-queue-resume"]').trigger('click')
        expect(view.emitted('riprendi')).toEqual([[]])
    })

    it('CODA-UI-13 sul tablet i pulsanti sono quelli dell\'app (Button contornato, 32px) con la scritta; nessuna capsula', () => {
        suTablet()
        const view = mountStrip({ inPausa: true, azione: 'invia-ora' })
        for (const [id, scritta] of [['talos-queue-resume', 'Resume queue'], ['talos-queue-primary-v1', 'Send now']] as const) {
            const b = view.get(`[data-testid="${id}"]`)
            expect(b.attributes('data-slot'), id).toBe('button')
            expect(b.attributes('data-variant'), id).toBe('outline')
            expect(b.attributes('data-size'), id).toBe('default')
            expect(b.text(), id).toBe(scritta)
        }
        expect(view.find('.talos-queue-pill').exists()).toBe(false)
    })

    it('CODA-UI-14 sul telefono sole icone, col nome per lo screen reader e il suggerimento', () => {
        const view = mountStrip({ inPausa: true, azione: 'invia-ora' })
        for (const [id, nome] of [['talos-queue-resume', 'Resume queue'], ['talos-queue-primary-v1', 'Send now']] as const) {
            const b = view.get(`[data-testid="${id}"]`)
            expect(b.attributes('data-size'), id).toBe('icon')
            expect(b.text(), id).toBe('')
            expect(b.find('svg').exists(), id).toBe(true)
            expect(b.attributes('aria-label'), id).toBe(nome)
            expect(b.attributes('title'), id).toBe(nome)
        }
    })

    it('CODA-UI-15 il pulsante si vede piccolo ma si tocca a 48px (Material 3), e le icone non si toccano a vicenda', () => {
        const sorgente = readFileSync(resolve(process.cwd(), 'src/components/chat/TalosMobileCodaDelGiro.vue'), 'utf8')
        const area = /\.talos-queue-azione::after\s*\{([^}]*)\}/.exec(sorgente)?.[1] ?? ''
        expect(area).toMatch(/position:\s*absolute/)
        expect(area).toMatch(/inset-block:\s*calc\(\(var\(--talos-touch-target\) - 2rem\) \/ -2\)/)
        const view = mountStrip({ inPausa: true, azione: 'invia-ora' })
        for (const id of ['talos-queue-resume', 'talos-queue-primary-v1']) {
            expect(view.get(`[data-testid="${id}"]`).classes(), id).toContain('talos-queue-azione')
        }
        // sul telefono le icone stanno a 16px l'una dall'altra: 32px visibili + 8px per lato = 48px, senza sovrapporsi
        expect(/\.talos-queue-strip:not\(\.is-tablet\) \.talos-queue-actions\s*\{[^}]*gap:\s*1rem/.test(sorgente)).toBe(true)
        // sul tablet la voce chiusa è UNA riga, e la spiegazione le sta sotto per tutta la larghezza
        expect(areeDi('.talos-queue-item.is-riga-unica')).toEqual([
            'conteggio testo azioni freccia', 'spiegazione spiegazione spiegazione spiegazione',
        ])
    })

    // ⭐ 24/09/2026 sera (B3-STILE-2, owner «2 ok»): a 375px una riga sola lasciava al messaggio «Poi f…». Sul telefono
    // riga 1 = conteggio · messaggio · freccia; riga 2 = spiegazione · icone affiancate (mai una sopra l'altra).
    it('CODA-UI-16 sul telefono la voce chiusa ha due righe: il messaggio sopra, le icone affiancate sotto con la spiegazione', () => {
        expect(areeDi('.talos-queue-strip:not(.is-tablet) .talos-queue-item.is-riga-unica')).toEqual([
            'conteggio testo testo freccia', 'spiegazione spiegazione azioni azioni',
        ])
        const view = mountStrip({ inPausa: true, azione: 'invia-ora' })
        const voce = riga(view, 'v1')
        expect(voce.classes()).toContain('is-riga-unica')
        // le icone stanno insieme nello stesso contenitore (una accanto all'altra); la freccia è fuori, nella prima riga
        const azioni = voce.get('.talos-queue-actions')
        expect(azioni.find('[data-testid="talos-queue-resume"]').exists()).toBe(true)
        expect(azioni.find('[data-testid="talos-queue-primary-v1"]').exists()).toBe(true)
        expect(azioni.find('[data-testid="talos-queue-toggle"]').exists()).toBe(false)
        expect(voce.get('[data-testid="talos-queue-toggle"]').element.parentElement).toBe(voce.element)
    })

    it('CODA-UI-06 coda di una chat diversa da quella che risponde: lo dice, e niente «Invia ora» che non può partire', () => {
        const view = mountStrip({ azione: 'invia-ora', altraChatInCorso: true })
        expect(view.get('[data-testid="talos-queue-hint"]').text()).toContain('Goes when the other chat finishes.')
        expect(view.find('[data-testid="talos-queue-primary-v1"]').exists()).toBe(false)
        // Il menu resta: Modifica e Togli non dipendono dal giro.
        expect(view.find('[data-testid="talos-queue-menu-v1"]').exists()).toBe(true)
    })

    it('CODA-UI-07 menu ⋯: Modifica e Togli; fuori solo l\'azione principale — intersezione vuota, unione completa', async () => {
        const view = mountStrip({ azione: 'indirizza' })
        const fuori = riga(view, 'v1').findAll('button').map((b) => b.attributes('data-testid'))
        expect(fuori).toContain('talos-queue-primary-v1')
        expect(fuori).not.toContain('talos-queue-edit-v1')
        expect(fuori).not.toContain('talos-queue-remove-v1')
        await view.get('[data-testid="talos-queue-menu-v1"]').trigger('click')
        await flushPromises()
        const menu = document.body.querySelector('[data-testid="talos-row-actions-menu"]')!
        const voceMenu = [...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.getAttribute('data-testid'))
        expect(voceMenu).toEqual(['talos-queue-edit-v1', 'talos-queue-remove-v1'])
        expect(menu.textContent).not.toContain('Steer now')
        ;(menu.querySelector('[data-testid="talos-queue-remove-v1"]') as HTMLButtonElement).click()
        await flushPromises()
        expect(view.emitted('togli')).toEqual([['v1']])
    })

    it('CODA-UI-08 il tasto destro sulla voce apre LO STESSO menu', async () => {
        const view = mountStrip()
        await riga(view, 'v1').trigger('contextmenu')
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-queue-edit-v1"]')).not.toBeNull()
    })

    it('CODA-UI-09 Modifica in linea: un rifiuto si dice e il campo resta; il successo chiude', async () => {
        const salvaModifica = vi.fn()
            .mockResolvedValueOnce({ ok: false, rifiuto: 'troppo-lungo' })
            .mockResolvedValueOnce({ ok: true })
        const view = mountStrip({ salvaModifica })
        await view.get('[data-testid="talos-queue-menu-v1"]').trigger('click')
        await flushPromises()
        ;(document.body.querySelector('[data-testid="talos-queue-edit-v1"]') as HTMLButtonElement).click()
        await flushPromises()
        const campo = view.get<HTMLTextAreaElement>('[data-testid="talos-queue-edit-field-v1"]')
        expect(campo.element.value).toBe(voci[0].testo)
        await campo.setValue('testo nuovo')
        await view.get('[data-testid="talos-queue-edit-save-v1"]').trigger('click')
        await flushPromises()
        expect(salvaModifica).toHaveBeenCalledWith('v1', 'testo nuovo')
        const errore = view.get('[data-testid="talos-queue-edit-error-v1"]')
        expect(errore.attributes('role')).toBe('alert')
        expect(errore.text()).toContain('16,000')
        expect(view.find('[data-testid="talos-queue-edit-field-v1"]').exists()).toBe(true)
        await view.get('[data-testid="talos-queue-edit-save-v1"]').trigger('click')
        await flushPromises()
        expect(view.find('[data-testid="talos-queue-edit-field-v1"]').exists()).toBe(false)
    })

    it('CODA-UI-10 Annulla la modifica senza salvare', async () => {
        const salvaModifica = vi.fn()
        const view = mountStrip({ salvaModifica })
        await view.get('[data-testid="talos-queue-menu-v1"]').trigger('click')
        await flushPromises()
        ;(document.body.querySelector('[data-testid="talos-queue-edit-v1"]') as HTMLButtonElement).click()
        await flushPromises()
        await view.get('[data-testid="talos-queue-edit-cancel-v1"]').trigger('click')
        expect(salvaModifica).not.toHaveBeenCalled()
        expect(view.find('[data-testid="talos-queue-edit-field-v1"]').exists()).toBe(false)
    })

    /*
     * ⛔ Trovato sul Pad il 24/09/2026 (tocco vero, adb): scritta la correzione e premuto Accoda, la tastiera resta aperta;
     * il tocco su «Ferma e riparti» toglieva il fuoco al campo, la tastiera si chiudeva, la striscia scendeva di ~750 px e
     * il rilascio cadeva altrove — il click non partiva mai (fuoco rimasto sul pulsante, voce ancora in coda). I pulsanti
     * del compositore lo evitano già con `@pointerdown.prevent` (W3C Pointer Events 3: annullare `pointerdown` ferma gli
     * eventi mouse di compatibilità, cioè il `mousedown` che sposta il fuoco; il click resta).
     */
    it('CODA-UI-11 nessun pulsante della striscia ruba il fuoco al campo: il tocco con la tastiera aperta non va a vuoto', async () => {
        const view = mountStrip({ inPausa: true })
        const annullato = (selettore: string): boolean => {
            const el = document.body.querySelector(selettore)
            if (!el) throw new Error(`manca ${selettore}`)
            const evento = new Event('pointerdown', { bubbles: true, cancelable: true })
            el.dispatchEvent(evento)
            return evento.defaultPrevented
        }
        for (const selettore of [
            '[data-testid="talos-queue-resume"]',
            '[data-testid="talos-queue-toggle"]',
            '[data-testid="talos-queue-primary-v1"]',
            '[data-testid="talos-queue-menu-v1"]',
        ]) expect(annullato(selettore), selettore).toBe(true)
        await view.get('[data-testid="talos-queue-menu-v1"]').trigger('click')
        await flushPromises()
        ;(document.body.querySelector('[data-testid="talos-queue-edit-v1"]') as HTMLButtonElement).click()
        await flushPromises()
        expect(annullato('[data-testid="talos-queue-edit-cancel-v1"]'), 'annulla').toBe(true)
        expect(annullato('[data-testid="talos-queue-edit-save-v1"]'), 'salva').toBe(true)
        // Il campo della modifica DEVE poter prendere il fuoco: lì il pointerdown resta libero.
        expect(annullato('[data-testid="talos-queue-edit-field-v1"]'), 'campo').toBe(false)
    })
})

