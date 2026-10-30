// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TalosMobileElencoTesta from '@/components/talos/ui/TalosMobileElencoTesta.vue'
import { __resetTalosTabletLayoutForTests } from '@/composables/useTalosTabletLayout'

/**
 * ELENCO-TESTA-01..04 — la testa delle sezioni a elenco, una sola per tutte, nella grammatica delle Chat (UI-111, owner 29/10 sera;
 * `SCHEDA-DI-CONSEGNA.md` voce 2). Il pezzo è `ChatsScreen.vue:794-946` portato fuori classe per classe: queste prove dicono che resta
 * gemello delle Chat (le classi si leggono anche nel sorgente delle Chat, così se cambia uno dei due la prova diventa rossa), che le
 * schede si muovono con le frecce come un radiogroup vero, dove va il «+» e il numero sul pulsante «Opzioni».
 */

const P = 'talos-prova'
const CHATS = readFileSync(resolve(__dirname, '../../../src/screens/ChatsScreen.vue'), 'utf8')
const SCHEDE = [
    { id: 'tutte', label: 'Tutte', count: 5 },
    { id: 'in-corso', label: 'In corso', count: 2 },
    { id: 'concluse', label: 'Concluse', count: 3 },
] as const

let wrapper: VueWrapper | null = null
const matchMediaOriginale = window.matchMedia

/** Il telefono: l'intestazione delle stazioni legge il formato da `matchMedia`, la testa lo riceve dalla pagina (`tablet`). */
function senzaTablet(): void {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    __resetTalosTabletLayoutForTests()
}

function monta(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}): VueWrapper {
    senzaTablet()
    const w: VueWrapper = mount(TalosMobileElencoTesta, {
        attachTo: document.body,
        props: {
            testIdPrefix: P,
            titolo: 'Codice',
            frase: 'Le tue sessioni di codice, qui e sui tuoi computer.',
            nuovaEtichetta: 'Nuova sessione Codice',
            nuovaBreve: 'Nuova sessione',
            cercaEtichetta: 'Cerca sessioni',
            opzioniEtichetta: 'Opzioni',
            schedeEtichetta: 'Filtra per stato',
            schede: SCHEDE,
            scheda: 'tutte',
            'onUpdate:scheda': (v: string) => { void w.setProps({ scheda: v }) },
            testo: '',
            'onUpdate:testo': (v: string) => { void w.setProps({ testo: v }) },
            conteggio: '5 sessioni',
            ...props,
        },
        slots,
    })
    wrapper = w
    return w
}

const parole = (s: string) => s.split(/\s+/u).filter(Boolean)
/** Le classi di un elemento, uguali a quelle date (senza badare all'ordine). */
function classiUguali(classi: string[], attese: string): void {
    expect([...classi].sort()).toEqual(parole(attese).sort())
}

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    ;(window as unknown as { matchMedia: unknown }).matchMedia = matchMediaOriginale
    __resetTalosTabletLayoutForTests()
})

describe('TalosMobileElencoTesta (UI-111)', () => {
    it('ELENCO-TESTA-01 le classi sono quelle delle Chat, pezzo per pezzo, e gli slot stanno al loro posto', () => {
        const w = monta({}, {
            strumenti: () => h('button', { 'data-testid': 'strumento' }, 'Lista'),
            'conteggio-fine': () => h('button', { 'data-testid': 'fine' }, 'Seleziona'),
        })
        // L'istantanea delle classi: ogni stringa c'è anche, uguale, in `ChatsScreen.vue`.
        const piu = 'talos-pressable talos-wave-host size-12 shrink-0 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] p-0 text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]'
        const cerca = 'min-h-touch w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]'
        const opzioni = 'relative min-h-touch min-w-touch shrink-0 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)]'
        const numero = 'absolute -right-1.5 -top-1.5 grid min-h-[var(--talos-space-section)] min-w-[var(--talos-space-section)] place-items-center rounded-full bg-[var(--talos-accent)] px-[calc(var(--talos-space-inline)/2)] text-3xs font-semibold tabular-nums text-[var(--talos-accent-contrast)]'
        const riga = 'flex items-stretch gap-[var(--talos-space-inline)]'
        const rigaFuori = 'mt-[var(--talos-space-section)] px-[var(--talos-space-page)]'
        const schede = 'mt-[var(--talos-space-card)] flex min-h-touch items-center gap-[var(--talos-space-inline)] overflow-x-auto border-b border-[var(--talos-border)] [scrollbar-width:none]'
        const scheda = 'talos-pressable talos-wave-host relative inline-flex min-h-touch shrink-0 items-center gap-[var(--talos-space-inline)] whitespace-nowrap rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-xs'
        const filo = 'talos-calm-indicator absolute bottom-0 left-[var(--talos-space-control)] right-[var(--talos-space-control)] h-[2px] rounded-full bg-[var(--talos-accent)]'
        const conto = 'flex min-h-touch items-center text-xs text-[var(--talos-muted)]'
        for (const pezzo of [piu, cerca, opzioni, numero, riga, rigaFuori, schede, scheda, filo, conto, 'mx-[var(--talos-space-page)]', 'px-[var(--talos-space-page)] pt-[var(--talos-space-section)]']) {
            expect(CHATS, pezzo).toContain(pezzo)
        }

        const testata = w.get('header')
        classiUguali(testata.classes(), 'px-[var(--talos-space-page)] pt-[var(--talos-space-section)]')
        expect(w.get('h1').text()).toBe('Codice')
        expect(w.get(`[data-testid="${P}-subtitle"]`).text()).toBe('Le tue sessioni di codice, qui e sui tuoi computer.')
        // `Button` aggiunge le classi della sua variante: quelle delle Chat devono esserci tutte.
        expect(w.get(`[data-testid="${P}-new"]`).classes()).toEqual(expect.arrayContaining(parole(piu)))

        const input = w.get(`[data-testid="${P}-search"]`)
        classiUguali(input.classes(), cerca)
        expect(input.attributes('type')).toBe('search')
        const strumenti = input.element.parentElement!.parentElement!
        classiUguali([...strumenti.classList], `${riga} ${rigaFuori}`)
        // Lo slot `strumenti` sta fra la ricerca e «Opzioni», come Lista/Schede nella Libreria.
        const figli = [...strumenti.children].map((el) => el.getAttribute('data-testid') ?? el.tagName.toLowerCase())
        expect(figli).toEqual(['div', 'strumento', `${P}-options`])

        expect(w.get(`[data-testid="${P}-options"]`).classes()).toEqual(expect.arrayContaining(parole(opzioni)))

        const gruppo = w.get(`[data-testid="${P}-filters"]`)
        classiUguali(gruppo.classes(), `mx-[var(--talos-space-page)] ${schede}`)
        classiUguali(w.get(`[data-testid="${P}-filter-tutte"]`).classes(), `${scheda} text-[var(--talos-text)]`)
        classiUguali(w.get(`[data-testid="${P}-filter-concluse"]`).classes(), `${scheda} text-[var(--talos-muted)]`)
        expect(w.get(`[data-testid="${P}-filter-in-corso"]`).text()).toBe('In corso2')
        classiUguali(w.get(`[data-testid="${P}-filter-in-corso"] small`).classes(), 'text-2xs tabular-nums')
        classiUguali(w.get('[data-talos-indicator]').classes(), filo)

        const conteggio = w.get(`[data-testid="${P}-count"]`)
        expect(conteggio.text()).toBe('5 sessioni')
        expect(conteggio.attributes()).toMatchObject({ role: 'status', 'aria-live': 'polite' })
        classiUguali([...conteggio.element.parentElement!.classList], `${conto} px-[var(--talos-space-page)]`)
        expect(conteggio.element.parentElement!.querySelector('[data-testid="fine"]')).not.toBeNull()
    })

    it('ELENCO-TESTA-02 le schede sono un radiogroup: una sola nel giro del Tab, le frecce scelgono la vicina e le portano il fuoco', async () => {
        const w = monta({ scheda: 'in-corso' })
        const gruppo = w.get(`[data-testid="${P}-filters"]`)
        expect(gruppo.attributes()).toMatchObject({ role: 'radiogroup', 'aria-label': 'Filtra per stato' })
        const stato = () => SCHEDE.map((s) => {
            const el = w.get(`[data-testid="${P}-filter-${s.id}"]`)
            return `${s.id}:${el.attributes('aria-checked')}:${el.attributes('tabindex')}`
        })
        expect(stato()).toEqual(['tutte:false:-1', 'in-corso:true:0', 'concluse:false:-1'])
        expect(w.findAll('[data-talos-indicator]')).toHaveLength(1)

        await gruppo.trigger('keydown', { key: 'ArrowRight' })
        await nextTick()
        expect(w.emitted('update:scheda')?.at(-1)).toEqual(['concluse'])
        expect(stato()).toEqual(['tutte:false:-1', 'in-corso:false:-1', 'concluse:true:0'])
        expect(document.activeElement?.getAttribute('data-testid')).toBe(`${P}-filter-concluse`)

        // Dall'ultima, avanti torna alla prima; dalla prima, indietro va all'ultima.
        await gruppo.trigger('keydown', { key: 'ArrowDown' })
        await nextTick()
        expect(document.activeElement?.getAttribute('data-testid')).toBe(`${P}-filter-tutte`)
        await gruppo.trigger('keydown', { key: 'ArrowLeft' })
        await nextTick()
        expect(document.activeElement?.getAttribute('data-testid')).toBe(`${P}-filter-concluse`)
        await gruppo.trigger('keydown', { key: 'ArrowUp' })
        await nextTick()
        expect(w.emitted('update:scheda')?.at(-1)).toEqual(['in-corso'])

        // Un altro tasto non sceglie niente.
        const prima = w.emitted('update:scheda')?.length
        await gruppo.trigger('keydown', { key: 'Enter' })
        expect(w.emitted('update:scheda')?.length).toBe(prima)

        // Il tocco sceglie la scheda; la ricerca scrive nel suo modello.
        await w.get(`[data-testid="${P}-filter-tutte"]`).trigger('click')
        expect(w.emitted('update:scheda')?.at(-1)).toEqual(['tutte'])
        await w.get(`[data-testid="${P}-search"]`).setValue('login')
        expect(w.emitted('update:testo')?.at(-1)).toEqual(['login'])
    })

    it('ELENCO-TESTA-03 il «+» quadrato solo sul telefono, accanto al titolo; «+ Nuova X» con l\'etichetta solo sul tablet', async () => {
        const telefono = monta({ tablet: false })
        const piu = telefono.findAll(`[data-testid="${P}-new"]`)
        expect(piu).toHaveLength(1)
        expect(piu[0]!.element.closest('header')).not.toBeNull()
        expect(piu[0]!.attributes('aria-label')).toBe('Nuova sessione Codice')
        expect(piu[0]!.text()).toBe('')
        await piu[0]!.trigger('click')
        expect(telefono.emitted('nuova')).toHaveLength(1)
        telefono.unmount()

        const tablet = monta({ tablet: true })
        const nuova = tablet.findAll(`[data-testid="${P}-new"]`)
        expect(nuova).toHaveLength(1)
        expect(nuova[0]!.element.closest('header')).toBeNull()
        expect(nuova[0]!.element.previousElementSibling?.getAttribute('data-testid')).toBe(`${P}-options`)
        expect(nuova[0]!.text()).toBe('Nuova sessione')
        expect(nuova[0]!.attributes('aria-label')).toBe('Nuova sessione Codice')
        expect(nuova[0]!.classes()).toEqual(expect.arrayContaining(parole('talos-pressable talos-wave-host min-h-touch shrink-0 gap-2 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-5 text-sm font-medium text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]')))
        await nuova[0]!.trigger('click')
        expect(tablet.emitted('nuova')).toHaveLength(1)
        tablet.unmount()

        // Senza `nuovaBreve` il tablet scrive l'etichetta intera; senza azione, nessun pulsante né sul telefono né sul tablet.
        expect(monta({ tablet: true, nuovaBreve: '' }).get(`[data-testid="${P}-new"]`).text()).toBe('Nuova sessione Codice')
        wrapper!.unmount()
        expect(monta({ tablet: false, nuovaEtichetta: '' }).find(`[data-testid="${P}-new"]`).exists()).toBe(false)
        wrapper!.unmount()
        expect(monta({ tablet: true, nuovaEtichetta: '' }).find(`[data-testid="${P}-new"]`).exists()).toBe(false)
    })

    /*
     * E4 (owner 29/10 notte, «Col nome, come sul tablet»): quando l'azione porta un nome che conta (il PC su cui nasce la sessione),
     * anche il telefono usa il pulsante col testo del tablet, che va al più su due righe (D-MOCK-9). Di serie resta il «+» quadrato.
     */
    it('ELENCO-TESTA-05 `nuovaConNome` sul telefono: il pulsante col testo del tablet, al più due righe; di serie il «+» quadrato', async () => {
        const conNome = monta({ tablet: false, nuovaConNome: true, nuovaBreve: 'Nuova sessione su UFFICIO · 27ba' })
        const nuova = conNome.findAll(`[data-testid="${P}-new"]`)
        expect(nuova).toHaveLength(1)
        expect(nuova[0]!.element.closest('header')).toBeNull()
        expect(nuova[0]!.element.previousElementSibling?.getAttribute('data-testid')).toBe(`${P}-options`)
        expect(nuova[0]!.text()).toBe('Nuova sessione su UFFICIO · 27ba')
        expect(nuova[0]!.classes()).toContain('max-w-[45%]')
        expect(conNome.get(`[data-testid="${P}-new-label"]`).classes()).toEqual(expect.arrayContaining(['line-clamp-2', 'min-w-0', 'whitespace-normal', 'text-left']))
        await nuova[0]!.trigger('click')
        expect(conNome.emitted('nuova')).toHaveLength(1)
        conNome.unmount()

        // di serie (senza nome) il telefono resta col «+» quadrato e il tablet col suo pulsante di sempre, senza il tetto
        const quadrato = monta({ tablet: false })
        expect(quadrato.get(`[data-testid="${P}-new"]`).classes()).toContain('size-12')
        quadrato.unmount()
        const tablet = monta({ tablet: true })
        expect(tablet.get(`[data-testid="${P}-new"]`).classes()).not.toContain('max-w-[45%]')
        expect(tablet.get(`[data-testid="${P}-new-label"]`).classes()).not.toContain('line-clamp-2')
    })

    it('ELENCO-TESTA-04 il pulsante «Opzioni» porta il numero dei filtri accesi, apre il foglio e dice se è aperto', async () => {
        const spento = monta({ opzioniAccese: 0 })
        const opzioni = spento.get(`[data-testid="${P}-options"]`)
        expect(opzioni.attributes()).toMatchObject({ 'aria-label': 'Opzioni', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' })
        expect(spento.find(`[data-testid="${P}-options-active"]`).exists()).toBe(false)
        await opzioni.trigger('click')
        expect(spento.emitted('opzioni')).toHaveLength(1)
        spento.unmount()

        const acceso = monta({ opzioniAccese: 2, opzioniAperte: true, opzioniEtichetta: 'Opzioni, 2 filtri attivi' })
        const numero = acceso.get(`[data-testid="${P}-options-active"]`)
        expect(numero.text()).toBe('2')
        expect(numero.attributes('aria-hidden')).toBe('true')
        expect(acceso.get(`[data-testid="${P}-options"]`).attributes()).toMatchObject({ 'aria-label': 'Opzioni, 2 filtri attivi', 'aria-expanded': 'true' })
        await acceso.setProps({ opzioniAccese: 0 })
        expect(acceso.find(`[data-testid="${P}-options-active"]`).exists()).toBe(false)
    })
})
