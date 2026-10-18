// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@/services/chatgptAccesso', () => ({ talosChatgpt: () => { throw new Error('le prove passano il servizio come proprietà') } }))
vi.mock('@/services/inAppBrowserService', () => ({ openTalosLinkOnce: vi.fn(async () => true) }))

import TalosMobileChatgptPastiglia from '@/components/chat/TalosMobileChatgptPastiglia.vue'

/**
 * N15 fetta 8 (mobile, 13/10/2026) — la pastiglia «ChatGPT plan» nel compositore e il suo pannello, come nel mockup approvato
 * (`mobile/mockup/n15`, scene `compositore` e `pannello`; pastiglia bassa, owner 12/10). I numeri sono quelli contati da
 * TALOS su questo telefono, e il pannello lo dice.
 */
const CONSUMI = 'https://chatgpt.com/settings/usage'
const servizio = () => ({ stato: vi.fn(async () => ({ collegato: true, email: 'x@y.z', pianoAbilitato: true, scadeAlle: null, accessoInCorso: false, consumi: CONSUMI })) })
const conto = (ore5 = { richieste: 2, token: 26_400 }, giorni7 = { richieste: 1, token: 900 }) => ({ riassunto: vi.fn(() => ({ ore5, giorni7 })) })
const t = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)

describe('N15 — la pastiglia del piano nel compositore', () => {
    it('N15-PAST-01: la pastiglia è un pulsante da 44 px con un disegno basso; toccata apre il pannello con account, due finestre e la nota onesta', async () => {
        const apri = vi.fn(async () => true)
        const w = mount(TalosMobileChatgptPastiglia, { props: { servizio: servizio(), consumi: conto(), apri }, attachTo: document.body })
        const pulsante = w.get('[data-testid="talos-chatgpt-pill"]')
        expect(pulsante.attributes('aria-label')).toBe('ChatGPT plan')
        expect(pulsante.attributes('aria-haspopup')).toBe('dialog')
        expect(pulsante.attributes('aria-expanded')).toBe('false')
        expect(pulsante.classes()).toEqual(expect.arrayContaining(['min-h-touch', 'min-w-touch']))
        // il disegno basso del mockup (28 px) dal tablet in su; sul telefono ancora più basso (N15-PAST-05, owner 18/10)
        expect(w.get('[data-testid="talos-chatgpt-pill-badge"]').classes()).toContain('sm:h-7')
        expect(t('talos-chatgpt-usage-panel')).toBeNull()

        await pulsante.trigger('click')
        await flushPromises()
        expect(pulsante.attributes('aria-expanded')).toBe('true')
        const pannello = t('talos-chatgpt-usage-panel')!
        expect(pannello.getAttribute('role')).toBe('dialog')
        expect(pannello.textContent).toContain('You’re using your ChatGPT plan')
        expect(pannello.textContent).toContain('x@y.z')
        expect(t('talos-chatgpt-usage-5h')!.textContent).toBe('2 requests · 26.4K tokens')
        // una sola richiesta si dice al singolare
        expect(t('talos-chatgpt-usage-7d')!.textContent).toBe('1 request · 900 tokens')
        expect(t('talos-chatgpt-usage-note')!.textContent).toContain('Counted by TALOS on this device')
        t('talos-chatgpt-usage-manage')!.click()
        expect(apri).toHaveBeenCalledWith(CONSUMI)
        w.unmount()
    })

    /**
     * ⛔ N15-PAST-05 — owner 18/10/2026 notte, foto dal telefono: «ridurre pill piano chatgpt da telefonino». Accanto al modello
     * (che ha già il logo ChatGPT) la scritta intera «Piano ChatGPT» allargava la riga degli attrezzi e mandava a capo la freccia
     * di espansione. Sotto i 640 px il distintivo dice solo «Piano», più piccolo; dal tablet in su resta quello del mockup.
     * Il nome intero resta per chi usa un lettore di schermo (`aria-label`).
     */
    it('N15-PAST-05: sul telefono il distintivo è corto e piccolo, dal tablet in su resta intero; il nome per il lettore non cambia', async () => {
        const w = mount(TalosMobileChatgptPastiglia, { props: { servizio: servizio(), consumi: conto() }, attachTo: document.body })
        const distintivo = w.get('[data-testid="talos-chatgpt-pill-badge"]')
        const corto = w.get('[data-testid="talos-chatgpt-pill-short"]')
        const intero = w.get('[data-testid="talos-chatgpt-pill-full"]')
        expect(corto.text()).toBe('Plan')
        expect(corto.classes()).toContain('sm:hidden')
        expect(intero.text()).toBe('ChatGPT plan')
        expect(intero.classes()).toEqual(expect.arrayContaining(['hidden', 'sm:inline']))
        expect(distintivo.classes()).toEqual(expect.arrayContaining(['h-6', 'sm:h-7', 'text-2xs', 'sm:text-xs']))
        expect(w.get('[data-testid="talos-chatgpt-pill"]').attributes('aria-label')).toBe('ChatGPT plan')
        w.unmount()
    })

    /**
     * ⛔ N15-PAST-04 — MISURATO sul Pad il 13/10/2026: il pannello si apriva e spariva in 60 ms. Aprendolo gli si dava il
     * fuoco; il campo di scrittura lo perdeva, il compositore tornava compatto e smontava la riga degli attrezzi con dentro
     * la pastiglia, pannello compreso. Il pannello NON prende il fuoco, e toccarlo non lo toglie al campo.
     */
    it('N15-PAST-04: aprire il pannello e toccarlo non tolgono il fuoco al campo di scrittura', async () => {
        const campo = document.createElement('textarea')
        document.body.appendChild(campo)
        campo.focus()
        const w = mount(TalosMobileChatgptPastiglia, { props: { servizio: servizio(), consumi: conto() }, attachTo: document.body })
        await w.get('[data-testid="talos-chatgpt-pill"]').trigger('click')
        await flushPromises()
        expect(t('talos-chatgpt-usage-panel')).not.toBeNull()
        expect(document.activeElement).toBe(campo)
        const tocco = new Event('pointerdown', { bubbles: true, cancelable: true })
        t('talos-chatgpt-usage-note')!.dispatchEvent(tocco)
        expect(tocco.defaultPrevented).toBe(true)
        w.unmount()
        campo.remove()
    })

    it('N15-PAST-02: il pannello si chiude con Esc, toccando fuori e ritoccando la pastiglia; riaperto rilegge il conto', async () => {
        const c = conto()
        const w = mount(TalosMobileChatgptPastiglia, { props: { servizio: servizio(), consumi: c }, attachTo: document.body })
        const pulsante = w.get('[data-testid="talos-chatgpt-pill"]')
        await pulsante.trigger('click')
        await flushPromises()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await flushPromises()
        expect(t('talos-chatgpt-usage-panel')).toBeNull()

        await pulsante.trigger('click')
        await flushPromises()
        expect(c.riassunto).toHaveBeenCalledTimes(2)
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        await flushPromises()
        expect(t('talos-chatgpt-usage-panel')).toBeNull()

        await pulsante.trigger('click')
        await flushPromises()
        // toccare DENTRO il pannello non lo chiude
        t('talos-chatgpt-usage-note')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        await flushPromises()
        expect(t('talos-chatgpt-usage-panel')).not.toBeNull()
        await pulsante.trigger('click')
        await flushPromises()
        expect(t('talos-chatgpt-usage-panel')).toBeNull()
        w.unmount()
    })
})
