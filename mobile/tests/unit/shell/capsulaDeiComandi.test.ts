// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/*
 * Owner 19/11 09:10, variante A del bozzetto della barra: campanella, freccia, download e opzioni stanno in UNA capsula
 * coi colori della pillola, così la riga «modello · ora» che scorre sotto non si legge più fra icone senza fondo.
 * I figli si sostituiscono alla radice come in `veloSopraIComandi.test.ts` (import dinamici: lo stub per nome non basta).
 */
const finto = (name: string) => ({ __esModule: true, default: { name, render: () => null } })
vi.mock('@/components/shell/TalosMobileNotificationBell.vue', () => finto('TalosMobileNotificationBell'))
vi.mock('@/components/updates/TalosMobileUpdateSignal.vue', () => finto('TalosMobileUpdateSignal'))
vi.mock('@/components/shell/TalosMobileDownloadCenterTrigger.vue', () => finto('TalosMobileDownloadCenterTrigger'))
vi.mock('@/components/shell/TalosMobileChatOptionsMenu.vue', () => finto('TalosMobileChatOptionsMenu'))
vi.mock('@/screens/ChatsScreen.vue', () => finto('ChatsScreen'))
vi.mock('@/screens/HarnessScreen.vue', () => finto('HarnessScreen'))

import TalosMobileImmersiveChrome from '@/components/shell/TalosMobileImmersiveChrome.vue'
import TalosTabletSidebar from '@/components/shell/TalosTabletSidebar.vue'

// Giudice v2245: il filo della capsula è un anello DENTRO (`ring-inset`), non un bordo che aggiunge 2 px: alta 48 come la pillola.
const CAPSULA = ['rounded-full', 'ring-1', 'ring-inset', 'ring-[var(--talos-border)]/60', 'bg-[var(--talos-card)]/85', 'backdrop-blur']

describe('giro piccolo (giudice v2245): altezza e stato premuto', () => {
    it('la capsula non ha un bordo che la alza oltre i 48 px della pillola', async () => {
        const w = mount(TalosMobileImmersiveChrome, { props: { activeTitle: 'Chat', busy: false, canGoIncognito: false } })
        await flushPromises()
        expect(w.get('[data-testid="talos-immersive-actions"]').classes()).not.toContain('border')
    })
    it('dentro la capsula lo stato premuto delle opzioni è tondo come la capsula (l\'intestazione classica resta com\'è)', async () => {
        const w = mount(TalosMobileImmersiveChrome, { props: { activeTitle: 'Chat', busy: false, canGoIncognito: false } })
        await flushPromises()
        expect(w.get('[data-testid="talos-immersive-actions"]').classes()).toContain('[&_[aria-haspopup=menu]]:rounded-full')
    })
})

describe('barra del telefono, variante A: una capsula sola per i comandi a destra', () => {
    it('sul telefono campanella, download e opzioni stanno dentro la capsula, e le opzioni non hanno più la loro pillola', async () => {
        const w = mount(TalosMobileImmersiveChrome, { props: { activeTitle: 'Chat', busy: false, canGoIncognito: false } })
        await flushPromises()
        const gruppo = w.get('[data-testid="talos-immersive-actions"]')
        for (const c of CAPSULA) expect(gruppo.classes()).toContain(c)
        expect(gruppo.findComponent({ name: 'TalosMobileNotificationBell' }).exists()).toBe(true)
        expect(gruppo.findComponent({ name: 'TalosMobileDownloadCenterTrigger' }).exists()).toBe(true)
        const opzioni = gruppo.findComponent({ name: 'TalosMobileChatOptionsMenu' })
        expect(opzioni.exists()).toBe(true)
        expect(opzioni.attributes('pill')).toBeUndefined()
    })
    it('sul tablet (comandi dell\'app nel pannello) la capsula tiene solo le opzioni', async () => {
        const w = mount(TalosMobileImmersiveChrome, { props: { activeTitle: 'Chat', busy: false, canGoIncognito: false, hideMenu: true, hideAppActions: true, showBack: true } })
        await flushPromises()
        const gruppo = w.get('[data-testid="talos-immersive-actions"]')
        for (const c of CAPSULA) expect(gruppo.classes()).toContain(c)
        expect(gruppo.findComponent({ name: 'TalosMobileNotificationBell' }).exists()).toBe(false)
        expect(gruppo.findComponent({ name: 'TalosMobileChatOptionsMenu' }).exists()).toBe(true)
    })
    it('senza nessun comando a destra non resta una capsula vuota', async () => {
        const w = mount(TalosMobileImmersiveChrome, { props: { activeTitle: 'Chat', busy: false, canGoIncognito: false, hideAppActions: true, hideChatOptions: true } })
        await flushPromises()
        expect(w.get('[data-testid="talos-immersive-actions"]').classes()).not.toContain('rounded-full')
    })
    it('nel pannello del tablet il gruppo campanella-freccia-download è flessibile e non va a capo', async () => {
        const w = mount(TalosTabletSidebar, { props: { width: 320 } })
        await flushPromises()
        const gruppo = w.get('[data-testid="talos-tablet-app-actions"]')
        expect(gruppo.classes()).toEqual(expect.arrayContaining(['ml-auto', 'flex', 'items-center']))
    })
})
