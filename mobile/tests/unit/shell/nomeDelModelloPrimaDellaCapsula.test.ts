// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/*
 * Giudice v2245 (19/11), giro piccolo della barra del telefono. Sotto la barra scorre la testa di ogni risposta: a sinistra
 * l'orb e «Talos», a destra «modello · ora». Prima finivano SOTTO la pillola del menu e la capsula, e accanto restava un pezzo
 * di nome tagliato a metà lettera («ge»). Ora la barra dice quanto spazio occupa (due variabili sulla radice) e la testa se lo
 * toglie dai lati: il nome si tronca coi puntini prima della capsula, e sparisce se ne restano meno di 6 caratteri.
 * jsdom non impagina: qui si provano la misura, la struttura e le regole; la resa vera si guarda sul Pad.
 */
const finto = (name: string) => ({ __esModule: true, default: { name, render: () => null } })
vi.mock('@/components/shell/TalosMobileNotificationBell.vue', () => finto('TalosMobileNotificationBell'))
vi.mock('@/components/updates/TalosMobileUpdateSignal.vue', () => finto('TalosMobileUpdateSignal'))
vi.mock('@/components/shell/TalosMobileDownloadCenterTrigger.vue', () => finto('TalosMobileDownloadCenterTrigger'))
vi.mock('@/components/shell/TalosMobileChatOptionsMenu.vue', () => finto('TalosMobileChatOptionsMenu'))

import TalosMobileImmersiveChrome from '@/components/shell/TalosMobileImmersiveChrome.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'

const radice = () => document.documentElement.style
const css = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'components', 'chat', 'talosCalmMessages.css'), 'utf8')
// tutte le regole con quel selettore esatto, una dopo l'altra
const regola = (selettore: string) => css.split('\n').filter((r) => r.startsWith(`${selettore} {`)).join('\n')

/**
 * `riquadro` = dove sta la barra: sul telefono tutto lo schermo, sul tablet il riquadro della chat a destra del pannello.
 * `tastoDestra` = bordo destro del tasto di sinistra (pillola del menu sul telefono, «indietro» sul tablet).
 */
function geometria(tastoDestra: number, capsulaSinistra: number, larghezza: number, riquadroSinistra = 0) {
    Object.defineProperty(window, 'innerWidth', { value: larghezza, configurable: true })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const id = this.getAttribute('data-testid')
        const x = id === 'talos-shell-menu' || id === 'talos-chat-back' ? { left: riquadroSinistra + 12, right: tastoDestra }
            : id === 'talos-immersive-actions' ? { left: capsulaSinistra, right: larghezza - 12 }
                : id === 'talos-mobile-immersive-chrome' ? { left: riquadroSinistra, right: larghezza } : { left: 0, right: 0 }
        return { ...x, top: 40, bottom: 88, width: x.right - x.left, height: 48, x: x.left, y: 40, toJSON: () => x } as DOMRect
    })
}

const VARIABILI = ['--talos-barra-sinistra', '--talos-barra-destra', '--talos-barra-larghezza']
const pubblicate = () => VARIABILI.map((v) => radice().getPropertyValue(v))

afterEach(() => {
    vi.restoreAllMocks()
    for (const v of VARIABILI) radice().removeProperty(v)
})

describe('la barra del telefono dice quanto spazio prende', () => {
    it('sul telefono pubblica il bordo destro della pillola del menu e quanto occupa la capsula, con un margine', async () => {
        geometria(60, 254, 411)
        const w = mount(TalosMobileImmersiveChrome, { props: { activeTitle: 'Chat', busy: false, canGoIncognito: false } })
        await flushPromises()
        // telefono: gli stessi numeri del giro piccolo 1 (la barra copre tutto lo schermo, il riquadro parte da 0)
        expect(pubblicate()).toEqual(['68px', '161px', '411px'])
        w.unmount()
        expect(pubblicate()).toEqual(['', '', ''])
    })
    it('giudice v2261: sul tablet misura il tasto «indietro» e la pillola ⋯ dal bordo del riquadro della chat, non dello schermo', async () => {
        // pannello largo 400 a sinistra: «indietro» finisce a 452, la pillola ⋯ comincia a 1136, schermo 1200
        geometria(452, 1136, 1200, 400)
        const w = mount(TalosMobileImmersiveChrome, { props: { activeTitle: 'Chat', busy: false, canGoIncognito: false, hideMenu: true, hideAppActions: true, showBack: true } })
        await flushPromises()
        expect(pubblicate()).toEqual(['60px', '68px', '800px'])
        w.unmount()
        expect(pubblicate()).toEqual(['', '', ''])
    })
    it('al contrario: sul tablet senza chat aperta (niente «indietro») a sinistra non si toglie niente', async () => {
        geometria(452, 1136, 1200, 400)
        const w = mount(TalosMobileImmersiveChrome, { props: { activeTitle: 'Chat', busy: false, canGoIncognito: false, hideMenu: true, hideAppActions: true, showBack: false } })
        await flushPromises()
        expect(pubblicate()).toEqual(['0px', '68px', '800px'])
        w.unmount()
    })
})

describe('la testa della risposta si toglie lo spazio della barra', () => {
    it('«Talos» e il nome stanno fra la pillola e la capsula: i due lati della testa usano le variabili della barra', () => {
        const testa = regola('.assistant-header')
        expect(testa).toMatch(/padding-inline:[^;]*var\(--talos-barra-sinistra, 0px\)[^;]*var\(--talos-barra-destra, 0px\)/u)
        // senza barra le variabili mancano e il margine è zero: niente cambia
        expect(testa).toContain('max(0px,')
        // giudice v2261: la colonna si centra nel riquadro della barra (sul tablet non è lo schermo: c'è il pannello)
        expect(testa).toMatch(/--talos-bordo-colonna: calc\(max\(0px, \(var\(--talos-barra-larghezza, 100vw\) - 820px\) \/ 2\) \+ \.75rem\)/u)
    })
    it('il nome si tronca coi puntini, mai a metà lettera, e sotto i 6 caratteri va a capo su una riga nascosta', () => {
        expect(regola('.talos-meta-riga')).toMatch(/flex-flow: row-reverse wrap;.*max-height: 1\.5em;.*overflow: hidden;/u)
        // giudice v2261: la soglia dei 6 caratteri sta nella BASE (che max-content limita), non in un min-width che allargava
        // il pezzo di un nome corto e lasciava un buco prima dell'ora; la misura vera è in tests/e2e/mobile-barra-capsula
        const pezzo = regola('.talos-meta-riga > .talos-meta-modello')
        expect(pezzo).toMatch(/flex: 1 1 7\.5ch;.*min-width: 0;.*max-width: max-content;/u)
        expect(pezzo).not.toMatch(/min-width: 7\.5ch/u)
        expect(regola('.talos-meta-nome')).toMatch(/min-width: 0;.*overflow: hidden;.*text-overflow: ellipsis;/u)
    })
    it('il nome sta da solo nel suo pezzo, l\'ora fuori: si tronca il nome, non l\'ora', async () => {
        const w = mount(TalosMobileMessageList, {
            props: {
                messages: [{ id: 'a1', role: 'assistant', content: 'OK', state: 'persisted', created_at: new Date().toISOString(), model_profile_id: 'locale:gemma', run_id: null, metadata: {} }],
                sending: false,
                modelLabels: { 'locale:gemma': 'gemma-4-E2B-it-Q5_K_M' },
            },
        })
        await vi.dynamicImportSettled()
        await flushPromises()
        const riga = w.get('[data-testid="talos-message-meta"] .talos-meta-riga')
        expect(riga.get('.talos-meta-modello .talos-meta-nome').text()).toBe('gemma-4-E2B-it-Q5_K_M')
        expect(riga.get('.talos-meta-modello').text()).not.toMatch(/ago|now/u)
        expect(riga.text().replace(/\s+/gu, ' ')).toMatch(/^gemma-4-E2B-it-Q5_K_M · (just now|\d+[mhd] ago)/u)
        w.unmount()
    })
    it('al contrario: un nome corto resta intero e senza modello non c\'è il pezzo del nome', async () => {
        const messaggio = (id: string, model: string | null) => ({ id, role: 'assistant' as const, content: 'OK', state: 'persisted' as const, created_at: new Date().toISOString(), model_profile_id: model, run_id: null, metadata: {} })
        const w = mount(TalosMobileMessageList, {
            props: { messages: [messaggio('a1', 'x:gpt'), messaggio('a2', null)], sending: false, modelLabels: { 'x:gpt': 'GPT' } },
        })
        await vi.dynamicImportSettled()
        await flushPromises()
        const meta = w.findAll('[data-testid="talos-message-meta"]')
        expect(meta[0].get('.talos-meta-nome').text()).toBe('GPT')
        expect(meta[1].find('.talos-meta-modello').exists()).toBe(false)
        w.unmount()
    })
})
