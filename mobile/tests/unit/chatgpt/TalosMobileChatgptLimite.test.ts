// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/services/inAppBrowserService', () => ({ openTalosLinkOnce: vi.fn(async () => true) }))

import TalosMobileChatgptLimite from '@/components/chat/TalosMobileChatgptLimite.vue'

/**
 * N15 fetta 9 (mobile, 13/10/2026) — la carta del limite d'uso, come nel mockup approvato (scena `limite`): parole
 * ufficiali, l'ora della ripresa e il tentativo, due azioni una sotto l'altra. Non offre mai un altro fornitore.
 */
describe('N15 — la carta del limite d uso del piano', () => {
    it('N15-LIM-UI-01: dice che il limite è raggiunto, QUANDO riprende e a che tentativo; «Manage usage» apre ChatGPT, «Stop waiting» ferma', async () => {
        const apri = vi.fn(async () => true)
        const riprendeAlle = new Date(2026, 9, 13, 18, 30).getTime()
        const w = mount(TalosMobileChatgptLimite, { props: { attesa: { riprendeAlle, tentativo: 2, totale: 9 }, apri } })
        const carta = w.get('[data-testid="talos-chatgpt-limit"]')
        expect(carta.attributes('role')).toBe('status')
        expect(carta.classes()).toContain('flex-col')
        expect(carta.text()).toContain('Usage limit reached')
        expect(carta.text()).toContain('Review your plan or this app’s limit in ChatGPT settings.')
        expect(w.get('[data-testid="talos-chatgpt-limit-when"]').text()).toMatch(/^Continues on its own at 0?6:30\sPM \(attempt 2 of 9\)\.$/)
        await w.get('[data-testid="talos-chatgpt-limit-manage"]').trigger('click')
        expect(apri).toHaveBeenCalledWith('https://chatgpt.com/settings/usage')
        expect(w.emitted('ferma')).toBeUndefined()
        await w.get('[data-testid="talos-chatgpt-limit-stop"]').trigger('click')
        expect(w.emitted('ferma')).toHaveLength(1)
        // ⛔ mai un invito a cambiare fornitore
        expect(carta.text()).not.toMatch(/another (provider|model)|switch/i)
    })
})
