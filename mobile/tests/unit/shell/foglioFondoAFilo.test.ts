// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * ⛔ K3-B2 (Pad, 15/10/2026, foto in tre viste): il compositore del Codice su r4 stava 16 px più su di quello della chat, perché
 * il foglio della stazione riserva un margine in basso (`pb-[max(0.75rem, area sicura)]`) mentre la chat va a filo del fondo.
 * Owner 15/10: la fascia dietro il compositore è trasparente con una sfumatura leggera, uguale in chat e Codice.
 *
 * `fondoAFilo`: il foglio non riserva il margine in basso; la cima resta quella di sempre (owner 15/10: la barra in alto si
 * decide con l'header del Codice, K3-C — annullato il velo in alto e il cerchietto). Senza la proprietà, niente cambia.
 */
const finto = (name: string) => ({ __esModule: true, default: { name, render: () => null } })
vi.mock('@/components/shell/TalosMobileNotificationBell.vue', () => finto('TalosMobileNotificationBell'))
vi.mock('@/components/shell/TalosMobileDownloadCenterTrigger.vue', () => finto('TalosMobileDownloadCenterTrigger'))

import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'

const foglio = (props: Record<string, unknown>) => mount(TalosMobileToolSheet, {
    props: { title: 'Codice', parentBack: () => undefined, ...props },
    slots: { default: '<p>conversazione</p>' },
})

describe('il foglio col fondo a filo (K3-B2)', () => {
    it('FIL-01 con fondoAFilo: niente margine in basso, la pagina scorre da sé; la cima resta quella di sempre', () => {
        const w = foglio({ fondoAFilo: true })
        const corpo = w.get('[data-testid="talos-mobile-sheet-body"]')
        expect(corpo.attributes('data-fondo-a-filo')).toBe('true')
        expect(corpo.classes().some((c) => c.startsWith('pb-'))).toBe(false)
        expect(corpo.classes()).toContain('overflow-hidden')
        expect(corpo.attributes('data-under-controls')).toBe('true')
        expect(w.find('[data-testid="talos-sheet-bar"]').exists()).toBe(true)
        expect(w.get('[data-testid="talos-sheet-back"]').html()).toMatch(/arrow-left/u)
    })

    it('FIL-02 senza fondoAFilo tutto come prima', () => {
        const corpo = foglio({}).get('[data-testid="talos-mobile-sheet-body"]')
        expect(corpo.attributes('data-fondo-a-filo')).toBe('false')
        expect(corpo.classes()).toEqual(expect.arrayContaining(['overflow-y-auto', 'pb-[max(0.75rem,env(safe-area-inset-bottom))]']))
    })

    it('FIL-04 il Codice su r4 lo chiede, e nient\'altro del foglio cambia per lui', () => {
        const radice = resolve(__dirname, '..', '..', '..', 'src')
        const app = readFileSync(resolve(radice, 'App.vue'), 'utf8')
        expect(app).toMatch(/:fondo-a-filo="activeRoute === 'codice-r4'"/u)
        const codice = readFileSync(resolve(radice, 'screens', 'CodiceR4Screen.vue'), 'utf8')
        expect(codice).not.toContain('pt-[calc(3.5rem+env(safe-area-inset-top))]')
    })
})
